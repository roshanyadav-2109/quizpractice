import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  NotTeacherError,
  getCurrentProfile,
  requireTeacher,
  type CurrentProfile,
} from '@/lib/supabase/server'
import {
  youtubeApiUploadsFlag,
  youtubeChannelId,
  youtubeOAuthConfigured,
  youtubeTokenKey,
} from '@/lib/env'
import { GoogleApiError, myChannel, refreshAccessToken } from '@/lib/youtube/google'
import { openToken, sealToken } from '@/lib/youtube/token-crypto'
import type { UploadErrorCode } from '@/lib/teach/contracts'
import type { VideoMime, VideoPrivacy, VideoUploadStatus } from '@/types/db'

/**
 * The site's connection to the Unknown IITians channel: one row in
 * youtube_connection holding the owner's refresh token, sealed with
 * YOUTUBE_TOKEN_KEY.
 *
 * The table has no policies, so only the service role reads it. Every
 * function here uses createAdminClient() and trusts that its caller has
 * already checked who is asking — requireAdmin() for the connect routes,
 * requireTeacher() plus can_teach_question for uploads.
 *
 * What is kept, and for how long (YouTube Developer Policies III.E.4):
 * the channel id, the sealed token and the scopes, for as long as the owner's
 * permission stands. The channel's title is not stored at all. It is fetched
 * from YouTube when the admin screen shows the connection, and held in this
 * server's memory for a few hours, so nothing read from YouTube outlives the
 * 30 days the policies allow. When Google reports the permission withdrawn
 * (invalid_grant), the token and the channel id are blanked at once and the
 * row keeps only the reason, for the admin screen. A daily check
 * (reconfirmConnection) asks Google even when nobody uses the site, so a
 * permission withdrawn on Google's side is noticed within a day or so.
 *
 * The same module keeps the upload sessions (video_uploads), further down.
 */

export class YouTubeNotConnected extends Error {
  constructor(message = 'The YouTube channel is not connected. An admin can connect it in Admin → Educators.') {
    super(message)
    this.name = 'YouTubeNotConnected'
  }
}

interface ConnectionRow {
  channel_id: string
  refresh_token_enc: string
  scopes: string
  connected_at: string
  last_ok_at: string | null
  last_error: string | null
}

export interface YouTubeStatus {
  /** A channel is connected with a permission that has not been withdrawn (as far as the site knows). */
  connected: boolean
  channelId: string | null
  /** Read live from YouTube; null when it could not be reached. */
  channelTitle: string | null
  connectedAt: string | null
  /** Why the connection last failed, until it next works; also why it was dropped. */
  lastError: string | null
  /** YOUTUBE_API_UPLOADS is on. Teachers get the upload button only when it is on and a channel is connected. */
  apiUploads: boolean
  /** YOUTUBE_CHANNEL_ID: the only channel that may be connected, when set. */
  expectedChannelId: string | null
  /** The OAuth client and the token key are set, so Connect can work. */
  oauthConfigured: boolean
}

const TOKEN_MARGIN_MS = 60_000
const TITLE_TTL_MS = 6 * 60 * 60_000
/** The daily check skips a permission that already worked this recently. */
const RECONFIRM_AFTER_MS = 20 * 60 * 60_000

/** This instance's access token. Keyed by the sealed refresh token, so a reconnect drops it. */
let heldToken: { sealed: string; token: string; expires: number } | null = null
/** One refresh at a time: concurrent uploads share it rather than each asking Google. */
let refreshing: { sealed: string; promise: Promise<string> } | null = null
/** The channel title last read from YouTube, for the admin screen. Memory only. */
let heldTitle: { channelId: string; title: string; expires: number } | null = null

async function readConnection(): Promise<ConnectionRow | null> {
  const { data, error } = await createAdminClient()
    .from('youtube_connection')
    .select('channel_id, refresh_token_enc, scopes, connected_at, last_ok_at, last_error')
    .eq('id', true)
    .maybeSingle<ConnectionRow>()
  if (error) throw new Error(`Reading the YouTube connection failed — ${error.message}`)
  return data
}

