import { createHash, randomBytes } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { NotAdminError, getCurrentProfile, requireAdmin } from '@/lib/supabase/server'
import { youtubeOAuthConfigured } from '@/lib/env'
import { OAUTH_COOKIE, authorizationUrl, oauthCookieOptions, siteOrigin } from '@/lib/youtube/google'
import { ROUTES } from '@/lib/teach/contracts'

/**
 * Starts connecting the site to the Unknown IITians channel: the admin's
 * "Connect channel" link lands here and is sent on to Google's consent screen.
 *
 * Authorization-code flow with PKCE. A random state and the PKCE verifier go
 * into a short-lived httpOnly cookie; the callback checks the state came back
 * unchanged and proves the code with the verifier, so a code intercepted on
 * the way back is useless on its own.
 */
export async function GET(request: NextRequest) {
  // The callback address is fixed to the site's main address, and the cookie
  // must be set on the host Google returns to. Coming from a preview or
  // www-less address, start again on the right one.
  const origin = siteOrigin()
  if (request.nextUrl.origin !== origin) {
    // One hop only. Arriving here a second time means the main address sends
    // visitors somewhere else (a www redirect, say): going round again would
    // loop, so say what is wrong instead.
    if (request.nextUrl.searchParams.has('moved')) {
      return NextResponse.redirect(
        new URL(`${ROUTES.adminEducators}?youtube=error&reason=site-url`, request.nextUrl.origin),
      )
    }
    const main = new URL(ROUTES.apiYoutubeConnect, origin)
    main.searchParams.set('moved', '1')
    return NextResponse.redirect(main)
  }

  const back = (reason: string) =>
    NextResponse.redirect(new URL(`${ROUTES.adminEducators}?youtube=error&reason=${reason}`, origin))

  try {
    await requireAdmin()
  } catch (error) {
    if (!(error instanceof NotAdminError)) throw error
    if (!(await getCurrentProfile())) {
      const login = new URL('/', origin)
      login.searchParams.set('login', '1')
      login.searchParams.set('next', ROUTES.adminEducators)
      return NextResponse.redirect(login)
    }
    return back('not-admin')
  }

  if (!youtubeOAuthConfigured()) return back('not-configured')

  const state = randomBytes(24).toString('base64url')
  const verifier = randomBytes(48).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')

  const response = NextResponse.redirect(authorizationUrl({ state, codeChallenge: challenge }))
  response.cookies.set(OAUTH_COOKIE.name, `${state}.${verifier}`, oauthCookieOptions())
  response.headers.set('Cache-Control', 'no-store')
  return response
}
