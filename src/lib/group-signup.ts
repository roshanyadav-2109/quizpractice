import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Hands each newly confirmed email to the main site's announcement groups.
 *
 * The main site (unknowniitians.com) keeps Google Groups ui-announcements-01 …
 * NN, 499 members each, with one address book: an email that already has a
 * place gets its old one back and is never added twice, and a full group is
 * followed by the next. Quiz Space does not keep a second book — it sends
 * {email, source} to the same function that the main site's own sign-ups use,
 * and that function takes a place and queues the email for Google.
 *
 * The emails to send wait in public.group_signups (0041). A sign-in sends its
 * own right away (auth callback); the daily job sends any that failed, up to
 * MAX_ATTEMPTS times. Sending twice is harmless: the main site answers
 * "already assigned".
 *
 * No `server-only` here: scripts/group-signup.ts runs it too.
 */
export const GROUP_ENDPOINT =
  process.env.PROMO_GROUP_ENDPOINT ?? 'https://qzrvctpwefhmcduariuw.supabase.co/functions/v1/promotional-group-add-member'

const MAX_ATTEMPTS = 20

interface Pending {
  email_normalized: string
  attempts: number
}

interface Answer {
  success?: boolean
  group_number?: number
  was_already_assigned?: boolean
  error?: string
}

async function send(email: string): Promise<Answer> {
  const response = await fetch(GROUP_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, source: 'quizspace' }),
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  })
  const body = (await response.json().catch(() => ({}))) as Answer
  if (!response.ok || body.success !== true) throw new Error(body.error ?? `HTTP ${response.status}`)
  return body
}

/** Sends the waiting emails (or one user's), oldest first. Returns how many were sent and how many failed. */
export async function sendPendingGroupSignups(
  db: SupabaseClient,
  options: { userId?: string; limit?: number } = {},
): Promise<{ sent: number; failed: number; left: number }> {
  let query = db
    .from('group_signups')
    .select('email_normalized, attempts')
    .neq('status', 'done')
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(options.limit ?? 50)
  if (options.userId) query = query.eq('user_id', options.userId)
  const { data, error } = await query
  if (error) throw new Error(`group_signups: ${error.message}`)

  let sent = 0
  let failed = 0
  for (const row of (data ?? []) as Pending[]) {
    try {
      const answer = await send(row.email_normalized)
      await db
        .from('group_signups')
        .update({
          status: 'done',
          attempts: row.attempts + 1,
          group_number: answer.group_number ?? null,
          was_already_assigned: answer.was_already_assigned ?? null,
          last_error: null,
          processed_at: new Date().toISOString(),
        })
        .eq('email_normalized', row.email_normalized)
      sent++
    } catch (caught) {
      await db
        .from('group_signups')
        .update({
          status: 'failed',
          attempts: row.attempts + 1,
          last_error: (caught instanceof Error ? caught.message : String(caught)).slice(0, 300),
          processed_at: new Date().toISOString(),
        })
        .eq('email_normalized', row.email_normalized)
      failed++
    }
  }

  const { count } = await db
    .from('group_signups')
    .select('email_normalized', { count: 'exact', head: true })
    .neq('status', 'done')
    .lt('attempts', MAX_ATTEMPTS)
  return { sent, failed, left: count ?? 0 }
}
