'use client'

import { useMemo, useSyncExternalStore } from 'react'
import { PaperCard } from '@/components/site/PaperCard'
import { FilterRow, SelectBox } from '@/components/site/FilterSelect'
import { useViewer } from '@/components/site/Viewer'
import { EmptyState } from '@/components/ui/EmptyState'
import { seasonName, type TermSeason } from '@/lib/terms'

/** One sitting as the finder needs it: plain data, handed down from the cached page. */
export interface FinderPaper {
  setId: string
  /** The paper's own page. */
  href: string
  /** "13 Sept 2026" */
  title: string
  /** "Set 2" where one day had several sets, else "". */
  setLabel: string
  facts: string[]
  termKey: string | null
  termLabel: string | null
  termOrder: number
  year: number | null
  season: TermSeason | null
}

type Filters = { year: string; term: string; sort: string; status: string }
const NONE: Filters = { year: '', term: '', sort: '', status: '' }
const KEYS = Object.keys(NONE) as (keyof Filters)[]

/*
 * The filters live in the URL's query. A change rewrites it with
 * replaceState (no navigation, no server round trip); these let React read
 * it and hear about the rewrite, and the back button's popstate.
 */
const listeners = new Set<() => void>()
function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('popstate', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('popstate', listener)
  }
}
const readQuery = () => window.location.search
/** The page as delivered has no filters: every card, newest first. */
const serverQuery = () => ''

function writeQuery(next: Filters) {
  const url = new URL(window.location.href)
  for (const name of KEYS) {
    if (next[name]) url.searchParams.set(name, next[name])
    else url.searchParams.delete(name)
  }
  window.history.replaceState(window.history.state, '', url)
  for (const listener of listeners) listener()
}

/**
 * A subject's papers for one exam, as they always looked: year, term, order
 * and — once signed in — attempted or not as dropdowns, then the paper cards,
 * split by term when a year or a term is picked.
 *
 * The page around it is one copy for everyone from the CDN, so the filtering
 * happens here, in the browser: every card is in the page as delivered, the
 * dropdowns only hide some, and the choice rides along in the URL (?year=…)
 * so a shared link and the back button land on the same view.
 */
export function SubjectPaperFinder({ papers }: { papers: FinderPaper[] }) {
  const viewer = useViewer()
  const search = useSyncExternalStore(subscribe, readQuery, serverQuery)
  const filters = useMemo(() => {
    const query = new URLSearchParams(search)
    const parsed = { ...NONE }
    for (const key of KEYS) parsed[key] = query.get(key) ?? ''
    return parsed
  }, [search])

  const change = (key: keyof Filters, value: string) => writeQuery({ ...filters, [key]: value })

  const years = useMemo(
    () => [...new Set(papers.flatMap((paper) => (paper.year ? [paper.year] : [])))].sort((a, b) => b - a),
    [papers],
  )
  const seasons = useMemo(
    () => (['jan', 'may', 'sep'] as TermSeason[]).filter((season) => papers.some((paper) => paper.season === season)),
    [papers],
  )

  const signedIn = viewer.status === 'signed-in'
  const status = signedIn && (filters.status === 'done' || filters.status === 'todo') ? filters.status : ''
  const oldestFirst = filters.sort === 'oldest'

  const shown = papers.filter((paper) => {
    if (filters.year && String(paper.year) !== filters.year) return false
    if (filters.term && paper.season !== filters.term) return false
    if (status === 'done' && !viewer.best[paper.setId]) return false
    if (status === 'todo' && viewer.best[paper.setId]) return false
    return true
  })
  const ordered = oldestFirst ? [...shown].reverse() : shown

  // Narrowing to a year or a term splits the grid into a section per term;
  // with neither, it is one grid, newest first, with no headers nobody asked for.
  const narrowed = Boolean(filters.year || filters.term)
  const groups = narrowed
    ? [...new Map(ordered.map((paper) => [paper.termKey ?? 'undated', paper.termLabel ?? 'Undated'])).entries()].map(
        ([key, label]) => ({ key, label, papers: ordered.filter((paper) => (paper.termKey ?? 'undated') === key) }),
      )
    : []

  const card = (paper: FinderPaper) => (
    <li key={paper.setId}>
      <PaperCard
        setId={paper.setId}
        href={paper.href}
        title={paper.title}
        tags={[]}
        date={paper.setLabel}
        facts={paper.facts}
        best={viewer.best[paper.setId] ?? null}
      />
    </li>
  )

  return (
    <>
      <FilterRow>
        {years.length > 1 ? (
          <SelectBox
            label="Year"
            allLabel="All years"
            value={years.some((year) => String(year) === filters.year) ? filters.year : ''}
            options={years.map((year) => ({ value: String(year), label: String(year) }))}
            onChange={(value) => change('year', value)}
          />
        ) : null}
        {seasons.length > 1 ? (
          <SelectBox
            label="Term"
            allLabel="All terms"
            value={seasons.includes(filters.term as TermSeason) ? filters.term : ''}
            options={seasons.map((season) => ({ value: season, label: seasonName(season) }))}
            onChange={(value) => change('term', value)}
          />
        ) : null}
        <SelectBox
          label="Order"
          allLabel="Newest first"
          value={oldestFirst ? 'oldest' : ''}
          options={[{ value: 'oldest', label: 'Oldest first' }]}
          onChange={(value) => change('sort', value)}
        />
        {signedIn ? (
          <SelectBox
            label="Attempted"
            allLabel="Attempted or not"
            value={status}
            options={[
              { value: 'done', label: 'Attempted' },
              { value: 'todo', label: 'Not attempted' },
            ]}
            onChange={(value) => change('status', value)}
          />
        ) : null}
      </FilterRow>

      {ordered.length === 0 ? (
        <EmptyState
          className="mt-5"
          art="no-results"
          title="No papers match these filters"
          actions={
            <button
              type="button"
              onClick={() => writeQuery(NONE)}
              className="text-ui text-accent hover:underline"
            >
              Clear filters
            </button>
          }
        >
          Loosen a filter or two to see more.
        </EmptyState>
      ) : narrowed ? (
        <div className="mt-6 flex flex-col gap-8">
          {groups.map((group) => (
            <section key={group.key} aria-label={group.label}>
              <h3 className="mb-3 text-card font-medium text-ink">{group.label}</h3>
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{group.papers.map(card)}</ul>
            </section>
          ))}
        </div>
      ) : (
        <ul className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{ordered.map(card)}</ul>
      )}
    </>
  )
}
