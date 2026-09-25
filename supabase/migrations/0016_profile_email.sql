-- ---------------------------------------------------------------------------
-- Carry the account email on the profile.
--
-- Every provider — Google included — sets auth.users.email; mirroring it onto
-- the profile means the app can read a user's email (and name, avatar) from the
-- one table it already joins, without reaching into the auth schema.
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists email text;

-- The new-user trigger now fills email alongside the name and avatar it already
-- copied from the provider's metadata.
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
    new.raw_user_meta_data ->> 'avatar_url',
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Keep the profile's email in step if the account's email ever changes.
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_change on auth.users;
create trigger on_auth_user_email_change
  after update of email on auth.users
  for each row execute function public.sync_profile_email();

-- Backfill the accounts that already exist.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is distinct from u.email;
