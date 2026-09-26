// One-off repair: apply-transcriptions' hard_breaks() added a Markdown hard
// break (a trailing backslash) to every line of transcribed prose — including
// table rows, where "| a | b |\" stops the table being a table, and the line
// before a blockquote. This removes exactly those backslashes and nothing else.
//
//   npx tsx scripts/answer-keys/repair-hard-breaks.mts            (dry run)
//   npx tsx scripts/answer-keys/repair-hard-breaks.mts --write    (repair)
//
// --write backs up every affected row's original JSON first, beside this
// run's output, so the repair can be undone.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { repairMarkdown } from './repair-markdown'

loadEnv({ path: '.env.local', quiet: true })
const write = process.argv.includes('--write')
const backupDir = process.env.REPAIR_BACKUP_DIR ?? 'migration/repair-backups'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

type Block = { type: string; md?: string }

function repairBlocks(blocks: Block[]): { blocks: Block[]; changed: boolean } {
  let changed = false
  const next = blocks.map((block) => {
    if (block.type !== 'text' || typeof block.md !== 'string') return block
    const md = repairMarkdown(block.md)
    if (md === block.md) return block
    changed = true
    return { ...block, md }
  })
  return { blocks: next, changed }
}

async function run(table: 'questions' | 'question_options', column: 'body' | 'content') {
  const changed: { id: string; before: Block[]; after: Block[] }[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(`id, ${column}`).order('id').range(from, from + PAGE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    const rows = (data ?? []) as unknown as ({ id: string } & Record<string, Block[]>)[]
    for (const row of rows) {
      const blocks = row[column]
      if (!Array.isArray(blocks)) continue
      const { blocks: after, changed: did } = repairBlocks(blocks)
      if (did) changed.push({ id: row.id, before: blocks, after })
    }
    if (rows.length < PAGE) break
  }
  console.log(`${table}: ${changed.length} rows to repair`)
  if (!changed.length) return
  console.log('  e.g.', JSON.stringify(changed[0].after.find((b) => b.type === 'text')?.md?.slice(0, 160)))

  if (!write) return
  mkdirSync(backupDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = join(backupDir, `${table}-${stamp}.json`)
  writeFileSync(file, JSON.stringify(changed.map(({ id, before }) => ({ id, [column]: before }))))
  console.log(`  backed up originals to ${file}`)

  let done = 0
  const queue = [...changed]
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (queue.length) {
        const item = queue.shift()!
        const { error } = await supabase.from(table).update({ [column]: item.after }).eq('id', item.id)
        if (error) console.log('  FAIL', item.id, error.message)
        else done += 1
      }
    }),
  )
  console.log(`  repaired ${done} of ${changed.length}`)
}

await run('questions', 'body')
await run('question_options', 'content')
if (!write) console.log('\ndry run — pass --write to repair')
