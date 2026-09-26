/**
 * What a spotlight banner carries, shared by the server that decides which
 * banners to show and the carousel that shows them.
 */

export type SpotlightTone = 'exam' | 'release' | 'feature' | 'announcement'

export type SpotlightPlacement = 'home' | 'dashboard' | 'papers' | 'subject'

export interface SpotlightAction {
  label: string
  href: string
  /** Opens the sign-in dialog instead of following the link. */
  signIn?: boolean
}

export interface Spotlight {
  /** Stable while the banner means the same thing, so a dismissal sticks. */
  id: string
  tone: SpotlightTone
  eyebrow: string
  title: string
  body: string
  cta: SpotlightAction
  secondary?: SpotlightAction
  /** One figure on the right: days to an exam, new subjects, mistakes to retry. */
  stat?: { value: string; label: string; detail?: string }
}

/** Banners a visitor has closed, by id. Read on the server so they never flash. */
export const HIDDEN_COOKIE = 'qp_hidden'
