/**
 * Applies supabase/migrations/*.sql to a hosted Supabase project through the
 * Management API.
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=abcd npm run db:push
 *   npm run db:push -- --status     # show what is applied and what is pending
 *   npm run db:push -- --baseline   # record every file as applied WITHOUT running it
 *
 * This exists because the usual routes both have prerequisites this project
 * does not assume: `supabase db push` needs the database password, and
 * `supabase start` needs Docker. The Management API needs only a personal
 * access token.
 *
 * Applied files are recorded in public.schema_migrations and skipped on later
 * runs, so this is safe to re-run — the migrations themselves are not
 * idempotent (`create type` will not tolerate a second pass).
 *
 * `--baseline` is for adopting a database that was migrated before this
 * tracking existed: it records the files as applied without executing them.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { config as loadEnv } from 'dotenv'

loadEnv({ path: '.env.local', quiet: true })
loadEnv({ quiet: true })

const token = process.env.SUPABASE_ACCESS_TOKEN
const ref = process.env.SUPABASE_PROJECT_REF

if (!token || !ref) {
  console.error(
    'Set SUPABASE_ACCESS_TOKEN (Supabase dashboard → Account → Access Tokens)\n' +
      'and SUPABASE_PROJECT_REF.',
  )
  process.exit(1)
}

const statusOnly = process.argv.includes('--status')
const baseline = process.argv.includes('--baseline')
const endpoint = `https://api.supabase.com/v1/projects/${ref}/database/query`

async function runSql(query: string): Promise<Record<string, unknown>[]> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })

  const text = await response.text()
  if (!response.ok) throw new Error(text || `HTTP ${response.status}`)

  try {
    return JSON.parse(text) as Record<string, unknown>[]
  } catch {
    return []
  }
}

function checksum(sql: string): string {
  return createHash('sha256').update(sql).digest('hex').slice(0, 16)
}

async function main() {
  const dir = join(process.cwd(), 'supabase', 'migrations')
  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort()

  await runSql(`
    create table if not exists public.schema_migrations (
      version     text primary key,
      checksum    text not null,
      applied_at  timestamptz not null default now()
    );
  `)

  const appliedRows = await runSql(
    'select version, checksum from public.schema_migrations',
  )
  const applied = new Map(
    appliedRows.map((row) => [String(row.version), String(row.checksum)]),
  )

  const pending = files.filter((file) => !applied.has(file))

  if (statusOnly) {
    console.log(`Project ${ref}\n`)
    for (const file of files) {
      const stored = applied.get(file)
      const current = checksum(readFileSync(join(dir, file), 'utf8'))
      const state = !stored
        ? 'pending'
        : stored === current
          ? 'applied'
          : 'applied (file has changed since)'
      console.log(`  ${state.padEnd(32)} ${file}`)
    }
    return
  }

  if (baseline) {
    for (const file of files) {
      const sum = checksum(readFileSync(join(dir, file), 'utf8'))
      await runSql(`
        insert into public.schema_migrations (version, checksum)
        values ('${file}', '${sum}')
        on conflict (version) do nothing;
      `)
    }
    console.log(`Recorded ${files.length} migration(s) as applied, without running them.`)
    return
  }

  // A file that changed after being applied is a mistake worth stopping for:
  // editing an applied migration means the database and the repo disagree.
  for (const file of files) {
    const stored = applied.get(file)
    if (!stored) continue
    const current = checksum(readFileSync(join(dir, file), 'utf8'))
    if (stored !== current) {
      console.error(
        `\n${file} has changed since it was applied.\n` +
          'Applied migrations are history — add a new migration instead of editing this one.\n' +
          'If the edit is genuinely safe, delete its row from public.schema_migrations.\n',
      )
      process.exit(1)
    }
  }

  if (!pending.length) {
    console.log(`Nothing to apply — all ${files.length} migration(s) are up to date.`)
    return
  }

  console.log(`Applying ${pending.length} of ${files.length} migration(s) to ${ref}\n`)

  for (const file of pending) {
    const sql = readFileSync(join(dir, file), 'utf8')
    process.stdout.write(`  ${file} … `)
    try {
      await runSql(sql)
      await runSql(`
        insert into public.schema_migrations (version, checksum)
        values ('${file}', '${checksum(sql)}');
      `)
      console.log('ok')
    } catch (error) {
      console.log('FAILED')
      console.error(`\n${(error as Error).message}\n`)
      process.exit(1)
    }
  }

  const summary = await runSql(`
    select
      (select count(*) from pg_tables where schemaname = 'public')   as tables,
      (select count(*) from pg_views  where schemaname = 'public')   as views,
      (select count(*) from pg_policies where schemaname = 'public') as policies
  `)

  console.log('\nApplied. Current state:')
  for (const [key, value] of Object.entries(summary[0] ?? {})) {
    console.log(`  ${key.padEnd(10)} ${value}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
