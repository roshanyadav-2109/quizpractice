// Turns question papers from the old site (quizpractice.space), fetched with
// old-site-fetch.js, into paper JSON for the same sheets -> upload -> import
// steps as the answer-key papers.
//
//   PLAYWRIGHT_CORE=<path to playwright-core> \
//   node old-site-convert.mjs <fetched.json> <fetch-list.json> <subjects.json> <cdn dir> <render dir> <out dir>
//
// fetched.json   what old-site-fetch.js returned, all batches in one array
// fetch-list.json  [{uuid, course, slug, exam, date, name}], the papers to convert
// cdn dir        the old site's images, downloaded as <folder>__<file> (cdn-get)
// render dir     where lines with inline maths pictures are rendered to PNG
//
// Text becomes Markdown. The old site drew some maths as tiny inline pictures;
// a line holding one is rendered to an image as a whole, since the picture
// cannot be read back as text here. Question and option images stay images.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

const [fetchedPath, listPath, subjectsPath, cdnDir, renderDir, outDir] = process.argv.slice(2)
const fetched = JSON.parse(readFileSync(fetchedPath, 'utf8'))
const list = JSON.parse(readFileSync(listPath, 'utf8'))
const subjects = new Map(JSON.parse(readFileSync(subjectsPath, 'utf8')).map((s) => [s.slug, s]))

const RENDER_SCALE = 2 // device pixels per CSS pixel for rendered lines
const md5 = (s) => createHash('md5').update(s).digest('hex')

// ---- paper metadata ---------------------------------------------------------
function metaFor(paper) {
  return list.find((e) => e.course === paper.course && (e.uuid === paper.uuid || e.uuid.startsWith(paper.uuid)))
}

function examFor(meta) {
  if (/qualifier/i.test(meta.name)) return /\bDAD\b/i.test(meta.name) ? 'diploma-qualifier' : 'qualifier'
  return meta.exam
}

function setCodeFor(name) {
  const code = name.match(/\b(Q[PE][A-Z]\d+)\b/)
  if (code) return code[1]
  const session = name.match(/\(Session (\d+)\)/i)
  return session ? `S${session[1]}` : '1'
}

function titleFor(name) {
  const title = name
    .replace(/Indian Institute Of Technology, Madras - Bs In Data Science And Applications /gi, '')
    .replace(/\s*-\s*Bs In Data Science\s*\/\s*Electronic Systems( Systems)?/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  // A generated id instead of a name says nothing.
  return /\s/.test(title) ? title : null
}

// ---- text -------------------------------------------------------------------
const texts = (value) => {
  if (!value) return null
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return [value] }
  }
  return value
}

const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#039': "'" }
const decode = (s) => s
  .replace(/&(nbsp|amp|lt|gt|quot|apos|#0?39);/g, (_, e) => ENTITIES[e])
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))

