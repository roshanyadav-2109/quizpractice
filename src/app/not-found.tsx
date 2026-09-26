import Link from 'next/link'
import type { Metadata } from 'next'
import { SHELL } from '@/components/site/Page'
import { EmptyState } from '@/components/ui/EmptyState'
import { buttonClass } from '@/components/ui/primitives'

export const metadata: Metadata = { title: 'Page not found', robots: { index: false } }

/** Any address that is not a page — and any paper or subject that no longer exists. */
export default function NotFound() {
  return (
    <div className={`${SHELL} py-12`}>
      <EmptyState
        art="not-found"
        size="lg"
        title="We couldn’t find that page"
        actions={
          <>
            <Link href="/subjects" className={buttonClass('primary', 'md')}>
              Browse subjects
            </Link>
            <Link href="/search" className={buttonClass('outline', 'md')}>
              Search questions
            </Link>
          </>
        }
      >
        The link may be old, or the paper may have moved. Every past paper is still reachable from its subject.
      </EmptyState>
    </div>
  )
}
