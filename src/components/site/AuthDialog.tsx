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
import { DEMO_ACCOUNTS, demoLoginsEnabled } from '@/lib/demo-accounts'
import { buttonClass } from '@/components/ui/primitives'
import { ArrowRight, CheckCircle, Gauge, User, WarningCircle, X } from '@/components/ui/icons'

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
        className="m-auto w-[min(860px,calc(100vw-1.5rem))] rounded-card border border-rule bg-surface p-0 text-ink backdrop:bg-ink/40"
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

type Mode = 'password' | 'link'

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
  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const shownError = error ?? notice

  async function signInWithPassword(withEmail: string, withPassword: string) {
    setBusy(true)
    setError(null)
    const { error: signInError } = await createClient().auth.signInWithPassword({
      email: withEmail.trim(),
      password: withPassword,
    })
    setBusy(false)
    if (signInError) {
      setError(signInError.message)
      return
    }
    onClose()
    if (next) router.push(next)
    router.refresh()
  }

  async function sendMagicLink() {
    setBusy(true)
    setError(null)
    const destination = next ?? window.location.pathname
    const { error: linkError } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}`,
      },
    })
    setBusy(false)
    if (linkError) setError(linkError.message)
    else setSent(true)
  }

  const field =
    'h-11 w-full rounded-control border border-rule-strong bg-surface px-3.5 text-ui text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-ink'

  return (
    <div>
      <div className="relative border-b border-rule px-6 py-5 text-center">
        <h2 id="auth-title" className="text-[1.375rem] leading-tight font-medium text-ink">
          Welcome to QuizPractice
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-1/2 right-4 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-control text-ink-muted hover:bg-surface-2 hover:text-ink"
        >
          <X size={20} />
        </button>
      </div>

      <div className={`grid ${demoLoginsEnabled ? 'md:grid-cols-2' : ''}`}>
        <section className="p-6 sm:p-7">
          <h3 className="text-card font-medium text-ink">Sign in</h3>

          {sent ? (
            <div className="mt-5 flex items-start gap-3 rounded-control bg-correct-soft px-4 py-3.5">
              <CheckCircle size={20} className="mt-0.5 shrink-0 text-correct" />
              <p className="text-ui text-ink">
                A sign-in link is on its way to <span className="text-ink">{email}</span>. It expires in an
                hour.
              </p>
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                if (mode === 'password') void signInWithPassword(email, password)
                else void sendMagicLink()
              }}
              className="mt-5 flex flex-col gap-4"
            >
              <label className="flex flex-col gap-1.5">
                <span className="text-meta text-ink-muted">Email</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  spellCheck={false}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className={field}
                />
              </label>

              {mode === 'password' ? (
                <label className="flex flex-col gap-1.5">
                  <span className="text-meta text-ink-muted">Password</span>
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className={field}
                  />
                </label>
              ) : null}

              {shownError ? (
                <p className="flex items-start gap-2 text-meta text-incorrect">
                  <WarningCircle size={16} className="mt-0.5 shrink-0" />
                  {shownError}
                </p>
              ) : null}

              <button type="submit" disabled={busy} className={buttonClass('primary', 'lg', 'w-full')}>
                {busy ? 'Working…' : mode === 'password' ? 'Continue' : 'Email me a sign-in link'}
                {busy ? null : <ArrowRight size={16} aria-hidden="true" />}
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'password' ? 'link' : 'password')
                  setError(null)
                }}
                className="text-meta text-accent hover:underline"
              >
                {mode === 'password' ? 'Use a sign-in link instead' : 'Use a password instead'}
              </button>
            </form>
          )}
        </section>

        {demoLoginsEnabled ? (
          <section className="border-t border-rule p-6 sm:p-7 md:border-t-0 md:border-l">
            <h3 className="text-card font-medium text-ink">Demo accounts</h3>
            <ul className="mt-4 flex flex-col gap-2">
              {DEMO_ACCOUNTS.map((account) => (
                <li key={account.email}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void signInWithPassword(account.email, account.password)}
                    className="flex w-full items-center gap-3 rounded-control border border-rule px-3.5 py-3 text-left transition-colors hover:border-rule-strong disabled:opacity-60"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-muted">
                      {account.role === 'admin' ? <Gauge size={18} /> : <User size={18} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-ui text-ink">{account.displayName}</span>
                      <span className="block truncate text-meta text-ink-faint">{account.email}</span>
                    </span>
                    <ArrowRight size={16} aria-hidden="true" className="shrink-0 text-ink-faint" />
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-meta text-ink-faint">
              Remove before launch: delete the accounts and set{' '}
              <code className="font-mono text-[0.8125rem]">NEXT_PUBLIC_DEMO_LOGINS=false</code>.
            </p>
          </section>
        ) : null}
      </div>
    </div>
  )
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
