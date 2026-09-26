-- =============================================================================
-- 0020_search_trends.sql — what people search for, to suggest it back
--
-- search_counts: one row per search term per day, counting how often it was
-- searched. The site logs a term only when it found questions, so a typo or
-- nonsense never becomes a suggestion. Nothing identifies who searched — no
-- user, no IP — only the words and the day.
--
-- log_search(): called by the server (service role only) after a search.
-- popular_searches(): the most searched terms over the last N days, with the
-- spelling people used most recently. Public: it is only counts of words.
-- =============================================================================

create table if not exists public.search_counts (
  term  text not null,
  day   date not null default ((now() at time zone 'Asia/Kolkata')::date),
  label text not null,
  hits  int  not null default 1,
  primary key (term, day)
);

-- Read and written only through the functions below.
alter table public.search_counts enable row level security;

create or replace function public.log_search(raw text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned text := regexp_replace(btrim(coalesce(raw, '')), '\s+', ' ', 'g');
begin
  if char_length(cleaned) < 2 or char_length(cleaned) > 60 then
    return;
  end if;
  insert into public.search_counts as s (term, label)
  values (lower(cleaned), cleaned)
  on conflict (term, day) do update set hits = s.hits + 1, label = excluded.label;
end;
$$;

revoke execute on function public.log_search(text) from public, anon, authenticated;

create or replace function public.popular_searches(days int default 30, max_rows int default 12)
returns table (label text, hits bigint)
language sql
stable
security definer
set search_path = public
as $$
  select (array_agg(s.label order by s.day desc))[1] as label, sum(s.hits) as hits
  from public.search_counts s
  where s.day >= ((now() at time zone 'Asia/Kolkata')::date - days)
  group by s.term
  order by sum(s.hits) desc, max(s.day) desc
  limit least(greatest(max_rows, 1), 50);
$$;

grant execute on function public.popular_searches(int, int) to anon, authenticated;
