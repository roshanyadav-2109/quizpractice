import Image from 'next/image'
import Link from 'next/link'
import { BrandLogo } from '@/components/site/Brand'
import { Art } from '@/components/ui/Art'
import { ArrowLeft } from '@/components/ui/icons'
import { artFor } from '@/lib/art'
import { ROUTES, type AssignmentSummary } from '@/lib/teach/contracts'
import type { PaperCount } from '@/lib/teach/queries'
import { DeskNavLink } from './DeskNavLink'

/**
 * The teaching desk's own navigation, in place of the site's header: the
 * brand, the desk's pages, every assigned subject with the papers it has left,
 * and who is signed in. A column down the left on a wide screen; on a narrow
 * one, a bar across the top with the pages in a row.
 */
export function TeachSidebar({
  name,
  avatarUrl,
  role,
  subjects,
  needsChanges,
}: {
  name: string
  avatarUrl: string | null
  role: string
  subjects: (AssignmentSummary & { papers: PaperCount })[]
  needsChanges: number
}) {
  return (
    // The column runs the page's full height; the sidebar inside stays in view.
    <div className="border-b border-rule bg-surface lg:border-r lg:border-b-0">
    <aside className="lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 lg:pt-5">
        <Link href="/" aria-label="Quiz Space home" className="shrink-0">
          <BrandLogo />
        </Link>
        <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-micro font-medium text-accent">Teaching</span>
      </div>

      <nav aria-label="Teaching" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:pt-2">
        <DeskNavLink href={ROUTES.teachHome} icon="dashboard" exact>
          Dashboard
        </DeskNavLink>
        <DeskNavLink href={`${ROUTES.teachHome}#needs-changes`} icon="changes" count={needsChanges} tone="alert">
          Needs changes
        </DeskNavLink>
        <DeskNavLink href={ROUTES.teachHelp} icon="help">
          How it works
        </DeskNavLink>
      </nav>

      {subjects.length > 0 ? (
        <div className="hidden min-h-0 flex-1 overflow-y-auto px-3 pt-3 lg:block">
          <p className="px-3 pb-2 text-micro font-medium tracking-[0.08em] text-ink-faint uppercase">Your subjects</p>
          <ul className="flex flex-col gap-0.5">
            {subjects.map((subject) => {
              const { left, total } = subject.papers
              return (
                <li key={`${subject.programId}:${subject.subjectId}`}>
                  <DeskNavLink
                    href={ROUTES.teachSubject(subject.subjectSlug)}
                    picture={<Art src={artFor('subjects', subject.subjectSlug)} size={22} />}
                    wrap
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="leading-snug">{subject.subjectName}</span>
                      <span className="shrink-0 text-micro tabular-nums opacity-70">
                        {total === 0 ? '' : left === 0 ? 'Done' : `${left} left`}
                      </span>
                    </span>
                  </DeskNavLink>
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        <div className="hidden flex-1 lg:block" />
      )}

      <div className="hidden border-t border-rule px-4 py-4 lg:block">
        <div className="flex items-center gap-3">
          {avatarUrl ? (
            <Image src={avatarUrl} alt="" width={36} height={36} unoptimized className="h-9 w-9 shrink-0 rounded-full" />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-ui font-medium text-accent">
              {name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-ui text-ink">{name}</span>
            <span className="block text-micro text-ink-faint">{role === 'admin' ? 'Admin and teacher' : 'Teacher'}</span>
          </span>
        </div>
        <Link
          href="/"
          className="mt-3 flex items-center gap-1.5 text-meta text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back to Quiz Space
        </Link>
      </div>
    </aside>
    </div>
  )
}
