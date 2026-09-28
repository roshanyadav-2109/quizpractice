import { verifyWebhook } from '@/lib/cashfree'

/**
 * Cashfree's payment webhooks (set this URL in Cashfree's dashboard:
 * Developers → Webhooks). Believed only when the signature checks out
 * against the raw body. For now each verified event is logged — the payment
 * test reads it in Vercel's logs; paid plans will grant access here, once
 * per order.
 */
export async function POST(request: Request) {
  const raw = await request.text()
  const ok = verifyWebhook(raw, request.headers.get('x-webhook-timestamp'), request.headers.get('x-webhook-signature'))
  if (!ok) {
    console.warn('cashfree webhook: signature did not verify — ignored')
    return new Response('Bad signature', { status: 401 })
  }
  let event: { type?: string; data?: { order?: { order_id?: string; order_amount?: number }; payment?: { payment_status?: string; cf_payment_id?: unknown } } } = {}
  try {
    event = JSON.parse(raw)
  } catch {
    return new Response('Bad body', { status: 400 })
  }
  console.log(
    `cashfree webhook: ${event.type ?? 'event'} · order ${event.data?.order?.order_id ?? '?'} · ₹${event.data?.order?.order_amount ?? '?'} · ${
      event.data?.payment?.payment_status ?? '?'
    } · payment ${String(event.data?.payment?.cf_payment_id ?? '?')}`,
  )
  return Response.json({ ok: true })
}
