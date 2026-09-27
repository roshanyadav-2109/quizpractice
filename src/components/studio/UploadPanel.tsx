'use client'

import { useRef, useState } from 'react'
import {
  YouTubeUploadError,
  abandonYouTubeUpload,
  forgetYouTubeUpload,
  pendingYouTubeUpload,
  resumeYouTubeUpload,
  startYouTubeUpload,
  type UploadHandle,
  type UploadOutcome,
  type UploadProgress,
} from '@/lib/youtube/upload-client'
import { DESCRIPTION_MAX_BYTES, TITLE_MAX_CHARS, formatBytes, utf8Length } from '@/lib/studio/filename'
import type { Take } from '@/lib/studio/recorder'
import type { VideoPrivacy } from '@/types/db'
import { ArrowUpRight, Check, CheckCircle, Copy, Info, UploadSimple, Warning, YoutubeLogo } from '@/components/ui/icons'
import { buttonClass } from '@/components/ui/primitives'
import { LinkVideoField, type VideoChange } from './LinkVideoField'

const TERMS_URL = 'https://www.youtube.com/t/terms'
const GUIDELINES_URL = 'https://www.youtube.com/howyoutubeworks/policies/community-guidelines/'
const STUDIO_URL = 'https://studio.youtube.com'

type Phase = 'form' | 'uploading' | 'stopped' | 'done' | 'failed'

/**
 * Getting the take onto YouTube.
 *
 * v2, once Google has approved the site's use of the YouTube API
 * (YOUTUBE_API_UPLOADS=on and a connected channel): a form with the title,
 * description, visibility and YouTube's terms, then one click — the file
 * goes straight from this browser to YouTube, with progress, a stop button
 * and resume after a failure or a reload, and the link is attached for you.
 *
 * v1, always available: the steps for YouTube Studio, with the title and
 * description ready to copy, then paste the link.
 */
export function UploadPanel({
  questionId,
  take,
  apiUploads,
  suggestedTitle,
  suggestedDescription,
  solutionId,
  editingOther,
  currentUrl,
  onVideo,
  onUploaded,
  onDiscard,
  onActivity,
}: {
  questionId: string
  take: Take
  apiUploads: boolean
  suggestedTitle: string
  suggestedDescription: string
  /** Staff editing someone else's explanation. */
  solutionId?: string
  editingOther: boolean
  currentUrl: string | null
  onVideo: (change: VideoChange) => void
  /** YouTube has the take: it can leave this browser. */
  onUploaded: () => void
  /** The teacher is done with the take. */
  onDiscard: () => void
  onActivity: () => void
}) {
  const oneClick = apiUploads && !editingOther
  return (
    <div className="flex flex-col gap-5">
      {apiUploads && editingOther ? (
        <p className="flex items-start gap-2 rounded-control bg-surface-2 px-3 py-2 text-meta text-ink-muted">
          <Info size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          One-click upload attaches the video to your own explanation. For this one, upload by hand and paste the link.
        </p>
      ) : null}
      {oneClick ? (
        <OneClickUpload
          questionId={questionId}
          take={take}
          suggestedTitle={suggestedTitle}
          suggestedDescription={suggestedDescription}
          onVideo={onVideo}
          onUploaded={onUploaded}
          onActivity={onActivity}
        />
      ) : null}
      {oneClick ? (
        <details className="group rounded-control border border-rule">
          <summary className="cursor-pointer list-none px-3 py-2 text-meta text-ink-muted hover:text-ink">
            Or upload it by hand in YouTube Studio
          </summary>
          <div className="border-t border-rule p-3">
            <ManualSteps
              questionId={questionId}
              suggestedTitle={suggestedTitle}
              suggestedDescription={suggestedDescription}
              solutionId={solutionId}
              currentUrl={currentUrl}
              onVideo={onVideo}
              onDiscard={onDiscard}
              onActivity={onActivity}
            />
          </div>
        </details>
      ) : (
        <ManualSteps
          questionId={questionId}
          suggestedTitle={suggestedTitle}
          suggestedDescription={suggestedDescription}
          solutionId={solutionId}
          currentUrl={currentUrl}
          onVideo={onVideo}
          onDiscard={onDiscard}
          onActivity={onActivity}
        />
      )}
    </div>
  )
}

