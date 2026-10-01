import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/supabase/server'
import { ActionButton } from '@/components/admin/ActionButton'
import { AutoRefresh } from '@/components/admin/protection/AutoRefresh'
import { RuleControl } from '@/components/admin/protection/RuleControl'
import { DayChart, MinuteChart } from '@/components/admin/protection/charts'
import {
  loadAccounts,
  loadBans,
  loadBlocks,
  loadEvents,
  loadMinutes,
  loadOverview,
  loadRules,
  loadTrapHits,
  searchAccounts,
  type RiskEvent,
} from '@/lib/protection'
import { blockIp, releaseDevice, releaseIp, revertBan, revertRule, setRuleMode, setRuleParams, reviewEvent } from '@/app/admin/protection/actions'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ tab?: string; action?: string; rule?: string; q?: string }>

const TABS = [
  ['overview', 'Overview'],
  ['accounts', 'Accounts'],
  ['events', 'Live events'],
  ['blocks', 'Blocked & banned'],
  ['rules', 'Rules'],
  ['trap', 'Trap hits'],
] as const

const ACTION_TONE: Record<string, string> = {
  banned: 'bg-incorrect-soft text-incorrect',
  ip_blocked: 'bg-incorrect-soft text-incorrect',
  device_blocked: 'bg-incorrect-soft text-incorrect',
  blocked: 'bg-incorrect-soft text-incorrect',
  refused: 'bg-incorrect-soft text-incorrect',
  slowed: 'bg-incorrect-soft text-incorrect',
  flagged: 'bg-surface-2 text-ink',
  unblocked: 'bg-surface-2 text-correct',
  rule_changed: 'bg-surface-2 text-ink',
}

function Chip({ action }: { action: string }) {
  const tone = action.startsWith('would_') ? 'border border-rule text-ink-muted' : (ACTION_TONE[action] ?? 'bg-surface-2 text-ink-muted')
  return <span className={`rounded-full px-2 py-0.5 font-mono text-[0.6875rem] ${tone}`}>{action.replace('_', ' ')}</span>
}

function Stat({ label, value, note, tone }: { label: string; value: number | string; note?: string; tone?: 'bad' | 'good' }) {
  return (
    <div className="rounded-lg border border-rule bg-surface p-3">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`mt-1 text-xl font-medium ${tone === 'bad' ? 'text-incorrect' : tone === 'good' ? 'text-correct' : 'text-ink'}`}>{value}</p>
      {note ? <p className="mt-0.5 text-[0.6875rem] text-ink-faint">{note}</p> : null}
    </div>
  )
}

function detailText(event: RiskEvent): string {
  const d = event.detail ?? {}
  const parts: string[] = []
  if (typeof d.reason === 'string') parts.push(d.reason)
  if (d.opened_today != null) parts.push(`${d.opened_today} papers today`)
  if (d.waited_s != null) parts.push(`waited ${d.waited_s}s of ${d.needed_s}s`)
  if (d.median_gap_s != null) parts.push(`gap ${d.median_gap_s}s`)
  if (d.subjects_24h != null) parts.push(`${d.subjects_24h} subjects`)
  if (d.real_attempts_24h != null) parts.push(`${d.real_attempts_24h} attempts`)
  if (d.ban_id != null) parts.push(`ban #${d.ban_id}`)
  if (typeof d.mode === 'string') parts.push(`now ${d.mode}`)
  return parts.join(' · ')
}

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })

