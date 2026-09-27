import { formatSession } from '@/lib/format'
import { recordingExtension } from './mime'

/**
 * What a recording is called: its file name, and the title and description
 * suggested for YouTube.
 *
 * The file is named after the question it explains, so a teacher uploading
 * by hand in YouTube Studio — or an admin handed a file — can tell which
 * question it belongs to without opening it:
 *
 *   QP-dbms-2026-04-12-QDB2-Q7.webm
 *
 * YouTube allows a title of 100 characters and a description of 5,000 bytes,
 * and neither may hold < or >. Pure, so it can be tested.
 */

export interface RecordingPlace {
  /** Null when the subject could not be read (a draft paper): the name is used instead. */
  subjectSlug: string | null
  subjectName: string
  programName?: string | null
  examName: string
  /** yyyy-mm-dd, or null for an undated paper. */
  sessionDate: string | null
  setCode: string
  number: number
}

export const TITLE_MAX_CHARS = 100
export const DESCRIPTION_MAX_BYTES = 5000

/** Lower case letters and digits joined by single hyphens, at most `max` long. */
export function slugPart(value: string, max = 40): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug.slice(0, max).replace(/-+$/, '')
}

/** A set code as it is printed, keeping its case: "QDB2", "1". */
function setPart(code: string): string {
  const part = code
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
  return part || 'set'
}

/** 'QP-<subject-slug>-<yyyy-mm-dd>-<set>-Q<n>.<webm|mp4>' */
export function recordingFilename(place: RecordingPlace, mime: string): string {
  const subject = (place.subjectSlug && slugPart(place.subjectSlug)) || slugPart(place.subjectName) || 'subject'
  const date = place.sessionDate && /^\d{4}-\d{2}-\d{2}$/.test(place.sessionDate) ? place.sessionDate : 'undated'
  const number = Number.isInteger(place.number) && place.number > 0 ? place.number : 0
  return `QP-${subject}-${date}-${setPart(place.setCode)}-Q${number}.${recordingExtension(mime)}`
}

/** YouTube refuses < and > in titles and descriptions: swap them for look-alikes. */
export function youtubeSafe(text: string): string {
  return text.replace(/</g, '‹').replace(/>/g, '›')
}

export function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length
}

/** The longest start of `text` that fits in `max` UTF-8 bytes, never splitting a character. */
export function clipToBytes(text: string, max: number): string {
  if (utf8Length(text) <= max) return text
  let bytes = 0
  let end = 0
  for (const char of text) {
    const size = utf8Length(char)
    if (bytes + size > max) break
    bytes += size
    end += char.length
  }
  return text.slice(0, end)
}

/** Clips to `max` characters (whole code points), ending with an ellipsis when cut. */
function clipChars(text: string, max: number): string {
  const chars = Array.from(text)
  if (chars.length <= max) return text
  return chars.slice(0, max - 1).join('').trimEnd() + '…'
}

/** "DBMS · Quiz 2 · 12 Apr 2026 · Q7 explained", at most 100 characters. */
export function videoTitle(place: RecordingPlace): string {
  const tail = ` · ${place.examName} · ${formatSession(place.sessionDate)} · Q${place.number} explained`
  const room = TITLE_MAX_CHARS - Array.from(tail).length
  const subject = room >= 12 ? clipChars(place.subjectName, room) : ''
  const title = subject ? `${subject}${tail}` : tail.replace(/^ · /, '')
  return clipChars(youtubeSafe(title.replace(/\s+/g, ' ').trim()), TITLE_MAX_CHARS)
}

/**
 * The suggested description: which question this is, a link to the paper on
 * the site, and the start of the question for search. At most 5,000 bytes.
 */
export function videoDescription(
  place: RecordingPlace,
  { paperUrl, snippet, copies }: { paperUrl: string; snippet?: string; copies?: number },
): string {
  const where = [
    place.programName ? `${place.subjectName} (${place.programName})` : place.subjectName,
    place.examName,
    formatSession(place.sessionDate),
    `set ${place.setCode}`,
  ].join(', ')

  const lines = [`Worked explanation of question ${place.number} from ${where}.`, '', `Try the paper: ${paperUrl}`]
  if (copies && copies > 1) {
    lines.push('', `The same question appears in ${copies} papers; this explanation covers all of them.`)
  }
  const tail = ['', 'Quiz Space — previous year papers of the IIT Madras BS degree, with explanations.', 'An independent study resource, not affiliated with IIT Madras.']

  const text = snippet?.replace(/\s+/g, ' ').trim()
  if (text) {
    const head = youtubeSafe([...lines, ''].join('\n'))
    const rest = youtubeSafe(tail.join('\n'))
    const room = DESCRIPTION_MAX_BYTES - utf8Length(head) - utf8Length(rest) - utf8Length('Question: \n')
    if (room > 40) {
      const question = clipToBytes(youtubeSafe(text), Math.min(room, 600))
      const cut = question.length < youtubeSafe(text).length
      lines.push('', `Question: ${cut ? question.replace(/\s+\S*$/, '') + '…' : question}`)
    }
  }
  return clipToBytes(youtubeSafe([...lines, ...tail].join('\n')), DESCRIPTION_MAX_BYTES)
}

/** A duration as "4:07", or "1:02:07" past an hour. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}

/** A size as "840 kB" or "23.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} kB`
  return `${(bytes / 1_000_000).toFixed(bytes < 100_000_000 ? 1 : 0)} MB`
}
