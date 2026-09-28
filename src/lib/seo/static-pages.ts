import type { SitemapUrl } from './sitemap'
import { absolute } from './site'

/** Pages that are not built from the catalogue but belong in the sitemap. */
export function staticPages(): SitemapUrl[] {
  return [
    { loc: absolute('/about'), changefreq: 'monthly', priority: 0.5 },
    { loc: absolute('/privacy'), changefreq: 'yearly', priority: 0.2 },
    { loc: absolute('/terms'), changefreq: 'yearly', priority: 0.2 },
    { loc: absolute('/refunds'), changefreq: 'yearly', priority: 0.2 },
  ]
}
