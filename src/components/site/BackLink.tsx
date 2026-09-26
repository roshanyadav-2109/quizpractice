'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ComponentProps } from 'react'

/** Whether the previous entry in this tab's history is a page of this site. */
function previousIsThisSite(): boolean {
  // The Navigation API lists only this site's entries, so it answers exactly.
  const navigation = (window as unknown as { navigation?: { canGoBack?: boolean } }).navigation
  if (typeof navigation?.canGoBack === 'boolean') return navigation.canGoBack
  // Elsewhere (Safari before 26): a client-side navigation has happened in
  // this tab, or the page was opened from one of ours.
  if (window.history.length <= 1) return false
  try {
    return Boolean(document.referrer) && new URL(document.referrer).origin === window.location.origin
  } catch {
    return false
  }
}

/**
 * A back arrow that goes back — to the page the student actually came from,
 * as the browser's own back button would — and falls back to `href` (the
 * logical parent) when there is no page of ours to return to, such as a link
 * opened from WhatsApp or a search engine.
 */
export function BackLink({ href, onClick, ...props }: ComponentProps<typeof Link> & { href: string }) {
  const router = useRouter()
  return (
    <Link
      href={href}
      {...props}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
        if (previousIsThisSite()) {
          event.preventDefault()
          router.back()
        }
      }}
    />
  )
}
