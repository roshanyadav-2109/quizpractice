-- Progress paper by paper, for the teaching desk.
--
-- The desk counts a teacher's work in papers rather than questions: "12 papers
-- done, 40 left" is a goal a teacher can see the end of, where "983 questions
-- left" is not. A set (one paper as sat) is done when every question in it
-- belongs to a group with a published explanation. A group repeated across
-- sets counts towards each of them, as a student sees it on each paper.
--
-- Built exactly as teacher_exam_progress is, one level finer: the same groups,
-- the same test for "published", the same gate.

create or replace function public.teacher_set_progress(p_subject uuid)
returns table (
  set_id       uuid,
  paper_id     uuid,
  exam_slug    text,
  exam_name    text,
  sort_order   int,
  session_date date,
  set_code     text,
  groups       bigint,
  explained    bigint,
  with_video   bigint
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
  gs as (
    select distinct g.gk, st.id as set_id, qp.id as paper_id, et.slug, et.name, et.sort_order, qp.session_date, st.set_code
    from g
    join public.questions q        on q.id = g.question_id
    join public.question_sets st   on st.id = q.set_id
    join public.question_papers qp on qp.id = st.paper_id
    join public.exam_types et      on et.id = qp.exam_type_id
  ),
  live as (
    select gs.*, s.has_video
    from gs
    left join lateral (
      select s.video_url is not null as has_video
      from public.solutions s
      where ((gs.gk like 'q:%' and s.question_id = substring(gs.gk from 3)::uuid)
          or (gs.gk not like 'q:%' and s.fingerprint = gs.gk))
        and s.kind in ('official', 'authored') and s.status = 'approved'
      order by (s.video_url is not null) desc
      limit 1
    ) s on true
  )
  select live.set_id, live.paper_id, live.slug, live.name, live.sort_order, live.session_date, live.set_code,
         count(*), count(*) filter (where live.has_video is not null), count(*) filter (where live.has_video)
  from live
  group by live.set_id, live.paper_id, live.slug, live.name, live.sort_order, live.session_date, live.set_code
  order by live.sort_order, live.session_date desc, live.set_code;
end;
$$;

revoke execute on function public.teacher_set_progress(uuid) from public, anon, authenticated;
grant execute on function public.teacher_set_progress(uuid) to authenticated;
