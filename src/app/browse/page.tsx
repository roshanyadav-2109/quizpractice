import { redirect } from 'next/navigation'

/**
 * Browsing by exam lives on /papers now. This route stays so older links —
 * including ones this app printed itself — keep landing somewhere useful.
 */
export default async function BrowseRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const query = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') query.set(key, value)
  }

  const suffix = query.toString()
  redirect(suffix ? `/papers?${suffix}` : '/papers')
}
