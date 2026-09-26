-- =============================================================================
-- 0023_privacy_fixes.sql — two holes found in review
--
-- 1. Every profile's email was readable with the public (anon) key, and by any
--    signed-in user. The site reads the signed-in user's own email from their
--    token, never from this table, so the column is simply withdrawn from the
--    public roles; the service role (scripts, admin tooling) still sees it.
--
-- 2. public.schema_migrations, created by scripts/db-push.ts, had no row-level
--    security and granted read, insert and delete to the public roles, so
--    anyone could rewrite which migrations the pusher thinks are applied.
-- =============================================================================

revoke select on public.profiles from anon, authenticated;
grant select (id, display_name, avatar_url, role, created_at) on public.profiles to anon, authenticated;

do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    execute 'alter table public.schema_migrations enable row level security';
    execute 'revoke all on public.schema_migrations from public, anon, authenticated';
  end if;
end;
$$;
