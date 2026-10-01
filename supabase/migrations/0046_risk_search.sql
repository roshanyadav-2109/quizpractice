-- ---------------------------------------------------------------------------
-- Finding an account from the admin dashboard: by e-mail or name, by account id, by an address
-- it opened papers or signed in from, or by a browser id. Staff-only, through the service role.
-- ---------------------------------------------------------------------------
create or replace function public.risk_search(p_q text, p_limit int default 30)
returns table (user_id uuid, email text, name text, role text, joined timestamptz, last_sign_in timestamptz,
               opens_total int, last_open timestamptz, banned boolean, matched text)
language sql
stable
security definer
set search_path = public
as $$
  with q as (select btrim(p_q) as s),
  hits as (
    select p.id as uid, 'e-mail or name'::text as why from public.profiles p, q
     where length(q.s) >= 2 and (p.email ilike '%' || replace(replace(q.s, '%', ''), '_', '') || '%' or p.display_name ilike '%' || replace(replace(q.s, '%', ''), '_', '') || '%')
    union
    select p.id, 'account id' from public.profiles p, q where p.id::text = q.s
    union
    select c.user_id, 'opened papers from this address' from public.content_access c, q where c.ip = q.s
    union
    select d.user_id, 'seen on this address' from public.device_sightings d, q where d.ip = q.s
    union
    select g.user_id, 'refused or flagged from this address' from public.scrape_signals g, q where g.ip = q.s and g.user_id is not null
    union
    select e.user_id, 'a decision was logged on this address' from public.risk_events e, q where e.ip = q.s and e.user_id is not null
    union
    select s.user_id, 'signed in from this address' from auth.sessions s, q where host(s.ip) = q.s
    union
    select d.user_id, 'same browser' from public.device_sightings d, q where d.fingerprint = q.s or d.fingerprint = 'd:' || q.s or d.fingerprint = 'f:' || q.s
  )
  select p.id, p.email, p.display_name, p.role::text, au.created_at, au.last_sign_in_at,
         (select count(distinct x.set_id)::int from public.content_access x where x.user_id = p.id),
         (select max(x.opened_at) from public.content_access x where x.user_id = p.id),
         au.banned_until is not null and au.banned_until > now(),
         h.matched
    from (select uid, string_agg(distinct why, ', ') as matched from hits group by uid) h
    join public.profiles p on p.id = h.uid
    join auth.users au on au.id = p.id
   order by (select max(x.opened_at) from public.content_access x where x.user_id = p.id) desc nulls last, au.created_at desc
   limit least(p_limit, 100);
$$;
revoke all on function public.risk_search(text, int) from public, anon, authenticated;
grant execute on function public.risk_search(text, int) to service_role;
