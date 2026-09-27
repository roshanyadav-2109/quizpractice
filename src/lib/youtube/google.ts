import 'server-only'
import { publicEnv, youtubeOAuthClient } from '@/lib/env'
import { formatContentRange, formatStatusRange, nextOffsetFromRange, type ByteRange } from '@/lib/youtube/upload-math'
import type { VideoPrivacy } from '@/types/db'

/**
 * Every request the site makes to Google for YouTube, in one place: the OAuth
 * token endpoint, revocation, the Data API reads, oEmbed and the resumable
 * upload protocol.
 *
 * Each call has a 15 s timeout and bypasses Next's fetch cache. Failures come
 * back as GoogleApiError with the HTTP status and Google's own reason code
 * ('invalid_grant', 'quotaExceeded', …) and never with a token in the message,
 * so a caller may log one safely.
 */

const TIMEOUT_MS = 15_000
/** A proxied chunk is up to 4 MiB; give it most of the route's 60 s. */
const CHUNK_TIMEOUT_MS = 45_000

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const DATA_API = 'https://www.googleapis.com/youtube/v3'
const UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos'
const OEMBED_URL = 'https://www.youtube.com/oembed'

/** Upload videos, and read the channel and its videos back. Nothing that can delete or edit. */
export const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
] as const

/** YouTube's "Education" category, which every explanation is filed under. */
const EDUCATION_CATEGORY = '27'

export class GoogleApiError extends Error {
  /** The HTTP status; 0 when Google could not be reached or took too long. */
  readonly status: number
  /** Google's reason code when it gave one: 'invalid_grant', 'quotaExceeded', 'network', 'timeout'… */
  readonly reason: string | null

  constructor(status: number, reason: string | null, message: string) {
    super(message)
    this.name = 'GoogleApiError'
    this.status = status
    this.reason = reason
  }

  /** YouTube is refusing more work for now: the daily quota, the upload cap, or plain rate limiting. */
  get isRateLimit(): boolean {
    return (
      this.status === 429 ||
      ['quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded', 'userRateLimitExceeded', 'uploadLimitExceeded'].includes(
        this.reason ?? '',
      )
    )
  }
}

/** The site's own origin, which YouTube needs to allow the browser to upload straight to it. */
export function siteOrigin(): string {
  return new URL(publicEnv.siteUrl).origin
}

/** Where Google sends the owner back to. Must match the OAuth client's redirect URI exactly. */
export function youtubeRedirectUri(): string {
  return new URL('/api/youtube/callback', siteOrigin()).toString()
}

async function send(url: string, init: RequestInit, timeoutMs = TIMEOUT_MS): Promise<Response> {
  try {
    return await fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) })
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    throw new GoogleApiError(
      0,
      timedOut ? 'timeout' : 'network',
      timedOut ? 'Google took too long to answer.' : 'Google could not be reached.',
    )
  }
}

/** Google's error body, as a GoogleApiError. Both shapes: OAuth's flat one and the Data API's nested one. */
async function failure(response: Response, what: string): Promise<GoogleApiError> {
  let reason: string | null = null
  let detail = ''
  try {
    const body = (await response.json()) as {
      error?: string | { message?: string; status?: string; errors?: { reason?: string; message?: string }[] }
      error_description?: string
    }
    if (typeof body.error === 'string') {
      reason = body.error
      detail = body.error_description ?? ''
    } else if (body.error) {
      reason = body.error.errors?.[0]?.reason ?? body.error.status ?? null
      detail = body.error.message ?? body.error.errors?.[0]?.message ?? ''
    }
  } catch {
    // Not JSON: the status says enough.
  }
  const message = `${what} failed (HTTP ${response.status}${reason ? `, ${reason}` : ''})${detail ? `: ${detail}` : ''}`
  return new GoogleApiError(response.status, reason, message.slice(0, 500))
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

/**
 * Carries the OAuth state and the PKCE verifier from /api/youtube/connect to
 * the callback: httpOnly, scoped to /api/youtube, gone after ten minutes.
 * Lax, because the callback is a top-level navigation back from Google.
 */
export const OAUTH_COOKIE = { name: 'qp-youtube-oauth', path: '/api/youtube', maxAge: 600 } as const

export function oauthCookieOptions(maxAge: number = OAUTH_COOKIE.maxAge) {
  return {
    httpOnly: true,
    secure: siteOrigin().startsWith('https:'),
    sameSite: 'lax' as const,
    path: OAUTH_COOKIE.path,
    maxAge,
  }
}

export interface TokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope?: string
  token_type?: string
}

