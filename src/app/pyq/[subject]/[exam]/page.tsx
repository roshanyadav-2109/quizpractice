import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { titles } from '@/lib/seo/titles'
import { getSeoCatalogue, type PaperEntry } from '@/lib/seo/catalogue'
import { pageMetadata } from '@/lib/seo/metadata'
import { collectionPage, courseEntity } from '@/lib/seo/jsonld'
import { listOf, plural, shortName, sittingDate, termName, yearSpan } from '@/lib/seo/names'
import { examFact } from '@/lib/seo/exam-facts'
import { paths } from '@/lib/seo/paths'
import { absolute } from '@/lib/seo/site'
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

type Params = Promise<{ subject: string; exam: string }>

export async function generateStaticParams() {
  const { subjects } = await getSeoCatalogue()
  return subjects.flatMap((node) => node.exams.map((exam) => ({ subject: node.subject.slug, exam: exam.examType.slug })))
}

async function load(subjectSlug: string, examSlug: string) {
  const catalogue = await getSeoCatalogue()
  const node = catalogue.subjectBySlug.get(subjectSlug)
  const exam = node?.exams.find((entry) => entry.examType.slug === examSlug)
  if (!node || !exam) return null
  return { catalogue, node, exam }
}

function yearsOf(papers: PaperEntry[]): number[] {
  return [...new Set(papers.flatMap((paper) => (paper.term ? [paper.term.year] : [])))].sort((a, b) => b - a)
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { subject: subjectSlug, exam: examSlug } = await params
  const data = await load(subjectSlug, examSlug)
  if (!data) return { title: 'Not found', robots: { index: false } }
  const { node, exam } = data
  const short = shortName(node.subject)
  const count = exam.papers.length
  const span = yearSpan(yearsOf(exam.papers))
  return pageMetadata({
    title: titles.subjectExam(node.subject, exam.examType, count),
    description: `All ${count} IITM BS ${short} ${exam.examType.name} previous year question papers (${node.subject.name}) from ${span}: ${formatCount(
      exam.papers.reduce((sum, paper) => sum + paper.questionCount, 0),
    )} questions with answer keys. Read each paper or take it as a free timed mock test.`,
    path: exam.path,
  })
}

