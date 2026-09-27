import type { UserRole } from '@/types/db'

/**
 * Demo accounts, so the app can be signed into without waiting on email
 * delivery. Created by `npm run demo:users`.
 *
 * These are shown on the sign-in page while NEXT_PUBLIC_DEMO_LOGINS is not
 * "false". Turn that off — and delete the accounts — before the site is public.
 *
 * There is no demo admin: its password is public, so it was demoted once the
 * site had a real admin. Admins are made in the database, never from here.
 */
export interface DemoAccount {
  email: string
  password: string
  displayName: string
  role: UserRole
  blurb: string
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    email: 'demo@example.com',
    password: 'demo1234',
    displayName: 'Demo Student',
    role: 'student',
    blurb: 'Practise papers, save attempts, post in discussions.',
  },
  {
    email: 'teacher@example.com',
    password: 'teacher1234',
    displayName: 'Demo Teacher',
    role: 'teacher',
    blurb: 'The teaching desk and studio, for the subjects an admin assigns.',
  },
]

export const demoLoginsEnabled = process.env.NEXT_PUBLIC_DEMO_LOGINS !== 'false'

/**
 * A demo account: its password is public, so it can look around and record a
 * take, but never publish to the real YouTube channel. Every demo address is
 * on example.com, a reserved domain no Google account can have.
 */
export function isDemoAccount(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.toLowerCase().endsWith('@example.com')
}