/** A row with a usable permission. One whose permission was withdrawn keeps only the reason. */
function isLive(row: ConnectionRow | null): boolean {
  return Boolean(row && row.refresh_token_enc && row.channel_id)
}

async function recordOutcome(fields: { last_ok_at?: string; last_error: string | null }): Promise<void> {
  // Bookkeeping only: a failed write must not fail the upload that caused it.
  await createAdminClient().from('youtube_connection').update(fields).eq('id', true)
}

/** The channel the site is connected to, or null. For checking that a video landed on it. */
export async function connectedChannelId(): Promise<string | null> {
  if (!youtubeOAuthConfigured()) return null
  try {
    const row = await readConnection()
    return row && isLive(row) ? row.channel_id : null
  } catch {
    return null
  }
}

/**
 * Whether teachers get the one-click upload: the flag is on and a channel is
 * connected. With the flag off, which it is until Google's audit passes, this
 * never touches the database.
 */
export async function youtubeApiUploadsEnabled(): Promise<boolean> {
  if (!youtubeApiUploadsFlag() || !youtubeOAuthConfigured()) return false
  try {
    return isLive(await readConnection())
  } catch {
    return false
  }
}

/**
 * An access token for the connected channel, refreshed when it is within a
 * minute of expiring. Throws YouTubeNotConnected when there is no connection
 * or the owner's permission has been withdrawn, and GoogleApiError when Google
 * could not be asked.
 */
export async function getAccessToken(): Promise<string> {
  if (!youtubeOAuthConfigured()) {
    throw new YouTubeNotConnected('YouTube is not set up on this server: the OAuth client or the token key is missing.')
  }
  const row = await readConnection()
  if (!row || !isLive(row)) throw new YouTubeNotConnected(row?.last_error ?? undefined)

  const sealed = row.refresh_token_enc
  if (heldToken && heldToken.sealed === sealed && heldToken.expires > Date.now()) return heldToken.token
  if (refreshing?.sealed === sealed) return refreshing.promise

  const promise = refreshFrom(row).finally(() => {
    if (refreshing?.promise === promise) refreshing = null
  })
  refreshing = { sealed, promise }
  return promise
}

async function refreshFrom(row: ConnectionRow): Promise<string> {
  let refreshToken: string
  try {
    refreshToken = openToken(row.refresh_token_enc, youtubeTokenKey())
  } catch {
    const message = 'The saved YouTube sign-in could not be read (YOUTUBE_TOKEN_KEY changed?). Reconnect the channel.'
    await recordOutcome({ last_error: message })
    throw new YouTubeNotConnected(message)
  }

  try {
    const token = await refreshAccessToken(refreshToken)
    heldToken = {
      sealed: row.refresh_token_enc,
      token: token.access_token,
      expires: Date.now() + Math.max(token.expires_in * 1000 - TOKEN_MARGIN_MS, 0),
    }
    // Google rarely rotates the refresh token, but when it does the old one stops working.
    if (token.refresh_token && token.refresh_token !== refreshToken) {
      const resealed = sealToken(token.refresh_token, youtubeTokenKey())
      await createAdminClient().from('youtube_connection').update({ refresh_token_enc: resealed }).eq('id', true)
      heldToken.sealed = resealed
    }
    await recordOutcome({ last_ok_at: new Date().toISOString(), last_error: null })
    return token.access_token
  } catch (error) {
    if (error instanceof GoogleApiError && error.reason === 'invalid_grant') {
      heldToken = null
      heldTitle = null
      const message =
        'Google refused the saved permission: it was withdrawn, or the Cloud project is still in Testing (7-day tokens). Connect the channel again.'
      // The permission is gone, so the data held through it goes too (III.E.4).
      await createAdminClient()
        .from('youtube_connection')
        .update({ refresh_token_enc: '', channel_id: '', channel_title: null, scopes: '', last_error: message })
        .eq('id', true)
      throw new YouTubeNotConnected(message)
    }
    throw error
  }
}

