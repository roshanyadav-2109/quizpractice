import { cancelInvite, removeInviteAssignment } from '@/app/admin/educators/actions'
import { ActionButton } from '@/components/admin/ActionButton'
import { AssignmentForm, type BranchOption } from '@/components/admin/educators/AssignmentForm'

export interface PendingInvite {
  email: string
  role: 'teacher' | 'contributor'
  created_at: string
  invite_assignments: { program_id: string; subject_id: string }[]
}

/**
 * Invites nobody has used yet: the address, the access it carries and, for a
 * teacher, the combos that come with it. Each disappears from here the moment
 * that person first signs in with the address.
 */
export function PendingInvites({ invites, branches }: { invites: PendingInvite[]; branches: BranchOption[] }) {
  if (invites.length === 0) return null

  // Names for the combos, from the same tree the form offers.
  const subjects = new Map<string, { branch: string; level: string; name: string }>()
  for (const branch of branches) {
    for (const level of branch.levels) {
      for (const subject of level.subjects) subjects.set(subject.id, { branch: branch.name, level: level.name, name: subject.name })
    }
  }

  return (
    <ul className="mt-5 grid gap-3 xl:grid-cols-2">
      {invites.map((invite) => (
        <li key={invite.email} className="rounded-lg border border-dashed border-rule bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[0.9375rem] text-ink">{invite.email}</p>
              <p className="text-xs text-ink-muted">
                {invite.role === 'teacher' ? 'Teacher' : 'Contributor'} · waiting for their first sign-in · invited{' '}
                {new Date(invite.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </p>
            </div>
            <ActionButton
              label="Cancel invite"
              tone="danger"
              confirm={`Cancel the invite for ${invite.email}? If they sign in later they will be a student.`}
              action={cancelInvite.bind(null, invite.email)}
            />
          </div>

          {invite.role === 'teacher' ? (
            <div className="mt-3">
              <h4 className="label">Subjects they will get</h4>
              {invite.invite_assignments.length === 0 ? (
                <p className="mt-1 text-xs text-ink-muted">None yet. They can also be given subjects after they sign in.</p>
              ) : (
                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {invite.invite_assignments.map((combo) => {
                    const subject = subjects.get(combo.subject_id)
                    const label = subject ? `${subject.branch} › ${subject.level} › ${subject.name}` : 'A subject no longer listed'
                    return (
                      <li key={combo.subject_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-rule px-3 py-1.5">
                        <span className="min-w-0 text-[0.8125rem] text-ink">{label}</span>
                        <ActionButton label="Remove" action={removeInviteAssignment.bind(null, invite.email, combo.subject_id)} />
                      </li>
                    )
                  })}
                </ul>
              )}
              <div className="mt-3 border-t border-rule pt-3">
                <AssignmentForm
                  inviteEmail={invite.email}
                  teacherName={invite.email}
                  branches={branches}
                  assigned={invite.invite_assignments.map((combo) => combo.subject_id)}
                />
              </div>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
