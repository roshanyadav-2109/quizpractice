import { getBrowseTree, getExamTypes } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'
import { createBanner, createExamDate, deleteSpotlightRow, setBannerActive } from '@/app/admin/actions'
import { AdminForm, Field, SelectField, TextAreaField } from '@/components/admin/AdminForm'
import { ActionButton } from '@/components/admin/ActionButton'

export const dynamic = 'force-dynamic'

const PLACEMENTS = [
  { value: 'home', label: 'Home' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'papers', label: 'All papers' },
  { value: 'subject', label: 'Subject pages' },
]

const KINDS = [
  { value: 'announcement', label: 'Announcement (green)' },
  { value: 'feature', label: 'New feature (violet)' },
  { value: 'release', label: 'New papers (blue)' },
]

interface CalendarRow {
  id: string
  exam_date: string
  note: string | null
  exam_types: { name: string } | null
  programs: { short_name: string | null; name: string } | null
}

interface BannerRow {
  id: string
  kind: string
  title: string
  body: string | null
  placements: string[]
  starts_on: string | null
  ends_on: string | null
  is_active: boolean
  programs: { short_name: string | null; name: string } | null
}

const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const show = (date: string) => day.format(new Date(`${date}T00:00:00Z`))

/**
 * The banners at the top of the home, dashboard, papers and subject pages.
 * New papers and a student's mistakes appear there by themselves; what is
 * set here is the exam calendar the countdown reads, and any announcement.
 */
