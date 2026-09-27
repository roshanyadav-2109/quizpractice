import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import type { SolutionRow } from '@/types/db'
import { EmptyState } from '@/components/ui/EmptyState'
import { parseYouTubeUrl, youTubeEmbedUrl } from '@/lib/youtube/url'

/** What the panel needs of an explanation: the student API's rows, or a full row in the admin review. */
export type SolutionView = Pick<SolutionRow, 'id' | 'kind' | 'body' | 'video_url'> & {
  author_name?: string | null
  shared?: boolean
}

/**
 * The worked solution for one question, as the Solution sheet in the exam
 * runner shows it.
 *
 * Text first, then the video in its own card — and the card only exists when
 * there is a video. An empty "video coming soon" box would be a placeholder.
 *
 * One explanation serves every copy of a question across papers and years,
 * so an explanation written on another copy says so, quietly: a teacher who
 * mentions "this paper" was talking about that one.
 */
export function SolutionPanel({ solutions }: { solutions: SolutionView[] }) {
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
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <p className="label">{kindLabel(solution.kind)}</p>
            {solution.author_name ? (
              <p className="text-meta text-ink-muted">Explained by {solution.author_name}</p>
            ) : null}
          </div>
          {solution.shared ? (
            <p className="mb-2 text-meta text-ink-faint">Recorded for the same question in another paper.</p>
          ) : null}

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

function kindLabel(kind: SolutionView['kind']): string {
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

  // YouTube's player must get at least 200 x 200 px and nothing laid over
  // it, so on a narrow phone the frame keeps its height rather than its ratio.
  return (
    <div className="bg-black">
      <iframe
        src={embed}
        title="Video solution"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className="aspect-video min-h-[200px] w-full min-w-[200px]"
      />
    </div>
  )
}

/** Recognises the hosts we support; anything else falls back to a plain link. */
function toEmbedUrl(raw: string): string | null {
  // Every YouTube form — youtu.be, watch, shorts, live, embed — and its start time.
  const youtube = parseYouTubeUrl(raw)
  if (youtube) return youTubeEmbedUrl(youtube)

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }

  const host = url.hostname.replace(/^www\./, '')

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
