// Imports a folder of paper JSON through the app's own importer. Sets of the
// same paper go one after another (they share a paper row); different papers
// run three at a time. Resumable: each finished file is logged and skipped.
import { readFileSync, readdirSync, statSync, existsSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { importPaper } from '../../src/lib/import-paper'

loadEnv({ path: '.env.local', quiet: true })
const [root, logPath] = process.argv.slice(2)
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const files: string[] = []
const walk = (d: string) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    if (statSync(p).isDirectory()) walk(p)
    else if (p.endsWith('.json')) files.push(p)
  }
}
walk(root)
const done = new Set(existsSync(logPath) ? readFileSync(logPath, 'utf8').split('\n').filter((l) => l.startsWith('ok ')).map((l) => l.slice(3).split(' | ')[0]) : [])

const groups = new Map<string, string[]>()
for (const f of files.sort()) {
  if (done.has(f)) continue
  const p = JSON.parse(readFileSync(f, 'utf8'))
  const key = `${p.subject}|${p.exam_type}|${p.session_date}`
  groups.set(key, [...(groups.get(key) ?? []), f])
}
const queue = [...groups.values()]
console.log(`files ${files.length} | done ${done.size} | papers to import ${queue.length}`)

let n = 0
let failed = 0
await Promise.all(Array.from({ length: Number(process.env.IMPORT_WORKERS) || 3 }, async () => {
  while (queue.length) {
    const group = queue.shift()!
    for (const f of group) {
      try {
        const r = await importPaper(JSON.parse(readFileSync(f, 'utf8')), supabase, { publish: true })
        appendFileSync(logPath, `ok ${f} | ${r.questionCount}q ${r.warnings.length ? '| ' + r.warnings.join('; ') : ''}\n`)
      } catch (e) {
        failed++
        appendFileSync(logPath, `FAIL ${f} | ${(e as Error).message} ${((e as { issues?: string[] }).issues ?? []).slice(0, 3).join('; ')}\n`)
      }
      if (++n % 50 === 0) console.log('imported', n)
    }
  }
}))
console.log('finished', n, 'failed', failed)
process.exit(0)
