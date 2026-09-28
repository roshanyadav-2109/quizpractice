import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { titles } from '@/lib/seo/titles'
import { getSeoCatalogue, type PaperEntry } from '@/lib/seo/catalogue'
import { pageMetadata } from '@/lib/seo/metadata'
import { collectionPage } from '@/lib/seo/jsonld'
import { paths } from '@/lib/seo/paths'
import { listOf, plural, shortName, sittingDate, termName, yearSpan, listJoin } from '@/lib/seo/names'
import { examFact } from '@/lib/seo/exam-facts'
import { getActiveStudents } from '@/lib/queries'
import { formatCount } from '@/lib/format'
import { artFor } from '@/lib/art'
import { JsonLd } from '@/components/seo/JsonLd'
import { PaperTable } from '@/components/seo/PaperTable'
import { Faq, type FaqItem } from '@/components/seo/Faq'
import { ArticleTable, SeoArticle, SeoHeading, SeoIntro } from '@/components/catalogue/SeoArticle'
import { ExamPaperBrowser } from '@/components/catalogue/ExamPaperBrowser'
import { browserData } from '@/components/catalogue/browser-data'
import { Spotlight } from '@/components/site/Spotlight'
import { Breadcrumb, SHELL, TitleCard } from '@/components/site/Page'
import { Art } from '@/components/ui/Art'

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
    )}, with answer keys and free ${examType.name} mock tests.`,
    path: `/exam/${examType.slug}`,
  })
}

/**
 * An exam, opening on the site's own papers view — the filters, the newest
 * cards, the pages — with the reading half under it: the answer, the numbers,
 * the exam's format, every subject that sits it. One copy for everyone from
 * the CDN.
 */
export default async function ExamHub({ params }: { params: Params }) {
  const data = await load((await params).exam)
  if (!data) notFound()
  const { catalogue, examType, papers } = data
  const fact = examFact(examType.slug)
  const path = `/exam/${examType.slug}`
  const questions = papers.reduce((sum, paper) => sum + paper.questionCount, 0)
  const subjectIds = new Set(papers.map((paper) => paper.subject.id))
  const updated = papers.map((paper) => paper.updatedAt).filter(Boolean).sort().at(-1) ?? null
  const active = await getActiveStudents()
  const art = artFor('exams', examType.slug)

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

  // The papers view: this exam's filters and newest cards.
  const browser = browserData(catalogue, papers, active)

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
          Yes — every question has its answer key and, where one has been written, its explanation. Each paper shows its
          first questions to anyone; with a free Google sign-in you see it whole, and can take it as a timed{' '}
          {examType.name} mock test on a screen laid out like the real exam.
        </>
      ),
    },
    {
      q: `Which subjects have ${examType.name} papers?`,
      a: <>{listOf([...new Set(papers.map((paper) => shortName(paper.subject)))].slice(0, 12))}{subjectIds.size > 12 ? `, and ${subjectIds.size - 12} more` : ''}.</>,
    },
  ]

  return (
    <div className={`${SHELL} py-6`}>
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

      <Spotlight placement="papers" shared className="mb-6" />
      <Breadcrumb crumbs={[{ label: 'Home', href: '/' }, { label: `${examType.name} PYQ` }]} />
      <TitleCard
        icon={art ? <Art src={art} size={48} alt={`IITM BS ${examType.name}`} /> : undefined}
        title={titles.examHeading(examType)}
      />

      <ExamPaperBrowser
        base={{ exam: examType.slug }}
        exam={{
          value: examType.slug,
          options: catalogue.examTypes
            .filter((exam) => catalogue.papers.some((paper) => paper.examType.id === exam.id))
            .map((exam) => ({ value: exam.slug, label: exam.name, href: paths.exam(exam.slug) })),
          allHref: '/papers',
        }}
        year={{
          value: '',
          options: years(papers)
            .sort((a, b) => b - a)
            .map((year) => ({ value: String(year), label: String(year), href: paths.examYear(examType.slug, year) })),
        }}
        {...browser}
      />

      <SeoArticle title={`More on ${examType.name} PYQs`}>
        <SeoIntro
          lead={
            <p>
              <strong>
                {formatCount(papers.length)} {examType.name} papers
              </strong>{' '}
              across {plural(subjectIds.size, 'subject')} of the IIT Madras BS degree, {yearSpan(years(papers))} —{' '}
              {formatCount(questions)} questions, each with its answer key, open with a free Google sign-in.{' '}
              {fact ? fact.scope : ''} Choose a subject or a year, or start with the latest papers below.
            </p>
          }
          statsTitle={`${examType.name} PYQ at a glance`}
          stats={[
            { label: 'Papers', value: formatCount(papers.length) },
            { label: 'Subjects', value: String(subjectIds.size) },
            { label: 'Questions', value: formatCount(questions) },
            { label: 'Years', value: yearSpan(years(papers)) },
          ]}
          updated={updated}
        />

        {years(papers).length > 0 ? (
          <nav aria-label={`${examType.name} PYQs by year`}>
            <p className="mt-6">
              {examType.name} PYQs by year:{' '}
              {years(papers)
                .sort((a, b) => b - a)
                .map((year, index, all) => (
                  <span key={year}>
                    {listJoin(index, all.length)}
                    <Link href={paths.examYear(examType.slug, year)}>
                      {examType.name} PYQ {year}
                    </Link>
                  </span>
                ))}
              .
            </p>
          </nav>
        ) : null}

        {fact ? (
          <section aria-labelledby="about-exam">
            <SeoHeading id="about-exam">About the {examType.name}</SeoHeading>
            <p>{fact.about}</p>
            <h3 className="mt-6 mb-2 text-[1.125rem] leading-snug font-bold text-ink">Exam format</h3>
            <ul className="flex list-disc flex-col gap-1.5 pl-6">
              {fact.format.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {programs.map(({ program, levels }) => (
          <section key={program.program.id} aria-labelledby={`p-${program.slug}`}>
            <SeoHeading id={`p-${program.slug}`}>
              {program.program.short_name ?? program.program.name} {examType.name} PYQs
            </SeoHeading>
            {levels.map(({ level, subjects }) => (
              <div key={level.level.id} className="mt-5">
                <h3 className="mb-2 text-[1.125rem] leading-snug font-bold text-ink">
                  {level.level.name}
                  <span className="sr-only"> — {program.program.short_name ?? program.program.name}</span>
                </h3>
                <ArticleTable
                  caption={`${level.level.name} ${examType.name} papers, ${program.program.short_name ?? program.program.name}`}
                  head={['Subject', 'Course', 'Papers', 'Latest paper']}
                  widths={['32%', '38%', '12%', '18%']}
                  minWidth="36rem"
                  rows={subjects.map(({ node, exam }) => ({
                    key: node.subject.id,
                    cells: [
                      <Link key="subject" href={exam.path}>
                        {shortName(node.subject)} {examType.name} PYQ
                      </Link>,
                      node.subject.name,
                      <span key="papers" className="tabular-nums">
                        {exam.papers.length}
                      </span>,
                      <span key="latest" className="whitespace-nowrap">
                        {sittingDate(exam.papers[0]?.sessionDate ?? null)}
                      </span>,
                    ],
                  }))}
                />
              </div>
            ))}
          </section>
        ))}

        {sittings.length > 0 ? (
          <section aria-labelledby="sittings">
            <SeoHeading id="sittings">{examType.name} papers by sitting</SeoHeading>
            <p className="mb-4">Each {examType.name} is sat on one day across its subjects. The most recent sittings:</p>
            <ArticleTable
              caption={`${examType.name} papers by sitting`}
              head={['Sitting', 'Term', 'Papers']}
              rows={sittings.map(([date, sitting]) => ({
                key: date,
                cells: [
                  <span key="date" className="whitespace-nowrap">
                    {sittingDate(date)}
                  </span>,
                  termName(sitting[0].term),
                  sitting.map((paper, index) => (
                    <span key={paper.setId}>
                      {listJoin(index, sitting.length)}
                      <Link href={paper.path}>
                        {shortName(paper.subject)}
                        {paper.setsInSitting > 1 ? ` (${paper.setCode})` : ''}
                        <span className="sr-only">
                          {' '}
                          {examType.name} {sittingDate(date)}
                        </span>
                      </Link>
                    </span>
                  )),
                ],
              }))}
            />
          </section>
        ) : null}

        <section aria-labelledby="latest">
          <SeoHeading id="latest">Latest {examType.name} papers</SeoHeading>
          <PaperTable papers={papers.slice(0, LATEST)} showSubject caption={`Latest ${examType.name} papers`} variant="article" />
        </section>

        <Faq className="mt-12" items={faq} variant="accordion" />
      </SeoArticle>
    </div>
  )
}
