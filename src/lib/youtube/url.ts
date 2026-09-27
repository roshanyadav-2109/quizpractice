/**
 * YouTube links, read and written. Pure and client-safe: the studio's link
 * field, the importer and the explanation code all agree on one reading.
 *
 * Accepted: youtu.be/<id>, youtube.com/watch?v=<id>, /shorts/<id>, /live/<id>,
 * /embed/<id> (also on m.youtube.com and youtube-nocookie.com), with or without
 * the https:// a teacher often leaves off. A start time may ride along as
 * `t` or `start`, written 90, 90s or 1m30s.
 *
 * Stored explanations always carry the canonical short form, so the database
 * check (0024) and every reader only ever see one shape.
 */

export interface YouTubeRef {
  /** The 11-character video id. */
  id: string
  /** Where playback starts, in whole seconds; null plays from the beginning. */
  start: number | null
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

const WATCH_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com'])
const EMBED_HOSTS = new Set(['youtube-nocookie.com', 'www.youtube-nocookie.com'])

/** The video a link points at, or null when it is not a YouTube video link. */
export function parseYouTubeUrl(raw: string): YouTubeRef | null {
  const text = raw.trim()
  if (!text || /\s/.test(text)) return null

  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.username || url.password || url.port) return null

  const host = url.hostname.toLowerCase()
  const segments = url.pathname.split('/').filter(Boolean)
  let id: string | undefined

  if (host === 'youtu.be') {
    id = segments[0]
  } else if (WATCH_HOSTS.has(host)) {
    if (segments[0] === 'watch' && segments.length === 1) {
      id = url.searchParams.get('v') ?? undefined
    } else if (['shorts', 'live', 'embed'].includes(segments[0] ?? '')) {
      id = segments[1]
    }
  } else if (EMBED_HOSTS.has(host)) {
    if (segments[0] === 'embed') id = segments[1]
  }

  if (!id || !VIDEO_ID.test(id)) return null

  // A share link may put the time in the fragment ("#t=1m30s").
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const time = url.searchParams.get('t') ?? url.searchParams.get('start') ?? hash.get('t') ?? hash.get('start')
  return { id, start: time === null ? null : parseStart(time) }
}

/** "90", "90s", "1m30s", "1h2m3s" as seconds; null for 0 or anything unreadable. */
function parseStart(value: string): number | null {
  const text = value.trim().toLowerCase()
  let seconds: number

  if (/^\d+$/.test(text)) {
    seconds = Number(text)
  } else {
    const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(text)
    if (!match || text === '') return null
    const [, h = '0', m = '0', s = '0'] = match
    seconds = Number(h) * 3600 + Number(m) * 60 + Number(s)
  }

  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null
}

/** The one form stored: https://youtu.be/<id>, plus ?t=<seconds> when it starts later. */
export function canonicalYouTubeUrl(ref: YouTubeRef): string {
  return `https://youtu.be/${ref.id}${ref.start ? `?t=${ref.start}` : ''}`
}

/** The privacy-enhanced player for the same video and start time. */
export function youTubeEmbedUrl(ref: YouTubeRef): string {
  return `https://www.youtube-nocookie.com/embed/${ref.id}${ref.start ? `?start=${ref.start}` : ''}`
}
