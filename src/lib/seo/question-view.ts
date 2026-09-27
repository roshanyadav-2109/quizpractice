import { blocksToText } from '@/lib/blocks/schema'
import type { QuestionWithOptions } from '@/types/db'
import type { QuizQuestion } from './jsonld'
import { questionSlug } from './paths'
import { headlineTextOf, indexableText, slugTextOf, substanceOf, textBlocksOf } from './question-text'

/**
 * A question as the public pages describe it: its answer in words, its
 * kind, its address, and whether it is worth a search result of its own.
 */

const KIND: Record<QuestionWithOptions['type'], QuizQuestion['kind']> = {
  mcq: 'Multiple choice',
  msq: 'Multiple select',
  numerical: 'Numerical',
  subjective: 'Written',
  programming: 'Written',
}

export const TYPE_NAME: Record<QuestionWithOptions['type'], string> = {
  mcq: 'MCQ',
  msq: 'MSQ',
  numerical: 'Numerical',
  subjective: 'Written',
  programming: 'Programming',
}

/**
 * Plain text, flattened and trimmed: markdown emphasis, headings and link
 * syntax removed, so a title or a snippet reads as words. The LaTeX inside
 * maths is kept — `x^2` is still the clearest way to say it in plain text —
 * but its dollar signs go.
 */
export function plain(text: string, max = 5000): string {
  const flat = text
    // Markdown escapes ("Delivery\_Fee") read as the character itself.
    .replace(/\\([\\`*_{}[\]()#+\-.!|~>])/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|\*|`)/g, '')
    .replace(/^#+\s*/gm, '')
    // List markers, which read as stray dashes once the lines are joined.
    .replace(/^\s*(?:[-+•]|\d{1,2}[.)])\s+/gm, '')
    // Maths delimiters: "$x^2$" reads as "x^2" in a title or a snippet.
    .replace(/\$\$?([^$]+?)\$\$?/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/** An option as text: "(B) 35.00". */
export function optionText(option: QuestionWithOptions['options'][number]): string {
  const body = plain(blocksToText(option.content), 400)
  return `(${option.label}) ${body}`.trim()
}

/** The correct answers, each in words: the right options, or the value with its tolerance. */
export function answerParts(question: QuestionWithOptions): string[] {
  if (question.type === 'mcq' || question.type === 'msq') {
    return question.options.filter((option) => option.is_correct).map(optionText)
  }
  if (!question.correct_answer) return []
  const tolerance = Number(question.answer_tolerance)
  return [tolerance > 0 ? `${question.correct_answer} (±${tolerance})` : question.correct_answer]
}

/**
 * The correct answer as a sentence fragment: "(B) 35.00", "(A) … and (C) …",
 * "42 (±0.5)". Null when the answer key has nothing for it.
 */
export function answerText(question: QuestionWithOptions): string | null {
  const parts = answerParts(question)
  if (parts.length === 0) return null
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

/** Everything the question says, figures' alt text included. */
export function questionText(question: QuestionWithOptions): string {
  return plain(blocksToText(question.body))
}

/**
 * What the question is called in a title or a link: its own prose, without
 * a comprehension's shared stem, cut at `max`. Empty for a question that is
 * only a figure.
 */
export function titleText(question: Pick<QuestionWithOptions, 'body'>, max = 110): string {
  const prose = question.body.flatMap((block) => (block.type === 'text' ? [block.md] : []))
  return plain(headlineTextOf(prose), max)
}

export function questionSlugOf(question: Pick<QuestionWithOptions, 'number' | 'body'>): string {
  return questionSlug(question.number, slugTextOf(question.body))
}

/** Enough text of its own to be a search result, rather than a figure and a number. */
export function isSubstantial(question: Pick<QuestionWithOptions, 'body'>): boolean {
  return indexableText(textBlocksOf(question.body), substanceOf(question.body))
}

export function toQuizQuestion(question: QuestionWithOptions, url: string): QuizQuestion {
  return {
    name: `Question ${question.number}`,
    text: plain(questionText(question), 1500),
    answers: answerParts(question),
    options: question.options.map(optionText),
    url,
    kind: KIND[question.type],
  }
}
