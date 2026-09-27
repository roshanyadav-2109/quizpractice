import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import type { Metadata } from 'next'
import { titles } from '@/lib/seo/titles'
import { getPublicSet } from '@/lib/queries'
import { getSeoCatalogue, type PaperEntry, type SeoCatalogue } from '@/lib/seo/catalogue'
import { pageMetadata } from '@/lib/seo/metadata'
import { collectionPage, courseEntity, paperEntity } from '@/lib/seo/jsonld'
import { plural, shortName, sittingDate, termName } from '@/lib/seo/names'
import { dateFromSlug, paths } from '@/lib/seo/paths'
import { absolute } from '@/lib/seo/site'
import { questionSlugOf, toQuizQuestion, TYPE_NAME, titleText } from '@/lib/seo/question-view'
import { formatCount } from '@/lib/format'
import { termFromKey } from '@/lib/terms'
import { artFor } from '@/lib/art'
import { JsonLd } from '@/components/seo/JsonLd'
import { HubHeader } from '@/components/seo/HubHeader'
import { PaperTable } from '@/components/seo/PaperTable'
import { PaperQuestion, type CopyLink } from '@/components/seo/PaperQuestion'
import { BestScore } from '@/components/seo/BestScore'
import { SHELL } from '@/components/site/Page'
import { Art } from '@/components/ui/Art'
import { ArrowLeft, ArrowRight, Clock } from '@/components/ui/icons'
import { buttonClass } from '@/components/ui/primitives'

/**
 * One address, two kinds of page:
 *
 *   /pyq/maths-1/quiz-1/16-feb-2025   a paper — every question, with answers
 *   /pyq/maths-1/quiz-1/may-2024      a term sat in several sets — its sets
 *
 * Papers are named by date and terms by season, so the two never collide.
 * Nothing is built ahead: 2,000+ papers are rendered on first visit and then
 * served from the CDN, so a deploy does not re-read the whole bank.
 */
export const revalidate = 86400

type Params = Promise<{ subject: string; exam: string; paper: string }>

export async function generateStaticParams() {
  return []
}

type Resolved =
  | { kind: 'paper'; catalogue: SeoCatalogue; paper: PaperEntry }
  | { kind: 'term'; catalogue: SeoCatalogue; papers: PaperEntry[]; termKey: string }
  | { kind: 'redirect'; to: string }
  | null

async function resolve(subject: string, exam: string, slug: string): Promise<Resolved> {
  const catalogue = await getSeoCatalogue()
  const paper = catalogue.paperByPath.get(`${subject}|${exam}|${slug}`)
  if (paper) return { kind: 'paper', catalogue, paper }

  const node = catalogue.subjectBySlug.get(subject)
  const examNode = node?.exams.find((entry) => entry.examType.slug === exam)
  if (!examNode) return null

  // A term: "may-2024".
  const termMatch = /^(jan|may|sep)-(\d{4})$/.exec(slug)
  if (termMatch) {
    const key = `${termMatch[2]}-${termMatch[1]}`
    const papers = examNode.papers.filter((entry) => entry.term?.key === key)
    if (papers.length === 1) return { kind: 'redirect', to: papers[0].path }
    if (papers.length > 1) return { kind: 'term', catalogue, papers, termKey: key }
    // A term this exam was not sat in: the exam's own page has every term it was.
    return { kind: 'redirect', to: examNode.path }
  }

  // A date that has since gained a second set, or lost its set code: the
  // first set sat that day, so an old link still lands on the paper.
  const date = dateFromSlug(slug)
  if (date) {
    const sameDay = examNode.papers.filter((entry) => entry.sessionDate === date)
    if (sameDay.length > 0) return { kind: 'redirect', to: sameDay[0].path }
  }
  return null
}