const escape = (s) => s.replace(/([\\`*_[\]<>#|~$&{}])/g, '\\$1')

function lineStart(line) {
  // Would otherwise start a list, a heading or a rule.
  return line.replace(/^(\s*)([-+=])/, '$1\\$2').replace(/^(\s*\d+)([.)])/, '$1\\$2')
}

// The answer-box settings the exam software appends to typed answers.
const ANSWER_BOX = /\s*Max Word Count\s*:.*?Number Of Columns\s*:\s*\d+/is

function htmlToMd(html) {
  let s = html.replace(ANSWER_BOX, '').replace(/\r?\n/g, ' ')
  // Formatting tags to placeholders, so escaping leaves them alone.
  s = s.replace(/<br\s*\/?>/gi, '\u0001')
    .replace(/<(b|strong)\b[^>]*>/gi, '\u0002').replace(/<\/(b|strong)>/gi, '\u0003')
    .replace(/<u\b[^>]*>/gi, '\u0004').replace(/<\/u>/gi, '\u0005')
    .replace(/<\/?(i|em|span|p|div|sub|sup|font)\b[^>]*>/gi, '')
  s = escape(decode(s))
  // Bold that holds nothing, or runs straight into more bold.
  s = s.replace(/\u0003(\s*)\u0002/g, '$1').replace(/\u0002(\s*)\u0003/g, '$1')
  s = s.replace(/\u0004(\s*)\u0005/g, '$1')
  s = s.replace(/\u0002(\s*)([^\u0003]*?)(\s*)\u0003/g, '$1**$2**$3').replace(/[\u0002\u0003]/g, '')
  s = s.replace(/\u0004([^\u0005]*)\u0005/g, '<u>$1</u>').replace(/[\u0004\u0005]/g, '')
  // Two or more spaces are where the paper had a line break.
  const lines = s.split(/\u0001| {2,}/).map((l) => lineStart(l.trim())).filter(Boolean)
  return lines.join('\\\n')
}

// ---- blocks -----------------------------------------------------------------
const renderJobs = new Map() // hash -> html

function textBlocks(row, markdown, ctx) {
  if (!row || !row.trim()) return []
  if (markdown) return [{ type: 'text', md: row.trim() }]
  if (/<img\b/i.test(row)) {
    const html = row.replace(ANSWER_BOX, '')
    const hash = md5(html).slice(0, 16)
    renderJobs.set(hash, html)
    return [imageBlock(`r-${hash}`, join(resolve(renderDir), `${hash}.png`), RENDER_SCALE, ctx, 'Question text from the original paper, with its maths as pictures')]
  }
  const md = htmlToMd(row)
  return md ? [{ type: 'text', md }] : []
}

function cdnFile(path) {
  return join(resolve(cdnDir), String(path).replace(/^\/+/, '').split('/').join('__'))
}

function imageBlock(name, file, scale, ctx, alt) {
  ctx.files.add(file)
  return {
    type: 'image',
    alt,
    image: { provider: 'cloudinary', public_id: `${ctx.prefix}/${name.replace(/\.[a-z]+$/i, '')}`, source_url: file, display_scale: scale },
  }
}

/**
 * A minority of the old site's images (mostly pre-2023 option pictures, filed
 * under a since-retired storage path) are gone from its CDN for good - 404
 * from a plain fetch, curl and even a logged-in browser alike. Rather than
 * drop the whole question (or the whole paper, if it happened during
 * download), the gap is called out in place; the rest of the paper is real.
 */
const MISSING_IMAGE_MD = '*(A figure from the original paper is missing from the source site.)*'

function cdnImageBlock(name, path, ctx, alt) {
  const file = cdnFile(path)
  if (!existsSync(file)) {
    stats.missingImages++
    return { type: 'text', md: MISSING_IMAGE_MD }
  }
  return imageBlock(name, file, 1, ctx, alt)
}

/** True once every option is nothing but the missing-image placeholder - the
 * question gives the student nothing to actually choose between. */
function allOptionsMissing(options) {
  return options.every((o) => o.content.length === 1 && o.content[0].type === 'text' && o.content[0].md === MISSING_IMAGE_MD)
}

/** The old site shows text 1, image 1, text 2, image 2, ... and any texts left over. */
function contentBlocks(row, ctx, alt) {
  const rowTexts = (texts(row.texts) || row.t || []).filter((t) => t != null)
  let images = (row.image_url || []).filter(Boolean)
  if (!images.length) images = (row.i || []).filter(Boolean).map((n) => `question_images/${n}`)
  const out = []
  const markdown = !!row.is_markdown
  out.push(...textBlocks(rowTexts[0], markdown, ctx))
  images.forEach((path, i) => {
    out.push(cdnImageBlock(String(path).split('/').pop(), path, ctx, alt))
    out.push(...textBlocks(rowTexts[i + 1], markdown, ctx))
  })
  for (const t of rowTexts.slice(images.length + 1)) out.push(...textBlocks(t, markdown, ctx))
  return out
}

function optionBlocks(option, markdown, ctx) {
  const out = textBlocks(option.text, markdown, ctx)
  if (option.image_url) out.push(cdnImageBlock(String(option.image_url).split('/').pop(), option.image_url, ctx, 'Option figure from the original question paper'))
  return out
}

// ---- answers ----------------------------------------------------------------
const num = (v) => (v != null && String(v).trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
const clean = (x) => Number(x.toPrecision(10))

function saFields(q) {
  const numeric = q.response_type === 'Numeric'
  const start = num(q.value_start)
  const end = num(q.value_end)
  if (numeric && q.answer_type === 'Range' && start != null && end != null) {
    const [lo, hi] = [Math.min(start, end), Math.max(start, end)]
    return { type: 'numerical', correct_answer: clean((lo + hi) / 2), answer_tolerance: clean((hi - lo) / 2) }
  }
  if (numeric && q.answer_type === 'Equal' && start != null) {
    return { type: 'numerical', correct_answer: String(q.value_start).trim(), answer_tolerance: 0 }
  }
  // Words, sets and free answers: shown, not auto-marked. "Yes" means any
  // answer is accepted, and its value is the answer box's settings.
  const fields = { type: 'subjective' }
  if (q.answer_type && q.answer_type !== 'Yes' && q.value_start && String(q.value_start).trim()) {
    fields.correct_answer = String(q.value_start).trim()
  }
  return fields
}

// ---- one paper --------------------------------------------------------------
const NOTICE = /QUESTION PAPER FOR THE SUBJECT|ARE YOU SURE YOU HAVE TO WRITE|USEFUL DATA HAS BEEN MENTIONED|NOT FOR AN EVALUATION/i
const PEN_AND_PAPER = /written answers on the answer sheets/i
// The platform itself withheld this question's content (an external case
// study, usually) - marked or not, we have no right to redistribute it.
const REDACTED = /content redacted|not for distribution/i

function convert(paper, meta) {
  const slug = meta.slug
  const program = subjects.get(slug).level.program.slug
  const exam = examFor(meta)
  const code = setCodeFor(meta.name)
  const ctx = { prefix: `qp/${program}/${slug}/${exam}/${meta.date}/old-${code}`, files: new Set() }
  const rows = [...paper.questions].sort((a, b) => a.number - b.number || a.id - b.id)
  const byId = new Map(rows.map((q) => [q.id, q]))
  const passages = new Map()
  const questions = []
  for (const q of rows) {
    if (q.type === 'COMPREHENSION') continue
    const all = JSON.stringify([q.texts, q.t, q.options.map((o) => o.text)])
    if (REDACTED.test(all)) { stats.redacted.push(`${meta.name} #${q.number}`); continue }
    if (!(Number(q.marks) > 0) && NOTICE.test(all)) continue
    // Other 0-mark rows are notices drawn as pictures (Yes/No, graph sheets),
    // except bonus questions, which are real.
    if (!(Number(q.marks) > 0) && !/bonus/i.test(all) && q.type !== 'SA') { stats.zeroMark.push(`${meta.name} #${q.number}`); continue }
    // A handful of rows have their options typed into the question text
    // instead of the options field (a data-entry slip on the old site) - the
    // choices can't be recovered reliably, so the question is dropped.
    if ((q.type === 'MCQ' || q.type === 'MSQ') && q.options.length < 2) { stats.malformed.push(`${meta.name} #${q.number}`); continue }

    let body = []
    if (q.parent) {
      if (!passages.has(q.parent.id)) {
        const source = byId.get(q.parent.id) || { ...q.parent, image_url: null }
        passages.set(q.parent.id, contentBlocks(source, ctx, 'Figure from the passage in the original paper'))
      }
      body.push(...passages.get(q.parent.id))
    }
    body.push(...contentBlocks(q, ctx, 'Figure from the original question paper'))
    if (!body.length) body = [{ type: 'text', md: '(The question is shown in the options.)' }]

    const question = { number: questions.length + 1, marks: Number(q.marks), body }
    const penAndPaper = q.options.some((o) => PEN_AND_PAPER.test(o.text || ''))
    if ((q.type === 'MCQ' || q.type === 'MSQ') && !penAndPaper) {
      question.type = q.type === 'MSQ' ? 'msq' : 'mcq'
      question.options = [...q.options].map((o, i) => {
        const content = optionBlocks(o, !!q.is_markdown, ctx)
        const option = { label: String.fromCharCode(65 + i), content: content.length ? content : [{ type: 'text', md: '—' }] }
        if (Number(o.correct) === 1) option.is_correct = true
        return option
      })
      if (!question.options.some((o) => o.is_correct)) stats.noAnswer++
      if (allOptionsMissing(question.options)) { stats.allOptionsMissing.push(`${meta.name} #${q.number}`); continue }
    } else if (penAndPaper) {
      // Answered on paper: nothing to mark here.
      question.type = 'subjective'
    } else {
      Object.assign(question, saFields(q))
    }
    questions.push(question)
  }
  const result = {
    schema_version: 1,
    subject: slug,
    exam_type: exam,
    session_date: meta.date,
    set_code: code,
    title: titleFor(meta.name),
    total_marks: clean(questions.reduce((a, q) => a + q.marks, 0)),
    source: { extracted_by: 'quizpractice.space', confidence: 1, reviewed: false },
    questions,
  }
  if (!result.title) delete result.title
  return { paper: cleanStrings(result), files: ctx.files }
}

// The old site's own exports carry stray NUL and other control characters
// (seen in a handful of long free-text answers) that Postgres's jsonb will
// not store. Newlines and tabs stay.
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f]/g

