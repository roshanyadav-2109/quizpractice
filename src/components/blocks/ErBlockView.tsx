import type { ErBlock } from '@/lib/blocks/schema'
import { FigureCaption } from './BlockRenderer'

/**
 * Entity-relationship diagram, drawn from structure.
 *
 * The layout is deterministic — no physics, no randomness — so the server and
 * the client produce identical SVG and the diagram never jumps on hydration.
 * Notation follows what IITM papers use: primary keys underlined, partial keys
 * underlined with a dash, weak entities double-bordered, cardinality on the
 * connectors and a double line for total participation.
 */

const PADDING = 12
const HEADER_HEIGHT = 28
const LINE_HEIGHT = 19
const COLUMN_GAP = 150
const ROW_GAP = 96
const MARGIN = 28
const MIN_BOX_WIDTH = 132

interface PlacedEntity {
  name: string
  weak: boolean
  attributes: NonNullable<ErBlock['entities'][number]['attributes']>
  x: number
  y: number
  width: number
  height: number
}

function textWidth(text: string, charWidth = 6.6): number {
  return text.length * charWidth
}

function attributeLabel(attribute: {
  name: string
  derived?: boolean
  multivalued?: boolean
}): string {
  const prefix = attribute.derived ? '/' : ''
  const suffix = attribute.multivalued ? ' { }' : ''
  return `${prefix}${attribute.name}${suffix}`
}

export function ErBlockView({ block }: { block: ErBlock }) {
  const entities = block.entities
  const columns = entities.length <= 2 ? entities.length : entities.length <= 4 ? 2 : 3

  // Size every box to its content first, then lay the boxes out on a grid.
  const sized = entities.map((entity) => {
    const attributes = entity.attributes ?? []
    const widest = Math.max(
      textWidth(entity.name, 7.4),
      ...attributes.map((a) => textWidth(attributeLabel(a))),
      0,
    )
    return {
      name: entity.name,
      weak: Boolean(entity.weak),
      attributes,
      width: Math.max(MIN_BOX_WIDTH, Math.ceil(widest) + PADDING * 2),
      height: HEADER_HEIGHT + attributes.length * LINE_HEIGHT + PADDING,
    }
  })

  const rows: (typeof sized)[] = []
  for (let index = 0; index < sized.length; index += columns) {
    rows.push(sized.slice(index, index + columns))
  }

  const rowWidths = rows.map(
    (row) => row.reduce((sum, box) => sum + box.width, 0) + COLUMN_GAP * (row.length - 1),
  )
  const canvasWidth = Math.max(...rowWidths) + MARGIN * 2

  const placed: PlacedEntity[] = []
  let cursorY = MARGIN
  rows.forEach((row, rowIndex) => {
    let cursorX = MARGIN + (Math.max(...rowWidths) - rowWidths[rowIndex]) / 2
    const rowHeight = Math.max(...row.map((box) => box.height))
    for (const box of row) {
      placed.push({ ...box, x: cursorX, y: cursorY })
      cursorX += box.width + COLUMN_GAP
    }
    cursorY += rowHeight + ROW_GAP
  })

  const canvasHeight = cursorY - ROW_GAP + MARGIN
  const byName = new Map(placed.map((entity) => [entity.name, entity]))

  const relationships = (block.relationships ?? []).flatMap((relationship) => {
    const from = byName.get(relationship.from)
    const to = byName.get(relationship.to)
    if (!from || !to) return []
    return [{ relationship, from, to }]
  })

  return (
    <figure className="my-1">
      <div className="overflow-x-auto border border-rule bg-surface p-2">
        <svg
          viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
          width={canvasWidth}
          height={canvasHeight}
          role="img"
          aria-label={erSummary(block)}
          className="mx-auto h-auto max-w-full"
        >
          <g>
            {relationships.map(({ relationship, from, to }, index) => (
              <Connector
                key={index}
                relationship={relationship}
                from={from}
                to={to}
              />
            ))}
          </g>
          <g>
            {placed.map((entity) => (
              <EntityBox key={entity.name} entity={entity} />
            ))}
          </g>
        </svg>
      </div>
      <FigureCaption>{block.caption}</FigureCaption>
    </figure>
  )
}

function EntityBox({ entity }: { entity: PlacedEntity }) {
  return (
    <g>
      {entity.weak ? (
        <rect
          x={entity.x - 4}
          y={entity.y - 4}
          width={entity.width + 8}
          height={entity.height + 8}
          rx={5}
          fill="none"
          stroke="var(--rule-strong)"
          strokeWidth={1}
        />
      ) : null}

      <rect
        x={entity.x}
        y={entity.y}
        width={entity.width}
        height={entity.height}
        rx={4}
        fill="var(--surface)"
        stroke="var(--ink)"
        strokeWidth={1.5}
      />
      <rect
        x={entity.x}
        y={entity.y}
        width={entity.width}
        height={HEADER_HEIGHT}
        rx={4}
        fill="var(--accent-soft)"
      />
      <line
        x1={entity.x}
        y1={entity.y + HEADER_HEIGHT}
        x2={entity.x + entity.width}
        y2={entity.y + HEADER_HEIGHT}
        stroke="var(--ink)"
        strokeWidth={1.5}
      />
      <text
        x={entity.x + entity.width / 2}
        y={entity.y + HEADER_HEIGHT / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--ink)"
        fontSize={13}
        fontWeight={600}
      >
        {entity.name}
      </text>

      {entity.attributes.map((attribute, index) => {
        const y = entity.y + HEADER_HEIGHT + PADDING / 2 + index * LINE_HEIGHT + LINE_HEIGHT / 2
        const label = attributeLabel(attribute)
        const isKey = attribute.key === 'primary' || attribute.key === 'partial'
        return (
          <g key={attribute.name}>
            <text
              x={entity.x + PADDING}
              y={y}
              dominantBaseline="central"
              fill="var(--ink)"
              fontSize={12}
              fontStyle={attribute.derived ? 'italic' : undefined}
            >
              {label}
            </text>
            {isKey ? (
              <line
                x1={entity.x + PADDING}
                y1={y + 8}
                x2={entity.x + PADDING + textWidth(label)}
                y2={y + 8}
                stroke="var(--ink)"
                strokeWidth={1}
                strokeDasharray={attribute.key === 'partial' ? '3 2' : undefined}
              />
            ) : null}
            {attribute.key === 'foreign' ? (
              <text
                x={entity.x + entity.width - PADDING}
                y={y}
                textAnchor="end"
                dominantBaseline="central"
                fill="var(--ink-faint)"
                fontSize={10}
              >
                FK
              </text>
            ) : null}
          </g>
        )
      })}
    </g>
  )
}

