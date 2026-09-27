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
import { JsonLd } from '@/components/seo/JsonLd'
import { HubHeader } from '@/components/seo/HubHeader'
import { SHELL } from '@/components/site/Page'
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
    title: titles.program(program.program, subjects.length),
    description: `${formatCount(papers)} IITM BS ${program.program.short_name ?? program.program.name} PYQs with solutions: Qualifier, Quiz 1, Quiz 2 and End Term papers for every course, with answer keys and video solutions.`,
    path: program.path,
  })
}

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
  const art = artFor('programs', program.program.slug)

  return (
    <div className={`${SHELL} py-6 sm:py-8`}>
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
      <HubHeader
        crumbs={[{ label: 'Home', href: '/' }, { label: name }]}
        icon={art ? <Art src={art} size={56} alt={name} /> : undefined}
        eyebrow={program.program.name}
        title={titles.programHeading(program.program)}
        lead={
          <p>
            Previous year question papers for the IIT Madras {program.program.name}:{' '}
            <strong className="font-medium text-ink">{formatCount(papers)} papers</strong> across{' '}
            {plural(subjects.length, 'subject')}, {yearSpan(allYears)} — {formatCount(questions)} questions, each with its solution
            from the answer key and a video solution on its own page. {program.program.description ?? ''}
          </p>
        }
        stats={[
          { label: 'Subjects', value: String(subjects.length) },
          { label: 'Papers', value: formatCount(papers) },
          { label: 'Questions', value: formatCount(questions) },
        ]}
      />

      {levels.map((level) => (
        <section key={level.level.id} className="mt-10" aria-labelledby={`l-${level.level.slug}`}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4">
            <h2 id={`l-${level.level.slug}`} className="text-[1.375rem] leading-tight font-medium text-ink">
              {level.level.name} PYQs
            </h2>
            <Link href={level.path} className="text-meta text-ink-muted hover:text-ink hover:underline">
              {level.level.name} subjects →
            </Link>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {level.subjects
              .filter((subject) => subject.paperCount > 0)
              .map((subject) => (
                <li key={subject.subject.id}>
                  <Link
                    href={subject.path}
                    className="flex items-center justify-between gap-3 rounded-card border border-rule bg-surface px-4 py-3 transition-colors hover:border-rule-strong"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-ui text-ink">{shortName(subject.subject)} PYQ</span>
                      <span className="block truncate text-meta text-ink-faint">
                        {subject.subject.name}
                        {subject.subject.code ? ` · ${subject.subject.code}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-meta text-ink-muted tabular-nums">{subject.paperCount}</span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
