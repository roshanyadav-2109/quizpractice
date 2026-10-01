-- ---------------------------------------------------------------------------
-- "What would this rule have done?" for the admin dashboard: replays a rule, with the numbers an admin is
-- typing, over the recorded history and counts the accounts it would have touched, split into real students
-- and accounts already banned as scrapers. Read-only. Days are counted as calendar days (India time), so
-- it is an honest approximation, not an exact replay of the rolling windows the live rules use.
-- ---------------------------------------------------------------------------
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
      from (select distinct user_id from auth.sessions where user_agent is not null and user_agent not ilike '%mozilla%') s;
    note := 'Only live sign-ins keep their browser name, so this sees accounts that are signed in now.';

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
               exists (select 1 from auth.sessions s where s.user_id = c.user_id and s.user_agent is not null and s.user_agent not ilike '%mozilla%') bot
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
revoke all on function public.risk_preview(text, jsonb, int) from public, anon, authenticated;
grant execute on function public.risk_preview(text, jsonb, int) to service_role;
