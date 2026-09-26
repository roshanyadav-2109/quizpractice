import type { ReactNode } from 'react'
import Link from 'next/link'
import type { AnswerBreakdown } from '@/lib/queries'
import { formatCount, formatDuration, formatShortDate, istDayKey } from '@/lib/format'
import { CheckCircle, MinusCircle, PencilSimpleLine, XCircle } from '@/components/ui/icons'

/** A dashboard card: a quiet heading, an optional aside, then the content. */
export function Panel({
  title,
  note,
  aside,
  children,
  className = '',
}: {
  title: string
  note?: ReactNode
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`relative min-w-0 rounded-[10px] border border-rule bg-surface p-5 sm:p-6 ${className}`}>
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[1.0625rem] leading-snug font-normal text-ink">{title}</h2>
          {note ? <p className="mt-1 text-meta font-light text-ink-faint">{note}</p> : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </header>
      <div className="mt-5">{children}</div>
    </section>
  )
}

/**
 * A dial for one ratio against its limit: the arc fills to the value on a
 * lighter track of the same blue, with a needle so the reading holds without
 * colour.
 */
export function Gauge({ value, label }: { value: number; label: string }) {
  const v = Math.min(100, Math.max(0, value))
  const cx = 130
  const cy = 128
  const r = 100
  const angle = Math.PI * (1 - v / 100)
  const end = { x: cx + r * Math.cos(angle), y: cy - r * Math.sin(angle) }
  const needle = { x: cx + 76 * Math.cos(angle), y: cy - 76 * Math.sin(angle) }
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 260 150" className="w-full max-w-[280px]" role="img" aria-label={`${label}: ${Math.round(v)}%`}>
        <path d={`M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}`} fill="none" stroke="var(--color-accent-soft)" strokeWidth={16} strokeLinecap="round" />
        {v > 0 ? (
          <path
            d={`M${cx - r},${cy} A${r},${r} 0 0 1 ${end.x.toFixed(2)},${end.y.toFixed(2)}`}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={16}
            strokeLinecap="round"
          />
        ) : null}
        <line x1={cx} y1={cy} x2={needle.x} y2={needle.y} stroke="var(--color-accent)" strokeWidth={3} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={7} fill="var(--color-surface)" stroke="var(--color-accent)" strokeWidth={3} />
        <text x={cx - r} y={cy + 20} textAnchor="middle" className="fill-ink-faint text-[11px]">0</text>
        <text x={cx + r} y={cy + 20} textAnchor="middle" className="fill-ink-faint text-[11px]">100</text>
      </svg>
      <p className="-mt-1 text-[2.75rem] leading-none font-light text-ink">{Math.round(v)}%</p>
    </div>
  )
}

/** A hover card for a mark — shown on hover and on keyboard focus. */
function Tip({ children }: { children: ReactNode }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-max max-w-[220px] -translate-x-1/2 rounded-control border border-rule bg-surface px-3 py-2 text-meta text-ink shadow-[0_6px_20px_-8px_rgba(12,10,9,.25)] group-hover:block group-focus-visible:block"
    >
      {children}
    </span>
  )
}

export interface SubjectScore {
  slug: string
  name: string
  percentage: number
  attempts: number
  got: number
  total: number
}

