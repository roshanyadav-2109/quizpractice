import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getSeoCatalogue, type PaperEntry } from '@/lib/seo/catalogue'
import { pageMetadata } from '@/lib/seo/metadata'
import { collectionPage } from '@/lib/seo/jsonld'
import { listJoin, listOf, plural, shortName, sittingDate } from '@/lib/seo/names'
import { paths } from '@/lib/seo/paths'
import { titles } from '@/lib/seo/titles'
import { examFact } from '@/lib/seo/exam-facts'
import { getActiveStudents } from '@/lib/queries'
import { formatCount } from '@/lib/format'
import { SEASON_ORDER, type Term } from '@/lib/terms'
import { artFor } from '@/lib/art'
import { JsonLd } from '@/components/seo/JsonLd'
import { PaperTable } from '@/components/seo/PaperTable'
import { Faq, type FaqItem } from '@/components/seo/Faq'
import { SeoArticle, SeoHeading, SeoIntro } from '@/components/catalogue/SeoArticle'
import { ExamPaperBrowser } from '@/components/catalogue/ExamPaperBrowser'
import { browserData } from '@/components/catalogue/browser-data'
import { Breadcrumb, SHELL, TitleCard } from '@/components/site/Page'
import { Art } from '@/components/ui/Art'

export const revalidate = 3600

type Params = Promise<{ exam: string; year: string }>

export async function generateStaticParams() {
  const { examTypes, papers } = await getSeoCatalogue()
  const seen = new Set<string>()
  for (const paper of papers) if (paper.term) seen.add(`${paper.examType.slug}|${paper.term.year}`)
  return [...seen].map((key) => {
    const [exam, year] = key.split('|')
    return { exam, year }
  }).filter(({ exam }) => examTypes.some((type) => type.slug === exam))
}

async function load(examSlug: string, yearParam: string) {
  if (!/^\d{4}$/.test(yearParam)) return null
  const year = Number(yearParam)
  const catalogue = await getSeoCatalogue()
  const examType = catalogue.examTypes.find((exam) => exam.slug === examSlug)
  if (!examType) return null
  const all = catalogue.papers.filter((paper) => paper.examType.id === examType.id)
  const papers = all.filter((paper) => paper.term?.year === year)
  if (papers.length === 0) return null
  const years = [...new Set(all.flatMap((paper) => (paper.term ? [paper.term.year] : [])))].sort((a, b) => b - a)
  return { catalogue, examType, papers, year, years }
}

/** The terms of a year that have papers, January first. */
function termsIn(papers: PaperEntry[]): Term[] {
  const byKey = new Map<string, Term>()
  for (const paper of papers) if (paper.term) byKey.set(paper.term.key, paper.term)
  return [...byKey.values()].sort((a, b) => SEASON_ORDER.indexOf(a.season) - SEASON_ORDER.indexOf(b.season))
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { exam, year } = await params
  const data = await load(exam, year)
  if (!data) return { title: 'Not found', robots: { index: false } }
  const subjects = new Set(data.papers.map((paper) => paper.subject.id)).size
  return pageMetadata({
    title: titles.examYear(data.examType, data.year),
    description: `IITM BS ${data.examType.name} PYQ ${data.year} with solutions: all ${formatCount(data.papers.length)} papers — ${listOf(
      termsIn(data.papers).map((term) => term.short),
    )} terms — across ${subjects} subjects, with answer keys.`,
    path: paths.examYear(data.examType.slug, data.year),
  })
}