function paperName(paper: PaperEntry): string {
  return `${shortName(paper.subject)} ${paper.examType.name} ${sittingDate(paper.sessionDate)}${
    paper.setsInSitting > 1 ? ` Set ${paper.setCode}` : ''
  }`
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { subject, exam, paper: slug } = await params
  const resolved = await resolve(subject, exam, slug)
  if (!resolved || resolved.kind === 'redirect') return { title: 'Paper not found', robots: { index: false } }

  if (resolved.kind === 'term') {
    const first = resolved.papers[0]
    const term = termFromKey(resolved.termKey)
    const short = shortName(first.subject)
    return pageMetadata({
      title: `${short} ${first.examType.name} ${term?.short ?? ''} Question Papers — ${resolved.papers.length} Sets with Answers`,
      description: `IITM BS ${short} (${first.subject.name}) ${first.examType.name} papers from the ${termName(term)}: all ${resolved.papers.length} sets with answer keys, free to read or take as a timed mock test.`,
      path: paths.paper(subject, exam, slug),
    })
  }

  const { paper } = resolved
  const short = shortName(paper.subject)
  const setPart = paper.setsInSitting > 1 ? ` Set ${paper.setCode}` : ''
  const set = await getPublicSet(paper.setId)
  const first = set?.questions.find((question) => titleText(question).length > 40)
  return pageMetadata({
    title: titles.paper(paper),
    description: `${plural(paper.questionCount, 'question')}${paper.totalMarks ? ` · ${paper.totalMarks} marks` : ''}${
      paper.durationMinutes ? ` · ${paper.durationMinutes} min` : ''
    }. The IITM BS ${short} ${paper.examType.name} paper sat on ${sittingDate(paper.sessionDate)} (${termName(paper.term)})${setPart}, with answers — read it or take it as a timed mock test.${
      first ? ` Q${first.number}: ${titleText(first, 70)}` : ''
    }`,
    path: paper.path,
    type: 'article',
    modified: paper.updatedAt,
  })
}

