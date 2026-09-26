'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CaretRight, MagnifyingGlass } from '@/components/ui/icons'
import { Art } from '@/components/ui/Art'
import { Badge } from '@/components/ui/primitives'
import { SelectBox } from '@/components/site/FilterSelect'
import { NavList, Panel, TitleCard, TwoPane } from '@/components/site/Page'
import { artFor } from '@/lib/art'
import { EmptyState } from '@/components/ui/EmptyState'

export interface FinderSubject {
  id: string
  slug: string
  /** Where the tile goes, when not the subject page itself. */
  href?: string
  name: string
  code: string | null
  aliases: string[]
  hasProgramming: boolean
  paperCount: number
  questionCount: number
}

export interface FinderLevel {
  id: string
  slug: string
  name: string
  /** The qualifier stage: its subjects also sit in their own level, so search skips it. */
  virtual?: boolean
  subjects: FinderSubject[]
}

export interface FinderProgram {
  id: string
  slug: string
  name: string
  shortName: string | null
  levels: FinderLevel[]
}

/** macOS shows ⌘K; everything else Ctrl K. The server renders ⌘ and the
 *  client corrects it, without an effect or a hydration mismatch. */
const noop = () => () => {}
function useIsMac(): boolean {
  return useSyncExternalStore(
    noop,
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => true,
  )
}

/**
 * The catalogue, laid out like every other page: a title card with the search
 * field in it, then the levels of the chosen programme on the left and that
 * level's subjects on the right.
 *
 * Typing searches subjects across every programme at once — you rarely know
 * which programme a course code sits in — and matches aliases, because
 * students say "Maths1" long before "Mathematics for Data Science I". Enter
 * hands the same words to full-text search inside the questions.
 */
