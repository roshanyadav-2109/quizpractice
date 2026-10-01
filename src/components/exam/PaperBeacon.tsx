'use client'

import { useEffect } from 'react'

/**
 * Leaves a receipt that a paper was read: after a few seconds with the page in
 * view and some scrolling, tapping or typing, it tells the server so — and at most
 * three more times, after about a minute, three minutes and ten minutes, so the
 * server hears from a reader a handful of times per paper, not continuously. A script that only downloads papers leaves none.
 * Nothing is shown. Used only for a signed-in student's full paper.
 */
export function PaperBeacon({ setId }: { setId: string }) {
  useEffect(() => {
    let events = 0
    let visibleSince = document.visibilityState === 'visible' ? Date.now() : 0
    const tick = () => {
      events += 1
    }
    const onVisibility = () => {
      visibleSince = document.visibilityState === 'visible' ? Date.now() : 0
    }
    const send = () => {
      if (events === 0 || !visibleSince || Date.now() - visibleSince < 5000) return
      const batch = events
      events = 0
      fetch('/api/receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setId, events: batch }),
        keepalive: true,
      }).catch(() => undefined)
    }
    const names = ['scroll', 'pointerdown', 'keydown', 'touchstart'] as const
    for (const name of names) window.addEventListener(name, tick, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    const later = [60_000, 180_000, 600_000].map((delay) => window.setTimeout(send, delay))
    const first = window.setTimeout(send, 6000)
    return () => {
      for (const name of names) window.removeEventListener(name, tick)
      document.removeEventListener('visibilitychange', onVisibility)
      later.forEach((timer) => window.clearTimeout(timer))
      window.clearTimeout(first)
    }
  }, [setId])

  return null
}
