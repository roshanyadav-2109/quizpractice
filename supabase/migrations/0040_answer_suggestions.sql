-- =============================================================================
-- 0040_answer_suggestions.sql — students suggest an answer when there isn't
-- one on the site yet, and a daily job fills the key in once enough of them
-- agree.
--
-- One suggestion per student per question (upserted, so a student can change
-- their mind). Nobody, students included, can read anyone else's
-- suggestion — only staff and the service-role consensus job can, so a
-- suggestion can't be copied instead of worked out.
-- =============================================================================

create table public.answer_suggestions (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references public.questions(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  option_ids   uuid[],
  value        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (question_id, user_id)
);

create index answer_suggestions_question_idx on public.answer_suggestions(question_id);

alter table public.answer_suggestions enable row level security;

create policy answer_suggestions_insert on public.answer_suggestions
  for insert with check (user_id = auth.uid());

create policy answer_suggestions_update on public.answer_suggestions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy answer_suggestions_read on public.answer_suggestions
  for select using (user_id = auth.uid() or public.is_staff());

create policy answer_suggestions_delete on public.answer_suggestions
  for delete using (user_id = auth.uid() or public.is_staff());

grant select, insert, update, delete on public.answer_suggestions to authenticated;
