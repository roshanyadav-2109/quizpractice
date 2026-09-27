'use client'

import {
  useDeferredValue,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { SketchBlockView } from '@/components/blocks/SketchBlockView'
import type { WhiteboardHandle } from '@/components/board/Whiteboard'
import {
  BLOCK_LABELS,
  EXPLANATION_MAX_BYTES,
  explanationBlocksSchema,
  jsonByteLength,
  sketchBlockSchema,
  type Block,
  type CodeBlock,
  type MathBlock,
  type SketchBlock,
  type TableBlock,
  type TextBlock,
} from '@/lib/blocks/schema'
import { pageIsEmpty } from '@/lib/board/model'
import { EXPLANATION_STATE_LABELS, type ExplanationState } from '@/lib/teach/contracts'
import {
  CaretDown,
  CaretUp,
  CheckCircle,
  Code,
  FloppyDisk,
  FunctionIcon,
  Info,
  Scribble,
  SealCheck,
  Shuffle,
  Table,
  TextT,
  Trash,
  Warning,
  X,
} from '@/components/ui/icons'
import { Badge, buttonClass } from '@/components/ui/primitives'

/** A block in the editor, with a key that survives edits and reordering. */
export interface EditorItem {
  key: string
  block: Block
}

let keySeq = 0
/** A fresh key for a new block. Called from event handlers only. */
export function newItemKey(): string {
  keySeq += 1
  return `n${keySeq}`
}

const CODE_LANGUAGES = ['python', 'java', 'c', 'cpp', 'javascript', 'typescript', 'sql', 'bash', 'r', 'text']

const STATE_TONES: Record<ExplanationState, 'neutral' | 'accent' | 'correct' | 'incorrect'> = {
  draft: 'neutral',
  review: 'accent',
  live: 'correct',
  rejected: 'incorrect',
}

const EDITABLE: ReadonlySet<Block['type']> = new Set(['text', 'math', 'code', 'table', 'sketch'])

/**
 * The written explanation: a list of blocks — prose with $maths$, equations,
 * code, tables and pages from the whiteboard — with the page students will
 * see beside it, a size meter, and the buttons that save it.
 *
 * Save draft keeps it private. Submit sends it for review; a trusted teacher
 * (and an admin) sees Publish instead, and it goes live at once. A live
 * explanation has no draft: changes are submitted (or published) directly,
 * and an untrusted teacher's change takes it back to review.
 */
export function ExplanationEditor({
  items,
  onItemsChange,
  state,
  reviewNote,
  editingName,
  dirty,
  saving,
  error,
  notice,
  onSave,
  trusted,
  locked,
  blocked,
  orderVaries,
  boardRef,
  questionNumber,
  onActivity,
}: {
  items: EditorItem[]
  onItemsChange: (next: EditorItem[]) => void
  /** Null when nothing has been saved yet. */
  state: ExplanationState | null
  reviewNote: string | null
  /** Someone else's explanation, being edited by an admin. */
  editingName: string | null
  dirty: boolean
  saving: 'draft' | 'submit' | null
  error: string | null
  notice: string | null
  onSave: (intent: 'draft' | 'submit') => void
  trusted: boolean
  /** Why the explanation cannot be changed at all (another teacher's is live). */
  locked: string | null
  /** Why it cannot be submitted right now (the answer key is reported). */
  blocked: string | null
  orderVaries: boolean
  boardRef: RefObject<WhiteboardHandle | null>
  questionNumber: number
  onActivity: () => void
}) {
  const blocks = items.map((item) => item.block)
  const deferred = useDeferredValue(blocks)
  const bytes = jsonByteLength(deferred)
  const live = state === 'live'
  const readOnly = locked !== null

  function change(next: EditorItem[]) {
    onActivity()
    onItemsChange(next)
  }
  const update = (key: string, block: Block) => change(items.map((item) => (item.key === key ? { ...item, block } : item)))
  const remove = (key: string) => change(items.filter((item) => item.key !== key))
  const move = (index: number, by: -1 | 1) => {
    const target = index + by
    if (target < 0 || target >= items.length) return
    const next = [...items]
    ;[next[index], next[target]] = [next[target], next[index]]
    change(next)
  }
  const add = (block: Block) => change([...items, { key: newItemKey(), block }])

  const submitLabel = trusted
    ? live
      ? 'Publish changes'
      : 'Publish'
    : live
      ? 'Submit changes for review'
      : state === 'review' && !dirty
        ? 'Submitted'
        : 'Submit for review'

  return (
    <section aria-labelledby="explanation-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 id="explanation-heading" className="text-card font-medium text-ink">
            Written explanation
          </h2>
          {state ? <Badge tone={STATE_TONES[state]}>{EXPLANATION_STATE_LABELS[state]}</Badge> : <Badge>Not saved yet</Badge>}
          {dirty ? <span className="text-meta text-ink-faint">Unsaved changes</span> : null}
        </div>
        <SizeMeter bytes={bytes} />
      </div>

      {editingName ? (
        <Callout tone="info">You are editing {editingName}’s explanation as an admin. Saving changes theirs; nothing new is created.</Callout>
      ) : null}
      {reviewNote ? (
        <Callout tone={state === 'rejected' ? 'warning' : 'info'}>
          <span className="font-medium">Reviewer’s note:</span> {reviewNote}
        </Callout>
      ) : null}
      {locked ? <Callout tone="warning">{locked}</Callout> : null}
      {orderVaries ? (
        <Callout tone="shuffle">
          Some copies of this question list the options in a different order. Name each option by what it says — “the
          option 42” — never by its letter or position.
        </Callout>
      ) : null}
      {live && !trusted ? (
        <Callout tone="info">
          This explanation is published. Submitting a change takes it back to review, and students see it again once a
          reviewer approves it.
        </Callout>
      ) : null}

      <div className="grid items-start gap-5 2xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3">
          {items.length === 0 ? (
            <p className="rounded-card border border-dashed border-rule px-4 py-6 text-center text-meta text-ink-muted">
              Nothing written yet. Start with a Text block, or add a page from the whiteboard.
            </p>
          ) : null}
          {items.map((item, index) => (
            <BlockFrame
              key={item.key}
              label={BLOCK_LABELS[item.block.type]}
              index={index}
              count={items.length}
              disabled={readOnly}
              onUp={() => move(index, -1)}
              onDown={() => move(index, 1)}
              onRemove={() => remove(item.key)}
            >
              <BlockEditor block={item.block} disabled={readOnly} onChange={(block) => update(item.key, block)} />
            </BlockFrame>
          ))}

          {!readOnly ? (
            <div className="flex flex-wrap gap-2">
              <AddButton icon={<TextT size={16} />} label="Text" onClick={() => add({ type: 'text', md: '' })} />
              <AddButton icon={<FunctionIcon size={16} />} label="Equation" onClick={() => add({ type: 'math', latex: '' })} />
              <AddButton icon={<Code size={16} />} label="Code" onClick={() => add({ type: 'code', language: 'python', source: '' })} />
              <AddButton
                icon={<Table size={16} />}
                label="Table"
                onClick={() => add({ type: 'table', columns: ['', ''], rows: [['', '']] })}
              />
              <InsertBoardPage boardRef={boardRef} questionNumber={questionNumber} onInsert={add} />
            </div>
          ) : null}
        </div>

        <div className="min-w-0 2xl:sticky 2xl:top-4">
          <p className="label mb-2">How students see it</p>
          <div className="rounded-card border border-rule bg-surface p-4">
            {deferred.length ? (
              <div className="paper text-ink">
                <BlockRenderer blocks={deferred} context="solution" />
              </div>
            ) : (
              <p className="text-meta text-ink-faint">The explanation appears here as you write it.</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-rule pt-4">
        {blocked ? (
          <p className="flex items-start gap-2 text-meta text-marked">
            <Warning size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            {blocked}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {!live ? (
            <button
              type="button"
              onClick={() => onSave('draft')}
              disabled={readOnly || saving !== null || (!dirty && state !== null) || (state === null && items.length === 0)}
              className={buttonClass('outline', 'md')}
            >
              <FloppyDisk size={16} aria-hidden="true" />
              {saving === 'draft' ? 'Saving…' : 'Save draft'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onSave('submit')}
            // A live explanation with nothing changed has nothing to submit —
            // and for an untrusted teacher it would only take it off the site.
            disabled={
              readOnly || saving !== null || blocked !== null || (live && !dirty) || (state === 'review' && !dirty && !trusted)
            }
            className={buttonClass('primary', 'md')}
          >
            <SealCheck size={16} aria-hidden="true" />
            {saving === 'submit' ? 'Saving…' : submitLabel}
          </button>
          <span className="text-meta text-ink-faint">
            {trusted ? 'Publishing makes it live on every copy at once.' : 'A reviewer publishes it, or sends it back with a note.'}
          </span>
        </div>
        <div aria-live="polite">
          {error ? (
            <p className="flex items-start gap-2 text-meta text-incorrect">
              <Warning size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
              {error}
            </p>
          ) : notice ? (
            <p className="flex items-start gap-2 text-meta text-correct">
              <CheckCircle size={16} weight="fill" aria-hidden="true" className="mt-0.5 shrink-0" />
              {notice}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}

/**
 * The blocks as the database will take them: empty blocks dropped, then
 * checked against the same schema the server uses, so a mistake is named
 * before anything is sent. Returns the first problem, worded for a teacher.
 */
export function prepareBlocks(blocks: Block[]): { ok: true; blocks: Block[] } | { ok: false; error: string } {
  const kept = blocks.filter((block) => {
    if (block.type === 'text') return block.md.trim() !== ''
    if (block.type === 'math') return block.latex.trim() !== ''
    if (block.type === 'code') return block.source.trim() !== ''
    return true
  })
  const unsupported = kept.find((block) => !EDITABLE.has(block.type))
  if (unsupported) {
    return {
      ok: false,
      error: `A ${BLOCK_LABELS[unsupported.type].toLowerCase()} block cannot be saved from the studio. Remove it, or ask an admin to change it.`,
    }
  }
  const checked = explanationBlocksSchema.safeParse(kept)
  if (checked.success) return { ok: true, blocks: checked.data }
  const issue = checked.error.issues[0]
  const index = typeof issue?.path[0] === 'number' ? issue.path[0] : null
  const where = index !== null && kept[index] ? `Block ${index + 1} (${BLOCK_LABELS[kept[index].type]}): ` : ''
  return { ok: false, error: `${where}${issue?.message ?? 'The explanation could not be read.'}` }
}

function SizeMeter({ bytes }: { bytes: number }) {
  const share = bytes / EXPLANATION_MAX_BYTES
  const tone = share > 1 ? 'bg-incorrect' : share > 0.8 ? 'bg-marked' : 'bg-accent'
  return (
    <div className="flex items-center gap-2" title="An explanation may be up to 300 kB; board pages take the most room">
      <div
        className="h-1.5 w-28 overflow-hidden rounded-full bg-surface-2"
        role="meter"
        aria-label="Size of the explanation"
        aria-valuemin={0}
        aria-valuemax={EXPLANATION_MAX_BYTES}
        aria-valuenow={Math.min(bytes, EXPLANATION_MAX_BYTES)}
      >
        <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, share * 100)}%` }} />
      </div>
      <span className={`text-micro tabular-nums ${share > 1 ? 'text-incorrect' : 'text-ink-faint'}`}>
        {Math.ceil(bytes / 1000)} / {EXPLANATION_MAX_BYTES / 1000} kB
      </span>
    </div>
  )
}

function Callout({ tone, children }: { tone: 'info' | 'warning' | 'shuffle'; children: ReactNode }) {
  const styles = {
    info: 'bg-surface-2 text-ink-muted',
    warning: 'bg-marked-soft text-marked',
    shuffle: 'bg-review-soft text-review',
  }[tone]
  const Icon = tone === 'warning' ? Warning : tone === 'shuffle' ? Shuffle : Info
  return (
    <p className={`flex items-start gap-2 rounded-control px-3 py-2 text-meta ${styles}`}>
      <Icon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

function AddButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={buttonClass('outline', 'sm')}>
      <span aria-hidden="true" className="text-ink-muted">
        {icon}
      </span>
      {label}
    </button>
  )
}

function BlockFrame({
  label,
  index,
  count,
  disabled,
  onUp,
  onDown,
  onRemove,
  children,
}: {
  label: string
  index: number
  count: number
  disabled: boolean
  onUp: () => void
  onDown: () => void
  onRemove: () => void
  children: ReactNode
}) {
  const icon =
    'flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink disabled:opacity-35'
  return (
    <div className="rounded-card border border-rule bg-surface">
      <div className="flex items-center gap-1 border-b border-rule px-3 py-1">
        <span className="flex-1 text-meta text-ink-muted">
          {index + 1}. {label}
        </span>
        <button type="button" onClick={onUp} disabled={disabled || index === 0} className={icon} aria-label={`Move block ${index + 1} up`}>
          <CaretUp size={16} />
        </button>
        <button
          type="button"
          onClick={onDown}
          disabled={disabled || index === count - 1}
          className={icon}
          aria-label={`Move block ${index + 1} down`}
        >
          <CaretDown size={16} />
        </button>
        <button type="button" onClick={onRemove} disabled={disabled} className={icon} aria-label={`Delete block ${index + 1}`}>
          <Trash size={16} />
        </button>
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}

const INPUT =
  'w-full rounded-control border border-rule bg-surface px-3 py-2 text-ui text-ink outline-none focus:border-accent disabled:bg-surface-2 disabled:text-ink-muted'

function BlockEditor({ block, disabled, onChange }: { block: Block; disabled: boolean; onChange: (block: Block) => void }) {
  switch (block.type) {
    case 'text':
      return <TextEditor block={block} disabled={disabled} onChange={onChange} />
    case 'math':
      return <MathEditor block={block} disabled={disabled} onChange={onChange} />
    case 'code':
      return <CodeEditor block={block} disabled={disabled} onChange={onChange} />
    case 'table':
      return <TableEditor block={block} disabled={disabled} onChange={onChange} />
    case 'sketch':
      return <SketchEditor block={block} disabled={disabled} onChange={onChange} />
    default:
      return (
        <div className="flex flex-col gap-2">
          <p className="text-meta text-ink-muted">
            A {BLOCK_LABELS[block.type].toLowerCase()} cannot be edited or saved from the studio. Delete it, or ask an
            admin to change it.
          </p>
          <div className="pointer-events-none opacity-80">
            <BlockRenderer blocks={[block]} context="solution" />
          </div>
        </div>
      )
  }
}

function TextEditor({ block, disabled, onChange }: { block: TextBlock; disabled: boolean; onChange: (block: Block) => void }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        Text
      </label>
      <textarea
        id={id}
        value={block.md}
        disabled={disabled}
        onChange={(event) => onChange({ ...block, md: event.target.value })}
        rows={Math.min(16, Math.max(4, block.md.split('\n').length + 1))}
        placeholder="Explain in plain words. **bold**, *italic*, `code` and $x^2$ for maths all work."
        className={`${INPUT} resize-y leading-relaxed`}
      />
    </div>
  )
}

function MathEditor({ block, disabled, onChange }: { block: MathBlock; disabled: boolean; onChange: (block: Block) => void }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-meta text-ink-muted">
        LaTeX, shown as a display equation
      </label>
      <textarea
        id={id}
        value={block.latex}
        disabled={disabled}
        onChange={(event) => onChange({ ...block, latex: event.target.value })}
        rows={2}
        spellCheck={false}
        placeholder="\frac{n(n+1)}{2}"
        className={`${INPUT} resize-y font-mono text-[0.875rem]`}
      />
    </div>
  )
}

function CodeEditor({ block, disabled, onChange }: { block: CodeBlock; disabled: boolean; onChange: (block: Block) => void }) {
  const id = useId()
  // Tab indents inside the box; Escape first lets Tab leave it, for keyboard users.
  const escaped = useRef(false)
  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      escaped.current = true
      return
    }
    if (event.key === 'Tab' && !event.shiftKey && !escaped.current) {
      event.preventDefault()
      const box = event.currentTarget
      const { selectionStart, selectionEnd, value } = box
      const next = `${value.slice(0, selectionStart)}    ${value.slice(selectionEnd)}`
      onChange({ ...block, source: next })
      requestAnimationFrame(() => box.setSelectionRange(selectionStart + 4, selectionStart + 4))
      return
    }
    escaped.current = false
  }
  const languages = CODE_LANGUAGES.includes(block.language) ? CODE_LANGUAGES : [block.language, ...CODE_LANGUAGES]
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-meta text-ink-muted">
        Language
        <select
          value={block.language}
          disabled={disabled}
          onChange={(event) => onChange({ ...block, language: event.target.value })}
          className="h-8 rounded-control border border-rule bg-surface px-2 text-meta text-ink outline-none focus:border-accent"
        >
          {languages.map((language) => (
            <option key={language} value={language}>
              {language}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={id} className="sr-only">
        Code
      </label>
      <textarea
        id={id}
        value={block.source}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onChange={(event) => onChange({ ...block, source: event.target.value })}
        rows={Math.min(20, Math.max(4, block.source.split('\n').length + 1))}
        spellCheck={false}
        wrap="off"
        className={`${INPUT} resize-y font-mono text-[0.875rem] leading-[1.6] whitespace-pre`}
      />
      <p className="text-micro text-ink-faint">Tab indents. Press Escape, then Tab, to leave the box.</p>
    </div>
  )
}

function TableEditor({ block, disabled, onChange }: { block: TableBlock; disabled: boolean; onChange: (block: Block) => void }) {
  const cell = (value: string | number | null) => (value === null ? '' : String(value))
  const setColumn = (index: number, value: string) =>
    onChange({ ...block, columns: block.columns.map((column, i) => (i === index ? value : column)) })
  const setCell = (row: number, column: number, value: string) =>
    onChange({
      ...block,
      // A short row (from an import) is filled out to the headings as it is edited.
      rows: block.rows.map((cells, r) =>
        r === row ? block.columns.map((_, c) => (c === column ? value : (cells[c] ?? ''))) : cells,
      ),
    })
  const addRow = () => onChange({ ...block, rows: [...block.rows, block.columns.map(() => '')] })
  const addColumn = () =>
    onChange({
      ...block,
      columns: [...block.columns, ''],
      rows: block.rows.map((cells) => [...cells, '']),
      align: block.align ? [...block.align, 'left'] : undefined,
    })
  const removeRow = (row: number) => onChange({ ...block, rows: block.rows.filter((_, r) => r !== row) })
  const removeColumn = (column: number) => {
    if (block.columns.length <= 1) return
    onChange({
      ...block,
      columns: block.columns.filter((_, c) => c !== column),
      rows: block.rows.map((cells) => cells.filter((_, c) => c !== column)),
      align: block.align?.filter((_, c) => c !== column),
    })
  }
  const small = 'w-full min-w-[6rem] rounded-md border border-rule bg-surface px-2 py-1.5 text-meta text-ink outline-none focus:border-accent'
  const x = 'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-faint hover:bg-surface-2 hover:text-incorrect disabled:opacity-30'

  return (
    <div className="flex flex-col gap-2">
      <input
        value={block.caption ?? ''}
        disabled={disabled}
        onChange={(event) => onChange({ ...block, caption: event.target.value || undefined })}
        placeholder="Caption (optional)"
        className={`${INPUT} py-1.5 text-meta`}
        aria-label="Table caption"
      />
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-1">
          <thead>
            <tr>
              {block.columns.map((column, c) => (
                <th key={c} className="align-bottom font-normal">
                  <div className="flex items-center gap-0.5">
                    <input
                      value={column}
                      disabled={disabled}
                      onChange={(event) => setColumn(c, event.target.value)}
                      placeholder={`Heading ${c + 1}`}
                      className={`${small} bg-surface-2 font-medium`}
                      aria-label={`Heading of column ${c + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() => removeColumn(c)}
                      disabled={disabled || block.columns.length <= 1}
                      className={x}
                      aria-label={`Delete column ${c + 1}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((cells, r) => (
              <tr key={r}>
                {block.columns.map((_, c) => (
                  <td key={c}>
                    <input
                      value={cell(cells[c] ?? '')}
                      disabled={disabled}
                      onChange={(event) => setCell(r, c, event.target.value)}
                      className={small}
                      aria-label={`Row ${r + 1}, column ${c + 1}`}
                    />
                  </td>
                ))}
                <td>
                  <button type="button" onClick={() => removeRow(r)} disabled={disabled} className={x} aria-label={`Delete row ${r + 1}`}>
                    <X size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!disabled ? (
        <div className="flex gap-2">
          <button type="button" onClick={addRow} className={buttonClass('ghost', 'sm')}>
            Add row
          </button>
          <button type="button" onClick={addColumn} className={buttonClass('ghost', 'sm')}>
            Add column
          </button>
        </div>
      ) : null}
    </div>
  )
}

function SketchEditor({ block, disabled, onChange }: { block: SketchBlock; disabled: boolean; onChange: (block: Block) => void }) {
  const altId = useId()
  return (
    <div className="flex flex-col gap-2">
      <SketchBlockView block={block} context="compact" />
      <label htmlFor={altId} className="text-meta text-ink-muted">
        What the drawing shows (read aloud to students who cannot see it)
      </label>
      <textarea
        id={altId}
        value={block.alt}
        disabled={disabled}
        maxLength={2000}
        onChange={(event) => onChange({ ...block, alt: event.target.value })}
        rows={2}
        className={`${INPUT} resize-y text-meta`}
      />
      <input
        value={block.caption ?? ''}
        disabled={disabled}
        maxLength={2000}
        onChange={(event) => onChange({ ...block, caption: event.target.value || undefined })}
        placeholder="Caption under the drawing (optional)"
        className={`${INPUT} py-1.5 text-meta`}
        aria-label="Caption"
      />
    </div>
  )
}

/**
 * "Board page": a page of the whiteboard, added to the explanation as a
 * drawing (vectors, no image upload), with the description students who
 * cannot see it will hear.
 */
export function InsertBoardPage({
  boardRef,
  questionNumber,
  onInsert,
  label = 'Board page',
  tone = 'outline',
}: {
  boardRef: RefObject<WhiteboardHandle | null>
  questionNumber: number
  onInsert: (block: SketchBlock) => void
  label?: string
  tone?: 'outline' | 'ghost'
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(0)
  const [alt, setAlt] = useState('')
  const [caption, setCaption] = useState('')
  const [error, setError] = useState<string | null>(null)
  const altId = useId()

  function open() {
    const board = boardRef.current
    if (!board) {
      window.alert('The whiteboard is not ready yet. Open the Board & record tab once, then try again.')
      return
    }
    setPages(board.pages().length)
    setPage(board.currentPage())
    setAlt(`Board working for question ${questionNumber}`)
    setCaption('')
    setError(null)
    dialog.current?.showModal()
  }

  function insert() {
    const board = boardRef.current
    if (!board) return
    const target = board.pages()[page]
    if (!target || pageIsEmpty(target)) {
      setError('That board page is empty. Draw on it in the Board & record tab first.')
      return
    }
    if (!alt.trim()) {
      setError('Describe what the drawing shows, in a sentence.')
      return
    }
    try {
      const sketch = board.toSketch(page, alt)
      const withCaption: SketchBlock = caption.trim() ? { ...sketch, caption: caption.trim().slice(0, 2000) } : sketch
      const checked = sketchBlockSchema.safeParse(withCaption)
      if (!checked.success) throw new Error(checked.error.issues[0]?.message ?? 'That page could not be added.')
      onInsert(checked.data)
      dialog.current?.close()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'That page could not be added.')
    }
  }

  return (
    <>
      <button type="button" onClick={open} className={buttonClass(tone, 'sm')}>
        <span aria-hidden="true" className="text-ink-muted">
          <Scribble size={16} />
        </span>
        {label}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={`${altId}-title`}
        className="m-auto w-[min(520px,calc(100vw-2rem))] rounded-card border border-rule bg-surface p-0 text-ink backdrop:bg-ink/40"
      >
        <form
          method="dialog"
          onSubmit={(event) => {
            event.preventDefault()
            insert()
          }}
          className="flex flex-col gap-3 p-5"
        >
          <h2 id={`${altId}-title`} className="text-card font-medium">
            Add a board page to the explanation
          </h2>
          {pages > 1 ? (
            <label className="flex items-center gap-2 text-meta text-ink-muted">
              Page
              <select
                value={page}
                onChange={(event) => setPage(Number(event.target.value))}
                className="h-8 rounded-control border border-rule bg-surface px-2 text-meta text-ink"
              >
                {Array.from({ length: pages }, (_, index) => (
                  <option key={index} value={index}>
                    {index + 1}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label htmlFor={altId} className="text-meta text-ink-muted">
            What the drawing shows (read aloud to students who cannot see it)
          </label>
          <textarea
            id={altId}
            value={alt}
            onChange={(event) => setAlt(event.target.value)}
            rows={3}
            maxLength={2000}
            required
            className={`${INPUT} resize-y text-meta`}
          />
          <input
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            maxLength={2000}
            placeholder="Caption under the drawing (optional)"
            className={`${INPUT} py-1.5 text-meta`}
            aria-label="Caption"
          />
          <p className="text-micro text-ink-faint">
            The drawing is kept as lines, not a picture, so it stays sharp and costs no image upload. Very busy pages are
            simplified slightly to fit.
          </p>
          {error ? (
            <p className="flex items-start gap-2 text-meta text-incorrect">
              <Warning size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => dialog.current?.close()} className={buttonClass('ghost', 'md')}>
              Cancel
            </button>
            <button type="submit" className={buttonClass('primary', 'md')}>
              Add to explanation
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
