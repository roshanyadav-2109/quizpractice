'use client'

import Link from 'next/link'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { ClockCountdown, X } from '@/components/ui/icons'

/**
 * A student's own recent searches, kept in their browser and nowhere else.
 */

const KEY = 'qp:recent-searches'
const MAX = 8
const CHANGED = 'qp:recent-searches-changed'

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? '[]'
  } catch {
    return '[]'
  }
}

function write(terms: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(terms))
    window.dispatchEvent(new Event(CHANGED))
  } catch {
    // Private windows and blocked storage: recent searches simply aren't kept.
  }
}

function parse(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value) ? value.filter((term): term is string => typeof term === 'string') : []
  } catch {
    return []
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(CHANGED, onChange)
    window.removeEventListener('storage', onChange)
  }
}

/** Adds a search that found something to the student's recent searches. Renders nothing. */
export function RememberSearch({ term }: { term: string }) {
  useEffect(() => {
    const kept = parse(read()).filter((existing) => existing.toLowerCase() !== term.toLowerCase())
    write([term, ...kept].slice(0, MAX))
  }, [term])
  return null
}

/** The recent searches as chips, each removable. Nothing until there is one. */
export function RecentSearches({ className = '' }: { className?: string }) {
  const raw = useSyncExternalStore(subscribe, read, () => '[]')
  const terms = useMemo(() => parse(raw), [raw])
  if (terms.length === 0) return null

  return (
    <section className={className}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-meta text-ink-muted">
          <ClockCountdown size={15} aria-hidden="true" />
          Your recent searches
        </h2>
        <button type="button" onClick={() => write([])} className="text-meta text-ink-faint hover:text-ink">
          Clear
        </button>
      </div>
      <ul className="flex flex-wrap gap-2">
        {terms.map((term) => (
          <li key={term} className="inline-flex h-10 items-center rounded-control border border-rule bg-surface">
            <Link href={`/search?q=${encodeURIComponent(term)}`} className="pr-1 pl-4 text-ui text-ink hover:underline">
              {term}
            </Link>
            <button
              type="button"
              aria-label={`Remove ${term}`}
              onClick={() => write(parse(read()).filter((existing) => existing !== term))}
              className="flex h-10 w-9 items-center justify-center text-ink-faint hover:text-ink"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
