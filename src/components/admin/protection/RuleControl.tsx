'use client'

import { useState, useTransition } from 'react'
import type { ActionState } from '@/app/admin/actions'
import type { Rule, RuleMode } from '@/lib/protection'

const MODES: { value: RuleMode; label: string; help: string }[] = [
  { value: 'off', label: 'Off', help: 'Does nothing' },
  { value: 'watch', label: 'Watch', help: 'Logs what it would do, changes nothing' },
  { value: 'enforce', label: 'Enforce', help: 'Acts' },
]

/** One rule: its mode, its numbers, and the undo for what it did. */
export function RuleControl({
  rule,
  setMode,
  setParams,
  undo,
}: {
  rule: Rule
  setMode: (mode: string) => Promise<ActionState>
  setParams: (params: Record<string, number>) => Promise<ActionState>
  undo?: () => Promise<ActionState>
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(rule.params).map(([k, v]) => [k, String(v)])))
  const names = Object.keys(rule.params)
  const changed = names.some((name) => Number(draft[name]) !== rule.params[name])

  const run = (job: () => Promise<ActionState>) =>
    start(async () => {
      setError(null)
      const result = await job()
      if (result?.error) setError(result.error)
    })

  return (
    <li className="rounded-lg border border-rule bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{rule.label}</p>
          <p className="mt-0.5 text-xs text-ink-muted">{rule.description}</p>
          <p className="mt-1 font-mono text-[0.6875rem] text-ink-faint">
            {rule.key} · changed {new Date(rule.updated_at).toLocaleString('en-GB')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1" role="group" aria-label={`${rule.label} mode`}>
          {MODES.map((mode) => (
            <button
              key={mode.value}
              type="button"
              title={mode.help}
              disabled={pending || rule.mode === mode.value}
              onClick={() => run(() => setMode(mode.value))}
              className={`h-7 rounded-[3px] px-2.5 text-xs transition-colors disabled:cursor-default ${
                rule.mode === mode.value
                  ? mode.value === 'enforce'
                    ? 'bg-incorrect text-white'
                    : mode.value === 'watch'
                      ? 'bg-accent text-accent-ink'
                      : 'bg-ink-faint text-white'
                  : 'border border-rule text-ink-muted hover:border-rule-strong hover:text-ink'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {names.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-rule pt-3">
          {names.map((name) => (
            <label key={name} className="text-xs text-ink-muted">
              {name.replace(/_/g, ' ')}
              <input
                value={draft[name] ?? ''}
                onChange={(event) => setDraft({ ...draft, [name]: event.target.value })}
                inputMode="decimal"
                className="mt-0.5 block h-7 w-24 rounded-[3px] border border-rule bg-surface px-2 font-mono text-xs text-ink"
              />
            </label>
          ))}
          <button
            type="button"
            disabled={pending || !changed}
            onClick={() => run(() => setParams(Object.fromEntries(names.map((name) => [name, Number(draft[name])]))))}
            className="h-7 rounded-[3px] bg-accent px-2.5 text-xs text-accent-ink disabled:opacity-40"
          >
            Save numbers
          </button>
          {undo ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (window.confirm(`Undo every ban made by "${rule.label}" and put the rule back to Watch?`)) run(undo)
              }}
              className="h-7 rounded-[3px] border border-incorrect px-2.5 text-xs text-incorrect hover:bg-incorrect-soft"
            >
              Undo its bans
            </button>
          ) : null}
        </div>
      ) : undo ? (
        <div className="mt-3 border-t border-rule pt-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (window.confirm(`Undo every ban made by "${rule.label}" and put the rule back to Watch?`)) run(undo)
            }}
            className="h-7 rounded-[3px] border border-incorrect px-2.5 text-xs text-incorrect hover:bg-incorrect-soft"
          >
            Undo its bans
          </button>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs text-incorrect">{error}</p> : null}
    </li>
  )
}
