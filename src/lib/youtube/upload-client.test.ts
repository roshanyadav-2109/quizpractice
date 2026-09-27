import test from 'node:test'
import assert from 'node:assert/strict'
import { DIRECT_CHUNK_BYTES, PROXY_CHUNK_BYTES } from '@/lib/teach/contracts'
import { parseContentRange } from './upload-math'
import * as client from './upload-client'

/**
 * The upload client against a simulated YouTube session and simulated site
 * routes: no browser, no network. XMLHttpRequest, fetch and localStorage are
 * stand-ins installed on globalThis; the client only reaches for them when an
 * upload runs.
 */

type Reply = { status: number; headers?: Record<string, string>; text?: string } | 'error' | 'hang'

interface Sim {
  total: number
  received: number
  /** How the direct route behaves: open, blocked by CORS, or open but hiding the Range header. */
  direct: 'open' | 'blocked' | 'hidden-range'
  /** PUTs that fail with a network error before succeeding again. */
  dropsLeft: number
  /** PUTs starting at or past this byte never answer, until it is cleared. */
  hangFrom: number | null
  log: string[]
  completed: { videoId?: string } | null
}

let sim: Sim

function youtubeTakes(range: string | undefined, size: number): { status: 'incomplete'; next: number } | { status: 'done' } {
  const parsed = parseContentRange(range)
  assert.ok(parsed, `bad Content-Range ${range}`)
  assert.equal(parsed.start, sim.received, 'chunks arrive in order from the reported offset')
  assert.equal(parsed.end - parsed.start + 1, size)
  sim.received = parsed.end + 1
  return sim.received === sim.total ? { status: 'done' } : { status: 'incomplete', next: sim.received }
}

async function handleXhr(method: string, url: string, headers: Record<string, string>, body: Blob): Promise<Reply> {
  assert.equal(method, 'PUT')
  if (sim.hangFrom !== null && sim.received >= sim.hangFrom) {
    sim.log.push('hung')
    return 'hang'
  }
  if (sim.dropsLeft > 0 && sim.received > 0) {
    sim.dropsLeft--
    return 'error'
  }
  if (url.startsWith('https://upload.example/')) {
    sim.log.push(`direct ${body.size}`)
    if (sim.direct === 'blocked') return 'error'
    const state = youtubeTakes(headers['content-range'], body.size)
    if (state.status === 'done') return { status: 200, text: JSON.stringify({ id: 'VIDEO123456' }) }
    return { status: 308, headers: sim.direct === 'hidden-range' ? {} : { range: `bytes=0-${state.next - 1}` } }
  }
  if (url.startsWith('/api/teach/uploads/')) {
    sim.log.push(`proxy ${body.size}`)
    assert.ok(body.size <= PROXY_CHUNK_BYTES)
    const state = youtubeTakes(headers['content-range'], body.size)
    return {
      status: 200,
      text: JSON.stringify(state.status === 'done' ? { status: 'done', videoId: 'VIDEO123456' } : state),
    }
  }
  throw new Error(`unexpected PUT ${url}`)
}

class FakeXHR {
  upload: { onprogress: ((event: { loaded: number }) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  ontimeout: (() => void) | null = null
  onabort: (() => void) | null = null
  status = 0
  responseText = ''
  timeout = 0
  private method = ''
  private url = ''
  private headers: Record<string, string> = {}
  private replyHeaders: Record<string, string> = {}
  private aborted = false

  open(method: string, url: string) {
    this.method = method
    this.url = url
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value
  }
  getResponseHeader(name: string) {
    return this.replyHeaders[name.toLowerCase()] ?? null
  }
  abort() {
    this.aborted = true
    queueMicrotask(() => this.onabort?.())
  }
  send(body: Blob) {
    void handleXhr(this.method, this.url, this.headers, body).then((reply) => {
      if (this.aborted || reply === 'hang') return
      if (reply === 'error') return this.onerror?.()
      this.upload.onprogress?.({ loaded: body.size })
      this.status = reply.status
      this.replyHeaders = reply.headers ?? {}
      this.responseText = reply.text ?? ''
      this.onload?.()
    })
  }
}

const store = new Map<string, string>()
const listeners = new Map<string, Set<() => void>>()
Object.assign(globalThis, {
  XMLHttpRequest: FakeXHR,
  window: {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
    addEventListener: (type: string, fn: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(fn)
    },
    removeEventListener: (type: string, fn: () => void) => listeners.get(type)?.delete(fn),
  },
})

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input)
  const method = init?.method ?? 'GET'
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  if (url === '/api/teach/uploads' && method === 'POST') {
    const sent = JSON.parse(String(init?.body))
    assert.equal(sent.agree, true)
    assert.equal(sent.mime, 'video/webm')
    return reply({
      uploadId: '00000000-0000-4000-8000-000000000001',
      sessionUri: 'https://upload.example/session',
      directChunkBytes: DIRECT_CHUNK_BYTES,
      proxyChunkBytes: PROXY_CHUNK_BYTES,
    })
  }
  if (url.endsWith('/complete') && method === 'POST') {
    sim.completed = JSON.parse(String(init?.body))
    return reply({ videoId: 'VIDEO123456', result: { ok: true, solutionId: 's1', status: 'pending', reach: 3 }, warnings: [] })
  }
  if (url.startsWith('/api/teach/uploads/') && method === 'GET') {
    sim.log.push('status')
    return reply(sim.received >= sim.total ? { status: 'done', videoId: 'VIDEO123456' } : { status: 'incomplete', next: sim.received })
  }
  if (method === 'DELETE') return reply({ ok: true })
  throw new Error(`unexpected fetch ${method} ${url}`)
}) as typeof fetch