export default async function SubjectExamHub({ params }: { params: Params }) {
  const { subject: subjectSlug, exam: examSlug } = await params
  const data = await load(subjectSlug, examSlug)
  if (!data) notFound()
  const { catalogue, node, exam } = data
  const { subject, level, program } = node
  const short = shortName(subject)
  const examName = exam.examType.name
  const programLabel = program.short_name ?? program.name
  const programNode = catalogue.programs.find((entry) => entry.program.id === program.id)
  const levelNode = programNode?.levels.find((entry) => entry.level.id === level.id)
  const fact = examFact(exam.examType.slug)

  const papers = exam.papers
  const years = yearsOf(papers)
  const terms = [...new Map(papers.flatMap((paper) => (paper.term ? [[paper.term.key, paper.term]] : []))).values()].sort(
    (a, b) => a.order - b.order,
  )
  const questions = papers.reduce((sum, paper) => sum + paper.questionCount, 0)
  const updated = papers.map((paper) => paper.updatedAt).filter(Boolean).sort().at(-1) ?? null
  const latest = papers[0] ?? null

  // Terms sat in several sets get their own page, which the table links to.
  const setsByTerm = new Map<string, number>()
  for (const paper of papers) if (paper.term) setsByTerm.set(paper.term.key, (setsByTerm.get(paper.term.key) ?? 0) + 1)

  const otherExams = node.exams.filter((entry) => entry.examType.id !== exam.examType.id)
  const sameExamElsewhere = (levelNode?.subjects ?? [])
    .filter((other) => other.subject.id !== subject.id)
    .flatMap((other) => {
      const match = other.exams.find((entry) => entry.examType.id === exam.examType.id)
      return match ? [{ node: other, exam: match }] : []
    })

  const crumbs = [
    { label: 'Home', href: '/' },
    { label: programLabel, href: programNode?.path },
    { label: level.name, href: levelNode?.path },
    { label: `${short} PYQ`, href: node.path },
    { label: examName },
  ]

  const faq: FaqItem[] = [
    {
      q: `How many ${short} ${examName} previous year papers are there?`,
      a: (
        <>
          {plural(papers.length, `${short} ${examName} paper`)}, from the {terms[0] ? termName(terms[0]) : 'first term'} to
          the {terms.at(-1) ? termName(terms.at(-1)!) : 'latest term'}, with {formatCount(questions)} questions in all.
          Each is listed above by year.
        </>
      ),
    },
    ...(fact
      ? [
          {
            q: `What does the ${short} ${examName} cover?`,
            a: (
              <>
                {fact.scope} The exact syllabus for your term is on the course page at{' '}
                <a href="https://study.iitm.ac.in/" className="text-accent hover:underline" rel="noopener">
                  study.iitm.ac.in
                </a>
                .
              </>
            ),
          },
        ]
      : []),
    ...(latest
      ? [
          {
            q: `Which is the latest ${short} ${examName} paper?`,
            a: (
              <>
                The{' '}
                <Link href={latest.path} className="text-accent hover:underline">
                  {sittingDate(latest.sessionDate)} paper
                </Link>{' '}
                from the {termName(latest.term)}, with {plural(latest.questionCount, 'question')}.
              </>
            ),
          },
        ]
      : []),
    {
      q: `Can I take a ${short} ${examName} mock test?`,
      a: (
        <>
          Yes. Every paper here opens as a timed mock test on a screen laid out like the real IITM exam — the same
          question palette, Save &amp; Next and Mark for Review — and is marked the moment you submit. It is free; sign
          in only if you want to keep your score.
        </>
      ),
    },
  ]

  const art = artFor('subjects', subject.slug)

  return (
    <div className={`${SHELL} py-6 sm:py-8`}>
      <JsonLd
        data={collectionPage({
          path: exam.path,
          name: `${short} ${examName} previous year papers`,
          description: `IITM BS ${subject.name} ${examName} previous year question papers with answers.`,
          crumbs: [
            { name: 'Home', path: '/' },
            ...(programNode ? [{ name: programLabel, path: programNode.path }] : []),
            ...(levelNode ? [{ name: level.name, path: levelNode.path }] : []),
            { name: `${short} PYQ`, path: node.path },
            { name: `${short} ${examName}`, path: exam.path },
          ],
          items: papers.map((paper) => ({
            name: `${short} ${examName} ${sittingDate(paper.sessionDate)}${paper.setsInSitting > 1 ? ` Set ${paper.setCode}` : ''}`,
            path: paper.path,
          })),
          about: courseEntity({ name: subject.name, code: subject.code, program: program.name, level: level.name, url: absolute(node.path) }),
          modified: updated,
        })}
      />

      <HubHeader
        crumbs={crumbs}
        icon={art ? <Art src={art} size={56} /> : undefined}
        eyebrow={[subject.name, subject.code].filter(Boolean).join(' · ')}
        title={titles.subjectExamHeading(subject, exam.examType)}
        lead={
          <p>
            <strong className="font-medium text-ink">{plural(papers.length, `${short} ${examName} paper`)}</strong> from the
            IIT Madras BS {programLabel} programme, {yearSpan(years)} — {formatCount(questions)} questions, each with its
            answer key. {fact ? `${fact.scope} ` : ''}Read any paper with answers, or take it as a timed mock test.
          </p>
        }
        stats={[
          { label: 'Papers', value: formatCount(papers.length) },
          { label: 'Questions', value: formatCount(questions) },
          { label: 'Years', value: yearSpan(years) },
          ...(latest ? [{ label: 'Latest', value: sittingDate(latest.sessionDate) }] : []),
        ]}
        updated={updated}
      />

      {years.length > 1 ? (
        <nav aria-label="Years" className="mt-6 flex flex-wrap gap-2">
          {years.map((year) => (
            <a key={year} href={`#y${year}`} className={buttonClass('outline', 'sm')}>
              {year}
            </a>
          ))}
        </nav>
      ) : null}

      {years.map((year) => {
        const inYear = papers.filter((paper) => paper.term?.year === year)
        const multiSetTerms = [...new Map(inYear.flatMap((paper) => (paper.term ? [[paper.term.key, paper.term]] : []))).values()].filter(
          (term) => (setsByTerm.get(term.key) ?? 0) > 1,
        )
        return (
          <section key={year} id={`y${year}`} className="mt-10 scroll-mt-20" aria-labelledby={`h${year}`}>
            <h2 id={`h${year}`} className="mb-3 text-[1.375rem] leading-tight font-medium text-ink">
              {short} {examName} {year} papers
            </h2>
            <PaperTable papers={inYear} caption={`${short} ${examName} papers from ${year}`} />
            {multiSetTerms.length > 0 ? (
              <p className="mt-3 text-meta text-ink-muted">
                By term:{' '}
                {multiSetTerms.map((term, index) => (
                  <span key={term.key}>
                    {index > 0 ? ' · ' : ''}
                    <Link href={paths.paper(subject.slug, exam.examType.slug, `${term.season}-${term.year}`)} className="text-accent hover:underline">
                      {short} {examName} {term.short} ({setsByTerm.get(term.key)} sets)
                    </Link>
                  </span>
                ))}
              </p>
            ) : null}
          </section>
        )
      })}

      {otherExams.length > 0 || sameExamElsewhere.length > 0 ? (
        <section className="mt-12 grid gap-8 lg:grid-cols-2" aria-label="Related papers">
          {otherExams.length > 0 ? (
            <div>
              <h2 className="text-[1.25rem] font-medium text-ink">Other {short} exams</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {otherExams.map((entry) => (
                  <li key={entry.examType.id}>
                    <Link href={entry.path} className="text-ui text-accent hover:underline">
                      {short} {entry.examType.name} PYQ
                    </Link>{' '}
                    <span className="text-meta text-ink-faint">· {plural(entry.papers.length, 'paper')}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {sameExamElsewhere.length > 0 ? (
            <div>
              <h2 className="text-[1.25rem] font-medium text-ink">
                {examName} papers for other {level.name} subjects
              </h2>
              <ul className="mt-3 flex flex-col gap-2">
                {sameExamElsewhere.map(({ node: other, exam: entry }) => (
                  <li key={other.subject.id}>
                    <Link href={entry.path} className="text-ui text-accent hover:underline">
                      {shortName(other.subject)} {examName} PYQ
                    </Link>{' '}
                    <span className="text-meta text-ink-faint">· {plural(entry.papers.length, 'paper')}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <Faq className="mt-12" items={faq} />

      <p className="mt-10 text-meta text-ink-faint">
        {listOf([subject.name, subject.code ?? ''].filter(Boolean))} — {level.name}, IIT Madras {program.name}. Quiz Space
        by Unknown IITians is independent and not affiliated with IIT Madras.{' '}
        <Link href={paths.exam(exam.examType.slug)} className="hover:text-ink hover:underline">
          Every {examName} paper, all subjects
        </Link>
        .
      </p>
    </div>
  )
}