/**
 * The Google consent screen for connecting the channel.
 *
 * offline + consent: Google hands out a refresh token only on a fresh consent.
 * select_account: the owner picks the Google account, and YouTube then asks
 * which channel, which is where the Unknown IITians Brand channel is chosen.
 */
export function authorizationUrl({ state, codeChallenge }: { state: string; codeChallenge: string }): string {
  const { clientId } = youtubeOAuthClient()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: youtubeRedirectUri(),
    response_type: 'code',
    scope: YOUTUBE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent select_account',
    include_granted_scopes: 'false',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })
  return `${AUTHORIZE_URL}?${params}`
}

async function tokenRequest(fields: Record<string, string>, what: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = youtubeOAuthClient()
  const response = await send(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...fields, client_id: clientId, client_secret: clientSecret }),
  })
  if (!response.ok) throw await failure(response, what)
  const body = (await response.json()) as TokenResponse
  if (!body.access_token) throw new GoogleApiError(502, null, `${what} returned no access token.`)
  return body
}

/** Trades the one-time code from the callback, with its PKCE verifier, for tokens. */
export function exchangeCode({ code, codeVerifier }: { code: string; codeVerifier: string }): Promise<TokenResponse> {
  return tokenRequest(
    { code, code_verifier: codeVerifier, redirect_uri: youtubeRedirectUri(), grant_type: 'authorization_code' },
    'Exchanging the sign-in code',
  )
}

/** A fresh access token from the stored refresh token. 'invalid_grant' means the owner's permission is gone. */
export function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  return tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' }, 'Refreshing the YouTube token')
}

/**
 * Withdraws the site's permission at Google. True when Google confirmed it or
 * the token was already dead; false when Google could not be asked.
 *
 * Revoking any token of a grant revokes the whole grant, so this is only for
 * disconnecting: never for tidying up an old token after a reconnect by the
 * same account, which would kill the new one too.
 */
