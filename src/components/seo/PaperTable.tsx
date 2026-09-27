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
}: {
  papers: PaperEntry[]
  showSubject?: boolean
  showExam?: boolean
  caption?: string
}) {
  if (papers.length === 0) return null
  return (
    <div className="overflow-x-auto rounded-card border border-rule bg-surface">
      <table className="w-full min-w-[40rem] border-collapse text-left text-ui">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
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
                  {paper.setsInSitting > 1 ? <span className="text-ink-muted"> · Set {paper.setCode}</span> : null}
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
