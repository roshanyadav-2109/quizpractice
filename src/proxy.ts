import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { publicEnv } from '@/lib/env'

/**
 * The two gated areas and who may enter each: /admin for staff (admins and
 * contributors), /teach for teachers (teachers and admins — a contributor
 * edits papers and is not a teacher).
 */
const AREAS: Record<'admin' | 'teach', readonly string[]> = {
  admin: ['admin', 'contributor'],
  teach: ['teacher', 'admin'],
}

function areaOf(pathname: string): keyof typeof AREAS | null {
  if (pathname.startsWith('/admin')) return 'admin'
  if (pathname === '/teach' || pathname.startsWith('/teach/')) return 'teach'
  return null
}

/**
 * Runs before every matched request.
 *
 * Two jobs: keep the Supabase session cookie fresh (server components cannot
 * write cookies, so without this a session would silently expire mid-visit),
 * and bounce visitors away from /admin and /teach before any of their code
 * runs: signed out, to the sign-in dialog; signed in without the role, home.
 *
 * The teaching API (/api/teach) is not gated here: its routes answer 401 or
 * 403 as JSON themselves, which a script can read and a redirect is not.
 *
 * Next 16 renamed `middleware` to `proxy`; the named export must be `proxy`.
 */
/**
 * The subject pages' old address, /subject/<slug>?exam=…&year=…&term=…, on
 * to the new one — /pyq/<slug>/<exam>/<term>-<year> — as a real permanent
 * redirect, answered here before any page streams. The new pages sort out
 * a subject, exam or term that does not exist.
 */
function oldSubjectAddress(url: URL): URL | null {
  const match = /^\/subject\/([a-z0-9-]+)\/?$/.exec(url.pathname)
  if (!match) return null
  const exam = url.searchParams.get('exam')
  const year = url.searchParams.get('year')
  const term = url.searchParams.get('term')
  let path = `/pyq/${match[1]}`
  if (exam && /^[a-z0-9-]+$/.test(exam)) {
    path += `/${exam}`
    if (year && /^\d{4}$/.test(year) && term && /^(jan|may|sep)$/.test(term)) path += `/${term}-${year}`
  }
  return new URL(path, url)
}

export async function proxy(request: NextRequest) {
  const moved = oldSubjectAddress(request.nextUrl)
  if (moved) return NextResponse.redirect(moved, 308)

  let response = NextResponse.next({ request })

  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) {
    return response
  }

  const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  // getClaims() verifies the token against the project's signing keys — held
  // in process, so no network — and refreshes it when it is about to expire.
  // getUser() did the same job with a round trip to Supabase Auth on every
  // request, prefetches included: a third of a second before any page began.
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub ?? null

  // A redirect is a new response: carry over whatever cookie getClaims() just
  // refreshed (or cleared), or the browser keeps the spent token and the next
  // request has to refresh it all over again.
  const redirectTo = (url: URL) => {
    const redirect = NextResponse.redirect(url)
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie)
    return redirect
  }

  const area = areaOf(request.nextUrl.pathname)
  if (area) {
    if (!userId) {
      // Sign-in is a dialog: land on the home page with it open, and come
      // back to the same page — a teacher's queue keeps its filters.
      const loginUrl = new URL('/', request.url)
      loginUrl.searchParams.set('login', '1')
      loginUrl.searchParams.set(
        'next',
        area === 'teach' ? request.nextUrl.pathname + request.nextUrl.search : request.nextUrl.pathname,
      )
      return redirectTo(loginUrl)
    }

    // The role check itself is enforced again in each area's layout and pages,
    // and by RLS. This is only here to avoid rendering the shell to a signed-in
    // student who typed the URL. The role is read fresh on every request, not
    // from the profile cache, so a teacher an admin has just demoted is turned
    // away at once.
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()

    const role = (profile as { role?: string } | null)?.role ?? ''
    if (!AREAS[area].includes(role)) {
      return redirectTo(new URL('/', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Only the pages that read the session on the server, and the API routes
     * that act as the signed-in user. Everything else — the home page, every
     * subject, paper and question page, the sitemaps — is the same for every
     * visitor and is served straight from the CDN, with nothing in front of
     * it. On those pages the browser keeps its own session fresh and asks
     * /api/me who is signed in.
     *
     * Not the explanations API, which needs no session and is cached by the
     * CDN — a refreshed session cookie on it would stop that — nor the
     * cache-refresh endpoint, which scripts call with a secret. Nor the video
     * upload routes: the proxy buffers a request body before passing it on,
     * so every 4 MiB chunk would be held twice, and those routes check the
     * session themselves (a route handler can refresh its own cookie).
     */
    // Old addresses, redirected before anything renders.
    '/subject/:path*',
    '/admin/:path*',
    '/teach/:path*',
    '/teach',
    '/dashboard/:path*',
    '/mistakes/:path*',
    '/result/:path*',
    '/practice/:path*',
    '/auth/:path*',
    '/login',
    '/api/me',
    '/api/attempts/:path*',
    '/api/import/:path*',
    '/api/cloudinary/:path*',
    '/api/reviews/:path*',
    '/api/youtube/:path*',
  ],
}
