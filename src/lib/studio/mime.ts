/**
 * What a recording is made in: the container, the codecs and the bitrate.
 *
 * The studio records one 1280 × 720 canvas — board, question card and an
 * optional webcam bubble — plus one microphone track. A board is mostly white
 * paper with a few moving lines, so it compresses far better than camera
 * video: about 800 kbps of VP9 keeps handwriting sharp at 720p and makes a
 * five-minute explanation roughly 30 MB at worst, usually much less. Every
 * byte counts twice — once in the browser's storage while recording, once on
 * the way to YouTube — so the target stays low.
 *
 * WebM (VP9, then VP8, with Opus) where the browser can record it; MP4
 * (H.264 with AAC) on Safari and the iPad, which record MP4 reliably and WebM
 * only recently, if at all. YouTube takes both.
 *
 * Pure: no browser globals here, so the choice can be tested.
 */

/** Target video bitrate, in bits per second: plenty for a board at 720p30. */
export const VIDEO_BITS_PER_SECOND = 800_000
/** Speech in Opus or AAC. */
export const AUDIO_BITS_PER_SECOND = 64_000
/** Frames per second asked of the canvas. The encoder gets fewer when nothing moves. */
export const FRAME_RATE = 30

/** Most preferred first. */
export const MIME_PREFERENCE = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/mp4;codecs=avc1.42E01F,mp4a.40.2',
  'video/mp4',
  'video/webm',
] as const

/** The order to try: WebKit tries MP4 first, everything else WebM first. */
export function mimeOrder(webkit: boolean): string[] {
  const all: string[] = [...MIME_PREFERENCE]
  if (!webkit) return all
  const mp4 = all.filter((mime) => mime.startsWith('video/mp4'))
  return [...mp4, ...all.filter((mime) => !mime.startsWith('video/mp4'))]
}

/**
 * The first type this browser can record, or null when it can record none
 * of them. `isTypeSupported` is MediaRecorder.isTypeSupported; some browsers
 * throw on a type they do not know rather than answering false.
 */
export function pickRecordingMime(isTypeSupported: (mime: string) => boolean, webkit: boolean): string | null {
  for (const mime of mimeOrder(webkit)) {
    try {
      if (isTypeSupported(mime)) return mime
    } catch {
      // Treated as "no".
    }
  }
  return null
}

/**
 * Whether the browser is WebKit's own: Safari on the Mac, and every browser
 * on the iPhone and iPad, which all run WebKit whatever their name. An iPad
 * asking for desktop sites calls itself a Mac running Safari, which this
 * still recognises.
 */
export function isWebKitBrowser(userAgent: string): boolean {
  if (/iPad|iPhone|iPod/.test(userAgent)) return true
  if (/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent)) return true
  return (
    /AppleWebKit/.test(userAgent) &&
    /Safari\//.test(userAgent) &&
    !/Chrome|Chromium|Edg\/|OPR\/|Firefox|SamsungBrowser|Android/.test(userAgent)
  )
}

/** The container without its codecs, as YouTube and the upload API want it. */
export function baseVideoMime(mime: string): 'video/webm' | 'video/mp4' | null {
  const base = mime.split(';')[0].trim().toLowerCase()
  return base === 'video/webm' || base === 'video/mp4' ? base : null
}

/** The file extension for a recording of this type. */
export function recordingExtension(mime: string): 'webm' | 'mp4' {
  return baseVideoMime(mime) === 'video/mp4' ? 'mp4' : 'webm'
}

/** A readable name for the format: "WebM (VP9)", "MP4 (H.264)". */
export function formatLabel(mime: string): string {
  const lower = mime.toLowerCase()
  if (baseVideoMime(lower) === 'video/mp4') return lower.includes('avc1') || lower === 'video/mp4' ? 'MP4 (H.264)' : 'MP4'
  if (lower.includes('vp9')) return 'WebM (VP9)'
  if (lower.includes('vp8')) return 'WebM (VP8)'
  return 'WebM'
}
