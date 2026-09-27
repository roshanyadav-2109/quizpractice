import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Page, PageHeader } from '@/components/site/Page'
import { publicEnv } from '@/lib/env'

export const metadata: Metadata = {
  title: 'Terms of use',
  description: 'The terms for using Quiz Space by Unknown IITians, including the YouTube Terms of Service that apply to its videos.',
}

const UPDATED = '27 September 2026'

const YOUTUBE_TERMS = 'https://www.youtube.com/t/terms'
const YOUTUBE_GUIDELINES = 'https://www.youtube.com/howyoutubeworks/policies/community-guidelines/'

/**
 * The terms of use. Short and plain; the part Google's YouTube API audit
 * looks for (Developer Policies III.A.1) is the YouTube section: a link to
 * YouTube's terms, and the statement that using the site means agreeing to
 * them.
 *
 * Linked from the footer of every page.
 */
export default function TermsPage() {
  return (
    <Page>
      <PageHeader title="Terms of use" meta={`Last updated ${UPDATED}`} />

      <article className="max-w-[68ch] text-body text-ink">
        <p className="text-ink-muted">
          Quiz Space by Unknown IITians is a free site for practising previous year papers of the IIT Madras BS degree. By using it you
          agree to these terms. If you do not agree, please do not use the site.
        </p>

        <Heading id="youtube">YouTube</Heading>
        <P>
          Quiz Space uses YouTube API Services to show explanation videos and to publish teachers’ recordings.{' '}
          <strong className="font-medium">
            By using Quiz Space you agree to be bound by the{' '}
            <External href={YOUTUBE_TERMS}>YouTube Terms of Service</External>.
          </strong>{' '}
          How the site handles data from YouTube is set out in the{' '}
          <Link href="/privacy#youtube" className={LINK}>
            privacy policy
          </Link>
          .
        </P>

        <Heading>Your account</Heading>
        <P>
          You sign in with your Google account and are responsible for what is done with it here. We may suspend an
          account that is used to break these terms.
        </P>

        <Heading>Using the papers</Heading>
        <P>
          The papers, questions and explanations are for your own study. Please do not copy them in bulk, republish
          them, or use the site to gain an unfair advantage in an exam that is in progress. Question papers remain the
          work of their original authors; if you hold rights in something on the site and want it removed, write to
          us and we will take it down.
        </P>

        <Heading>What you post</Heading>
        <P>
          Discussion posts and error reports must be your own words, relevant, and respectful. You keep ownership of
          what you write and allow Quiz Space to show it on the site. We may remove anything that breaks these
          terms.
        </P>

        <Heading>Teachers</Heading>
        <P>
          Teachers write explanations and record videos for the subjects an admin assigns them. By submitting one, a
          teacher confirms it is their own work and allows Quiz Space to publish it on the site, with their name,
          and on the site’s YouTube channel. Videos must follow YouTube’s{' '}
          <External href={YOUTUBE_GUIDELINES}>Community Guidelines</External>. Uploading through the site means
          agreeing to the <External href={YOUTUBE_TERMS}>YouTube Terms of Service</External> for that video.
        </P>

        <Heading>No guarantees</Heading>
        <P>
          We take care over the answer keys and explanations, but they can contain mistakes. The site is provided as
          it is, without warranties, and we are not liable for results in any exam. If something looks wrong, use
          Report on the question so it can be fixed for everyone.
        </P>

        <Heading>Changes</Heading>
        <P>
          We may change these terms; the date at the top shows when they last changed. Using the site after a change
          means accepting the new terms.
        </P>

        <Heading id="contact">Contact</Heading>
        <P>
          Legal notices, takedown and copyright requests, and questions about these terms go to{' '}
          <Contact kind="legal" />. Anything else about the site: <Contact />.
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

function External({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LINK}>
      {children}
    </a>
  )
}

/**
 * One of the site's two addresses: `legal` (NEXT_PUBLIC_LEGAL_EMAIL) for
 * privacy, data, takedowns and legal notices, `desk` (NEXT_PUBLIC_CONTACT_EMAIL)
 * for everything else. A visible placeholder until it is set.
 */
function Contact({ kind = 'desk' }: { kind?: 'desk' | 'legal' }) {
  const email = kind === 'legal' ? publicEnv.legalEmail : publicEnv.contactEmail
  if (!email) return <span className="text-ink-muted">[contact email — the site owner adds it here]</span>
  return (
    <a href={`mailto:${email}`} className={LINK}>
      {email}
    </a>
  )
}
