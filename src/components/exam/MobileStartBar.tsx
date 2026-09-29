'use client'

import { useState, type ReactNode } from 'react'
import { CaretUp } from '@/components/ui/icons'
import { StartControls } from '@/components/exam/StartControls'

/**
 * The instructions page's way in, pinned to the bottom on a phone instead of
 * sitting wherever the single mobile column happens to put it — after two
 * screens of instructions, "I am ready to begin" should not need a scroll to
 * find. The candidate card (who is sitting, their best score) still exists;
 * it opens as a sheet above the bar on demand instead of taking up room in it
 * permanently.
 */
export function MobileStartBar({
  setId,
  isSignedIn,
  candidate,
}: {
  setId: string
  isSignedIn: boolean
  candidate: ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="lg:hidden">
      {/* Spacer so the fixed bar never covers the page's own last lines. */}
      <div aria-hidden className="h-40" />

      {open ? (
        <button type="button" aria-label="Close candidate details" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-ink/25" />
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-rule bg-surface pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        <div
          className={`grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        >
          <div className="min-h-0">
            <div className="border-b border-rule px-5 pt-4 pb-3">{candidate}</div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-center gap-1.5 border-b border-rule py-1.5 text-micro text-ink-faint"
        >
          <CaretUp size={12} aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          Candidate details
        </button>

        <div className="px-5 pt-3 pb-4">
          <StartControls setId={setId} isSignedIn={isSignedIn} compact />
        </div>
      </div>
    </div>
  )
}
