import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireStaff, NotStaffError } from '@/lib/supabase/server'
import { signUpload } from '@/lib/cloudinary-server'
import { buildPublicId } from '@/lib/cloudinary'

/**
 * Issues a one-shot signature so the browser can upload straight to Cloudinary.
 *
 * The API secret never leaves the server, and the signature only covers the
 * exact public_id and transformation below — an upload cannot be redirected to
 * a different path or made to skip the size cap.
 */

const bodySchema = z.object({
  subjectSlug: z.string().min(1),
  examSlug: z.string().min(1),
  programSlug: z.string().nullish(),
  sessionDate: z.string().nullish(),
  setCode: z.string().nullish(),
  name: z.string().min(1).max(80),
})

export async function POST(request: NextRequest) {
  try {
    await requireStaff()
  } catch (error) {
    if (error instanceof NotStaffError) {
      return Response.json({ error: error.message }, { status: 403 })
    }
    throw error
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: 'Missing upload details.' }, { status: 400 })
  }

  try {
    const publicId = buildPublicId({
      programSlug: parsed.data.programSlug ?? null,
      subjectSlug: parsed.data.subjectSlug,
      examSlug: parsed.data.examSlug,
      sessionDate: parsed.data.sessionDate ?? null,
      setCode: parsed.data.setCode ?? null,
      name: parsed.data.name,
    })

    const signature = signUpload({ publicId })

    return Response.json({
      publicId,
      ...signature,
      // The browser must send exactly these alongside the file.
      transformation: 'c_limit,w_1600',
    })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not sign the upload.' },
      { status: 500 },
    )
  }
}
