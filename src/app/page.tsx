import Link from 'next/link'
import type { Metadata } from 'next'
import { titles } from '@/lib/seo/titles'
import type { ReactNode } from 'react'
import { isSupabaseConfigured } from '@/lib/env'
import { artFor } from '@/lib/art'
import { formatCount } from '@/lib/format'
import { getSeoCatalogue, type PaperEntry } from '@/lib/seo/catalogue'
import { pageMetadata } from '@/lib/seo/metadata'
import { webPage } from '@/lib/seo/jsonld'
import { listOf, shortName, sittingDate, termName, yearSpan } from '@/lib/seo/names'
import { examFact } from '@/lib/seo/exam-facts'
import { paths } from '@/lib/seo/paths'
import { SITE } from '@/lib/seo/site'
import { SetupNotice } from '@/components/site/SetupNotice'
import { Spotlight } from '@/components/site/Spotlight'
import { SHELL, Trail } from '@/components/site/Page'
import { ProductBy } from '@/components/site/Brand'
import { SignInButton } from '@/components/site/AuthDialog'
import { SignedOut } from '@/components/site/Viewer'
import { PreparingFor, type Branch } from '@/components/home/PreparingFor'
import { MistakesCta } from '@/components/home/MistakesCta'
import { JsonLd } from '@/components/seo/JsonLd'
import { Faq, type FaqItem } from '@/components/seo/Faq'
import { BestScore } from '@/components/seo/BestScore'
import { Art } from '@/components/ui/Art'
import { buttonClass } from '@/components/ui/primitives'
import { ArrowRight, MagnifyingGlass } from '@/components/ui/icons'

/** The same page for everyone, from the CDN, refreshed within the hour. */
export const revalidate = 3600

const LATEST = 8

export async function generateMetadata(): Promise<Metadata> {
  if (!isSupabaseConfigured) return {}
  const { papers, subjects } = await getSeoCatalogue()
  const withPapers = subjects.filter((subject) => subject.paperCount > 0).length
  const questions = papers.reduce((sum, paper) => sum + paper.questionCount, 0)
  return {
    ...pageMetadata({
      title: titles.home(),
      description: `Free IIT Madras BS degree PYQs: ${formatCount(papers.length)} Qualifier, Quiz 1, Quiz 2 and End Term papers with answer keys — ${formatCount(
        questions,
      )} questions across ${withPapers} Data Science and Electronic Systems subjects. Read or take as a timed mock test.`,
      path: '/',
    }),
    // The home page carries the full brand whatever the length.
    title: { absolute: `${titles.home()} | ${SITE.name}` },
  }
}

/**
 * The front door, and the site's answer to "IITM BS PYQ": what is here in
 * two sentences, a search, the exams, the newest papers, then every subject
 * by branch and stage. Everything below the fold is plain links, so a
 * crawler reaches every subject in one step.
 */
