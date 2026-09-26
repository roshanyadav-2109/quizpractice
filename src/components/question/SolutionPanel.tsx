import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import type { SolutionRow } from '@/types/db'
import { EmptyState } from '@/components/ui/EmptyState'

/**
 * The worked solution for one question, as the Solution sheet in the exam
 * runner shows it.
 *
 * Text first, then the video in its own card — and the card only exists when
 * there is a video. An empty "video coming soon" box would be a placeholder.
 */
export function SolutionPanel({ solutions }: { solutions: SolutionRow[] }) {
  if (!solutions.length) {
    return (
      <EmptyState framed={false} size="sm" art="no-solution" title="No explanation yet">
        No worked solution has been written for this question yet.
      </EmptyState>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {solutions.map((solution) => (
        <section key={solution.id} aria-label={kindLabel(solution.kind)}>
          <p className="label mb-2">{kindLabel(solution.kind)}</p>

          {solution.body?.length ? (
            <div className="paper text-ink">
              <BlockRenderer blocks={solution.body} context="solution" />
            </div>
          ) : null}

          {solution.video_url ? (
            <div className="mt-4 overflow-hidden rounded-card border border-rule bg-surface">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <p className="text-ui text-ink">Video solution</p>
              </div>
              <VideoEmbed url={solution.video_url} />
            </div>
          ) : null}
        </section>
      ))}
    </div>
  )
}

function kindLabel(kind: SolutionRow['kind']): string {
  switch (kind) {
    case 'official':
      return 'Explanation'
    case 'community':
      return 'Explanation from a student'
    case 'ai':
      return 'AI-generated — verify before relying on it'
    default:
      return 'Explanation'
  }
}

function VideoEmbed({ url }: { url: string }) {
  const embed = toEmbedUrl(url)

  if (!embed) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block px-4 pb-4 text-ui text-accent hover:underline"
      >
        Watch the video solution
      </a>
    )
  }

  return (
    <div className="bg-black">
      <iframe
        src={embed}
        title="Video solution"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className="aspect-video w-full"
      />
    </div>
  )
}

/** Recognises the hosts we support; anything else falls back to a plain link. */
function toEmbedUrl(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }

  const host = url.hostname.replace(/^www\./, '')

  if (host === 'youtu.be') {
    const id = url.pathname.slice(1)
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') {
      const id = url.searchParams.get('v')
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null
    }
    if (url.pathname.startsWith('/embed/')) {
      return `https://www.youtube-nocookie.com${url.pathname}`
    }
    return null
  }

  if (host === 'vimeo.com') {
    const id = url.pathname.split('/').filter(Boolean)[0]
    return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null
  }

  // Cloudflare Stream and Bunny already hand out embeddable iframe URLs.
  if (host.endsWith('videodelivery.net') || host.endsWith('cloudflarestream.com')) {
    return raw
  }
  if (host.endsWith('mediadelivery.net') || host.endsWith('b-cdn.net')) {
    return raw
  }

  return null
}
