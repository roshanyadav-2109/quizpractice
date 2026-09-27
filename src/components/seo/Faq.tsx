import type { ReactNode } from 'react'

export interface FaqItem {
  q: string
  a: ReactNode
}

/**
 * Questions students actually ask, answered in a sentence or two, in the
 * page itself. The answers are what an AI assistant quotes and what a
 * "People also ask" box draws from, so they state facts plainly.
 */
export function Faq({ title = 'Frequently asked questions', items, className = '' }: { title?: string; items: FaqItem[]; className?: string }) {
  if (items.length === 0) return null
  return (
    <section className={className} aria-labelledby="faq">
      <h2 id="faq" className="text-[1.375rem] leading-tight font-medium text-ink">
        {title}
      </h2>
      <div className="mt-4 divide-y divide-rule rounded-card border border-rule bg-surface">
        {items.map((item) => (
          <div key={item.q} className="px-5 py-4">
            <h3 className="text-ui font-medium text-ink">{item.q}</h3>
            <div className="mt-1.5 max-w-[72ch] text-ui leading-relaxed text-ink-muted [&_a]:underline [&_a]:underline-offset-2">
              {item.a}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
