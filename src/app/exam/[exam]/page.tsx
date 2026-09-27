import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { titles } from '@/lib/seo/titles'
import { getSeoCatalogue, type PaperEntry } from '@/lib/seo/catalogue'
import { pageMetadata } from '@/lib/seo/metadata'
import { collectionPage } from '@/lib/seo/jsonld'
import { listOf, plural, shortName, sittingDate, termName, yearSpan } from '@/lib/seo/names'
import { paths } from '@/lib/seo/paths'
import { CHECKED, examFact } from '@/lib/seo/exam-facts'
import { formatCount } from '@/lib/format'
import { artFor } from '@/lib/art'
import { JsonLd } from '@/components/seo/JsonLd'
import { HubHeader } from '@/components/seo/HubHeader'
import { PaperTable } from '@/components/seo/PaperTable'
import { Faq, type FaqItem } from '@/components/seo/Faq'
import { SHELL } from '@/components/site/Page'
import { Art } from '@/components/ui/Art'
import { buttonClass } from '@/components/ui/primitives'

export const revalidate = 3600

type Params = Promise<{ exam: string }>

export async function generateStaticParams() {
  const { examTypes, papers } = await getSeoCatalogue()
  return examTypes.filter((exam) => papers.some((paper) => paper.examType.id === exam.id)).map((exam) => ({ exam: exam.slug }))
}

const LATEST = 12

async function load(slug: string) {
  const catalogue = await getSeoCatalogue()
  const examType = catalogue.examTypes.find((exam) => exam.slug === slug)
  const papers = examType ? catalogue.papers.filter((paper) => paper.examType.id === examType.id) : []
  if (!examType || papers.length === 0) return null
  return { catalogue, examType, papers }
}

function years(papers: PaperEntry[]): number[] {
  return [...new Set(papers.flatMap((paper) => (paper.term ? [paper.term.year] : [])))]
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const data = await load((await params).exam)
  if (!data) return { title: 'Exam not found', robots: { index: false } }
  const { examType, papers } = data
  const subjects = new Set(papers.map((paper) => paper.subject.id)).size
  return pageMetadata({
    title: titles.exam(examType, years(papers)),
    description: `IITM BS ${examType.name} PYQs with solutions: ${formatCount(papers.length)} papers across ${subjects} subjects, ${yearSpan(
      years(papers),
    )}, with answer keys, video solutions and free ${examType.name} mock tests.`,
    path: `/exam/${examType.slug}`,
  })
}

