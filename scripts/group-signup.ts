/**
 * Sends the emails waiting in public.group_signups to the main site's
 * announcement groups, by hand — what the daily job does.
 *
 *   npm run group:sync            up to 100 waiting emails
 *   npm run group:sync -- --status   how many are waiting, done, failed
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (.env.local).
 */
import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { sendPendingGroupSignups } from '../src/lib/group-signup'

loadEnv({ path: '.env.local', quiet: true })
loadEnv({ quiet: true })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.')
  process.exit(1)
}
const db = createClient(url, key, { auth: { persistSession: false } })

if (process.argv.includes('--status')) {
  const { data, error } = await db.from('group_signups').select('status, group_number')
  if (error) throw error
  const by = new Map<string, number>()
  for (const row of data ?? []) by.set(row.status, (by.get(row.status) ?? 0) + 1)
  console.log([...by.entries()].map(([status, count]) => `${status}: ${count}`).join('  ') || 'empty')
} else {
  console.log(await sendPendingGroupSignups(db, { limit: 100 }))
}
