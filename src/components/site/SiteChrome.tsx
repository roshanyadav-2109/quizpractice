'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense, type ReactNode } from 'react'

/**
 * The site's navigation, withheld from a paper sat in exam mode.
 *
 * Sitting a paper is a separate full-viewport experience, as it is in the real
 * CBT: nothing on screen but the paper, the palette and the clock. Learning
 * mode — and retrying mistakes, which is learning mode — keeps the site's
 * header, since it is practice rather than an exam. The header stays a server
 * component — it is passed in as children — so this only decides whether to
 * render it.
 */
export function SiteChrome({ children }: { children: ReactNode }) {
  // Reading the query needs a boundary; until it resolves, show the header.
  return (
    <Suspense fallback={children}>
      <Chrome>{children}</Chrome>
    </Suspense>
  )
}

function Chrome({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const params = useSearchParams()
  const sittingExam = pathname?.startsWith('/practice/') && params.get('mode') !== 'learning'
  return sittingExam ? null : <>{children}</>
}
