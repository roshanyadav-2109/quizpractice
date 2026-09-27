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
import { getVideoIndex } from '@/lib/seo/video-solutions'
import { VideoSolutionList } from '@/components/seo/VideoSolutionList'
import { formatCount } from '@/lib/format'
import { absolute } from '@/lib/seo/site'
import { artFor } from '@/lib/art'
import { getActiveStudents } from '@/lib/queries'
import { JsonLd } from '@/components/seo/JsonLd'
import { PaperTable } from '@/components/seo/PaperTable'
import { Faq, type FaqItem } from '@/components/seo/Faq'
import { ArticleTable, SeoArticle, SeoHeading, SeoIntro } from '@/components/catalogue/SeoArticle'
import { ActiveCount } from '@/components/site/ActiveCount'
import { Breadcrumb, SHELL, TitleCard } from '@/components/site/Page'
import { Art } from '@/components/ui/Art'
import { CaretRight } from '@/components/ui/icons'

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
    description: `${plural(data.node.paperCount, `IITM BS ${short} PYQ`)} with solutions: ${listOf(exams)} papers, ${yearSpan(
      data.node.years,
    )}, with answer keys, video solutions and free mock tests for ${subject.name}.`,
    path: data.node.path,
  })
}

/**
 * A subject, laid out as the site always had it: the title with the
 * subject's art and how many are practising it, then a block for each exam to
 * open. Under that, the reading half — what the subject's papers are, each
 * exam's papers as a table, questions answered, related subjects — for
 * students who scroll and for search engines. The page never reads the
 * session, so it is one copy for everyone from the CDN.
 */