export type ReconfirmOutcome = 'not-configured' | 'not-connected' | 'recent' | 'ok' | 'dropped' | 'unreachable'

/**
 * Proves the saved permission still works, by asking Google for a fresh
 * access token: the daily check (/api/youtube/check) runs this.
 *
 * YouTube Developer Policies III.E.4.b: a permission withdrawn on Google's
 * security page must be noticed, and the data held through it deleted, within
 * 30 days, even if nobody uses the site in between. A refusal (invalid_grant)
 * blanks the token and the channel id through refreshFrom. A permission that
 * worked within the last 20 hours is left alone, so running this more often
 * costs one database read and nothing at Google.
 */
export async function reconfirmConnection(): Promise<ReconfirmOutcome> {
  if (!youtubeOAuthConfigured()) return 'not-configured'
  let row: ConnectionRow | null
  try {
    row = await readConnection()
  } catch {
    return 'unreachable'
  }
  if (!row || !isLive(row)) return 'not-connected'
  if (row.last_ok_at && Date.now() - Date.parse(row.last_ok_at) < RECONFIRM_AFTER_MS) return 'recent'

  try {
    await refreshFrom(row)
    return 'ok'
  } catch (error) {
    return error instanceof YouTubeNotConnected ? 'dropped' : 'unreachable'
  }
}

/**
 * The connection as the admin screen shows it. When connected, the channel's
 * title is read from YouTube (at most every few hours per server), which also
 * proves the connection still works.
 */
export async function getYouTubeStatus(): Promise<YouTubeStatus> {
  const base: YouTubeStatus = {
    connected: false,
    channelId: null,
    channelTitle: null,
    connectedAt: null,
    lastError: null,
    apiUploads: youtubeApiUploadsFlag(),
    expectedChannelId: youtubeChannelId(),
    oauthConfigured: youtubeOAuthConfigured(),
  }

  // Nothing can have been connected without the OAuth client and the key.
  if (!base.oauthConfigured) return base

  let row: ConnectionRow | null
  try {
    row = await readConnection()
  } catch (error) {
    return { ...base, lastError: error instanceof Error ? error.message : 'The connection could not be read.' }
  }
  if (!row) return base
  if (!isLive(row)) return { ...base, lastError: row.last_error }

  const status: YouTubeStatus = {
    ...base,
    connected: true,
    channelId: row.channel_id,
    connectedAt: row.connected_at,
    lastError: row.last_error,
  }

  if (heldTitle && heldTitle.channelId === row.channel_id && heldTitle.expires > Date.now()) {
    return { ...status, channelTitle: heldTitle.title }
  }

  try {
    const channel = await myChannel(await getAccessToken())
    if (!channel) {
      return { ...status, lastError: 'The connected Google account no longer has a YouTube channel. Reconnect.' }
    }
    if (channel.id !== row.channel_id) {
      return { ...status, lastError: `The saved permission now opens another channel (${channel.id}). Reconnect.` }
    }
    heldTitle = { channelId: channel.id, title: channel.title, expires: Date.now() + TITLE_TTL_MS }
    if (row.last_error) await recordOutcome({ last_ok_at: new Date().toISOString(), last_error: null })
    return { ...status, channelTitle: channel.title, lastError: null }
  } catch (error) {
    // Withdrawn just now (the row has been blanked), or unreadable: either way it cannot be used.
    if (error instanceof YouTubeNotConnected) return { ...base, lastError: error.message }
    return { ...status, lastError: error instanceof GoogleApiError ? error.message : 'YouTube could not be reached.' }
  }
}

