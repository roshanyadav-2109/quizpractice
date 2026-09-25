-- =============================================================================
-- 0008_teacher_permissions.sql — what a teacher may actually do
--
-- Deliberately narrow. A teacher's job is solutions and video, so they get
-- write access to solutions and nothing else: not the taxonomy, not papers,
-- not questions. Widening this later is a policy change; starting wide and
-- narrowing later is a migration nobody performs.
-- =============================================================================

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('teacher', 'admin')
  );
$$;

comment on function public.is_teacher() is
  'Authors solutions. Deliberately excludes contributor, whose remit is papers.';

-- Teachers publish solutions directly; students still land in the queue.
drop policy if exists solutions_insert on public.solutions;
create policy solutions_insert on public.solutions
  for insert with check (
    author_id = auth.uid()
    and (
      public.is_staff()
      or public.is_teacher()
      or (status = 'pending' and kind = 'community')
    )
  );

drop policy if exists solutions_update on public.solutions;
create policy solutions_update on public.solutions
  for update using (
    public.is_staff() or public.is_teacher()
    or (author_id = auth.uid() and status = 'pending')
  ) with check (
    public.is_staff() or public.is_teacher()
    or (author_id = auth.uid() and status = 'pending')
  );

drop policy if exists solutions_delete on public.solutions;
create policy solutions_delete on public.solutions
  for delete using (
    public.is_staff() or public.is_teacher() or author_id = auth.uid()
  );

-- Teachers need to read every question to write a solution for it, including
-- ones still in draft, and to see reports about their own solutions.
drop policy if exists questions_read on public.questions;
create policy questions_read on public.questions
  for select using (
    public.is_staff()
    or public.is_teacher()
    or (
      status = 'published' and exists (
        select 1
        from public.question_sets s
        join public.question_papers p on p.id = s.paper_id
        where s.id = set_id and p.status = 'published'
      )
    )
  );

drop policy if exists reports_read on public.reports;
create policy reports_read on public.reports
  for select using (
    user_id = auth.uid() or public.is_staff() or public.is_teacher()
  );

grant execute on function public.is_teacher() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Coverage: which questions still have no solution, and no video.
--
-- This is the teacher's work queue, so it has to be cheap to ask for and
-- honest about what "covered" means — an approved solution with a video is a
-- different thing from a text answer somebody left in the discussion.
-- ---------------------------------------------------------------------------
create or replace view public.solution_coverage
with (security_invoker = true) as
select
  q.id                as question_id,
  q.set_id,
  q.number,
  q.marks,
  q.topics,
  qp.subject_id,
  count(sol.id) filter (where sol.status = 'approved')                         as solution_count,
  count(sol.id) filter (where sol.status = 'approved' and sol.video_url is not null) as video_count
from public.questions q
join public.question_sets s   on s.id = q.set_id
join public.question_papers qp on qp.id = s.paper_id
left join public.solutions sol on sol.question_id = q.id
group by q.id, q.set_id, q.number, q.marks, q.topics, qp.subject_id;

grant select on public.solution_coverage to authenticated;
