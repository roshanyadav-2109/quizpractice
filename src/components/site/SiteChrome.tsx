'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

/**
 * The site's navigation and footer, withheld from the full-viewport modes.
 *
 * Sitting a paper is a separate full-viewport experience, as it is in the real
 * CBT: nothing on screen but the paper, the palette and the clock. The
 * teacher's studio is the same kind of mode — the question, the board and the
 * recorder need every pixel. The header and footer stay server components —
 * they are passed in as children — so this only decides whether to render
 * them.
 */
export function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  if (
    pathname?.startsWith('/practice/') ||
    pathname?.startsWith('/mistakes/practice') ||
    pathname?.startsWith('/teach/q/')
  ) {
    return null
  }
  return <>{children}</>
}
