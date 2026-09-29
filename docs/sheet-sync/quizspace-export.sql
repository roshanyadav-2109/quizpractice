-- Read-only export of this site's accounts for the Unknown IITians users sheet
-- (see docs/sheet-sync/README.md). Locked by a secret token: the function refuses
-- any call whose token's SHA-256 is not in sheet_export_key. It returns emails,
-- names, phone numbers and dates — nothing else — and changes nothing.

create table if not exists public.sheet_export_key (
  token_hash text primary key,
  created_at timestamptz not null default now()
);
alter table public.sheet_export_key enable row level security;
revoke all on public.sheet_export_key from anon, authenticated;

create or replace function public.sheet_check_token(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_token is not null and exists (
    select 1 from public.sheet_export_key
    where token_hash = encode(sha256(convert_to(p_token, 'utf8')), 'hex'));
$$;
revoke all on function public.sheet_check_token(text) from public, anon, authenticated;

create or replace function public.sheet_export(p_token text, p_after uuid default null, p_limit int default 3000)
returns table (id uuid, email text, name text, phone text, created_at timestamptz,
               last_login timestamptz, provider text, role text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.sheet_check_token(p_token) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select u.id, lower(btrim(u.email))::text,
           coalesce(p.display_name, nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(u.raw_user_meta_data ->> 'name'), ''))::text,
           null::text, u.created_at, u.last_sign_in_at,
           (u.raw_app_meta_data ->> 'provider')::text, p.role::text
    from auth.users u
    left join public.profiles p on p.id = u.id
    where u.email is not null and (p_after is null or u.id > p_after)
    order by u.id
    limit least(greatest(p_limit, 1), 5000);
end;
$$;
revoke all on function public.sheet_export(text, uuid, int) from public;
grant execute on function public.sheet_export(text, uuid, int) to anon;
