'use client'

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { buttonClass } from '@/components/ui/primitives'
import { WarningCircle, X } from '@/components/ui/icons'

interface AuthContext {
  /** Open the sign-in dialog; after signing in, go to `next` (or stay put). */
  openSignIn: (next?: string) => void
}

const Context = createContext<AuthContext | null>(null)

export function useSignIn(): AuthContext {
  const value = useContext(Context)
  if (!value) throw new Error('useSignIn() must be used inside <AuthProvider>.')
  return value
}

const CALLBACK_ERRORS: Record<string, string> = {
  missing_code: 'That sign-in link was incomplete. Ask for a new one.',
  invalid_code: 'That sign-in link has expired or was already used. Ask for a new one.',
}

/** Only ever send someone to a path on this site. */
function safePath(next: string | null | undefined): string | null {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null
}

/**
 * Sign-in is a dialog, never a page: it opens over whatever you were doing —
 * a paper, a result, the catalogue — and closes back onto it. Protected pages
 * send a signed-out visitor to `/?login=1&next=…`, which opens it on arrival.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [next, setNext] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const openSignIn = useCallback((target?: string, message?: string) => {
    setNext(safePath(target))
    setNotice(message ?? null)
    dialog.current?.showModal()
  }, [])

  const value = useMemo(() => ({ openSignIn: (target?: string) => openSignIn(target) }), [openSignIn])

  return (
    <Context.Provider value={value}>
      {children}
      <Suspense fallback={null}>
        <OpenFromUrl onOpen={openSignIn} />
      </Suspense>
      <dialog
        ref={dialog}
        aria-labelledby="auth-title"
        className="m-auto w-[min(900px,calc(100vw-1.5rem))] rounded-[18px] border border-rule bg-surface p-0 text-ink backdrop:bg-ink/40"
      >
        <SignInPanel
          next={next}
          notice={notice}
          onClose={() => dialog.current?.close()}
        />
      </dialog>
    </Context.Provider>
  )
}

/** Opens the dialog when the URL asks for it, then tidies the URL. */
function OpenFromUrl({ onOpen }: { onOpen: (next?: string, message?: string) => void }) {
  const params = useSearchParams()
  const pathname = usePathname()

  useEffect(() => {
    if (params.get('login') !== '1' && !params.get('error')) return
    const error = params.get('error')
    onOpen(params.get('next') ?? undefined, error ? (CALLBACK_ERRORS[error] ?? 'Sign-in failed.') : undefined)

    const rest = new URLSearchParams(params.toString())
    for (const key of ['login', 'next', 'error']) rest.delete(key)
    const suffix = rest.toString()
    window.history.replaceState(null, '', suffix ? `${pathname}?${suffix}` : pathname)
  }, [params, pathname, onOpen])

  return null
}

