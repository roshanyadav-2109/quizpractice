import { redirect } from 'next/navigation'

/**
 * There is no sign-in page: signing in is a dialog that opens over whatever
 * you were doing. This route stays so old links, bookmarks and redirects land
 * on the home page with the dialog already open.
 */
export default async function LoginRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const query = new URLSearchParams({ login: '1' })
  for (const key of ['next', 'error']) {
    const value = params[key]
    if (typeof value === 'string') query.set(key, value)
  }
  redirect(`/?${query.toString()}`)
}
