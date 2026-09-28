'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/*
  A thin bar across the top of the window from the moment a page is asked
  for until it is on screen. Catalogue pages have no loading.tsx (it would
  break their 404s and redirects), so without it a click on a filter or a
  link looked like nothing had happened until the new page arrived.

  It starts on any click on a link to another page of the site, and on
  navigate() — for dropdowns, which move with router.push and no link. It
  ends when the address changes.
*/

const START = 'qs:navigation-start'

/** router.push, with the progress bar shown until the new page is on screen. */
export function useNavigate() {
  const router = useRouter()
  return useCallback(
    (href: string, options?: { scroll?: boolean }) => {
      const target = new URL(href, window.location.href)
      if (target.pathname + target.search !== window.location.pathname + window.location.search) {
        window.dispatchEvent(new Event(START))
      }
      router.push(href, options)
    },
    [router],
  )
}

export function RouteProgress() {
  // The address is read in the browser only, so the pages around it stay static.
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  )
}

type Phase = 'idle' | 'running' | 'finishing'

function Bar() {
  const where = `${usePathname()}?${useSearchParams().toString()}`
  const [phase, setPhase] = useState<Phase>('idle')
  const [seen, setSeen] = useState(where)
  // The address changed: the new page is here.
  if (where !== seen) {
    setSeen(where)
    if (phase === 'running') setPhase('finishing')
  }

  useEffect(() => {
    const start = () => setPhase('running')
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return
      const url = new URL(link.href, window.location.href)
      if (url.origin !== window.location.origin) return
      // The same page, or a place on it: nothing to wait for.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      start()
    }
    window.addEventListener(START, start)
    document.addEventListener('click', onClick)
    return () => {
      window.removeEventListener(START, start)
      document.removeEventListener('click', onClick)
    }
  }, [])

  // Fades once the page is in; never stays up if a navigation goes nowhere.
  useEffect(() => {
    if (phase === 'idle') return
    const timer = setTimeout(() => setPhase('idle'), phase === 'finishing' ? 350 : 15000)
    return () => clearTimeout(timer)
  }, [phase])

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-[3px]">
      <div
        className="h-full bg-accent"
        style={{
          width: phase === 'idle' ? '0%' : phase === 'running' ? '85%' : '100%',
          opacity: phase === 'running' ? 1 : 0,
          transition:
            phase === 'running'
              ? 'width 5s cubic-bezier(0.08, 0.8, 0.2, 1), opacity 0.1s'
              : phase === 'finishing'
                ? 'width 0.2s ease-out, opacity 0.2s 0.15s'
                : 'none',
        }}
      />
    </div>
  )
}
