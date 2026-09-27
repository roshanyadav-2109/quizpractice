import Link from 'next/link'
import { paths } from '@/lib/seo/paths'
import type { Metadata } from 'next'
import { after } from 'next/server'
import {
  getActiveStudents,
  getBrowseTree,
  getCatalogueCounts,
  getPopularSearches,
  logSearch,
  searchWithOptions,
} from '@/lib/queries'
import { ActiveCount } from '@/components/site/ActiveCount'
import { artFor } from '@/lib/art'
import { Art } from '@/components/ui/Art'
import { RecentSearches, RememberSearch } from '@/components/search/RecentSearches'
import { isSupabaseConfigured } from '@/lib/env'
import { SetupNotice } from '@/components/site/SetupNotice'
import { parseBlocks, type Block } from '@/lib/blocks/schema'
import { MATCH_LABEL, locateMatch, type MatchIn } from '@/lib/search-snippets'
import { SHELL, TitleCard } from '@/components/site/Page'
import { FilterRow, FilterSelect } from '@/components/site/FilterSelect'
import { Badge, buttonClass } from '@/components/ui/primitives'
import { ArrowRight, MagnifyingGlass } from '@/components/ui/icons'
import { formatSession } from '@/lib/format'
import { EmptyState } from '@/components/ui/EmptyState'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Search questions',
  description:
    'Search across every IITM BS question paper — question text, options, code and table contents.',
  // Results pages are an endless set of near-duplicates: followed, never indexed.
  robots: { index: false, follow: true },
  alternates: { canonical: '/search' },
}

type SearchParams = Promise<{ q?: string; in?: string }>

/**
 * Checked against the bank: every one of these returns questions. Used until
 * enough people have searched for the suggestions to come from them.
 */
const EXAMPLES = ['BCNF', 'JOIN', 'binary search', 'Dijkstra', 'linked list', 'eigenvalue', 'regression', 'Bengaluru']

const PLACES: MatchIn[] = ['question', 'options', 'code', 'table', 'details']

/**
 * Search inside the questions. Because the content is structured rather than
 * scanned, a value in a table, an identifier in a code listing or a word in
 * an option is findable — and each result says which of those it was.
 */
