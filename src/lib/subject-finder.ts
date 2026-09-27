import 'server-only'
import { paths } from '@/lib/seo/paths'
import { getBrowseTree, getCatalogueCounts, getQualifierSubjectIds } from '@/lib/queries'
import type { FinderProgram } from '@/components/site/SubjectFinder'

/**
 * Every programme as the subject finder shows it: the Qualifier stage first,
 * then each level with the subjects that have papers. Built from shared,
 * cookie-free caches, so the /subjects page and the programme and level pages
 * that open on it can all be rendered once for everyone.
 */
export async function getFinderPrograms(): Promise<FinderProgram[]> {
  const [tree, counts, qualifierIds] = await Promise.all([getBrowseTree(), getCatalogueCounts(), getQualifierSubjectIds()])

  return tree.map((program) => ({
    id: program.id,
    slug: program.slug,
    name: program.name,
    shortName: program.short_name,
    levels: [
      // The qualifier, the stage before Foundation, first: the branch's
      // subjects that have qualifier papers, opening on those papers.
      {
        id: `${program.id}-qualifier`,
        slug: 'qualifier',
        name: 'Qualifier',
        virtual: true,
        subjects: program.levels.flatMap((level) =>
          level.subjects
            .filter((subject) => qualifierIds.has(subject.id))
            .map((subject) => ({
              id: subject.id,
              slug: subject.slug,
              href: paths.subjectExam(subject.slug, 'qualifier'),
              name: subject.name,
              code: subject.code,
              aliases: subject.aliases,
              hasProgramming: subject.has_programming,
              paperCount: counts.bySubject.get(subject.id)?.papers ?? 0,
              questionCount: counts.bySubject.get(subject.id)?.questions ?? 0,
            })),
        ),
      },
      ...program.levels.map((level) => ({
        id: level.id,
        slug: level.slug,
        name: level.name,
        // A subject with no papers is nothing to practise, so it is not listed.
        // Its page still resolves, so links and search to it keep working.
        subjects: level.subjects.flatMap((subject) => {
          const count = counts.bySubject.get(subject.id)
          if (!count || count.papers === 0) return []
          return [
            {
              id: subject.id,
              slug: subject.slug,
              name: subject.name,
              code: subject.code,
              aliases: subject.aliases,
              hasProgramming: subject.has_programming,
              paperCount: count.papers,
              questionCount: count.questions,
            },
          ]
        }),
      })),
    ],
  }))
}

/** The level a programme opens on: the one asked for, else the first real level (Foundation), not the Qualifier stage. */
export function openingLevel(program: FinderProgram | undefined, requested?: string | null): string {
  const stocked = program?.levels.filter((level) => level.subjects.length > 0) ?? []
  return (stocked.find((level) => level.slug === requested) ?? stocked.find((level) => !level.virtual) ?? stocked[0])?.slug ?? ''
}
