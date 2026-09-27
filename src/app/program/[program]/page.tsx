import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import type { Metadata } from 'next'
import { titles } from '@/lib/seo/titles'
import { getSeoCatalogue } from '@/lib/seo/catalogue'
import { findProgram } from '@/lib/seo/program'
import { pageMetadata } from '@/lib/seo/metadata'
import { collectionPage } from '@/lib/seo/jsonld'
import { plural, shortName, yearSpan } from '@/lib/seo/names'
import { formatCount } from '@/lib/format'
import { artFor } from '@/lib/art'
import { getFinderPrograms, openingLevel } from '@/lib/subject-finder'
import { JsonLd } from '@/components/seo/JsonLd'
import { ArticleTable, SeoArticle, SeoHeading, SeoIntro } from '@/components/catalogue/SeoArticle'
import { SubjectFinder } from '@/components/site/SubjectFinder'
import { Breadcrumb, SHELL } from '@/components/site/Page'
import { Art } from '@/components/ui/Art'

export const revalidate = 3600

type Params = Promise<{ program: string }>

export async function generateStaticParams() {
  const { programs } = await getSeoCatalogue()
  return programs
    .filter((program) => program.levels.some((level) => level.subjects.some((subject) => subject.paperCount > 0)))
    .map((program) => ({ program: program.slug }))
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const found = await findProgram((await params).program)
  if (!found) return { title: 'Programme not found', robots: { index: false } }
  const { program } = found
  const subjects = program.levels.flatMap((level) => level.subjects.filter((subject) => subject.paperCount > 0))
  const papers = subjects.reduce((sum, subject) => sum + subject.paperCount, 0)
  return pageMetadata({
    title: titles.program(program.program),
    description: `${formatCount(papers)} IITM BS ${program.program.short_name ?? program.program.name} PYQs with solutions: Qualifier, Quiz 1, Quiz 2 and End Term papers for every course, with answer keys and free mock tests.`,
    path: program.path,
  })
}

/**
 * A programme, opening on the site's own subjects view — its levels down the
 * side, Foundation chosen, the subjects as cards — with the reading half
 * under it: the answer, the numbers, every level's subjects listed. One copy
 * for everyone from the CDN.
 */
export default async function ProgramHub({ params }: { params: Params }) {
  const slug = (await params).program
  const found = await findProgram(slug)
  if (!found) notFound()
  const { program } = found
  if (slug !== program.slug) permanentRedirect(program.path)

  const name = program.program.short_name ?? program.program.name
  const levels = program.levels.filter((level) => level.subjects.some((subject) => subject.paperCount > 0))
  const subjects = levels.flatMap((level) => level.subjects.filter((subject) => subject.paperCount > 0))
  const papers = subjects.reduce((sum, subject) => sum + subject.paperCount, 0)
  const questions = subjects.reduce((sum, subject) => sum + subject.questionCount, 0)
  const allYears = [...new Set(subjects.flatMap((subject) => subject.years))]
  const finderPrograms = await getFinderPrograms()
  const finderProgram = finderPrograms.find((entry) => entry.slug === program.program.slug)
  const art = artFor('programs', program.program.slug)

  return (
    <div className={`${SHELL} py-6`}>
      <JsonLd
        data={collectionPage({
          path: program.path,
          name: `IITM BS ${name} previous year papers`,
          description: program.program.description ?? `${program.program.name} previous year papers.`,
          crumbs: [
            { name: 'Home', path: '/' },
            { name: name, path: program.path },
          ],
          items: subjects.map((subject) => ({ name: `${shortName(subject.subject)} PYQ`, path: subject.path })),
        })}
      />

      <Breadcrumb crumbs={[{ label: 'Home', href: '/' }, { label: name }]} />
      <SubjectFinder
        programs={finderPrograms}
        initialProgram={program.program.slug}
        initialLevel={openingLevel(finderProgram)}
        icon={art ? <Art src={art} size={48} alt={name} /> : undefined}
        title={titles.programHeading(program.program)}
        syncUrl={false}
      />

      <SeoArticle title={`More on ${name} PYQs`}>
        <SeoIntro
          lead={
            <p>
              Previous year question papers for the IIT Madras {program.program.name}:{' '}
              <strong className="font-medium text-ink">{formatCount(papers)} papers</strong> across{' '}
              {plural(subjects.length, 'subject')}, {yearSpan(allYears)} — {formatCount(questions)} questions, each with its solution
              from the answer key, open with a free Google sign-in. {program.program.description ?? ''}
            </p>
          }
          statsTitle={`${name} PYQ at a glance`}
          stats={[
            { label: 'Subjects', value: String(subjects.length) },
            { label: 'Papers', value: formatCount(papers) },
            { label: 'Questions', value: formatCount(questions) },
          ]}
        />

        {levels.map((level) => (
          <section key={level.level.id} aria-labelledby={`l-${level.level.slug}`}>
            <SeoHeading id={`l-${level.level.slug}`}>{level.level.name} PYQs</SeoHeading>
            <ArticleTable
              caption={`${name} ${level.level.name} subjects`}
              head={['Subject', 'Course', 'Course code', 'Papers']}
              widths={['28%', '44%', '16%', '12%']}
              minWidth="36rem"
              rows={level.subjects
                .filter((subject) => subject.paperCount > 0)
                .map((subject) => ({
                  key: subject.subject.id,
                  cells: [
                    <Link key="subject" href={subject.path}>
                      {shortName(subject.subject)} PYQ
                    </Link>,
                    subject.subject.name,
                    subject.subject.code ?? '—',
                    <span key="papers" className="tabular-nums">
                      {subject.paperCount}
                    </span>,
                  ],
                }))}
            />
            <p className="mt-3">
              <Link href={level.path}>{level.level.name} subjects →</Link>
            </p>
          </section>
        ))}
      </SeoArticle>
    </div>
  )
}
