import { ROUTES, type SaveExplanationResult, type UploadErrorCode } from '@/lib/teach/contracts'
import { formatContentRange, nextChunk, nextOffsetFromRange, type ByteRange } from '@/lib/youtube/upload-math'
import type { VideoPrivacy } from '@/types/db'

/**
 * The browser half of the one-click YouTube upload.
 *
 * The server opens a resumable session and returns its address. The file
 * then goes up in chunks:
 *
 *   direct  8 MiB PUTs straight to YouTube: fastest, and costs the site
 *           nothing. Needs YouTube to allow our origin on the session.
 *   proxy   4 MiB PUTs through /api/teach/uploads/[id], used when the first
 *           direct chunk is blocked (a CORS or network failure, or a refusal).
 *           Slower, and every byte counts against the site's hosting
 *           transfer, so it is the last resort.
 *
 * A dropped connection is retried with backoff from wherever YouTube says it
 * got to; a reload resumes through resumeYouTubeUpload with the same file.
 * What is needed to resume ({uploadId, sessionUri, bytes}) is kept in
 * localStorage; the recording itself is the studio's to keep (IndexedDB).
 *
 * Browser only.
 */

export type UploadTransport = 'direct' | 'proxy'

export interface UploadProgress {
  /** Bytes YouTube has, plus the ones in flight. */
  sent: number
  total: number
  transport: UploadTransport
}

export interface UploadOutcome {
  videoId: string
  /** Attaching the video to the explanation. Not ok: the video is on YouTube, but was not attached. */
  result: SaveExplanationResult
  /** Worth telling the teacher, e.g. that YouTube is still processing the video. */
  warnings: string[]
  transport: UploadTransport
}

export interface UploadHandle {
  /** Known once the server has opened the session; null until then. */
  readonly uploadId: string | null
  /** Stops sending. The upload can be resumed later from where it stopped. */
  cancel(): void
  done: Promise<UploadOutcome>
}

export type UploadFailureCode = UploadErrorCode | 'bad-request' | 'not-found' | 'incomplete' | 'network' | 'cancelled' | 'mismatch'

export class YouTubeUploadError extends Error {
  readonly code: UploadFailureCode
  /** HTTP status of the failed request; 0 when it never got an answer. */
  readonly status: number

  constructor(code: UploadFailureCode, message: string, status = 0) {
    super(message)
    this.name = 'YouTubeUploadError'
    this.code = code
    this.status = status
  }
}

export interface StartUploadOptions {
  questionId: string
  blob: Blob
  title: string
  description: string
  privacy: VideoPrivacy
  onProgress?: (progress: UploadProgress) => void
}

/** What is kept in localStorage to resume an upload after a reload. */
export interface PendingUpload {
  uploadId: string
  questionId: string
  /** Absent when resuming on another device: then only the proxy can be used. */
  sessionUri: string | null
  bytes: number
  /** Bytes YouTube had confirmed when last heard from. */
  sent: number
  startedAt: number
}

const DIRECT_BYTES = 8_388_608
const PROXY_BYTES = 4_194_304
/** A chunk's own time limit: 8 MiB over a slow connection. */
const CHUNK_TIMEOUT_MS = 5 * 60_000
/** Waits between retries after a dropped connection. */
const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 20_000, 30_000]
/** YouTube keeps a resumable session for about a week. */
const SESSION_LIFE_MS = 7 * 24 * 60 * 60_000

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Opens a session for the recording and uploads it. */
export function startYouTubeUpload(options: StartUploadOptions): UploadHandle {
  const job = new UploadJob(options.blob, options.onProgress)
  job.run(async () => {
    const mime = baseMime(options.blob.type)
    if (!mime) throw new YouTubeUploadError('bad-request', 'Only WebM and MP4 recordings can be uploaded.')

    const opened = await json<{ uploadId: string; sessionUri: string; directChunkBytes: number; proxyChunkBytes: number }>(
      fetch(ROUTES.apiUploads, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: options.questionId,
          bytes: options.blob.size,
          mime,
          title: options.title,
          description: options.description,
          privacy: options.privacy,
          agree: true,
        }),
        signal: job.signal,
      }),
    )
    job.adopt({
      uploadId: opened.uploadId,
      questionId: options.questionId,
      sessionUri: opened.sessionUri,
      bytes: options.blob.size,
      sent: 0,
      startedAt: Date.now(),
    })
    job.directBytes = opened.directChunkBytes || DIRECT_BYTES
    job.proxyBytes = opened.proxyChunkBytes || PROXY_BYTES
    return 0
  })
  return job.handle()
}

/**
 * Carries on with an upload after a reload or a failure. `blob` must be the
 * same recording: its size is checked against the one the upload was opened
 * for.
 */
