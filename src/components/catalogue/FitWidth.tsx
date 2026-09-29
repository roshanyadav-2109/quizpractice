'use client'

import { useLayoutEffect, useRef, type ReactNode } from 'react'

/**
 * A table that is zoomed out to fit its column rather than scrolled sideways:
 * on a phone the whole table shows at once, and a pinch brings it close. It
 * zooms only when it has to; where the table fits, nothing changes. Before the
 * script runs the table scrolls in its box, as it always did.
 */
export function FitWidth({ children, className = '' }: { children: ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const element = box.current
    const inner = element?.firstElementChild as HTMLElement | null
    if (!element || !inner) return
    let width = 0
    const fit = () => {
      // Only the box's width decides the zoom; its height changes with it.
      if (element.clientWidth === width) return
      width = element.clientWidth
      inner.style.zoom = ''
      // The box's own scroll width: it counts text spilling out of a cell too.
      const need = element.scrollWidth
      inner.style.zoom = need > width + 1 ? String(width / need) : ''
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={box} className={`relative overflow-x-auto ${className}`}>
      {children}
    </div>
  )
}
