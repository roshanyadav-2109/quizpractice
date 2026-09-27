'use client'

import { useState, useTransition } from 'react'
import Form from 'next/form'
import Link from 'next/link'
import { setRole } from '@/app/admin/educators/actions'
import { ROUTES } from '@/lib/teach/contracts'
import { MagnifyingGlass } from '@/components/ui/icons'
import type { AdminPersonRow, UserRole } from '@/types/db'

/**
 * Everyone who has signed in, found by name or email, with the role an admin
 * may give them. The search is the page's ?q=, so a result can be linked to
 * and survives a reload; the list itself is read on the server through
 * admin_list_people(), the only place email is readable.
 */
export function PeopleSearch({
  query,
  people,
  selfId,
  error,
}: {
  query: string
  people: AdminPersonRow[]
  selfId: string
  error: string | null
}) {
  return (
    <div className="flex flex-col gap-3">
      <Form action={ROUTES.adminEducators} scroll={false} className="flex flex-wrap items-center gap-2">
        <label className="relative flex min-w-0 flex-1 items-center sm:max-w-sm">
          <span className="sr-only">Search people by name or email</span>
          <MagnifyingGlass size={14} className="pointer-events-none absolute left-2.5 text-ink-faint" aria-hidden />
          <input
            type="search"
            name="q"
            defaultValue={query}
            maxLength={100}
            placeholder="Name or email"
            className="h-8 w-full rounded-[3px] border border-rule bg-surface pr-2.5 pl-8 text-[0.8125rem] text-ink outline-none focus:border-accent"
          />
        </label>
        <button
          type="submit"
          className="inline-flex h-8 items-center rounded-[3px] bg-accent px-3 text-[0.8125rem] text-accent-ink hover:bg-accent-hover"
        >
          Search
        </button>
        {query ? (
          <Link href={ROUTES.adminEducators} scroll={false} className="text-xs text-ink-muted hover:text-ink">
            Clear
          </Link>
        ) : null}
      </Form>

      {error ? (
        <p className="rounded-md bg-incorrect-soft px-3 py-2 text-xs text-incorrect">
          People could not be loaded: {error}
        </p>
      ) : people.length === 0 ? (
        <p className="rounded-md border border-dashed border-rule px-3 py-6 text-center text-xs text-ink-muted">
          {query
            ? `Nobody matches “${query}”. They need to sign in to the site once before they can be given a role.`
            : 'Nobody has signed in yet.'}
        </p>
      ) : (
        <ul className="border-t border-rule">
          {people.map((person) => (
            <PersonRow key={person.id} person={person} self={person.id === selfId} />
          ))}
        </ul>
      )}

      {!query && people.length > 0 ? (
        <p className="text-[0.71875rem] text-ink-faint">
          Teachers first, then the newest sign-ins. Search to find anyone else.
        </p>
      ) : null}
    </div>
  )
}

// Pinned to a zone as well as a locale: this list renders on the server (UTC)
// and hydrates in the browser, and a sign-in late in the evening in India
// would otherwise fall on a different day in each (a hydration mismatch).
const joinedDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
})

const ROLE_LABELS: Record<UserRole, string> = {
  student: 'Student',
  teacher: 'Teacher',
  contributor: 'Contributor',
  admin: 'Admin',
}

/** What each role change does, said before it happens. */
function consequence(from: UserRole, to: UserRole): string {
  if (to === 'teacher') {
    return 'They get the teaching desk. Give them branch + subject combos below before they can explain anything.'
  }
  if (from === 'teacher') {
    return 'They lose the teaching desk, all their subjects and "publish without review". Explanations they wrote stay.'
  }
  if (to === 'contributor') return 'They can edit papers, questions and the taxonomy, and review explanations.'
  return 'They go back to being a student.'
}

function PersonRow({ person, self }: { person: AdminPersonRow; self: boolean }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const name = person.display_name || person.email || 'Unnamed'
  const locked = self || person.role === 'admin'

  function change(next: UserRole) {
    if (next === person.role) return
    if (!window.confirm(`Make ${name} a ${ROLE_LABELS[next].toLowerCase()}?\n\n${consequence(person.role, next)}`)) return
    setError(null)
    startTransition(async () => {
      const result = await setRole(person.id, next)
      if (result.error) setError(result.error)
    })
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-rule px-1 py-2">
      <PersonAvatar name={name} src={person.avatar_url} size={28} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.8125rem] text-ink">
          {name}
          {self ? <span className="ml-1.5 text-ink-faint">(you)</span> : null}
        </p>
        <p className="truncate text-[0.71875rem] text-ink-muted">
          {person.email ?? 'no email'} · joined {joinedDate.format(new Date(person.created_at))}
          {person.role === 'teacher'
            ? ` · ${person.assignments} subject${person.assignments === 1 ? '' : 's'}`
            : ''}
        </p>
      </div>

      {locked ? (
        <span
          className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[0.6875rem] text-ink-muted"
          title={self ? 'You cannot change your own role.' : 'Admin roles are changed in the Supabase dashboard.'}
        >
          {person.role}
        </span>
      ) : (
        <label className="flex items-center gap-1.5">
          <span className="sr-only">Role for {name}</span>
          <select
            value={person.role}
            disabled={pending}
            onChange={(event) => change(event.target.value as UserRole)}
            className="h-7 rounded-[3px] border border-rule bg-surface px-2 text-[0.78125rem] text-ink outline-none focus:border-accent disabled:opacity-60"
          >
            {(['student', 'teacher', 'contributor'] as const).map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          {pending ? <span className="text-xs text-ink-muted">Saving…</span> : null}
        </label>
      )}
      {error ? <p className="w-full text-xs text-incorrect">{error}</p> : null}
    </li>
  )
}

/** "Roshan Singh" → "RS"; an email falls back to its first letter. */
function initials(name: string): string {
  const words = name.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean)
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0]?.[0] ?? '?')
  return letters.toUpperCase()
}

/** The Google photo, or initials if there is none or it fails to load. */
export function PersonAvatar({ name, src, size }: { name: string; src: string | null; size: number }) {
  const [failed, setFailed] = useState(false)
  if (src && !failed) {
    return (
      // A Google photo URL, sized by the browser: nothing for the image optimiser to do.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full bg-surface-2 font-medium text-ink-muted"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials(name)}
    </span>
  )
}
