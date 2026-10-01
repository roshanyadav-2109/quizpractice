-- ---------------------------------------------------------------------------
-- Accuracy fixes found in an audit, so that an honest student is never flagged or banned:
--
--  1. Gaps between papers are measured on each paper's FIRST opening. The old open function could record
--     one paper twice a few milliseconds apart (two requests at once), which dragged a student's typical
--     gap towards zero. (10 such cases among real students.)
--  2. "No use" no longer means "no attempts". Learning mode never creates an attempt (0 of 73 attempts),
--     so 125 of 157 students have none. Use is now an attempt, an explanation read, or a reading receipt,
--     and the signal waits until pages send receipts.
--  3. A ban needs at least auto_ban.min_opens (25) papers in 24 hours, where the busiest real student
--     opened 13, and an account with 3 or more real attempts this week is never auto-banned: it is flagged
--     for a person to look at.
--  4. A blocked browser no longer bans on arrival (a shared PC would ban the next student). It is a signal
--     that counts with another signal.
--  5. Blocked addresses come from the visitor's own requests only, never from sign-in sessions the site's
--     server completed.
--  6. risk_trusted: accounts an admin trusts are never auto-banned.
-- ---------------------------------------------------------------------------

create table if not exists public.risk_trusted (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  reason  text,
  by_user uuid,
  at      timestamptz not null default now()
);
alter table public.risk_trusted enable row level security;
revoke all on public.risk_trusted from anon, authenticated;
drop policy if exists risk_trusted_staff on public.risk_trusted;
create policy risk_trusted_staff on public.risk_trusted for select using ((select public.is_staff()));
grant select on public.risk_trusted to authenticated;

