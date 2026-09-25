import Link from 'next/link'
import { Fragment, type ReactNode } from 'react'
import { ArrowLeft, CaretRight } from '@/components/ui/icons'

/**
 * The parts of a name in order — subject, exam, sitting — with a chevron
 * between each, as the breadcrumb separates them. Inline, so it can sit in a
 * heading or a truncated line; screen readers hear a comma.
 */
export function Trail({ parts }: { parts: ReactNode[] }) {
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 ? (
            <>
              <span className="sr-only">, </span>
              <CaretRight
                size="0.75em"
                aria-hidden="true"
                className="mx-[0.35em] inline-block align-[-0.05em] text-ink-faint"
              />
            </>
          ) : null}
          {part}
        </Fragment>
      ))}
    </>
  )
}

/**
 * The page shell every screen is built from.
 *
 * Top navigation, no sidebar, content capped at 1360px. Location comes from
 * the breadcrumb. The width, gutters and header block are decided here once,
 * so every page lines up with every other.
 *
 * The exam runner does not use it: sitting a paper is a mode, not a page.
 */

/** The content measure: 1360px, with gutters that step up with the screen. */
export const SHELL = 'mx-auto w-full max-w-[85rem] px-4 sm:px-6 lg:px-8'

export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`${SHELL} py-6 sm:py-8 ${className}`}>{children}</div>
}

export interface Crumb {
  label: string
  href?: string
}

/**
 * Breadcrumb, then the page title and whatever identifies the thing — a
 * course code, a set code. Without a sidebar this is the only "where am I".
 */
