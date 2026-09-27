/**
 * Documents for crawlers and agents — sitemaps, llms.txt — held by the CDN
 * for six hours and served stale for a day while they refresh. They never
 * need to be fresher, and each rebuild reads the database.
 */
const CACHE = 'public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400'

export function xmlResponse(xml: string): Response {
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': CACHE } })
}

export function textResponse(text: string): Response {
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': CACHE } })
}
