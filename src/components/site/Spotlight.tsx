import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { getSpotlights, type SpotlightContext } from '@/lib/spotlight'
import { HIDDEN_COOKIE } from '@/lib/spotlight-shared'
import { SpotlightCarousel } from './SpotlightCarousel'

type Props = SpotlightContext & { className?: string }

/**
 * The page's banners. Streams in after the page itself, so a student's own
 * figures never hold up the first paint; a placeholder of the same height
 * keeps the layout from jumping when it lands.
 */
export function Spotlight(props: Props) {
  return (
    <Suspense
      fallback={
        <div aria-hidden="true" className={props.className}>
          <div className="h-[13.5rem] animate-pulse rounded-[12px] bg-surface-2" />
        </div>
      }
    >
      <Banners {...props} />
    </Suspense>
  )
}

async function Banners({ className, ...context }: Props) {
  const [items, jar] = await Promise.all([getSpotlights(context), cookies()])
  const hidden = new Set((jar.get(HIDDEN_COOKIE)?.value ?? '').split('.'))
  const shown = items.filter((item) => !hidden.has(item.id))
  if (shown.length === 0) return null
  return (
    <div className={className}>
      <SpotlightCarousel items={shown} />
    </div>
  )
}
