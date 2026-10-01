-- ---------------------------------------------------------------------------
-- Correction: the "bot browser" signal read the browser name of the sign-in session. But the site's own
-- server completes some Google sign-ins, and Supabase then records that server ("node", on an Amazon
-- address) as the session's browser, for ordinary students too (15 students, 21 sessions). The signal now
-- reads the browser name sent with each paper opened (content_access.ua), which is the visitor's own.
-- The rule is set to Watch until real browser names have been recorded for a while.
-- ---------------------------------------------------------------------------

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

    -- The browser name of the request that opened the paper (src/lib/access.ts), not of the sign-in session:
    -- the site's own server completes some Google sign-ins and Supabase records that server ("node") as the
    -- session's browser, for ordinary students too.
    select exists (select 1 from public.content_access where user_id = u.user_id and opened_at > now() - interval '1 day' and ua is not null and ua not ilike '%mozilla%') into bot;

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
          select c.user_id, (c.opened_at at time zone 'Asia/Kolkata')::date d,
                 extract(epoch from c.opened_at - lag(c.opened_at) over (partition by c.user_id order by c.opened_at)) gap
            from public.content_access c where c.opened_at >= since) g
         where gap is not null group by user_id, d) x
      where cnt >= (prm ->> 'window')::numeric and med < (prm ->> 'median_seconds')::numeric
      group by user_id) t;
    note := 'Uses the typical gap over each day''s papers, not the last few.';

  elsif p_rule = 'no_use' then
    select coalesce(jsonb_agg(jsonb_build_object('u', user_id, 'n', n)), '[]'::jsonb) into aff from (
      select user_id, count(*) n from (
        select c.user_id, (c.opened_at at time zone 'Asia/Kolkata')::date d, count(distinct c.set_id) opens,
               (select count(*) from public.attempts a where a.user_id = c.user_id and (a.started_at at time zone 'Asia/Kolkata')::date = (c.opened_at at time zone 'Asia/Kolkata')::date and coalesce(a.duration_seconds, 0) >= 120) att
          from public.content_access c where c.opened_at >= since group by 1, 2, 4
      ) x where opens >= (prm ->> 'min_opens')::numeric and att <= (prm ->> 'max_attempts')::numeric
      group by user_id) t;

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
      select distinct x.user_id from (
        select c.user_id, (c.opened_at at time zone 'Asia/Kolkata')::date d, count(distinct c.set_id) opens,
               count(distinct qp.subject_id) subj,
               (select count(*) from public.attempts a where a.user_id = c.user_id and (a.started_at at time zone 'Asia/Kolkata')::date = (c.opened_at at time zone 'Asia/Kolkata')::date and coalesce(a.duration_seconds, 0) >= 120) att,
               (select percentile_cont(0.5) within group (order by extract(epoch from g.gap))
                  from (select c2.opened_at - lag(c2.opened_at) over (order by c2.opened_at) gap from public.content_access c2
                         where c2.user_id = c.user_id and (c2.opened_at at time zone 'Asia/Kolkata')::date = (c.opened_at at time zone 'Asia/Kolkata')::date) g
                 where g.gap is not null) med,
               exists (select 1 from public.content_access c3 where c3.user_id = c.user_id and c3.ua is not null and c3.ua not ilike '%mozilla%' and (c3.opened_at at time zone 'Asia/Kolkata')::date = (c.opened_at at time zone 'Asia/Kolkata')::date) bot
          from public.content_access c join public.question_sets st on st.id = c.set_id join public.question_papers qp on qp.id = st.paper_id
         where c.opened_at >= since group by c.user_id, 2, 5, 6, 7
      ) x
      where ((x.opens >= window_n and coalesce(x.med, 999) < med_s) and ((x.opens >= nu_opens and x.att <= nu_att) or x.bot or x.subj >= spread))
         or (x.subj >= spread and x.opens >= nu_opens and x.att <= nu_att)
         or (x.bot and x.opens >= 20 and x.opens >= nu_opens and x.att <= nu_att)) t;
    note := 'Uses the current numbers of the signal rules, as if every signal were set to Enforce. Reading receipts are left out because they have no history.';

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

revoke all on function public.run_risk_scan(uuid) from public, anon, authenticated;
grant execute on function public.run_risk_scan(uuid) to service_role;
revoke all on function public.risk_preview(text, jsonb, int) from public, anon, authenticated;
grant execute on function public.risk_preview(text, jsonb, int) to service_role;

update public.risk_rules set mode = 'watch', updated_at = now()
 where key = 'bot_agent' and mode = 'off';
