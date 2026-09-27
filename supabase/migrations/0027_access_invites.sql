-- =============================================================================
-- Access by email: an admin names a person's Google address and a role (and,
-- for a teacher, branch + subject combos) before that person has ever signed
-- in. The first time they sign in with that address, and the address is
-- confirmed (a Google sign-in always is), the role and combos are applied and
-- the invite is used up. Someone who has already signed in gets the role at
-- once instead.
--
-- Admin stays out of reach: invites hand out teacher or contributor only, as
-- set_user_role() does, so a stolen admin session cannot mint more admins.
-- =============================================================================

create table public.access_invites (
  email      text primary key
             check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  role       public.user_role not null check (role in ('teacher', 'contributor')),
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.invite_assignments (
  email      text not null references public.access_invites(email) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (email, subject_id)
);

-- Only admins see or change who is invited; an invited address is never public.
alter table public.access_invites enable row level security;
alter table public.invite_assignments enable row level security;

create policy access_invites_admin on public.access_invites
  for all using (public.is_admin()) with check (public.is_admin());
create policy invite_assignments_admin on public.invite_assignments
  for all using (public.is_admin()) with check (public.is_admin());

revoke all on public.access_invites, public.invite_assignments from anon;
grant select, insert, update, delete on public.access_invites, public.invite_assignments to authenticated;

-- The same rule as teacher_assignments: the subject must belong to the branch,
-- and only a teacher invite carries subjects.
create or replace function public.check_invite_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  branch uuid;
  invited_role public.user_role;
begin
  select l.program_id into branch
  from public.subjects s
  join public.levels l on l.id = s.level_id
  where s.id = new.subject_id;

  if branch is null then
    raise exception 'Unknown subject.' using errcode = '23503';
  end if;
  if branch <> new.program_id then
    raise exception 'That subject is not part of this branch.' using errcode = '23514';
  end if;

  select role into invited_role from public.access_invites where email = new.email;
  if invited_role is distinct from 'teacher' then
    raise exception 'Only a teacher invite can be given subjects.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger invite_assignments_check
  before insert or update on public.invite_assignments
  for each row execute function public.check_invite_assignment();

-- Turns an invite into access. Internal: called by the sign-up and
-- confirmation triggers below and by admin_invite(), never by a client.
create or replace function public.apply_access_invite(p_user uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.access_invites;
begin
  select * into invite
  from public.access_invites
  where email = lower(btrim(coalesce(p_email, '')))
  for update;
  if not found then
    return;
  end if;

  -- An invite never touches an admin.
  update public.profiles set role = invite.role where id = p_user and role <> 'admin';

  if invite.role = 'teacher' then
    insert into public.teacher_assignments (teacher_id, program_id, subject_id, assigned_by)
    select p_user, ia.program_id, ia.subject_id, invite.invited_by
    from public.invite_assignments ia
    where ia.email = invite.email
    on conflict (teacher_id, subject_id) do nothing;
  end if;

  delete from public.access_invites where email = invite.email;
end;
$$;

revoke all on function public.apply_access_invite(uuid, text) from public, anon, authenticated;

-- New accounts: the profile as before, then any invite for a confirmed address.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, email)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    new.email
  )
  on conflict (id) do nothing;

  if new.email_confirmed_at is not null then
    perform public.apply_access_invite(new.id, new.email);
  end if;
  return new;
end;
$$;

-- An address confirmed after sign-up (an email-and-password account) is
-- honoured then: an unconfirmed sign-up with someone else's address gets nothing.
create or replace function public.apply_invite_on_confirm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    perform public.apply_access_invite(new.id, new.email);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function public.apply_invite_on_confirm();

-- The admin's one call: 'applied' when the person has already signed in (the
-- role is set now), 'invited' when the invite waits for their first sign-in.
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
  -- A teacher invite changed to contributor loses its subjects.
  if p_role <> 'teacher' then
    delete from public.invite_assignments where email = address;
  end if;
  return 'invited';
end;
$$;

revoke all on function public.admin_invite(text, public.user_role) from public, anon;
grant execute on function public.admin_invite(text, public.user_role) to authenticated;
