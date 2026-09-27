// Tells Bing, Yandex, Seznam, Naver and the other IndexNow engines that pages
// have changed, so new papers are crawled in hours rather than weeks. Bing's
// index is what Microsoft Copilot, DuckDuckGo and parts of ChatGPT search
// answer from. (Google does not take part; it reads the sitemap.)
//
//   npm run seo:indexnow                       every URL in the live sitemaps
//   npm run seo:indexnow -- --since 2026-09-27 only URLs whose lastmod is that day or later
//   npm run seo:indexnow -- https://…/pyq/maths-1/quiz-1/16-feb-2025 …   just these
//
// The key is the file public/<key>.txt, which proves to the engines that the
// submitter owns the site. It is public by design. SITE_URL overrides the site.
import fs from 'node:fs'

const site = (process.env.SITE_URL ?? 'https://quizspace.unknowniitians.com').replace(/\/$/, '')
const keyFile = fs.readdirSync(new URL('../public/', import.meta.url)).find((name) => /^[0-9a-f]{32}\.txt$/.test(name))
if (!keyFile) throw new Error('No IndexNow key file in public/ (a 32-hex-character name ending in .txt).')
const key = keyFile.replace(/\.txt$/, '')

const args = process.argv.slice(2)
const sinceIndex = args.indexOf('--since')
const since = sinceIndex >= 0 ? args[sinceIndex + 1] : null
const explicit = args.filter((arg, index) => /^https?:\/\//.test(arg) && index !== sinceIndex + 1)

async function text(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Quiz Space IndexNow submitter' } })
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return response.text()
}

/** Every <loc> of a sitemap or sitemap index, following the index, with lastmod. */
async function urlsFrom(sitemap) {
  const xml = await text(sitemap)
  const entries = [...xml.matchAll(/<(url|sitemap)>([\s\S]*?)<\/\1>/g)].map(([, kind, body]) => ({
    kind,
    loc: /<loc>([^<]+)<\/loc>/.exec(body)?.[1],
    lastmod: /<lastmod>([^<]+)<\/lastmod>/.exec(body)?.[1] ?? null,
  }))
  const out = []
  for (const entry of entries) {
    if (!entry.loc) continue
    if (entry.kind === 'sitemap') {
      if (since && entry.lastmod && entry.lastmod.slice(0, 10) < since) continue
      out.push(...(await urlsFrom(entry.loc)))
    } else if (!since || !entry.lastmod || entry.lastmod.slice(0, 10) >= since) {
      out.push(entry.loc)
    }
  }
  return out
}

const urls = explicit.length > 0 ? explicit : await urlsFrom(`${site}/sitemap.xml`)
console.log(`${urls.length} URLs to submit${since ? ` (lastmod ${since} or later)` : ''}.`)

const host = new URL(site).host
for (let i = 0; i < urls.length; i += 10_000) {
  const batch = urls.slice(i, i + 10_000)
  const response = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key, keyLocation: `${site}/${keyFile}`, urlList: batch }),
  })
  // 200 and 202 both mean accepted; 422 means a URL is not on this host.
  console.log(`Batch ${i / 10_000 + 1}: ${batch.length} URLs → ${response.status} ${await response.text()}`)
}
