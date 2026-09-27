import Link from 'next/link'
import { releaseClaimAction } from '@/app/teach/(desk)/actions'
import { ActionButton } from '@/components/admin/ActionButton'
import { Hourglass, ImageIcon, PencilSimpleLine, Shuffle, Stack, VideoCamera } from '@/components/ui/icons'
import { Badge } from '@/components/ui/primitives'
import { formatSession, formatShortDate } from '@/lib/format'
import { ROUTES, type ExplanationState, type QueueRow } from '@/lib/teach/contracts'
import type { MyExplanation } from '@/lib/teach/queries'
import type { QuestionType } from '@/types/db'

type Tone = 'neutral' | 'accent' | 'correct' | 'incorrect' | 'marked'

const TYPE_LABEL: Record<QuestionType, string> = {
  mcq: 'Single correct',
  msq: 'Multiple correct',
  numerical: 'Numerical',
  subjective: 'Written answer',
  programming: 'Programming',
}

const STATE_BADGE: Record<ExplanationState, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  review: { label: 'In review', tone: 'accent' },
  live: { label: 'Published', tone: 'correct' },
  rejected: { label: 'Needs changes', tone: 'incorrect' },
}

// A hold ends at a time of day, read in India like every time on the site.
const until = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Kolkata',
})

function formatMarks(marks: number): string {
  return `${marks} ${marks === 1 ? 'mark' : 'marks'}`
}

/** The group's state, from the explanation that decides it (live first, then with video, then newest). */
function rowStatus(row: QueueRow): { label: string; tone: Tone } {
  if (!row.solutionId) {
    // Nothing that counts, yet the teacher has one here: theirs was sent back.
    return row.isMine ? STATE_BADGE.rejected : { label: 'To do', tone: 'neutral' }
  }
  if (row.solutionStatus === 'approved') return STATE_BADGE.live
  return row.submitted ? STATE_BADGE.review : STATE_BADGE.draft
}

/**
 * One subject's queue: a row per duplicate group, under a heading for each
 * paper. A row opens the studio on the copy it stands for; whatever is
 * written there reaches every copy the badge counts.
 */
