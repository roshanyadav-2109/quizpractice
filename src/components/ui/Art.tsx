import Image from 'next/image'
import { Notebook } from './icons'

/**
 * A branch's, exam's or subject's icon, drawn with nothing behind it. Until
 * one has been made, a quiet notebook holds its place at the same size, so
 * rows line up whether or not their icon exists yet.
 *
 * Decorative — the name is next to it — so it is hidden from screen readers,
 * which would otherwise read the name twice. `alt` still names what it is,
 * for image search and for crawlers that read an empty alt as a gap.
 */
export function Art({ src, size = 40, alt = '' }: { src: string | null; size?: number; alt?: string }) {
  if (src) {
    return (
      <Image
        src={src}
        alt={alt ? `${alt} icon` : ''}
        aria-hidden={alt ? true : undefined}
        width={size}
        height={size}
        className="shrink-0"
      />
    )
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center text-ink-faint"
    >
      <Notebook size={Math.round(size * 0.5)} />
    </span>
  )
}
