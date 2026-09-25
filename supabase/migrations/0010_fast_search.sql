-- ---------------------------------------------------------------------------
-- search_questions, without paying for row-level security row by row
-- ---------------------------------------------------------------------------
-- Run as the caller, the search evaluated the RLS policies of four joined
-- tables for every candidate row: about 1.2 s a search, against 0.3 s for the
-- identical query without them.
--
-- It only ever returns published questions from published papers — content
-- every visitor can already read — and it says so in its own WHERE clause, so
-- it can run as its owner and skip the per-row checks. The search path is
-- pinned, as it must be for any SECURITY DEFINER function.
--
-- Same signature, same columns, same results.
create or replace function public.search_questions(
  q            text,
  subject      uuid default null,
  exam_type    uuid default null,
  max_results  int  default 40
)
returns table (
  question_id     uuid,
  set_id          uuid,
  question_number int,
  question_type   question_type,
  marks           numeric,
  body            jsonb,
  subject_name    text,
  subject_slug    text,
  exam_type_name  text,
  session_date    date,
  set_code        text,
  rank            real
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    qu.id,
    qu.set_id,
    qu.number,
    qu.type,
    qu.marks,
    qu.body,
    s.name,
    s.slug,
    et.name,
    qp.session_date,
    qs.set_code,
    ts_rank(qu.search_text, websearch_to_tsquery('english', q)) as rank
  from public.questions qu
  join public.question_sets   qs on qs.id = qu.set_id
  join public.question_papers qp on qp.id = qs.paper_id
  join public.subjects        s  on s.id  = qp.subject_id
  join public.exam_types      et on et.id = qp.exam_type_id
  where qp.status = 'published'
    and qu.status = 'published'
    and qu.search_text @@ websearch_to_tsquery('english', q)
    and (subject   is null or qp.subject_id   = subject)
    and (exam_type is null or qp.exam_type_id = exam_type)
  order by rank desc, qp.session_date desc nulls last
  limit greatest(1, least(max_results, 100));
$$;

grant execute on function public.search_questions(text, uuid, uuid, int) to anon, authenticated;
