import type { AnswerResponse, QuestionWithOptions } from '@/types/db'

/**
 * Marking rules.
 *
 * Deliberately conservative, because a practice site that reports a wrong score
 * is worse than one that reports no score. Where a real paper's marking scheme
 * is not something we can know from the question data, we do not invent one:
 *
 *  - mcq        exact option match, negative marking applied when configured
 *  - msq        exact set match only; no partial credit is guessed at
 *  - numerical  within answer_tolerance (default 0), inclusive
 *  - subjective and programming are never auto-marked; they are excluded from
 *    the score entirely rather than counted as wrong
 */

export interface QuestionResult {
  questionId: string
  isCorrect: boolean | null
  marksAwarded: number
  autoMarked: boolean
  correctOptionIds: string[]
  correctAnswer: string | null
}

/**
 * Negating a zero gives -0, which then leaks into the UI as "-0" and into the
 * database as a negative zero. Return a true zero when there is no penalty.
 */
function penalty(question: { negative_marks: number }): number {
  const value = Number(question.negative_marks ?? 0)
  return value > 0 ? -value : 0
}

export function isAutoMarkable(question: { type: string }): boolean {
  return question.type === 'mcq' || question.type === 'msq' || question.type === 'numerical'
}

export function selectedOptionIds(response: AnswerResponse | null | undefined): string[] {
  if (response && 'option_ids' in response && Array.isArray(response.option_ids)) {
    return response.option_ids
  }
  return []
}

export function responseValue(response: AnswerResponse | null | undefined): string | null {
  if (response && 'value' in response && typeof response.value === 'string') {
    return response.value
  }
  if (response && 'text' in response && typeof response.text === 'string') {
    return response.text
  }
  return null
}

export function isAnswered(response: AnswerResponse | null | undefined): boolean {
  if (!response) return false
  if ('option_ids' in response) return response.option_ids.length > 0
  if ('value' in response) return response.value.trim().length > 0
  if ('text' in response) return response.text.trim().length > 0
  return false
}

export function gradeQuestion(
  question: QuestionWithOptions,
  response: AnswerResponse | null | undefined,
): QuestionResult {
  const correctOptionIds = question.options
    .filter((option) => option.is_correct)
    .map((option) => option.id)

  const base: QuestionResult = {
    questionId: question.id,
    isCorrect: null,
    marksAwarded: 0,
    autoMarked: false,
    correctOptionIds,
    correctAnswer: question.correct_answer,
  }

  if (!isAutoMarkable(question)) return base
  base.autoMarked = true

  if (!isAnswered(response)) {
    // Unanswered is zero, never negative — negative marking applies to a wrong
    // attempt, not to leaving a question blank.
    base.isCorrect = false
    return base
  }

  if (question.type === 'mcq' || question.type === 'msq') {
    const selected = [...new Set(selectedOptionIds(response))].sort()
    const correct = [...correctOptionIds].sort()
    const matches =
      selected.length === correct.length &&
      selected.every((id, index) => id === correct[index])

    base.isCorrect = matches
    base.marksAwarded = matches
      ? Number(question.marks)
      : penalty(question)
    return base
  }

  // numerical
  const raw = responseValue(response)
  const submitted = raw === null ? Number.NaN : Number(raw.trim())
  const expected = Number(question.correct_answer)

  if (!Number.isFinite(submitted) || !Number.isFinite(expected)) {
    base.isCorrect = false
    base.marksAwarded = penalty(question)
    return base
  }

  const tolerance = Number(question.answer_tolerance ?? 0)
  const matches = Math.abs(submitted - expected) <= tolerance

  base.isCorrect = matches
  base.marksAwarded = matches ? Number(question.marks) : penalty(question)
  return base
}

export interface GradedAttempt {
  results: QuestionResult[]
  score: number
  maxScore: number
  correctCount: number
  autoMarkedCount: number
  manualCount: number
}

export function gradeAttempt(
  questions: QuestionWithOptions[],
  responses: Record<string, AnswerResponse | null | undefined>,
): GradedAttempt {
  const results = questions.map((question) => gradeQuestion(question, responses[question.id]))

  const autoMarked = results.filter((result) => result.autoMarked)
  const score = autoMarked.reduce((sum, result) => sum + result.marksAwarded, 0)
  const maxScore = questions
    .filter((question) => isAutoMarkable(question))
    .reduce((sum, question) => sum + Number(question.marks), 0)

  return {
    results,
    score: Number(score.toFixed(2)),
    maxScore: Number(maxScore.toFixed(2)),
    correctCount: autoMarked.filter((result) => result.isCorrect).length,
    autoMarkedCount: autoMarked.length,
    manualCount: results.length - autoMarked.length,
  }
}
