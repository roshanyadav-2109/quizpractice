'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { ChalkboardTeacher, Question, SquaresFour, Warning } from '@/components/ui/icons'

const ICONS = {
  dashboard: SquaresFour,
  changes: Warning,
  help: Question,
  site: ChalkboardTeacher,
} as const

/**
 * One entry in the teaching desk's sidebar: an icon or picture, a label and an
 * optional count, marked as the current page when it is. \`exact\` matches the
 * address alone; otherwise anything under it counts (a subject's queue and its
 * filters).
 */
export function DeskNavLink({
  href,
  icon,
  picture,
  count,
  exact = false,
  tone = 'default',
  wrap = false,
  children,
}: {
  href: string
  icon?: keyof typeof ICONS
  /** In place of an icon: a subject's own picture. */
  picture?: ReactNode
  count?: number
  exact?: boolean
  /** "alert" draws the count in the colour for things that need doing. */
  tone?: 'default' | 'alert'
  /** Let a long label run onto a second line rather than cutting it short. */
  wrap?: boolean
  children: ReactNode
}) {
  const pathname = usePathname()
  const path = href.split('#')[0]
  const active = !href.includes('#') && (exact ? pathname === path : pathname === path || pathname.startsWith(`${path}/`))
  const Icon = icon ? ICONS[icon] : null

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex shrink-0 items-center gap-2.5 rounded-control px-3 py-2 text-ui transition-colors ${
        active ? 'bg-ink text-white' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
      }`}
    >
      {picture ?? (Icon ? <Icon size={18} aria-hidden="true" className="shrink-0" /> : null)}
      <span className={`min-w-0 flex-1 ${wrap ? '' : 'truncate'}`}>{children}</span>
      {count ? (
        <span
          className={`shrink-0 rounded-full px-1.5 text-micro tabular-nums ${
            active ? 'bg-white/20 text-white' : tone === 'alert' ? 'bg-incorrect-soft text-incorrect' : 'bg-surface-2 text-ink-muted'
          }`}
        >
          {count}
        </span>
      ) : null}
    </Link>
  )
}