export default async function HomePage() {
  if (!isSupabaseConfigured) return <SetupNotice />

  const catalogue = await getSeoCatalogue()
  const { papers, programs, examTypes } = catalogue
  const subjects = catalogue.subjects.filter((subject) => subject.paperCount > 0)
  const questions = papers.reduce((sum, paper) => sum + paper.questionCount, 0)
  const allYears = [...new Set(papers.flatMap((paper) => (paper.term ? [paper.term.year] : [])))]
  const updated = papers.map((paper) => paper.updatedAt).filter(Boolean).sort().at(-1) ?? null

  const exams = examTypes
    .map((exam) => ({ exam, papers: papers.filter((paper) => paper.examType.id === exam.id) }))
    .filter((entry) => entry.papers.length > 0)

  // Each branch and its stages: the qualifier (the stage before Foundation) first, then its levels.
  const branches: Branch[] = programs
    .map((program) => ({
      slug: program.slug,
      label: program.program.short_name ?? program.program.name,
      icon: artFor('programs', program.program.slug),
      stages: [
        {
          slug: 'qualifier',
          name: 'Qualifier',
          icon: artFor('levels', 'qualifier'),
          href: `${paths.exam('qualifier')}#p-${program.slug}`,
          subjects: program.levels.flatMap((level) =>
            level.subjects
              .filter((node) => node.exams.some((exam) => exam.examType.slug === 'qualifier'))
              .map((node) => ({
                slug: node.subject.slug,
                name: node.subject.name,
                href: paths.subjectExam(node.subject.slug, 'qualifier'),
                icon: artFor('subjects', node.subject.slug),
              })),
          ),
        },
        ...program.levels.map((level) => ({
          slug: level.level.slug,
          name: level.level.name,
          icon: artFor('levels', level.level.slug),
          href: level.path,
          subjects: level.subjects
            .filter((node) => node.paperCount > 0)
            .map((node) => ({
              slug: node.subject.slug,
              name: node.subject.name,
              href: node.path,
              icon: artFor('subjects', node.subject.slug),
            })),
        })),
      ].filter((stage) => stage.subjects.length > 0),
    }))
    .filter((branch) => branch.stages.length > 0)

  const latest = papers.filter((paper) => paper.questionCount > 0).slice(0, LATEST)

  const faq: FaqItem[] = [
    {
      q: 'Where can I find IITM BS previous year question papers?',
      a: (
        <>
          On Quiz Space: {formatCount(papers.length)} IIT Madras BS papers — Qualifier, Quiz 1, Quiz 2 and End Term — for{' '}
          {subjects.length} subjects of the Data Science and Electronic Systems degrees, {yearSpan(allYears)}. Pick a
          subject or an exam above; every paper opens with its questions and answer key.
        </>
      ),
    },
    {
      q: 'Are the IITM BS PYQs free, with answers?',
      a: (
        <>
          Yes. Every paper is free to read and to take as a mock test, and every question shows its answer key. A Google
          sign-in is only needed to save your attempts, see your analysis and keep a mistake bank.
        </>
      ),
    },
    {
      q: 'Can I take an IITM BS mock test here?',
      a: (
        <>
          Any paper can be taken as a timed mock test on a screen laid out like the real IITM exam: the same question
          palette, Save &amp; Next, Mark for Review and Clear Response. It is marked the moment you submit, with a
          question-by-question analysis.
        </>
      ),
    },
    {
      q: 'Which IITM BS exams have previous year papers here?',
      a: <>{listOf(exams.map(({ exam, papers: list }) => `${exam.name} (${formatCount(list.length)} papers)`))}.</>,
    },
    ...(examFact('qualifier')
      ? [
          {
            q: 'How do I prepare for the IITM BS Qualifier exam?',
            a: (
              <>
                {examFact('qualifier')!.about}{' '}
                <Link href={paths.exam('qualifier')} className="text-accent hover:underline">
                  See every Qualifier paper
                </Link>
                .
              </>
            ),
          },
        ]
      : []),
    {
      q: 'Is Quiz Space an official IIT Madras website?',
      a: (
        <>
          No. {SITE.name} is an independent study resource run by Unknown IITians, and it is not affiliated with IIT
          Madras or with any other practice site of a similar name. Official information about the programme is at{' '}
          <a href="https://study.iitm.ac.in/" rel="noopener" className="text-accent hover:underline">
            study.iitm.ac.in
          </a>
          .
        </>
      ),
    },
  ]

  return (
    <>
      <JsonLd
        data={webPage({
          path: '/',
          name: 'IITM BS PYQ — previous year question papers with answers',
          description: SITE.description,
          crumbs: [{ name: 'Home', path: '/' }],
        })}
      />

      {/* ------------------------------------------------------------ Search */}
      <section className={`${SHELL} pt-12 pb-10 text-center lg:pt-16`}>
        <ProductBy className="mb-4" />
        <h1 className="mx-auto max-w-3xl text-[2rem] leading-[1.15] font-medium text-balance text-ink sm:text-[2.5rem]">
          {titles.homeHeading()}
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-body text-ink-muted">
          Every Qualifier, Quiz 1, Quiz 2 and End Term paper of the IIT Madras BS degree: {formatCount(papers.length)}{' '}
          papers and {formatCount(questions)} questions across {subjects.length} subjects, {yearSpan(allYears)}. Read each
          with its answer key, or take it as a timed mock test. Free.
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

        <MistakesCta />

        <dl className="mx-auto mt-8 flex max-w-2xl flex-wrap justify-center gap-x-10 gap-y-3">
          {[
            ['Papers', formatCount(papers.length)],
            ['Questions', formatCount(questions)],
            ['Subjects', String(subjects.length)],
            ['Years', yearSpan(allYears)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-meta text-ink-faint">{label}</dt>
              <dd className="text-[1.25rem] text-ink tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ------------------------------------------------------------- Exams */}
      <Section title="PYQs by exam" link={{ href: '/papers', label: 'All papers' }}>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {exams.map(({ exam, papers: list }) => (
            <li key={exam.id}>
              <Link
                href={paths.exam(exam.slug)}
                className="group flex h-full items-center gap-4 rounded-card border border-rule bg-surface p-4 transition-colors hover:border-rule-strong"
              >
                <Art src={artFor('exams', exam.slug)} size={48} />
                <span className="min-w-0">
                  <span className="block text-card text-ink group-hover:underline group-hover:underline-offset-4">
                    {exam.name} PYQ
                  </span>
                  <span className="block text-meta text-ink-faint tabular-nums">{formatCount(list.length)} papers</span>
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
            <LatestCard key={paper.setId} paper={paper} />
          ))}
        </ul>
      </Section>

      {/* -------------------------------------------------------- Highlights */}
      <div className={SHELL}>
        <Spotlight placement="home" shared className="pb-14" />
      </div>

      {/* ---------------------------------------------------------- Branches */}
      <Section title="What are you preparing for?" link={{ href: '/subjects', label: 'All subjects' }}>
        <PreparingFor branches={branches} />
      </Section>

      {/* ------------------------------------------------ Every subject, A–Z */}
      <Section title="Every subject" link={{ href: '/subjects', label: 'Find a subject' }}>
        <div className="grid gap-8 md:grid-cols-2">
          {programs
            .filter((program) => program.levels.some((level) => level.subjects.some((node) => node.paperCount > 0)))
            .map((program) => (
              <div key={program.program.id}>
                <h3 className="text-ui font-medium text-ink">
                  <Link href={program.path} className="hover:underline">
                    {program.program.short_name ?? program.program.name} PYQs
                  </Link>
                </h3>
                {program.levels
                  .filter((level) => level.subjects.some((node) => node.paperCount > 0))
                  .map((level) => (
                    <div key={level.level.id} className="mt-3">
                      <p className="text-meta text-ink-faint">
                        <Link href={level.path} className="hover:text-ink hover:underline">
                          {level.level.name}
                        </Link>
                      </p>
                      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-ui">
                        {level.subjects
                          .filter((node) => node.paperCount > 0)
                          .map((node) => (
                            <Link key={node.subject.id} href={node.path} className="text-accent hover:underline">
                              {shortName(node.subject)}
                            </Link>
                          ))}
                      </p>
                    </div>
                  ))}
              </div>
            ))}
        </div>
      </Section>

      {/* ---------------------------------------------------------- Why here */}
      <Section title="Why practise on Quiz Space">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Real questions, as text', 'Tables, code, equations and ER diagrams are drawn from data, not pasted as screenshots — searchable, sharp on a phone and correct in dark mode.'],
            ['The exam screen you will sit', 'The same palette, timer and Save & Next / Mark for Review controls as the IITM exam portal, so nothing is new on the day.'],
            ['Answers for every question', 'Every paper shows its answer key. Mock tests are marked the moment you submit, with where you lost time and marks.'],
            ['Free, and every subject', `${subjects.length} subjects from Foundation to degree, Data Science and Electronic Systems, from ${Math.min(...allYears)} onwards. No paywall.`],
          ].map(([title, body]) => (
            <li key={title} className="rounded-card border border-rule bg-surface p-5">
              <h3 className="text-ui font-medium text-ink">{title}</h3>
              <p className="mt-1.5 text-meta leading-relaxed text-ink-muted">{body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <div className={`${SHELL} pb-14`}>
        <Faq items={faq} />
        {updated ? (
          <p className="mt-4 text-meta text-ink-faint">
            Papers last updated <time dateTime={updated.slice(0, 10)}>{sittingDate(updated.slice(0, 10))}</time>.
          </p>
        ) : null}
      </div>

      {/* ------------------------------------------------------------ Sign in */}
      <SignedOut>
        <section className={`${SHELL} pb-16`}>
          <div className="flex flex-col gap-5 rounded-card bg-surface-2 px-6 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <div>
              <h2 className="text-section font-medium text-ink">Keep every attempt</h2>
              <p className="mt-1 text-ui text-ink-muted">Sign in to save your scores and see where the marks went.</p>
            </div>
            <SignInButton className={buttonClass('primary', 'lg', 'shrink-0')}>Sign in</SignInButton>
          </div>
        </section>
      </SignedOut>
    </>
  )
}

function LatestCard({ paper }: { paper: PaperEntry }) {
  return (
    <li>
      <article className="flex h-full flex-col rounded-card border border-rule bg-surface p-4 transition-colors hover:border-rule-strong">
        <div className="flex items-start gap-3">
          <Art src={artFor('subjects', paper.subject.slug)} size={40} />
          <div className="min-w-0">
            <h3 className="text-ui leading-snug text-ink">
              <Link href={paper.path} className="hover:underline">
                {shortName(paper.subject)} {paper.examType.name}
              </Link>
            </h3>
            <p className="mt-0.5 text-meta text-ink-faint tabular-nums">
              <Trail parts={[sittingDate(paper.sessionDate), termName(paper.term)]} />
            </p>
          </div>
        </div>
        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <p className="text-meta text-ink-muted tabular-nums">
            {[paper.questionCount ? `${paper.questionCount} questions` : '', paper.durationMinutes ? `${paper.durationMinutes} min` : '']
              .filter(Boolean)
              .join(' · ')}
          </p>
          <BestScore setId={paper.setId} />
          <Link href={paper.path} className={buttonClass('primary', 'sm')}>
            Open
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </article>
    </li>
  )
}

/** A titled row of the home page, with a link to see all of it. */
function Section({
  title,
  link,
  children,
}: {
  title: string
  link?: { href: string; label: string }
  children: ReactNode
}) {
  return (
    <section className={`${SHELL} pb-14`}>
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-section font-medium text-ink">{title}</h2>
        {link ? (
          <Link
            href={link.href}
            className="flex shrink-0 items-center gap-1 text-meta text-ink-muted underline-offset-4 hover:text-ink hover:underline"
          >
            {link.label}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  )
}
