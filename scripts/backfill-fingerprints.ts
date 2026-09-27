/**
 * Fills in every question's fingerprint — and its strict and option-order
 * hashes — through backfill_fingerprints() from 0025_question_fingerprints.sql.
 * Triggers keep them current from then on; this is for the rows that existed
 * before, and for a new normaliser version.
 *
 *   npx tsx scripts/backfill-fingerprints.ts
 *   npx tsx scripts/backfill-fingerprints.ts dbms python     # only these subjects
 *
 * (Worth a package.json alias, "db:fingerprints", next to db:push.)
 *
 * One subject per call. A subject too large for the API's 8-second statement
 * limit is redone paper by paper. Safe to re-run: only rows whose fingerprint
 * changes are written, and no explanation is sent back to review.
 */
import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

loadEnv({ path: '.env.local', quiet: true })
loadEnv({ quiet: true })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Copy .env.example to .env.local and fill them in.',
  )
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const only = new Set(process.argv.slice(2).filter((arg) => !arg.startsWith('--')))

/** Postgres gave up on the statement: too much for one call. */
const TIMED_OUT = '57014'

async function backfill(subjectId: string, paperId: string | null = null): Promise<number> {
  const { data, error } = await supabase.rpc('backfill_fingerprints', { p_subject: subjectId, p_paper: paperId })
  if (error) throw Object.assign(new Error(error.message), { code: error.code })
  return Number(data ?? 0)
}

async function backfillByPaper(subjectId: string): Promise<number> {
  const { data, error } = await supabase.from('question_papers').select('id').eq('subject_id', subjectId)
  if (error) throw new Error(`papers failed — ${error.message}`)
  let updated = 0
  for (const paper of (data ?? []) as { id: string }[]) {
    updated += await backfill(subjectId, paper.id)
  }
  return updated
}

async function main() {
  const { data, error } = await supabase.from('subjects').select('id, slug').order('slug')
  if (error) throw new Error(`subjects failed — ${error.message}`)

  const subjects = ((data ?? []) as { id: string; slug: string }[]).filter(
    (subject) => only.size === 0 || only.has(subject.slug),
  )
  if (!subjects.length) {
    console.error(only.size ? `No subject matches ${[...only].join(', ')}.` : 'No subjects found.')
    process.exit(1)
  }

  const started = Date.now()
  let total = 0
  let failures = 0

  for (const subject of subjects) {
    const t0 = Date.now()
    try {
      let updated: number
      let how = ''
      try {
        updated = await backfill(subject.id)
      } catch (error) {
        if ((error as { code?: string }).code !== TIMED_OUT) throw error
        updated = await backfillByPaper(subject.id)
        how = ' (paper by paper)'
      }
      total += updated
      console.log(`  ok    ${subject.slug.padEnd(40)} ${String(updated).padStart(5)} updated${how}  ${((Date.now() - t0) / 1000).toFixed(1)} s`)
    } catch (error) {
      failures += 1
      console.error(`  FAIL  ${subject.slug} — ${(error as Error).message}`)
    }
  }

  const { count: linked } = await supabase
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .not('fingerprint', 'is', null)

  console.log(
    `\n${total} question${total === 1 ? '' : 's'} updated across ${subjects.length} subject${subjects.length === 1 ? '' : 's'} ` +
      `in ${((Date.now() - started) / 1000).toFixed(0)} s. ${linked ?? '?'} questions now carry a fingerprint.`,
  )
  if (total > 0) {
    console.log('Run `npm run cache:refresh` so cached explanations pick up the new links.')
  }
  if (failures) process.exit(1)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