function Connector({
  relationship,
  from,
  to,
}: {
  relationship: NonNullable<ErBlock['relationships']>[number]
  from: PlacedEntity
  to: PlacedEntity
}) {
  const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
  const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 }

  const start = clipToBox(fromCenter, toCenter, from)
  const end = clipToBox(toCenter, fromCenter, to)

  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
  const name = relationship.name ?? ''
  const diamondWidth = Math.max(72, textWidth(name, 6.4) + 26)
  const diamondHeight = 34

  const diamond = [
    `${mid.x},${mid.y - diamondHeight / 2}`,
    `${mid.x + diamondWidth / 2},${mid.y}`,
    `${mid.x},${mid.y + diamondHeight / 2}`,
    `${mid.x - diamondWidth / 2},${mid.y}`,
  ].join(' ')

  const cardinality = relationship.cardinality ?? '1:N'
  const [fromCard, toCard] = cardinality.split(':')

  return (
    <g>
      <ParticipationLine
        from={start}
        to={mid}
        double={Boolean(relationship.total_participation)}
      />
      <ParticipationLine from={mid} to={end} double={false} />

      <polygon
        points={diamond}
        fill="var(--surface)"
        stroke="var(--ink)"
        strokeWidth={1.5}
      />
      {name ? (
        <text
          x={mid.x}
          y={mid.y}
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--ink)"
          fontSize={11}
        >
          {name}
        </text>
      ) : null}

      <CardinalityLabel point={pointAlong(start, mid, 0.42)} text={fromCard} />
      <CardinalityLabel point={pointAlong(mid, end, 0.58)} text={toCard} />
    </g>
  )
}

function ParticipationLine({
  from,
  to,
  double,
}: {
  from: { x: number; y: number }
  to: { x: number; y: number }
  double: boolean
}) {
  if (!double) {
    return (
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke="var(--ink-muted)"
        strokeWidth={1.5}
      />
    )
  }

  // Total participation is drawn as a double line, offset perpendicular to the
  // connector so it reads as two parallel strokes at any angle.
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy) || 1
  const offsetX = (-dy / length) * 2
  const offsetY = (dx / length) * 2

  return (
    <g>
      <line
        x1={from.x + offsetX}
        y1={from.y + offsetY}
        x2={to.x + offsetX}
        y2={to.y + offsetY}
        stroke="var(--ink-muted)"
        strokeWidth={1.5}
      />
      <line
        x1={from.x - offsetX}
        y1={from.y - offsetY}
        x2={to.x - offsetX}
        y2={to.y - offsetY}
        stroke="var(--ink-muted)"
        strokeWidth={1.5}
      />
    </g>
  )
}

function CardinalityLabel({
  point,
  text,
}: {
  point: { x: number; y: number }
  text: string
}) {
  if (!text) return null
  return (
    <g>
      <circle cx={point.x} cy={point.y} r={9} fill="var(--surface)" />
      <text
        x={point.x}
        y={point.y}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--ink-muted)"
        fontSize={11}
        fontWeight={600}
      >
        {text}
      </text>
    </g>
  )
}

function pointAlong(
  from: { x: number; y: number },
  to: { x: number; y: number },
  t: number,
) {
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
}

/** Where the line from `origin` towards `target` leaves `origin`'s box. */
function clipToBox(
  origin: { x: number; y: number },
  target: { x: number; y: number },
  box: PlacedEntity,
): { x: number; y: number } {
  const dx = target.x - origin.x
  const dy = target.y - origin.y
  if (dx === 0 && dy === 0) return origin

  const halfWidth = box.width / 2
  const halfHeight = box.height / 2

  const scaleX = dx === 0 ? Infinity : halfWidth / Math.abs(dx)
  const scaleY = dy === 0 ? Infinity : halfHeight / Math.abs(dy)
  const scale = Math.min(scaleX, scaleY)

  return { x: origin.x + dx * scale, y: origin.y + dy * scale }
}

function erSummary(block: ErBlock): string {
  const entities = block.entities.map((entity) => entity.name).join(', ')
  const relationships = (block.relationships ?? [])
    .map((r) => `${r.from} ${r.name ?? 'relates to'} ${r.to} (${r.cardinality ?? '1:N'})`)
    .join('; ')
  return `ER diagram. Entities: ${entities}.${relationships ? ` Relationships: ${relationships}.` : ''}`
}
