import type { Metadata } from 'next'
import {
  getBrowseTree,
  getExamTypes,
  getMyAttempts,
  getPapers,
  summariseMyAttempts,
} from '@/lib/queries'
import { getCurrentProfile } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { SetupNotice } from '@/components/site/SetupNotice'
import { buttonClass } from '@/components/ui/primitives'
import { PaperCard } from '@/components/site/PaperCard'
import { SHELL, TitleCard } from '@/components/site/Page'
import { FilterRow, FilterSelect } from '@/components/site/FilterSelect'
import { formatSession } from '@/lib/format'
import { seasonName, yearTermFilter } from '@/lib/terms'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'All papers',
  description: 'Every published IIT Madras BS degree question paper, newest sitting first.',
}

type SearchParams = Promise<{ exam?: string; year?: string; term?: string; program?: string; page?: string }>

const PAGE_SIZE = 24

/**
 * Every published sitting across every subject, newest first — the page to
 * use when you know the exam you are preparing for but not yet the subject.
 * Exam, branch, year and the term within it as dropdowns; twenty-four at a time.
 */
export default async function PapersPage({ searchParams }: { searchParams: SearchParams }) {
  if (!isSupabaseConfigured) return <SetupNotice />

  const [query, examTypes, tree, profile, papers, attempts] = await Promise.all([
    searchParams,
    getExamTypes(),
    getBrowseTree(),
    getCurrentProfile(),
    getPapers(),
    // Secured to their owner; empty for a visitor, and no wait on the profile.
    getMyAttempts(200),
  ])
  const myAttempts = profile ? attempts : []
  const { bySet } = summariseMyAttempts(myAttempts)

  const programOf = new Map<string, string>()
  for (const program of tree) {
    for (const level of program.levels) {
      for (const subject of level.subjects) programOf.set(subject.id, program.slug)
    }
  }

  const exams = examTypes
    .map((examType) => ({
      examType,
      sets: papers
        .filter((paper) => paper.exam_type_id === examType.id)
        .reduce((n, paper) => n + paper.sets.length, 0),
    }))
    .filter((entry) => entry.sets > 0)

  const selectedExam = exams.find((entry) => entry.examType.slug === query.exam)?.examType
  const programs = tree.filter((program) =>
    papers.some((paper) => programOf.get(paper.subject_id) === program.slug),
  )
  const selectedProgram = programs.find((program) => program.slug === query.program)

  const scoped = papers.filter(
    (paper) =>
      (!selectedExam || paper.exam_type_id === selectedExam.id) &&
      (!selectedProgram || programOf.get(paper.subject_id) === selectedProgram.slug),
  )
  // Terms — January, May, September — rather than years: a year holds three
  // terms, each with its own Quiz 1, Quiz 2 and End Term.
  const filter = yearTermFilter(scoped, query)

  const cards = scoped
    .filter((paper) => filter.matches(paper.session_date))
    .flatMap((paper) => paper.sets.map((set) => ({ paper, set })))

  const pages = Math.max(1, Math.ceil(cards.length / PAGE_SIZE))
  const page = Math.min(pages, Math.max(1, Number(query.page) || 1))
  const shown = cards.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function pageHref(target: number) {
    const search = new URLSearchParams()
    if (query.exam) search.set('exam', query.exam)
    if (query.program) search.set('program', query.program)
    if (query.year) search.set('year', query.year)
    if (query.term) search.set('term', query.term)
    if (target > 1) search.set('page', String(target))
    const suffix = search.toString()
    return `/papers${suffix ? `?${suffix}` : ''}`
  }

  return (
    <div className={`${SHELL} py-6`}>
      <TitleCard title="All papers" />

      <FilterRow>
        <FilterSelect
          name="exam"
          label="Exam"
          allLabel="All exams"
          value={selectedExam?.slug ?? null}
          options={exams.map(({ examType }) => ({ value: examType.slug, label: examType.name }))}
          resets={['year', 'term']}
        />
        <FilterSelect
          name="program"
          label="Branch"
          allLabel="All branches"
          value={selectedProgram?.slug ?? null}
          options={programs.map((program) => ({
            value: program.slug,
            label: program.short_name ?? program.name,
          }))}
          resets={['year', 'term']}
        />
        {filter.years.length > 1 ? (
          <FilterSelect
            name="year"
            label="Year"
            allLabel="All years"
            value={filter.year !== null ? String(filter.year) : null}
            options={filter.years.map((year) => ({ value: String(year), label: String(year) }))}
          />
        ) : null}
        {filter.seasons.length > 1 ? (
          <FilterSelect
            name="term"
            label="Term"
            allLabel="All terms"
            value={filter.season}
            options={filter.seasons.map((season) => ({ value: season, label: seasonName(season) }))}
          />
        ) : null}
      </FilterRow>

      {shown.length > 0 ? (
        <ul className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map(({ paper, set }) => {
            const duration = paper.duration_minutes ?? paper.exam_type.default_duration_minutes
            return (
              <li key={set.id}>
                <PaperCard
                  setId={set.id}
                  title={paper.subject.name}
                  tags={[paper.exam_type.name, ...(paper.sets.length > 1 ? [`Set ${set.set_code}`] : [])]}
                  date={formatSession(paper.session_date)}
                  facts={[
                    paper.total_marks ? `${Number(paper.total_marks)} marks` : '',
                    duration ? `${duration} min` : '',
                  ].filter(Boolean)}
                  best={bySet.get(set.id) ?? null}
                />
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-5 rounded-card border border-rule bg-surface py-10 text-center text-ui text-ink-muted">
          No papers match these filters.
        </p>
      )}

      {pages > 1 ? (
        <nav aria-label="Pages" className="mt-6 flex items-center justify-between gap-3">
          <p className="text-meta text-ink-faint tabular-nums">
            Page {page} of {pages}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className={buttonClass('outline', 'md')}>
                Previous
              </Link>
            ) : null}
            {page < pages ? (
              <Link href={pageHref(page + 1)} className={buttonClass('outline', 'md')}>
                Next
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </div>
  )
}
