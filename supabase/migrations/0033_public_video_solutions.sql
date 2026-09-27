-- ---------------------------------------------------------------------------
-- Every published question that has a video solution.
--
-- A teacher's video is written once and shown on every copy of the same
-- question (the fingerprint rules of 0025), so this lists each question it
-- plays on, not just the one it was recorded against. The public pages use
-- it to badge questions on a paper, to list a subject's video solutions,
-- and for the video sitemap.
--
-- Anon may call it: it returns ids, numbers, the video's address and dates
-- for approved explanations on published questions — all already public on
-- the question pages themselves. One row per question: its earliest
-- approved video.
-- ---------------------------------------------------------------------------
create or replace function public.public_video_solutions()
returns table (
  question_id   uuid,
  set_id        uuid,
  number        int,
  solution_id   uuid,
  video_url     text,
  created_at    timestamptz,
  updated_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with videos as (
    select s.id, s.question_id, s.fingerprint, s.video_url, s.created_at, s.updated_at
    from public.solutions s
    where s.status = 'approved' and s.video_url is not null
  ),
  reach as (
    select q.id as question_id, q.set_id, q.number, v.id as solution_id, v.video_url, v.created_at, v.updated_at
    from videos v
    join public.questions q
      on q.id = v.question_id
      or (v.fingerprint is not null and q.fingerprint = v.fingerprint and public.fingerprint_shareable(q.fingerprint))
    join public.question_sets st   on st.id = q.set_id
    join public.question_papers qp on qp.id = st.paper_id
    where q.status = 'published' and qp.status = 'published'
  )
  select distinct on (question_id) question_id, set_id, number, solution_id, video_url, created_at, updated_at
  from reach
  order by question_id, created_at;
$$;

revoke all on function public.public_video_solutions() from public;
grant execute on function public.public_video_solutions() to anon, authenticated;
