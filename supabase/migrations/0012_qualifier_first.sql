-- ---------------------------------------------------------------------------
-- Qualifier first
-- ---------------------------------------------------------------------------
-- The qualifier is how a student enters the programme, so it comes before the
-- term's exams everywhere exams are listed: Qualifier, Quiz 1, Quiz 2,
-- End Term, then the rest. It was sixth, after OPPE and Graded Assignment.
update public.exam_types set sort_order = 0 where slug = 'qualifier';
