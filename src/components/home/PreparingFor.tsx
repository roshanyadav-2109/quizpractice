'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Art } from '@/components/ui/Art'
import { buttonClass } from '@/components/ui/primitives'
import { ArrowRight, CaretRight } from '@/components/ui/icons'

export interface StageSubject {
  slug: string
  name: string
  href: string
  icon: string | null
}

export interface Stage {
  slug: string
  name: string
  /** Where "Explore" goes: the stage in the subject browser, or its papers. */
  href: string
  icon: string | null
  subjects: StageSubject[]
}

export interface Branch {
  slug: string
  label: string
  icon: string | null
  stages: Stage[]
}

/**
 * "What are you preparing for?" — the branches as tabs, the chosen one opening
 * onto a panel of its stages: Qualifier and Foundation as large cards, the
 * diplomas and the degree levels after them, each listing its subjects.
 */
export function PreparingFor({ branches }: { branches: Branch[] }) {
  const [slug, setSlug] = useState(branches[0]?.slug ?? '')
  const branch = branches.find((b) => b.slug === slug) ?? branches[0]
  if (!branch) return null

  const [first, second, ...rest] = branch.stages
  const large = [first, second].filter((stage): stage is Stage => Boolean(stage))

  return (
    <div>
      {/* The tabs, tops aligned. The chosen one is taller and runs down into
          the panel; the others stop short of it, so their borders never sit
          on the panel's. */}
      <div role="tablist" aria-label="Branch" className="relative z-10 flex flex-wrap items-start gap-3">
        {branches.map((b) => {
          const active = b.slug === branch.slug
          return (
            <button
              key={b.slug}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls="branch-panel"
              onClick={() => setSlug(b.slug)}
              className={`flex min-w-[15rem] items-center justify-between gap-4 rounded-card border border-rule px-5 text-left transition-colors ${
                active
                  ? '-mb-px rounded-b-none border-b-transparent bg-surface-2 pt-4 pb-7 text-ink'
                  : 'bg-surface py-4 text-ink-muted hover:border-rule-strong hover:text-ink'
              }`}
            >
              <span className="text-card leading-snug">{b.label}</span>
              <Art src={b.icon} size={48} />
            </button>
          )
        })}
      </div>

      <div
        id="branch-panel"
        role="tabpanel"
        aria-label={branch.label}
        // Square only where the first tab flows straight down into it.
        className={`rounded-card border border-rule bg-surface-2 p-4 sm:p-6 ${
          branches[0]?.slug === branch.slug ? 'rounded-tl-none' : ''
        }`}
      >
        {large.length > 0 ? (
          <div className={`grid gap-4 ${large.length > 1 ? 'lg:grid-cols-2' : ''}`}>
            {large.map((stage) => (
              <StageCard key={stage.slug} stage={stage} large wide={large.length === 1} />
            ))}
          </div>
        ) : null}
        {rest.length > 0 ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {rest.map((stage) => (
              <StageCard key={stage.slug} stage={stage} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function StageCard({
  stage,
  large = false,
  wide = false,
}: {
  stage: Stage
  large?: boolean
  /** The only large card in its row, with the width to use. */
  wide?: boolean
}) {
  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-card bg-surface p-5">
      <div className="flex items-center gap-3">
        <Art src={stage.icon} size={large ? 64 : 52} />
        <h3 className={`${large ? 'text-section' : 'text-card'} leading-tight font-medium text-ink`}>{stage.name}</h3>
      </div>

      <ul className={`mt-4 flex flex-wrap gap-2 ${large ? (wide ? 'max-w-2xl pr-2' : 'max-w-[28rem] pr-2') : ''}`}>
        {stage.subjects.map((subject) => (
          <li key={subject.slug} className="max-w-full">
            <Link
              href={subject.href}
              className="inline-flex max-w-full rounded-control border border-rule px-2.5 py-1 text-meta leading-snug text-ink-muted transition-colors hover:border-rule-strong hover:text-ink"
            >
              {subject.name}
            </Link>
          </li>
        ))}
      </ul>

      {large ? (
        <>
          <div className="mt-auto pt-6">
            <Link href={stage.href} className={buttonClass('primary', 'md')}>
              Explore {stage.name}
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
          {/* Three of the stage's own subjects, as its picture. */}
          <div aria-hidden className="pointer-events-none absolute right-4 bottom-4 hidden items-end sm:flex">
            {stage.subjects.slice(0, 3).map((subject, i) => (
              <span key={subject.slug} className={i > 0 ? '-ml-3' : ''} style={{ transform: `translateY(${i % 2 ? -10 : 0}px)` }}>
                <Art src={subject.icon} size={64} />
              </span>
            ))}
          </div>
        </>
      ) : (
        <Link
          href={stage.href}
          className="mt-auto flex items-center gap-1 pt-5 text-meta text-ink underline-offset-4 hover:underline"
        >
          Explore
          <CaretRight size={13} aria-hidden="true" />
        </Link>
      )}
    </article>
  )
}
