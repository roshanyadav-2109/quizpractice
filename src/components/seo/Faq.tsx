import type { ReactNode } from 'react'
import { CaretDown } from '@/components/ui/icons'

export interface FaqItem {
  q: string
  a: ReactNode
}

/**
 * Questions students actually ask, answered in a sentence or two, in the
 * page itself. The answers are what an AI assistant quotes and what a
 * "People also ask" box draws from, so they state facts plainly.
 */
export function Faq({
  title = 'Frequently asked questions',
  items,
  className = '',
  variant = 'list',
}: {
  title?: string
  items: FaqItem[]
  className?: string
  /** `accordion`: each question a soft card, its answer folded under it. The answers stay in the page either way. */
  variant?: 'list' | 'accordion'
}) {
  if (items.length === 0) return null
  if (variant === 'accordion') {
    return (
      <section className={className} aria-labelledby="faq">
        <h2 id="faq" className="text-center text-[1.5rem] leading-tight font-bold text-ink sm:text-[1.875rem]">
          {title}
        </h2>
        {/* Each question its own soft card, closed until tapped; the answers stay in the page for search engines. */}
        <div className="mt-8 flex flex-col gap-3">
          {items.map((item) => (
            <details key={item.q} className="group rounded-[10px] bg-accent-soft">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 select-none [&::-webkit-details-marker]:hidden">
                <h3 className="text-[1.0625rem] leading-snug font-normal text-ink">{item.q}</h3>
                <CaretDown
                  size={20}
                  aria-hidden="true"
                  className="shrink-0 text-ink transition-transform duration-200 group-open:rotate-180"
                />
              </summary>
              <div className="px-6 pb-5 text-body leading-7 text-ink-muted [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2">{item.a}</div>
            </details>
          ))}
        </div>
      </section>
    )
  }
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
