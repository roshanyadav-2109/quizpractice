/**
 * Which account did copied questions come from?
 *
 *   npm run watermark:find -- copied.html     a saved page, or any text file
 *   pbpaste | npm run watermark:find          text on the clipboard
 *
 * Reads the invisible marks that every full paper shown to a signed-in
 * student carries (src/lib/watermark.ts), and matches them against every
 * account. Copy the questions from the other site as they are — select and
 * copy, or save the page — since retyping them drops the mark.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (.env.local).
 */
import { readFileSync } from 'node:fs'
import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { markOf, readMarks } from '../src/lib/watermark'

loadEnv({ path: '.env.local', quiet: true })
loadEnv({ quiet: true })

async function main() {
  const file = process.argv[2]
  const text = file ? readFileSync(file, 'utf8') : readFileSync(0, 'utf8')
  const marks = readMarks(text)
  if (marks.length === 0) {
    console.log('No mark found. The text may have been retyped, or it was copied from a public preview, which is not marked.')
    return
  }
  const counts = new Map<string, number>()
  for (const mark of marks) counts.set(mark, (counts.get(mark) ?? 0) + 1)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed (.env.local).')
  const db = createClient(url, key, { auth: { persistSession: false } })

  const owners = new Map<string, { id: string; name: string | null }>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('profiles').select('id, display_name').order('id').range(from, from + 999)
    if (error) throw new Error(`profiles: ${error.message}`)
    for (const row of data ?? []) if (counts.has(markOf(row.id))) owners.set(markOf(row.id), { id: row.id, name: row.display_name })
    if (!data || data.length < 1000) break
  }

  for (const [mark, count] of counts) {
    const owner = owners.get(mark)
    console.log(
      owner
        ? `${count} × mark ${mark} → account ${owner.id}${owner.name ? ` (${owner.name})` : ''}`
        : `${count} × mark ${mark} → no account matches (deleted, or not from this site)`,
    )
  }
  const matched = [...owners.values()]
  if (matched.length > 0) {
    const { data } = await db
      .from('content_access')
      .select('user_id, set_id, opened_at')
      .in('user_id', matched.map((owner) => owner.id))
      .order('opened_at', { ascending: false })
      .limit(20)
    if (data?.length) {
      console.log('\nTheir latest paper openings:')
      for (const row of data) console.log(`  ${row.opened_at}  ${row.user_id}  set ${row.set_id}`)
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
