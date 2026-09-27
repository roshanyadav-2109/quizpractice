'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { attachVideoAction, removeVideoAction } from '@/app/teach/q/[questionId]/actions'
import { CheckCircle, LinkSimple, Trash, Warning } from '@/components/ui/icons'
import { buttonClass } from '@/components/ui/primitives'
import type { ModerationStatus } from '@/types/db'

/** What changed on the explanation after a video was attached or removed. */
export interface VideoChange {
  videoUrl: string | null
  solutionId: string
  status: ModerationStatus
  reach: number
}

/**
 * Paste a YouTube link, and the site checks it before keeping it: the video
 * must be on the channel, not Private, and allowed to play on other sites.
 * A start time in the link (…?t=95) is kept, so one long recording can serve
 * several questions.
 */
export function LinkVideoField({
  questionId,
  solutionId,
  currentUrl,
  onChange,
  onActivity,
}: {
  questionId: string
  /** Staff editing someone else's explanation: attach to that one. */
  solutionId?: string
  currentUrl: string | null
  onChange: (change: VideoChange) => void
  onActivity?: () => void
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [attached, setAttached] = useState<{ title: string; channelTitle: string; warnings: string[] } | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(event: FormEvent) {
    event.preventDefault()
    const url = value.trim()
    if (!url) {
      setError('Paste the video’s link first.')
      return
    }
    onActivity?.()
    setError(null)
    setAttached(null)
    startTransition(async () => {
      try {
        const result = await attachVideoAction(questionId, url, solutionId)
        if (!result.ok) {
          setError(result.error)
          return
        }
        setAttached({ title: result.title, channelTitle: result.channelTitle, warnings: result.warnings })
        setValue('')
        onChange({ videoUrl: result.url, solutionId: result.solutionId, status: result.status, reach: result.reach })
      } catch {
        setError('The link could not be checked. Check the connection and try again.')
      }
    })
  }

  function remove() {
    if (!window.confirm('Take the video off this explanation? The video itself stays on YouTube.')) return
    onActivity?.()
    setError(null)
    setAttached(null)
    startTransition(async () => {
      try {
        const result = await removeVideoAction(questionId, solutionId)
        if (!result.ok) {
          setError(result.error)
          return
        }
        onChange({ videoUrl: null, solutionId: result.solutionId, status: result.status, reach: result.reach })
      } catch {
        setError('The video could not be removed. Check the connection and try again.')
      }
    })
  }

  return (
    <div>
      {/* noValidate: the browser would refuse "youtu.be/…" without https://, which the site accepts. */}
      <form onSubmit={submit} noValidate className="flex flex-wrap items-stretch gap-2">
        <label className="min-w-0 flex-1 basis-64">
          <span className="sr-only">YouTube link</span>
          <span className="flex h-10 items-center gap-2 rounded-control border border-rule bg-surface px-3 focus-within:border-accent">
            <LinkSimple size={16} aria-hidden="true" className="shrink-0 text-ink-faint" />
            <input
              type="url"
              inputMode="url"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={currentUrl ? 'Paste a new link to replace the video' : 'https://youtu.be/…'}
              className="h-full min-w-0 flex-1 bg-transparent text-ui text-ink outline-none placeholder:text-ink-faint"
              autoComplete="off"
              spellCheck={false}
            />
          </span>
        </label>
        <button type="submit" disabled={pending} className={buttonClass('primary', 'md')}>
          {pending ? 'Checking…' : currentUrl ? 'Replace video' : 'Attach video'}
        </button>
        {currentUrl ? (
          <button type="button" onClick={remove} disabled={pending} className={buttonClass('danger', 'md')}>
            <Trash size={16} aria-hidden="true" />
            Remove
          </button>
        ) : null}
      </form>

      <div aria-live="polite">
        {error ? (
          <p className="mt-2 flex items-start gap-2 text-meta text-incorrect">
            <Warning size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            {error}
          </p>
        ) : null}
        {attached ? (
          <div className="mt-2 text-meta">
            <p className="flex items-start gap-2 text-correct">
              <CheckCircle size={16} weight="fill" aria-hidden="true" className="mt-0.5 shrink-0" />
              <span>
                Attached{attached.title ? <> “{attached.title}”</> : null}
                {attached.channelTitle ? <> on {attached.channelTitle}</> : null}.
              </span>
            </p>
            {attached.warnings.map((warning) => (
              <p key={warning} className="mt-1 pl-6 text-ink-muted">
                {warning}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
