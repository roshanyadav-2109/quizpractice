import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/supabase/server'
import { ActionButton } from '@/components/admin/ActionButton'
import { isTrusted, loadAccount, loadRelated } from '@/lib/protection'
import { banAccount, revertBan, trustAccount, untrustAccount } from '@/app/admin/protection/actions'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })

interface Account {
  profile: { id: string; email: string; display_name: string | null; role: string; created_at: string; last_sign_in_at: string | null; banned_until: string | null } | null
  opens: { opened_at: string; set_code: string; title: string; gap_s: number | null; ip: string | null; device: string | null; ua: string | null; explanations_read: number }[]
  searches: { at: string; term: string | null }[]
  sessions: { at: string; ip: string; ua: string }[]
  devices: { fingerprint: string; ip: string | null; seen: string }[]
  events: { at: string; rule: string; mode: string; action: string; detail: Record<string, unknown>; ip: string | null }[]
  bans: { id: number; created_at: string; rule: string; reason: string; reverted_at: string | null }[]
  attempts: { started_at: string; duration_seconds: number | null; score: string; max_score: string }[]
}

/** Everything the site knows about one account's use of the papers: the timeline, the browsers and addresses, and who shares them. */
export default async function ProtectionAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile()
  if (profile?.role !== 'admin') redirect('/admin')
  const { id } = await params
  if (!UUID.test(id)) notFound()

  const [account, related, trusted] = await Promise.all([loadAccount(id) as Promise<unknown> as Promise<Account>, loadRelated(id), isTrusted(id)])
  if (!account.profile) notFound()
  const person = account.profile
  const banned = Boolean(person.banned_until)
  const activeBan = account.bans.find((ban) => !ban.reverted_at)
  const gaps = account.opens.map((open) => open.gap_s).filter((gap): gap is number => gap != null)
  const fast = gaps.filter((gap) => gap < 10).length

  const timeline: { at: string; kind: string; tone: string; text: string }[] = [
    ...account.opens.map((open) => ({
      at: open.opened_at,
      kind: 'paper',
      tone: 'bg-surface-2 text-ink-muted',
      text: `${open.title} (${open.set_code})${open.gap_s != null ? ` · ${open.gap_s}s after the one before` : ''}${open.ip ? ` · ${open.ip}` : ''}${open.explanations_read ? ` · ${open.explanations_read} explanation${open.explanations_read === 1 ? '' : 's'} read` : ''}`,
    })),
    ...account.searches.map((search) => ({ at: search.at, kind: 'search', tone: 'bg-surface-2 text-ink-muted', text: search.term ?? '(words not kept)' })),
    ...account.attempts.map((attempt) => ({
      at: attempt.started_at,
      kind: 'attempt',
      tone: 'bg-surface-2 text-correct',
      text: `${attempt.score} / ${attempt.max_score}${attempt.duration_seconds != null ? ` in ${attempt.duration_seconds}s` : ''}`,
    })),
    ...account.sessions.map((session) => ({ at: session.at, kind: 'sign-in', tone: 'bg-surface-2 text-ink-muted', text: `${session.ip} · ${session.ua}` })),
    ...account.events.map((event) => ({
      at: event.at,
      kind: event.action.replace('_', ' '),
      tone: event.action.startsWith('would_') ? 'border border-rule text-ink-muted' : 'bg-incorrect-soft text-incorrect',
      text: `${event.rule}${event.ip ? ` · ${event.ip}` : ''} ${JSON.stringify(event.detail).slice(0, 120)}`,
    })),
    ...account.bans.map((ban) => ({ at: ban.created_at, kind: 'ban', tone: 'bg-incorrect-soft text-incorrect', text: `${ban.reason}${ban.reverted_at ? ` (undone ${when(ban.reverted_at)})` : ''}` })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 250)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/protection?tab=accounts" className="text-xs text-accent hover:underline">← Accounts</Link>
          <h2 className="mt-1 font-medium text-ink">{person.email}</h2>
          <p className="text-xs text-ink-muted">
            {person.display_name ?? 'No name'} · {person.role} · joined {when(person.created_at)}
            {person.last_sign_in_at ? ` · last sign-in ${when(person.last_sign_in_at)}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {banned ? <span className="rounded-full bg-incorrect-soft px-2 py-0.5 text-xs text-incorrect">banned</span> : <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-correct">active</span>}
          {banned && activeBan ? (
            <ActionButton label="Undo ban" confirm="Undo this ban?" action={async () => { 'use server'; return revertBan(activeBan.id) }} />
          ) : null}
          {trusted ? <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-correct">trusted</span> : null}
          {person.role === 'student' && !banned ? (
            trusted ? (
              <ActionButton label="Stop trusting" action={async () => { 'use server'; return untrustAccount(person.id) }} />
            ) : (
              <ActionButton label="Trust this account" prompt={{ message: 'Why? (kept in the log)' }} confirm="The automatic rules will never ban this account. You can undo it." action={async (note) => { 'use server'; return trustAccount(person.id, note) }} />
            )
          ) : null}
          {!banned && person.role === 'student' ? (
            <ActionButton label="Ban account" tone="danger" prompt={{ message: 'Why? (kept with the evidence)' }} confirm="Ban this account? You can undo it later." action={async (note) => { 'use server'; return banAccount(person.id, note) }} />
          ) : null}
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Papers in the list', account.opens.length],
          ['Opened under 10 s apart', `${fast} of ${gaps.length}`],
          ['Attempts', account.attempts.length],
          ['Browsers seen', account.devices.length],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border border-rule bg-surface p-3">
            <p className="text-xs text-ink-muted">{label}</p>
            <p className="mt-1 text-xl font-medium text-ink">{value}</p>
          </div>
        ))}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium text-ink">Everything, in order (newest first)</h3>
        <ul className="max-h-[480px] overflow-y-auto rounded-lg border border-rule bg-surface text-xs">
          {timeline.length === 0 ? <li className="px-3 py-3 text-ink-muted">Nothing recorded yet.</li> : timeline.map((item, index) => (
            <li key={index} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-rule px-3 py-1.5 last:border-b-0">
              <span className="w-28 shrink-0 text-ink-faint">{when(item.at)}</span>
              <span className={`w-20 shrink-0 rounded-full px-2 py-0.5 text-center font-mono text-[0.6875rem] ${item.tone}`}>{item.kind}</span>
              <span className="min-w-0 flex-1 text-ink">{item.text}</span>
            </li>
          ))}
        </ul>
      </section>

      {account.attempts.length > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-medium text-ink">Attempts</h3>
          <div className="overflow-x-auto rounded-lg border border-rule">
            <table className="w-full min-w-[420px] text-left text-xs">
              <thead className="bg-surface-2 text-ink-muted"><tr>{['Started', 'Took', 'Score'].map((head) => <th key={head} className="px-3 py-2 font-medium">{head}</th>)}</tr></thead>
              <tbody>
                {account.attempts.map((attempt, index) => (
                  <tr key={index} className="border-t border-rule">
                    <td className="whitespace-nowrap px-3 py-2 text-ink-muted">{when(attempt.started_at)}</td>
                    <td className="px-3 py-2 font-mono">{attempt.duration_seconds != null ? `${attempt.duration_seconds}s` : '–'}</td>
                    <td className="px-3 py-2 font-mono">{attempt.score} / {attempt.max_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {related.length > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-medium text-ink">Accounts sharing a browser or an address</h3>
          <ul className="rounded-lg border border-rule bg-surface text-xs">
            {related.map((row, index) => (
              <li key={`${row.email}-${index}`} className="flex flex-wrap justify-between gap-2 border-b border-rule px-3 py-2 last:border-b-0">
                <span className="text-ink">{row.email ?? 'unknown'}</span>
                <span className="text-ink-muted">{row.via} · <span className="font-mono">{row.value.slice(0, 24)}</span></span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-medium text-ink">Sign-ins</h3>
          <ul className="rounded-lg border border-rule bg-surface text-xs">
            {account.sessions.length === 0 ? <li className="px-3 py-2 text-ink-muted">No live session.</li> : account.sessions.map((session, index) => (
              <li key={index} className="border-b border-rule px-3 py-2 last:border-b-0">
                <span className="font-mono">{session.ip}</span> · {when(session.at)}
                <p className="truncate text-ink-faint">{session.ua}</p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-medium text-ink">Browsers and addresses</h3>
          <ul className="rounded-lg border border-rule bg-surface text-xs">
            {account.devices.length === 0 ? <li className="px-3 py-2 text-ink-muted">None recorded.</li> : account.devices.map((device, index) => (
              <li key={index} className="border-b border-rule px-3 py-2 last:border-b-0">
                <span className="font-mono">{device.fingerprint.slice(0, 22)}…</span> · <span className="font-mono">{device.ip ?? '–'}</span> · {when(device.seen)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium text-ink">Decisions about this account</h3>
        <div className="overflow-x-auto rounded-lg border border-rule">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="bg-surface-2 text-ink-muted"><tr>{['When', 'Rule', 'Action', 'Address', 'Detail'].map((head) => <th key={head} className="px-3 py-2 font-medium">{head}</th>)}</tr></thead>
            <tbody>
              {account.events.length === 0 ? <tr><td colSpan={5} className="px-3 py-3 text-ink-muted">Nothing logged.</td></tr> : account.events.map((event, index) => (
                <tr key={index} className="border-t border-rule align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-ink-muted">{when(event.at)}</td>
                  <td className="px-3 py-2 font-mono">{event.rule}</td>
                  <td className="px-3 py-2 font-mono">{event.action}</td>
                  <td className="px-3 py-2 font-mono">{event.ip ?? '–'}</td>
                  <td className="px-3 py-2 text-ink-muted">{JSON.stringify(event.detail).slice(0, 160)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {account.searches.length > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-medium text-ink">Searches</h3>
          <ul className="rounded-lg border border-rule bg-surface text-xs">
            {account.searches.map((search, index) => (
              <li key={index} className="flex justify-between gap-3 border-b border-rule px-3 py-2 last:border-b-0">
                <span className="text-ink">{search.term ?? '(not kept)'}</span>
                <span className="text-ink-faint">{when(search.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h3 className="mb-2 text-sm font-medium text-ink">Papers opened (newest first, gap from the one before)</h3>
        <div className="overflow-x-auto rounded-lg border border-rule">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="bg-surface-2 text-ink-muted"><tr>{['Opened', 'Gap', 'Paper', 'Explanations read', 'Address', 'Browser'].map((head) => <th key={head} className="px-3 py-2 font-medium">{head}</th>)}</tr></thead>
            <tbody>
              {account.opens.map((open, index) => (
                <tr key={index} className="border-t border-rule">
                  <td className="whitespace-nowrap px-3 py-2 text-ink-muted">{when(open.opened_at)}</td>
                  <td className={`px-3 py-2 font-mono ${open.gap_s != null && open.gap_s < 10 ? 'text-incorrect' : ''}`}>{open.gap_s != null ? `${open.gap_s}s` : '–'}</td>
                  <td className="px-3 py-2">{open.title} <span className="text-ink-faint">({open.set_code})</span></td>
                  <td className="px-3 py-2 font-mono">{open.explanations_read}</td>
                  <td className="px-3 py-2 font-mono">{open.ip ?? '–'}</td>
                  <td className="max-w-[200px] truncate px-3 py-2 text-ink-faint" title={`${open.device ?? ''} ${open.ua ?? ''}`}>{open.device ? `${open.device.slice(0, 14)}… ` : ''}{open.ua ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
