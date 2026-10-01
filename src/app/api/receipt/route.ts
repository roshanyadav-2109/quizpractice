import { createClient } from '@/lib/supabase/server'

/** A paper was read (components/exam/PaperBeacon.tsx). Runs as the signed-in student; the database ignores anyone else. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { setId?: unknown; events?: unknown } | null
  if (typeof body?.setId !== 'string' || !UUID.test(body.setId)) return new Response(null, { status: 204 })
  const events = Math.min(Math.max(Number(body.events) || 1, 1), 500)
  const supabase = await createClient()
  const { error } = await supabase.rpc('note_receipt', { p_set: body.setId, p_events: events })
  if (error) console.error(`note_receipt failed — ${error.message}`)
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}
