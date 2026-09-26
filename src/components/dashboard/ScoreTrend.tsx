'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

export interface TrendPoint {
  id: string
  percentage: number
  subject: string
  exam: string
  date: string
}

const HEIGHT = 240
const PAD = { top: 16, right: 20, bottom: 30, left: 36 }
const TICKS = [0, 25, 50, 75, 100]

/**
 * Score per paper, oldest to newest, on a fixed 0–100 scale so a good run
 * looks like one. One series, so no legend; the newest point carries its
 * value, and hovering anywhere shows the nearest paper.
 */
export function ScoreTrend({ points }: { points: TrendPoint[] }) {
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

  const innerW = Math.max(0, width - PAD.left - PAD.right)
  const innerH = HEIGHT - PAD.top - PAD.bottom
  const step = points.length > 1 ? innerW / (points.length - 1) : 0
  const x = (i: number) => PAD.left + (points.length > 1 ? i * step : innerW / 2)
  const y = (pct: number) => PAD.top + innerH - (pct / 100) * innerH

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.percentage).toFixed(1)}`).join('')
  const area = points.length
    ? `${line}L${x(points.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`
    : ''

  function onMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!points.length) return
    const box = event.currentTarget.getBoundingClientRect()
    const px = event.clientX - box.left
    const i = step ? Math.round((px - PAD.left) / step) : 0
    setActive(Math.min(points.length - 1, Math.max(0, i)))
  }

  const last = points.length - 1
  const hovered = active !== null ? points[active] : null
  const tipLeft = active !== null ? Math.min(Math.max(x(active), 90), width - 90) : 0

  return (
    <div ref={frame} className="relative w-full" style={{ height: HEIGHT }}>
      {width > 0 ? (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`Score on your last ${points.length} papers`}
          onPointerMove={onMove}
          onPointerLeave={() => setActive(null)}
          className="block touch-none select-none"
        >
          {TICKS.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--color-rule)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-ink-faint text-[11px] tabular-nums">
                {tick}
              </text>
            </g>
          ))}

          <path d={area} fill="var(--color-accent)" fillOpacity={0.08} />
          <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {hovered && active !== null ? (
            <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={y(0)} stroke="var(--color-rule-strong)" strokeWidth={1} />
          ) : null}

          {points.map((p, i) => (
            <circle
              key={p.id}
              cx={x(i)}
              cy={y(p.percentage)}
              r={i === active || i === last ? 5 : 4}
              fill="var(--color-accent)"
              stroke="var(--color-surface)"
              strokeWidth={2}
            />
          ))}

          {active === null && last >= 0 ? (
            <text
              x={Math.min(x(last), width - PAD.right)}
              y={y(points[last].percentage) - 12}
              textAnchor={points.length > 1 ? 'end' : 'middle'}
              className="fill-ink text-[12px] tabular-nums"
            >
              {points[last].percentage}%
            </text>
          ) : null}

          {points.length > 1 ? (
            <>
              <text x={x(0)} y={HEIGHT - 8} className="fill-ink-faint text-[11px]">
                {points[0].date}
              </text>
              <text x={x(last)} y={HEIGHT - 8} textAnchor="end" className="fill-ink-faint text-[11px]">
                {points[last].date}
              </text>
            </>
          ) : null}
        </svg>
      ) : null}

      {hovered ? (
        <div
          className="pointer-events-none absolute top-0 z-10 w-[180px] -translate-x-1/2 rounded-control border border-rule bg-surface px-3 py-2 shadow-[0_6px_20px_-8px_rgba(12,10,9,.25)]"
          style={{ left: tipLeft }}
        >
          <p className="truncate text-meta text-ink">{hovered.subject}</p>
          <p className="truncate text-[0.75rem] font-light text-ink-faint">
            {hovered.exam} · {hovered.date}
          </p>
          <p className="mt-1 text-ui text-ink tabular-nums">{hovered.percentage}%</p>
        </div>
      ) : null}

      <ol className="sr-only">
        {points.map((p) => (
          <li key={p.id}>
            <Link href={`/result/${p.id}`}>
              {p.subject}, {p.exam}, {p.date}: {p.percentage}%
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}