export function resumeYouTubeUpload(
  uploadId: string,
  blob: Blob,
  onProgress?: (progress: UploadProgress) => void,
): UploadHandle {
  const job = new UploadJob(blob, onProgress)
  job.run(async () => {
    const saved = readPending()[uploadId]
    if (saved && saved.bytes !== blob.size) {
      throw new YouTubeUploadError('mismatch', 'This is not the recording that upload was started with.')
    }
    job.adopt(
      saved ?? { uploadId, questionId: '', sessionUri: null, bytes: blob.size, sent: 0, startedAt: Date.now() },
    )
    const state = await job.status()
    return state.status === 'incomplete' ? state.next : state
  })
  return job.handle()
}

/** The newest unfinished upload for a question in this browser, if any: offer to resume it. */
export function pendingYouTubeUpload(questionId: string): PendingUpload | null {
  const found = Object.values(readPending())
    .filter((entry) => entry.questionId === questionId)
    .sort((a, b) => b.startedAt - a.startedAt)
  return found[0] ?? null
}

/** Forgets an upload in this browser without touching YouTube. */
export function forgetYouTubeUpload(uploadId: string): void {
  const all = readPending()
  delete all[uploadId]
  writePending(all)
}

/** Gives an upload up for good: YouTube discards what it has, and this browser forgets it. */
export async function abandonYouTubeUpload(uploadId: string): Promise<void> {
  forgetYouTubeUpload(uploadId)
  await fetch(ROUTES.apiUpload(uploadId), { method: 'DELETE' }).catch(() => undefined)
}

// ---------------------------------------------------------------------------
// The upload itself
// ---------------------------------------------------------------------------

type SessionState = { status: 'incomplete'; next: number } | { status: 'done'; videoId: string } | { status: 'expired' }

/** What one PUT achieved. videoId is null when YouTube finished but the answer could not be read. */
type PutResult = { status: 'incomplete'; next: number | null } | { status: 'done'; videoId: string | null }

class UploadJob {
  private readonly blob: Blob
  private readonly onProgress?: (progress: UploadProgress) => void
  private readonly controller = new AbortController()
  private record: PendingUpload | null = null
  private transport: UploadTransport = 'direct'
  private done!: Promise<UploadOutcome>
  directBytes = DIRECT_BYTES
  proxyBytes = PROXY_BYTES

  constructor(blob: Blob, onProgress?: (progress: UploadProgress) => void) {
    this.blob = blob
    this.onProgress = onProgress
  }

  get signal(): AbortSignal {
    return this.controller.signal
  }

  handle(): UploadHandle {
    const uploadId = () => this.record?.uploadId ?? null
    return {
      get uploadId() {
        return uploadId()
      },
      cancel: () => this.controller.abort(),
      done: this.done,
    }
  }

  adopt(record: PendingUpload): void {
    this.record = record
    if (!record.sessionUri) this.transport = 'proxy'
    savePending(record)
  }

  /** Runs `begin` (open or look up the session, giving the offset to send from), then the chunks, then completion. */
  run(begin: () => Promise<number | SessionState>): void {
    this.done = (async () => {
      try {
        const start = await begin()
        let videoId: string | null
        if (typeof start === 'number') {
          videoId = await this.send(start)
        } else if (start.status === 'done') {
          videoId = start.videoId
        } else {
          throw expired()
        }
        return await this.complete(videoId)
      } catch (error) {
        if (this.signal.aborted) throw new YouTubeUploadError('cancelled', 'The upload was stopped. It can carry on later.')
        if (error instanceof YouTubeUploadError && error.code === 'expired' && this.record) {
          forgetYouTubeUpload(this.record.uploadId)
        }
        throw error instanceof YouTubeUploadError
          ? error
          : new YouTubeUploadError('network', 'The upload stopped. Check the connection, then carry on.')
      }
    })()
  }

