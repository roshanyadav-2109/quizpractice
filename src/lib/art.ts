import manifest from './art-manifest.json'

export type ArtKind = 'programs' | 'levels' | 'exams' | 'subjects'

/**
 * The icon made for a branch, level, exam or subject, or null if it has none yet.
 *
 * The manifest is written by `npm run icons:cut` as icons are added, so this
 * never points at a file that is not there.
 */
export function artFor(kind: ArtKind, slug: string): string | null {
  return (manifest as Record<string, string>)[`${kind}/${slug}`] ?? null
}
