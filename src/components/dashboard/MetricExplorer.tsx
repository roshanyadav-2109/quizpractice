'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { formatDuration } from '@/lib/format'

export type MetricKey = 'score' | 'accuracy' | 'attemptRate' | 'secPerQ'

export interface PaperPoint {
  id: string
  date: string
  subject: string
  exam: string
  score: number | null
  accuracy: number | null
  attemptRate: number | null
  secPerQ: number | null
}

export interface MetricSummary {
  value: number | null
  /** Recent papers minus the ones before them, in the metric's own unit. */
  delta: number | null
}

const METRICS: Record<
  MetricKey,
  { label: string; note: string; percent: boolean; better: 'up' | 'down' }
> = {
  score: { label: 'Average score', note: 'Score on each paper', percent: true, better: 'up' },
  accuracy: { label: 'Accuracy', note: 'Share of answered questions you got right', percent: true, better: 'up' },
  attemptRate: { label: 'Questions attempted', note: 'Share of each paper you answered', percent: true, better: 'up' },
  secPerQ: { label: 'Time per question', note: 'Average time you spent on a question', percent: false, better: 'down' },
}
const ORDER: MetricKey[] = ['score', 'accuracy', 'attemptRate', 'secPerQ']

const show = (key: MetricKey, value: number) => (METRICS[key].percent ? `${Math.round(value)}%` : formatDuration(value))

/**
 * Four headline figures that double as tabs: pick one and the chart below
 * shows it paper by paper. Each carries its change — recent papers against
 * the ones before — with an arrow that is green when the change is good
 * (a higher score, or less time per question) and red when it is not.
 */
export function MetricExplorer({
  points,
  summary,
}: {
  points: PaperPoint[]
  summary: Record<MetricKey, MetricSummary>
}) {
  const [metric, setMetric] = useState<MetricKey>('score')
  const series = points.filter((p) => p[metric] !== null).map((p) => ({ ...p, value: p[metric] as number }))

  return (
    <div>
      <div role="tablist" aria-label="Metric" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {ORDER.map((key) => {
          const { value, delta } = summary[key]
          const selected = key === metric
          const good = delta === null || delta === 0 ? null : METRICS[key].better === 'up' ? delta > 0 : delta < 0
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setMetric(key)}
              className={`rounded-[8px] border px-4 py-3 text-left transition-colors ${
                selected ? 'border-accent bg-accent-soft' : 'border-rule bg-surface hover:border-rule-strong'
              }`}
            >
              <span className={`block text-meta ${selected ? 'text-accent' : 'text-ink-muted'}`}>{METRICS[key].label}</span>
              <span className="mt-1 flex items-center gap-2">
                <span className="text-[1.5rem] leading-tight font-normal text-ink">
                  {value === null ? '—' : show(key, value)}
                </span>
                {delta !== null && Math.round(delta) !== 0 ? (
                  <span
                    className={`inline-flex items-center gap-0.5 text-meta tabular-nums ${
                      good === null ? 'text-ink-faint' : good ? 'text-correct' : 'text-incorrect'
                    }`}
                    title="Your recent papers compared with the ones before"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                      <path d={delta > 0 ? 'M5 1.5 9 8.5H1z' : 'M5 8.5 1 1.5h8z'} fill="currentColor" />
                    </svg>
                    {METRICS[key].percent ? `${Math.abs(Math.round(delta))}` : formatDuration(Math.abs(delta))}
                    <span className="sr-only">{delta > 0 ? 'up' : 'down'} on your earlier papers</span>
                  </span>
                ) : null}
              </span>
            </button>
          )
        })}
      </div>

      <p className="mt-5 text-meta font-light text-ink-faint">
        {METRICS[metric].note} · last {series.length} {series.length === 1 ? 'paper' : 'papers'}, oldest to newest
      </p>

      <div className="mt-2">
        {series.length >= 2 ? (
          <TrendChart key={metric} metric={metric} series={series} />
        ) : (
          <div className="flex h-[250px] flex-col items-center justify-center rounded-control bg-surface-2 text-center">
            <p className="text-ui text-ink">
              {series.length === 1 ? `${show(metric, series[0].value)} on your first paper` : 'Nothing to chart yet'}
            </p>
            <p className="mt-1 text-meta font-light text-ink-faint">Sit one more paper to see the trend.</p>
          </div>
        )}
      </div>
    </div>
  )
}

