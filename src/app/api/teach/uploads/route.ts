import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { youtubeApiUploadsFlag } from '@/lib/env'
import {
  DIRECT_CHUNK_BYTES,
  PROXY_CHUNK_BYTES,
  UPLOADS_PER_DAY,
  UPLOADS_PER_TEACHER_PER_DAY,
} from '@/lib/teach/contracts'
import {
  MANUAL_PATH,
  YouTubeNotConnected,
  createUpload,
  getAccessToken,
  recentUploadCounts,
  updateUpload,
  uploadError,
  uploader,
} from '@/lib/youtube/connection'
import { GoogleApiError, startUploadSession } from '@/lib/youtube/google'
import type { VideoMime } from '@/types/db'

/**
 * Opens a one-click upload to YouTube for a teacher's recording (v2, behind
 * YOUTUBE_API_UPLOADS). The server opens the resumable session with the
 * channel's token and hands the browser only the session address, which is
 * good for this one file: the browser then sends the bytes straight to
 * YouTube, or through /api/teach/uploads/[id] when it cannot.
 *
 * Refused when the teacher is not assigned the question's subject, has
 * started 20 uploads in a day, or the site has started 90 (YouTube allows
 * 100). Every refusal that is about limits points to the manual path, which
 * always works.
 */

const MAX_BYTES = 2_147_483_648

const bodySchema = z.object({
  questionId: z.string().uuid(),
  bytes: z.number().int().min(1).max(MAX_BYTES),
  mime: z.string().max(200),
  title: z.string(),
  description: z.string().default(''),
  privacy: z.enum(['unlisted', 'public', 'private']),
  agree: z.literal(true),
})

/** 'video/webm;codecs=vp9,opus' → 'video/webm'. Only the two containers the recorder makes. */
function baseMime(raw: string): VideoMime | null {
  const base = raw.split(';')[0].trim().toLowerCase()
  return base === 'video/webm' || base === 'video/mp4' ? base : null
}

/** YouTube rejects angle brackets in titles and descriptions; a question about "x < 5" should still upload. */
function youtubeText(text: string): string {
  return text.replace(/</g, '‹').replace(/>/g, '›').trim()
}

export async function POST(request: NextRequest) {
  const who = await uploader()
  if ('response' in who) return who.response
  const { profile } = who

  if (!youtubeApiUploadsFlag()) {
    return uploadError(409, 'api-uploads-off', `Uploading from the site is not switched on yet. ${MANUAL_PATH}`)
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    const agreed = parsed.error.issues.every((issue) => issue.path[0] !== 'agree')
    return uploadError(
      400,
      'bad-request',
      agreed ? 'The upload details were not understood.' : 'Agree to the YouTube Terms of Service first.',
    )
  }
  const input = parsed.data

  const mime = baseMime(input.mime)
  if (!mime) return uploadError(400, 'bad-request', 'Only WebM and MP4 recordings can be uploaded.')

  const title = youtubeText(input.title)
  const titleLength = [...title].length
  if (titleLength < 1 || titleLength > 100) {
    return uploadError(400, 'bad-request', 'The title must be 1 to 100 characters.')
  }
  const description = youtubeText(input.description)
  if (Buffer.byteLength(description, 'utf8') > 5000) {
    return uploadError(400, 'bad-request', 'The description is too long for YouTube (5,000 bytes at most).')
  }

  const supabase = await createClient()
  const { data: allowed, error: allowedError } = await supabase.rpc('can_teach_question', { qid: input.questionId })
  if (allowedError) return uploadError(502, 'youtube-error', 'Your access to this question could not be checked. Try again.')
  if (!allowed) return uploadError(403, 'not-assigned', 'You are not assigned to this question’s subject.')

  let counts
  try {
    counts = await recentUploadCounts(profile.id)
  } catch {
    return uploadError(502, 'youtube-error', 'The upload could not be started. Try again in a moment.')
  }
  if (counts.mine >= UPLOADS_PER_TEACHER_PER_DAY) {
    return uploadError(
      429,
      'rate-limited',
      `You have started ${UPLOADS_PER_TEACHER_PER_DAY} uploads in the last 24 hours, the most allowed. ${MANUAL_PATH}`,
    )
  }
  if (counts.all >= UPLOADS_PER_DAY) {
    return uploadError(429, 'rate-limited', `The site has used today’s YouTube uploads. ${MANUAL_PATH}`)
  }

  // The row goes in first, so a session YouTube refused still counts and its
  // reason is on record for the admins.
  let uploadId: string
  try {
    uploadId = await createUpload({
      questionId: input.questionId,
      teacherId: profile.id,
      title,
      privacy: input.privacy,
      mime,
      bytes: input.bytes,
    })
  } catch {
    return uploadError(502, 'youtube-error', 'The upload could not be started. Try again in a moment.')
  }

  let sessionUri: string
  try {
    sessionUri = await startUploadSession({
      accessToken: await getAccessToken(),
      bytes: input.bytes,
      mime,
      title,
      description,
      privacy: input.privacy,
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error.'
    await updateUpload(uploadId, { status: 'failed', error: reason.slice(0, 500) })

    if (error instanceof YouTubeNotConnected) {
      return uploadError(409, 'not-connected', `The site’s YouTube channel is not connected right now. ${MANUAL_PATH}`)
    }
    if (error instanceof GoogleApiError && error.isRateLimit) {
      // Besides the published 100 a day, YouTube has an unpublished daily
      // upload cap that answers 429: either way, only the manual path is left.
      return uploadError(429, 'rate-limited', `YouTube is not taking more uploads from the site today. ${MANUAL_PATH}`)
    }
    return uploadError(502, 'youtube-error', `YouTube did not open the upload. ${MANUAL_PATH}`)
  }

  // Without the address on record the upload could not be resumed or checked.
  if (!(await updateUpload(uploadId, { session_uri: sessionUri }))) {
    return uploadError(502, 'youtube-error', 'The upload could not be started. Try again in a moment.')
  }

  return Response.json(
    { uploadId, sessionUri, directChunkBytes: DIRECT_CHUNK_BYTES, proxyChunkBytes: PROXY_CHUNK_BYTES },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
