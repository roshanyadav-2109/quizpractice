import { Suspense } from 'react'
import { getSpotlights, type SpotlightContext } from '@/lib/spotlight'
import { SpotlightCarousel } from './SpotlightCarousel'

type Props = SpotlightContext & { className?: string }

/**
 * Wider than the page's column: 90% of the screen, centred on the column —
 * but never narrower than the column, so phones and wide pages keep theirs.
 */
const WIDE = 'w-[max(100%,90vw)] ml-[calc((100%_-_max(100%,90vw))/2)]'

/**
 * The page's banners. Streams in after the page itself, so a student's own
 * figures never hold up the first paint; a placeholder of the same height
 * keeps the layout from jumping when it lands.
 */
export function Spotlight(props: Props) {
  return (
    <Suspense
      fallback={
        <div aria-hidden="true" className={`${WIDE} ${props.className ?? ''}`}>
          <div className="h-[13.5rem] animate-pulse rounded-[12px] bg-surface-2" />
        </div>
      }
    >
      <Banners {...props} />
    </Suspense>
  )
}

async function Banners({ className, ...context }: Props) {
  const items = await getSpotlights(context)
  if (items.length === 0) return null
  return (
    <div className={`${WIDE} ${className ?? ''}`}>
      <SpotlightCarousel items={items} />
    </div>
  )
}
