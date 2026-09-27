import { publicEnv } from '@/lib/env'

/**
 * Who the site is, said the same way everywhere: page titles, the logo,
 * structured data, the sitemap, llms.txt. Search engines and AI assistants
 * build their picture of a site from exactly these repeats, so they must
 * never drift apart.
 */
export const SITE = {
  /** The full name — titles, structured data, the first mention on a page. */
  name: 'Quiz Space by Unknown IITians',
  /** The name on its own, where the publisher is already in view. */
  shortName: 'Quiz Space',
  /** What else people call it, so an assistant connects the spellings. */
  alternateNames: ['QuizSpace', 'QuizSpace by Unknown IITians', 'Unknown IITians Quiz Space', 'Quiz Space IITM BS'],
  publisher: 'Unknown IITians',
  publisherUrl: 'https://unknowniitians.com',
  /** One line, for descriptions that need to say what the whole site is. */
  tagline: 'IIT Madras BS degree previous year question papers (PYQs) with answers',
  description:
    'Free IIT Madras BS degree previous year question papers — Qualifier, Quiz 1, Quiz 2 and End Term PYQs for every Data Science and Electronic Systems subject, with answer keys and a timed mock-test mode.',
  locale: 'en_IN',
  language: 'en-IN',
} as const

/** The production origin, with no trailing slash. Canonicals always point here, even from a preview. */
export const ORIGIN = publicEnv.siteUrl.replace(/\/+$/, '')

/** An absolute URL on the canonical origin. */
export function absolute(path: string): string {
  if (/^https?:\/\//.test(path)) return path
  return `${ORIGIN}${path.startsWith('/') ? path : `/${path}`}`
}
