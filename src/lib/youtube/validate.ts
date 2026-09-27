import 'server-only'
import { youtubeApiKey, youtubeChannelId } from '@/lib/env'
import { canonicalYouTubeUrl, parseYouTubeUrl } from '@/lib/youtube/url'
import { listVideos, oEmbed, type VideoResource } from '@/lib/youtube/google'
import { connectedChannelId, getAccessToken } from '@/lib/youtube/connection'

/**
 * Checks a link a teacher pasted for their explanation, before it is saved:
 * a YouTube video, on the site's channel, that students can actually play
 * here — not Private, embedding allowed.
 *
 * Asked in the best way available:
 *   1. videos.list with YOUTUBE_API_KEY, or with the connected channel's
 *      token: channel, visibility and embedding, for 1 unit of quota.
 *   2. Otherwise oEmbed, which needs nothing configured and says whether the
 *      video embeds, but not whose channel it is on.
 *
 * Needs no configuration at all to work: that is the day-one path, where
 * teachers upload in YouTube Studio by hand and paste the link.
 */

export type YouTubeLinkCheck =
  | { ok: true; url: string; videoId: string; title: string; channelTitle: string; warnings: string[] }
  | { ok: false; error: string }

const CHANNEL_UNCONFIRMED = 'The site could not confirm this video is on the Unknown IITians channel.'
const API_UNAVAILABLE = 'YouTube’s video details could not be read just now, so only the basics were checked.'

export async function validateYouTubeLink(raw: string): Promise<YouTubeLinkCheck> {
  const ref = parseYouTubeUrl(typeof raw === 'string' ? raw : '')
  if (!ref) {
    return {
      ok: false,
      error: 'That is not a YouTube video link. Copy it from the video’s Share button in YouTube or YouTube Studio.',
    }
  }
  // The start time rides along: one long recording can serve several questions.
  const url = canonicalYouTubeUrl(ref)
  const expected = youtubeChannelId() ?? (await connectedChannelId())
  const warnings: string[] = []

  const auth = await dataApiAuth()
  if (auth) {
    try {
      const [video] = await listVideos([ref.id], auth)
      return judge(video, { url, expected, privateVisible: 'accessToken' in auth })
    } catch {
      // Quota spent, key refused, Google slow: oEmbed can still answer the basics.
      warnings.push(API_UNAVAILABLE)
    }
  }

  let card
  try {
    card = await oEmbed(ref.id)
  } catch {
    return { ok: false, error: 'YouTube could not be reached to check the link. Try again in a minute.' }
  }

  switch (card.status) {
    case 200:
      return {
        ok: true,
        url,
        videoId: ref.id,
        title: card.title ?? '',
        channelTitle: card.authorName ?? '',
        warnings: [...warnings, CHANNEL_UNCONFIRMED],
      }
    case 401:
    case 403:
      return {
        ok: false,
        error:
          'YouTube will not let the site show that video: it is Private, or embedding is switched off. In YouTube Studio set it to Unlisted and tick Allow embedding, then paste the link again.',
      }
    // oEmbed answers 400 for an id it has never had, 404 for one it no longer shows.
    case 400:
    case 404:
      return {
        ok: false,
        error: 'YouTube has no video at that link. It may be Private or deleted, or the link was cut short.',
      }
    default:
      return { ok: false, error: 'YouTube could not be reached to check the link. Try again in a minute.' }
  }
}

/** The key when there is one, else the connected channel's token, else nothing. */
async function dataApiAuth(): Promise<{ apiKey: string } | { accessToken: string } | null> {
  const apiKey = youtubeApiKey()
  if (apiKey) return { apiKey }
  try {
    return { accessToken: await getAccessToken() }
  } catch {
    return null
  }
}

function judge(
  video: VideoResource | undefined,
  { url, expected, privateVisible }: { url: string; expected: string | null; privateVisible: boolean },
): YouTubeLinkCheck {
  if (!video) {
    return {
      ok: false,
      error: privateVisible
        ? 'YouTube has no video at that link, or it is Private on another channel.'
        : 'YouTube has no video at that link, or it is Private. In YouTube Studio set it to Unlisted, then paste the link again.',
    }
  }

  const channelId = video.snippet?.channelId ?? null
  const channelTitle = video.snippet?.channelTitle ?? ''
  const status = video.status ?? {}
  const warnings: string[] = []

  if (expected && channelId !== expected) {
    return {
      ok: false,
      error: `That video is on ${channelTitle ? `“${channelTitle}”` : 'another channel'}, not the Unknown IITians channel. Upload it there in YouTube Studio, then paste the new link.`,
    }
  }
  if (!expected) warnings.push(CHANNEL_UNCONFIRMED)

  if (status.uploadStatus === 'rejected' || status.uploadStatus === 'failed' || status.uploadStatus === 'deleted') {
    return { ok: false, error: 'YouTube rejected or removed that video. Upload it again and paste the new link.' }
  }
  if (status.privacyStatus === 'private') {
    return {
      ok: false,
      error: 'That video is Private, so students cannot watch it. In YouTube Studio set its visibility to Unlisted, then paste the link again.',
    }
  }
  if (status.embeddable === false) {
    return {
      ok: false,
      error:
        'Embedding is switched off for that video. In YouTube Studio open the video, choose Show more, tick Allow embedding and save, then paste the link again.',
    }
  }
  if (status.uploadStatus === 'uploaded') {
    warnings.push('YouTube is still processing this video. It may take a few minutes before it plays.')
  }

  return { ok: true, url, videoId: video.id, title: video.snippet?.title ?? '', channelTitle, warnings }
}