update public.risk_rules
   set params = '{"min_opens":25}'::jsonb, updated_at = now()
 where key = 'auto_ban' and params = '{}'::jsonb;

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
  ban_min  int     := public.risk_param('auto_ban', 'min_opens', 25)::int;
  receipts_live boolean := exists (select 1 from public.paper_receipts where last_at > now() - interval '1 day');
  med numeric; subj int; real_att int; real_att_7d int; recpt int; expl int; bot boolean; dev boolean;
  a boolean; b boolean; c boolean; s boolean; n boolean; d boolean;
  a_e boolean; b_e boolean; c_e boolean; s_e boolean; n_e boolean; d_e boolean;
  would boolean; does boolean; practising boolean;
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
    if exists (select 1 from public.profiles p where p.id = u.user_id and p.role in ('admin', 'contributor', 'teacher'))
       or exists (select 1 from public.risk_trusted t where t.user_id = u.user_id) then
      continue;
    end if;

    -- Typical gap over the last papers, each paper counted once at its first opening.
    select percentile_cont(0.5) within group (order by extract(epoch from gap)) into med
      from (select opened_at - lag(opened_at) over (order by opened_at) gap
              from (select first_open as opened_at
                      from (select set_id, min(opened_at) first_open from public.content_access
                             where user_id = u.user_id and opened_at > now() - interval '1 day' group by set_id) f
                     order by first_open desc limit win + 1) l) g
     where gap is not null;

    select count(distinct qp.subject_id) into subj
      from public.content_access x
      join public.question_sets st on st.id = x.set_id
      join public.question_papers qp on qp.id = st.paper_id
     where x.user_id = u.user_id and x.opened_at > now() - interval '1 day';

    select count(*) filter (where started_at > now() - interval '1 day'), count(*)
      into real_att, real_att_7d
      from public.attempts
     where user_id = u.user_id and started_at > now() - interval '7 days' and coalesce(duration_seconds, 0) >= 120;

    select coalesce(sum(explanations_read), 0) into expl from public.content_access
     where user_id = u.user_id and opened_at > now() - interval '1 day';

    select count(*) into recpt from public.paper_receipts r
      join public.content_access x on x.user_id = r.user_id and x.set_id = r.set_id and x.opened_at > now() - interval '1 day'
     where r.user_id = u.user_id;

    select exists (select 1 from public.content_access where user_id = u.user_id and opened_at > now() - interval '1 day' and ua is not null and ua not ilike '%mozilla%') into bot;

    select exists (select 1 from public.device_sightings ds join public.blocked_devices bd on bd.fingerprint = ds.fingerprint and bd.released_at is null
                    where ds.user_id = u.user_id) into dev;

    a := public.risk_mode('machine_pace') <> 'off' and u.opens >= win and coalesce(med, 999) < pace_med;
    -- No use: many papers, and no attempt, no explanation read and no reading receipt. Learning mode makes no attempts,
    -- so this waits until pages send receipts.
    b := public.risk_mode('no_use') <> 'off' and receipts_live and u.opens >= nu_opens and real_att <= nu_att and expl = 0 and recpt = 0;
    c := public.risk_mode('bot_agent') <> 'off' and bot;
    s := public.risk_mode('subject_spread') <> 'off' and subj >= spread;
    n := public.risk_mode('no_receipts') <> 'off' and receipts_live and u.opens >= nr_opens and recpt < u.opens * nr_ratio;
    d := public.risk_mode('device_block') <> 'off' and dev;

    a_e := a and public.risk_mode('machine_pace') = 'enforce';
    b_e := b and public.risk_mode('no_use') = 'enforce';
    c_e := c and public.risk_mode('bot_agent') = 'enforce';
    s_e := s and public.risk_mode('subject_spread') = 'enforce';
    n_e := n and public.risk_mode('no_receipts') = 'enforce';
    d_e := d and public.risk_mode('device_block') = 'enforce';

    would := (u.opens >= ban_min and ((a and (b or c or s)) or (s and b) or (n and (a or s)) or (c and b))) or (d and (a or b or s));
    does  := (u.opens >= ban_min and ((a_e and (b_e or c_e or s_e)) or (s_e and b_e) or (n_e and (a_e or s_e)) or (c_e and b_e))) or (d_e and (a_e or b_e or s_e));
    practising := real_att_7d >= 3;

    why := concat_ws(', ', case when a then 'machine pace' end, case when b then 'no use' end, case when c then 'bot browser' end,
                     case when s then 'subject spread' end, case when n then 'no reading receipts' end, case when d then 'blocked browser' end);
    detail := jsonb_build_object('opens_24h', u.opens, 'median_gap_s', round(coalesce(med, 0)), 'subjects_24h', subj,
                                 'real_attempts_24h', real_att, 'real_attempts_7d', real_att_7d, 'explanations_read_24h', expl,
                                 'receipts', recpt, 'bot_user_agent', bot, 'blocked_browser', dev,
                                 'signals', jsonb_build_object('machine_pace', a, 'no_use', b, 'bot_agent', c, 'subject_spread', s, 'no_receipts', n, 'blocked_browser', d));

    if does and public.risk_mode('auto_ban') = 'enforce' and not practising then
      ban_id := public.ban_account(u.user_id, 'auto_ban', 'Automatic: ' || why, detail);
      if ban_id is not null then banned_n := banned_n + 1; end if;
    elsif (does or would) and practising and public.risk_mode('auto_ban') <> 'off' then
      if not exists (select 1 from public.risk_events where user_id = u.user_id and action = 'flagged' and at > now() - interval '1 day') then
        perform public.risk_log(u.user_id, 'auto_ban', 'flagged', detail || jsonb_build_object('reason', why, 'protected', 'has 3 or more real attempts this week: not banned, please review'));
        flagged_n := flagged_n + 1;
      end if;
    elsif would and public.risk_mode('auto_ban') <> 'off' then
      if not exists (select 1 from public.risk_events where user_id = u.user_id and action = 'would_ban' and at > now() - interval '1 hour') then
        perform public.risk_log(u.user_id, 'auto_ban', 'would_ban', detail || jsonb_build_object('reason', why));
      end if;
    elsif a or s or d then
      -- Missing receipts alone never flag anyone: ad-blockers, slow phones and background tabs cause them.
      if not exists (select 1 from public.risk_events where user_id = u.user_id and action = 'flagged' and at > now() - interval '1 day') then
        perform public.risk_log(u.user_id, case when d then 'device_block' when a then 'machine_pace' else 'subject_spread' end, 'flagged', detail || jsonb_build_object('reason', why));
        flagged_n := flagged_n + 1;
      end if;
    end if;
  end loop;

  -- Linked accounts (Watch by default).
  if public.risk_mode('linked') <> 'off' then
    for linked in
      select distinct d2.user_id, d1.user_id as banned_user, d1.fingerprint
        from public.device_sightings d1
        join public.risk_bans rb on rb.user_id = d1.user_id and rb.reverted_at is null
        join public.device_sightings d2 on d2.fingerprint = d1.fingerprint and d2.user_id <> d1.user_id
        join auth.users au on au.id = d2.user_id and (au.banned_until is null or au.banned_until < now())
       where (p_user is null or d2.user_id = p_user)
         and not exists (select 1 from public.risk_trusted t where t.user_id = d2.user_id)
         and not exists (select 1 from public.profiles p where p.id = d2.user_id and p.role in ('admin', 'contributor', 'teacher'))
         and (select count(*) from public.attempts at2 where at2.user_id = d2.user_id and at2.started_at > now() - interval '7 days' and coalesce(at2.duration_seconds, 0) >= 120) < 3
         and (d2.ip is not distinct from d1.ip
              or exists (select 1 from auth.sessions s2 where s2.user_id = d2.user_id and host(s2.ip) = d1.ip and s2.user_agent ilike '%mozilla%'))
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

  -- The browser: blocked for good. Only its own random id (d:) is blocked; the hash of ordinary traits (f:)
  -- is shared by many students with the same phone, so it only links accounts and never blocks one.
  for fp in select distinct fingerprint from public.device_sightings where user_id = p_user and fingerprint like 'd:%' loop
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
    select distinct ip from public.content_access where user_id = p_user and ip is not null and opened_at > now() - interval '7 days'
    union
    -- Sign-ins the visitor's own browser made (a "node" session is the site's server finishing a Google sign-in,
    -- on an Amazon address that is not the visitor).
    select distinct host(ip) from auth.sessions where user_id = p_user and ip is not null and user_agent ilike '%mozilla%'
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
  -- A blocked browser is a signal, not a ban: a shared computer may have been used by the banned account.
  -- run_risk_scan bans only when another signal agrees.
  if exists (select 1 from public.blocked_devices where fingerprint = p_fingerprint and released_at is null)
     and public.risk_mode('device_block') <> 'off'
     and not exists (select 1 from public.risk_events where user_id = p_user and rule = 'device_block' and action = 'flagged' and at > now() - interval '1 day') then
    perform public.risk_log(p_user, 'device_block', 'flagged', jsonb_build_object('reason', 'signed in on a blocked browser (not banned: it needs another signal)'), p_ip, p_fingerprint);
    return 'flagged';
  end if;
  return 'ok';
