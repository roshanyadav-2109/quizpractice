'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CaretDown } from '@/components/ui/icons'

/** "Roshan Singh" → "RS"; an email falls back to its first letter. */
function initials(name: string): string {
  const words = name.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean)
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0]?.[0] ?? '?'
  return letters.toUpperCase()
}

/**
 * The avatar — initials and a chevron — and the menu behind it. Account,
 * dashboard, admin for staff, and sign out live here so the bar itself holds
 * only the four places a student goes.
 */
export function AccountMenu({
  name,
  email,
  staff,
}: {
  name: string
  email: string | null
  staff: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function signOut() {
    setSigningOut(true)
    await createClient().auth.signOut()
    setOpen(false)
    router.push('/')
    router.refresh()
  }

  const item =
    'flex h-10 items-center rounded-control px-3 text-ui text-ink transition-colors hover:bg-surface-2'

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account menu for ${name}`}
        className="flex h-11 items-center gap-1.5 rounded-control pr-1.5 pl-1 transition-colors hover:bg-surface-2"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-rule bg-surface-2 text-meta text-ink">
          {initials(name)}
        </span>
        <CaretDown
          size={14}
          aria-hidden="true"
          className={`text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute top-full right-0 z-50 mt-2 w-64 rounded-card border border-rule bg-surface p-1.5"
        >
          <div className="border-b border-rule px-3 pt-2 pb-3">
            <p className="truncate text-ui text-ink">{name}</p>
            {email && email !== name ? (
              <p className="truncate text-meta text-ink-faint">{email}</p>
            ) : null}
          </div>
          <div className="flex flex-col pt-1.5">
            <Link role="menuitem" href="/dashboard" className={item} onClick={() => setOpen(false)}>
              Dashboard
            </Link>
            <Link role="menuitem" href="/account" className={item} onClick={() => setOpen(false)}>
              Account
            </Link>
            {staff ? (
              <Link role="menuitem" href="/admin" className={item} onClick={() => setOpen(false)}>
                Admin
              </Link>
            ) : null}
            <button
              role="menuitem"
              type="button"
              onClick={signOut}
              disabled={signingOut}
              className={`${item} text-left text-ink-muted disabled:opacity-60`}
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
