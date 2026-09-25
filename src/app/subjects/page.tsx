import type { Metadata } from 'next'
import { getBrowseTree, getCatalogueCounts, getQualifierSubjectIds } from '@/lib/queries'
import { isSupabaseConfigured } from '@/lib/env'
import { SetupNotice } from '@/components/site/SetupNotice'
import { SubjectFinder, type FinderProgram } from '@/components/site/SubjectFinder'
import { SHELL } from '@/components/site/Page'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Subjects',
  description: 'Every IIT Madras BS degree subject with previous year papers, by programme and level.',
}

type SearchParams = Promise<{ program?: string; level?: string }>

/**
 * The catalogue: every subject that has papers, reached by programme and then
 * level, with search across all of them.
 */
export default async function SubjectsPage({ searchParams }: { searchParams: SearchParams }) {
  if (!isSupabaseConfigured) return <SetupNotice />

  const [{ program: requestedProgram, level: requestedLevel }, tree, counts, qualifierIds] = await Promise.all([
    searchParams,
    getBrowseTree(),
    getCatalogueCounts(),
    getQualifierSubjectIds(),
  ])

  const programs: FinderProgram[] = tree.map((program) => ({
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
              href: `/subject/${subject.slug}?exam=qualifier`,
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

  const program = programs.find((p) => p.slug === requestedProgram) ?? programs[0]
  const stocked = program?.levels.filter((l) => l.subjects.length > 0) ?? []
  // Qualifier comes first in the list, but the page opens on the first real
  // level — Foundation — unless a level was asked for.
  const level =
    stocked.find((l) => l.slug === requestedLevel) ?? stocked.find((l) => !l.virtual) ?? stocked[0]

  return (
    <div className={`${SHELL} py-6`}>
      <SubjectFinder
        programs={programs}
        initialProgram={program?.slug ?? ''}
        initialLevel={level?.slug ?? ''}
      />
    </div>
  )
}
