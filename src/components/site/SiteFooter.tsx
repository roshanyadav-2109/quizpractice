import Link from 'next/link'
import { SHELL } from '@/components/site/Page'

/**
 * The foot of every page: a thin rule and the two policies, nothing else. The
 * navigation lives in the header; a footer that repeats it is one more thing
 * to keep in step.
 *
 * The links are not decoration. Google's YouTube API audit checks that the
 * privacy policy and terms of service are reachable from the site that
 * uploads, so they sit on every page that has chrome.
 */
export function SiteFooter() {
  const link = 'transition-colors hover:text-ink'

  return (
    <footer className="border-t border-rule bg-surface">
      <nav aria-label="Policies" className={`${SHELL} flex items-center gap-2 py-4 text-meta text-ink-muted`}>
        <Link href="/privacy" className={link}>
          Privacy
        </Link>
        <span aria-hidden="true" className="text-ink-faint">
          ·
        </span>
        <Link href="/terms" className={link}>
          Terms
        </Link>
      </nav>
    </footer>
  )
}
