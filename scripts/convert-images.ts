/**
 * Bulk-converts question images into content blocks.
 *
 * Built for migrating a bank whose content is stored as pictures: point it at a
 * manifest of image URLs (or local files) and it returns block JSON for each,
 * ready to be stitched into papers alongside metadata that comes from wherever
 * it already lives.
 *
 *   npm run images:convert -- manifest.json --out blocks.json
 *   npm run images:convert -- manifest.json --out blocks.json --concurrency 4
 *   npm run images:convert -- manifest.json --out blocks.json --limit 20
 *
 * The manifest is a JSON array. `id` is yours — a question id, an option id,
 * whatever lets you put the result back where it belongs:
 *
 *   [
 *     { "id": "q-6406532158835", "url": "https://…/question_images/abc.png",
 *       "kind": "question" },
 *     { "id": "opt-91", "url": "https://…/option_images/def.png",
 *       "kind": "option" }
 *   ]
 *
 * Results are cached by image URL in .cache/image-blocks/, so a re-run after a
 * crash costs nothing for what already succeeded. Delete the cache to redo.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, extname } from 'node:path'
import { createHash } from 'node:crypto'
import { config as loadEnv } from 'dotenv'
import { extractBlocksFromImage, ExtractionError } from '../src/lib/extract'
import type { Block } from '../src/lib/blocks/schema'

loadEnv({ path: '.env.local', quiet: true })
loadEnv({ quiet: true })

const CACHE_DIR = join(process.cwd(), '.cache', 'image-blocks')

interface ManifestEntry {
  id: string
  url?: string
  file?: string
  kind?: 'question' | 'option' | 'solution'
  hint?: string
}

interface ConvertedEntry {
  id: string
  source: string
  kind: string
  blocks: Block[]
  confidence: number
  notes: string | null
  error?: string
}

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

const manifestPath = process.argv[2]
const outPath = flag('out') ?? 'image-blocks.json'
const concurrency = Math.max(1, Math.min(8, Number(flag('concurrency') ?? 3)))
const limit = Number(flag('limit') ?? Infinity)

if (!manifestPath || manifestPath.startsWith('--')) {
  console.error(
    'Usage: npm run images:convert -- <manifest.json> [--out blocks.json]\n' +
      '                                [--concurrency 3] [--limit N]',
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

function mediaTypeFor(source: string): 'image/png' | 'image/jpeg' | 'image/webp' {
  const ext = extname(new URL(source, 'file://localhost/').pathname).toLowerCase()
  return MEDIA_TYPES[ext] ?? 'image/png'
}

function cachePath(source: string): string {
  return join(CACHE_DIR, `${createHash('sha256').update(source).digest('hex')}.json`)
}

async function loadImage(entry: ManifestEntry): Promise<Buffer> {
  if (entry.file) return readFileSync(entry.file)
  const response = await fetch(entry.url!)
  if (!response.ok) throw new Error(`fetch ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

const HINTS: Record<string, string> = {
  question: 'part of a question stem — a table, code listing, equation or diagram',
  option: 'one multiple-choice option',
  solution: 'part of a worked solution',
}

async function convert(entry: ManifestEntry): Promise<ConvertedEntry> {
  const source = entry.url ?? entry.file!
  const cached = cachePath(source)

  if (existsSync(cached)) {
    return JSON.parse(readFileSync(cached, 'utf8')) as ConvertedEntry
  }

  const base = { id: entry.id, source, kind: entry.kind ?? 'question' }

  try {
    const image = await loadImage(entry)
    const result = await extractBlocksFromImage(
      {
        image,
        mediaType: mediaTypeFor(source),
        hint: entry.hint ?? HINTS[entry.kind ?? 'question'],
      },
      apiKey!,
    )

    const converted: ConvertedEntry = {
      ...base,
      blocks: result.blocks,
      confidence: result.confidence,
      notes: result.notes,
    }

    // Only successes are cached: a failure is usually transient (a timeout, a
    // rate limit) and should be retried on the next run, not frozen in.
    writeFileSync(cached, JSON.stringify(converted, null, 2))
    tokens.input += result.usage.inputTokens
    tokens.output += result.usage.outputTokens
    tokens.cached += result.usage.cacheReadTokens
    return converted
  } catch (error) {
    return {
      ...base,
      blocks: [],
      confidence: 0,
      notes: null,
      error: error instanceof ExtractionError ? error.message : (error as Error).message,
    }
  }
}

const tokens = { input: 0, output: 0, cached: 0 }

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true })

  const manifest = (JSON.parse(readFileSync(manifestPath, 'utf8')) as ManifestEntry[])
    .filter((entry) => entry.url || entry.file)
    .slice(0, limit)

  if (!manifest.length) {
    console.error('Manifest has no entries with a url or file.')
    process.exit(1)
  }

  console.log(`Converting ${manifest.length} image(s), ${concurrency} at a time\n`)

  const results: ConvertedEntry[] = []
  let done = 0
  let failed = 0
  let lowConfidence = 0

  // A simple worker pool: image conversion is IO- and API-bound, and running
  // the whole manifest at once is the fastest way to get rate-limited.
  const queue = [...manifest]
  async function worker() {
    for (;;) {
      const entry = queue.shift()
      if (!entry) return

      const converted = await convert(entry)
      results.push(converted)
      done += 1

      if (converted.error) {
        failed += 1
        console.log(`  [${done}/${manifest.length}] FAIL ${entry.id} — ${converted.error}`)
      } else {
        if (converted.confidence < 0.8) lowConfidence += 1
        const summary = converted.blocks.map((b) => b.type).join('+') || 'no blocks'
        console.log(
          `  [${done}/${manifest.length}] ${entry.id} → ${summary} (${converted.confidence.toFixed(2)})`,
        )
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))

  // Preserve manifest order; the worker pool finishes out of order.
  const order = new Map(manifest.map((entry, index) => [entry.id, index]))
  results.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))

  writeFileSync(outPath, `${JSON.stringify(results, null, 2)}\n`)

  const imageBlocks = results.filter((r) => r.blocks.some((b) => b.type === 'image')).length

  console.log(`\nWrote ${results.length} result(s) to ${outPath}`)
  console.log(`  converted        ${results.length - failed}`)
  console.log(`  failed           ${failed}`)
  console.log(`  below 0.8        ${lowConfidence}  (review these first)`)
  console.log(`  still a picture  ${imageBlocks}  (genuinely spatial content)`)
  console.log(
    `\nTokens: ${tokens.input} in (${tokens.cached} from cache), ${tokens.output} out`,
  )
  console.log('Cached results are reused on the next run — safe to re-run after a failure.')

  if (failed) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
