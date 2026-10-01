'use client'

import { useState, useTransition } from 'react'
import type { ActionState } from '@/app/admin/actions'
import type { Rule, RuleMode, RuleStat } from '@/lib/protection'
import type { RuleGuide } from '@/lib/protection-guide'

const MODES: { value: RuleMode; label: string; help: string }[] = [
  { value: 'off', label: 'Off', help: 'Does nothing' },
  { value: 'watch', label: 'Watch', help: 'Logs what it would do, changes nothing' },
  { value: 'enforce', label: 'Enforce', help: 'Acts' },
]

/** One rule: its mode, its numbers, and the undo for what it did. */
export function RuleControl({
  rule,
  guide,
  stat,
  signalModes,
  setMode,
  setParams,
  undo,
}: {
  rule: Rule
  guide?: RuleGuide
  stat?: RuleStat
  /** The signals an automatic ban counts, with their current modes. */
  signalModes?: { label: string; mode: RuleMode }[]
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

      {guide ? (
        <div className="mt-3 grid gap-x-6 gap-y-3 border-t border-rule pt-3 text-xs sm:grid-cols-2">
          <div className="sm:col-span-2">
            <p className="font-medium text-ink">What it measures</p>
            <p className="mt-0.5 text-ink-muted">{guide.measures}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="font-medium text-ink">How it decides</p>
            <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-ink-muted marker:text-ink-faint">
              {guide.how.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          {signalModes ? (
            <div className="sm:col-span-2">
              <p className="font-medium text-ink">The signals it counts, and how each is set now</p>
              <p className="mt-0.5 flex flex-wrap gap-1.5">
                {signalModes.map((signal) => (
                  <span
                    key={signal.label}
                    className={`rounded-full border px-2 py-0.5 text-[0.6875rem] ${
                      signal.mode === 'enforce' ? 'border-incorrect text-incorrect' : signal.mode === 'watch' ? 'border-accent text-accent' : 'border-rule text-ink-faint'
                    }`}
                  >
                    {signal.label}: {signal.mode}
                  </span>
                ))}
              </p>
            </div>
          ) : null}
          <div>
            <p className="font-medium text-ink">When it acts</p>
            <p className="mt-0.5 text-ink-muted">{guide.whenItActs}</p>
          </div>
          <div>
            <p className="font-medium text-ink">In Watch mode</p>
            <p className="mt-0.5 text-ink-muted">{guide.inWatch}</p>
          </div>
          <div>
            <p className="font-medium text-ink">Risk to real students</p>
            <p className="mt-0.5 text-ink-muted">{guide.risk}</p>
          </div>
          <div>
            <p className="font-medium text-ink">Measured on your data</p>
            <p className="mt-0.5 text-ink-muted">{guide.measured}</p>
          </div>
          <div>
            <p className="font-medium text-ink">How to undo it</p>
            <p className="mt-0.5 text-ink-muted">{guide.undo}</p>
          </div>
          <div>
            <p className="font-medium text-ink">What it has done</p>
            {stat && stat.last7d > 0 ? (
              <p className="mt-0.5 text-ink-muted">
                Last 24 hours:{' '}
                {Object.keys(stat.last24h).length
                  ? Object.entries(stat.last24h).map(([action, count]) => `${count} ${action.replace(/_/g, ' ')}`).join(', ')
                  : 'nothing'}
                . Last 7 days: {stat.last7d}. Last at {stat.lastAt ? new Date(stat.lastAt).toLocaleString('en-GB') : '–'}.
              </p>
            ) : (
              <p className="mt-0.5 text-ink-muted">Nothing logged in the last 7 days.</p>
            )}
          </div>
        </div>
      ) : null}

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
