/**
 * Bulk-import question papers from JSON.
 *
 *   npm run paper:import -- schema/example-paper.json
 *   npm run paper:import -- papers/*.json --upload
 *   npm run paper:import -- papers/dbms.json --draft
 *
 * --upload  also upload any image carrying source_url to Cloudinary
 * --draft   import as a draft instead of publishing
 *
 * Re-running the same file replaces that set's questions rather than
 * duplicating them, so a bulk load is safe to repeat after fixing a paper.
 */
import { readFileSync, existsSync } from 'node:fs'
import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { importPaper, ImportError } from '../src/lib/import-paper'

loadEnv({ path: '.env.local', quiet: true })
loadEnv({ quiet: true })

const args = process.argv.slice(2)
const files = args.filter((arg) => !arg.startsWith('--'))
const uploadImages = args.includes('--upload')
const publish = !args.includes('--draft')

if (!files.length) {
  console.error('Usage: npm run paper:import -- <paper.json> [more.json ...] [--upload] [--draft]')
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Copy .env.example to .env.local and fill them in.',
  )
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function main() {
  let failures = 0

  for (const file of files) {
    if (!existsSync(file)) {
      console.error(`  SKIP  ${file} — no such file`)
      failures += 1
      continue
    }

    let json: unknown
    try {
      json = JSON.parse(readFileSync(file, 'utf8'))
    } catch (error) {
      console.error(`  FAIL  ${file} — invalid JSON: ${(error as Error).message}`)
      failures += 1
      continue
    }

    try {
      const result = await importPaper(json, supabase, { uploadImages, publish })

      console.log(
        `  ok    ${file}\n` +
          `        ${result.subjectName} · ${result.examTypeName} · set ${result.setId.slice(0, 8)}\n` +
          `        ${result.questionCount} questions, ${result.optionCount} options, ` +
          `${result.solutionCount} solutions` +
          (result.replacedExisting ? ' (replaced an existing set)' : '') +
          (result.uploadedAssets.length ? `\n        uploaded ${result.uploadedAssets.length} image(s)` : ''),
      )

      for (const warning of result.warnings) {
        console.warn(`        warning: ${warning}`)
      }
    } catch (error) {
      failures += 1
      if (error instanceof ImportError) {
        console.error(`  FAIL  ${file} — ${error.message}`)
        for (const issue of error.issues) console.error(`        ${issue}`)
      } else {
        console.error(`  FAIL  ${file} — ${(error as Error).message}`)
      }
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} of ${files.length} file(s) failed.`)
    process.exit(1)
  }
  console.log(`\nImported ${files.length} paper${files.length === 1 ? '' : 's'}.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
