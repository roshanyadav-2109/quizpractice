import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Page, PageHeader } from '@/components/site/Page'
import { publicEnv } from '@/lib/env'

export const metadata: Metadata = {
  title: 'Terms of use',
  description:
    'The terms governing the use of Quiz Space by Unknown IITians, including the YouTube Terms of Service that apply to its videos.',
}

const UPDATED = '28 September 2026'

const YOUTUBE_TERMS = 'https://www.youtube.com/t/terms'
const YOUTUBE_GUIDELINES = 'https://www.youtube.com/howyoutubeworks/policies/community-guidelines/'

/**
 * The terms of use, in formal terms. The part Google's YouTube API audit looks
 * for (Developer Policies III.A.1) is section 9: a link to YouTube's terms, and
 * the statement that using the Service means agreeing to them.
 *
 * Linked from the footer of every page.
 */
export default function TermsPage() {
  return (
    <Page>
      <PageHeader title="Terms of use" meta={`Last updated ${UPDATED}`} />

      <article className="max-w-[68ch] text-body text-ink">
        <p className="text-ink-muted">
          These Terms of Use (the &ldquo;Terms&rdquo;) govern your access to and use of Quiz Space, an online platform for
          practising previous year question papers of the IIT Madras BS degree, operated by Unknown IITians
          (&ldquo;we&rdquo;, &ldquo;us&rdquo; or &ldquo;our&rdquo;), including its website, practice and mock test features,
          and related services (together, the &ldquo;Service&rdquo;). By accessing or using the Service, you agree to be
          bound by these Terms. If you do not agree, you must not use the Service.
        </p>

        <Heading>1. About the Service</Heading>
        <P>
          The Service is an independent educational resource. It is not affiliated with, endorsed by or operated on
          behalf of the Indian Institute of Technology Madras or any other institution.
        </P>

        <Heading>2. Eligibility</Heading>
        <P>
          The Service is intended for learners aged 18 and above. If you are under 18, you may use the Service only with
          the consent and supervision of a parent or legal guardian, who agrees to these Terms on your behalf.
        </P>

        <Heading>3. Your account</Heading>
        <P>
          Certain features, including timed mock tests, answer checking in practice mode and saved attempts, require you
          to sign in with a Google account. You are responsible for all activity under your account and for keeping
          access to it secure. Notify us promptly at <Contact kind="legal" /> of any unauthorised use.
        </P>

        <Heading>4. Acceptable use</Heading>
        <P>You agree not to:</P>
        <List>
          <li>copy, scrape, download or reproduce content from the Service in bulk, or by automated means;</li>
          <li>republish, sell, license or otherwise commercially exploit any part of the Service;</li>
          <li>use the Service to gain an unfair advantage in any examination that is in progress;</li>
          <li>
            attempt to gain unauthorised access to the Service, interfere with its operation or security, or reverse
            engineer any part of it;
          </li>
          <li>post content that is unlawful, misleading, defamatory, obscene, hateful or infringing, or that harasses others;</li>
          <li>impersonate any person, or misrepresent your affiliation with any person or institution; or</li>
          <li>use the Service in breach of any applicable law.</li>
        </List>

        <Heading>5. Intellectual property</Heading>
        <P>
          The Service, including its design, software, text, graphics, explanations and compilation of content, is
          owned by us or our licensors and is protected by applicable intellectual property laws. Question papers
          remain the property of their respective owners and are presented for educational reference. Subject to these
          Terms, we grant you a limited, personal, non-exclusive, non-transferable and revocable licence to access and
          use the Service for your own non-commercial study.
        </P>

        <Heading>6. Content you submit</Heading>
        <P>
          You retain ownership of the discussion posts, reports and other content you submit. By submitting content, you
          grant us a worldwide, royalty-free, non-exclusive licence to host, display, reproduce and distribute it on the
          Service. You confirm that you have the rights needed to grant this licence and that your content complies with
          these Terms. We may review, moderate or remove any content at our discretion.
        </P>

        <Heading>7. Educator contributions</Heading>
        <P>
          Educators who contribute explanations, board drawings or video recordings confirm that each contribution is
          their original work and grant us the right to publish it on the Service, with their name, and on our YouTube
          channel. Videos must comply with YouTube&rsquo;s{' '}
          <External href={YOUTUBE_GUIDELINES}>Community Guidelines</External>, and uploading through the Service
          constitutes agreement to the <External href={YOUTUBE_TERMS}>YouTube Terms of Service</External> for that
          video.
        </P>

        <Heading>8. Accuracy of content</Heading>
        <P>
          We take care in preparing answer keys, solutions and explanations, but they may contain errors or omissions.
          Content on the Service is provided for practice and general educational purposes only and is not official
          guidance. If you find an error, please report it on the question concerned so that it can be corrected.
        </P>

        <Heading id="youtube">9. YouTube API Services</Heading>
        <P>
          The Service uses YouTube API Services to display video solutions and to publish educators&rsquo; recordings.{' '}
          <strong className="font-medium">
            By using the Service, you agree to be bound by the{' '}
            <External href={YOUTUBE_TERMS}>YouTube Terms of Service</External>.
          </strong>{' '}
          How we handle data from YouTube API Services is described in our{' '}
          <Link href="/privacy#youtube" className={LINK}>
            Privacy Policy
          </Link>
          .
        </P>

        <Heading>10. Copyright complaints</Heading>
        <P>
          If you believe that content on the Service infringes your rights, write to <Contact kind="legal" /> with a
          description of the work, the location of the content on the Service, your contact details and a statement
          that you are the rights holder or are authorised to act on their behalf. We will review each complaint and
          remove content where appropriate.
        </P>

        <Heading>11. Disclaimer of warranties</Heading>
        <P>
          The Service is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis, without warranties of any
          kind, whether express or implied, including warranties of accuracy, fitness for a particular purpose and
          uninterrupted availability. We do not guarantee any particular result in any examination.
        </P>

        <Heading>12. Limitation of liability</Heading>
        <P>
          To the fullest extent permitted by law, we shall not be liable for any indirect, incidental, special,
          consequential or punitive damages, or for any loss of data, opportunity or goodwill, arising out of or in
          connection with your use of, or inability to use, the Service.
        </P>

        <Heading>13. Indemnity</Heading>
        <P>
          You agree to indemnify and hold us harmless from any claims, losses and expenses arising from your breach of
          these Terms or your misuse of the Service.
        </P>

        <Heading>14. Suspension and termination</Heading>
        <P>
          We may suspend or terminate your access to the Service, with or without notice, if you breach these Terms or
          if we are required to do so by law. You may stop using the Service at any time and may ask us to delete your
          account as described in our{' '}
          <Link href="/privacy#delete" className={LINK}>
            Privacy Policy
          </Link>
          .
        </P>

        <Heading>15. Changes to the Service and these Terms</Heading>
        <P>
          We may modify, suspend or discontinue any part of the Service, and may revise these Terms from time to time.
          The date at the top of this page shows when the Terms were last revised. Your continued use of the Service
          after a revision means you accept the revised Terms.
        </P>

        <Heading>16. Governing law and jurisdiction</Heading>
        <P>
          These Terms are governed by the laws of India. Any dispute arising out of or in connection with these Terms
          or the Service shall be subject to the jurisdiction of the competent courts in India.
        </P>

        <Heading id="contact">17. Grievances and contact</Heading>
        <P>
          Complaints about content on the Service, legal notices, and questions about these Terms may be sent to our
          Grievance Officer at <Contact kind="legal" />. We will acknowledge your complaint promptly and resolve it
          within the time required by applicable law. For any other matter, write to <Contact />.
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

function External({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LINK}>
      {children}
    </a>
  )
}

/**
 * One of the site's two addresses: `legal` (NEXT_PUBLIC_LEGAL_EMAIL) for
 * legal notices, grievances and copyright complaints, `desk`
 * (NEXT_PUBLIC_CONTACT_EMAIL) for everything else. A visible placeholder until it is set.
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
