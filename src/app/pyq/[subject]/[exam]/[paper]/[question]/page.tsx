import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import type { Metadata } from 'next'
import { titles } from '@/lib/seo/titles'
import { getPublicSet, getQuestionIndex, getSolutionsForQuestion, type PublicSet } from '@/lib/queries'
import { findPaper, getSeoCatalogue, type PaperEntry, type SeoCatalogue } from '@/lib/seo/catalogue'
import { pageMetadata } from '@/lib/seo/metadata'
import { courseEntity, questionPage } from '@/lib/seo/jsonld'
import { shortName, sittingDate, termName } from '@/lib/seo/names'
import { paths, questionNumberFromSlug, questionSlug } from '@/lib/seo/paths'
import { slugTextOf } from '@/lib/seo/question-text'
import { absolute } from '@/lib/seo/site'
import { answerText, isSubstantial, plain, questionSlugOf, titleText, toQuizQuestion } from '@/lib/seo/question-view'
import type { QuestionWithOptions } from '@/types/db'
import { JsonLd } from '@/components/seo/JsonLd'
import { AnswerFold } from '@/components/seo/PaperQuestion'
import { QuestionWithAnswer } from '@/components/question/QuestionWithAnswer'
import { SolutionPanel } from '@/components/question/SolutionPanel'
import { Breadcrumb, SHELL } from '@/components/site/Page'
import { ArrowLeft, ArrowRight, Clock } from '@/components/ui/icons'
import { buttonClass } from '@/components/ui/primitives'

/**
 * One question on a page of its own: /pyq/maths-1/quiz-1/16-feb-2025/q12-….
 *
 * The page a student lands on after pasting a question into Google, so it
 * leads with the question, then the answer, then where it comes from and
 * what else was asked. A question IIT Madras repeated in several papers
 * points search engines at its first sitting; a question that is only a
 * figure and a number is left out of the index — it helps nobody as a
 * search result.
 */
export const revalidate = 86400

type Params = Promise<{ subject: string; exam: string; paper: string; question: string }>

export async function generateStaticParams() {
  return []
}

interface Loaded {
  catalogue: SeoCatalogue
  paper: PaperEntry
  set: PublicSet
  question: QuestionWithOptions
  slug: string
  canonicalPath: string
  isCopy: boolean
}

async function load(params: Awaited<Params>): Promise<Loaded | 'redirect' | null> {
  const paper = await findPaper(params.subject, params.exam, params.paper)
  if (!paper) return null
  const number = questionNumberFromSlug(params.question)
  if (number === null) return null
  const [catalogue, set, index] = await Promise.all([getSeoCatalogue(), getPublicSet(paper.setId), getQuestionIndex([paper.setId])])
  const question = set?.questions.find((entry) => entry.number === number)
  if (!set || !question) return null

  const slug = questionSlugOf(question)
  if (slug !== params.question) return 'redirect'

  // The earliest sitting of the same question, as the sitemap names it.
  let canonicalPath = paths.question(paper.subject.slug, paper.examType.slug, paper.slug, slug)
  let isCopy = false
  const canonicalId = index.find((row) => row.questionId === question.id)?.canonicalId
  if (canonicalId && canonicalId !== question.id) {
    const original = (set.copies[question.id] ?? []).find((copy) => copy.questionId === canonicalId)
    const where = original ? catalogue.paperBySetId.get(original.setId) : undefined
    if (original && where) {
      canonicalPath = paths.question(where.subject.slug, where.examType.slug, where.slug, questionSlug(original.number, slugTextOf(question.body)))
      isCopy = true
    }
  }
  return { catalogue, paper, set, question, slug, canonicalPath, isCopy }
}

function headline(question: QuestionWithOptions, max = 110): string {
  return titleText(question, max)
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const loaded = await load(await params)
  if (!loaded || loaded === 'redirect') return { title: 'Question not found', robots: { index: false } }
  const { paper, question, canonicalPath, isCopy } = loaded
  const short = shortName(paper.subject)
  const substantial = isSubstantial(question)
  const answer = answerText(question)
  const metadata = pageMetadata({
    title: titles.question(substantial ? headline(question, 120) : '', paper, question.number),
    description: `${short} ${paper.examType.name} (${termName(paper.term)}) Q${question.number}${
      substantial ? `: ${headline(question, 100)}` : ''
    }${answer ? ` Answer: ${plain(answer, 60)}.` : ''} IIT Madras BS PYQ with the answer key and the full paper.`,
    path: canonicalPath,
    index: substantial,
  })
  // A copy keeps its own page for readers of that paper; search engines are pointed at the first sitting.
  if (isCopy) metadata.alternates = { canonical: absolute(canonicalPath) }
  return metadata
}

