'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CaretDown, CaretRight, List, X } from '@/components/ui/icons'
import { Art } from '@/components/ui/Art'

export interface MenuLink {
  href: string
  title: string
  caption?: string | null
  /** Its icon, when one has been made. */
  icon?: string | null
}

/** A run of links under one heading. Compact groups are short values, such as years. */
export interface MenuGroup {
  heading?: string
  links: MenuLink[]
  compact?: boolean
}

/** One entry down the left of a panel: a level of a programme, or an exam. */
export interface MenuColumn {
  key: string
  name: string
  /** Shown beside the name in the left-hand list, when given. */
  icon?: string | null
  /** The qualifier stage: listed first, but the menu opens on the next. */
  virtual?: boolean
  groups: MenuGroup[]
  more?: { href: string; label: string }
}

/** One item in the bar: a programme, or the exams. */
export interface MenuItem {
  key: string
  label: string
  columns: MenuColumn[]
}

/**
 * The catalogue as the navigation: each item opens a panel with its levels —
 * or its exams — down the left, and what sits under the one pointed at on the
 * right, so any subject or any exam is two moves from any page.
 *
 * Opens on hover for a mouse, on click or Enter for everyone else, and closes
 * on Escape, on leaving the header, or on following a link.
 */
export function MegaNav({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState<string | null>(null)
  const [column, setColumn] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function show(key: string) {
    const item = items.find((entry) => entry.key === key)
    setOpen(key)
    setColumn((item?.columns.find((entry) => !entry.virtual) ?? item?.columns[0])?.key ?? null)
  }

  function close() {
    setOpen(null)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null)
    }
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  const item = items.find((entry) => entry.key === open) ?? null
  const current = item?.columns.find((entry) => entry.key === column) ?? item?.columns[0] ?? null

  return (
    <div
      ref={root}
      className="hidden h-full items-stretch lg:flex"
      onMouseLeave={() => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current)
        hoverTimer.current = setTimeout(close, 180)
      }}
      onMouseEnter={() => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current)
      }}
    >
      <nav aria-label="Catalogue" className="flex items-stretch gap-1">
        {items.map((entry) => {
          const expanded = open === entry.key
          return (
            <button
              key={entry.key}
              type="button"
              aria-expanded={expanded}
              aria-controls="mega-panel"
              onClick={() => (expanded ? close() : show(entry.key))}
              onMouseEnter={() => {
                if (hoverTimer.current) clearTimeout(hoverTimer.current)
                hoverTimer.current = setTimeout(() => show(entry.key), open ? 0 : 120)
              }}
              className={`relative flex items-center gap-1 px-3 text-ui transition-colors ${
                expanded ? 'text-ink' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {entry.label}
              <CaretDown
                size={13}
                aria-hidden="true"
                className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
              />
              {expanded ? (
                <span aria-hidden className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-ink" />
              ) : null}
            </button>
          )
        })}
      </nav>

      {item ? (
        // The page behind dims, so the panel reads as a layer over it rather
        // than as more page; a click on the dimmed part closes it.
        <div
          aria-hidden
          onClick={close}
          onMouseEnter={() => {
            // The backdrop sits inside the hover area, so reaching it has to
            // count as leaving the menu.
            if (hoverTimer.current) clearTimeout(hoverTimer.current)
            hoverTimer.current = setTimeout(close, 180)
          }}
          className="fixed inset-x-0 top-16 bottom-0 z-40 bg-ink/25"
        />
      ) : null}

      {item ? (
        <div
          id="mega-panel"
          className="absolute inset-x-0 top-16 z-50 border-b border-rule bg-surface"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('a')) close()
          }}
        >
          <div className="mx-auto grid max-h-[70vh] w-full max-w-[85rem] grid-cols-[17.5rem_minmax(0,1fr)] gap-6 overflow-y-auto px-8 py-6">
            <ul className="flex flex-col gap-1 border-r border-rule pr-6">
              {item.columns.map((entry) => {
                const active = entry.key === current?.key
                return (
                  <li key={entry.key}>
                    <button
                      type="button"
                      onClick={() => setColumn(entry.key)}
                      onMouseEnter={() => setColumn(entry.key)}
                      onFocus={() => setColumn(entry.key)}
                      aria-pressed={active}
                      className={`flex w-full items-center justify-between gap-3 rounded-control px-3.5 py-3 text-left text-ui transition-colors ${
                        active ? 'bg-surface-2 text-ink' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        {entry.icon !== undefined ? <Art src={entry.icon} size={32} /> : null}
                        {entry.name}
                      </span>
                      <CaretRight size={14} aria-hidden="true" className="shrink-0" />
                    </button>
                  </li>
                )
              })}
            </ul>

            <div className="min-w-0">
              {current ? (
                <>
                  {current.groups.map((group, index) => (
                    <div key={group.heading ?? index} className={index > 0 ? 'mt-6' : ''}>
                      {group.heading ? <p className="label mb-3">{group.heading}</p> : null}
                      {group.compact ? (
                        <ul className="flex flex-wrap gap-2">
                          {group.links.map((link) => (
                            <li key={link.href}>
                              <Link
                                href={link.href}
                                className="inline-flex h-10 items-center rounded-control border border-rule px-4 text-ui text-ink tabular-nums transition-colors hover:border-rule-strong"
                              >
                                {link.title}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {group.links.map((link) => (
                            <li key={link.href}>
                              <Link
                                href={link.href}
                                className="group flex h-full items-center gap-3 rounded-card border border-rule p-3.5 transition-colors hover:border-rule-strong"
                              >
                                <Art src={link.icon ?? null} size={44} />
                                <span className="min-w-0">
                                  <span className="block text-ui leading-snug text-ink">{link.title}</span>
                                  {link.caption ? (
                                    <span className="block text-meta text-ink-faint">{link.caption}</span>
                                  ) : null}
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                  {current.more ? (
                    <Link
                      href={current.more.href}
                      className="mt-5 inline-flex items-center gap-1.5 text-meta text-accent hover:underline"
                    >
                      {current.more.label}
                      <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Below `lg`: one button, one panel. Items open into their levels or exams,
 * and those into their links — the same tree, folded for a thumb.
 */
export function MobileMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const row = 'flex min-h-12 w-full items-center justify-between gap-3 rounded-control px-3 text-left text-body'

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? 'Close menu' : 'Open menu'}
        className="flex h-11 w-11 items-center justify-center rounded-control border border-rule bg-surface text-ink"
      >
        {open ? <X size={18} /> : <List size={18} />}
      </button>

      {open ? (
        <nav
          id="mobile-menu"
          aria-label="Primary"
          className="absolute inset-x-0 top-16 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-rule bg-surface px-3 pt-2 pb-4"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('a')) setOpen(false)
          }}
        >
          <ul className="flex flex-col">
            {items.map((entry) => (
              <li key={entry.key}>
                <button
                  type="button"
                  onClick={() => setExpanded(expanded === entry.key ? null : entry.key)}
                  aria-expanded={expanded === entry.key}
                  className={`${row} text-ink`}
                >
                  {entry.label}
                  <CaretDown
                    size={16}
                    aria-hidden="true"
                    className={`shrink-0 text-ink-faint transition-transform ${
                      expanded === entry.key ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {expanded === entry.key ? (
                  <div className="mb-2 ml-3 border-l border-rule pl-3">
                    {entry.columns.map((column) => (
                      <div key={column.key} className="py-1">
                        <p className="label px-3 py-2">{column.name}</p>
                        {column.groups.map((group, index) =>
                          group.compact ? (
                            <ul key={group.heading ?? index} className="flex flex-wrap gap-2 px-3 py-1.5">
                              {group.links.map((link) => (
                                <li key={link.href}>
                                  <Link
                                    href={link.href}
                                    className="inline-flex h-10 items-center rounded-control border border-rule px-4 text-ui text-ink tabular-nums"
                                  >
                                    {link.title}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <ul key={group.heading ?? index}>
                              {group.links.map((link) => (
                                <li key={link.href}>
                                  <Link href={link.href} className={`${row} text-ink-muted`}>
                                    {link.title}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          ),
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
            <li className="mt-2 border-t border-rule pt-2">
              <Link href="/subjects" className={`${row} text-ink`}>
                All subjects
              </Link>
            </li>
            <li>
              <Link href="/papers" className={`${row} text-ink`}>
                All papers
              </Link>
            </li>
            <li>
              <Link href="/search" className={`${row} text-ink`}>
                Search questions
              </Link>
            </li>
            <li>
              <Link href="/dashboard" className={`${row} text-ink`}>
                Dashboard
              </Link>
            </li>
          </ul>
        </nav>
      ) : null}
    </div>
  )
}
