-- =============================================================================
-- 0001_schema.sql — core tables
--
-- Taxonomy is data, never code: programs, levels, subjects and exam types are
-- all rows, so a new IITM branch or course is an admin form submission rather
-- than a deploy. Question bodies are jsonb arrays of typed content blocks
-- (see schema/question-paper.schema.json), so a table, an equation or an ER
-- diagram is structured data the frontend draws, not a picture.
-- =============================================================================

-- gen_random_uuid() is core Postgres since 13, so no extension is required.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type user_role         as enum ('student', 'contributor', 'admin');
create type question_type     as enum ('mcq', 'msq', 'numerical', 'subjective', 'programming');
create type content_status    as enum ('draft', 'published', 'archived');
create type difficulty_level  as enum ('easy', 'medium', 'hard');
create type solution_kind     as enum ('official', 'authored', 'community', 'ai');
create type moderation_status as enum ('pending', 'approved', 'rejected');
create type attempt_mode      as enum ('exam', 'learning');
create type report_kind       as enum ('correction', 'broken_format', 'wrong_answer', 'other');
create type report_status     as enum ('open', 'resolved', 'dismissed');
create type extraction_status as enum ('pending', 'in_review', 'approved', 'rejected');
create type media_kind        as enum ('figure', 'source_scan', 'share_card');

-- ---------------------------------------------------------------------------
-- profiles — mirrors auth.users, carries the role
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url   text,
  role         user_role not null default 'student',
  created_at   timestamptz not null default now()
);

comment on table public.profiles is 'One row per auth user. role drives every write policy in the system.';