export default async function QuestionPage({ params }: { params: Params }) {
  const awaited = await params
  const loaded = await load(awaited)
  if (!loaded) notFound()
  if (loaded === 'redirect') {
    const paper = await findPaper(awaited.subject, awaited.exam, awaited.paper)
    const set = paper ? await getPublicSet(paper.setId) : null
    const question = set?.questions.find((entry) => entry.number === questionNumberFromSlug(awaited.question))
    if (!paper || !question) notFound()
    permanentRedirect(paths.question(paper.subject.slug, paper.examType.slug, paper.slug, questionSlugOf(question)))
  }

  const { catalogue, paper, set, question } = loaded
  const short = shortName(paper.subject)
  const examName = paper.examType.name
  const node = catalogue.subjectBySlug.get(paper.subject.slug)!
  const examNode = node.exams.find((entry) => entry.examType.id === paper.examType.id)!
  const programLabel = paper.program.short_name ?? paper.program.name
  const programNode = catalogue.programs.find((entry) => entry.program.id === paper.program.id)
  const solutions = await getSolutionsForQuestion(question.id).catch(() => [])

  const questions = set.questions
  const position = questions.findIndex((entry) => entry.id === question.id)
  const previous = position > 0 ? questions[position - 1] : null
  const next = position < questions.length - 1 ? questions[position + 1] : null
  const hrefOf = (entry: QuestionWithOptions) =>
    paths.question(paper.subject.slug, paper.examType.slug, paper.slug, questionSlugOf(entry))
  const selfPath = hrefOf(question)

  const copies = (set.copies[question.id] ?? []).flatMap((copy) => {
    const where = catalogue.paperBySetId.get(copy.setId)
    return where ? [{ where, number: copy.number }] : []
  })

  const substantial = isSubstantial(question)
  const title = substantial
    ? `Question ${question.number}: ${headline(question)}`
    : `${short} ${examName} ${sittingDate(paper.sessionDate)} — Question ${question.number}`
  const paperLabel = `${short} ${examName} ${sittingDate(paper.sessionDate)}${paper.setsInSitting > 1 ? ` Set ${paper.setCode}` : ''}`

  return (
    <div className={`${SHELL} py-6 sm:py-8`}>
      <JsonLd
        data={questionPage({
          path: selfPath,
          crumbs: [
            { name: 'Home', path: '/' },
            { name: `${short} PYQ`, path: node.path },
            { name: `${short} ${examName}`, path: examNode.path },
            { name: paperLabel, path: paper.path },
            { name: `Question ${question.number}`, path: selfPath },
          ],
          question: toQuizQuestion(question, absolute(selfPath)),
          course: courseEntity({
            name: paper.subject.name,
            code: paper.subject.code,
            program: paper.program.name,
            level: paper.level.name,
            url: absolute(node.path),
          }),
          paperPath: paper.path,
          paperName: `IITM BS ${paperLabel} question paper`,
          educationalLevel: paper.level.name,
          modified: paper.updatedAt,
        })}
      />

      <div className="mx-auto max-w-[56rem]">
        <Breadcrumb
          crumbs={[
            { label: 'Home', href: '/' },
            { label: programLabel, href: programNode?.path },
            { label: `${short} PYQ`, href: node.path },
            { label: examName, href: examNode.path },
            { label: sittingDate(paper.sessionDate), href: paper.path },
            { label: `Q${question.number}` },
          ]}
        />
        <p className="mt-3 text-meta text-ink-faint">
          {paper.subject.name} · {examName} · {sittingDate(paper.sessionDate)} · {termName(paper.term)}
          {paper.setsInSitting > 1 ? ` · Set ${paper.setCode}` : ''}
        </p>
        <h1 className="mt-1 text-[1.375rem] leading-snug font-medium text-balance text-ink sm:text-[1.625rem]">{title}</h1>

        <div className="mt-5 rounded-card border border-rule bg-surface px-5 py-5 sm:px-6">
          <QuestionWithAnswer question={question} showAnswer={false} />
          <AnswerFold question={question} open />
        </div>

        {solutions.length > 0 ? (
          <section className="mt-6" aria-labelledby="explanation">
            <h2 id="explanation" className="mb-3 text-[1.25rem] font-medium text-ink">
              Explanation
            </h2>
            <SolutionPanel solutions={solutions} showAuthor={false} />
          </section>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          <Link href={paper.path} className={buttonClass('primary', 'md')}>
            See the whole paper
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link href={`/paper/${paper.setId}`} rel="nofollow" className={buttonClass('outline', 'md')}>
            <Clock size={16} aria-hidden="true" />
            Take it as a mock test
          </Link>
        </div>

        <p className="mt-6 max-w-[72ch] text-ui leading-relaxed text-ink-muted">
          Question {question.number} of {questions.length} in the IIT Madras BS {paper.subject.name} ({short}) {examName}{' '}
          paper sat on {sittingDate(paper.sessionDate)}, in the {termName(paper.term)}
          {paper.officialTitle ? ` (${paper.officialTitle})` : ''}. It carries {Number(question.marks)} mark
          {Number(question.marks) === 1 ? '' : 's'}
          {Number(question.negative_marks) > 0 ? `, with ${Number(question.negative_marks)} deducted for a wrong answer` : ''}.
        </p>

        {copies.length > 0 ? (
          <section className="mt-8" aria-labelledby="copies">
            <h2 id="copies" className="text-[1.125rem] font-medium text-ink">
              This question was also asked in
            </h2>
            <ul className="mt-3 flex flex-col gap-1.5">
              {copies.map(({ where, number }) => (
                <li key={`${where.setId}-${number}`}>
                  <Link href={`${where.path}#q${number}`} className="text-ui text-accent hover:underline">
                    {shortName(where.subject)} {where.examType.name} — {sittingDate(where.sessionDate)}
                    {where.setsInSitting > 1 ? `, Set ${where.setCode}` : ''}
                  </Link>
                  <span className="text-meta text-ink-faint"> · question {number}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <nav aria-label="Questions in this paper" className="mt-8 grid gap-3 sm:grid-cols-2">
          {previous ? (
            <Link href={hrefOf(previous)} className="flex items-center gap-3 rounded-card border border-rule bg-surface px-4 py-3 hover:border-rule-strong">
              <ArrowLeft size={18} aria-hidden="true" className="shrink-0 text-ink-faint" />
              <span className="min-w-0">
                <span className="block text-meta text-ink-faint">Question {previous.number}</span>
                <span className="block truncate text-ui text-ink">{headline(previous, 70) || 'Figure question'}</span>
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={hrefOf(next)}
              className="flex items-center justify-end gap-3 rounded-card border border-rule bg-surface px-4 py-3 text-right hover:border-rule-strong"
            >
              <span className="min-w-0">
                <span className="block text-meta text-ink-faint">Question {next.number}</span>
                <span className="block truncate text-ui text-ink">{headline(next, 70) || 'Figure question'}</span>
              </span>
              <ArrowRight size={18} aria-hidden="true" className="shrink-0 text-ink-faint" />
            </Link>
          ) : null}
        </nav>

        <section className="mt-10" aria-labelledby="more">
          <h2 id="more" className="text-[1.125rem] font-medium text-ink">
            More questions from this paper
          </h2>
          <ol className="mt-3 flex flex-col divide-y divide-rule rounded-card border border-rule bg-surface">
            {questions
              .filter((entry) => entry.id !== question.id)
              .map((entry) => (
                <li key={entry.id}>
                  <Link href={hrefOf(entry)} className="flex gap-3 px-4 py-2.5 hover:bg-surface-2/60">
                    <span className="w-8 shrink-0 text-meta text-ink-faint tabular-nums">Q{entry.number}</span>
                    <span className="min-w-0 truncate text-ui text-ink">{headline(entry, 120) || 'Figure question'}</span>
                  </Link>
                </li>
              ))}
          </ol>
        </section>
      </div>
    </div>
  )
}
