/**
 * Lists Cloudinary assets no longer referenced by any question, option,
 * solution or extraction.
 *
 *   npm run media:orphans            # report only
 *   npm run media:orphans -- --delete
 *
 * Reporting is the default on purpose: an asset can look orphaned for boring
 * reasons — a paper still in draft, a set mid-reimport — and deleting media is
 * not reversible.
 */
import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

loadEnv({ path: '.env.local', quiet: true })
loadEnv({ quiet: true })

const shouldDelete = process.argv.includes('--delete')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

interface OrphanRow {
  id: string
  public_id: string
  bytes: number | null
  created_at: string
}

async function main() {
  const { data, error } = await supabase
    .from('orphan_media')
    .select('id, public_id, bytes, created_at')
    .order('created_at')

  if (error) {
    console.error(`Could not read orphan_media: ${error.message}`)
    process.exit(1)
  }

  const orphans = (data ?? []) as OrphanRow[]

  if (!orphans.length) {
    console.log('No orphaned media.')
    return
  }

  const totalBytes = orphans.reduce((sum, row) => sum + (row.bytes ?? 0), 0)
  console.log(
    `${orphans.length} orphaned asset(s)${
      totalBytes ? `, ${(totalBytes / 1_048_576).toFixed(1)} MB` : ''
    }:\n`,
  )
  for (const row of orphans) {
    console.log(`  ${row.public_id}`)
  }

  if (!shouldDelete) {
    console.log('\nRe-run with --delete to remove them from Cloudinary and the registry.')
    return
  }

  const { destroyAsset } = await import('../src/lib/cloudinary-server')

  let deleted = 0
  for (const row of orphans) {
    try {
      await destroyAsset(row.public_id)
      await supabase.from('media_assets').delete().eq('id', row.id)
      deleted += 1
      console.log(`  deleted ${row.public_id}`)
    } catch (deleteError) {
      console.error(`  failed  ${row.public_id}: ${(deleteError as Error).message}`)
    }
  }

  console.log(`\nDeleted ${deleted} of ${orphans.length}.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
