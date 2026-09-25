'use client'

import { Check } from '@/components/ui/icons'
import type { PaletteState } from './palette-state'
import { PALETTE_LEGEND, PALETTE_ORDER, legendClasses, paletteClasses } from './palette-state'

/**
 * The question palette, following the computer-based test students are
 * trained on. Do not simplify it: five states, each its own fill, and the
 * question on screen ringed in green.
 */
export function QuestionPalette({
  questions,
  stateFor,
  activeId,
  onJump,
}: {
  questions: { id: string; number: number }[]
  stateFor: (questionId: string) => PaletteState
  activeId: string | null
  onJump: (questionId: string) => void
}) {
  return (
    <ol className="grid grid-cols-5 gap-2.5">
      {questions.map((question) => {
        const state = stateFor(question.id)
        const active = activeId === question.id

        return (
          <li key={question.id}>
            <button
              type="button"
              onClick={() => onJump(question.id)}
              aria-current={active ? 'step' : undefined}
              aria-label={`Question ${question.number}, ${PALETTE_LEGEND[state]}`}
              className={`relative flex h-11 w-full items-center justify-center rounded-control text-ui  tabular-nums transition-colors ${paletteClasses(
                state,
              )} ${active ? 'ring-2 ring-pal-current ring-offset-2 ring-offset-surface' : ''}`}
            >
              {question.number}
              {state === 'answered_review' ? (
                <span
                  aria-hidden
                  className="absolute -right-1 -bottom-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-surface bg-pal-answered"
                >
                  <Check size={8} weight="bold" className="text-white" />
                </span>
              ) : null}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/** The legend: a round tick per state, as the CBT draws it, with a live count. */
export function PaletteLegend({
  questions,
  stateFor,
}: {
  questions: { id: string }[]
  stateFor: (questionId: string) => PaletteState
}) {
  const counts = questions.reduce<Record<PaletteState, number>>(
    (tally, question) => {
      tally[stateFor(question.id)] += 1
      return tally
    },
    { not_visited: 0, visited: 0, answered: 0, review: 0, answered_review: 0 },
  )

  return (
    <dl className="grid grid-cols-1 gap-2.5">
      {PALETTE_ORDER.map((state) => {
        const { disc, tick } = legendClasses(state)
        return (
          <div key={state} className="flex items-center gap-2.5">
            <span
              aria-hidden
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${disc}`}
            >
              <Check size={13} weight="bold" className={tick} />
            </span>
            <dt className="min-w-0 flex-1 text-meta text-ink-muted">{PALETTE_LEGEND[state]}</dt>
            <dd className="text-meta text-ink tabular-nums">{counts[state]}</dd>
          </div>
        )
      })}
    </dl>
  )
}
