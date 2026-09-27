import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/seo/metadata'
import { getFinderPrograms, openingLevel } from '@/lib/subject-finder'
import { isSupabaseConfigured } from '@/lib/env'
import { SetupNotice } from '@/components/site/SetupNotice'
import { SubjectFinder } from '@/components/site/SubjectFinder'
import { SHELL } from '@/components/site/Page'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = pageMetadata({
  title: 'All IITM BS Subjects: PYQs with Solutions & Answer Keys',
  description:
    'Every IIT Madras BS subject with previous year question papers, solutions and video solutions — Data Science and Electronic Systems, Foundation to degree.',
  path: '/subjects',
})

type SearchParams = Promise<{ program?: string; level?: string }>

/**
 * The catalogue: every subject that has papers, reached by programme and then
 * level, with search across all of them.
 */
export default async function SubjectsPage({ searchParams }: { searchParams: SearchParams }) {
  if (!isSupabaseConfigured) return <SetupNotice />

  const [{ program: requestedProgram, level: requestedLevel }, programs] = await Promise.all([searchParams, getFinderPrograms()])

  const program = programs.find((p) => p.slug === requestedProgram) ?? programs[0]
  // Qualifier comes first in the list, but the page opens on the first real
  // level — Foundation — unless a level was asked for.
  const level = openingLevel(program, requestedLevel)

  return (
    <div className={`${SHELL} py-6`}>
      <SubjectFinder
        programs={programs}
        initialProgram={program?.slug ?? ''}
        initialLevel={level}
      />
    </div>
  )
}