function recording(bytes: number): Blob {
  return new Blob([new Uint8Array(bytes)], { type: 'video/webm;codecs=vp9,opus' })
}

function reset(total: number, over: Partial<Sim> = {}) {
  store.clear()
  sim = { total, received: 0, direct: 'open', dropsLeft: 0, hangFrom: null, log: [], completed: null, ...over }
}

const TOTAL = 20_000_000

test('uploads straight to YouTube in 8 MiB chunks and attaches the video', async () => {
  reset(TOTAL)
  const progress: number[] = []
  const handle = client.startYouTubeUpload({
    questionId: 'q1',
    blob: recording(TOTAL),
    title: 'Q1',
    description: '',
    privacy: 'unlisted',
    onProgress: (p) => progress.push(p.sent),
  })
  const outcome = await handle.done
  assert.equal(outcome.videoId, 'VIDEO123456')
  assert.equal(outcome.transport, 'direct')
  assert.deepEqual(sim.log, [`direct ${DIRECT_CHUNK_BYTES}`, `direct ${DIRECT_CHUNK_BYTES}`, `direct ${TOTAL - 2 * DIRECT_CHUNK_BYTES}`])
  assert.deepEqual(sim.completed, { videoId: 'VIDEO123456' })
  assert.equal(progress.at(-1), TOTAL)
  assert.equal(handle.uploadId, '00000000-0000-4000-8000-000000000001')
  assert.equal(store.size, 0, 'nothing left to resume')
})

test('falls back to the proxy in 4 MiB chunks when the direct route is blocked', async () => {
  reset(TOTAL, { direct: 'blocked' })
  const outcome = await client.startYouTubeUpload({
    questionId: 'q1',
    blob: recording(TOTAL),
    title: 'Q1',
    description: '',
    privacy: 'unlisted',
  }).done
  assert.equal(outcome.transport, 'proxy')
  assert.equal(sim.log[0], `direct ${DIRECT_CHUNK_BYTES}`)
  assert.equal(sim.log[1], 'status')
  assert.deepEqual(
    sim.log.filter((line) => line.startsWith('proxy')),
    ['proxy 4194304', 'proxy 4194304', 'proxy 4194304', 'proxy 4194304', `proxy ${TOTAL - 4 * PROXY_CHUNK_BYTES}`],
  )
})

test('asks the server where it got to when YouTube hides the Range header', async () => {
  reset(TOTAL, { direct: 'hidden-range' })
  const outcome = await client.startYouTubeUpload({
    questionId: 'q1',
    blob: recording(TOTAL),
    title: 'Q1',
    description: '',
    privacy: 'unlisted',
  }).done
  assert.equal(outcome.transport, 'direct')
  assert.equal(sim.log.filter((line) => line === 'status').length, 2)
})

test('carries on after a dropped connection', async () => {
  reset(TOTAL, { dropsLeft: 1 })
  const outcome = await client.startYouTubeUpload({
    questionId: 'q1',
    blob: recording(TOTAL),
    title: 'Q1',
    description: '',
    privacy: 'unlisted',
  }).done
  assert.equal(outcome.transport, 'direct', 'a drop after a good chunk is retried, not a reason to switch')
  assert.equal(sim.received, TOTAL)
})

test('stopping keeps what is needed to resume, and resuming finishes from the offset', async () => {
  // The first chunk goes through; the second never answers, and the teacher stops.
  reset(TOTAL, { hangFrom: DIRECT_CHUNK_BYTES })
  const blob = recording(TOTAL)
  const first = client.startYouTubeUpload({ questionId: 'q7', blob, title: 'Q7', description: '', privacy: 'unlisted' })
  while (!sim.log.includes('hung')) await new Promise((resolve) => setTimeout(resolve, 5))
  first.cancel()
  await assert.rejects(first.done, (error: { code?: string }) => error.code === 'cancelled')

  const pending = client.pendingYouTubeUpload('q7')
  assert.ok(pending)
  assert.equal(pending.bytes, TOTAL)
  assert.equal(pending.sent, DIRECT_CHUNK_BYTES)

  sim.hangFrom = null
  sim.log = []
  const outcome = await client.resumeYouTubeUpload(pending.uploadId, blob).done
  assert.equal(outcome.videoId, 'VIDEO123456')
  assert.equal(sim.log[0], 'status')
  assert.equal(sim.log[1], `direct ${DIRECT_CHUNK_BYTES}`)
  assert.equal(client.pendingYouTubeUpload('q7'), null)
})

test('a different recording cannot resume someone else’s upload', async () => {
  reset(TOTAL)
  store.set(
    'qp-youtube-uploads',
    JSON.stringify({
      u1: { uploadId: 'u1', questionId: 'q1', sessionUri: null, bytes: TOTAL, sent: 0, startedAt: Date.now() },
    }),
  )
  await assert.rejects(client.resumeYouTubeUpload('u1', recording(TOTAL - 1)).done, (error: { code?: string }) => error.code === 'mismatch')
})

test('only WebM and MP4 recordings are sent', async () => {
  reset(10)
  const blob = new Blob([new Uint8Array(10)], { type: 'video/quicktime' })
  await assert.rejects(
    client.startYouTubeUpload({ questionId: 'q1', blob, title: 'Q1', description: '', privacy: 'unlisted' }).done,
    (error: { code?: string }) => error.code === 'bad-request',
  )
})
