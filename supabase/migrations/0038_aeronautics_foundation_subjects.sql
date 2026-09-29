-- =============================================================================
-- 0038_aeronautics_foundation_subjects.sql — Aeronautics branch, Foundation level
--
-- The ast (Aeronautics) program and its foundation level already existed with
-- no subjects. Its Foundation term is sat jointly with Electronic Systems —
-- the official answer-key PDFs say so directly ("BS in Electronic Systems/
-- Aeronautics") — so these mirror the es-* subjects that cover the same
-- courses, the same way es-english-1 mirrors english-1 for Data Science.
--
-- Safe to re-run: on conflict do nothing.
-- =============================================================================

insert into public.subjects (level_id, slug, name, code, aliases, has_programming, sort_order)
select l.id, v.slug, v.name, v.code, v.aliases, v.has_programming, v.sort_order
from (values
  ('ast','foundation','ast-english-1','English I',null::text,
     array['English1', 'Eng 1'], false, 1::int),
  ('ast','foundation','ast-estc','Electronic Systems Thinking and Circuits',null,
     array['ESTC'], false, 2),
  ('ast','foundation','ast-math-1','Mathematics for Electronics I',null,
     array['Math for Electronics I', 'Maths for Electronics I'], false, 3),
  ('ast','foundation','ast-c-programming','Introduction to C Programming',null,
     array['Intro C programming', 'Intro to C Programming'], true, 4)
) as v(program_slug, level_slug, slug, name, code, aliases, has_programming, sort_order)
join public.programs p on p.slug = v.program_slug
join public.levels l on l.program_id = p.id and l.slug = v.level_slug
on conflict (slug) do nothing;