function cleanStrings(node) {
  if (typeof node === 'string') return node.replace(CONTROL, '')
  if (Array.isArray(node)) return node.map(cleanStrings)
  if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, cleanStrings(v)]))
  return node
}

// ---- render the lines with inline maths pictures ---------------------------
async function render() {
  mkdirSync(renderDir, { recursive: true })
  const todo = [...renderJobs].filter(([hash]) => !existsSync(join(renderDir, `${hash}.png`)))
  if (!todo.length) return 0
  const require = createRequire(import.meta.url)
  const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: RENDER_SCALE })
  await page.setContent(`<!doctype html><style>
    body { margin: 0; background: #fff; }
    #row { display: inline-block; max-width: 640px; padding: 2px 4px; font: 16px/1.6 system-ui, "Segoe UI", Roboto, sans-serif; color: #111; overflow-wrap: anywhere; }
    #row img.inline-image { display: inline; vertical-align: middle; max-height: 1.5em; }
  </style><div id="row"></div>`)
  let done = 0
  for (const [hash, html] of todo) {
    await page.evaluate(async (h) => {
      const row = document.getElementById('row')
      row.innerHTML = h
      await Promise.all([...row.querySelectorAll('img')].map((img) => img.complete ? null : new Promise((r) => { img.onload = img.onerror = r })))
    }, html)
    await page.locator('#row').screenshot({ path: join(renderDir, `${hash}.png`) })
    if (++done % 250 === 0) console.log('rendered', done, '/', todo.length)
  }
  await browser.close()
  return done
}

