import type { Metadata } from 'next'
import { SITE, absolute } from './site'

/**
 * A page's metadata, the same shape everywhere: title, description, the
 * canonical address, and the Open Graph / X card that a shared link and an
 * AI assistant's preview are built from.
 *
 * Titles lead with what the page is about and end with the brand, which is
 * dropped when it would push the title past what a results page shows —
 * the words a student searched for matter more than the name after them.
 */

/** About what Google shows before cutting a title off. */
const TITLE_ROOM = 65

export function withBrand(title: string): string {
  const full = `${title} | ${SITE.name}`
  if (full.length <= TITLE_ROOM + 10) return full
  const short = `${title} | ${SITE.shortName}`
  return short.length <= TITLE_ROOM + 10 ? short : title
}

/** Cut a description at a word near 158 characters. */
export function clipDescription(text: string, max = 158): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  return `${flat.slice(0, max - 1).replace(/[\s,;:.–—-]+\S*$/, '')}…`
}

export interface PageMeta {
  /** Without the brand; it is added here. */
  title: string
  description: string
  path: string
  /** Index this page? Default yes. `follow` stays on either way. */
  index?: boolean
  /** An Open Graph image path; defaults to the site card. */
  image?: string
  type?: 'website' | 'article'
  /** ISO date, for articles and papers. */
  modified?: string | null
}

export function pageMetadata({ title, description, path, index = true, image, type = 'website', modified }: PageMeta): Metadata {
  const fullTitle = withBrand(title)
  const desc = clipDescription(description)
  const url = absolute(path)
  const images = image ? [{ url: absolute(image), width: 1200, height: 630, alt: title }] : undefined
  return {
    // `absolute`: the brand is already in, the root template must not add it again.
    title: { absolute: fullTitle },
    description: desc,
    alternates: { canonical: url },
    robots: index
      ? { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 }
      : { index: false, follow: true },
    openGraph: {
      type,
      url,
      title: fullTitle,
      description: desc,
      siteName: SITE.name,
      locale: SITE.locale,
      ...(images ? { images } : {}),
      ...(type === 'article' && modified ? { modifiedTime: modified } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description: desc,
      ...(images ? { images: images.map((img) => img.url) } : {}),
    },
  }
}
