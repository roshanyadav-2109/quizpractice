'use client'

import { useState, useTransition } from 'react'
import type { ActionState } from '@/app/admin/actions'

/** Subjects to move a set to, grouped as "Branch › Level". */
export interface SubjectGroup {
  label: string
  subjects: { id: string; name: string }[]
}

/**
 * Refiles one set under the subject its questions really belong to. Teachers
 * are assigned by subject, so a misfiled set otherwise sits in the wrong
 * teachers' queues. Closed until asked for: moving is rare.
 */
export function MoveSetForm({
  setCode,
  currentSubjectId,
  groups,
  action,
}: {
  setCode: string
  currentSubjectId: string | null
  groups: SubjectGroup[]
  /** moveSetToSubject bound to the set; it ends on the set's new paper. */
  action: (subjectId: string) => Promise<ActionState>
}) {
  const [open, setOpen] = useState(false)
  const [subjectId, setSubjectId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-ink-muted hover:text-ink hover:underline">
        Move to another subject
      </button>
    )
  }

  function move() {
    const target = groups.flatMap((group) => group.subjects).find((subject) => subject.id === subjectId)
    if (!target) return
    if (
      !window.confirm(
        `Move set ${setCode} to ${target.name}?\n\nIt joins the ${target.name} paper for the same exam and date (created if there is none). Its questions move to that subject's teachers; attempts and explanations stay with them.`,
      )
    ) {
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await action(subjectId)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <span className="flex w-full flex-wrap items-center justify-end gap-2">
      <label className="flex items-center gap-1.5">
        <span className="sr-only">Subject to move set {setCode} to</span>
        <select
          value={subjectId}
          onChange={(event) => setSubjectId(event.target.value)}
          className="h-7 max-w-64 rounded-[3px] border border-rule bg-surface px-2 text-[0.78125rem] text-ink outline-none focus:border-accent"
        >
          <option value="">Move set {setCode} to…</option>
          {groups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.subjects.map((subject) => (
                <option key={subject.id} value={subject.id} disabled={subject.id === currentSubjectId}>
                  {subject.name}
                  {subject.id === currentSubjectId ? ' (here now)' : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={move}
        disabled={!subjectId || pending}
        className="inline-flex h-7 items-center rounded-[3px] bg-accent px-2.5 text-[0.78125rem] text-accent-ink hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? 'Moving…' : 'Move'}
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false)
          setError(null)
        }}
        className="text-ink-muted hover:text-ink"
      >
        Cancel
      </button>
      {error ? <span className="w-full text-right text-incorrect">{error}</span> : null}
      <span className="w-full text-right text-[0.6875rem] text-ink-faint">
        Fix the subject in the source JSON too, or re-importing it puts a second copy back here.
      </span>
    </span>
  )
}
