-- =============================================================================
-- 0025_question_fingerprints.sql — one explanation for every copy of a question
--
-- The same question turns up in several sets, sittings, years and even
-- branches. Each question carries a fingerprint of what it asks and what its
-- answer is. An explanation stays anchored on the question its teacher wrote it
-- for, copies its anchor's fingerprint, and shows on every published question
-- with that fingerprint. Copies are linked, never duplicated, so one fix shows
-- everywhere at once.
--
-- What makes two questions "the same" (normaliser v1):
--
--   * The body, after formatting clean-up (fp_text): case, emphasis, quote
--     marks, prose punctuation, blank styles and spacing around symbols do
--     not count. Code keeps its case and indentation (fp_code); an equation
--     drops only its spaces; a figure is its image and crop, not its alt text.
--   * The options, as a set: order does not count, and the correct ones are
--     compared by content, never by letter — unless an option points at other
--     options ("Both A and B", "None of the above", "(a) and (c)", "Neither"),
--     in which case the order is part of the question and has to match too.
--     When the clean-up makes two options of one question equal, it could
--     no longer tell which is correct, so that question's options are
--     compared strictly.
--   * The answer: numbers compare by value (2.50 = 2.5), text like the body.
--
-- Never linked (fingerprint NULL): the exam's own boilerplate, placeholders,
-- a question with no known answer, and a question that leans on another one
-- ("the algorithm in the previous question"), whose copies may follow a
-- different question.
--
-- Beside the fingerprint each question stores a strict hash (case, quotes and
-- punctuation count) so admins can review groups joined only by the clean-up,
-- and a hash of its options in the order this copy shows them, so a group
-- knows whether its copies order their options differently — and a teacher
-- recording for it names options by content, not by letter.
--
-- Two copies inside one set are almost always an import error, so such a
-- fingerprint is not shared until an admin allows it (fingerprint_overrides).
--
-- Fingerprints are kept current by triggers. Existing rows are filled by
-- `npx tsx scripts/backfill-fingerprints.ts` after this is pushed, not here.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Normalisers. Pure functions of their input; nothing here reads a table.
-- ---------------------------------------------------------------------------

-- Prose, compared loosely. Markdown line breaks and escapes go, typographic
-- quotes and dashes become plain ones, then:
--   emphasis and quote marks go;
--   any blank (____ or ....) is one blank, and a trailing one is dropped;
--   prose punctuation goes, but not inside numbers (2.5, 40,000), and "!"
--   only before a space or the end, so "a != b", "!done" and "n!)" keep it;
--   no spaces around symbols, so "k -nn" = "k-nn" and "40 )" = "40)";
--   runs of whitespace are one space.
create or replace function public.fp_text(t text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    translate(lower(replace(replace(coalesce(t, ''), chr(92) || chr(10), ' '), chr(92), '')),
              chr(8216) || chr(8217) || chr(8220) || chr(8221) || chr(160) || chr(8211) || chr(8212) || chr(8722) || chr(8230),
              '''''""' || ' ---.'),
    '[*"`'']+', ' ', 'g'),
    '_{2,}|[.]{3,}', ' _ ', 'g'),
    '(^|[^0-9])[.,:;?]+|[.,:;?]+([^0-9]|$)', '\1 \2', 'g'),
    '!+(\s|$)', ' \1', 'g'),
    '(\s_)+\s*$', '', 'g'),
    '\s*([^a-z0-9\s_])\s*', '\1', 'g'),
    '\s+', ' ', 'g'));
$$;

-- Prose, compared strictly: only line breaks, escapes, typographic quotes and
-- spacing are evened out. Case, emphasis and punctuation count.
create or replace function public.fp_plain(t text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(
    translate(replace(replace(coalesce(t, ''), chr(92) || chr(10), ' '), chr(92), ''),
              chr(8216) || chr(8217) || chr(8220) || chr(8221) || chr(160),
              '''''""' || ' '),
    '\s+', ' ', 'g'));
$$;

-- Code keeps its case, quotes and indentation. Carriage returns, the PDF
-- line-wrap arrow, trailing spaces, runs of spaces inside a line and blank
-- lines do not count.
create or replace function public.fp_code(t text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(regexp_replace(regexp_replace(
    replace(replace(coalesce(t, ''), chr(13), ''), chr(8618), ''),
    '[ \t]+(\n|$)', '\1', 'g'),
    '([^ \t\n])[ \t]+', '\1 ', 'g'),
    '\n{2,}', chr(10), 'g'), ' ' || chr(10) || chr(9));
$$;

