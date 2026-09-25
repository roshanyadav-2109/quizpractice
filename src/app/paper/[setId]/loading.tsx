import { SHELL } from '@/components/site/Page'

/** The instructions page's own outline, so "Start paper" answers at once. */
export default function Loading() {
  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-surface-2" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading the instructions…</span>
      <div aria-hidden className={`${SHELL} grid animate-pulse items-start gap-4 py-5 lg:grid-cols-[minmax(0,1fr)_20rem]`}>
        <div className="min-w-0">
          <div className="rounded-card bg-surface px-6 py-5">
            <div className="h-5 w-72 max-w-full rounded bg-surface-2" />
            <div className="mt-2 h-3 w-32 rounded bg-surface-2" />
            <div className="mt-5 h-7 w-96 max-w-full rounded bg-surface-2" />
          </div>
          <div className="mt-4 rounded-card bg-surface px-6 py-6">
            <div className="h-5 w-80 max-w-full rounded bg-surface-2" />
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="mt-4 h-3.5 rounded bg-surface-2" style={{ width: `${90 - (i % 3) * 15}%` }} />
            ))}
          </div>
        </div>
        <div className="rounded-card bg-surface p-5">
          <div className="h-3 w-20 rounded bg-surface-2" />
          <div className="mt-2 h-4 w-32 rounded bg-surface-2" />
          <div className="mt-6 h-11 rounded-control bg-surface-2" />
          <div className="mt-2 h-11 rounded-control bg-surface-2" />
        </div>
      </div>
    </div>
  )
}
