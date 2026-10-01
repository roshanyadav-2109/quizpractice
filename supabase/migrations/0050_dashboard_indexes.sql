-- The dashboard reads the paper log by time (papers opened per hour and per minute). Without an index on the
-- time alone, each of those reads scans the whole table, which is fine now and slow once the log has
-- hundreds of thousands of rows. Adding the index costs a few bytes per paper opened.
create index if not exists content_access_opened_at_idx on public.content_access (opened_at desc);
create index if not exists search_hits_at_idx on public.search_hits (at desc);
