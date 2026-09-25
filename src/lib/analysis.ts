import type { QuestionWithOptions } from '@/types/db'

/**
 * Post-attempt analysis.
 *
 * A score tells a student what happened. This tells them *why*, by crossing
 * correctness with how long each question took — the distinction between a
 * question you guessed in nine seconds and one you fought for four minutes and
 * still lost. Those need different responses, and a bare score hides both.
 *
 * The taxonomy is the one competitive-exam platforms converged on: an attempt
 * is not simply right or wrong, it is right-and-efficient, right-but-slow,
 * rushed, or sunk. It also counts time spent on questions that were ultimately
 * left blank, which is where a surprising share of an exam actually goes.
 */

export type AttemptQuality =
  | 'perfect' // correct, and not slow
  | 'slow_correct' // correct, but took well over the expected time
  | 'rushed' // wrong, answered far too quickly to have worked it out
  | 'sunk' // wrong, after spending well over the expected time
  | 'incorrect' // wrong, at an unremarkable pace
  | 'abandoned' // never answered, but real time was spent on it
  | 'skipped' // never answered, barely looked at
  | 'unmarked' // written answer, not auto-marked

/** Below this, a "time spent" reading is noise rather than behaviour. */
const MEANINGFUL_SECONDS = 5

/** Time spent on an unanswered question before it counts as abandoned. */
const ABANDONED_SECONDS = 25

const RUSHED_RATIO = 0.4
const SLOW_RATIO = 1.5

/**
 * How long a question ought to take. Peer data is used when enough people have
 * attempted it; otherwise a minute per mark, which is the rule of thumb exam
 * papers are actually built around.
 */
export function expectedSeconds(marks: number, peerAverage?: number | null): number {
  if (peerAverage && peerAverage >= MEANINGFUL_SECONDS) return peerAverage
  return Math.max(30, Math.round(marks * 60))
}

export interface QuestionAnalysisInput {
  questionId: string
  marks: number
  isCorrect: boolean | null
  answered: boolean
  autoMarked: boolean
  timeSpentSeconds: number | null
  peerAverageSeconds?: number | null
  peerCorrectPercentage?: number | null
  topics: string[]
}

export interface QuestionAnalysis extends QuestionAnalysisInput {
  quality: AttemptQuality
  expectedSeconds: number
  /** How the time compares to expectation: 1 is on the nose, 2 is double. */
  paceRatio: number | null
}

export function classifyAttempt(input: QuestionAnalysisInput): AttemptQuality {
  if (!input.autoMarked) return 'unmarked'

  const time = input.timeSpentSeconds
  const expected = expectedSeconds(input.marks, input.peerAverageSeconds)
  const known = time !== null && time >= MEANINGFUL_SECONDS

  if (!input.answered) {
    if (time !== null && time >= ABANDONED_SECONDS) return 'abandoned'
    return 'skipped'
  }

  if (input.isCorrect) {
    return known && time > expected * SLOW_RATIO ? 'slow_correct' : 'perfect'
  }

  if (!known) return 'incorrect'
  if (time < expected * RUSHED_RATIO) return 'rushed'
  if (time > expected * SLOW_RATIO) return 'sunk'
  return 'incorrect'
}

export function analyseQuestion(input: QuestionAnalysisInput): QuestionAnalysis {
  const expected = expectedSeconds(input.marks, input.peerAverageSeconds)
  return {
    ...input,
    quality: classifyAttempt(input),
    expectedSeconds: expected,
    paceRatio:
      input.timeSpentSeconds === null ? null : Number((input.timeSpentSeconds / expected).toFixed(2)),
  }
}

export interface TopicBreakdown {
  topic: string
  total: number
  correct: number
  /** Null when nothing in this topic was auto-markable. */
  accuracy: number | null
  timeSpentSeconds: number
}

/**
 * Per-topic performance. This is the part students act on: "revise indexing"
 * is a plan, "you scored 6/10" is not.
 */
