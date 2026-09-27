import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseServiceRoleKey, supabaseUrl } from '@/lib/env'

/**
 * The server's own reader for question content: questions, options and the
 * answer key, explanations, and the functions that return them.
 *
 * Those are not readable with the anon key (0035) — every browser has that
 * key, and with it the whole bank could be downloaded in minutes. The server
 * reads them with the service role instead and decides what each visitor is
 * shown: the paper pages' first questions for anyone, the full paper only to
 * a signed-in student who has opened it (0034).
 *
 * The service role bypasses row-level security, so every read through this
 * client must ask for published content itself — `status = 'published'` on
 * the question and its paper, `approved` explanations — as the loaders in
 * src/lib/queries.ts do. Never hand it to a caller's filters unchecked, and
 * never import it into anything that reaches the browser.
 */
let client: SupabaseClient | null = null

/** Made on first use, so a build or script without the key fails only where content is read. */
export function contentClient(): SupabaseClient {
  client ??= createClient(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return client
}