export default async function ExamHub({ params }: { params: Params }) {
  const data = await load((await params).exam)
  if (!data) notFound()
  const { catalogue, examType, papers } = data
  const fact = examFact(examType.slug)
  const path = `/exam/${examType.slug}`
  const questions = papers.reduce((sum, paper) => sum + paper.questionCount, 0)
  const subjectIds = new Set(papers.map((paper) => paper.subject.id))
  const updated = papers.map((paper) => paper.updatedAt).filter(Boolean).sort().at(-1) ?? null

  // Programme → level → the subjects with this exam, each with its own exam page.
  const programs = catalogue.programs
    .map((program) => ({
      program,
      levels: program.levels
        .map((level) => ({
          level,
          subjects: level.subjects.flatMap((node) => {
            const exam = node.exams.find((entry) => entry.examType.id === examType.id)
            return exam ? [{ node, exam }] : []
          }),
        }))
        .filter((level) => level.subjects.length > 0),
    }))
    .filter((program) => program.levels.length > 0)

  // A qualifier is one sitting across several subjects: group its papers by day.
  const sittings = examType.slug.includes('qualifier')
    ? [...new Map(papers.map((paper) => [paper.sessionDate ?? '', papers.filter((other) => other.sessionDate === paper.sessionDate)])).entries()]
        .filter(([date]) => date)
        .slice(0, 16)
    : []

  const faq: FaqItem[] = [
    {
      q: `Where can I find IITM BS ${examType.name} previous year papers?`,
      a: (
        <>
          Every {examType.name} paper on Quiz Space is linked from this page: {formatCount(papers.length)} papers across{' '}
          {plural(subjectIds.size, 'subject')}, {yearSpan(years(papers))}. Pick a subject below to see its {examType.name}{' '}
          papers by year, or a year to see every subject&rsquo;s {examType.name} from that year.
        </>
      ),
    },
    ...(fact?.faq ?? []).map((item) => ({ q: item.q, a: <>{item.a}</> })),
    {
      q: `Are there IITM BS ${examType.name} PYQs with solutions?`,
      a: (
        <>
          Yes — every question shows its answer key, and each question has its own page where its video solution plays.
          Every paper can also be taken as a free, timed {examType.name} mock test on a screen laid out like the real exam.
        </>
      ),
    },
    {
      q: `Which subjects have ${examType.name} papers?`,
      a: <>{listOf([...new Set(papers.map((paper) => shortName(paper.subject)))].slice(0, 12))}{subjectIds.size > 12 ? `, and ${subjectIds.size - 12} more` : ''}.</>,
    },
  ]

  const art = artFor('exams', examType.slug)

  return (
    <div className={`${SHELL} py-6 sm:py-8`}>
      <JsonLd
        data={collectionPage({
          path,
          name: `IITM BS ${examType.name} previous year papers`,
          description: `Every IITM BS ${examType.name} paper, by subject.`,
          crumbs: [
            { name: 'Home', path: '/' },
            { name: `${examType.name} PYQ`, path },
          ],
          items: programs.flatMap((program) =>
            program.levels.flatMap((level) =>
              level.subjects.map(({ node, exam }) => ({ name: `${shortName(node.subject)} ${examType.name} PYQ`, path: exam.path })),
            ),
          ),
          modified: updated,
        })}
      />

      <HubHeader
        crumbs={[{ label: 'Home', href: '/' }, { label: `${examType.name} PYQ` }]}
        icon={art ? <Art src={art} size={56} alt={`IITM BS ${examType.name}`} /> : undefined}
        eyebrow="IIT Madras BS degree"
        title={titles.examHeading(examType)}
        lead={
          <p>
            <strong className="font-medium text-ink">{formatCount(papers.length)} {examType.name} papers</strong> across{' '}
            {plural(subjectIds.size, 'subject')} of the IIT Madras BS degree, {yearSpan(years(papers))} —{' '}
            {formatCount(questions)} questions, each with its answer key and a video solution on its own page.{' '}
            {fact ? fact.scope : ''} Choose a subject or a year, or start with the latest papers below.
          </p>
        }
        stats={[
          { label: 'Papers', value: formatCount(papers.length) },
          { label: 'Subjects', value: String(subjectIds.size) },
          { label: 'Questions', value: formatCount(questions) },
          { label: 'Years', value: yearSpan(years(papers)) },
        ]}
        updated={updated}
      />

      {years(papers).length > 0 ? (
        <nav aria-label={`${examType.name} PYQs by year`} className="mt-6 flex flex-wrap gap-2">
          {years(papers)
            .sort((a, b) => b - a)
            .map((year) => (
              <Link key={year} href={paths.examYear(examType.slug, year)} className={buttonClass('outline', 'sm')}>
                {examType.name} PYQ {year}
              </Link>
            ))}
        </nav>
      ) : null}

      {fact ? (
        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]" aria-labelledby="about-exam">
          <div>
            <h2 id="about-exam" className="text-[1.375rem] leading-tight font-medium text-ink">
              About the {examType.name}
            </h2>
            <p className="mt-2 max-w-[72ch] text-ui leading-relaxed text-ink-muted">{fact.about}</p>
          </div>
          <div className="rounded-card border border-rule bg-surface p-5">
            <h3 className="text-ui font-medium text-ink">Exam format</h3>
            <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4 text-meta leading-relaxed text-ink-muted">
              {fact.format.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-3 text-[0.75rem] text-ink-faint">
              From{' '}
              {fact.sources.map((source, index) => (
                <span key={source.url}>
                  {index > 0 ? ', ' : ''}
                  <a href={source.url} rel="noopener" className="underline-offset-2 hover:text-ink hover:underline">
                    {source.label}
                  </a>
                </span>
              ))}{' '}
              — checked {CHECKED}. Rules change between terms; confirm for yours.
            </p>
          </div>
        </section>
      ) : null}

      {programs.map(({ program, levels }) => (
        <section key={program.program.id} className="mt-10" aria-labelledby={`p-${program.slug}`}>
          <h2 id={`p-${program.slug}`} className="text-[1.375rem] leading-tight font-medium text-ink">
            {program.program.short_name ?? program.program.name} {examType.name} PYQs
          </h2>
          {levels.map(({ level, subjects }) => (
            <div key={level.level.id} className="mt-5">
              <h3 className="text-ui font-medium text-ink-muted">
                {level.level.name}
                <span className="sr-only"> — {program.program.short_name ?? program.program.name}</span>
              </h3>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {subjects.map(({ node, exam }) => (
                  <li key={node.subject.id}>
                    <Link
                      href={exam.path}
                      className="flex items-center justify-between gap-3 rounded-card border border-rule bg-surface px-4 py-3 transition-colors hover:border-rule-strong"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-ui text-ink">
                          {shortName(node.subject)} {examType.name} PYQ
                        </span>
                        <span className="block truncate text-meta text-ink-faint">
                          {node.subject.name} · latest {sittingDate(exam.papers[0]?.sessionDate ?? null)}
                        </span>
                      </span>
                      <span className="shrink-0 text-meta text-ink-muted tabular-nums">{exam.papers.length}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}

      {sittings.length > 0 ? (
        <section className="mt-12" aria-labelledby="sittings">
          <h2 id="sittings" className="text-[1.375rem] leading-tight font-medium text-ink">
            {examType.name} papers by sitting
          </h2>
          <p className="mt-1 text-ui text-ink-muted">
            Each {examType.name} is sat on one day across its subjects. The most recent sittings:
          </p>
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {sittings.map(([date, sitting]) => (
              <li key={date} className="rounded-card border border-rule bg-surface px-4 py-3">
                <p className="text-ui text-ink">
                  {sittingDate(date)} <span className="text-meta text-ink-faint">· {termName(sitting[0].term)}</span>
                </p>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-meta">
                  {sitting.map((paper) => (
                    <Link key={paper.setId} href={paper.path} className="text-accent hover:underline">
                      {shortName(paper.subject)}
                      {paper.setsInSitting > 1 ? ` (${paper.setCode})` : ''}
                      <span className="sr-only">
                        {' '}
                        {examType.name} {sittingDate(date)}
                      </span>
                    </Link>
                  ))}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-12" aria-labelledby="latest">
        <h2 id="latest" className="mb-3 text-[1.375rem] leading-tight font-medium text-ink">
          Latest {examType.name} papers
        </h2>
        <PaperTable papers={papers.slice(0, LATEST)} showSubject caption={`Latest ${examType.name} papers`} />
      </section>

      <Faq className="mt-12" items={faq} />

      <p className="mt-10 text-meta text-ink-faint">
        Quiz Space by Unknown IITians is an independent practice site, not affiliated with IIT Madras. Official exam
        rules and schedules are on{' '}
        <a href="https://study.iitm.ac.in/" rel="noopener" className="hover:text-ink hover:underline">
          study.iitm.ac.in
        </a>
        .
      </p>
    </div>
  )
}
