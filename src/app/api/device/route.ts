import { contentClient } from '@/lib/supabase/content'
import { getCurrentProfile } from '@/lib/supabase/server'
import { requestIp } from '@/lib/access'

/**
 * The browser a signed-in account is using (components/site/DeviceBeacon.tsx).
 * Both ids are recorded; only the browser's own random id (d:) can be blocked,
 * and one that is blocked bans the account that arrives with it.
 */
const ID = /^[0-9a-f-]{16,64}$/i

export async function POST(request: Request) {
  const profile = await getCurrentProfile().catch(() => null)
  if (!profile) return new Response(null, { status: 204 })

  const body = (await request.json().catch(() => null)) as { f?: unknown; d?: unknown } | null
  const ip = await requestIp()
  const db = contentClient()
  const ids: string[] = []
  if (typeof body?.d === 'string' && ID.test(body.d)) ids.push(`d:${body.d}`)
  if (typeof body?.f === 'string' && ID.test(body.f)) ids.push(`f:${body.f}`)

  for (const id of ids) {
    const { error } = await db.rpc('register_device', { p_user: profile.id, p_fingerprint: id, p_ip: ip })
    if (error) console.error(`register_device failed — ${error.message}`)
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}