export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  if (!isSupabaseConfigured) return <SetupNotice />

  const { q = '', in: rawIn } = await searchParams
  const term = q.trim()
  // The hits and their options together, held briefly per term.
  const [{ hits, options }, popular] = await Promise.all([searchWithOptions(term), getPopularSearches(10)])

  // Suggestions follow what people search for; the fixed examples fill in
  // until there are enough of those.
  const suggestions = [
    ...popular,
    ...EXAMPLES.filter((example) => !popular.some((known) => known.toLowerCase() === example.toLowerCase())),
  ].slice(0, 10)

  // A search that found something counts towards them — after the page is
  // sent, so it never slows the results. Changing the "matched in" filter is
  // the same search again, so it is not counted twice.
  if (term && hits.length > 0 && !rawIn) after(() => logSearch(term).catch(() => undefined))
  const optionsBy = new Map<string, Block[][]>(
    [...options].map(([questionId, contents]) => [questionId, contents.map((content) => parseBlocks(content))]),
  )

  const located = hits.map((hit) => ({
    hit,
    snippet: locateMatch(
      term,
      parseBlocks(hit.body),
      optionsBy.get(hit.question_id) ?? [],
      `${hit.subject_name} ${hit.exam_type_name}`,
    ),
  }))

  const filter = PLACES.find((place) => place === rawIn) ?? null
  const shown = filter ? located.filter((row) => row.snippet.in === filter) : located
  const present = new Set(located.map((row) => row.snippet.in))

  return (
    <div className={`${SHELL} py-6`}>
      <TitleCard title="Search questions">
        <form method="get" role="search" className="relative mt-4 flex gap-2">
          <div className="relative flex-1">
            <MagnifyingGlass
              size={20}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-faint"
            />
            <input
              name="q"
              type="search"
              defaultValue={term}
              autoFocus={!term}
              aria-label="Search the questions"
              placeholder="A topic, a keyword, a value from a table…"
              spellCheck={false}
              className="h-13 w-full rounded-control border border-rule bg-surface-2 pr-4 pl-12 text-body text-ink transition-colors placeholder:text-ink-faint hover:border-rule-strong focus:border-ink focus:bg-surface focus:outline-none"
            />
          </div>
          <button type="submit" className={buttonClass('primary', 'lg', '!h-13')}>
            Search
          </button>
        </form>
      </TitleCard>

      {!term ? (
        <>
          <section className="mt-6">
            <h2 className="mb-3 text-meta text-ink-muted">{popular.length ? 'Popular searches' : 'Try one of these'}</h2>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((example) => (
                <Link
                  key={example}
                  href={`/search?q=${encodeURIComponent(example)}`}
                  className="inline-flex h-10 items-center rounded-control border border-rule bg-surface px-4 text-ui text-ink transition-colors hover:border-rule-strong"
                >
                  {example}
                </Link>
              ))}
            </div>
          </section>
          <RecentSearches className="mt-8" />
          <BrowseSubjects />
        </>
      ) : (
        <>
          <FilterRow>
            <FilterSelect
              name="in"
              label="Matched in"
              allLabel="Matched anywhere"
              value={filter}
              options={PLACES.filter((place) => present.has(place)).map((place) => ({
                value: place,
                label: MATCH_LABEL[place],
              }))}
            />
          </FilterRow>
          {hits.length > 0 ? <RememberSearch term={term} /> : null}
          <div className="mt-5">
            {hits.length > 0 ? (
              <h2 className="mb-3 text-[1.25rem] leading-tight font-medium text-ink">Results for “{term}”</h2>
            ) : null}

            {shown.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {shown.map(({ hit, snippet }) => (
                  <li key={hit.question_id}>
                    <Link
                      href={`/practice/${hit.set_id}?mode=learning&q=${hit.question_number}`}
                      className="group block rounded-card border border-rule bg-surface p-4 transition-colors hover:border-rule-strong"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                        <div className="min-w-0">
                          <p className="text-[1.0625rem] leading-snug text-ink">{hit.subject_name}</p>
                          <p className="mt-0.5 text-meta text-ink-faint tabular-nums">
                            {hit.exam_type_name} · {formatSession(hit.session_date)} · Set {hit.set_code} ·
                            Q{hit.question_number}
                          </p>
                        </div>
                        <Badge>{MATCH_LABEL[snippet.in]}</Badge>
                      </div>
                      <p
                        className={`mt-3 text-ui leading-relaxed text-ink-muted ${
                          snippet.in === 'code' ? 'font-mono text-[0.875rem]' : ''
                        }`}
                      >
                        {snippet.before}
                        {snippet.hit ? <mark>{snippet.hit}</mark> : null}
                        {snippet.after}
                      </p>
                      <span className="mt-3 inline-flex items-center gap-1 text-meta text-ink group-hover:underline">
                        Open question
                        <ArrowRight size={14} aria-hidden="true" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : hits.length === 0 ? (
              <EmptyState art="no-results" title={`Nothing matches “${term}”`}>
                Try a shorter word, or one of:{' '}
                {suggestions.slice(0, 4).map((example, i) => (
                  <span key={example}>
                    {i > 0 ? ', ' : ''}
                    <Link href={`/search?q=${encodeURIComponent(example)}`} className="text-accent hover:underline">
                      {example}
                    </Link>
                  </span>
                ))}
              </EmptyState>
            ) : (
              <EmptyState art="no-results" title="No questions found">
                Try fewer or different words, or change where to look.
              </EmptyState>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** Under the suggestions: the subjects with the most papers, one click away. */
async function BrowseSubjects() {
  const [tree, counts, active] = await Promise.all([getBrowseTree(), getCatalogueCounts(), getActiveStudents()])
  const subjects = tree
    .flatMap((program) => program.levels.flatMap((level) => level.subjects))
    .map((subject) => ({ subject, papers: counts.bySubject.get(subject.id)?.papers ?? 0 }))
    .filter((row) => row.papers > 0)
    .sort((a, b) => b.papers - a.papers)
    .slice(0, 12)
  if (subjects.length === 0) return null

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-meta text-ink-muted">Or open a subject</h2>
        <Link href="/subjects" className="flex items-center gap-1 text-meta text-ink-muted hover:text-ink hover:underline">
          All subjects
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {subjects.map(({ subject, papers }) => (
          <li key={subject.id}>
            <Link
              href={paths.subject(subject.slug)}
              className="flex items-center gap-3 rounded-control border border-rule bg-surface px-3 py-2.5 transition-colors hover:border-rule-strong"
            >
              <Art src={artFor('subjects', subject.slug)} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ui text-ink">{subject.name}</span>
                <ActiveCount count={active[subject.id]} compact />
              </span>
              <span className="shrink-0 text-meta text-ink-faint tabular-nums">{papers} papers</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
