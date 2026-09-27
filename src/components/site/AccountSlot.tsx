'use client'

import { AccountMenu } from './AccountMenu'
import { SignInButton } from './AuthDialog'
import { useViewer } from './Viewer'

/**
 * The right end of the bar: the account menu for someone signed in, Sign in
 * for everyone else. Until the browser has looked for a session it holds the
 * space with a quiet circle, so a signed-in student never sees "Sign in"
 * flash up first.
 */
export function AccountSlot() {
  const { status, profile } = useViewer()

  if (status === 'signed-in' && profile) {
    return (
      <AccountMenu
        name={profile.name}
        email={profile.email}
        avatarUrl={profile.avatarUrl}
        staff={profile.staff}
        teacher={profile.teacher}
      />
    )
  }

  if (status === 'loading') {
    return <span aria-hidden className="block h-9 w-9 rounded-full bg-surface-2" />
  }

  return (
    <SignInButton className="inline-flex h-10 items-center justify-center rounded-full bg-ink px-5 text-ui text-white transition-colors hover:bg-ink/85">
      Sign in
    </SignInButton>
  )
}
