import { getBrowseTree, getExamTypes } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'
import {
  createExamType,
  createLevel,
  createProgram,
  createSubject,
  toggleActive,
} from '@/app/admin/actions'
import { AdminForm, CheckboxField, Field, SelectField } from '@/components/admin/AdminForm'
import { ActionButton } from '@/components/admin/ActionButton'
import type { Level, Program } from '@/types/db'

export const dynamic = 'force-dynamic'

/**
 * The taxonomy manager — the thing that makes "nothing is hardcoded" true.
 * A new IITM branch, level, subject or exam type is a form submission here, not
 * a code change and a deploy.
 */
export default async function TaxonomyPage() {
  const supabase = await createClient()

  // Staff see inactive rows too, so this deliberately does not reuse the public
  // browse tree's is_active filter for the flat lists below.
  const [tree, examTypes, allPrograms, allLevels] = await Promise.all([
    getBrowseTree({ withStats: true }),
    getExamTypes(),
    supabase.from('programs').select('*').order('sort_order').returns<Program[]>(),
    supabase.from('levels').select('*').order('sort_order').returns<Level[]>(),
  ])

  const programs = allPrograms.data ?? []
  const levels = allLevels.data ?? []

  return (
    <div className="flex flex-col gap-8">
      <section>
        <SectionHeading title="Branches" />

        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <ul className="border-t border-rule">
            {tree.map((program) => (
              <li
                key={program.id}
                className="border-b border-rule px-1 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[0.8125rem] text-ink">
                      {program.name}
                      <span className="ml-2 font-mono text-xs text-ink-faint">
                        {program.slug}
                      </span>
                    </p>
                    <p className="text-[0.71875rem] text-ink-muted">
                      {program.levels.length} levels ·{' '}
                      {program.levels.reduce((sum, l) => sum + l.subjects.length, 0)} subjects
                    </p>
                  </div>
                  <ActionButton
                    label={program.is_active ? 'Hide' : 'Show'}
                    action={async () => {
                      'use server'
                      return toggleActive('programs', program.id, !program.is_active)
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>

          <Panel title="Add a branch">
            <AdminForm action={createProgram} submitLabel="Add branch">
              <Field label="Slug" name="slug" required placeholder="ast" />
              <Field
                label="Name"
                name="name"
                required
                placeholder="BS in Aeronautics and Space Technology"
              />
              <Field label="Short name" name="short_name" placeholder="Aeronautics" />
              <Field label="Description" name="description" />
              <Field label="Accent colour" name="accent" placeholder="#33447a" />
              <Field label="Sort order" name="sort_order" type="number" defaultValue={0} />
            </AdminForm>
          </Panel>
        </div>
      </section>

      <section>
        <SectionHeading title="Levels" />

        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <ul className="border-t border-rule">
            {tree.map((program) =>
              program.levels.map((level) => (
                <li
                  key={level.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-1 py-1.5"
                >
                  <div>
                    <p className="text-[0.8125rem] text-ink">
                      <span className="text-ink-muted">
                        {program.short_name ?? program.name} /
                      </span>{' '}
                      {level.name}
                      <span className="ml-2 font-mono text-xs text-ink-faint">
                        {level.slug}
                      </span>
                    </p>
                    <p className="text-[0.71875rem] text-ink-muted">
                      {level.subjects.length} subjects
                      {level.credits ? ` · ${level.credits} credits` : ''}
                    </p>
                  </div>
                  <ActionButton
                    label={level.is_active ? 'Hide' : 'Show'}
                    action={async () => {
                      'use server'
                      return toggleActive('levels', level.id, !level.is_active)
                    }}
                  />
                </li>
              )),
            )}
          </ul>

          <Panel title="Add a level">
            <AdminForm action={createLevel} submitLabel="Add level">
              <SelectField
                label="Branch"
                name="program_id"
                required
                options={programs.map((program) => ({
                  value: program.id,
                  label: program.name,
                }))}
              />
              <Field label="Slug" name="slug" required placeholder="diploma" />
              <Field label="Name" name="name" required placeholder="Diploma Level" />
              <Field label="Code" name="code" placeholder="DIP" />
              <Field label="Credits" name="credits" type="number" />
              <Field label="Sort order" name="sort_order" type="number" defaultValue={0} />
            </AdminForm>
          </Panel>
        </div>
      </section>

      <section>
        <SectionHeading title="Subjects" hint="Aliases are matched by the importer." />

        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <div className="overflow-x-auto border border-rule">
            <table className="w-full border-collapse text-[0.78125rem]">
              <thead>
                <tr className="bg-surface-2 text-left">
                  <th className="px-2.5 py-1.5">Subject</th>
                  <th className="px-2.5 py-1.5">Level</th>
                  <th className="px-2.5 py-1.5">Aliases</th>
                  <th className="px-2.5 py-1.5">Papers</th>
                  <th className="px-2.5 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {tree.flatMap((program) =>
                  program.levels.flatMap((level) =>
                    level.subjects.map((subject) => (
                      <tr key={subject.id} className="border-t border-rule">
                        <td className="px-2.5 py-1.5">
                          <span className="text-ink">{subject.name}</span>
                          <span className="ml-2 font-mono text-xs text-ink-faint">
                            {subject.slug}
                          </span>
                        </td>
                        <td className="px-2.5 py-1.5 text-[0.71875rem] text-ink-muted">
                          {program.short_name} / {level.name}
                        </td>
                        <td className="px-2.5 py-1.5 font-mono text-[0.6875rem] text-ink-muted">
                          {subject.aliases.join(', ') || '—'}
                        </td>
                        <td className="px-2.5 py-1.5 font-mono text-[0.6875rem] tabular-nums text-ink-muted">
                          {Number(subject.stats?.paper_count ?? 0)}
                        </td>
                        <td className="px-2.5 py-1.5 text-right">
                          <ActionButton
                            label={subject.is_active ? 'Hide' : 'Show'}
                            action={async () => {
                              'use server'
                              return toggleActive('subjects', subject.id, !subject.is_active)
                            }}
                          />
                        </td>
                      </tr>
                    )),
                  ),
                )}
              </tbody>
            </table>
          </div>

          <Panel title="Add a subject">
            <AdminForm action={createSubject} submitLabel="Add subject">
              <SelectField
                label="Level"
                name="level_id"
                required
                options={levels.map((level) => {
                  const program = programs.find((p) => p.id === level.program_id)
                  return {
                    value: level.id,
                    label: `${program?.short_name ?? program?.name ?? '?'} — ${level.name}`,
                  }
                })}
              />
              <Field label="Slug" name="slug" required placeholder="dbms" />
              <Field
                label="Name"
                name="name"
                required
                placeholder="Database Management Systems"
              />
              <Field label="Course code" name="code" placeholder="BSCS2001" />
              <Field
                label="Aliases"
                name="aliases"
                placeholder="DBMS, Data Base Management"
                hint="Comma separated. These are matched by the importer."
              />
              <CheckboxField label="Has programming questions" name="has_programming" />
              <Field label="Sort order" name="sort_order" type="number" defaultValue={0} />
            </AdminForm>
          </Panel>
        </div>
      </section>

      <section>
        <SectionHeading title="Exam types" />

        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <ul className="border-t border-rule">
            {examTypes.map((examType) => (
              <li
                key={examType.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-1 py-1.5"
              >
                <div>
                  <p className="text-[0.8125rem] text-ink">
                    {examType.name}
                    <span className="ml-2 font-mono text-xs text-ink-faint">
                      {examType.slug}
                    </span>
                  </p>
                  {examType.default_duration_minutes ? (
                    <p className="text-[0.71875rem] text-ink-muted">
                      {examType.default_duration_minutes} minutes by default
                    </p>
                  ) : null}
                </div>
                <ActionButton
                  label={examType.is_active ? 'Hide' : 'Show'}
                  action={async () => {
                    'use server'
                    return toggleActive('exam_types', examType.id, !examType.is_active)
                  }}
                />
              </li>
            ))}
          </ul>

          <Panel title="Add an exam type">
            <AdminForm action={createExamType} submitLabel="Add exam type">
              <Field label="Slug" name="slug" required placeholder="quiz-3" />
              <Field label="Name" name="name" required placeholder="Quiz 3" />
              <Field label="Description" name="description" />
              <Field
                label="Default duration (minutes)"
                name="default_duration_minutes"
                type="number"
              />
              <Field label="Sort order" name="sort_order" type="number" defaultValue={0} />
            </AdminForm>
          </Panel>
        </div>
      </section>
    </div>
  )
}

function SectionHeading({ title, hint }: { title: string; hint?: string }) {
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
