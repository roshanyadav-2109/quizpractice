import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Page, PageHeader } from '@/components/site/Page'
import { publicEnv } from '@/lib/env'

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What Quiz Space by Unknown IITians collects, why, who it is shared with, and how to have it deleted.',
}

const UPDATED = '27 September 2026'

const YOUTUBE_TERMS = 'https://www.youtube.com/t/terms'
const GOOGLE_PRIVACY = 'http://www.google.com/policies/privacy'
const GOOGLE_PERMISSIONS = 'https://security.google.com/settings/security/permissions'

/**
 * The privacy policy. Plain words, and complete enough for Google's YouTube
 * API audit (Developer Policies III.A.2): it says the site uses YouTube API
 * Services, links YouTube's terms and Google's privacy policy, lists what is
 * collected and stored and who sees it, covers cookies and third-party
 * players, says how to revoke access and how to reach the owner.
 *
 * Linked from the footer of every page.
 */
export default function PrivacyPage() {
  return (
    <Page>
      <PageHeader title="Privacy" meta={`Last updated ${UPDATED}`} />

      <article className="max-w-[68ch] text-body text-ink">
        <Lead>
          Quiz Space by Unknown IITians is a site for practising previous year papers of the IIT Madras BS degree. This page explains
          what we collect when you use it, why, who else handles it, and how to have it removed. We do not sell your
          data and we do not show advertising.
        </Lead>

        <Heading>What we collect</Heading>
        <List>
          <li>
            <strong className="font-medium">Your Google account basics.</strong> When you sign in with Google we
            receive your name, email address and profile photo. Your name and photo appear next to anything you post;
            your email address identifies your account, is never shown publicly, and is seen only by the site’s
            admins when they manage accounts.
          </li>
          <li>
            <strong className="font-medium">Your practice.</strong> The papers you sit, your answers, marks and time
            taken, and the mistakes you retry, so we can show your results and analysis. Comparisons with other
            students use totals only and never show who anyone is.
          </li>
          <li>
            <strong className="font-medium">What you write.</strong> Discussion posts (shown publicly with your name)
            and reports of errors in questions.
          </li>
          <li>
            <strong className="font-medium">Teachers’ work.</strong> Explanations and board drawings a teacher writes
            are published with the teacher’s name. Recordings are made and kept in the teacher’s own browser until
            they are uploaded or thrown away. They are published on the site’s YouTube channel, Unknown IITians,
            either by the teacher in YouTube Studio or through the site’s upload feature (see below).
          </li>
          <li>
            <strong className="font-medium">Access given by email.</strong> An admin can give teacher access to an
            email address before its owner has signed in. The address is seen only by admins and is kept until its
            owner first signs in with it, when the access is applied, or until the admin cancels it.
          </li>
          <li>
            <strong className="font-medium">Searches.</strong> We count the words people search for, by day, to
            suggest popular searches. Nothing records who searched.
          </li>
          <li>
            <strong className="font-medium">Technical logs.</strong> Our hosting provider records requests (such as
            IP address, browser and time) to keep the site running and secure.
          </li>
        </List>

        <Heading id="youtube">YouTube API Services</Heading>
        <P>
          Quiz Space uses YouTube API Services. By watching explanation videos on the site, or uploading through
          it, you are also bound by the{' '}
          <External href={YOUTUBE_TERMS}>YouTube Terms of Service</External>, and Google handles data from those
          services under the <External href={GOOGLE_PRIVACY}>Google Privacy Policy</External>.
        </P>
        <P>We use YouTube API Services for three things:</P>
        <List>
          <li>
            <strong className="font-medium">Showing explanation videos</strong> with YouTube’s embedded player, in its
            privacy-enhanced mode (youtube-nocookie.com).
          </li>
          <li>
            <strong className="font-medium">Checking a video link</strong> a teacher adds to an explanation: that the
            video exists, is on the site’s channel, and can be played here. We read the video’s title, channel,
            visibility and whether it can be embedded, and keep only its link.
          </li>
          <li>
            <strong className="font-medium">Uploading teachers’ recordings</strong> to the site’s own channel. The
            channel’s owner gives the site permission once, from Google’s consent screen. We keep that permission
            encrypted, together with the channel’s id, and use it only to upload recordings and read those videos
            back. For each upload we keep the title, visibility, file size, the video’s id and whether it finished.
            A recording normally goes from the teacher’s browser straight to YouTube; when that route is blocked it
            passes through our server on its way, and is not kept there.
          </li>
        </List>
        <P>
          We do not access or store anything from a visitor’s own YouTube account. Other information we read from
          YouTube, such as the channel’s name, is fetched when it is needed and not stored.
        </P>

        <Heading id="revoke">Withdrawing access</Heading>
        <P>
          Anyone who has given the site access to a Google account can withdraw it at any time on Google’s{' '}
          <External href={GOOGLE_PERMISSIONS}>security settings page</External>. The site stops being able to use
          that access at once. The channel’s owner can also disconnect the channel inside the site, which deletes the
          stored permission immediately. The site also checks every day that the permission still works: once access
          has been withdrawn on Google’s page, the next check deletes the stored permission and the channel’s id,
          well within 30 days.
        </P>

        <Heading>Who else handles your data</Heading>
        <P>We share data only with the services that run the site, and only for that purpose:</P>
        <List>
          <li>Supabase, which stores the database and handles sign-in;</li>
          <li>Vercel, which hosts the site;</li>
          <li>Cloudinary, which stores and serves the images in questions;</li>
          <li>Google, for sign-in, and YouTube, for the videos as described above.</li>
        </List>
        <P>
          Explanations, board drawings and videos are public once published, as are discussion posts. We do not sell
          or rent personal data, and we do not give it to advertisers.
        </P>

        <Heading>Other companies’ content on the site</Heading>
        <P>
          Explanation videos play in YouTube’s player, which YouTube serves. It loads only when you open an
          explanation with a video, and once you play it YouTube may collect information and set cookies under the{' '}
          <External href={GOOGLE_PRIVACY}>Google Privacy Policy</External>. No third party serves advertising on
          Quiz Space.
        </P>

        <Heading>Cookies and storage on your device</Heading>
        <List>
          <li>Sign-in cookies keep you signed in. They are needed for the site to work.</li>
          <li>
            A short-lived cookie is set while an admin connects the YouTube channel, and removed within ten minutes.
          </li>
          <li>
            Your browser’s own storage holds an unfinished paper’s answers, your recent searches and, for teachers,
            recordings and uploads that have not finished. This stays on your device and you can clear it in your
            browser’s settings.
          </li>
        </List>
        <P>We use no analytics or advertising cookies.</P>

        <Heading id="delete">Keeping and deleting data</Heading>
        <P>
          We keep your account data while your account exists. Ask us to delete your account and we will delete it,
          with your attempts, posts and everything else linked to it, within 30 days — and any data we hold from
          YouTube API Services about you within 7 days. Published explanations can be taken down on request in the
          same way.
        </P>

        <Heading id="contact">Contact</Heading>
        <P>
          Questions or complaints about privacy, requests for your data, and deletion requests go to{' '}
          <Contact kind="legal" />. Anything else about the site: <Contact />. We aim to answer within a week.
        </P>

        <Heading>Changes</Heading>
        <P>
          When this page changes, the date at the top changes with it. The <Link href="/terms" className={LINK}>terms of use</Link>{' '}
          cover the rest of how the site may be used.
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
