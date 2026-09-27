import Link from 'next/link'
import { teacherPageGate } from '@/lib/supabase/server'
import { getBrowseTree, getPaperIndex } from '@/lib/queries'
import { getMyNeedingChanges, getMyRecentExplanations, getMySummary } from '@/lib/teach/queries'
import { ROUTES, type AssignmentSummary } from '@/lib/teach/contracts'
import { AssignmentCard } from '@/components/teach/AssignmentCard'
import { ExplanationList } from '@/components/teach/QueueList'
import { queueHref } from '@/components/teach/QueueFilters'
import { Page, Section } from '@/components/site/Page'
import { EmptyState } from '@/components/ui/EmptyState'
import { CaretRight } from '@/components/ui/icons'
import { buttonClass } from '@/components/ui/primitives'
import { formatCount } from '@/lib/format'

/**
 * The teacher's dashboard: a card for every branch + subject combo an admin
 * has assigned, grouped by branch; what a reviewer sent back; and the
 * teacher's latest explanations. An admin, who may teach any subject, also
 * gets every subject in the catalogue as a way into its queue.
 */
export default async function TeachDashboardPage() {
  const profile = await teacherPageGate(ROUTES.teachHome)
  const admin = profile.role === 'admin'

  const [summary, changes, recent, tree, paperIndex] = await Promise.all([
    getMySummary(),
    getMyNeedingChanges(),
    getMyRecentExplanations(10),
    admin ? getBrowseTree() : Promise.resolve([]),
    admin ? getPaperIndex() : Promise.resolve([]),
  ])

  // Branch by branch, in the catalogue's order (the summary arrives sorted).
  const branches: { id: string; name: string; combos: AssignmentSummary[] }[] = []
  for (const combo of summary) {
    const branch = branches.find((entry) => entry.id === combo.programId)
    if (branch) branch.combos.push(combo)
    else branches.push({ id: combo.programId, name: combo.programName, combos: [combo] })
  }

  const changesBySubject = new Map<string, number>()
  for (const item of changes) {
    const subjectId = item.place?.subjectId
    if (subjectId) changesBySubject.set(subjectId, (changesBySubject.get(subjectId) ?? 0) + 1)
  }

  // Whatever needs changes has its own list above, so recent work skips it.
  const recentOther = changes.length > 0 ? recent.filter((item) => item.state !== 'rejected') : recent

  // For an admin: every subject with a published paper, from the shared
  // catalogue caches, so this costs no database read.
  const withPapers = new Set(paperIndex.map((row) => row.subject_id))
  const catalogue = tree
    .map((program) => ({
      ...program,
      levels: program.levels
        .map((level) => ({ ...level, subjects: level.subjects.filter((subject) => withPapers.has(subject.id)) }))
        .filter((level) => level.subjects.length > 0),
    }))
    .filter((program) => program.levels.length > 0)

  return (
    <Page>
      {/* The desk band above names the page; the heading tree still needs its
          top. The sections get their own wrapper so the first stays first. */}
      <h1 className="sr-only">Teaching dashboard</h1>
      <div>
        <Section title="Your subjects" meta={summary.length > 0 ? `${formatCount(summary.length)} assigned` : undefined}>
          {summary.length === 0 ? (
            <EmptyState
              art="waiting-for-others"
              title={admin ? 'No subjects of your own' : 'An admin has not assigned you subjects yet'}
              actions={
                <Link href={ROUTES.teachHelp} className={buttonClass('outline', 'md')}>
                  How recording works
                </Link>
              }
            >
              {admin
                ? 'As an admin you can open any subject’s queue below.'
                : 'Once they do, each subject appears here with its queue of questions to explain.'}
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-6">
              {branches.map((branch) => (
                <div key={branch.id}>
                  {branches.length > 1 ? <p className="label mb-2">{branch.name}</p> : null}
                  <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {branch.combos.map((combo) => (
                      <li key={`${combo.programId}:${combo.subjectId}`}>
                        <AssignmentCard
                          summary={combo}
                          queueHref={queueHref(combo.subjectSlug)}
                          changesHref={queueHref(combo.subjectSlug, { filter: 'changes' })}
                          needsChanges={changesBySubject.get(combo.subjectId) ?? 0}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="text-meta text-ink-faint">
                Counts are of questions to explain: a question that appears in several papers is one, and its explanation
                reaches every copy.
              </p>
            </div>
          )}
        </Section>

        {changes.length > 0 ? (
          <Section title="Needs changes" meta={formatCount(changes.length)}>
            <p className="-mt-1 mb-3 text-meta text-ink-muted">
              A reviewer sent these back. Open one, make the change the note asks for, and submit it again.
            </p>
            <ExplanationList items={changes} />
          </Section>
        ) : null}

        <Section title="My recent explanations">
          {recentOther.length > 0 ? (
            <ExplanationList items={recentOther} />
          ) : (
            <EmptyState size="sm" art="no-solution" title="Nothing written yet">
              Open a subject’s queue, pick a question and explain it. Drafts wait here until you submit them.
            </EmptyState>
          )}
        </Section>

        {admin ? (
          <Section title="Every subject" meta="admin">
            <div className="flex flex-col gap-2">
              {catalogue.map((program) => (
                <details key={program.id} className="group rounded-card border border-rule bg-surface">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-ui text-ink [&::-webkit-details-marker]:hidden">
                    <CaretRight
                      size={14}
                      aria-hidden="true"
                      className="shrink-0 text-ink-faint transition-transform group-open:rotate-90"
                    />
                    {program.name}
                  </summary>
                  <div className="grid gap-x-6 gap-y-4 border-t border-rule px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
                    {program.levels.map((level) => (
                      <div key={level.id}>
                        <p className="label mb-1.5">{level.name}</p>
                        <ul className="flex flex-col gap-1">
                          {level.subjects.map((subject) => (
                            <li key={subject.id}>
                              <Link
                                href={queueHref(subject.slug)}
                                className="text-meta text-ink-muted transition-colors hover:text-accent"
                              >
                                {subject.name}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </Section>
        ) : null}
      </div>
    </Page>
  )
}
