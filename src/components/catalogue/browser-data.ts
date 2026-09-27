import type { PaperEntry, SeoCatalogue } from '@/lib/seo/catalogue'
import { formatSession } from '@/lib/format'
import { SEASON_ORDER, seasonName } from '@/lib/terms'
import { artFor } from '@/lib/art'
import type { SubjectGroup } from '@/components/site/SubjectFilter'
import type { BrowserCard } from './ExamPaperBrowser'

/** Cards on the first page, as on the all-papers page. */
export const PAGE_SIZE = 24

/**
 * What the papers view needs for a set of papers — an exam's, a year's, an
 * exam's year — worked out on the server from the catalogue: the branches,
 * levels, subjects (with their counts) and terms it has, and the newest cards.
 */
export function browserData(catalogue: SeoCatalogue, papers: PaperEntry[], active: Record<string, number>) {
  const countOf = new Map<string, number>()
  for (const paper of papers) countOf.set(paper.subject.id, (countOf.get(paper.subject.id) ?? 0) + 1)

  const programs = catalogue.programs
    .map((program) => ({
      program,
      levels: program.levels
        .map((level) => ({ level, subjects: level.subjects.filter((node) => countOf.has(node.subject.id)) }))
        .filter((level) => level.subjects.length > 0),
    }))
    .filter((program) => program.levels.length > 0)

  const subjects: SubjectGroup[] = programs.flatMap(({ program, levels }) =>
    levels.map(({ level, subjects: nodes }) => ({
      key: `${program.program.slug}-${level.level.slug}`,
      title: `${program.program.short_name ?? program.program.name} · ${level.level.name}`,
      subjects: nodes.map((node) => ({
        slug: node.subject.slug,
        name: node.subject.name,
        code: node.subject.code,
        count: countOf.get(node.subject.id) ?? 0,
        active: active[node.subject.id],
        icon: artFor('subjects', node.subject.slug),
      })),
    })),
  )

  const cards: BrowserCard[] = papers.slice(0, PAGE_SIZE).map((paper) => ({
    setId: paper.setId,
    href: paper.path,
    title: paper.subject.name,
    tags: [paper.examType.name, ...(paper.setsInSitting > 1 ? [`Set ${paper.setCode}`] : [])],
    date: formatSession(paper.sessionDate),
    facts: [
      paper.totalMarks ? `${paper.totalMarks} marks` : '',
      paper.durationMinutes ? `${paper.durationMinutes} min` : '',
    ].filter(Boolean),
  }))

  return {
    branches: programs.map(({ program }) => ({
      value: program.program.slug,
      label: program.program.short_name ?? program.program.name,
    })),
    levels: [
      ...new Map(
        programs.flatMap(({ levels }) => levels.map(({ level }) => [level.level.slug, { value: level.level.slug, label: level.level.name }] as const)),
      ).values(),
    ],
    subjects,
    terms: SEASON_ORDER.filter((season) => papers.some((paper) => paper.term?.season === season)).map((season) => ({
      value: season,
      label: seasonName(season),
    })),
    cards,
    pages: Math.ceil(papers.length / PAGE_SIZE),
  }
}

/** The years a set of papers was sat in, newest first. */
export function yearsOf(papers: PaperEntry[]): number[] {
  return [...new Set(papers.flatMap((paper) => (paper.term ? [paper.term.year] : [])))].sort((a, b) => b - a)
}
