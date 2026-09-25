/**
 * Turns an exported question bank into paper JSON this app can import.
 *
 *   npm run bank:migrate -- migration.config.json --manifest images.json
 *   npm run bank:migrate -- migration.config.json --out papers/
 *   npm run bank:migrate -- migration.config.json --out papers/ --dry-run
 *
 * Run it with --manifest first: that lists every image the export references,
 * ready for `npm run images:convert`. Convert those, point imageBlocks at the
 * result, then run it again to write the papers.
 *
 * Deliberately schema-agnostic: you describe your columns in the config and
 * this maps them onto the block schema, so nothing here assumes how the source
 * database happens to name things.
 *
 * Where content is an image, the block JSON produced by `npm run images:convert`
 * is spliced in by id — so a relation that lived as a PNG arrives here as a
 * relation. Anything with no conversion falls back to the source text.
 *
 * Nothing is written to the database: this emits files for `paper:import`, so
 * you can read the output before any of it goes live.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type { Block } from '../src/lib/blocks/schema'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

interface TableConfig {
  file: string
  map: Record<string, string>
}

interface MigrationConfig {
  papers: TableConfig
  questions: TableConfig
  options: TableConfig
  /** Output of `npm run images:convert`, keyed by the ids used in the manifest. */
  imageBlocks?: string
  /**
   * How a row maps to an id in the images:convert manifest. Two placeholders:
   * {image} is the image reference from the export (the usual key, since one
   * image is converted once however many questions use it) and {id} is the
   * question or option id. Defaults to "{image}".
   */
  questionImageId?: string
  optionImageId?: string
  /**
   * Prefix for a bare image reference, when the export stores a filename or a
   * path rather than a full URL — e.g. "https://cdn.example.com/". Question
   * and option images often live in different folders, so this also takes
   * { "question": "…/question_images/", "option": "…/option_images/" }.
   */
  imageBaseUrl?: string | { question?: string; option?: string }
  /** Source subject name -> this app's subject slug. */
  subjects?: Record<string, string>
  /** Source exam name -> this app's exam type slug. */
  examTypes?: Record<string, string>
  /** Source question type -> mcq | msq | numerical | subjective | programming. */
  questionTypes?: Record<string, string>
}

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

const configPath = process.argv[2]
const outDir = flag('out') ?? 'papers'
const manifestOut = flag('manifest')
const dryRun = process.argv.includes('--dry-run')

if (!configPath || configPath.startsWith('--')) {
  console.error(
    'Usage: npm run bank:migrate -- <migration.config.json> [--manifest images.json]\n' +
      '                              [--out papers/] [--dry-run]',
  )
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Reading tables
// ---------------------------------------------------------------------------

type Row = Record<string, string>

/**
 * CSV parser that handles quoted fields, embedded commas and embedded newlines.
 * Exports from real databases contain all three, and a split(',') loses rows
 * silently — which is the worst possible failure for a migration.
 */
function parseCsv(text: string): Row[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }

  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }

  const [header, ...body] = rows.filter((r) => r.some((cell) => cell.trim() !== ''))
  if (!header) return []

  return body.map((cells) =>
    Object.fromEntries(header.map((name, index) => [name.trim(), cells[index] ?? ''])),
  )
}

function readTable(file: string): Row[] {
  const text = readFileSync(file, 'utf8')
  if (file.endsWith('.json')) {
    const parsed = JSON.parse(text)
    return (Array.isArray(parsed) ? parsed : [parsed]).map((entry) =>
      Object.fromEntries(
        Object.entries(entry as Record<string, unknown>).map(([k, v]) => [
          k,
          v === null || v === undefined ? '' : String(v),
        ]),
      ),
    )
  }
  return parseCsv(text)
}

/** Reads a mapped field, tolerating a column the export did not include. */
function field(row: Row, map: Record<string, string>, key: string): string {
  const column = map[key]
  if (!column) return ''
  return (row[column] ?? '').trim()
}

/** Case-insensitive lookup, so "Quiz 1" and "quiz 1" both resolve. */
function lookup(
  table: Record<string, string> | undefined,
  key: string,
): string | undefined {
  if (!table) return undefined
  if (table[key] !== undefined) return table[key]
  const wanted = key.trim().toLowerCase()
  for (const [name, value] of Object.entries(table)) {
    if (name.trim().toLowerCase() === wanted) return value
  }
  return undefined
}

