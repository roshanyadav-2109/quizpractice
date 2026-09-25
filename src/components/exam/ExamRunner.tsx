'use client'

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { AnswerInput } from './AnswerInput'
import { ExamTimer } from './ExamTimer'
import { SolutionPanel } from '@/components/question/SolutionPanel'
import { DiscussionThread, countDiscussion } from '@/components/question/DiscussionPanel'
import { ReportButton } from '@/components/question/ReportButton'
import { gradeQuestion, isAnswered } from '@/lib/scoring'
import type { QuestionResult } from '@/lib/scoring'
import type { AnswerResponse, QuestionWithOptions, SolutionRow } from '@/types/db'
import { buttonClass } from '@/components/ui/primitives'
import { PaletteLegend, QuestionPalette } from './QuestionPalette'
import { PALETTE_LEGEND, PALETTE_ORDER, legendClasses, paletteStateFor, type PaletteState } from './palette-state'
import { useQuestionTiming } from './useQuestionTiming'
import { SignInLink } from '@/components/site/AuthDialog'
import { Trail } from '@/components/site/Page'
import {
  ArrowLeft,
  ArrowRight,
  BookmarkSimple,
  CaretRight,
  CaretUp,
  ChatCircleText,
  Check,
  CheckCircle,
  Info,
  SquaresFour,
  WarningCircle,
  X,
  XCircle,
} from '@/components/ui/icons'

export interface ExamRunnerProps {
  setId: string
  mode: 'exam' | 'learning'
  questions: QuestionWithOptions[]
  solutions: Record<string, SolutionRow[]>
  meta: {
    examTypeName: string
    subjectName: string
    subjectSlug: string
    /** "January 2026 term" — the term this sitting belongs to. */
    termLabel: string | null
    sessionLabel: string
    setCode: string
    totalMarks: number
    durationMinutes: number | null
  }
  isSignedIn: boolean
  /** Question number to open on — "Solution →" in a result lands here. */
  startAt?: number
}

interface GradeResponse {
  saved: boolean
  attemptId?: string
  score: number
  maxScore: number
  correctCount: number
  autoMarkedCount: number
  manualCount: number
  results: QuestionResult[]
}

const TYPE_LABEL: Record<QuestionWithOptions['type'], string> = {
  mcq: 'Single correct',
  msq: 'Multiple correct',
  numerical: 'Numerical answer',
  subjective: 'Written answer',
  programming: 'Programming',
}

/**
 * The exam runner: a full-viewport computer-based test.
 *
 * One question at a time, the palette on the right, the actions pinned under
 * the question — the layout of the real CBT, down to its labels, because an
 * unfamiliar exam interface costs students time they should be spending on
 * the paper.
 *
 * Learning mode is the same screen without the clock, and without giving the
 * answer away: the key stays hidden until Check answer, which marks the pick
 * right or wrong and opens the explanation under the options. The discussion
 * is a tab pinned under the palette that opens a panel from the right, so
 * nobody has to scroll past the question to find it.
 */
