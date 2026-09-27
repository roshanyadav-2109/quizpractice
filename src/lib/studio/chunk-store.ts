/**
 * A take, kept in this browser while it is recorded.
 *
 * The recorder hands over a piece of video every two seconds; each piece is
 * written to IndexedDB as it arrives. A crashed tab, a reload, a laptop lid
 * closed mid-sentence or a failed upload then loses nothing: the next visit
 * to the question offers the take back. A take is cleared only when YouTube
 * has it (a confirmed upload) or the teacher throws it away, and anything
 * older than a week is swept up, so the browser's storage does not fill with
 * forgotten recordings.
 *
 * Two stores:
 *   recordings  one row per take: {id, questionId, mime, startedAt, durationMs, finalized, bytes, chunks}
 *   chunks      the pieces, keyed [recordingId, seq]
 *
 * IndexedDB is a convenience here, never a requirement: private windows,
 * full disks and older Safaris refuse it in different ways, every call is
 * wrapped, and the recorder always keeps the take in memory as well. When
 * the store cannot be opened, recording works exactly the same; only
 * recovery after a crash is lost.
 *
 * The helpers at the top are pure and tested; the class below them is the
 * browser part.
 */

export interface RecordingMeta {
  id: string
  questionId: string
  /** The recorder's type, codecs included. */
  mime: string
  startedAt: number
  /** Recorded time, pauses left out, as of the last piece written. */
  durationMs: number
  /** The recorder stopped cleanly. False: the tab died mid-take. */
  finalized: boolean
  bytes: number
  chunks: number
}

export interface StoredChunk {
  recordingId: string
  seq: number
  /** A Blob where the browser can store one, else its bytes. */
  data: Blob | ArrayBuffer
}

const DB_NAME = 'qp-studio'
const DB_VERSION = 1
const RECORDINGS = 'recordings'
const CHUNKS = 'chunks'

/** Takes older than this are deleted the next time the studio opens. */
export const KEEP_MS = 7 * 24 * 60 * 60_000

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** The key a piece is stored under. */
export function chunkKey(recordingId: string, seq: number): [string, number] {
  return [recordingId, seq]
}

/** Lower and upper keys covering every piece of one take, in order. */
export function chunkKeyBounds(recordingId: string): { lower: [string, number]; upper: [string, number] } {
  return { lower: [recordingId, 0], upper: [recordingId, Number.MAX_SAFE_INTEGER] }
}

/**
 * Pieces in recording order, and whether any are missing. A take with a gap
 * still plays up to the gap in most players, so a gap is reported, not fatal.
 */
export function orderChunks<T extends { seq: number }>(chunks: readonly T[]): { chunks: T[]; complete: boolean } {
  const sorted = [...chunks].sort((a, b) => a.seq - b.seq)
  const complete = sorted.every((chunk, index) => chunk.seq === index)
  return { chunks: sorted, complete }
}

/** Whether a take is old enough to sweep away. */
export function isExpired(meta: Pick<RecordingMeta, 'startedAt'>, now: number): boolean {
  return now - meta.startedAt > KEEP_MS
}

/** The take to offer back for a question: its newest with anything in it that has not expired. */
export function pickRecoverable(recordings: readonly RecordingMeta[], questionId: string, now: number): RecordingMeta | null {
  return (
    recordings
      .filter((meta) => meta.questionId === questionId && meta.bytes > 0 && !isExpired(meta, now))
      .sort((a, b) => b.startedAt - a.startedAt)[0] ?? null
  )
}

/** A take's id: when it started, then randomness, so ids sort by time. */
export function newRecordingId(now: number, random: () => number = Math.random): string {
  const tail = Math.floor(random() * 0x1_0000_0000)
    .toString(36)
    .padStart(7, '0')
  return `rec-${now.toString(36)}-${tail}`
}

// ---------------------------------------------------------------------------
// IndexedDB
// ---------------------------------------------------------------------------

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed.'))
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted.'))
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed.'))
  })
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(RECORDINGS)) {
        const recordings = db.createObjectStore(RECORDINGS, { keyPath: 'id' })
        recordings.createIndex('questionId', 'questionId')
      }
      if (!db.objectStoreNames.contains(CHUNKS)) {
        db.createObjectStore(CHUNKS, { keyPath: ['recordingId', 'seq'] })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB could not be opened.'))
    // Another tab holds an older version open; carry on without storage rather than wait.
    req.onblocked = () => reject(new Error('IndexedDB is busy in another tab.'))
  })
}

export class ChunkStore {
  /** Writes are queued so the pieces land in the order they were recorded. */
  private queue: Promise<unknown> = Promise.resolve()
  /** Set when the browser refuses Blobs in IndexedDB (older Safari): pieces go in as bytes. */
  private storeBytes = false