function truthy(value: string): boolean {
  return ['1', 'true', 't', 'yes', 'y'].includes(value.toLowerCase())
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

interface ConvertedImage {
  id: string
  blocks: Block[]
  confidence: number
  error?: string
}

const VALID_TYPES = new Set(['mcq', 'msq', 'numerical', 'subjective', 'programming'])

function main() {
  const config = JSON.parse(readFileSync(configPath, 'utf8')) as MigrationConfig

  // Paths in the config are relative to the config file, not to wherever the
  // command happens to be run from — that is what everyone expects, and the
  // alternative fails confusingly the first time someone moves the folder.
  const base = dirname(resolve(configPath))
  const near = (file: string) => (isAbsolute(file) ? file : join(base, file))

  const papers = readTable(near(config.papers.file))
  const questions = readTable(near(config.questions.file))
  const options = readTable(near(config.options.file))

  const imageBlocks = new Map<string, ConvertedImage>()
  const imageBlocksPath = config.imageBlocks ? near(config.imageBlocks) : null
  if (imageBlocksPath && existsSync(imageBlocksPath)) {
    for (const entry of JSON.parse(readFileSync(imageBlocksPath, 'utf8')) as ConvertedImage[]) {
      if (!entry.error && entry.blocks.length) imageBlocks.set(entry.id, entry)
    }
  }

  console.log(
    `Read ${papers.length} papers, ${questions.length} questions, ` +
      `${options.length} options, ${imageBlocks.size} converted images\n`,
  )

  const questionsByPaper = new Map<string, Row[]>()
  for (const question of questions) {
    const paperId = field(question, config.questions.map, 'paper_id')
    questionsByPaper.set(paperId, [...(questionsByPaper.get(paperId) ?? []), question])
  }

  const optionsByQuestion = new Map<string, Row[]>()
  for (const option of options) {
    const questionId = field(option, config.options.map, 'question_id')
    optionsByQuestion.set(questionId, [...(optionsByQuestion.get(questionId) ?? []), option])
  }

  if (manifestOut) {
    // One entry per distinct image: the same figure reused across questions is
    // converted once, which is the whole reason conversions are keyed by the
    // image reference rather than by the row that mentions it.
    const seen = new Map<string, { id: string; url: string; kind: 'question' | 'option' }>()
    const bases =
      typeof config.imageBaseUrl === 'string'
        ? { question: config.imageBaseUrl, option: config.imageBaseUrl }
        : (config.imageBaseUrl ?? {})

    // The id is built with the same template the splice looks up by, so what
    // images:convert writes lands under the key this script will ask for.
    function add(
      row: Row,
      map: Record<string, string>,
      template: string,
      kind: 'question' | 'option',
    ) {
      const ref = field(row, map, 'image')
      if (!ref) return
      const id = template.replace('{image}', ref).replace('{id}', field(row, map, 'id'))
      if (seen.has(id)) return
      const url = /^https?:/.test(ref) ? ref : (bases[kind] ?? '') + ref
      seen.set(id, { id, url, kind })
    }

    for (const question of questions) {
      add(question, config.questions.map, config.questionImageId ?? '{image}', 'question')
    }
    for (const option of options) {
      add(option, config.options.map, config.optionImageId ?? '{image}', 'option')
    }

    const manifest = [...seen.values()]
    writeFileSync(manifestOut, `${JSON.stringify(manifest, null, 2)}\n`)

    const missingPrefix = manifest.filter((entry) => !/^https?:/.test(entry.url)).length
    console.log(`Wrote ${manifest.length} distinct image(s) to ${manifestOut}`)
    console.log(`  question images  ${manifest.filter((m) => m.kind === 'question').length}`)
    console.log(`  option images    ${manifest.filter((m) => m.kind === 'option').length}`)
    if (missingPrefix) {
      console.log(
        `\n${missingPrefix} entr${missingPrefix === 1 ? 'y is' : 'ies are'} not a URL — ` +
          'set "imageBaseUrl" in the config so they can be fetched.',
      )
    }
    console.log(`\nNext:  npm run images:convert -- ${manifestOut} --out image-blocks.json`)
    return
  }

  const warnings: string[] = []
  const stats = {
    papers: 0,
    questions: 0,
    fromImages: 0,
    stillImages: 0,
    noKey: 0,
    lowConfidence: 0,
  }

  if (!dryRun) mkdirSync(outDir, { recursive: true })

  for (const paper of papers) {
    const pm = config.papers.map
    const paperId = field(paper, pm, 'id')
    const sourceSubject = field(paper, pm, 'subject')
    const sourceExam = field(paper, pm, 'exam_type')

    const subject = lookup(config.subjects, sourceSubject) ?? slugify(sourceSubject)
    const examType = lookup(config.examTypes, sourceExam) ?? slugify(sourceExam)

    const paperQuestions = (questionsByPaper.get(paperId) ?? []).sort(
      (a, b) =>
        Number(field(a, config.questions.map, 'number')) -
        Number(field(b, config.questions.map, 'number')),
    )

    if (!paperQuestions.length) {
      warnings.push(`paper ${paperId} (${sourceSubject}) has no questions — skipped`)
      continue
    }

    const built = paperQuestions.map((question, index) => {
      const qm = config.questions.map
      const questionId = field(question, qm, 'id')

      const sourceType = field(question, qm, 'type')
      const type = (lookup(config.questionTypes, sourceType) ?? sourceType).toLowerCase()
      if (!VALID_TYPES.has(type)) {
        warnings.push(`question ${questionId}: unmapped type "${sourceType}" — treated as mcq`)
      }

      // Body: the source text, then whatever the image converted into.
      const body: Block[] = []
      const text = field(question, qm, 'text')
      if (text) body.push({ type: 'text', md: text })

      const imageRef = field(question, qm, 'image')
      if (imageRef) {
        const key = (config.questionImageId ?? '{image}')
          .replace('{image}', imageRef)
          .replace('{id}', questionId)
        const converted = imageBlocks.get(key) ?? imageBlocks.get(imageRef)
        if (converted) {
          body.push(...converted.blocks)
          stats.fromImages += 1
          if (converted.confidence < 0.8) stats.lowConfidence += 1
          if (converted.blocks.some((b) => b.type === 'image')) stats.stillImages += 1
        } else {
          warnings.push(`question ${questionId}: image not converted — content will be missing`)
        }
      }

      if (!body.length) {
        body.push({ type: 'text', md: '(no content in the export for this question)' })
        warnings.push(`question ${questionId}: empty body`)
      }

      const builtOptions = (optionsByQuestion.get(questionId) ?? []).map((option, oi) => {
        const om = config.options.map
        const optionId = field(option, om, 'id')
        const content: Block[] = []

        const optionText = field(option, om, 'text')
        if (optionText) content.push({ type: 'text', md: optionText })

        const optionImage = field(option, om, 'image')
        if (optionImage) {
          const key = (config.optionImageId ?? '{image}')
            .replace('{image}', optionImage)
            .replace('{id}', optionId)
          const converted = imageBlocks.get(key) ?? imageBlocks.get(optionImage)
          if (converted) {
            content.push(...converted.blocks)
            stats.fromImages += 1
            if (converted.blocks.some((b) => b.type === 'image')) stats.stillImages += 1
          } else {
            warnings.push(`option ${optionId}: image not converted`)
          }
        }

        if (!content.length) content.push({ type: 'text', md: '(empty option)' })

        return {
          label: field(option, om, 'label') || String.fromCharCode(65 + oi),
          content,
          is_correct: truthy(field(option, om, 'is_correct')),
        }
      })

      const choice = type === 'mcq' || type === 'msq'
      if (choice && !builtOptions.some((o) => o.is_correct)) stats.noKey += 1

      stats.questions += 1

      const marks = Number(field(question, qm, 'marks')) || 1
      const answer = field(question, qm, 'correct_answer')

      return {
        number: Number(field(question, qm, 'number')) || index + 1,
        type: VALID_TYPES.has(type) ? type : 'mcq',
        marks,
        ...(builtOptions.length ? { options: builtOptions } : {}),
        ...(answer ? { correct_answer: answer } : {}),
        body,
      }
    })

    const sessionDate = field(paper, pm, 'session_date').slice(0, 10) || undefined
    const setCode = field(paper, pm, 'set_code') || paperId.slice(0, 8)

    const output = {
      schema_version: 1,
      subject,
      exam_type: examType,
      ...(sessionDate ? { session_date: sessionDate } : {}),
      set_code: setCode,
      ...(field(paper, pm, 'title') ? { title: field(paper, pm, 'title') } : {}),
      ...(Number(field(paper, pm, 'duration_minutes'))
        ? { duration_minutes: Number(field(paper, pm, 'duration_minutes')) }
        : {}),
      ...(Number(field(paper, pm, 'total_marks'))
        ? { total_marks: Number(field(paper, pm, 'total_marks')) }
        : {}),
      questions: built,
    }

    stats.papers += 1

    if (!dryRun) {
      const name = `${subject}-${examType}-${sessionDate ?? 'undated'}-${setCode}.json`
        .replace(/[^a-zA-Z0-9.\-]/g, '-')
        .toLowerCase()
      writeFileSync(join(outDir, name), `${JSON.stringify(output, null, 2)}\n`)
    }
  }

  console.log(`${dryRun ? 'Would write' : 'Wrote'} ${stats.papers} paper file(s)`)
  console.log(`  questions          ${stats.questions}`)
  console.log(`  blocks from images ${stats.fromImages}`)
  console.log(`  still a picture    ${stats.stillImages}`)
  console.log(`  below 0.8          ${stats.lowConfidence}  (review first)`)
  console.log(`  no answer key      ${stats.noKey}  (will always mark wrong)`)

  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s):`)
    for (const warning of warnings.slice(0, 40)) console.log(`  ${warning}`)
    if (warnings.length > 40) console.log(`  … and ${warnings.length - 40} more`)
  }

  if (!dryRun) {
    console.log(`\nNext:  npm run paper:validate -- ${outDir}/<one>.json`)
    console.log(`       npm run paper:import   -- ${outDir}/*.json --draft`)
  }
}

main()
