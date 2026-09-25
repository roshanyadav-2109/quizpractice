import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentProfile, isStaff } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'
import { SetupNotice } from '@/components/site/SetupNotice'

export const dynamic = 'force-dynamic'

const SECTIONS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/taxonomy', label: 'Taxonomy' },
  { href: '/admin/papers', label: 'Papers' },
  { href: '/admin/import', label: 'Import' },
  { href: '/admin/review', label: 'Review queue' },
  { href: '/admin/solutions', label: 'Solutions' },
  { href: '/admin/reports', label: 'Reports' },
]

/**
 * The role gate. src/proxy.ts already redirects non-staff before this renders;
 * this is the second check, and RLS is the third. All three are deliberate —
 * the admin API routes use the service-role key, which answers to none of them.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured) return <SetupNotice />

  const profile = await getCurrentProfile()
  if (!profile) redirect('/?login=1&next=/admin')
  if (!isStaff(profile)) redirect('/')

  return (
    <div className="w-full px-5 sm:px-8 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
        <div>
          <h1 className="text-[1.0625rem] font-medium text-ink">Admin</h1>
          <p className="text-xs text-ink-muted">
            Signed in as {profile.displayName} · {profile.role}
          </p>
        </div>
        <nav className="flex flex-wrap gap-1">
          {SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="rounded-[3px] px-2 py-1 text-[0.8125rem] text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              {section.label}
            </Link>
          ))}
        </nav>
      </div>

      {children}
    </div>
  )
}