-- A block array as one comparable string. Text goes through fp_text (or
-- fp_plain when strict), code through fp_code, an equation loses its spaces,
-- a figure is its image and crop. Anything else is its JSON without the
-- fallback picture.
create or replace function public.fp_blocks(blocks jsonb, strict boolean default false)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(string_agg(r, ' ' order by ord), '')
  from (
    select e.ord, nullif(case e.b->>'type'
      when 'text' then case when strict then public.fp_plain(e.b->>'md') else public.fp_text(e.b->>'md') end
      when 'code' then '{code}' || public.fp_code(e.b->>'source')
      when 'math' then '{math}' || regexp_replace(coalesce(e.b->>'latex', ''), '\s+', '', 'g')
      when 'image' then '{img:' || coalesce(e.b->'image'->>'public_id', '')
        || coalesce('@' || (e.b->'image'->'region'->>'x') || ',' || (e.b->'image'->'region'->>'y')
                    || ',' || (e.b->'image'->'region'->>'width') || ',' || (e.b->'image'->'region'->>'height'), '')
        || '}'
      else '{' || case when jsonb_typeof(e.b) = 'object' then (e.b - 'fallback_image')::text else e.b::text end || '}'
    end, '') as r
    from jsonb_array_elements(case when jsonb_typeof(blocks) = 'array' then blocks else '[]'::jsonb end)
         with ordinality e(b, ord)
  ) x;
$$;