export default async function ProtectionPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await getCurrentProfile()
  if (profile?.role !== 'admin') redirect('/admin')

  const { tab: rawTab = 'overview', action, rule: ruleFilter, q = '' } = await searchParams
  const tab = q.trim() ? 'search' : rawTab

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium text-ink">Protection</h2>
          <p className="text-xs text-ink-muted">Copy protection for the question bank: what it sees, what it did, and the switches to undo it.</p>
        </div>
        {tab === 'overview' || tab === 'events' || tab === 'accounts' ? <AutoRefresh seconds={tab === 'events' ? 5 : 10} /> : null}
      </div>

      <form action="/admin/protection" className="mb-4 flex flex-wrap items-center gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Find an account: e-mail, name, account id, an address (203.0.113.7) or a browser id"
          className="h-8 min-w-[280px] flex-1 rounded-[3px] border border-rule bg-surface px-3 text-xs text-ink placeholder:text-ink-faint"
        />
        <button type="submit" className="h-8 rounded-[3px] bg-accent px-3 text-xs text-accent-ink">Search</button>
        {q ? <Link href="/admin/protection" className="text-xs text-ink-muted hover:text-ink">Clear</Link> : null}
      </form>

      <nav className="mb-5 flex flex-wrap gap-1.5">
        {TABS.map(([value, label]) => (
          <Link
            key={value}
            href={`/admin/protection?tab=${value}`}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              tab === value ? 'bg-accent text-accent-ink' : 'border border-rule text-ink-muted hover:border-rule-strong hover:text-ink'
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === 'search' ? <SearchResults query={q} /> : null}
      {tab === 'overview' ? <Overview /> : null}
      {tab === 'accounts' ? <Accounts /> : null}
      {tab === 'events' ? <Events action={action} rule={ruleFilter} /> : null}
      {tab === 'blocks' ? <Blocks /> : null}
      {tab === 'rules' ? <Rules /> : null}
      {tab === 'trap' ? <Trap /> : null}
    </div>
  )
}

async function Overview() {
  const [overview, minutes, rules, events] = await Promise.all([loadOverview(), loadMinutes(), loadRules(), loadEvents({ limit: 12 })])
  const watching = rules.filter((rule) => rule.mode === 'watch')
  const off = rules.filter((rule) => rule.mode === 'off')
  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <Stat label="Papers opened, last hour" value={overview.opens_1h} />
        <Stat label="Papers opened, 24 h" value={overview.opens_24h} note={`${overview.accounts_active_24h} accounts of ${overview.accounts_total}`} />
        <Stat label="Refused or slowed, 24 h" value={overview.refused_24h} tone={overview.refused_24h ? 'bad' : undefined} />
        <Stat label="Would have acted (watch), 24 h" value={overview.would_24h} note="Rules in watch mode" />
        <Stat label="Flagged, 24 h" value={overview.flagged_24h} />
        <Stat label="Banned, 24 h" value={overview.banned_24h} tone={overview.banned_24h ? 'bad' : undefined} />
        <Stat label="Banned in all" value={overview.banned_total} note={`${overview.reverted_total} undone`} />
        <Stat label="Addresses blocked now" value={overview.ips_blocked} />
        <Stat label="Browsers blocked" value={overview.devices_blocked} />
        <Stat label="Trap hits, 24 h" value={overview.trap_hits_24h} />
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium text-ink">Last hour, minute by minute</h3>
        <div className="rounded-lg border border-rule bg-surface p-3"><MinuteChart minutes={minutes} /></div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium text-ink">Last 24 hours, hour by hour</h3>
        <div className="rounded-lg border border-rule bg-surface p-3"><DayChart series={overview.series} /></div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium text-ink">Latest decisions</h3>
          <Link href="/admin/protection?tab=events" className="text-xs text-accent hover:underline">All events</Link>
        </div>
        <EventTable events={events} empty="No decisions yet. Nothing has looked unusual." />
      </section>

      <section className="text-xs text-ink-muted">
        {watching.length ? <p>In watch mode (logging only): {watching.map((rule) => rule.label).join(', ')}.</p> : null}
        {off.length ? <p>Off: {off.map((rule) => rule.label).join(', ')}.</p> : null}
      </section>
    </div>
  )
}

