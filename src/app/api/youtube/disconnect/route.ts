import { NextResponse, type NextRequest } from 'next/server'
import { NotAdminError, requireAdmin } from '@/lib/supabase/server'
import { deleteConnection } from '@/lib/youtube/connection'
import { revokeToken, siteOrigin } from '@/lib/youtube/google'
import { ROUTES } from '@/lib/teach/contracts'

/**
 * Disconnects the channel: withdraws the site's permission at Google, then
 * deletes the stored connection. Admins only.
 *
 * Answers JSON to a fetch, and a redirect back to Admin → Educators to a
 * plain form post. The stored row goes even when Google cannot be reached;
 * the answer then says so, and the permission can be removed by hand at
 * myaccount.google.com/permissions.
 */
export async function POST(request: NextRequest) {
  // The session cookie is SameSite=Lax, so another site cannot post here as
  // the admin anyway; checking the Origin as well costs nothing.
  const from = request.headers.get('origin')
  if (from && from !== request.nextUrl.origin && from !== siteOrigin()) {
    return Response.json({ error: 'Not allowed from another site.' }, { status: 403 })
  }

  try {
    await requireAdmin()
  } catch (error) {
    if (error instanceof NotAdminError) return Response.json({ error: error.message }, { status: 403 })
    throw error
  }

  let refreshToken: string | null
  try {
    ;({ refreshToken } = await deleteConnection())
  } catch {
    return Response.json({ error: 'The connection could not be removed. Try again.' }, { status: 500 })
  }
  const revoked = refreshToken ? await revokeToken(refreshToken) : false

  if (request.headers.get('accept')?.includes('text/html')) {
    const query = `youtube=disconnected${revoked ? '' : '&revoked=0'}`
    return NextResponse.redirect(new URL(`${ROUTES.adminEducators}?${query}`, siteOrigin()), 303)
  }
  return Response.json(
    {
      ok: true,
      revoked,
      message: revoked
        ? 'Disconnected. The site no longer has permission to upload to the channel.'
        : 'Disconnected here. Google could not confirm the permission was withdrawn: remove it by hand at myaccount.google.com/permissions.',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
