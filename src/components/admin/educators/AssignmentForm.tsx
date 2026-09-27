'use client'

import { useState, useTransition } from 'react'
import { addAssignment } from '@/app/admin/educators/actions'
import type { ActionState } from '@/app/admin/actions'

/** One branch as the form offers it: its levels, each with its subjects. */
export interface BranchOption {
  id: string
  name: string
  levels: { id: string; name: string; subjects: { id: string; name: string }[] }[]
}

/**
 * Adds a branch + subject combo to a teacher. The branch comes first, and the
 * subject list then holds only that branch's subjects, grouped by level: the
 * same subject name in another branch (English I in Data Science and in
 * Electronic Systems) is a different job and is never offered by mistake.
 * The database refuses a mismatched pair anyway.
 */
export function AssignmentForm({
  teacherId,
  teacherName,
  branches,
  assigned,
}: {
  teacherId: string
  teacherName: string
  branches: BranchOption[]
  /** Subjects the teacher already has, shown but not selectable. */
  assigned: string[]
}) {
  const [programId, setProgramId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [state, setState] = useState<ActionState>({})
  const [pending, startTransition] = useTransition()

  const branch = branches.find((option) => option.id === programId) ?? null
  const levels = branch?.levels.filter((level) => level.subjects.length > 0) ?? []
  const taken = new Set(assigned)

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!programId || !subjectId) return
    setState({})
    startTransition(async () => {
      const result = await addAssignment(teacherId, programId, subjectId)
      setState(result)
      if (result.ok) setSubjectId('')
    })
  }

  const selectClass =
    'h-8 min-w-0 rounded-[3px] border border-rule bg-surface px-2.5 text-[0.8125rem] text-ink outline-none focus:border-accent disabled:opacity-60'

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="label">Branch</span>
          <select
            value={programId}
            onChange={(event) => {
              setProgramId(event.target.value)
              setSubjectId('')
              setState({})
            }}
            className={selectClass}
          >
            <option value="">Choose a branch…</option>
            {branches.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-xs">
          <span className="label">Subject</span>
          <select
            value={subjectId}
            disabled={!branch || levels.length === 0}
            onChange={(event) => {
              setSubjectId(event.target.value)
              setState({})
            }}
            className={selectClass}
            aria-label={`Subject to give ${teacherName}`}
          >
            <option value="">
              {!branch ? 'Choose a branch first' : levels.length === 0 ? 'No subjects in this branch yet' : 'Choose a subject…'}
            </option>
            {levels.map((level) => (
              <optgroup key={level.id} label={level.name}>
                {level.subjects.map((subject) => (
                  <option key={subject.id} value={subject.id} disabled={taken.has(subject.id)}>
                    {subject.name}
                    {taken.has(subject.id) ? ' (assigned)' : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={!programId || !subjectId || pending}
          className="inline-flex h-8 items-center rounded-[3px] bg-accent px-3 text-[0.8125rem] text-accent-ink hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? 'Adding…' : 'Add subject'}
        </button>
      </div>

      {state.ok ? <span className="text-[0.78125rem] text-correct">Added.</span> : null}
      {state.error ? <span className="text-[0.78125rem] text-incorrect">{state.error}</span> : null}
    </form>
  )
}
