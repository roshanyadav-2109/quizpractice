-- Live feed of this site's sign-ins to the Unknown IITians users sheet (docs/sheet-sync/README.md).
-- Each new account, each login and each profile change posts that one person to the sheet's
-- webhook (address and secret in sheet_hook, private). With sheet_hook empty nothing is sent.
-- Every trigger swallows its own errors: a sign-in is never refused because the sheet was unreachable.
create extension if not exists pg_net with schema extensions;

create table if not exists public.sheet_hook (
  id     int primary key default 1 check (id = 1),
  url    text not null,
  secret text not null
);
alter table public.sheet_hook enable row level security;
revoke all on public.sheet_hook from anon, authenticated;

create or replace function public.sheet_user_payload(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'email', lower(btrim(u.email)),
    'name', coalesce(p.display_name, nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(u.raw_user_meta_data ->> 'name'), '')),
    'phone', nullif(btrim(p.phone), ''),
    'created_at', u.created_at, 'last_login', u.last_sign_in_at,
    'provider', u.raw_app_meta_data ->> 'provider', 'role', null::text)
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = p_id and u.email is not null;
$$;
revoke all on function public.sheet_user_payload(uuid) from public, anon, authenticated;

create or replace function public.sheet_post(p_body jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare h record;
begin
  select url, secret into h from public.sheet_hook where id = 1;
  if h.url is null then return; end if;
  perform net.http_post(
    url := h.url,
    body := p_body || jsonb_build_object('secret', h.secret),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 30000);
exception when others then
  null;
end;
$$;
revoke all on function public.sheet_post(jsonb) from public, anon, authenticated;

create or replace function public.sheet_notify_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid; payload jsonb;
begin
  uid := case tg_table_name when 'users' then new.id else new.id end;
  if uid is null then return new; end if;
  payload := public.sheet_user_payload(uid);
  if payload is not null then
    perform public.sheet_post(jsonb_build_object('site', 'oppe', 'users', jsonb_build_array(payload)));
  end if;
  return new;
exception when others then
  return new;
end;
$$;
revoke all on function public.sheet_notify_user() from public, anon, authenticated;

drop trigger if exists sheet_notify_user_insert on auth.users;
create trigger sheet_notify_user_insert
  after insert on auth.users
  for each row execute function public.sheet_notify_user();

drop trigger if exists sheet_notify_user_login on auth.users;
create trigger sheet_notify_user_login
  after update of last_sign_in_at on auth.users
  for each row when (new.last_sign_in_at is distinct from old.last_sign_in_at)
  execute function public.sheet_notify_user();

drop trigger if exists sheet_notify_profile on public.profiles;
create trigger sheet_notify_profile
  after insert or update of display_name, phone on public.profiles
  for each row execute function public.sheet_notify_user();
