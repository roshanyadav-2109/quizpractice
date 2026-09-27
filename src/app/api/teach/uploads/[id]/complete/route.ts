import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { VIDEO_WAITS_FOR_KEY, answerKeyInDoubt, explanationIsLive, upsertExplanation } from '@/lib/teach/explanations'
import type { SaveExplanationResult } from '@/lib/teach/contracts'
import { canonicalYouTubeUrl } from '@/lib/youtube/url'
import {
  YouTubeNotConnected,
  connectedChannelId,
  getAccessToken,
  ownUpload,
  updateUpload,
  uploadError,
  uploader,
  type UploadRow,
} from '@/lib/youtube/connection'
import { GoogleApiError, listVideos, uploadSessionStatus, type VideoResource } from '@/lib/youtube/google'

/**
 * Finishes a one-click upload: confirms with YouTube that the video exists on
 * the connected channel, marks the upload done, and attaches the video to the
 * teacher's explanation for the question (status unchanged: a draft stays a
 * draft, a live one goes through the usual review rules).
 *
 * Answers { videoId, result, warnings }. `result` is the explanation save;
 * when it is not ok the video is still safely on YouTube, and its link can be
 * pasted in once the problem is fixed. A Private video is not attached:
 * students could not play it.
 */

const bodySchema = z.object({ videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/).optional() }).nullable()

type Params = { params: Promise<{ id: string }> }

/** The finished video's id: already on record, else asked of YouTube, else what the browser saw. */
async function finishedVideoId(row: UploadRow, fromBrowser: string | undefined, token: string): Promise<string | 'incomplete' | null> {
  if (row.youtube_video_id) return row.youtube_video_id
  if (row.session_uri) {
    try {
      const state = await uploadSessionStatus(row.session_uri, row.bytes_total, token)
      if (state.status === 'done') return state.videoId
      if (state.status === 'incomplete') return 'incomplete'
    } catch {
      // Some sessions stop answering once finished; the browser's copy of the id is next best.
    }
  }
  return fromBrowser ?? null
}

export async function POST(request: NextRequest, { params }: Params) {
  const who = await uploader()
  if ('response' in who) return who.response
  const { id } = await params

  let row: UploadRow | null
  try {
    row = await ownUpload(who.profile, id)
  } catch {
    return uploadError(502, 'youtube-error', 'The upload could not be read. Try again.')
  }
  if (!row) return uploadError(404, 'not-found', 'There is no such upload.')
  if (!row.question_id) {
    return uploadError(409, 'not-assigned', 'The question this video was for has been removed.')
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return uploadError(400, 'bad-request', 'That is not a YouTube video id.')

  const supabase = await createClient()
  const { data: allowed } = await supabase.rpc('can_teach_question', { qid: row.question_id })
  if (!allowed) return uploadError(403, 'not-assigned', 'You are not assigned to this question’s subject.')

  let token: string
  try {
    token = await getAccessToken()
  } catch (error) {
    if (error instanceof YouTubeNotConnected) {
      return uploadError(409, 'not-connected', 'The site’s YouTube channel is not connected right now, so the upload cannot be checked.')
    }
    return uploadError(502, 'youtube-error', 'YouTube could not be reached. Try again in a minute.')
  }

  const videoId = await finishedVideoId(row, parsed.data?.videoId, token)
  if (videoId === 'incomplete') {
    return uploadError(409, 'incomplete', 'YouTube has not received the whole file yet. Carry on with the upload.')
  }
  if (!videoId) return uploadError(409, 'expired', 'YouTube has no finished video for this upload.')

  let video: VideoResource | undefined
  try {
    ;[video] = await listVideos([videoId], { accessToken: token })
  } catch (error) {
    if (error instanceof GoogleApiError && error.isRateLimit) {
      return uploadError(429, 'rate-limited', 'YouTube is busy. Try finishing again in a minute.')
    }
    return uploadError(502, 'youtube-error', 'YouTube could not be asked about the video. Try again in a minute.')
  }
  const channelId = await connectedChannelId()
  if (!video || !channelId || video.snippet?.channelId !== channelId) {
    return uploadError(409, 'youtube-error', 'That video is not on the connected channel.')
  }

  await updateUpload(row.id, { status: 'done', youtube_video_id: videoId, session_uri: null, error: null })

  const warnings: string[] = []
  let result: SaveExplanationResult
  const privacy = video.status?.privacyStatus
  if (privacy === 'private') {
    result = {
      ok: false,
      error:
        row.privacy === 'private'
          ? 'The video is on YouTube as Private, so students cannot watch it. Set it to Unlisted in YouTube Studio, then paste its link.'
          : 'YouTube has locked this upload as Private, which it does until the site passes Google’s review. Delete it in YouTube Studio, upload the recording there by hand as Unlisted, and paste that link.',
    }
  } else if (video.status?.embeddable === false) {
    result = {
      ok: false,
      error: 'Embedding is off for the video. Tick Allow embedding for it in YouTube Studio, then paste its link.',
    }
  } else if ((await answerKeyInDoubt(row.question_id)) && (await explanationIsLive(row.question_id))) {
    // As with a pasted link: a new video on a live explanation goes out at
    // once, so it waits while the answer key is in doubt. The upload is done,
    // so the teacher can paste its link once the report is resolved.
    result = { ok: false, error: VIDEO_WAITS_FOR_KEY }
  } else {
    result = await upsertExplanation({
      questionId: row.question_id,
      videoUrl: canonicalYouTubeUrl({ id: videoId, start: null }),
      intent: 'keep',
    })
    if (video.status?.uploadStatus === 'uploaded') {
      warnings.push('YouTube is still processing the video. It may take a few minutes before it plays.')
    }
  }

  return Response.json({ videoId, result, warnings }, { headers: { 'Cache-Control': 'no-store' } })
}
