-- =============================================================================
-- 0039_management_english_1.sql — English I for the Management branch
--
-- The Management Foundation term's English I paper is a joint sitting with
-- Data Science and Electronic Systems ("BS in Data Science/ Management/
-- Electronic Systems" printed on the official answer key), the same way the
-- Electronic Systems/Aeronautics Foundation papers are shared (0038). This
-- gives Management its own subject row for the same course.
--
-- Safe to re-run: on conflict do nothing.
-- =============================================================================

insert into public.subjects (level_id, slug, name, code, aliases, has_programming, sort_order)
select l.id, v.slug, v.name, v.code, v.aliases, v.has_programming, v.sort_order
from (values
  ('mds','foundation','mds-english-1','English I',null::text,
     array['English1', 'Eng 1'], false, 5::int)
) as v(program_slug, level_slug, slug, name, code, aliases, has_programming, sort_order)
join public.programs p on p.slug = v.program_slug
join public.levels l on l.program_id = p.id and l.slug = v.level_slug
on conflict (slug) do nothing;
