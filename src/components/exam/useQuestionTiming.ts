'use client'

import { useCallback, useEffect, useRef } from 'react'

/**
 * Per-question dwell time.
 *
 * This is the data point the whole post-test analysis rests on: without it you
 * can say a question was wrong, but not that it was wrong *and* rushed, or that
 * eight minutes went into a question that was ultimately left blank.
 *
 * Two details matter for the numbers to mean anything:
 *
 *  - Timing stops when the tab is hidden. Otherwise leaving the paper open over
 *    lunch attributes an hour to whichever question happened to be on screen.
 *  - Time accumulates per question across visits, so scrolling back to
 *    reconsider adds to that question rather than starting it over.
 */
export function useQuestionTiming(activeId: string | null, frozen: boolean) {
  const totals = useRef<Record<string, number>>({})
  const current = useRef<{ id: string; since: number } | null>(null)

  const commit = useCallback(() => {
    const open = current.current
    if (!open) return
    const seconds = Math.round((Date.now() - open.since) / 1000)
    if (seconds > 0) {
      totals.current[open.id] = (totals.current[open.id] ?? 0) + seconds
    }
    current.current = null
  }, [])

  // Move the clock to whichever question is on screen.
  useEffect(() => {
    if (frozen) {
      commit()
      return
    }
    if (current.current?.id === activeId) return
    commit()
    if (activeId) current.current = { id: activeId, since: Date.now() }
  }, [activeId, frozen, commit])

  // Stop counting while the tab is in the background.
  useEffect(() => {
    if (frozen) return

    function onVisibility() {
      if (document.hidden) {
        commit()
      } else if (activeId) {
        current.current = { id: activeId, since: Date.now() }
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      commit()
    }
  }, [activeId, frozen, commit])

  /** Totals including the question currently on screen. */
  const snapshot = useCallback((): Record<string, number> => {
    commit()
    if (activeId && !frozen) current.current = { id: activeId, since: Date.now() }
    return { ...totals.current }
  }, [activeId, frozen, commit])

  return snapshot
}
