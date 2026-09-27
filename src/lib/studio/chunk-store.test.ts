import test from 'node:test'
import assert from 'node:assert/strict'
import {
  KEEP_MS,
  chunkKey,
  chunkKeyBounds,
  isExpired,
  newRecordingId,
  orderChunks,
  pickRecoverable,
  type RecordingMeta,
} from './chunk-store'

const NOW = Date.UTC(2026, 8, 27, 12)

function meta(partial: Partial<RecordingMeta>): RecordingMeta {
  return {
    id: 'rec-x',
    questionId: 'q1',
    mime: 'video/webm;codecs=vp9,opus',
    startedAt: NOW - 60_000,
    durationMs: 30_000,
    finalized: true,
    bytes: 1_000,
    chunks: 3,
    ...partial,
  }
}

test('a piece is keyed by its take and its place in it', () => {
  assert.deepEqual(chunkKey('rec-a', 4), ['rec-a', 4])
  const { lower, upper } = chunkKeyBounds('rec-a')
  assert.deepEqual(lower, ['rec-a', 0])
  assert.equal(upper[0], 'rec-a')
  assert.ok(upper[1] >= 1_000_000, 'covers any number of pieces')
})

test('pieces come back in recording order, and gaps are noticed', () => {
  const shuffled = [{ seq: 2 }, { seq: 0 }, { seq: 1 }]
  const ordered = orderChunks(shuffled)
  assert.deepEqual(
    ordered.chunks.map((chunk) => chunk.seq),
    [0, 1, 2],
  )
  assert.equal(ordered.complete, true)
  assert.deepEqual(shuffled[0], { seq: 2 }, 'the input is not reordered in place')

  assert.equal(orderChunks([{ seq: 0 }, { seq: 2 }]).complete, false)
  assert.equal(orderChunks([{ seq: 1 }]).complete, false)
  assert.equal(orderChunks([]).complete, true)
})

test('the newest non-empty take of the question is offered back', () => {
  const rows = [
    meta({ id: 'old', startedAt: NOW - 3_600_000 }),
    meta({ id: 'new', startedAt: NOW - 60_000, finalized: false }),
    meta({ id: 'empty', startedAt: NOW - 1_000, bytes: 0 }),
    meta({ id: 'other', questionId: 'q2', startedAt: NOW }),
    meta({ id: 'stale', startedAt: NOW - KEEP_MS - 1 }),
  ]
  assert.equal(pickRecoverable(rows, 'q1', NOW)?.id, 'new')
  assert.equal(pickRecoverable(rows, 'q2', NOW)?.id, 'other')
  assert.equal(pickRecoverable(rows, 'q3', NOW), null)
  assert.equal(pickRecoverable([meta({ startedAt: NOW - KEEP_MS - 1 })], 'q1', NOW), null)
})

test('takes older than a week expire', () => {
  assert.equal(isExpired({ startedAt: NOW - KEEP_MS + 1 }, NOW), false)
  assert.equal(isExpired({ startedAt: NOW - KEEP_MS - 1 }, NOW), true)
})

test('take ids sort by time and do not collide', () => {
  const a = newRecordingId(NOW, () => 0.1)
  const b = newRecordingId(NOW + 1, () => 0.1)
  const c = newRecordingId(NOW, () => 0.9)
  assert.match(a, /^rec-[0-9a-z]+-[0-9a-z]{7,}$/)
  assert.ok(a < b)
  assert.notEqual(a, c)
})
