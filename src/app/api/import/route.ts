import type { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireStaff, NotStaffError } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { importPaper, ImportError } from '@/lib/import-paper'

/**
 * Admin JSON import.
 *
 * Uses the service-role client so the whole paper lands in one pass, which
 * means the staff check above it is the only thing standing between a request
 * and unrestricted writes — it runs first, and it throws rather than returning
 * a falsy value that could be ignored by accident.
 */
export async function POST(request: NextRequest) {
  let profile
  try {
    profile = await requireStaff()
  } catch (error) {
    if (error instanceof NotStaffError) {
      return Response.json({ error: error.message }, { status: 403 })
    }
    throw error
  }

  let payload: { paper?: unknown; uploadImages?: boolean; publish?: boolean }
  try {
    payload = await request.json()
  } catch {
    return Response.json({ error: 'Expected a JSON body.' }, { status: 400 })
  }

  try {
    const result = await importPaper(payload.paper, createAdminClient(), {
      uploadImages: Boolean(payload.uploadImages),
      publish: payload.publish !== false,
      createdBy: profile.id,
    })

    revalidatePath('/browse')
    revalidatePath('/admin/papers')
    revalidatePath('/')

    return Response.json({ ok: true, result })
  } catch (error) {
    if (error instanceof ImportError) {
      return Response.json({ error: error.message, issues: error.issues }, { status: 422 })
    }
    return Response.json(
      { error: error instanceof Error ? error.message : 'Import failed.' },
      { status: 500 },
    )
  }
}