/** Average score per subject, highest first, one hue — the job is magnitude. */
export function SubjectBars({ subjects }: { subjects: SubjectScore[] }) {
  return (
    <ul className="flex flex-col gap-4">
      {subjects.map((subject) => (
        <li key={subject.slug}>
          <Link href={`/subject/${subject.slug}`} className="group relative block outline-none">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-ui font-light text-ink group-hover:text-accent">{subject.name}</span>
              <span className="shrink-0 text-ui text-ink tabular-nums">{subject.percentage}%</span>
            </div>
            <div className="mt-2 h-2.5 w-full bg-surface-2">
              <div
                className="h-full rounded-r-[4px] bg-accent"
                style={{ width: `${Math.max(2, subject.percentage)}%` }}
              />
            </div>
            <Tip>
              {subject.name}
              <span className="block font-light text-ink-faint tabular-nums">
                {formatCount(subject.got)} / {formatCount(subject.total)} marks · {subject.attempts}{' '}
                {subject.attempts === 1 ? 'paper' : 'papers'}
              </span>
            </Tip>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/**
 * Right, skipped, wrong — in that order, so the green and the red (which
 * red–green colour blindness cannot tell apart) never touch. Every segment is
 * also named, counted and iconed in the list below, so colour is never alone.
 */
export function AnswerSplit({ breakdown }: { breakdown: AnswerBreakdown }) {
  const total = breakdown.correct + breakdown.wrong + breakdown.skipped + breakdown.unmarked
  const pct = (value: number) => (total ? Math.round((value / total) * 100) : 0)
  const rows = [
    { key: 'correct', label: 'Correct', value: breakdown.correct, bar: 'bg-correct', icon: <CheckCircle size={18} weight="fill" className="text-correct" /> },
    { key: 'skipped', label: 'Skipped', value: breakdown.skipped, bar: 'bg-rule-strong', icon: <MinusCircle size={18} weight="fill" className="text-ink-faint" /> },
    { key: 'wrong', label: 'Wrong', value: breakdown.wrong, bar: 'bg-incorrect', icon: <XCircle size={18} weight="fill" className="text-incorrect" /> },
    { key: 'unmarked', label: 'Written, check yourself', value: breakdown.unmarked, bar: 'bg-review/40', icon: <PencilSimpleLine size={18} className="text-review" /> },
  ].filter((row) => row.key !== 'unmarked' || row.value > 0)

  const answered = breakdown.correct + breakdown.wrong
  const accuracy = answered ? Math.round((breakdown.correct / answered) * 100) : null

  return (
    <div>
      <p className="text-[2.25rem] leading-none font-light text-ink">
        {accuracy === null ? '—' : `${accuracy}%`}
      </p>
      <p className="mt-2 text-meta font-light text-ink-faint">of the questions you answered were right</p>

      <div className="mt-5 flex h-3 w-full gap-[2px]" aria-hidden="true">
        {rows
          .filter((row) => row.value > 0)
          .map((row, i, shown) => (
            <div
              key={row.key}
              className={`h-full ${row.bar} ${i === 0 ? 'rounded-l-[4px]' : ''} ${i === shown.length - 1 ? 'rounded-r-[4px]' : ''}`}
              style={{ flexGrow: row.value, flexBasis: 0 }}
            />
          ))}
      </div>

      <ul className="mt-5 flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-3 text-ui">
            {row.icon}
            <span className="min-w-0 flex-1 font-light text-ink">{row.label}</span>
            <span className="text-ink tabular-nums">{formatCount(row.value)}</span>
            <span className="w-11 text-right text-meta text-ink-faint tabular-nums">{pct(row.value)}%</span>
          </li>
        ))}
      </ul>

      {breakdown.timedAnswers > 0 ? (
        <p className="mt-5 border-t border-rule pt-4 text-meta font-light text-ink-faint">
          About <span className="text-ink">{formatDuration(breakdown.timeSpent / breakdown.timedAnswers)}</span> per question
        </p>
      ) : null}
    </div>
  )
}

const WEEKS = 52
const DAYS = ['Mon', '', 'Wed', '', 'Fri', '', '']
const RAMP = ['bg-surface-3', 'bg-[#c3d3fb]', 'bg-[#8aa9f2]', 'bg-[#4c77e6]', 'bg-accent']

/** Papers per day for the last year, one blue ramp — more is darker. */
export function ActivityCalendar({ days }: { days: Map<string, number> }) {
  // Columns are weeks ending with this one; rows run Monday to Sunday.
  const today = new Date(`${istDayKey(new Date())}T00:00:00Z`)
  const mondayOffset = (today.getUTCDay() + 6) % 7
  const start = new Date(today)
  start.setUTCDate(today.getUTCDate() - mondayOffset - (WEEKS - 1) * 7)

  const weeks: { key: string; count: number; label: string; future: boolean }[][] = []
  const months: { index: number; label: string }[] = []
  for (let w = 0; w < WEEKS; w++) {
    const week = []
    for (let d = 0; d < 7; d++) {
      const date = new Date(start)
      date.setUTCDate(start.getUTCDate() + w * 7 + d)
      const key = date.toISOString().slice(0, 10)
      // A month is labelled on its first week — unless the previous label is
      // too close, which happens when the calendar opens mid-month.
      const previous = months[months.length - 1]
      if (d === 0 && (w === 0 || date.getUTCDate() <= 7) && (!previous || w - previous.index >= 3)) {
        months.push({ index: w, label: date.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' }) })
      }
      week.push({
        key,
        count: days.get(key) ?? 0,
        label: formatShortDate(`${key}T06:00:00Z`),
        future: date > today,
      })
    }
    weeks.push(week)
  }

  const shade = (count: number) => RAMP[Math.min(count, RAMP.length - 1)]

  return (
    <div className="overflow-x-auto pb-1">
      <div className="inline-grid grid-cols-[auto_1fr] gap-x-2">
        <div />
        <div className="relative mb-1.5 h-4">
          {months.map((month) => (
            <span
              key={`${month.index}-${month.label}`}
              className="absolute text-[11px] text-ink-faint"
              style={{ left: month.index * 17 }}
            >
              {month.label}
            </span>
          ))}
        </div>
        <div className="grid grid-rows-7 gap-[3px] text-[11px] leading-[14px] text-ink-faint">
          {DAYS.map((day, i) => (
            <span key={i}>{day}</span>
          ))}
        </div>
        <div className="grid grid-flow-col grid-rows-7 gap-[3px]">
          {weeks.flat().map((cell) =>
            cell.future ? (
              <span key={cell.key} className="h-[14px] w-[14px]" />
            ) : (
              <span
                key={cell.key}
                tabIndex={0}
                className={`group relative h-[14px] w-[14px] rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ink ${shade(cell.count)}`}
                aria-label={`${cell.label}: ${cell.count} ${cell.count === 1 ? 'paper' : 'papers'}`}
              >
                <Tip>
                  <span className="tabular-nums">
                    {cell.count ? `${cell.count} ${cell.count === 1 ? 'paper' : 'papers'}` : 'No papers'}
                  </span>
                  <span className="block font-light text-ink-faint">{cell.label}</span>
                </Tip>
              </span>
            ),
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-faint">
        Less
        {RAMP.map((shadeClass) => (
          <span key={shadeClass} className={`h-[11px] w-[11px] rounded-[3px] ${shadeClass}`} />
        ))}
        More
      </div>
    </div>
  )
}
