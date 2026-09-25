import { SHELL } from '@/components/site/Page'

/**
 * Shown the moment a link is clicked, while the next page renders on the
 * server — so a click answers at once instead of seeming to do nothing.
 * Shaped like most pages: a title, a row of filters, a grid of cards.
 */
export default function Loading() {
  return (
    <div className={`${SHELL} py-6`} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div aria-hidden className="animate-pulse">
        <div className="h-3 w-56 rounded bg-surface-2" />
        <div className="mt-4 h-8 w-80 max-w-full rounded-control bg-surface-2" />
        <div className="mt-6 flex gap-2">
          <div className="h-10 w-36 rounded-control bg-surface-2" />
          <div className="h-10 w-36 rounded-control bg-surface-2" />
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-32 rounded-card border border-rule bg-surface p-4">
              <div className="h-4 w-1/2 rounded bg-surface-2" />
              <div className="mt-3 h-3 w-1/3 rounded bg-surface-2" />
              <div className="mt-8 flex justify-end">
                <div className="h-8 w-28 rounded-control bg-surface-2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
