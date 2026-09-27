'use server'

import { revalidatePath } from 'next/cache'
import { createClient, requireStaff, type CurrentProfile } from '@/lib/supabase/server'
import { TAG, refresh } from '@/lib/cache'
import { ROUTES } from '@/lib/teach/contracts'
import type { ActionState } from '@/app/admin/actions'

/**
 * An admin's decision on one group of copies (one fingerprint):
 *
 *   allow  share one explanation across every copy, even when a set holds the
 *          question twice (normally a sign of an import error)
 *   block  never share: each copy is explained on its own
 *   null   forget the decision and go back to the automatic rule
 *
 * Staff only, like the rest of the duplicates screen; the table's policy says
 * the same.
 */

const FINGERPRINT = /^v\d+:[0-9a-f]{32}$/
const NOTE_MAX = 500

function fail(error: string): ActionState {
  return { ok: false, error }
}

export async function setFingerprintDecision(
  fingerprint: string,
  decision: 'allow' | 'block' | null,
  note?: string,
): Promise<ActionState> {
  let profile: CurrentProfile
  try {
    profile = await requireStaff()
  } catch {
    return fail('You need a contributor or admin account.')
  }
  if (!FINGERPRINT.test(fingerprint ?? '')) return fail('That group was not found.')
  if (decision !== 'allow' && decision !== 'block' && decision !== null) return fail('Allow, block or clear.')
  const cleanNote = typeof note === 'string' ? note.trim() : ''
  if (cleanNote.length > NOTE_MAX) return fail(`Keep the note under ${NOTE_MAX} characters.`)

  const supabase = await createClient()
  const { error } =
    decision === null
      ? await supabase.from('fingerprint_overrides').delete().eq('fingerprint', fingerprint)
      : await supabase.from('fingerprint_overrides').upsert(
          {
            fingerprint,
            decision,
            note: cleanNote || null,
            decided_by: profile.id,
            decided_at: new Date().toISOString(),
          },
          { onConflict: 'fingerprint' },
        )
  if (error) return fail(error.message)

  // Sharing decides which copies show an explanation written on another copy,
  // and such an explanation always carries this fingerprint. With none live,
  // nothing students see has changed.
  const { count, error: countError } = await supabase
    .from('solutions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'approved')
    .eq('fingerprint', fingerprint)
  if (countError || (count ?? 0) > 0) refresh(TAG.solutions)

  revalidatePath(ROUTES.adminDuplicates)
  return { ok: true }
}
