import type { ReactNode } from 'react'
import { Breadcrumb, type Crumb } from '@/components/site/Page'
import { formatSession } from '@/lib/format'

export interface HubStat {
  label: string
  value: string
}

/**
 * The top of every catalogue page, in the order a reader (or an assistant
 * quoting the page) needs it: where this is, what it is, the answer in two
 * sentences, the numbers, and when it was last updated.
 */
export function HubHeader({
  crumbs,
  icon,
  eyebrow,
  title,
  lead,
  stats = [],
  updated,
  actions,
}: {
  crumbs: Crumb[]
  icon?: ReactNode
  eyebrow?: string
  title: string
  lead: ReactNode
  stats?: HubStat[]
  updated?: string | null
  actions?: ReactNode
}) {
  return (
    <header>
      <Breadcrumb crumbs={crumbs} />
      <div className="mt-3 flex items-start gap-4">
        {icon ? <div className="hidden shrink-0 sm:block">{icon}</div> : null}
        <div className="min-w-0">
          {eyebrow ? <p className="text-meta text-ink-faint">{eyebrow}</p> : null}
          <h1 className="mt-0.5 text-[1.625rem] leading-tight font-medium text-balance text-ink sm:text-[2rem]">{title}</h1>
        </div>
      </div>
      <div className="mt-3 max-w-[72ch] text-body leading-relaxed text-ink-muted [&_a]:underline [&_a]:underline-offset-2">
        {lead}
      </div>
      {stats.length > 0 ? (
        <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt className="text-meta text-ink-faint">{stat.label}</dt>
              <dd className="text-[1.125rem] text-ink tabular-nums">{stat.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {actions ? <div className="mt-5 flex flex-wrap gap-2">{actions}</div> : null}
      {updated ? (
        <p className="mt-4 text-meta text-ink-faint">
          Updated <time dateTime={updated.slice(0, 10)}>{formatSession(updated.slice(0, 10))}</time>
        </p>
      ) : null}
    </header>
  )
}
