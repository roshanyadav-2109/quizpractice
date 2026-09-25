-- =============================================================================
-- 0002_functions.sql — helpers, triggers, search and reporting views
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Role helpers used by every write policy
-- ---------------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'contributor')
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- New auth users get a profile automatically
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger question_papers_updated_at before update on public.question_papers
  for each row execute function public.set_updated_at();
create trigger questions_updated_at before update on public.questions
  for each row execute function public.set_updated_at();
create trigger solutions_updated_at before update on public.solutions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Full-text search over content blocks
--
-- Rather than teach the indexer about each of the nine block types, we walk the
-- jsonb and collect every string and number. That means table cells, code
-- bodies, LaTeX, ER entity names and image alt text all become searchable, and
-- adding a tenth block type later needs no change here.
-- ---------------------------------------------------------------------------
create or replace function public.jsonb_deep_text(doc jsonb)
returns text
language plpgsql
immutable
parallel safe
as $$
declare
  parts text := '';
  child jsonb;
  entry record;
begin
  if doc is null then
    return '';
  end if;

  case jsonb_typeof(doc)
    when 'string' then
      return doc #>> '{}';
    when 'number' then
      return doc #>> '{}';
    when 'array' then
      for child in select value from jsonb_array_elements(doc) loop
        parts := parts || ' ' || public.jsonb_deep_text(child);
      end loop;
      return parts;
    when 'object' then
      for entry in select key, value from jsonb_each(doc) loop
        -- Structural metadata, not content. Indexing these would make every
        -- question containing a table match a search for "table", and every
        -- Cloudinary public_id would pollute the index with path fragments.
        continue when entry.key in (
          'type', 'provider', 'public_id', 'version',
          'format', 'width', 'height', 'schema_version'
        );
        parts := parts || ' ' || public.jsonb_deep_text(entry.value);
      end loop;
      return parts;
    else
      return '';
  end case;
end;
$$;

create or replace function public.refresh_question_search(target uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.questions q
  set search_text =
        setweight(to_tsvector('english', public.jsonb_deep_text(q.body)), 'A')
     || setweight(to_tsvector('english', array_to_string(q.topics, ' ')), 'B')
     || setweight(
          to_tsvector('english', coalesce((
            select string_agg(public.jsonb_deep_text(o.content), ' ')
            from public.question_options o
            where o.question_id = q.id
          ), '')), 'C')
  where q.id = target;
$$;

create or replace function public.questions_search_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_question_search(new.id);
  return null;
end;
$$;

create trigger questions_refresh_search
  after insert or update of body, topics on public.questions
  for each row execute function public.questions_search_trigger();

create or replace function public.options_search_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_question_search(coalesce(new.question_id, old.question_id));
  return null;
end;
$$;

create trigger question_options_refresh_search
  after insert or update or delete on public.question_options
  for each row execute function public.options_search_trigger();

-- ---------------------------------------------------------------------------
-- search_questions — ranked search with enough context to render a result card
-- ---------------------------------------------------------------------------
create or replace function public.search_questions(
  q            text,
  subject      uuid default null,
  exam_type    uuid default null,
  max_results  int  default 40
)
returns table (
  question_id     uuid,
  set_id          uuid,
  question_number int,
  question_type   question_type,
  marks           numeric,
  body            jsonb,
  subject_name    text,
  subject_slug    text,
  exam_type_name  text,
  session_date    date,
  set_code        text,
  rank            real
)
language sql
stable
as $$
  select
    qu.id,
    qu.set_id,
    qu.number,
    qu.type,
    qu.marks,
    qu.body,
    s.name,
    s.slug,
    et.name,
    qp.session_date,
    qs.set_code,
    ts_rank(qu.search_text, websearch_to_tsquery('english', q)) as rank
  from public.questions qu
  join public.question_sets   qs on qs.id = qu.set_id
  join public.question_papers qp on qp.id = qs.paper_id
  join public.subjects        s  on s.id  = qp.subject_id
  join public.exam_types      et on et.id = qp.exam_type_id
  where qp.status = 'published'
    and qu.status = 'published'
    and qu.search_text @@ websearch_to_tsquery('english', q)
    and (subject   is null or qp.subject_id   = subject)
    and (exam_type is null or qp.exam_type_id = exam_type)
  order by rank desc, qp.session_date desc nulls last
  limit greatest(1, least(max_results, 100));
$$;

-- ---------------------------------------------------------------------------
-- Stats views — the home page and browse pages count live rather than
-- displaying a hand-edited number that goes stale.
-- security_invoker keeps RLS in force for whoever queries them.
-- ---------------------------------------------------------------------------
create view public.subject_stats
with (security_invoker = true) as
select
  s.id                                as subject_id,
  count(distinct qp.id)               as paper_count,
  count(distinct qs.id)               as set_count,
  count(qu.id)                        as question_count,
  count(qu.id) filter (where exists (
    select 1 from public.solutions sol
    where sol.question_id = qu.id and sol.video_url is not null
      and sol.status = 'approved'
  ))                                  as video_solution_count,
  max(qp.session_date)                as latest_session
from public.subjects s
left join public.question_papers qp on qp.subject_id = s.id and qp.status = 'published'
left join public.question_sets   qs on qs.paper_id = qp.id
left join public.questions       qu on qu.set_id = qs.id and qu.status = 'published'
group by s.id;

create view public.program_stats
with (security_invoker = true) as
select
  p.id                       as program_id,
  count(distinct s.id)       as subject_count,
  coalesce(sum(ss.paper_count), 0)    as paper_count,
  coalesce(sum(ss.question_count), 0) as question_count
from public.programs p
left join public.levels       l  on l.program_id = p.id
left join public.subjects     s  on s.level_id = l.id and s.is_active
left join public.subject_stats ss on ss.subject_id = s.id
group by p.id;

-- ---------------------------------------------------------------------------
-- orphan_media — Cloudinary assets no longer referenced by any content.
-- Used by scripts/cleanup-media.ts; deliberately a view, never an auto-delete.
-- ---------------------------------------------------------------------------
create view public.orphan_media
with (security_invoker = true) as
select m.*
from public.media_assets m
where m.kind <> 'share_card'
  and not exists (
    select 1 from public.questions q
    where q.body::text like '%' || m.public_id || '%'
  )
  and not exists (
    select 1 from public.question_options o
    where o.content::text like '%' || m.public_id || '%'
  )
  and not exists (
    select 1 from public.solutions s
    where s.body::text like '%' || m.public_id || '%'
  )
  and not exists (
    select 1 from public.extractions e
    where e.source_public_id = m.public_id
  );
