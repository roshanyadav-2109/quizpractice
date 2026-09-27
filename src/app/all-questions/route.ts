import { getCurrentProfile } from '@/lib/supabase/server'
import { recordSignal } from '@/lib/access'

/**
 * The trap. Every page links here invisibly — no person sees or can tab to
 * the link — and robots.txt closes it to every crawler, so the only visitors
 * are scrapers that ignore robots.txt. Each visit is noted for staff, with
 * the account if one is signed in; the answer is a plain 404, so a scraper
 * learns nothing from it.
 */
export async function GET(request: Request) {
  const profile = await getCurrentProfile().catch(() => null)
  await recordSignal({ kind: 'trap', userId: profile?.id ?? null, path: new URL(request.url).pathname })
  return new Response('Not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  })
}
