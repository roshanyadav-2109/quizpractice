import { formatCount } from '@/lib/format'
import type { PaperCount } from '@/lib/teach/queries'

/**
 * How far a subject has got, counted in papers: a paper is done when every
 * question in it has a published explanation. Three parts, left to right:
 * done, started, not started. The legend under it carries the numbers, so
 * nothing rests on colour alone.
 */
export function CoverageBar({ papers, className = '' }: { papers: PaperCount; className?: string }) {
  const { total, done, started } = papers
  const parts = [
    { key: 'done', label: 'Done', count: done, swatch: 'bg-desk' },
    { key: 'started', label: 'Started', count: started, swatch: 'bg-desk/45' },
    { key: 'todo', label: 'Not started', count: Math.max(total - done - started, 0), swatch: 'bg-surface-3' },
  ]
  const shown = parts.filter((part) => part.count > 0)
  const percent = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-meta text-ink">
          {formatCount(done)} of {formatCount(total)} papers done
        </span>
        <span className="text-meta text-ink-faint tabular-nums">{percent}%</span>
      </div>

      <div className="mt-1.5 flex h-2.5 gap-[2px]" role="img" aria-label={parts.map((part) => `${part.label}: ${part.count}`).join(', ')}>
        {shown.length === 0 ? <span className="h-full flex-1 rounded-[4px] bg-surface-3" /> : null}
        {shown.map((part, i) => (
          <span
            key={part.key}
            title={`${part.label}: ${formatCount(part.count)}`}
            className={`h-full ${part.swatch} ${i === 0 ? 'rounded-l-[4px]' : ''} ${i === shown.length - 1 ? 'rounded-r-[4px]' : ''}`}
            style={{ flexGrow: part.count, flexBasis: 0 }}
          />
        ))}
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1" aria-hidden="true">
        {parts.map((part) => (
          <li key={part.key} className="flex items-center gap-1.5 text-micro text-ink-muted tabular-nums">
            <span className={`h-2 w-2 rounded-[2px] ${part.swatch}`} />
            {part.label} {formatCount(part.count)}
          </li>
        ))}
      </ul>
    </div>
  )
}