/**
 * Stores a new connection, replacing any before it. The old refresh token is
 * simply overwritten, not revoked: when the same account reconnects, revoking
 * the old one would revoke the new one with it.
 */
export async function saveConnection(input: {
  channelId: string
  refreshToken: string
  scopes: string
  connectedBy: string
}): Promise<void> {
  const sealed = sealToken(input.refreshToken, youtubeTokenKey())
  const now = new Date().toISOString()
  const { error } = await createAdminClient().from('youtube_connection').upsert(
    {
      id: true,
      channel_id: input.channelId,
      channel_title: null,
      refresh_token_enc: sealed,
      scopes: input.scopes,
      connected_by: input.connectedBy,
      connected_at: now,
      last_ok_at: now,
      last_error: null,
    },
    { onConflict: 'id' },
  )
  if (error) throw new Error(`Saving the YouTube connection failed — ${error.message}`)
  heldToken = null
  heldTitle = null
}

/**
 * Removes the connection and returns the refresh token it held, so the caller
 * can revoke it at Google. Null when there was nothing to remove, or the token
 * could no longer be opened.
 */
export async function deleteConnection(): Promise<{ refreshToken: string | null }> {
  const row = await readConnection()
  const { error } = await createAdminClient().from('youtube_connection').delete().eq('id', true)
  if (error) throw new Error(`Removing the YouTube connection failed — ${error.message}`)
  heldToken = null
  heldTitle = null
  refreshing = null

  if (!row || !isLive(row)) return { refreshToken: null }
  try {
    return { refreshToken: openToken(row.refresh_token_enc, youtubeTokenKey()) }
  } catch {
    return { refreshToken: null }
  }
}

/** The admin screen's sentence for a ?youtube=error&reason=<code> from the connect flow. */
export function youtubeConnectMessage(reason: string | null | undefined): string {
  switch (reason) {
    case 'not-configured':
      return 'YouTube is not set up on this server yet. Add YOUTUBE_OAUTH_CLIENT_ID, YOUTUBE_OAUTH_CLIENT_SECRET and YOUTUBE_TOKEN_KEY (see docs/youtube.md), redeploy, then connect.'
    case 'not-admin':
      return 'Only an admin can connect the YouTube channel.'
    case 'denied':
      return 'The permission was not given on Google’s screen, so nothing changed.'
    case 'state':
      return 'The sign-in took too long or came back to a different address. Start again from this page, on the site’s main address.'
    case 'no-refresh-token':
      return 'Google did not hand over a lasting permission. Remove “QuizPractice” at myaccount.google.com/permissions (for the account that owns the channel), then connect again.'
    case 'scope':
      return 'Both permissions are needed: upload videos, and view the channel. Connect again and leave both boxes ticked.'
    case 'no-channel':
      return 'That Google account has no YouTube channel. Connect again and pick the Unknown IITians channel when Google asks which one.'
    case 'wrong-channel':
      return 'That is not the Unknown IITians channel (YOUTUBE_CHANNEL_ID). Connect again and pick the right channel when Google asks.'
    case 'google':
      return 'Google did not answer as expected. Wait a minute and connect again.'
    case 'save':
      return 'The connection could not be saved. Check SUPABASE_SERVICE_ROLE_KEY and YOUTUBE_TOKEN_KEY on the server, then connect again.'
    case 'site-url':
      return 'NEXT_PUBLIC_SITE_URL is not the address this site is served from, so Google could not send you back here. Set it to the site’s main address, redeploy, and make sure that address plus /api/youtube/callback is a redirect URI on the OAuth client.'
    default:
      return 'Connecting the YouTube channel did not finish. Try again.'
  }
}

// ---------------------------------------------------------------------------
// Upload sessions (video_uploads)
//
// Written only here, with the service role, by the upload routes after they
// have checked the teacher. The session address is a bearer credential for
// that one upload, so it is never selected for anyone but its own teacher's
// requests, and it is cleared once the upload is finished or abandoned.
// ---------------------------------------------------------------------------