const HEIGHT = 250
const PAD = { top: 18, right: 22, bottom: 30, left: 44 }

function niceMax(value: number): number {
  const steps = [30, 60, 120, 180, 300, 600, 900, 1200, 1800, 3600]
  return steps.find((step) => step >= value) ?? Math.ceil(value / 3600) * 3600
}

function TrendChart({ metric, series }: { metric: MetricKey; series: (PaperPoint & { value: number })[] }) {
  const frame = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [active, setActive] = useState<number | null>(null)

  useEffect(() => {
    const node = frame.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const percent = METRICS[metric].percent
  const max = percent ? 100 : niceMax(Math.max(...series.map((p) => p.value)))
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max)
  const innerW = Math.max(0, width - PAD.left - PAD.right)
  const innerH = HEIGHT - PAD.top - PAD.bottom
  const step = innerW / (series.length - 1)
  const x = (i: number) => PAD.left + i * step
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH

  const line = series.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('')
  const area = `${line}L${x(series.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`
  const last = series.length - 1
  const hovered = active !== null ? series[active] : null
  const tipLeft = active !== null ? Math.min(Math.max(x(active), 95), width - 95) : 0

  return (
    <div ref={frame} className="relative w-full" style={{ height: HEIGHT }}>
      {width > 0 ? (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`${METRICS[metric].label} on your last ${series.length} papers`}
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect()
            const i = Math.round((event.clientX - box.left - PAD.left) / step)
            setActive(Math.min(last, Math.max(0, i)))
          }}
          onPointerLeave={() => setActive(null)}
          className="block touch-none select-none"
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--color-rule)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-ink-faint text-[11px] tabular-nums">
                {percent ? Math.round(tick) : formatDuration(tick)}
              </text>
            </g>
          ))}

          <path d={area} fill="var(--color-accent)" fillOpacity={0.08} />
          <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {active !== null ? (
            <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={y(0)} stroke="var(--color-rule-strong)" strokeWidth={1} />
          ) : null}

          {series.map((p, i) => (
            <circle
              key={p.id}
              cx={x(i)}
              cy={y(p.value)}
              r={i === active || i === last ? 5 : 4}
              fill="var(--color-accent)"
              stroke="var(--color-surface)"
              strokeWidth={2}
            />
          ))}

          {active === null ? (
            <text x={Math.min(x(last), width - PAD.right)} y={y(series[last].value) - 12} textAnchor="end" className="fill-ink text-[12px] tabular-nums">
              {show(metric, series[last].value)}
            </text>
          ) : null}

          <text x={x(0)} y={HEIGHT - 8} className="fill-ink-faint text-[11px]">
            {series[0].date}
          </text>
          <text x={x(last)} y={HEIGHT - 8} textAnchor="end" className="fill-ink-faint text-[11px]">
            {series[last].date}
          </text>
        </svg>
      ) : null}

      {hovered ? (
        <div
          className="pointer-events-none absolute top-0 z-10 w-[190px] -translate-x-1/2 rounded-control border border-rule bg-surface px-3 py-2 shadow-[0_6px_20px_-8px_rgba(12,10,9,.25)]"
          style={{ left: tipLeft }}
        >
          <p className="truncate text-meta text-ink">{hovered.subject}</p>
          <p className="truncate text-[0.75rem] font-light text-ink-faint">
            {hovered.exam} · {hovered.date}
          </p>
          <p className="mt-1 text-ui text-ink tabular-nums">{show(metric, hovered.value)}</p>
        </div>
      ) : null}

      <ol className="sr-only">
        {series.map((p) => (
          <li key={p.id}>
            <Link href={`/result/${p.id}`}>
              {p.subject}, {p.exam}, {p.date}: {show(metric, p.value)}
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}
