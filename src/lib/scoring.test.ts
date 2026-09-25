import test from 'node:test'
import assert from 'node:assert/strict'
import { gradeAttempt, gradeQuestion } from './scoring'
import type { QuestionWithOptions } from '@/types/db'

function mcq(overrides: Partial<QuestionWithOptions> = {}): QuestionWithOptions {
  return {
    id: 'q1',
    set_id: 's1',
    number: 1,
    type: 'mcq',
    body: [],
    schema_version: 1,
    marks: 2,
    negative_marks: 0,
    correct_answer: null,
    answer_tolerance: null,
    topics: [],
    difficulty: null,
    status: 'published',
    options: [
      { id: 'a', question_id: 'q1', label: 'A', content: [], is_correct: false, sort_order: 0 },
      { id: 'b', question_id: 'q1', label: 'B', content: [], is_correct: true, sort_order: 1 },
      { id: 'c', question_id: 'q1', label: 'C', content: [], is_correct: false, sort_order: 2 },
    ],
    ...overrides,
  }
}

test('mcq: correct option earns full marks', () => {
  const result = gradeQuestion(mcq(), { option_ids: ['b'] })
  assert.equal(result.isCorrect, true)
  assert.equal(result.marksAwarded, 2)
})

test('mcq: wrong option applies negative marking', () => {
  const result = gradeQuestion(mcq({ negative_marks: 0.5 }), { option_ids: ['a'] })
  assert.equal(result.isCorrect, false)
  assert.equal(result.marksAwarded, -0.5)
})

test('mcq: unanswered scores zero, never negative', () => {
  const result = gradeQuestion(mcq({ negative_marks: 0.5 }), { option_ids: [] })
  assert.equal(result.isCorrect, false)
  assert.equal(result.marksAwarded, 0)
})

test('msq: exact set match earns full marks regardless of order', () => {
  const question = mcq({
    type: 'msq',
    options: [
      { id: 'a', question_id: 'q1', label: 'A', content: [], is_correct: true, sort_order: 0 },
      { id: 'b', question_id: 'q1', label: 'B', content: [], is_correct: true, sort_order: 1 },
      { id: 'c', question_id: 'q1', label: 'C', content: [], is_correct: false, sort_order: 2 },
    ],
  })
  assert.equal(gradeQuestion(question, { option_ids: ['b', 'a'] }).isCorrect, true)
})

test('msq: a partial selection is not credited', () => {
  const question = mcq({
    type: 'msq',
    options: [
      { id: 'a', question_id: 'q1', label: 'A', content: [], is_correct: true, sort_order: 0 },
      { id: 'b', question_id: 'q1', label: 'B', content: [], is_correct: true, sort_order: 1 },
    ],
  })
  const result = gradeQuestion(question, { option_ids: ['a'] })
  assert.equal(result.isCorrect, false)
  assert.equal(result.marksAwarded, 0)
})

test('numerical: within tolerance is correct', () => {
  const question = mcq({
    type: 'numerical',
    options: [],
    correct_answer: '96.67',
    answer_tolerance: 0.5,
    marks: 3,
  })
  assert.equal(gradeQuestion(question, { value: '96.7' }).isCorrect, true)
  assert.equal(gradeQuestion(question, { value: '97.5' }).isCorrect, false)
})

test('numerical: tolerance boundary is inclusive', () => {
  const question = mcq({
    type: 'numerical',
    options: [],
    correct_answer: '10',
    answer_tolerance: 0.5,
  })
  assert.equal(gradeQuestion(question, { value: '10.5' }).isCorrect, true)
})

test('numerical: non-numeric input is wrong, not a crash', () => {
  const question = mcq({ type: 'numerical', options: [], correct_answer: '10' })
  assert.equal(gradeQuestion(question, { value: 'ten' }).isCorrect, false)
})

test('programming questions are never auto-marked', () => {
  const question = mcq({ type: 'programming', options: [], marks: 5 })
  const result = gradeQuestion(question, { text: 'SELECT 1' })
  assert.equal(result.autoMarked, false)
  assert.equal(result.isCorrect, null)
  assert.equal(result.marksAwarded, 0)
})

test('attempt total excludes manually marked questions from max score', () => {
  const questions = [
    mcq({ id: 'q1', marks: 2 }),
    mcq({ id: 'q2', type: 'programming', options: [], marks: 5 }),
  ]
  const graded = gradeAttempt(questions, { q1: { option_ids: ['b'] } })

  assert.equal(graded.score, 2)
  assert.equal(graded.maxScore, 2, 'the 5-mark programming question is not in the denominator')
  assert.equal(graded.manualCount, 1)
  assert.equal(graded.correctCount, 1)
})