export async function revokeToken(token: string): Promise<boolean> {
  try {
    const response = await send(REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    })
    return response.ok || response.status === 400
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Data API reads
// ---------------------------------------------------------------------------

export interface ChannelInfo {
  id: string
  title: string
}

/** The channel the access token belongs to: the one the owner picked on the consent screen. */
export async function myChannel(accessToken: string): Promise<ChannelInfo | null> {
  const response = await send(`${DATA_API}/channels?part=snippet&mine=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) throw await failure(response, 'Reading the connected channel')
  const body = (await response.json()) as { items?: { id: string; snippet?: { title?: string } }[] }
  const channel = body.items?.[0]
  return channel ? { id: channel.id, title: channel.snippet?.title ?? '' } : null
}

export interface VideoResource {
  id: string
  snippet?: { title?: string; channelId?: string; channelTitle?: string }
  status?: {
    privacyStatus?: VideoPrivacy
    embeddable?: boolean
    /** 'uploaded' while YouTube processes it, then 'processed'; or 'failed', 'rejected', 'deleted'. */
    uploadStatus?: string
    madeForKids?: boolean
  }
}

/**
 * Videos by id, with their channel and visibility. With an API key YouTube
 * returns public and unlisted videos only; with the owner's token it also
 * returns the channel's private ones.
 */
export async function listVideos(
  ids: string[],
  auth: { apiKey: string } | { accessToken: string },
): Promise<VideoResource[]> {
  // No maxResults: YouTube documents it as unsupported alongside id.
  const params = new URLSearchParams({ part: 'snippet,status', id: ids.join(',') })
  const headers: Record<string, string> = {}
  if ('apiKey' in auth) params.set('key', auth.apiKey)
  else headers.Authorization = `Bearer ${auth.accessToken}`

  const response = await send(`${DATA_API}/videos?${params}`, { headers })
  if (!response.ok) throw await failure(response, 'Looking up the video')
  const body = (await response.json()) as { items?: VideoResource[] }
  return body.items ?? []
}

export interface OEmbedResult {
  /** 200 found and embeddable; 401 or 403 private or embedding off; 400 or 404 no such video. */
  status: number
  title: string | null
  authorName: string | null
}

/**
 * The public embed card for a video: no key, no quota, and it tells whether
 * the video can be embedded, but not which channel id it is on.
 */
export async function oEmbed(videoId: string): Promise<OEmbedResult> {
  const params = new URLSearchParams({ url: `https://www.youtube.com/watch?v=${videoId}`, format: 'json' })
  const response = await send(`${OEMBED_URL}?${params}`, {})
  if (!response.ok) return { status: response.status, title: null, authorName: null }
  try {
    const body = (await response.json()) as { title?: string; author_name?: string }
    return { status: 200, title: body.title ?? null, authorName: body.author_name ?? null }
  } catch {
    return { status: 502, title: null, authorName: null }
  }
}

// ---------------------------------------------------------------------------
// Resumable upload
// ---------------------------------------------------------------------------

export interface UploadDetails {
  accessToken: string
  bytes: number
  mime: string
  title: string
  description: string
  privacy: VideoPrivacy
}

/**
 * Opens a resumable upload and returns its session address.
 *
 * Opened from the server, where the token lives. Sending the site's Origin
 * asks YouTube to allow that origin on the session, so the browser can then
 * PUT the bytes straight to it without the token ever leaving the server.
 */
export async function startUploadSession(details: UploadDetails): Promise<string> {
  const params = new URLSearchParams({ uploadType: 'resumable', part: 'snippet,status' })
  const response = await send(`${UPLOAD_URL}?${params}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${details.accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(details.bytes),
      'X-Upload-Content-Type': details.mime,
      Origin: siteOrigin(),
    },
    body: JSON.stringify({
      snippet: { title: details.title, description: details.description, categoryId: EDUCATION_CATEGORY },
      status: { privacyStatus: details.privacy, selfDeclaredMadeForKids: false, embeddable: true },
    }),
  })
  if (!response.ok) throw await failure(response, 'Starting the upload')
  const location = response.headers.get('location')
  if (!location || !location.startsWith('https://')) {
    throw new GoogleApiError(502, null, 'YouTube did not return an upload address.')
  }
  return location
}

/** Where a resumable upload stands. */
export type UploadSessionState =
  | { status: 'incomplete'; next: number }
  | { status: 'done'; videoId: string }
  | { status: 'expired' }

/** Reads YouTube's answer to a PUT on the session: more wanted, finished, or gone. */
async function sessionState(response: Response, what: string): Promise<UploadSessionState> {
  if (response.status === 308) {
    const next = nextOffsetFromRange(response.headers.get('range'))
    if (next === null) throw new GoogleApiError(502, null, `${what}: YouTube sent a Range it could not read.`)
    return { status: 'incomplete', next }
  }
  if (response.status === 200 || response.status === 201) {
    const body = (await response.json().catch(() => null)) as { id?: unknown } | null
    const videoId = typeof body?.id === 'string' ? body.id : null
    if (!videoId) throw new GoogleApiError(502, null, `${what}: YouTube finished but sent no video id.`)
    return { status: 'done', videoId }
  }
  // A session lives about a week; after that, or once cancelled, it is gone.
  if (response.status === 404 || response.status === 410) return { status: 'expired' }
  throw await failure(response, what)
}

function sessionHeaders(accessToken: string | null, contentRange: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Range': contentRange }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  return headers
}

/** Asks how far an upload got, with an empty PUT. */
export async function uploadSessionStatus(
  sessionUri: string,
  total: number,
  accessToken: string | null,
): Promise<UploadSessionState> {
  const response = await send(sessionUri, {
    method: 'PUT',
    headers: sessionHeaders(accessToken, formatStatusRange(total)),
    body: new Uint8Array(0),
    // A 308 here means "resume incomplete", not a redirect.
    redirect: 'manual',
  })
  return sessionState(response, 'Checking the upload')
}

/** Forwards one chunk the browser sent through the proxy. */
export async function putUploadChunk(
  sessionUri: string,
  range: ByteRange,
  total: number,
  body: ArrayBuffer,
  accessToken: string | null,
): Promise<UploadSessionState> {
  const response = await send(
    sessionUri,
    {
      method: 'PUT',
      headers: sessionHeaders(accessToken, formatContentRange(range, total)),
      body,
      redirect: 'manual',
    },
    CHUNK_TIMEOUT_MS,
  )
  return sessionState(response, 'Sending part of the upload')
}

/** Tells YouTube to throw an unfinished upload away. Best effort: an abandoned session expires on its own. */
export async function cancelUploadSession(sessionUri: string, accessToken: string | null): Promise<void> {
  try {
    await send(sessionUri, {
      method: 'DELETE',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      redirect: 'manual',
    })
  } catch {
    // Nothing to do: it lapses by itself within a week.
  }
}
