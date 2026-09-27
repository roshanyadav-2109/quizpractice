-- ---------------------------------------------------------------------------
-- Questions, options and explanations off the public key.
--
-- Until now any visitor could read every published question, its options
-- and which option is correct straight from the database, with the anon key
-- every browser is given: a thousand questions a request, the whole bank in
-- a few minutes. Nothing the site shows needs that. The pages are rendered
-- on the server, which reads the questions with its own key; a student sees
-- the full paper only after signing in, through the server, which records
-- each paper opened (0034).
--
-- So the tables now answer only staff, and teachers inside their combos, as
-- before. Students — anon or signed in — read nothing from them directly.
-- The functions that return question text or explanations are the server's
-- alone.
--
-- APPLY ONLY AFTER the site that reads through the server's key is live:
-- the previous release reads these with the anon key and would show every
-- paper as empty.
-- ---------------------------------------------------------------------------

drop policy if exists questions_read on public.questions;
create policy questions_read on public.questions
  for select using (
    (select public.is_staff())
    or ((select public.is_teacher()) and public.can_teach_question(id))
  );

drop policy if exists options_read on public.question_options;
create policy options_read on public.question_options
  for select using (
    (select public.is_staff())
    or ((select public.is_teacher()) and public.can_teach_question(question_id))
  );

-- An author still reads their own work; everything approved reaches students
-- through the server.
drop policy if exists solutions_read on public.solutions;
create policy solutions_read on public.solutions
  for select using (
    author_id = (select auth.uid())
    or (select public.is_staff())
    or ((select public.is_teacher()) and question_id is not null and public.can_teach_question(question_id))
  );

revoke select on public.questions from anon;
revoke select on public.question_options from anon;
revoke select on public.solutions from anon;

revoke all on function public.solutions_for_question(uuid) from public, anon, authenticated;
revoke all on function public.public_question_index(uuid[]) from public, anon, authenticated;
revoke all on function public.public_question_copies(uuid) from public, anon, authenticated;
revoke all on function public.search_questions(text, uuid, uuid, int) from public, anon, authenticated;
revoke all on function public.public_video_solutions() from public, anon, authenticated;

-- 0034's functions answer anon with "no", but Supabase grants anon every new
-- function by default: close them explicitly, as the allowlist expects.
revoke all on function public.open_set(uuid) from anon;
revoke all on function public.may_read_question(uuid) from anon;

grant execute on function public.solutions_for_question(uuid) to service_role;
grant execute on function public.public_question_index(uuid[]) to service_role;
grant execute on function public.public_question_copies(uuid) to service_role;
grant execute on function public.search_questions(text, uuid, uuid, int) to service_role;
grant execute on function public.public_video_solutions() to service_role;
