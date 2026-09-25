import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { publicEnv } from '@/lib/env'

/**
 * Runs before every matched request.
 *
 * Two jobs: keep the Supabase session cookie fresh (server components cannot
 * write cookies, so without this a session would silently expire mid-visit),
 * and bounce anonymous visitors away from /admin before any admin code runs.
 *
 * Next 16 renamed `middleware` to `proxy`; the named export must be `proxy`.
 */
export async function proxy(request: NextRequest) {
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

  if (request.nextUrl.pathname.startsWith('/admin')) {
    if (!userId) {
      // Sign-in is a dialog: land on the home page with it open.
      const loginUrl = new URL('/', request.url)
      loginUrl.searchParams.set('login', '1')
      loginUrl.searchParams.set('next', request.nextUrl.pathname)
      return NextResponse.redirect(loginUrl)
    }

    // The role check itself is enforced again in the admin layout and by RLS.
    // This is only here to avoid rendering the admin shell to a signed-in
    // student who typed the URL.
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()

    const role = (profile as { role?: string } | null)?.role
    if (role !== 'admin' && role !== 'contributor') {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files. Without an exclusion
     * like this the proxy would run on every CSS and JS request too.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
