-- =============================================================================
-- 0009_catalogue_counts.sql — question and paper counts, fast
--
-- The catalogue shows a paper count and a question count on every subject and
-- every paper. subject_stats can answer that, but it is a security_invoker view:
-- RLS is evaluated per row across ~10k questions, plus a correlated lookup into
-- solutions for each one, and it costs over a second per request.
--
-- This returns one row per published set — a couple of hundred rows — with the
-- paper and subject it belongs to and how many published questions it holds.
-- Everything the catalogue needs (per set, per paper, per subject) is a sum
-- over these rows.
--
-- SECURITY DEFINER so the counting happens once in a plain grouped join rather
-- than once per row under RLS. It only ever exposes counts of content that is
-- already published and already readable by anyone — no row, draft or answer.
-- =============================================================================

create or replace function public.published_set_counts()
returns table (
  set_id         uuid,
  paper_id       uuid,
  subject_id     uuid,
  question_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    p.id,
    p.subject_id,
    count(q.id)::int
  from public.question_sets s
  join public.question_papers p
    on p.id = s.paper_id
   and p.status = 'published'
  left join public.questions q
    on q.set_id = s.id
   and q.status = 'published'
  group by s.id, p.id, p.subject_id
$$;

revoke all on function public.published_set_counts() from public;
grant execute on function public.published_set_counts() to anon, authenticated;
