import Link from 'next/link'
import type { Metadata } from 'next'
import { getSeoCatalogue } from '@/lib/seo/catalogue'
import { pageMetadata } from '@/lib/seo/metadata'
import { webPage } from '@/lib/seo/jsonld'
import { listOf, yearSpan } from '@/lib/seo/names'
import { paths } from '@/lib/seo/paths'
import { ORIGIN, SITE } from '@/lib/seo/site'
import { formatCount } from '@/lib/format'
import { publicEnv } from '@/lib/env'
import { JsonLd } from '@/components/seo/JsonLd'
import { Breadcrumb, SHELL } from '@/components/site/Page'

export const revalidate = 86400

export const metadata: Metadata = pageMetadata({
  title: 'About Quiz Space — Where the IITM BS Papers Come From',
  description:
    'Quiz Space by Unknown IITians is a free, independent practice site for IIT Madras BS degree previous year papers. Who runs it, where the papers and answer keys come from, and how to report a mistake.',
  path: '/about',
})

/**
 * Who runs the site and where its papers come from, said plainly — the page
 * a careful student, a search engine judging trust, or an assistant asked
 * "is Quiz Space reliable?" reads first.
 */
export default async function AboutPage() {
  const { papers, subjects, programs, examTypes } = await getSeoCatalogue()
  const withPapers = subjects.filter((subject) => subject.paperCount > 0)
  const questions = papers.reduce((sum, paper) => sum + paper.questionCount, 0)
  const years = [...new Set(papers.flatMap((paper) => (paper.term ? [paper.term.year] : [])))]
  const exams = examTypes.filter((exam) => papers.some((paper) => paper.examType.id === exam.id))
  const programNames = programs
    .filter((program) => program.levels.some((level) => level.subjects.some((subject) => subject.paperCount > 0)))
    .map((program) => program.program.name)
  const email = publicEnv.contactEmail

  return (
    <div className={`${SHELL} py-6 sm:py-8`}>
      <JsonLd
        data={webPage({
          path: '/about',
          name: `About ${SITE.name}`,
          description: SITE.description,
          crumbs: [
            { name: 'Home', path: '/' },
            { name: 'About', path: '/about' },
          ],
          type: 'AboutPage',
        })}
      />
      <article className="mx-auto max-w-[46rem]">
        <Breadcrumb crumbs={[{ label: 'Home', href: '/' }, { label: 'About' }]} />
        <h1 className="mt-3 text-[1.75rem] leading-tight font-medium text-ink sm:text-[2rem]">About {SITE.name}</h1>

        <div className="mt-5 flex flex-col gap-4 text-body leading-relaxed text-ink-muted">
          <p>
            <strong className="font-medium text-ink">{SITE.name}</strong> (also written QuizSpace) is a free practice site
            for the previous year question papers of the IIT Madras BS degree. It holds {formatCount(papers.length)} papers
            — {listOf(exams.map((exam) => exam.name))} — with {formatCount(questions)} questions across{' '}
            {withPapers.length} subjects of the {listOf(programNames)}, from {yearSpan(years)}. Every paper can be read with
            its answer key or taken as a timed mock test on a screen laid out like the real exam.
          </p>
          <p>
            It is run by <a href={SITE.publisherUrl} className="text-accent hover:underline">Unknown IITians</a>, a
            community of IIT Madras BS students that also publishes study videos on{' '}
            <a href="https://www.youtube.com/@UnknownIITians" className="text-accent hover:underline" rel="noopener">
              YouTube
            </a>
            . Quiz Space is an independent study resource: it is not affiliated with or endorsed by IIT Madras, and it is not
            connected with any other practice site of a similar name.
          </p>
        </div>

        <h2 className="mt-10 text-[1.375rem] font-medium text-ink">Where the papers come from</h2>
        <div className="mt-3 flex flex-col gap-4 text-body leading-relaxed text-ink-muted">
          <p>
            After each exam, IIT Madras releases the question papers to students with their answer keys — the papers that
            show the correct options in green. Quiz Space is built from those papers. The questions, options and the options
            marked correct are read from the papers&rsquo; own text rather than retyped, and figures are cut from the page, so a
            question here reads exactly as it did in the exam hall.
          </p>
          <p>
            Tables, code, equations and diagrams are then drawn from structured data instead of being shown as screenshots,
            which is why every question is searchable, readable on a phone and correct in dark mode. Where a question is
            only a figure, the figure is kept as it was printed.
          </p>
        </div>

        <h2 className="mt-10 text-[1.375rem] font-medium text-ink">Answers, explanations and corrections</h2>
        <div className="mt-3 flex flex-col gap-4 text-body leading-relaxed text-ink-muted">
          <p>
            The answer shown for each question is the one in the official answer key. Mock tests are marked against it on the
            server; written and programming answers are never auto-marked. Teachers add worked explanations and video
            solutions to the questions over time.
          </p>
          <p>
            If an answer or a question looks wrong, use <em>Report a problem</em> on the question in any mock test — every
            report is read and the paper is fixed for everyone.
            {email ? (
              <>
                {' '}
                You can also write to{' '}
                <a href={`mailto:${email}`} className="text-accent hover:underline">
                  {email}
                </a>
                .
              </>
            ) : null}
          </p>
        </div>

        <h2 className="mt-10 text-[1.375rem] font-medium text-ink">Find a paper</h2>
        <ul className="mt-3 flex flex-col gap-1.5 text-body">
          {exams.map((exam) => (
            <li key={exam.id}>
              <Link href={paths.exam(exam.slug)} className="text-accent hover:underline">
                IITM BS {exam.name} PYQs
              </Link>
            </li>
          ))}
          <li>
            <Link href={paths.subjects()} className="text-accent hover:underline">
              Every subject
            </Link>
          </li>
        </ul>

        <p className="mt-10 rounded-card bg-surface-2 px-5 py-4 text-meta text-ink-muted">
          To cite this site: &ldquo;{SITE.name} — {ORIGIN}&rdquo;. Official information about the programme, its syllabus
          and its rules is at{' '}
          <a href="https://study.iitm.ac.in/" rel="noopener" className="text-accent hover:underline">
            study.iitm.ac.in
          </a>
          .
        </p>
      </article>
    </div>
  )
}