export default async function PaperPage({ params }: { params: Params }) {
  const { subject, exam, paper: slug } = await params
  const resolved = await resolve(subject, exam, slug)
  if (!resolved) notFound()
  if (resolved.kind === 'redirect') permanentRedirect(resolved.to)
  if (resolved.kind === 'term') return <TermPage catalogue={resolved.catalogue} papers={resolved.papers} termKey={resolved.termKey} />

  const { catalogue, paper } = resolved
  const set = await getPublicSet(paper.setId)
  if (!set) notFound()

  const node = catalogue.subjectBySlug.get(paper.subject.slug)!
  const examNode = node.exams.find((entry) => entry.examType.id === paper.examType.id)!
  const short = shortName(paper.subject)
  const examName = paper.examType.name
  const programLabel = paper.program.short_name ?? paper.program.name
  const programNode = catalogue.programs.find((entry) => entry.program.id === paper.program.id)
  const levelNode = programNode?.levels.find((entry) => entry.level.id === paper.level.id)

  const questions = set.questions
  const marks = paper.totalMarks ?? questions.reduce((sum, question) => sum + Number(question.marks), 0)
  const penalised = questions.filter((question) => Number(question.negative_marks) > 0).length
  const typeCounts = Object.entries(
    questions.reduce<Record<string, number>>((counts, question) => {
      counts[TYPE_NAME[question.type]] = (counts[TYPE_NAME[question.type]] ?? 0) + 1
      return counts
    }, {}),
  )

  // Neighbours in the same exam, by date: newer first in the list, so "older" is the next one down.
  const index = examNode.papers.findIndex((entry) => entry.setId === paper.setId)
  const newer = index > 0 ? examNode.papers[index - 1] : null
  const older = index >= 0 && index < examNode.papers.length - 1 ? examNode.papers[index + 1] : null
  const sameSitting = examNode.papers.filter(
    (entry) => entry.sessionDate === paper.sessionDate && entry.setId !== paper.setId,
  )
  // The other subjects' papers from the same exam day: a student revising one often sits the others.
  const sameDayOtherSubjects = catalogue.papers
    .filter(
      (entry) =>
        entry.sessionDate === paper.sessionDate &&
        entry.examType.id === paper.examType.id &&
        entry.program.id === paper.program.id &&
        entry.subject.id !== paper.subject.id &&
        entry.questionCount > 0,
    )
    .filter((entry, i, all) => all.findIndex((other) => other.subject.id === entry.subject.id) === i)
    .slice(0, 8)

  const copyLinks = (questionId: string): CopyLink[] =>
    (set.copies[questionId] ?? []).flatMap((copy) => {
      const where = catalogue.paperBySetId.get(copy.setId)
      if (!where) return []
      return [{ label: `${where.examType.name} ${sittingDate(where.sessionDate)}`, href: `${where.path}#q${copy.number}` }]
    })

  const crumbs = [
    { label: 'Home', href: '/' },
    { label: programLabel, href: programNode?.path },
    { label: `${short} PYQ`, href: node.path },
    { label: examName, href: examNode.path },
    { label: `${sittingDate(paper.sessionDate)}${paper.setsInSitting > 1 ? ` · ${paper.setCode}` : ''}` },
  ]
  const course = courseEntity({
    name: paper.subject.name,
    code: paper.subject.code,
    program: paper.program.name,
    level: paper.level.name,
    url: absolute(node.path),
  })
  const art = artFor('subjects', paper.subject.slug)

  return (
    <div className={`${SHELL} py-6 sm:py-8`}>
      <JsonLd
        data={paperEntity({
          path: paper.path,
          name: `IITM BS ${paperName(paper)} question paper`,
          description: `${paper.subject.name} ${examName} paper, ${termName(paper.term)}, with answers.`,
          crumbs: [
            { name: 'Home', path: '/' },
            ...(programNode ? [{ name: programLabel, path: programNode.path }] : []),
            { name: `${short} PYQ`, path: node.path },
            { name: `${short} ${examName}`, path: examNode.path },
            { name: paperName(paper), path: paper.path },
          ],
          course,
          questions: questions.map((question) =>
            toQuizQuestion(question, absolute(paths.question(paper.subject.slug, paper.examType.slug, paper.slug, questionSlugOf(question)))),
          ),
          timeRequiredMinutes: paper.durationMinutes,
          dateCreated: paper.sessionDate,
          modified: paper.updatedAt,
          educationalLevel: paper.level.name,
        })}
      />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          <HubHeader
            crumbs={crumbs}
            icon={art ? <Art src={art} size={56} alt={short} /> : undefined}
            eyebrow={[termName(paper.term), paper.subject.name, paper.subject.code].filter(Boolean).join(' · ')}
            title={titles.paperHeading(paper)}
            lead={
              <p>
                The IIT Madras BS {paper.subject.name} ({short}) {examName} paper sat on{' '}
                {sittingDate(paper.sessionDate)}, in the {termName(paper.term)}
                {paper.setsInSitting > 1 ? `, set ${paper.setCode}` : ''}:{' '}
                <strong className="font-medium text-ink">
                  {plural(questions.length, 'question')} for {formatCount(Number(marks))} marks
                </strong>
                {paper.durationMinutes ? ` in ${paper.durationMinutes} minutes` : ''}. Every question is below with its
                answer. Take it as a timed mock test to be marked, or read it through first.
              </p>
            }
            stats={[
              { label: 'Questions', value: String(questions.length) },
              { label: 'Marks', value: formatCount(Number(marks)) },
              ...(paper.durationMinutes ? [{ label: 'Duration', value: `${paper.durationMinutes} min` }] : []),
              ...typeCounts.map(([type, count]) => ({ label: type, value: String(count) })),
            ]}
            actions={
              <>
                <Link href={`/paper/${paper.setId}`} className={buttonClass('primary', 'lg')}>
                  <Clock size={18} aria-hidden="true" />
                  Take as mock test
                </Link>
                <Link href={paths.practice(paper.setId, 'learning')} className={buttonClass('outline', 'lg')}>
                  Practise with answers
                </Link>
                <BestScore setId={paper.setId} className="self-center" />
              </>
            }
            updated={paper.updatedAt}
          />

          <p className="mt-4 text-meta text-ink-faint">
            {paper.officialTitle ? (
              <>
                Official paper: <span className="text-ink-muted">{paper.officialTitle}</span>
                {' · '}
              </>
            ) : null}
            {penalised === 0 ? 'No negative marking.' : `${plural(penalised, 'question')} with negative marking.`}
          </p>

          <div className="mt-8 flex flex-col gap-4">
            {questions.map((question) => (
              <PaperQuestion
                key={question.id}
                question={question}
                href={paths.question(paper.subject.slug, paper.examType.slug, paper.slug, questionSlugOf(question))}
                copies={copyLinks(question.id)}
              />
            ))}
          </div>

          <nav aria-label="More papers" className="mt-8 grid gap-3 sm:grid-cols-2">
            {older ? (
              <Link href={older.path} className="flex items-center gap-3 rounded-card border border-rule bg-surface px-4 py-3 hover:border-rule-strong">
                <ArrowLeft size={18} aria-hidden="true" className="shrink-0 text-ink-faint" />
                <span className="min-w-0">
                  <span className="block text-meta text-ink-faint">Older {examName} paper</span>
                  <span className="block truncate text-ui text-ink">{paperName(older)}</span>
                </span>
              </Link>
            ) : (
              <span />
            )}
            {newer ? (
              <Link
                href={newer.path}
                className="flex items-center justify-end gap-3 rounded-card border border-rule bg-surface px-4 py-3 text-right hover:border-rule-strong"
              >
                <span className="min-w-0">
                  <span className="block text-meta text-ink-faint">Newer {examName} paper</span>
                  <span className="block truncate text-ui text-ink">{paperName(newer)}</span>
                </span>
                <ArrowRight size={18} aria-hidden="true" className="shrink-0 text-ink-faint" />
              </Link>
            ) : null}
          </nav>
        </div>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-20">
          <div className="rounded-card border border-rule bg-surface p-4">
            <h2 className="text-ui font-medium text-ink">Questions</h2>
            <ol className="mt-3 grid grid-cols-6 gap-1.5">
              {questions.map((question) => (
                <li key={question.id}>
                  <a
                    href={`#q${question.number}`}
                    className="flex h-8 items-center justify-center rounded-md bg-surface-2 text-meta text-ink tabular-nums hover:bg-surface-3"
                  >
                    {question.number}
                  </a>
                </li>
              ))}
            </ol>
          </div>
          {sameSitting.length > 0 ? (
            <div>
              <h2 className="text-ui font-medium text-ink">Other sets that day</h2>
              <ul className="mt-2 flex flex-col gap-1.5">
                {sameSitting.map((entry) => (
                  <li key={entry.setId}>
                    <Link href={entry.path} className="text-ui text-accent hover:underline">
                      Set {entry.setCode}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {sameDayOtherSubjects.length > 0 ? (
            <div>
              <h2 className="text-ui font-medium text-ink">Same {examName}, other subjects</h2>
              <ul className="mt-2 flex flex-col gap-1.5">
                {sameDayOtherSubjects.map((entry) => (
                  <li key={entry.setId}>
                    <Link href={entry.path} className="text-ui text-accent hover:underline">
                      {shortName(entry.subject)} {examName} {sittingDate(entry.sessionDate)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div>
            <h2 className="text-ui font-medium text-ink">More {short}</h2>
            <ul className="mt-2 flex flex-col gap-1.5">
              <li>
                <Link href={examNode.path} className="text-ui text-accent hover:underline">
                  All {plural(examNode.papers.length, `${short} ${examName} paper`)}
                </Link>
              </li>
              {node.exams
                .filter((entry) => entry.examType.id !== paper.examType.id)
                .map((entry) => (
                  <li key={entry.examType.id}>
                    <Link href={entry.path} className="text-ui text-accent hover:underline">
                      {short} {entry.examType.name} PYQ
                    </Link>
                  </li>
                ))}
              {levelNode ? (
                <li>
                  <Link href={levelNode.path} className="text-ui text-accent hover:underline">
                    {paper.level.name} subjects
                  </Link>
                </li>
              ) : null}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}

/** A term sat in several sets: one table of its sets, and the way on to each. */
function TermPage({ catalogue, papers, termKey }: { catalogue: SeoCatalogue; papers: PaperEntry[]; termKey: string }) {
  const first = papers[0]
  const term = termFromKey(termKey)
  const short = shortName(first.subject)
  const examName = first.examType.name
  const node = catalogue.subjectBySlug.get(first.subject.slug)!
  const examNode = node.exams.find((entry) => entry.examType.id === first.examType.id)!
  const path = paths.paper(first.subject.slug, first.examType.slug, `${term?.season}-${term?.year}`)
  const questions = papers.reduce((sum, paper) => sum + paper.questionCount, 0)

  return (
    <div className={`${SHELL} py-6 sm:py-8`}>
      <JsonLd
        data={collectionPage({
          path,
          name: `${short} ${examName} ${term?.short ?? ''} papers`,
          description: `${short} ${examName} papers from the ${termName(term)}.`,
          crumbs: [
            { name: 'Home', path: '/' },
            { name: `${short} PYQ`, path: node.path },
            { name: `${short} ${examName}`, path: examNode.path },
            { name: term?.short ?? 'Term', path },
          ],
          items: papers.map((paper) => ({ name: paperName(paper), path: paper.path })),
        })}
      />
      <HubHeader
        crumbs={[
          { label: 'Home', href: '/' },
          { label: `${short} PYQ`, href: node.path },
          { label: examName, href: examNode.path },
          { label: term?.short ?? 'Term' },
        ]}
        eyebrow={first.subject.name}
        title={`${short} ${examName} ${term?.short ?? ''} question papers`}
        lead={
          <p>
            The {termName(term)} {short} {examName} was sat in{' '}
            <strong className="font-medium text-ink">{plural(papers.length, 'set')}</strong>, {formatCount(questions)}{' '}
            questions in all. Each set is a separate paper with its own questions and answer key — read one, or take it
            as a timed mock test.
          </p>
        }
        stats={[
          { label: 'Sets', value: String(papers.length) },
          { label: 'Questions', value: formatCount(questions) },
        ]}
      />
      <div className="mt-8">
        <PaperTable papers={papers} caption={`${short} ${examName} ${term?.short ?? ''} sets`} />
      </div>
      <p className="mt-6">
        <Link href={examNode.path} className="text-ui text-accent hover:underline">
          ← Every {short} {examName} paper
        </Link>
      </p>
    </div>
  )
}
