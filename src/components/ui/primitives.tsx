import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

/**
 * The small vocabulary every screen is built from.
 *
 * One border weight (1px, stone), radii of 10–14px, no shadows. The primary
 * action on any screen is solid black; everything else is outlined, so there
 * is never a question of which button matters. Text is regular; only
 * headings are medium.
 */

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-control whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-45'

const BUTTON_SIZES = {
  sm: 'h-8 px-3 text-meta',
  md: 'h-10 px-4 text-ui',
  // 44px: the touch-target floor, used wherever a thumb is the pointer.
  lg: 'h-11 px-5 text-ui',
} as const

const BUTTON_TONES = {
  primary: 'bg-ink text-white hover:bg-ink/85',
  solid: 'bg-ink text-white hover:bg-ink/85',
  outline: 'border border-rule bg-surface text-ink hover:border-rule-strong',
  ghost: 'text-ink-muted hover:bg-surface-2 hover:text-ink',
  correct: 'bg-correct text-white hover:bg-correct/90',
  danger:
    'border border-rule bg-surface text-incorrect hover:border-incorrect/40 hover:bg-incorrect-soft',
} as const

export type ButtonTone = keyof typeof BUTTON_TONES
export type ButtonSize = keyof typeof BUTTON_SIZES

export function buttonClass(
  tone: ButtonTone = 'outline',
  size: ButtonSize = 'md',
  extra = '',
): string {
  return `${BUTTON_BASE} ${BUTTON_SIZES[size]} ${BUTTON_TONES[tone]} ${extra}`
}

export function Button({
  tone = 'outline',
  size = 'md',
  className = '',
  ...props
}: ComponentProps<'button'> & { tone?: ButtonTone; size?: ButtonSize }) {
  return <button {...props} className={buttonClass(tone, size, className)} />
}

export function ButtonLink({
  tone = 'outline',
  size = 'md',
  className = '',
  ...props
}: ComponentProps<typeof Link> & { tone?: ButtonTone; size?: ButtonSize }) {
  return <Link {...props} className={buttonClass(tone, size, className)} />
}

const CHIP_BASE =
  'inline-flex h-8 shrink-0 items-center rounded-control px-3 text-meta whitespace-nowrap transition-colors'
const CHIP_ON = 'bg-ink text-white'
const CHIP_OFF = 'border border-rule bg-surface text-ink-muted hover:border-rule-strong hover:text-ink'

/** A filter chip that navigates. Selected is a black fill, never colour alone. */
export function Chip({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? 'true' : undefined}
      className={`${CHIP_BASE} ${active ? CHIP_ON : CHIP_OFF}`}
    >
      {children}
    </Link>
  )
}

/** The same chip for client-side state (tabs, toggles). */
export function ChipButton({
  active,
  className = '',
  ...props
}: ComponentProps<'button'> & { active: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      {...props}
      className={`${CHIP_BASE} ${active ? CHIP_ON : CHIP_OFF} ${className}`}
    />
  )
}

/** A section heading, with an optional count or note beside it. */
export function SectionHead({
  title,
  meta,
  children,
}: {
  title: string
  meta?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div className="flex items-baseline gap-2.5">
        <h2 className="text-[1.375rem] leading-tight font-medium text-ink">{title}</h2>
        {meta ? <span className="text-meta text-ink-faint tabular-nums">{meta}</span> : null}
      </div>
      {children}
    </div>
  )
}

/** A white panel on the page ground. */
export function Card({
  className = '',
  children,
  ...props
}: ComponentProps<'div'>) {
  return (
    <div {...props} className={`rounded-card border border-rule bg-surface ${className}`}>
      {children}
    </div>
  )
}

/** Label/value pair used across meta panels. */
export function Field({
  label,
  value,
  mono,
}: {
  label: string
  value: ReactNode
  /** Tabular figures, for values that are numbers or codes. */
  mono?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="text-meta text-ink-faint">{label}</dt>
      <dd
        className={`min-w-0 truncate text-right text-meta text-ink ${mono ? 'tabular-nums' : ''}`}
      >
        {value}
      </dd>
    </div>
  )
}

const BADGE_TONES = {
  neutral: 'bg-surface-2 text-ink-muted',
  accent: 'bg-accent-soft text-accent',
  correct: 'bg-correct-soft text-correct',
  incorrect: 'bg-incorrect-soft text-incorrect',
  marked: 'bg-marked-soft text-marked',
} as const

/** A small tag: "Programming", "MCQ", "Draft". */
export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: keyof typeof BADGE_TONES
  children: ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[0.78125rem] leading-[1.45] ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  )
}

/** Empty state. One icon, one line, one action — never a decorated void. */
export function Empty({
  icon,
  title,
  children,
}: {
  icon?: ReactNode
  title: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-rule bg-surface px-5 py-12 text-center">
      {icon ? <span className="text-ink-faint">{icon}</span> : null}
      <p className="text-ui text-ink">{title}</p>
      {children ? <div className="text-meta text-ink-muted">{children}</div> : null}
    </div>
  )
}
