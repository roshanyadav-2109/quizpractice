import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Page, PageHeader } from '@/components/site/Page'
import { publicEnv } from '@/lib/env'

export const metadata: Metadata = {
  title: 'Privacy policy',
  description:
    'How Quiz Space by Unknown IITians collects, uses, shares and protects personal information, and the choices and rights you have.',
}

const UPDATED = '28 September 2026'

const YOUTUBE_TERMS = 'https://www.youtube.com/t/terms'
const GOOGLE_PRIVACY = 'http://www.google.com/policies/privacy'
const GOOGLE_PERMISSIONS = 'https://security.google.com/settings/security/permissions'

/**
 * The privacy policy, in formal terms. It also carries what Google's YouTube
 * API audit asks of a privacy policy (Developer Policies III.A.2): that the
 * Service uses YouTube API Services, links to YouTube's terms and Google's
 * privacy policy, what is accessed, stored and shared, cookies and third-party
 * players, how to revoke access, and how to reach us.
 *
 * Linked from the footer of every page.
 */
export default function PrivacyPage() {
  return (
    <Page>
      <PageHeader title="Privacy policy" meta={`Last updated ${UPDATED}`} />

      <article className="max-w-[68ch] text-body text-ink">
        <Lead>
          This Privacy Policy explains how Unknown IITians (&ldquo;we&rdquo;, &ldquo;us&rdquo; or &ldquo;our&rdquo;) collects,
          uses, shares and protects personal information when you use Quiz Space, our online platform for practising
          previous year question papers of the IIT Madras BS degree, including its website, practice and mock test
          features, and related services (together, the &ldquo;Service&rdquo;). By using the Service, you acknowledge that
          you have read and understood this Policy.
        </Lead>

        <Heading>1. Information we collect</Heading>
        <SubHeading>1.1 Information you provide to us</SubHeading>
        <List>
          <li>
            <strong className="font-medium">Account information.</strong> When you sign in with your Google account, we
            receive your name, email address and profile picture from Google. We use these to create and identify your
            account. Your email address is never displayed publicly.
          </li>
          <li>
            <strong className="font-medium">Content you submit.</strong> Discussion posts, replies and reports of errors
            in questions. Discussion posts are displayed publicly with your name and profile picture.
          </li>
          <li>
            <strong className="font-medium">Educator contributions.</strong> Explanations, board drawings and video
            recordings submitted by educators, which are published with the educator&rsquo;s name.
          </li>
          <li>
            <strong className="font-medium">Communications.</strong> Information you share when you contact us, such as
            your email address and the contents of your message.
          </li>
        </List>
        <SubHeading>1.2 Information collected when you use the Service</SubHeading>
        <List>
          <li>
            <strong className="font-medium">Learning activity.</strong> The papers you attempt, your responses, scores,
            time spent and the questions you revisit, so that we can show your results, progress and analysis.
          </li>
          <li>
            <strong className="font-medium">Usage and device information.</strong> Technical information such as your
            IP address, browser type, device type, pages visited and the date and time of access, which our service
            providers record to operate, secure and maintain the Service.
          </li>
          <li>
            <strong className="font-medium">Aggregated statistics.</strong> Counts of page visits and of popular search
            terms, measured in aggregate and without cookies. These statistics do not identify you.
          </li>
        </List>
        <SubHeading>1.3 Information from third parties</SubHeading>
        <P>
          We receive the account information described above from Google when you choose to sign in with Google, and
          information about videos from YouTube as described in section 4.
        </P>

        <Heading>2. How we use your information</Heading>
        <P>We use personal information to:</P>
        <List>
          <li>provide, operate and maintain the Service and your account;</li>
          <li>record your attempts and show your results, analysis and progress;</li>
          <li>enable discussions and publish educator contributions;</li>
          <li>respond to your requests, reports and enquiries;</li>
          <li>protect the security and integrity of the Service and prevent misuse;</li>
          <li>understand, in aggregate, how the Service is used, and improve it; and</li>
          <li>comply with applicable law and enforce our Terms of Use.</li>
        </List>
        <P>
          We process personal information on the basis of your consent, which you give by signing in and using the
          Service, and for other purposes permitted under applicable law, including the Digital Personal Data
          Protection Act, 2023. We do not use your information for advertising, and we do not sell or rent it.
        </P>

        <Heading>3. How we share your information</Heading>
        <List>
          <li>
            <strong className="font-medium">Service providers.</strong> We engage trusted third-party service providers
            to host the Service, store data, provide sign-in and deliver content. They process personal information
            only on our instructions, only to provide their services to us, and subject to confidentiality and security
            obligations.
          </li>
          <li>
            <strong className="font-medium">Public content.</strong> Discussion posts and published educator
            contributions are visible to everyone who uses the Service.
          </li>
          <li>
            <strong className="font-medium">Legal requirements.</strong> We may disclose information where required by
            law, regulation or valid legal process, or where necessary to protect the rights, safety or property of our
            users, the public or us.
          </li>
          <li>
            <strong className="font-medium">Organisational changes.</strong> If the Service is transferred as part of a
            reorganisation or a transfer of its operations, personal information may be transferred with it, subject
            to this Policy.
          </li>
        </List>

        <Heading id="youtube">4. YouTube API Services</Heading>
        <P>
          The Service uses YouTube API Services. By watching videos on the Service, or by uploading videos through it,
          you also agree to be bound by the <External href={YOUTUBE_TERMS}>YouTube Terms of Service</External>, and
          Google processes data from those services under the{' '}
          <External href={GOOGLE_PRIVACY}>Google Privacy Policy</External>. We use YouTube API Services to:
        </P>
        <List>
          <li>display video solutions using YouTube&rsquo;s embedded player, in its privacy-enhanced mode;</li>
          <li>
            verify a video link an educator adds: that the video exists, belongs to our channel and can be played on the
            Service. We read the video&rsquo;s title, channel, visibility and embedding setting, and store only its link;
            and
          </li>
          <li>
            upload educators&rsquo; recordings to our own YouTube channel, with the permission granted once by the
            channel&rsquo;s owner. We store that permission securely, together with the channel&rsquo;s identifier, and use
            it only to upload recordings and read those videos back. For each upload we retain its title, visibility,
            file size, video identifier and completion status.
          </li>
        </List>
        <P>
          We do not access or store any information from a visitor&rsquo;s own YouTube account. Other information read
          from YouTube, such as the channel&rsquo;s name, is retrieved when needed and not stored.
        </P>

        <Heading id="revoke">5. Withdrawing access</Heading>
        <P>
          Anyone who has granted the Service access to a Google account may withdraw it at any time through
          Google&rsquo;s <External href={GOOGLE_PERMISSIONS}>security settings page</External>, after which the Service can
          no longer use that access. The channel&rsquo;s owner may also disconnect the channel within the Service, which
          deletes the stored permission immediately. The Service checks every day that the permission remains valid,
          and deletes the stored permission and channel identifier once access has been withdrawn, in any case within
          30 days.
        </P>

        <Heading>6. Cookies and similar technologies</Heading>
        <List>
          <li>
            <strong className="font-medium">Essential cookies</strong> keep you signed in and keep the Service secure.
            The Service cannot work properly without them.
          </li>
          <li>
            <strong className="font-medium">Storage on your device</strong> holds, for example, the answers to a paper
            you have not yet finished and your recent searches. This information stays on your device, and you can
            clear it through your browser settings.
          </li>
          <li>
            <strong className="font-medium">Third-party content.</strong> Embedded YouTube videos load only when you
            open a video solution. Once you play a video, YouTube may collect information and set cookies under the{' '}
            <External href={GOOGLE_PRIVACY}>Google Privacy Policy</External>.
          </li>
        </List>
        <P>We do not use advertising cookies, and our visit statistics are measured without cookies.</P>

        <Heading id="delete">7. Data retention</Heading>
        <P>
          We retain personal information for as long as your account remains active, or as long as needed to provide the
          Service and to meet our legal obligations. If you ask us to delete your account, we will delete it together
          with your attempts, posts and other associated information within 30 days, and any data obtained through
          YouTube API Services within 7 days, except where we are required by law to retain it. Published contributions
          may be removed on request in the same way.
        </P>

        <Heading>8. Data security</Heading>
        <P>
          We use reasonable technical and organisational measures to protect personal information, including encrypted
          connections, access controls and secure storage. No method of transmission or storage is completely secure,
          however, and we cannot guarantee absolute security.
        </P>

        <Heading>9. Your rights</Heading>
        <P>Subject to applicable law, you have the right to:</P>
        <List>
          <li>obtain a summary of the personal information we hold about you and how it is used;</li>
          <li>request the correction, completion or updating of your personal information;</li>
          <li>request the deletion of your personal information and your account;</li>
          <li>withdraw your consent at any time, with effect for the future;</li>
          <li>nominate another person to exercise these rights on your behalf; and</li>
          <li>raise a grievance with us, as described in section 13.</li>
        </List>
        <P>
          To exercise any of these rights, write to <Contact kind="legal" /> from the email address linked to your
          account.
        </P>

        <Heading>10. Children</Heading>
        <P>
          The Service is intended for learners aged 18 and above. If you are under 18, you may use the Service only with
          the consent and supervision of a parent or legal guardian. If we learn that we hold personal information of a
          child without such consent, we will delete it.
        </P>

        <Heading>11. Where your information is processed</Heading>
        <P>
          Our service providers may process personal information in India and in other countries. Wherever it is
          processed, we require it to be protected in line with this Policy and applicable law.
        </P>

        <Heading>12. Changes to this Policy</Heading>
        <P>
          We may update this Policy from time to time. The date at the top of this page shows when it was last revised,
          and significant changes will be highlighted on the Service. Your continued use of the Service after an update
          means you accept the revised Policy. Please read it together with our{' '}
          <Link href="/terms" className={LINK}>
            Terms of Use
          </Link>
          .
        </P>

        <Heading id="contact">13. Contact and grievances</Heading>
        <P>
          Questions, requests and complaints about this Policy or your personal information, and any grievance, may be
          sent to our Grievance Officer at <Contact kind="legal" />. We will acknowledge your message promptly and
          respond within the time required by applicable law. For any other matter, write to <Contact />.
        </P>
      </article>
    </Page>
  )
}

const LINK = 'text-accent underline-offset-2 hover:underline'

function Lead({ children }: { children: ReactNode }) {
  return <p className="text-ink-muted">{children}</p>
}

function Heading({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="mt-8 mb-2 scroll-mt-24 text-card font-medium text-ink">
      {children}
    </h2>
  )
}

function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="mt-5 text-ui font-medium text-ink">{children}</h3>
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
 * privacy, data, grievances and legal notices, `desk` (NEXT_PUBLIC_CONTACT_EMAIL)
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
