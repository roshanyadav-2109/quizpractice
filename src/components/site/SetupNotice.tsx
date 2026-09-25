/**
 * Shown instead of empty lists when the app has no Supabase credentials yet, so
 * a fresh clone explains itself rather than rendering a blank page.
 */
export function SetupNotice() {
  return (
    <div className="mx-auto max-w-[45rem] px-5 py-14">
      <div className="border border-rule bg-surface p-5">
        <h1 className="text-lg font-medium text-ink">Connect Supabase to get started</h1>
        <p className="mt-2 text-sm text-ink-muted">
          The app is running, but it has no database credentials, so there is nothing to show.
        </p>

        <ol className="mt-5 flex flex-col gap-4 text-sm">
          <Step n={1} title="Copy the environment template">
            <code className="font-mono text-xs text-ink">cp .env.example .env.local</code>
          </Step>
          <Step n={2} title="Fill in your Supabase keys">
            Project Settings → Data API for the URL, API Keys for the anon and service-role keys.
          </Step>
          <Step n={3} title="Apply the migrations">
            Paste each file in <code className="font-mono text-xs">supabase/migrations/</code> into
            the SQL editor in order, or run <code className="font-mono text-xs">supabase db push</code>{' '}
            with the CLI linked.
          </Step>
          <Step n={4} title="Load the sample paper">
            <code className="font-mono text-xs text-ink">npm run paper:import -- schema/example-paper.json</code>
          </Step>
        </ol>

        <p className="mt-6 border-t border-rule pt-4 text-xs text-ink-muted">
          Full instructions are in <code className="font-mono">README.md</code>.
        </p>
      </div>
    </div>
  )
}

function Step({
  n,
  title,
  children,
}: {
  n: number
  title: string
  children: React.ReactNode
}) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-xs text-accent">
        {n}
      </span>
      <span>
        <span className="block text-ink">{title}</span>
        <span className="mt-0.5 block text-ink-muted">{children}</span>
      </span>
    </li>
  )
}
