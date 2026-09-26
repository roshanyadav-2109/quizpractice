import type { ReactNode } from 'react'

/** The illustrations in public/art/states/, one per kind of empty or error state. */
export type StateArt =
  | 'not-found'
  | 'server-error'
  | 'offline'
  | 'no-results'
  | 'coming-soon'
  | 'no-discussion'
  | 'no-solution'
  | 'welcome'
  | 'all-clear'
  | 'waiting-for-others'
  | 'sign-in-required'

const SIZES = { sm: 112, md: 168, lg: 240 } as const

/**
 * What a page or panel shows when there is nothing to show — or something
 * went wrong: an illustration, a plain sentence of what happened, and what to
 * do next. `framed` draws it as its own card; unframed, it sits inside one.
 */
export function EmptyState({
  art,
  title,
  children,
  actions,
  size = 'md',
  framed = true,
  className = '',
}: {
  art: StateArt
  title: ReactNode
  children?: ReactNode
  actions?: ReactNode
  size?: keyof typeof SIZES
  framed?: boolean
  className?: string
}) {
  const px = SIZES[size]
  return (
    <div
      className={`flex flex-col items-center text-center ${size === 'sm' ? 'px-4 py-6' : 'px-6 py-10'} ${
        framed ? 'rounded-[10px] border border-rule bg-surface' : ''
      } ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/art/states/${art}.webp`} alt="" width={px} height={px} className="max-w-full select-none" draggable={false} />
      <p className={`${size === 'sm' ? 'mt-2 text-ui' : 'mt-4 text-card'} font-normal text-ink text-balance`}>{title}</p>
      {children ? (
        <div className={`mt-1.5 max-w-[48ch] font-light text-ink-muted ${size === 'sm' ? 'text-meta' : 'text-ui'}`}>{children}</div>
      ) : null}
      {actions ? <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </div>
  )
}
