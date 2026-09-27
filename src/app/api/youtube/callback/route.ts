import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { NotAdminError, requireAdmin } from '@/lib/supabase/server'
import { youtubeChannelId, youtubeOAuthConfigured } from '@/lib/env'
import {
  OAUTH_COOKIE,
  YOUTUBE_SCOPES,
  exchangeCode,
  myChannel,
  oauthCookieOptions,
  siteOrigin,
  type ChannelInfo,
  type TokenResponse,
} from '@/lib/youtube/google'
import { saveConnection } from '@/lib/youtube/connection'
import { ROUTES } from '@/lib/teach/contracts'

/**
 * Where Google sends the admin back after the consent screen.
 *
 * Checks the state against the cookie, trades the code (with the PKCE
 * verifier) for tokens, makes sure both permissions were granted and a
 * lasting refresh token came with them, reads which channel was picked —
 * refusing any but YOUTUBE_CHANNEL_ID when that is set — then stores the
 * refresh token sealed and returns to Admin → Educators.
 *
 * A failed attempt revokes nothing: when the same account is already
 * connected, revoking the new grant would take the working one down with it.
 */
export async function GET(request: NextRequest) {
  const origin = siteOrigin()
  const finish = (query: string) => {
    const response = NextResponse.redirect(new URL(`${ROUTES.adminEducators}?${query}`, origin))
    response.cookies.set(OAUTH_COOKIE.name, '', oauthCookieOptions(0))
    response.headers.set('Cache-Control', 'no-store')
    return response
  }
  const fail = (reason: string) => finish(`youtube=error&reason=${reason}`)

  let admin
  try {
    admin = await requireAdmin()
  } catch (error) {
    if (error instanceof NotAdminError) return fail('not-admin')
    throw error
  }
  if (!youtubeOAuthConfigured()) return fail('not-configured')

  const params = request.nextUrl.searchParams
  const [savedState = '', verifier = ''] = (request.cookies.get(OAUTH_COOKIE.name)?.value ?? '').split('.')
  if (!savedState || !verifier || !sameText(params.get('state') ?? '', savedState)) return fail('state')

  const googleError = params.get('error')
  if (googleError) return fail(googleError === 'access_denied' ? 'denied' : 'google')
  const code = params.get('code')
  if (!code) return fail('google')

  let tokens: TokenResponse
  try {
    tokens = await exchangeCode({ code, codeVerifier: verifier })
  } catch {
    return fail('google')
  }

  // Google's consent screen lets the owner untick a permission.
  const granted = new Set((tokens.scope ?? '').split(/\s+/))
  if (!YOUTUBE_SCOPES.every((scope) => granted.has(scope))) return fail('scope')
  if (!tokens.refresh_token) return fail('no-refresh-token')

  let channel: ChannelInfo | null
  try {
    channel = await myChannel(tokens.access_token)
  } catch {
    return fail('google')
  }
  if (!channel) return fail('no-channel')
  const expected = youtubeChannelId()
  if (expected && channel.id !== expected) return fail('wrong-channel')

  try {
    await saveConnection({
      channelId: channel.id,
      refreshToken: tokens.refresh_token,
      scopes: [...granted].filter(Boolean).join(' '),
      connectedBy: admin.id,
    })
  } catch {
    return fail('save')
  }

  return finish('youtube=connected')
}

/** Compares two strings in constant time. */
function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
