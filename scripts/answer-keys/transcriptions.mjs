// Reads the transcriptions of figure crops (Markdown, one "@@ <id>" section
// per image) and checks each one: every $…$ and $$…$$ must render in KaTeX,
// as the site renders it. Writes transcriptions.json and reports what is
// missing or invalid, so those chunks can be redone.
//
//   node transcriptions.mjs <repo> <chunks dir> <out dir> <transcriptions.json>
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const [repo, chunksDir, outDir, resultPath] = process.argv.slice(2)
const require = createRequire(join(repo, 'package.json'))
const katex = require('katex')

/** Every maths span in a Markdown string, outside code fences and code spans. */
function mathSpans(md) {
  const spans = []
  const prose = md.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
  let i = 0
  while (i < prose.length) {
    const c = prose[i]
    if (c === '\\') { i += 2; continue }
    if (c !== '$') { i++; continue }
    const display = prose[i + 1] === '$'
    const open = display ? 2 : 1
    let j = i + open
    let found = -1
    while (j < prose.length) {
      if (prose[j] === '\\') { j += 2; continue }
      if (prose[j] === '$' && (!display || prose[j + 1] === '$')) { found = j; break }
      j++
    }
    if (found === -1) { spans.push({ tex: prose.slice(i + open), display, unclosed: true }); break }
    spans.push({ tex: prose.slice(i + open, found), display })
    i = found + open
  }
  return spans
}

function check(md) {
  const errors = []
  for (const span of mathSpans(md)) {
    if (span.unclosed) { errors.push(`unclosed ${span.display ? '$$' : '$'}`); continue }
    try {
      katex.renderToString(span.tex, { displayMode: span.display, throwOnError: true, strict: 'ignore' })
    } catch (e) {
      errors.push(`${e.message.split('\n')[0].slice(0, 120)} in: ${span.tex.slice(0, 80)}`)
    }
  }
  return errors
}

const results = {}
for (const file of readdirSync(outDir).filter((f) => f.endsWith('.md')).sort()) {
  const text = readFileSync(join(outDir, file), 'utf8').replace(/\r\n/g, '\n')
  const parts = text.split(/^@@ /m).slice(1)
  for (const part of parts) {
    const newline = part.indexOf('\n')
    const header = (newline === -1 ? part : part.slice(0, newline)).trim()
    const body = newline === -1 ? '' : part.slice(newline + 1).trim()
    const [id, flag, ...rest] = header.split(/\s+/)
    if (flag === 'KEEP') { results[id] = { status: 'keep', reason: rest.join(' ') }; continue }
    if (!body) { results[id] = { status: 'invalid', errors: ['empty'] }; continue }
    const errors = check(body)
    results[id] = errors.length
      ? { status: 'invalid', md: body, errors }
      : { status: flag === 'UNSURE' ? 'unsure' : 'ok', md: body }
  }
}

// What each chunk still lacks.
const redo = {}
for (const file of readdirSync(chunksDir).filter((f) => f.endsWith('.json')).sort()) {
  const chunk = JSON.parse(readFileSync(join(chunksDir, file), 'utf8'))
  const missing = chunk.filter((item) => !results[item.id] || results[item.id].status === 'invalid')
  if (missing.length && missing.length < chunk.length) redo[file] = missing.map((item) => item.id)
}

writeFileSync(resultPath, JSON.stringify(results))
const count = (s) => Object.values(results).filter((r) => r.status === s).length
console.log(`sections ${Object.keys(results).length} | ok ${count('ok')} | keep ${count('keep')} | unsure ${count('unsure')} | invalid ${count('invalid')}`)
for (const [id, r] of Object.entries(results).filter(([, r]) => r.status === 'invalid').slice(0, 10)) {
  console.log('  invalid', id, '-', r.errors[0])
}
console.log('chunks partly done:', Object.keys(redo).length ? Object.entries(redo).map(([f, ids]) => `${f} (${ids.length} left)`).join(', ') : 'none')
