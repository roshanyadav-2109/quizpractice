-- ---------------------------------------------------------------------------
-- Defence against bulk copying of the question bank, switchable and revertable.
--
-- Every rule is a row in risk_rules with a mode: 'off', 'watch' (it is evaluated
-- and logged as "would have ..." but changes nothing) or 'enforce'. The admin
-- dashboard flips them; nothing here is hard-wired.
--
--   caps            new papers an account may open: 100 a day, 30 an hour
--   pace            how long an account waits between new papers; none for the first 10
--                   of a day, then 8 s, 20 s, 45 s as the day goes on
--   search_limit    searches count too: 60 an hour, 300 a day
--   machine_pace    signal: the last 15 new papers opened a few seconds apart
--   no_use          signal: 15+ papers and next to no attempts
--   bot_agent       signal: a browser that is not a browser (node, curl, ...)
--   subject_spread  signal: 15+ subjects in a day
--   no_receipts     signal: papers opened, never read (the page leaves a receipt)
--   auto_ban        ban on a combination of signals
--   linked          ban an account that shares a device and an address with a banned one
--   device_block    block the browser of a banned account for good
--   ip_block        block the addresses of a banned account for 24 hours, restarting if hit
--   lockdown        manual: lowers the caps for everyone
--
-- A real student opens a few papers slowly (typical gap between papers 41 s or
-- more, never more than 7 subjects a day). The five accounts that copied 11,547
-- questions averaged 3 to 4 seconds a paper and 11 to 47 subjects.
--
-- Everything is revertable: risk_revert_ban, risk_revert_rule, risk_release_ip,
-- risk_release_device. Every decision is a row in risk_events.
-- ---------------------------------------------------------------------------

