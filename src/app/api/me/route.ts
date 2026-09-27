import { getCurrentProfile, isStaff, isTeacher } from '@/lib/supabase/server'
import { getMistakeBank, getMyAttempts, summariseMyAttempts } from '@/lib/queries'

export const dynamic = 'force-dynamic'

/**
 * Who is signed in, and the little of their own progress the public pages
 * show: the best score on each set they have sat, and how many mistakes are
 * still to fix.
 *
 * The catalogue pages are rendered once and served to everyone from the
 * CDN, so they cannot know who is looking. The browser asks here instead,
 * once per visit, and only when it holds a session — a crawler or a
 * signed-out visitor never calls it.
 */
export async function GET() {
  const profile = await getCurrentProfile()
  if (!profile) return Response.json({ profile: null }, { headers: { 'Cache-Control': 'private, no-store' } })

  const [attempts, mistakes] = await Promise.all([getMyAttempts(300), getMistakeBank()])
  const { bySet } = summariseMyAttempts(attempts)

  return Response.json(
    {
      profile: {
        name: profile.displayName,
        email: profile.email,
        avatarUrl: profile.avatarUrl,
        staff: isStaff(profile),
        teacher: isTeacher(profile),
      },
      best: Object.fromEntries(bySet),
      mistakesDue: mistakes.filter((mistake) => mistake.state !== 'fixed').length,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
