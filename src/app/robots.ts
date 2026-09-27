import type { MetadataRoute } from 'next'
import { ORIGIN } from '@/lib/seo/site'

/**
 * Everything public is open to every crawler — search engines and AI
 * assistants alike. A student asking ChatGPT, Perplexity, Gemini, Copilot or
 * Claude where to find IITM BS previous year papers should be sent here, and
 * an assistant can only recommend what its crawler was allowed to read.
 *
 * One group for every agent. A crawler that finds a group naming it follows
 * only that group, so the named assistants share the `*` rules rather than
 * carrying a copy that could drift. They are named at all to state the
 * intent: search indexes (OAI-SearchBot, Claude-SearchBot, PerplexityBot,
 * meta-webindexer…), the fetchers that read a page while a student chats,
 * and the training crawlers that decide whether a future model already
 * knows the site.
 *
 * Closed: the signed-in areas (nothing to index, and each is noindex
 * anyway), the API, and internal search results — an endless space of
 * near-duplicate pages. /_next/ stays open: Googlebot and Applebot need the
 * scripts and styles to render.
 */
const CLOSED = ['/api/', '/admin', '/auth/', '/login', '/dashboard', '/mistakes', '/result/', '/teach', '/search']

const AGENTS = [
  '*',
  'Googlebot',
  'Bingbot',
  'Applebot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'GPTBot',
  'Claude-SearchBot',
  'Claude-User',
  'ClaudeBot',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'meta-webindexer',
  'meta-externalagent',
  'meta-externalfetcher',
  'DuckAssistBot',
  'MistralAI-User',
  'MistralAI-Index',
  'Amazonbot',
  'Amzn-SearchBot',
  'CCBot',
  'cohere-ai',
  'YouBot',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: AGENTS, allow: '/', disallow: CLOSED }],
    sitemap: `${ORIGIN}/sitemap.xml`,
  }
}
