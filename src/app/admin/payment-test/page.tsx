import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCurrentProfile } from '@/lib/supabase/server'
import { CashfreeError, cashfreeMode, getOrder, getPayments, isCashfreeConfigured, type CashfreeOrder, type CashfreePayment } from '@/lib/cashfree'
import { PaymentTestButton } from '@/components/admin/PaymentTestButton'

export const metadata: Metadata = { title: 'Payment test', robots: { index: false, follow: false } }

type SearchParams = Promise<{ order_id?: string }>

/**
 * A ₹1 live payment, end to end, before any paid plan exists: the order is
 * made on the server, Cashfree's checkout opens on this domain, and on the
 * way back the result is read from Cashfree itself — never from the browser.
 * The webhook for the same order shows in Vercel's logs. Admins only.
 */
export default async function PaymentTestPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'admin') notFound()

  const { order_id: orderId } = await searchParams
  const mode = cashfreeMode()
  let order: CashfreeOrder | null = null
  let payments: CashfreePayment[] = []
  let lookupError: string | null = null
  if (orderId && /^qs_test_[\w]+$/.test(orderId) && isCashfreeConfigured()) {
    try {
      ;[order, payments] = await Promise.all([getOrder(orderId), getPayments(orderId)])
    } catch (error) {
      lookupError = error instanceof CashfreeError ? `${error.code}: ${error.message}` : 'Could not read the order from Cashfree.'
    }
  }

  return (
    <div className="max-w-2xl">
      <h2 className="font-medium text-ink">Payment test</h2>
      <p className="mt-1 text-ui text-ink-muted">
        One real ₹1 payment through Cashfree, from this domain, before any paid plan exists. Students cannot reach this
        page. Cashfree mode: <strong className="font-medium text-ink">{mode}</strong>
        {isCashfreeConfigured() ? '' : ' — keys not set on this deployment'}.
      </p>

      {order ? (
        <section className="mt-6 rounded-card border border-rule bg-surface p-5">
          <p className="text-meta text-ink-muted">Order {order.order_id}, as Cashfree reports it</p>
          <p className={`mt-1 text-[1.5rem] font-medium ${order.order_status === 'PAID' ? 'text-correct' : 'text-ink'}`}>
            {order.order_status === 'PAID' ? 'Paid ✓' : order.order_status}
          </p>
          <p className="text-ui text-ink-muted">
            ₹{order.order_amount} {order.order_currency}
          </p>
          {payments.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-1 text-meta text-ink-muted">
              {payments.map((payment) => (
                <li key={String(payment.cf_payment_id)}>
                  {payment.payment_status} · {payment.payment_group ?? 'payment'} · ₹{payment.payment_amount}
                  {payment.payment_time ? ` · ${payment.payment_time}` : ''}
                  {payment.bank_reference ? ` · bank ref ${payment.bank_reference}` : ''}
                  {payment.payment_message ? ` · ${payment.payment_message}` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-meta text-ink-muted">No payment attempt recorded on this order.</p>
          )}
        </section>
      ) : lookupError ? (
        <p className="mt-6 text-ui text-incorrect">{lookupError}</p>
      ) : null}

      <section className="mt-6">
        <PaymentTestButton mode={mode} />
      </section>
    </div>
  )
}
