-- =============================================================================
-- 0021_subject_activity.sql — how many students practise each subject
--
-- active_students_by_subject(): distinct students who submitted a paper or
-- retried a mistake in each subject over the last N days. Counts only, and
-- only where at least 100 students were active: a number never points at a
-- person, and a subject shows nothing until the count is worth showing.
-- SECURITY DEFINER because it counts across everyone's attempts; it returns
-- nothing but the subject and the count.
-- =============================================================================

create index if not exists attempts_submitted_idx on public.attempts(submitted_at);
create index if not exists question_reviews_reviewed_idx on public.question_reviews(reviewed_at);

create or replace function public.active_students_by_subject(days int default 7)
returns table (subject_id uuid, students bigint)
language sql
stable
security definer
set search_path = public
as $$
  with activity as (
    select a.user_id, p.subject_id
    from public.attempts a
    join public.question_sets s on s.id = a.set_id
    join public.question_papers p on p.id = s.paper_id
    where a.submitted_at >= now() - interval '1 day' * greatest(days, 1)
    union
    select r.user_id, p.subject_id
    from public.question_reviews r
    join public.questions q on q.id = r.question_id
    join public.question_sets s on s.id = q.set_id
    join public.question_papers p on p.id = s.paper_id
    where r.reviewed_at >= now() - interval '1 day' * greatest(days, 1)
  )
  select act.subject_id, count(distinct act.user_id) as students
  from activity act
  join public.profiles pr on pr.id = act.user_id and pr.role = 'student'
  group by act.subject_id
  having count(distinct act.user_id) >= 100;
$$;

grant execute on function public.active_students_by_subject(int) to anon, authenticated;
