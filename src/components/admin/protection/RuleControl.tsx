'use client'

import { useEffect, useState, useTransition } from 'react'
import type { ActionState } from '@/app/admin/actions'
import type { Rule, RuleMode, RuleStat } from '@/lib/protection'
import { describe, type RuleGuide } from '@/lib/protection-guide'
import type { RulePreview } from '@/app/admin/protection/actions'

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
  preview,
  undo,
}: {
  rule: Rule
  guide?: RuleGuide
  stat?: RuleStat
  /** The signals an automatic ban counts, with their current modes. */
  signalModes?: { label: string; mode: RuleMode }[]
  setMode: (mode: string) => Promise<ActionState>
  setParams: (params: Record<string, number>) => Promise<ActionState>
  preview: (params: Record<string, number>) => Promise<{ ok: true; preview: RulePreview } | { ok: false; error: string }>
  undo?: () => Promise<ActionState>
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(rule.params).map(([k, v]) => [k, String(v)])))
  const names = Object.keys(rule.params)
  const changed = names.some((name) => Number(draft[name]) !== rule.params[name])
  const typed = Object.fromEntries(names.map((name) => [name, Number(draft[name])]))
  const valid = names.every((name) => draft[name] !== '' && Number.isFinite(Number(draft[name])) && Number(draft[name]) >= 0)
  const typedKey = JSON.stringify(typed)
  const [result, setResult] = useState<{ ok: true; preview: RulePreview } | { ok: false; error: string } | null>(null)
  const [loading, setLoading] = useState(false)

  // What these numbers would have done to the recorded history, shortly after typing stops.
  useEffect(() => {
    if (!valid) return
    let current = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      preview(JSON.parse(typedKey) as Record<string, number>)
        .then((answer) => current && setResult(answer))
        .catch(() => current && setResult({ ok: false, error: 'The preview could not be loaded.' }))
        .finally(() => current && setLoading(false))
    }, 450)
    return () => {
      current = false
      window.clearTimeout(timer)
    }
  }, [typedKey, valid, preview])
  const text = valid ? describe(rule.key, typed) : null

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
      {text && text.what ? (
        <div className="mt-3 rounded-md border border-rule bg-surface-2 p-3 text-xs">
          <p className="font-medium text-ink">
            {changed ? 'If you save these numbers' : 'With the numbers now saved'}
            {loading ? <span className="ml-2 font-normal text-ink-faint">calculating…</span> : null}
          </p>
          <dl className="mt-1.5 grid gap-1.5">
            <div><dt className="inline font-medium text-ink">What will happen: </dt><dd className="inline text-ink-muted">{text.what}</dd></div>
            <div><dt className="inline font-medium text-ink">How: </dt><dd className="inline text-ink-muted">{text.how}</dd></div>
            <div><dt className="inline font-medium text-ink">Repercussions: </dt><dd className="inline text-ink-muted">{text.repercussions}</dd></div>
          </dl>
          {text.warnings.map((warning) => (
            <p key={warning} className="mt-1.5 text-incorrect">Check: {warning}</p>
          ))}
          {result?.ok ? (
            <p className={`mt-2 rounded-[3px] border px-2 py-1.5 ${result.preview.affected_real > 0 ? 'border-incorrect text-incorrect' : 'border-rule text-ink'}`}>
              <span className="font-medium">Who would have been affected</span> (last {result.preview.days} days, {result.preview.considered} students opened papers):{' '}
              <strong>{result.preview.affected_real} real student{result.preview.affected_real === 1 ? '' : 's'}</strong> and{' '}
              <strong>{result.preview.affected_scrapers} account{result.preview.affected_scrapers === 1 ? '' : 's'} already banned</strong>
              {result.preview.events > 0 ? `, ${result.preview.events} time${result.preview.events === 1 ? '' : 's'} in all` : ''}.
              {result.preview.examples.length > 0 ? <span className="block text-ink-muted">For example: {result.preview.examples.join(', ')}</span> : null}
              {result.preview.note ? <span className="block text-ink-faint">{result.preview.note}</span> : null}
            </p>
          ) : result ? (
            <p className="mt-2 text-incorrect">{result.error}</p>
          ) : null}
        </div>
      ) : valid ? null : (
        <p className="mt-3 text-xs text-incorrect">Enter a number in every box to see what it would do.</p>
      )}
      {error ? <p className="mt-2 text-xs text-incorrect">{error}</p> : null}
    </li>
  )
}
