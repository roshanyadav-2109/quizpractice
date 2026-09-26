import Link from 'next/link'
import type { QualityCounts } from '@/lib/queries'
import { formatCount } from '@/lib/format'

/** Right-and-quick to wrong-after-a-struggle: blue for right, warm for wrong, grey between. */
const ZONES = [
  { key: 'perfect', label: 'Mastered', short: 'Right, good pace', advice: 'Keep it up', color: '#1d4ed8', tint: 'bg-[#1d4ed8]/[0.07]' },
  { key: 'slow_correct', label: 'Right but slow', short: 'Right, took too long', advice: 'Practise for speed', color: '#8fb0f4', tint: 'bg-[#8fb0f4]/[0.14]' },
  { key: 'incorrect', label: 'Wrong, steady pace', short: 'Wrong at a normal pace', advice: '', color: '#d6d3d0', tint: '' },
  { key: 'rushed', label: 'Careless', short: 'Wrong, answered too fast', advice: 'Slow down and re-read', color: '#d98a1c', tint: 'bg-[#d98a1c]/[0.1]' },
  { key: 'sunk', label: 'Struggling', short: 'Wrong after a long time', advice: 'Revise the concept', color: '#b91c1c', tint: 'bg-[#b91c1c]/[0.07]' },
] as const

type ZoneKey = (typeof ZONES)[number]['key']

export interface SubjectQuality {
  slug: string
  name: string
  counts: QualityCounts
}

const zoneTotal = (counts: QualityCounts) => ZONES.reduce((sum, zone) => sum + (counts[zone.key] ?? 0), 0)

/**
 * Every answered question placed by two things at once: right or wrong, and
 * quick or slow against the time its marks allow (a minute a mark). The four
 * corners need different responses, which is the point of separating them.
 */
export function SpeedMap({
  overall,
  subjects,
  insights,
}: {
  overall: QualityCounts
  subjects: SubjectQuality[]
  insights: string[]
}) {
  const answered = zoneTotal(overall)
  const pct = (key: ZoneKey) => (answered ? Math.round(((overall[key] ?? 0) / answered) * 100) : 0)
  const corner = (key: ZoneKey) => ZONES.find((zone) => zone.key === key)!
  const grid: ZoneKey[] = ['perfect', 'slow_correct', 'rushed', 'sunk']

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* The map */}
      <div>
        <div className="grid grid-cols-[1.25rem_1fr_1fr] grid-rows-[auto_1fr_1fr] gap-2">
          <span />
          <span className="text-center text-meta text-ink-faint">Quick</span>
          <span className="text-center text-meta text-ink-faint">Slow</span>
          {grid.map((key, i) => {
            const zone = corner(key)
            return (
              <div key={key} className="contents">
                {i % 2 === 0 ? (
                  <span className="flex items-center justify-center text-meta text-ink-faint [writing-mode:vertical-rl] rotate-180">
                    {i === 0 ? 'Right' : 'Wrong'}
                  </span>
                ) : null}
                <div className={`rounded-[8px] border border-rule p-4 ${zone.tint}`}>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: zone.color }} aria-hidden="true" />
                    <span className="text-meta text-ink">{zone.label}</span>
                  </div>
                  <p className="mt-2 text-[1.75rem] leading-none font-light text-ink">{pct(key)}%</p>
                  <p className="mt-1.5 text-meta font-light text-ink-faint tabular-nums">
                    {formatCount(overall[key] ?? 0)} {overall[key] === 1 ? 'answer' : 'answers'}
                  </p>
                  <p className="mt-2 text-meta text-ink-muted">{zone.advice}</p>
                </div>
              </div>
            )
          })}
        </div>
        <p className="mt-3 text-meta font-light text-ink-faint">
          Plus {pct('incorrect')}% wrong at a steady pace
          {(overall.abandoned ?? 0) > 0 ? (
            <>
              {' '}· <span className="text-ink-muted">{formatCount(overall.abandoned ?? 0)}</span> left blank after real time spent
            </>
          ) : null}
          . Pace is judged against a minute per mark.
        </p>
      </div>

      {/* By subject, and what it means */}
      <div className="min-w-0">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {ZONES.map((zone) => (
            <span key={zone.key} className="flex items-center gap-1.5 text-meta text-ink-muted">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: zone.color }} aria-hidden="true" />
              {zone.label}
            </span>
          ))}
        </div>

        <ul className="mt-4 flex flex-col gap-3.5">
          {subjects.map((subject) => {
            const total = zoneTotal(subject.counts)
            const shown = ZONES.filter((zone) => (subject.counts[zone.key] ?? 0) > 0)
            return (
              <li key={subject.slug}>
                <Link href={`/subject/${subject.slug}`} className="group block outline-none">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-ui font-light text-ink group-hover:text-accent">{subject.name}</span>
                    <span className="shrink-0 text-meta text-ink-faint tabular-nums">{formatCount(total)} answered</span>
                  </div>
                  <div className="mt-1.5 flex h-2.5 gap-[2px]" role="img" aria-label={shown.map((zone) => `${zone.label} ${Math.round(((subject.counts[zone.key] ?? 0) / total) * 100)}%`).join(', ')}>
                    {shown.map((zone, i) => (
                      <span
                        key={zone.key}
                        title={`${zone.label}: ${subject.counts[zone.key]} (${Math.round(((subject.counts[zone.key] ?? 0) / total) * 100)}%)`}
                        className={`h-full ${i === 0 ? 'rounded-l-[4px]' : ''} ${i === shown.length - 1 ? 'rounded-r-[4px]' : ''}`}
                        style={{ flexGrow: subject.counts[zone.key], flexBasis: 0, background: zone.color }}
                      />
                    ))}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>

        {insights.length > 0 ? (
          <ul className="mt-6 flex flex-col gap-2.5 border-t border-rule pt-5">
            {insights.map((insight) => (
              <li key={insight} className="flex gap-3 text-ui font-light text-ink">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                {insight}
              </li>
            ))}
          </ul>
        ) : null}

        {answered === 0 ? <p className="mt-4 text-ui font-light text-ink-muted">Sit a timed paper to see this.</p> : null}
      </div>
    </div>
  )
}