-- Rules ------------------------------------------------------------------------
create table if not exists public.risk_rules (
  key         text primary key,
  label       text not null,
  description text not null,
  mode        text not null default 'watch' check (mode in ('off', 'watch', 'enforce')),
  params      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

insert into public.risk_rules (key, label, description, mode, params) values
  ('caps', 'Paper limits', 'New papers one account may open.', 'enforce', '{"daily":100,"hourly":30}'),
  ('lockdown', 'Lockdown', 'Manual. While on, the caps below apply to everyone.', 'off', '{"daily":10,"hourly":5}'),
  ('pace', 'Pace between papers', 'Seconds to wait before opening a new paper, by how many were opened today.', 'watch',
     '{"free_first":10,"tier_1_until":30,"tier_2_until":60,"gap_1":8,"gap_2":20,"gap_3":45}'),
  ('search_limit', 'Search limit', 'Searches per account.', 'enforce', '{"hourly":60,"daily":300}'),
  ('machine_pace', 'Signal: machine pace', 'Typical gap over the last papers is a few seconds.', 'enforce', '{"window":15,"median_seconds":10}'),
  ('no_use', 'Signal: no use', 'Many papers opened and next to no real attempts.', 'enforce', '{"min_opens":15,"max_attempts":1}'),
  ('bot_agent', 'Signal: bot browser', 'A sign-in that is not a browser.', 'enforce', '{}'),
  ('subject_spread', 'Signal: subject spread', 'Subjects touched in 24 hours.', 'enforce', '{"limit":15}'),
  ('no_receipts', 'Signal: no reading receipts', 'Papers opened with no sign they were read.', 'watch', '{"min_opens":10,"max_ratio":0.2}'),
  ('auto_ban', 'Automatic ban', 'Ban on a strong combination of the signals above.', 'enforce', '{}'),
  ('linked', 'Linked accounts', 'Ban an account on the same browser and address as a banned one.', 'watch', '{}'),
  ('device_block', 'Block the browser', 'The browser of a banned account is blocked for good.', 'enforce', '{}'),
  ('ip_block', 'Block the address', 'The addresses of a banned account are blocked for a while.', 'enforce', '{"hours":24}')
on conflict (key) do nothing;

create or replace function public.risk_mode(p_key text)
returns text language sql stable set search_path = public as $$
  select coalesce((select mode from public.risk_rules where key = p_key), 'off');
$$;

create or replace function public.risk_param(p_key text, p_name text, p_default numeric)
returns numeric language sql stable set search_path = public as $$
  select coalesce((select (params ->> p_name)::numeric from public.risk_rules where key = p_key), p_default);
$$;

-- Events: every decision, with the detail ---------------------------------------------
create table if not exists public.risk_events (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  user_id     uuid,
  ip          text,
  fingerprint text,
  rule        text not null,
  mode        text not null,
  action      text not null,
  detail      jsonb not null default '{}'::jsonb,
  reviewed_at timestamptz
);
create index if not exists risk_events_at_idx on public.risk_events (at desc);
create index if not exists risk_events_user_idx on public.risk_events (user_id, at desc);
create index if not exists risk_events_rule_idx on public.risk_events (rule, at desc);

create table if not exists public.risk_bans (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid not null,
  rule        text not null,
  reason      text not null,
  detail      jsonb not null default '{}'::jsonb,
  case_id     bigint references public.abuse_cases(id) on delete set null,
  reverted_at timestamptz,
  reverted_by uuid
);
create index if not exists risk_bans_user_idx on public.risk_bans (user_id);

-- What is blocked ------------------------------------------------------------------------
create table if not exists public.blocked_ips (
  ip          text primary key,
  reason      text not null,
  ban_id      bigint references public.risk_bans(id) on delete set null,
  case_id     bigint references public.abuse_cases(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,
  last_hit    timestamptz,
  released_at timestamptz
);

create table if not exists public.blocked_devices (
  fingerprint text primary key,
  reason      text not null,
  ban_id      bigint references public.risk_bans(id) on delete set null,
  case_id     bigint references public.abuse_cases(id) on delete set null,
  created_at  timestamptz not null default now(),
  released_at timestamptz
);

create table if not exists public.device_sightings (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  fingerprint text not null,
  ip          text,
  seen_at     timestamptz not null default now(),
  unique (user_id, fingerprint, ip)
);
create index if not exists device_sightings_fp_idx on public.device_sightings (fingerprint);
create index if not exists device_sightings_ip_idx on public.device_sightings (ip);

create table if not exists public.paper_receipts (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  set_id   uuid not null references public.question_sets(id) on delete cascade,
  events   int  not null default 0,
  first_at timestamptz not null default now(),
  last_at  timestamptz not null default now(),
  primary key (user_id, set_id)
);

create table if not exists public.search_hits (
  user_id uuid not null references public.profiles(id) on delete cascade,
  at      timestamptz not null default now()
);
create index if not exists search_hits_idx on public.search_hits (user_id, at desc);

do $$
declare t text;
begin
  foreach t in array array['risk_rules','risk_events','risk_bans','blocked_ips','blocked_devices','device_sightings','paper_receipts','search_hits']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff', t);
    execute format('create policy %I on public.%I for select using ((select public.is_staff()))', t || '_staff', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- Logging one decision ------------------------------------------------------------------
create or replace function public.risk_log(p_user uuid, p_rule text, p_action text, p_detail jsonb default '{}'::jsonb, p_ip text default null, p_fp text default null)
returns void language sql volatile security definer set search_path = public as $$
  insert into public.risk_events (user_id, ip, fingerprint, rule, mode, action, detail)
  values (p_user, p_ip, p_fp, p_rule, public.risk_mode(p_rule), p_action, p_detail);
$$;
revoke all on function public.risk_log(uuid, text, text, jsonb, text, text) from public, anon, authenticated;

-- The per-account limit and pace ---------------------------------------------------------
drop function if exists public.open_set(uuid);
create function public.open_set(p_set uuid)
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
begin
  if uid is null then
    return query select false, 0, 0, 0, 'signin'::text;
    return;
  end if;

  if public.is_staff() or public.is_teacher() then
    return query select true, 0, 0, 0, null::text;
    return;
  end if;

  -- One request at a time per account, so a burst cannot slip past the checks.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));

  select count(distinct a.set_id) filter (where a.opened_at > now() - interval '1 hour')::int,
         count(distinct a.set_id)::int
    into last_hour, today
    from public.content_access a
   where a.user_id = uid and a.opened_at > now() - interval '1 day';

  -- Back to a paper opened today: no new count and no wait.
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
        jsonb_build_object('opened_last_hour', last_hour, 'opened_today', today, 'set', p_set));
    end if;
    if cap_mode = 'enforce' then
      return query select false, last_hour, today, case when last_hour >= hourly_cap then 3600 else 86400 end, 'cap'::text;
      return;
    end if;
  end if;

  -- The pace: none for the first papers of the day, then longer waits as it goes on.
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
            jsonb_build_object('opened_today', today, 'waited_s', round(waited), 'needed_s', need));
        end if;
        if pace_mode = 'enforce' then
          return query select false, last_hour, today, ceil(need - waited)::int, 'pace'::text;
          return;
        end if;
      end if;
    end if;
  end if;

  insert into public.content_access (user_id, set_id) values (uid, p_set);
  return query select true, last_hour + 1, today + 1, 0, null::text;
