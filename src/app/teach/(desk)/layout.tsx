import type { Metadata } from 'next'
import { teacherPageGate } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { ROUTES } from '@/lib/teach/contracts'
import { countPapers, getMyNeedingChanges, getMySummary, getSetProgress } from '@/lib/teach/queries'
import { SetupNotice } from '@/components/site/SetupNotice'
import { TeachSidebar } from '@/components/teach/TeachSidebar'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: { default: 'Teaching', template: '%s — Teaching — Quiz Space' },
  robots: { index: false, follow: false },
}

/**
 * The teacher's desk: the dashboard, each subject's queue and the help page,
 * in a workspace of their own — a sidebar with the desk's pages and the
 * teacher's subjects in place of the site's header and footer. The studio
 * (/teach/q/…) sits outside this group on purpose: it owns the whole
 * viewport, like the exam runner.
 *
 * The gate here is the second of three: src/proxy.ts turns away anyone who is
 * not a teacher before this renders, every page checks again for itself (a
 * layout does not re-render on every navigation), and the database decides
 * which subjects a teacher may see.
 */
export default async function DeskLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured) return <SetupNotice />

  const profile = await teacherPageGate(ROUTES.teachHome)
  const [summary, changes] = await Promise.all([getMySummary(), getMyNeedingChanges()])
  const subjects = await Promise.all(
    summary
      .filter((subject) => subject.valid)
      .map(async (subject) => ({ ...subject, papers: countPapers(await getSetProgress(subject.subjectId)) })),
  )

  return (
    <div className="min-h-screen bg-surface-2/50 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <TeachSidebar
        name={profile.displayName}
        avatarUrl={profile.avatarUrl}
        role={profile.role}
        subjects={subjects}
        needsChanges={changes.length}
      />
      <div className="min-w-0 px-3 py-4 sm:px-4 lg:px-5 lg:py-5">
        <div className="mx-auto max-w-[92rem]">{children}</div>
      </div>
    </div>
  )
}
