-- ---------------------------------------------------------------------------
-- The question sitemap's source: for a batch of sets, every published
-- question with the text its URL is made from, how much text it carries,
-- and the copy that represents it.
--
-- `text_blocks` are the question's prose blocks in order, each cut at 400
-- characters; the site picks the URL's words from them (skipping shared
-- stems like "Read the passage and answer the given subquestions") with the
-- same rule it applies on the page — src/lib/seo/question-text.ts.
--
-- `canonical_id` is the earliest published sitting of the same question
-- (by the rules fingerprint_shareable() applies), or the question itself.
-- Only canonical questions with real text are listed for search engines;
-- the page itself applies the same rules, so the two never disagree.
--
-- Called with a couple of dozen set ids at a time — five hundred questions
-- or so, well inside the anonymous statement timeout. Returns
-- nothing that is not already published and readable by anyone.
-- ---------------------------------------------------------------------------
drop function if exists public.public_question_index(uuid[]);

create function public.public_question_index(p_sets uuid[])
returns table (
  question_id   uuid,
  set_id        uuid,
  number        int,
  text_blocks   text[],
  substance     int,
  canonical_id  uuid
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select q.id, q.set_id, q.number, q.fingerprint, q.body
    from public.questions q
    join public.question_sets st   on st.id = q.set_id
    join public.question_papers qp on qp.id = st.paper_id
    where q.set_id = any(p_sets) and q.status = 'published' and qp.status = 'published'
  ),
  members as (
    select c.fingerprint, c.id, c.set_id, qp.session_date, st.set_code, c.number
    from public.questions c
    join (select distinct fingerprint from mine where fingerprint is not null) f on f.fingerprint = c.fingerprint
    join public.question_sets st   on st.id = c.set_id
    join public.question_papers qp on qp.id = st.paper_id and qp.status = 'published'
    where c.status = 'published'
  ),
  groups as (
    select m.fingerprint,
      (array_agg(m.id order by m.session_date nulls last, m.set_code, m.number))[1] as first_copy,
      coalesce(bool_or(o.decision = 'allow'), false) or not bool_or(exists (
        select 1 from public.questions b where b.fingerprint = m.fingerprint and b.set_id = m.set_id and b.id <> m.id
      )) as shareable
    from members m
    left join public.fingerprint_overrides o on o.fingerprint = m.fingerprint
    group by m.fingerprint
  )
  select q.id, q.set_id, q.number,
    coalesce((
      select array_agg(left(e->>'md', 400) order by i)
      from jsonb_array_elements(q.body) with ordinality as b(e, i)
      where e->>'type' = 'text' and e->>'md' is not null
    ), '{}'),
    coalesce((
      select sum(length(coalesce(case e->>'type' when 'text' then e->>'md' when 'code' then e->>'source' end, '')))::int
      from jsonb_array_elements(q.body) as b(e)
    ), 0),
    case when g.shareable then g.first_copy else q.id end
  from mine q
  left join groups g on g.fingerprint = q.fingerprint
  order by q.set_id, q.number;
$$;

revoke all on function public.public_question_index(uuid[]) from public;
grant execute on function public.public_question_index(uuid[]) to anon, authenticated;
