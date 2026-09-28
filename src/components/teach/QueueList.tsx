import Link from 'next/link'
import { releaseClaimAction } from '@/app/teach/(desk)/actions'
import { ActionButton } from '@/components/admin/ActionButton'
import { ArrowRight, Hourglass, ImageIcon, PencilSimpleLine, Shuffle, Stack, VideoCamera } from '@/components/ui/icons'
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

/** What the row's button says: start one, pick up one's own, or look at one. */
function rowAction(row: QueueRow): string {
  if (!row.solutionId) return row.isMine ? 'Fix' : 'Explain'
  if (row.isMine && !row.submitted) return 'Continue'
  return 'Open'
}

/**
 * Questions to explain, a block per paper and a row per duplicate group. A
 * row opens the studio on the copy it stands for; whatever is written there
 * reaches every copy the row counts.
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

  // Rows arrive newest paper first; each change of paper starts a block.
  const sections: { paperId: string; exam: string; date: string; rows: QueueRow[] }[] = []
  for (const row of rows) {
    const current = sections[sections.length - 1]
    if (current && current.paperId === row.paperId) current.rows.push(row)
    else sections.push({ paperId: row.paperId, exam: row.examName, date: formatSession(row.sessionDate), rows: [row] })
  }

  return (
    <div className="flex flex-col gap-4">
      {sections.map((section) => (
        <section
          key={section.paperId}
          aria-label={`${section.exam}, ${section.date}`}
          className="overflow-hidden rounded-[12px] border border-rule bg-surface"
        >
          <h2 className="flex items-center justify-between gap-3 border-b border-rule bg-surface-2/70 px-4 py-2.5 text-meta">
            <span className="text-ink">
              {section.exam} <span className="text-ink-muted">{section.date}</span>
            </span>
            <span className="text-ink-faint tabular-nums">
              {section.rows.length} {section.rows.length === 1 ? 'question' : 'questions'}
            </span>
          </h2>
          <ul className="divide-y divide-rule">
            {section.rows.map((row) => (
              <QueueItem key={row.groupKey} row={row} mine={held.has(row.groupKey)} elsewhere={otherSubjectsText(row, subjectName)} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function QueueItem({ row, mine, elsewhere }: { row: QueueRow; mine: boolean; elsewhere: string }) {
  const status = rowStatus(row)
  const action = rowAction(row)
  const others = row.copies - 1
  const byOther = row.solutionId && row.authorName && !row.isMine ? row.authorName : null

  return (
    // The row's button opens the studio, and its ::after covers the whole row
    // so anywhere on it works; the Release button and the badges that explain
    // themselves on hover sit above that cover, each its own target.
    <li className="group relative flex items-start gap-3.5 px-4 py-3.5 transition-colors hover:bg-desk-soft/50">
      <span className="mt-0.5 flex h-9 min-w-9 shrink-0 items-center justify-center rounded-[9px] border border-rule bg-surface-2 px-1.5 text-meta font-medium text-ink tabular-nums">
        {row.number}
      </span>

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-ui text-ink">
          {row.hasImage ? (
            <span title="Has a figure">
              <ImageIcon size={15} aria-hidden="true" className="mr-1.5 inline-block align-[-0.15em] text-ink-faint" />
              <span className="sr-only">Has a figure. </span>
            </span>
          ) : null}
          {row.snippet || (row.hasImage ? 'A figure: open the question to see it.' : 'No text to preview.')}
        </p>
        <p className="mt-1 text-micro text-ink-faint">
          {TYPE_LABEL[row.qtype]}, {formatMarks(row.marks)}, Set {row.setCode}
          {byOther ? `, by ${byOther}` : ''}
        </p>

        {others > 0 || row.orderVaries || row.claimExpiresAt ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {others > 0 ? (
              // A group is shared only when no set holds the question twice
              // (unless an admin allowed it), so each copy is a different paper.
              <span title={copiesTitle(row, elsewhere)} className="relative z-10">
                <Badge tone="accent">
                  <Stack size={13} aria-hidden="true" />
                  In {row.copies} papers
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
                {mine ? 'You are' : `${row.claimedBy ?? 'Another teacher'} is`} on this until {until.format(new Date(row.claimExpiresAt))}
              </Badge>
            ) : null}
            {row.claimExpiresAt && mine ? (
              <span className="relative z-10">
                <ActionButton label="Release" pendingLabel="Releasing…" action={releaseClaimAction.bind(null, row.questionId)} />
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {row.hasText ? <Marker icon="text" /> : null}
        {row.hasVideo ? <Marker icon="video" /> : null}
        <Badge tone={status.tone}>{status.label}</Badge>
        <Link
          href={ROUTES.studio(row.questionId)}
          // Fifty studios a page are not worth fetching ahead, and each fetch
          // would cost the proxy a role lookup; hovering still prefetches one.
          prefetch={false}
          className="inline-flex items-center gap-1 rounded-control border border-rule bg-surface px-3 py-1.5 text-meta text-ink outline-none transition-colors group-hover:border-desk group-hover:bg-desk group-hover:text-white after:absolute after:inset-0 focus-visible:after:rounded-[inherit] focus-visible:after:ring-2 focus-visible:after:ring-desk"
        >
          {action}
          <span className="sr-only">
            {' '}
            question {row.number}, {row.examName} {formatSession(row.sessionDate)}
          </span>
          <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </div>
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
 * The teacher's own explanations — drafts, what needs changes, recent work —
 * each with its state and any note from the reviewer, and a way back into the
 * studio when its question still exists.
 */
export function ExplanationList({ items }: { items: MyExplanation[] }) {
  return (
    <ul className="divide-y divide-rule overflow-hidden rounded-[12px] border border-rule bg-surface">
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
    ? `Question ${place.number}, ${place.subjectName}`
    : item.questionId
      ? 'A question that is not published now'
      : 'A question that has since been removed'
  const where = place ? `${place.examName} ${formatSession(place.sessionDate)}, Set ${place.setCode}` : null
  const open = item.questionId && place

  return (
    <li className={`relative px-4 py-3.5 ${open ? 'transition-colors hover:bg-desk-soft/50' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {open ? (
          <Link
            href={ROUTES.studio(item.questionId!)}
            className="text-ui text-ink outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-desk"
          >
            {title}
          </Link>
        ) : (
          <span className="text-ui text-ink">{title}</span>
        )}
        <span className="flex items-center gap-1.5">
          {item.hasVideo ? <Marker icon="video" /> : null}
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </span>
      </div>
      <p className="mt-0.5 text-micro text-ink-faint tabular-nums">
        {where ? `${where}, ` : ''}updated {formatShortDate(item.updatedAt)}
      </p>
      {item.reviewNote ? (
        <p className="mt-2 rounded-[8px] border-l-2 border-incorrect bg-incorrect-soft/60 px-3 py-2 text-meta text-ink">
          <span className="text-ink-muted">Reviewer&rsquo;s note: </span>
          {item.reviewNote}
        </p>
      ) : null}
    </li>
  )
}
