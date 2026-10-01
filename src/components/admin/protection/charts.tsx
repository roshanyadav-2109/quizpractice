import type { Overview } from '@/lib/protection'

/** Server-rendered SVG charts: no library, so nothing to load in the browser. */

const W = 640
const H = 150
const PAD = { l: 32, r: 8, t: 10, b: 22 }

function scale(max: number) {
  const top = Math.max(max, 1)
  return (value: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - value / top)
}

/** Papers opened (bars) and decisions by the defence (lines), by hour, for the last day. */
export function DayChart({ series }: { series: Overview['series'] }) {
  const max = Math.max(...series.map((point) => point.opens), ...series.map((point) => point.refused + point.would + point.flagged), 1)
  const y = scale(max)
  const step = (W - PAD.l - PAD.r) / series.length
  const line = (pick: (point: Overview['series'][number]) => number) =>
    series.map((point, index) => `${index === 0 ? 'M' : 'L'}${(PAD.l + step * (index + 0.5)).toFixed(1)},${y(pick(point)).toFixed(1)}`).join(' ')
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Papers opened and decisions by the protection, by hour, last 24 hours">
        {[0, 0.5, 1].map((fraction) => (
          <g key={fraction}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(max * fraction)} y2={y(max * fraction)} className="stroke-rule" strokeWidth="1" />
            <text x={PAD.l - 4} y={y(max * fraction) + 3} textAnchor="end" className="fill-ink-faint" fontSize="9">
              {Math.round(max * fraction)}
            </text>
          </g>
        ))}
        {series.map((point, index) => (
          <rect key={point.h} x={PAD.l + step * index + 1} y={y(point.opens)} width={Math.max(step - 2, 1)} height={H - PAD.b - y(point.opens)} className="fill-accent" opacity="0.35">
            <title>{`${new Date(point.h).toLocaleString('en-GB')}: ${point.opens} papers, ${point.refused} refused or slowed, ${point.would} would-have, ${point.flagged} flagged, ${point.banned} banned`}</title>
          </rect>
        ))}
        <path d={line((point) => point.refused)} fill="none" className="stroke-incorrect" strokeWidth="1.5" />
        <path d={line((point) => point.would)} fill="none" className="stroke-ink-muted" strokeWidth="1.5" strokeDasharray="3 2" />
        <path d={line((point) => point.flagged + point.banned)} fill="none" className="stroke-correct" strokeWidth="1.5" />
        {series.map((point, index) =>
          index % 4 === 0 ? (
            <text key={point.h} x={PAD.l + step * (index + 0.5)} y={H - 6} textAnchor="middle" className="fill-ink-faint" fontSize="9">
              {new Date(point.h).getHours()}:00
            </text>
          ) : null,
        )}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-4 text-xs text-ink-muted">
        <span><span className="mr-1 inline-block h-2 w-3 bg-accent opacity-35" />Papers opened</span>
        <span><span className="mr-1 inline-block h-0.5 w-3 bg-incorrect align-middle" />Refused or slowed</span>
        <span><span className="mr-1 inline-block h-0.5 w-3 bg-ink-muted align-middle" />Would have (watch)</span>
        <span><span className="mr-1 inline-block h-0.5 w-3 bg-correct align-middle" />Flagged or banned</span>
      </figcaption>
    </figure>
  )
}

/** The last 60 minutes, minute by minute. */
export function MinuteChart({ minutes }: { minutes: { m: string; opens: number; decisions: number }[] }) {
  const max = Math.max(...minutes.map((point) => Math.max(point.opens, point.decisions)), 1)
  const y = scale(max)
  const step = (W - PAD.l - PAD.r) / minutes.length
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Papers opened and decisions by minute, last hour">
        {[0, 0.5, 1].map((fraction) => (
          <g key={fraction}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(max * fraction)} y2={y(max * fraction)} className="stroke-rule" strokeWidth="1" />
            <text x={PAD.l - 4} y={y(max * fraction) + 3} textAnchor="end" className="fill-ink-faint" fontSize="9">
              {Math.round(max * fraction)}
            </text>
          </g>
        ))}
        {minutes.map((point, index) => (
          <g key={point.m}>
            <rect x={PAD.l + step * index + 0.5} y={y(point.opens)} width={Math.max(step - 1, 1)} height={H - PAD.b - y(point.opens)} className="fill-accent" opacity="0.5">
              <title>{`${new Date(point.m).toLocaleTimeString('en-GB')}: ${point.opens} papers, ${point.decisions} decisions`}</title>
            </rect>
            {point.decisions > 0 ? <circle cx={PAD.l + step * (index + 0.5)} cy={y(point.decisions)} r="2.5" className="fill-incorrect" /> : null}
          </g>
        ))}
        {minutes.map((point, index) =>
          index % 10 === 0 ? (
            <text key={point.m} x={PAD.l + step * (index + 0.5)} y={H - 6} textAnchor="middle" className="fill-ink-faint" fontSize="9">
              {new Date(point.m).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </text>
          ) : null,
        )}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-4 text-xs text-ink-muted">
        <span><span className="mr-1 inline-block h-2 w-3 bg-accent opacity-50" />Papers opened per minute</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-incorrect" />Decisions (refused, slowed, flagged, banned, would-have)</span>
      </figcaption>
    </figure>
  )
}
