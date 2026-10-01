'use server'

import { revalidatePath } from 'next/cache'
import { contentClient } from '@/lib/supabase/content'
import { requireAdmin } from '@/lib/supabase/server'
import type { ActionState } from '@/app/admin/actions'
import type { RuleMode } from '@/lib/protection'

/**
 * What an admin can do to the scraper defence: switch a rule off, to watch or to
 * enforce, change its numbers, and undo what it did. Every action checks for an
 * admin first, because the database calls below run as the service role.
 */

const PAGE = '/admin/protection'
const MODES: readonly RuleMode[] = ['off', 'watch', 'enforce']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const IP = /^[0-9a-f:.]{3,45}$/i

async function admin() {
  try {
    return await requireAdmin()
  } catch {
    return null
  }
}

function fail(error: string): ActionState {
  return { ok: false, error }
}

export async function setRuleMode(key: string, mode: string): Promise<ActionState> {
  const profile = await admin()
  if (!profile) return fail('Only an admin can change the protection rules.')
  if (!MODES.includes(mode as RuleMode)) return fail('Unknown mode.')
  const { error } = await contentClient()
    .from('risk_rules')
    .update({ mode, updated_at: new Date().toISOString(), updated_by: profile.id })
    .eq('key', key)
  if (error) return fail(error.message)
  await contentClient().from('risk_events').insert({
    user_id: null,
    rule: key,
    mode,
    action: 'rule_changed',
    detail: { by: profile.id, mode },
  })
  revalidatePath(PAGE)
  return { ok: true }
}

export async function setRuleParams(key: string, params: Record<string, number>): Promise<ActionState> {
  const profile = await admin()
  if (!profile) return fail('Only an admin can change the protection rules.')
  const clean: Record<string, number> = {}
  for (const [name, value] of Object.entries(params)) {
    if (!/^[a-z_0-9]+$/.test(name) || !Number.isFinite(value) || value < 0 || value > 100000) return fail(`"${name}" must be a number from 0 to 100000.`)
    clean[name] = value
  }
  const { error } = await contentClient()
    .from('risk_rules')
    .update({ params: clean, updated_at: new Date().toISOString(), updated_by: profile.id })
    .eq('key', key)
  if (error) return fail(error.message)
  await contentClient().from('risk_events').insert({
    user_id: null,
    rule: key,
    mode: 'n/a',
    action: 'rule_changed',
    detail: { by: profile.id, params: clean },
  })
  revalidatePath(PAGE)
  return { ok: true }
}

/** Undo one ban: the account, its browser and its addresses are released. */
export async function revertBan(banId: number): Promise<ActionState> {
  const profile = await admin()
  if (!profile) return fail('Only an admin can undo a ban.')
  const { error } = await contentClient().rpc('risk_revert_ban', { p_ban: banId, p_by: profile.id })
  if (error) return fail(error.message)
  revalidatePath(PAGE)
  return { ok: true }
}

/** Undo every ban a rule made, and put the rule back to watch. */
export async function revertRule(rule: string): Promise<ActionState> {
  const profile = await admin()
  if (!profile) return fail('Only an admin can undo a rule.')
  const { error } = await contentClient().rpc('risk_revert_rule', { p_rule: rule, p_by: profile.id })
  if (error) return fail(error.message)
  revalidatePath(PAGE)
  return { ok: true }
}

export async function releaseIp(ip: string): Promise<ActionState> {
  const profile = await admin()
  if (!profile) return fail('Only an admin can release an address.')
  if (!IP.test(ip)) return fail('That is not an address.')
  const { error } = await contentClient().rpc('risk_release_ip', { p_ip: ip, p_by: profile.id })
  if (error) return fail(error.message)
  revalidatePath(PAGE)
  return { ok: true }
}

export async function releaseDevice(fingerprint: string): Promise<ActionState> {
  const profile = await admin()
  if (!profile) return fail('Only an admin can release a browser.')
  const { error } = await contentClient().rpc('risk_release_device', { p_fp: fingerprint, p_by: profile.id })
  if (error) return fail(error.message)
  revalidatePath(PAGE)
  return { ok: true }
}

/** Block an address by hand, for the hours given (default 24). */
export async function blockIp(ip: string, hours = 24): Promise<ActionState> {
  const profile = await admin()
  if (!profile) return fail('Only an admin can block an address.')
  if (!IP.test(ip)) return fail('That is not an address.')
  const { error } = await contentClient()
    .from('blocked_ips')
    .upsert({ ip, reason: 'Blocked by an admin', expires_at: new Date(Date.now() + Math.min(Math.max(hours, 1), 24 * 365) * 3_600_000).toISOString(), released_at: null })
  if (error) return fail(error.message)
  await contentClient().from('risk_events').insert({ user_id: null, ip, rule: 'ip_block', mode: 'enforce', action: 'ip_blocked', detail: { by: profile.id, hours } })
  revalidatePath(PAGE)
  return { ok: true }
}

/** Ban an account by hand: the same ban, the same evidence and the same undo as an automatic one. */
export async function banAccount(userId: string, note?: string): Promise<ActionState> {
  const profile = await admin()
  if (!profile) return fail('Only an admin can ban an account.')
  if (!UUID.test(userId)) return fail('That is not an account.')
  const { error } = await contentClient().rpc('ban_account', {
    p_user: userId,
    p_rule: 'manual',
    p_reason: `Banned by an admin${note ? `: ${note}` : ''}`,
    p_detail: { by: profile.id },
  })
  if (error) return fail(error.message)
  revalidatePath(PAGE)
  return { ok: true }
}

/** Mark an event as looked at. */
export async function reviewEvent(id: number): Promise<ActionState> {
  const profile = await admin()
  if (!profile) return fail('Only an admin can review events.')
  const { error } = await contentClient().from('risk_events').update({ reviewed_at: new Date().toISOString() }).eq('id', id)
  if (error) return fail(error.message)
  revalidatePath(PAGE)
  return { ok: true }
}
