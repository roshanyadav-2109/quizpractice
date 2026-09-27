-- =============================================================================
-- 0024_educators.sql — teachers, their branch + subject assignments, review
--
-- A teacher works only on the subjects an admin assigns them, and an
-- assignment names the branch as well as the subject. "Data Science › English
-- I" and "Electronic Systems › English I" are different subject rows, so
-- different jobs. The database refuses a subject that is not in the named
-- branch, and every permission check walks subject → level → branch again, so
-- a subject later moved to another branch stops matching instead of quietly
-- handing its questions to the wrong teacher.
--
-- A teacher's explanation waits for review before students see it, unless an
-- admin has marked that teacher as trusted (profiles.auto_publish). An
-- explanation's state is read from two columns:
--
--   draft       status pending,  submitted_at null
--   in review   status pending,  submitted_at set
--   live        status approved
--   rejected    status rejected, optionally with review_note (also "unpublished")
--
-- 0023 already withdrew profiles.email from anon and authenticated. The new
-- auto_publish column is left out of that column grant on purpose: a user reads
-- their own flag through my_auto_publish(), and admins through
-- admin_list_people().
--
-- Every function added here starts with EXECUTE revoked from everyone (see the
-- end of the file); only the ones meant to be called are granted back.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Trust flag
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists auto_publish boolean not null default false;

comment on column public.profiles.auto_publish is
  'A trusted teacher''s explanations go live without review. Only admins change it, through set_auto_publish().';

-- The sign-up trigger creates every profile. A user never needs to insert
-- one, and could otherwise name their own role and trust flag in it.
revoke insert on public.profiles from anon, authenticated;

-- Admins publish directly; a teacher only when trusted. Anyone else: never.
create or replace function public.my_auto_publish()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p.role = 'admin' or (p.role = 'teacher' and p.auto_publish)
    from public.profiles p
    where p.id = auth.uid()
  ), false);
$$;

-- ---------------------------------------------------------------------------
-- Branch + subject assignments
-- ---------------------------------------------------------------------------
create table public.teacher_assignments (
  teacher_id  uuid not null references public.profiles(id) on delete cascade,
  program_id  uuid not null references public.programs(id) on delete cascade,
  subject_id  uuid not null references public.subjects(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (teacher_id, subject_id)
);

create index teacher_assignments_subject_idx on public.teacher_assignments(subject_id);

comment on table public.teacher_assignments is
  'One row per teacher + branch + subject. The subject must belong to the branch; a trigger checks.';

alter table public.teacher_assignments enable row level security;

create policy teacher_assignments_read on public.teacher_assignments
  for select using (teacher_id = (select auth.uid()) or (select public.is_staff()));

create policy teacher_assignments_admin on public.teacher_assignments
  for all using ((select public.is_admin())) with check ((select public.is_admin()));

revoke all on public.teacher_assignments from anon, authenticated;
grant select, insert, update, delete on public.teacher_assignments to authenticated;

-- The final word on a combo, whoever sends it: the subject must sit in the
-- named branch, and the person must be a teacher (or admin).
create or replace function public.check_teacher_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  branch uuid;
begin
  select l.program_id into branch
  from public.subjects s
  join public.levels l on l.id = s.level_id
  where s.id = new.subject_id;

  if branch is null then
    raise exception 'Unknown subject.' using errcode = '23503';
  end if;
  if branch <> new.program_id then
    raise exception 'That subject is not part of this branch.' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.profiles p where p.id = new.teacher_id and p.role in ('teacher', 'admin')
  ) then
    raise exception 'Only a teacher can be given subjects.' using errcode = '23514';
  end if;

  -- Who assigned it is recorded, not claimed.
  if tg_op = 'INSERT' and auth.uid() is not null then
    new.assigned_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger teacher_assignments_valid
  before insert or update on public.teacher_assignments
  for each row execute function public.check_teacher_assignment();

-- Losing the teacher role drops the combos and the trust flag with it, so a
-- later promotion starts from nothing. 0025 extends this to claims.
create or replace function public.profiles_role_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role not in ('teacher', 'admin') then
    delete from public.teacher_assignments where teacher_id = new.id;
    new.auto_publish := false;
  end if;
  return new;
end;
$$;

create trigger profiles_role_changed
  before update of role on public.profiles
  for each row when (old.role is distinct from new.role)
  execute function public.profiles_role_changed();

