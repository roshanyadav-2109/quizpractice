import { pagesSitemap, papersSitemap } from '@/lib/seo/sitemap'
import { staticPages } from '@/lib/seo/static-pages'
import { xmlResponse } from '@/lib/seo/xml-response'

/**
 * pages.xml and papers.xml — see src/lib/seo/sitemap.ts. The retired
 * questions-N.xml and videos.xml answer 404, so search engines drop them.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params

  if (name === 'pages.xml') return xmlResponse(await pagesSitemap(staticPages()))
  if (name === 'papers.xml') return xmlResponse(await papersSitemap())

  return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
}
