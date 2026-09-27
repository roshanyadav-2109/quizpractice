import { formatCount, formatSession } from '@/lib/format'
import type { Term } from '@/lib/terms'
import type { Subject } from '@/types/db'

/**
 * How things are named in titles, headings and descriptions: the way
 * students search for them. Nobody types "Mathematics for Data Science I
 * Quiz 1 previous year question paper"; they type "maths 1 quiz 1 pyq".
 * So a page leads with the short name and carries the official one after.
 */

/** "Maths 1", "Stats 1", "CT", "PDSA" — what students call the subject. */
export function shortName(subject: Pick<Subject, 'name' | 'aliases'> & { short_name?: string | null }): string {
  if (subject.short_name) return subject.short_name
  const aliases = subject.aliases ?? []
  // "Maths 1" beats "Maths1"; an acronym like "PDSA" beats the full name.
  const spaced = aliases.find((alias) => /^[A-Za-z]+ \d$/.test(alias))
  if (spaced) return spaced
  const acronym = aliases.find((alias) => /^[A-Z][A-Z0-9]{1,5}$/.test(alias))
  if (acronym) return acronym
  return subject.name
}

/** "Maths 1 (Mathematics for Data Science I)", or the name alone when the two are the same. */
export function bothNames(subject: Pick<Subject, 'name' | 'aliases'> & { short_name?: string | null }): string {
  const short = shortName(subject)
  return short === subject.name ? subject.name : `${short} (${subject.name})`
}

/** "January 2025 term" */
export function termName(term: Term | null): string {
  return term ? term.label : 'Undated'
}

/** "Jan 2025" */
export function termShort(term: Term | null): string {
  return term ? term.short : ''
}

/** "16 Feb 2025" */
export function sittingDate(date: string | null): string {
  return formatSession(date)
}

/**
 * When some papers were sat, as a phrase: "in the May 2024 term", or
 * "between the May 2024 term and the September 2025 term". Terms oldest first.
 */
export function termRange(terms: Term[]): string {
  const first = terms[0]
  const last = terms[terms.length - 1]
  if (!first || !last) return ''
  return first.key === last.key ? `in the ${first.label}` : `between the ${first.label} and the ${last.label}`
}

/** "2022–2026", or one year. */
export function yearSpan(years: number[]): string {
  if (years.length === 0) return ''
  const min = Math.min(...years)
  const max = Math.max(...years)
  return min === max ? String(min) : `${min}–${max}`
}

/** 1 → "1 paper", 3 → "3 papers". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${formatCount(count)} ${count === 1 ? one : many}`
}

/** "A, B and C" */
export function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}
