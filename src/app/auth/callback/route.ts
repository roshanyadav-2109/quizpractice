import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

  return NextResponse.redirect(`${origin}${destination}`)
}
