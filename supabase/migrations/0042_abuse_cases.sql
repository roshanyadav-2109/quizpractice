-- ---------------------------------------------------------------------------
-- A record of abuse of the site: who, from where, what they did, and the
-- evidence kept for it. Staff read it; nobody else can, and only the service
-- role (or a migration) writes it. The rows are data, not schema — they are
-- added by hand and never committed.
--
-- A blocked account is also banned in auth.users (banned_until), which stops
-- every sign-in and refresh; blocked_ips lists addresses for the edge firewall.
-- ---------------------------------------------------------------------------

create table if not exists public.abuse_cases (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  title       text not null,
  summary     text not null,
  status      text not null default 'open' check (status in ('open', 'blocked', 'closed'))
);

create table if not exists public.abuse_subjects (
  id          bigint generated always as identity primary key,
  case_id     bigint not null references public.abuse_cases(id) on delete cascade,
  kind        text not null check (kind in ('email', 'ip', 'user_agent')),
  value       text not null,
  user_id     uuid,
  note        text,
  blocked_at  timestamptz,
  unique (case_id, kind, value)
);

create table if not exists public.abuse_evidence (
  id          bigint generated always as identity primary key,
  case_id     bigint not null references public.abuse_cases(id) on delete cascade,
  subject_id  bigint references public.abuse_subjects(id) on delete cascade,
  kept_at     timestamptz not null default now(),
  kind        text not null,
  summary     text not null,
  detail      jsonb
);

create index if not exists abuse_subjects_case_idx on public.abuse_subjects (case_id);
create index if not exists abuse_evidence_case_idx on public.abuse_evidence (case_id);

alter table public.abuse_cases    enable row level security;
alter table public.abuse_subjects enable row level security;
alter table public.abuse_evidence enable row level security;

drop policy if exists abuse_cases_staff on public.abuse_cases;
create policy abuse_cases_staff on public.abuse_cases for select using ((select public.is_staff()));
drop policy if exists abuse_subjects_staff on public.abuse_subjects;
create policy abuse_subjects_staff on public.abuse_subjects for select using ((select public.is_staff()));
drop policy if exists abuse_evidence_staff on public.abuse_evidence;
create policy abuse_evidence_staff on public.abuse_evidence for select using ((select public.is_staff()));

revoke all on public.abuse_cases, public.abuse_subjects, public.abuse_evidence from anon, authenticated;
grant select on public.abuse_cases, public.abuse_subjects, public.abuse_evidence to authenticated;
