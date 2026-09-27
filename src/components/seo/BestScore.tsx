'use client'

import Link from 'next/link'
import { useViewer } from '@/components/site/Viewer'

/**
 * "Best 8/10 · 80%" beside a paper the signed-in student has sat, linking to
 * that attempt's analysis. Nothing for anyone else — the page around it is
 * the same for every visitor and is filled in only here, in the browser.
 */
export function BestScore({ setId, className = '' }: { setId: string; className?: string }) {
  const best = useViewer().best[setId]
  if (!best) return null
  return (
    <Link
      href={`/result/${best.attemptId}`}
      className={`text-meta whitespace-nowrap text-ink-muted tabular-nums transition-colors hover:text-ink ${className}`}
    >
      Best <span className="text-ink">{best.score}/{best.maxScore}</span>
      <span className="text-ink-faint"> · {best.percentage}%</span>
    </Link>
  )
}
