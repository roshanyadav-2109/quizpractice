'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { usePathname } from 'next/navigation'

/**
 * Who is looking at the page, known in the browser rather than on the server.
 *
 * Every catalogue page — subjects, papers, questions — is rendered once and
 * served to everyone from the CDN. That is what makes them fast for students
 * and cheap to crawl, and it means the server cannot know who asked. The
 * little that is personal on those pages (the account menu, "your best
 * 8/10", mistakes to retry) is filled in here, from one request to /api/me,
 * made only when the browser already holds a session.
 */

export interface ViewerProfile {
  name: string
  email: string | null
  avatarUrl: string | null
  staff: boolean
  teacher: boolean
}

export interface BestScore {
  percentage: number
  attemptId: string
  score: number
  maxScore: number
}

interface ViewerState {
  /** `loading` until the browser has checked for a session. */
  status: 'loading' | 'signed-out' | 'signed-in'
  profile: ViewerProfile | null
  best: Record<string, BestScore>
  mistakesDue: number
}

interface ViewerContext extends ViewerState {
  reload: () => void
}

const EMPTY: ViewerState = { status: 'loading', profile: null, best: {}, mistakesDue: 0 }
const SIGNED_OUT: ViewerState = { status: 'signed-out', profile: null, best: {}, mistakesDue: 0 }

/** Held for the tab, so a full page load paints the account at once instead of after a round trip. */
const STORAGE_KEY = 'qs:viewer'
/** A navigation refreshes scores at most this often. */
const STALE_MS = 15_000

const Context = createContext<ViewerContext>({ ...EMPTY, reload: () => {} })

/** Sent on window when someone has just signed in, so the viewer starts watching the session. */
export const AUTH_EVENT = 'qs:signed-in'

/** Whether Supabase has left a session cookie ("sb-<ref>-auth-token", maybe split into .0, .1…). */
function hasSessionCookie(): boolean {
  return document.cookie.split(/;\s*/).some((cookie) => /^sb-[^=]+-auth-token(\.\d+)?=./.test(cookie))
}

export function useViewer(): ViewerContext {
  return useContext(Context)
}

function readHeld(): ViewerState | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ViewerState) : null
  } catch {
    return null
  }
}

function hold(state: ViewerState | null) {
  try {
    if (state) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    else window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Private mode or storage switched off: the account simply paints a moment later.
  }
}

export function ViewerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ViewerState>(EMPTY)
  const fetchedAt = useRef(0)
  const signedIn = useRef(false)
  const pathname = usePathname()

  const load = useCallback(async () => {
    fetchedAt.current = Date.now()
    try {
      const response = await fetch('/api/me', { cache: 'no-store', credentials: 'same-origin' })
      if (!response.ok) throw new Error(String(response.status))
      const body = (await response.json()) as {
        profile: ViewerProfile | null
        best?: Record<string, BestScore>
        mistakesDue?: number
      }
      const next: ViewerState = body.profile
        ? { status: 'signed-in', profile: body.profile, best: body.best ?? {}, mistakesDue: body.mistakesDue ?? 0 }
        : SIGNED_OUT
      signedIn.current = next.status === 'signed-in'
      setState(next)
      hold(next.status === 'signed-in' ? next : null)
    } catch {
      // A failed check leaves whatever was showing; the next navigation tries again.
      fetchedAt.current = 0
    }
  }, [])

  useEffect(() => {
    let unsubscribe: (() => void) | null = null
    let stopped = false

    // The Supabase client is a large bundle and most visitors — and every
    // crawler — never sign in. It is loaded only when the browser already
    // holds a session, or once someone signs in (the sign-in dialog says so
    // with an AUTH_EVENT); everyone else is simply signed out.
    async function watch() {
      if (unsubscribe || stopped) return
      if (!hasSessionCookie()) {
        setState(SIGNED_OUT)
        return
      }
      const { createClient } = await import('@/lib/supabase/client')
      if (stopped || unsubscribe) return
      const { data } = createClient().auth.onAuthStateChange((event, session) => {
        if (!session) {
          signedIn.current = false
          hold(null)
          setState(SIGNED_OUT)
          return
        }
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
          signedIn.current = true
          // Paint what this tab already knew at once; the fresh copy follows.
          const held = event === 'INITIAL_SESSION' ? readHeld() : null
          if (held) setState(held)
          void load()
        }
      })
      unsubscribe = () => data.subscription.unsubscribe()
    }

    void watch()
    const onAuth = () => void watch()
    window.addEventListener(AUTH_EVENT, onAuth)
    return () => {
      stopped = true
      window.removeEventListener(AUTH_EVENT, onAuth)
      unsubscribe?.()
    }
  }, [load])

  // A submitted paper changes a best score: pick it up on the next page.
  useEffect(() => {
    if (signedIn.current && Date.now() - fetchedAt.current > STALE_MS) void load()
  }, [pathname, load])

  const value = useMemo(() => ({ ...state, reload: () => void load() }), [state, load])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

/** Children only for a signed-in visitor. */
export function SignedIn({ children }: { children: ReactNode }) {
  return useViewer().status === 'signed-in' ? <>{children}</> : null
}

/** Children only once the browser knows nobody is signed in — never flashed at someone who is. */
export function SignedOut({ children }: { children: ReactNode }) {
  return useViewer().status === 'signed-out' ? <>{children}</> : null
}
