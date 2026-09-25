/**
 * The exam screen's outline — header, question, palette, action bar — shown
 * the moment the paper is opened, while the questions load.
 */
export default function Loading() {
  return (
    <div className="flex h-dvh flex-col bg-surface" aria-busy="true" aria-live="polite">
      <span className="sr-only">Opening the paper…</span>
      <div aria-hidden className="flex h-16 shrink-0 animate-pulse items-center gap-3 border-b border-rule px-5">
        <div className="h-9 w-9 rounded-control bg-surface-2" />
        <div>
          <div className="h-3.5 w-56 rounded bg-surface-2" />
          <div className="mt-2 h-3 w-28 rounded bg-surface-2" />
        </div>
      </div>
      <div aria-hidden className="flex min-h-0 flex-1 animate-pulse">
        <div className="mx-auto w-full max-w-4xl px-8 py-6">
          <div className="h-5 w-40 rounded bg-surface-2" />
          <div className="mt-6 h-4 w-11/12 rounded bg-surface-2" />
          <div className="mt-2.5 h-4 w-3/4 rounded bg-surface-2" />
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="mt-3 h-12 rounded-control bg-surface-2" />
          ))}
        </div>
        <div className="hidden w-[21.25rem] shrink-0 border-l border-rule px-5 py-5 lg:block">
          <div className="h-3 w-28 rounded bg-surface-2" />
          <div className="mt-3 grid grid-cols-5 gap-2">
            {Array.from({ length: 20 }, (_, i) => (
              <div key={i} className="aspect-square rounded-control bg-surface-2" />
            ))}
          </div>
        </div>
      </div>
      <div aria-hidden className="h-16 shrink-0 border-t border-rule" />
    </div>
  )
}
