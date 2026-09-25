/**
 * Validates a question paper JSON file against the block schema before you
 * import it. Catches structural mistakes at your desk instead of halfway
 * through a bulk load.
 *
 *   npm run paper:validate -- schema/example-paper.json
 */
import { readFileSync } from 'node:fs'
import { importPaperSchema, blocksToText, collectPublicIds } from '../src/lib/blocks/schema'

const file = process.argv[2]

if (!file) {
  console.error('Usage: npm run paper:validate -- <path-to-paper.json>')
  process.exit(1)
}

let raw: unknown
try {
  raw = JSON.parse(readFileSync(file, 'utf8'))
} catch (error) {
  console.error(`Could not read ${file}: ${(error as Error).message}`)
  process.exit(1)
}

const result = importPaperSchema.safeParse(raw)

if (!result.success) {
  console.error(`\n${file} is not a valid question paper.\n`)
  for (const issue of result.error.issues) {
    const path = issue.path.length ? issue.path.join('.') : '(root)'
    console.error(`  ${path}\n    ${issue.message}`)
  }
  console.error('')
  process.exit(1)
}

const paper = result.data
const blockCounts = new Map<string, number>()
let optionCount = 0
let videoCount = 0
const publicIds = new Set<string>()

for (const question of paper.questions) {
  for (const block of question.body) {
    blockCounts.set(block.type, (blockCounts.get(block.type) ?? 0) + 1)
  }
  for (const id of collectPublicIds(question.body)) publicIds.add(id)

  for (const option of question.options ?? []) {
    optionCount += 1
    for (const block of option.content) {
      blockCounts.set(block.type, (blockCounts.get(block.type) ?? 0) + 1)
    }
    for (const id of collectPublicIds(option.content)) publicIds.add(id)
  }

  if (question.solution?.video_url) videoCount += 1
  if (question.solution?.body) {
    for (const id of collectPublicIds(question.solution.body)) publicIds.add(id)
  }
}

const structured = [...blockCounts.entries()]
  .filter(([type]) => type !== 'image')
  .reduce((sum, [, n]) => sum + n, 0)
const images = blockCounts.get('image') ?? 0
const total = structured + images

console.log(`\n${file}`)
console.log(`  subject        ${paper.subject}`)
console.log(`  exam type      ${paper.exam_type}`)
console.log(`  session        ${paper.session_date ?? '(none)'}  set ${paper.set_code ?? '(none)'}`)
console.log(`  questions      ${paper.questions.length}`)
console.log(`  options        ${optionCount}`)
console.log(`  video solutions ${videoCount}/${paper.questions.length}`)
console.log(`  blocks         ${[...blockCounts.entries()].map(([t, n]) => `${t}:${n}`).join('  ')}`)
console.log(
  `  structured     ${structured}/${total} blocks` +
    (total ? ` (${Math.round((structured / total) * 100)}% not pictures)` : ''),
)
if (publicIds.size) {
  console.log(`  cloudinary     ${publicIds.size} asset(s)`)
  for (const id of publicIds) console.log(`                 ${id}`)
}

const preview = blocksToText(paper.questions[0].body).slice(0, 110)
console.log(`  first question "${preview}${preview.length >= 110 ? '…' : ''}"`)
console.log('\nValid.\n')
