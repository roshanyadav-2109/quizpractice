import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { refresh } from '@/lib/cache'

const input = z.object({
  tags: z
    .array(z.string().regex(/^(taxonomy|catalogue|spotlight|solutions|search|(set|user):[0-9a-f-]{36})$/, 'Unknown tag.'))
    .min(1)
    .max(50),
})

/** Whether the request carries the revalidation secret, compared in constant time. */
function authorised(request: Request): boolean {
  const secret = process.env.REVALIDATE_SECRET
  const given = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
  if (!secret || given.length !== secret.length) return false
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret))
}

/**
 * Clears cached content after a script has changed the database directly —
 * an import, a batch of transcriptions — which the site cannot see for
 * itself. `npm run cache:refresh` calls it. Staff edits in the admin clear
 * their own caches and do not need this.
 */
export async function POST(request: Request) {
  if (!authorised(request)) return Response.json({ error: 'Not allowed.' }, { status: 401 })
  const parsed = input.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
  refresh(...parsed.data.tags)
  return Response.json({ refreshed: parsed.data.tags })
}
