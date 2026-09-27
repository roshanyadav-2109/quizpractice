import 'server-only'
import { cache } from 'react'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { supabaseAnonKey, supabaseUrl } from '@/lib/env'
import type { UserRole } from '@/types/db'

/**
 * Supabase client for server components, server actions and route handlers.
 * Runs as the signed-in user, so every query is subject to RLS.
 *
 * `cookies()` is async in Next 16, hence the await.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Server components cannot set cookies. src/proxy.ts refreshes the
          // session on every request, so ignoring this is safe.
        }
      },
    },
  })
}

/**
 * The signed-in user's profile, or null. Used for nav state and admin gating.
 *
 * Wrapped in React's per-request cache: the header and the page both ask, and
 * without this every navigation paid for the auth round trip twice.
 *
 * Who is signed in comes from getClaims(), which verifies the token locally
 * against the project's signing keys — no request to Supabase Auth. The
 * profile row is then held for a minute per user, keyed by that verified id,
 * so it can only ever be served back to the same person.
 */
export const getCurrentProfile = cache(async () => {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const claims = auth?.claims
  const userId = typeof claims?.sub === 'string' ? claims.sub : null
  if (!userId) return null

  const email = typeof claims?.email === 'string' && claims.email ? claims.email : null

  const held = profiles.get(userId)
  const row =
    held && held.expires > Date.now()
      ? held.row
      : await supabase
          .from('profiles')
          .select('id, display_name, avatar_url, role')
          .eq('id', userId)
          .maybeSingle()
          .then(({ data }) => {
            const found = (data as ProfileRow | null) ?? null
            if (found) profiles.set(userId, { row: found, expires: Date.now() + PROFILE_TTL_MS })
            return found
          })

  if (!row) return null

  // The Google photo, from the profile — or, until the profile has caught up,
  // from the sign-in token itself, so it shows from the first sign-in.
  const meta = (claims?.user_metadata ?? {}) as { avatar_url?: unknown; picture?: unknown }
  const tokenPhoto = [meta.avatar_url, meta.picture].find((value): value is string => typeof value === 'string' && value !== '')

  return {
    id: row.id,
    displayName: row.display_name ?? email ?? 'Account',
    avatarUrl: row.avatar_url ?? tokenPhoto ?? null,
    role: row.role,
    email,
  }
})

interface ProfileRow {
  id: string
  display_name: string | null
  avatar_url: string | null
  role: UserRole
}

const PROFILE_TTL_MS = 60_000
const profiles = new Map<string, { row: ProfileRow; expires: number }>()

export type CurrentProfile = NonNullable<Awaited<ReturnType<typeof getCurrentProfile>>>

export function isStaff(profile: { role: string } | null): boolean {
  return profile?.role === 'admin' || profile?.role === 'contributor'
}

/** Authors solutions and records video. Deliberately not a content editor. */
export function isTeacher(profile: { role: string } | null): boolean {
  return profile?.role === 'admin' || profile?.role === 'teacher'
}

/** Anyone whose home is a work surface rather than the student dashboard. */
export function isStaffOrTeacher(profile: { role: string } | null): boolean {
  return isStaff(profile) || isTeacher(profile)
}

/**
 * Gate for admin route handlers and server actions.
 *
 * RLS already blocks a student from writing content, but these endpoints reach
 * for the service-role key, which bypasses RLS entirely — so the check has to
 * happen explicitly here, before that key is ever used.
 */
export async function requireStaff(): Promise<CurrentProfile> {
  const profile = await getCurrentProfile()
  if (!isStaff(profile)) {
    throw new NotStaffError()
  }
  return profile as CurrentProfile
}

export class NotStaffError extends Error {
  constructor() {
    super('This action requires a contributor or admin account.')
    this.name = 'NotStaffError'
  }
}

/**
 * Gate for the teaching server actions and route handlers: a teacher or an
 * admin. A contributor edits papers and is not a teacher. Which subjects the
 * teacher may touch is the database's call (can_teach_question), not this one.
 */
export async function requireTeacher(): Promise<CurrentProfile> {
  const profile = await getCurrentProfile()
  if (!isTeacher(profile)) {
    throw new NotTeacherError()
  }
  return profile as CurrentProfile
}

export class NotTeacherError extends Error {
  constructor() {
    super('This needs a teacher account.')
    this.name = 'NotTeacherError'
  }
}

/** Gate for role, trust and YouTube management: admins only. */
export async function requireAdmin(): Promise<CurrentProfile> {
  const profile = await getCurrentProfile()
  if (profile?.role !== 'admin') {
    throw new NotAdminError()
  }
  return profile
}

export class NotAdminError extends Error {
  constructor() {
    super('This needs an admin account.')
    this.name = 'NotAdminError'
  }
}

/**
 * The first line of every teacher page: a visitor is sent to sign in and
 * brought back to `nextPath`; a signed-in student or contributor goes home.
 */
export async function teacherPageGate(nextPath: string): Promise<CurrentProfile> {
  const profile = await getCurrentProfile()
  if (!profile) {
    // Only a path on this site: never let `next` carry the visitor elsewhere.
    const next = /^\/(?![/\\])/.test(nextPath) ? nextPath : '/teach'
    redirect(`/?login=1&next=${encodeURIComponent(next)}`)
  }
  if (!isTeacher(profile)) redirect('/')
  return profile
}

/**
 * Drops this server instance's held copy of a profile, after an admin changes
 * that user's role. Other instances catch up within PROFILE_TTL_MS; the
 * database enforces the new role at once either way.
 */
export function forgetProfile(userId: string): void {
  profiles.delete(userId)
}
