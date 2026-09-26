'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Gauge, ShieldCheck, SignOut } from '@/components/ui/icons'

/** "Roshan Singh" → "RS"; an email falls back to its first letter. */
function initials(name: string): string {
  const words = name.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean)
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0]?.[0] ?? '?'
  return letters.toUpperCase()
}

/** A tint picked from the name, so someone without a photo keeps the same colour. */
const TINTS = [
  'bg-[#e6edfd] text-[#1d4ed8]',
  'bg-[#efe9fd] text-[#6d28d9]',
  'bg-[#e3f5ea] text-[#15803d]',
  'bg-[#fdf0dc] text-[#b45309]',
  'bg-[#fde7ea] text-[#be123c]',
  'bg-[#e0f3f5] text-[#0e7490]',
]
function tint(name: string): string {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return TINTS[hash % TINTS.length]
}

/** The Google photo, or initials on a tint if there is none or it fails to load. */
function Avatar({ name, src, size }: { name: string; src: string | null; size: number }) {
  const [failed, setFailed] = useState(false)
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full font-medium ${tint(name)}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials(name)}
    </span>
  )
}

/**
 * The student's photo in the bar, and behind it who they are signed in as and
 * their dashboard, admin for staff, and sign out.
 */
export function AccountMenu({
  name,
  email,
  avatarUrl,
  staff,
}: {
  name: string
  email: string | null
  avatarUrl: string | null
  staff: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
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
    'flex h-10 w-full items-center gap-3 rounded-[8px] px-3 text-left text-ui text-ink transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none'
  const icon = 'shrink-0 text-ink-muted'

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account menu for ${name}`}
        className={`flex rounded-full ring-offset-2 ring-offset-surface transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-ink ${
          open ? 'ring-2 ring-ink' : 'hover:ring-2 hover:ring-rule-strong'
        }`}
      >
        <Avatar name={name} src={avatarUrl} size={36} />
      </button>

      <div
        role="menu"
        aria-label="Account"
        inert={!open}
        className={`absolute top-full right-0 z-50 mt-3 w-[18rem] origin-top-right rounded-[14px] border border-rule bg-surface p-1.5 shadow-[0_12px_32px_-12px_rgba(12,10,9,0.18)] transition duration-150 ease-out motion-reduce:transition-none ${
          open ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none -translate-y-1 scale-[0.98] opacity-0'
        }`}
      >
        <div className="flex items-center gap-3 rounded-[10px] bg-surface-2 px-3 py-3">
          <Avatar name={name} src={avatarUrl} size={44} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-ui text-ink">{name}</p>
            {email && email !== name ? <p className="truncate text-meta font-light text-ink-faint">{email}</p> : null}
          </div>
          {staff ? (
            <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[0.6875rem] text-ink-muted ring-1 ring-rule">
              Staff
            </span>
          ) : null}
        </div>

        <div className="mt-1.5 flex flex-col">
          <Link role="menuitem" href="/dashboard" className={item} onClick={() => setOpen(false)}>
            <Gauge size={18} aria-hidden="true" className={icon} />
            Dashboard
          </Link>
          {staff ? (
            <Link role="menuitem" href="/admin" className={item} onClick={() => setOpen(false)}>
              <ShieldCheck size={18} aria-hidden="true" className={icon} />
              Admin
            </Link>
          ) : null}
        </div>

        <div className="mt-1.5 border-t border-rule pt-1.5">
          <button
            role="menuitem"
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className={`${item} text-ink-muted hover:bg-incorrect-soft hover:text-incorrect disabled:opacity-60`}
          >
            <SignOut size={18} aria-hidden="true" className="shrink-0" />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>
    </div>
  )
}
