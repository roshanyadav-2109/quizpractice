'use client'

import { useState } from 'react'
import { buttonClass } from '@/components/ui/primitives'

type CashfreeCheckout = { checkout: (options: { paymentSessionId: string; redirectTarget: '_self' }) => Promise<unknown> }
declare global {
  interface Window {
    Cashfree?: (options: { mode: 'production' | 'sandbox' }) => CashfreeCheckout
  }
}

const SDK = 'https://sdk.cashfree.com/js/v3/cashfree.js'

/** Cashfree's checkout script, loaded only on this admin page and only when it is used. */
function loadSdk(): Promise<void> {
  if (window.Cashfree) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SDK
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Could not load Cashfree checkout.'))
    document.head.appendChild(script)
  })
}

/**
 * The ₹1 live payment test: creates the order on the server, then opens
 * Cashfree's checkout on this domain. Cashfree refuses to open it on a domain
 * that is not whitelisted — so this is also the whitelisting check.
 */
export function PaymentTestButton({ mode }: { mode: 'production' | 'sandbox' }) {
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pay() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/payments/test-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const body = (await response.json()) as { paymentSessionId?: string; error?: string }
      if (!response.ok || !body.paymentSessionId) throw new Error(body.error ?? 'Could not create the order.')
      await loadSdk()
      const result = (await window.Cashfree!({ mode }).checkout({ paymentSessionId: body.paymentSessionId, redirectTarget: '_self' })) as
        | { error?: { message?: string } }
        | undefined
      if (result?.error) throw new Error(result.error.message ?? 'Cashfree refused to open checkout.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong.')
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex max-w-xs flex-col gap-1.5">
        <span className="text-meta text-ink-muted">Your mobile number (Cashfree requires one)</span>
        <input
          type="tel"
          inputMode="numeric"
          maxLength={10}
          value={phone}
          onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))}
          placeholder="98xxxxxxxx"
          className="h-10 rounded-control border border-rule bg-surface px-3 text-ui text-ink focus:border-ink focus:outline-none"
        />
      </label>
      <div>
        <button type="button" onClick={pay} disabled={busy || phone.length !== 10} className={buttonClass('primary', 'md')}>
          {busy ? 'Opening Cashfree…' : `Pay ₹1 (${mode === 'production' ? 'live' : 'sandbox'})`}
        </button>
      </div>
      {error ? <p className="text-ui text-incorrect">{error}</p> : null}
    </div>
  )
}
