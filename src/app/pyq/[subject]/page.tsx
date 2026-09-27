import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { titles } from '@/lib/seo/titles'
import { getSeoCatalogue } from '@/lib/seo/catalogue'
import { pageMetadata } from '@/lib/seo/metadata'
import { collectionPage, courseEntity } from '@/lib/seo/jsonld'
import { listOf, plural, shortName, sittingDate, termName, termRange, yearSpan } from '@/lib/seo/names'
import { examFact } from '@/lib/seo/exam-facts'
import { paths } from '@/lib/seo/paths'
import { formatCount } from '@/lib/format'
import { absolute } from '@/lib/seo/site'
import { artFor } from '@/lib/art'
import { JsonLd } from '@/components/seo/JsonLd'
import { HubHeader } from '@/components/seo/HubHeader'
import { PaperTable } from '@/components/seo/PaperTable'
import { Faq, type FaqItem } from '@/components/seo/Faq'
import { SHELL } from '@/components/site/Page'
import { Art } from '@/components/ui/Art'
import { ArrowRight } from '@/components/ui/icons'
import { buttonClass } from '@/components/ui/primitives'

/** Rendered once, served to everyone from the CDN, refreshed within the hour. */
export const revalidate = 3600

type Params = Promise<{ subject: string }>

/** Every subject with papers is built ahead; one added later is built on its first visit. */
export async function generateStaticParams() {
  const { subjects } = await getSeoCatalogue()
  return subjects.filter((node) => node.paperCount > 0).map((node) => ({ subject: node.subject.slug }))
}

/** How many of a subject's newest papers each exam shows here; the exam's own page lists them all. */
const PER_EXAM = 8

async function load(slug: string) {
  const catalogue = await getSeoCatalogue()
  const node = catalogue.subjectBySlug.get(slug)
  if (!node || node.paperCount === 0) return null
  return { catalogue, node }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const data = await load((await params).subject)
  if (!data) return { title: 'Subject not found', robots: { index: false } }
  const { subject } = data.node
  const short = shortName(subject)
  const exams = data.node.exams.map((exam) => exam.examType.name)
  return pageMetadata({
    title: titles.subject(subject, data.node.exams.map((exam) => exam.examType)),
    description: `${plural(data.node.paperCount, 'free IITM BS ' + short + ' previous year paper')} (${listOf(exams)}), ${yearSpan(data.node.years)}, ${formatCount(data.node.questionCount)} questions with answer keys. Read each ${subject.name} paper or take it as a timed mock test.`,
    path: data.node.path,
  })
}