export default async function SpotlightAdminPage() {
  const supabase = await createClient()
  const [examTypes, tree, calendar, banners] = await Promise.all([
    getExamTypes(),
    getBrowseTree(),
    supabase
      .from('exam_calendar')
      .select('id, exam_date, note, exam_types(name), programs(short_name, name)')
      .order('exam_date', { ascending: false })
      .limit(40)
      .returns<CalendarRow[]>(),
    supabase
      .from('banners')
      .select('id, kind, title, body, placements, starts_on, ends_on, is_active, programs(short_name, name)')
      .order('created_at', { ascending: false })
      .returns<BannerRow[]>(),
  ])

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
  const branches = [{ value: '', label: 'Every branch' }, ...tree.map((p) => ({ value: p.id, label: p.short_name ?? p.name }))]

  return (
    <div className="flex flex-col gap-9">
      <p className="max-w-[70ch] text-[0.8125rem] text-ink-muted">
        Banners appear at the top of the home, dashboard, papers and subject pages. New papers and each student’s
        mistakes to retry show up there by themselves. Here you set the exam dates the countdown reads, and write
        announcements. Changes reach the site within a minute.
      </p>

      <section>
        <Heading
          title="Exam dates"
          hint="The nearest date in the next 60 days counts down on every page, pointing students at that exam’s past papers."
        />
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <ul className="border-t border-rule">
            {(calendar.data ?? []).length === 0 ? (
              <li className="px-1 py-3 text-[0.8125rem] text-ink-faint">No exam dates yet.</li>
            ) : null}
            {(calendar.data ?? []).map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-1 py-1.5">
                <div className={row.exam_date < today ? 'opacity-50' : ''}>
                  <p className="text-[0.8125rem] text-ink">
                    {row.exam_types?.name ?? 'Exam'} · {show(row.exam_date)}
                    <span className="ml-2 text-xs text-ink-faint">
                      {row.programs ? (row.programs.short_name ?? row.programs.name) : 'Every branch'}
                      {row.exam_date < today ? ' · past' : ''}
                    </span>
                  </p>
                  {row.note ? <p className="text-[0.71875rem] text-ink-muted">{row.note}</p> : null}
                </div>
                <ActionButton
                  label="Delete"
                  tone="danger"
                  confirm="Delete this exam date?"
                  action={async () => {
                    'use server'
                    return deleteSpotlightRow('exam_calendar', row.id)
                  }}
                />
              </li>
            ))}
          </ul>

          <Panel title="Add an exam date">
            <AdminForm action={createExamDate} submitLabel="Add date">
              <SelectField
                label="Exam"
                name="exam_type_id"
                required
                options={examTypes.map((type) => ({ value: type.id, label: type.name }))}
              />
              <SelectField label="Branch" name="program_id" options={branches} />
              <Field label="Date" name="exam_date" type="date" required />
              <Field label="Note" name="note" placeholder="Hall tickets out on 3 Oct" hint="Optional, one short line." />
            </AdminForm>
          </Panel>
        </div>
      </section>

      <section>
        <Heading title="Announcements" hint="Shown after the automatic banners, on the pages you pick, between the dates you set." />
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <ul className="border-t border-rule">
            {(banners.data ?? []).length === 0 ? (
              <li className="px-1 py-3 text-[0.8125rem] text-ink-faint">No announcements yet.</li>
            ) : null}
            {(banners.data ?? []).map((row) => {
              const ended = row.ends_on !== null && row.ends_on < today
              return (
                <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-rule px-1 py-2">
                  <div className={`min-w-0 flex-1 ${!row.is_active || ended ? 'opacity-50' : ''}`}>
                    <p className="text-[0.8125rem] text-ink">{row.title}</p>
                    {row.body ? <p className="mt-0.5 line-clamp-2 text-[0.75rem] text-ink-muted">{row.body}</p> : null}
                    <p className="mt-1 text-[0.71875rem] text-ink-faint">
                      {row.kind} · {row.placements.join(', ')}
                      {row.programs ? ` · ${row.programs.short_name ?? row.programs.name}` : ''}
                      {row.starts_on ? ` · from ${show(row.starts_on)}` : ''}
                      {row.ends_on ? ` · until ${show(row.ends_on)}` : ''}
                      {!row.is_active ? ' · hidden' : ended ? ' · ended' : ''}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <ActionButton
                      label={row.is_active ? 'Hide' : 'Show'}
                      action={async () => {
                        'use server'
                        return setBannerActive(row.id, !row.is_active)
                      }}
                    />
                    <ActionButton
                      label="Delete"
                      tone="danger"
                      confirm="Delete this announcement?"
                      action={async () => {
                        'use server'
                        return deleteSpotlightRow('banners', row.id)
                      }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>

          <Panel title="Write an announcement">
            <AdminForm action={createBanner} submitLabel="Publish">
              <SelectField label="Kind" name="kind" options={KINDS} />
              <Field label="Title" name="title" required placeholder="Video solutions are here" />
              <TextAreaField label="Text" name="body" placeholder="One short line." rows={2} />
              <Field label="Small label above the title" name="eyebrow" hint="Optional. Defaults to the kind." />
              <Field label="Button label" name="cta_label" placeholder="Watch one" />
              <Field label="Button link" name="cta_href" placeholder="/subject/dbms" />
              <fieldset className="flex flex-col gap-1">
                <legend className="label mb-1">Show on</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {PLACEMENTS.map((place) => (
                    <label key={place.value} className="flex items-center gap-1.5 text-[0.8125rem] text-ink">
                      <input
                        type="checkbox"
                        name="placements"
                        value={place.value}
                        defaultChecked={place.value === 'home'}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                      {place.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <SelectField label="Branch" name="program_id" options={branches} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="From" name="starts_on" type="date" />
                <Field label="Until" name="ends_on" type="date" />
              </div>
            </AdminForm>
          </Panel>
        </div>
      </section>
    </div>
  )
}

function Heading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-[0.9375rem] font-medium text-ink">{title}</h2>
      {hint ? <p className="mt-0.5 text-[0.75rem] text-ink-muted">{hint}</p> : null}
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="h-fit border border-rule bg-surface p-3.5">
      <h3 className="label mb-2.5 !text-ink">{title}</h3>
      {children}
    </div>
  )
}
