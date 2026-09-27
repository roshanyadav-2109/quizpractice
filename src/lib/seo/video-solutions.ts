import 'server-only'
import { cache } from 'react'
import { getQuestionIndex, getVideoSolutions, type VideoSolution } from '@/lib/queries'
import { parseYouTubeUrl, youTubeEmbedUrl } from '@/lib/youtube/url'
import { getSeoCatalogue, type PaperEntry } from './catalogue'
import { shortName, sittingDate } from './names'
import { paths, questionSlug } from './paths'
import { headlineTextOf, indexableText } from './question-text'
import { plain } from './question-view'

/**
 * Video solutions as the public pages need them: which questions have one,
 * the address of each question's page (where the video plays), and the
 * YouTube player and thumbnail for structured data and the video sitemap.
 */

export interface PlacedVideo extends VideoSolution {
  paper: PaperEntry
  /** The question's own page, where the video plays. */
  path: string
  /** Whether that page is the question's canonical copy — only those carry video markup. */
  canonical: boolean
  /** Canonical and worth indexing: the pages the video sitemap lists. */
  indexable: boolean
  /** The question's own words, shortened, for lists. */
  headline: string
  /** The video's name and description, the same in the page's markup and the video sitemap. */
  title: string
  description: string
  embedUrl: string | null
  thumbnailUrl: string | null
  watchUrl: string
}

export interface VideoIndex {
  byQuestion: Map<string, PlacedVideo>
  bySet: Map<string, PlacedVideo[]>
  bySubject: Map<string, PlacedVideo[]>
  all: PlacedVideo[]
}

/** YouTube's thumbnail for a video, from its id. */
export function youTubeThumbnail(videoUrl: string): string | null {
  const ref = parseYouTubeUrl(videoUrl)
  return ref ? `https://i.ytimg.com/vi/${ref.id}/hqdefault.jpg` : null
}

export function youTubeEmbed(videoUrl: string): string | null {
  const ref = parseYouTubeUrl(videoUrl)
  return ref ? youTubeEmbedUrl(ref) : null
}

export const getVideoIndex = cache(async (): Promise<VideoIndex> => {
  const [videos, catalogue] = await Promise.all([getVideoSolutions().catch(() => []), getSeoCatalogue()])
  const sets = [...new Set(videos.map((video) => video.setId))]
  // The words each question's address is made from, for the few sets with videos.
  const index = sets.length > 0 ? await getQuestionIndex(sets) : []
  const indexed = new Map(index.map((row) => [row.questionId, row]))

  const all: PlacedVideo[] = []
  for (const video of videos) {
    const paper = catalogue.paperBySetId.get(video.setId)
    if (!paper) continue
    const row = indexed.get(video.questionId)
    const words = row ? headlineTextOf(row.textBlocks) : ''
    const slug = questionSlug(video.number, words)
    const canonical = !row || row.canonicalId === row.questionId
    all.push({
      ...video,
      paper,
      path: paths.question(paper.subject.slug, paper.examType.slug, paper.slug, slug),
      canonical,
      indexable: canonical && !!row && indexableText(row.textBlocks, row.substance),
      headline: words ? plain(words, 90) : '',
      title: `${shortName(paper.subject)} ${paper.examType.name} ${sittingDate(paper.sessionDate)} Q${video.number} video solution`,
      description: `Video solution to question ${video.number} of the IIT Madras BS ${paper.subject.name} ${paper.examType.name} paper, ${sittingDate(
        paper.sessionDate,
      )}${paper.setsInSitting > 1 ? `, Set ${paper.setCode}` : ''}${words ? `: ${plain(words, 150)}` : '.'}`,
      embedUrl: youTubeEmbed(video.videoUrl),
      thumbnailUrl: youTubeThumbnail(video.videoUrl),
      watchUrl: video.videoUrl,
    })
  }
  all.sort((a, b) => (b.paper.sessionDate ?? '').localeCompare(a.paper.sessionDate ?? '') || a.number - b.number)

  const bySet = new Map<string, PlacedVideo[]>()
  const bySubject = new Map<string, PlacedVideo[]>()
  for (const video of all) {
    bySet.set(video.setId, [...(bySet.get(video.setId) ?? []), video])
    bySubject.set(video.paper.subject.id, [...(bySubject.get(video.paper.subject.id) ?? []), video])
  }
  return { byQuestion: new Map(all.map((video) => [video.questionId, video])), bySet, bySubject, all }
})
