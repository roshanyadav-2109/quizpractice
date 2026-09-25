// Lists every file in the Drive folders the sheet links, recursively, through
// Drive's public folder view (no sign-in, so only shared folders list).
//
// Reads sheet-cells.json; writes drive-files.json and pdf-list.json (each
// file once, with the term and exam of the first cell that links it).
import { readFileSync, writeFileSync } from 'node:fs'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
const listed = new Map()
async function list(folderId) {
  if (listed.has(folderId)) return listed.get(folderId)
  const html = await (await fetch(`https://drive.google.com/embeddedfolderview?id=${folderId}`)).text()
  await sleep(250)
  const entries = [...html.matchAll(/<div class="flip-entry" id="entry-([^"]+)"[\s\S]*?<a href="([^"]+)"[\s\S]*?flip-entry-title">([^<]*)</g)].map((m) => ({ id: m[1], href: unesc(m[2]), name: unesc(m[3]) }))
  const out = []
  for (const e of entries) {
    if (/\/drive\/folders\//.test(e.href)) for (const f of await list(e.id)) out.push({ ...f, path: [e.name, ...f.path] })
    else out.push({ id: e.id, name: e.name, path: [] })
  }
  listed.set(folderId, out)
  return out
}
const files = []
const cellsSeen = JSON.parse(readFileSync('sheet-cells.json', 'utf8'))
for (const c of cellsSeen) {
  const { tab, term, exam } = c
  for (const link of c.links) {
    const folder = link.match(/folders\/([A-Za-z0-9_-]+)/)?.[1]
    const file = link.match(/file\/d\/([A-Za-z0-9_-]+)/)?.[1]
    if (folder) for (const f of await list(folder)) files.push({ tab, term, exam, folder, ...f })
    else if (file) files.push({ tab, term, exam, id: file, name: '', path: [], direct: true })
  }
}
writeFileSync('drive-files.json', JSON.stringify({ cells: cellsSeen, files }, null, 1))
const uniq = new Map(); for (const f of files) if (!uniq.has(f.id)) uniq.set(f.id, f)
console.log('cells', cellsSeen.length, 'folders listed', listed.size, 'file rows', files.length, 'unique files', uniq.size)
const empty = [...listed.entries()].filter(([, v]) => v.length === 0).map(([k]) => k)
console.log('empty or private folders', empty.length, empty.slice(0, 10))
writeFileSync('pdf-list.json', JSON.stringify([...uniq.values()].map((f) => ({ id: f.id, name: f.name, path: f.path, term: f.term, exam: f.exam, tab: f.tab })), null, 1))
