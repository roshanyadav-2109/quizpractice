import type { CloudinaryRef } from '@/lib/blocks/schema'
import { publicEnv } from '@/lib/env'

/**
 * Cloudinary delivery URLs are built here, at render time, from the stored
 * public_id. Nothing in the database holds a full URL, so the cloud name, the
 * CDN and the transformation string can all change without touching content.
 */

const DEFAULT_TRANSFORMS = ['f_auto', 'q_auto', 'dpr_auto']

export function cloudinaryUrl(
  ref: CloudinaryRef,
  options: { width?: number; height?: number; crop?: string } = {},
): string {
  const cloud = ref.cloud ?? publicEnv.cloudinaryCloudName
  if (!cloud) return ''

  const version = ref.version ? `v${ref.version}/` : ''
  const extension = ref.format ? `.${ref.format}` : ''

  // The file as it is: optimised before upload, or transformations are off.
  // Every resized or re-encoded copy counts against Cloudinary's plan.
  if (ref.delivery === 'original' || !publicEnv.cloudinaryTransforms) {
    return `https://res.cloudinary.com/${cloud}/image/upload/${version}${ref.public_id}${extension}`
  }

  const transforms = [...DEFAULT_TRANSFORMS]
  const crop = options.crop ?? 'limit'
  if (options.width) transforms.push(`c_${crop}`, `w_${options.width}`)
  if (options.height) transforms.push(`h_${options.height}`)

  return `https://res.cloudinary.com/${cloud}/image/upload/${transforms.join(',')}/${version}${ref.public_id}${extension}`
}

const SRCSET_WIDTHS = [480, 768, 1024, 1400]

/** Resized versions for the browser to choose from; none for an original. */
export function cloudinarySrcSet(ref: CloudinaryRef): string | undefined {
  if (ref.delivery === 'original' || !publicEnv.cloudinaryTransforms) return undefined
  return SRCSET_WIDTHS.filter((w) => !ref.width || w <= ref.width * 2)
    .map((w) => `${cloudinaryUrl(ref, { width: w })} ${w}w`)
    .join(', ')
}

/**
 * Folder scheme mirrors the taxonomy, so assets can be found, audited and
 * cleaned up in the Cloudinary media library by browsing rather than by
 * cross-referencing the database.
 *
 *   qp/ds/dbms/quiz-1/2026-07-16/set-1563/q05-fig1
 */
export function buildPublicId(parts: {
  programSlug?: string | null
  subjectSlug: string
  examSlug: string
  sessionDate?: string | null
  setCode?: string | null
  name: string
}): string {
  const segments = [
    process.env.CLOUDINARY_UPLOAD_FOLDER || 'qp',
    parts.programSlug,
    parts.subjectSlug,
    parts.examSlug,
    parts.sessionDate,
    parts.setCode ? `set-${parts.setCode}` : null,
    parts.name,
  ]

  return segments
    .filter((segment): segment is string => Boolean(segment))
    .map((segment) => slugifySegment(segment))
    .join('/')
}

function slugifySegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
