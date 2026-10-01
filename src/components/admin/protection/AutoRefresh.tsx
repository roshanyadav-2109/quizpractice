'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

/** Reloads the page's data every few seconds, so the dashboard is live. */
export function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter()
  const [on, setOn] = useState(true)
  const [at, setAt] = useState<string>('')

  useEffect(() => {
    if (!on) return
    const timer = window.setInterval(() => {
      router.refresh()
      setAt(new Date().toLocaleTimeString('en-GB'))
    }, seconds * 1000)
    return () => window.clearInterval(timer)
  }, [on, seconds, router])

  return (
    <button
      type="button"
      onClick={() => setOn((value) => !value)}
      className="inline-flex items-center gap-1.5 rounded-full border border-rule px-2.5 py-1 text-xs text-ink-muted hover:border-rule-strong hover:text-ink"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-correct' : 'bg-ink-faint'}`} />
      {on ? `Live · every ${seconds}s` : 'Paused'}
      {at ? <span className="text-ink-faint">· {at}</span> : null}
    </button>
  )
}
