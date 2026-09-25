// Every Drive link in the papers sheet, by level tab, term and exam.
//
// Reads the sheet's HTML export (File > Download > Web page, or
// https://docs.google.com/spreadsheets/d/<id>/export?format=zip) unzipped
// into sheet_html/. The HTML export is used because a cell can hold several
// links, and the CSV and xlsx exports keep only the first.
//
// Writes sheet-cells.json: [{ tab, term, exam, text, links }].
import fs from 'node:fs'

const SEASON = { jan: 'jan', may: 'may', sep: 'sep', sept: 'sep' }
const EXAM = { quiz1: 'quiz-1', quiz2: 'quiz-2', endterm: 'end-term' }
const text = (h) => h.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim()
const key = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** "Sept2025", "May 2025", or a date the sheet stored as a serial (45778). */
function termOf(header) {
  const m = header.match(/^(jan|may|sept?)\s*(\d{4})$/i)
  if (m) return `${SEASON[m[1].toLowerCase()]}-${m[2]}`
  const serial = Number(header)
  if (serial > 40000 && serial < 60000) {
    const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000)
    const month = d.getUTCMonth() + 1
    return `${month <= 4 ? 'jan' : month <= 8 ? 'may' : 'sep'}-${d.getUTCFullYear()}`
  }
  return null
}

const out = []
for (const file of fs.readdirSync('sheet_html').filter((f) => f.endsWith('.html'))) {
  const tab = file.replace(/\.html$/, '')
  const html = fs.readFileSync(`sheet_html/${file}`, 'utf8')
  const grid = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((r) =>
    [...r[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)].map((c) => ({ html: c[2] })),
  )
  const header = grid.find((r) => r.length && text(r[0].html) === 'Level')
  if (!header) continue
  const headers = header.map((c) => text(c.html))
  for (const row of grid) {
    // The level cell spans its rows, so later rows start one cell short:
    // find the exam cell and count the terms from it.
    const k = row.findIndex((c) => EXAM[key(text(c.html))])
    if (k === -1) continue
    const exam = EXAM[key(text(row[k].html))]
    row.forEach((cell, i) => {
      if (i <= k) return
      const term = termOf(headers[i - k + 1] ?? '')
      if (!term) return
      const links = [...cell.html.matchAll(/href="([^"]+)"/g)].map((m) => {
        let u = m[1].replace(/&amp;/g, '&')
        const q = u.match(/[?&]q=([^&]+)/)
        if (q && u.includes('google.com/url')) u = decodeURIComponent(q[1])
        return u
      }).filter((u) => u.includes('drive.google.com'))
      if (links.length) out.push({ tab, term, exam, text: text(cell.html), links: [...new Set(links)] })
    })
  }
}
fs.writeFileSync('sheet-cells.json', JSON.stringify(out, null, 1))
console.log('cells with links', out.length, '| links', out.reduce((n, c) => n + c.links.length, 0))
