-- ---------------------------------------------------------------------------
-- The Google photo on the profile, kept current.
--
-- Google's metadata carries the photo as `picture` (Supabase also copies it to
-- `avatar_url`, but not for every sign-in path), so a new profile takes
-- whichever is there. And Supabase rewrites the metadata on each sign-in, so a
-- changed Google photo or name reaches the profile the next time the student
-- signs in — without overwriting a photo with nothing.
-- ---------------------------------------------------------------------------

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
  return new;
end;
$$;

create or replace function public.sync_profile_photo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  photo text := coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture');
begin
  if photo is not null then
    update public.profiles set avatar_url = photo where id = new.id and avatar_url is distinct from photo;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_metadata_change on auth.users;
create trigger on_auth_user_metadata_change
  after update of raw_user_meta_data on auth.users
  for each row execute function public.sync_profile_photo();

-- Backfill: any account whose metadata has a photo the profile lacks.
update public.profiles p
set avatar_url = coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture')
from auth.users u
where u.id = p.id
  and p.avatar_url is null
  and coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture') is not null;
