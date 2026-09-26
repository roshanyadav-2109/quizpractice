import 'server-only'
import { cache } from 'react'
import { revalidateTag, unstable_cache } from 'next/cache'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { supabaseAnonKey, supabaseUrl } from '@/lib/env'

/**
 * The caches between the site and Supabase, so that content is read from the
 * database once rather than once per visit — Supabase bills every byte it
 * sends, and the free plan allows 5 GB a month.
 *
 * Shared: content that is the same for everyone (the taxonomy, the papers, a
 * paper's questions, the banners). Held in Next's data cache, which every
 * server instance shares and which survives deploys, so one read serves every
 * visitor until the content changes. Staff edits clear it at once through
 * tags; changes made by scripts straight in the database show up within the
 * hour, or at once through /api/revalidate.
 *
 * Personal: a student's own attempts, mistakes and analytics. Cached per
 * student and cleared the moment they submit a paper or a retry. A miss still
 * reads as that student, with their own token, so row-level security decides
 * what comes back exactly as it did before — the service key is never used.
 *
 * Nothing here is loaded until a page asks for it, and what a page does not
 * show it does not ask for.
 *
 * Cached values travel as JSON: loaders return plain objects and arrays,
 * never Maps, Sets or Dates. One entry must stay under 2 MB.
 */

export const TAG = {
  /** Branches, levels, subjects, exam types. */
  taxonomy: 'taxonomy',
  /** Every published paper, set and count, and the index built from them. */
  catalogue: 'catalogue',
  /** Exam dates and announcements. */
  spotlight: 'spotlight',
  /** Approved explanations. */
  solutions: 'solutions',
  /** One set's questions. */
  set: (setId: string) => `set:${setId}`,
  /** Everything cached for one student. */
  user: (userId: string) => `user:${userId}`,
} as const

const HOUR = 60 * 60

/** A loader whose result every visitor shares. */
export function shared<A extends unknown[], T>(
  key: string,
  tags: string[],
  load: (...args: A) => Promise<T>,
  revalidate = HOUR,
): (...args: A) => Promise<T> {
  return unstable_cache(load, ['qp-shared', key], { tags, revalidate })
}

type Db = Awaited<ReturnType<typeof createClient>>

/** The signed-in student and the token their own reads are made with. Once per request. */
const currentStudent = cache(async (): Promise<{ id: string; token: string } | null> => {
  const supabase = await createClient()
  const [{ data: claims }, { data: session }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.auth.getSession(),
  ])
  const id = claims?.claims?.sub
  const token = session.session?.access_token
  return typeof id === 'string' && token ? { id, token } : null
})

/** A client that reads as the student, from their token alone — no cookies, so it works inside a cache. */
function asStudent(token: string): Db {
  return createSupabaseClient(supabaseUrl(), supabaseAnonKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as Db
}

/**
 * A student's own data, cached for them alone. `key` names the loader and
 * anything it depends on besides the student; `fallback` is what a visitor
 * who is not signed in gets.
 */
export async function personal<T>(
  key: string,
  load: (supabase: Db, userId: string) => Promise<T>,
  fallback: T,
  revalidate = HOUR,
): Promise<T> {
  const me = await currentStudent()
  if (!me) return fallback
  const read = unstable_cache(
    async (userId: string) => load(asStudent(me.token), userId),
    ['qp-personal', key],
    { tags: [TAG.user(me.id)], revalidate },
  )
  return read(me.id)
}

/** Drops cached entries now, so the next read goes to the database. */
export function refresh(...tags: string[]): void {
  for (const tag of tags) revalidateTag(tag, { expire: 0 })
}