function OneClickUpload({
  questionId,
  take,
  suggestedTitle,
  suggestedDescription,
  onVideo,
  onUploaded,
  onActivity,
}: {
  questionId: string
  take: Take
  suggestedTitle: string
  suggestedDescription: string
  onVideo: (change: VideoChange) => void
  onUploaded: () => void
  onActivity: () => void
}) {
  const [title, setTitle] = useState(suggestedTitle)
  const [description, setDescription] = useState(suggestedDescription)
  const [privacy, setPrivacy] = useState<VideoPrivacy>('unlisted')
  const [agree, setAgree] = useState(false)
  const [phase, setPhase] = useState<Phase>('form')
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const [outcome, setOutcome] = useState<UploadOutcome | null>(null)
  const [error, setError] = useState<string | null>(null)
  // An upload of this very take that stopped earlier, perhaps before a reload.
  const [resumable, setResumable] = useState<string | null>(() => {
    const pending = pendingYouTubeUpload(questionId)
    return pending && pending.bytes === take.blob.size ? pending.uploadId : null
  })
  const handle = useRef<UploadHandle | null>(null)

  const descriptionBytes = utf8Length(description)
  const titleTrimmed = title.trim()
  const formError = !titleTrimmed
    ? 'Give the video a title.'
    : /[<>]/.test(title + description)
      ? 'YouTube does not allow < or > in the title or description.'
      : descriptionBytes > DESCRIPTION_MAX_BYTES
        ? 'The description is too long for YouTube.'
        : null

  async function run(next: UploadHandle) {
    handle.current = next
    setPhase('uploading')
    setError(null)
    try {
      const result = await next.done
      setOutcome(result)
      setResumable(null)
      if (result.result.ok) {
        onVideo({
          videoUrl: `https://youtu.be/${result.videoId}`,
          solutionId: result.result.solutionId,
          status: result.result.status,
          reach: result.result.reach,
        })
        onUploaded()
      }
      setPhase('done')
    } catch (failure) {
      const known = failure instanceof YouTubeUploadError ? failure : null
      const id = next.uploadId
      if (known?.code === 'cancelled') {
        setPhase('stopped')
        setResumable(id)
        return
      }
      const fresh = known?.code === 'expired' || known?.code === 'mismatch' || known?.code === 'not-found'
      if (fresh && id) forgetYouTubeUpload(id)
      setResumable(fresh ? null : id)
      setError(known?.message ?? 'The upload stopped. Check the connection, then carry on.')
      setPhase('failed')
    } finally {
      handle.current = null
    }
  }

  function start() {
    if (formError) {
      setError(formError)
      return
    }
    if (!agree) {
      setError('Tick the box to agree to YouTube’s terms first.')
      return
    }
    onActivity()
    void run(
      startYouTubeUpload({
        questionId,
        blob: take.blob,
        title: titleTrimmed.slice(0, TITLE_MAX_CHARS),
        description,
        privacy,
        onProgress: setProgress,
      }),
    )
  }

  function resume() {
    if (!resumable) return
    onActivity()
    void run(resumeYouTubeUpload(resumable, take.blob, setProgress))
  }

  async function startOver() {
    if (resumable) await abandonYouTubeUpload(resumable)
    setResumable(null)
    setProgress(null)
    setError(null)
    setPhase('form')
  }

  const percent = progress && progress.total > 0 ? Math.floor((progress.sent / progress.total) * 100) : 0
  const busy = phase === 'uploading'
  const field = 'w-full rounded-control border border-rule bg-surface px-3 py-2 text-ui text-ink outline-none focus:border-accent disabled:opacity-60'

  if (phase === 'done' && outcome) {
    const attached = outcome.result.ok
    return (
      <div aria-live="polite" className="flex flex-col gap-2">
        <p className="flex items-start gap-2 text-ui text-correct">
          <CheckCircle size={18} weight="fill" aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>
            Uploaded to YouTube:{' '}
            <a href={`https://youtu.be/${outcome.videoId}`} target="_blank" rel="noopener noreferrer" className="underline">
              youtu.be/{outcome.videoId}
            </a>
          </span>
        </p>
        {attached && outcome.result.ok ? (
          <p className="text-meta text-ink-muted">
            {outcome.result.status === 'approved'
              ? `It is attached to the explanation, which is live on ${outcome.result.reach} ${outcome.result.reach === 1 ? 'copy' : 'copies'} of the question.`
              : 'It is attached to the explanation. Submit the explanation when it is ready.'}{' '}
            The take has been cleared from this browser.
          </p>
        ) : (
          <p className="flex items-start gap-2 text-meta text-incorrect">
            <Warning size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>
              The video is on YouTube but could not be attached
              {!outcome.result.ok ? `: ${outcome.result.error}` : '.'} Paste its link under “Upload it by hand” to attach it.
            </span>
          </p>
        )}
        {outcome.warnings.map((warning) => (
          <p key={warning} className="text-meta text-ink-muted">
            {warning}
          </p>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-ui font-medium text-ink">
        <YoutubeLogo size={20} aria-hidden="true" className="text-incorrect" />
        Upload to YouTube
      </p>

      <label className="flex flex-col gap-1">
        <span className="flex justify-between text-meta text-ink-muted">
          Title
          <span className="tabular-nums text-ink-faint">
            {Array.from(title).length}/{TITLE_MAX_CHARS}
          </span>
        </span>
        <input
          value={title}
          onChange={(event) => setTitle(Array.from(event.target.value).slice(0, TITLE_MAX_CHARS).join(''))}
          disabled={busy}
          className={field}
          required
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="flex justify-between text-meta text-ink-muted">
          Description
          <span className={`tabular-nums ${descriptionBytes > DESCRIPTION_MAX_BYTES ? 'text-incorrect' : 'text-ink-faint'}`}>
            {descriptionBytes.toLocaleString('en-IN')}/{DESCRIPTION_MAX_BYTES.toLocaleString('en-IN')} bytes
          </span>
        </span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={busy}
          rows={5}
          className={`${field} resize-y`}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-meta text-ink-muted">Visibility</span>
        <select
          value={privacy}
          onChange={(event) => setPrivacy(event.target.value as VideoPrivacy)}
          disabled={busy}
          className={`${field} h-10 py-0`}
        >
          <option value="unlisted">Unlisted — plays on the site, not listed on the channel (recommended)</option>
          <option value="public">Public — also listed on the channel and in search</option>
          <option value="private">Private — students cannot watch it</option>
        </select>
      </label>
      {privacy === 'private' ? (
        <p className="text-meta text-marked">A private video does not play for students. Choose Unlisted unless you mean to hide it.</p>
      ) : null}

      <label className="flex items-start gap-2.5 text-meta text-ink">
        <input
          type="checkbox"
          checked={agree}
          onChange={(event) => setAgree(event.target.checked)}
          disabled={busy}
          required
          className="mt-0.5 h-4 w-4 shrink-0 accent-ink"
        />
        <span>
          I agree to the{' '}
          <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            YouTube Terms of Service
          </a>{' '}
          and confirm this video follows the{' '}
          <a href={GUIDELINES_URL} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            Community Guidelines
          </a>
          .
        </span>
      </label>

      {phase === 'uploading' || phase === 'stopped' || (phase === 'failed' && progress) ? (
        <div aria-live="polite">
          <div
            role="progressbar"
            aria-label="Upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
          >
            <div className="h-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-1 text-meta text-ink-faint tabular-nums">
            {percent}% · {formatBytes(progress?.sent ?? 0)} of {formatBytes(take.blob.size)}
            {phase === 'stopped' ? ' · stopped' : ''}
          </p>
          {progress?.transport === 'proxy' ? (
            <p className="mt-1 text-meta text-ink-muted">
              YouTube would not take the file straight from this browser, so it is going through the site. That is
              slower and uses the site’s hosting allowance — keep this tab open until it finishes.
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="flex items-start gap-2 text-meta text-incorrect" aria-live="polite">
          <Warning size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>
            {error} If it keeps failing, download the take and upload it by hand below.
          </span>
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {phase === 'uploading' ? (
          <button type="button" onClick={() => handle.current?.cancel()} className={buttonClass('outline', 'md')}>
            Stop
          </button>
        ) : resumable ? (
          <>
            <button type="button" onClick={resume} className={buttonClass('primary', 'md')}>
              <UploadSimple size={16} aria-hidden="true" />
              Carry on uploading
            </button>
            <button type="button" onClick={() => void startOver()} className={buttonClass('ghost', 'md')}>
              Start again
            </button>
          </>
        ) : (
          <button type="button" onClick={start} disabled={!agree} className={buttonClass('primary', 'md')}>
            <UploadSimple size={16} aria-hidden="true" />
            Upload to YouTube
          </button>
        )}
      </div>
    </div>
  )
}

function ManualSteps({
  questionId,
  suggestedTitle,
  suggestedDescription,
  solutionId,
  currentUrl,
  onVideo,
  onDiscard,
  onActivity,
}: {
  questionId: string
  suggestedTitle: string
  suggestedDescription: string
  solutionId?: string
  currentUrl: string | null
  onVideo: (change: VideoChange) => void
  onDiscard: () => void
  onActivity: () => void
}) {
  const [linked, setLinked] = useState(false)
  const step = 'pl-1'
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-meta text-ink marker:text-ink-faint">
        <li className={step}>Download the take (above). The file is named after the question.</li>
        <li className={step}>
          Open{' '}
          <a href={STUDIO_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-accent hover:underline">
            YouTube Studio
            <ArrowUpRight size={12} aria-hidden="true" />
          </a>{' '}
          with the account that uploads to the <strong className="font-medium">Unknown IITians</strong> channel, and
          switch to that channel.
        </li>
        <li className={step}>Choose Create, then Upload videos, and pick the file.</li>
        <li className={step}>
          Paste this title and description:
          <div className="mt-2 flex flex-col gap-2">
            <CopyField label="Title" value={suggestedTitle} />
            <CopyField label="Description" value={suggestedDescription} multiline />
          </div>
        </li>
        <li className={step}>Add it to the subject’s Unlisted playlist (make one, named after the subject, if there is none).</li>
        <li className={step}>
          Audience: <strong className="font-medium">No, it’s not made for kids</strong>.
        </li>
        <li className={step}>
          Under Show more, keep <strong className="font-medium">Allow embedding</strong> on — without it the video
          cannot play on the site.
        </li>
        <li className={step}>
          Visibility: <strong className="font-medium">Unlisted</strong>. Not Private: a private video does not play for
          students.
        </li>
        <li className={step}>Save, copy the video’s link, and paste it here:</li>
      </ol>
      <LinkVideoField
        questionId={questionId}
        solutionId={solutionId}
        currentUrl={currentUrl}
        onActivity={onActivity}
        onChange={(change) => {
          onVideo(change)
          setLinked(change.videoUrl !== null)
        }}
      />
      {linked ? (
        <p className="flex flex-wrap items-center gap-2 text-meta text-ink-muted">
          Done with this take?
          <button type="button" onClick={onDiscard} className={buttonClass('outline', 'sm')}>
            Clear it from this browser
          </button>
        </p>
      ) : null}
    </div>
  )
}

function CopyField({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // No clipboard permission: select the text so Ctrl+C works.
      box.current?.focus()
      box.current?.select()
    }
  }

  return (
    <div className="flex items-start gap-2">
      <label className="min-w-0 flex-1">
        <span className="sr-only">{label}</span>
        <textarea
          ref={box}
          readOnly
          value={value}
          rows={multiline ? 4 : 1}
          className="w-full resize-none rounded-control border border-rule bg-surface-2 px-3 py-1.5 text-meta text-ink outline-none"
        />
      </label>
      <button type="button" onClick={() => void copy()} className={buttonClass('outline', 'sm')} aria-label={`Copy the ${label.toLowerCase()}`}>
        {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}
