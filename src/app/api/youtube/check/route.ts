import { timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { cronSecret } from '@/lib/env'
import { reconfirmConnection } from '@/lib/youtube/connection'

/**
 * The daily check that the saved YouTube permission still works, run by
 * Vercel Cron (vercel.json). When the owner has withdrawn it on Google's
 * security page, this is what notices and deletes the stored token and
 * channel id, as /privacy promises (YouTube Developer Policies III.E.4.b).
 *
 * With CRON_SECRET set only Vercel may call it. Without it anyone may, which
 * is harmless: a permission that worked within the last 20 hours is not
 * checked again, and the answer says nothing about the connection.
 */
export async function GET(request: NextRequest) {
  const secret = cronSecret()
  if (secret && !sameText(request.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return Response.json({ error: 'Not allowed.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }

  const outcome = await reconfirmConnection()
  // Dropped: Google refused the permission (the token and channel id are now
  // cleared), or the token could not be opened with YOUTUBE_TOKEN_KEY.
  if (outcome === 'dropped') console.warn('[youtube check] the saved permission no longer works; Admin → Educators says why')
  if (outcome === 'unreachable') console.warn('[youtube check] the connection could not be checked; the next run tries again')

  // The outcome only for Vercel's own call, where it lands in the cron log.
  return Response.json(secret ? { ok: true, outcome } : { ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}

/** Compares two strings in constant time. */
function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
