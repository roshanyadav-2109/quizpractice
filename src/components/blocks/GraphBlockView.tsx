import type { GraphBlock } from '@/lib/blocks/schema'
import { FigureCaption } from './BlockRenderer'

/**
 * Graphs, trees, heaps and state machines — the shapes PDSA and Algorithmic
 * Thinking questions are built from.
 *
 * Layout is deterministic (levels for trees and flows, a circle otherwise)
 * rather than force-directed, so the same data always draws the same picture
 * and server and client markup match exactly.
 */

const MARGIN = 30
const LEVEL_GAP = 84
const SIBLING_GAP = 74

interface PlacedNode {
  id: string
  label: string
  shape: NonNullable<GraphBlock['nodes'][number]['shape']>
  x: number
  y: number
  radius: number
}

export function GraphBlockView({ block }: { block: GraphBlock }) {
  const edges = block.edges ?? []
  const layout = block.layout ?? 'force'
  const positions =
    layout === 'tree' || layout === 'flow'
      ? layeredLayout(block, edges, layout)
      : circularLayout(block)

  const width = Math.max(...positions.map((n) => n.x + n.radius)) + MARGIN
  const height = Math.max(...positions.map((n) => n.y + n.radius)) + MARGIN
  const byId = new Map(positions.map((node) => [node.id, node]))

  return (
    <figure className="my-1">
      <div className="overflow-x-auto border border-rule bg-surface p-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-label={graphSummary(block)}
          className="mx-auto h-auto max-w-full"
        >
          {block.directed ? (
            <defs>
              <marker
                id="graph-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--ink-muted)" />
              </marker>
            </defs>
          ) : null}

          <g>
            {edges.map((edge, index) => {
              const from = byId.get(edge.from)
              const to = byId.get(edge.to)
              if (!from || !to) return null
              return <Edge key={index} from={from} to={to} edge={edge} directed={Boolean(block.directed)} />
            })}
          </g>

          <g>
            {positions.map((node) => (
              <Node key={node.id} node={node} />
            ))}
          </g>
        </svg>
      </div>
      <FigureCaption>{block.caption}</FigureCaption>
    </figure>
  )
}

function Node({ node }: { node: PlacedNode }) {
  const fill = 'var(--surface)'
  const stroke = 'var(--ink)'

  return (
    <g>
      {node.shape === 'box' || node.shape === 'rounded' ? (
        <rect
          x={node.x - node.radius}
          y={node.y - node.radius * 0.7}
          width={node.radius * 2}
          height={node.radius * 1.4}
          rx={node.shape === 'rounded' ? 8 : 2}
          fill={fill}
          stroke={stroke}
          strokeWidth={1.5}
        />
      ) : node.shape === 'diamond' ? (
        <polygon
          points={[
            `${node.x},${node.y - node.radius}`,
            `${node.x + node.radius},${node.y}`,
            `${node.x},${node.y + node.radius}`,
            `${node.x - node.radius},${node.y}`,
          ].join(' ')}
          fill={fill}
          stroke={stroke}
          strokeWidth={1.5}
        />
      ) : (
        <circle
          cx={node.x}
          cy={node.y}
          r={node.radius}
          fill={fill}
          stroke={stroke}
          strokeWidth={1.5}
        />
      )}
      <text
        x={node.x}
        y={node.y}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--ink)"
        fontSize={12}
        fontWeight={500}
      >
        {node.label}
      </text>
    </g>
  )
}

function Edge({
  from,
  to,
  edge,
  directed,
}: {
  from: PlacedNode
  to: PlacedNode
  edge: NonNullable<GraphBlock['edges']>[number]
  directed: boolean
}) {
  if (from.id === to.id) {
    // Self-loop: a small arc sitting above the node.
    const r = from.radius
    const path = `M ${from.x - r * 0.5} ${from.y - r * 0.85} A ${r * 0.75} ${r * 0.75} 0 1 1 ${from.x + r * 0.5} ${from.y - r * 0.85}`
    return (
      <g>
        <path
          d={path}
          fill="none"
          stroke="var(--ink-muted)"
          strokeWidth={1.5}
          markerEnd={directed ? 'url(#graph-arrow)' : undefined}
        />
        {edge.weight !== undefined || edge.label ? (
          <EdgeLabel x={from.x} y={from.y - r * 2} text={String(edge.label ?? edge.weight)} />
        ) : null}
      </g>
    )
  }

  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy) || 1
  const unit = { x: dx / length, y: dy / length }

  const start = { x: from.x + unit.x * from.radius, y: from.y + unit.y * from.radius }
  const gap = directed ? to.radius + 6 : to.radius
  const end = { x: to.x - unit.x * gap, y: to.y - unit.y * gap }

  const label = edge.label ?? (edge.weight !== undefined ? String(edge.weight) : null)

  return (
    <g>
      <line
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        stroke="var(--ink-muted)"
        strokeWidth={1.5}
        markerEnd={directed ? 'url(#graph-arrow)' : undefined}
      />
      {label ? (
        <EdgeLabel x={(start.x + end.x) / 2} y={(start.y + end.y) / 2} text={label} />
      ) : null}
    </g>
  )
}

