import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getSeoCatalogue } from '@/lib/seo/catalogue'
import { pageMetadata } from '@/lib/seo/metadata'
import { collectionPage } from '@/lib/seo/jsonld'
import { listOf, plural, shortName } from '@/lib/seo/names'
import { paths } from '@/lib/seo/paths'
import { titles } from '@/lib/seo/titles'
import { formatCount } from '@/lib/format'
import { JsonLd } from '@/components/seo/JsonLd'
import { HubHeader } from '@/components/seo/HubHeader'
import { SHELL } from '@/components/site/Page'
import { buttonClass } from '@/components/ui/primitives'

export const revalidate = 3600

type Params = Promise<{ year: string }>

export async function generateStaticParams() {
  const { papers } = await getSeoCatalogue()
  return [...new Set(papers.flatMap((paper) => (paper.term ? [paper.term.year] : [])))].map((year) => ({ year: String(year) }))
}

async function load(yearParam: string) {
  if (!/^\d{4}$/.test(yearParam)) return null
  const year = Number(yearParam)
  const catalogue = await getSeoCatalogue()
  const papers = catalogue.papers.filter((paper) => paper.term?.year === year)
  if (papers.length === 0) return null
  const years = [...new Set(catalogue.papers.flatMap((paper) => (paper.term ? [paper.term.year] : [])))].sort((a, b) => b - a)
  const exams = catalogue.examTypes
    .map((examType) => ({ examType, papers: papers.filter((paper) => paper.examType.id === examType.id) }))
    .filter((entry) => entry.papers.length > 0)
  return { catalogue, papers, year, years, exams }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const data = await load((await params).year)
  if (!data) return { title: 'Not found', robots: { index: false } }
  return pageMetadata({
    title: titles.year(data.year),
    description: `IITM BS PYQ ${data.year} with solutions, answer keys and video solutions: ${listOf(
      data.exams.map(({ examType, papers }) => `${formatCount(papers.length)} ${examType.name}`),
    )} papers.`,
    path: paths.year(data.year),
  })
}

/**
 * Everything sat in one year, by exam, and inside each exam every subject
 * with how many of that year's papers it has.
 */
export default async function YearPage({ params }: { params: Params }) {
  const data = await load((await params).year)
  if (!data) notFound()
  const { catalogue, papers, year, years, exams } = data
  const subjects = new Set(papers.map((paper) => paper.subject.id)).size

  return (
    <div className={`${SHELL} py-6 sm:py-8`}>
      <JsonLd
        data={collectionPage({
          path: paths.year(year),
          name: titles.yearHeading(year),
          description: `IITM BS previous year question papers from ${year}.`,
          crumbs: [
            { name: 'Home', path: '/' },
            { name: `${year} PYQs`, path: paths.year(year) },
          ],
          items: exams.map(({ examType }) => ({ name: `IITM BS ${examType.name} PYQ ${year}`, path: paths.examYear(examType.slug, year) })),
        })}
      />
      <HubHeader
        crumbs={[{ label: 'Home', href: '/' }, { label: `${year} PYQs` }]}
        eyebrow="IIT Madras BS degree"
        title={titles.yearHeading(year)}
        lead={
          <p>
            <strong className="font-medium text-ink">{plural(papers.length, 'IITM BS paper')}</strong> from the {year} terms,
            across {plural(subjects, 'subject')}: {listOf(exams.map(({ examType, papers: list }) => `${formatCount(list.length)} ${examType.name}`))}.
            Every question has its answer key and a video solution on its own page, and every paper can be taken as a
            timed mock test.
          </p>
        }
      />

      {years.length > 1 ? (
        <nav aria-label="Other years" className="mt-6 flex flex-wrap gap-2">
          {years.map((other) =>
            other === year ? (
              <span key={other} aria-current="page" className={buttonClass('primary', 'sm')}>
                {other}
              </span>
            ) : (
              <Link key={other} href={paths.year(other)} className={buttonClass('outline', 'sm')}>
                PYQs {other}
              </Link>
            ),
          )}
        </nav>
      ) : null}

      {exams.map(({ examType, papers: list }) => {
        const bySubject = [...new Map(list.map((paper) => [paper.subject.id, paper.subject])).values()].map((subject) => ({
          subject,
          count: list.filter((paper) => paper.subject.id === subject.id).length,
        }))
        return (
          <section key={examType.id} className="mt-10" aria-labelledby={`e-${examType.slug}`}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4">
              <h2 id={`e-${examType.slug}`} className="text-[1.375rem] leading-tight font-medium text-ink">
                IITM BS {examType.name} PYQ {year}
              </h2>
              <Link href={paths.examYear(examType.slug, year)} className="text-meta text-ink-muted hover:text-ink hover:underline">
                All {plural(list.length, `${examType.name} paper`)} from {year} →
              </Link>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {bySubject.map(({ subject, count }) => {
                const node = catalogue.subjectBySlug.get(subject.slug)
                const single = count === 1 ? list.find((paper) => paper.subject.id === subject.id) : null
                const href = single ? single.path : paths.subjectExamYear(subject.slug, examType.slug, year)
                return (
                  <li key={subject.id}>
                    <Link
                      href={node ? href : paths.examYear(examType.slug, year)}
                      className="flex items-center justify-between gap-3 rounded-card border border-rule bg-surface px-4 py-3 transition-colors hover:border-rule-strong"
                    >
                      <span className="min-w-0 truncate text-ui text-ink">
                        {shortName(subject)} {examType.name} {year}
                      </span>
                      <span className="shrink-0 text-meta text-ink-muted tabular-nums">{count}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
