import Link from 'next/link'
import { EmptyState } from '@/components/ui/EmptyState'
import { buttonClass } from '@/components/ui/primitives'

/**
 * What a phone sees instead of the studio. The question, the board and the
 * recorder need at least a tablet's width: 768 px and up gets the studio,
 * stacked (question above the board) until 1024 px, side by side beyond.
 * Pure CSS, so nothing flashes before the layout is known.
 */
export function MinWidthNotice({ backHref }: { backHref: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-6 md:hidden">
      <EmptyState
        art="welcome"
        title="The studio needs a wider screen"
        actions={
          <Link href={backHref} className={buttonClass('primary', 'md')}>
            Back to the queue
          </Link>
        }
      >
        Writing and recording explanations needs a screen at least 768 pixels wide: a laptop, a desktop or a tablet.
        On an iPad, landscape puts the question beside the board; portrait stacks it above.
      </EmptyState>
    </div>
  )
}
