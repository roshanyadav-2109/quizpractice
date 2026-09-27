/**
 * The arithmetic of a YouTube resumable upload, kept pure so both ends agree
 * and the tests can pin it down.
 *
 * The protocol: the file goes up in PUTs, each labelled with
 * `Content-Range: bytes <first>-<last>/<total>`. Every chunk except the last
 * must be a multiple of 256 KiB. YouTube answers 308 while it wants more,
 * with `Range: bytes=0-<last byte it kept>` (no Range when it kept nothing),
 * and 200 or 201 with the video once the last byte is in. An empty PUT whose
 * Content-Range is "bytes", a space, an asterisk, a slash and the total asks
 * where it got to (spelled out because the literal would end this comment).
 *
 * Client-safe: no imports.
 */

/** YouTube's chunk granule: every chunk but the last is a multiple of this. */
export const UPLOAD_GRANULE = 262_144

/** One PUT's bytes, both ends inclusive, as Content-Range counts them. */
export interface ByteRange {
  start: number
  end: number
}

/** A chunk size YouTube accepts: rounded down to whole granules, at least one. */
export function granularChunkSize(bytes: number): number {
  const granules = Math.floor(bytes / UPLOAD_GRANULE)
  return Math.max(granules, 1) * UPLOAD_GRANULE
}

/**
 * The chunk that starts at `offset`, or null when the file is all sent.
 * `offset` is what YouTube reported. After a dropped connection that need
 * not be on a granule boundary (YouTube's own example resumes from byte
 * 1,000,000): only the chunk's length has to be whole granules.
 */
export function nextChunk(offset: number, total: number, chunkBytes: number): ByteRange | null {
  if (!Number.isSafeInteger(total) || total <= 0) throw new RangeError('The file is empty.')
  if (!Number.isSafeInteger(offset) || offset < 0) throw new RangeError('The offset is not a byte position.')
  if (offset >= total) return null
  const size = granularChunkSize(chunkBytes)
  return { start: offset, end: Math.min(offset + size, total) - 1 }
}

/** Every chunk of a file, in order, from `offset`. */
export function chunkPlan(total: number, chunkBytes: number, offset = 0): ByteRange[] {
  const chunks: ByteRange[] = []
  for (let chunk = nextChunk(offset, total, chunkBytes); chunk; chunk = nextChunk(chunk.end + 1, total, chunkBytes)) {
    chunks.push(chunk)
  }
  return chunks
}

/** `bytes 0-8388607/20000000`: the header on a PUT that carries bytes. */
export function formatContentRange({ start, end }: ByteRange, total: number): string {
  return `bytes ${start}-${end}/${total}`
}

/** The header on an empty PUT asking how far the upload got: an asterisk in place of the range. */
export function formatStatusRange(total: number): string {
  return `bytes */${total}`
}

/** A chunk's Content-Range header read back, or null when it is not one. */
export function parseContentRange(header: string | null | undefined): (ByteRange & { total: number }) | null {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(header?.trim() ?? '')
  if (!match) return null
  const [start, end, total] = match.slice(1).map(Number)
  if (![start, end, total].every(Number.isSafeInteger) || start > end || end >= total) return null
  return { start, end, total }
}

/**
 * Where to send from next, read from a 308's Range header: one past the last
 * byte YouTube kept. No header means it kept nothing yet. Null when the
 * header is there but unreadable.
 */
export function nextOffsetFromRange(header: string | null | undefined): number | null {
  if (header === null || header === undefined || header.trim() === '') return 0
  const match = /^bytes=0-(\d+)$/.exec(header.trim())
  if (!match) return null
  const last = Number(match[1])
  return Number.isSafeInteger(last) ? last + 1 : null
}

/**
 * Whether a chunk the browser sent through the proxy is one YouTube will
 * take: inside the file, a whole number of granules unless it is the last,
 * and no larger than the proxy allows. It may start anywhere: a resume
 * carries on from whatever byte YouTube says it kept.
 */
export function isValidChunk(range: ByteRange, total: number, maxBytes: number): boolean {
  const length = range.end - range.start + 1
  if (range.start < 0 || range.end >= total || length <= 0 || length > maxBytes) return false
  const last = range.end === total - 1
  return last || length % UPLOAD_GRANULE === 0
}
