import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import type { Metadata } from 'next'
import { titles } from '@/lib/seo/titles'
import { getPublicSet } from '@/lib/queries'
import { getSeoCatalogue, type PaperEntry, type SeoCatalogue } from '@/lib/seo/catalogue'
import { pageMetadata } from '@/lib/seo/metadata'
import { collectionPage, courseEntity, paperEntity } from '@/lib/seo/jsonld'
import { listJoin, listOf, plural, shortName, sittingDate, termName } from '@/lib/seo/names'
import { dateFromSlug, paths } from '@/lib/seo/paths'
import { absolute } from '@/lib/seo/site'
import { toQuizQuestion, TYPE_NAME, titleText } from '@/lib/seo/question-view'
import { LEAD_IN, leadIn } from '@/lib/access'
import { formatCount } from '@/lib/format'
import { termFromKey } from '@/lib/terms'
import { artFor } from '@/lib/art'
import { JsonLd } from '@/components/seo/JsonLd'
import { HubHeader } from '@/components/seo/HubHeader'
import { PaperTable } from '@/components/seo/PaperTable'
import { PaperQuestion, type CopyLink } from '@/components/seo/PaperQuestion'
import { PaperLock } from '@/components/seo/PaperLock'
import { BestScore } from '@/components/seo/BestScore'
import { Breadcrumb, SHELL, TitleCard } from '@/components/site/Page'
import { SeoArticle, SeoHeading, SeoIntro } from '@/components/catalogue/SeoArticle'
import { SubjectPaperFinder } from '@/components/catalogue/SubjectPaperFinder'
import { toFinderPapers } from '@/components/catalogue/finder-papers'
import { Art } from '@/components/ui/Art'
import { ArrowLeft, ArrowRight, Clock } from '@/components/ui/icons'
import { buttonClass } from '@/components/ui/primitives'

