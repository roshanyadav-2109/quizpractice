// Uploads the figure sheets made by sheets.py, then writes each paper with
// every figure pointing at its part of its sheet. Resumable: finished uploads
// are kept in the cache.
//
// Two Cloudinary accounts are used, the sheets account first
// (CLOUDINARY_SHEETS_* in .env.local), then the site's own. Each account's
// 30-day credits are read before uploading, and a sheet goes to the first
// account still under its cap: one credit per 1,000 uploads plus one per GB
// stored. The caps (90% for the sheets account, 80% for the site's own) keep
// room for people viewing the images. When neither has room, the sheet is not
// uploaded and its paper is held back.
//
//   node upload-sheets.mjs <repo> <papers dir> <sheets dir> <out dir> <cache.json>
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createRequire } from 'node:module'

const [repo, papersDir, sheetsDir, outDir, cachePath] = process.argv.slice(2)
const require = createRequire(join(repo, 'package.json'))
const { v2: cloudinary } = require('cloudinary')

const env = Object.fromEntries(readFileSync(join(repo, '.env.local'), 'utf8').split(/\r?\n/)
  .filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]))

const accounts = [
  { cloud_name: env.CLOUDINARY_SHEETS_CLOUD_NAME, api_key: env.CLOUDINARY_SHEETS_API_KEY, api_secret: env.CLOUDINARY_SHEETS_API_SECRET, cap: 0.9 },
  { cloud_name: env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, api_key: env.CLOUDINARY_API_KEY, api_secret: env.CLOUDINARY_API_SECRET, cap: 0.8 },
].filter((a) => a.cloud_name && a.api_key && a.api_secret)
for (const account of accounts) {
  const { cap, ...credentials } = account
  const usage = await cloudinary.api.usage(credentials)
  account.credentials = credentials
  account.room = usage.credits.limit * cap - usage.credits.usage
  console.log(`${account.cloud_name}: ${usage.credits.usage.toFixed(2)} of ${usage.credits.limit} credits used, room for ${Math.max(0, account.room).toFixed(2)}`)
}
const costOf = (bytes) => 0.001 + bytes / 1e9
function accountFor(bytes) {
  const account = accounts.find((a) => a.room >= costOf(bytes))
  if (account) account.room -= costOf(bytes)
  return account
}

const map = JSON.parse(readFileSync(join(sheetsDir, 'map.json'), 'utf8'))
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {}

// Each sheet is filed beside where its figures would have gone:
// qp/<programme>/<subject>/<exam>/<date>/set-<code>/sheet-<n>
const jobs = []
for (const [rel, entry] of Object.entries(map)) {
  const anyFigure = Object.keys(entry.figures)[0]
  if (!anyFigure) continue
  const folder = anyFigure.slice(0, anyFigure.lastIndexOf('/'))
  entry.sheets.forEach((sheet, i) => {
    sheet.public_id = `${folder}/sheet-${i + 1}`
    if (!cache[sheet.public_id]) jobs.push({ rel, sheet })
  })
}
console.log(`papers ${Object.keys(map).length} | sheets to upload ${jobs.length}`)

let done = 0
let failed = 0
let full = 0
const save = () => writeFileSync(cachePath, JSON.stringify(cache))
await Promise.all(Array.from({ length: 4 }, async () => {
  while (jobs.length) {
    const { sheet } = jobs.shift()
    const file = join(sheetsDir, sheet.file)
    const account = accountFor(statSync(file).size)
    if (!account) {
      full++
      continue
    }
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await cloudinary.uploader.upload(file, { ...account.credentials, public_id: sheet.public_id, overwrite: true, resource_type: 'image' })
        cache[sheet.public_id] = { cloud: account.cloud_name, version: r.version, format: r.format, width: r.width, height: r.height, bytes: r.bytes }
        break
      } catch (e) {
        if (attempt >= 4) { failed++; console.log('FAIL', sheet.public_id, e.message || e.error?.message); break }
        await new Promise((res) => setTimeout(res, 3000 * (attempt + 1)))
      }
    }
    if (++done % 100 === 0) { save(); console.log('uploaded', done) }
  }
}))
save()
console.log('upload done', done, 'failed', failed, full ? `| no account had room for ${full}` : '')

// Rewrite every figure as a window onto its sheet, shown at 1x (the figures
// were rendered at 2x for sharpness).
const visit = (node, fn) => {
  if (Array.isArray(node)) return node.forEach((n) => visit(n, fn))
  if (node && typeof node === 'object') {
    if (typeof node.public_id === 'string' && node.source_url) fn(node)
    Object.values(node).forEach((v) => visit(v, fn))
  }
}
let written = 0
let held = 0
for (const [rel, entry] of Object.entries(map)) {
  const paper = JSON.parse(readFileSync(join(papersDir, rel), 'utf8'))
  let ok = true
  visit(paper, (ref) => {
    const figure = entry.figures[ref.public_id]
    const sheet = figure && entry.sheets[figure.sheet - 1]
    const stored = sheet && cache[sheet.public_id]
    if (!stored) { ok = false; return }
    // Figure pixels per display pixel: 1.5 suits crops rendered at 2x (the
    // answer-key PDFs); a paper can set its own, e.g. 1 for screenshots.
    const scale = typeof ref.display_scale === 'number' ? ref.display_scale : 1.5
    for (const key of Object.keys(ref)) delete ref[key]
    Object.assign(ref, {
      provider: 'cloudinary',
      public_id: sheet.public_id,
      version: stored.version,
      format: stored.format,
      width: Math.max(1, Math.round(figure.width / scale)),
      height: Math.max(1, Math.round(figure.height / scale)),
      delivery: 'original',
      cloud: stored.cloud ?? env.CLOUDINARY_SHEETS_CLOUD_NAME,
      region: { x: figure.x, y: figure.y, width: figure.width, height: figure.height, sheet_width: stored.width, sheet_height: stored.height },
    })
  })
  if (!ok) { held++; continue }
  const out = join(outDir, rel)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(paper))
  written++
}
console.log('papers ready', written, '| held back', held)
