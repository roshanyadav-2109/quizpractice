import Link from 'next/link'
import { removeAssignment, setAutoPublish, setRole } from '@/app/admin/educators/actions'
import { ActionButton } from '@/components/admin/ActionButton'
import { AssignmentForm, type BranchOption } from '@/components/admin/educators/AssignmentForm'
import { PersonAvatar } from '@/components/admin/educators/PeopleSearch'
import { ROUTES, type AssignmentSummary } from '@/lib/teach/contracts'
import type { AdminPersonRow } from '@/types/db'

/**
 * One teacher: whether their work skips review, the branch + subject combos
 * they hold with how far each has got, and the form to add another.
 *
 * Progress is counted in groups, not questions: a question repeated across
 * papers and years needs one explanation, so "explained" is the share of
 * groups with a live one.
 */
export function TeacherCard({
  teacher,
  summaries,
  summaryError,
  branches,
}: {
  teacher: AdminPersonRow
  summaries: AssignmentSummary[]
  summaryError: string | null
  branches: BranchOption[]
}) {
  const name = teacher.display_name || teacher.email || 'Unnamed teacher'
  const totals = summaries
    .filter((row) => row.valid)
    .reduce(
      (sum, row) => ({
        questions: sum.questions + row.questions,
        groups: sum.groups + row.groups,
        explained: sum.explained + row.explained,
        withVideo: sum.withVideo + row.withVideo,
        inReview: sum.inReview + row.inReview,
      }),
      { questions: 0, groups: 0, explained: 0, withVideo: 0, inReview: 0 },
    )

  return (
    <li className="rounded-lg border border-rule bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <PersonAvatar name={name} src={teacher.avatar_url} size={36} />
          <div className="min-w-0">
            <p className="truncate text-[0.9375rem] text-ink">{name}</p>
            <p className="truncate text-xs text-ink-muted">{teacher.email ?? 'no email'}</p>
          </div>
        </div>

        <ActionButton
          label="Remove teacher role"
          tone="danger"
          confirm={`Make ${name} a student again?\n\nThey lose the teaching desk, all ${teacher.assignments} of their subjects and "publish without review". Explanations they wrote stay.`}
          action={setRole.bind(null, teacher.id, 'student')}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md bg-surface-2 px-3 py-2">
        <p className="text-[0.8125rem] text-ink">
          Publish without review:{' '}
          <span className={teacher.auto_publish ? 'text-correct' : 'text-ink-muted'}>
            {teacher.auto_publish ? 'on' : 'off'}
          </span>
        </p>
        <p className="min-w-0 flex-1 text-[0.71875rem] text-ink-muted">
          {teacher.auto_publish
            ? 'What they submit goes live on every copy of the question at once.'
            : `What they submit waits in Explanations → In review.`}
        </p>
        {teacher.auto_publish ? (
          <ActionButton
            label="Turn off"
            action={setAutoPublish.bind(null, teacher.id, false)}
          />
        ) : (
          <ActionButton
            label="Turn on"
            tone="primary"
            confirm={`Let ${name} publish without review?\n\nTheir explanations and videos will go live on every copy of a question without anyone checking them first.`}
            action={setAutoPublish.bind(null, teacher.id, true)}
          />
        )}
      </div>

      <div className="mt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="label">Subjects</h4>
          {summaries.length > 0 ? (
            <p className="text-[0.71875rem] text-ink-muted tabular-nums">
              {totals.explained.toLocaleString('en-IN')} of {totals.groups.toLocaleString('en-IN')} groups explained ·{' '}
              {totals.withVideo.toLocaleString('en-IN')} with video · {totals.inReview.toLocaleString('en-IN')} in review ·{' '}
              {totals.questions.toLocaleString('en-IN')} questions
            </p>
          ) : null}
        </div>

        {summaryError ? (
          <p className="mt-2 rounded-md bg-incorrect-soft px-3 py-2 text-xs text-incorrect">
            Their subjects could not be loaded: {summaryError}
          </p>
        ) : summaries.length === 0 ? (
          <p className="mt-2 text-xs text-ink-muted">
            No subjects yet. Until they have one, their desk says an admin has not assigned them anything.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {summaries.map((row) => (
              <ComboRow key={row.subjectId} teacherId={teacher.id} teacherName={name} row={row} />
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 border-t border-rule pt-3">
        <AssignmentForm
          teacherId={teacher.id}
          teacherName={name}
          branches={branches}
          assigned={summaries.map((row) => row.subjectId)}
        />
      </div>
    </li>
  )
}

function ComboRow({
  teacherId,
  teacherName,
  row,
}: {
  teacherId: string
  teacherName: string
  row: AssignmentSummary
}) {
  // Rounded down, so 100% means every group, not 299 of 300.
  const share = row.groups > 0 ? Math.floor((row.explained / row.groups) * 100) : 0
  const label = `${row.programName} › ${row.levelName} › ${row.subjectName}`

  return (
    <li
      className={`rounded-md border px-3 py-2 ${
        row.valid ? 'border-rule' : 'border-incorrect/40 bg-incorrect-soft'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`min-w-0 text-[0.8125rem] ${row.valid ? 'text-ink' : 'text-incorrect'}`}>
          {label}
        </p>
        <ActionButton
          label="Remove"
          confirm={`Take ${row.subjectName} (${row.programName}) away from ${teacherName}? Explanations they wrote for it stay.`}
          action={removeAssignment.bind(null, teacherId, row.subjectId)}
        />
      </div>

      {row.valid ? (
        <>
          <div
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2"
            role="img"
            aria-label={`${share}% of groups explained`}
          >
            <div className="h-full rounded-full bg-correct" style={{ width: `${share}%` }} />
          </div>
          <p className="mt-1 text-[0.71875rem] text-ink-muted tabular-nums">
            {row.explained.toLocaleString('en-IN')} of {row.groups.toLocaleString('en-IN')} groups explained ({share}%)
            {' · '}
            {row.withVideo.toLocaleString('en-IN')} with video · {row.inReview.toLocaleString('en-IN')} in review ·{' '}
            {row.questions.toLocaleString('en-IN')} questions ·{' '}
            <Link href={ROUTES.teachSubject(row.subjectSlug)} className="text-accent hover:underline">
              queue
            </Link>
          </p>
        </>
      ) : (
        <p className="mt-1 text-[0.71875rem] text-incorrect">
          This subject has moved out of {row.programName}, so the combo gives nothing. Remove it, then add the
          subject under its new branch if they should keep it.
        </p>
      )}
    </li>
  )
}
