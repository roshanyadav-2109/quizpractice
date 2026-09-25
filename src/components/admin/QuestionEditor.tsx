'use client'

import { useMemo, useState } from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { blocksSchema, BLOCK_LABELS, type Block } from '@/lib/blocks/schema'
import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { updateOption, updateQuestion, type ActionState } from '@/app/admin/actions'
import type { QuestionOptionRow, QuestionType } from '@/types/db'

/**
 * Question editor.
 *
 * Blocks are edited as JSON with a live preview beside them rather than through
 * a visual builder. That is a deliberate trade: the block model is the product,
 * a JSON editor exposes all of it immediately, and the preview means you are
 * never editing blind. A drag-and-drop builder could come later without
 * changing anything about how the content is stored.
 */
export function QuestionEditor({
  question,
  options,
}: {
  question: {
    id: string
    number: number
    type: QuestionType
    marks: number
    negative_marks: number
    correct_answer: string | null
    answer_tolerance: number | null
    topics: string[]
    body: Block[]
  }
  options: QuestionOptionRow[]
}) {
  const [bodyText, setBodyText] = useState(() => JSON.stringify(question.body, null, 2))
  const [state, formAction] = useActionState<ActionState, FormData>(updateQuestion, {})

  const preview = useMemo(() => {
    try {
      const parsed = blocksSchema.safeParse(JSON.parse(bodyText))
      if (parsed.success) return { blocks: parsed.data, error: null as string | null }
      const issue = parsed.error.issues[0]
      return {
        blocks: null,
        error: `Block ${issue.path.join('.') || '0'}: ${issue.message}`,
      }
    } catch (error) {
      return { blocks: null, error: (error as Error).message }
    }
  }, [bodyText])

  const blockCounts = preview.blocks
    ? preview.blocks.reduce<Record<string, number>>((counts, block) => {
        counts[block.type] = (counts[block.type] ?? 0) + 1
        return counts
      }, {})
    : {}

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={question.id} />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs tracking-wide text-ink-muted uppercase">Type</span>
            <select
              name="type"
              defaultValue={question.type}
              className="rounded-md border border-rule bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            >
              <option value="mcq">mcq — one correct option</option>
              <option value="msq">msq — several correct options</option>
              <option value="numerical">numerical — typed value</option>
              <option value="subjective">subjective — written</option>
              <option value="programming">programming — code</option>
            </select>
          </label>

          <NumberField label="Marks" name="marks" defaultValue={question.marks} step="0.5" />
          <NumberField
            label="Negative marks"
            name="negative_marks"
            defaultValue={question.negative_marks}
            step="0.25"
          />
          <TextField
            label="Topics"
            name="topics"
            defaultValue={question.topics.join(', ')}
            placeholder="sql, window-functions"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Correct answer"
            name="correct_answer"
            defaultValue={question.correct_answer ?? ''}
            placeholder="For numerical and programming questions"
          />
          <TextField
            label="Answer tolerance"
            name="answer_tolerance"
            defaultValue={
              question.answer_tolerance === null ? '' : String(question.answer_tolerance)
            }
            placeholder="0.5"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between">
              <span className="text-xs tracking-wide text-ink-muted uppercase">
                Question body (blocks)
              </span>
              <span className="font-mono text-[0.6875rem] text-ink-faint">
                {Object.entries(blockCounts)
                  .map(([type, count]) => `${BLOCK_LABELS[type as Block['type']]} ×${count}`)
                  .join('  ')}
              </span>
            </div>
            <textarea
              name="body"
              value={bodyText}
              onChange={(event) => setBodyText(event.target.value)}
              spellCheck={false}
              rows={22}
              className={`rounded-md border bg-surface px-3 py-2 font-mono text-xs text-ink outline-none ${
                preview.error ? 'border-incorrect' : 'border-rule focus:border-accent'
              }`}
            />
            {preview.error ? (
              <p className="text-xs text-incorrect">{preview.error}</p>
            ) : (
              <p className="text-xs text-ink-faint">
                Valid. See schema/question-paper.schema.json for every block type.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs tracking-wide text-ink-muted uppercase">Preview</span>
            <div className="min-h-[12.5rem] rounded-md border border-rule bg-surface p-4">
              {preview.blocks ? (
                <BlockRenderer blocks={preview.blocks} />
              ) : (
                <p className="text-sm text-ink-muted">
                  Fix the JSON to see the rendered question.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <SaveButton />
          {state.ok ? <span className="text-sm text-correct">Saved.</span> : null}
          {state.error ? <span className="text-sm text-incorrect">{state.error}</span> : null}
        </div>
      </form>

      {options.length > 0 ? (
        <section>
          <h3 className="mb-2 text-sm text-ink">Options</h3>
          <ul className="flex flex-col gap-2">
            {options.map((option) => (
              <OptionRow key={option.id} option={option} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

function OptionRow({ option }: { option: QuestionOptionRow }) {
  const [correct, setCorrect] = useState(option.is_correct)
  const [content, setContent] = useState(() => JSON.stringify(option.content, null, 2))
  const [editing, setEditing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function toggleCorrect() {
    const next = !correct
    setCorrect(next)
    setMessage(null)
    const result = await updateOption(option.id, { is_correct: next })
    if (result.error) {
      setCorrect(!next)
      setMessage(result.error)
    }
  }

  async function saveContent() {
    setSaving(true)
    setMessage(null)
    const result = await updateOption(option.id, { content })
    setSaving(false)
    if (result.error) setMessage(result.error)
    else {
      setMessage('Saved.')
      setEditing(false)
    }
  }

  const parsed = (() => {
    try {
      const result = blocksSchema.safeParse(JSON.parse(content))
      return result.success ? result.data : null
    } catch {
      return null
    }
  })()

  return (
    <li
      className={`rounded-md border px-3 py-2.5 ${
        correct ? 'border-correct bg-correct-soft' : 'border-rule bg-surface'
      }`}
    >
      <div className="flex items-start gap-3">
        <label className="flex shrink-0 items-center gap-2 pt-0.5">
          <input
            type="checkbox"
            checked={correct}
            onChange={toggleCorrect}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          <span className="font-mono text-sm text-ink-muted">{option.label}</span>
        </label>

        <div className="min-w-0 flex-1">
          {editing ? (
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              spellCheck={false}
              rows={6}
              className="w-full rounded-md border border-rule bg-surface px-2 py-1.5 font-mono text-xs text-ink outline-none focus:border-accent"
            />
          ) : parsed ? (
            <BlockRenderer blocks={parsed} context="option" />
          ) : (
            <p className="text-xs text-incorrect">This option&rsquo;s JSON is invalid.</p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          {editing ? (
            <>
              <button
                type="button"
                onClick={saveContent}
                disabled={saving}
                className="rounded-md bg-accent px-2.5 py-1 text-xs text-accent-ink disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-xs text-ink-muted hover:text-ink"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md border border-rule px-2.5 py-1 text-xs text-ink-muted hover:border-rule-strong hover:text-ink"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {message ? <p className="mt-1.5 text-xs text-ink-muted">{message}</p> : null}
    </li>
  )
}

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-accent px-4 py-2 text-sm text-accent-ink hover:bg-accent-hover disabled:opacity-60"
    >
      {pending ? 'Saving…' : 'Save question'}
    </button>
  )
}

function TextField({
  label,
  name,
  defaultValue,
  placeholder,
}: {
  label: string
  name: string
  defaultValue?: string
  placeholder?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs tracking-wide text-ink-muted uppercase">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="rounded-md border border-rule bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
      />
    </label>
  )
}

function NumberField({
  label,
  name,
  defaultValue,
  step,
}: {
  label: string
  name: string
  defaultValue: number
  step?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs tracking-wide text-ink-muted uppercase">{label}</span>
      <input
        name={name}
        type="number"
        step={step}
        defaultValue={defaultValue}
        className="rounded-md border border-rule bg-surface px-3 py-2 text-sm text-ink tabular-nums outline-none focus:border-accent"
      />
    </label>
  )
}
