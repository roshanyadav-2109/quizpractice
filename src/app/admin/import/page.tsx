import { ImportPanel } from '@/components/admin/ImportPanel'

export const dynamic = 'force-dynamic'

export default function AdminImportPage() {
  return (
    <div>
      <div className="mb-5">
        <h2 className="font-medium text-ink">Import a question paper</h2>
        <p className="mt-1 text-[0.78125rem] text-ink-muted">
          Re-importing the same subject, exam, date and set replaces it.
        </p>
      </div>

      <ImportPanel />
    </div>
  )
}
