import type { NextRequest } from 'next/server'
import { PROXY_CHUNK_BYTES } from '@/lib/teach/contracts'
import {
  MANUAL_PATH,
  getAccessToken,
  ownUpload,
  updateUpload,
  uploadError,
  uploader,
  type UploadRow,
} from '@/lib/youtube/connection'
import {
  GoogleApiError,
  cancelUploadSession,
  putUploadChunk,
  uploadSessionStatus,
  type UploadSessionState,
} from '@/lib/youtube/google'
import { isValidChunk, parseContentRange } from '@/lib/youtube/upload-math'

/**
 * One upload session.
 *
 * GET     where it stands: { status: 'incomplete', next } | { status: 'done', videoId } | { status: 'expired' }.
 *         Used to resume after a dropped connection or a reload.
 * PUT     the proxy: one chunk of at most 4 MiB, forwarded to YouTube. Only
 *         for browsers that cannot PUT to YouTube directly; every byte through
 *         here counts twice against the site's hosting transfer.
 * DELETE  gives the upload up: YouTube is told to discard it.
 *
 * Only the teacher who started it (or an admin) can touch it; to anyone else
 * it does not exist.
 */

/** A 4 MiB chunk in and out again, well inside a minute. */
export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }

const noStore = { 'Cache-Control': 'no-store' }

async function load(params: Params['params']): Promise<{ row: UploadRow } | { response: Response }> {
  const who = await uploader()
  if ('response' in who) return who
  const { id } = await params
  let row: UploadRow | null
  try {
    row = await ownUpload(who.profile, id)
  } catch {
    return { response: uploadError(502, 'youtube-error', 'The upload could not be read. Try again.') }
  }
  if (!row) return { response: uploadError(404, 'not-found', 'There is no such upload.') }
  return { row }
}

/** The channel's token when it can be had. A session address works without it, but YouTube documents both. */
async function tokenIfAny(): Promise<string | null> {
  try {
    return await getAccessToken()
  } catch {
    return null
  }
}

/** Keeps the upload's row in step with what YouTube just said. */
async function record(row: UploadRow, state: UploadSessionState): Promise<void> {
  if (state.status === 'done' && row.youtube_video_id !== state.videoId) {
    await updateUpload(row.id, { youtube_video_id: state.videoId, status: 'uploading' })
  } else if (state.status === 'expired') {
    await updateUpload(row.id, { status: 'abandoned', session_uri: null, error: 'The upload session expired.' })
  } else if (state.status === 'incomplete' && state.next > 0 && row.status === 'started') {
    await updateUpload(row.id, { status: 'uploading' })
  }
}

function youtubeFailure(error: unknown): Response {
  if (error instanceof GoogleApiError && error.isRateLimit) {
    return uploadError(
      429,
      'rate-limited',
      `YouTube is busy. Wait a minute and the upload carries on from where it stopped. If it keeps happening: ${MANUAL_PATH}`,
    )
  }
  return uploadError(502, 'youtube-error', 'YouTube did not answer as expected. The upload will carry on from where it stopped.')
}

export async function GET(_request: NextRequest, { params }: Params) {
  const loaded = await load(params)
  if ('response' in loaded) return loaded.response
  const { row } = loaded

  if (row.status === 'done' && row.youtube_video_id) {
    return Response.json({ status: 'done', videoId: row.youtube_video_id }, { headers: noStore })
  }
  if (!row.session_uri || row.status === 'failed' || row.status === 'abandoned') {
    return Response.json({ status: 'expired' }, { headers: noStore })
  }

  let state: UploadSessionState
  try {
    state = await uploadSessionStatus(row.session_uri, row.bytes_total, await tokenIfAny())
  } catch (error) {
    return youtubeFailure(error)
  }
  await record(row, state)
  return Response.json(state, { headers: noStore })
}

export async function PUT(request: NextRequest, { params }: Params) {
  // Refuse an oversized body before reading a byte of it.
  const declared = Number(request.headers.get('content-length') ?? NaN)
  if (Number.isFinite(declared) && declared > PROXY_CHUNK_BYTES) {
    return uploadError(413, 'too-large', 'Each part sent through the site must be 4 MiB or less.')
  }

  const loaded = await load(params)
  if ('response' in loaded) return loaded.response
  const { row } = loaded

  if (row.status === 'done') {
    return uploadError(409, 'bad-request', 'This upload has already finished.')
  }
  if (!row.session_uri || row.status === 'failed' || row.status === 'abandoned') {
    return uploadError(409, 'expired', 'This upload has expired. Start it again.')
  }

  const range = parseContentRange(request.headers.get('content-range'))
  if (!range || range.total !== row.bytes_total || !isValidChunk(range, row.bytes_total, PROXY_CHUNK_BYTES)) {
    return uploadError(400, 'bad-request', 'That part of the file is not one YouTube will accept.')
  }

  let body: ArrayBuffer
  try {
    body = await request.arrayBuffer()
  } catch {
    return uploadError(400, 'bad-request', 'The part of the file did not arrive whole.')
  }
  if (body.byteLength > PROXY_CHUNK_BYTES) {
    return uploadError(413, 'too-large', 'Each part sent through the site must be 4 MiB or less.')
  }
  if (body.byteLength !== range.end - range.start + 1) {
    return uploadError(400, 'bad-request', 'The part of the file did not arrive whole.')
  }

  let state: UploadSessionState
  try {
    state = await putUploadChunk(row.session_uri, range, row.bytes_total, body, await tokenIfAny())
  } catch (error) {
    return youtubeFailure(error)
  }
  await record(row, state)
  if (state.status === 'expired') return uploadError(409, 'expired', 'This upload has expired. Start it again.')
  return Response.json(state, { headers: noStore })
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const loaded = await load(params)
  if ('response' in loaded) return loaded.response
  const { row } = loaded

  if (row.status !== 'done') {
    if (row.session_uri) await cancelUploadSession(row.session_uri, await tokenIfAny())
    await updateUpload(row.id, { status: 'abandoned', session_uri: null })
  }
  return Response.json({ ok: true }, { headers: noStore })
}
