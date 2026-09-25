/**
 * Creates the two demo accounts used for signing in without email delivery.
 *
 *   npm run demo:users
 *
 * Safe to re-run: existing accounts have their password and role reset rather
 * than being duplicated.
 *
 * These are convenience accounts for development and demos. Before the site is
 * public, delete them (or at minimum set NEXT_PUBLIC_DEMO_LOGINS=false so the
 * credentials stop being shown on the sign-in page).
 */
import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { DEMO_ACCOUNTS } from '../src/lib/demo-accounts'

loadEnv({ path: '.env.local', quiet: true })
loadEnv({ quiet: true })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function findUserByEmail(email: string): Promise<string | null> {
  // listUsers is paginated; the demo project is small enough that one page of
  // 200 covers it, and this only ever runs as a setup step.
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (error) throw new Error(error.message)
  return data.users.find((user) => user.email === email)?.id ?? null
}

async function main() {
  for (const account of DEMO_ACCOUNTS) {
    const existingId = await findUserByEmail(account.email)

    let userId = existingId
    if (userId) {
      const { error } = await supabase.auth.admin.updateUserById(userId, {
        password: account.password,
        email_confirm: true,
      })
      if (error) throw new Error(`${account.email}: ${error.message}`)
      console.log(`  reset   ${account.email}`)
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: account.email,
        password: account.password,
        email_confirm: true,
        user_metadata: { full_name: account.displayName },
      })
      if (error) throw new Error(`${account.email}: ${error.message}`)
      userId = data.user.id
      console.log(`  created ${account.email}`)
    }

    // The signup trigger creates the profile; set the role and name here,
    // which needs the service role because `role` is not writable by users.
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert(
        { id: userId, display_name: account.displayName, role: account.role },
        { onConflict: 'id' },
      )

    if (profileError) throw new Error(`${account.email}: ${profileError.message}`)
    console.log(`          role ${account.role}, password ${account.password}`)
  }

  console.log('\nDemo accounts ready. Sign in at /login.')
}

main().catch((error) => {
  console.error(`\n${(error as Error).message}\n`)
  process.exit(1)
})
