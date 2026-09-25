-- ---------------------------------------------------------------------------
-- Qualifier papers filed under the wrong exam
-- ---------------------------------------------------------------------------
-- Three papers from the old bank say "QUALIFIER EXAM" in their own titles but
-- were imported as a Quiz 1 or an End Term, so the site never showed a
-- Qualifier at all:
--
--   Computational Thinking   29 Oct 2023   was Quiz 1
--   Programming in Python     7 Aug 2022   was End Term
--   Programming in Python    24 Dec 2023   was End Term
--
-- They are moved to the Qualifier exam type. Nothing else about them changes.
-- To undo, set each back to the exam type listed above.
update public.question_papers
set exam_type_id = (select id from public.exam_types where slug = 'qualifier'),
    updated_at   = now()
where title ilike '%qualifier%'
  and exam_type_id is distinct from (select id from public.exam_types where slug = 'qualifier');
