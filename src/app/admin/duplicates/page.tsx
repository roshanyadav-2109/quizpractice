import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { setFingerprintDecision } from '@/app/admin/duplicates/actions'
import { ActionButton } from '@/components/admin/ActionButton'
import { Shuffle } from '@/components/ui/icons'
import { EmptyState } from '@/components/ui/EmptyState'
import { DUPLICATE_KINDS, ROUTES, type DuplicateGroupRaw, type DuplicateKind } from '@/lib/teach/contracts'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ kind?: string; page?: string }>

const PAGE_SIZE = 50

/** Each list, and what an admin is looking for in it. */
const KINDS: Record<DuplicateKind, { label: string; about: string }> = {
  same_set: {
    label: 'Same set',
    about:
      'Probable import errors: one set holds the same question twice. These copies do not share an explanation until someone decides. Fix the question text, or allow if they really are the same question.',
  },
  largest: {
    label: 'Largest',
    about: 'The biggest groups. One explanation reaches every copy listed, across papers, years and branches.',
  },
  cross_subject: {
    label: 'Across subjects',
    about:
      'Groups whose copies sit in more than one subject or branch (English I in Data Science and in Electronic Systems, say). Block one if the subjects expect different explanations.',
  },
  normalised_only: {
    label: 'Joined by clean-up',
    about:
      'The copies differ only in case, quote marks or punctuation, and were joined by the clean-up. Check they really ask the same thing; block any that do not.',
  },
  shuffled: {
    label: 'Shuffled options',
    about:
      'The copies list the same options in a different order. They share one explanation, and the studio tells the teacher to name options by what they say, never by letter.',
  },
  decided: {
    label: 'Decided',
    about: 'Groups someone has allowed or blocked. Clear a decision to go back to the automatic rule.',
  },
}

interface MemberRecord {
  id: string
  number: number
  fingerprint: string
  status: string
  question_sets: {
    set_code: string
    question_papers: {
      id: string
      session_date: string | null
      status: string
      subjects: { name: string } | null
      exam_types: { name: string } | null
    } | null
  } | null
}

/**
 * Groups of copies that share one explanation, for staff to check. The
 * database groups questions by fingerprint on its own; this is where a wrong
 * link is blocked, or a same-set repeat that really is the same question is
 * allowed.
 */
