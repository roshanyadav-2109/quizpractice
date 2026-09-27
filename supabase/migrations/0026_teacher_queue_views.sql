-- =============================================================================
-- 0026_teacher_queue_views.sql — the queue by exam, term and order
--
-- teacher_queue() gains p_papers (only these papers: the app turns the exam,
-- year and term filters into the list of matching papers, so the term rules
-- live in one place, src/lib/terms.ts) and p_sort: newest papers first (the
-- default), oldest first, or most repeated first — the questions whose one
-- explanation reaches the most papers.
--
-- teacher_exam_progress(): a subject's progress per exam, counted in groups
-- of copies like the rest of the desk. A group repeated across exams counts
-- once under each exam it appears in.
-- =============================================================================

drop function if exists public.teacher_queue(uuid, text, uuid, int, int);

create function public.teacher_queue(
  p_subject uuid,
  p_filter  text default 'todo',
  p_paper   uuid default null,
  p_limit   int  default 50,
  p_offset  int  default 0,
  p_papers  uuid[] default null,
  p_sort    text default 'newest'
)
returns table (
  question_id      uuid,
  paper_id         uuid,
  set_id           uuid,
  set_code         text,
  number           int,
  qtype            public.question_type,
  marks            numeric,
  snippet          text,
  has_image        boolean,
  session_date     date,
  exam_name        text,
  group_key        text,
  copies           int,
  other_subjects   text[],
  order_varies     boolean,
  solution_id      uuid,
  solution_status  public.moderation_status,
  submitted        boolean,
  has_text         boolean,
  has_video        boolean,
  author_name      text,
  is_mine          boolean,
  claimed_by       text,
  claim_expires_at timestamptz,
  total            bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not (public.is_staff() or public.can_teach_subject(p_subject)) then
    raise exception 'You are not assigned to this subject.' using errcode = '42501';
  end if;
  if coalesce(p_filter, '') not in ('todo', 'no_video', 'review', 'done', 'mine', 'all') then
    raise exception 'Unknown filter.' using errcode = '22023';
  end if;
  if coalesce(p_sort, '') not in ('newest', 'oldest', 'copies') then
    raise exception 'Unknown sort.' using errcode = '22023';
  end if;

  -- Each group's reach, deciding explanation and "is it mine" are indexed
  -- lookups per representative row, so the cost grows with the subject's
  -- size and never with a join the planner has to guess at.
  return query
  with g as (
    select * from public._subject_groups(p_subject)
  ),
  -- The newest copy stands for the group — the oldest when sorting oldest
  -- first — within the chosen papers, if any.
  reps as (
    select distinct on (g.gk)
           g.gk, q.id, st.paper_id, q.set_id, st.set_code, q.number, q.type, q.marks, q.body,
           qp.session_date, et.name as exam_name
    from g
    join public.questions q        on q.id = g.question_id
    join public.question_sets st   on st.id = q.set_id
    join public.question_papers qp on qp.id = st.paper_id
    join public.exam_types et      on et.id = qp.exam_type_id
    where (p_paper is null or qp.id = p_paper)
      and (p_papers is null or qp.id = any(p_papers))
    order by g.gk,
             case when p_sort = 'oldest' then qp.session_date end asc nulls last,
             qp.session_date desc nulls last, st.set_code, q.number
  ),
  state as (
    select r.*,
           greatest(x.copies, 1) as copies, x.other_subjects, x.order_varies,
           s.id as solution_id, s.status as solution_status, s.submitted, s.has_text, s.has_video,
           s.author_id as solution_author, m.mine is not null as mine
    from reps r
    -- Every published copy, in any subject or branch.
    left join lateral (
      select count(*)::int as copies,
             array_agg(distinct sb.name) filter (where qp2.subject_id <> p_subject) as other_subjects,
             count(distinct q2.option_order) > 1 as order_varies
      from public.questions q2
      join public.question_sets st2   on st2.id = q2.set_id
      join public.question_papers qp2 on qp2.id = st2.paper_id and qp2.status = 'published'
      join public.subjects sb         on sb.id = qp2.subject_id
      where r.gk not like 'q:%' and q2.fingerprint = r.gk and q2.status = 'published'
    ) x on true
    -- The explanation that decides the group's state: live first, then with video, then newest.
    left join lateral (
      select s.id, s.status, s.submitted_at is not null as submitted,
             jsonb_array_length(s.body) > 0 as has_text, s.video_url is not null as has_video, s.author_id
      from public.solutions s
      where ((r.gk like 'q:%' and s.question_id = r.id) or (r.gk not like 'q:%' and s.fingerprint = r.gk))
        and s.kind in ('official', 'authored') and s.status <> 'rejected'
      order by (s.status = 'approved') desc, (s.video_url is not null) desc, s.updated_at desc
      limit 1
    ) s on true
    left join lateral (
      select true as mine
      from public.solutions s2
      where ((r.gk like 'q:%' and s2.question_id = r.id) or (r.gk not like 'q:%' and s2.fingerprint = r.gk))
        and s2.author_id = auth.uid()
      limit 1
    ) m on true
  ),
  page as (
    select st.*, count(*) over () as total
    from state st
    where case p_filter
            when 'todo'     then st.solution_id is null
            when 'no_video' then st.solution_id is not null and not st.has_video
            when 'review'   then st.solution_status = 'pending' and st.submitted
            when 'done'     then st.solution_status = 'approved'
            when 'mine'     then st.mine
            else true
          end
    order by case when p_sort = 'copies' then st.copies end desc nulls last,
             case when p_sort = 'oldest' then st.session_date end asc nulls last,
             st.session_date desc nulls last, st.paper_id, st.set_code, st.number
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  -- Snippets and names only for the page actually returned.
  select p.id, p.paper_id, p.set_id, p.set_code, p.number, p.type, p.marks,
         left(btrim(regexp_replace(public.jsonb_deep_text(p.body), '\s+', ' ', 'g')), 220),
         p.body @? '$[*] ? (@.type == "image")',
         p.session_date, p.exam_name, p.gk, p.copies, p.other_subjects, coalesce(p.order_varies, false),
         p.solution_id, p.solution_status, coalesce(p.submitted, false), coalesce(p.has_text, false),
         coalesce(p.has_video, false), pa.display_name, p.mine, pc.display_name, c.expires_at,
         p.total
  from page p
  left join public.profiles pa on pa.id = p.solution_author
  left join public.explanation_claims c on c.group_key = p.gk and c.expires_at > now()
  left join public.profiles pc on pc.id = c.teacher_id
  order by case when p_sort = 'copies' then p.copies end desc nulls last,
           case when p_sort = 'oldest' then p.session_date end asc nulls last,
           p.session_date desc nulls last, p.paper_id, p.set_code, p.number;
end;
$$;

create or replace function public.teacher_exam_progress(p_subject uuid)
returns table (
  exam_slug  text,
  exam_name  text,
  sort_order int,
  groups     bigint,
  explained  bigint,
  with_video bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not (public.is_staff() or public.can_teach_subject(p_subject)) then
    raise exception 'You are not assigned to this subject.' using errcode = '42501';
  end if;

  return query
  with g as (
    select * from public._subject_groups(p_subject)
  ),
  ge as (
    select distinct g.gk, et.slug, et.name, et.sort_order
    from g
    join public.questions q        on q.id = g.question_id
    join public.question_sets st   on st.id = q.set_id
    join public.question_papers qp on qp.id = st.paper_id
    join public.exam_types et      on et.id = qp.exam_type_id
  ),
  live as (
    select ge.*, s.has_video
    from ge
    left join lateral (
      select s.video_url is not null as has_video
      from public.solutions s
      where ((ge.gk like 'q:%' and s.question_id = substring(ge.gk from 3)::uuid)
          or (ge.gk not like 'q:%' and s.fingerprint = ge.gk))
        and s.kind in ('official', 'authored') and s.status = 'approved'
      order by (s.video_url is not null) desc
      limit 1
    ) s on true
  )
  select live.slug, live.name, live.sort_order,
         count(*), count(*) filter (where live.has_video is not null), count(*) filter (where live.has_video)
  from live
  group by live.slug, live.name, live.sort_order
  order by live.sort_order;
end;
$$;

revoke execute on function
  public.teacher_queue(uuid, text, uuid, int, int, uuid[], text),
  public.teacher_exam_progress(uuid)
from public, anon, authenticated;

grant execute on function
  public.teacher_queue(uuid, text, uuid, int, int, uuid[], text),
  public.teacher_exam_progress(uuid)
to authenticated;
