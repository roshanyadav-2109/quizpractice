-- ---------------------------------------------------------------------------
-- The same question in other papers, for the public paper and question pages.
--
-- A question that IIT Madras repeats — same stem, same options — lives once
-- per paper it appeared in. The public pages say where else it appeared
-- ("Also asked in Quiz 1, May 2024") and point search engines at a single
-- canonical copy, the earliest sitting, rather than letting a dozen
-- identical pages compete with each other.
--
-- Anon may call it: it returns only ids, numbers and dates of content that is
-- already published and readable by anyone. The grouping follows
-- fingerprint_shareable() exactly, so a copy is only ever a copy where the
-- teaching tools already treat it as one.
-- ---------------------------------------------------------------------------
create or replace function public.public_question_copies(p_set uuid)
returns table (
  question_id        uuid,
  copy_question_id   uuid,
  copy_set_id        uuid,
  copy_number        int,
  copy_session_date  date
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select q.id, q.fingerprint
    from public.questions q
    join public.question_sets st   on st.id = q.set_id
    join public.question_papers qp on qp.id = st.paper_id
    where q.set_id = p_set
      and q.status = 'published'
      and qp.status = 'published'
      and q.fingerprint is not null
      and public.fingerprint_shareable(q.fingerprint)
  ),
  copies as (
    select m.id as question_id, c.id, c.set_id, c.number, cp.session_date,
           row_number() over (partition by m.id order by cp.session_date nulls last, cs.set_code, c.number) as n
    from mine m
    join public.questions c        on c.fingerprint = m.fingerprint and c.id <> m.id and c.status = 'published'
    join public.question_sets cs   on cs.id = c.set_id
    join public.question_papers cp on cp.id = cs.paper_id and cp.status = 'published'
  )
  select question_id, id, set_id, number, session_date
  from copies
  where n <= 40
  order by question_id, n;
$$;

revoke all on function public.public_question_copies(uuid) from public;
grant execute on function public.public_question_copies(uuid) to anon, authenticated;