/**
 * One address, two kinds of page:
 *
 *   /pyq/maths-1/quiz-1/16-feb-2025   a paper — its first questions, the rest after a sign-in
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
  | { kind: 'year'; catalogue: SeoCatalogue; papers: PaperEntry[]; year: number }
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

  // A year: "2025" — the year's papers when there are several, the paper when there is one.
  if (/^\d{4}$/.test(slug)) {
    const year = Number(slug)
    const papers = examNode.papers.filter((entry) => entry.term?.year === year)
    if (papers.length === 1) return { kind: 'redirect', to: papers[0].path }
    if (papers.length > 1) return { kind: 'year', catalogue, papers, year }
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
      title: `${short} ${first.examType.name} ${term?.short ?? ''} PYQ: ${resolved.papers.length} Sets with Solutions`,
      description: `IITM BS ${short} ${first.examType.name} papers from the ${termName(term)}: all ${resolved.papers.length} sets with solutions and answer keys, free as timed mock tests with a Google sign-in.`,
      path: paths.paper(subject, exam, slug),
    })
  }

  if (resolved.kind === 'year') {
    const first = resolved.papers[0]
    const short = shortName(first.subject)
    return pageMetadata({
      title: titles.subjectExamYear(first.subject, first.examType, resolved.year),
      description: `All ${resolved.papers.length} IITM BS ${short} ${first.examType.name} papers from ${resolved.year}, with solutions and answer keys — free with a Google sign-in, to read or take as timed mock tests.`,
      path: paths.subjectExamYear(subject, exam, resolved.year),
    })
  }

  const { paper } = resolved
  const short = shortName(paper.subject)
  const setPart = paper.setsInSitting > 1 ? ` Set ${paper.setCode}` : ''
  const set = await getPublicSet(paper.setId)
  // Only words the page shows: its free preview.
  const first = set?.questions.slice(0, LEAD_IN).find((question) => titleText(question).length > 40)
  return pageMetadata({
    title: titles.paper(paper),
    description: `${plural(paper.questionCount, 'question')}${paper.totalMarks ? ` · ${paper.totalMarks} marks` : ''}${
      paper.durationMinutes ? ` · ${paper.durationMinutes} min` : ''
    }. IITM BS ${short} ${paper.examType.name} PYQ, ${sittingDate(paper.sessionDate)} (${termName(paper.term)})${setPart}, with solutions and answer key after a free Google sign-in.${
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
  if (resolved.kind === 'year') return <YearPage catalogue={resolved.catalogue} papers={resolved.papers} year={resolved.year} />

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
  // What anyone sees of the paper: its first questions, without their answers.
  const preview = leadIn(questions)
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
    { label: `${sittingDate(paper.sessionDate)}${paper.setsInSitting > 1 ? `, Set ${paper.setCode}` : ''}` },
  ]
  const course = courseEntity({
    name: paper.subject.name,
    code: paper.subject.code,
    program: paper.program.name,
    level: paper.level.name,
    url: absolute(node.path),
  })
  const art = artFor('subjects', paper.subject.slug)
  const open = new Set(preview.map((question) => question.number))
  const facts = [
    { label: 'Questions', value: String(questions.length) },
    { label: 'Marks', value: formatCount(Number(marks)) },
    ...(paper.durationMinutes ? [{ label: 'Duration', value: `${paper.durationMinutes} min` }] : []),
  ]

  return (
    <div className={`${SHELL} py-6`}>
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
          questions: preview.map((question) => toQuizQuestion(question, absolute(`${paper.path}#q${question.number}`))),
          totalQuestions: questions.length,
          lockedSelector: questions.length > preview.length ? '.paper-locked' : undefined,
          timeRequiredMinutes: paper.durationMinutes,
          dateCreated: paper.sessionDate,
          modified: paper.updatedAt,
          educationalLevel: paper.level.name,
        })}
      />

      <Breadcrumb crumbs={crumbs} />
      <TitleCard back={examNode.path} icon={art ? <Art src={art} size={48} alt={short} /> : undefined} title={titles.paperHeading(paper)} />

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        {/* The paper in figures, the two ways in and the question palette: above the paper on a phone, beside it on a wide screen. */}
        <aside className="rounded-card border border-rule bg-surface lg:sticky lg:top-20 lg:order-last">
          <dl className={`grid divide-x divide-rule border-b border-rule text-center ${facts.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {facts.map((fact) => (
              <div key={fact.label} className="px-2 py-3">
                <dt className="text-micro text-ink-faint">{fact.label}</dt>
                <dd className="mt-0.5 text-[1.125rem] text-ink tabular-nums">{fact.value}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-col gap-2 p-4">
            <Link href={`/paper/${paper.setId}`} className={buttonClass('primary', 'lg', 'w-full justify-center')}>
              <Clock size={18} aria-hidden="true" />
              Take as mock test
            </Link>
            <Link href={paths.practice(paper.setId, 'learning')} className={buttonClass('outline', 'lg', 'w-full justify-center')}>
              Practise with answers
            </Link>
            <BestScore setId={paper.setId} className="mt-1 self-center" />
          </div>

          <div className="hidden border-t border-rule p-4 lg:block">
            <h2 className="text-ui font-medium text-ink">Questions</h2>
            <ol className="mt-3 grid grid-cols-7 gap-1.5">
              {questions.map((question) => (
                <li key={question.id}>
                  <a
                    href={open.has(question.number) ? `#q${question.number}` : '#paper-locked'}
                    className={`flex h-8 items-center justify-center rounded-md text-meta tabular-nums transition-colors ${
                      open.has(question.number)
                        ? 'border border-ink bg-surface text-ink hover:bg-ink hover:text-white'
                        : 'bg-surface-2 text-ink-faint hover:bg-surface-3 hover:text-ink'
                    }`}
                  >
                    {question.number}
                  </a>
                </li>
              ))}
            </ol>
            {questions.length > preview.length ? (
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-micro text-ink-muted">
                <li className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px] border border-ink" />
                  Open to read
                </li>
                <li className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px] bg-surface-3" />
                  After a free sign-in
                </li>
              </ul>
            ) : null}
          </div>
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          {preview.map((question) => (
            <PaperQuestion key={question.id} question={question} copies={copyLinks(question.id)} />
          ))}
          <PaperLock setId={paper.setId} shown={preview.length} total={questions.length} />

          <nav aria-label="More papers" className="mt-2 grid gap-3 sm:grid-cols-2">
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
      </div>

      <SeoArticle title={`More on the ${paperName(paper)} paper`}>
        <SeoIntro
          lead={
            <p>
              The IIT Madras BS {paper.subject.name} ({short}) {examName} paper sat on{' '}
              {sittingDate(paper.sessionDate)}, in the {termName(paper.term)}
              {paper.setsInSitting > 1 ? `, set ${paper.setCode}` : ''}:{' '}
              <strong>
                {plural(questions.length, 'question')} for {formatCount(Number(marks))} marks
              </strong>
              {paper.durationMinutes ? ` in ${paper.durationMinutes} minutes` : ''}. The first{' '}
              {plural(preview.length, 'question')} {preview.length === 1 ? 'is' : 'are'} below. Sign in with Google — it is
              free — to see the whole paper with its answers and explanations, in learning mode or as a timed mock test.
            </p>
          }
          statsTitle={`${paperName(paper)} at a glance`}
          stats={[
            { label: 'Term', value: termName(paper.term) },
            { label: 'Subject', value: paper.subject.name },
            ...(paper.subject.code ? [{ label: 'Course code', value: paper.subject.code }] : []),
            ...facts,
            ...typeCounts.map(([type, count]) => ({ label: type, value: String(count) })),
            ...(paper.officialTitle ? [{ label: 'Official paper', value: paper.officialTitle }] : []),
            {
              label: 'Negative marking',
              value: penalised === 0 ? 'No negative marking.' : `${plural(penalised, 'question')} with negative marking.`,
            },
          ]}
          updated={paper.updatedAt}
        />

        {sameSitting.length > 0 ? (
          <section aria-labelledby="same-sitting">
            <SeoHeading id="same-sitting">Other sets that day</SeoHeading>
            <ul className="list-disc space-y-1 pl-6">
              {sameSitting.map((entry) => (
                <li key={entry.setId}>
                  <Link href={entry.path}>Set {entry.setCode}</Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {sameDayOtherSubjects.length > 0 ? (
          <section aria-labelledby="same-day">
            <SeoHeading id="same-day">Same {examName}, other subjects</SeoHeading>
            <ul className="list-disc space-y-1 pl-6">
              {sameDayOtherSubjects.map((entry) => (
                <li key={entry.setId}>
                  <Link href={entry.path}>
                    {shortName(entry.subject)} {examName} {sittingDate(entry.sessionDate)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="more-subject">
          <SeoHeading id="more-subject">More {short}</SeoHeading>
          <ul className="list-disc space-y-1 pl-6">
            <li>
              <Link href={examNode.path}>All {plural(examNode.papers.length, `${short} ${examName} paper`)}</Link>
            </li>
            {node.exams
              .filter((entry) => entry.examType.id !== paper.examType.id)
              .map((entry) => (
                <li key={entry.examType.id}>
                  <Link href={entry.path}>
                    {short} {entry.examType.name} PYQ
                  </Link>
                </li>
              ))}
            {levelNode ? (
              <li>
                <Link href={levelNode.path}>{paper.level.name} subjects</Link>
              </li>
            ) : null}
          </ul>
        </section>
      </SeoArticle>
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

/**
 * One subject's exam in one year, sat in several papers, opening on the same
 * paper finder as the subject's exam page — that year's papers as cards — with
 * the reading half under it: the answer, the other years, every paper.
 */
function YearPage({ catalogue, papers, year }: { catalogue: SeoCatalogue; papers: PaperEntry[]; year: number }) {
  const first = papers[0]
  const short = shortName(first.subject)
  const examName = first.examType.name
  const node = catalogue.subjectBySlug.get(first.subject.slug)!
  const examNode = node.exams.find((entry) => entry.examType.id === first.examType.id)!
  const path = paths.subjectExamYear(first.subject.slug, first.examType.slug, year)
  const questions = papers.reduce((sum, paper) => sum + paper.questionCount, 0)
  const terms = [...new Map(papers.flatMap((paper) => (paper.term ? [[paper.term.key, paper.term]] : []))).values()].sort(
    (a, b) => a.order - b.order,
  )
  const years = [...new Set(examNode.papers.flatMap((paper) => (paper.term ? [paper.term.year] : [])))].sort((a, b) => b - a)
  const art = artFor('subjects', first.subject.slug)

  return (
    <div className={`${SHELL} py-6`}>
      <JsonLd
        data={collectionPage({
          path,
          name: titles.subjectExamYearHeading(first.subject, first.examType, year),
          description: `${short} ${examName} papers from ${year}, with solutions.`,
          crumbs: [
            { name: 'Home', path: '/' },
            { name: `${short} PYQ`, path: node.path },
            { name: `${short} ${examName}`, path: examNode.path },
            { name: String(year), path },
          ],
          items: papers.map((paper) => ({ name: paperName(paper), path: paper.path })),
        })}
      />

      <Breadcrumb
        crumbs={[
          { label: 'Home', href: '/' },
          { label: `${short} PYQ`, href: node.path },
          { label: examName, href: examNode.path },
          { label: String(year) },
        ]}
      />
      <TitleCard
        back={examNode.path}
        icon={art ? <Art src={art} size={48} alt={short} /> : undefined}
        title={titles.subjectExamYearHeading(first.subject, first.examType, year)}
      />
      <SubjectPaperFinder papers={toFinderPapers(papers)} />

      <SeoArticle title={`More on ${short} ${examName} PYQ ${year}`}>
        <SeoIntro
          lead={
            <p>
              <strong>{plural(papers.length, `${short} ${examName} paper`)}</strong> from {year}
              {terms.length > 0 ? ` — the ${listOf(terms.map((term) => term.label))}` : ''} — {formatCount(questions)} questions,
              each with its solution from the answer key. Each paper shows its first questions; sign in with Google to read
              it whole, or take it as a timed mock test.
            </p>
          }
          statsTitle={`${short} ${examName} PYQ ${year} at a glance`}
          stats={[
            { label: 'Subject', value: first.subject.name },
            { label: 'Papers', value: String(papers.length) },
            { label: 'Questions', value: formatCount(questions) },
          ]}
        />

        {years.length > 1 ? (
          <nav aria-label="Other years">
            <p className="mt-6">
              {short} {examName} PYQs by year:{' '}
              {years.map((other, index) => (
                <span key={other}>
                  {listJoin(index, years.length)}
                  {other === year ? (
                    <span aria-current="page" className="font-medium">
                      {other}
                    </span>
                  ) : (
                    <Link href={paths.subjectExamYear(first.subject.slug, first.examType.slug, other)}>
                      {short} {examName} {other}
                    </Link>
                  )}
                </span>
              ))}
              .
            </p>
          </nav>
        ) : null}

        <SeoHeading>
          {short} {examName} {year} papers
        </SeoHeading>
        <PaperTable variant="article" papers={papers} caption={`${short} ${examName} papers from ${year}`} />

        <p className="mt-6">
          <Link href={examNode.path}>← Every {short} {examName} paper</Link>
        </p>
      </SeoArticle>
    </div>
  )
}
