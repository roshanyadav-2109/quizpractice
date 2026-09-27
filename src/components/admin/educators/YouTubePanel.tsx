'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ROUTES } from '@/lib/teach/contracts'
import { CheckCircle, MinusCircle, WarningCircle, YoutubeLogo } from '@/components/ui/icons'
import type { YouTubeStatus } from '@/lib/youtube/connection'

const AUDIT_FORM = 'https://support.google.com/youtube/contact/yt_api_form'
const GOOGLE_PERMISSIONS = 'https://myaccount.google.com/permissions'

/**
 * The site's connection to the Unknown IITians channel, for the one-click
 * upload (v2). Teachers can always record, upload by hand in YouTube Studio
 * and paste the link (v1); none of this is needed for that.
 *
 * Connect is a plain link: /api/youtube/connect sends the admin to Google's
 * consent screen and the callback brings them back here with ?youtube=…,
 * which the page turns into `banner`. Disconnect withdraws the permission at
 * Google and deletes the stored token.
 */
export function YouTubePanel({
  status,
  banner,
  contactEmailSet,
}: {
  status: YouTubeStatus
  banner: { tone: 'correct' | 'incorrect'; text: string } | null
  contactEmailSet: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ tone: 'correct' | 'incorrect'; text: string } | null>(null)

  const wrongChannel = Boolean(
    status.connected && status.expectedChannelId && status.channelId !== status.expectedChannelId,
  )

  function disconnect() {
    if (
      !window.confirm(
        'Disconnect the YouTube channel?\n\nThe site gives back its permission to upload. Teachers can still paste links to videos they upload in YouTube Studio.',
      )
    ) {
      return
    }
    setResult(null)
    startTransition(async () => {
      try {
        const response = await fetch(ROUTES.apiYoutubeDisconnect, {
          method: 'POST',
          headers: { Accept: 'application/json' },
        })
        const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string }
        setResult(
          response.ok
            ? { tone: 'correct', text: body.message ?? 'Disconnected.' }
            : { tone: 'incorrect', text: body.error ?? 'The channel could not be disconnected. Try again.' },
        )
      } catch {
        setResult({ tone: 'incorrect', text: 'The site could not be reached. Try again.' })
      }
      router.refresh()
    })
  }

  const notice = result ?? banner

  return (
    <div className="flex flex-col gap-4">
      {notice ? (
        <p
          role="status"
          className={`rounded-md px-3 py-2 text-xs ${
            notice.tone === 'correct' ? 'bg-correct-soft text-correct' : 'bg-incorrect-soft text-incorrect'
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      <div className="rounded-lg border border-rule bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <YoutubeLogo size={22} className={status.connected ? 'text-incorrect' : 'text-ink-faint'} aria-hidden />
            <div className="min-w-0">
              {status.connected ? (
                <>
                  <p className="text-[0.9375rem] text-ink">
                    Connected to {status.channelTitle ?? 'the channel'}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    <span className="font-mono">{status.channelId}</span>
                    {status.connectedAt
                      ? ` · since ${new Date(status.connectedAt).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          // Same day on the server (UTC) and in the browser, or hydration fails.
                          timeZone: 'Asia/Kolkata',
                        })}`
                      : ''}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[0.9375rem] text-ink">No channel connected</p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    Teachers upload in YouTube Studio themselves and paste the link. Connecting is only needed for
                    the one-click upload.
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {status.oauthConfigured ? (
              // A plain link, not <Link>: the route answers with a redirect to Google.
              <a
                href={ROUTES.apiYoutubeConnect}
                className={`inline-flex h-7 items-center rounded-[3px] px-2.5 text-[0.78125rem] transition-colors ${
                  status.connected
                    ? 'border border-rule text-ink-muted hover:border-rule-strong hover:text-ink'
                    : 'bg-accent text-accent-ink hover:bg-accent-hover'
                }`}
              >
                {status.connected || status.lastError ? 'Reconnect' : 'Connect channel'}
              </a>
            ) : null}
            {status.connected ? (
              <button
                type="button"
                onClick={disconnect}
                disabled={pending}
                className="inline-flex h-7 items-center rounded-[3px] border border-incorrect px-2.5 text-[0.78125rem] text-incorrect transition-colors hover:bg-incorrect-soft disabled:opacity-60"
              >
                {pending ? 'Disconnecting…' : 'Disconnect'}
              </button>
            ) : null}
          </div>
        </div>

        {status.lastError ? (
          <p className="mt-3 rounded-md bg-incorrect-soft px-3 py-2 text-xs text-incorrect">{status.lastError}</p>
        ) : null}
        {wrongChannel ? (
          <p className="mt-3 rounded-md bg-marked-soft px-3 py-2 text-xs text-marked">
            This is not the channel in YOUTUBE_CHANNEL_ID (<span className="font-mono">{status.expectedChannelId}</span>).
            Reconnect and pick the right channel when Google asks.
          </p>
        ) : null}
        {!status.oauthConfigured ? (
          <p className="mt-3 rounded-md bg-surface-2 px-3 py-2 text-xs text-ink-muted">
            Not set up on this server: add YOUTUBE_OAUTH_CLIENT_ID, YOUTUBE_OAUTH_CLIENT_SECRET and YOUTUBE_TOKEN_KEY
            (docs/youtube.md in the repository, sections 2 and 3), redeploy, then connect here.
          </p>
        ) : null}

        <dl className="mt-3 grid gap-x-6 gap-y-1 border-t border-rule pt-3 text-xs sm:grid-cols-2">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-muted">One-click upload (YOUTUBE_API_UPLOADS)</dt>
            <dd className={status.apiUploads ? 'text-correct' : 'text-ink'}>{status.apiUploads ? 'on' : 'off'}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-muted">Teachers see Upload to YouTube</dt>
            <dd className="text-ink">{status.apiUploads && status.connected ? 'yes' : 'no, they paste links'}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-muted">Only this channel may connect</dt>
            <dd className="font-mono text-ink">{status.expectedChannelId ?? 'any (not set)'}</dd>
          </div>
        </dl>
        {status.apiUploads && !status.connected ? (
          <p className="mt-2 text-xs text-marked">
            The flag is on but no channel is connected, so teachers still paste links.
          </p>
        ) : null}
      </div>

      <div className="rounded-lg border border-rule bg-surface p-4">
        <h4 className="text-[0.8125rem] font-medium text-ink">Before turning on the one-click upload</h4>
        <p className="mt-1 text-xs text-ink-muted">
          Until Google&rsquo;s YouTube API audit passes, every video the site uploads is locked Private for good.
          Keep YOUTUBE_API_UPLOADS off until then.
        </p>
        <ol className="mt-3 flex flex-col gap-1.5 text-xs">
          <Step state={status.oauthConfigured ? 'done' : 'todo'}>
            The Cloud project, OAuth client and token key are set on the server.
          </Step>
          <Step state={status.connected && !wrongChannel ? 'done' : status.connected ? 'problem' : 'todo'}>
            The Unknown IITians channel is connected{status.expectedChannelId ? ' and matches YOUTUBE_CHANNEL_ID' : ''}.
          </Step>
          <Step state={contactEmailSet ? 'done' : 'todo'}>
            NEXT_PUBLIC_CONTACT_EMAIL is set, so /privacy and /terms (linked in the footer) show a real address.
          </Step>
          <Step state="manual">
            A reviewer Google account has signed in, been made a teacher above and given one subject.
          </Step>
          <Step state="manual">
            The{' '}
            <a href={AUDIT_FORM} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              audit form
            </a>{' '}
            is sent with the quizpractice-youtube project number, the privacy and terms addresses and a recording of
            the upload screen.
          </Step>
          <Step state={status.apiUploads ? 'done' : 'manual'}>
            After approval: YOUTUBE_API_UPLOADS=on in Vercel, redeploy, then demote the reviewer account.
          </Step>
        </ol>
        <p className="mt-3 text-[0.71875rem] text-ink-faint">
          Every step, and what to do when connecting fails: docs/youtube.md. Withdrawing the permission at{' '}
          <a href={GOOGLE_PERMISSIONS} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            myaccount.google.com/permissions
          </a>{' '}
          works too; the site notices within a day.
        </p>
      </div>
    </div>
  )
}

function Step({ state, children }: { state: 'done' | 'todo' | 'problem' | 'manual'; children: React.ReactNode }) {
  const icon =
    state === 'done' ? (
      <CheckCircle size={14} weight="fill" className="text-correct" aria-label="Done" />
    ) : state === 'problem' ? (
      <WarningCircle size={14} weight="fill" className="text-incorrect" aria-label="Needs attention" />
    ) : (
      <MinusCircle size={14} className="text-ink-faint" aria-label={state === 'todo' ? 'Not yet' : 'Check by hand'} />
    )
  return (
    <li className="flex items-start gap-2">
      <span className="mt-px shrink-0">{icon}</span>
      <span className={state === 'done' ? 'text-ink-muted' : 'text-ink'}>{children}</span>
    </li>
  )
}
