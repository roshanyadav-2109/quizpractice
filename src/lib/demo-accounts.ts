import type { UserRole } from '@/types/db'

/**
 * Demo accounts, so the app can be signed into without waiting on email
 * delivery. Created by `npm run demo:users`.
 *
 * These are shown on the sign-in page while NEXT_PUBLIC_DEMO_LOGINS is not
 * "false". Turn that off — and delete the accounts — before the site is public.
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
    email: 'admin@example.com',
    password: 'admin1234',
    displayName: 'Demo Admin',
    role: 'admin',
    blurb: 'Everything above, plus the full admin: taxonomy, import, queues.',
  },
]

export const demoLoginsEnabled = process.env.NEXT_PUBLIC_DEMO_LOGINS !== 'false'
