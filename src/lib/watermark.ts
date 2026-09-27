import { createHash } from 'node:crypto'
import type { Block } from '@/lib/blocks/schema'
import type { QuestionWithOptions } from '@/types/db'

/**
 * An invisible mark of the account a full paper was shown to, written into
 * each question's first sentence of prose as zero-width characters: a word
 * joiner, 32 bits, a word joiner. It does not show, does not change how the
 * text reads or wraps, and survives copy and paste — so questions found on
 * another site can be traced to the account that opened them:
 *
 *   npm run watermark:find -- copied.html
 *
 * Only pages shown to a signed-in student are marked. The public pages — the
 * papers' free previews — are the same for everyone and carry no mark.
 * Kept free of server-only imports so the script above can use it.
 */

const ZERO = '\u200b'
const ONE = '\u200c'
const EDGE = '\u2060'

/** The 32-bit mark of an account: the first 8 hex digits of sha256(user id). */
export function markOf(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 8)
}

/** The mark as zero-width characters. */
export function encodeMark(mark: string): string {
  const bits = Number.parseInt(mark, 16).toString(2).padStart(32, '0')
  return `${EDGE}${[...bits].map((bit) => (bit === '1' ? ONE : ZERO)).join('')}${EDGE}`
}

/** Every mark in a piece of text, as 8 hex digits. */
export function readMarks(text: string): string[] {
  const found = text.match(new RegExp(`${EDGE}[${ZERO}${ONE}]{32}${EDGE}`, 'g')) ?? []
  return found.map((hit) =>
    Number.parseInt([...hit.slice(1, -1)].map((char) => (char === ONE ? '1' : '0')).join(''), 2)
      .toString(16)
      .padStart(8, '0'),
  )
}

/**
 * Where in Markdown a mark can go unseen and unharmed: after a space between
 * two letters of plain prose — never inside $maths$ or `code`, nor on a table
 * row, a heading, a quote or a list line, where a stray character could
 * change what the line is. -1 when there is no such place.
 */
export function markAt(md: string): number {
  let math = false
  let code = false
  let lineStart = 0
  for (let i = 0; i < md.length; i += 1) {
    const char = md[i]
    if (char === '\n') lineStart = i + 1
    if (char === '`') code = !code
    else if (char === '$' && md[i - 1] !== '\\' && !code) math = !math
    if (math || code || char !== ' ') continue
    if (/^\s*([|#>]|[-*+]\s|\d+\.\s)/.test(md.slice(lineStart, lineStart + 4))) continue
    if (/\p{L}/u.test(md[i - 1] ?? '') && /\p{L}/u.test(md[i + 1] ?? '')) return i + 1
  }
  return -1
}

/** The blocks with the mark in their first text block that has room for it. */
export function markBlocks(blocks: Block[], mark: string): Block[] {
  let done = false
  return blocks.map((block) => {
    if (done || block.type !== 'text') return block
    const at = markAt(block.md)
    if (at < 0) return block
    done = true
    return { ...block, md: `${block.md.slice(0, at)}${mark}${block.md.slice(at)}` }
  })
}

/** The questions, each carrying the account's mark. */
export function watermark(questions: QuestionWithOptions[], userId: string): QuestionWithOptions[] {
  const mark = encodeMark(markOf(userId))
  return questions.map((question) => ({ ...question, body: markBlocks(question.body, mark) }))
}
