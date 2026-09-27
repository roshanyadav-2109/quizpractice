/**
 * Every public URL the site hands out, built in one place.
 *
 * The catalogue reads the way students search: `/pyq/maths-1/quiz-1` is
 * "Maths 1 Quiz 1 PYQ", and a paper is named by the day it was sat,
 * `/pyq/maths-1/quiz-1/16-feb-2025`. Nothing here may change lightly: these
 * are the addresses search engines have indexed, and the old query-string
 * forms are redirected onto them.
 *
 * Pure: no database, no Next — so the rules are unit tested and shared by
 * pages, sitemaps and redirects alike.
 */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const

/** Lower case, ASCII, words joined by single hyphens. */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** A sitting date as it appears in a URL: 2025-02-16 → "16-feb-2025". */
export function dateSlug(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
  if (!match) return slugify(date)
  const month = MONTHS[Number(match[2]) - 1]
  return month ? `${Number(match[3])}-${month}-${match[1]}` : slugify(date)
}

/** Back from "16-feb-2025" to 2025-02-16, or null if it is not a date slug. */
export function dateFromSlug(slug: string): string | null {
  const match = /^(\d{1,2})-([a-z]{3})-(\d{4})/.exec(slug)
  if (!match) return null
  const month = MONTHS.indexOf(match[2] as (typeof MONTHS)[number])
  if (month < 0) return null
  return `${match[3]}-${String(month + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}`
}

export interface SlugInput {
  setId: string
  subjectId: string
  examTypeId: string
  sessionDate: string | null
  setCode: string
}

/**
 * A slug for every set, unique within its subject and exam.
 *
 * A sitting with one set is just its date. Where the same subject and exam
 * were sat in several sets on one day — an End Term run in morning and
 * afternoon slots, a qualifier in fifteen — each set adds its code:
 * "26-oct-2025-qdf2". Subject + exam + date + set code is unique in the
 * database, so the result is too.
 */
export function paperSlugs(sets: SlugInput[]): Map<string, string> {
  const groups = new Map<string, SlugInput[]>()
  for (const set of sets) {
    const key = `${set.subjectId}|${set.examTypeId}|${set.sessionDate ?? ''}`
    const group = groups.get(key)
    if (group) group.push(set)
    else groups.set(key, [set])
  }

  const slugs = new Map<string, string>()
  const taken = new Set<string>()
  for (const group of groups.values()) {
    for (const set of group) {
      const base = set.sessionDate ? dateSlug(set.sessionDate) : 'undated'
      const code = slugify(set.setCode)
      let slug = group.length > 1 || !set.sessionDate ? `${base}${code ? `-${code}` : ''}` : base
      // Belt and braces: never hand two sets the same address.
      const scope = `${set.subjectId}|${set.examTypeId}|`
      if (taken.has(scope + slug)) slug = `${slug}-${set.setId.slice(0, 6)}`
      taken.add(scope + slug)
      slugs.set(set.setId, slug)
    }
  }
  return slugs
}

/**
 * A programme's address word, from its everyday name: "Data Science", not
 * the internal "ds". Derived from the data, so a new programme gets one
 * without a code change.
 */
export function programSlug(program: { slug: string; short_name: string | null; name: string }): string {
  return slugify(program.short_name ?? program.name) || program.slug
}

/** Words that carry no meaning in a URL. */
const STOP = new Set(['the', 'a', 'an', 'of', 'is', 'are', 'to', 'in', 'and', 'or', 'for', 'on', 'be', 'which', 'what', 'following'])

/**
 * A question's slug: its number, then the first few meaningful words of its
 * text — "q12-average-fee-delivery-fee-relation". The number alone identifies
 * the question; the words are for people and search engines, and a question
 * edited later still resolves by its number and is redirected to the new words.
 */
export function questionSlug(number: number, text: string): string {
  const words = slugify(
    text
      .replace(/\$\$?[^$]*\$\$?/g, ' ')
      .replace(/\\[a-zA-Z]+/g, ' ')
      .replace(/`[^`]*`/g, ' ')
      .replace(/\S+\.(mp3|wav|m4a|png|jpe?g|gif|pdf)\b/gi, ' '),
  )
    .split('-')
    .filter(
      (word) =>
        word.length > 1 &&
        !STOP.has(word) &&
        !/^\d+$/.test(word) &&
        // Codes and file ids ("hs1001qfq2e1s1q6mq") say nothing to a reader.
        !(/\d/.test(word) && /[a-z]/.test(word) && word.length > 8),
    )
    .slice(0, 7)
  let tail = words.join('-')
  // Cut long runs at a word boundary, never mid-word.
  if (tail.length > 60) tail = tail.slice(0, 61).replace(/-[^-]*$/, '')
  return tail ? `q${number}-${tail}` : `q${number}`
}

/** The question number back from a slug, or null. */
export function questionNumberFromSlug(slug: string): number | null {
  const match = /^q(\d{1,4})(?:-|$)/.exec(slug)
  return match ? Number(match[1]) : null
}

export const paths = {
  home: () => '/',
  subjects: () => '/subjects',
  search: () => '/search',
  subject: (subject: string) => `/pyq/${subject}`,
  subjectExam: (subject: string, exam: string) => `/pyq/${subject}/${exam}`,
  paper: (subject: string, exam: string, paper: string) => `/pyq/${subject}/${exam}/${paper}`,
  question: (subject: string, exam: string, paper: string, question: string) =>
    `/pyq/${subject}/${exam}/${paper}/${question}`,
  exam: (exam: string) => `/exam/${exam}`,
  /** One exam, one calendar year, every subject: /exam/quiz-1/2025. */
  examYear: (exam: string, year: number) => `/exam/${exam}/${year}`,
  /** Every paper sat in a year: /year/2025. */
  year: (year: number) => `/year/${year}`,
  /** One subject's exam in one year: /pyq/maths-1/quiz-1/2025. */
  subjectExamYear: (subject: string, exam: string, year: number) => `/pyq/${subject}/${exam}/${year}`,

  program: (program: string) => `/program/${program}`,
  level: (program: string, level: string) => `/program/${program}/${level}`,
  /** The timed runner. An app screen, not a page to index. */
  practice: (setId: string, mode?: 'learning') => `/practice/${setId}${mode ? `?mode=${mode}` : ''}`,
} as const
