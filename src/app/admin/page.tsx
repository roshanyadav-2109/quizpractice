import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ROUTES } from '@/lib/teach/contracts'

export const dynamic = 'force-dynamic'

/**
 * What needs attention, and how much content exists. Counts are read live so
 * this page is never stale after an import.
 */
export default async function AdminOverview() {
  const supabase = await createClient()

  // A count that could not be read shows as a dash, never as a reassuring 0.
  const tally = ({ count, error }: { count: number | null; error: { message: string } | null }) => {
    if (error) console.error(`admin overview: ${error.message}`)
    return error ? null : (count ?? 0)
  }
  const counts = (table: string) =>
    supabase.from(table).select('*', { count: 'exact', head: true }).then(tally)

  const [
    programs,
    subjects,
    papers,
    questions,
    teachers,
    drafts,
    openReports,
    awaitingReview,
    pendingExtractions,
  ] = await Promise.all([
    counts('programs'),
    counts('subjects'),
    counts('question_papers'),
    counts('questions'),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'teacher')
      .then(tally),
    supabase
      .from('question_papers')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'draft')
      .then(tally),
    supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'open')
      .then(tally),
    // Submitted for review: a teacher's draft (pending, never submitted) is
    // still theirs, not the reviewers'. Imported and student-written ones are
    // never drafts. Must match the "In review" tab of /admin/solutions.
    supabase
      .from('solutions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .or('submitted_at.not.is.null,kind.neq.authored')
      .then(tally),
    supabase
      .from('extractions')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'in_review'])
      .then(tally),
  ])

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="text-sm tracking-wide text-ink-muted uppercase">
          Needs attention
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QueueCard
            href="/admin/review"
            label="Extractions to review"
            value={pendingExtractions}
          />
          <QueueCard href="/admin/reports" label="Open reports" value={openReports} />
          <QueueCard
            href={ROUTES.adminSolutions}
            label="Explanations awaiting review"
            value={awaitingReview}
          />
          <QueueCard href="/admin/papers?status=draft" label="Draft papers" value={drafts} />
        </div>
      </section>

      <section>
        <h2 className="text-sm tracking-wide text-ink-muted uppercase">Content</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Branches" value={programs} />
          <Stat label="Subjects" value={subjects} />
          <Stat label="Papers" value={papers} />
          <Stat label="Questions" value={questions} />
          <Stat label="Teachers" value={teachers} />
        </dl>
      </section>

      <section className="rounded-lg border border-rule bg-surface p-5">
        <h2 className="font-medium text-ink">Adding content</h2>
        <ol className="mt-3 flex flex-col gap-2 text-sm text-ink-muted">
          <li>
            1. Make sure the subject and exam type exist in{' '}
            <Link href="/admin/taxonomy" className="text-accent underline underline-offset-2">
              Taxonomy
            </Link>
            . Add the spellings that appear on real papers to the subject&rsquo;s aliases.
          </li>
          <li>
            2. Transcribe scans to block JSON with{' '}
            <code className="font-mono text-xs">npm run paper:extract</code>, or write the JSON
            by hand against <code className="font-mono text-xs">schema/question-paper.schema.json</code>.
          </li>
          <li>
            3. Paste it into{' '}
            <Link href="/admin/import" className="text-accent underline underline-offset-2">
              Import
            </Link>{' '}
            and check the preview before committing.
          </li>
          <li>
            4. Fix anything the transcription got wrong in{' '}
            <Link href="/admin/papers" className="text-accent underline underline-offset-2">
              Papers
            </Link>
            , then publish.
          </li>
        </ol>
      </section>
    </div>
  )
}

function QueueCard({
  href,
  label,
  value,
}: {
  href: string
  label: string
  value: number | null
}) {
  const idle = !value
  return (
    <Link
      href={href}
      className={`rounded-lg border p-4 transition-colors ${
        idle
          ? 'border-rule bg-surface hover:border-rule-strong'
          : 'border-marked bg-marked-soft'
      }`}
    >
      <p className={`text-2xl font-medium tabular-nums ${idle ? 'text-ink' : 'text-marked'}`}>
        {value ?? '—'}
      </p>
      <p className="mt-0.5 text-xs text-ink-muted">{label}</p>
    </Link>
  )
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg border border-rule bg-surface p-4">
      <dd className="text-2xl font-medium text-ink tabular-nums">{value ?? '—'}</dd>
      <dt className="mt-0.5 text-xs text-ink-muted">{label}</dt>
    </div>
  )
}
