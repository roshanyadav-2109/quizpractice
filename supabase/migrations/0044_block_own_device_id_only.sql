-- ---------------------------------------------------------------------------
-- Block a browser by its own random id only.
--
-- The page sends two ids (src/components/site/DeviceBeacon.tsx): d:, a random id kept in
-- the browser, and f:, a hash of traits every browser of that kind shares. Blocking f: would
-- ban students who happen to own the same phone, so ban_account blocks d: only; f: is still
-- recorded and still links accounts (with a shared address) in run_risk_scan.
-- ---------------------------------------------------------------------------

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
