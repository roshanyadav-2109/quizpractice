import Image from 'next/image'
import { Notebook } from './icons'

/**
 * A branch's, exam's or subject's icon, drawn with nothing behind it. Until
 * one has been made, a quiet notebook holds its place at the same size, so
 * rows line up whether or not their icon exists yet.
 *
 * Always decorative: the name is next to it.
 */
export function Art({ src, size = 40 }: { src: string | null; size?: number }) {
  if (src) return <Image src={src} alt="" width={size} height={size} className="shrink-0" />
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
