'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

/**
 * The site's navigation, withheld from the exam runner.
 *
 * Sitting a paper is a separate full-viewport experience, as it is in the real
 * CBT: nothing on screen but the paper, the palette and the clock. The header
 * stays a server component — it is passed in as children — so this only
 * decides whether to render it.
 */
export function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  if (pathname?.startsWith('/practice/') || pathname?.startsWith('/mistakes/practice')) return null
  return <>{children}</>
}
