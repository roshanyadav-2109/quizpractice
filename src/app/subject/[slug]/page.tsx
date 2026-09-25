import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import {
  getExamTypes,
  getMyAttempts,
  getPapersForSubject,
  getSubjectBySlug,
  summariseMyAttempts,
} from '@/lib/queries'
import { getCurrentProfile } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { SetupNotice } from '@/components/site/SetupNotice'
import { PaperCard } from '@/components/site/PaperCard'
import { Breadcrumb, SHELL, TitleCard, Trail } from '@/components/site/Page'
import { FilterRow, FilterSelect } from '@/components/site/FilterSelect'
import { formatSession } from '@/lib/format'
import { seasonName, termOf, yearTermFilter } from '@/lib/terms'
import { artFor } from '@/lib/art'
import { Art } from '@/components/ui/Art'
import { CaretRight } from '@/components/ui/icons'

export const dynamic = 'force-dynamic'

type Params = Promise<{ slug: string }>
type SearchParams = Promise<{ exam?: string; year?: string; term?: string; status?: string; sort?: string }>

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params
  searchParams: SearchParams
}): Promise<Metadata> {
  if (!isSupabaseConfigured) return { title: 'Subject' }
  const [{ slug }, { exam }] = await Promise.all([params, searchParams])
  const [context, examTypes] = await Promise.all([getSubjectBySlug(slug), getExamTypes()])
  if (!context) return { title: 'Subject not found' }

  const examType = examTypes.find((type) => type.slug === exam)
  return {
    title: examType
      ? `${context.subject.name} ${examType.name} papers`
      : `${context.subject.name} question papers`,
    description: `Previous quiz, end term and OPPE question papers for ${context.subject.name} in the IITM ${context.program.short_name ?? context.program.name} programme.`,
  }
}

/**
 * One subject, in two steps. First a block for each exam it has papers for —
 * Qualifier, Quiz 1, Quiz 2, End Term — and then, inside the one picked, that exam's
 * papers arranged by term — January, May, September — with year, the term
 * within it, order and (once you have sat some) attempted as dropdowns.
 *
 * The exam is a query parameter rather than its own route, so the back button
 * and a shared link both land exactly where they should.
 */
