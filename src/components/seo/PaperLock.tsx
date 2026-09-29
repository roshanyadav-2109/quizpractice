'use client'

import Link from 'next/link'
import { useViewer } from '@/components/site/Viewer'
import { SignInButton } from '@/components/site/AuthDialog'
import { Clock, LockSimple } from '@/components/ui/icons'
import { buttonClass } from '@/components/ui/primitives'

/**
 * Where a paper's free preview ends. The page is the same for every visitor
 * and is served from the CDN, so the card starts as the signed-out one — what
 * search engines see — and turns into "open the whole paper" in the browser
 * of a student who is signed in.
 *
 * Its class, `paper-locked`, is what the paper's structured data names as
 * the part of the page that needs a sign-in (isAccessibleForFree: false).
 */
export function PaperLock({ setId, shown, total }: { setId: string; shown: number; total: number }) {
  const { status } = useViewer()
  const rest = total - shown
  if (rest <= 0) return null
  const learning = `/practice/${setId}?mode=learning&q=${shown + 1}`

  return (
    <section aria-labelledby="paper-locked" className="paper-locked rounded-card border border-rule bg-surface-2 px-5 py-6 sm:px-6">
      <div className="flex items-start gap-3">
        <LockSimple size={22} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-muted" />
        <div className="min-w-0">
          <h2 id="paper-locked" className="text-card font-medium text-ink">
            {rest === 1 ? 'One more question' : `${rest} more questions`} in this paper
          </h2>
          <p className="mt-1 max-w-[62ch] text-ui leading-relaxed text-ink-muted">
            {status === 'signed-in'
              ? 'Open the whole paper in learning mode, with every answer and explanation, or take it as a timed mock test.'
              : 'Sign in with Google — it is free — to see every question with its answer and explanation, practise it in learning mode, or take it as a timed mock test.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {status === 'signed-in' ? (
              <>
                <Link href={learning} className={buttonClass('primary', 'md')}>
                  Open all {total} questions
                </Link>
                <Link href={`/paper/${setId}`} className={buttonClass('outline', 'md')}>
                  <Clock size={16} aria-hidden="true" />
                  Take as mock test
                </Link>
              </>
            ) : (
              <SignInButton next={learning} className={buttonClass('primary', 'md', 'h-auto min-h-10 max-w-full py-2 text-center whitespace-normal')}>
                Sign in with Google to see all {total}
              </SignInButton>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
