import 'server-only'
import { contentClient } from '@/lib/supabase/content'

/**
 * What the admin protection dashboard reads: the scraper defence's rules, its
 * decisions, who is flagged or blocked, and the numbers over time. All of it
 * comes from the service role, so the pages that call these must have checked
 * for an admin first (app/admin/protection).
 */

export type RuleMode = 'off' | 'watch' | 'enforce'

export interface Rule {
  key: string
  label: string
  description: string
  mode: RuleMode
  params: Record<string, number>
  updated_at: string
}

export interface RiskEvent {
  id: number
  at: string
  user_id: string | null
  ip: string | null
  fingerprint: string | null
  rule: string
  mode: string
  action: string
  detail: Record<string, unknown>
  email: string | null
}

export interface Overview {
  now: string
  opens_1h: number
  opens_24h: number
  accounts_active_24h: number
  accounts_total: number
  refused_24h: number
  would_24h: number
  flagged_24h: number
  banned_24h: number
  banned_total: number
  reverted_total: number
  ips_blocked: number
  devices_blocked: number
  trap_hits_24h: number
  series: { h: string; opens: number; refused: number; would: number; flagged: number; banned: number }[]
}

export interface RiskAccount {
  user_id: string
  email: string
  name: string | null
  opens_24h: number
  subjects_24h: number
  median_gap_s: number | null
  real_attempts_24h: number
  last_open: string
  banned: boolean
  ban_id: number | null
  events_24h: number
}

export interface SearchRow {
  user_id: string
  email: string
  name: string | null
  role: string
  joined: string
  last_sign_in: string | null
  opens_total: number
  last_open: string | null
  banned: boolean
  matched: string
}

export interface BanRow {
  id: number
  created_at: string
  user_id: string
  rule: string
  reason: string
  reverted_at: string | null
  email: string | null
}

export interface BlockedIp {
  ip: string
  reason: string
  created_at: string
  expires_at: string | null
  last_hit: string | null
}

export interface BlockedDevice {
  fingerprint: string
  reason: string
  created_at: string
}

export interface TrapHit {
  at: string
  kind: string
  ip: string | null
  user_agent: string | null
  path: string | null
  email: string | null
}

const db = () => contentClient()

async function emailsOf(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (unique.length === 0) return new Map()
  const { data } = await db().from('profiles').select('id, email').in('id', unique)
  return new Map(((data ?? []) as { id: string; email: string | null }[]).map((row) => [row.id, row.email ?? '']))
}

export async function loadRules(): Promise<Rule[]> {
  const { data, error } = await db().from('risk_rules').select('key, label, description, mode, params, updated_at').order('key')
  if (error) throw new Error(`risk_rules: ${error.message}`)
  return (data ?? []) as Rule[]
}

export async function loadOverview(): Promise<Overview> {
  const { data, error } = await db().rpc('risk_overview')
  if (error) throw new Error(`risk_overview: ${error.message}`)
  return data as Overview
}

export async function loadAccounts(limit = 60): Promise<RiskAccount[]> {
  const { data, error } = await db().rpc('risk_accounts', { p_limit: limit })
  if (error) throw new Error(`risk_accounts: ${error.message}`)
  return (data ?? []) as RiskAccount[]
}

export async function loadEvents(filter: { action?: string; rule?: string; limit?: number } = {}): Promise<RiskEvent[]> {
  let query = db()
    .from('risk_events')
    .select('id, at, user_id, ip, fingerprint, rule, mode, action, detail')
    .order('at', { ascending: false })
    .limit(filter.limit ?? 150)
  if (filter.action) query = filter.action === 'would' ? query.like('action', 'would_%') : query.eq('action', filter.action)
  if (filter.rule) query = query.eq('rule', filter.rule)
  const { data, error } = await query
  if (error) throw new Error(`risk_events: ${error.message}`)
  const rows = (data ?? []) as Omit<RiskEvent, 'email'>[]
  const emails = await emailsOf(rows.map((row) => row.user_id))
  return rows.map((row) => ({ ...row, email: row.user_id ? (emails.get(row.user_id) ?? null) : null }))
}