// ---- main -------------------------------------------------------------------
const stats = { papers: 0, skipped: [], duplicates: 0, zeroMark: [], noAnswer: 0, missingFiles: 0, redacted: [], malformed: [], missingImages: 0, allOptionsMissing: [] }
const groups = new Map()
for (const paper of fetched) {
  if (paper.error || !paper.questions?.length) { stats.skipped.push(`${paper.uuid} ${paper.error || 'empty'}`); continue }
  const meta = metaFor(paper)
  if (!meta) { stats.skipped.push(`${paper.uuid} not in the list`); continue }
  if (/^AI Practice/i.test(meta.name)) { stats.skipped.push(`${meta.name} (generated practice set)`); continue }
  const { paper: out, files } = convert(paper, meta)
  if (!out.questions.length) { stats.skipped.push(`${meta.slug} ${meta.date}: ${meta.name} has only notices (${paper.questions.length} rows)`); continue }
  const key = `${out.subject}|${out.exam_type}|${out.session_date}`
  const group = groups.get(key) || { codes: new Set(), prints: new Set(), papers: [] }
  groups.set(key, group)
  // Same subject, exam and date with the same questions: one paper, not two.
  const print = md5(JSON.stringify(out.questions).replace(/qp\/[^"]*?\/old-[^/"]+\//g, ''))
  if (group.prints.has(print)) { stats.duplicates++; continue }
  group.prints.add(print)
  let code = out.set_code
  for (let n = 2; group.codes.has(code); n++) code = `${out.set_code}-${n}`
  group.codes.add(code)
  if (code !== out.set_code) {
    const json = JSON.stringify(out).split(`/old-${out.set_code}/`).join(`/old-${code}/`)
    Object.assign(out, JSON.parse(json), { set_code: code })
  }
  group.papers.push({ out, files })
}

const rendered = await render()
for (const [, group] of groups) {
  for (const { out, files } of group.papers) {
    const missing = [...files].filter((f) => !existsSync(f))
    if (missing.length) { stats.missingFiles += missing.length; stats.skipped.push(`${out.subject} ${out.exam_type} ${out.session_date} ${out.set_code}: ${missing.length} images not downloaded`); continue }
    const path = join(outDir, out.session_date, `${out.subject}-${out.exam_type}-${out.set_code}.json`)
    mkdirSync(join(outDir, out.session_date), { recursive: true })
    writeFileSync(path, JSON.stringify(out, null, 1))
    stats.papers++
  }
}

console.log(`papers written ${stats.papers} | groups ${groups.size} | duplicate sets dropped ${stats.duplicates} | lines rendered ${rendered} (of ${renderJobs.size}) | MCQs with no correct option ${stats.noAnswer}`)
console.log(`zero-mark questions skipped that were not notices: ${stats.zeroMark.length}`, stats.zeroMark.slice(0, 5))
console.log(`questions dropped as "not for distribution": ${stats.redacted.length}`, stats.redacted.slice(0, 10))
console.log(`MCQ/MSQ dropped with no options field: ${stats.malformed.length}`, stats.malformed.slice(0, 10))
console.log(`figures missing from the source site (placeholder shown instead): ${stats.missingImages}`)
console.log(`MCQ/MSQ dropped, every option unrecoverable: ${stats.allOptionsMissing.length}`, stats.allOptionsMissing.slice(0, 10))
console.log(`skipped ${stats.skipped.length}:`)
for (const s of stats.skipped.slice(0, 400)) console.log('  ' + s)
