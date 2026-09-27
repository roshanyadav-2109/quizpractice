import Link from 'next/link'
import type { Metadata } from 'next'
import { teacherPageGate } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { ROUTES } from '@/lib/teach/contracts'
import { SetupNotice } from '@/components/site/SetupNotice'
import { SHELL } from '@/components/site/Page'
import { ChalkboardTeacher } from '@/components/ui/icons'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: { default: 'Teaching', template: '%s — Teaching — Quiz Space' },
  robots: { index: false, follow: false },
}

const SECTIONS = [
  { href: ROUTES.teachHome, label: 'Dashboard' },
  { href: ROUTES.teachHelp, label: 'Help' },
]

/**
 * The teacher's desk: the dashboard, each subject's queue and the help page,
 * under the site's own header. The studio (/teach/q/…) sits outside this
 * group on purpose — it owns the whole viewport, like the exam runner.
 *
 * The gate here is the second of three: src/proxy.ts turns away anyone who is
 * not a teacher before this renders, every page checks again for itself (a
 * layout does not re-render on every navigation), and the database decides
 * which subjects a teacher may see.
 */
export default async function DeskLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured) return <SetupNotice />

  const profile = await teacherPageGate(ROUTES.teachHome)

  return (
    <>
      <div className="border-b border-rule bg-surface">
        <div className={`${SHELL} flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3`}>
          <div className="flex min-w-0 items-center gap-2.5">
            <ChalkboardTeacher size={22} aria-hidden="true" className="shrink-0 text-ink" />
            <div className="min-w-0">
              <p className="text-ui font-medium text-ink">Teaching</p>
              <p className="truncate text-micro text-ink-faint">
                Signed in as {profile.displayName}
                {profile.role === 'admin' ? ' · admin' : ''}
              </p>
            </div>
          </div>
          <nav aria-label="Teaching" className="flex gap-1">
            {SECTIONS.map((section) => (
              <Link
                key={section.href}
                href={section.href}
                className="rounded-control px-3 py-1.5 text-meta text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                {section.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {children}
    </>
  )
}