end;
$$;
revoke all on function public.open_set(uuid) from public, anon;
grant execute on function public.open_set(uuid) to authenticated;

-- Searching counts too ----------------------------------------------------------------------
create or replace function public.note_search()
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
  insert into public.search_hits (user_id) values (uid);
  return true;
end;
$$;
revoke all on function public.note_search() from public, anon;
grant execute on function public.note_search() to authenticated;

-- Reading receipts ---------------------------------------------------------------------------
create or replace function public.note_receipt(p_set uuid, p_events int)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  insert into public.paper_receipts (user_id, set_id, events)
  select auth.uid(), p_set, least(greatest(p_events, 1), 500)
   where auth.uid() is not null
  on conflict (user_id, set_id)
  do update set events = least(public.paper_receipts.events + excluded.events, 5000), last_at = now();
$$;
revoke all on function public.note_receipt(uuid, int) from public, anon;
grant execute on function public.note_receipt(uuid, int) to authenticated;

-- Blocked addresses: 24 hours, restarting whenever the address is seen again -----------------------
create or replace function public.ip_is_blocked(p_ip text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  mode text := public.risk_mode('ip_block');
  hours numeric := public.risk_param('ip_block', 'hours', 24);
  hit   boolean;
begin
  if p_ip is null or p_ip = '' or mode = 'off' then return false; end if;
  update public.blocked_ips
     set last_hit = now(),
         expires_at = case when mode = 'enforce' and expires_at is not null then now() + make_interval(hours => hours::int) else expires_at end
   where ip = p_ip and released_at is null and (expires_at is null or expires_at > now());
  hit := found;
  if hit and not exists (select 1 from public.risk_events where ip = p_ip and rule = 'ip_block' and at > now() - interval '1 minute') then
    perform public.risk_log(null, 'ip_block', case when mode = 'enforce' then 'blocked' else 'would_block' end, '{}'::jsonb, p_ip);
  end if;
  return hit and mode = 'enforce';
end;
$$;
revoke all on function public.ip_is_blocked(text) from public, anon, authenticated;
grant execute on function public.ip_is_blocked(text) to service_role;

-- Ban an account and keep the evidence ----------------------------------------------------------
create or replace function public.ban_account(p_user uuid, p_rule text, p_reason text, p_detail jsonb default '{}'::jsonb)
returns bigint
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  c    bigint;
  s    bigint;
  b    bigint;
  em   text;
  addr text;
  fp   text;
begin
  select email into em from auth.users where id = p_user;
  if em is null then return null; end if;
  if exists (select 1 from auth.users where id = p_user and banned_until > now()) then return null; end if;

  select id into c from public.abuse_cases where title = 'Automatic detections' limit 1;
  if c is null then
    insert into public.abuse_cases (title, summary, status)
    values ('Automatic detections', 'Accounts banned by the scraper defence (public.risk_rules).', 'open')
    returning id into c;
  end if;

  insert into public.risk_bans (user_id, rule, reason, detail, case_id) values (p_user, p_rule, p_reason, p_detail, c) returning id into b;

  update auth.users set banned_until = '2099-01-01' where id = p_user;
  delete from auth.sessions where user_id = p_user;

  insert into public.abuse_subjects (case_id, kind, value, user_id, note, blocked_at)
  values (c, 'email', em, p_user, p_reason, now())
  on conflict (case_id, kind, value) do update set blocked_at = now(), note = excluded.note
  returning id into s;

  insert into public.abuse_evidence (case_id, subject_id, kind, summary, detail)
  values (c, s, 'auto_ban', p_reason, p_detail);

  perform public.risk_log(p_user, p_rule, 'banned', p_detail || jsonb_build_object('ban_id', b, 'reason', p_reason));

  -- The browser: blocked for good.
  for fp in select distinct fingerprint from public.device_sightings where user_id = p_user loop
    if public.risk_mode('device_block') = 'enforce' then
      insert into public.blocked_devices (fingerprint, reason, ban_id, case_id) values (fp, p_reason, b, c)
      on conflict (fingerprint) do update set released_at = null, ban_id = b;
      perform public.risk_log(p_user, 'device_block', 'device_blocked', jsonb_build_object('ban_id', b), null, fp);
    elsif public.risk_mode('device_block') = 'watch' then
      perform public.risk_log(p_user, 'device_block', 'would_block', jsonb_build_object('ban_id', b), null, fp);
    end if;
  end loop;

  -- The addresses it was seen on: blocked for a while, restarting if they come back.
  for addr in
    select distinct ip from public.device_sightings where user_id = p_user and ip is not null
    union
    select distinct host(ip) from auth.sessions where user_id = p_user and ip is not null
  loop
    if public.risk_mode('ip_block') = 'enforce' then
      insert into public.blocked_ips (ip, reason, ban_id, case_id, expires_at)
      values (addr, p_reason, b, c, now() + make_interval(hours => public.risk_param('ip_block', 'hours', 24)::int))
      on conflict (ip) do update set released_at = null, ban_id = b,
        expires_at = now() + make_interval(hours => public.risk_param('ip_block', 'hours', 24)::int);
      perform public.risk_log(p_user, 'ip_block', 'ip_blocked', jsonb_build_object('ban_id', b), addr);
    elsif public.risk_mode('ip_block') = 'watch' then
      perform public.risk_log(p_user, 'ip_block', 'would_block', jsonb_build_object('ban_id', b), addr);
    end if;
  end loop;

  return b;
end;
$$;
revoke all on function public.ban_account(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.ban_account(uuid, text, text, jsonb) to service_role;

-- Reverting ------------------------------------------------------------------------------------
create or replace function public.risk_revert_ban(p_ban bigint, p_by uuid default null)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare r public.risk_bans%rowtype;
begin
  select * into r from public.risk_bans where id = p_ban and reverted_at is null;
  if not found then return; end if;
  update auth.users set banned_until = null where id = r.user_id;
  update public.abuse_subjects set blocked_at = null, note = coalesce(note, '') || ' [reverted]'
   where user_id = r.user_id and kind = 'email';
  update public.blocked_devices set released_at = now() where ban_id = p_ban and released_at is null;
  update public.blocked_ips set released_at = now() where ban_id = p_ban and released_at is null;
  update public.risk_bans set reverted_at = now(), reverted_by = p_by where id = p_ban;
  perform public.risk_log(r.user_id, r.rule, 'unblocked', jsonb_build_object('ban_id', p_ban, 'by', p_by));
end;
$$;
revoke all on function public.risk_revert_ban(bigint, uuid) from public, anon, authenticated;
grant execute on function public.risk_revert_ban(bigint, uuid) to service_role;

create or replace function public.risk_revert_rule(p_rule text, p_by uuid default null)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare b bigint; n int := 0;
begin
  for b in select id from public.risk_bans where rule = p_rule and reverted_at is null loop
    perform public.risk_revert_ban(b, p_by);
    n := n + 1;
  end loop;
  update public.risk_rules set mode = 'watch', updated_at = now(), updated_by = p_by where key = p_rule and mode = 'enforce';
  return n;
end;
$$;
revoke all on function public.risk_revert_rule(text, uuid) from public, anon, authenticated;
grant execute on function public.risk_revert_rule(text, uuid) to service_role;

create or replace function public.risk_release_ip(p_ip text, p_by uuid default null)
returns void language sql volatile security definer set search_path = public as $$
  update public.blocked_ips set released_at = now() where ip = p_ip and released_at is null;
  select public.risk_log(null, 'ip_block', 'unblocked', jsonb_build_object('by', p_by), p_ip);
$$;
revoke all on function public.risk_release_ip(text, uuid) from public, anon, authenticated;
grant execute on function public.risk_release_ip(text, uuid) to service_role;

create or replace function public.risk_release_device(p_fp text, p_by uuid default null)
returns void language sql volatile security definer set search_path = public as $$
  update public.blocked_devices set released_at = now() where fingerprint = p_fp and released_at is null;
  select public.risk_log(null, 'device_block', 'unblocked', jsonb_build_object('by', p_by), null, p_fp);
$$;
revoke all on function public.risk_release_device(text, uuid) from public, anon, authenticated;
grant execute on function public.risk_release_device(text, uuid) to service_role;

-- A browser seen on an account: a blocked one bans the account on arrival ---------------------------
create or replace function public.register_device(p_user uuid, p_fingerprint text, p_ip text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if p_user is null or p_fingerprint is null or length(p_fingerprint) < 8 then return 'ignored'; end if;
  insert into public.device_sightings (user_id, fingerprint, ip) values (p_user, p_fingerprint, p_ip)
  on conflict (user_id, fingerprint, ip) do update set seen_at = now();
  if exists (select 1 from public.blocked_devices where fingerprint = p_fingerprint and released_at is null) then
    if public.risk_mode('device_block') = 'enforce' then
      perform public.ban_account(p_user, 'device_block', 'Signed in on a blocked browser', jsonb_build_object('ip', p_ip));
      return 'banned';
    end if;
    perform public.risk_log(p_user, 'device_block', 'would_ban', '{}'::jsonb, p_ip, p_fingerprint);
  end if;
  return 'ok';
end;
$$;
revoke all on function public.register_device(uuid, text, text) from public, anon, authenticated;
grant execute on function public.register_device(uuid, text, text) to service_role;

-- The scan: one account (right after it opens a paper) or all of them ----------------------------------
create or replace function public.run_risk_scan(p_user uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  u        record;
  linked   record;
  win      int     := public.risk_param('machine_pace', 'window', 15)::int;
  pace_med numeric := public.risk_param('machine_pace', 'median_seconds', 10);
  spread   int     := public.risk_param('subject_spread', 'limit', 15)::int;
  nu_opens int     := public.risk_param('no_use', 'min_opens', 15)::int;
  nu_att   int     := public.risk_param('no_use', 'max_attempts', 1)::int;
  nr_opens int     := public.risk_param('no_receipts', 'min_opens', 10)::int;
  nr_ratio numeric := public.risk_param('no_receipts', 'max_ratio', 0.2);
  med numeric; subj int; real_att int; recpt int; bot boolean;
  a boolean; b boolean; c boolean; s boolean; n boolean;
  a_e boolean; b_e boolean; c_e boolean; s_e boolean; n_e boolean;
  would boolean; does boolean;
  detail jsonb; why text;
  banned_n int := 0; flagged_n int := 0; ban_id bigint;
begin
  if public.risk_mode('auto_ban') = 'off' and public.risk_mode('linked') = 'off' then
    return jsonb_build_object('banned', 0, 'flagged', 0, 'skipped', true);
  end if;

  for u in
    select x.user_id, count(distinct x.set_id) opens
      from public.content_access x
      join auth.users au on au.id = x.user_id and (au.banned_until is null or au.banned_until < now())
     where x.opened_at > now() - interval '1 day'
       and (p_user is null or x.user_id = p_user)
     group by x.user_id
    having count(distinct x.set_id) >= 10
  loop
    if exists (select 1 from public.profiles p where p.id = u.user_id and p.role in ('admin', 'contributor', 'teacher')) then
      continue;
    end if;

    select percentile_cont(0.5) within group (order by extract(epoch from gap)) into med
      from (select opened_at - lag(opened_at) over (order by opened_at) gap
              from (select opened_at from public.content_access where user_id = u.user_id order by opened_at desc limit win + 1) l) g
     where gap is not null;

    select count(distinct qp.subject_id) into subj
      from public.content_access x
      join public.question_sets st on st.id = x.set_id
      join public.question_papers qp on qp.id = st.paper_id
     where x.user_id = u.user_id and x.opened_at > now() - interval '1 day';

    select count(*) into real_att from public.attempts
     where user_id = u.user_id and started_at > now() - interval '1 day' and coalesce(duration_seconds, 0) >= 120;

    select exists (select 1 from auth.sessions where user_id = u.user_id and user_agent is not null and user_agent not ilike '%mozilla%') into bot;

    select count(*) into recpt from public.paper_receipts r
      join public.content_access x on x.user_id = r.user_id and x.set_id = r.set_id and x.opened_at > now() - interval '1 day'
     where r.user_id = u.user_id;

    a := public.risk_mode('machine_pace') <> 'off' and u.opens >= win and coalesce(med, 999) < pace_med;
    b := public.risk_mode('no_use') <> 'off' and u.opens >= nu_opens and real_att <= nu_att;
    c := public.risk_mode('bot_agent') <> 'off' and bot;
    s := public.risk_mode('subject_spread') <> 'off' and subj >= spread;
    -- Receipts only mean something once pages send them: until one has arrived, nobody is "unread".
    n := public.risk_mode('no_receipts') <> 'off' and u.opens >= nr_opens and recpt < u.opens * nr_ratio
         and exists (select 1 from public.paper_receipts where last_at > now() - interval '1 day');

    a_e := a and public.risk_mode('machine_pace') = 'enforce';
    b_e := b and public.risk_mode('no_use') = 'enforce';
    c_e := c and public.risk_mode('bot_agent') = 'enforce';
    s_e := s and public.risk_mode('subject_spread') = 'enforce';
    n_e := n and public.risk_mode('no_receipts') = 'enforce';

    would := (a and (b or c or s)) or (s and b) or (n and (a or s)) or (c and b and u.opens >= 20);
    does  := (a_e and (b_e or c_e or s_e)) or (s_e and b_e) or (n_e and (a_e or s_e)) or (c_e and b_e and u.opens >= 20);

    why := concat_ws(', ', case when a then 'machine pace' end, case when b then 'no use' end, case when c then 'bot browser' end,
                     case when s then 'subject spread' end, case when n then 'no reading receipts' end);
    detail := jsonb_build_object('opens_24h', u.opens, 'median_gap_s', round(coalesce(med, 0)), 'subjects_24h', subj,
                                 'real_attempts_24h', real_att, 'bot_user_agent', bot, 'receipts', recpt,
                                 'signals', jsonb_build_object('machine_pace', a, 'no_use', b, 'bot_agent', c, 'subject_spread', s, 'no_receipts', n));

    if does and public.risk_mode('auto_ban') = 'enforce' then
      ban_id := public.ban_account(u.user_id, 'auto_ban', 'Automatic: ' || why, detail);
      if ban_id is not null then banned_n := banned_n + 1; end if;
    elsif would and public.risk_mode('auto_ban') <> 'off' then
      if not exists (select 1 from public.risk_events where user_id = u.user_id and action = 'would_ban' and at > now() - interval '1 hour') then
        perform public.risk_log(u.user_id, 'auto_ban', 'would_ban', detail || jsonb_build_object('reason', why));
      end if;
    elsif a or s or n then
      if not exists (select 1 from public.risk_events where user_id = u.user_id and action = 'flagged' and at > now() - interval '1 day') then
        perform public.risk_log(u.user_id, case when a then 'machine_pace' when s then 'subject_spread' else 'no_receipts' end, 'flagged', detail || jsonb_build_object('reason', why));
        flagged_n := flagged_n + 1;
      end if;
    end if;
  end loop;

  -- Linked accounts: a banned account's browser, seen with the same address or on the same session
  -- address, on an account not yet banned.
  if public.risk_mode('linked') <> 'off' then
    for linked in
      select distinct d2.user_id, d1.user_id as banned_user, d1.fingerprint
        from public.device_sightings d1
        join public.risk_bans rb on rb.user_id = d1.user_id and rb.reverted_at is null
        join public.device_sightings d2 on d2.fingerprint = d1.fingerprint and d2.user_id <> d1.user_id
        join auth.users au on au.id = d2.user_id and (au.banned_until is null or au.banned_until < now())
       where (p_user is null or d2.user_id = p_user)
         and (d2.ip is not distinct from d1.ip
              or exists (select 1 from auth.sessions s2 where s2.user_id = d2.user_id and host(s2.ip) = d1.ip))
    loop
      detail := jsonb_build_object('rule', 'linked', 'banned_user', linked.banned_user, 'fingerprint', linked.fingerprint);
      if public.risk_mode('linked') = 'enforce' then
        ban_id := public.ban_account(linked.user_id, 'linked', 'Automatic: same browser and address as a banned account', detail);
        if ban_id is not null then banned_n := banned_n + 1; end if;
      elsif not exists (select 1 from public.risk_events where user_id = linked.user_id and action = 'would_ban' and rule = 'linked' and at > now() - interval '1 hour') then
        perform public.risk_log(linked.user_id, 'linked', 'would_ban', detail);
      end if;
    end loop;
  end if;

  return jsonb_build_object('banned', banned_n, 'flagged', flagged_n);
end;
$$;
revoke all on function public.run_risk_scan(uuid) from public, anon, authenticated;
grant execute on function public.run_risk_scan(uuid) to service_role;

-- The dashboard's reads -------------------------------------------------------------------------------
create or replace function public.risk_overview()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'now', now(),
    'opens_1h', (select count(*) from public.content_access where opened_at > now() - interval '1 hour'),
    'opens_24h', (select count(*) from public.content_access where opened_at > now() - interval '1 day'),
    'accounts_active_24h', (select count(distinct user_id) from public.content_access where opened_at > now() - interval '1 day'),
    'accounts_total', (select count(*) from public.profiles),
    'refused_24h', (select count(*) from public.risk_events where at > now() - interval '1 day' and action in ('refused', 'slowed')),
    'would_24h', (select count(*) from public.risk_events where at > now() - interval '1 day' and action like 'would_%'),
    'flagged_24h', (select count(*) from public.risk_events where at > now() - interval '1 day' and action = 'flagged'),
    'banned_24h', (select count(*) from public.risk_bans where created_at > now() - interval '1 day' and reverted_at is null),
    'banned_total', (select count(*) from public.risk_bans where reverted_at is null),
    'reverted_total', (select count(*) from public.risk_bans where reverted_at is not null),
    'ips_blocked', (select count(*) from public.blocked_ips where released_at is null and (expires_at is null or expires_at > now())),
    'devices_blocked', (select count(*) from public.blocked_devices where released_at is null),
    'trap_hits_24h', (select count(*) from public.scrape_signals where at > now() - interval '1 day' and kind = 'trap'),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object('h', h, 'opens', o, 'refused', r, 'would', w, 'flagged', f, 'banned', b) order by h), '[]'::jsonb)
        from (
          select g.h,
                 (select count(*) from public.content_access x where x.opened_at >= g.h and x.opened_at < g.h + interval '1 hour') o,
                 (select count(*) from public.risk_events e where e.at >= g.h and e.at < g.h + interval '1 hour' and e.action in ('refused', 'slowed')) r,
                 (select count(*) from public.risk_events e where e.at >= g.h and e.at < g.h + interval '1 hour' and e.action like 'would_%') w,
                 (select count(*) from public.risk_events e where e.at >= g.h and e.at < g.h + interval '1 hour' and e.action = 'flagged') f,
                 (select count(*) from public.risk_bans k where k.created_at >= g.h and k.created_at < g.h + interval '1 hour') b
            from generate_series(date_trunc('hour', now()) - interval '23 hours', date_trunc('hour', now()), interval '1 hour') g(h)
        ) t
    )
  );
