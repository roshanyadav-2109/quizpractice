import test from 'node:test'
import assert from 'node:assert/strict'
import { simplifyStroke } from './simplify'

/** x, y, pressure triplets from [x, y] pairs at one pressure. */
function triplets(points: [number, number][], pressure = 0.5): number[] {
  return points.flatMap(([x, y]) => [x, y, pressure])
}

function pointsOf(flat: number[]): [number, number, number][] {
  const out: [number, number, number][] = []
  for (let i = 0; i < flat.length; i += 3) out.push([flat[i], flat[i + 1], flat[i + 2]])
  return out
}

test('points on a straight line collapse to its two ends', () => {
  const line = triplets(Array.from({ length: 50 }, (_, i) => [i * 4, i * 2] as [number, number]))
  assert.deepEqual(simplifyStroke(line, 0.75), [0, 0, 0.5, 196, 98, 0.5])
})

test('the first and last points are always kept, exactly', () => {
  const wobbly = triplets(Array.from({ length: 200 }, (_, i) => [i + 0.37, Math.sin(i / 7) * 30 + 0.11] as [number, number]))
  const out = simplifyStroke(wobbly, 0.75)
  assert.deepEqual(out.slice(0, 3), wobbly.slice(0, 3))
  assert.deepEqual(out.slice(-3), wobbly.slice(-3))
  assert.ok(out.length < wobbly.length, 'something was dropped')
})

test('a corner survives', () => {
  const corner = triplets([
    [0, 0],
    [10, 0],
    [20, 0],
    [30, 0],
    [30, 10],
    [30, 20],
    [30, 30],
  ])
  assert.deepEqual(
    pointsOf(simplifyStroke(corner, 0.75)).map(([x, y]) => [x, y]),
    [
      [0, 0],
      [30, 0],
      [30, 30],
    ],
  )
})

test('a stroke that doubles back keeps its turning point', () => {
  // Forward then back along the same line: the far end is on the line, but
  // beyond the segment between the stroke's ends.
  const back = triplets([
    [0, 0],
    [50, 0],
    [100, 0],
    [60, 0],
    [20, 0],
  ])
  const kept = pointsOf(simplifyStroke(back, 0.75)).map(([x]) => x)
  assert.ok(kept.includes(100), `kept ${kept.join(', ')}`)
})

test('a change of pressure is kept even on a straight line', () => {
  const swell = [0, 0, 0.3, 10, 0, 0.3, 20, 0, 0.9, 30, 0, 0.3, 40, 0, 0.3]
  const kept = pointsOf(simplifyStroke(swell, 0.75))
  assert.ok(kept.some(([x, , p]) => x === 20 && p === 0.9))
  // With pressure ignored, the line collapses.
  assert.equal(pointsOf(simplifyStroke(swell, 0.75, 0)).length, 2)
})

test('small inputs come back whole', () => {
  assert.deepEqual(simplifyStroke([5, 5, 0.5], 0.75), [5, 5, 0.5])
  assert.deepEqual(simplifyStroke([0, 0, 0.5, 1, 1, 0.5], 0.75), [0, 0, 0.5, 1, 1, 0.5])
  assert.deepEqual(simplifyStroke([], 0.75), [])
})

test('epsilon 0 keeps every point, and a trailing partial triplet is dropped', () => {
  const pts = triplets([
    [0, 0],
    [1, 0],
    [2, 0],
  ])
  assert.deepEqual(simplifyStroke(pts, 0), pts)
  assert.deepEqual(simplifyStroke([...pts, 9], 0.75), [0, 0, 0.5, 2, 0, 0.5])
})

test('simplifying twice changes nothing more', () => {
  const pts = triplets(Array.from({ length: 300 }, (_, i) => [i, Math.round(Math.sin(i / 11) * 40)] as [number, number]))
  const once = simplifyStroke(pts, 0.75)
  assert.deepEqual(simplifyStroke(once, 0.75), once)
})

test('long strokes neither overflow the stack nor take long', () => {
  const zigzag = triplets(Array.from({ length: 40_000 }, (_, i) => [i, i % 2 ? 5 : 0] as [number, number]))
  const started = performance.now()
  const out = simplifyStroke(zigzag, 0.75)
  assert.equal(out.length, zigzag.length, 'every corner is kept')
  assert.ok(performance.now() - started < 2_000, 'equal corners split evenly, not one at a time')
})