-- ---------------------------------------------------------------------------
-- Taxonomy: programs > levels > subjects
-- ---------------------------------------------------------------------------
create table public.programs (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  short_name  text,
  description text,
  accent      text,                       -- hex colour used on the branch card
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.levels (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  slug       text not null,
  name       text not null,
  code       text,
  credits    int,
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (program_id, slug)
);

create table public.subjects (
  id               uuid primary key default gen_random_uuid(),
  level_id         uuid not null references public.levels(id) on delete cascade,
  slug             text not null unique,
  name             text not null,
  code             text,
  -- Alternate spellings seen on real papers ("Maths1", "Math 1"). The importer
  -- resolves an incoming subject string against slug, code, name and aliases,
  -- which is what stops the same course splitting into three entries.
  aliases          text[] not null default '{}',
  has_programming  boolean not null default false,
  description      text,
  sort_order       int not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

create index subjects_level_idx   on public.subjects(level_id);
create index subjects_aliases_idx on public.subjects using gin (aliases);

create table public.exam_types (
  id                       uuid primary key default gen_random_uuid(),
  slug                     text not null unique,
  name                     text not null,
  description              text,
  default_duration_minutes int,
  sort_order               int not null default 0,
  is_active                boolean not null default true,
  created_at               timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Papers > sets > questions
--
-- A "paper" is one sitting of one exam for one subject (DBMS Quiz 1, 16 Jul 26).
-- IITM randomises papers per student, so a sitting holds one or more "sets",
-- each of which is what a single student actually saw.
-- ---------------------------------------------------------------------------
create table public.question_papers (
  id               uuid primary key default gen_random_uuid(),
  subject_id       uuid not null references public.subjects(id) on delete cascade,
  exam_type_id     uuid not null references public.exam_types(id) on delete restrict,
  title            text,
  session_date     date,
  year             int generated always as (extract(year from session_date)::int) stored,
  duration_minutes int,
  total_marks      numeric(6,2),
  status           content_status not null default 'draft',
  notes            text,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index question_papers_subject_idx on public.question_papers(subject_id);
create index question_papers_exam_idx    on public.question_papers(exam_type_id);
create index question_papers_year_idx    on public.question_papers(year);
create index question_papers_status_idx  on public.question_papers(status);

create table public.question_sets (
  id         uuid primary key default gen_random_uuid(),
  paper_id   uuid not null references public.question_papers(id) on delete cascade,
  set_code   text not null,
  label      text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (paper_id, set_code)
);

create index question_sets_paper_idx on public.question_sets(paper_id);

create table public.questions (
  id               uuid primary key default gen_random_uuid(),
  set_id           uuid not null references public.question_sets(id) on delete cascade,
  number           int not null,
  type             question_type not null,

  -- The content block array. See schema/question-paper.schema.json.
  body             jsonb not null default '[]'::jsonb,
  schema_version   int not null default 1,

  marks            numeric(5,2) not null default 1,
  negative_marks   numeric(5,2) not null default 0,

  -- numerical / programming answers; mcq+msq answers live on question_options
  correct_answer   text,
  answer_tolerance numeric,

  topics           text[] not null default '{}',
  difficulty       difficulty_level,
  status           content_status not null default 'published',

  -- maintained by trigger from body + options + topics
  search_text      tsvector,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (set_id, number)
);

create index questions_set_idx    on public.questions(set_id);
create index questions_search_idx on public.questions using gin (search_text);
create index questions_topics_idx on public.questions using gin (topics);
create index questions_body_idx   on public.questions using gin (body jsonb_path_ops);

create table public.question_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  label       text not null,
  -- Options are block arrays too: an option can be a table, an equation or a
  -- diagram, which happens constantly in DBMS and PDSA papers.
  content     jsonb not null default '[]'::jsonb,
  is_correct  boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create index question_options_question_idx on public.question_options(question_id, sort_order);

-- ---------------------------------------------------------------------------
-- Solutions
-- ---------------------------------------------------------------------------
create table public.solutions (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  kind        solution_kind not null default 'authored',
  body        jsonb not null default '[]'::jsonb,
  video_url   text,
  author_id   uuid references public.profiles(id) on delete set null,
  status      moderation_status not null default 'approved',
  upvotes     int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index solutions_question_idx on public.solutions(question_id);
create index solutions_status_idx   on public.solutions(status);

create table public.solution_votes (
  solution_id uuid not null references public.solutions(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (solution_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Media registry — every Cloudinary asset we reference
--
-- We store public_id, never a delivery URL: URLs are built at render time so
-- the cloud name, CDN and transformation string can change without a migration.
-- ---------------------------------------------------------------------------
create table public.media_assets (
  id          uuid primary key default gen_random_uuid(),
  public_id   text not null unique,
  version     bigint,
  format      text,
  width       int,
  height      int,
  bytes       int,
  checksum    text,                       -- content hash; makes re-imports idempotent
  kind        media_kind not null default 'figure',
  question_id uuid references public.questions(id) on delete set null,
  paper_id    uuid references public.question_papers(id) on delete set null,
  alt         text,
  created_at  timestamptz not null default now()
);

create index media_assets_question_idx on public.media_assets(question_id);
create index media_assets_checksum_idx on public.media_assets(checksum);

-- ---------------------------------------------------------------------------
-- Extraction queue — vision output awaiting human review
-- ---------------------------------------------------------------------------
create table public.extractions (
  id               uuid primary key default gen_random_uuid(),
  paper_id         uuid references public.question_papers(id) on delete cascade,
  question_id      uuid references public.questions(id) on delete set null,
  source_public_id text,                  -- the original scan, kept for audit
  raw_output       jsonb,                 -- exactly what the model returned
  confidence       numeric(4,3),
  extracted_by     text,
  status           extraction_status not null default 'pending',
  reviewer_id      uuid references public.profiles(id) on delete set null,
  notes            text,
  created_at       timestamptz not null default now(),
  reviewed_at      timestamptz
);

create index extractions_status_idx     on public.extractions(status, confidence);
create index extractions_paper_idx      on public.extractions(paper_id);

-- ---------------------------------------------------------------------------
-- Attempts
-- ---------------------------------------------------------------------------
create table public.attempts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  set_id           uuid not null references public.question_sets(id) on delete cascade,
  mode             attempt_mode not null default 'exam',
  started_at       timestamptz not null default now(),
  submitted_at     timestamptz,
  score            numeric(7,2),
  max_score        numeric(7,2),
  duration_seconds int
);

create index attempts_user_idx on public.attempts(user_id, started_at desc);
create index attempts_set_idx  on public.attempts(set_id);

create table public.attempt_answers (
  id            uuid primary key default gen_random_uuid(),
  attempt_id    uuid not null references public.attempts(id) on delete cascade,
  question_id   uuid not null references public.questions(id) on delete cascade,
  response      jsonb,                    -- {"option_ids": [...]} | {"value": "37.5"} | {"text": "..."}
  is_correct    boolean,
  marks_awarded numeric(5,2),
  unique (attempt_id, question_id)
);

create index attempt_answers_attempt_idx on public.attempt_answers(attempt_id);

-- ---------------------------------------------------------------------------
-- Community: discussion threads and correction reports
-- ---------------------------------------------------------------------------
create table public.discussions (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete set null,
  parent_id   uuid references public.discussions(id) on delete cascade,
  body        text not null,
  is_deleted  boolean not null default false,
  created_at  timestamptz not null default now()
);

create index discussions_question_idx on public.discussions(question_id, created_at);

create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete set null,
  kind        report_kind not null default 'correction',
  description text not null,
  status      report_status not null default 'open',
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

create index reports_status_idx   on public.reports(status, created_at desc);
create index reports_question_idx on public.reports(question_id);
