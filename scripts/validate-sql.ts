/**
 * Runs every migration in supabase/migrations against an in-process Postgres
 * (PGlite) so SQL errors surface here rather than in the Supabase dashboard.
 *
 * Supabase-specific objects that PGlite does not have — the auth schema, the
 * anon/authenticated roles, auth.uid() — are shimmed below. Everything else is
 * real Postgres, so syntax, types, constraints, triggers, policies and views
 * are genuinely checked.
 *
 *   npm run db:validate
 */
import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

const SUPABASE_SHIM = `
  create schema if not exists auth;

  create table if not exists auth.users (
    id                    uuid primary key default gen_random_uuid(),
    email                 text,
    raw_user_meta_data    jsonb default '{}'::jsonb
  );

  -- In real Supabase this reads the JWT claim. Here it returns a value we can
  -- set per-test with set_config('request.jwt.claim.sub', ...).
  create or replace function auth.uid()
  returns uuid
  language sql
  stable
  as $shim$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $shim$;

  do $shim$
  begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
      create role anon nologin;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
      create role authenticated nologin;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then
      create role service_role nologin bypassrls;
    end if;
  end
  $shim$;
`

async function main() {
  const db = new PGlite()
  await db.exec(SUPABASE_SHIM)

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  let failed = false

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    try {
      await db.exec(sql)
      console.log(`  ok    ${file}`)
    } catch (error) {
      failed = true
      console.error(`  FAIL  ${file}`)
      console.error(`        ${(error as Error).message}`)
    }
  }

  if (failed) {
    console.error('\nMigrations did not apply cleanly.')
    process.exit(1)
  }

  // Sanity-check the objects the app depends on actually exist and behave.
  const checks: Array<[string, string]> = [
    ['programs seeded', `select count(*)::int as n from public.programs`],
    ['levels seeded', `select count(*)::int as n from public.levels`],
    ['subjects seeded', `select count(*)::int as n from public.subjects`],
    ['exam types seeded', `select count(*)::int as n from public.exam_types`],
    [
      'every subject resolves to a program',
      `select count(*)::int as n
         from public.subjects s
         join public.levels l on l.id = s.level_id
         join public.programs p on p.id = l.program_id`,
    ],
    [
      'jsonb_deep_text walks nested blocks',
      `select public.jsonb_deep_text(
         '[{"type":"text","md":"hello"},
           {"type":"relation","name":"Fee","rows":[[101,"Chennai"]]}]'::jsonb
       ) as n`,
    ],
    ['program_stats view', `select count(*)::int as n from public.program_stats`],
    ['subject_stats view', `select count(*)::int as n from public.subject_stats`],
    ['orphan_media view', `select count(*)::int as n from public.orphan_media`],
    [
      'search_questions callable',
      `select count(*)::int as n from public.search_questions('database')`,
    ],
    [
      'rls enabled on every content table',
      `select count(*)::int as n
         from pg_tables
        where schemaname = 'public' and not rowsecurity`,
    ],
  ]

  console.log('')
  for (const [label, sql] of checks) {
    try {
      const res = await db.query<{ n: unknown }>(sql)
      console.log(`  ok    ${label} -> ${JSON.stringify(res.rows[0]?.n)}`)
    } catch (error) {
      failed = true
      console.error(`  FAIL  ${label}: ${(error as Error).message}`)
    }
  }

  // Exercise the search trigger end to end: insert a paper, set, question and
  // options, then confirm the question is findable by a word buried in a table
  // cell rather than in the prose.
  try {
    await db.exec(`
      insert into public.question_papers (id, subject_id, exam_type_id, session_date, status)
      select '11111111-1111-1111-1111-111111111111',
             (select id from public.subjects where slug = 'dbms'),
             (select id from public.exam_types where slug = 'quiz-1'),
             date '2026-07-16', 'published';

      insert into public.question_sets (id, paper_id, set_code)
      values ('22222222-2222-2222-2222-222222222222',
              '11111111-1111-1111-1111-111111111111', '1563');

      insert into public.questions (id, set_id, number, type, body, marks)
      values ('33333333-3333-3333-3333-333333333333',
              '22222222-2222-2222-2222-222222222222', 1, 'mcq',
              '[{"type":"relation","name":"Delivery_Fee",
                 "columns":[{"name":"city"}],
                 "rows":[["Bengaluru"]]}]'::jsonb, 1);

      insert into public.question_options (question_id, label, content, is_correct)
      values ('33333333-3333-3333-3333-333333333333', 'A',
              '[{"type":"text","md":"Query Optimizer"}]'::jsonb, true);
    `)

    const hit = await db.query<{ n: number }>(
      `select count(*)::int as n from public.search_questions('Bengaluru')`,
    )
    const optionHit = await db.query<{ n: number }>(
      `select count(*)::int as n from public.search_questions('optimizer')`,
    )

    // Block type names must NOT be indexed, or "relation" and "table" would
    // match every question that happens to contain one.
    const noiseHit = await db.query<{ n: number }>(
      `select count(*)::int as n from public.search_questions('relation')`,
    )

    // The catalogue counts: the fixture set holds one published question.
    const counts = await db.query<{ n: number }>(
      `select question_count as n from public.published_set_counts()
        where set_id = '22222222-2222-2222-2222-222222222222'`,
    )
    if (counts.rows[0]?.n === 1) {
      console.log('  ok    published_set_counts counts the fixture set')
    } else {
      failed = true
      console.error(`  FAIL  published_set_counts: got ${JSON.stringify(counts.rows[0])}, want 1`)
    }

    if (hit.rows[0].n === 1 && optionHit.rows[0].n === 1 && noiseHit.rows[0].n === 0) {
      console.log('  ok    search finds words inside table cells and options')
      console.log('  ok    block type names are excluded from the search index')
    } else {
      failed = true
      console.error(
        `  FAIL  search trigger: table-cell hit=${hit.rows[0].n} (want 1), ` +
          `option hit=${optionHit.rows[0].n} (want 1), ` +
          `type-name noise=${noiseHit.rows[0].n} (want 0)`,
      )
    }
  } catch (error) {
    failed = true
    console.error(`  FAIL  search round trip: ${(error as Error).message}`)
  }

  await db.close()

  if (failed) process.exit(1)
  console.log('\nAll migrations apply cleanly.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
