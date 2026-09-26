'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { SHELL } from '@/components/site/Page'
import { EmptyState } from '@/components/ui/EmptyState'
import { buttonClass } from '@/components/ui/primitives'

/**
 * A page that failed to render. Offline gets its own words, because "try
 * again" is only useful advice once the connection is back.
 */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  const offline = typeof navigator !== 'undefined' && !navigator.onLine

  return (
    <div className={`${SHELL} py-12`}>
      <EmptyState
        art={offline ? 'offline' : 'server-error'}
        size="lg"
        title={offline ? 'You’re offline' : 'Something went wrong on our side'}
        actions={
          <>
            <button type="button" onClick={() => retry()} className={buttonClass('primary', 'md')}>
              Try again
            </button>
            <Link href="/" className={buttonClass('outline', 'md')}>
              Go home
            </Link>
          </>
        }
      >
        {offline
          ? 'Check your connection, then try again. Answers you’ve given in a paper stay saved on this device, so nothing is lost.'
          : 'This page couldn’t load. Trying again usually fixes it; if it keeps happening, report it and quote the code below.'}
        {!offline && error.digest ? <span className="mt-2 block font-mono text-[0.75rem] text-ink-faint">{error.digest}</span> : null}
      </EmptyState>
    </div>
  )
}
