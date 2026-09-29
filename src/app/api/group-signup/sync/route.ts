import { timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { contentClient } from '@/lib/supabase/content'
import { cronSecret } from '@/lib/env'
import { sendPendingGroupSignups } from '@/lib/group-signup'

/**
 * The daily sweep of the announcement-group hand-over (run by Vercel Cron,
 * vercel.json): every confirmed email whose send failed — or never ran — is
 * sent to the main site's groups again, up to 20 tries each. See
 * src/lib/group-signup.ts. With CRON_SECRET set only Vercel may call it.
 */
export const maxDuration = 60

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export async function GET(request: NextRequest) {
  const secret = cronSecret()
  if (secret && !sameText(request.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return Response.json({ error: 'Not allowed.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }
  const result = await sendPendingGroupSignups(contentClient(), { limit: 100 })
  return Response.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store' } })
}