export default async function SubjectHub({ params }: { params: Params }) {
  const data = await load((await params).subject)
  if (!data) notFound()
  const { catalogue, node } = data
  const { subject, level, program } = node
  const short = shortName(subject)
  const programNode = catalogue.programs.find((entry) => entry.program.id === program.id)
  const levelNode = programNode?.levels.find((entry) => entry.level.id === level.id)
  const programLabel = program.short_name ?? program.name

  const allPapers = node.exams.flatMap((exam) => exam.papers)
  const terms = [...new Map(allPapers.flatMap((paper) => (paper.term ? [[paper.term.key, paper.term]] : []))).values()].sort(
    (a, b) => a.order - b.order,
  )
  const updated = allPapers.map((paper) => paper.updatedAt).filter(Boolean).sort().at(-1) ?? null

  const crumbs = [
    { label: 'Home', href: '/' },
    { label: programLabel, href: programNode?.path },
    { label: level.name, href: levelNode?.path },
    { label: `${short} PYQ` },
  ]

  // "5 Quiz 1 papers and 3 End Term papers": the noun on every count, or a
  // bare "5 Quiz 1" reads as a garbled number.
  const examCounts = node.exams.map((exam) => plural(exam.papers.length, `${exam.examType.name} paper`))
  // With one exam the list would only repeat the total: say which exam instead.
  const onlyExam = node.exams.length === 1 ? node.exams[0].examType.name : null
  const breakdown = onlyExam
    ? node.paperCount === 1
      ? `a ${onlyExam} paper`
      : `all of them ${onlyExam} papers`
    : listOf(examCounts)
  // Every other name the course goes by, so the page matches however it is typed.
  const aliases = [...new Set([subject.name, ...subject.aliases].map((name) => name.trim()))].filter(
    (name) => name && name.toLowerCase() !== short.toLowerCase(),
  )
  const lead = (
    <p>
      Quiz Space has <strong className="font-medium text-ink">{plural(node.paperCount, `${short} previous year paper`)}</strong>{' '}
      from the IIT Madras BS {programLabel} programme — {breakdown} — sat {termRange(terms)}. Every paper
      shows its questions with the answer key, and each can be taken as a timed mock test on the real exam
      screen. Free, no sign-up needed.
      {aliases.length > 0 ? (
        <span className="mt-2 block text-meta text-ink-faint">
          Also searched as {aliases.join(', ')}
          {subject.code ? ` · course code ${subject.code}` : ''}.
        </span>
      ) : null}
    </p>
  )

  const siblings = (levelNode?.subjects ?? []).filter((other) => other.subject.id !== subject.id && other.paperCount > 0)
  const latest = node.latest

  const faq: FaqItem[] = [
    {
      q: `Where can I find ${short} previous year question papers?`,
      a: (
        <>
          {node.paperCount === 1
            ? `The one ${subject.name} paper, ${breakdown}, is on this page.`
            : `All ${plural(node.paperCount, `${subject.name} paper`)} are on this page${
                onlyExam ? ` — ${breakdown}` : `, grouped by exam: ${breakdown}`
              }.`}{' '}
          Open any paper to read
          it with answers, or start it as a timed mock test.
        </>
      ),
    },
    {
      q: `Are the ${short} PYQs free, and do they have answers?`,
      a: (
        <>
          Yes. Every paper is free to read and practise, with the correct option marked for each question. Signing
          in with Google is only needed to save your attempts and see your analysis.
        </>
      ),
    },
    ...(latest
      ? [
          {
            q: `Which is the latest ${short} paper?`,
            a: (
              <>
                The newest is the{' '}
                <Link href={latest.path} className="text-accent hover:underline">
                  {latest.examType.name} of {sittingDate(latest.sessionDate)}
                </Link>{' '}
                ({termName(latest.term)}). New papers are added after each term&rsquo;s exams.
              </>
            ),
          },
        ]
      : []),
    ...node.exams.slice(0, 3).map((exam) => ({
      q: `How many ${short} ${exam.examType.name} papers are there?`,
      a: (
        <>
          {plural(exam.papers.length, `${exam.examType.name} paper`)} from{' '}
          {yearSpan(exam.papers.flatMap((paper) => (paper.term ? [paper.term.year] : [])))}, with{' '}
          {formatCount(exam.papers.reduce((sum, paper) => sum + paper.questionCount, 0))} questions in all.{' '}
          <Link href={exam.path} className="text-accent hover:underline">
            See every {short} {exam.examType.name} paper
          </Link>
          .
        </>
      ),
    })),
    {
      q: `Is Quiz Space an official IIT Madras website?`,
      a: (
        <>
          No. Quiz Space is an independent practice site by Unknown IITians. The papers are IIT Madras BS papers from
          past terms; for the syllabus and grading rules, see the official site at{' '}
          <a href="https://study.iitm.ac.in/" className="text-accent hover:underline" rel="noopener">
            study.iitm.ac.in
          </a>
          .
        </>
      ),
    },
  ]

  const art = artFor('subjects', subject.slug)

  return (
    <div className={`${SHELL} py-6 sm:py-8`}>
      <JsonLd
        data={collectionPage({
          path: node.path,
          name: `${short} previous year question papers`,
          description: `IITM BS ${subject.name} previous year papers with answers.`,
          crumbs: [
            { name: 'Home', path: '/' },
            ...(programNode ? [{ name: programLabel, path: programNode.path }] : []),
            ...(levelNode ? [{ name: level.name, path: levelNode.path }] : []),
            { name: `${short} PYQ`, path: node.path },
          ],
          items: allPapers.map((paper) => ({
            name: `${short} ${paper.examType.name} ${sittingDate(paper.sessionDate)}${paper.setsInSitting > 1 ? ` Set ${paper.setCode}` : ''}`,
            path: paper.path,
          })),
          about: courseEntity({
            name: subject.name,
            code: subject.code,
            program: program.name,
            level: level.name,
            url: absolute(node.path),
          }),
          modified: updated,
        })}
      />

      <HubHeader
        crumbs={crumbs}
        icon={art ? <Art src={art} size={56} alt={short} /> : undefined}
        eyebrow={[subject.code, programLabel, level.name].filter(Boolean).join(' · ')}
        title={titles.subjectHeading(subject)}
        lead={lead}
        stats={[
          { label: 'Papers', value: formatCount(node.paperCount) },
          { label: 'Questions', value: formatCount(node.questionCount) },
          { label: 'Terms', value: String(terms.length) },
          ...(latest ? [{ label: 'Latest', value: sittingDate(latest.sessionDate) }] : []),
        ]}
        updated={updated}
      />

      {/* Jump links: one per exam, so a long page is one click from any of them. */}
      <nav aria-label="Exams" className="mt-6 flex flex-wrap gap-2">
        {node.exams.map((exam) => (
          <a key={exam.examType.id} href={`#${exam.examType.slug}`} className={buttonClass('outline', 'sm')}>
            {exam.examType.name} · {exam.papers.length}
          </a>
        ))}
      </nav>

      {node.exams.map((exam) => {
        const fact = examFact(exam.examType.slug)
        return (
          <section key={exam.examType.id} id={exam.examType.slug} className="mt-10 scroll-mt-20" aria-labelledby={`h-${exam.examType.slug}`}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id={`h-${exam.examType.slug}`} className="text-[1.375rem] leading-tight font-medium text-ink">
                {short} {exam.examType.name} PYQ
              </h2>
              <Link href={exam.path} className="flex items-center gap-1 text-meta text-ink-muted hover:text-ink hover:underline">
                All {plural(exam.papers.length, 'paper')}
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
            <p className="mb-4 max-w-[72ch] text-ui text-ink-muted">
              {plural(exam.papers.length, `${short} ${exam.examType.name} paper`)} from{' '}
              {yearSpan(exam.papers.flatMap((paper) => (paper.term ? [paper.term.year] : [])))}.
              {fact ? ` ${fact.scope}` : ''}
            </p>
            <PaperTable papers={exam.papers.slice(0, PER_EXAM)} caption={`${short} ${exam.examType.name} papers`} />
            {exam.papers.length > PER_EXAM ? (
              <p className="mt-3">
                <Link href={exam.path} className="text-ui text-accent hover:underline">
                  See all {exam.papers.length} {short} {exam.examType.name} papers →
                </Link>
              </p>
            ) : null}
          </section>
        )
      })}

      <Faq className="mt-12" items={faq} />

      {siblings.length > 0 ? (
        <section className="mt-12" aria-labelledby="related">
          <h2 id="related" className="text-[1.375rem] leading-tight font-medium text-ink">
            More {level.name} subjects
          </h2>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {siblings.map((other) => (
              <li key={other.subject.id}>
                <Link
                  href={other.path}
                  className="flex items-center justify-between gap-3 rounded-card border border-rule bg-surface px-4 py-3 transition-colors hover:border-rule-strong"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-ui text-ink">{shortName(other.subject)} PYQ</span>
                    <span className="block truncate text-meta text-ink-faint">{other.subject.name}</span>
                  </span>
                  <span className="shrink-0 text-meta text-ink-muted tabular-nums">{other.paperCount}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="mt-10 text-meta text-ink-faint">
        {subject.name} is a {level.name} course of the IIT Madras {program.name} programme
        {subject.code ? ` (course code ${subject.code})` : ''}. Quiz Space by Unknown IITians is an independent study
        resource and is not affiliated with IIT Madras. Also see{' '}
        <Link href={paths.exam(node.exams[0]?.examType.slug ?? 'quiz-1')} className="hover:text-ink hover:underline">
          every {node.exams[0]?.examType.name ?? 'Quiz 1'} paper across subjects
        </Link>
        .
      </p>
    </div>
  )
}
