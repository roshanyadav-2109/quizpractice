import type { Metadata } from 'next'
import { getSeoCatalogue } from '@/lib/seo/catalogue'
import { pageMetadata } from '@/lib/seo/metadata'
import { paths } from '@/lib/seo/paths'
import { absolute } from '@/lib/seo/site'
import {
  getActiveStudents,
  getBrowseTree,
  getExamTypes,
  getMyAttempts,
  getPapers,
  summariseMyAttempts,
} from '@/lib/queries'
import { getCurrentProfile } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { SetupNotice } from '@/components/site/SetupNotice'
import { Spotlight } from '@/components/site/Spotlight'
import { buttonClass } from '@/components/ui/primitives'
import { PaperCard } from '@/components/site/PaperCard'
import { SHELL, TitleCard } from '@/components/site/Page'
import { FilterRow, FilterSelect } from '@/components/site/FilterSelect'
import { SubjectFilter, type SubjectGroup } from '@/components/site/SubjectFilter'
import { artFor } from '@/lib/art'
import { formatSession } from '@/lib/format'
import { seasonName, yearTermFilter } from '@/lib/terms'
import Link from 'next/link'
import { EmptyState } from '@/components/ui/EmptyState'

export const dynamic = 'force-dynamic'

/**
 * The unfiltered list is a page worth finding; every filtered or later page
 * of it is a view onto pages that have their own addresses — an exam's hub,
 * a subject's exam — so those views are followed but not indexed, and point
 * at the page that is.
 */
export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const query = await searchParams
  const filtered = Object.values(query).some((value) => typeof value === 'string' && value !== '')
  const base = pageMetadata({
    title: 'All IITM BS Question Papers — Newest First',
    description:
      'Every IIT Madras BS degree previous year question paper, newest sitting first — Qualifier, Quiz 1, Quiz 2 and End Term, filterable by branch, level, subject, year and term.',
    path: '/papers',
    index: !filtered,
  })
  if (filtered && query.exam && !query.subject) base.alternates = { canonical: absolute(paths.exam(query.exam)) }
  return base
}

type SearchParams = Promise<{
  exam?: string
  year?: string
  term?: string
  program?: string
  level?: string
  subject?: string
  page?: string
}>

const PAGE_SIZE = 24

/**
 * Every published sitting across every subject, newest first — the page to
 * use when you know the exam you are preparing for but not yet the subject.
 * Exam, branch, level, subject, year and the term within it; twenty-four at a time.
 */
