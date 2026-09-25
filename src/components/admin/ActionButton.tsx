'use client'

import { useState, useTransition } from 'react'
import type { ActionState } from '@/app/admin/actions'

/**
 * A button that runs a server action and reports what happened. Used for the
 * one-click operations — publish, approve, dismiss — where a whole form would
 * be overkill.
 */
export function ActionButton({
  action,
  label,
  pendingLabel,
  confirm,
  tone = 'neutral',
}: {
  action: () => Promise<ActionState>
  label: string
  pendingLabel?: string
  confirm?: string
  tone?: 'neutral' | 'primary' | 'positive' | 'danger'
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function run() {
    if (confirm && !window.confirm(confirm)) return
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result?.error) setError(result.error)
    })
  }

  const tones: Record<string, string> = {
    neutral: 'border border-rule text-ink-muted hover:border-rule-strong hover:text-ink',
    primary: 'bg-accent text-accent-ink hover:bg-accent-hover',
    positive: 'bg-correct text-white hover:opacity-90',
    danger: 'border border-incorrect text-incorrect hover:bg-incorrect-soft',
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={`inline-flex h-6 items-center rounded-[3px] px-2 text-[0.75rem]  transition-colors disabled:opacity-60 ${tones[tone]}`}
      >
        {pending ? (pendingLabel ?? 'Working…') : label}
      </button>
      {error ? <span className="text-xs text-incorrect">{error}</span> : null}
    </span>
  )
}
