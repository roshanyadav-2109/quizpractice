import test from 'node:test'
import assert from 'node:assert/strict'
import {
  analyseQuestion,
  classifyAttempt,
  expectedSeconds,
  summarise,
  topicBreakdown,
  type QuestionAnalysisInput,
} from './analysis'

function input(overrides: Partial<QuestionAnalysisInput> = {}): QuestionAnalysisInput {
  return {
    questionId: 'q1',
    marks: 2,
    isCorrect: true,
    answered: true,
    autoMarked: true,
    timeSpentSeconds: 100,
    topics: [],
    ...overrides,
  }
}

test('expected time falls back to a minute per mark', () => {
  assert.equal(expectedSeconds(3), 180)
  assert.equal(expectedSeconds(0.5), 30, 'never expects less than 30 seconds')
})

test('expected time prefers peer data when there is enough of it', () => {
  assert.equal(expectedSeconds(3, 45), 45)
  assert.equal(expectedSeconds(3, 2), 180, 'ignores an implausibly small peer average')
})

test('correct and on pace is perfect', () => {
  assert.equal(classifyAttempt(input({ timeSpentSeconds: 90 })), 'perfect')
})

test('correct but well over expected is flagged as slow', () => {
  // 2 marks -> 120s expected; 1.5x is the threshold.
  assert.equal(classifyAttempt(input({ timeSpentSeconds: 200 })), 'slow_correct')
})

test('wrong and very fast reads as a guess', () => {
  assert.equal(
    classifyAttempt(input({ isCorrect: false, timeSpentSeconds: 20 })),
    'rushed',
  )
})

test('wrong after a long time is sunk, not a guess', () => {
  assert.equal(
    classifyAttempt(input({ isCorrect: false, timeSpentSeconds: 400 })),
    'sunk',
  )
})

test('wrong at an ordinary pace is just wrong', () => {
  assert.equal(
    classifyAttempt(input({ isCorrect: false, timeSpentSeconds: 110 })),
    'incorrect',
  )
})

test('unanswered but dwelt on is abandoned, not skipped', () => {
  assert.equal(
    classifyAttempt(input({ answered: false, isCorrect: false, timeSpentSeconds: 90 })),
    'abandoned',
  )
  assert.equal(
    classifyAttempt(input({ answered: false, isCorrect: false, timeSpentSeconds: 3 })),
    'skipped',
  )
})

test('missing timing never invents a verdict about pace', () => {
  assert.equal(
    classifyAttempt(input({ isCorrect: false, timeSpentSeconds: null })),
    'incorrect',
    'without a clock we cannot claim it was rushed',
  )
  assert.equal(analyseQuestion(input({ timeSpentSeconds: null })).paceRatio, null)
})

test('written answers are never classified on pace', () => {
  assert.equal(
    classifyAttempt(input({ autoMarked: false, timeSpentSeconds: 900 })),
    'unmarked',
  )
})

test('accuracy is of what was attempted, not of the paper', () => {
  const summary = summarise([
    analyseQuestion(input({ questionId: 'a', isCorrect: true })),
    analyseQuestion(input({ questionId: 'b', isCorrect: false })),
    // Skipped entirely — must not count against accuracy.
    analyseQuestion(
      input({ questionId: 'c', answered: false, isCorrect: false, timeSpentSeconds: 0 }),
    ),
  ])

  assert.equal(summary.answered, 2)
  assert.equal(summary.total, 3)
  assert.equal(summary.accuracy, 50, '1 of 2 attempted, not 1 of 3')
})

test('time on unanswered questions is reported separately', () => {
  const summary = summarise([
    analyseQuestion(input({ questionId: 'a', timeSpentSeconds: 60 })),
    analyseQuestion(
      input({ questionId: 'b', answered: false, isCorrect: false, timeSpentSeconds: 120 }),
    ),
  ])

  assert.equal(summary.timeSpentSeconds, 180)
  assert.equal(summary.wastedSeconds, 120)
})

test('topic breakdown puts the weakest topic first', () => {
  const rows = topicBreakdown([
    analyseQuestion(input({ questionId: 'a', isCorrect: true, topics: ['sql'] })),
    analyseQuestion(input({ questionId: 'b', isCorrect: true, topics: ['sql'] })),
    analyseQuestion(input({ questionId: 'c', isCorrect: false, topics: ['er-model'] })),
    analyseQuestion(input({ questionId: 'd', isCorrect: false, topics: ['er-model'] })),
  ])

  assert.equal(rows[0].topic, 'er-model')
  assert.equal(rows[0].accuracy, 0)
  assert.equal(rows[1].topic, 'sql')
  assert.equal(rows[1].accuracy, 100)
})

test('a topic with nothing markable reports no accuracy rather than zero', () => {
  const rows = topicBreakdown([
    analyseQuestion(input({ autoMarked: false, topics: ['essay'] })),
  ])
  assert.equal(rows[0].accuracy, null)
})
