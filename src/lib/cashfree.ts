import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Cashfree Payment Gateway, from the server. The keys never reach the
 * browser: the browser only receives an order's payment_session_id and opens
 * Cashfree's checkout with it.
 *
 *   CASHFREE_ENV         "production" or "sandbox" (default sandbox)
 *   CASHFREE_APP_ID      the App ID (x-client-id)
 *   CASHFREE_SECRET_KEY  the Secret Key (x-client-secret) — also signs webhooks
 *
 * A payment is believed only when Cashfree says so to the server — the order
 * read back by id, or a webhook whose signature checks out — never because the
 * browser came back from checkout.
 */

const API_VERSION = '2025-01-01'

export type CashfreeMode = 'production' | 'sandbox'

export function cashfreeMode(): CashfreeMode {
  return process.env.CASHFREE_ENV === 'production' ? 'production' : 'sandbox'
}

export function isCashfreeConfigured(): boolean {
  return Boolean(process.env.CASHFREE_APP_ID && process.env.CASHFREE_SECRET_KEY)
}

function base(): string {
  return cashfreeMode() === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg'
}

function secret(): string {
  const key = process.env.CASHFREE_SECRET_KEY
  if (!key) throw new Error('CASHFREE_SECRET_KEY is not set.')
  return key
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const appId = process.env.CASHFREE_APP_ID
  if (!appId) throw new Error('CASHFREE_APP_ID is not set.')
  const response = await fetch(`${base()}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-api-version': API_VERSION,
      'x-client-id': appId,
      'x-client-secret': secret(),
      ...init.headers,
    },
  })
  const body = (await response.json().catch(() => ({}))) as T & { message?: string; code?: string }
  if (!response.ok) throw new CashfreeError(response.status, body.code ?? 'error', body.message ?? `HTTP ${response.status}`)
  return body
}

export class CashfreeError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export interface CashfreeOrder {
  cf_order_id: string | number
  order_id: string
  order_amount: number
  order_currency: string
  order_status: 'ACTIVE' | 'PAID' | 'EXPIRED' | 'TERMINATED' | 'TERMINATION_REQUESTED' | string
  payment_session_id: string
  created_at?: string
}

export interface CashfreePayment {
  cf_payment_id: string | number
  payment_status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'USER_DROPPED' | 'CANCELLED' | string
  payment_amount: number
  payment_group?: string
  payment_time?: string
  payment_message?: string
  bank_reference?: string
}

export async function createOrder(order: {
  orderId: string
  amount: number
  customer: { id: string; email: string | null; phone: string; name: string | null }
  returnUrl: string
  notifyUrl: string
  note?: string
}): Promise<CashfreeOrder> {
  return call<CashfreeOrder>('/orders', {
    method: 'POST',
    body: JSON.stringify({
      order_id: order.orderId,
      order_amount: order.amount,
      order_currency: 'INR',
      customer_details: {
        customer_id: order.customer.id,
        customer_phone: order.customer.phone,
        ...(order.customer.email ? { customer_email: order.customer.email } : {}),
        ...(order.customer.name ? { customer_name: order.customer.name } : {}),
      },
      order_meta: { return_url: order.returnUrl, notify_url: order.notifyUrl },
      ...(order.note ? { order_note: order.note } : {}),
    }),
  })
}

export function getOrder(orderId: string): Promise<CashfreeOrder> {
  return call<CashfreeOrder>(`/orders/${encodeURIComponent(orderId)}`)
}

export function getPayments(orderId: string): Promise<CashfreePayment[]> {
  return call<CashfreePayment[]>(`/orders/${encodeURIComponent(orderId)}/payments`)
}

/**
 * A webhook is Cashfree's only if its signature is base64(HMAC-SHA256 of
 * timestamp + raw body, keyed with the secret key). The raw body, exactly as
 * received — parsing and re-serialising it changes the bytes.
 */
export function verifyWebhook(rawBody: string, timestamp: string | null, signature: string | null): boolean {
  if (!timestamp || !signature) return false
  const expected = createHmac('sha256', secret()).update(timestamp + rawBody).digest('base64')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}
