import type { NextRequest } from 'next/server'
import { after, NextResponse } from 'next/server'
import { sendPendingGroupSignups } from '@/lib/group-signup'
import { contentClient } from '@/lib/supabase/content'
import { createClient } from '@/lib/supabase/server'
import { isIpBlocked } from '@/lib/access'

/**
 * Where the magic link lands. Exchanges the one-time code for a session and
 * sets the auth cookies, then sends the user on to wherever they were headed.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  // Only ever redirect within this site — an open redirect here would let a
  // crafted sign-in link bounce a freshly authenticated user off-site.
  const destination = next.startsWith('/') && !next.startsWith('//') ? next : '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/?error=missing_code`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/?error=invalid_code`)
  }

  // A network blocked for copying cannot start a session; the block ends by itself.
  if (await isIpBlocked()) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/?error=blocked`)
  }

  // Hand the new account's email to the announcement groups once the response
  // is on its way, so a slow answer from the main site never slows a sign-in.
  // The daily job retries whatever this misses.
  const { data } = await supabase.auth.getUser()
  const userId = data.user?.id
  if (userId) after(() => sendPendingGroupSignups(contentClient(), { userId }).catch(() => undefined))

  return NextResponse.redirect(`${origin}${destination}`)
}