export default async function PapersPage({ searchParams }: { searchParams: SearchParams }) {
  if (!isSupabaseConfigured) return <SetupNotice />

  const [query, examTypes, tree, profile, papers, attempts, active, catalogue] = await Promise.all([
    searchParams,
    getExamTypes(),
    getBrowseTree(),
    getCurrentProfile(),
    getPapers(),
    // Secured to their owner; empty for a visitor, and no wait on the profile.
    getMyAttempts(200),
    getActiveStudents(),
    getSeoCatalogue(),
  ])
  const myAttempts = profile ? attempts : []
  const { bySet } = summariseMyAttempts(myAttempts)

  const programOf = new Map<string, string>()
  // Level slugs repeat across branches ("foundation" in each), so a level is
  // filtered by slug: with no branch chosen, Foundation means every branch's.
  const levelOf = new Map<string, string>()
  for (const program of tree) {
    for (const level of program.levels) {
      for (const subject of level.subjects) {
        programOf.set(subject.id, program.slug)
        levelOf.set(subject.id, level.slug)
      }
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

  const inProgram = papers.filter(
    (paper) => !selectedProgram || programOf.get(paper.subject_id) === selectedProgram.slug,
  )
  const levels = [
    ...new Map(
      (selectedProgram ? [selectedProgram] : programs)
        .flatMap((program) => program.levels)
        .filter((level) => inProgram.some((paper) => levelOf.get(paper.subject_id) === level.slug))
        .map((level) => [level.slug, level] as const),
    ).values(),
  ]
  const selectedLevel = levels.find((level) => level.slug === query.level) ?? null

  const scoped = inProgram.filter(
    (paper) =>
      (!selectedExam || paper.exam_type_id === selectedExam.id) &&
      (!selectedLevel || levelOf.get(paper.subject_id) === selectedLevel.slug),
  )
  // The subject panel: every subject of the branch in force that has papers,
  // by level, each with how many papers it has under the other filters.
  const counting = yearTermFilter(scoped, query)
  const countBySubject = new Map<string, number>()
  for (const paper of scoped) {
    if (counting.matches(paper.session_date)) {
      countBySubject.set(paper.subject_id, (countBySubject.get(paper.subject_id) ?? 0) + paper.sets.length)
    }
  }
  const withPapers = new Set(papers.map((paper) => paper.subject_id))
  const subjectGroups: SubjectGroup[] = (selectedProgram ? [selectedProgram] : programs).flatMap((program) =>
    program.levels
      .filter((level) => !selectedLevel || level.slug === selectedLevel.slug)
      .map((level) => ({
        key: `${program.slug}-${level.slug}`,
        title: selectedProgram ? level.name : `${program.short_name ?? program.name} · ${level.name}`,
        subjects: level.subjects
          .filter((subject) => withPapers.has(subject.id))
          .map((subject) => ({
            slug: subject.slug,
            name: subject.name,
            code: subject.code,
            count: countBySubject.get(subject.id) ?? 0,
            active: active[subject.id],
            icon: artFor('subjects', subject.slug),
          })),
      }))
      .filter((group) => group.subjects.length > 0),
  )
  const selectedSubject = query.subject
    ? (selectedProgram ? [selectedProgram] : programs)
        .flatMap((program) => program.levels.filter((level) => !selectedLevel || level.slug === selectedLevel.slug))
        .flatMap((level) => level.subjects)
        .find((subject) => subject.slug === query.subject && withPapers.has(subject.id))
    : undefined
  const inSubject = selectedSubject ? scoped.filter((paper) => paper.subject_id === selectedSubject.id) : scoped

  // Terms — January, May, September — rather than years: a year holds three
  // terms, each with its own Quiz 1, Quiz 2 and End Term.
  const filter = yearTermFilter(inSubject, query)

  const cards = inSubject
    .filter((paper) => filter.matches(paper.session_date))
    .flatMap((paper) => paper.sets.map((set) => ({ paper, set })))

  const pages = Math.max(1, Math.ceil(cards.length / PAGE_SIZE))
  const page = Math.min(pages, Math.max(1, Number(query.page) || 1))
  const shown = cards.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function pageHref(target: number) {
    const search = new URLSearchParams()
    if (query.exam) search.set('exam', query.exam)
    if (query.program) search.set('program', query.program)
    if (selectedLevel) search.set('level', selectedLevel.slug)
    if (selectedSubject) search.set('subject', selectedSubject.slug)
    if (query.year) search.set('year', query.year)
    if (query.term) search.set('term', query.term)
    if (target > 1) search.set('page', String(target))
    const suffix = search.toString()
    return `/papers${suffix ? `?${suffix}` : ''}`
  }

  return (
    <div className={`${SHELL} py-6`}>
      <Spotlight placement="papers" programSlug={query.program ?? null} className="mb-6" />
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
          resets={['year', 'term', 'subject']}
        />
        {levels.length > 1 ? (
          <FilterSelect
            name="level"
            label="Level"
            allLabel="All levels"
            value={selectedLevel?.slug ?? null}
            options={levels.map((level) => ({ value: level.slug, label: level.name }))}
            resets={['subject', 'year', 'term']}
          />
        ) : null}
        <SubjectFilter
          groups={subjectGroups}
          value={selectedSubject?.slug ?? null}
          scope={[selectedProgram ? (selectedProgram.short_name ?? selectedProgram.name) : 'Every branch', selectedLevel?.name]
            .filter(Boolean)
            .join(' · ')}
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
                  href={catalogue.paperBySetId.get(set.id)?.path}
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
        <EmptyState
          className="mt-5"
          art="no-results"
          title="No papers match these filters"
          actions={
            <Link href="/papers" className="text-ui text-accent hover:underline">
              Clear all filters
            </Link>
          }
        >
          Loosen a filter or two to see more.
        </EmptyState>
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
