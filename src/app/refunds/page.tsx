import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Page, PageHeader } from '@/components/site/Page'
import { publicEnv } from '@/lib/env'

export const metadata: Metadata = {
  title: 'Refund and cancellation policy',
  description:
    'Payments for Quiz Space by Unknown IITians are final: no refunds and no cancellations once a purchase is complete.',
}

const UPDATED = '28 September 2026'

/**
 * The refund and cancellation policy: all payments are final. A payment
 * gateway (Cashfree) reviews that a site publishes one before it takes live
 * payments. A failed or duplicate debit is not a purchase — the bank or the
 * gateway reverses it under RBI rules — which is why section 4 exists.
 *
 * Linked from the footer of every page, beside the Terms.
 */
export default function RefundsPage() {
  return (
    <Page>
      <PageHeader title="Refund and cancellation policy" meta={`Last updated ${UPDATED}`} />

      <article className="max-w-[68ch] text-body text-ink">
        <p className="text-ink-muted">
          This policy applies to every payment made for Quiz Space, operated by Unknown IITians (&ldquo;we&rdquo;,
          &ldquo;us&rdquo; or &ldquo;our&rdquo;) — including any paid plan, pass, subscription, test series or other paid
          feature (together, &ldquo;Paid Services&rdquo;). It forms part of our{' '}
          <Link href="/terms" className={LINK}>
            Terms of Use
          </Link>
          . By making a payment, you agree to it.
        </p>

        <Heading>1. No refunds</Heading>
        <P>
          All payments are final and non-refundable. We do not refund any payment for a Paid Service, in full or in
          part, for any reason, including:
        </P>
        <List>
          <li>a change of mind, or buying a plan by mistake;</li>
          <li>not using, or only partly using, the Paid Service during the period purchased;</li>
          <li>dissatisfaction with the content, or with results in any examination;</li>
          <li>a change in your course, level, term or examination schedule; or</li>
          <li>suspension or termination of your account for breach of the Terms of Use.</li>
        </List>

        <Heading>2. No cancellations</Heading>
        <P>
          A purchase cannot be cancelled once the payment is complete. Access to a Paid Service continues until the
          end of the period purchased and then ends; it is not paused, transferred to another account or exchanged for
          another plan.
        </P>

        <Heading>3. Before you pay</Heading>
        <P>
          Read the description, price and period of a Paid Service before paying. Prices are shown in Indian Rupees
          (INR). The free parts of Quiz Space — every paper&rsquo;s free preview and the features available without
          payment — let you judge the Service before you buy.
        </P>

        <Heading id="failed">4. Failed or duplicate payments</Heading>
        <P>
          A payment that fails, or is taken twice for the same purchase, is not a completed purchase. If money leaves
          your account in such a case, it is reversed to the original payment method by your bank or by our payment
          gateway, Cashfree Payments, within the timelines set by the Reserve Bank of India. If a reversal has not
          reached you within 7 working days, write to <Contact /> with the transaction reference, date and amount, and
          we will follow it up with the payment gateway.
        </P>

        <Heading>5. Changes to this policy</Heading>
        <P>
          We may revise this policy from time to time. The date at the top of this page shows when it was last
          revised. The policy in force when you made a payment applies to that payment.
        </P>

        <Heading id="contact">6. Contact</Heading>
        <P>
          Questions about a payment may be sent to <Contact />. Complaints and legal notices may be sent to our
          Grievance Officer at <Contact kind="legal" />.
        </P>
      </article>
    </Page>
  )
}

const LINK = 'text-accent underline-offset-2 hover:underline'

function Heading({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="mt-8 mb-2 scroll-mt-24 text-card font-medium text-ink">
      {children}
    </h2>
  )
}

function P({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-ink">{children}</p>
}

function List({ children }: { children: ReactNode }) {
  return <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 marker:text-ink-faint">{children}</ul>
}

/** `legal` for grievances and notices, `desk` for everything else — as on the Terms page. */
function Contact({ kind = 'desk' }: { kind?: 'desk' | 'legal' }) {
  const email = kind === 'legal' ? publicEnv.legalEmail : publicEnv.contactEmail
  if (!email) return <span className="text-ink-muted">[contact email — the site owner adds it here]</span>
  return (
    <a href={`mailto:${email}`} className={LINK}>
      {email}
    </a>
  )
}
