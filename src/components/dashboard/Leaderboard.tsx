'use client'

import { useState } from 'react'
import type { LeaderboardRow } from '@/lib/queries'
import { EmptyState } from '@/components/ui/EmptyState'

export interface Board {
  key: string
  label: string
  note: string
  rows: LeaderboardRow[]
}

/** Gold, silver, bronze — each also carries its number, so colour is never alone. */
const MEDALS = ['bg-[#f5c24b] text-[#5c3d00]', 'bg-[#d6d3d0] text-ink', 'bg-[#e0a27a] text-[#4a2410]']

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}

/**
 * Where you stand among other students: overall, and in your own subject,
 * exam, level and branch. Top ten, and your own row wherever you are.
 */
export function Leaderboard({ boards }: { boards: Board[] }) {
  const [active, setActive] = useState(boards[0]?.key)
  const board = boards.find((b) => b.key === active) ?? boards[0]
  if (!board) return null

  const you = board.rows.find((row) => row.isYou)
  const top = board.rows.filter((row) => row.rank <= 10)
  const youBelow = you && you.rank > 10 ? you : null

  return (
    <div>
      <div role="tablist" aria-label="Leaderboard" className="flex flex-wrap gap-2">
        {boards.map((b) => (
          <button
            key={b.key}
            type="button"
            role="tab"
            aria-selected={b.key === board.key}
            onClick={() => setActive(b.key)}
            className={`max-w-[16rem] truncate rounded-full border px-3.5 py-1.5 text-meta transition-colors ${
              b.key === board.key
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-rule text-ink-muted hover:border-rule-strong hover:text-ink'
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-3">
        <p className="text-meta font-light text-ink-faint">{board.note}</p>
        {you ? (
          <p className="shrink-0 text-meta text-ink-muted">
            You’re <span className="text-ink tabular-nums">#{you.rank}</span>
          </p>
        ) : null}
      </div>

      {top.length === 0 ? (
        <EmptyState className="mt-4" framed={false} size="sm" art="waiting-for-others" title="No one has sat a paper here yet">
          Rankings appear as students finish papers.
        </EmptyState>
      ) : (
        <ol className="mt-3 flex flex-col">
          <li className="grid grid-cols-[2.5rem_minmax(0,1fr)_4.5rem_7.5rem] items-center gap-3 border-b border-rule px-3 pb-2 text-meta text-ink-faint">
            <span>Rank</span>
            <span>Student</span>
            <span className="text-right">Papers</span>
            <span className="text-right">Avg score</span>
          </li>
          {[...top, ...(youBelow ? [null, youBelow] : [])].map((row, i) =>
            row === null ? (
              <li key={`gap-${i}`} aria-hidden="true" className="px-3 py-1 text-center text-meta text-ink-faint">
                ⋯
              </li>
            ) : (
              <li
                key={`${row.rank}-${row.displayName}-${i}`}
                className={`grid grid-cols-[2.5rem_minmax(0,1fr)_4.5rem_7.5rem] items-center gap-3 rounded-control px-3 py-2.5 ${
                  row.isYou ? 'bg-accent-soft' : 'border-b border-rule last:border-b-0'
                }`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-meta tabular-nums ${
                    row.rank <= 3 ? MEDALS[row.rank - 1] : 'text-ink-faint'
                  }`}
                >
                  {row.rank}
                </span>
                <span className="flex min-w-0 items-center gap-3">
                  {row.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.avatarUrl} alt="" referrerPolicy="no-referrer" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[0.75rem] text-ink-muted">
                      {initials(row.displayName)}
                    </span>
                  )}
                  <span className="min-w-0 truncate text-ui font-light text-ink">{row.displayName}</span>
                  {row.isYou ? (
                    <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[0.6875rem] leading-none text-white">You</span>
                  ) : null}
                </span>
                <span className="text-right text-ui font-light text-ink-muted tabular-nums">{row.papers}</span>
                <span className="flex items-center justify-end gap-2">
                  <span className="h-1.5 w-12 bg-surface-2" aria-hidden="true">
                    <span className="block h-full rounded-r-[4px] bg-accent" style={{ width: `${Math.max(2, row.avgPercentage)}%` }} />
                  </span>
                  <span className="w-12 text-right text-ui text-ink tabular-nums">{Math.round(row.avgPercentage)}%</span>
                </span>
              </li>
            ),
          )}
        </ol>
      )}
    </div>
  )
}
