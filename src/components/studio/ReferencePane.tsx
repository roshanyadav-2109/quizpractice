'use client'

import Link from 'next/link'
import { useState, useTransition, type FormEvent } from 'react'
import { QuestionWithAnswer } from '@/components/question/QuestionWithAnswer'
import { SolutionPanel } from '@/components/question/SolutionPanel'
import {
  ArrowUpRight,
  ClockCountdown,
  Flag,
  PencilSimpleLine,
  Shuffle,
  Stack,
  Warning,
} from '@/components/ui/icons'
import { Badge, buttonClass } from '@/components/ui/primitives'
import { formatSession } from '@/lib/format'
import {
  EXPLANATION_STATE_LABELS,
  explanationState,
  type GroupExplanation,
  type GroupMember,
} from '@/lib/teach/contracts'
import type { QuestionWithOptions } from '@/types/db'
import type { AnswerKeyReport, StudioClaim, StudioPlace, StudioViewer } from './Studio'

const COPIES_SHOWN = 6

const when = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Kolkata',
})

/** "29 Sep, 14:05 IST": pinned to India, so the server and the browser agree. */
export function formatWhen(instant: string): string {
  return `${when.format(new Date(instant))} IST`
}

/**
 * Everything the teacher explains from, beside the board: who holds the
 * question, the question itself with its answer key and marks, where else it
 * appears, and what other teachers have written for it. None of it is
 * recorded; the recording has its own question card.
 */
