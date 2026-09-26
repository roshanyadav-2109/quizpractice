-- =============================================================================
-- 0019_spotlight.sql — exam dates and announcement banners
--
-- exam_calendar: when the next Quiz 1, Quiz 2 or End Term is sat. Entered by
-- staff from IITM's academic calendar; the site counts down to it and points
-- students at that exam's past papers. A row with no branch applies to every
-- branch.
--
-- banners: announcements staff write by hand — a feature launch, a notice —
-- shown on the pages they pick, between two optional dates. Banners the site
-- can work out for itself (new papers, a student's own mistakes) are not
-- stored here.
-- =============================================================================

create table if not exists public.exam_calendar (
  id           uuid primary key default gen_random_uuid(),
  exam_type_id uuid not null references public.exam_types(id) on delete cascade,
  program_id   uuid references public.programs(id) on delete cascade,
  exam_date    date not null,
  note         text,
  created_by   uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists exam_calendar_date_idx on public.exam_calendar(exam_date);

create table if not exists public.banners (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null default 'announcement' check (kind in ('announcement', 'feature', 'release')),
  eyebrow    text,
  title      text not null,
  body       text,
  cta_label  text,
  cta_href   text check (cta_href is null or cta_href ~ '^(/|https://)'),
  placements text[] not null default '{home}'
             check (placements <@ array['home', 'dashboard', 'papers', 'subject']::text[]),
  program_id uuid references public.programs(id) on delete cascade,
  starts_on  date,
  ends_on    date,
  is_active  boolean not null default true,
  sort_order int not null default 0,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.exam_calendar enable row level security;
alter table public.banners       enable row level security;

drop policy if exists exam_calendar_read on public.exam_calendar;
create policy exam_calendar_read on public.exam_calendar for select using (true);
drop policy if exists exam_calendar_write on public.exam_calendar;
create policy exam_calendar_write on public.exam_calendar
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists banners_read on public.banners;
create policy banners_read on public.banners for select using (is_active or public.is_staff());
drop policy if exists banners_write on public.banners;
create policy banners_write on public.banners
  for all using (public.is_staff()) with check (public.is_staff());

grant select on public.exam_calendar, public.banners to anon, authenticated;
grant insert, update, delete on public.exam_calendar, public.banners to authenticated;
