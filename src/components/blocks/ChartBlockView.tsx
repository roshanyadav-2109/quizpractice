import type { ChartBlock } from '@/lib/blocks/schema'
import { FigureCaption } from './BlockRenderer'

/**
 * Plots for Statistics, BDM and Business Analytics questions.
 *
 * Categorical colours are assigned in a fixed order and never cycled, marks are
 * thin, grid and axes stay recessive, and text takes ink tokens rather than the
 * series colour. Every chart also exposes its numbers as a table, which is both
 * the accessibility path and the relief for series colours that sit below 3:1
 * against the surface.
 */

const WIDTH = 660
const HEIGHT = 300
const PAD = { top: 16, right: 18, bottom: 44, left: 56 }
const PLOT_WIDTH = WIDTH - PAD.left - PAD.right
const PLOT_HEIGHT = HEIGHT - PAD.top - PAD.bottom
const MAX_SERIES = 8

function seriesColor(index: number): string {
  return `var(--series-${(index % MAX_SERIES) + 1})`
}

export function ChartBlockView({ block }: { block: ChartBlock }) {
  const series = block.series.slice(0, MAX_SERIES)
  const categories =
    block.categories ??
    Array.from({ length: Math.max(...series.map((s) => s.values.length)) }, (_, i) => i + 1)

  return (
    <figure className="my-1">
      <div className="overflow-x-auto border border-rule bg-surface p-2.5">
        {series.length > 1 ? <Legend series={series} /> : null}

        {block.kind === 'pie' ? (
          <PieChart block={block} categories={categories} />
        ) : block.kind === 'box' ? (
          <BoxChart block={block} series={series} />
        ) : (
          <CartesianChart block={block} series={series} categories={categories} />
        )}
      </div>

      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-ink-muted hover:text-ink">
          View the data as a table
        </summary>
        <div className="mt-1.5 overflow-x-auto border border-rule">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-surface-2">
                <th className="border-b border-rule px-2 py-1 text-left">
                  {block.x_label ?? 'Category'}
                </th>
                {series.map((s, index) => (
                  <th
                    key={index}
                    className="border-b border-rule px-2 py-1 text-right"
                  >
                    {s.name ?? `Series ${index + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((category, rowIndex) => (
                <tr key={rowIndex}>
                  <td className="border-t border-rule px-2 py-1">{String(category)}</td>
                  {series.map((s, index) => (
                    <td
                      key={index}
                      className="border-t border-rule px-2 py-1 text-right tabular-nums"
                    >
                      {s.values[rowIndex] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <FigureCaption>{block.caption}</FigureCaption>
    </figure>
  )
}

function Legend({ series }: { series: ChartBlock['series'] }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
      {series.map((s, index) => (
        <li key={index} className="flex items-center gap-1.5 text-xs text-ink-muted">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: seriesColor(index) }}
          />
          {s.name ?? `Series ${index + 1}`}
        </li>
      ))}
    </ul>
  )
}

function CartesianChart({
  block,
  series,
  categories,
}: {
  block: ChartBlock
  series: ChartBlock['series']
  categories: (string | number)[]
}) {
  const allValues = series.flatMap((s) => s.values.filter((v): v is number => v !== null))
  const dataMax = allValues.length ? Math.max(...allValues) : 1
  const dataMin = allValues.length ? Math.min(...allValues, 0) : 0

  const ticks = niceTicks(dataMin, dataMax)
  const yMin = ticks[0]
  const yMax = ticks[ticks.length - 1]
  const yScale = (value: number) =>
    PAD.top + PLOT_HEIGHT - ((value - yMin) / (yMax - yMin || 1)) * PLOT_HEIGHT

  const slotWidth = PLOT_WIDTH / categories.length
  const centerOf = (index: number) => PAD.left + slotWidth * (index + 0.5)

  const isBar = block.kind === 'bar' || block.kind === 'histogram'
  const barGap = block.kind === 'histogram' ? 0 : 2
  const groupWidth = slotWidth * (block.kind === 'histogram' ? 1 : 0.7)
  const barWidth = Math.max(2, groupWidth / series.length - barGap)

  // Direct labels only when the chart is sparse enough to stay readable.
  const labelPoints = categories.length * series.length <= 12

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      role="img"
      aria-label={chartSummary(block)}
      className="h-auto w-full max-w-full"
    >
      {/* Grid and axes stay recessive — they orient, they do not compete. */}
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={PAD.left}
            y1={yScale(tick)}
            x2={PAD.left + PLOT_WIDTH}
            y2={yScale(tick)}
            stroke="var(--rule)"
            strokeWidth={1}
          />
          <text
            x={PAD.left - 8}
            y={yScale(tick)}
            textAnchor="end"
            dominantBaseline="central"
            fill="var(--ink-muted)"
            fontSize={11}
            className="tabular-nums"
          >
            {formatTick(tick)}
          </text>
        </g>
      ))}

      <line
        x1={PAD.left}
        y1={yScale(Math.max(yMin, 0))}
        x2={PAD.left + PLOT_WIDTH}
        y2={yScale(Math.max(yMin, 0))}
        stroke="var(--rule-strong)"
        strokeWidth={1}
      />

      {categories.map((category, index) => (
        <text
          key={index}
          x={centerOf(index)}
          y={PAD.top + PLOT_HEIGHT + 16}
          textAnchor="middle"
          fill="var(--ink-muted)"
          fontSize={11}
        >
          {truncate(String(category), Math.floor(slotWidth / 6.5))}
        </text>
      ))}

      {isBar
        ? series.map((s, seriesIndex) =>
            s.values.map((value, index) => {
              if (value === null) return null
              const baseline = yScale(Math.max(yMin, 0))
              const top = yScale(value)
              const groupLeft = centerOf(index) - groupWidth / 2
              const x = groupLeft + seriesIndex * (barWidth + barGap)
              const height = Math.abs(baseline - top)
              return (
                <rect
                  key={`${seriesIndex}-${index}`}
                  x={x}
                  y={Math.min(top, baseline)}
                  width={barWidth}
                  height={Math.max(1, height)}
                  rx={Math.min(4, barWidth / 2)}
                  fill={seriesColor(seriesIndex)}
                />
              )
            }),
          )
        : null}

      {block.kind === 'line'
        ? series.map((s, seriesIndex) => {
            const points = s.values
              .map((value, index) =>
                value === null ? null : `${centerOf(index)},${yScale(value)}`,
              )
              .filter((point): point is string => point !== null)
            return (
              <g key={seriesIndex}>
                <polyline
                  points={points.join(' ')}
                  fill="none"
                  stroke={seriesColor(seriesIndex)}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {s.values.map((value, index) =>
                  value === null ? null : (
                    <circle
                      key={index}
                      cx={centerOf(index)}
                      cy={yScale(value)}
                      r={4}
                      fill={seriesColor(seriesIndex)}
                      stroke="var(--surface)"
                      strokeWidth={2}
                    />
                  ),
                )}
              </g>
            )
          })
        : null}

      {block.kind === 'scatter'
        ? series.map((s, seriesIndex) =>
            s.values.map((value, index) =>
              value === null ? null : (
                <circle
                  key={`${seriesIndex}-${index}`}
                  cx={centerOf(index)}
                  cy={yScale(value)}
                  r={4.5}
                  fill={seriesColor(seriesIndex)}
                  stroke="var(--surface)"
                  strokeWidth={2}
                />
              ),
            ),
          )
        : null}

      {labelPoints
        ? series.map((s, seriesIndex) =>
            s.values.map((value, index) => {
              if (value === null) return null
              const x = isBar
                ? centerOf(index) -
                  groupWidth / 2 +
                  seriesIndex * (barWidth + barGap) +
                  barWidth / 2
                : centerOf(index)
              return (
                <text
                  key={`label-${seriesIndex}-${index}`}
                  x={x}
                  y={yScale(value) - 7}
                  textAnchor="middle"
                  fill="var(--ink-muted)"
                  fontSize={10}
                  className="tabular-nums"
                >
                  {formatTick(value)}
                </text>
              )
            }),
          )
        : null}

      {block.y_label ? (
        <text
          x={12}
          y={PAD.top + PLOT_HEIGHT / 2}
          textAnchor="middle"
          fill="var(--ink-muted)"
          fontSize={11}
          transform={`rotate(-90 12 ${PAD.top + PLOT_HEIGHT / 2})`}
        >
          {block.y_label}
        </text>
      ) : null}
      {block.x_label ? (
        <text
          x={PAD.left + PLOT_WIDTH / 2}
          y={HEIGHT - 6}
          textAnchor="middle"
          fill="var(--ink-muted)"
          fontSize={11}
        >
          {block.x_label}
        </text>
      ) : null}
    </svg>
  )
}

function PieChart({
  block,
  categories,
}: {
  block: ChartBlock
  categories: (string | number)[]
}) {
  const values = block.series[0].values.map((value) => value ?? 0)
  const total = values.reduce((sum, value) => sum + value, 0) || 1
  const radius = 110
  const cx = WIDTH / 2
  const cy = HEIGHT / 2

  const slices = pieSlices(values, total)

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      role="img"
      aria-label={chartSummary(block)}
      className="h-auto w-full max-w-full"
    >
      {slices.map(({ value, start, end, sweep }, index) => {
        const x1 = cx + Math.cos(start) * radius
        const y1 = cy + Math.sin(start) * radius
        const x2 = cx + Math.cos(end) * radius
        const y2 = cy + Math.sin(end) * radius
        const largeArc = sweep > Math.PI ? 1 : 0

        const mid = start + sweep / 2
        const labelX = cx + Math.cos(mid) * (radius + 28)
        const labelY = cy + Math.sin(mid) * (radius + 28)

        return (
          <g key={index}>
            <path
              d={`M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`}
              fill={seriesColor(index)}
              stroke="var(--surface)"
              strokeWidth={2}
            />
            {value / total > 0.04 ? (
              <text
                x={labelX}
                y={labelY}
                textAnchor={Math.cos(mid) >= 0 ? 'start' : 'end'}
                dominantBaseline="central"
                fill="var(--ink-muted)"
                fontSize={11}
              >
                {truncate(String(categories[index] ?? index + 1), 14)}{' '}
                <tspan className="tabular-nums">
                  {Math.round((value / total) * 100)}%
                </tspan>
              </text>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}

function BoxChart({
  block,
  series,
}: {
  block: ChartBlock
  series: ChartBlock['series']
}) {
  const summaries = series.map((s) => fiveNumber(s.values.filter((v): v is number => v !== null)))
  const allValues = summaries.flatMap((s) => [s.min, s.max])
  const ticks = niceTicks(Math.min(...allValues), Math.max(...allValues))
  const yMin = ticks[0]
  const yMax = ticks[ticks.length - 1]
  const yScale = (value: number) =>
    PAD.top + PLOT_HEIGHT - ((value - yMin) / (yMax - yMin || 1)) * PLOT_HEIGHT

  const slotWidth = PLOT_WIDTH / series.length
  const boxWidth = Math.min(70, slotWidth * 0.45)

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      role="img"
      aria-label={chartSummary(block)}
      className="h-auto w-full max-w-full"
    >
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={PAD.left}
            y1={yScale(tick)}
            x2={PAD.left + PLOT_WIDTH}
            y2={yScale(tick)}
            stroke="var(--rule)"
            strokeWidth={1}
          />
          <text
            x={PAD.left - 8}
            y={yScale(tick)}
            textAnchor="end"
            dominantBaseline="central"
            fill="var(--ink-muted)"
            fontSize={11}
            className="tabular-nums"
          >
            {formatTick(tick)}
          </text>
        </g>
      ))}

      {summaries.map((summary, index) => {
        const cx = PAD.left + slotWidth * (index + 0.5)
        return (
          <g key={index}>
            <line
              x1={cx}
              y1={yScale(summary.min)}
              x2={cx}
              y2={yScale(summary.max)}
              stroke="var(--ink-muted)"
              strokeWidth={1.5}
            />
            <rect
              x={cx - boxWidth / 2}
              y={yScale(summary.q3)}
              width={boxWidth}
              height={Math.max(2, yScale(summary.q1) - yScale(summary.q3))}
              rx={3}
              fill={seriesColor(index)}
              fillOpacity={0.35}
              stroke={seriesColor(index)}
              strokeWidth={2}
            />
            <line
              x1={cx - boxWidth / 2}
              y1={yScale(summary.median)}
              x2={cx + boxWidth / 2}
              y2={yScale(summary.median)}
              stroke={seriesColor(index)}
              strokeWidth={2.5}
            />
            <text
              x={cx}
              y={PAD.top + PLOT_HEIGHT + 16}
              textAnchor="middle"
              fill="var(--ink-muted)"
              fontSize={11}
            >
              {series[index].name ?? `Series ${index + 1}`}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/**
 * Cumulative slice angles, computed before render rather than by advancing a
 * variable inside the JSX map — a mutation across renders that React's compiler
 * rightly rejects.
 */
function pieSlices(values: number[], total: number) {
  const slices: { value: number; start: number; end: number; sweep: number }[] = []
  // Start at twelve o'clock and go clockwise, as these are drawn by hand.
  let angle = -Math.PI / 2

  for (const value of values) {
    const sweep = (value / total) * Math.PI * 2
    slices.push({ value, start: angle, end: angle + sweep, sweep })
    angle += sweep
  }
  return slices
}

function fiveNumber(values: number[]) {
  if (!values.length) return { min: 0, q1: 0, median: 0, q3: 0, max: 0 }
  const sorted = [...values].sort((a, b) => a - b)
  const at = (fraction: number) => {
    const position = (sorted.length - 1) * fraction
    const lower = Math.floor(position)
    const upper = Math.ceil(position)
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
  }
  return {
    min: sorted[0],
    q1: at(0.25),
    median: at(0.5),
    q3: at(0.75),
    max: sorted[sorted.length - 1],
  }
}

/** Axis ticks on round numbers, always including a value the data reaches. */
function niceTicks(min: number, max: number, target = 5): number[] {
  if (min === max) {
    return min === 0 ? [0, 1] : [Math.min(0, min), Math.max(0, max)]
  }
  const range = max - min
  const rawStep = range / target
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const normalized = rawStep / magnitude
  const step =
    (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude

  const start = Math.floor(min / step) * step
  const end = Math.ceil(max / step) * step

  const ticks: number[] = []
  for (let value = start; value <= end + step / 2; value += step) {
    ticks.push(Number(value.toFixed(10)))
  }
  return ticks
}

function formatTick(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return String(Number(value.toFixed(2)))
}

function truncate(text: string, max: number): string {
  if (max < 3 || text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

function chartSummary(block: ChartBlock): string {
  const names = block.series.map((s, i) => s.name ?? `series ${i + 1}`).join(', ')
  return `${block.kind} chart${block.caption ? `: ${block.caption}` : ''}. Series: ${names}. The underlying values are available in the table below the chart.`
}