$$;
revoke all on function public.risk_overview() from public, anon, authenticated;
grant execute on function public.risk_overview() to service_role;

create or replace function public.risk_accounts(p_limit int default 40)
returns table (user_id uuid, email text, name text, opens_24h int, subjects_24h int, median_gap_s numeric, real_attempts_24h int,
               last_open timestamptz, banned boolean, ban_id bigint, events_24h int)
language sql
stable
security definer
set search_path = public
as $$
  with o as (
    select x.user_id, count(distinct x.set_id)::int opens, max(x.opened_at) last_open,
           count(distinct qp.subject_id)::int subj
      from public.content_access x
      join public.question_sets st on st.id = x.set_id
      join public.question_papers qp on qp.id = st.paper_id
     where x.opened_at > now() - interval '1 day'
     group by x.user_id
  )
  select o.user_id, p.email, p.display_name, o.opens, o.subj,
         (select round(percentile_cont(0.5) within group (order by extract(epoch from gap))::numeric)
            from (select opened_at - lag(opened_at) over (order by opened_at) gap
                    from (select opened_at from public.content_access c where c.user_id = o.user_id and c.opened_at > now() - interval '1 day' order by opened_at desc limit 16) l) g
           where gap is not null),
         (select count(*)::int from public.attempts a where a.user_id = o.user_id and a.started_at > now() - interval '1 day' and coalesce(a.duration_seconds, 0) >= 120),
         o.last_open,
         exists (select 1 from auth.users au where au.id = o.user_id and au.banned_until > now()),
         (select id from public.risk_bans rb where rb.user_id = o.user_id and rb.reverted_at is null order by id desc limit 1),
         (select count(*)::int from public.risk_events e where e.user_id = o.user_id and e.at > now() - interval '1 day')
    from o join public.profiles p on p.id = o.user_id
   where p.role = 'student'
   order by o.opens desc, o.last_open desc
   limit p_limit;