export default async function ExamYearPage({ params }: { params: Params }) {
  const { exam, year: yearParam } = await params
  const data = await load(exam, yearParam)
  if (!data) notFound()
  const { catalogue, examType, papers, year, years } = data
  const browser = browserData(catalogue, papers, await getActiveStudents())
  const examsThatYear = catalogue.examTypes.filter((exam) =>
    catalogue.papers.some((paper) => paper.examType.id === exam.id && paper.term?.year === year),
  )
  const terms = termsIn(papers)
  const subjects = [...new Map(papers.map((paper) => [paper.subject.id, paper.subject])).values()]
  const questions = papers.reduce((sum, paper) => sum + paper.questionCount, 0)
  const fact = examFact(examType.slug)
  const path = paths.examYear(examType.slug, year)

  const faq: FaqItem[] = [
    {
      q: `Where can I find IITM BS ${examType.name} ${year} question papers?`,
      a: (
        <>
          All {plural(papers.length, `${examType.name} paper`)} from {year} are on this page, by term: {listOf(terms.map((term) => term.label))}. Each
          opens with its first questions; sign in with Google to see it whole with the answer key.
        </>
      ),
    },
    {
      q: `Which subjects have ${examType.name} ${year} papers?`,
      a: <>{listOf(subjects.map((subject) => shortName(subject)).slice(0, 14))}{subjects.length > 14 ? `, and ${subjects.length - 14} more` : ''}.</>,
    },
    ...(fact ? [{ q: `What does the IITM BS ${examType.name} cover?`, a: <>{fact.scope}</> }] : []),
  ]

  const art = artFor('exams', examType.slug)

  return (
    <div className={`${SHELL} py-6`}>
      <JsonLd
        data={collectionPage({
          path,
          name: titles.examYearHeading(examType, year),
          description: `IITM BS ${examType.name} papers from ${year}.`,
          crumbs: [
            { name: 'Home', path: '/' },
            { name: `${examType.name} PYQ`, path: paths.exam(examType.slug) },
            { name: String(year), path },
          ],
          items: papers.map((paper) => ({
            name: `${shortName(paper.subject)} ${examType.name} ${sittingDate(paper.sessionDate)}`,
            path: paper.path,
          })),
        })}
      />

      <Breadcrumb
        crumbs={[
          { label: 'Home', href: '/' },
          { label: `${examType.name} PYQ`, href: paths.exam(examType.slug) },
          { label: String(year) },
        ]}
      />
      <TitleCard
        back={paths.exam(examType.slug)}
        icon={art ? <Art src={art} size={48} alt={`IITM BS ${examType.name}`} /> : undefined}
        title={titles.examYearHeading(examType, year)}
      />

      <ExamPaperBrowser
        base={{ exam: examType.slug, year: String(year) }}
        exam={{
          value: examType.slug,
          options: examsThatYear.map((exam) => ({ value: exam.slug, label: exam.name, href: paths.examYear(exam.slug, year) })),
          allHref: paths.year(year),
        }}
        year={{
          value: String(year),
          options: years.map((other) => ({ value: String(other), label: String(other), href: paths.examYear(examType.slug, other) })),
          allHref: paths.exam(examType.slug),
        }}
        {...browser}
      />

      <SeoArticle title={`More on ${examType.name} PYQ ${year}`}>
        <SeoIntro
          lead={
            <p>
              <strong>{plural(papers.length, `IITM BS ${examType.name} paper`)}</strong> from {year} — the{' '}
              {listOf(terms.map((term) => term.label))} — across {plural(subjects.length, 'subject')}, with{' '}
              {formatCount(questions)} questions and their answer keys, open with a free Google sign-in.{' '}
              {fact ? fact.scope : ''}
            </p>
          }
          statsTitle={`${examType.name} PYQ ${year} at a glance`}
          stats={[
            { label: 'Papers', value: formatCount(papers.length) },
            { label: 'Subjects', value: String(subjects.length) },
            { label: 'Terms', value: String(terms.length) },
          ]}
        />

        {years.length > 1 ? (
          <nav aria-label="Other years">
            <p className="mt-6">
              {examType.name} PYQs by year:{' '}
              {years.map((other, index) => (
                <span key={other}>
                  {listJoin(index, years.length)}
                  {other === year ? (
                    <span aria-current="page" className="font-medium">
                      {other}
                    </span>
                  ) : (
                    <Link href={paths.examYear(examType.slug, other)}>
                      {examType.name} {other}
                    </Link>
                  )}
                </span>
              ))}
              .
            </p>
          </nav>
        ) : null}

        {terms.map((term) => (
          <section key={term.key} aria-labelledby={`t-${term.key}`}>
            <SeoHeading id={`t-${term.key}`}>
              {examType.name} — {term.label}
            </SeoHeading>
            <PaperTable
              variant="article"
              papers={papers.filter((paper) => paper.term?.key === term.key)}
              showSubject
              caption={`${examType.name} papers from the ${term.label}`}
            />
          </section>
        ))}

        <Faq className="mt-12" items={faq} variant="accordion" />

        <p className="mt-12 text-ui text-ink-muted">
          Also see{' '}
          <Link href={paths.exam(examType.slug)}>every IITM BS {examType.name} paper, all years</Link>, and{' '}
          <Link href={paths.year(year)}>every IITM BS paper from {year}</Link>.
        </p>
      </SeoArticle>
    </div>
  )
}