end;
$$;
revoke all on function public.register_device(uuid, text, text) from public, anon, authenticated;
grant execute on function public.register_device(uuid, text, text) to service_role;

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
                    from (select first_open as opened_at from (select c.set_id, min(c.opened_at) first_open from public.content_access c
                                  where c.user_id = o.user_id and c.opened_at > now() - interval '1 day' group by c.set_id) f
                           order by first_open desc limit 16) l) g
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
        select x.opened_at, st.set_code, qp.title, x.ip, x.device, left(x.ua, 70) ua, x.explanations_read, x.paper_version,
               (case when extract(epoch from x.opened_at - lag(x.opened_at) over (order by x.opened_at)) < 1 then null else round(extract(epoch from x.opened_at - lag(x.opened_at) over (order by x.opened_at))) end) gap_s
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

create or replace function public.risk_preview(p_rule text, p_params jsonb default '{}'::jsonb, p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  prm       jsonb := coalesce((select params from public.risk_rules where key = p_rule), '{}'::jsonb) || coalesce(p_params, '{}'::jsonb);
  since     timestamptz := now() - make_interval(days => least(greatest(p_days, 1), 180));
  aff       jsonb := '[]'::jsonb;
  considered int;
  real_n    int;
  scr_n     int;
  ev        int;
  ex        jsonb;
  note      text := null;
  window_n  int  := coalesce((select (params ->> 'window')::int from public.risk_rules where key = 'machine_pace'), 15);
  med_s     numeric := coalesce((select (params ->> 'median_seconds')::numeric from public.risk_rules where key = 'machine_pace'), 10);
  nu_opens  int  := coalesce((select (params ->> 'min_opens')::int from public.risk_rules where key = 'no_use'), 15);
  nu_att    int  := coalesce((select (params ->> 'max_attempts')::int from public.risk_rules where key = 'no_use'), 1);
  spread    int  := coalesce((select (params ->> 'limit')::int from public.risk_rules where key = 'subject_spread'), 15);
begin
  -- Students who opened papers in the period.
  select count(distinct c.user_id) into considered
    from public.content_access c join public.profiles p on p.id = c.user_id
   where c.opened_at >= since and p.role = 'student';

  if p_rule in ('caps', 'lockdown') then
    select coalesce(jsonb_agg(jsonb_build_object('u', user_id, 'n', n)), '[]'::jsonb) into aff from (
      select user_id, count(*) n from (
        select c.user_id, (c.opened_at at time zone 'Asia/Kolkata')::date b, count(distinct c.set_id) k, 'd' kind
          from public.content_access c where c.opened_at >= since group by 1, 2
        union all
        select c.user_id, date_trunc('hour', c.opened_at)::date, count(distinct c.set_id), 'h'
          from public.content_access c where c.opened_at >= since group by c.user_id, date_trunc('hour', c.opened_at)
      ) x
      where (kind = 'd' and k >= (prm ->> 'daily')::numeric) or (kind = 'h' and k >= (prm ->> 'hourly')::numeric)
      group by user_id) t;
    note := 'Counted by calendar day and clock hour.';

  elsif p_rule = 'pace' then
    select coalesce(jsonb_agg(jsonb_build_object('u', user_id, 'n', n)), '[]'::jsonb) into aff from (
      select user_id, count(*) n from (
        select c.user_id,
               row_number() over (partition by c.user_id, (c.opened_at at time zone 'Asia/Kolkata')::date order by c.opened_at) - 1 prior,
               extract(epoch from c.opened_at - lag(c.opened_at) over (partition by c.user_id order by c.opened_at)) gap,
               c.opened_at
          from public.content_access c where c.opened_at >= since - interval '1 day'
      ) x
      where opened_at >= since and gap is not null and prior >= (prm ->> 'free_first')::numeric
        and gap < case when prior < (prm ->> 'tier_1_until')::numeric then (prm ->> 'gap_1')::numeric
                       when prior < (prm ->> 'tier_2_until')::numeric then (prm ->> 'gap_2')::numeric
                       else (prm ->> 'gap_3')::numeric end
      group by user_id) t;
    note := 'Counted per calendar day; a paper opened within the wait counts as one slowdown.';

  elsif p_rule = 'search_limit' then
    select coalesce(jsonb_agg(jsonb_build_object('u', user_id, 'n', n)), '[]'::jsonb) into aff from (
      select user_id, count(*) n from (
        select s.user_id, date_trunc('hour', s.at) b, count(*) k, 'h' kind from public.search_hits s where s.at >= since group by 1, 2
        union all
        select s.user_id, date_trunc('day', s.at), count(*), 'd' from public.search_hits s where s.at >= since group by 1, 2
      ) x where (kind = 'h' and k >= (prm ->> 'hourly')::numeric) or (kind = 'd' and k >= (prm ->> 'daily')::numeric)
      group by user_id) t;
    note := 'Searches are only kept for 30 days, and counting began on 2 Oct 2026, so there is little history.';

  elsif p_rule = 'machine_pace' then
    select coalesce(jsonb_agg(jsonb_build_object('u', user_id, 'n', n)), '[]'::jsonb) into aff from (
      select user_id, count(*) n from (
        select user_id, d, count(*) cnt, percentile_cont(0.5) within group (order by gap) med from (
          select f.user_id, (f.opened_at at time zone 'Asia/Kolkata')::date d,
                 extract(epoch from f.opened_at - lag(f.opened_at) over (partition by f.user_id order by f.opened_at)) gap
            from (select c.user_id, c.set_id, min(c.opened_at) opened_at from public.content_access c where c.opened_at >= since group by 1, 2) f) g
         where gap is not null group by user_id, d) x
      where cnt >= (prm ->> 'window')::numeric and med < (prm ->> 'median_seconds')::numeric
      group by user_id) t;
    note := 'Each paper is counted once, at its first opening, and uses the typical gap over each day''s papers rather than the last few.';

  elsif p_rule = 'no_use' then
    select coalesce(jsonb_agg(jsonb_build_object('u', user_id, 'n', n)), '[]'::jsonb) into aff from (
      select o.user_id, count(*) n
        from (select c.user_id, (c.opened_at at time zone 'Asia/Kolkata')::date d, count(distinct c.set_id) opens, coalesce(sum(c.explanations_read), 0) expl
                from public.content_access c where c.opened_at >= since group by c.user_id, 2) o
        left join (select a.user_id, (a.started_at at time zone 'Asia/Kolkata')::date d, count(*) filter (where coalesce(a.duration_seconds, 0) >= 120) att
                     from public.attempts a group by 1, 2) at on at.user_id = o.user_id and at.d = o.d
        left join (select r.user_id, (r.first_at at time zone 'Asia/Kolkata')::date d, count(*) rcpt from public.paper_receipts r group by 1, 2) rc on rc.user_id = o.user_id and rc.d = o.d
       where o.opens >= (prm ->> 'min_opens')::numeric and coalesce(at.att, 0) <= (prm ->> 'max_attempts')::numeric and o.expl = 0 and coalesce(rc.rcpt, 0) = 0
       group by o.user_id) t;
    note := 'Learning mode makes no attempts, and explanations and reading receipts were only recorded from 2 Oct 2026, so earlier days show no sign of use. Treat this as an upper bound; the live signal waits for receipts.';

  elsif p_rule = 'bot_agent' then
    select coalesce(jsonb_agg(jsonb_build_object('u', s.user_id, 'n', 1)), '[]'::jsonb) into aff
      from (select distinct user_id from public.content_access where ua is not null and ua not ilike '%mozilla%' and opened_at >= since) s;
    note := 'Uses the browser name sent when a paper was opened. That has only been recorded since 2 Oct 2026, so there is little history.';

  elsif p_rule = 'subject_spread' then
    select coalesce(jsonb_agg(jsonb_build_object('u', user_id, 'n', n)), '[]'::jsonb) into aff from (
      select user_id, count(*) n from (
        select c.user_id, (c.opened_at at time zone 'Asia/Kolkata')::date d, count(distinct qp.subject_id) s
          from public.content_access c join public.question_sets st on st.id = c.set_id join public.question_papers qp on qp.id = st.paper_id
         where c.opened_at >= since group by 1, 2
      ) x where s >= (prm ->> 'limit')::numeric group by user_id) t;

  elsif p_rule = 'no_receipts' then
    select coalesce(jsonb_agg(jsonb_build_object('u', user_id, 'n', n)), '[]'::jsonb) into aff from (
      select user_id, count(*) n from (
        select c.user_id, (c.opened_at at time zone 'Asia/Kolkata')::date d, count(distinct c.set_id) opens,
               count(distinct r.set_id) rcpt
          from public.content_access c left join public.paper_receipts r on r.user_id = c.user_id and r.set_id = c.set_id
         where c.opened_at >= since group by 1, 2
      ) x where opens >= (prm ->> 'min_opens')::numeric and rcpt < opens * (prm ->> 'max_ratio')::numeric
      group by user_id) t;
    note := 'Reading receipts only started on 2 Oct 2026, so earlier days have none and look unread. Treat this as an upper bound.';

  elsif p_rule = 'auto_ban' then
    select coalesce(jsonb_agg(jsonb_build_object('u', user_id, 'n', 1)), '[]'::jsonb) into aff from (
      with fo as (select c.user_id, c.set_id, min(c.opened_at) opened_at from public.content_access c where c.opened_at >= since group by 1, 2),
           fd as (select fo.user_id, fo.set_id, fo.opened_at, (fo.opened_at at time zone 'Asia/Kolkata')::date d,
                         extract(epoch from fo.opened_at - lag(fo.opened_at) over (partition by fo.user_id order by fo.opened_at)) gap from fo),
           agg as (select user_id, d, count(*) opens, percentile_cont(0.5) within group (order by gap) med from fd group by user_id, d),
           sj as (select fd.user_id, fd.d, count(distinct qp.subject_id) subj
                    from fd join public.question_sets st on st.id = fd.set_id join public.question_papers qp on qp.id = st.paper_id group by 1, 2),
           att as (select a.user_id, (a.started_at at time zone 'Asia/Kolkata')::date d, count(*) filter (where coalesce(a.duration_seconds, 0) >= 120) n
                     from public.attempts a group by 1, 2)
      select distinct agg.user_id
        from agg join sj using (user_id, d) left join att using (user_id, d)
       where agg.opens >= coalesce((select (params ->> 'min_opens')::int from public.risk_rules where key = 'auto_ban'), 25)
         and ((agg.opens >= window_n and coalesce(agg.med, 999) < med_s and ((agg.opens >= nu_opens and coalesce(att.n, 0) <= nu_att) or sj.subj >= spread))
              or (sj.subj >= spread and agg.opens >= nu_opens and coalesce(att.n, 0) <= nu_att))
         and (select count(*) from public.attempts a2 where a2.user_id = agg.user_id and coalesce(a2.duration_seconds, 0) >= 120
                 and a2.started_at > agg.d::timestamp - interval '6 days' and a2.started_at < agg.d::timestamp + interval '1 day') < 3
         and not exists (select 1 from public.risk_trusted t where t.user_id = agg.user_id)) t;
    note := 'Needs the minimum number of papers in a day, ignores accounts with 3 or more real attempts that week and trusted accounts, and uses the current numbers of the signal rules as if each were Enforce. Reading receipts and bot browsers have no history, so they are left out.';

  elsif p_rule = 'linked' or p_rule = 'device_block' then
    select coalesce(jsonb_agg(jsonb_build_object('u', user_id, 'n', 1)), '[]'::jsonb) into aff from (
      select distinct d2.user_id from public.device_sightings d1
        join public.risk_bans rb on rb.user_id = d1.user_id and rb.reverted_at is null
        join public.device_sightings d2 on d2.fingerprint = d1.fingerprint and d2.user_id <> d1.user_id
       where d2.ip is not distinct from d1.ip) t;
    note := format('Browser records started on 2 Oct 2026: %s sightings so far, so there is almost nothing to replay.', (select count(*) from public.device_sightings));

  elsif p_rule = 'ip_block' then
    select coalesce(jsonb_agg(jsonb_build_object('u', user_id, 'n', n)), '[]'::jsonb) into aff from (
      select o.user_id, count(distinct o.ip) n from (
        select user_id, ip from public.content_access where ip is not null
        union select user_id, ip from public.device_sightings where ip is not null
        union select user_id, ip from public.scrape_signals where ip is not null and user_id is not null
      ) o
      where o.ip in (
        select ip from public.scrape_signals where user_id in (select user_id from public.risk_bans) and ip is not null
        union select ip from public.device_sightings where user_id in (select user_id from public.risk_bans) and ip is not null)
        and o.user_id not in (select user_id from public.risk_bans)
      group by o.user_id) t;
    note := 'Counts accounts other than the banned ones seen on addresses the banned accounts used. Mobile-carrier addresses are shared, so this is who a block could also hit.';
  end if;

  select count(*) filter (where (e ->> 'u')::uuid not in (select user_id from public.risk_bans)),
         count(*) filter (where (e ->> 'u')::uuid in (select user_id from public.risk_bans)),
         coalesce(sum((e ->> 'n')::int), 0)
    into real_n, scr_n, ev
    from jsonb_array_elements(aff) e
    join public.profiles p on p.id = (e ->> 'u')::uuid and p.role = 'student';

  select coalesce(jsonb_agg(email), '[]'::jsonb) into ex from (
    select p.email from jsonb_array_elements(aff) e
      join public.profiles p on p.id = (e ->> 'u')::uuid and p.role = 'student'
     where (e ->> 'u')::uuid not in (select user_id from public.risk_bans)
     order by (e ->> 'n')::int desc limit 5) z;

  return jsonb_build_object('days', least(greatest(p_days, 1), 180), 'considered', considered, 'affected_real', real_n,
                            'affected_scrapers', scr_n, 'events', ev, 'examples', ex, 'note', note);
end;
$$;
revoke all on function public.risk_preview(text, jsonb, int) from public, anon, authenticated;
grant execute on function public.risk_preview(text, jsonb, int) to service_role;
