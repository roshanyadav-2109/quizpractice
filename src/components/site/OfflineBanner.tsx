'use client'

import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/**
 * A quiet notice while the connection is down. It matters most mid-paper:
 * answers keep saving on the device, and only submitting needs the network.
 */
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
  if (online) return null
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-4 z-[60] mx-auto flex w-[min(34rem,calc(100vw-2rem))] items-center gap-3 rounded-[10px] border border-rule bg-surface px-4 py-3 shadow-[0_12px_32px_-12px_rgba(12,10,9,.35)]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/art/states/offline.webp" alt="" width={44} height={44} className="shrink-0" />
      <p className="text-meta text-ink">
        <span className="font-normal">You’re offline.</span>{' '}
        <span className="font-light text-ink-muted">Your answers stay saved on this device. Submit once you’re back online.</span>
      </p>
    </div>
  )
}