export default async function SubjectHub({ params }: { params: Params }) {
  const data = await load((await params).subject)
  if (!data) notFound()
  const active = await getActiveStudents()
  const { catalogue, node } = data
  const { subject, level, program } = node
  const short = shortName(subject)
  const videos = (await getVideoIndex()).bySubject.get(subject.id) ?? []
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
      from the IIT Madras BS {programLabel} programme — {breakdown} — sat {termRange(terms)}: the whole {short} question
      bank of {formatCount(node.questionCount)} questions, each with its solution from the answer key and a video solution
      on its own page. Every paper can also be taken as a free timed mock test on a screen laid out like the real exam,
      with a Google sign-in.
      {aliases.length > 0 ? (
        <span className="mt-2 block text-ui text-ink-muted">
          Also searched as {aliases.join(', ')}
          {subject.code ? `, or by its course code, ${subject.code}` : ''}.
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
      q: `Are there ${short} PYQs with solutions?`,
      a: (
        <>
          Yes. Every {short} question shows its solution — the correct option or value from IIT Madras&rsquo;s answer
          key — on its paper and on its own page. It is all free; the answers need no account, and a Google sign-in lets
          you take timed mock tests, check answers while you practise and keep your attempts.
        </>
      ),
    },
    {
      q: `Where are the ${short} PYQ video solutions?`,
      a: (
        <>
          Each video solution plays on its question&rsquo;s own page, right under the answer. Open a {short} paper, pick a
          question, and its video solution is there with the question and the answer key.
        </>
      ),
    },
    {
      q: `Is there a ${short} answer key?`,
      a: (
        <>
          Yes — the official answer key of every {short} paper is built into its page: each question marks its correct
          option, or gives the value for a numerical answer.
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
  ]

  const art = artFor('subjects', subject.slug)

  return (
    <div className={`${SHELL} py-6`}>
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

      <Breadcrumb crumbs={crumbs} />
      <TitleCard
        back={levelNode?.path ?? '/subjects'}
        icon={art ? <Art src={art} size={48} alt={short} /> : undefined}
        title={titles.subjectHeading(subject)}
        subtitle={active[subject.id] ? <ActiveCount count={active[subject.id]} /> : undefined}
      />

      {/* The exams, as blocks to open. */}
      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Exams">
        {node.exams.map((exam) => (
          <li key={exam.examType.id}>
            <Link
              href={exam.path}
              className="group flex h-full items-center gap-4 rounded-card border border-rule bg-surface p-5 transition-colors hover:border-rule-strong"
            >
              <Art src={artFor('exams', exam.examType.slug)} size={48} />
              <span className="min-w-0 flex-1">
                <span className="block text-card text-ink">{exam.examType.name}</span>
                <span className="block text-meta text-ink-faint tabular-nums">{plural(exam.papers.length, 'paper')}</span>
              </span>
              <CaretRight
                size={18}
                aria-hidden="true"
                className="shrink-0 text-ink-faint transition-transform duration-150 group-hover:translate-x-[3px] group-hover:text-ink"
              />
            </Link>
          </li>
        ))}
      </ul>

      <SeoArticle title={`More on ${short} PYQs`}>
        <SeoIntro
          lead={lead}
          statsTitle={`${short} PYQ at a glance`}
          stats={[
            ...(subject.code ? [{ label: 'Course code', value: subject.code }] : []),
            { label: 'Programme', value: programLabel },
            { label: 'Level', value: level.name },
            { label: 'Papers', value: formatCount(node.paperCount) },
            { label: 'Questions', value: formatCount(node.questionCount) },
            { label: 'Terms', value: String(terms.length) },
            ...(latest ? [{ label: 'Latest', value: sittingDate(latest.sessionDate) }] : []),
          ]}
          updated={updated}
        />

        {node.exams.map((exam) => {
          const fact = examFact(exam.examType.slug)
          return (
            <section key={exam.examType.id} id={exam.examType.slug} className="scroll-mt-20" aria-labelledby={`h-${exam.examType.slug}`}>
              <SeoHeading id={`h-${exam.examType.slug}`}>
                {short} {exam.examType.name} PYQ
              </SeoHeading>
              <p className="mb-4">
                {plural(exam.papers.length, `${short} ${exam.examType.name} paper`)} with solutions from{' '}
                {yearSpan(exam.papers.flatMap((paper) => (paper.term ? [paper.term.year] : [])))}.
                {fact ? ` ${fact.scope}` : ''}
              </p>
              <PaperTable
                variant="article"
                papers={exam.papers.slice(0, PER_EXAM)}
                caption={`${short} ${exam.examType.name} papers`}
              />
              <p className="mt-3">
                <Link href={exam.path}>
                  {exam.papers.length > PER_EXAM ? 'See all' : 'All'} {exam.papers.length} {short} {exam.examType.name}{' '}
                  papers →
                </Link>
              </p>
            </section>
          )
        })}

        <section aria-labelledby="solutions">
          <SeoHeading id="solutions">{short} PYQ solutions, answer keys and video solutions</SeoHeading>
          <p>
            Every {short} question comes with its solution from the official answer key, on the paper and on the
            question&rsquo;s own page. Video solutions play on each question&rsquo;s page, beside its answer
            {videos.length > 0 ? ` — ${plural(videos.length, `${short} question`)} with a video solution so far:` : '.'}
          </p>
          <VideoSolutionList videos={videos} />
        </section>

        <Faq className="mt-12" items={faq} variant="accordion" />

        {siblings.length > 0 ? (
          <section aria-labelledby="related">
            <SeoHeading id="related">More {level.name} subjects</SeoHeading>
            <ArticleTable
              caption={`More ${level.name} subjects`}
              head={['Subject', 'Course', 'Papers']}
              minWidth="30rem"
              rows={siblings.map((other) => ({
                key: other.subject.id,
                cells: [
                  <Link key="subject" href={other.path}>
                    {shortName(other.subject)} PYQ
                  </Link>,
                  other.subject.name,
                  <span key="papers" className="tabular-nums">
                    {other.paperCount}
                  </span>,
                ],
              }))}
            />
          </section>
        ) : null}

        <p className="mt-12 text-ui text-ink-muted">
          {subject.name} is a {level.name} course of the IIT Madras {program.name} programme
          {subject.code ? ` (course code ${subject.code})` : ''}. Quiz Space by Unknown IITians is an independent study
          resource and is not affiliated with IIT Madras. Also see{' '}
          <Link href={paths.exam(node.exams[0]?.examType.slug ?? 'quiz-1')}>
            every {node.exams[0]?.examType.name ?? 'Quiz 1'} paper across subjects
          </Link>
          .
        </p>
      </SeoArticle>
    </div>
  )
}