export function QueueList({
  rows,
  myClaims,
  subjectName,
}: {
  rows: QueueRow[]
  myClaims: string[]
  /** The subject being queued, to tell its namesake in the other branch apart. */
  subjectName: string
}) {
  const held = new Set(myClaims)

  // Rows arrive newest paper first; each change of paper starts a section.
  const sections: { paperId: string; title: string; rows: QueueRow[] }[] = []
  for (const row of rows) {
    const current = sections[sections.length - 1]
    if (current && current.paperId === row.paperId) current.rows.push(row)
    else
      sections.push({ paperId: row.paperId, title: `${row.examName} · ${formatSession(row.sessionDate)}`, rows: [row] })
  }

  return (
    <div className="flex flex-col gap-6">
      {sections.map((section) => (
        <section key={section.paperId} aria-label={section.title}>
          {/* The queue page's title is the h1, and nothing sits between. */}
          <h2 className="mb-2 text-meta text-ink-muted">{section.title}</h2>
          <ul className="flex flex-col gap-2">
            {section.rows.map((row) => (
              <QueueItem
                key={row.groupKey}
                row={row}
                mine={held.has(row.groupKey)}
                elsewhere={otherSubjectsText(row, subjectName)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function QueueItem({ row, mine, elsewhere }: { row: QueueRow; mine: boolean; elsewhere: string }) {
  const status = rowStatus(row)
  const others = row.copies - 1
  const byOther = row.solutionId && row.authorName && !row.isMine ? row.authorName : null

  return (
    // The whole card opens the studio (the link's ::after covers it); the
    // Release button and the badges that explain themselves on hover sit
    // above that cover, so each stays its own target.
    <li className="relative rounded-card border border-rule bg-surface p-3 transition-colors hover:border-rule-strong sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Link
          href={ROUTES.studio(row.questionId)}
          // Fifty studios a page are not worth fetching ahead, and each fetch
          // would cost the proxy a role lookup; hovering still prefetches one.
          prefetch={false}
          className="text-ui text-ink tabular-nums outline-none after:absolute after:inset-0 after:rounded-card focus-visible:after:ring-2 focus-visible:after:ring-ink"
        >
          Q{row.number}
          {/* The paper is the section heading; screen readers get it here too. */}
          <span className="sr-only">
            {' '}
            of {row.examName} {formatSession(row.sessionDate)}
          </span>
          <span className="text-ink-faint"> · Set {row.setCode}</span>
        </Link>
        <span className="flex items-center gap-1.5">
          {row.hasText ? <Marker icon="text" /> : null}
          {row.hasVideo ? <Marker icon="video" /> : null}
          <Badge tone={status.tone}>{status.label}</Badge>
        </span>
      </div>

      <p className="mt-0.5 text-micro text-ink-faint">
        {TYPE_LABEL[row.qtype]} · {formatMarks(row.marks)}
        {byOther ? ` · by ${byOther}` : ''}
      </p>

      <p className="mt-1.5 line-clamp-2 text-meta text-ink-muted">
        {row.hasImage ? (
          <span title="Has a figure">
            <ImageIcon size={15} aria-hidden="true" className="mr-1.5 inline-block align-[-0.15em] text-ink-faint" />
            <span className="sr-only">Has a figure. </span>
          </span>
        ) : null}
        {row.snippet || (row.hasImage ? 'A figure: open the question to see it.' : 'No text to preview.')}
      </p>

      {others > 0 || row.orderVaries || row.claimExpiresAt ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {others > 0 ? (
            // A group is shared only when no set holds the question twice
            // (unless an admin allowed it), so each copy is a different paper
            // — a sitting's sets count as papers, as the catalogue counts them.
            <span title={copiesTitle(row, elsewhere)} className="relative z-10">
              <Badge tone="accent">
                <Stack size={13} aria-hidden="true" />
                Appears in {row.copies} papers
                <span className="text-accent/70">
                  (+{others} {others === 1 ? 'copy' : 'copies'})
                </span>
              </Badge>
            </span>
          ) : null}
          {others > 0 && elsewhere ? <span className="text-micro text-ink-faint">also in {elsewhere}</span> : null}
          {row.orderVaries ? (
            <span
              title="Some copies list the options in another order. Name options by what they say, never by letter."
              className="relative z-10"
            >
              <Badge tone="marked">
                <Shuffle size={13} aria-hidden="true" />
                Options shuffled in copies
              </Badge>
            </span>
          ) : null}
          {row.claimExpiresAt ? (
            <Badge tone={mine ? 'accent' : 'marked'}>
              <Hourglass size={13} aria-hidden="true" />
              {mine ? 'You are' : `${row.claimedBy ?? 'Another teacher'} is`} on this until{' '}
              {until.format(new Date(row.claimExpiresAt))}
            </Badge>
          ) : null}
          {row.claimExpiresAt && mine ? (
            <span className="relative z-10">
              <ActionButton
                label="Release"
                pendingLabel="Releasing…"
                action={releaseClaimAction.bind(null, row.questionId)}
              />
            </span>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

/** A small sign that the explanation has writing, or a video. */
function Marker({ icon }: { icon: 'text' | 'video' }) {
  const label = icon === 'text' ? 'Has a written explanation' : 'Has a video'
  const Icon = icon === 'text' ? PencilSimpleLine : VideoCamera
  return (
    <span title={label} className="text-ink-faint">
      <Icon size={15} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  )
}

function copiesTitle(row: QueueRow, elsewhere: string): string {
  const reach = `One explanation here shows on all ${row.copies} copies of this question.`
  return elsewhere ? `${reach} Copies are also in: ${elsewhere}.` : reach
}

/**
 * The other subjects holding a copy. Both branches have an English I (and a
 * Computer System Design), and the queue sends names only, so a namesake of
 * the subject being queued is marked as the other branch's.
 */
function otherSubjectsText(row: QueueRow, subjectName: string): string {
  return row.otherSubjects.map((name) => (name === subjectName ? `${name} (other branch)` : name)).join(', ')
}

/**
 * The teacher's own explanations — recent work, or what needs changes — each
 * with its state and any note from the reviewer, and a way back into the
 * studio when its question still exists.
 */
export function ExplanationList({ items }: { items: MyExplanation[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <ExplanationItem key={item.id} item={item} />
      ))}
    </ul>
  )
}

function ExplanationItem({ item }: { item: MyExplanation }) {
  const badge = STATE_BADGE[item.state]
  const place = item.place
  // No place: the question was deleted, or its paper was taken back to draft
  // (a teacher reads a draft paper's questions, not the paper itself).
  const title = place
    ? `Q${place.number} · ${place.subjectName}`
    : item.questionId
      ? 'A question that is not published now'
      : 'A question that has since been removed'
  const where = place ? `${place.examName} ${formatSession(place.sessionDate)} · Set ${place.setCode}` : null

  const body = (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-ui text-ink tabular-nums">{title}</span>
        <span className="flex items-center gap-1.5">
          {item.hasVideo ? <Marker icon="video" /> : null}
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </span>
      </div>
      <p className="mt-0.5 text-micro text-ink-faint tabular-nums">
        {where ? `${where} · ` : ''}Updated {formatShortDate(item.updatedAt)}
      </p>
      {item.reviewNote ? (
        <p className="mt-2 rounded-control bg-surface-2 px-3 py-2 text-meta text-ink">
          <span className="text-ink-muted">Reviewer’s note: </span>
          {item.reviewNote}
        </p>
      ) : null}
    </>
  )

  const card = 'block rounded-card border border-rule bg-surface p-3 sm:p-4'
  return (
    <li>
      {item.questionId && place ? (
        <Link href={ROUTES.studio(item.questionId)} className={`${card} transition-colors hover:border-rule-strong`}>
          {body}
        </Link>
      ) : (
        <div className={card}>{body}</div>
      )}
    </li>
  )
}
