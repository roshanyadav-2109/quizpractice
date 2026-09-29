import { timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { cronSecret } from '@/lib/env'
import { SITE } from '@/lib/seo/site'

/**
 * The daily IndexNow ping (run by Vercel Cron, vercel.json): every address in
 * the sitemaps whose lastmod is from the last two days goes to the IndexNow
 * engines — Bing, and through it Copilot and DuckDuckGo, plus Yandex, Seznam
 * and Naver — so a new paper is crawled in hours rather than weeks. Two days,
 * not one, so a missed run costs nothing. Google does not take part; it reads
 * the sitemap. The same job by hand: npm run seo:indexnow.
 *
 * The key is the file public/<key>.txt, which proves the site is ours and is
 * public by design. With CRON_SECRET set only Vercel may call it.
 */
const KEY = '30c2ef5b35dd83ebdefff41a54968c4b'
const WINDOW_MS = 2 * 24 * 60 * 60 * 1000

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/** The <loc> of every <url> in a sitemap that changed since `since`. */
async function changedSince(sitemap: string, since: number): Promise<string[]> {
  const response = await fetch(sitemap, { cache: 'no-store' })
  if (!response.ok) throw new Error(`${sitemap} answered ${response.status}`)
  const xml = await response.text()
  const out: string[] = []
  for (const [, body] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = /<loc>([^<]+)<\/loc>/.exec(body)?.[1]
    const lastmod = /<lastmod>([^<]+)<\/lastmod>/.exec(body)?.[1]
    if (loc && lastmod && new Date(lastmod).getTime() >= since) out.push(loc)
  }
  return out
}

export async function GET(request: NextRequest) {
  const secret = cronSecret()
  if (secret && !sameText(request.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return Response.json({ error: 'Not allowed.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }

  const site = SITE.url.replace(/\/$/, '')
  const since = Date.now() - WINDOW_MS
  const urls = [
    ...new Set([
      ...(await changedSince(`${site}/sitemaps/papers.xml`, since)),
      ...(await changedSince(`${site}/sitemaps/pages.xml`, since)),
    ]),
  ]
  if (urls.length === 0) return Response.json({ ok: true, submitted: 0 }, { headers: { 'Cache-Control': 'no-store' } })

  const response = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: new URL(site).host, key: KEY, keyLocation: `${site}/${KEY}.txt`, urlList: urls.slice(0, 10_000) }),
  })
  // 200 and 202 both mean accepted.
  return Response.json(
    { ok: response.status === 200 || response.status === 202, submitted: urls.length, status: response.status },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