function SignInPanel({
  next,
  notice,
  onClose,
}: {
  next: string | null
  notice: string | null
  onClose: () => void
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const shownError = error ?? notice

  function completeSignIn() {
    onClose()
    if (next) router.push(next)
    router.refresh()
  }

  return (
    <div className="relative px-2 pt-6 pb-8">
      <h2 id="auth-title" className="text-center text-[1.625rem] leading-tight font-light text-ink">
        Welcome to <span className="font-normal text-accent">QuizPractice</span>
      </h2>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-control text-ink-muted hover:bg-surface-2 hover:text-ink"
      >
        <X size={20} />
      </button>

      <div className="mt-2 grid md:grid-cols-[1fr_1px_1fr]">
        <Showcase />
        <div aria-hidden="true" className="my-3 hidden bg-rule md:block" />

        <section className="flex flex-col justify-center px-5 pt-6 sm:px-10">
          <h3 className="text-[1.375rem] font-normal text-ink">Sign in</h3>
          <p className="mt-1.5 text-ui font-light text-ink-faint">
            Use your Google account to continue. New here? The same button creates your account.
          </p>

          <div className="mt-8 flex justify-center">
            <GoogleButton onError={setError} onDone={completeSignIn} />
          </div>

          {shownError ? (
            <p className="mt-5 flex items-start justify-center gap-2 text-meta text-incorrect">
              <WarningCircle size={16} className="mt-0.5 shrink-0" />
              {shownError}
            </p>
          ) : null}

          <p className="mt-8 text-center text-meta font-light text-ink-faint">
            Your attempts, scores and history are saved to your account.
          </p>
        </section>
      </div>
    </div>
  )
}

/**
 * The left half: an illustration on a soft blob, a one-line pitch, and dots.
 * Slides rotate on their own (not under reduced motion) and the dots jump.
 * Each image lives in public/art/login/ — until one is added, the blob stands
 * alone rather than showing a broken image.
 */
const SLIDES = [
  {
    art: '/art/login/slide-1.png',
    accent: 'Every Paper',
    rest: 'in One Place',
    body: '1,400+ Previous Year Papers, Quiz 1, Quiz 2, End Term, OPPE',
  },
  {
    art: '/art/login/slide-2.png',
    accent: 'Real Exam',
    rest: 'Experience',
    body: 'Timed CBT Mode, Question Palette, Mark for Review',
  },
  {
    art: '/art/login/slide-3.png',
    accent: 'Learn',
    rest: 'from Every Attempt',
    body: 'Worked Solutions, Score Analysis, Attempt History',
  },
] as const

function Showcase() {
  const [index, setIndex] = useState(0)
  const [missing, setMissing] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % SLIDES.length), 4500)
    return () => window.clearInterval(timer)
  }, [])

  const slide = SLIDES[index]
  return (
    <section aria-label="Why sign in" className="hidden flex-col items-center px-8 pt-4 text-center md:flex">
      <div className="relative grid aspect-[1/0.82] w-full max-w-[340px] place-items-center">
        <div
          aria-hidden="true"
          className="absolute inset-[6%_4%_8%] rounded-[46%_54%_52%_48%/55%_48%_52%_45%] bg-surface-2"
        />
        {missing[slide.art] ? null : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={slide.art}
            src={slide.art}
            alt=""
            onError={() => setMissing((current) => ({ ...current, [slide.art]: true }))}
            className="relative w-[82%] max-w-full object-contain"
          />
        )}
      </div>

      <p className="mt-4 text-[1.625rem] leading-tight font-light text-ink text-balance">
        <span className="font-normal text-accent">{slide.accent}</span> {slide.rest}
      </p>
      <p className="mt-4 max-w-[34ch] text-ui font-light text-ink-faint">{slide.body}</p>

      <div className="mt-6 flex gap-2" role="tablist" aria-label="Slides">
        {SLIDES.map((item, dot) => (
          <button
            key={item.art}
            type="button"
            role="tab"
            aria-selected={dot === index}
            aria-label={`Slide ${dot + 1}`}
            onClick={() => setIndex(dot)}
            className={`h-2 rounded-full transition-all ${dot === index ? 'w-5 bg-accent' : 'w-2 bg-rule-strong'}`}
          />
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Google, on our own domain
// ---------------------------------------------------------------------------
//
// The handshake is Google Identity Services running here, on our origin — the
// prompt says "continue to <our site>", never a Supabase URL. We hand the
// resulting Google ID token to Supabase with signInWithIdToken; Supabase only
// verifies it and mints the session. So the client id is all the browser needs
// (it is public by design); the client secret never touches this flow.

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

interface GoogleIdApi {
  initialize(config: {
    client_id: string
    nonce?: string
    callback: (response: { credential: string }) => void
  }): void
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void
}

function googleId(): GoogleIdApi | undefined {
  return (window as unknown as { google?: { accounts?: { id?: GoogleIdApi } } }).google?.accounts?.id
}

let gisScript: Promise<void> | null = null
function loadGis(): Promise<void> {
  if (googleId()) return Promise.resolve()
  gisScript ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => {
      gisScript = null
      reject(new Error('Could not reach Google sign-in.'))
    }
    document.head.appendChild(script)
  })
  return gisScript
}

/** A raw nonce for Supabase, and its SHA-256 for Google — a token minted for
 *  one prompt cannot be replayed into another. */
async function makeNonce() {
  const raw = crypto.randomUUID() + crypto.randomUUID()
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  const hashed = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  return { raw, hashed }
}

/** Google's own button, rendered by GIS into a slot. Renders nothing when no
 *  client id is configured, so the other ways in still stand alone. */
function GoogleButton({ onError, onDone }: { onError: (message: string) => void; onDone: () => void }) {
  const slot = useRef<HTMLDivElement>(null)
  // The callbacks change every render; refs keep the one-time init from tearing
  // down and re-rendering Google's button on each keystroke in the form.
  const onErrorRef = useRef(onError)
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onErrorRef.current = onError
    onDoneRef.current = onDone
  })

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return
    let cancelled = false
    void (async () => {
      try {
        const { raw, hashed } = await makeNonce()
        await loadGis()
        const id = googleId()
        if (cancelled || !id || !slot.current) return
        id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          nonce: hashed,
          callback: async (response) => {
            const { error } = await createClient().auth.signInWithIdToken({
              provider: 'google',
              token: response.credential,
              nonce: raw,
            })
            if (error) onErrorRef.current(error.message)
            else onDoneRef.current()
          },
        })
        slot.current.replaceChildren()
        id.renderButton(slot.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: 220,
        })
      } catch (loadError) {
        if (!cancelled) onErrorRef.current(loadError instanceof Error ? loadError.message : 'Google sign-in is unavailable.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!GOOGLE_CLIENT_ID) return null
  return <div ref={slot} className="flex h-10 min-w-[220px] justify-center [color-scheme:light]" />
}

/** A "Sign in" button anywhere on the site. */
export function SignInButton({
  next,
  className,
  children = 'Sign in',
}: {
  next?: string
  className?: string
  children?: ReactNode
}) {
  const { openSignIn } = useSignIn()
  return (
    <button type="button" onClick={() => openSignIn(next)} className={className ?? buttonClass('primary', 'md')}>
      {children}
    </button>
  )
}

/** "Sign in" as an inline text link, for sentences like "Sign in to save this". */
export function SignInLink({ next, children = 'Sign in' }: { next?: string; children?: ReactNode }) {
  const { openSignIn } = useSignIn()
  return (
    <button type="button" onClick={() => openSignIn(next)} className="text-accent hover:underline">
      {children}
    </button>
  )
}