  /** Sends from `offset` to the end. Returns the video id when YouTube reported it. */
  private async send(offset: number): Promise<string | null> {
    const total = this.blob.size
    let proven = false
    let failures = 0

    for (;;) {
      this.report(offset, 0)
      const chunk = nextChunk(offset, total, this.transport === 'direct' ? this.directBytes : this.proxyBytes)
      if (!chunk) {
        // Every byte is out but YouTube has not said it is finished: ask.
        const state = await this.status()
        if (state.status === 'done') return state.videoId
        if (state.status === 'expired') throw expired()
        if (state.next >= total) throw new YouTubeUploadError('youtube-error', 'YouTube did not finish the upload.')
        offset = state.next
        continue
      }

      try {
        const result = this.transport === 'direct' ? await this.putDirect(chunk) : await this.putProxy(chunk)
        proven = true
        failures = 0
        if (result.status === 'done') return result.videoId
        offset = result.next ?? (await this.syncOffset())
        this.remember(offset)
      } catch (error) {
        if (this.signal.aborted) throw error

        // The first direct chunk failing means this browser (or YouTube) will
        // not allow the direct route at all: switch to the proxy for good.
        if (this.transport === 'direct' && !proven && isRouteRefusal(error)) {
          console.info('[youtube upload] direct upload refused; sending through the site instead')
          this.transport = 'proxy'
          offset = await this.syncOffset()
          continue
        }
        if (!isRetryable(error) || failures >= BACKOFF_MS.length) throw error
        await this.pause(BACKOFF_MS[failures++])
        // Still offline: keep the last confirmed offset and let the next try count as a failure.
        offset = await this.syncOffset().catch((syncError: unknown) => {
          if (this.signal.aborted || !isRetryable(syncError)) throw syncError
          return offset
        })
      }
    }
  }

  private async syncOffset(): Promise<number> {
    const state = await this.status()
    if (state.status === 'expired') throw expired()
    if (state.status === 'done') return this.blob.size
    return state.next
  }

  /** Asks the server where the upload stands. */
  async status(): Promise<SessionState> {
    return json<SessionState>(fetch(ROUTES.apiUpload(this.id()), { cache: 'no-store', signal: this.signal }))
  }

  private async putDirect(chunk: ByteRange): Promise<PutResult> {
    const reply = await this.put(this.record!.sessionUri!, chunk)
    if (reply.status === 308) {
      // Readable only if YouTube exposes Range to our origin; otherwise ask the server.
      const range = reply.header('range')
      return { status: 'incomplete', next: range === null ? null : nextOffsetFromRange(range) }
    }
    if (reply.status === 200 || reply.status === 201) {
      return { status: 'done', videoId: readVideoId(reply.text) }
    }
    if (reply.status === 404 || reply.status === 410) throw expired()
    if (reply.status === 429) {
      // Retried with backoff first (isRetryable); this is what is left if YouTube keeps refusing.
      throw new YouTubeUploadError(
        'rate-limited',
        'YouTube is not taking more of this upload right now. Try again later, or download the recording, upload it in YouTube Studio as Unlisted and paste its link.',
        429,
      )
    }
    throw new YouTubeUploadError('youtube-error', 'YouTube did not take that part of the file.', reply.status)
  }

  private async putProxy(chunk: ByteRange): Promise<PutResult> {
    const reply = await this.put(ROUTES.apiUpload(this.id()), chunk)
    const body = parseJson(reply.text) as (SessionState & { error?: string; code?: UploadFailureCode }) | null
    if (reply.status >= 200 && reply.status < 300 && body) {
      if (body.status === 'done') return { status: 'done', videoId: body.videoId }
      if (body.status === 'incomplete') return { status: 'incomplete', next: body.next }
      throw expired()
    }
    throw new YouTubeUploadError(
      body?.code ?? 'youtube-error',
      body?.error ?? 'The site did not pass that part of the file on.',
      reply.status,
    )
  }