export async function loadBans(limit = 100): Promise<BanRow[]> {
  const { data, error } = await db()
    .from('risk_bans')
    .select('id, created_at, user_id, rule, reason, reverted_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`risk_bans: ${error.message}`)
  const rows = (data ?? []) as Omit<BanRow, 'email'>[]
  const emails = await emailsOf(rows.map((row) => row.user_id))
  return rows.map((row) => ({ ...row, email: emails.get(row.user_id) ?? null }))
}

export async function loadBlocks(): Promise<{ ips: BlockedIp[]; devices: BlockedDevice[] }> {
  const [ips, devices] = await Promise.all([
    db()
      .from('blocked_ips')
      .select('ip, reason, created_at, expires_at, last_hit')
      .is('released_at', null)
      .order('created_at', { ascending: false })
      .limit(200),
    db().from('blocked_devices').select('fingerprint, reason, created_at').is('released_at', null).order('created_at', { ascending: false }).limit(200),
  ])
  const now = Date.now()
  return {
    ips: ((ips.data ?? []) as BlockedIp[]).filter((row) => !row.expires_at || new Date(row.expires_at).getTime() > now),
    devices: (devices.data ?? []) as BlockedDevice[],
  }
}

export async function loadTrapHits(limit = 60): Promise<TrapHit[]> {
  const { data } = await db()
    .from('scrape_signals')
    .select('at, kind, user_id, ip, user_agent, path')
    .order('at', { ascending: false })
    .limit(limit)
  const rows = (data ?? []) as (Omit<TrapHit, 'email'> & { user_id: string | null })[]
  const emails = await emailsOf(rows.map((row) => row.user_id))
  return rows.map(({ user_id, ...row }) => ({ ...row, email: user_id ? (emails.get(user_id) ?? null) : null }))
}

/** Papers opened and decisions made in each of the last 60 minutes. */
export async function loadMinutes(): Promise<{ m: string; opens: number; decisions: number }[]> {
  const since = new Date(Date.now() - 60 * 60_000).toISOString()
  const [opens, events] = await Promise.all([
    db().from('content_access').select('opened_at').gte('opened_at', since).limit(5000),
    db().from('risk_events').select('at').gte('at', since).limit(5000),
  ])
  const bucket = (iso: string) => Math.floor(new Date(iso).getTime() / 60_000)
  const start = bucket(since)
  const out = Array.from({ length: 61 }, (_, index) => ({ m: new Date((start + index) * 60_000).toISOString(), opens: 0, decisions: 0 }))
  for (const row of (opens.data ?? []) as { opened_at: string }[]) {
    const slot = out[bucket(row.opened_at) - start]
    if (slot) slot.opens += 1
  }
  for (const row of (events.data ?? []) as { at: string }[]) {
    const slot = out[bucket(row.at) - start]
    if (slot) slot.decisions += 1
  }
  return out
}

export async function loadAccount(userId: string): Promise<Record<string, unknown>> {
  const { data, error } = await db().rpc('risk_account', { p_user: userId })
  if (error) throw new Error(`risk_account: ${error.message}`)
  return data as Record<string, unknown>
}

/** The accounts and addresses sharing a browser or address with this account. */
export async function loadRelated(userId: string): Promise<{ email: string | null; via: string; value: string }[]> {
  const mine = await db().from('device_sightings').select('fingerprint, ip').eq('user_id', userId)
  const rows = (mine.data ?? []) as { fingerprint: string; ip: string | null }[]
  if (rows.length === 0) return []
  const fps = [...new Set(rows.map((row) => row.fingerprint))]
  const ips = [...new Set(rows.map((row) => row.ip).filter((ip): ip is string => Boolean(ip)))]
  const [byFp, byIp] = await Promise.all([
    db().from('device_sightings').select('user_id, fingerprint, ip').in('fingerprint', fps).neq('user_id', userId).limit(200),
    ips.length ? db().from('device_sightings').select('user_id, fingerprint, ip').in('ip', ips).neq('user_id', userId).limit(200) : Promise.resolve({ data: [] }),
  ])
  const found = new Map<string, { via: string; value: string }>()
  for (const row of (byFp.data ?? []) as { user_id: string; fingerprint: string }[]) found.set(`${row.user_id}|f`, { via: 'same browser', value: row.fingerprint })
  for (const row of (byIp.data ?? []) as { user_id: string; ip: string }[]) {
    if (!found.has(`${row.user_id}|f`)) found.set(`${row.user_id}|i`, { via: 'same address', value: row.ip })
  }
  const emails = await emailsOf([...found.keys()].map((key) => key.split('|')[0]))
  return [...found.entries()].map(([key, info]) => ({ email: emails.get(key.split('|')[0]) ?? null, ...info }))
}

/** Accounts matching an e-mail or name fragment, an account id, an address or a browser id. */
export async function searchAccounts(query: string): Promise<SearchRow[]> {
  const q = query.trim().slice(0, 120)
  if (q.length < 2) return []
  const { data, error } = await db().rpc('risk_search', { p_q: q, p_limit: 50 })
  if (error) throw new Error(`risk_search: ${error.message}`)
  return (data ?? []) as SearchRow[]
}

export interface RuleStat {
  rule: string
  /** What the rule did in the last 24 hours, by action. */
  last24h: Record<string, number>
  /** Everything it did in the last 7 days. */
  last7d: number
  lastAt: string | null
}

/** How often each rule has acted (or would have, in Watch), for the Rules tab. */
export async function loadRuleStats(): Promise<Map<string, RuleStat>> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const { data } = await db().from('risk_events').select('rule, action, at').gte('at', since).neq('action', 'rule_changed').limit(20000)
  const day = Date.now() - 86_400_000
  const out = new Map<string, RuleStat>()
  for (const row of (data ?? []) as { rule: string; action: string; at: string }[]) {
    const stat = out.get(row.rule) ?? { rule: row.rule, last24h: {}, last7d: 0, lastAt: null }
    stat.last7d += 1
    if (new Date(row.at).getTime() >= day) stat.last24h[row.action] = (stat.last24h[row.action] ?? 0) + 1
    if (!stat.lastAt || row.at > stat.lastAt) stat.lastAt = row.at
    out.set(row.rule, stat)
  }
  return out
}

export interface TrustedRow {
  user_id: string
  email: string | null
  reason: string | null
  at: string
}

/** Accounts an admin has marked trusted: never banned automatically. */
export async function loadTrusted(): Promise<TrustedRow[]> {
  const { data } = await db().from('risk_trusted').select('user_id, reason, at').order('at', { ascending: false }).limit(200)
  const rows = (data ?? []) as Omit<TrustedRow, 'email'>[]
  const emails = await emailsOf(rows.map((row) => row.user_id))
  return rows.map((row) => ({ ...row, email: emails.get(row.user_id) ?? null }))
}

export async function isTrusted(userId: string): Promise<boolean> {
  const { data } = await db().from('risk_trusted').select('user_id').eq('user_id', userId).maybeSingle()
  return Boolean(data)
}