export function ReferencePane({
  question,
  place,
  members,
  orderVaries,
  others,
  viewer,
  claim,
  released,
  claimBusy,
  onRelease,
  onTakeOver,
  reports,
  onReport,
  editingId,
  onEdit,
}: {
  question: QuestionWithOptions
  place: StudioPlace
  members: GroupMember[]
  orderVaries: boolean
  others: GroupExplanation[]
  viewer: StudioViewer
  claim: StudioClaim | null
  /** The teacher let the question go in this visit. */
  released: boolean
  claimBusy: boolean
  onRelease: () => void
  onTakeOver: () => void
  reports: AnswerKeyReport[]
  onReport: (description: string) => Promise<string | null>
  editingId: string | null
  onEdit: (explanation: GroupExplanation) => void
}) {
  const copies = members.filter((member) => !member.isSelf)

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-5">
      <ClaimBanner
        claim={claim}
        released={released}
        busy={claimBusy}
        isAdmin={viewer.isAdmin}
        onRelease={onRelease}
        onTakeOver={onTakeOver}
      />

      {orderVaries ? (
        <p className="flex items-start gap-2.5 rounded-control bg-review-soft px-3 py-2.5 text-meta text-review">
          <Shuffle size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>
            <strong className="font-medium">Options are shuffled on some copies.</strong> Name each option by what it
            says — “the option 42”, “the option that uses a stack” — never by its letter or position, in the video and in
            writing. The question card on the video leaves the letters out.
          </span>
        </p>
      ) : null}

      <QuestionWithAnswer question={question} showAnswer />

      <AnswerKeyReports reports={reports} onReport={onReport} isAdmin={viewer.isAdmin} />

      <section aria-labelledby="copies-heading">
        <h3 id="copies-heading" className="label mb-2 flex items-center gap-1.5">
          <Stack size={14} aria-hidden="true" />
          {copies.length ? `Also shows on ${copies.length} ${copies.length === 1 ? 'copy' : 'copies'}` : 'Only this copy'}
        </h3>
        {copies.length ? (
          <CopyList copies={copies} subjectName={place.subjectName} />
        ) : (
          <p className="text-meta text-ink-muted">
            No other paper has this question with the same answer, so the explanation shows here only.
          </p>
        )}
      </section>

      {others.length ? (
        <section aria-labelledby="others-heading">
          <h3 id="others-heading" className="label mb-2">
            Other explanations of this question
          </h3>
          <div className="flex flex-col gap-4">
            {others.map((explanation) => (
              <OtherExplanation
                key={explanation.id}
                explanation={explanation}
                canEdit={viewer.isAdmin}
                editing={editingId === explanation.id}
                onEdit={() => onEdit(explanation)}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function ClaimBanner({
  claim,
  released,
  busy,
  isAdmin,
  onRelease,
  onTakeOver,
}: {
  claim: StudioClaim | null
  released: boolean
  busy: boolean
  isAdmin: boolean
  onRelease: () => void
  onTakeOver: () => void
}) {
  if (!claim) {
    return (
      <p className="flex items-start gap-2 rounded-control bg-surface-2 px-3 py-2 text-meta text-ink-muted">
        <ClockCountdown size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
        {released
          ? 'You let this question go, so another teacher can take it. Reload the page to hold it again.'
          : 'Nobody is working on this question. It is held for you once you start writing or recording.'}
      </p>
    )
  }
  if (claim.mine) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control bg-accent-soft px-3 py-2 text-meta text-ink">
        <ClockCountdown size={16} aria-hidden="true" className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1">Held for you until {formatWhen(claim.expiresAt)}.</span>
        <button type="button" onClick={onRelease} disabled={busy} className={buttonClass('ghost', 'sm')}>
          Release
        </button>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control bg-marked-soft px-3 py-2 text-meta text-marked">
      <Warning size={16} aria-hidden="true" className="shrink-0" />
      <span className="min-w-0 flex-1">
        {claim.holderName ?? 'Another teacher'} is working on this until {formatWhen(claim.expiresAt)}. You can still
        write, but you may be doing the same work twice.
      </span>
      {isAdmin ? (
        <span className="flex gap-1">
          <button type="button" onClick={onTakeOver} disabled={busy} className={buttonClass('outline', 'sm')}>
            Take over
          </button>
          <button type="button" onClick={onRelease} disabled={busy} className={buttonClass('ghost', 'sm')}>
            Release
          </button>
        </span>
      ) : null}
    </div>
  )
}

function AnswerKeyReports({
  reports,
  onReport,
  isAdmin,
}: {
  reports: AnswerKeyReport[]
  onReport: (description: string) => Promise<string | null>
  isAdmin: boolean
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const failure = await onReport(text)
      if (failure) {
        setError(failure)
        return
      }
      setText('')
      setOpen(false)
    })
  }

  return (
    <section aria-label="Answer key" className="-mt-2 flex flex-col gap-2">
      {reports.length ? (
        <div className="rounded-control border border-marked/40 bg-marked-soft px-3 py-2.5 text-meta text-marked">
          <p className="flex items-start gap-2 font-medium">
            <Flag size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            The answer key is reported as wrong. Submitting waits until an admin resolves it.
          </p>
          <ul className="mt-1.5 flex flex-col gap-1.5 pl-6">
            {reports.map((report) => (
              <li key={report.id} className="text-ink-muted">
                <span className="text-ink">{report.mine ? 'You' : 'Someone'}</span>, {formatWhen(report.createdAt)}:{' '}
                {report.description}
              </li>
            ))}
          </ul>
          {isAdmin ? (
            <Link href="/admin/reports" target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 pl-6 text-accent hover:underline">
              Resolve it in Admin → Reports
              <ArrowUpRight size={12} aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      ) : null}

      {open ? (
        <form onSubmit={submit} className="flex flex-col gap-2 rounded-control border border-rule p-3">
          <label htmlFor="answer-key-report" className="text-meta text-ink">
            What is wrong with the marked answer? Say what you believe is right — by the option’s content, not its
            letter — and why.
          </label>
          <textarea
            id="answer-key-report"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={3}
            maxLength={2000}
            required
            className="w-full resize-y rounded-control border border-rule bg-surface px-3 py-2 text-meta text-ink outline-none focus:border-accent"
          />
          {error ? <p className="text-meta text-incorrect">{error}</p> : null}
          <div className="flex gap-2">
            <button type="submit" disabled={pending || text.trim().length < 10} className={buttonClass('primary', 'sm')}>
              {pending ? 'Sending…' : 'Send report'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className={buttonClass('ghost', 'sm')}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={`${buttonClass('ghost', 'sm')} self-start`}>
          <Flag size={14} aria-hidden="true" />
          Report answer key
        </button>
      )}
    </section>
  )
}

function CopyList({ copies, subjectName }: { copies: GroupMember[]; subjectName: string }) {
  const [all, setAll] = useState(false)
  const shown = all ? copies : copies.slice(0, COPIES_SHOWN)
  return (
    <>
      <ul className="flex flex-col divide-y divide-rule rounded-control border border-rule">
        {shown.map((copy) => (
          <li key={copy.questionId}>
            <Link
              href={`/paper/${copy.setId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 px-3 py-2 text-meta hover:bg-surface-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-ink tabular-nums">
                  {copy.examName} · {formatSession(copy.sessionDate)} · Set {copy.setCode} · Q{copy.number}
                </span>
                {copy.subjectName !== subjectName ? (
                  <span className="block text-ink-faint">
                    {copy.subjectName}
                    {copy.programName ? ` (${copy.programName})` : ''}
                  </span>
                ) : null}
              </span>
              {!copy.sameOptionOrder ? (
                <span title="Options in a different order" className="mt-0.5 shrink-0 text-review">
                  <Shuffle size={14} aria-label="Options in a different order" />
                </span>
              ) : null}
              <ArrowUpRight size={12} aria-hidden="true" className="mt-1 shrink-0 text-ink-faint" />
            </Link>
          </li>
        ))}
      </ul>
      {copies.length > COPIES_SHOWN ? (
        <button type="button" onClick={() => setAll(!all)} className={`${buttonClass('ghost', 'sm')} mt-1`}>
          {all ? 'Show fewer' : `Show all ${copies.length}`}
        </button>
      ) : null}
    </>
  )
}

function OtherExplanation({
  explanation,
  canEdit,
  editing,
  onEdit,
}: {
  explanation: GroupExplanation
  canEdit: boolean
  editing: boolean
  onEdit: () => void
}) {
  const state = explanationState(explanation.status, explanation.submittedAt)
  const tone = state === 'live' ? 'correct' : state === 'rejected' ? 'incorrect' : state === 'review' ? 'accent' : 'neutral'
  return (
    <article className={`rounded-card border p-3 ${editing ? 'border-accent' : 'border-rule'}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge tone={tone}>{EXPLANATION_STATE_LABELS[state]}</Badge>
        <span className="text-meta text-ink-muted">
          {explanation.kind === 'official' ? 'From the paper' : (explanation.authorName ?? 'A teacher')}
        </span>
        <span className="text-micro text-ink-faint">{formatWhen(explanation.updatedAt)}</span>
        {canEdit ? (
          <button type="button" onClick={onEdit} disabled={editing} className={`${buttonClass('ghost', 'sm')} ml-auto`}>
            <PencilSimpleLine size={14} aria-hidden="true" />
            {editing ? 'Editing' : 'Edit'}
          </button>
        ) : null}
      </div>
      {explanation.reviewNote ? (
        <p className="mb-2 text-meta text-ink-muted">Reviewer’s note: {explanation.reviewNote}</p>
      ) : null}
      {explanation.body.length || explanation.videoUrl ? (
        <SolutionPanel
          solutions={[
            { id: explanation.id, kind: explanation.kind, body: explanation.body, video_url: explanation.videoUrl },
          ]}
        />
      ) : (
        <p className="text-meta text-ink-faint">Nothing written or recorded yet.</p>
      )}
    </article>
  )
}
