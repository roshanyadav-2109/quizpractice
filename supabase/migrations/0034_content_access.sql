-- ---------------------------------------------------------------------------
-- Opening a paper, per account.
--
-- The papers' questions are shown in full only to a signed-in student (0035
-- takes them off the public key). Each paper an account opens is recorded
-- here, which does two things:
--
--   * a limit — a student opens a handful of papers an hour; an account that
--     opens dozens is copying the bank, and is refused until the window
--     passes. Re-opening a paper already opened today is always allowed.
--   * a trail — if the questions turn up elsewhere, the accounts that opened
--     them are on record.
--
-- Staff and teachers are not limited: reviewing papers is their work.
--
-- may_read_question() answers "may this account see this question's
-- explanation?": only for a paper it has opened lately, or a question it has
-- answered — so the explanations cannot be walked question by question.
--
-- scrape_signals collects what looks like copying — an account refused by
-- the limit, a visitor that followed the link only bots follow — for staff
-- to review. The app writes it with the service role; nobody else may.
-- ---------------------------------------------------------------------------

create table public.content_access (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  set_id     uuid not null references public.question_sets(id) on delete cascade,
  opened_at  timestamptz not null default now()
);

create index content_access_user_idx on public.content_access (user_id, opened_at desc);
create index content_access_set_idx on public.content_access (set_id);

alter table public.content_access enable row level security;

create policy content_access_read on public.content_access
  for select using (user_id = (select auth.uid()) or (select public.is_staff()));

revoke all on public.content_access from anon;
revoke insert, update, delete on public.content_access from authenticated;
grant select on public.content_access to authenticated;

create table public.scrape_signals (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  kind        text not null check (kind in ('limit', 'trap')),
  user_id     uuid references public.profiles(id) on delete set null,
  set_id      uuid,
  ip          text,
  user_agent  text,
  path        text
);

create index scrape_signals_at_idx on public.scrape_signals (at desc);

alter table public.scrape_signals enable row level security;

create policy scrape_signals_staff on public.scrape_signals
  for select using ((select public.is_staff()));

revoke all on public.scrape_signals from anon;
revoke insert, update, delete on public.scrape_signals from authenticated;
grant select on public.scrape_signals to authenticated;

-- Distinct papers an account may open: 30 in an hour, 100 in a day.
create or replace function public.open_set(p_set uuid)
returns table (allowed boolean, opened_last_hour int, opened_today int)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  last_hour  int;
  today      int;
begin
  if uid is null then
    return query select false, 0, 0;
    return;
  end if;

  if public.is_staff() or public.is_teacher() then
    return query select true, 0, 0;
    return;
  end if;

  select count(distinct a.set_id) filter (where a.opened_at > now() - interval '1 hour')::int,
         count(distinct a.set_id)::int
    into last_hour, today
    from public.content_access a
   where a.user_id = uid and a.opened_at > now() - interval '1 day';

  -- Back to a paper opened today: no new count.
  if exists (
    select 1 from public.content_access a
     where a.user_id = uid and a.set_id = p_set and a.opened_at > now() - interval '1 day'
  ) then
    return query select true, last_hour, today;
    return;
  end if;

  if last_hour >= 30 or today >= 100 then
    return query select false, last_hour, today;
    return;
  end if;

  insert into public.content_access (user_id, set_id) values (uid, p_set);
  return query select true, last_hour + 1, today + 1;
end;
$$;

revoke all on function public.open_set(uuid) from public;
grant execute on function public.open_set(uuid) to authenticated;

-- A question's explanation, for an account that opened its paper in the last
-- week or has answered the question (the mistake bank). Staff and teachers always.
create or replace function public.may_read_question(p_question uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    public.is_staff()
    or public.is_teacher()
    or exists (
      select 1
        from public.questions q
        join public.content_access a on a.set_id = q.set_id
       where q.id = p_question
         and a.user_id = auth.uid()
         and a.opened_at > now() - interval '7 days'
    )
    or exists (
      select 1
        from public.attempt_answers aa
        join public.attempts at on at.id = aa.attempt_id
       where aa.question_id = p_question and at.user_id = auth.uid()
    )
  );
$$;

revoke all on function public.may_read_question(uuid) from public;
grant execute on function public.may_read_question(uuid) to authenticated;
