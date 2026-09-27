'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { ArrowCounterClockwise, DownloadSimple, Warning } from '@/components/ui/icons'
import { buttonClass } from '@/components/ui/primitives'
import { formatBytes, formatClock } from '@/lib/studio/filename'
import { formatLabel } from '@/lib/studio/mime'
import type { Take } from '@/lib/studio/recorder'

/**
 * The take, played back before anything happens to it: watch it, throw it
 * away and record again, or download it — named after the question — and
 * send it on to YouTube below.
 *
 * The take stays in this browser (IndexedDB) until YouTube has it or the
 * teacher throws it away, so closing the tab here loses nothing.
 */
export function ReviewPanel({
  take,
  filename,
  saved = false,
  onRerecord,
  children,
}: {
  take: Take
  filename: string
  /** YouTube has it: moving on needs no warning. */
  saved?: boolean
  onRerecord: () => void
  children?: ReactNode
}) {
  const video = useRef<HTMLVideoElement>(null)
  const download = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    const player = video.current
    const link = download.current
    const url = URL.createObjectURL(take.blob)
    if (link) link.href = url
    if (!player) return () => URL.revokeObjectURL(url)

    // A WebM straight from MediaRecorder carries no duration, so the player
    // shows no length and cannot seek. Asking for a time far past the end
    // makes it read the whole file and learn the duration; then back to 0.
    const onMetadata = () => {
      if (Number.isFinite(player.duration)) return
      const rewind = () => {
        player.removeEventListener('timeupdate', rewind)
        player.currentTime = 0
      }
      player.addEventListener('timeupdate', rewind)
      player.currentTime = 1e101
    }
    player.addEventListener('loadedmetadata', onMetadata)
    player.src = url
    return () => {
      player.removeEventListener('loadedmetadata', onMetadata)
      player.removeAttribute('src')
      player.load()
      URL.revokeObjectURL(url)
    }
  }, [take.blob])

  function rerecord() {
    if (saved || window.confirm('Throw this take away and record again? It cannot be brought back.')) onRerecord()
  }

  return (
    <section aria-labelledby="review-heading" className="rounded-card border border-rule bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id="review-heading" className="text-card font-medium text-ink">
          Review your take
        </h3>
        <p className="text-meta text-ink-faint tabular-nums">
          {formatClock(take.durationMs)} · {formatBytes(take.blob.size)} · {formatLabel(take.mime)}
          {take.recovered ? ' · recovered from this browser' : ''}
        </p>
      </div>

      {!take.complete ? (
        <p className="mt-2 flex items-start gap-2 rounded-control bg-marked-soft px-3 py-2 text-meta text-marked">
          <Warning size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          Part of this take was lost when the tab closed. Watch it through before you keep it.
        </p>
      ) : null}

      <video
        ref={video}
        controls
        playsInline
        preload="metadata"
        aria-label="Your take"
        className="mt-3 aspect-video w-full rounded-control border border-rule bg-black"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={rerecord} className={buttonClass('outline', 'md')}>
          <ArrowCounterClockwise size={16} aria-hidden="true" />
          {saved ? 'Record another take' : 'Re-record'}
        </button>
        <a ref={download} download={filename} className={buttonClass('outline', 'md')}>
          <DownloadSimple size={16} aria-hidden="true" />
          Download
        </a>
        <span className="self-center truncate text-micro text-ink-faint">{filename}</span>
      </div>

      {children ? <div className="mt-4 border-t border-rule pt-4">{children}</div> : null}
    </section>
  )
}