  private constructor(private readonly db: IDBDatabase) {
    db.onversionchange = () => db.close()
  }

  /** The store, or null when this browser will not give the studio one. */
  static async open(): Promise<ChunkStore | null> {
    try {
      if (typeof indexedDB === 'undefined') return null
      return new ChunkStore(await openDatabase())
    } catch {
      return null
    }
  }

  /** Starts a take. False when it could not be written: carry on in memory only. */
  async create(meta: RecordingMeta): Promise<boolean> {
    return this.enqueue(async () => {
      const tx = this.db.transaction(RECORDINGS, 'readwrite')
      tx.objectStore(RECORDINGS).put(meta)
      await done(tx)
      return true
    }, false)
  }

  /** Adds the next piece of a take and brings its running totals up to date. */
  async append(recordingId: string, seq: number, blob: Blob, durationMs: number): Promise<boolean> {
    return this.enqueue(async () => {
      try {
        await this.putChunk(recordingId, seq, this.storeBytes ? await blob.arrayBuffer() : blob, blob.size, durationMs)
      } catch (error) {
        // Blobs refused: store the bytes instead, from now on.
        if (this.storeBytes) throw error
        this.storeBytes = true
        await this.putChunk(recordingId, seq, await blob.arrayBuffer(), blob.size, durationMs)
      }
      return true
    }, false)
  }

  private async putChunk(recordingId: string, seq: number, data: Blob | ArrayBuffer, size: number, durationMs: number) {
    const tx = this.db.transaction([RECORDINGS, CHUNKS], 'readwrite')
    const chunk: StoredChunk = { recordingId, seq, data }
    tx.objectStore(CHUNKS).put(chunk)
    const recordings = tx.objectStore(RECORDINGS)
    const meta = (await request(recordings.get(recordingId))) as RecordingMeta | undefined
    if (meta) {
      recordings.put({ ...meta, bytes: meta.bytes + size, chunks: Math.max(meta.chunks, seq + 1), durationMs })
    }
    await done(tx)
  }

  /** Marks a take as cleanly stopped, with its final length. */
  async finalize(recordingId: string, durationMs: number): Promise<void> {
    await this.enqueue(async () => {
      const tx = this.db.transaction(RECORDINGS, 'readwrite')
      const recordings = tx.objectStore(RECORDINGS)
      const meta = (await request(recordings.get(recordingId))) as RecordingMeta | undefined
      if (meta) recordings.put({ ...meta, finalized: true, durationMs })
      await done(tx)
    }, undefined)
  }

  /** Every take kept for a question. */
  async list(questionId: string): Promise<RecordingMeta[]> {
    return this.enqueue(async () => {
      const tx = this.db.transaction(RECORDINGS, 'readonly')
      const rows = (await request(tx.objectStore(RECORDINGS).index('questionId').getAll(questionId))) as RecordingMeta[]
      return rows
    }, [])
  }

  /** A kept take as one file, or null when it is gone or unreadable. */
  async load(meta: RecordingMeta): Promise<{ blob: Blob; complete: boolean } | null> {
    return this.enqueue(async () => {
      const tx = this.db.transaction(CHUNKS, 'readonly')
      const { lower, upper } = chunkKeyBounds(meta.id)
      const rows = (await request(tx.objectStore(CHUNKS).getAll(IDBKeyRange.bound(lower, upper)))) as StoredChunk[]
      if (!rows.length) return null
      const { chunks, complete } = orderChunks(rows)
      return { blob: new Blob(chunks.map((chunk) => chunk.data), { type: meta.mime }), complete }
    }, null)
  }

  /** Deletes a take and its pieces. */
  async remove(recordingId: string): Promise<void> {
    await this.enqueue(async () => {
      const tx = this.db.transaction([RECORDINGS, CHUNKS], 'readwrite')
      const { lower, upper } = chunkKeyBounds(recordingId)
      tx.objectStore(CHUNKS).delete(IDBKeyRange.bound(lower, upper))
      tx.objectStore(RECORDINGS).delete(recordingId)
      await done(tx)
    }, undefined)
  }

  /** Deletes every take older than a week, whatever question it was for. */
  async sweep(now: number): Promise<void> {
    const old = await this.enqueue(async () => {
      const tx = this.db.transaction(RECORDINGS, 'readonly')
      const rows = (await request(tx.objectStore(RECORDINGS).getAll())) as RecordingMeta[]
      return rows.filter((meta) => isExpired(meta, now))
    }, [] as RecordingMeta[])
    for (const meta of old) await this.remove(meta.id)
  }

  /** Runs `job` after every earlier one; a failure gives `fallback` instead of throwing. */
  private enqueue<T>(job: () => Promise<T>, fallback: T): Promise<T> {
    const run = this.queue.then(job, job).catch(() => fallback)
    this.queue = run
    return run
  }
}
