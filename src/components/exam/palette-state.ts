/**
 * NTA computer-based-test palette semantics.
 *
 * Shared between the palette itself and the runner that computes the states, so
 * the colour of a box and the meaning behind it can never drift apart.
 */
export type PaletteState =
  | 'not_visited'
  | 'visited'
  | 'answered'
  | 'review'
  | 'answered_review'

/** Legend order follows the CBT's own legend. */
export const PALETTE_ORDER: PaletteState[] = [
  'answered',
  'visited',
  'review',
  'answered_review',
  'not_visited',
]

export const PALETTE_LEGEND: Record<PaletteState, string> = {
  answered: 'Answered',
  visited: 'Not answered',
  review: 'Marked for review',
  answered_review: 'Answered & marked for review',
  not_visited: 'Not visited',
}

/**
 * The fill for a question's box. Blue answered, grey not answered, yellow
 * marked for review, white not yet seen — the colour code of the CBT itself.
 * Answered-and-marked shares the yellow and adds a blue dot, because the
 * answer still counts and students need to see that at a glance.
 */
export function paletteClasses(state: PaletteState): string {
  switch (state) {
    case 'answered':
      return 'border border-pal-answered bg-pal-answered text-white'
    case 'visited':
      return 'border border-pal-unanswered bg-pal-unanswered text-ink'
    case 'review':
    case 'answered_review':
      return 'border border-pal-marked bg-pal-marked text-ink'
    default:
      return 'border border-rule-strong bg-surface text-ink hover:border-ink-faint'
  }
}

/** The legend's round tick: the state's fill, and the tick's own colour. */
export function legendClasses(state: PaletteState): { disc: string; tick: string } {
  switch (state) {
    case 'answered':
      return { disc: 'bg-pal-answered', tick: 'text-white' }
    case 'visited':
      return { disc: 'bg-pal-unanswered', tick: 'text-white' }
    case 'review':
      return { disc: 'bg-pal-marked', tick: 'text-white' }
    case 'answered_review':
      return { disc: 'bg-pal-marked', tick: 'text-pal-answered' }
    default:
      return { disc: 'border border-rule-strong bg-surface', tick: 'text-ink' }
  }
}

/** Which of the five states a question is in, given what the student has done. */
export function paletteStateFor({
  answered,
  visited,
  marked,
}: {
  answered: boolean
  visited: boolean
  marked: boolean
}): PaletteState {
  if (marked) return answered ? 'answered_review' : 'review'
  if (answered) return 'answered'
  return visited ? 'visited' : 'not_visited'
}