  /** One PUT with upload progress, which fetch cannot report. */
  private put(url: string, chunk: ByteRange): Promise<{ status: number; header: (name: string) => string | null; text: string }> {
    const total = this.blob.size
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const stop = () => xhr.abort()
      this.signal.addEventListener('abort', stop, { once: true })
      const settle = () => this.signal.removeEventListener('abort', stop)

      xhr.open('PUT', url)
      xhr.timeout = CHUNK_TIMEOUT_MS
      xhr.setRequestHeader('Content-Range', formatContentRange(chunk, total))
      xhr.upload.onprogress = (event) => this.report(chunk.start, event.loaded)
      xhr.onload = () => {
        settle()
        resolve({
          status: xhr.status,
          header: (name) => {
            try {
              return xhr.getResponseHeader(name)
            } catch {
              return null
            }
          },
          text: xhr.responseText,
        })
      }
      // A network failure and a CORS refusal look the same from here.
      xhr.onerror = () => {
        settle()
        reject(new TypeError('The request failed.'))
      }
      xhr.ontimeout = () => {
        settle()
        reject(new TypeError('The request timed out.'))
      }
      xhr.onabort = () => {
        settle()
        reject(new DOMException('Stopped.', 'AbortError'))
      }
      xhr.send(this.blob.slice(chunk.start, chunk.end + 1))
    })
  }

  /** Tells the server the file is up; it checks with YouTube and attaches the video. */
  private async complete(videoId: string | null): Promise<UploadOutcome> {
    this.report(this.blob.size, 0)
    const finished = await json<{ videoId: string; result: SaveExplanationResult; warnings?: string[] }>(
      fetch(ROUTES.apiUploadComplete(this.id()), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(videoId ? { videoId } : {}),
        signal: this.signal,
      }),
    )
    forgetYouTubeUpload(this.id())
    return {
      videoId: finished.videoId,
      result: finished.result,
      warnings: finished.warnings ?? [],
      transport: this.transport,
    }
  }

  private id(): string {
    if (!this.record) throw new YouTubeUploadError('not-found', 'The upload has not started.')
    return this.record.uploadId
  }

  private report(confirmed: number, inFlight: number): void {
    const total = this.blob.size
    this.onProgress?.({ sent: Math.min(confirmed + inFlight, total), total, transport: this.transport })
  }

  private remember(sent: number): void {
    if (!this.record) return
    this.record = { ...this.record, sent }
    savePending(this.record)
  }

  /** Waits before a retry, and for the connection to come back if it is gone. */
  private pause(ms: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer)
        window.removeEventListener('online', onOnline)
        reject(new DOMException('Stopped.', 'AbortError'))
      }
      const finish = () => {
        this.signal.removeEventListener('abort', onAbort)
        window.removeEventListener('online', onOnline)
        resolve()
      }
      const onOnline = () => {
        clearTimeout(timer)
        finish()
      }
      const timer = setTimeout(() => {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return // wait for 'online'
        finish()
      }, ms)
      this.signal.addEventListener('abort', onAbort, { once: true })
      window.addEventListener('online', onOnline, { once: true })
    })
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseMime(type: string): 'video/webm' | 'video/mp4' | null {
  const base = type.split(';')[0].trim().toLowerCase()
  return base === 'video/webm' || base === 'video/mp4' ? base : null
}

function expired(): YouTubeUploadError {
  return new YouTubeUploadError('expired', 'This upload has expired on YouTube. Start it again.')
}

/** A blocked or failed request, or YouTube refusing the session to this origin. */
function isRouteRefusal(error: unknown): boolean {
  if (error instanceof TypeError) return true
  return error instanceof YouTubeUploadError && error.code === 'youtube-error' && [400, 401, 403].includes(error.status)
}

/** Worth trying again after a pause: the network, a timeout, YouTube or the site briefly failing. */
function isRetryable(error: unknown): boolean {
  if (error instanceof TypeError) return true
  if (!(error instanceof YouTubeUploadError)) return false
  return error.code === 'network' || error.status === 429 || error.status >= 500
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function readVideoId(text: string): string | null {
  const body = parseJson(text) as { id?: unknown } | null
  return typeof body?.id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(body.id) ? body.id : null
}

/** A JSON answer from our own API, or the YouTubeUploadError its error body describes. */
async function json<T>(request: Promise<Response>): Promise<T> {
  let response: Response
  try {
    response = await request
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new YouTubeUploadError('network', 'The site could not be reached. Check the connection.')
  }
  const body = (await response.json().catch(() => null)) as (T & { error?: string; code?: UploadFailureCode }) | null
  if (!response.ok || !body) {
    throw new YouTubeUploadError(
      body?.code ?? (response.status >= 500 ? 'youtube-error' : 'bad-request'),
      body?.error ?? 'The upload could not go ahead.',
      response.status,
    )
  }
  return body
}

// localStorage: one entry holding every unfinished upload, keyed by id.
// Private windows and blocked storage throw; resuming is a convenience, so
// those just mean an upload cannot carry on after a reload.

const STORAGE_KEY = 'qp-youtube-uploads'

function readPending(): Record<string, PendingUpload> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const all = (raw ? JSON.parse(raw) : {}) as Record<string, PendingUpload>
    const fresh: Record<string, PendingUpload> = {}
    for (const [id, entry] of Object.entries(all)) {
      if (entry && typeof entry.startedAt === 'number' && Date.now() - entry.startedAt < SESSION_LIFE_MS) fresh[id] = entry
    }
    return fresh
  } catch {
    return {}
  }
}

function writePending(all: Record<string, PendingUpload>): void {
  try {
    if (Object.keys(all).length) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage is full or blocked: the upload still runs, it just cannot resume after a reload.
  }
}

function savePending(record: PendingUpload): void {
  const all = readPending()
  // Keep what an earlier save knew (the session address, the question) when resuming without it.
  const before = all[record.uploadId]
  all[record.uploadId] = {
    ...record,
    sessionUri: record.sessionUri ?? before?.sessionUri ?? null,
    questionId: record.questionId || before?.questionId || '',
  }
  writePending(all)
}
