-- ---------------------------------------------------------------------------
-- Diploma Entry Qualifier
-- ---------------------------------------------------------------------------
-- 0011 moved every paper titled "QUALIFIER" to the Qualifier. Two of them are
-- the DAD qualifier, the exam for direct admission to the diploma, which tests
-- Python; the regular Qualifier covers only Foundation subjects:
--
--   Programming in Python     7 Aug 2022   IIT M DAD DS QUALIFIER EXAM QPC
--   Programming in Python    24 Dec 2023   IIT M DAD DS QUALIFIER AN EXAM ADS1
--
-- They get an exam type of their own. It takes sort order 6, the slot the
-- Qualifier left in 0012, after Graded Assignment and before Project.
insert into public.exam_types (slug, name, description, default_duration_minutes, sort_order) values
  ('diploma-qualifier', 'Diploma Entry Qualifier',
   'Qualifier for direct admission to the diploma level.', 180, 6)
on conflict (slug) do nothing;

update public.question_papers
set exam_type_id = (select id from public.exam_types where slug = 'diploma-qualifier'),
    updated_at   = now()
where title ilike '%DAD%QUALIFIER%'
  and exam_type_id is distinct from (select id from public.exam_types where slug = 'diploma-qualifier');