async function Accounts() {
  const accounts = await loadAccounts(80)
  if (accounts.length === 0) return <p className="text-sm text-ink-muted">No account has opened papers in the last 24 hours.</p>
  return (
    <div className="overflow-x-auto rounded-lg border border-rule">
      <table className="w-full min-w-[760px] text-left text-xs">
        <thead className="bg-surface-2 text-ink-muted">
          <tr>
            {['Account', 'Papers 24 h', 'Subjects', 'Typical gap', 'Attempts', 'Last opened', 'Events', ''].map((head) => (
              <th key={head} className="px-3 py-2 font-medium">{head}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {accounts.map((account) => {
            const hot = (account.median_gap_s != null && account.median_gap_s < 10 && account.opens_24h >= 10) || account.subjects_24h >= 15
            return (
              <tr key={account.user_id} className="border-t border-rule">
                <td className="px-3 py-2">
                  <Link href={`/admin/protection/accounts/${account.user_id}`} className="text-accent hover:underline">{account.email}</Link>
                  {account.name ? <span className="ml-1 text-ink-faint">{account.name}</span> : null}
                  {account.banned ? <span className="ml-2 rounded-full bg-incorrect-soft px-2 py-0.5 text-[0.6875rem] text-incorrect">banned</span> : null}
                </td>
                <td className="px-3 py-2 font-mono">{account.opens_24h}</td>
                <td className={`px-3 py-2 font-mono ${account.subjects_24h >= 15 ? 'text-incorrect' : ''}`}>{account.subjects_24h}</td>
                <td className={`px-3 py-2 font-mono ${hot ? 'text-incorrect' : ''}`}>{account.median_gap_s != null ? `${account.median_gap_s}s` : '–'}</td>
                <td className="px-3 py-2 font-mono">{account.real_attempts_24h}</td>
                <td className="px-3 py-2 text-ink-muted">{when(account.last_open)}</td>
                <td className="px-3 py-2 font-mono">{account.events_24h}</td>
                <td className="px-3 py-2">
                  {account.banned && account.ban_id ? (
                    <ActionButton label="Undo ban" action={async () => { 'use server'; return revertBan(account.ban_id as number) }} confirm="Undo this ban?" />
                  ) : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function EventTable({ events, empty }: { events: RiskEvent[]; empty: string }) {
  if (events.length === 0) return <p className="rounded-lg border border-rule bg-surface px-3 py-4 text-sm text-ink-muted">{empty}</p>
  return (
    <div className="overflow-x-auto rounded-lg border border-rule">
      <table className="w-full min-w-[760px] text-left text-xs">
        <thead className="bg-surface-2 text-ink-muted">
          <tr>{['When', 'Rule', 'Action', 'Account', 'Address', 'Detail', ''].map((head) => <th key={head} className="px-3 py-2 font-medium">{head}</th>)}</tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id} className="border-t border-rule align-top">
              <td className="whitespace-nowrap px-3 py-2 text-ink-muted">{when(event.at)}</td>
              <td className="px-3 py-2 font-mono">{event.rule}</td>
              <td className="px-3 py-2"><Chip action={event.action} /></td>
              <td className="px-3 py-2">
                {event.user_id ? <Link href={`/admin/protection/accounts/${event.user_id}`} className="text-accent hover:underline">{event.email ?? event.user_id.slice(0, 8)}</Link> : <span className="text-ink-faint">–</span>}
              </td>
              <td className="px-3 py-2 font-mono">{event.ip ?? <span className="text-ink-faint">–</span>}</td>
              <td className="px-3 py-2 text-ink-muted">{detailText(event)}</td>
              <td className="px-3 py-2">
                {event.action === 'flagged' || event.action.startsWith('would_') ? (
                  <ActionButton label="Seen" action={async () => { 'use server'; return reviewEvent(event.id) }} />
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

async function Events({ action, rule }: { action?: string; rule?: string }) {
  const events = await loadEvents({ action, rule, limit: 200 })
  const filters = [['', 'All'], ['would', 'Would have (watch)'], ['flagged', 'Flagged'], ['banned', 'Banned'], ['refused', 'Refused'], ['slowed', 'Slowed'], ['ip_blocked', 'Address blocked'], ['unblocked', 'Undone']]
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {filters.map(([value, label]) => (
          <Link key={label} href={`/admin/protection?tab=events${value ? `&action=${value}` : ''}${rule ? `&rule=${rule}` : ''}`}
            className={`rounded-full px-3 py-1 text-xs ${((action ?? '') === value) ? 'bg-accent text-accent-ink' : 'border border-rule text-ink-muted hover:border-rule-strong hover:text-ink'}`}>
            {label}
          </Link>
        ))}
      </div>
      <EventTable events={events} empty="Nothing logged for this filter." />
    </div>
  )
}

async function Blocks() {
  const [bans, blocks] = await Promise.all([loadBans(150), loadBlocks()])
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="mb-2 text-sm font-medium text-ink">Banned accounts</h3>
        {bans.length === 0 ? <p className="text-sm text-ink-muted">No automatic or manual bans yet.</p> : (
          <div className="overflow-x-auto rounded-lg border border-rule">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="bg-surface-2 text-ink-muted"><tr>{['When', 'Account', 'Rule', 'Reason', ''].map((head) => <th key={head} className="px-3 py-2 font-medium">{head}</th>)}</tr></thead>
              <tbody>
                {bans.map((ban) => (
                  <tr key={ban.id} className="border-t border-rule">
                    <td className="whitespace-nowrap px-3 py-2 text-ink-muted">{when(ban.created_at)}</td>
                    <td className="px-3 py-2"><Link href={`/admin/protection/accounts/${ban.user_id}`} className="text-accent hover:underline">{ban.email ?? ban.user_id.slice(0, 8)}</Link></td>
                    <td className="px-3 py-2 font-mono">{ban.rule}</td>
                    <td className="px-3 py-2 text-ink-muted">{ban.reason}</td>
                    <td className="px-3 py-2">
                      {ban.reverted_at ? <span className="text-ink-faint">undone {when(ban.reverted_at)}</span> : (
                        <ActionButton label="Undo ban" confirm="Undo this ban? The account, its browser and its addresses are released." action={async () => { 'use server'; return revertBan(ban.id) }} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium text-ink">Blocked addresses (now)</h3>
        {blocks.ips.length === 0 ? <p className="text-sm text-ink-muted">None.</p> : (
          <div className="overflow-x-auto rounded-lg border border-rule">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="bg-surface-2 text-ink-muted"><tr>{['Address', 'Reason', 'Since', 'Ends', 'Last seen', ''].map((head) => <th key={head} className="px-3 py-2 font-medium">{head}</th>)}</tr></thead>
              <tbody>
                {blocks.ips.map((row) => (
                  <tr key={row.ip} className="border-t border-rule">
                    <td className="px-3 py-2 font-mono">{row.ip}</td>
                    <td className="px-3 py-2 text-ink-muted">{row.reason}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-ink-muted">{when(row.created_at)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-ink-muted">{row.expires_at ? when(row.expires_at) : 'never'}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-ink-muted">{row.last_hit ? when(row.last_hit) : '–'}</td>
                    <td className="px-3 py-2"><ActionButton label="Release" confirm={`Release ${row.ip}?`} action={async () => { 'use server'; return releaseIp(row.ip) }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form
          action={async (data: FormData) => { 'use server'; await blockIp(String(data.get('ip') ?? '').trim(), Number(data.get('hours')) || 24) }}
          className="mt-3 flex flex-wrap items-end gap-2"
        >
          <label className="text-xs text-ink-muted">Block an address
            <input name="ip" placeholder="203.0.113.7" className="mt-0.5 block h-7 w-44 rounded-[3px] border border-rule bg-surface px-2 font-mono text-xs text-ink" />
          </label>
          <label className="text-xs text-ink-muted">Hours
            <input name="hours" defaultValue="24" inputMode="numeric" className="mt-0.5 block h-7 w-16 rounded-[3px] border border-rule bg-surface px-2 font-mono text-xs text-ink" />
          </label>
          <button type="submit" className="h-7 rounded-[3px] bg-accent px-2.5 text-xs text-accent-ink">Block</button>
        </form>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium text-ink">Blocked browsers</h3>
        {blocks.devices.length === 0 ? <p className="text-sm text-ink-muted">None.</p> : (
          <div className="overflow-x-auto rounded-lg border border-rule">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="bg-surface-2 text-ink-muted"><tr>{['Browser id', 'Reason', 'Since', ''].map((head) => <th key={head} className="px-3 py-2 font-medium">{head}</th>)}</tr></thead>
              <tbody>
                {blocks.devices.map((row) => (
                  <tr key={row.fingerprint} className="border-t border-rule">
                    <td className="px-3 py-2 font-mono">{row.fingerprint.slice(0, 20)}…</td>
                    <td className="px-3 py-2 text-ink-muted">{row.reason}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-ink-muted">{when(row.created_at)}</td>
                    <td className="px-3 py-2"><ActionButton label="Release" confirm="Release this browser?" action={async () => { 'use server'; return releaseDevice(row.fingerprint) }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

async function Rules() {
  const rules = await loadRules()
  const banning = new Set(['auto_ban', 'linked', 'device_block'])
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-muted">
        <strong className="text-ink">Off</strong> does nothing. <strong className="text-ink">Watch</strong> logs what the rule would have done and changes nothing.{' '}
        <strong className="text-ink">Enforce</strong> acts. Change a rule here and it applies within seconds; &quot;Undo its bans&quot; releases everyone the rule banned.
      </p>
      <ul className="flex flex-col gap-3">
        {rules.map((rule) => (
          <RuleControl
            key={rule.key}
            rule={rule}
            setMode={async (mode) => { 'use server'; return setRuleMode(rule.key, mode) }}
            setParams={async (params) => { 'use server'; return setRuleParams(rule.key, params) }}
            undo={banning.has(rule.key) ? async () => { 'use server'; return revertRule(rule.key) } : undefined}
          />
        ))}
      </ul>
    </div>
  )
}

async function Trap() {
  const hits = await loadTrapHits(100)
  if (hits.length === 0) return <p className="text-sm text-ink-muted">No trap hits or limit refusals recorded.</p>
  return (
    <div className="overflow-x-auto rounded-lg border border-rule">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead className="bg-surface-2 text-ink-muted"><tr>{['When', 'Kind', 'Account', 'Address', 'Browser', 'Path'].map((head) => <th key={head} className="px-3 py-2 font-medium">{head}</th>)}</tr></thead>
        <tbody>
          {hits.map((hit, index) => (
            <tr key={`${hit.at}-${index}`} className="border-t border-rule">
              <td className="whitespace-nowrap px-3 py-2 text-ink-muted">{when(hit.at)}</td>
              <td className="px-3 py-2 font-mono">{hit.kind}</td>
              <td className="px-3 py-2">{hit.email ?? <span className="text-ink-faint">–</span>}</td>
              <td className="px-3 py-2 font-mono">{hit.ip ?? '–'}</td>
              <td className="max-w-[260px] truncate px-3 py-2 text-ink-muted" title={hit.user_agent ?? ''}>{hit.user_agent ?? '–'}</td>
              <td className="px-3 py-2 font-mono text-ink-muted">{hit.path ?? '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

async function SearchResults({ query }: { query: string }) {
  const rows = await searchAccounts(query)
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-muted">{rows.length} account{rows.length === 1 ? '' : 's'} for &quot;{query.trim()}&quot;</p>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-rule bg-surface px-3 py-4 text-sm text-ink-muted">
          Nothing found. Try part of the e-mail or name, the whole account id, an address such as 203.0.113.7, or a browser id.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-rule">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead className="bg-surface-2 text-ink-muted">
              <tr>{['Account', 'Matched on', 'Role', 'Joined', 'Last sign-in', 'Papers opened', 'Last opened'].map((head) => <th key={head} className="px-3 py-2 font-medium">{head}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.user_id} className="border-t border-rule">
                  <td className="px-3 py-2">
                    <Link href={`/admin/protection/accounts/${row.user_id}`} className="text-accent hover:underline">{row.email}</Link>
                    {row.name ? <span className="ml-1 text-ink-faint">{row.name}</span> : null}
                    {row.banned ? <span className="ml-2 rounded-full bg-incorrect-soft px-2 py-0.5 text-[0.6875rem] text-incorrect">banned</span> : null}
                  </td>
                  <td className="px-3 py-2 text-ink-muted">{row.matched}</td>
                  <td className="px-3 py-2">{row.role}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-ink-muted">{when(row.joined)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-ink-muted">{row.last_sign_in ? when(row.last_sign_in) : '–'}</td>
                  <td className="px-3 py-2 font-mono">{row.opens_total}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-ink-muted">{row.last_open ? when(row.last_open) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
