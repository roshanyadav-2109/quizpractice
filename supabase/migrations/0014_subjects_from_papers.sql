-- ---------------------------------------------------------------------------
-- Courses found in the official answer-key papers
-- ---------------------------------------------------------------------------
-- Importing the answer-key PDFs turned up five courses with papers but no
-- subject on the site. They sit with the courses they are examined beside:
-- the four Data Science ones in the BSc degree level's papers, and the
-- Electronic Systems C course at Foundation. The names are the papers' own.
insert into public.subjects (level_id, slug, name, code, aliases, has_programming, sort_order)
select l.id, v.slug, v.name, v.code, v.aliases, v.has_programming, v.sort_order
from (values
  ('ds', 'bsc', 'ads', 'Algorithms for Data Science', null::text,
     array['ADS'], true, 90::int),
  ('ds', 'bsc', 'design-thinking', 'Design Thinking for Data-Driven App Development', null,
     array['Design Thinking'], false, 91),
  ('ds', 'bsc', 'intro-big-data', 'Introduction to Big Data', null,
     array['Intro to Big Data', 'Intro to BigData'], true, 92),
  ('ds', 'bsc', 'ds-ai-lab', 'Data Science and AI Lab', null,
     array['DS AI Lab'], true, 93),
  ('es', 'foundation', 'es-c-programming', 'Introduction to C Programming', null,
     array['Intro to C Programming', 'C Programming'], true, 90)
) as v(program_slug, level_slug, slug, name, code, aliases, has_programming, sort_order)
join public.programs p on p.slug = v.program_slug
join public.levels   l on l.program_id = p.id and l.slug = v.level_slug
on conflict (slug) do nothing;
