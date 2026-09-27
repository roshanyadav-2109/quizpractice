import { formatCount } from '@/lib/format'

/**
 * How far a subject has got, counted in groups — a question and every copy of
 * it are one group, explained once. Three parts, left to right: published with
 * a video, published as writing only, and not published yet (drafts and work
 * waiting for review included: no student can see it yet).
 *
 * What is waiting for review is a count under the bar, not a part of it: a
 * group can be live and in review at once — a written explanation published,
 * a second teacher's video waiting — so as a part it would be taken out of
 * "not published" twice.
 *
 * One hue in three strengths, as every data bar on the site is drawn; the
 * legend under it carries the numbers, so nothing rests on colour alone.
 */
export function CoverageBar({
  groups,
  explained,
  withVideo,
  inReview,
  className = '',
}: {
  groups: number
  /** Groups with a published explanation. */
  explained: number
  /** Of those, the ones with a video. */
  withVideo: number
  /** Groups with an explanation submitted and waiting for a reviewer, live or not. */
  inReview: number
  className?: string
}) {
  const total = Math.max(groups, 0)
  const video = clamp(withVideo, total)
  const textOnly = clamp(explained - video, total - video)
  const todo = total - video - textOnly

  const parts = [
    { key: 'video', label: 'With video', count: video, swatch: 'bg-accent' },
    { key: 'text', label: 'Written only', count: textOnly, swatch: 'bg-accent/45' },
    { key: 'todo', label: 'Not published', count: todo, swatch: 'bg-surface-3' },
  ]
  const shown = parts.filter((part) => part.count > 0)
  const published = video + textOnly
  const percent = total > 0 ? Math.round((published / total) * 100) : 0
  const review = Math.max(inReview, 0)

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-meta text-ink">
          {formatCount(published)} of {formatCount(total)} explained
        </span>
        <span className="text-meta text-ink-faint tabular-nums">{percent}%</span>
      </div>

      <div
        className="mt-1.5 flex h-2.5 gap-[2px]"
        role="img"
        aria-label={[...parts.map((part) => `${part.label}: ${part.count}`), `In review: ${review}`].join(', ')}
      >
        {shown.length === 0 ? <span className="h-full flex-1 rounded-[4px] bg-surface-3" /> : null}
        {shown.map((part, i) => (
          <span
            key={part.key}
            title={`${part.label}: ${formatCount(part.count)}`}
            className={`h-full ${part.swatch} ${i === 0 ? 'rounded-l-[4px]' : ''} ${
              i === shown.length - 1 ? 'rounded-r-[4px]' : ''
            }`}
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
        {review > 0 ? (
          <li className="text-micro text-ink-muted tabular-nums">· {formatCount(review)} in review</li>
        ) : null}
      </ul>
    </div>
  )
}

function clamp(value: number, max: number): number {
  return Math.min(Math.max(value, 0), Math.max(max, 0))
}
