import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { getCurrentProfile } from '@/lib/supabase/server'
import { CashfreeError, createOrder, isCashfreeConfigured } from '@/lib/cashfree'
import { absolute } from '@/lib/seo/site'

/**
 * A ₹1 order for the admin payment test (/admin/payment-test): the whole
 * live path — order, Cashfree checkout on this domain, return, status read
 * back, webhook — before any paid plan exists. Admins only; nothing a
 * student can reach.
 */
const bodySchema = z.object({ phone: z.string().regex(/^[6-9]\d{9}$/, 'A 10-digit Indian mobile number.') })

export async function POST(request: Request) {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'admin') return Response.json({ error: 'Admins only.' }, { status: 403 })
  if (!isCashfreeConfigured()) return Response.json({ error: 'Cashfree keys are not set on this deployment.' }, { status: 503 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Enter a 10-digit Indian mobile number.' }, { status: 400 })

  const orderId = `qs_test_${Date.now()}_${randomBytes(3).toString('hex')}`
  try {
    const order = await createOrder({
      orderId,
      amount: 1,
      customer: { id: profile.id, email: profile.email, phone: parsed.data.phone, name: profile.displayName },
      returnUrl: `${absolute('/admin/payment-test')}?order_id={order_id}`,
      notifyUrl: absolute('/api/payments/webhook'),
      note: 'Quiz Space live payment test (admin)',
    })
    return Response.json({ orderId: order.order_id, paymentSessionId: order.payment_session_id })
  } catch (error) {
    const message = error instanceof CashfreeError ? `${error.code}: ${error.message}` : 'Could not create the order.'
    console.error(`payment test order failed — ${message}`)
    return Response.json({ error: message }, { status: 502 })
  }
}
