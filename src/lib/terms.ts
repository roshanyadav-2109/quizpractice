/**
 * The IIT Madras BS year runs three terms — January, May and September — and
 * each has its own Quiz 1, Quiz 2 and End Term. A paper records only the day
 * it was sat, so its term is worked out from that date:
 *
 *   February – May        January term     (its End Term can reach May)
 *   June – September      May term         (its End Term can reach September)
 *   October – December    September term
 *   January               the previous year's September term (a late End Term)
 *
 * Checked against the whole bank: every term's quizzes and End Term fall
 * together under these boundaries.
 */

export type TermSeason = 'jan' | 'may' | 'sep'

export interface Term {
  /** Stable and sortable in a URL: "2026-jan". */
  key: string
  year: number
  season: TermSeason
  /** "January 2026 term" */
  label: string
  /** "Jan 2026" */
  short: string
  /** Larger is later. */
  order: number
}

const SEASONS: Record<TermSeason, { name: string; abbr: string; rank: number }> = {
  jan: { name: 'January', abbr: 'Jan', rank: 1 },
  may: { name: 'May', abbr: 'May', rank: 2 },
  sep: { name: 'September', abbr: 'Sep', rank: 3 },
}

function make(year: number, season: TermSeason): Term {
  const { name, abbr, rank } = SEASONS[season]
  return {
    key: `${year}-${season}`,
    year,
    season,
    label: `${name} ${year} term`,
    short: `${abbr} ${year}`,
    order: year * 10 + rank,
  }
}

/** The term a paper sat on `sessionDate` (YYYY-MM-DD) belongs to. */
export function termOf(sessionDate: string | null | undefined): Term | null {
  if (!sessionDate) return null
  const year = Number(sessionDate.slice(0, 4))
  const month = Number(sessionDate.slice(5, 7))
  if (!year || !month) return null

  // September terms end in December; a January sitting is the January
  // term's first quiz (30 Jan 2022).
  if (month <= 5) return make(year, 'jan')
  if (month <= 9) return make(year, 'may')
  return make(year, 'sep')
}

/** A term back from its URL key, or null if the key is not one. */
export function termFromKey(key: string | null | undefined): Term | null {
  const match = /^(\d{4})-(jan|may|sep)$/.exec(key ?? '')
  return match ? make(Number(match[1]), match[2] as TermSeason) : null
}

export const SEASON_ORDER: TermSeason[] = ['jan', 'may', 'sep']

function isSeason(value: string | undefined): value is TermSeason {
  return value === 'jan' || value === 'may' || value === 'sep'
}

export interface YearTermFilter {
  /** Years that have papers, latest first. A year is its terms' year. */
  years: number[]
  year: number | null
  /** The terms to offer, by name only — within the chosen year, if any. */
  seasons: TermSeason[]
  season: TermSeason | null
  /** The terms that pass, latest first — for grouping the papers under. */
  terms: Term[]
  /** Whether a paper sat on this date passes the filter. */
  matches: (sessionDate: string | null) => boolean
}

/**
 * Two independent choices: a year, and a term by name — January, May or
 * September. A term on its own means that term in every year; with a year, the
 * one sitting. (An older link's "2026-jan" still works, as year and term.)
 */
export function yearTermFilter(
  papers: { session_date: string | null }[],
  query: { year?: string; term?: string },
): YearTermFilter {
  const all = termsOf(papers)
  const years = [...new Set(all.map((term) => term.year))].sort((a, b) => b - a)

  const legacy = termFromKey(query.term)
  const year = years.find((y) => String(y) === (query.year ?? String(legacy?.year ?? ''))) ?? null
  const inYear = year === null ? all : all.filter((term) => term.year === year)
  const seasons = SEASON_ORDER.filter((season) => inYear.some((term) => term.season === season))

  const asked = isSeason(query.term) ? query.term : (legacy?.season ?? null)
  // A term that year did not have is set aside rather than showing nothing.
  const season = asked && seasons.includes(asked) ? asked : null
  const terms = inYear.filter((term) => season === null || term.season === season)

  return {
    years,
    year,
    seasons,
    season,
    terms,
    matches(sessionDate) {
      const of = termOf(sessionDate)
      if (!of) return year === null && season === null
      return (year === null || of.year === year) && (season === null || of.season === season)
    },
  }
}

/** "January term" for a term by name. */
export function seasonName(season: TermSeason): string {
  return `${SEASONS[season].name} term`
}

/** The distinct terms of some papers, latest first. */
export function termsOf(papers: { session_date: string | null }[]): Term[] {
  const byKey = new Map<string, Term>()
  for (const paper of papers) {
    const term = termOf(paper.session_date)
    if (term) byKey.set(term.key, term)
  }
  return [...byKey.values()].sort((a, b) => b.order - a.order)
}
