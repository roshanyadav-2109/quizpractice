-- ---------------------------------------------------------------------------
-- A record of where each paper was opened from, and a little of what the account did with it.
--
-- One row per paper opened, as before (content_access): it now also keeps the address, the browser
-- id and signature it was opened from, and the paper's version, so a copy can be traced to the
-- connection and to the exact text. A counter of explanations read per paper and the words searched
-- for are kept too. All of it rides on rows already written, so it adds no rows and no round trips;
-- the whole record is a few hundred bytes per paper opened.
--
-- Retention: full detail for 12 months, then the address, browser and signature are blanked
-- (purge_risk_logs) and the rest stays.
-- ---------------------------------------------------------------------------

alter table public.content_access
  add column if not exists ip text,
  add column if not exists device text,
  add column if not exists ua text,
  add column if not exists paper_version timestamptz,
  add column if not exists explanations_read int not null default 0;

alter table public.search_hits
  add column if not exists term text;

-- open_set now takes where the request came from ----------------------------------------------------
drop function if exists public.open_set(uuid);
create function public.open_set(p_set uuid, p_ip text default null, p_device text default null, p_ua text default null)
returns table (allowed boolean, opened_last_hour int, opened_today int, retry_after int, reason text)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  last_hour  int;
  today      int;
  last_open  timestamptz;
  cap_rule   text := case when public.risk_mode('lockdown') = 'enforce' then 'lockdown' else 'caps' end;
  cap_mode   text := case when public.risk_mode('lockdown') = 'enforce' then 'enforce' else public.risk_mode('caps') end;
  daily_cap  numeric := public.risk_param(case when public.risk_mode('lockdown') = 'enforce' then 'lockdown' else 'caps' end, 'daily', 100);
  hourly_cap numeric := public.risk_param(case when public.risk_mode('lockdown') = 'enforce' then 'lockdown' else 'caps' end, 'hourly', 30);
  pace_mode  text := public.risk_mode('pace');
  need       numeric;
  waited     numeric;
  version    timestamptz;
begin
  if uid is null then
    return query select false, 0, 0, 0, 'signin'::text;
    return;
  end if;

  if public.is_staff() or public.is_teacher() then
    return query select true, 0, 0, 0, null::text;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));

  select count(distinct a.set_id) filter (where a.opened_at > now() - interval '1 hour')::int,
         count(distinct a.set_id)::int
    into last_hour, today
    from public.content_access a
   where a.user_id = uid and a.opened_at > now() - interval '1 day';

  if exists (
    select 1 from public.content_access a
     where a.user_id = uid and a.set_id = p_set and a.opened_at > now() - interval '1 day'
  ) then
    return query select true, last_hour, today, 0, null::text;
    return;
  end if;

  if cap_mode <> 'off' and (last_hour >= hourly_cap or today >= daily_cap) then
    if not exists (select 1 from public.risk_events where user_id = uid and rule = cap_rule and at > now() - interval '30 seconds') then
      perform public.risk_log(uid, cap_rule, case when cap_mode = 'enforce' then 'refused' else 'would_refuse' end,
        jsonb_build_object('opened_last_hour', last_hour, 'opened_today', today, 'set', p_set), p_ip, p_device);
    end if;
    if cap_mode = 'enforce' then
      return query select false, last_hour, today, case when last_hour >= hourly_cap then 3600 else 86400 end, 'cap'::text;
      return;
    end if;
  end if;

  if pace_mode <> 'off' and today >= public.risk_param('pace', 'free_first', 10) then
    need := case
      when today < public.risk_param('pace', 'tier_1_until', 30) then public.risk_param('pace', 'gap_1', 8)
      when today < public.risk_param('pace', 'tier_2_until', 60) then public.risk_param('pace', 'gap_2', 20)
      else public.risk_param('pace', 'gap_3', 45)
    end;
    select max(a.opened_at) into last_open from public.content_access a where a.user_id = uid;
    if last_open is not null then
      waited := extract(epoch from (now() - last_open));
      if waited < need then
        if not exists (select 1 from public.risk_events where user_id = uid and rule = 'pace' and at > now() - interval '30 seconds') then
          perform public.risk_log(uid, 'pace', case when pace_mode = 'enforce' then 'slowed' else 'would_slow' end,
            jsonb_build_object('opened_today', today, 'waited_s', round(waited), 'needed_s', need), p_ip, p_device);
        end if;
        if pace_mode = 'enforce' then
          return query select false, last_hour, today, ceil(need - waited)::int, 'pace'::text;
          return;
        end if;
      end if;
    end if;
  end if;

  select qp.updated_at into version
    from public.question_sets st join public.question_papers qp on qp.id = st.paper_id
   where st.id = p_set;

  insert into public.content_access (user_id, set_id, ip, device, ua, paper_version)
  values (uid, p_set, left(p_ip, 45), left(p_device, 80), left(p_ua, 160), version);
  return query select true, last_hour + 1, today + 1, 0, null::text;
