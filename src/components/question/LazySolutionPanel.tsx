'use client'

import { Suspense, use } from 'react'
import type { SolutionRow } from '@/types/db'
import { SolutionPanel } from './SolutionPanel'

/** Each question's explanations, fetched at most once per tab. */
const loaded = new Map<string, Promise<SolutionRow[] | null>>()

function load(questionId: string): Promise<SolutionRow[] | null> {
  let request = loaded.get(questionId)
  if (!request) {
    request = fetch(`/api/solutions/${questionId}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((body: { solutions: SolutionRow[] }) => body.solutions)
      .catch(() => {
        // Forget the failure, so opening the question again tries again.
        loaded.delete(questionId)
        return null
      })
    loaded.set(questionId, request)
  }
  return request
}

/**
 * A question's explanations, loaded only once its answer is opened — a paper
 * of sixteen questions no longer brings sixteen explanations with it.
 */
export function LazySolutionPanel({ questionId }: { questionId: string }) {
  return (
    <Suspense
      fallback={<div aria-label="Loading the explanation" className="h-24 animate-pulse rounded-card bg-surface-2" />}
    >
      <Solutions questionId={questionId} />
    </Suspense>
  )
}

function Solutions({ questionId }: { questionId: string }) {
  const solutions = use(load(questionId))
  if (solutions === null) {
    return (
      <p className="text-ui text-ink-muted">
        The explanation could not be loaded. Check your connection, then open the question again.
      </p>
    )
  }
  return <SolutionPanel solutions={solutions} />
}
