import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import { getBrowseTree } from '@/lib/queries'
import { publicEnv } from '@/lib/env'
import { getYouTubeStatus, youtubeConnectMessage, type YouTubeStatus } from '@/lib/youtube/connection'
import { toAssignmentSummary, type AssignmentSummary, type AssignmentSummaryRaw } from '@/lib/teach/contracts'
import { PeopleSearch } from '@/components/admin/educators/PeopleSearch'
import { TeacherCard } from '@/components/admin/educators/TeacherCard'
import { YouTubePanel } from '@/components/admin/educators/YouTubePanel'
import { InviteForm } from '@/components/admin/educators/InviteForm'
import { PendingInvites, type PendingInvite } from '@/components/admin/educators/PendingInvites'
import type { BranchOption } from '@/components/admin/educators/AssignmentForm'
import type { AdminPersonRow } from '@/types/db'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ q?: string; youtube?: string; reason?: string; revoked?: string }>

/**
 * Educators: who teaches, what they teach, and the YouTube channel their
 * videos go to. Admins only — a contributor sees the section's purpose and
 * nothing else.
 *
 * Read live on every visit: a handful of teachers, and what an admin just
 * changed must show at once.
 */
export default async function EducatorsPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await getCurrentProfile()
  if (profile?.role !== 'admin') {
    return (
      <div className="max-w-xl rounded-lg border border-rule bg-surface p-5">
        <h2 className="font-medium text-ink">Educators</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Only an admin can make teachers, give them subjects and connect the YouTube channel. Ask an admin if
          someone needs access.
        </p>
      </div>
    )
  }

  const params = await searchParams
  const query = (params.q ?? '').trim().slice(0, 100)

  const supabase = await createClient()
  const [teachersResult, peopleResult, invitesResult, tree, youtube] = await Promise.all([
    supabase.rpc('admin_list_people', { p_search: null, p_role: 'teacher', p_limit: 100 }),
    supabase.rpc('admin_list_people', { p_search: query || null, p_role: null, p_limit: query ? 50 : 20 }),
    supabase
      .from('access_invites')
      .select('email, role, created_at, invite_assignments(program_id, subject_id)')
      .order('created_at', { ascending: false }),
    getBrowseTree(),
    getYouTubeStatus().catch(
      (error: unknown): YouTubeStatus => ({
        connected: false,
        channelId: null,
        channelTitle: null,
        connectedAt: null,
        lastError: error instanceof Error ? error.message : 'The connection could not be read.',
        apiUploads: false,
        expectedChannelId: null,
        oauthConfigured: false,
      }),
    ),
  ])

  const teachers = (teachersResult.data ?? []) as AdminPersonRow[]
  const summaries = await Promise.all(
    teachers.map(async (teacher) => {
      const { data, error } = await supabase.rpc('teacher_subject_summary', { p_teacher: teacher.id })
      if (error) return { rows: [] as AssignmentSummary[], error: error.message }
      return { rows: ((data ?? []) as AssignmentSummaryRaw[]).map(toAssignmentSummary), error: null }
    }),
  )

  // What the combo form offers: every live branch with its levels and subjects.
  const branches: BranchOption[] = tree.map((program) => ({
    id: program.id,
    name: program.name,
    levels: program.levels.map((level) => ({
      id: level.id,
      name: level.name,
      subjects: level.subjects.map((subject) => ({ id: subject.id, name: subject.name })),
    })),
  }))

  return (
    <div className="flex flex-col gap-10">
      <header>
        <h2 className="font-medium text-ink">Educators</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          A teacher works only on the branch + subject combos given here. The same subject in two branches (English I
          in Data Science and in Electronic Systems) is two separate combos. One explanation reaches every copy of a
          question across papers and years, so progress is counted in groups of copies.
        </p>
      </header>

      <section>
        <SectionHeading
          title="Teachers"
          meta={teachersResult.error ? undefined : `${teachers.length}`}
          hint="Give someone access by email below, or make someone who has signed in a teacher under People."
        />
        {teachersResult.error ? (
          <ErrorNote what="Teachers" message={teachersResult.error.message} />
        ) : teachers.length === 0 ? (
          <p className="rounded-lg border border-dashed border-rule px-4 py-8 text-center text-sm text-ink-muted">
            No teachers yet. Find someone under People and make them a teacher.
          </p>
        ) : (
          <ul className="grid gap-4 xl:grid-cols-2">
            {teachers.map((teacher, index) => (
              <TeacherCard
                key={teacher.id}
                teacher={teacher}
                summaries={summaries[index].rows}
                summaryError={summaries[index].error}
                branches={branches}
              />
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionHeading
          title="Give access by email"
          meta={invitesResult.error ? undefined : invitesResult.data?.length ? `${invitesResult.data.length} waiting` : undefined}
          hint="Enter the Google address they sign in with. The access, and a teacher's subjects, apply the first time they sign in, or at once if they already have an account."
        />
        <InviteForm />
        {invitesResult.error ? (
          <div className="mt-3">
            <ErrorNote what="Invites" message={invitesResult.error.message} />
          </div>
        ) : (
          <PendingInvites invites={(invitesResult.data ?? []) as PendingInvite[]} branches={branches} />
        )}
      </section>

      <section>
        <SectionHeading
          title="People"
          hint="Everyone who has signed in. Admin roles are changed in the Supabase dashboard, not here."
        />
        <PeopleSearch
          query={query}
          people={(peopleResult.data ?? []) as AdminPersonRow[]}
          selfId={profile.id}
          error={peopleResult.error?.message ?? null}
        />
      </section>

      <section>
        <SectionHeading
          title="YouTube"
          hint="Needed only for the one-click upload. Pasting a link works without it."
        />
        <YouTubePanel
          status={youtube}
          banner={youtubeBanner(params)}
          contactEmailSet={Boolean(publicEnv.contactEmail)}
        />
      </section>
    </div>
  )
}

/** The sentence for ?youtube=… after the connect or disconnect round trip. */
function youtubeBanner(params: {
  youtube?: string
  reason?: string
  revoked?: string
}): { tone: 'correct' | 'incorrect'; text: string } | null {
  switch (params.youtube) {
    case 'connected':
      return { tone: 'correct', text: 'Channel connected. Its title and id are shown below.' }
    case 'disconnected':
      return params.revoked === '0'
        ? {
            tone: 'incorrect',
            text: 'Disconnected here, but Google could not confirm the permission was withdrawn: remove it by hand at myaccount.google.com/permissions.',
          }
        : { tone: 'correct', text: 'Disconnected. The site no longer has permission to upload to the channel.' }
    case 'error':
      return { tone: 'incorrect', text: youtubeConnectMessage(params.reason) }
    default:
      return null
  }
}

function SectionHeading({ title, meta, hint }: { title: string; meta?: string; hint?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm tracking-wide text-ink-muted uppercase">
        {title}
        {meta ? <span className="ml-2 text-ink-faint tabular-nums normal-case">{meta}</span> : null}
      </h3>
      {hint ? <p className="mt-0.5 text-xs text-ink-faint">{hint}</p> : null}
    </div>
  )
}

function ErrorNote({ what, message }: { what: string; message: string }) {
  return (
    <p className="rounded-md bg-incorrect-soft px-3 py-2 text-xs text-incorrect">
      {what} could not be loaded: {message}
    </p>
  )
}
