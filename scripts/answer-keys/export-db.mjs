// What the database already holds, for comparing against the answer keys:
// subjects.json (slugs, names, aliases, level, programme) and
// db-inventory.json (every paper with its sets and question counts).
//
//   node <repo>/scripts/answer-keys/export-db.mjs <repo>
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const repo = process.argv[2] ?? '.'
const require = createRequire(join(repo, 'package.json'))
const { createClient } = require('@supabase/supabase-js')
const env = Object.fromEntries(readFileSync(join(repo, '.env.local'), 'utf8').split(/\r?\n/)
  .filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]))
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const { data: subjects, error: subjectError } = await db
  .from('subjects')
  .select('id, slug, name, code, aliases, level:levels(slug, name, program:programs(slug))')
if (subjectError) throw subjectError
writeFileSync('subjects.json', JSON.stringify(subjects, null, 1))

const papers = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from('question_papers')
    .select('id, title, session_date, status, subject:subjects(slug, name), exam:exam_types(slug), sets:question_sets(id, set_code, questions(count))')
    .range(from, from + 999)
  if (error) throw error
  papers.push(...data)
  if (data.length < 1000) break
}
writeFileSync('db-inventory.json', JSON.stringify(papers, null, 1))
console.log(`subjects ${subjects.length} | papers ${papers.length}`)
process.exit(0)
