-- =============================================================================
-- 0006_peer_stats.sql — fix the aggregates so they actually aggregate
--
-- 0005 shipped set_stats and question_stats as views with security_invoker.
-- Under RLS that means each caller only ever sees their own attempt rows, so
-- "the average across everyone" was really "the average across you" — the one
-- thing the view existed to avoid.
--
-- The fix is a SECURITY DEFINER function per aggregate. It reads every attempt,
-- but can only ever return counts and averages: no individual row, user id or
-- score belonging to another student can leave here. A minimum sample size
-- keeps a single other attempt from being reverse-engineered, and keeps us from
-- showing a "class average" computed from one person.
-- =============================================================================

drop view if exists public.set_stats;
drop view if exists public.question_stats;

create or replace function public.set_peer_stats(target_set uuid)
returns table (
  attempt_count        bigint,
  avg_percentage       numeric,
  median_percentage    numeric,
  avg_duration_seconds numeric,
  your_rank            bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with submitted as (
    select
      a.user_id,
      a.score / nullif(a.max_score, 0) as ratio,
      a.duration_seconds
    from public.attempts a
    where a.set_id = target_set
      and a.submitted_at is not null
      and a.max_score > 0
  ),
  -- One row per student: repeated practice should not let anyone stack the
  -- sample, and their best attempt is the fair thing to rank.
  best as (
    select user_id, max(ratio) as ratio, min(duration_seconds) as duration_seconds
    from submitted
    group by user_id
  )
  select
    count(*),
    round(avg(ratio) * 100, 1),
    round(percentile_cont(0.5) within group (order by ratio)::numeric * 100, 1),
    round(avg(duration_seconds)),
    (
      select count(*) + 1
      from best faster
      where faster.ratio > (select ratio from best where user_id = auth.uid())
    )
  from best
  -- Below this, an "average" is noise and a rank is a privacy leak.
  having count(*) >= 3;
$$;

create or replace function public.question_peer_stats(target_set uuid)
returns table (
  question_id        uuid,
  marked_count       bigint,
  correct_percentage numeric,
  avg_time_seconds   numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    aa.question_id,
    count(*) filter (where aa.is_correct is not null),
    round(
      100.0 * count(*) filter (where aa.is_correct)
      / nullif(count(*) filter (where aa.is_correct is not null), 0)
    , 0),
    round(avg(aa.time_spent_seconds))
  from public.attempt_answers aa
  join public.attempts a on a.id = aa.attempt_id
  join public.questions q on q.id = aa.question_id
  where q.set_id = target_set
    and a.submitted_at is not null
  group by aa.question_id
  having count(*) filter (where aa.is_correct is not null) >= 3;
$$;

revoke all on function public.set_peer_stats(uuid) from public;
revoke all on function public.question_peer_stats(uuid) from public;
grant execute on function public.set_peer_stats(uuid) to authenticated;
grant execute on function public.question_peer_stats(uuid) to authenticated;
