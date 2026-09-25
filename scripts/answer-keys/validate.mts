// Checks every paper JSON under a folder against the import schema, in one
// run, and totals the problems by kind.
//
//   npx tsx scripts/answer-keys/validate.mts <papers dir>
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { importPaperSchema } from '../../src/lib/blocks/schema'
const root = process.argv[2]
const files: string[] = []
const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.json')) files.push(p) } }
walk(root)
let ok = 0
const issues = new Map<string, number>()
for (const f of files) {
  const r = importPaperSchema.safeParse(JSON.parse(readFileSync(f, 'utf8')))
  if (r.success) { ok++; continue }
  for (const i of r.error.issues) { const k = i.path.filter((x) => typeof x === 'string').join('.') + ': ' + i.message; issues.set(k, (issues.get(k) ?? 0) + 1) }
  if (issues.size < 3) console.log('FAIL', f)
}
console.log(`valid ${ok} / ${files.length}`)
for (const [k, n] of [...issues].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${n}x ${k}`)
