import type { PaperEntry } from '@/lib/seo/catalogue'
import { formatSession } from '@/lib/format'
import type { FinderPaper } from './SubjectPaperFinder'

/** The catalogue's papers, cut down to what a paper card shows, newest first as the catalogue orders them. */
export function toFinderPapers(papers: PaperEntry[]): FinderPaper[] {
  return papers.map((paper) => ({
    setId: paper.setId,
    href: paper.path,
    title: formatSession(paper.sessionDate),
    setLabel: paper.setsInSitting > 1 ? `Set ${paper.setCode}` : '',
    facts: [
      paper.totalMarks ? `${paper.totalMarks} marks` : '',
      paper.durationMinutes ? `${paper.durationMinutes} min` : '',
    ].filter(Boolean),
    termKey: paper.term?.key ?? null,
    termLabel: paper.term?.label ?? null,
    termOrder: paper.term?.order ?? 0,
    year: paper.term?.year ?? null,
    season: paper.term?.season ?? null,
  }))
}
