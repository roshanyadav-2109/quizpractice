'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

/**
 * The site's navigation and footer, withheld from the full-viewport modes.
 *
 * Sitting a paper is a separate full-viewport experience, as it is in the real
 * CBT: nothing on screen but the paper, the palette and the clock. The
 * teacher's studio is the same kind of mode — the question, the board and the
 * recorder need every pixel — and the rest of the teaching desk has its own
 * workspace, with its own sidebar in place of the site's header. The header and footer stay server components —
 * they are passed in as children — so this only decides whether to render
 * them.
 */
export function SiteChrome({ children, part = 'header' }: { children: ReactNode; part?: 'header' | 'footer' }) {
  const pathname = usePathname()
  // The dashboard keeps the header but not the footer: it is where a student works.
  if (part === 'footer' && pathname === '/dashboard') return null
  if (
    pathname?.startsWith('/practice/') ||
    pathname?.startsWith('/mistakes/practice') ||
    pathname === '/teach' ||
    pathname?.startsWith('/teach/')
  ) {
    return null
  }
  return <>{children}</>
}
