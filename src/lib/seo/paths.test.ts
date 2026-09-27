import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  dateFromSlug,
  dateSlug,
  paperSlugs,
  paths,
  programSlug,
  questionNumberFromSlug,
  questionSlug,
  slugify,
} from './paths'

test('slugify keeps words and drops punctuation', () => {
  assert.equal(slugify('Programming, Data Structures & Algorithms'), 'programming-data-structures-and-algorithms')
  assert.equal(slugify('  QDF2 '), 'qdf2')
  assert.equal(slugify('Déjà vu'), 'deja-vu')
})

test('a date slug reads the way students write the date, and parses back', () => {
  assert.equal(dateSlug('2025-02-16'), '16-feb-2025')
  assert.equal(dateSlug('2026-10-05'), '5-oct-2026')
  assert.equal(dateFromSlug('16-feb-2025'), '2025-02-16')
  assert.equal(dateFromSlug('5-oct-2026-qdf2'), '2026-10-05')
  assert.equal(dateFromSlug('not-a-date'), null)
})

test('a sitting with one set is its date; several sets on one day add their codes', () => {
  const slugs = paperSlugs([
    { setId: 'a', subjectId: 's', examTypeId: 'q1', sessionDate: '2025-02-16', setCode: '1' },
    { setId: 'b', subjectId: 's', examTypeId: 'et', sessionDate: '2025-04-20', setCode: 'QDF1' },
    { setId: 'c', subjectId: 's', examTypeId: 'et', sessionDate: '2025-04-20', setCode: 'QDF2' },
    // The same day in another subject does not force a code.
    { setId: 'd', subjectId: 't', examTypeId: 'q1', sessionDate: '2025-02-16', setCode: '1' },
  ])
  assert.equal(slugs.get('a'), '16-feb-2025')
  assert.equal(slugs.get('b'), '20-apr-2025-qdf1')
  assert.equal(slugs.get('c'), '20-apr-2025-qdf2')
  assert.equal(slugs.get('d'), '16-feb-2025')
})

test('question slugs lead with the number and keep a few meaningful words', () => {
  assert.equal(
    questionSlug(12, 'Consider the relation Delivery_Fee. What is the output of SELECT AVG(Fee)?'),
    'q12-consider-relation-delivery-fee-output-select-avg',
  )
  assert.equal(questionSlug(3, 'Find $\\frac{a}{b}$ if $a = 4$'), 'q3-find-if')
  assert.equal(questionSlug(7, ''), 'q7')
  assert.ok(questionSlug(1, 'word '.repeat(40)).length <= 64)
  assert.equal(questionNumberFromSlug('q12-consider-relation'), 12)
  assert.equal(questionNumberFromSlug('q7'), 7)
  assert.equal(questionNumberFromSlug('12-q'), null)
})

test('paths nest subject, exam, paper and question', () => {
  assert.equal(paths.subject('maths-1'), '/pyq/maths-1')
  assert.equal(paths.subjectExam('maths-1', 'quiz-1'), '/pyq/maths-1/quiz-1')
  assert.equal(paths.paper('maths-1', 'quiz-1', '16-feb-2025'), '/pyq/maths-1/quiz-1/16-feb-2025')
  assert.equal(
    paths.question('maths-1', 'quiz-1', '16-feb-2025', 'q12-find'),
    '/pyq/maths-1/quiz-1/16-feb-2025/q12-find',
  )
})

test('a programme is addressed by its everyday name', () => {
  assert.equal(programSlug({ slug: 'ds', short_name: 'Data Science', name: 'BS in Data Science and Applications' }), 'data-science')
  assert.equal(programSlug({ slug: 'es', short_name: null, name: 'BS in Electronic Systems' }), 'bs-in-electronic-systems')
})

test('year pages sit beside the papers without ever matching a paper address', () => {
  assert.equal(paths.year(2025), '/year/2025')
  assert.equal(paths.examYear('quiz-1', 2025), '/exam/quiz-1/2025')
  assert.equal(paths.subjectExamYear('maths-1', 'quiz-1', 2025), '/pyq/maths-1/quiz-1/2025')
  // A paper's address always carries its day and month, so a bare year there is never a paper.
  const slugs = paperSlugs([
    { setId: 'a', subjectId: 's', examTypeId: 'q1', sessionDate: '2025-02-16', setCode: '1' },
    { setId: 'b', subjectId: 's', examTypeId: 'q1', sessionDate: null, setCode: '2025' },
  ])
  for (const slug of slugs.values()) assert.doesNotMatch(slug, /^\d{4}$/)
})
