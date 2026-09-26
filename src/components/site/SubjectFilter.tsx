'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Art } from '@/components/ui/Art'
import { CaretDown, MagnifyingGlass, X } from '@/components/ui/icons'

export interface SubjectChoice {
  slug: string
  name: string
  code: string | null
  /** Papers under the other filters in force. */
  count: number
  /** Students who practised it this week, when three or more did. */
  active?: number
  icon: string | null
}

export interface SubjectGroup {
  key: string
  title: string
  subjects: SubjectChoice[]
}

/**
 * The subject filter: too many subjects for a dropdown, so the button opens a
 * panel from the side with every subject of the branch in force, grouped by
 * level, a search box to find one by name or course code, and how many papers
 * each has under the other filters. Choosing one rewrites `subject` in the URL.
 */
export function SubjectFilter({ groups, value, scope }: { groups: SubjectGroup[]; value: string | null; scope: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  const selected = groups.flatMap((group) => group.subjects).find((subject) => subject.slug === value) ?? null

  function close() {
    setOpen(false)
    trigger.current?.focus()
  }

  function choose(slug: string | null) {
    const query = new URLSearchParams(params.toString())
    if (slug) query.set('subject', slug)
    else query.delete('subject')
    query.delete('page')
    const suffix = query.toString()
    router.push(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false })
    setOpen(false)
  }

  // While open: Escape closes, the page behind does not scroll, and the search
  // box has the focus so a subject can be typed straight away.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    input.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [open])

  const needle = search.trim().toLowerCase()
  const shown = groups
    .map((group) => ({
      ...group,
      subjects: group.subjects.filter(
        (subject) =>
          !needle || subject.name.toLowerCase().includes(needle) || subject.code?.toLowerCase().includes(needle),
      ),
    }))
    .filter((group) => group.subjects.length > 0)

  const row = 'flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left transition-colors'

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`inline-flex h-11 min-w-[9.375rem] items-center justify-between gap-3 rounded-control border pr-3.5 pl-4 text-ui text-ink transition-colors outline-none focus-visible:border-ink ${
          selected ? 'border-ink bg-surface' : 'border-transparent bg-surface-2 hover:bg-surface-3'
        }`}
      >
        <span className="max-w-[16rem] truncate">{selected?.name ?? 'All subjects'}</span>
        <CaretDown size={16} aria-hidden="true" className="shrink-0 text-ink-muted" />
      </button>

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose a subject"
        inert={!open}
        className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label="Close"
          onClick={close}
          className={`absolute inset-0 bg-ink/30 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
        />
        <aside
          className={`absolute inset-y-0 right-0 flex w-full max-w-[26rem] flex-col border-l border-rule bg-surface transition-transform duration-200 ease-out motion-reduce:transition-none ${
            open ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex items-start justify-between gap-3 border-b border-rule px-5 pt-5 pb-4">
            <div>
              <h2 className="text-card text-ink">Subject</h2>
              <p className="mt-0.5 text-meta font-light text-ink-faint">{scope}</p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="border-b border-rule px-5 py-3">
            <label className="relative block">
              <span className="sr-only">Search subjects</span>
              <MagnifyingGlass
                size={18}
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-faint"
              />
              <input
                ref={input}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search a subject or course code"
                className="h-11 w-full rounded-control border border-rule bg-surface-2 pr-3 pl-10 text-ui text-ink transition-colors placeholder:text-ink-faint focus:border-ink focus:bg-surface focus:outline-none"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
            {!needle ? (
              <button
                type="button"
                onClick={() => choose(null)}
                aria-current={!selected}
                className={`${row} mt-2 ${!selected ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-surface-2'}`}
              >
                <span className="flex-1 text-ui">All subjects</span>
              </button>
            ) : null}

            {shown.map((group) => (
              <section key={group.key} className="mt-3">
                <h3 className="sticky top-0 z-10 bg-surface px-3 py-2 text-meta text-ink-faint">{group.title}</h3>
                <ul>
                  {group.subjects.map((subject) => {
                    const active = subject.slug === selected?.slug
                    return (
                      <li key={subject.slug}>
                        <button
                          type="button"
                          onClick={() => choose(subject.slug)}
                          aria-current={active}
                          className={`${row} ${
                            active ? 'bg-accent-soft' : 'hover:bg-surface-2'
                          } ${subject.count === 0 && !active ? 'opacity-50' : ''}`}
                        >
                          <Art src={subject.icon} size={28} />
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-ui ${active ? 'text-accent' : 'text-ink'}`}>
                              {subject.name}
                            </span>
                            <span className="flex flex-wrap items-center gap-x-2 text-[0.75rem] font-light text-ink-faint">
                              {subject.code ? <span>{subject.code}</span> : null}
                              {subject.active ? (
                                <span className="inline-flex items-center gap-1 tabular-nums">
                                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-correct" />
                                  {subject.active} this week
                                </span>
                              ) : null}
                            </span>
                          </span>
                          <span className="shrink-0 text-meta text-ink-faint tabular-nums">
                            {subject.count} {subject.count === 1 ? 'paper' : 'papers'}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}

            {needle && shown.length === 0 ? (
              <p className="px-3 py-8 text-center text-ui font-light text-ink-faint">
                No subject matches “{search.trim()}”.
              </p>
            ) : null}
          </div>
        </aside>
      </div>
    </>
  )
}
