import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import type { Metadata } from 'next'
import { titles } from '@/lib/seo/titles'
import { getSeoCatalogue } from '@/lib/seo/catalogue'
import { findProgram, levelWithPapers } from '@/lib/seo/program'
import { pageMetadata } from '@/lib/seo/metadata'
import { collectionPage } from '@/lib/seo/jsonld'
import { listOf, plural, shortName, sittingDate, yearSpan } from '@/lib/seo/names'
import { formatCount } from '@/lib/format'
import { artFor } from '@/lib/art'
import { JsonLd } from '@/components/seo/JsonLd'
import { HubHeader } from '@/components/seo/HubHeader'
import { SHELL } from '@/components/site/Page'
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
    description: `Previous year papers for every ${level.level.name} subject of the IIT Madras ${program.program.name}: ${listOf(
      subjects.slice(0, 6).map((subject) => shortName(subject.subject)),
    )}${subjects.length > 6 ? ' and more' : ''} — ${formatCount(subjects.reduce((sum, subject) => sum + subject.paperCount, 0))} papers with answers.`,
    path: level.path,
  })
}

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
  const art = artFor('levels', level.level.slug)

  return (
    <div className={`${SHELL} py-6 sm:py-8`}>
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
      <HubHeader
        crumbs={[{ label: 'Home', href: '/' }, { label: name, href: program.path }, { label: level.level.name }]}
        icon={art ? <Art src={art} size={56} /> : undefined}
        eyebrow={program.program.name}
        title={titles.levelHeading(level.level, program.program)}
        lead={
          <p>
            {plural(subjects.length, `${level.level.name} subject`)} of the IIT Madras {program.program.name} with previous
            year papers — <strong className="font-medium text-ink">{formatCount(papers)} papers</strong> and{' '}
            {formatCount(questions)} questions with answer keys, each paper free to read or take as a timed mock test.
          </p>
        }
        stats={[
          { label: 'Subjects', value: String(subjects.length) },
          { label: 'Papers', value: formatCount(papers) },
          { label: 'Questions', value: formatCount(questions) },
        ]}
      />

      <div className="mt-8 overflow-x-auto rounded-card border border-rule bg-surface">
        <table className="w-full min-w-[40rem] border-collapse text-left text-ui">
          <caption className="sr-only">{level.level.name} subjects and their papers</caption>
          <thead>
            <tr className="border-b border-rule text-meta text-ink-faint">
              <th scope="col" className="px-4 py-2.5 font-normal">Subject</th>
              <th scope="col" className="px-3 py-2.5 font-normal">Exams</th>
              <th scope="col" className="px-3 py-2.5 text-right font-normal">Papers</th>
              <th scope="col" className="px-3 py-2.5 font-normal">Years</th>
              <th scope="col" className="px-4 py-2.5 font-normal">Latest</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((subject) => (
              <tr key={subject.subject.id} className="border-b border-rule last:border-b-0">
                <td className="px-4 py-3">
                  <Link href={subject.path} className="text-ink underline-offset-4 hover:underline">
                    {shortName(subject.subject)} PYQ
                  </Link>
                  <span className="block text-meta text-ink-faint">
                    {subject.subject.name}
                    {subject.subject.code ? ` · ${subject.subject.code}` : ''}
                  </span>
                </td>
                <td className="px-3 py-3 text-meta text-ink-muted">
                  {subject.exams.map((exam, index) => (
                    <span key={exam.examType.id}>
                      {index > 0 ? ' · ' : ''}
                      <Link href={exam.path} className="hover:text-ink hover:underline">
                        {exam.examType.name}
                      </Link>
                    </span>
                  ))}
                </td>
                <td className="px-3 py-3 text-right text-ink-muted tabular-nums">{subject.paperCount}</td>
                <td className="px-3 py-3 whitespace-nowrap text-ink-muted tabular-nums">{yearSpan(subject.years)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-ink-muted tabular-nums">
                  {subject.latest ? (
                    <Link href={subject.latest.path} className="hover:text-ink hover:underline">
                      {sittingDate(subject.latest.sessionDate)}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-6">
        <Link href={program.path} className="text-ui text-accent hover:underline">
          ← Every {name} level
        </Link>
      </p>
    </div>
  )
}
