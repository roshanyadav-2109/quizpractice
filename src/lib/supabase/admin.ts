import { createClient } from '@supabase/supabase-js'
import { supabaseServiceRoleKey, supabaseUrl } from '@/lib/env'

/**
 * Service-role client. Bypasses RLS entirely.
 *
 * Only for work that legitimately acts outside a user's permissions: the bulk
 * importer, the extraction pipeline, and role changes. Every caller must have
 * already checked that the requesting user is staff — the key itself grants no
 * such check.
 */
export function createAdminClient() {
  // Not `server-only`, because the CLI import scripts legitimately use this in
  // plain Node. A runtime guard gives the same protection in the browser.
  if (typeof window !== 'undefined') {
    throw new Error('createAdminClient() must never run in the browser.')
  }

  return createClient(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
