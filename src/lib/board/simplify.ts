/**
 * Ramer–Douglas–Peucker simplification for pen strokes.
 *
 * A pointer reports 60–240 points a second, most of them on a line the
 * points either side already describe. Dropping those shrinks a board page
 * several times over without changing what it looks like, which is what keeps
 * a sketch under its size cap and the autosave under the browser's quota.
 *
 * Pressure is a third dimension here: a point where the pen pressed harder
 * is kept even when it sits on a straight line, or the stroke would lose its
 * swell. The ends of a stroke are always kept.
 */

/** Distance from p to the segment a–b, and where along a–b it lands (0–1). */
function segmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { distance: number; t: number } {
  const dx = bx - ax
  const dy = by - ay
  const lengthSq = dx * dx + dy * dy
  // The segment against the segment, not the infinite line: a stroke that
  // doubles back on itself keeps its turning point.
  let t = lengthSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSq
  t = Math.max(0, Math.min(1, t))
  return { distance: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t }
}

/**
 * Simplifies x, y, pressure triplets. Returns a new flat array holding the
 * points kept, unchanged; the first and last points are always among them.
 *
 * @param epsilon how far (board units) a dropped point may sit from the line
 *   that replaces it.
 * @param pressureEpsilon how far its pressure (0–1) may differ from the
 *   pressure the line interpolates there.
 */
export function simplifyStroke(pts: readonly number[], epsilon: number, pressureEpsilon = 0.08): number[] {
  const count = Math.floor(pts.length / 3)
  if (count <= 2 || epsilon <= 0) return pts.slice(0, count * 3)

  const keep = new Uint8Array(count)
  keep[0] = 1
  keep[count - 1] = 1

  // An explicit stack rather than recursion: a long stroke can hold tens of
  // thousands of points.
  const stack: [number, number][] = [[0, count - 1]]
  while (stack.length) {
    const [first, last] = stack.pop()!
    if (last - first < 2) continue

    const ax = pts[first * 3]
    const ay = pts[first * 3 + 1]
    const ap = pts[first * 3 + 2]
    const bx = pts[last * 3]
    const by = pts[last * 3 + 1]
    const bp = pts[last * 3 + 2]

    let worst = 1
    let worstIndex = -1
    const middle = (first + last) / 2
    for (let i = first + 1; i < last; i++) {
      const { distance, t } = segmentDistance(pts[i * 3], pts[i * 3 + 1], ax, ay, bx, by)
      const pressureOff = Math.abs(pts[i * 3 + 2] - (ap + (bp - ap) * t))
      const error = Math.max(distance / epsilon, pressureEpsilon > 0 ? pressureOff / pressureEpsilon : 0)
      // On a tie, split nearer the middle: a zigzag of equal corners would
      // otherwise peel off one point at a time, in quadratic time.
      if (error > worst || (error === worst && worstIndex !== -1 && Math.abs(i - middle) < Math.abs(worstIndex - middle))) {
        worst = error
        worstIndex = i
      }
    }

    if (worstIndex !== -1) {
      keep[worstIndex] = 1
      stack.push([first, worstIndex], [worstIndex, last])
    }
  }

  const out: number[] = []
  for (let i = 0; i < count; i++) {
    if (keep[i]) out.push(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2])
  }
  return out
}
