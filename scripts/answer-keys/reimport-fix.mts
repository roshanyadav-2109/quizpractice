// One-off: re-imports specific already-loaded papers after a content fix
// (e.g. drive-final2 papers patched after their first import), bypassing the
// main importer's resumable log entirely - every file given is redone.
//
//   npx tsx scripts/answer-keys/reimport-fix.mts <relFiles.json> <papersDir>
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { importPaper } from '../../src/lib/import-paper'

loadEnv({ path: '.env.local', quiet: true })
const [relFilesPath, papersDir] = process.argv.slice(2)
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const rels: string[] = JSON.parse(readFileSync(relFilesPath, 'utf8'))
const files = rels.map((r) => join(papersDir, r))
console.log('re-importing', files.length, 'already-loaded papers with the fix')

let n = 0
let failed = 0
const queue = [...files]
await Promise.all(Array.from({ length: 3 }, async () => {
  while (queue.length) {
    const f = queue.shift()!
    try {
      await importPaper(JSON.parse(readFileSync(f, 'utf8')), supabase, { publish: true })
    } catch (e) {
      failed++
      console.log('FAIL', f, (e as Error).message)
    }
    if (++n % 25 === 0) console.log('reimported', n, '/', files.length)
  }
}))
console.log('finished', n, 'failed', failed)
