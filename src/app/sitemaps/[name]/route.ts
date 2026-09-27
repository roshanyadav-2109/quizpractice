import { pagesSitemap, papersSitemap, questionsSitemap, videosSitemap } from '@/lib/seo/sitemap'
import { staticPages } from '@/lib/seo/static-pages'
import { xmlResponse } from '@/lib/seo/xml-response'

/** pages.xml, papers.xml, videos.xml and questions-N.xml — see src/lib/seo/sitemap.ts. */
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params

  if (name === 'pages.xml') return xmlResponse(await pagesSitemap(staticPages()))
  if (name === 'papers.xml') return xmlResponse(await papersSitemap())
  if (name === 'videos.xml') return xmlResponse(await videosSitemap())

  const page = /^questions-(\d{1,4})\.xml$/.exec(name)
  if (page) {
    const xml = await questionsSitemap(Number(page[1]))
    if (xml) return xmlResponse(xml)
  }
  return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
}
