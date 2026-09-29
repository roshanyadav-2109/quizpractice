-- ---------------------------------------------------------------------------
-- Every confirmed sign-in goes into the Unknown IITians announcement groups.
--
-- The main site (unknowniitians.com) keeps a numbered series of Google Groups,
-- ui-announcements-01 … NN, 499 members each, and one address book for all of
-- them: an email that already has a place is never given another, and when a
-- group fills the next is made. Quiz Space does not keep its own — it hands
-- each new email to that same system, so a student on both sites is in one
-- group, once.
--
-- This table is only the outbox of that hand-over: which emails are still to
-- be sent, which were, and which group the main site put each in. The app
-- sends them (src/lib/group-signup.ts) right after sign-in and again daily for
-- any that failed. Only the server touches it — it holds every account's
-- email, so no policy opens it to anyone.
--
-- An email is queued once it is confirmed: a Google sign-in is confirmed on
-- arrival; an email-and-password sign-up only after its link is clicked, so
-- nobody can put another person's address into the groups by typing it.
-- ---------------------------------------------------------------------------

create table public.group_signups (
  email_normalized     text primary key,
  user_id              uuid not null,
  status               text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  attempts             int  not null default 0,
  group_number         int,
  was_already_assigned boolean,
  last_error           text,
  created_at           timestamptz not null default now(),
  processed_at         timestamptz
);

create index group_signups_pending_idx on public.group_signups (created_at) where status <> 'done';

alter table public.group_signups enable row level security;
revoke all on public.group_signups from anon, authenticated;

create or replace function public.queue_group_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is not null and new.email_confirmed_at is not null
     and (tg_op = 'INSERT' or old.email_confirmed_at is null) then
    insert into public.group_signups (email_normalized, user_id)
    values (lower(btrim(new.email)), new.id)
    on conflict (email_normalized) do nothing;
  end if;
  return new;
exception when others then
  -- A sign-in is never refused because the outbox could not be written.
  return new;
end;
$$;

revoke all on function public.queue_group_signup() from public, anon, authenticated;

create trigger on_auth_user_group_signup
  after insert or update of email_confirmed_at on auth.users
  for each row execute function public.queue_group_signup();

-- Everyone confirmed so far.
insert into public.group_signups (email_normalized, user_id)
select lower(btrim(email)), id
from auth.users
where email is not null and email_confirmed_at is not null
on conflict (email_normalized) do nothing;