-- May the caller work on this subject? Admins always; a teacher through a combo
-- whose branch still matches the subject's branch today.
create or replace function public.can_teach_subject(p_subject uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1
    from public.teacher_assignments ta
    join public.subjects s on s.id = ta.subject_id
    join public.levels l   on l.id = s.level_id and l.program_id = ta.program_id
    join public.profiles p on p.id = ta.teacher_id and p.role = 'teacher'
    where ta.teacher_id = auth.uid() and ta.subject_id = p_subject
  );
$$;

-- The same question for one question, through its paper's subject. Draft
-- questions count: a teacher may prepare an explanation before publication.
create or replace function public.can_teach_question(qid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select public.can_teach_subject(qp.subject_id)
    from public.questions q
    join public.question_sets st   on st.id = q.set_id
    join public.question_papers qp on qp.id = st.paper_id
    where q.id = qid
  ), false);
$$;

-- ---------------------------------------------------------------------------
-- Role and trust management — admins only. Making or unmaking an admin stays
-- a job for the Supabase dashboard, so a stolen admin session cannot mint more.
-- ---------------------------------------------------------------------------
create or replace function public.set_user_role(target uuid, new_role public.user_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change roles.' using errcode = '42501';
  end if;
  if target = auth.uid() then
    raise exception 'You cannot change your own role.' using errcode = '42501';
  end if;
  if new_role = 'admin' or exists (select 1 from public.profiles where id = target and role = 'admin') then
    raise exception 'Admin roles are changed in the Supabase dashboard.' using errcode = '42501';
  end if;

  update public.profiles set role = new_role where id = target;
  if not found then
    raise exception 'No such user.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.set_auto_publish(target uuid, value boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_role public.user_role;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change who publishes without review.' using errcode = '42501';
  end if;

  select role into target_role from public.profiles where id = target;
  if not found then
    raise exception 'No such user.' using errcode = 'P0002';
  end if;
  if value and target_role <> 'teacher' then
    raise exception 'Only a teacher can publish without review.' using errcode = '22023';
  end if;

  update public.profiles set auto_publish = value where id = target;
end;
$$;

-- The admin's people list: the one place email is read, and only by an admin.
create or replace function public.admin_list_people(
  p_search text default null,
  p_role   public.user_role default null,
  p_limit  int default 50
)
returns table (
  id           uuid,
  display_name text,
  email        text,
  avatar_url   text,
  role         public.user_role,
  auto_publish boolean,
  created_at   timestamptz,
  assignments  int
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  term text := nullif(lower(btrim(coalesce(p_search, ''))), '');
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  return query
  select p.id, p.display_name, p.email, p.avatar_url, p.role, p.auto_publish, p.created_at,
         (select count(*)::int from public.teacher_assignments ta where ta.teacher_id = p.id)
  from public.profiles p
  where (p_role is null or p.role = p_role)
    -- position(), not ilike: a % or _ typed into the search box is just a character.
    and (term is null
         or position(term in lower(coalesce(p.email, ''))) > 0
         or position(term in lower(coalesce(p.display_name, ''))) > 0)
  order by (p.role = 'teacher') desc, p.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;

-- ---------------------------------------------------------------------------
-- Solutions: review columns, database-side limits, subject-scoped policies
-- ---------------------------------------------------------------------------
alter table public.solutions
  add column submitted_at timestamptz,
  add column review_note  text,
  add column reviewed_by  uuid references public.profiles(id) on delete set null,
  add column reviewed_at  timestamptz;

-- The server checks these too, but a teacher's session can write to the table
-- directly, so the table itself refuses a foreign video link or a huge body.
-- jsonb prints a space after every comma and colon, so the app's 300 kB of
-- compact JSON (EXPLANATION_MAX_BYTES) can print as up to half as much again
-- when a board page is mostly small numbers; 450 kB always lets it through.
alter table public.solutions
  add constraint solutions_video_url_youtube check (
    video_url is null
    or video_url ~ '^https://(youtu\.be/|(www\.|m\.)?youtube(-nocookie)?\.com/)[^[:space:]]*$'
  ),
  add constraint solutions_body_array check (jsonb_typeof(body) = 'array'),
  add constraint solutions_body_size check (octet_length(body::text) <= 450000);

-- One authored explanation per author per question. Explicit inserts and
-- updates from the app rely on it; a race loses cleanly instead of doubling up.
create unique index solutions_one_authored_per_question
  on public.solutions(author_id, question_id)
  where kind = 'authored' and author_id is not null and question_id is not null;

create index solutions_review_idx on public.solutions(status, submitted_at desc);

-- Review bookkeeping belongs to staff, and an untrusted teacher's live edit
-- goes back to review. A BEFORE trigger runs before the policies' WITH CHECK,
-- so the demoted row is what the policy sees.
create or replace function public.solutions_review_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_staff() then
    return new;   -- the service role, scripts and staff are trusted as they are
  end if;

  -- The author never writes the review fields; the database does, below.
  if tg_op = 'UPDATE' then
    new.review_note := old.review_note;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
  else
    new.review_note := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;

  if new.status = 'approved' and not public.my_auto_publish() and (
       tg_op = 'INSERT'
       or old.status is distinct from 'approved'
       or new.body is distinct from old.body
       or new.video_url is distinct from old.video_url
     ) then
    new.status := 'pending';
    new.submitted_at := now();
  end if;

  -- However it left (demoted above, or resubmitted as pending), a live
  -- explanation its author took back tells the reviewer why it is back.
  if tg_op = 'UPDATE' and old.status = 'approved' and new.status <> 'approved' then
    new.review_note := 'Edited by the author after it was published.';
  end if;

  return new;
end;
$$;

create trigger solutions_review_guard
  before insert or update on public.solutions
  for each row execute function public.solutions_review_guard();

-- 0003 and 0008 let any teacher write any solution. Now a teacher writes only
-- inside their combos, and may publish directly only when trusted.
drop policy if exists solutions_read   on public.solutions;
drop policy if exists solutions_insert on public.solutions;
drop policy if exists solutions_update on public.solutions;
drop policy if exists solutions_delete on public.solutions;

create policy solutions_read on public.solutions
  for select using (
    status = 'approved'
    or author_id = (select auth.uid())
    or (select public.is_staff())
    or ((select public.is_teacher()) and question_id is not null and public.can_teach_question(question_id))
  );

create policy solutions_insert on public.solutions
  for insert with check (
    author_id = (select auth.uid())
    and (
      (select public.is_staff())
      or (kind = 'authored' and question_id is not null and public.can_teach_question(question_id)
          and (status = 'pending' or (status = 'approved' and (select public.my_auto_publish()))))
      or (kind = 'community' and status = 'pending')
    )
  );

create policy solutions_update on public.solutions
  for update using (
    (select public.is_staff())
    or (author_id = (select auth.uid())
        and (status = 'pending' or (question_id is not null and public.can_teach_question(question_id))))
  ) with check (
    (select public.is_staff())
    or (author_id = (select auth.uid()) and (
         (kind = 'authored' and question_id is not null and public.can_teach_question(question_id)
          and (status = 'pending' or (status = 'approved' and (select public.my_auto_publish()))))
         or (kind = 'community' and status = 'pending')))
  );

-- A live explanation can show on a dozen copies of a question, so only staff
-- take one down. An author may delete their own drafts and rejected work.
create policy solutions_delete on public.solutions
  for delete using (
    (select public.is_staff())
    or (author_id = (select auth.uid()) and status <> 'approved')
  );

-- Column grants: who wrote it, where, and the review fields are not the
-- author's to change after the fact.
revoke insert, update, delete on public.solutions from anon;
revoke insert, update on public.solutions from authenticated;
grant insert (question_id, kind, body, video_url, author_id, status, submitted_at)
  on public.solutions to authenticated;
grant update (body, video_url, status, submitted_at, review_note, reviewed_by, reviewed_at)
  on public.solutions to authenticated;

-- Visitors read explanations through solutions_for_question() (0025). What the
-- anon key may still select directly leaves out the review fields.
revoke select on public.solutions from anon;
grant select (id, question_id, kind, body, video_url, author_id, status, upvotes, created_at, updated_at)
  on public.solutions to anon;

-- ---------------------------------------------------------------------------
-- Narrow 0008: a teacher sees unpublished questions, their options and their
-- reports only inside their own combos.
-- ---------------------------------------------------------------------------
drop policy if exists questions_read on public.questions;
create policy questions_read on public.questions
  for select using (
    (select public.is_staff())
    or (
      status = 'published' and exists (
        select 1
        from public.question_sets s
        join public.question_papers p on p.id = s.paper_id
        where s.id = set_id and p.status = 'published'
      )
    )
    or ((select public.is_teacher()) and public.can_teach_question(id))
  );

drop policy if exists options_read on public.question_options;
create policy options_read on public.question_options
  for select using (
    (select public.is_staff())
    or exists (
      select 1
      from public.questions q
      join public.question_sets s   on s.id = q.set_id
      join public.question_papers p on p.id = s.paper_id
      where q.id = question_id and q.status = 'published' and p.status = 'published'
    )
    or ((select public.is_teacher()) and public.can_teach_question(question_id))
  );

drop policy if exists reports_read on public.reports;
create policy reports_read on public.reports
  for select using (
    user_id = (select auth.uid())
    or (select public.is_staff())
    or ((select public.is_teacher()) and public.can_teach_question(question_id))
  );

-- ---------------------------------------------------------------------------
-- YouTube
--
-- The channel connection holds an encrypted refresh token. No policies and no
-- grants: only the service role, in the admin route handlers, reads it.
-- ---------------------------------------------------------------------------
create table public.youtube_connection (
  id                boolean primary key default true check (id),   -- one row at most
  channel_id        text not null,
  channel_title     text,
  refresh_token_enc text not null,                                  -- AES-256-GCM, base64 iv.tag.ciphertext
  scopes            text not null,
  connected_by      uuid references public.profiles(id) on delete set null,
  connected_at      timestamptz not null default now(),
  last_ok_at        timestamptz,
  last_error        text
);

alter table public.youtube_connection enable row level security;
revoke all on public.youtube_connection from anon, authenticated;

-- One row per upload to YouTube. Route handlers write it with the service
-- role; the teacher may read their own rows, minus the upload session address,
-- which works as a bearer credential until the upload finishes.
create table public.video_uploads (
  id               uuid primary key default gen_random_uuid(),
  question_id      uuid references public.questions(id) on delete set null,
  teacher_id       uuid not null references public.profiles(id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 100),
  privacy          text not null check (privacy in ('unlisted', 'public', 'private')),
  mime             text not null check (mime in ('video/webm', 'video/mp4')),
  bytes_total      bigint not null check (bytes_total between 1 and 2147483648),
  session_uri      text,
  status           text not null default 'started'
                   check (status in ('started', 'uploading', 'done', 'failed', 'abandoned')),
  youtube_video_id text,
  error            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index video_uploads_teacher_idx on public.video_uploads(teacher_id, created_at desc);
create index video_uploads_created_idx on public.video_uploads(created_at desc);

create trigger video_uploads_updated_at before update on public.video_uploads
  for each row execute function public.set_updated_at();

alter table public.video_uploads enable row level security;

create policy video_uploads_read on public.video_uploads
  for select using (teacher_id = (select auth.uid()) or (select public.is_admin()));

revoke all on public.video_uploads from anon, authenticated;
grant select (id, question_id, teacher_id, title, privacy, mime, bytes_total, status,
              youtube_video_id, error, created_at, updated_at)
  on public.video_uploads to authenticated;

-- ---------------------------------------------------------------------------
-- Function privileges
--
-- Postgres grants EXECUTE on a new function to PUBLIC, and Supabase's default
-- privileges add anon and authenticated, which makes every function an RPC
-- anyone can call. Start from nothing and grant back only what is meant to be
-- called. Trigger functions need no grant to fire.
-- ---------------------------------------------------------------------------
revoke execute on function
  public.my_auto_publish(),
  public.check_teacher_assignment(),
  public.profiles_role_changed(),
  public.can_teach_subject(uuid),
  public.can_teach_question(uuid),
  public.set_user_role(uuid, public.user_role),
  public.set_auto_publish(uuid, boolean),
  public.admin_list_people(text, public.user_role, int),
  public.solutions_review_guard()
from public, anon, authenticated;

-- can_teach_question() sits in the questions, options and solutions read
-- policies, and a policy runs as the caller, anon included. It answers false
-- for anyone without a combo.
grant execute on function public.can_teach_question(uuid) to anon, authenticated;

grant execute on function
  public.my_auto_publish(),
  public.can_teach_subject(uuid),
  public.set_user_role(uuid, public.user_role),
  public.set_auto_publish(uuid, boolean),
  public.admin_list_people(text, public.user_role, int)
to authenticated;

-- 0002's search refresher writes to questions and was left callable by anyone
-- as an RPC. Only the triggers that own it need it.
revoke execute on function public.refresh_question_search(uuid) from public, anon, authenticated;
