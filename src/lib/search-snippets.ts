import { blocksToText, type Block } from '@/lib/blocks/schema'

export type MatchIn = 'question' | 'options' | 'code' | 'table' | 'details'

export const MATCH_LABEL: Record<MatchIn, string> = {
  question: 'Question text',
  options: 'Options',
  code: 'Code block',
  table: 'Table cell',
  details: 'Paper details',
}

export interface Snippet {
  in: MatchIn
  before: string
  hit: string
  after: string
}

/** Markdown and LaTeX punctuation that reads as noise in a one-line snippet. */
function plain(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>|\\$]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The strings to look for. Postgres matched on word stems, so "normalisation"
 * can have matched "normalised" — each word is also tried as a prefix, which
 * is what lets the snippet find the passage the database actually hit.
 */
function needles(term: string): string[] {
  const words = term
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}()]/gu, ''))
    .filter((w) => w.length >= 2)
  const out = new Set<string>()
  if (words.length > 1) out.add(words.join(' '))
  for (const word of words) {
    out.add(word)
    if (word.length > 5) out.add(word.slice(0, Math.max(4, word.length - 3)))
  }
  return [...out].sort((a, b) => b.length - a.length)
}

function cut(text: string, term: string): { before: string; hit: string; after: string } | null {
  const lower = text.toLowerCase()
  for (const needle of needles(term)) {
    const at = lower.indexOf(needle)
    if (at === -1) continue
    const RADIUS = 70
    let start = Math.max(0, at - RADIUS)
    let end = Math.min(text.length, at + needle.length + RADIUS)
    // Snap to word boundaries so the snippet never opens mid-word.
    if (start > 0) start = text.indexOf(' ', start) + 1 || start
    if (end < text.length) end = text.lastIndexOf(' ', end) > at ? text.lastIndexOf(' ', end) : end
    return {
      before: (start > 0 ? '…' : '') + text.slice(start, at),
      hit: text.slice(at, at + needle.length),
      after: text.slice(at + needle.length, end) + (end < text.length ? '…' : ''),
    }
  }
  return null
}

/**
 * Where a search hit matched, and the passage around it.
 *
 * Checked in order of what is most worth knowing: a match inside code or a
 * table is the thing structured content makes possible, so it is named
 * first; then the options; then the question's prose; then the paper itself.
 */
export function locateMatch(
  term: string,
  body: Block[],
  options: Block[][],
  details: string,
): Snippet {
  const code = body.filter((b) => b.type === 'code')
  const tables = body.filter((b) => b.type === 'table' || b.type === 'relation')
  const prose = body.filter((b) => !['code', 'table', 'relation'].includes(b.type))

  const places: [MatchIn, string][] = [
    ['code', code.map((b) => (b.type === 'code' ? b.source : '')).join('\n')],
    ['table', plain(blocksToText(tables))],
    ...options.map((o): [MatchIn, string] => ['options', plain(blocksToText(o))]),
    ['question', plain(blocksToText(prose))],
    ['details', details],
  ]

  for (const [where, text] of places) {
    if (!text) continue
    const found = cut(where === 'code' ? text.replace(/\s+/g, ' ') : text, term)
    if (found) return { in: where, ...found }
  }

  // Matched somewhere this cannot see (a stemmed form in a diagram label, say):
  // show the start of the question rather than nothing.
  const opening = plain(blocksToText(prose)).slice(0, 160)
  return { in: 'question', before: opening + (opening.length === 160 ? '…' : ''), hit: '', after: '' }
}
