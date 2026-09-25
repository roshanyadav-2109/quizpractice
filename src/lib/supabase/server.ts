import 'server-only'
import { cache } from 'react'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
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

  return {
    id: row.id,
    displayName: row.display_name ?? email ?? 'Account',
    avatarUrl: row.avatar_url,
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
