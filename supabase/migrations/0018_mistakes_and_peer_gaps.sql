-- =============================================================================
-- 0018_mistakes_and_peer_gaps.sql — the mistake bank, and "easy for others"
--
-- question_reviews: every time a student retries one of their own mistakes
-- outside a paper. A question's state in the mistake bank is read from its
-- whole history — attempts and reviews together — so a later correct answer
-- in a full paper counts as fixing it too.
--
-- my_peer_gaps(): questions the caller got wrong that most other students got
-- right — a real gap, as opposed to a question that is simply hard for all.
-- SECURITY DEFINER like the other peer functions: it reads everyone's answers
-- but returns only aggregates plus the caller's own figures, and only where
-- enough other students have answered for the percentage to mean anything.
-- =============================================================================

create table if not exists public.question_reviews (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  question_id        uuid not null references public.questions(id) on delete cascade,
  is_correct         boolean not null,
  response           jsonb,
  time_spent_seconds int,
  reviewed_at        timestamptz not null default now()
);

create index if not exists question_reviews_user_idx
  on public.question_reviews(user_id, question_id, reviewed_at desc);

alter table public.question_reviews enable row level security;

drop policy if exists question_reviews_read on public.question_reviews;
create policy question_reviews_read on public.question_reviews
  for select to authenticated using (user_id = auth.uid());

drop policy if exists question_reviews_insert on public.question_reviews;
create policy question_reviews_insert on public.question_reviews
  for insert to authenticated with check (user_id = auth.uid());

grant select, insert on public.question_reviews to authenticated;

create or replace function public.my_peer_gaps(max_rows int default 8, min_peers int default 3)
returns table (
  question_id             uuid,
  set_id                  uuid,
  question_number         int,
  subject_name            text,
  subject_slug            text,
  exam_type_name          text,
  session_date            date,
  peer_count              bigint,
  peer_correct_percentage numeric,
  peer_avg_seconds        numeric,
  your_seconds            int,
  answered                boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    -- The caller's most recent marked answer to each question.
    select distinct on (aa.question_id)
      aa.question_id, aa.is_correct, aa.response, aa.time_spent_seconds
    from public.attempt_answers aa
    join public.attempts a on a.id = aa.attempt_id
    where a.user_id = auth.uid()
      and a.submitted_at is not null
      and aa.is_correct is not null
    order by aa.question_id, a.submitted_at desc
  ),
  missed as (
    select * from mine where is_correct = false
  ),
  peer_first as (
    -- Each other student's first marked answer: what they knew going in.
    select distinct on (aa.question_id, a.user_id)
      aa.question_id, aa.is_correct, aa.time_spent_seconds
    from public.attempt_answers aa
    join public.attempts a on a.id = aa.attempt_id
    join public.profiles p on p.id = a.user_id and p.role = 'student'
    where a.user_id <> auth.uid()
      and a.submitted_at is not null
      and aa.is_correct is not null
      and aa.question_id in (select question_id from missed)
    order by aa.question_id, a.user_id, a.submitted_at asc
  ),
  peers as (
    select
      question_id,
      count(*)                                                   as n,
      round(100.0 * count(*) filter (where is_correct) / count(*), 0) as pct,
      round(avg(time_spent_seconds))                             as avg_t
    from peer_first
    group by question_id
    having count(*) >= greatest(min_peers, 3)
  )
  select
    q.id,
    q.set_id,
    q.number,
    s.name,
    s.slug,
    et.name,
    qp.session_date,
    pe.n,
    pe.pct,
    pe.avg_t,
    m.time_spent_seconds,
    m.response is not null
  from missed m
  join peers pe                  on pe.question_id = m.question_id
  join public.questions q        on q.id = m.question_id
  join public.question_sets qs   on qs.id = q.set_id
  join public.question_papers qp on qp.id = qs.paper_id
  join public.subjects s         on s.id = qp.subject_id
  join public.exam_types et      on et.id = qp.exam_type_id
  where pe.pct >= 50
  order by pe.pct desc, pe.n desc
  limit least(greatest(max_rows, 1), 50);
$$;

revoke execute on function public.my_peer_gaps(int, int) from public, anon;
grant execute on function public.my_peer_gaps(int, int) to authenticated;
