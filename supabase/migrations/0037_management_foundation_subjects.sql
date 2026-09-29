-- =============================================================================
-- 0037_management_foundation_subjects.sql — Management branch, Foundation level
--
-- The mds (Management) program and its foundation level already existed with
-- no subjects (0004_seed_taxonomy.sql). These four are the ones found in the
-- official answer-key PDFs for that branch's Foundation term.
--
-- Safe to re-run: on conflict do nothing.
-- =============================================================================

insert into public.subjects (level_id, slug, name, code, aliases, has_programming, sort_order)
select l.id, v.slug, v.name, v.code, v.aliases, v.has_programming, v.sort_order
from (values
  ('mds','foundation','business-statistics','Business Statistics',null::text,
     array['Business Statistics'], false, 1::int),
  ('mds','foundation','financial-accounting','Financial Accounting',null,
     array['Financial Accounting'], false, 2),
  ('mds','foundation','management-thought-practice','Management Thought and Practice',null,
     array['Management Thought and Practice', 'MTP'], false, 3),
  ('mds','foundation','principles-of-economics','Principles of Economics',null,
     array['Principles of Economics'], false, 4)
) as v(program_slug, level_slug, slug, name, code, aliases, has_programming, sort_order)
join public.programs p on p.slug = v.program_slug
join public.levels l on l.program_id = p.id and l.slug = v.level_slug
on conflict (slug) do nothing;
