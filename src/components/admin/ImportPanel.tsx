'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { importPaperSchema, collectPublicIds } from '@/lib/blocks/schema'
import { BlockRenderer } from '@/components/blocks/BlockRenderer'

interface ImportResult {
  paperId: string
  setId: string
  subjectName: string
  examTypeName: string
  questionCount: number
  optionCount: number
  solutionCount: number
  uploadedAssets: string[]
  replacedExisting: boolean
  warnings: string[]
}

/**
 * Validates in the browser first so mistakes are caught before a round trip,
 * then commits through /api/import — which validates again server-side, because
 * client-side validation is a convenience, never a control.
 */
export function ImportPanel() {
  const [text, setText] = useState('')
  const [uploadImages, setUploadImages] = useState(false)
  const [publish, setPublish] = useState(true)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [serverError, setServerError] = useState<{ message: string; issues: string[] } | null>(
    null,
  )

  const parsed = useMemo(() => {
    if (!text.trim()) return null
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch (error) {
      return { ok: false as const, issues: [`Not valid JSON: ${(error as Error).message}`] }
    }

    const validated = importPaperSchema.safeParse(json)
    if (!validated.success) {
      return {
        ok: false as const,
        issues: validated.error.issues
          .slice(0, 12)
          .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
      }
    }
    return { ok: true as const, paper: validated.data }
  }, [text])

  const stats = useMemo(() => {
    if (!parsed?.ok) return null
    const paper = parsed.paper

    const blockCounts: Record<string, number> = {}
    const assets = new Set<string>()
    let videos = 0
    let missingKeys = 0

    for (const question of paper.questions) {
      for (const block of question.body) {
        blockCounts[block.type] = (blockCounts[block.type] ?? 0) + 1
      }
      for (const id of collectPublicIds(question.body)) assets.add(id)

      for (const option of question.options ?? []) {
        for (const block of option.content) {
          blockCounts[block.type] = (blockCounts[block.type] ?? 0) + 1
        }
      }

      if (question.solution?.video_url) videos += 1
      if (
        (question.type === 'mcq' || question.type === 'msq') &&
        !(question.options ?? []).some((option) => option.is_correct)
      ) {
        missingKeys += 1
      }
    }

    const total = Object.values(blockCounts).reduce((sum, n) => sum + n, 0)
    const images = blockCounts.image ?? 0

    return { blockCounts, assets: [...assets], videos, missingKeys, total, images }
  }, [parsed])

  async function commit() {
    if (!parsed?.ok) return
    setBusy(true)
    setResult(null)
    setServerError(null)

    try {
      const response = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paper: parsed.paper, uploadImages, publish }),
      })

      const body = await response.json()

      if (!response.ok) {
        setServerError({
          message: body.error ?? 'The import failed.',
          issues: body.issues ?? [],
        })
        return
      }

      setResult(body.result as ImportResult)
    } catch (error) {
      setServerError({ message: (error as Error).message, issues: [] })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          spellCheck={false}
          rows={26}
          placeholder='{ "schema_version": 1, "subject": "dbms", "exam_type": "quiz-1", "questions": [ ... ] }'
          className={`rounded-md border bg-surface px-3 py-2 font-mono text-xs text-ink outline-none ${
            parsed && !parsed.ok ? 'border-incorrect' : 'border-rule focus:border-accent'
          }`}
        />

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={publish}
              onChange={(event) => setPublish(event.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Publish immediately
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={uploadImages}
              onChange={(event) => setUploadImages(event.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Upload images with a source_url
          </label>
        </div>

        <div>
          <button
            type="button"
            onClick={commit}
            disabled={busy || !parsed?.ok}
            className="rounded-md bg-accent px-4 py-2 text-sm text-accent-ink hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? 'Importing…' : 'Import paper'}
          </button>
        </div>

        {parsed && !parsed.ok ? (
          <ul className="flex flex-col gap-1 rounded-md bg-incorrect-soft px-3 py-2 text-xs text-incorrect">
            {parsed.issues.map((issue, index) => (
              <li key={index} className="font-mono">
                {issue}
              </li>
            ))}
          </ul>
        ) : null}

        {serverError ? (
          <div className="rounded-md bg-incorrect-soft px-3 py-2 text-xs text-incorrect">
            <p>{serverError.message}</p>
            {serverError.issues.map((issue, index) => (
              <p key={index} className="mt-1 font-mono">
                {issue}
              </p>
            ))}
          </div>
        ) : null}

        {result ? (
          <div className="rounded-md border border-correct bg-correct-soft px-3 py-3 text-sm">
            <p className="text-ink">
              Imported {result.questionCount} question
              {result.questionCount === 1 ? '' : 's'} into {result.subjectName} ·{' '}
              {result.examTypeName}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              {result.optionCount} options, {result.solutionCount} solutions
              {result.replacedExisting ? ', replaced an existing set' : ''}
              {result.uploadedAssets.length
                ? `, uploaded ${result.uploadedAssets.length} image(s)`
                : ''}
            </p>
            {result.warnings.map((warning, index) => (
              <p key={index} className="mt-1 text-xs text-marked">
                {warning}
              </p>
            ))}
            <div className="mt-2 flex gap-3 text-xs">
              <Link
                href={`/admin/papers/${result.paperId}`}
                className="text-accent underline underline-offset-2"
              >
                Open the paper
              </Link>
              <Link
                href={`/practice/${result.setId}?mode=learning`}
                className="text-accent underline underline-offset-2"
              >
                Preview it
              </Link>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        {stats && parsed?.ok ? (
          <>
            <div className="rounded-lg border border-rule bg-surface p-4">
              <h3 className="text-sm text-ink">
                {parsed.paper.questions.length} questions ready
              </h3>
              <dl className="mt-3 flex flex-col gap-1.5 text-xs">
                <Row label="Subject" value={parsed.paper.subject} />
                <Row label="Exam type" value={parsed.paper.exam_type} />
                <Row label="Session" value={parsed.paper.session_date ?? 'undated'} />
                <Row label="Set" value={parsed.paper.set_code ?? '1'} />
                <Row
                  label="Structured blocks"
                  value={`${stats.total - stats.images} of ${stats.total}${
                    stats.total
                      ? ` (${Math.round(((stats.total - stats.images) / stats.total) * 100)}% not pictures)`
                      : ''
                  }`}
                />
                <Row label="Video solutions" value={String(stats.videos)} />
                {stats.assets.length ? (
                  <Row label="Cloudinary assets" value={String(stats.assets.length)} />
                ) : null}
              </dl>

              {stats.missingKeys > 0 ? (
                <p className="mt-3 rounded-md bg-marked-soft px-2.5 py-2 text-xs text-marked">
                  {stats.missingKeys} choice question
                  {stats.missingKeys === 1 ? ' has' : 's have'} no correct option marked. They
                  will import, but every attempt will mark them wrong until a key is set.
                </p>
              ) : null}
            </div>

            <div className="rounded-lg border border-rule bg-surface p-4">
              <h3 className="mb-3 text-sm text-ink">
                Preview — question {parsed.paper.questions[0].number}
              </h3>
              <BlockRenderer blocks={parsed.paper.questions[0].body} />
              {parsed.paper.questions[0].options?.length ? (
                <ul className="mt-3 flex flex-col gap-1.5">
                  {parsed.paper.questions[0].options.map((option) => (
                    <li
                      key={option.label}
                      className={`flex gap-2 rounded-md border px-2.5 py-1.5 text-sm ${
                        option.is_correct
                          ? 'border-correct bg-correct-soft'
                          : 'border-rule'
                      }`}
                    >
                      <span className="font-mono text-ink-muted">{option.label}</span>
                      <span className="min-w-0 flex-1">
                        <BlockRenderer blocks={option.content} context="option" />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-rule px-4 py-12 text-center text-sm text-ink-muted">
            Paste a paper to see it validated and previewed here.
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right font-mono text-ink">{value}</dd>
    </div>
  )
}