-- Does an option point at other options, by letter or by position? Then the
-- option order is part of the question. Takes fp_text output; reads it as
-- plain words. Leans towards yes: a false yes only keeps two shuffled copies
-- apart, a false no could link a video that says "both A and B" to a copy
-- where A and B are different options.
create or replace function public.fp_option_points_at_options(option_text text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  with w as (select btrim(regexp_replace(coalesce(option_text, ''), '[^a-z0-9]+', ' ', 'g')) as t)
  select t ~ '\m(the|of|all|none|both|any) (above|below|aforementioned|preceding|foregoing)\M'          -- none of the above
      or t ~ '^(both|neither|either|none|all)$'                                                         -- "Both", "Neither"
      or t ~ '^(both|neither|either)\M'                                                                 -- both A and B
      or t ~ '^(none|all) (are|is) (correct|incorrect|true|false|wrong|right|valid|possible)\M'
      or t ~ '\m(all|none|both|neither|any|either|each) of (these|them|those|the (options|choices|alternatives|given|following|statements))\M'
      or t ~ '\m(options?|choices?|alternatives?) [a-h1-8]\M'                                           -- option B
      or t ~ '^[a-h]( (and |or |nor )?[a-h])+( (only|both|are correct|is correct|are true|is true))?$' -- (a) and (c)
      or t ~ '^[a-h] (only|both|are correct|is correct|are true|is true)$'
      or t ~ '\m(first|second|third|fourth|last)( two| three)? (options?|choices?)\M'
  from w;
$$;

-- Does a question body lean on another question ("the previous question",
-- "question no 18")? Its copies may follow a different question, so it is
-- never linked. Takes fp_text output.
create or replace function public.fp_points_at_other_question(body_text text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  with w as (select btrim(regexp_replace(coalesce(body_text, ''), '[^a-z0-9]+', ' ', 'g')) as t)
  select t ~ '\m(previous|preceding|above|earlier|prior)( (two|three|four|few|[0-9]+))? (questions?|problems?|sub ?questions?|parts?)\M'
      or t ~ '\mlast( (two|three|four|few|[0-9]+))? (questions?|sub ?questions?)\M'
      or t ~ '\mquestions? above\M'
      or t ~ '\m(questions?|sub ?questions?|q) (no|nos|number|numbers) [0-9]+\M'
      or t ~ '\m(solving|solve|see|refer to|from|in|of) (question|sub ?question) [0-9]+\M'
      or t ~ '\msub ?questions? [0-9]+\M'
  from w;
$$;

-- ---------------------------------------------------------------------------
-- The fingerprint of one question, with its strict hash and its option order.
-- ---------------------------------------------------------------------------
create or replace function public.question_fingerprint_parts(qid uuid)
returns table (fingerprint text, strict_fingerprint text, option_order text)
language sql
stable
set search_path = ''
as $$
  with q as (
    select q.type::text as type,
           public.fp_blocks(q.body) as body,
           public.fp_blocks(q.body, true) as body_strict,
           case when q.correct_answer ~ '^\s*-?[0-9]*\.?[0-9]+\s*$'
                then trim_scale(q.correct_answer::numeric)::text
                else public.fp_text(q.correct_answer) end as ans,
           case when q.correct_answer ~ '^\s*-?[0-9]*\.?[0-9]+\s*$'
                then trim_scale(q.correct_answer::numeric)::text
                else btrim(regexp_replace(coalesce(q.correct_answer, ''), '\s+', ' ', 'g')) end as ans_strict
    from public.questions q
    where q.id = qid
  ),
  o as (
    select o.sort_order, o.label, o.is_correct, x.f, x.s,
           -- "+" marks a correct option, "-" a wrong one.
           (case when o.is_correct then '+' else '-' end) || x.f as mf,
           (case when o.is_correct then '+' else '-' end) || x.s as ms
    from public.question_options o
    cross join lateral (select public.fp_blocks(o.content) as f, public.fp_blocks(o.content, true) as s) x
    where o.question_id = qid
  ),
  opts as (
    select bool_or(public.fp_option_points_at_options(f)) as points,
           bool_or(btrim(regexp_replace(f, '[^a-z0-9]+', ' ', 'g')) ~ '^op ?[0-9]+$') as placeholder,
           bool_or(is_correct) as any_correct,
           -- Two options the clean-up makes equal ("Hello ALICE!" and "hello
           -- alice", "C Programming !!" and "C Programming"): the loose set
           -- no longer tells which of them is correct, so this question's
           -- options are compared strictly. Strictly equal too: by position.
           count(distinct f) < count(*) as collide,
           count(distinct s) < count(*) as collide_strict,
           -- Sorted: the options as a set. Ordered: as this copy shows them.
           -- Byte order ("C"), so the result never depends on the server's locale.
           string_agg(mf, ' | ' order by mf collate "C") as f_sorted,
           string_agg(mf, ' | ' order by sort_order, label collate "C") as f_ordered,
           string_agg(ms, ' | ' order by ms collate "C") as s_sorted,
           string_agg(ms, ' | ' order by sort_order, label collate "C") as s_ordered
    from o
  ),
  k as (
    select q.*, opts.*,
      case
        when q.body = '' then false
        when q.body ~ '^this is question paper for the subject' then false   -- exam boilerplate
        when q.body ~ '^(q ?[0-9]+ ?)+$' then false                          -- "Q1" placeholders
        when coalesce(opts.placeholder, false) then false                     -- "OP 1" options
        when q.type in ('mcq', 'msq') and not coalesce(opts.any_correct, false) then false
        when q.type not in ('mcq', 'msq') and q.ans = '' then false           -- passage headers, open-ended
        when public.fp_points_at_other_question(q.body) then false
        else true
      end as linkable
    from q cross join opts
  )
  select
    case when linkable then 'v1:' || md5(type || '#' || body || '#'
      || coalesce(case
           when collide_strict then 's:' || s_ordered
           when collide then 's:' || case when points then s_ordered else s_sorted end
           when points then f_ordered
           else f_sorted
         end, '') || '#' || ans) end,
    case when linkable then 'v1:' || md5(type || '#' || body_strict || '#'
      || coalesce(case when points or collide_strict then s_ordered else s_sorted end, '') || '#' || ans_strict) end,
    case when linkable and f_ordered is not null then md5(case when collide then s_ordered else f_ordered end) end
  from k;
$$;

create or replace function public.question_fingerprint(qid uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select p.fingerprint from public.question_fingerprint_parts(qid) p;
$$;

alter table public.questions
  add column fingerprint        text,
  add column fingerprint_strict text,
  add column option_order       text;

comment on column public.questions.fingerprint is
  'v1:md5 of the normalised question, options (as a set unless they refer to each other) and answer. NULL = never linked.';
comment on column public.questions.fingerprint_strict is
  'The same, with case, quotes and punctuation counting. Differs inside a group when only the clean-up joined it.';
comment on column public.questions.option_order is
  'md5 of the options in the order this copy shows them. Differs inside a group when copies shuffle their options.';

create index questions_fingerprint_idx on public.questions(fingerprint) where fingerprint is not null;

-- ---------------------------------------------------------------------------
-- Solutions follow the question, and survive it.
-- ---------------------------------------------------------------------------
alter table public.solutions add column fingerprint text;
create index solutions_fingerprint_idx on public.solutions(fingerprint) where fingerprint is not null;

-- A deleted question (a re-import that drops it, an admin delete) no longer
-- deletes its explanations: they keep their fingerprint, keep showing on the
-- remaining copies, and re-anchor on the next question with that fingerprint.
alter table public.solutions alter column question_id drop not null;
alter table public.solutions
  drop constraint solutions_question_id_fkey,
  add constraint solutions_question_id_fkey
    foreign key (question_id) references public.questions(id) on delete set null;

-- An explanation's fingerprint is its anchor's, whoever writes the row.
create or replace function public.solutions_sync_fingerprint()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.question_id is not null then
    new.fingerprint := (select q.fingerprint from public.questions q where q.id = new.question_id);
  end if;
  return new;
end;
$$;

create trigger solutions_fingerprint
  before insert or update of question_id on public.solutions
  for each row execute function public.solutions_sync_fingerprint();

-- Recompute one question's fingerprint and carry the change to what hangs off
-- it. Pass `content_changed` false when nothing on the page changed (a new
-- normaliser version changes every fingerprint): explanations then follow
-- without going back to review. backfill_fingerprints() does the same in bulk.
create or replace function public.refresh_question_fingerprint(target uuid, content_changed boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old_fp text;
  parts  record;
begin
  select q.fingerprint into old_fp from public.questions q where q.id = target;
  if not found then
    return;   -- deleted in the same statement (options cascading away)
  end if;

  select * into parts from public.question_fingerprint_parts(target);

  update public.questions q
  set fingerprint = parts.fingerprint,
      fingerprint_strict = parts.strict_fingerprint,
      option_order = parts.option_order
  where q.id = target
    and (q.fingerprint, q.fingerprint_strict, q.option_order)
        is distinct from (parts.fingerprint, parts.strict_fingerprint, parts.option_order);

  if parts.fingerprint is distinct from old_fp then
    -- Explanations anchored here follow the question to its new group. A live
    -- one was written for the old question, so it goes back to review rather
    -- than showing on copies it may no longer fit.
    update public.solutions s
    set fingerprint  = parts.fingerprint,
        status       = case when content_changed and s.status = 'approved' then 'pending' else s.status end,
        submitted_at = case when content_changed and s.status = 'approved' then now() else s.submitted_at end,
        review_note  = case when content_changed and s.status = 'approved'
                            then 'The question changed after this explanation was published. Check it still fits, then approve it again.'
                            else s.review_note end
    where s.question_id = target;
  end if;

  if parts.fingerprint is not null then
    -- Explanations orphaned by a delete (a re-import, an admin fix) come home.
    -- One authored row per author per question, so an author's duplicates
    -- beyond the newest stay orphaned, still linked by fingerprint.
    with orphans as (
      select o.id, o.kind, o.author_id,
             row_number() over (partition by o.kind = 'authored', o.author_id order by o.updated_at desc) as rn
      from public.solutions o
      where o.question_id is null and o.fingerprint = parts.fingerprint
    )
    update public.solutions s
    set question_id = target
    from orphans o
    where s.id = o.id
      and (o.kind <> 'authored' or o.author_id is null or (
             o.rn = 1 and not exists (
               select 1 from public.solutions x
               where x.question_id = target and x.author_id = o.author_id and x.kind = 'authored')));
  end if;
end;
$$;

create or replace function public.questions_fingerprint_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_question_fingerprint(new.id);
  return null;
end;
$$;

create trigger questions_refresh_fingerprint
  after insert or update of body, type, correct_answer on public.questions
  for each row execute function public.questions_fingerprint_trigger();

create or replace function public.options_fingerprint_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'INSERT' then
    perform public.refresh_question_fingerprint(old.question_id);
  end if;
  if tg_op <> 'DELETE' and (tg_op = 'INSERT' or new.question_id is distinct from old.question_id) then
    perform public.refresh_question_fingerprint(new.question_id);
  end if;
  return null;
end;
$$;

create trigger question_options_refresh_fingerprint
  after insert or update of question_id, label, content, is_correct, sort_order or delete
  on public.question_options
  for each row execute function public.options_fingerprint_trigger();

-- updated_at means "the question was edited". The search and fingerprint
-- refreshes, and the backfill, no longer bump it.
drop trigger if exists questions_updated_at on public.questions;
create trigger questions_updated_at
  before update of set_id, number, type, body, marks, negative_marks, correct_answer,
                   answer_tolerance, topics, difficulty, status
  on public.questions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Admin decisions on a fingerprint: 'allow' shares it even with a same-set
-- repeat, 'block' never shares it.
-- ---------------------------------------------------------------------------
create table public.fingerprint_overrides (
  fingerprint text primary key,
  decision    text not null check (decision in ('allow', 'block')),
  note        text,
  decided_by  uuid references public.profiles(id) on delete set null,
  decided_at  timestamptz not null default now()
);

alter table public.fingerprint_overrides enable row level security;

create policy fingerprint_overrides_staff on public.fingerprint_overrides
  for all using ((select public.is_staff())) with check ((select public.is_staff()));

revoke all on public.fingerprint_overrides from anon, authenticated;
grant select, insert, update, delete on public.fingerprint_overrides to authenticated;

-- Is this fingerprint shared across its copies? Not when NULL; yes when an
-- admin allowed it; otherwise only when no set holds it twice.
create or replace function public.fingerprint_shareable(fp text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select fp is not null and coalesce(
    (select o.decision = 'allow' from public.fingerprint_overrides o where o.fingerprint = fp),
    not exists (
      select 1
      from public.questions a
      join public.questions b on b.fingerprint = a.fingerprint and b.set_id = a.set_id and b.id <> a.id
      where a.fingerprint = fp
    )
  );
$$;

-- The unit of work: the shared fingerprint, or the question alone. Answers
-- only staff and the question's teachers, so a draft's fingerprint stays put.
create or replace function public.group_key(qid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when public.fingerprint_shareable(q.fingerprint) then q.fingerprint else 'q:' || q.id end
  from public.questions q
  where q.id = qid and (public.is_staff() or public.can_teach_question(qid));
$$;

-- ---------------------------------------------------------------------------
-- The student read path: one question's live explanations, its own and its
-- copies'. Anon, under a 3 s timeout, so two indexed lookups.
-- ---------------------------------------------------------------------------
create or replace function public.solutions_for_question(qid uuid)
returns table (
  id          uuid,
  question_id uuid,
  kind        public.solution_kind,
  body        jsonb,
  video_url   text,
  author_id   uuid,
  author_name text,
  status      public.moderation_status,
  upvotes     int,
  created_at  timestamptz,
  shared      boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with t as (
    select q.id, case when public.fingerprint_shareable(q.fingerprint) then q.fingerprint end as fp
    from public.questions q
    join public.question_sets st   on st.id = q.set_id
    join public.question_papers qp on qp.id = st.paper_id
    where q.id = qid and q.status = 'published' and qp.status = 'published'
  )
  select s.id, s.question_id, s.kind, s.body, s.video_url, s.author_id, pr.display_name,
         s.status, s.upvotes, s.created_at,
         s.question_id is distinct from t.id
  from t
  join public.solutions s
    on s.status = 'approved' and (s.question_id = t.id or (t.fp is not null and s.fingerprint = t.fp))
  left join public.profiles pr on pr.id = s.author_id
  order by (s.question_id is not distinct from t.id) desc, s.kind, s.created_at;
$$;

-- ---------------------------------------------------------------------------
-- Studio helpers
-- ---------------------------------------------------------------------------

-- Every published copy an explanation for `qid` will show on, `qid` first.
-- same_option_order: does this copy show its options in the same order as
-- `qid`? When any is false, a recording must name options by content.
create or replace function public.question_group_members(qid uuid)
returns table (
  question_id       uuid,
  set_id            uuid,
  set_code          text,
  number            int,
  paper_id          uuid,
  session_date      date,
  exam_name         text,
  subject_name      text,
  program_name      text,
  is_self           boolean,
  same_option_order boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  fp text;
  own_order text;
begin
  if not (public.is_staff() or public.can_teach_question(qid)) then
    raise exception 'You are not assigned to this subject.' using errcode = '42501';
  end if;

  select case when public.fingerprint_shareable(q.fingerprint) then q.fingerprint end, q.option_order
  into fp, own_order
  from public.questions q where q.id = qid;

  return query
  select q.id, q.set_id, st.set_code, q.number, st.paper_id, qp.session_date, et.name, sb.name, pr.name,
         q.id = qid,
         q.option_order is not distinct from own_order
  from public.questions q
  join public.question_sets st   on st.id = q.set_id
  join public.question_papers qp on qp.id = st.paper_id
  join public.exam_types et      on et.id = qp.exam_type_id
  join public.subjects sb        on sb.id = qp.subject_id
  join public.levels l           on l.id = sb.level_id
  join public.programs pr        on pr.id = l.program_id
  where q.id = qid
     or (fp is not null and q.fingerprint = fp and q.status = 'published' and qp.status = 'published')
  order by (q.id = qid) desc, qp.session_date desc nulls last, st.set_code, q.number
  limit 100;
end;
$$;

-- Every explanation in `qid`'s group, drafts and reviews included, the
-- caller's own first. Rejected work is shown only to its author and staff.
create or replace function public.group_explanations(qid uuid)
returns table (
  id           uuid,
  question_id  uuid,
  kind         public.solution_kind,
  body         jsonb,
  video_url    text,
  author_id    uuid,
  author_name  text,
  status       public.moderation_status,
  submitted_at timestamptz,
  review_note  text,
  updated_at   timestamptz,
  is_mine      boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  fp text;
  staff boolean := public.is_staff();
begin
  if not (staff or public.can_teach_question(qid)) then
    raise exception 'You are not assigned to this subject.' using errcode = '42501';
  end if;

  select case when public.fingerprint_shareable(q.fingerprint) then q.fingerprint end
  into fp
  from public.questions q where q.id = qid;

  return query
  select s.id, s.question_id, s.kind, s.body, s.video_url, s.author_id, p.display_name,
         s.status, s.submitted_at, s.review_note, s.updated_at,
         coalesce(s.author_id = auth.uid(), false)
  from public.solutions s
  left join public.profiles p on p.id = s.author_id
  where (s.question_id = qid or (fp is not null and s.fingerprint = fp))
    and (s.status <> 'rejected' or s.author_id = auth.uid() or staff)
  order by coalesce(s.author_id = auth.uid(), false) desc, (s.status = 'approved') desc, s.updated_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Claims: an advisory 48-hour hold on a group, so two teachers do not record
-- the same explanation. Written only through claim_question/release_claim.
-- ---------------------------------------------------------------------------
create table public.explanation_claims (
  group_key   text primary key,
  question_id uuid not null references public.questions(id) on delete cascade,
  teacher_id  uuid not null references public.profiles(id) on delete cascade,
  claimed_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '48 hours'
);

create index explanation_claims_teacher_idx on public.explanation_claims(teacher_id);

alter table public.explanation_claims enable row level security;

create policy explanation_claims_read on public.explanation_claims
  for select using ((select public.is_teacher()) or (select public.is_staff()));

revoke all on public.explanation_claims from anon, authenticated;
grant select on public.explanation_claims to authenticated;

-- Take or renew the hold. Someone else's live claim is left alone; an admin
-- takes it over only when asking to (p_take_over), never just by looking.
create or replace function public.claim_question(qid uuid, p_take_over boolean default false)
returns table (ok boolean, holder_name text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  gk text;
begin
  if auth.uid() is null or not public.can_teach_question(qid) then
    raise exception 'You are not assigned to this subject.' using errcode = '42501';
  end if;

  gk := public.group_key(qid);

  insert into public.explanation_claims as c (group_key, question_id, teacher_id)
  values (gk, qid, auth.uid())
  on conflict (group_key) do update
    set question_id = excluded.question_id,
        teacher_id  = excluded.teacher_id,
        claimed_at  = now(),
        expires_at  = now() + interval '48 hours'
    where c.teacher_id = auth.uid() or c.expires_at < now() or (p_take_over and public.is_admin());

  return query
  select c.teacher_id = auth.uid(), p.display_name, c.expires_at
  from public.explanation_claims c
  left join public.profiles p on p.id = c.teacher_id
  where c.group_key = gk;
end;
$$;

create or replace function public.release_claim(qid uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.explanation_claims
  where group_key = public.group_key(qid)
    and (teacher_id = auth.uid() or public.is_admin());
$$;

-- Losing the teacher role also lets go of every hold.
create or replace function public.profiles_role_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role not in ('teacher', 'admin') then
    delete from public.teacher_assignments where teacher_id = new.id;
    delete from public.explanation_claims where teacher_id = new.id;
    new.auto_publish := false;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- The teacher's queue: one row per group, not per question.
-- ---------------------------------------------------------------------------

-- Each published question of a subject with its group key. Must agree with
-- fingerprint_shareable(), which it calls once per distinct fingerprint.
create or replace function public._subject_groups(p_subject uuid)
returns table (question_id uuid, gk text)
language sql
stable
security definer
set search_path = public
as $$
  with sq as (
    select q.id, q.fingerprint
    from public.questions q
    join public.question_sets st   on st.id = q.set_id
    join public.question_papers qp on qp.id = st.paper_id
    where qp.subject_id = p_subject and q.status = 'published' and qp.status = 'published'
  ),
  shared_fp as (
    select f.fingerprint
    from (select distinct fingerprint from sq where fingerprint is not null) f
    where public.fingerprint_shareable(f.fingerprint)
  )
  select sq.id,
         case when sq.fingerprint in (select fingerprint from shared_fp) then sq.fingerprint else 'q:' || sq.id end
  from sq;
$$;

-- p_filter: todo (nothing started), no_video (explained, no video yet),
-- review (submitted, waiting), done (live), mine (I have one here), all.
create or replace function public.teacher_queue(
  p_subject uuid,
  p_filter  text default 'todo',
  p_paper   uuid default null,
  p_limit   int  default 50,
  p_offset  int  default 0
)
returns table (
  question_id      uuid,
  paper_id         uuid,
  set_id           uuid,
  set_code         text,
  number           int,
  qtype            public.question_type,
  marks            numeric,
  snippet          text,
  has_image        boolean,
  session_date     date,
  exam_name        text,
  group_key        text,
  copies           int,
  other_subjects   text[],
  order_varies     boolean,
  solution_id      uuid,
  solution_status  public.moderation_status,
  submitted        boolean,
  has_text         boolean,
  has_video        boolean,
  author_name      text,
  is_mine          boolean,
  claimed_by       text,
  claim_expires_at timestamptz,
  total            bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not (public.is_staff() or public.can_teach_subject(p_subject)) then
    raise exception 'You are not assigned to this subject.' using errcode = '42501';
  end if;
  if coalesce(p_filter, '') not in ('todo', 'no_video', 'review', 'done', 'mine', 'all') then
    raise exception 'Unknown filter.' using errcode = '22023';
  end if;

  -- Each group's reach, deciding explanation and "is it mine" are indexed
  -- lookups per representative row, so the cost grows with the subject's
  -- size and never with a join the planner has to guess at.
  return query
  with g as (
    select * from public._subject_groups(p_subject)
  ),
  -- The newest copy stands for the group (within the chosen paper, if any).
  reps as (
    select distinct on (g.gk)
           g.gk, q.id, st.paper_id, q.set_id, st.set_code, q.number, q.type, q.marks, q.body,
           qp.session_date, et.name as exam_name
    from g
    join public.questions q        on q.id = g.question_id
    join public.question_sets st   on st.id = q.set_id
    join public.question_papers qp on qp.id = st.paper_id
    join public.exam_types et      on et.id = qp.exam_type_id
    where p_paper is null or qp.id = p_paper
    order by g.gk, qp.session_date desc nulls last, st.set_code, q.number
  ),
  state as (
    select r.*,
           greatest(x.copies, 1) as copies, x.other_subjects, x.order_varies,
           s.id as solution_id, s.status as solution_status, s.submitted, s.has_text, s.has_video,
           s.author_id as solution_author, m.mine is not null as mine
    from reps r
    -- Every published copy, in any subject or branch.
    left join lateral (
      select count(*)::int as copies,
             array_agg(distinct sb.name) filter (where qp2.subject_id <> p_subject) as other_subjects,
             count(distinct q2.option_order) > 1 as order_varies
      from public.questions q2
      join public.question_sets st2   on st2.id = q2.set_id
      join public.question_papers qp2 on qp2.id = st2.paper_id and qp2.status = 'published'
      join public.subjects sb         on sb.id = qp2.subject_id
      where r.gk not like 'q:%' and q2.fingerprint = r.gk and q2.status = 'published'
    ) x on true
    -- The explanation that decides the group's state: live first, then with video, then newest.
    left join lateral (
      select s.id, s.status, s.submitted_at is not null as submitted,
             jsonb_array_length(s.body) > 0 as has_text, s.video_url is not null as has_video, s.author_id
      from public.solutions s
      where ((r.gk like 'q:%' and s.question_id = r.id) or (r.gk not like 'q:%' and s.fingerprint = r.gk))
        and s.kind in ('official', 'authored') and s.status <> 'rejected'
      order by (s.status = 'approved') desc, (s.video_url is not null) desc, s.updated_at desc
      limit 1
    ) s on true
    left join lateral (
      select true as mine
      from public.solutions s2
      where ((r.gk like 'q:%' and s2.question_id = r.id) or (r.gk not like 'q:%' and s2.fingerprint = r.gk))
        and s2.author_id = auth.uid()
      limit 1
    ) m on true
  ),
  page as (
    select st.*, count(*) over () as total
    from state st
    where case p_filter
            when 'todo'     then st.solution_id is null
            when 'no_video' then st.solution_id is not null and not st.has_video
            when 'review'   then st.solution_status = 'pending' and st.submitted
            when 'done'     then st.solution_status = 'approved'
            when 'mine'     then st.mine
            else true
          end
    order by st.session_date desc nulls last, st.paper_id, st.set_code, st.number
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  -- Snippets and names only for the page actually returned.
  select p.id, p.paper_id, p.set_id, p.set_code, p.number, p.type, p.marks,
         left(btrim(regexp_replace(public.jsonb_deep_text(p.body), '\s+', ' ', 'g')), 220),
         p.body @? '$[*] ? (@.type == "image")',
         p.session_date, p.exam_name, p.gk, p.copies, p.other_subjects, coalesce(p.order_varies, false),
         p.solution_id, p.solution_status, coalesce(p.submitted, false), coalesce(p.has_text, false),
         coalesce(p.has_video, false), pa.display_name, p.mine, pc.display_name, c.expires_at,
         p.total
  from page p
  left join public.profiles pa on pa.id = p.solution_author
  left join public.explanation_claims c on c.group_key = p.gk and c.expires_at > now()
  left join public.profiles pc on pc.id = c.teacher_id
  order by p.session_date desc nulls last, p.paper_id, p.set_code, p.number;
end;
$$;

-- One row per combo of a teacher (the caller by default; another teacher only
-- for an admin), with progress counted in groups. valid is false when the
-- subject has since moved to another branch: that combo grants nothing.
create or replace function public.teacher_subject_summary(p_teacher uuid default null)
returns table (
  program_id   uuid,
  program_name text,
  level_name   text,
  subject_id   uuid,
  subject_slug text,
  subject_name text,
  valid        boolean,
  questions    int,
  groups       int,
  explained    int,
  with_video   int,
  in_review    int
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  who uuid := coalesce(p_teacher, auth.uid());
begin
  if who is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if who is distinct from auth.uid() and not public.is_admin() then
    raise exception 'Only an admin can see another teacher''s subjects.' using errcode = '42501';
  end if;

  return query
  select ta.program_id, pr.name, l.name, sb.id, sb.slug, sb.name,
         l.program_id = ta.program_id,
         coalesce(c.questions, 0), coalesce(c.groups, 0), coalesce(c.explained, 0),
         coalesce(c.with_video, 0), coalesce(c.in_review, 0)
  from public.teacher_assignments ta
  join public.subjects sb on sb.id = ta.subject_id
  join public.levels l    on l.id = sb.level_id
  join public.programs pr on pr.id = ta.program_id
  left join lateral (
    with g as (
      select * from public._subject_groups(sb.id)
    ),
    keys as (
      select g.gk, min(g.question_id::text)::uuid as qid from g group by g.gk
    ),
    gs as (
      select k.gk, s.status, s.submitted_at, s.video_url
      from keys k join public.solutions s on s.question_id = k.qid
      where k.gk like 'q:%' and s.kind in ('official', 'authored')
      union all
      select k.gk, s.status, s.submitted_at, s.video_url
      from keys k join public.solutions s on s.fingerprint = k.gk
      where k.gk not like 'q:%' and s.kind in ('official', 'authored')
    ),
    per as (
      select gs.gk,
             bool_or(gs.status = 'approved') as live,
             bool_or(gs.status = 'approved' and gs.video_url is not null) as video,
             bool_or(gs.status = 'pending' and gs.submitted_at is not null) as review
      from gs group by gs.gk
    )
    select (select count(*) from g)::int as questions,
           (select count(*) from keys)::int as groups,
           (select count(*) from per where live)::int as explained,
           (select count(*) from per where video)::int as with_video,
           (select count(*) from per where review)::int as in_review
  ) c on true
  where ta.teacher_id = who
  order by pr.sort_order, l.sort_order, sb.sort_order, sb.name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Duplicate review, for staff.
--   same_set         a set holds the question twice: probably an import error
--   largest          the biggest groups
--   cross_subject    groups spanning subjects or branches
--   normalised_only  copies differ in case, quotes or punctuation: worth a look
--   shuffled         copies order their options differently
--   decided          groups an admin has allowed or blocked
-- ---------------------------------------------------------------------------
create or replace function public.duplicate_review(p_kind text, p_limit int default 50, p_offset int default 0)
returns table (
  fingerprint        text,
  members            int,
  sets               int,
  subjects           text[],
  sample_question_id uuid,
  snippet            text,
  decision           text,
  order_varies       boolean,
  strict_variants    int,
  total              bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_staff() then
    raise exception 'Staff only.' using errcode = '42501';
  end if;
  if coalesce(p_kind, '') not in ('same_set', 'largest', 'cross_subject', 'normalised_only', 'shuffled', 'decided') then
    raise exception 'Unknown list.' using errcode = '22023';
  end if;

  return query
  with multi as (
    select q.fingerprint from public.questions q
    where q.fingerprint is not null
    group by q.fingerprint having count(*) > 1
  ),
  g as (
    select q.fingerprint,
           count(*)::int as members,
           count(distinct q.set_id)::int as sets,
           array_agg(distinct sb.name) as subjects,
           count(distinct qp.subject_id) as subject_count,
           (array_agg(q.id order by qp.session_date desc nulls last, q.id))[1] as sample,
           count(distinct q.fingerprint_strict)::int as strict_variants,
           count(distinct q.option_order) > 1 as order_varies
    from multi m
    join public.questions q        on q.fingerprint = m.fingerprint
    join public.question_sets st   on st.id = q.set_id
    join public.question_papers qp on qp.id = st.paper_id
    join public.subjects sb        on sb.id = qp.subject_id
    group by q.fingerprint
  )
  select g.fingerprint, g.members, g.sets, g.subjects, g.sample,
         left(btrim(regexp_replace(public.jsonb_deep_text(sq.body), '\s+', ' ', 'g')), 200),
         o.decision, g.order_varies, g.strict_variants,
         count(*) over ()
  from g
  join public.questions sq on sq.id = g.sample
  left join public.fingerprint_overrides o on o.fingerprint = g.fingerprint
  where case p_kind
          when 'same_set'        then g.members > g.sets
          when 'cross_subject'   then g.subject_count > 1
          when 'normalised_only' then g.strict_variants > 1
          when 'shuffled'        then g.order_varies
          when 'decided'         then o.fingerprint is not null
          else true
        end
  order by g.members desc, g.fingerprint
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill, one subject per call, or one paper of it when a whole subject
-- would outrun the API's 8 s statement limit (scripts/backfill-fingerprints.ts,
-- service role). Safe to re-run: only rows whose fingerprint changes are
-- written, and nothing is sent back to review. Returns the number of
-- questions updated.
-- ---------------------------------------------------------------------------
create or replace function public.backfill_fingerprints(p_subject uuid, p_paper uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  with f as (
    select q.id, p.fingerprint, p.strict_fingerprint, p.option_order
    from public.questions q
    join public.question_sets st   on st.id = q.set_id
    join public.question_papers qp on qp.id = st.paper_id
    cross join lateral public.question_fingerprint_parts(q.id) p
    where qp.subject_id = p_subject and (p_paper is null or qp.id = p_paper)
  ),
  changed as (
    update public.questions q
    set fingerprint = f.fingerprint, fingerprint_strict = f.strict_fingerprint, option_order = f.option_order
    from f
    where q.id = f.id
      and (q.fingerprint, q.fingerprint_strict, q.option_order)
          is distinct from (f.fingerprint, f.strict_fingerprint, f.option_order)
    returning q.id, q.fingerprint
  ),
  followed as (
    update public.solutions s
    set fingerprint = c.fingerprint
    from changed c
    where s.question_id = c.id and s.fingerprint is distinct from c.fingerprint
    returning s.id
  )
  select count(*) into n from changed;
  return n;
end;
$$;

-- Unused by the app, and wrong once explanations are shared by fingerprint.
drop view if exists public.solution_coverage;

-- ---------------------------------------------------------------------------
-- Function privileges: nothing callable until granted (see 0024).
-- ---------------------------------------------------------------------------
revoke execute on function
  public.fp_text(text),
  public.fp_plain(text),
  public.fp_code(text),
  public.fp_blocks(jsonb, boolean),
  public.fp_option_points_at_options(text),
  public.fp_points_at_other_question(text),
  public.question_fingerprint_parts(uuid),
  public.question_fingerprint(uuid),
  public.solutions_sync_fingerprint(),
  public.refresh_question_fingerprint(uuid, boolean),
  public.questions_fingerprint_trigger(),
  public.options_fingerprint_trigger(),
  public.fingerprint_shareable(text),
  public.group_key(uuid),
  public.solutions_for_question(uuid),
  public.question_group_members(uuid),
  public.group_explanations(uuid),
  public.claim_question(uuid, boolean),
  public.release_claim(uuid),
  public.profiles_role_changed(),
  public._subject_groups(uuid),
  public.teacher_queue(uuid, text, uuid, int, int),
  public.teacher_subject_summary(uuid),
  public.duplicate_review(text, int, int),
  public.backfill_fingerprints(uuid, uuid)
from public, anon, authenticated;

grant execute on function public.solutions_for_question(uuid) to anon, authenticated;

grant execute on function
  public.group_key(uuid),
  public.question_group_members(uuid),
  public.group_explanations(uuid),
  public.claim_question(uuid, boolean),
  public.release_claim(uuid),
  public.teacher_queue(uuid, text, uuid, int, int),
  public.teacher_subject_summary(uuid),
  public.duplicate_review(text, int, int)
to authenticated;

grant execute on function public.backfill_fingerprints(uuid, uuid) to service_role;
