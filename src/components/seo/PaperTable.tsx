import Link from 'next/link'
import type { PaperEntry } from '@/lib/seo/catalogue'
import { shortName, sittingDate, termName } from '@/lib/seo/names'
import { ArrowRight } from '@/components/ui/icons'
import { buttonClass } from '@/components/ui/primitives'
import { BestScore } from './BestScore'

/**
 * Papers as a table: when it was sat, which set, how long it is, and the two
 * ways in — read it with answers, or sit it against the clock. A table
 * because that is what the list is, and because search engines and AI
 * assistants lift facts from a table far more reliably than from cards.
 */
export function PaperTable({
  papers,
  showSubject = false,
  showExam = false,
  caption,
  variant = 'default',
}: {
  papers: PaperEntry[]
  showSubject?: boolean
  showExam?: boolean
  caption?: string
  /** `article`: the bordered, header-tinted table of a page's reading half. */
  variant?: 'default' | 'article'
}) {
  if (papers.length === 0) return null
  if (variant === 'article') return <ArticleTable papers={papers} showSubject={showSubject} showExam={showExam} caption={caption} />
  return (
    <div className="overflow-x-auto rounded-card border border-rule bg-surface">
      {/* Fixed widths: tables stacked down a page line up column for column. */}
      <table className="w-full min-w-[40rem] table-fixed border-collapse text-left text-ui">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <colgroup>
          {/* The words columns share what the numbers and the button leave. */}
          <col />
          {showSubject ? <col /> : null}
          {showExam ? <col /> : null}
          <col />
          <col className="w-[6.5rem]" />
          <col className="w-[5rem]" />
          <col className="w-[6rem]" />
          <col className="w-[9rem]" />
        </colgroup>
        <thead>
          <tr className="border-b border-rule text-meta text-ink-faint">
            <th scope="col" className="px-4 py-2.5 font-normal">Paper</th>
            {showSubject ? <th scope="col" className="px-3 py-2.5 font-normal">Subject</th> : null}
            {showExam ? <th scope="col" className="px-3 py-2.5 font-normal">Exam</th> : null}
            <th scope="col" className="px-3 py-2.5 font-normal">Term</th>
            <th scope="col" className="px-3 py-2.5 text-right font-normal">Questions</th>
            <th scope="col" className="px-3 py-2.5 text-right font-normal">Marks</th>
            <th scope="col" className="px-3 py-2.5 text-right font-normal">Time</th>
            <th scope="col" className="px-4 py-2.5 text-right font-normal">
              <span className="sr-only">Practise</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {papers.map((paper) => (
            <tr key={paper.setId} className="border-b border-rule last:border-b-0 hover:bg-surface-2/60">
              <td className="px-4 py-3">
                <Link href={paper.path} className="text-ink underline-offset-4 hover:underline">
                  {/* Seen: the date. Read by crawlers and screen readers: which paper. */}
                  <span className="sr-only">
                    {shortName(paper.subject)} {paper.examType.name}{' '}
                  </span>
                  {sittingDate(paper.sessionDate)}
                  {paper.setsInSitting > 1 ? <span className="text-ink-muted"> (Set {paper.setCode})</span> : null}
                </Link>
                <BestScore setId={paper.setId} className="mt-0.5 block" />
              </td>
              {/* Plain text: the date in this row already links to the paper. */}
              {showSubject ? <td className="px-3 py-3 text-ink-muted">{shortName(paper.subject)}</td> : null}
              {showExam ? <td className="px-3 py-3 text-ink-muted">{paper.examType.name}</td> : null}
              <td className="px-3 py-3 whitespace-nowrap text-ink-muted">{termName(paper.term)}</td>
              <td className="px-3 py-3 text-right text-ink-muted tabular-nums">{paper.questionCount}</td>
              <td className="px-3 py-3 text-right text-ink-muted tabular-nums">{paper.totalMarks ?? '—'}</td>
              <td className="px-3 py-3 text-right whitespace-nowrap text-ink-muted tabular-nums">
                {paper.durationMinutes ? `${paper.durationMinutes} min` : '—'}
              </td>
              <td className="px-4 py-3 text-right">
                <Link href={`/paper/${paper.setId}`} className={buttonClass('outline', 'sm')}>
                  Mock test
                  {/* Every row has one: the hidden words say which paper this one starts. */}
                  <span className="sr-only">
                    {' '}
                    — {shortName(paper.subject)} {paper.examType.name} {sittingDate(paper.sessionDate)}
                    {paper.setsInSitting > 1 ? ` set ${paper.setCode}` : ''}
                  </span>
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The same facts as a bordered grid: tinted header row, a border on every cell, everything centred. */
function ArticleTable({
  papers,
  showSubject,
  showExam,
  caption,
}: {
  papers: PaperEntry[]
  showSubject: boolean
  showExam: boolean
  caption?: string
}) {
  const cell = 'border-[1.5px] border-ink px-3 py-2.5'
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] border-collapse border-[1.5px] border-ink text-center text-body">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="bg-[#cfe3f5]">
            <th scope="col" className={`${cell} font-semibold`}>Paper</th>
            {showSubject ? <th scope="col" className={`${cell} font-semibold`}>Subject</th> : null}
            {showExam ? <th scope="col" className={`${cell} font-semibold`}>Exam</th> : null}
            <th scope="col" className={`${cell} font-semibold`}>Term</th>
            <th scope="col" className={`${cell} font-semibold`}>Questions</th>
            <th scope="col" className={`${cell} font-semibold`}>Marks</th>
            <th scope="col" className={`${cell} font-semibold`}>Time</th>
            <th scope="col" className={`${cell} font-semibold`}>Practise</th>
          </tr>
        </thead>
        <tbody>
          {papers.map((paper) => (
            <tr key={paper.setId}>
              <td className={cell}>
                <Link href={paper.path} className="text-accent hover:underline">
                  {/* Seen: the date. Read by crawlers and screen readers: which paper. */}
                  <span className="sr-only">
                    {shortName(paper.subject)} {paper.examType.name}{' '}
                  </span>
                  {sittingDate(paper.sessionDate)}
                  {paper.setsInSitting > 1 ? ` (Set ${paper.setCode})` : ''}
                </Link>
                <BestScore setId={paper.setId} className="mt-0.5 block" />
              </td>
              {showSubject ? <td className={cell}>{shortName(paper.subject)}</td> : null}
              {showExam ? <td className={cell}>{paper.examType.name}</td> : null}
              <td className={`${cell} whitespace-nowrap`}>{termName(paper.term)}</td>
              <td className={`${cell} tabular-nums`}>{paper.questionCount}</td>
              <td className={`${cell} tabular-nums`}>{paper.totalMarks ?? '—'}</td>
              <td className={`${cell} whitespace-nowrap tabular-nums`}>
                {paper.durationMinutes ? `${paper.durationMinutes} min` : '—'}
              </td>
              <td className={cell}>
                <Link href={`/paper/${paper.setId}`} className="whitespace-nowrap text-accent hover:underline">
                  Mock test
                  {/* Every row has one: the hidden words say which paper this one starts. */}
                  <span className="sr-only">
                    {' '}
                    — {shortName(paper.subject)} {paper.examType.name} {sittingDate(paper.sessionDate)}
                    {paper.setsInSitting > 1 ? ` set ${paper.setCode}` : ''}
                  </span>{' '}
                  <span aria-hidden="true">→</span>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
