import type { Block } from '@/lib/blocks/schema'

/**
 * The words a question is known by — its page title and its URL — and
 * whether it has enough text to be a search result at all.
 *
 * The URL half mirrors public_question_index() (migration 0030): the
 * database returns each question's text blocks, cut at 400 characters, and
 * the slug is chosen from them here, the same way the page chooses it from
 * the full question. Change one and the sitemap starts listing redirects.
 */

/** Minimum characters of text and code for a question page to be worth indexing. */
export const INDEXABLE_SUBSTANCE = 60

/** How much of each text block the database hands over. */
export const TEXT_BLOCK_LIMIT = 400

/**
 * Shared stems: the line a comprehension or data set opens every one of its
 * sub-questions with. As a title they would make dozens of pages identical,
 * so the title and URL come from the sub-question itself.
 */
const STEM = [
  /answer the (given|following|below) sub-?questions?/i,
  /^(read|listen to|study|observe|refer to) the (following|given|above|below|audio|passage|data|table|figure|graph|text|conversation|poem|extract)/i,
  /^based on the (above|given|following|below) (data|information|passage|table|figure|graph|text)/i,
  /^this question has \d+ sub-?questions?/i,
  /^(use|using) the (following|given|above) (data|information|table) (to|for)/i,
  /^this is (the )?question paper for/i,
  /^(the )?(following|next) (\d+ )?questions? (are|is) based on/i,
]

/** A block of prose worth titling a page with: not a stem, not a file name, not empty. */
function meaningful(text: string): boolean {
  const cleaned = text.replace(/\S+\.(mp3|wav|m4a|png|jpe?g|gif|pdf)\b/gi, '').trim()
  return cleaned.length >= 12 && !STEM.some((pattern) => pattern.test(cleaned))
}

/** The prose blocks of a body, each cut as the database cuts them. */
export function textBlocksOf(blocks: Block[]): string[] {
  return blocks.flatMap((block) =>
    block.type === 'text' ? [Array.from(block.md).slice(0, TEXT_BLOCK_LIMIT).join('')] : [],
  )
}

/**
 * The text a question is titled by: its prose from the first block that is
 * not a shared stem. A question that is all stem keeps its stem — there is
 * nothing better to call it.
 */
export function headlineTextOf(textBlocks: string[]): string {
  const start = textBlocks.findIndex(meaningful)
  return (start >= 0 ? textBlocks.slice(start) : textBlocks).join(' ')
}

/**
 * Whether a question has words of its own: a sub-question beyond its shared
 * stem, or no prose at all (code alone). A stem and a figure is not a search
 * result anyone wants, however long the stem.
 */
export function hasOwnWords(textBlocks: string[]): boolean {
  return textBlocks.length === 0 || textBlocks.some(meaningful)
}

/** Worth indexing: enough text and code, and not just a shared stem. Mirrored by the sitemap. */
export function indexableText(textBlocks: string[], substance: number): boolean {
  return substance >= INDEXABLE_SUBSTANCE && hasOwnWords(textBlocks)
}

/** What the URL's words come from. */
export function slugTextOf(blocks: Block[]): string {
  return headlineTextOf(textBlocksOf(blocks))
}

/** Characters of prose and code in the body — a figure alone counts for nothing. */
export function substanceOf(blocks: Block[]): number {
  let total = 0
  for (const block of blocks) {
    if (block.type === 'text') total += Array.from(block.md).length
    else if (block.type === 'code') total += Array.from(block.source).length
  }
  return total
}
