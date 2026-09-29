import type { CSSProperties, ReactNode } from 'react'
import { FitWidth } from './FitWidth'
import type { HubStat } from '@/components/seo/HubHeader'
import { formatSession } from '@/lib/format'

/**
 * The reading half of a catalogue page, under the part you use, set out as an
 * article: one "More on …" heading, then bold section headings, dark body
 * text with its links in the accent colour, bordered tables with a tinted
 * header row, bulleted lists. The text search engines and assistants
 * read, laid out the way a reader skims it.
 */
export function SeoArticle({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article
      className={[
        // A step smaller on a phone, so the reading half reads as reference, not as the page.
        'mt-12 border-t border-rule pt-8 text-ui leading-6.5 text-ink sm:mt-16 sm:pt-12 sm:text-body sm:leading-7',
        // Links inside the text: the accent colour at the text's own weight;
        // key figures only a touch heavier, in ink.
        '[&_p_a]:text-accent [&_p_a:hover]:underline',
        '[&_li_a]:text-accent [&_li_a:hover]:underline',
        '[&_p_strong]:font-medium [&_p_strong]:text-ink',
      ].join(' ')}
    >
      <h2 className="text-[1.5rem] leading-tight font-bold text-ink sm:text-[2rem]">{title}</h2>
      {children}
    </article>
  )
}

/** A section heading inside the article. */
export function SeoHeading({ id, children, aside }: { id?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mt-9 mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 sm:mt-12">
      <h2 id={id} className="text-[1.2rem] leading-tight font-bold text-ink sm:text-[1.625rem]">
        {children}
      </h2>
      {aside}
    </div>
  )
}

/** The article's opening: the answer in a paragraph, then the numbers as a table, the last row when it last changed. */
export function SeoIntro({
  lead,
  stats = [],
  statsTitle,
  updated,
}: {
  lead: ReactNode
  stats?: HubStat[]
  /** The header of the numbers table's second column, e.g. "DBMS PYQ at a glance". */
  statsTitle: string
  updated?: string | null
}) {
  return (
    <section aria-label="Overview" className="mt-4">
      <div className="[&_a]:underline [&_a]:underline-offset-2 [&_p]:mb-3">{lead}</div>
      {stats.length > 0 || updated ? (
        <div className="mt-6">
          <FactTable
            head={['', statsTitle]}
            rows={[
              ...stats.map((stat): [string, ReactNode] => [stat.label, stat.value]),
              ...(updated
                ? [['Updated', <time key="updated" dateTime={updated.slice(0, 10)}>{formatSession(updated.slice(0, 10))}</time>] as [string, ReactNode]]
                : []),
            ]}
          />
        </div>
      ) : null}
    </section>
  )
}

/** A two-column table in the article's style: tinted header row, a border on every cell, centred. */
export function FactTable({ head, rows }: { head: [string, string]; rows: [string, ReactNode][] }) {
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full border-collapse border-[1.5px] border-ink text-center text-[0.875rem] sm:text-body">
        <thead>
          <tr className="bg-[#cfe3f5]">
            <th scope="col" className="w-1/2 border-[1.5px] border-ink px-2.5 py-2 font-semibold sm:px-4 sm:py-2.5">
              {head[0] || 'Feature'}
            </th>
            <th scope="col" className="border-[1.5px] border-ink px-2.5 py-2 font-semibold sm:px-4 sm:py-2.5">
              {head[1]}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td className="border-[1.5px] border-ink px-2.5 py-2 sm:px-4 sm:py-2.5">{label}</td>
              <td className="border-[1.5px] border-ink px-2.5 py-2 tabular-nums sm:px-4 sm:py-2.5">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Any table in the article's style: tinted header row, a border on every cell, centred. */
export function ArticleTable({
  head,
  rows,
  caption,
  minWidth = '40rem',
  widths,
}: {
  head: ReactNode[]
  rows: { key: string; cells: ReactNode[] }[]
  caption?: string
  minWidth?: string
  /** Column widths, e.g. ['30%', '40%', …], so tables stacked one under another line up. */
  widths?: string[]
}) {
  const cell = 'border-[1.5px] border-ink px-1.5 py-2 sm:px-3 sm:py-2.5'
  return (
    <FitWidth>
      <table
        className={`w-full border-collapse border-[1.5px] border-ink text-center text-[0.8125rem] sm:min-w-[var(--table-min)] sm:text-body ${widths ? 'sm:table-fixed' : ''}`}
        style={{ '--table-min': minWidth } as CSSProperties}
      >
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {widths ? (
          <colgroup>
            {widths.map((width, index) => (
              <col key={index} style={{ width }} />
            ))}
          </colgroup>
        ) : null}
        <thead>
          <tr className="bg-[#cfe3f5]">
            {head.map((label, index) => (
              <th key={index} scope="col" className={`${cell} font-semibold`}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              {row.cells.map((value, index) => (
                <td key={index} className={`${cell} [&_a]:text-accent [&_a:hover]:underline`}>
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </FitWidth>
  )
}