end;
$$;
revoke all on function public.open_set(uuid, text, text, text) from public, anon;
grant execute on function public.open_set(uuid, text, text, text) to authenticated;

-- Searches keep their words (the limit already bounds how many) ----------------------------------------
drop function if exists public.note_search();
create function public.note_search(p_term text default null)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  h    int;
  d    int;
  mode text := public.risk_mode('search_limit');
begin
  if uid is null then return false; end if;
  if mode = 'off' or public.is_staff() or public.is_teacher() then return true; end if;
  perform pg_advisory_xact_lock(hashtextextended('s' || uid::text, 0));
  select count(*) filter (where at > now() - interval '1 hour'), count(*)
    into h, d from public.search_hits where user_id = uid and at > now() - interval '1 day';
  if h >= public.risk_param('search_limit', 'hourly', 60) or d >= public.risk_param('search_limit', 'daily', 300) then
    perform public.risk_log(uid, 'search_limit', case when mode = 'enforce' then 'refused' else 'would_refuse' end, jsonb_build_object('hour', h, 'day', d));
    return mode <> 'enforce';
  end if;
  insert into public.search_hits (user_id, term) values (uid, left(p_term, 80));
  return true;
end;
$$;
revoke all on function public.note_search(text) from public, anon;
grant execute on function public.note_search(text) to authenticated;

-- An explanation was read: one counter on the paper's row ---------------------------------------------------
create or replace function public.note_explanation(p_question uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.content_access c
     set explanations_read = c.explanations_read + 1
   where c.id = (
     select a.id from public.content_access a
      where a.user_id = auth.uid()
        and a.set_id = (select q.set_id from public.questions q where q.id = p_question)
        and a.opened_at > now() - interval '7 days'
      order by a.opened_at desc limit 1);
$$;
revoke all on function public.note_explanation(uuid) from public, anon;
grant execute on function public.note_explanation(uuid) to authenticated;

-- The account page reads the richer record ---------------------------------------------------------------------
create or replace function public.risk_account(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(t) from (select p.id, p.email, p.display_name, p.role, p.created_at, au.last_sign_in_at, au.banned_until from public.profiles p join auth.users au on au.id = p.id where p.id = p_user) t),
    'opens', (select coalesce(jsonb_agg(to_jsonb(t) order by t.opened_at desc), '[]'::jsonb) from (
        select x.opened_at, st.set_code, qp.title, x.ip, x.device, left(x.ua, 70) ua, x.explanations_read, x.paper_version,
               round(extract(epoch from x.opened_at - lag(x.opened_at) over (order by x.opened_at))) gap_s
          from public.content_access x join public.question_sets st on st.id = x.set_id join public.question_papers qp on qp.id = st.paper_id
         where x.user_id = p_user order by x.opened_at desc limit 120) t),
    'searches', (select coalesce(jsonb_agg(jsonb_build_object('at', at, 'term', term) order by at desc), '[]'::jsonb) from (select at, term from public.search_hits where user_id = p_user order by at desc limit 50) s),
    'sessions', (select coalesce(jsonb_agg(jsonb_build_object('at', created_at, 'ip', host(ip), 'ua', left(user_agent, 120))), '[]'::jsonb) from auth.sessions where user_id = p_user),
    'devices', (select coalesce(jsonb_agg(jsonb_build_object('fingerprint', fingerprint, 'ip', ip, 'seen', seen_at)), '[]'::jsonb) from public.device_sightings where user_id = p_user),
    'events', (select coalesce(jsonb_agg(to_jsonb(t) order by t.at desc), '[]'::jsonb) from (select at, rule, mode, action, detail, ip from public.risk_events where user_id = p_user order by at desc limit 100) t),
    'bans', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb) from (select id, created_at, rule, reason, reverted_at from public.risk_bans where user_id = p_user) t),
    'attempts', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select started_at, duration_seconds, score, max_score from public.attempts where user_id = p_user order by started_at desc limit 30) t)
  );
$$;
revoke all on function public.risk_account(uuid) from public, anon, authenticated;
grant execute on function public.risk_account(uuid) to service_role;

-- Retention: after 12 months the address, browser and signature are blanked --------------------------------------
create or replace function public.purge_risk_logs()
returns void language sql volatile security definer set search_path = public as $$
  delete from public.search_hits where at < now() - interval '30 days';
  delete from public.risk_events where at < now() - interval '180 days' and action in ('slowed', 'would_slow', 'would_refuse', 'refused');
  update public.content_access set ip = null, device = null, ua = null
   where opened_at < now() - interval '12 months' and (ip is not null or device is not null or ua is not null);
$$;
revoke all on function public.purge_risk_logs() from public, anon, authenticated;
