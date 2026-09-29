'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'

const subscribeNever = () => () => {}
const reducedQuery = '(prefers-reduced-motion: reduce)'
function subscribeReduced(listener: () => void) {
  const query = window.matchMedia(reducedQuery)
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}

/** Unhurried typing, quicker rubbing out, and a rest on each whole phrase. */
const TYPE_MS = 75
const ERASE_MS = 35
const HOLD_MS = 1800
const GAP_MS = 350

type Phase = 'hold' | 'erase' | 'type'

/**
 * A phrase inside a sentence typed out, rubbed out and typed again as the
 * next one, with a blinking cursor. The slot keeps the width of the longest
 * phrase and types from its left edge, so the sentence around it never moves.
 * The page as served — and as search engines and screen readers read it —
 * says the first phrase only; the typing starts once the page runs in a
 * browser. Anyone who asked their system for less motion keeps it still.
 */
export function RotatingWords({ words }: { words: string[] }) {
  const running = useSyncExternalStore(subscribeNever, () => true, () => false)
  const reduced = useSyncExternalStore(subscribeReduced, () => window.matchMedia(reducedQuery).matches, () => false)
  const animate = running && !reduced && words.length > 1
  const [wordIndex, setWordIndex] = useState(0)
  const [shown, setShown] = useState(words[0])
  const [phase, setPhase] = useState<Phase>('hold')

  useEffect(() => {
    if (!animate) return
    const word = words[wordIndex]
    let delay: number
    let step: () => void
    if (phase === 'hold') {
      delay = HOLD_MS
      step = () => setPhase('erase')
    } else if (phase === 'erase') {
      if (shown.length > 0) {
        delay = ERASE_MS
        step = () => setShown(shown.slice(0, -1))
      } else {
        delay = GAP_MS
        step = () => {
          setWordIndex((wordIndex + 1) % words.length)
          setPhase('type')
        }
      }
    } else if (shown.length < word.length) {
      delay = TYPE_MS
      step = () => setShown(word.slice(0, shown.length + 1))
    } else {
      delay = 0
      step = () => setPhase('hold')
    }
    const timer = setTimeout(step, delay)
    return () => clearTimeout(timer)
  }, [animate, phase, shown, wordIndex, words])

  if (!animate) return <span className="font-medium text-accent">{words[0]}</span>

  const longest = words.reduce((a, b) => (b.length > a.length ? b : a))
  return (
    <span className="relative inline-grid text-left font-medium text-accent">
      <span className="sr-only">{words[0]}</span>
      {/* Holds the slot at the longest phrase's width. */}
      <span aria-hidden="true" className="invisible col-start-1 row-start-1 whitespace-nowrap">
        {longest}
      </span>
      <span aria-hidden="true" className="col-start-1 row-start-1 whitespace-nowrap">
        {shown}
        <span className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.18em] bg-accent motion-safe:animate-[sc-caret_1s_steps(1,end)_infinite]" />
      </span>
    </span>
  )
}
