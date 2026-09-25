import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { supabaseAnonKey, supabaseUrl } from '@/lib/env'

/**
 * A Supabase client with no session attached.
 *
 * Deliberately separate from the cookie-bound client in `server.ts`: anything
 * read through this one is identical for every visitor, which is what makes it
 * safe to cache. Never read user-scoped data with it — RLS would simply return
 * the anonymous view, and caching a per-user result here would serve one
 * person's rows to everybody.
 */
export const publicClient = createClient(supabaseUrl(), supabaseAnonKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
})

/**
 * Memoises a loader for a fixed period.
 *
 * The taxonomy — programmes, levels, subjects, exam types — changes when an
 * admin edits it and at no other time, but `force-dynamic` was re-fetching all
 * of it on every request, which is several hundred milliseconds of round trip
 * before a page can start rendering. Holding it briefly in process removes
 * that from the critical path without introducing a cache to invalidate: the
 * window is short enough that an admin edit shows up on the next reload.
 *
 * In-process on purpose. It resets on deploy, is per-instance, and never
 * touches a shared store, so it cannot serve one visitor's data to another.
 */
export function memoise<T>(load: () => Promise<T>, ttlMs: number): () => Promise<T> {
  let value: Promise<T> | null = null
  let expires = 0

  return () => {
    const now = Date.now()
    if (!value || now > expires) {
      expires = now + ttlMs
      // Store the promise, not the result: concurrent callers during a cold
      // window should share one request rather than each firing their own.
      value = load().catch((error) => {
        // A failure must not be cached, or one blip persists for the whole TTL.
        value = null
        expires = 0
        throw error
      })
    }
    return value
  }
}
