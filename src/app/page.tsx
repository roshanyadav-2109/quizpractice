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
import { BrandInline, ProductBy } from '@/components/site/Brand'
import { PreparingFor, type Branch } from '@/components/home/PreparingFor'
import { MistakesCta } from '@/components/home/MistakesCta'
import { WhyPractise } from '@/components/home/WhyPractise'
import { ProductShowcase } from '@/components/home/ProductShowcase'
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
  return {
    ...pageMetadata({
      title: titles.home(),
      description: `Free IITM BS PYQs with solutions and answer keys: ${formatCount(papers.length)} papers for ${withPapers} subjects, for quiz practice and mock tests.`,
      path: '/',
    }),
    // The home page carries the site's full name: with the WebSite structured
    // data and og:site_name, it is what Google shows as the site name.
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
  const allYears = [...new Set(papers.flatMap((paper) => (paper.term ? [paper.term.year] : [])))]
  const questions = papers.reduce((sum, paper) => sum + paper.questionCount, 0)

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
      q: 'What does Quiz Space have for IITM BS students?',
      a: (
        <>
          Every Qualifier, Quiz 1, Quiz 2 and End Term paper of the IIT Madras BS degree: {formatCount(papers.length)}{' '}
          papers and {formatCount(questions)} questions across {subjects.length} subjects, {yearSpan(allYears)} — every
          question with its solution and answer key, and every paper ready for quiz practice as a timed mock test. Free,
          with a Google sign-in.
        </>
      ),
    },
    {
      q: 'Where can I find IITM BS previous year question papers?',
      a: (
        <>
          On Quiz Space: {formatCount(papers.length)} IIT Madras BS papers — Qualifier, Quiz 1, Quiz 2 and End Term — for{' '}
          {subjects.length} subjects of the Data Science and Electronic Systems degrees, {yearSpan(allYears)}. Pick a
          subject or an exam above. Every paper opens with its first questions; sign in with Google to see all of them
          with the answer key.
        </>
      ),
    },
    {
      q: 'Are there IITM BS PYQs with solutions?',
      a: (
        <>
          Yes. Every question has its solution — the correct option or value from IIT Madras&rsquo;s answer key — and
          its explanation where one has been written, in learning mode. The first questions of every paper are open to
          everyone; the whole paper, its answers, the timed mock test and your saved attempts need a free Google sign-in.
        </>
      ),
    },
    {
      q: 'Can I do IITM BS quiz practice and mock tests here?',
      a: (
        <>
          Yes — any paper can be taken as a timed mock test on a screen laid out like the real IITM exam: the same question
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

        <MistakesCta />
      </section>

      {/* ------------------------------------------------------------- Exams */}
      <Section title="PYQs by exam">
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {exams.map(({ exam }) => (
            <li key={exam.id}>
              <Link
                href={paths.exam(exam.slug)}
                className="group flex h-full items-center gap-4 rounded-card border border-rule bg-surface p-4 transition-colors hover:border-rule-strong"
              >
                <Art src={artFor('exams', exam.slug)} size={48} alt={`IITM BS ${exam.name}`} />
                <span className="min-w-0 text-card text-ink group-hover:underline group-hover:underline-offset-4">
                  {exam.name} PYQ
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

      {/* ---------------------------------------------------------- Why here */}
      {/* --------------------------------------------------- The product tour */}
      <Section title="See Quiz Space in action">
        <ProductShowcase />
      </Section>

      <Section
        title={
          <span className="inline-flex flex-wrap items-center gap-x-[0.3em]">
            Why practise on <BrandInline />
          </span>
        }
      >
        <WhyPractise subjects={subjects.length} since={Math.min(...allYears)} />
      </Section>

      <div className={`${SHELL} pb-14`}>
        <Faq items={faq} variant="accordion" />
      </div>
    </>
  )
}

function LatestCard({ paper }: { paper: PaperEntry }) {
  // One link for the whole card, named for the paper — not a title and an
  // "Open" button to the same place, eight "Open"s on the page.
  return (
    <li className="flex flex-col">
      <Link
        href={paper.path}
        className="group flex h-full flex-col rounded-card border border-rule bg-surface p-4 transition-colors hover:border-rule-strong"
      >
        <div className="flex items-start gap-3">
          <Art src={artFor('subjects', paper.subject.slug)} size={40} alt={shortName(paper.subject)} />
          <div className="min-w-0">
            <h3 className="text-ui leading-snug text-ink group-hover:underline group-hover:underline-offset-4">
              {shortName(paper.subject)} {paper.examType.name}
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
          <span aria-hidden="true" className={buttonClass('primary', 'sm')}>
            Open
            <ArrowRight size={14} />
          </span>
        </div>
      </Link>
      <BestScore setId={paper.setId} className="mt-1 px-1" />
    </li>
  )
}

/** A titled row of the home page, with a link to see all of it. */
function Section({
  title,
  link,
  children,
}: {
  title: ReactNode
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
