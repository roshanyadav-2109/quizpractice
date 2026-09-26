-- =============================================================================
-- 0017_leaderboard.sql — rank students, overall and within a slice
--
-- Attempts are row-level secured to their owner, so a ranking across students
-- has to be a SECURITY DEFINER function. Like the peer statistics in 0006 it
-- reads every attempt but returns only what a leaderboard shows: a rank, the
-- display name and avatar the student already shows on the site, and their
-- figures. No user id, email, answer or single attempt leaves here — the
-- caller's own row is flagged with `is_you` instead of being identified.
--
-- Fairness: each student counts once per paper, with their best attempt on
-- it, so retaking a paper can raise a score but never inflates the count.
-- Students are ranked by their average of those best scores, ties broken by
-- how many papers they have sat. Only students are ranked — staff testing
-- papers would otherwise crowd the top.
-- =============================================================================

create or replace function public.leaderboard(
  scope      text default 'overall',   -- overall | subject | exam | level | program
  scope_key  text default null,        -- subject/exam/program slug, or level id
  top_n      int  default 10,
  min_papers int  default 1
)
returns table (
  rank           bigint,
  display_name   text,
  avatar_url     text,
  papers         bigint,
  avg_percentage numeric,
  is_you         boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with best as (
    select a.user_id, a.set_id, max(a.score / a.max_score) as ratio
    from public.attempts a
    join public.question_sets   qs on qs.id = a.set_id
    join public.question_papers qp on qp.id = qs.paper_id
    join public.subjects        s  on s.id  = qp.subject_id
    join public.levels          l  on l.id  = s.level_id
    join public.programs        pr on pr.id = l.program_id
    join public.exam_types      et on et.id = qp.exam_type_id
    where a.submitted_at is not null
      and a.max_score > 0
      and case scope
            when 'overall' then true
            when 'subject' then s.slug  = scope_key
            when 'exam'    then et.slug = scope_key
            when 'level'   then l.id::text = scope_key
            when 'program' then pr.slug = scope_key
            else false
          end
    group by a.user_id, a.set_id
  ),
  per_student as (
    select b.user_id, count(*) as papers, avg(b.ratio) as avg_ratio
    from best b
    join public.profiles p on p.id = b.user_id and p.role = 'student'
    group by b.user_id
    having count(*) >= greatest(min_papers, 1)
  ),
  ranked as (
    select ps.*, rank() over (order by ps.avg_ratio desc, ps.papers desc) as rnk
    from per_student ps
  )
  select
    r.rnk,
    coalesce(nullif(p.display_name, ''), 'Student'),
    p.avatar_url,
    r.papers,
    round(r.avg_ratio * 100, 1),
    coalesce(r.user_id = auth.uid(), false)
  from ranked r
  join public.profiles p on p.id = r.user_id
  where r.rnk <= least(greatest(top_n, 1), 100) or r.user_id = auth.uid()
  order by r.rnk, r.papers desc;
$$;

-- Names are shown to signed-in students only, never to anonymous visitors.
revoke execute on function public.leaderboard(text, text, int, int) from public, anon;
grant execute on function public.leaderboard(text, text, int, int) to authenticated;
