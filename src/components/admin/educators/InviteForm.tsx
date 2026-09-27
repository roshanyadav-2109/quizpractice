'use client'

import { useState, useTransition } from 'react'
import { inviteByEmail } from '@/app/admin/educators/actions'
import type { UserRole } from '@/types/db'

/**
 * Access by email: the Google address someone will sign in with, and the role
 * they get. Works before they have ever visited the site; someone who already
 * has an account gets the role at once.
 */
export function InviteForm() {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('teacher')
  const [result, setResult] = useState<{ tone: 'correct' | 'incorrect'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const address = email.trim()
    if (!address) return
    setResult(null)
    startTransition(async () => {
      const outcome = await inviteByEmail(address, role)
      if (!outcome.ok) {
        setResult({ tone: 'incorrect', text: outcome.error ?? 'The invite could not be saved.' })
        return
      }
      const as = role === 'teacher' ? 'a teacher' : 'a contributor'
      setResult({
        tone: 'correct',
        text: outcome.applied
          ? `${address} already has an account and is now ${as}.${role === 'teacher' ? ' Give them subjects under Teachers.' : ''}`
          : `Invited. ${address} becomes ${as} the first time they sign in with Google using this address.${
              role === 'teacher' ? ' Add their subjects below now, or later.' : ''
            }`,
      })
      setEmail('')
    })
  }

  const field =
    'h-9 min-w-0 rounded-[3px] border border-rule bg-surface px-2.5 text-[0.8125rem] text-ink outline-none focus:border-accent disabled:opacity-60'

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-sm">
          <span className="label">Google email address</span>
          <input
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              setResult(null)
            }}
            placeholder="name@gmail.com"
            autoComplete="off"
            required
            disabled={pending}
            className={field}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="label">Access</span>
          <select value={role} onChange={(event) => setRole(event.target.value as UserRole)} disabled={pending} className={field}>
            <option value="teacher">Teacher</option>
            <option value="contributor">Contributor</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={pending || !email.trim()}
          className="inline-flex h-9 items-center rounded-[3px] bg-accent px-3 text-[0.8125rem] text-accent-ink hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Give access'}
        </button>
      </div>
      {result ? (
        <p className={`text-[0.78125rem] ${result.tone === 'correct' ? 'text-correct' : 'text-incorrect'}`} aria-live="polite">
          {result.text}
        </p>
      ) : null}
    </form>
  )
}
