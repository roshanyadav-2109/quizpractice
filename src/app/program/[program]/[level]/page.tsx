import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import type { Metadata } from 'next'
import { titles } from '@/lib/seo/titles'
import { getSeoCatalogue } from '@/lib/seo/catalogue'
import { findProgram, levelWithPapers } from '@/lib/seo/program'
import { pageMetadata } from '@/lib/seo/metadata'
import { collectionPage } from '@/lib/seo/jsonld'
import { listOf, plural, shortName, sittingDate, yearSpan, listJoin } from '@/lib/seo/names'
import { formatCount } from '@/lib/format'
import { artFor } from '@/lib/art'
import { getFinderPrograms } from '@/lib/subject-finder'
import { JsonLd } from '@/components/seo/JsonLd'
import { ArticleTable, SeoArticle, SeoHeading, SeoIntro } from '@/components/catalogue/SeoArticle'
import { SubjectFinder } from '@/components/site/SubjectFinder'
import { Breadcrumb, SHELL } from '@/components/site/Page'
import { Art } from '@/components/ui/Art'

export const revalidate = 3600

type Params = Promise<{ program: string; level: string }>

export async function generateStaticParams() {
  const { programs } = await getSeoCatalogue()
  return programs.flatMap((program) =>
    program.levels
      .filter((level) => level.subjects.some((subject) => subject.paperCount > 0))
      .map((level) => ({ program: program.slug, level: level.level.slug })),
  )
}

async function load(programSlug: string, levelSlug: string) {
  const found = await findProgram(programSlug)
  const level = found ? levelWithPapers(found.program, levelSlug) : null
  return found && level ? { ...found, level } : null
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { program: programSlug, level: levelSlug } = await params
  const data = await load(programSlug, levelSlug)
  if (!data) return { title: 'Not found', robots: { index: false } }
  const { program, level } = data
  const subjects = level.subjects.filter((subject) => subject.paperCount > 0)
  return pageMetadata({
    title: titles.level(level.level, program.program, subjects.map((subject) => subject.subject)),
    description: `IITM BS ${level.level.name} PYQs with solutions for ${listOf(
      subjects.slice(0, 5).map((subject) => shortName(subject.subject)),
    )}${subjects.length > 5 ? ' and more' : ''}: ${formatCount(subjects.reduce((sum, subject) => sum + subject.paperCount, 0))} papers with answer keys and video solutions.`,
    path: level.path,
  })
}

/**
 * A level of a programme, opening on the site's own subjects view — the
 * levels down the side, this one chosen, its subjects as cards — with the
 * reading half under it: the answer, the numbers, every subject as a table.
 * One copy for everyone from the CDN.
 */
export default async function LevelHub({ params }: { params: Params }) {
  const { program: programSlug, level: levelSlug } = await params
  const data = await load(programSlug, levelSlug)
  if (!data) notFound()
  const { program, level } = data
  if (programSlug !== program.slug) permanentRedirect(level.path)

  const name = program.program.short_name ?? program.program.name
  const subjects = level.subjects.filter((subject) => subject.paperCount > 0)
  const papers = subjects.reduce((sum, subject) => sum + subject.paperCount, 0)
  const questions = subjects.reduce((sum, subject) => sum + subject.questionCount, 0)
  const finderPrograms = await getFinderPrograms()
  const art = artFor('levels', level.level.slug)

  return (
    <div className={`${SHELL} py-6`}>
      <JsonLd
        data={collectionPage({
          path: level.path,
          name: `IITM BS ${level.level.name} previous year papers`,
          description: `${name} ${level.level.name} subjects with previous year papers.`,
          crumbs: [
            { name: 'Home', path: '/' },
            { name: name, path: program.path },
            { name: level.level.name, path: level.path },
          ],
          items: subjects.map((subject) => ({ name: `${shortName(subject.subject)} PYQ`, path: subject.path })),
        })}
      />

      <Breadcrumb crumbs={[{ label: 'Home', href: '/' }, { label: name, href: program.path }, { label: level.level.name }]} />
      <SubjectFinder
        programs={finderPrograms}
        initialProgram={program.program.slug}
        initialLevel={level.level.slug}
        icon={art ? <Art src={art} size={48} alt={level.level.name} /> : undefined}
        title={titles.levelHeading(level.level, program.program)}
        syncUrl={false}
      />

      <SeoArticle title={`More on ${level.level.name} PYQs`}>
        <SeoIntro
          lead={
            <p>
              {plural(subjects.length, `${level.level.name} subject`)} of the IIT Madras {program.program.name} with previous
              year papers — <strong className="font-medium text-ink">{formatCount(papers)} papers</strong> and{' '}
              {formatCount(questions)} questions with solutions and answer keys, a video solution on each question&rsquo;s page,
              and every paper free to read or take as a timed mock test.
            </p>
          }
          statsTitle={`${name} ${level.level.name} PYQ at a glance`}
          stats={[
            { label: 'Subjects', value: String(subjects.length) },
            { label: 'Papers', value: formatCount(papers) },
            { label: 'Questions', value: formatCount(questions) },
          ]}
        />

        <SeoHeading>{level.level.name} subjects and their papers</SeoHeading>
        <ArticleTable
          caption={`${level.level.name} subjects and their papers`}
          head={['Subject', 'Exams', 'Papers', 'Years', 'Latest']}
          rows={subjects.map((subject) => ({
            key: subject.subject.id,
            cells: [
              <>
                <Link href={subject.path}>{shortName(subject.subject)} PYQ</Link>
                <span className="block text-meta text-ink-muted">
                  {subject.subject.name}
                  {subject.subject.code ? ` (${subject.subject.code})` : ''}
                </span>
              </>,
              subject.exams.map((exam, index) => (
                <span key={exam.examType.id}>
                  {listJoin(index, subject.exams.length)}
                  <Link href={exam.path}>
                    <span className="sr-only">{shortName(subject.subject)} </span>
                    {exam.examType.name}
                  </Link>
                </span>
              )),
              <span key="papers" className="tabular-nums">
                {subject.paperCount}
              </span>,
              <span key="years" className="whitespace-nowrap tabular-nums">
                {yearSpan(subject.years)}
              </span>,
              subject.latest ? (
                <Link key="latest" href={subject.latest.path} className="whitespace-nowrap">
                  <span className="sr-only">
                    {shortName(subject.subject)} {subject.latest.examType.name}{' '}
                  </span>
                  {sittingDate(subject.latest.sessionDate)}
                </Link>
              ) : (
                '—'
              ),
            ],
          }))}
        />

        <p className="mt-6">
          <Link href={program.path}>← Every {name} level</Link>
        </p>
      </SeoArticle>
    </div>
  )
}
