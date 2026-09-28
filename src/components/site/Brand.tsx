import Image from 'next/image'

/**
 * The Quiz Space wordmark. The magnifier over a quiz sheet stands in for the
 * Q — its ring is the bowl, its handle the tail — and the rest of the name
 * follows it in the site's type.
 */
export function BrandLogo() {
  return (
    <span className="flex items-center">
      {/* The name as text, for search engines and screen readers: drawn, it is a
          picture of a Q followed by "uiz Space", which reads as two words. */}
      <span className="sr-only">Quiz Space</span>
      <Image
        src="/brand/quizspace-mark.webp"
        alt=""
        aria-hidden="true"
        width={34}
        height={34}
        unoptimized
        priority
        className="h-[2.125rem] w-[2.125rem] shrink-0"
      />
      {/* A letter's gap between the mark and the u, so the two read apart. Drawn
          by CSS, so the page's text says "Quiz Space" once, not "Quiz Space uiz Space". */}
      <span
        aria-hidden="true"
        data-text="uiz Space"
        className="ml-[0.1875rem] -translate-y-[1px] text-[1.3125rem] leading-none font-semibold tracking-[-0.015em] text-ink before:content-[attr(data-text)]"
      />
    </span>
  )
}

/** "A product by Unknown IITians", with the channel's own logo. */
export function ProductBy({ className = '' }: { className?: string }) {
  return (
    <p className={`flex items-center justify-center gap-1.5 text-meta font-normal text-ink-muted ${className}`}>
      A product by
      <a
        href="https://www.youtube.com/@unknowniitians"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-ink hover:underline"
      >
        <Image
          src="/brand/unknown-iitians.png"
          alt="Unknown IITians logo"
          aria-hidden="true"
          width={18}
          height={18}
          unoptimized
          className="h-[1.125rem] w-[1.125rem] rounded-full"
        />
        Unknown IITians
      </a>
    </p>
  )
}
