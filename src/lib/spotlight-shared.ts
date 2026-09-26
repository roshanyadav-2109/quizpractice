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
  /** Stable while the banner means the same thing. */
  id: string
  tone: SpotlightTone
  eyebrow: string
  title: string
  body: string
  cta: SpotlightAction
  secondary?: SpotlightAction
  /** Real screens of the site, shown in a laptop and a phone. */
  screens?: { desktop: string; mobile: string }
}