export interface UploadRow {
  id: string
  question_id: string | null
  teacher_id: string
  title: string
  privacy: VideoPrivacy
  mime: VideoMime
  bytes_total: number
  session_uri: string | null
  status: VideoUploadStatus
  youtube_video_id: string | null
  error: string | null
  created_at: string
}

/** Every code an upload route answers with: the contract's, plus three for requests that make no sense. */
export type UploadApiCode = UploadErrorCode | 'bad-request' | 'not-found' | 'incomplete'

/** A failed upload API response: `{ error, code }`, never cached. */
export function uploadError(status: number, code: UploadApiCode, error: string): Response {
  return Response.json({ error, code }, { status, headers: { 'Cache-Control': 'no-store' } })
}

/** Where to send a teacher when the one-click upload cannot go ahead. */
export const MANUAL_PATH =
  'Download the recording, upload it in YouTube Studio as Unlisted, and paste its link here instead.'

/**
 * The signed-in teacher (or admin) making an upload request, or the response
 * to send back: 401 when nobody is signed in, 403 for anyone else.
 */
export async function uploader(): Promise<{ profile: CurrentProfile } | { response: Response }> {
  const profile = await getCurrentProfile()
  if (!profile) return { response: uploadError(401, 'not-signed-in', 'Sign in first.') }
  try {
    return { profile: await requireTeacher() }
  } catch (error) {
    if (error instanceof NotTeacherError) return { response: uploadError(403, 'not-teacher', error.message) }
    throw error
  }
}

/**
 * One upload, if it belongs to this teacher (an admin may see any). Anyone
 * else's is answered exactly like one that does not exist.
 */
export async function ownUpload(profile: CurrentProfile, uploadId: string): Promise<UploadRow | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uploadId)) return null
  const { data, error } = await createAdminClient()
    .from('video_uploads')
    .select('id, question_id, teacher_id, title, privacy, mime, bytes_total, session_uri, status, youtube_video_id, error, created_at')
    .eq('id', uploadId)
    .maybeSingle<UploadRow>()
  if (error) throw new Error(`Reading the upload failed — ${error.message}`)
  if (!data || (data.teacher_id !== profile.id && profile.role !== 'admin')) return null
  return data
}

/** Upload sessions started in the last 24 hours: this teacher's, and the whole site's. */
export async function recentUploadCounts(teacherId: string): Promise<{ mine: number; all: number }> {
  const admin = createAdminClient()
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
  const [mine, all] = await Promise.all([
    admin.from('video_uploads').select('id', { count: 'exact', head: true }).eq('teacher_id', teacherId).gte('created_at', since),
    admin.from('video_uploads').select('id', { count: 'exact', head: true }).gte('created_at', since),
  ])
  if (mine.error || all.error) throw new Error('Counting recent uploads failed.')
  return { mine: mine.count ?? 0, all: all.count ?? 0 }
}

export async function createUpload(row: {
  questionId: string
  teacherId: string
  title: string
  privacy: VideoPrivacy
  mime: VideoMime
  bytes: number
}): Promise<string> {
  const { data, error } = await createAdminClient()
    .from('video_uploads')
    .insert({
      question_id: row.questionId,
      teacher_id: row.teacherId,
      title: row.title,
      privacy: row.privacy,
      mime: row.mime,
      bytes_total: row.bytes,
    })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`Recording the upload failed — ${error.message}`)
  return data.id
}

export async function updateUpload(
  uploadId: string,
  fields: Partial<Pick<UploadRow, 'session_uri' | 'status' | 'youtube_video_id' | 'error'>>,
): Promise<boolean> {
  // Mostly bookkeeping: the upload itself lives at YouTube, so callers decide
  // whether a failed write matters. Only the session address does.
  const { error } = await createAdminClient().from('video_uploads').update(fields).eq('id', uploadId)
  return !error
}
