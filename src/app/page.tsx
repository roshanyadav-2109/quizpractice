import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  getBrowseTree,
  getCatalogueCounts,
  getExamTypes,
  getPaperIndex,
  getPapers,
  getQualifierSubjectIds,
} from '@/lib/queries'
import { getCurrentProfile } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { artFor } from '@/lib/art'
import { formatSession } from '@/lib/format'
import { termOf } from '@/lib/terms'
import { SetupNotice } from '@/components/site/SetupNotice'
import { Spotlight } from '@/components/site/Spotlight'
import { SHELL, Trail } from '@/components/site/Page'
import { SignInButton } from '@/components/site/AuthDialog'
import { PreparingFor, type Branch } from '@/components/home/PreparingFor'
import { Art } from '@/components/ui/Art'
import { buttonClass } from '@/components/ui/primitives'
import { ArrowRight, MagnifyingGlass } from '@/components/ui/icons'

export const dynamic = 'force-dynamic'

const LATEST = 8

/**
 * The front door, content first: a search, the exams, the latest papers, then
 * every subject by branch and stage — Qualifier, Foundation, the diplomas, the
 * degree. What the site is shows in what is on it.
 */
export default async function HomePage() {
  if (!isSupabaseConfigured) return <SetupNotice />

  const [profile, tree, counts, examTypes, index, papers, qualifierIds] = await Promise.all([
    getCurrentProfile(),
    getBrowseTree(),
    getCatalogueCounts(),
    getExamTypes(),
    getPaperIndex(),
    getPapers(),
    getQualifierSubjectIds(),
  ])

  // Only what leads to papers.
  const exams = examTypes.filter((exam) => index.some((row) => row.exam_type_id === exam.id))

  // Each branch and its stages: the qualifier (the stage before Foundation)
  // first, then its levels — only those with papers.
  const branches: Branch[] = tree
    .map((program) => ({
      slug: program.slug,
      label: program.short_name ?? program.name,
      icon: artFor('programs', program.slug),
      stages: [
        {
          slug: 'qualifier',
          name: 'Qualifier',
          icon: artFor('levels', 'qualifier'),
          href: `/papers?exam=qualifier&program=${program.slug}`,
          subjects: program.levels.flatMap((level) =>
            level.subjects
              .filter((subject) => qualifierIds.has(subject.id))
              .map((subject) => ({
                slug: subject.slug,
                name: subject.name,
                href: `/subject/${subject.slug}?exam=qualifier`,
                icon: artFor('subjects', subject.slug),
              })),
          ),
        },
        ...program.levels.map((level) => ({
          slug: level.slug,
          name: level.name,
          icon: artFor('levels', level.slug),
          href: `/subjects?program=${program.slug}&level=${level.slug}`,
          subjects: level.subjects
            .filter((subject) => (counts.bySubject.get(subject.id)?.papers ?? 0) > 0)
            .map((subject) => ({
              slug: subject.slug,
              name: subject.name,
              href: `/subject/${subject.slug}`,
              icon: artFor('subjects', subject.slug),
            })),
        })),
      ].filter((stage) => stage.subjects.length > 0),
    }))
    .filter((branch) => branch.stages.length > 0)

  // The newest sittings. A sitting with several sets opens on its exam's page,
  // grouped by term, so the set can be chosen there.
  const latest = papers.slice(0, LATEST).map((paper) => {
    const term = termOf(paper.session_date)
    const single = paper.sets.length === 1
    return {
      id: paper.id,
      href: single
        ? `/paper/${paper.sets[0].id}`
        : `/subject/${paper.subject.slug}?exam=${paper.exam_type.slug}${
            term ? `&year=${term.year}&term=${term.season}` : ''
          }`,
      subject: paper.subject.name,
      icon: artFor('subjects', paper.subject.slug),
      exam: paper.exam_type.name,
      date: formatSession(paper.session_date),
      sets: paper.sets.length,
      facts: [
        paper.total_marks ? `${Number(paper.total_marks)} marks` : '',
        (paper.duration_minutes ?? paper.exam_type.default_duration_minutes)
          ? `${paper.duration_minutes ?? paper.exam_type.default_duration_minutes} min`
          : '',
      ].filter(Boolean),
    }
  })

  return (
    <>
      {/* -------------------------------------------------------- Highlights */}
      <Spotlight placement="home" className={`${SHELL} pt-6`} />

      {/* ------------------------------------------------------------ Search */}
      <section className={`${SHELL} pt-12 pb-14 text-center lg:pt-16`}>
        <h1 className="mx-auto max-w-3xl text-[2rem] leading-[1.15] font-medium text-balance text-ink sm:text-[2.5rem]">
          Previous year papers for the IIT Madras BS degree
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-body text-ink-muted">
          Qualifier, Quiz 1, Quiz 2 and End Term papers from every term, with answers and explanations.
        </p>

        <form action="/search" method="get" role="search" className="mx-auto mt-7 flex max-w-2xl gap-2 text-left">
          <label className="relative flex-1">
            <span className="sr-only">Search subjects and questions</span>
            <MagnifyingGlass
              size={20}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-faint"
            />
            <input
              name="q"
              type="search"
              placeholder="Search a topic, a subject or a question…"
              className="h-13 w-full rounded-control border border-rule bg-surface-2 pr-4 pl-12 text-body text-ink transition-colors placeholder:text-ink-faint hover:border-rule-strong focus:border-ink focus:bg-surface focus:outline-none"
            />
          </label>
          <button type="submit" className={buttonClass('primary', 'lg', '!h-13')}>
            Search
          </button>
        </form>
      </section>

      {/* ------------------------------------------------------------- Exams */}
      <Section title="Exams" link={{ href: '/papers', label: 'All papers' }}>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {exams.map((exam) => (
            <li key={exam.id}>
              <Link
                href={`/papers?exam=${exam.slug}`}
                className="group flex h-full items-center gap-4 rounded-card border border-rule bg-surface p-4 transition-colors hover:border-rule-strong"
              >
                <Art src={artFor('exams', exam.slug)} size={48} />
                <span className="text-card text-ink group-hover:underline group-hover:underline-offset-4">
                  {exam.name}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      {/* ----------------------------------------------------- Latest papers */}
      <Section title="Latest papers" link={{ href: '/papers', label: 'All papers' }}>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {latest.map((paper) => (
            <li key={paper.id}>
              <article className="flex h-full flex-col rounded-card border border-rule bg-surface p-4 transition-colors hover:border-rule-strong">
                <div className="flex items-start gap-3">
                  <Art src={paper.icon} size={40} />
                  <div className="min-w-0">
                    <h3 className="text-ui leading-snug text-ink">{paper.subject}</h3>
                    <p className="mt-0.5 text-meta text-ink-faint tabular-nums">
                      <Trail parts={[paper.exam, paper.date]} />
                    </p>
                  </div>
                </div>
                <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                  <p className="text-meta text-ink-muted tabular-nums">{paper.facts.join(' · ')}</p>
                  <Link href={paper.href} className={buttonClass('primary', 'sm')}>
                    {paper.sets > 1 ? 'Choose set' : 'Start'}
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </Section>

      {/* ---------------------------------------------------------- Branches */}
      <Section title="What are you preparing for?" link={{ href: '/subjects', label: 'All subjects' }}>
        <PreparingFor branches={branches} />
      </Section>

      {/* ------------------------------------------------------------ Sign in */}
      {profile ? null : (
        <section className={`${SHELL} pb-16`}>
          <div className="flex flex-col gap-5 rounded-card bg-surface-2 px-6 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <div>
              <h2 className="text-section font-medium text-ink">Keep every attempt</h2>
              <p className="mt-1 text-ui text-ink-muted">
                Sign in to save your scores and see where the marks went.
              </p>
            </div>
            <SignInButton className={buttonClass('primary', 'lg', 'shrink-0')}>Sign in</SignInButton>
          </div>
        </section>
      )}
    </>
  )
}

/** A titled row of the home page, with a link to see all of it. */
function Section({
  title,
  link,
  children,
}: {
  title: string
  link: { href: string; label: string }
  children: ReactNode
}) {
  return (
    <section className={`${SHELL} pb-14`}>
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-section font-medium text-ink">{title}</h2>
        <Link
          href={link.href}
          className="flex shrink-0 items-center gap-1 text-meta text-ink-muted underline-offset-4 hover:text-ink hover:underline"
        >
          {link.label}
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
      {children}
    </section>
  )
}