export default async function SubjectPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: SearchParams
}) {
  if (!isSupabaseConfigured) return <SetupNotice />

  const [{ slug }, query] = await Promise.all([params, searchParams])

  // Everything at once. Attempts are row-level secured to their owner, so
  // asking before knowing who is signed in costs nothing and returns nothing
  // for a visitor — and saves waiting on the profile first.
  const [context, profile, examTypes, attempts] = await Promise.all([
    getSubjectBySlug(slug),
    getCurrentProfile(),
    getExamTypes(),
    getMyAttempts(200),
  ])
  if (!context) notFound()

  const { subject, level, program } = context

  const papers = await getPapersForSubject(subject.id)
  const myAttempts = profile ? attempts : []
  const { bySet } = summariseMyAttempts(myAttempts)

  // Exams that actually have papers here, in the admin's order.
  const exams = examTypes
    .map((examType) => ({
      examType,
      papers: papers.filter((paper) => paper.exam_type_id === examType.id),
    }))
    .filter((entry) => entry.papers.length > 0)

  const selected = exams.find((entry) => entry.examType.slug === query.exam) ?? null
  const levelHref = `/subjects?program=${program.slug}&level=${level.slug}`
  const subjectHref = `/subject/${subject.slug}`
  const art = artFor('subjects', subject.slug)

  const crumbs = [
    { label: 'Subjects', href: '/subjects' },
    { label: program.short_name ?? program.name, href: `/subjects?program=${program.slug}` },
    { label: level.name, href: levelHref },
    selected ? { label: subject.name, href: subjectHref } : { label: subject.name },
    ...(selected ? [{ label: selected.examType.name }] : []),
  ]

  // Step one: the exams, as blocks to open.
  if (!selected) {
    return (
      <div className={`${SHELL} py-6`}>
        <Breadcrumb crumbs={crumbs} />
        <TitleCard
          back={levelHref}
          icon={art ? <Art src={art} size={48} /> : undefined}
          title={subject.name}
        />

        {exams.length > 0 ? (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {exams.map(({ examType }) => (
              <li key={examType.id}>
                <Link
                  href={`${subjectHref}?exam=${examType.slug}`}
                  className="group flex h-full items-center gap-4 rounded-card border border-rule bg-surface p-5 transition-colors hover:border-rule-strong"
                >
                  <Art src={artFor('exams', examType.slug)} size={48} />
                  <span className="min-w-0 flex-1 text-card text-ink">{examType.name}</span>
                  <CaretRight
                    size={18}
                    aria-hidden="true"
                    className="shrink-0 text-ink-faint transition-transform duration-150 group-hover:translate-x-[3px] group-hover:text-ink"
                  />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 rounded-card border border-rule bg-surface py-10 text-center text-ui text-ink-muted">
            No papers for this subject yet.
          </p>
        )}
      </div>
    )
  }

  // Step two: one exam's papers.
  const { examType } = selected
  const status = profile && (query.status === 'done' || query.status === 'todo') ? query.status : null
  const oldestFirst = query.sort === 'oldest'

  // Arranged by term — January, May, September — since each term sits its own
  // Quiz 1, Quiz 2 and End Term; within a term, by the day it was sat.
  // A year, and a term by name — each on its own or together.
  const filter = yearTermFilter(selected.papers, query)
  const inOrder = oldestFirst ? [...selected.papers].reverse() : selected.papers
  const groups = (oldestFirst ? [...filter.terms].reverse() : filter.terms)
    .map((term) => ({
      term,
      cards: inOrder
        .filter((paper) => termOf(paper.session_date)?.key === term.key)
        .flatMap((paper) => paper.sets.map((set) => ({ paper, set, best: bySet.get(set.id) ?? null })))
        .filter(({ best }) => (status === 'done' ? best : status === 'todo' ? !best : true)),
    }))
    .filter((group) => group.cards.length > 0)

  return (
    <div className={`${SHELL} py-6`}>
      <Breadcrumb crumbs={crumbs} />
      <TitleCard
        back={subjectHref}
        icon={art ? <Art src={art} size={48} /> : undefined}
        title={<Trail parts={[subject.name, examType.name]} />}
      />

      <FilterRow>
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
        <FilterSelect
          name="sort"
          label="Order"
          allLabel="Newest first"
          value={oldestFirst ? 'oldest' : null}
          options={[{ value: 'oldest', label: 'Oldest first' }]}
        />
        {profile ? (
          <FilterSelect
            name="status"
            label="Attempted"
            allLabel="Attempted or not"
            value={status}
            options={[
              { value: 'done', label: 'Attempted' },
              { value: 'todo', label: 'Not attempted' },
            ]}
          />
        ) : null}
      </FilterRow>

      {groups.length > 0 ? (
        <div className="mt-6 flex flex-col gap-8">
          {groups.map(({ term, cards }) => (
            <section key={term.key} aria-labelledby={`term-${term.key}`}>
              <h2 id={`term-${term.key}`} className="mb-3 text-card font-medium text-ink">
                {term.label}
              </h2>
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {cards.map(({ paper, set, best }) => {
                  const duration = paper.duration_minutes ?? examType.default_duration_minutes
                  return (
                    <li key={set.id}>
                      <PaperCard
                        setId={set.id}
                        // Inside its term a card is named by the day it was sat.
                        title={formatSession(paper.session_date)}
                        tags={[]}
                        date={paper.sets.length > 1 ? `Set ${set.set_code}` : ''}
                        facts={[
                          paper.total_marks ? `${Number(paper.total_marks)} marks` : '',
                          duration ? `${duration} min` : '',
                        ].filter(Boolean)}
                        best={best}
                      />
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <p className="mt-5 rounded-card border border-rule bg-surface py-10 text-center text-ui text-ink-muted">
          No papers match these filters.
        </p>
      )}
    </div>
  )
}
