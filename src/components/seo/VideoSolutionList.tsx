import Link from 'next/link'
import type { PlacedVideo } from '@/lib/seo/video-solutions'
import { shortName, sittingDate } from '@/lib/seo/names'
import { Play } from '@/components/ui/icons'

/**
 * The questions of a subject or exam that have a video solution, each
 * linking to its own page — where the video plays, beside the answer.
 */
export function VideoSolutionList({ videos, limit = 12 }: { videos: PlacedVideo[]; limit?: number }) {
  if (videos.length === 0) return null
  return (
    <ul className="mt-4 divide-y divide-rule rounded-card border border-rule bg-surface">
      {videos.slice(0, limit).map((video) => (
        <li key={video.questionId}>
          <Link href={`${video.path}#video-solution`} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-2/60">
            <Play size={16} weight="fill" aria-hidden="true" className="mt-1 shrink-0 text-accent" />
            <span className="min-w-0">
              <span className="block text-ui text-ink">
                {video.headline || `Question ${video.number}`}
                <span className="sr-only"> — video solution</span>
              </span>
              <span className="block text-meta text-ink-faint">
                {shortName(video.paper.subject)} {video.paper.examType.name} · {sittingDate(video.paper.sessionDate)} · Q
                {video.number}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