export function topicBreakdown(questions: QuestionAnalysis[]): TopicBreakdown[] {
  const byTopic = new Map<string, { total: number; correct: number; marked: number; time: number }>()

  for (const question of questions) {
    for (const topic of question.topics) {
      const entry = byTopic.get(topic) ?? { total: 0, correct: 0, marked: 0, time: 0 }
      entry.total += 1
      entry.time += question.timeSpentSeconds ?? 0
      if (question.autoMarked) {
        entry.marked += 1
        if (question.isCorrect) entry.correct += 1
      }
      byTopic.set(topic, entry)
    }
  }

  return [...byTopic.entries()]
    .map(([topic, entry]) => ({
      topic,
      total: entry.total,
      correct: entry.correct,
      accuracy: entry.marked > 0 ? Math.round((entry.correct / entry.marked) * 100) : null,
      timeSpentSeconds: entry.time,
    }))
    // Weakest first: the point of this table is what to go and fix.
    .sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101) || b.total - a.total)
}

export interface AttemptSummary {
  answered: number
  total: number
  autoMarked: number
  correct: number
  /** Correct as a share of what was answered and markable — not of the paper. */
  accuracy: number | null
  timeSpentSeconds: number
  /** Time spent on questions that were never answered. */
  wastedSeconds: number
  counts: Record<AttemptQuality, number>
}

export function summarise(questions: QuestionAnalysis[]): AttemptSummary {
  const counts: Record<AttemptQuality, number> = {
    perfect: 0,
    slow_correct: 0,
    rushed: 0,
    sunk: 0,
    incorrect: 0,
    abandoned: 0,
    skipped: 0,
    unmarked: 0,
  }

  let answered = 0
  let autoMarked = 0
  let correct = 0
  let timeSpentSeconds = 0
  let wastedSeconds = 0

  for (const question of questions) {
    counts[question.quality] += 1
    timeSpentSeconds += question.timeSpentSeconds ?? 0

    if (question.answered) answered += 1
    else wastedSeconds += question.timeSpentSeconds ?? 0

    if (question.autoMarked) {
      autoMarked += 1
      if (question.isCorrect) correct += 1
    }
  }

  const answeredAndMarkable = questions.filter((q) => q.autoMarked && q.answered).length

  return {
    answered,
    total: questions.length,
    autoMarked,
    correct,
    accuracy:
      answeredAndMarkable > 0 ? Math.round((correct / answeredAndMarkable) * 100) : null,
    timeSpentSeconds,
    wastedSeconds,
    counts,
  }
}

export const QUALITY_LABELS: Record<AttemptQuality, string> = {
  perfect: 'Correct, good pace',
  slow_correct: 'Correct, but slow',
  rushed: 'Wrong — answered too fast',
  sunk: 'Wrong — after a long time',
  incorrect: 'Wrong',
  abandoned: 'Left blank after spending time',
  skipped: 'Skipped',
  unmarked: 'Not auto-marked',
}

/** Builds analysis input from a question plus the stored answer row. */
export function toAnalysisInput(
  question: QuestionWithOptions,
  answer: {
    is_correct: boolean | null
    time_spent_seconds: number | null
    response: unknown
  } | null,
  peer?: { avg_time_seconds: number | null; correct_percentage: number | null },
): QuestionAnalysisInput {
  const autoMarkable =
    question.type === 'mcq' || question.type === 'msq' || question.type === 'numerical'

  return {
    questionId: question.id,
    marks: Number(question.marks),
    isCorrect: answer?.is_correct ?? null,
    answered: answer?.response != null,
    autoMarked: autoMarkable && answer?.is_correct !== null && answer?.is_correct !== undefined,
    timeSpentSeconds: answer?.time_spent_seconds ?? null,
    peerAverageSeconds: peer?.avg_time_seconds ?? null,
    peerCorrectPercentage: peer?.correct_percentage ?? null,
    topics: question.topics ?? [],
  }
}
