-- =============================================================================
-- Admin by email, for the site owner only. An invite can now carry the admin
-- role, but only when written straight into the database (the Supabase SQL
-- editor or dashboard): the site's own admins still cannot create, change or
-- withdraw an admin invite, so a stolen admin session cannot mint admins.
-- =============================================================================

alter table public.access_invites drop constraint access_invites_role_check;
alter table public.access_invites
  add constraint access_invites_role_check check (role in ('teacher', 'contributor', 'admin'));

drop policy access_invites_admin on public.access_invites;

create policy access_invites_admin_read on public.access_invites
  for select using (public.is_admin());
create policy access_invites_admin_insert on public.access_invites
  for insert with check (public.is_admin() and role <> 'admin');
create policy access_invites_admin_update on public.access_invites
  for update using (public.is_admin() and role <> 'admin') with check (public.is_admin() and role <> 'admin');
create policy access_invites_admin_delete on public.access_invites
  for delete using (public.is_admin() and role <> 'admin');

-- As in 0027, plus: an address the owner invited as admin is left alone.
create or replace function public.admin_invite(p_email text, p_role public.user_role)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  address text := lower(btrim(coalesce(p_email, '')));
  existing public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can invite people.' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('teacher', 'contributor') then
    raise exception 'Invite someone as a teacher or a contributor. Admins are made in the Supabase dashboard.'
      using errcode = '22023';
  end if;
  if address !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'That is not an email address.' using errcode = '22023';
  end if;
  if exists (select 1 from public.access_invites where email = address and role = 'admin') then
    raise exception 'That address is invited as an admin by the site owner.' using errcode = '42501';
  end if;

  select * into existing from public.profiles where lower(email) = address limit 1;
  if found then
    if existing.id = auth.uid() then
      raise exception 'You cannot change your own role.' using errcode = '42501';
    end if;
    if existing.role = 'admin' then
      raise exception 'Admin roles are changed in the Supabase dashboard.' using errcode = '42501';
    end if;
    update public.profiles set role = p_role where id = existing.id;
    return 'applied';
  end if;

  insert into public.access_invites (email, role, invited_by)
  values (address, p_role, auth.uid())
  on conflict (email) do update set role = excluded.role, invited_by = excluded.invited_by;
  if p_role <> 'teacher' then
    delete from public.invite_assignments where email = address;
  end if;
  return 'invited';
end;
$$;