export function SubjectFinder({
  programs,
  initialProgram,
  initialLevel,
}: {
  programs: FinderProgram[]
  initialProgram: string
  initialLevel: string
}) {
  const router = useRouter()
  const isMac = useIsMac()
  const input = useRef<HTMLInputElement>(null)
  const [programSlug, setProgramSlug] = useState(initialProgram)
  const [levelSlug, setLevelSlug] = useState(initialLevel)
  const [query, setQuery] = useState('')

  const term = query.trim().toLowerCase()
  const searching = term.length > 0

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        input.current?.focus()
        input.current?.select()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const program = programs.find((p) => p.slug === programSlug) ?? programs[0]
  const levels = (program?.levels ?? []).filter((level) => level.subjects.length > 0)
  const level = levels.find((l) => l.slug === levelSlug) ?? levels[0]

  /** Keep the selection in the URL — reloadable and linkable, no round trip. */
  function remember(nextProgram: string, nextLevel: string) {
    const params = new URLSearchParams()
    if (nextProgram !== programs[0]?.slug) params.set('program', nextProgram)
    if (nextLevel) params.set('level', nextLevel)
    const suffix = params.toString()
    window.history.replaceState(null, '', suffix ? `/subjects?${suffix}` : '/subjects')
  }

  function chooseProgram(slug: string) {
    const levelsOf = programs.find((p) => p.slug === slug)?.levels ?? []
    // Land on the first real level, not the qualifier stage listed before it.
    const first =
      levelsOf.find((l) => l.subjects.length > 0 && !l.virtual) ?? levelsOf.find((l) => l.subjects.length > 0)
    setProgramSlug(slug)
    setLevelSlug(first?.slug ?? '')
    remember(slug, '')
  }

  function chooseLevel(slug: string) {
    setLevelSlug(slug)
    remember(program?.slug ?? '', slug)
  }

  const matches = useMemo(() => {
    if (!searching) return []
    return programs.flatMap((p) =>
      p.levels.filter((l) => !l.virtual).flatMap((l) =>
        l.subjects
          .filter((subject) =>
            [subject.name, subject.code ?? '', ...subject.aliases]
              .join(' ')
              .toLowerCase()
              .includes(term),
          )
          .map((subject) => ({ subject, context: `${p.shortName ?? p.name} · ${l.name}` })),
      ),
    )
  }, [programs, searching, term])

  const toSearch = () => router.push(`/search?q=${encodeURIComponent(query.trim())}`)

  return (
    <>
      <TitleCard title="Previous year papers">
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault()
            if (term) toSearch()
          }}
          className="relative mt-4"
        >
          <MagnifyingGlass
            size={20}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-faint"
          />
          <input
            ref={input}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search subjects, course codes or questions…"
            aria-label="Search subjects, course codes or questions"
            spellCheck={false}
            autoComplete="off"
            className="h-13 w-full rounded-control border border-rule bg-surface-2 pr-20 pl-12 text-body text-ink transition-colors placeholder:text-ink-faint hover:border-rule-strong focus:border-ink focus:bg-surface focus:outline-none"
          />
          <kbd className="pointer-events-none absolute top-1/2 right-4 hidden -translate-y-1/2 rounded-md border border-rule bg-surface px-2 py-0.5 font-sans text-meta text-ink-muted sm:block">
            {isMac ? '⌘K' : 'Ctrl K'}
          </kbd>
        </form>

        <div className="mt-3 flex flex-wrap gap-2">
          <SelectBox
            label="Branch"
            value={program?.slug ?? ''}
            onChange={(slug) => {
              setQuery('')
              chooseProgram(slug)
            }}
            options={programs.map((p) => ({ value: p.slug, label: p.name }))}
          />
        </div>
      </TitleCard>

      {searching ? (
        <div className="mt-4">
          <Panel
            title={`Subjects matching “${query.trim()}”`}
            action={
              <button type="button" onClick={toSearch} className="text-meta text-accent hover:underline">
                Search inside the questions
              </button>
            }
          >
            {matches.length > 0 ? (
              <ul className="grid gap-3 md:grid-cols-2">
                {matches.map(({ subject, context }) => (
                  <li key={subject.id}>
                    <SubjectRow subject={subject} context={context} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-8 text-center text-ui text-ink-muted">
                No subject matches. Press Enter to look inside the questions instead.
              </p>
            )}
          </Panel>
        </div>
      ) : (
        <TwoPane
          nav={
            <NavList
              title="Levels"
              items={levels.map((l) => ({
                key: l.id,
                label: l.name,
                active: l.slug === level?.slug,
                onSelect: () => chooseLevel(l.slug),
              }))}
            />
          }
        >
          {level ? (
            <Panel title={level.name}>
              <ul className="grid gap-3 md:grid-cols-2">
                {level.subjects.map((subject) => (
                  <li key={subject.id}>
                    <SubjectRow subject={subject} />
                  </li>
                ))}
              </ul>
            </Panel>
          ) : (
            <Panel>
              <EmptyState framed={false} art="coming-soon" title={`No papers in ${program?.name ?? 'this programme'} yet`}>
                Past papers appear here as soon as they are added.
              </EmptyState>
            </Panel>
          )}
        </TwoPane>
      )}
    </>
  )
}

/**
 * One subject as a row card: the icon, the full name (wrapped, never cut —
 * two subjects often differ only in their last word), and what is in it.
 */
function SubjectRow({ subject, context }: { subject: FinderSubject; context?: string }) {
  return (
    <Link
      href={subject.href ?? `/subject/${subject.slug}`}
      className="group flex h-full items-center gap-3.5 rounded-card border border-rule bg-surface p-3.5 transition-colors hover:border-rule-strong"
    >
      <Art src={artFor('subjects', subject.slug)} size={52} />
      <span className="min-w-0 flex-1">
        <span className="block text-[1.0625rem] leading-snug text-ink">{subject.name}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-ink-faint tabular-nums">
          {subject.code ? <span>{subject.code}</span> : null}
          {subject.hasProgramming ? <Badge>Programming</Badge> : null}
        </span>
        {context ? <span className="mt-0.5 block text-meta text-ink-faint">{context}</span> : null}
      </span>
      <CaretRight
        size={16}
        aria-hidden="true"
        className="shrink-0 text-ink-faint transition-transform duration-150 group-hover:translate-x-[3px] group-hover:text-ink"
      />
    </Link>
  )
}