function EdgeLabel({ x, y, text }: { x: number; y: number; text: string }) {
  const width = Math.max(16, text.length * 7 + 6)
  return (
    <g>
      <rect
        x={x - width / 2}
        y={y - 9}
        width={width}
        height={18}
        rx={3}
        fill="var(--surface)"
      />
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--ink-muted)"
        fontSize={11}
        className="tabular-nums"
      >
        {text}
      </text>
    </g>
  )
}

function nodeRadius(label: string): number {
  return Math.max(17, label.length * 4.2 + 9)
}

function circularLayout(block: GraphBlock): PlacedNode[] {
  const nodes = block.nodes
  const count = nodes.length
  const radii = nodes.map((node) => nodeRadius(node.label ?? node.id))
  const maxRadius = Math.max(...radii)

  if (count === 1) {
    return [
      {
        id: nodes[0].id,
        label: nodes[0].label ?? nodes[0].id,
        shape: nodes[0].shape ?? 'circle',
        x: MARGIN + maxRadius,
        y: MARGIN + maxRadius,
        radius: radii[0],
      },
    ]
  }

  // Ring big enough that neighbouring nodes never touch.
  const circumference = radii.reduce((sum, r) => sum + r * 2 + 34, 0)
  const ringRadius = Math.max(70, circumference / (2 * Math.PI))
  const centre = MARGIN + ringRadius + maxRadius

  return nodes.map((node, index) => {
    // Start at the top and go clockwise, which is how these are drawn by hand.
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2
    return {
      id: node.id,
      label: node.label ?? node.id,
      shape: node.shape ?? 'circle',
      x: centre + Math.cos(angle) * ringRadius,
      y: centre + Math.sin(angle) * ringRadius,
      radius: radii[index],
    }
  })
}

function layeredLayout(
  block: GraphBlock,
  edges: NonNullable<GraphBlock['edges']>,
  layout: 'tree' | 'flow',
): PlacedNode[] {
  const ids = block.nodes.map((node) => node.id)
  const incoming = new Map<string, number>(ids.map((id) => [id, 0]))
  for (const edge of edges) {
    if (edge.from !== edge.to && incoming.has(edge.to)) {
      incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1)
    }
  }

  const roots = ids.filter((id) => (incoming.get(id) ?? 0) === 0)
  const queue = roots.length ? [...roots] : [ids[0]]
  const depth = new Map<string, number>(queue.map((id) => [id, 0]))

  // Breadth-first so every node sits one level below its first parent. Cycles
  // terminate because a node is only assigned a depth once.
  while (queue.length) {
    const current = queue.shift()!
    const currentDepth = depth.get(current) ?? 0
    for (const edge of edges) {
      if (edge.from !== current) continue
      if (depth.has(edge.to)) continue
      depth.set(edge.to, currentDepth + 1)
      queue.push(edge.to)
    }
  }

  // Anything unreachable (a disconnected component) goes on its own last level.
  const maxDepth = Math.max(0, ...depth.values())
  for (const id of ids) {
    if (!depth.has(id)) depth.set(id, maxDepth + 1)
  }

  const levels = new Map<number, string[]>()
  for (const id of ids) {
    const d = depth.get(id) ?? 0
    levels.set(d, [...(levels.get(d) ?? []), id])
  }

  const nodeById = new Map(block.nodes.map((node) => [node.id, node]))
  const widest = Math.max(...[...levels.values()].map((level) => level.length))
  const spread = widest * SIBLING_GAP

  const placed: PlacedNode[] = []
  for (const [level, levelIds] of [...levels.entries()].sort((a, b) => a[0] - b[0])) {
    levelIds.forEach((id, index) => {
      const node = nodeById.get(id)!
      const label = node.label ?? node.id
      const offset = (spread / (levelIds.length + 1)) * (index + 1)
      const along = MARGIN + 24 + level * LEVEL_GAP
      placed.push({
        id,
        label,
        shape: node.shape ?? (layout === 'flow' ? 'rounded' : 'circle'),
        x: layout === 'flow' ? along : MARGIN + offset,
        y: layout === 'flow' ? MARGIN + offset : along,
        radius: nodeRadius(label),
      })
    })
  }

  return placed
}

function graphSummary(block: GraphBlock): string {
  const nodes = block.nodes.map((node) => node.label ?? node.id).join(', ')
  const edges = (block.edges ?? [])
    .map((edge) => `${edge.from}${block.directed ? ' to ' : ' — '}${edge.to}${edge.weight !== undefined ? ` weight ${edge.weight}` : ''}`)
    .join('; ')
  return `${block.directed ? 'Directed' : 'Undirected'} graph. Nodes: ${nodes}.${edges ? ` Edges: ${edges}.` : ''}`
}