export default async function DuplicatesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const kind: DuplicateKind = (DUPLICATE_KINDS as readonly string[]).includes(params.kind ?? '')
    ? (params.kind as DuplicateKind)
    : 'same_set'
  const page = Math.max(1, Math.min(1000, Number.parseInt(params.page ?? '1', 10) || 1))

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('duplicate_review', {
    p_kind: kind,
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  })
  const groups = (data ?? []) as DuplicateGroupRaw[]
  const total = groups.length ? Number(groups[0].total) : 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Every copy in the groups on this page, in one read.
  const members = new Map<string, MemberRecord[]>()
  let membersError: string | null = null
  if (groups.length) {
    const { data: rows, error: readError } = await supabase
      .from('questions')
      .select(
        'id, number, fingerprint, status, question_sets(set_code, question_papers(id, session_date, status, subjects(name), exam_types(name)))',
      )
      .in(
        'fingerprint',
        groups.map((group) => group.fingerprint),
      )
      .limit(1000)
    if (readError) membersError = readError.message
    for (const row of (rows ?? []) as unknown as MemberRecord[]) {
      const list = members.get(row.fingerprint) ?? []
      list.push(row)
      members.set(row.fingerprint, list)
    }
    for (const list of members.values()) {
      list.sort((a, b) =>
        (b.question_sets?.question_papers?.session_date ?? '').localeCompare(
          a.question_sets?.question_papers?.session_date ?? '',
        ),
      )
    }
  }

  const href = (next: { kind?: DuplicateKind; page?: number }) => {
    const query = new URLSearchParams({ kind: next.kind ?? kind })
    if (next.page && next.page > 1) query.set('page', String(next.page))
    return `${ROUTES.adminDuplicates}?${query}`
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="font-medium text-ink">Duplicates</h2>
          <p className="mt-1 text-sm text-ink-muted">{KINDS[kind].about}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DUPLICATE_KINDS.map((value) => (
            <Link
              key={value}
              href={href({ kind: value })}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                kind === value
                  ? 'bg-accent text-accent-ink'
                  : 'border border-rule text-ink-muted hover:border-rule-strong hover:text-ink'
              }`}
            >
              {KINDS[value].label}
            </Link>
          ))}
        </div>
      </div>

      {error ? (
        <p className="rounded-md bg-incorrect-soft px-3 py-2 text-xs text-incorrect">
          The groups could not be loaded: {error.message}
        </p>
      ) : groups.length === 0 && page > 1 ? (
        // Past the end, usually after deciding the last few on a later page.
        <EmptyState
          size="sm"
          art="all-clear"
          title="Nothing on this page"
          actions={
            <Link href={href({ page: 1 })} className="text-xs text-accent hover:underline">
              Back to the first page
            </Link>
          }
        />
      ) : groups.length === 0 ? (
        <EmptyState size="sm" art="all-clear" title="Nothing in this list">
          {kind === 'same_set' ? 'No set holds the same question twice.' : 'No groups match.'}
        </EmptyState>
      ) : (
        <>
          <p className="mb-3 text-xs text-ink-muted tabular-nums">
            {total.toLocaleString('en-IN')} group{total === 1 ? '' : 's'}
            {pages > 1 ? ` · page ${page} of ${pages}` : ''}
          </p>
          {membersError ? (
            <p className="mb-3 rounded-md bg-incorrect-soft px-3 py-2 text-xs text-incorrect">
              The copies could not be listed: {membersError}
            </p>
          ) : null}

          <ul className="flex flex-col gap-3">
            {groups.map((group) => (
              <GroupCard key={group.fingerprint} group={group} members={members.get(group.fingerprint) ?? []} />
            ))}
          </ul>

          {pages > 1 ? (
            <nav className="mt-5 flex items-center justify-between text-xs" aria-label="Pages">
              {page > 1 ? (
                <Link href={href({ page: page - 1 })} className="text-accent hover:underline">
                  Previous
                </Link>
              ) : (
                <span />
              )}
              {page < pages ? (
                <Link href={href({ page: page + 1 })} className="text-accent hover:underline">
                  Next
                </Link>
              ) : null}
            </nav>
          ) : null}
        </>
      )}
    </div>
  )
}

function GroupCard({ group, members }: { group: DuplicateGroupRaw; members: MemberRecord[] }) {
  const repeatedInSet = group.members > group.sets
  const subjects = group.subjects ?? []

  return (
    <li className="rounded-lg border border-rule bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
            <span className="tabular-nums">
              {group.members} copies in {group.sets} set{group.sets === 1 ? '' : 's'}
            </span>
            <span>·</span>
            <span>{subjects.join(', ') || 'no subject'}</span>
            {group.decision ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[0.6875rem] ${
                  group.decision === 'allow' ? 'bg-correct-soft text-correct' : 'bg-incorrect-soft text-incorrect'
                }`}
              >
                {group.decision === 'allow' ? 'allowed' : 'blocked'}
              </span>
            ) : repeatedInSet ? (
              <span className="rounded-full bg-marked-soft px-2 py-0.5 text-[0.6875rem] text-marked">
                not shared until decided
              </span>
            ) : null}
            {group.order_varies ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[0.6875rem]">
                <Shuffle size={11} aria-hidden /> options shuffled
              </span>
            ) : null}
            {group.strict_variants > 1 ? (
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.6875rem]">
                {group.strict_variants} spellings
              </span>
            ) : null}
          </p>
          <p className="mt-1.5 text-sm text-ink">{group.snippet || <span className="text-ink-faint italic">No text</span>}</p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {group.decision !== 'allow' && (repeatedInSet || group.decision === 'block') ? (
            <ActionButton
              label="Allow"
              tone="positive"
              prompt={{ message: 'Why share one explanation across these copies? (optional)' }}
              action={setFingerprintDecision.bind(null, group.fingerprint, 'allow')}
            />
          ) : null}
          {group.decision !== 'block' ? (
            <ActionButton
              label="Block"
              tone="danger"
              prompt={{ message: 'Why should these copies not share an explanation? (optional)' }}
              action={setFingerprintDecision.bind(null, group.fingerprint, 'block')}
            />
          ) : null}
          {group.decision ? (
            <ActionButton
              label="Clear"
              confirm="Forget this decision and go back to the automatic rule?"
              action={setFingerprintDecision.bind(null, group.fingerprint, null)}
            />
          ) : null}
        </div>
      </div>

      <p className="mt-2 text-xs">
        <Link href={`/admin/questions/${group.sample_question_id}`} className="text-accent hover:underline">
          Open the newest copy
        </Link>
      </p>
      <details className="mt-1">
        <summary className="cursor-pointer text-xs text-ink-muted hover:text-ink">
          {/* The page reads at most 1,000 copies at once; say so when a group was cut short. */}
          {!members.length
            ? 'Copies'
            : members.length < group.members
              ? `The first ${members.length} of ${group.members} copies`
              : `All ${members.length} copies`}
        </summary>
        {members.length ? (
          <ul className="mt-2 flex flex-col gap-1 border-l-2 border-rule pl-3">
            {members.map((member) => {
              const paper = member.question_sets?.question_papers
              const hidden = member.status !== 'published' || paper?.status !== 'published'
              return (
                <li key={member.id} className="text-xs text-ink-muted">
                  <Link href={`/admin/questions/${member.id}`} className="text-accent hover:underline">
                    Q{member.number}
                  </Link>{' '}
                  · set <span className="font-mono">{member.question_sets?.set_code ?? '?'}</span> ·{' '}
                  {paper?.subjects?.name ?? 'Unknown subject'} · {paper?.exam_types?.name ?? 'Unknown exam'}
                  {paper?.session_date ? ` · ${paper.session_date}` : ''}
                  {hidden ? <span className="ml-1.5 text-ink-faint">(not on the site)</span> : null}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-ink-muted">The copies could not be listed.</p>
        )}
      </details>
      <p className="mt-1 font-mono text-[0.625rem] text-ink-faint">{group.fingerprint}</p>
    </li>
  )
}