$$;
revoke all on function public.risk_accounts(int) from public, anon, authenticated;
grant execute on function public.risk_accounts(int) to service_role;

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
        select x.opened_at, st.set_code, qp.title, round(extract(epoch from x.opened_at - lag(x.opened_at) over (order by x.opened_at))) gap_s
          from public.content_access x join public.question_sets st on st.id = x.set_id join public.question_papers qp on qp.id = st.paper_id
         where x.user_id = p_user order by x.opened_at desc limit 120) t),
    'sessions', (select coalesce(jsonb_agg(jsonb_build_object('at', created_at, 'ip', host(ip), 'ua', left(user_agent, 120))), '[]'::jsonb) from auth.sessions where user_id = p_user),
    'devices', (select coalesce(jsonb_agg(jsonb_build_object('fingerprint', fingerprint, 'ip', ip, 'seen', seen_at)), '[]'::jsonb) from public.device_sightings where user_id = p_user),
    'events', (select coalesce(jsonb_agg(to_jsonb(t) order by t.at desc), '[]'::jsonb) from (select at, rule, mode, action, detail, ip from public.risk_events where user_id = p_user order by at desc limit 100) t),
    'bans', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb) from (select id, created_at, rule, reason, reverted_at from public.risk_bans where user_id = p_user) t),
    'attempts', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select started_at, duration_seconds, score, max_score from public.attempts where user_id = p_user order by started_at desc limit 30) t)
  );
$$;
revoke all on function public.risk_account(uuid) from public, anon, authenticated;
grant execute on function public.risk_account(uuid) to service_role;

-- Housekeeping and the schedule ---------------------------------------------------------------------------
create or replace function public.purge_risk_logs()
returns void language sql volatile security definer set search_path = public as $$
  delete from public.search_hits where at < now() - interval '2 days';
  delete from public.risk_events where at < now() - interval '180 days' and action in ('slowed', 'would_slow', 'would_refuse', 'refused');
$$;
revoke all on function public.purge_risk_logs() from public, anon, authenticated;

-- The app scores an account right after each paper it opens (src/lib/access.ts), so the scan does not
-- wait for a schedule; the schedule adds the linked-account sweep for every account.
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron not available: %', sqlerrm;
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('risk-scan', '* * * * *', 'select public.run_risk_scan(null)');
    perform cron.schedule('risk-purge', '17 3 * * *', 'select public.purge_risk_logs()');
  end if;
end $$;
