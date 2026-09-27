import Link from 'next/link'
import Form from 'next/form'
import { CaretLeft, CaretRight } from '@/components/ui/icons'
import { buttonClass } from '@/components/ui/primitives'
import { formatCount } from '@/lib/format'

/**
 * Page through a long queue: where you are, previous and next, and a box to
 * jump straight to a page — the biggest subject runs to 80-odd pages. The
 * jump is a plain GET form, so it works before the page's script has loaded;
 * `keep` carries the other query parameters (filter, paper) along.
 */
export function Pager({
  page,
  total,
  pageSize,
  href,
  action,
  keep,
}: {
  page: number
  total: number
  pageSize: number
  /** The address of a page number. */
  href: (page: number) => string
  /** The path the jump form submits to. */
  action: string
  keep: Record<string, string>
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  return (
    <nav aria-label="Queue pages" className="mt-6 flex flex-wrap items-center justify-between gap-3">
      <p className="text-meta text-ink-faint tabular-nums">
        {formatCount(first)}–{formatCount(last)} of {formatCount(total)}
      </p>

      {pages > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          {page > 1 ? (
            <Link href={href(page - 1)} rel="prev" className={buttonClass('outline', 'sm')}>
              <CaretLeft size={14} aria-hidden="true" />
              Previous
            </Link>
          ) : null}

          <Form action={action} className="flex items-center gap-1.5 text-meta text-ink-muted">
            {Object.entries(keep).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <label htmlFor="queue-page">Page</label>
            <input
              id="queue-page"
              name="page"
              type="number"
              inputMode="numeric"
              min={1}
              max={pages}
              defaultValue={page}
              key={page}
              className="h-8 w-16 rounded-control border border-rule bg-surface px-2 text-center text-meta text-ink tabular-nums outline-none focus:border-ink"
            />
            <span className="tabular-nums">of {formatCount(pages)}</span>
            {/* Enter in the box submits; the button is for screen readers, and
                shows itself when a keyboard lands on it. */}
            <button
              type="submit"
              className="sr-only focus-visible:not-sr-only focus-visible:rounded-control focus-visible:px-2 focus-visible:py-1 focus-visible:text-ink focus-visible:ring-2 focus-visible:ring-ink"
            >
              Go to page
            </button>
          </Form>

          {page < pages ? (
            <Link href={href(page + 1)} rel="next" className={buttonClass('outline', 'sm')}>
              Next
              <CaretRight size={14} aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      ) : null}
    </nav>
  )
}
