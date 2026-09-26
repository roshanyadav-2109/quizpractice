/**
 * How many students practised a subject this week, with a small green dot.
 * Renders nothing without a count — the database only reports 100 or more.
 */
export function ActiveCount({ count, compact = false }: { count: number | undefined; compact?: boolean }) {
  if (!count) return null
  return (
    <span className="inline-flex items-center gap-1.5 text-meta font-light text-ink-muted tabular-nums">
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-correct" />
      {compact ? `${count} this week` : `${count} students practised this week`}
    </span>
  )
}
