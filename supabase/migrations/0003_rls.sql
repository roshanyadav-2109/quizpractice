-- =============================================================================
-- 0003_rls.sql — row level security
--
-- Shape of the rules:
--   * published content is world-readable (this is a public practice site)
--   * every write to content requires role admin|contributor
--   * a student can only ever see and write their own attempts
--   * role escalation is impossible from the client: the role column is not
--     grantable to authenticated, so promoting a user requires the service key
-- =============================================================================

alter table public.profiles         enable row level security;
alter table public.programs         enable row level security;
alter table public.levels           enable row level security;
alter table public.subjects         enable row level security;
alter table public.exam_types       enable row level security;
alter table public.question_papers  enable row level security;
alter table public.question_sets    enable row level security;
alter table public.questions        enable row level security;
alter table public.question_options enable row level security;
alter table public.solutions        enable row level security;
alter table public.solution_votes   enable row level security;
alter table public.media_assets     enable row level security;
alter table public.extractions      enable row level security;
alter table public.attempts         enable row level security;
alter table public.attempt_answers  enable row level security;
alter table public.discussions      enable row level security;
alter table public.reports          enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy profiles_read_all on public.profiles
  for select using (true);

create policy profiles_insert_self on public.profiles
  for insert with check (id = auth.uid());

create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- A user may edit their display name and avatar, and nothing else. Without this
-- revoke, profiles_update_self would let anyone set their own role to 'admin'.
revoke update on public.profiles from anon, authenticated;
grant  update (display_name, avatar_url) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Taxonomy — readable when active, writable by staff
-- ---------------------------------------------------------------------------
create policy programs_read on public.programs
  for select using (is_active or public.is_staff());
create policy programs_write on public.programs
  for all using (public.is_staff()) with check (public.is_staff());

create policy levels_read on public.levels
  for select using (is_active or public.is_staff());
create policy levels_write on public.levels
  for all using (public.is_staff()) with check (public.is_staff());

create policy subjects_read on public.subjects
  for select using (is_active or public.is_staff());
create policy subjects_write on public.subjects
  for all using (public.is_staff()) with check (public.is_staff());

create policy exam_types_read on public.exam_types
  for select using (is_active or public.is_staff());
create policy exam_types_write on public.exam_types
  for all using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- Papers, sets, questions, options
-- ---------------------------------------------------------------------------
create policy papers_read on public.question_papers
  for select using (status = 'published' or public.is_staff());
create policy papers_write on public.question_papers
  for all using (public.is_staff()) with check (public.is_staff());

create policy sets_read on public.question_sets
  for select using (
    public.is_staff() or exists (
      select 1 from public.question_papers p
      where p.id = paper_id and p.status = 'published'
    )
  );
create policy sets_write on public.question_sets
  for all using (public.is_staff()) with check (public.is_staff());

create policy questions_read on public.questions
  for select using (
    public.is_staff() or (
      status = 'published' and exists (
        select 1
        from public.question_sets s
        join public.question_papers p on p.id = s.paper_id
        where s.id = set_id and p.status = 'published'
      )
    )
  );
create policy questions_write on public.questions
  for all using (public.is_staff()) with check (public.is_staff());

create policy options_read on public.question_options
  for select using (
    public.is_staff() or exists (
      select 1
      from public.questions q
      join public.question_sets s   on s.id = q.set_id
      join public.question_papers p on p.id = s.paper_id
      where q.id = question_id and q.status = 'published' and p.status = 'published'
    )
  );
create policy options_write on public.question_options
  for all using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- Solutions — approved ones are public; anyone signed in may contribute one,
-- but a non-staff contribution is forced to 'community' + 'pending'.
-- ---------------------------------------------------------------------------
create policy solutions_read on public.solutions
  for select using (
    status = 'approved' or author_id = auth.uid() or public.is_staff()
  );

create policy solutions_insert on public.solutions
  for insert with check (
    author_id = auth.uid()
    and (
      public.is_staff()
      or (status = 'pending' and kind = 'community')
    )
  );

create policy solutions_update on public.solutions
  for update using (
    public.is_staff() or (author_id = auth.uid() and status = 'pending')
  ) with check (
    public.is_staff() or (author_id = auth.uid() and status = 'pending')
  );

create policy solutions_delete on public.solutions
  for delete using (public.is_staff() or author_id = auth.uid());

create policy solution_votes_read on public.solution_votes
  for select using (true);
create policy solution_votes_insert on public.solution_votes
  for insert with check (user_id = auth.uid());
create policy solution_votes_delete on public.solution_votes
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Media registry and extraction queue — staff only, nothing public reads them
-- ---------------------------------------------------------------------------
create policy media_staff on public.media_assets
  for all using (public.is_staff()) with check (public.is_staff());

create policy extractions_staff on public.extractions
  for all using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- Attempts — strictly the owner's own rows
-- ---------------------------------------------------------------------------
create policy attempts_own on public.attempts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy attempts_admin_read on public.attempts
  for select using (public.is_admin());

create policy attempt_answers_own on public.attempt_answers
  for all using (
    exists (select 1 from public.attempts a where a.id = attempt_id and a.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.attempts a where a.id = attempt_id and a.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Discussions
-- ---------------------------------------------------------------------------
create policy discussions_read on public.discussions
  for select using (not is_deleted or public.is_staff());

create policy discussions_insert on public.discussions
  for insert with check (user_id = auth.uid());

create policy discussions_update on public.discussions
  for update using (user_id = auth.uid() or public.is_staff())
  with check (user_id = auth.uid() or public.is_staff());

create policy discussions_delete on public.discussions
  for delete using (public.is_staff());

-- ---------------------------------------------------------------------------
-- Reports — a student files one, staff resolves it
-- ---------------------------------------------------------------------------
create policy reports_read on public.reports
  for select using (user_id = auth.uid() or public.is_staff());

create policy reports_insert on public.reports
  for insert with check (user_id = auth.uid() or user_id is null);

create policy reports_update on public.reports
  for update using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- Explicit grants. Supabase's default privileges usually cover this, but being
-- explicit means the migration behaves the same on a bare Postgres too.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select on
  public.programs, public.levels, public.subjects, public.exam_types,
  public.question_papers, public.question_sets, public.questions,
  public.question_options, public.solutions, public.solution_votes,
  public.discussions, public.profiles,
  public.subject_stats, public.program_stats
to anon, authenticated;

grant insert, update, delete on
  public.solutions, public.solution_votes, public.discussions, public.reports,
  public.attempts, public.attempt_answers
to authenticated;

grant select on public.reports, public.attempts, public.attempt_answers to authenticated;

grant select, insert, update, delete on
  public.programs, public.levels, public.subjects, public.exam_types,
  public.question_papers, public.question_sets, public.questions,
  public.question_options, public.media_assets, public.extractions
to authenticated;

grant select on public.orphan_media to authenticated;

grant execute on function public.search_questions(text, uuid, uuid, int) to anon, authenticated;
grant execute on function public.is_staff() to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
