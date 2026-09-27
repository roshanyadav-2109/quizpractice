import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getSeoCatalogue } from '@/lib/seo/catalogue'
import { pageMetadata } from '@/lib/seo/metadata'
import { collectionPage } from '@/lib/seo/jsonld'
import { listJoin, listOf, plural, shortName } from '@/lib/seo/names'
import { paths } from '@/lib/seo/paths'
import { titles } from '@/lib/seo/titles'
import { getActiveStudents } from '@/lib/queries'
import { formatCount } from '@/lib/format'
import { JsonLd } from '@/components/seo/JsonLd'
import { ArticleTable, SeoArticle, SeoHeading, SeoIntro } from '@/components/catalogue/SeoArticle'
import { ExamPaperBrowser } from '@/components/catalogue/ExamPaperBrowser'
import { browserData } from '@/components/catalogue/browser-data'
import { Breadcrumb, SHELL, TitleCard } from '@/components/site/Page'

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
 * Everything sat in one year, opening on the site's own papers view — that
 * year's newest papers, with the filters — and under it, by exam, every
 * subject with how many of that year's papers it has. One copy for everyone
 * from the CDN.
 */
export default async function YearPage({ params }: { params: Params }) {
  const data = await load((await params).year)
  if (!data) notFound()
  const { catalogue, papers, year, years, exams } = data
  const subjects = new Set(papers.map((paper) => paper.subject.id)).size
  const browser = browserData(catalogue, papers, await getActiveStudents())

  return (
    <div className={`${SHELL} py-6`}>
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

      <Breadcrumb crumbs={[{ label: 'Home', href: '/' }, { label: `${year} PYQs` }]} />
      <TitleCard title={titles.yearHeading(year)} />

      <ExamPaperBrowser
        base={{ year: String(year) }}
        exam={{
          value: '',
          options: exams.map(({ examType }) => ({ value: examType.slug, label: examType.name, href: paths.examYear(examType.slug, year) })),
        }}
        year={{
          value: String(year),
          options: years.map((other) => ({ value: String(other), label: String(other), href: paths.year(other) })),
          allHref: '/papers',
        }}
        {...browser}
      />

      <SeoArticle title={`More on IITM BS ${year} PYQs`}>
        <SeoIntro
          lead={
            <p>
              <strong>{plural(papers.length, 'IITM BS paper')}</strong> from the {year} terms, across{' '}
              {plural(subjects, 'subject')}: {listOf(exams.map(({ examType, papers: list }) => `${formatCount(list.length)} ${examType.name}`))}.
              Every question has its answer key and a video solution on its own page, and every paper can be taken as a
              timed mock test.
            </p>
          }
          statsTitle={`IITM BS PYQ ${year} at a glance`}
          stats={[
            { label: 'Papers', value: formatCount(papers.length) },
            { label: 'Subjects', value: String(subjects) },
            ...exams.map(({ examType, papers: list }) => ({ label: examType.name, value: formatCount(list.length) })),
          ]}
        />

        {years.length > 1 ? (
          <nav aria-label="Other years">
            <p className="mt-6">
              IITM BS PYQs by year:{' '}
              {years.map((other, index) => (
                <span key={other}>
                  {listJoin(index, years.length)}
                  {other === year ? (
                    <span aria-current="page" className="font-medium">
                      {other}
                    </span>
                  ) : (
                    <Link href={paths.year(other)}>PYQs {other}</Link>
                  )}
                </span>
              ))}
              .
            </p>
          </nav>
        ) : null}

        {exams.map(({ examType, papers: list }) => {
          const bySubject = [...new Map(list.map((paper) => [paper.subject.id, paper.subject])).values()].map((subject) => ({
            subject,
            count: list.filter((paper) => paper.subject.id === subject.id).length,
          }))
          return (
            <section key={examType.id} aria-labelledby={`e-${examType.slug}`}>
              <SeoHeading id={`e-${examType.slug}`}>
                IITM BS {examType.name} PYQ {year}
              </SeoHeading>
              <ArticleTable
                caption={`IITM BS ${examType.name} PYQ ${year}`}
                head={['Subject', 'Course', 'Papers']}
                minWidth="30rem"
                widths={['36%', '46%', '18%']}
                rows={bySubject.map(({ subject, count }) => {
                  const node = catalogue.subjectBySlug.get(subject.slug)
                  const single = count === 1 ? list.find((paper) => paper.subject.id === subject.id) : null
                  const href = single ? single.path : paths.subjectExamYear(subject.slug, examType.slug, year)
                  return {
                    key: subject.id,
                    cells: [
                      <Link key="subject" href={node ? href : paths.examYear(examType.slug, year)}>
                        {shortName(subject)} {examType.name} {year}
                      </Link>,
                      subject.name,
                      <span key="count" className="tabular-nums">
                        {count}
                      </span>,
                    ],
                  }
                })}
              />
              <p className="mt-3">
                <Link href={paths.examYear(examType.slug, year)}>
                  All {plural(list.length, `${examType.name} paper`)} from {year} →
                </Link>
              </p>
            </section>
          )
        })}
      </SeoArticle>
    </div>
  )
}
