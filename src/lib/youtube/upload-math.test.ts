import test from 'node:test'
import assert from 'node:assert/strict'
import {
  UPLOAD_GRANULE,
  chunkPlan,
  formatContentRange,
  formatStatusRange,
  granularChunkSize,
  isValidChunk,
  nextChunk,
  nextOffsetFromRange,
  parseContentRange,
} from './upload-math'
import { DIRECT_CHUNK_BYTES as DIRECT, PROXY_CHUNK_BYTES as PROXY } from '@/lib/teach/contracts'

test('the shared chunk sizes are whole granules, and the proxy one fits a Vercel body', () => {
  assert.ok(PROXY < 4_500_000)
  assert.equal(DIRECT % UPLOAD_GRANULE, 0)
  assert.equal(PROXY % UPLOAD_GRANULE, 0)
  assert.equal(granularChunkSize(DIRECT), DIRECT)
  assert.equal(granularChunkSize(PROXY), PROXY)
})

test('an odd chunk size is rounded down to whole granules, never to zero', () => {
  assert.equal(granularChunkSize(PROXY + 1000), PROXY)
  assert.equal(granularChunkSize(UPLOAD_GRANULE - 1), UPLOAD_GRANULE)
  assert.equal(granularChunkSize(0), UPLOAD_GRANULE)
})

test('every chunk but the last starts and ends on granule boundaries', () => {
  const total = 20_000_000
  const plan = chunkPlan(total, DIRECT)
  assert.deepEqual(plan, [
    { start: 0, end: DIRECT - 1 },
    { start: DIRECT, end: 2 * DIRECT - 1 },
    { start: 2 * DIRECT, end: total - 1 },
  ])
  for (const chunk of plan.slice(0, -1)) {
    assert.equal(chunk.start % UPLOAD_GRANULE, 0)
    assert.equal((chunk.end + 1) % UPLOAD_GRANULE, 0)
  }
})

test('the chunks cover the file exactly once', () => {
  for (const total of [1, UPLOAD_GRANULE - 1, UPLOAD_GRANULE, UPLOAD_GRANULE + 1, PROXY, PROXY * 3 + 17, 123_456_789]) {
    const plan = chunkPlan(total, PROXY)
    assert.equal(plan[0].start, 0)
    assert.equal(plan.at(-1)!.end, total - 1)
    for (let i = 1; i < plan.length; i++) assert.equal(plan[i].start, plan[i - 1].end + 1)
    assert.equal(
      plan.reduce((sum, chunk) => sum + chunk.end - chunk.start + 1, 0),
      total,
    )
  }
})

test('a file that is an exact multiple ends on a full chunk', () => {
  assert.deepEqual(chunkPlan(2 * PROXY, PROXY), [
    { start: 0, end: PROXY - 1 },
    { start: PROXY, end: 2 * PROXY - 1 },
  ])
})

test('resuming picks up from the reported offset', () => {
  assert.deepEqual(nextChunk(PROXY, 10_000_000, PROXY), { start: PROXY, end: 2 * PROXY - 1 })
  assert.deepEqual(chunkPlan(10_000_000, DIRECT, 2 * PROXY), [{ start: 2 * PROXY, end: 9_999_999 }])
  assert.equal(nextChunk(10_000_000, 10_000_000, PROXY), null)
  assert.deepEqual(chunkPlan(10, PROXY, 10), [])
})

test('bad inputs are refused', () => {
  assert.throws(() => nextChunk(0, 0, PROXY), RangeError)
  assert.throws(() => nextChunk(-1, 10, PROXY), RangeError)
  assert.throws(() => nextChunk(0.5, 10, PROXY), RangeError)
})

test('Content-Range is written the way YouTube reads it', () => {
  assert.equal(formatContentRange({ start: 0, end: 262_143 }, 1_000_000), 'bytes 0-262143/1000000')
  assert.equal(formatStatusRange(1_000_000), 'bytes */1000000')
})

test('Content-Range reads back, and nonsense does not', () => {
  assert.deepEqual(parseContentRange('bytes 0-262143/1000000'), { start: 0, end: 262_143, total: 1_000_000 })
  assert.deepEqual(parseContentRange(' bytes 5-5/6 '), { start: 5, end: 5, total: 6 })
  for (const bad of [null, undefined, '', 'bytes */100', 'bytes 10-5/100', 'bytes 0-100/100', 'bytes=0-5/10', 'items 0-1/2', 'bytes -1-5/10']) {
    assert.equal(parseContentRange(bad), null, String(bad))
  }
})

test("a 308's Range header gives the next offset", () => {
  assert.equal(nextOffsetFromRange('bytes=0-524287'), 524_288)
  assert.equal(nextOffsetFromRange('bytes=0-0'), 1)
  assert.equal(nextOffsetFromRange(null), 0)
  assert.equal(nextOffsetFromRange(undefined), 0)
  assert.equal(nextOffsetFromRange(''), 0)
  assert.equal(nextOffsetFromRange('bytes=5-10'), null)
  assert.equal(nextOffsetFromRange('garbage'), null)
})

test('the proxy accepts only chunks YouTube will take', () => {
  const total = 10_000_000
  assert.ok(isValidChunk({ start: 0, end: PROXY - 1 }, total, PROXY))
  assert.ok(isValidChunk({ start: 2 * PROXY, end: total - 1 }, total, PROXY), 'a short last chunk')
  assert.ok(isValidChunk({ start: 0, end: UPLOAD_GRANULE - 1 }, total, PROXY), 'one granule')
  assert.ok(!isValidChunk({ start: 0, end: PROXY }, total, PROXY), 'one byte over the limit')
  assert.ok(isValidChunk({ start: 1_000_000, end: 1_000_000 + PROXY - 1 }, total, PROXY), 'resuming off a boundary')
  assert.ok(!isValidChunk({ start: 1_000_000, end: 1_000_000 + UPLOAD_GRANULE }, total, PROXY), 'not whole granules')
  assert.ok(!isValidChunk({ start: 0, end: 1000 }, total, PROXY), 'a short chunk that is not the last')
  assert.ok(!isValidChunk({ start: 0, end: total }, total, total + 1), 'past the end')
  assert.ok(!isValidChunk({ start: 5, end: 4 }, total, PROXY), 'empty')
})
