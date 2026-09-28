import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DESCRIPTION_MAX_BYTES,
  TITLE_MAX_CHARS,
  clipToBytes,
  formatBytes,
  formatClock,
  recordingFilename,
  slugPart,
  utf8Length,
  videoDescription,
  videoTitle,
  youtubeSafe,
  type RecordingPlace,
} from './filename'

const PLACE: RecordingPlace = {
  subjectSlug: 'dbms',
  subjectName: 'Database Management Systems',
  programName: 'Data Science',
  examName: 'Quiz 2',
  sessionDate: '2026-04-12',
  setCode: 'QDB2',
  number: 7,
}

test('the file is named after the question, with the right extension', () => {
  assert.equal(recordingFilename(PLACE, 'video/webm;codecs=vp9,opus'), 'QP-dbms-2026-04-12-QDB2-Q7.webm')
  assert.equal(recordingFilename(PLACE, 'video/mp4;codecs=avc1.42E01F,mp4a.40.2'), 'QP-dbms-2026-04-12-QDB2-Q7.mp4')
  assert.equal(recordingFilename({ ...PLACE, setCode: '1' }, 'video/webm'), 'QP-dbms-2026-04-12-1-Q7.webm')
})

test('missing or odd parts still give a safe file name', () => {
  const name = recordingFilename(
    { ...PLACE, subjectSlug: null, subjectName: 'Maths I: Calculus & Algebra', sessionDate: null, setCode: 'Set / A', number: 12 },
    'video/webm',
  )
  assert.equal(name, 'QP-maths-i-calculus-algebra-undated-Set-A-Q12.webm')
  assert.match(recordingFilename({ ...PLACE, subjectSlug: '', subjectName: '', setCode: '' }, 'video/webm'), /^QP-subject-2026-04-12-set-Q7\.webm$/)
  assert.doesNotMatch(recordingFilename({ ...PLACE, setCode: '../../etc' }, 'video/webm'), /[/\\.]{2}/)
})

test('slugs are lower case words joined by hyphens', () => {
  assert.equal(slugPart('  Python Programming (ES) '), 'python-programming-es')
  assert.equal(slugPart('Café Déjà'), 'cafe-deja')
  assert.equal(slugPart('a'.repeat(60)).length, 40)
  assert.equal(slugPart('---'), '')
})

test('titles fit YouTube: 100 characters, no angle brackets', () => {
  assert.equal(videoTitle(PLACE), 'Database Management Systems · Quiz 2 · 12 Apr 2026 · Q7 explained')
  const long = videoTitle({ ...PLACE, subjectName: 'A very long subject name '.repeat(8) + '<script>' })
  assert.ok(Array.from(long).length <= TITLE_MAX_CHARS)
  assert.doesNotMatch(long, /[<>]/)
  assert.match(long, /Q7 explained$/)
  assert.equal(videoTitle({ ...PLACE, sessionDate: null }), 'Database Management Systems · Quiz 2 · Undated · Q7 explained')
})

test('descriptions link the paper and stay under 5,000 bytes', () => {
  const text = videoDescription(PLACE, {
    paperUrl: 'https://example.org/paper/abc',
    snippet: 'Consider the relation R(A, B) where A -> B. Which of the following <holds>?',
    copies: 3,
  })
  assert.match(text, /question 7 from Database Management Systems \(Data Science\), Quiz 2, 12 Apr 2026, set QDB2/)
  assert.match(text, /Try the paper: https:\/\/example\.org\/paper\/abc/)
  assert.match(text, /appears in 3 papers/)
  assert.match(text, /Question: Consider the relation/)
  assert.doesNotMatch(text, /[<>]/)

  const huge = videoDescription(PLACE, { paperUrl: 'https://example.org/p', snippet: 'অনেক লম্বা প্রশ্ন '.repeat(2000) })
  assert.ok(utf8Length(huge) <= DESCRIPTION_MAX_BYTES)
  assert.match(huge, /with explanations\.$/)
})

test('clipping by bytes never splits a character', () => {
  assert.equal(clipToBytes('hello', 10), 'hello')
  assert.equal(clipToBytes('héllo', 2), 'h')
  assert.equal(clipToBytes('😀😀', 5), '😀')
  assert.equal(youtubeSafe('a<b>c'), 'a‹b›c')
})

test('clocks and sizes read naturally', () => {
  assert.equal(formatClock(0), '0:00')
  assert.equal(formatClock(4_999), '0:04')
  assert.equal(formatClock(247_000), '4:07')
  assert.equal(formatClock(3_727_000), '1:02:07')
  assert.equal(formatClock(-5), '0:00')
  assert.equal(formatBytes(840_000), '840 kB')
  assert.equal(formatBytes(23_400_000), '23.4 MB')
  assert.equal(formatBytes(120_000_000), '120 MB')
})
