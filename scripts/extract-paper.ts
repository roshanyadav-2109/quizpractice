/**
 * Turn scanned question papers into block JSON.
 *
 *   npm run paper:extract -- scans/dbms-q1.png --subject dbms --exam quiz-1 \
 *     --date 2026-07-16 --set 1563 --out papers/dbms-quiz1-1563.json
 *
 * Pass several images to transcribe a multi-page paper into one file.
 * Nothing is written to the database — review the JSON, fix what the model got
 * wrong, then run `npm run paper:import`.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { extname, basename } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { extractQuestions, ExtractionError } from '../src/lib/extract'

loadEnv({ path: '.env.local', quiet: true })
loadEnv({ quiet: true })

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

const images = process.argv.slice(2).filter((arg, index, all) => {
  if (arg.startsWith('--')) return false
  const previous = all[index - 1]
  return !(previous && previous.startsWith('--'))
})

const subject = flag('subject')
const examType = flag('exam')
const sessionDate = flag('date') ?? null
const setCode = flag('set') ?? null
const outFile = flag('out')
const hint = flag('hint')

if (!images.length || !subject || !examType) {
  console.error(
    'Usage: npm run paper:extract -- <image...> --subject <slug> --exam <slug>\n' +
      '                             [--date YYYY-MM-DD] [--set CODE] [--out file.json] [--hint "..."]',
  )
  process.exit(1)
}

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  console.error('Missing ANTHROPIC_API_KEY. Add it to .env.local.')
  process.exit(1)
}

const MEDIA_TYPES: Record<string, 'image/png' | 'image/jpeg' | 'image/webp'> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

async function main() {
  const questions: unknown[] = []
  const allNotes: string[] = []
  let totalIn = 0
  let totalOut = 0
  let totalCached = 0
  const confidences: number[] = []

  for (const [index, file] of images.entries()) {
    if (!existsSync(file)) {
      console.error(`  SKIP  ${file} — no such file`)
      continue
    }

    const mediaType = MEDIA_TYPES[extname(file).toLowerCase()]
    if (!mediaType) {
      console.error(`  SKIP  ${file} — expected .png, .jpg or .webp`)
      continue
    }

    process.stdout.write(`  reading ${basename(file)} … `)

    try {
      const result = await extractQuestions(
        {
          image: readFileSync(file),
          mediaType,
          subject: subject!,
          examType: examType!,
          sessionDate,
          setCode,
          hint:
            hint ??
            (images.length > 1 ? `page ${index + 1} of ${images.length}` : undefined),
        },
        apiKey!,
      )

      questions.push(...result.paper.questions)
      allNotes.push(...result.notes)
      confidences.push(result.confidence)
      totalIn += result.usage.inputTokens
      totalOut += result.usage.outputTokens
      totalCached += result.usage.cacheReadTokens

      const low = Object.entries(result.perQuestionConfidence).filter(
        ([, value]) => value < 0.8,
      )

      console.log(
        `${result.paper.questions.length} question(s), confidence ${result.confidence.toFixed(2)}` +
          (low.length ? `, ${low.length} below 0.8` : ''),
      )
    } catch (error) {
      console.log('failed')
      if (error instanceof ExtractionError) {
        console.error(`        ${error.message}`)
      } else {
        console.error(`        ${(error as Error).message}`)
      }
    }
  }

  if (!questions.length) {
    console.error('\nNothing was extracted.')
    process.exit(1)
  }

  // Renumber defensively: a multi-page paper can repeat numbering per page.
  const seen = new Set<number>()
  for (const question of questions as { number: number }[]) {
    while (seen.has(question.number)) question.number += 1
    seen.add(question.number)
  }

  const paper = {
    schema_version: 1,
    subject,
    exam_type: examType,
    ...(sessionDate ? { session_date: sessionDate } : {}),
    ...(setCode ? { set_code: setCode } : {}),
    questions,
  }

  const destination =
    outFile ?? `${subject}-${examType}${setCode ? `-${setCode}` : ''}.json`
  writeFileSync(destination, `${JSON.stringify(paper, null, 2)}\n`, 'utf8')

  const average =
    confidences.reduce((sum, value) => sum + value, 0) / (confidences.length || 1)

  console.log(`\nWrote ${questions.length} question(s) to ${destination}`)
  console.log(`Average confidence ${average.toFixed(2)}`)
  console.log(
    `Tokens: ${totalIn} in (${totalCached} from cache), ${totalOut} out`,
  )

  if (allNotes.length) {
    console.log('\nThe model flagged these:')
    for (const note of allNotes) console.log(`  ${note}`)
  }

  console.log(
    '\nReview the file before importing — extraction is a first pass, not a source of truth.',
  )
  console.log(`  npm run paper:validate -- ${destination}`)
  console.log(`  npm run paper:import -- ${destination} --draft`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
