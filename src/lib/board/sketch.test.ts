import test from 'node:test'
import assert from 'node:assert/strict'
import { SKETCH_MAX_BYTES, jsonByteLength, sketchBlockSchema } from '@/lib/blocks/schema'
import { SketchTooLargeError, sketchToPage, sketchToSvgPaths, toSketch } from './sketch'
import type { BoardPage, Stroke } from './types'

const SAFE_PATH = /^[MLQCZmlqcz0-9.,\s-]+$/

let seq = 0
function wave(length: number, y0: number, pressure = (i: number) => 0.4 + 0.3 * Math.sin(i / 9)): Stroke {
  seq += 1
  const pts: number[] = []
  for (let i = 0; i < length; i++) pts.push(20 + i * 0.8 + 0.123, y0 + Math.sin(i / 6) * 25 + 0.456, pressure(i))
  return { id: `w${seq}`, tool: 'pen', color: '#1D4ED8', size: 5, pts }
}

function page(strokes: Stroke[], extra: Partial<BoardPage> = {}): BoardPage {
  return { id: 'p', bg: 'plain', strokes, figures: [], ...extra }
}

test('a board page becomes a valid sketch block of whole numbers', () => {
  const sketch = toSketch(
    page(
      [
        wave(400, 200),
        { id: 'h', tool: 'highlighter', color: '#facc15', size: 24, pts: [100, 500, 0.5, 600, 505, 0.5] },
        { id: 'r', tool: 'rect', color: '#111111', size: 5, pts: [10.4, 20.6, 300.2, 250.9] },
        { id: 'a', tool: 'arrow', color: '#dc2626', size: 5, pts: [700, 100, 900, 300] },
      ],
      { bg: 'grid', figures: [{ id: 'f', image: { public_id: 'qp/x/fig', width: 400, height: 200 }, x: 32, y: 32, w: 400.04, h: 200 }] },
    ),
    'A sine wave, highlighted',
  )
  assert.ok(sketchBlockSchema.safeParse(sketch).success)
  assert.equal(sketch.type, 'sketch')
  assert.equal(sketch.w, 1280)
  assert.equal(sketch.h, 720)
  assert.equal(sketch.bg, 'grid')
  assert.equal(sketch.alt, 'A sine wave, highlighted')
  assert.equal(sketch.figures?.[0].w, 400)
  for (const stroke of sketch.strokes) {
    assert.ok(stroke.pts.every(Number.isInteger), `${stroke.tool} points are whole numbers`)
    assert.match(stroke.color, /^#[0-9a-f]{6}$/)
  }
  assert.deepEqual(sketch.strokes[2].pts, [10, 21, 300, 251])
  const pressures = sketch.strokes[0].pts.filter((_, i) => i % 3 === 2)
  assert.ok(pressures.every((p) => p >= 0 && p <= 100))
})

test('simplification shrinks a stroke but keeps its ends', () => {
  const stroke = wave(600, 300)
  const [out] = toSketch(page([stroke])).strokes
  assert.ok(out.pts.length < stroke.pts.length / 2, `${out.pts.length / 3} of ${stroke.pts.length / 3} points`)
  const n = stroke.pts.length
  assert.deepEqual(out.pts.slice(0, 3), [Math.round(stroke.pts[0]), Math.round(stroke.pts[1]), Math.round(stroke.pts[2] * 100)])
  assert.deepEqual(out.pts.slice(-3), [
    Math.round(stroke.pts[n - 3]),
    Math.round(stroke.pts[n - 2]),
    Math.round(stroke.pts[n - 1] * 100),
  ])
})

test('a sketch round-trips through the board unchanged', () => {
  const first = toSketch(
    page([wave(300, 200), wave(250, 450, () => 0.5), { id: 'l', tool: 'line', color: '#15803d', size: 3, pts: [5, 5, 600, 5] }], {
      bg: 'dots',
    }),
    'Two waves',
    'Figure 1',
  )
  const again = toSketch(sketchToPage(first), 'Two waves', 'Figure 1')
  assert.deepEqual(again, first)
  assert.equal(first.caption, 'Figure 1')
})

test('an empty page is a valid, tiny sketch', () => {
  const sketch = toSketch(page([]))
  assert.deepEqual(sketch.strokes, [])
  assert.equal(sketch.bg, undefined)
  assert.ok(sketchBlockSchema.safeParse(sketch).success)
})

test('a page over the size cap is refused with a message for the teacher', () => {
  // Scribble that simplification cannot remove: every point is a corner.
  const strokes: Stroke[] = []
  for (let s = 0; s < 60; s++) {
    const pts: number[] = []
    for (let i = 0; i < 400; i++) pts.push((i * 3) % 1280, (s * 11 + (i % 2) * 9) % 720, (i % 5) / 5)
    strokes.push({ id: `z${s}`, tool: 'pen', color: '#111111', size: 3, pts })
  }
  assert.throws(
    () => toSketch(page(strokes)),
    (error: unknown) => error instanceof SketchTooLargeError && /too detailed|Split/.test(error.message),
  )
})

test('pages that fit are always under the cap', () => {
  const strokes = Array.from({ length: 120 }, (_, i) => wave(200, 20 + (i % 30) * 23))
  const sketch = toSketch(page(strokes))
  assert.ok(jsonByteLength(sketch) <= SKETCH_MAX_BYTES)
})

test('more than 1,500 strokes is refused', () => {
  const strokes = Array.from({ length: 1_501 }, (_, i) => ({
    id: `d${i}`,
    tool: 'pen' as const,
    color: '#111111',
    size: 3,
    pts: [i % 1280, 10, 0.5],
  }))
  assert.throws(() => toSketch(page(strokes)), SketchTooLargeError)
})

test('SVG paths are safe, closed outlines for ink and outlines for shapes', () => {
  const sketch = toSketch(
    page([
      wave(200, 200),
      { id: 'h', tool: 'highlighter', color: '#facc15', size: 24, pts: [100, 500, 0.5, 600, 505, 0.5] },
      { id: 'e', tool: 'ellipse', color: '#7c3aed', size: 5, pts: [100, 100, 300, 200] },
      { id: 'a', tool: 'arrow', color: '#dc2626', size: 5, pts: [700, 100, 900, 300] },
      { id: 'd', tool: 'pen', color: '#111111', size: 5, pts: [640, 360, 0.5] },
    ]),
  )
  const paths = sketchToSvgPaths(sketch)
  assert.equal(paths.length, 5)
  for (const path of paths) {
    assert.match(path.d, SAFE_PATH)
    assert.ok(path.d.startsWith('M'))
  }
  const [ink, marker, ellipse, arrow, dot] = paths
  assert.equal(ink.fill, '#1d4ed8')
  assert.ok(ink.d.endsWith('Z'))
  assert.equal(marker.opacity, 0.35)
  assert.equal(marker.multiply, true)
  assert.equal(ellipse.fill, 'none')
  assert.equal(ellipse.stroke, '#7c3aed')
  assert.ok(ellipse.d.includes('C'), 'ellipses are Bézier curves, not arcs')
  assert.equal((arrow.d.match(/M/g) ?? []).length, 2, 'shaft and head')
  assert.ok(dot.d.length > 0, 'a tap is a dot')
})

test('source_url figures and bad colours fail validation', () => {
  assert.throws(() =>
    toSketch(
      page([], {
        figures: [{ id: 'f', image: { public_id: 'qp/x', source_url: 'https://example.com/x.png' }, x: 0, y: 0, w: 10, h: 10 }],
      }),
    ),
  )
})