export function PageHeader({
  crumbs = [],
  eyebrow,
  title,
  meta,
  actions,
  children,
}: {
  crumbs?: Crumb[]
  eyebrow?: string
  title: string
  meta?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="mb-6">
      {crumbs.length > 0 ? (
        <nav aria-label="Breadcrumb" className="mb-3">
          <ol className="flex flex-wrap items-center gap-1.5 text-meta text-ink-faint">
            {crumbs.map((crumb, i) => (
              <li key={`${crumb.label}-${i}`} className="flex items-center gap-1.5">
                {i > 0 ? <CaretRight size={12} aria-hidden="true" /> : null}
                {crumb.href ? (
                  <Link href={crumb.href} className="transition-colors hover:text-ink">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-ink-muted">{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      {eyebrow ? <p className="label mb-2">{eyebrow}</p> : null}

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] leading-tight font-medium text-balance text-ink sm:text-title">
            {title}
          </h1>
          {meta ? <div className="mt-1.5 text-ui text-ink-muted tabular-nums">{meta}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>

      {children}
    </header>
  )
}

/**
 * A labelled row of filter chips. On a phone the chips scroll sideways in a
 * rail rather than wrapping into a wall; from `sm` up they wrap.
 */
export function FilterBar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="label w-12 shrink-0">{label}</span>
      <div className="rail -mr-4 flex min-w-0 flex-1 gap-1.5 overflow-x-auto pr-4 sm:mr-0 sm:flex-wrap sm:overflow-visible sm:pr-0">
        {children}
      </div>
    </div>
  )
}

/** A titled block within a page, with an optional count or action. */
export function Section({
  title,
  meta,
  action,
  children,
  className = '',
}: {
  title: string
  meta?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`mt-8 first:mt-0 ${className}`}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-[1.375rem] leading-tight font-medium text-ink">{title}</h2>
          {meta ? <span className="text-meta text-ink-faint tabular-nums">{meta}</span> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/** The card grid: 4-up on large desktop, 3 on desktop, 2 on tablet, 1 on a phone. */
export function CardGrid({ children }: { children: ReactNode }) {
  return <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</ul>
}

/*
  ---------------------------------------------------------------------------
  The page wireframe
  ---------------------------------------------------------------------------
  Every inner page is the same three pieces, top to bottom:

    breadcrumb
    ←  Title
       subtitle

    ┌ navigator ────┐   Heading
    │ ● Item        │   [chip] [chip] [chip]
    │ ○ Item        │   ┌ row card ─────┐ ┌ row card ─────┐
    │ ○ Item        │   └───────────────┘ └───────────────┘
    └───────────────┘

  One box for the navigator and one per item — nothing boxed around boxes.

  The navigator picks what the content card shows. On a phone it becomes a
  sideways rail above the content instead of a column beside it.
*/

/** Breadcrumb on its own, for pages whose title lives in a TitleCard. */
export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-2">
      <ol className="flex flex-wrap items-center gap-1 text-micro text-ink-faint">
        {crumbs.map((crumb, i) => (
          <li key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-1">
            {i > 0 ? <CaretRight size={10} aria-hidden="true" className="shrink-0" /> : null}
            {crumb.href ? (
              <Link href={crumb.href} className="truncate transition-colors hover:text-ink">
                {crumb.label}
              </Link>
            ) : (
              <span className="truncate text-ink-muted">{crumb.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

/**
 * The top of a page: an optional back arrow, the title, and a line under it,
 * set straight on the page ground. Anything passed as children sits below —
 * a metric strip, a search field.
 */
export function TitleCard({
  back,
  icon,
  eyebrow,
  title,
  subtitle,
  aside,
  children,
}: {
  back?: string
  /** Shown before the title, e.g. a subject's icon. */
  icon?: ReactNode
  eyebrow?: string
  title: ReactNode
  subtitle?: ReactNode
  aside?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="pb-1">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          {back ? (
            <Link
              href={back}
              aria-label="Back"
              className="-ml-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-ink transition-colors hover:bg-surface-2"
            >
              <ArrowLeft size={22} aria-hidden="true" />
            </Link>
          ) : null}
          {icon}
          <div className="min-w-0">
            {eyebrow ? <p className="label mb-1">{eyebrow}</p> : null}
            <h1 className="text-[1.5rem] leading-tight font-medium text-balance text-ink sm:text-[1.75rem]">
              {title}
            </h1>
            {subtitle ? (
              <div className="mt-1 text-ui text-ink-muted tabular-nums">{subtitle}</div>
            ) : null}
          </div>
        </div>
        {aside ? <div className="flex flex-wrap items-center gap-2">{aside}</div> : null}
      </div>
      {children}
    </div>
  )
}

/** The two-pane body: a navigator column and the content beside it. */
export function TwoPane({
  nav,
  children,
  navWidth = 'lg:grid-cols-[20rem_minmax(0,1fr)]',
}: {
  nav: ReactNode
  children: ReactNode
  navWidth?: string
}) {
  return (
    <div className={`mt-4 grid items-start gap-4 ${navWidth}`}>
      <div className="min-w-0 lg:sticky lg:top-20">{nav}</div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/**
 * The content column: a heading row, then whatever it holds, on the page
 * ground. Only the cards inside it are boxed — a box around the box was one
 * block more than the page needs.
 */
export function Panel({
  title,
  meta,
  action,
  children,
  className = '',
}: {
  title?: string
  meta?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={className}>
      {title ? (
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className="flex items-baseline gap-2.5">
            <h2 className="text-[1.25rem] leading-tight font-medium text-ink">{title}</h2>
            {meta ? <span className="text-meta text-ink-faint tabular-nums">{meta}</span> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export interface NavListItem {
  key: string
  label: string
  meta?: string
  active: boolean
  href?: string
  onSelect?: () => void
}

/**
 * The navigator: a list of rows, the selected one filled.
 * Rows are links when the choice lives in the URL, buttons when it is local
 * state. Below `lg` the list turns into a sideways rail of the same rows.
 */
export function NavList({ title, items }: { title?: string; items: NavListItem[] }) {
  return (
    <div className="rounded-card border border-rule bg-surface p-2 sm:p-3">
      {/* On a phone the list is a sideways rail and explains itself. */}
      {title ? (
        <h2 className="hidden px-2 pt-1 pb-2 text-[1.125rem] font-medium text-ink lg:block">{title}</h2>
      ) : null}
      <ul className="rail flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {items.map((item) => {
          const inner = (
            <>
              <span className="min-w-0 flex-1 text-left">
                <span
                  className={`block text-ui leading-snug whitespace-nowrap lg:whitespace-normal ${
                    item.active ? ' text-ink' : 'text-ink'
                  }`}
                >
                  {item.label}
                </span>
                {item.meta ? (
                  <span className="block text-meta whitespace-nowrap text-ink-faint tabular-nums">
                    {item.meta}
                  </span>
                ) : null}
              </span>
              <CaretRight
                size={14}
                aria-hidden="true"
                className="hidden shrink-0 text-ink-faint lg:block"
              />
            </>
          )
          const cls = `flex shrink-0 items-center gap-3 rounded-control px-3 py-2.5 transition-colors lg:w-full ${
            item.active ? 'bg-surface-2' : 'hover:bg-surface-2'
          }`
          return (
            <li key={item.key} className="shrink-0 lg:shrink">
              {item.href ? (
                <Link
                  href={item.href}
                  scroll={false}
                  aria-current={item.active ? 'true' : undefined}
                  className={cls}
                >
                  {inner}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={item.onSelect}
                  aria-pressed={item.active}
                  className={cls}
                >
                  {inner}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
