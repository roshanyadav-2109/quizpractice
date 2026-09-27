import { sitemapIndex } from '@/lib/seo/sitemap'
import { xmlResponse } from '@/lib/seo/xml-response'

/** The sitemap index robots.txt points at. */
export async function GET() {
  return xmlResponse(await sitemapIndex())
}
