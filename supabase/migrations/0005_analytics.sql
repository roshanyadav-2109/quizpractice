-- =============================================================================
-- 0005_analytics.sql — the data a post-test analysis screen needs
--
-- Every serious exam-prep product answers three questions after a paper:
-- where did my time go, how did I do against everyone else, and which topics
-- am I weak in. None of that is answerable from the attempt tables as they
-- stood, so this migration adds the one missing column (per-question time) and
-- the aggregate views that turn attempts into comparisons.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Per-question time
--
-- Recorded by the exam runner as dwell time on each question. Nullable because
-- attempts made before this column existed have no timing, and a missing value
-- must read as "unknown" rather than "instant".
-- ---------------------------------------------------------------------------
alter table public.attempt_answers
  add column if not exists time_spent_seconds int;

comment on column public.attempt_answers.time_spent_seconds is
  'Seconds this question was on screen. Null for attempts recorded before timing existed.';

-- ---------------------------------------------------------------------------
-- set_stats — how everyone else did on a paper.
--
-- Powers "your score vs the average" and the percentile band. Only submitted
-- attempts count; an abandoned attempt would drag every average down.
-- ---------------------------------------------------------------------------
create or replace view public.set_stats
with (security_invoker = true) as
select
  a.set_id,
  count(*)                                            as attempt_count,
  round(avg(a.score), 2)                              as avg_score,
  round(avg(nullif(a.max_score, 0)), 2)               as avg_max_score,
  round(avg(a.score / nullif(a.max_score, 0)) * 100, 1) as avg_percentage,
  round(
    percentile_cont(0.5) within group (
      order by a.score / nullif(a.max_score, 0)
    )::numeric * 100, 1
  )                                                   as median_percentage,
  round(avg(a.duration_seconds))                      as avg_duration_seconds
from public.attempts a
where a.submitted_at is not null
  and a.max_score is not null
  and a.max_score > 0
group by a.set_id;

-- ---------------------------------------------------------------------------
-- question_stats — which questions people actually get wrong.
--
-- Two uses: a difficulty signal on the question itself, and "you got this
-- wrong, so did 71% of people" on the analysis screen, which is the line that
-- stops a hard question feeling like a personal failure.
-- ---------------------------------------------------------------------------
create or replace view public.question_stats
with (security_invoker = true) as
select
  aa.question_id,
  count(*) filter (where aa.is_correct is not null)          as marked_count,
  count(*) filter (where aa.is_correct)                      as correct_count,
  round(
    100.0 * count(*) filter (where aa.is_correct)
    / nullif(count(*) filter (where aa.is_correct is not null), 0)
  , 1)                                                        as correct_percentage,
  round(avg(aa.time_spent_seconds))                           as avg_time_seconds
from public.attempt_answers aa
join public.attempts a on a.id = aa.attempt_id
where a.submitted_at is not null
group by aa.question_id;

grant select on public.set_stats, public.question_stats to anon, authenticated;
