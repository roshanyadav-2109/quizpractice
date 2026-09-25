import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
const list = JSON.parse(readFileSync('pdf-list.json', 'utf8'))
mkdirSync('pdf', { recursive: true })
const results = {}
const queue = [...list]
let done = 0
async function one(f) {
  const out = `pdf/${f.id}.pdf`
  if (existsSync(out) && statSync(out).size > 1000) return { ok: true, size: statSync(out).size, cached: true }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`https://drive.usercontent.google.com/download?id=${f.id}&export=download&confirm=t`)
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.subarray(0, 5).toString() !== '%PDF-') return { ok: false, status: r.status, type: r.headers.get('content-type'), head: buf.subarray(0, 80).toString().replace(/\s+/g, ' ') }
      writeFileSync(out, buf)
      return { ok: true, size: buf.length }
    } catch (e) { if (attempt === 2) return { ok: false, error: e.message } }
  }
}
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) {
    const f = queue.shift()
    results[f.id] = await one(f)
    if (++done % 25 === 0) console.log('done', done, '/', list.length)
  }
}))
writeFileSync('download-results.json', JSON.stringify(results, null, 1))
const bad = Object.entries(results).filter(([, r]) => !r.ok)
console.log('ok', list.length - bad.length, 'failed', bad.length)
for (const [id, r] of bad) console.log(' ', id, list.find((f) => f.id === id).name, JSON.stringify(r).slice(0, 160))
const total = Object.values(results).reduce((n, r) => n + (r.size || 0), 0)
console.log('total MB', Math.round(total / 1e6))