export function ExamRunner(props: ExamRunnerProps) {
  const { setId, mode, questions, solutions, meta, isSignedIn, startAt } = props
  const router = useRouter()
  const learning = mode === 'learning'
  // Learning mode keeps its own scratch answers: checking yourself against the
  // key must never leak into — or be restored from — a timed attempt.
  const storageKey = learning ? `qp:learning:${setId}` : `qp:attempt:${setId}`

  /**
   * In-progress answers survive a refresh — refreshing mid-paper is common and
   * losing twenty answers to it is unforgivable. The saved draft is read through
   * useSyncExternalStore so hydration uses the server snapshot and swaps in the
   * real value afterwards, with no mismatch and no cascading render. `edits`
   * takes over the moment the student changes anything.
   */
  const draftJson = useSyncExternalStore(subscribeToDraft, () => readDraft(storageKey), () => EMPTY_DRAFT)
  const draft = useMemo(() => parseDraft(draftJson), [draftJson])
  const [edits, setEdits] = useState<Draft | null>(null)

  const responses = edits?.responses ?? draft.responses
  const markedIds = edits?.marked ?? draft.marked
  const marked = useMemo(() => new Set(markedIds), [markedIds])

  const [graded, setGraded] = useState<GradeResponse | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [index, setIndex] = useState(() =>
    Math.max(0, questions.findIndex((q) => q.number === startAt)),
  )
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [discussionOpen, setDiscussionOpen] = useState(false)
  const [discussionCounts, setDiscussionCounts] = useState<Record<string, number>>({})
  // Learning mode keeps the key back until asked: the questions checked so far.
  const [checked, setChecked] = useState<Set<string>>(() => new Set())
  const elapsedRef = useRef(0)
  const scroller = useRef<HTMLDivElement>(null)
  const submitDialog = useRef<HTMLDialogElement>(null)
  const instructionsDialog = useRef<HTMLDialogElement>(null)

  const question = questions[index] ?? null
  const activeId = question?.id ?? null

  // NTA separates "never opened" from "opened and left", and that difference
  // is the whole point of the "not answered" state. A question counts as
  // visited the moment it is put on screen.
  const [visited, setVisited] = useState<Set<string>>(
    () => new Set(questions[index] ? [questions[index].id] : []),
  )
  const snapshotTimings = useQuestionTiming(activeId, graded !== null)

  useEffect(() => {
    if (graded || !edits) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(edits))
    } catch {
      // Not being able to persist is not worth interrupting the attempt.
    }
  }, [edits, storageKey, graded])

  const answersVisible = graded !== null || learning

  // The Discussion tab says how many comments there are, so a count is read
  // for each question as it comes on screen — never the threads themselves.
  useEffect(() => {
    if (!answersVisible || !activeId || discussionCounts[activeId] !== undefined) return
    let cancelled = false
    countDiscussion(activeId).then((count) => {
      if (!cancelled && count !== null) setDiscussionCounts((current) => ({ ...current, [activeId]: count }))
    })
    return () => {
      cancelled = true
    }
  }, [answersVisible, activeId, discussionCounts])

  // Escape closes the discussion panel.
  useEffect(() => {
    if (!discussionOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDiscussionOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [discussionOpen])

  const resultsById = useMemo(() => {
    if (!graded) return new Map<string, QuestionResult>()
    return new Map(graded.results.map((result) => [result.questionId, result]))
  }, [graded])

  const stateFor = useCallback(
    (questionId: string): PaletteState =>
      paletteStateFor({
        answered: isAnswered(responses[questionId]),
        visited: visited.has(questionId),
        marked: marked.has(questionId),
      }),
    [responses, visited, marked],
  )

  const verdictFor = useCallback(
    (questionId: string): 'correct' | 'incorrect' | null => {
      const result = resultsById.get(questionId)
      if (result?.autoMarked) return result.isCorrect ? 'correct' : 'incorrect'
      // A question checked in learning mode shows its verdict on the palette too.
      if (learning && checked.has(questionId) && isAnswered(responses[questionId])) {
        const target = questions.find((q) => q.id === questionId)
        const own = target ? gradeQuestion(target, responses[questionId]) : null
        if (own?.autoMarked) return own.isCorrect ? 'correct' : 'incorrect'
      }
      return null
    },
    [resultsById, learning, checked, responses, questions],
  )

  function goTo(next: number) {
    const target = questions[next]
    if (!target) return
    setIndex(next)
    setVisited((current) => (current.has(target.id) ? current : new Set(current).add(target.id)))
    setDrawerOpen(false)
    scroller.current?.scrollTo({ top: 0 })
  }

  const jumpTo = (questionId: string) => goTo(questions.findIndex((q) => q.id === questionId))

  function checkAnswer(questionId: string) {
    setChecked((current) => new Set(current).add(questionId))
  }

  /** Puts a checked question back as it was: unanswered and unmarked. */
  function tryAgain(questionId: string) {
    setChecked((current) => {
      const next = new Set(current)
      next.delete(questionId)
      return next
    })
    clearResponse(questionId)
  }

  // ← and → step between questions, as Previous and Next do.
  const step = useEffectEvent((by: number) => goTo(index + by))
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented) return
      // Never while typing — an answer, a number, code, a comment — or while a
      // dialog is up. On an option the arrows move the question instead of
      // quietly changing the chosen answer, as a browser would by default.
      const target = event.target as HTMLElement | null
      if (target?.closest('textarea, select, [contenteditable="true"], [role="combobox"]')) return
      if (target instanceof HTMLInputElement && target.type !== 'radio' && target.type !== 'checkbox') return
      if (document.querySelector('dialog[open]')) return
      event.preventDefault()
      step(event.key === 'ArrowRight' ? 1 : -1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const setResponse = useCallback(
    (questionId: string, response: AnswerResponse) => {
      setEdits((current) => {
        const base = current ?? draft
        return { ...base, responses: { ...base.responses, [questionId]: response } }
      })
    },
    [draft],
  )

  function toggleMarked(questionId: string) {
    setEdits((current) => {
      const base = current ?? draft
      const next = base.marked.includes(questionId)
        ? base.marked.filter((id) => id !== questionId)
        : [...base.marked, questionId]
      return { ...base, marked: next }
    })
  }

  function clearResponse(questionId: string) {
    setEdits((current) => {
      const base = current ?? draft
      const next = { ...base.responses }
      delete next[questionId]
      return { ...base, responses: next }
    })
  }

  async function submit() {
    setSubmitting(true)
    setError(null)

    try {
      const response = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setId,
          mode,
          responses,
          durationSeconds: elapsedRef.current,
          timings: snapshotTimings(),
        }),
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'Could not mark this attempt.')
      }

      const result = (await response.json()) as GradeResponse
      try {
        localStorage.removeItem(storageKey)
      } catch {
        // Nothing to clean up if storage is unavailable.
      }
      submitDialog.current?.close()

      // A saved attempt has a full analysis page; that is where to land.
      if (result.attemptId) {
        router.push(`/result/${result.attemptId}`)
        return
      }
      setGraded(result)
      goTo(0)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not mark this attempt.')
      submitDialog.current?.close()
    } finally {
      setSubmitting(false)
    }
  }

  function reset() {
    if (!window.confirm('Clear every answer and start this paper again?')) return
    setEdits({ responses: {}, marked: [] })
    setGraded(null)
    setError(null)
    try {
      localStorage.removeItem(storageKey)
    } catch {
      // Ignored.
    }
    goTo(0)
  }

  const counts = questions.reduce<Record<PaletteState, number>>(
    (tally, q) => {
      tally[stateFor(q.id)] += 1
      return tally
    },
    { not_visited: 0, visited: 0, answered: 0, review: 0, answered_review: 0 },
  )

  if (!question) {
    return (
      <div className="flex h-dvh items-center justify-center p-6 text-ui text-ink-muted">
        This paper has no questions yet.
      </div>
    )
  }

  const result = resultsById.get(question.id) ?? null
  const showAnswers = answersVisible
  const isMarked = marked.has(question.id)
  const answered = isAnswered(responses[question.id])
  // What the options show. In learning mode nothing, until Check answer: then
  // the pick is marked right or wrong — or, with nothing picked, the key is
  // simply shown, unjudged.
  const checkedHere = learning && checked.has(question.id)
  const revealed = graded !== null || checkedHere
  const shownResult = graded
    ? (result ?? learningModeResult(question))
    : checkedHere
      ? answered
        ? gradeQuestion(question, responses[question.id])
        : learningModeResult(question)
      : null
  const verdict = graded ? result : checkedHere && answered ? shownResult : null
  const last = index === questions.length - 1
  const negative = Number(question.negative_marks)

  const palettePane = (
    <PalettePane
      questions={questions}
      stateFor={stateFor}
      verdictFor={verdictFor}
      activeId={question.id}
      onJump={jumpTo}
      discussion={
        showAnswers
          ? {
              count: discussionCounts[question.id],
              open: discussionOpen,
              onToggle: () => {
                // From the phone's palette sheet, the sheet makes way first.
                setDrawerOpen(false)
                setDiscussionOpen((open) => !open)
              },
            }
          : undefined
      }
      footer={
        graded ? (
          <div className="flex flex-col gap-2">
            <Link href={`/practice/${setId}?mode=learning`} className={buttonClass('primary', 'lg', 'w-full')}>
              Review with solutions
            </Link>
            <button type="button" onClick={reset} className={buttonClass('outline', 'lg', 'w-full')}>
              Try again
            </button>
          </div>
        ) : learning ? null : (
          <div className="flex flex-col gap-2">
            {error ? (
              <p className="flex items-start gap-2 rounded-control bg-incorrect-soft px-3 py-2 text-meta text-incorrect">
                <WarningCircle size={16} className="mt-0.5 shrink-0" />
                {error}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => submitDialog.current?.showModal()}
              disabled={submitting}
              className={buttonClass('primary', 'lg', 'w-full')}
            >
              Submit paper
            </button>
          </div>
        )
      }
    />
  )

  return (
    <div className="flex h-dvh flex-col bg-surface">
      {/* Header: the paper, the mode, and the clock. */}
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-rule px-3 sm:px-5">
        <Link
          href={`/paper/${setId}`}
          aria-label="Leave the paper"
          title="Leave the paper — your answers stay saved on this device"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-ink hover:bg-surface-2"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-ui font-medium text-ink">
            <Trail
              parts={[
                meta.subjectName,
                <span key="exam" className="font-normal text-ink-muted">
                  {meta.examTypeName}
                </span>,
              ]}
            />
          </p>
          <p className="truncate text-meta text-ink-faint tabular-nums">
            <Trail
              parts={[meta.termLabel, meta.sessionLabel, `Set ${meta.setCode}`].filter(
                (part): part is string => Boolean(part),
              )}
            />
          </p>
        </div>

        <ModeSwitch setId={setId} mode={mode} className="hidden md:flex" />

        {learning ? (
          <span className="rounded-control bg-surface-2 px-3 py-2 text-meta text-ink-muted md:hidden">
            Learning mode
          </span>
        ) : (
          <ExamTimer countdownFrom={meta.durationMinutes} frozen={graded !== null} elapsedRef={elapsedRef} />
        )}

        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open the question palette"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-rule text-ink lg:hidden"
        >
          <SquaresFour size={18} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* The question. */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-4xl px-4 py-5 sm:px-8 sm:py-6">
              {graded ? <GradedBanner graded={graded} isSignedIn={isSignedIn} /> : null}

              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h1 className="text-card font-medium text-ink tabular-nums">
                  Question {question.number}
                </h1>
                <span className="rounded-md bg-correct-soft px-2 py-0.5 text-meta text-correct tabular-nums">
                  +{Number(question.marks)}
                </span>
                <span className="rounded-md bg-incorrect-soft px-2 py-0.5 text-meta text-incorrect tabular-nums">
                  −{negative}
                </span>
                <span className="text-meta text-ink-faint">{TYPE_LABEL[question.type]}</span>

                {verdict?.autoMarked ? (
                  <span
                    className={`flex items-center gap-1.5 text-meta ${
                      verdict.isCorrect ? 'text-correct' : 'text-incorrect'
                    }`}
                  >
                    {verdict.isCorrect ? <CheckCircle size={16} weight="fill" /> : <XCircle size={16} weight="fill" />}
                    {verdict.isCorrect ? 'Correct' : 'Incorrect'} · {verdict.marksAwarded > 0 ? '+' : ''}
                    {verdict.marksAwarded}
                  </span>
                ) : null}

                <button
                  type="button"
                  onClick={() => instructionsDialog.current?.showModal()}
                  className="ml-auto inline-flex items-center gap-1.5 text-meta text-ink-muted hover:text-ink"
                >
                  <Info size={16} aria-hidden="true" />
                  Instructions
                </button>
              </div>

              <div className="paper mt-5 text-ink">
                <BlockRenderer blocks={question.body} />
              </div>

              <AnswerInput
                question={question}
                response={responses[question.id] ?? null}
                result={shownResult}
                disabled={revealed}
                onChange={(response) => setResponse(question.id, response)}
              />

              {learning && !graded ? (
                <div className="mt-5">
                  {checkedHere ? (
                    <button type="button" onClick={() => tryAgain(question.id)} className={buttonClass('outline', 'md')}>
                      Try again
                    </button>
                  ) : (
                    <button type="button" onClick={() => checkAnswer(question.id)} className={buttonClass('primary', 'md')}>
                      {answered ? 'Check answer' : 'Show answer'}
                    </button>
                  )}
                </div>
              ) : null}

              {revealed ? (
                <>
                  <div className="mt-6">
                    {learning ? (
                      <SolutionPanel solutions={solutions[question.id] ?? []} />
                    ) : (
                      // Exam mode never loads solutions; point at learning mode
                      // rather than claim there are none.
                      <Link
                        href={`/practice/${setId}?mode=learning&q=${question.number}`}
                        className="text-ui text-accent hover:underline"
                      >
                        See the explanation in learning mode
                      </Link>
                    )}
                  </div>

                  {learning && question.topics.length > 0 ? (
                    <div className="mt-6">
                      <p className="label mb-2">Related topics</p>
                      <div className="flex flex-wrap gap-2">
                        {question.topics.map((topic) => (
                          <Link
                            key={topic}
                            href={`/search?q=${encodeURIComponent(topic)}`}
                            className="inline-flex h-8 items-center rounded-control border border-rule bg-surface px-3 text-meta text-ink-muted transition-colors hover:border-rule-strong hover:text-ink"
                          >
                            {topic}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>

          {/* The CBT action bar, pinned under the question. We save as you go,
              so "Save & Next" advances — but the label is what students' hands
              expect. */}
          <div className="shrink-0 border-t border-rule bg-surface px-3 py-3 sm:px-5">
            <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2">
              <ReportButton questionId={question.id} isSignedIn={isSignedIn} />
              {!graded && !learning ? (
                <button
                  type="button"
                  onClick={() => {
                    toggleMarked(question.id)
                    if (!last) goTo(index + 1)
                  }}
                  className={buttonClass('outline', 'md', isMarked ? '!border-pal-marked !bg-pal-marked/25' : '')}
                >
                  <BookmarkSimple size={16} weight={isMarked ? 'fill' : 'regular'} aria-hidden="true" />
                  <span className="hidden sm:inline">{isMarked ? 'Unmark' : 'Mark for Review'} &amp; Next</span>
                  <span className="sm:hidden">{isMarked ? 'Unmark' : 'Mark'}</span>
                </button>
              ) : null}
              {!graded ? (
                <button
                  type="button"
                  onClick={() => (checkedHere ? tryAgain(question.id) : clearResponse(question.id))}
                  disabled={!answered}
                  className={buttonClass('ghost', 'md')}
                >
                  <span>
                    Clear<span className="hidden sm:inline"> Response</span>
                  </span>
                </button>
              ) : null}

              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => goTo(index - 1)}
                  disabled={index === 0}
                  className={buttonClass('outline', 'md')}
                  aria-label="Previous question"
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                  <span className="hidden sm:inline">Previous</span>
                </button>
                <button
                  type="button"
                  onClick={() => (last ? (graded || learning ? null : submitDialog.current?.showModal()) : goTo(index + 1))}
                  disabled={last && (graded !== null || learning)}
                  className={buttonClass('primary', 'md')}
                >
                  {graded || learning ? 'Next' : last ? 'Save & Submit' : 'Save & Next'}
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </main>

        {/* The palette pane, from `lg` up. */}
        <aside className="hidden w-[21.25rem] shrink-0 border-l border-rule lg:block">{palettePane}</aside>
      </div>

      {/* The question's discussion, from the right. From `lg` it takes exactly
          the palette's column, so the question stays whole beside it; narrower
          screens get a veil to tap away, and a phone gives it the screen. */}
      {showAnswers && discussionOpen ? (
        <button
          type="button"
          aria-label="Close the discussion"
          onClick={() => setDiscussionOpen(false)}
          className="fixed inset-x-0 top-16 bottom-0 z-30 bg-ink/10 lg:hidden"
        />
      ) : null}
      {showAnswers ? (
        <aside
          id="discussion-panel"
          aria-label={`Discussion on question ${question.number}`}
          inert={!discussionOpen}
          className={`fixed top-16 right-0 bottom-0 z-40 flex w-full flex-col border-l border-rule bg-surface transition-transform duration-200 ease-out sm:w-[26.25rem] lg:w-[21.25rem] ${
            discussionOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-3">
            <h2 className="text-ui text-ink">Discussion</h2>
            <button
              type="button"
              onClick={() => setDiscussionOpen(false)}
              aria-label="Close the discussion"
              className="flex h-10 w-10 items-center justify-center rounded-control text-ink-muted hover:bg-surface-2 hover:text-ink"
            >
              <X size={18} />
            </button>
          </div>
          {discussionOpen ? (
            <DiscussionThread
              key={question.id}
              questionId={question.id}
              isSignedIn={isSignedIn}
              onCount={(count) => setDiscussionCounts((current) => ({ ...current, [question.id]: count }))}
            />
          ) : null}
        </aside>
      ) : null}

      {/* Below `lg` the same pane is a bottom sheet. */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Question palette">
          <button
            type="button"
            aria-label="Close the palette"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-ink/40"
          />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-card bg-surface">
            <div className="flex items-center justify-between gap-3 border-b border-rule px-4 py-3">
              <ModeSwitch setId={setId} mode={mode} className="flex" />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close"
                className="flex h-11 w-11 items-center justify-center rounded-control text-ink-muted hover:bg-surface-2"
              >
                <X size={20} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{palettePane}</div>
          </div>
        </div>
      ) : null}

      {/* Submit: the CBT's own summary, then a deliberate confirm. */}
      <dialog
        ref={submitDialog}
        aria-labelledby="submit-title"
        className="m-auto w-[min(480px,calc(100vw-2rem))] rounded-card border border-rule bg-surface p-0 text-ink backdrop:bg-ink/40"
      >
        <div className="px-5 pt-5 pb-4">
          <h2 id="submit-title" className="text-card font-medium">
            Submit this paper?
          </h2>
          <p className="mt-1 text-ui text-ink-muted">
            You cannot change your answers after submitting.
          </p>
          <dl className="mt-4 flex flex-col gap-2">
            {PALETTE_ORDER.map((state) => (
              <div key={state} className="flex items-center justify-between gap-3 text-ui">
                <dt className="text-ink-muted">{PALETTE_LEGEND[state]}</dt>
                <dd className="tabular-nums">{counts[state]}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="flex justify-end gap-2 border-t border-rule px-5 py-4">
          <button type="button" onClick={() => submitDialog.current?.close()} className={buttonClass('outline', 'md')}>
            Keep going
          </button>
          <button type="button" onClick={submit} disabled={submitting} className={buttonClass('primary', 'md')}>
            {submitting ? 'Marking…' : 'Submit paper'}
          </button>
        </div>
      </dialog>

      <dialog
        ref={instructionsDialog}
        aria-labelledby="instructions-title"
        className="m-auto w-[min(560px,calc(100vw-2rem))] rounded-card border border-rule bg-surface p-0 text-ink backdrop:bg-ink/40"
      >
        <div className="flex items-center justify-between gap-3 border-b border-rule px-5 py-4">
          <h2 id="instructions-title" className="text-card font-medium">
            Instructions
          </h2>
          <button
            type="button"
            onClick={() => instructionsDialog.current?.close()}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-control text-ink-muted hover:bg-surface-2"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4">
          <p className="text-ui text-ink-muted">
            The palette shows the status of every question. Pick a number to go straight to it.
          </p>
          <div className="mt-4">
            <PaletteLegend questions={questions} stateFor={stateFor} />
          </div>
          <ul className="mt-5 flex list-disc flex-col gap-1.5 pl-5 text-ui text-ink-muted">
            <li>Save &amp; Next moves to the next question. Answers are saved as you go.</li>
            <li>Mark for Review &amp; Next flags the question to come back to. A flagged answer still counts.</li>
            <li>Clear Response removes your answer to the question on screen.</li>
            <li>The ← and → keys move to the previous and next question.</li>
          </ul>
        </div>
      </dialog>
    </div>
  )
}

/** Exam and learning mode, as a two-way switch. */
function ModeSwitch({
  setId,
  mode,
  className = '',
}: {
  setId: string
  mode: 'exam' | 'learning'
  className?: string
}) {
  const item = (active: boolean) =>
    `flex h-9 items-center rounded-[8px] border px-3 text-meta transition-colors ${
      active ? 'border-rule bg-surface text-ink' : 'border-transparent text-ink-muted hover:text-ink'
    }`
  return (
    <nav aria-label="Mode" className={`${className} items-center gap-0.5 rounded-control bg-surface-2 p-0.5`}>
      <Link href={`/practice/${setId}`} aria-current={mode === 'exam' ? 'page' : undefined} className={item(mode === 'exam')}>
        Exam
      </Link>
      <Link
        href={`/practice/${setId}?mode=learning`}
        aria-current={mode === 'learning' ? 'page' : undefined}
        className={item(mode === 'learning')}
      >
        Learning
      </Link>
    </nav>
  )
}

/**
 * The palette pane: the question palette, and pinned under it the legend and
 * the discussion. The paper's name and details are already in the header.
 */
function PalettePane({
  questions,
  stateFor,
  verdictFor,
  activeId,
  onJump,
  discussion,
  footer,
}: {
  questions: QuestionWithOptions[]
  stateFor: (id: string) => PaletteState
  verdictFor: (id: string) => 'correct' | 'incorrect' | null
  activeId: string
  onJump: (id: string) => void
  /** The Discussion tab, when answers are showing. */
  discussion?: { count: number | undefined; open: boolean; onToggle: () => void }
  footer: React.ReactNode
}) {
  const [legendOpen, setLegendOpen] = useState(false)
  const legendId = useId()
  const counts = questions.reduce<Record<PaletteState, number>>(
    (tally, q) => {
      tally[stateFor(q.id)] += 1
      return tally
    },
    { not_visited: 0, visited: 0, answered: 0, review: 0, answered_review: 0 },
  )

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <p className="mb-3 text-meta text-ink-muted">Choose a question</p>
        <VerdictAwarePalette
          questions={questions}
          stateFor={stateFor}
          verdictFor={verdictFor}
          activeId={activeId}
          onJump={onJump}
        />
      </div>

      {/* Pinned under the palette, so neither has to be scrolled to: the
          legend, folded to its two main counts and opening upward, and the
          question's discussion last. */}
      <div className="relative shrink-0 border-t border-rule">
        <div
          id={legendId}
          inert={!legendOpen}
          className={`absolute inset-x-0 bottom-full z-10 border-t border-rule bg-surface px-5 py-4 transition duration-150 ease-out ${
            legendOpen ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0'
          }`}
        >
          <PaletteLegend questions={questions} stateFor={stateFor} />
        </div>

        <button
          type="button"
          onClick={() => setLegendOpen((open) => !open)}
          aria-expanded={legendOpen}
          aria-controls={legendId}
          aria-label={`${PALETTE_LEGEND.answered} ${counts.answered}, ${PALETTE_LEGEND.visited} ${counts.visited}. ${
            legendOpen ? 'Hide' : 'Show'
          } every status`}
          className="flex w-full items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-surface-2"
        >
          {(['answered', 'visited'] as const).map((state) => {
            const { disc, tick } = legendClasses(state)
            return (
              <span key={state} className="flex items-center gap-2 text-meta text-ink-muted">
                <span aria-hidden className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${disc}`}>
                  <Check size={11} weight="bold" className={tick} />
                </span>
                {PALETTE_LEGEND[state]}
              </span>
            )
          })}
          <CaretUp
            size={16}
            aria-hidden="true"
            className={`ml-auto shrink-0 text-ink-muted transition-transform ${legendOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {discussion ? (
          <button
            type="button"
            onClick={discussion.onToggle}
            aria-expanded={discussion.open}
            aria-controls="discussion-panel"
            className="flex w-full items-center gap-2 border-t border-rule px-5 py-3 text-left text-meta text-ink-muted transition-colors hover:bg-surface-2"
          >
            <ChatCircleText size={18} aria-hidden="true" className="shrink-0" />
            Discussion
            {/* A badge, as for notifications — and, like one, only when
                there is something there. */}
            {discussion.count ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-incorrect px-1.5 text-[0.75rem] leading-none text-white tabular-nums">
                {discussion.count > 99 ? '99+' : discussion.count}
              </span>
            ) : null}
            <CaretRight size={16} aria-hidden="true" className="ml-auto shrink-0 text-ink-muted" />
          </button>
        ) : null}
      </div>

      {footer ? <div className="shrink-0 border-t border-rule px-5 py-4">{footer}</div> : null}
    </div>
  )
}

/**
 * After marking, a box shows the verdict — green right, red wrong — instead of
 * the working state; before it, the palette is exactly the CBT's.
 */
function VerdictAwarePalette({
  questions,
  stateFor,
  verdictFor,
  activeId,
  onJump,
}: {
  questions: QuestionWithOptions[]
  stateFor: (id: string) => PaletteState
  verdictFor: (id: string) => 'correct' | 'incorrect' | null
  activeId: string
  onJump: (id: string) => void
}) {
  const anyVerdict = questions.some((q) => verdictFor(q.id) !== null)
  if (!anyVerdict) {
    return <QuestionPalette questions={questions} stateFor={stateFor} activeId={activeId} onJump={onJump} />
  }
  return (
    <ol className="grid grid-cols-5 gap-2.5">
      {questions.map((q) => {
        const verdict = verdictFor(q.id)
        const active = q.id === activeId
        return (
          <li key={q.id}>
            <button
              type="button"
              onClick={() => onJump(q.id)}
              aria-current={active ? 'step' : undefined}
              aria-label={`Question ${q.number}, ${verdict ?? 'not auto-marked'}`}
              className={`flex h-11 w-full items-center justify-center rounded-control border text-ui  tabular-nums ${
                verdict === 'correct'
                  ? 'border-correct bg-correct text-white'
                  : verdict === 'incorrect'
                    ? 'border-incorrect bg-incorrect text-white'
                    : 'border-rule-strong bg-surface text-ink'
              } ${active ? 'ring-2 ring-pal-current ring-offset-2 ring-offset-surface' : ''}`}
            >
              {q.number}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/** After an unsaved (signed-out) attempt: the score, and where to go next. */
function GradedBanner({ graded, isSignedIn }: { graded: GradeResponse; isSignedIn: boolean }) {
  const percentage = graded.maxScore > 0 ? Math.round((graded.score / graded.maxScore) * 100) : 0
  return (
    <div className="mb-6 rounded-card border border-rule bg-surface-2 px-5 py-4">
      <p className="label">Your score</p>
      <p className="mt-1 text-[1.75rem] leading-tight font-medium text-ink tabular-nums">
        {graded.score}
        <span className="text-card font-normal text-ink-faint"> / {graded.maxScore}</span>
        <span className="ml-3 text-card text-ink-muted">{percentage}%</span>
      </p>
      <p className="mt-1 text-ui text-ink-muted tabular-nums">
        {graded.correctCount} correct of {graded.autoMarkedCount} marked automatically
        {graded.manualCount > 0 ? ` · ${graded.manualCount} written, compare with the solution` : ''}
      </p>
      {!isSignedIn ? (
        <p className="mt-2 text-ui text-ink-muted">
          <SignInLink />{' '}
          to save attempts and see the full analysis.
        </p>
      ) : null}
    </div>
  )
}

/**
 * In learning mode nothing has been submitted, but the answer key should still
 * show. Build the same shape the marker produces, without a verdict.
 */
function learningModeResult(question: QuestionWithOptions): QuestionResult {
  return {
    questionId: question.id,
    isCorrect: null,
    marksAwarded: 0,
    autoMarked: false,
    correctOptionIds: question.options.filter((o) => o.is_correct).map((o) => o.id),
    correctAnswer: question.correct_answer,
  }
}

// ---------------------------------------------------------------------------
// Saved draft
// ---------------------------------------------------------------------------

interface Draft {
  responses: Record<string, AnswerResponse>
  marked: string[]
}

const EMPTY_DRAFT = '{}'

function subscribeToDraft(onChange: () => void) {
  // Cross-tab only; `storage` does not fire in the tab that wrote the value,
  // which is what stops this from looping against our own save effect.
  window.addEventListener('storage', onChange)
  return () => window.removeEventListener('storage', onChange)
}

function readDraft(storageKey: string): string {
  try {
    return localStorage.getItem(storageKey) ?? EMPTY_DRAFT
  } catch {
    return EMPTY_DRAFT
  }
}

function parseDraft(json: string): Draft {
  try {
    const parsed = JSON.parse(json) as Partial<Draft>
    return { responses: parsed.responses ?? {}, marked: parsed.marked ?? [] }
  } catch {
    return { responses: {}, marked: [] }
  }
}
