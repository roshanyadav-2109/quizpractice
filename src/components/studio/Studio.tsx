'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type RefObject } from 'react'
import { Whiteboard, type WhiteboardHandle } from '@/components/board/Whiteboard'
import { BackLink } from '@/components/site/BackLink'
import { Trail } from '@/components/site/Page'
import {
  ArrowLeft,
  Article,
  BookOpenText,
  CheckCircle,
  CornersIn,
  CornersOut,
  PushPin,
  Question,
  VideoCamera,
  Warning,
} from '@/components/ui/icons'
import { buttonClass } from '@/components/ui/primitives'
import { blocksToText, type Block, type CloudinaryRef, type SketchBlock } from '@/lib/blocks/schema'
import { formatSession } from '@/lib/format'
import { ChunkStore } from '@/lib/studio/chunk-store'
import { recordingFilename, videoDescription, videoTitle, type RecordingPlace } from '@/lib/studio/filename'
import type { Take } from '@/lib/studio/recorder'
import {
  EXPLANATION_STATE_LABELS,
  ROUTES,
  explanationState,
  optionOrderVaries,
  type ClaimResult,
  type GroupExplanation,
  type GroupMember,
  type SaveExplanationResult,
} from '@/lib/teach/contracts'
import { parseYouTubeUrl, youTubeEmbedUrl } from '@/lib/youtube/url'
import type { ModerationStatus, QuestionWithOptions } from '@/types/db'
import {
  claimAction,
  releaseAction,
  reportAnswerKeyAction,
  saveExplanationAction,
} from '@/app/teach/q/[questionId]/actions'
import { ExplanationEditor, InsertBoardPage, newItemKey, prepareBlocks, type EditorItem } from './ExplanationEditor'
import { LinkVideoField, type VideoChange } from './LinkVideoField'
import { MinWidthNotice } from './MinWidthNotice'
import { RecordPanel, type RecordPhase } from './RecordPanel'
import { ReferencePane } from './ReferencePane'
import { ReviewPanel } from './ReviewPanel'
import { UploadPanel } from './UploadPanel'

/** Where the question sits in the catalogue. */
export interface StudioPlace {
  questionId: string
  setId: string
  paperId: string | null
  setCode: string
  number: number
  sessionDate: string | null
  examName: string
  subjectName: string
  /** Null when the paper is not readable (a draft): the queue link falls back to the desk. */
  subjectSlug: string | null
  programName: string
  levelName: string | null
  /** The paper on the site, for the video's description. */
  paperUrl: string
}

/** Who holds the question's group, as the page found it. */
export interface StudioClaim {
  holderName: string | null
  expiresAt: string
  mine: boolean
}

export interface StudioViewer {
  id: string
  name: string
  isAdmin: boolean
  /** Publishes without review: trusted teachers and admins. */
  trusted: boolean
}

/** An open report that the answer key is wrong. */
export interface AnswerKeyReport {
  id: string
  createdAt: string
  description: string
  mine: boolean
}

export interface StudioProps {
  question: QuestionWithOptions
  place: StudioPlace
  members: GroupMember[]
  explanations: GroupExplanation[]
  claim: StudioClaim | null
  reports: AnswerKeyReport[]
  apiUploads: boolean
  viewer: StudioViewer
}

/** The explanation in the editor, as last saved. */
interface Target {
  /** Null until the first save. */
  solutionId: string | null
  /** The viewer's own (or a new one). False: an admin editing someone else's. */
  mine: boolean
  authorName: string | null
  status: ModerationStatus | null
  submittedAt: string | null
  reviewNote: string | null
  videoUrl: string | null
  /** The body as saved, to tell whether there are changes. */
  savedJson: string
}

type Tab = 'write' | 'board'

/** Renew the hold this often while the teacher is working. */
const HEARTBEAT_MS = 15 * 60_000

/** The viewer's own explanation in the group: for this question first, then any copy's. */
function ownExplanation(explanations: GroupExplanation[], questionId: string): GroupExplanation | null {
  const mine = explanations.filter((explanation) => explanation.isMine && explanation.kind === 'authored')
  return (
    mine.find((explanation) => explanation.questionId === questionId) ??
    mine.find((explanation) => explanation.questionId !== null) ??
    mine[0] ??
    null
  )
}

function targetOf(explanation: GroupExplanation | null, mine: boolean): Target {
  return {
    solutionId: explanation?.id ?? null,
    mine,
    authorName: mine ? null : (explanation?.authorName ?? null),
    status: explanation?.status ?? null,
    submittedAt: explanation?.submittedAt ?? null,
    reviewNote: explanation?.reviewNote ?? null,
    videoUrl: explanation?.videoUrl ?? null,
    savedJson: JSON.stringify(explanation?.body ?? []),
  }
}

function itemsOf(blocks: Block[], prefix: string): EditorItem[] {
  return blocks.map((block, index) => ({ key: `${prefix}-${index}`, block }))
}

function claimFrom(result: ClaimResult, fallback: StudioClaim | null): StudioClaim | null {
  // No expiry means the request itself failed: keep what is shown.
  if (!result.expiresAt) return fallback
  return { holderName: result.holderName, expiresAt: result.expiresAt, mine: result.ok }
}

/** Every figure in the question and its options, for pinning onto the board. */
function questionFigures(question: QuestionWithOptions): { image: CloudinaryRef; alt: string }[] {
  const figures: { image: CloudinaryRef; alt: string }[] = []
  const collect = (blocks: Block[], where: string) => {
    for (const block of blocks) {
      if (block.type === 'image' && block.image.source_url === undefined) figures.push({ image: block.image, alt: `${where}: ${block.alt}` })
    }
  }
  collect(question.body, 'Question')
  for (const option of question.options) collect(option.content, `Option ${option.label}`)
  return figures
}

async function forgetTake(recordingId: string | null): Promise<void> {
  if (!recordingId) return
  const store = await ChunkStore.open()
  await store?.remove(recordingId)
}

/**
 * The explanation studio. One question, full viewport:
 *
 *   top bar   back to the queue, where the question is from, save state
 *   left      the question with its answer key (ReferencePane)
 *   centre    Write — the written explanation and the video link
 *             Board & record — the whiteboard, the recorder, review, upload
 *
 * From 1024 px the question sits beside the work; from 768 px (an iPad
 * upright) it stacks above it; narrower screens get MinWidthNotice.
 *
 * The page arrives read-only. The first real work — an edit, a stroke on the
 * board, a recording, a save — holds the question for this teacher, and
 * while they keep working the hold is renewed every quarter of an hour.
 */
export function Studio({
  question,
  place,
  members,
  explanations,
  claim: initialClaim,
  reports: initialReports,
  apiUploads,
  viewer,
}: StudioProps) {
  const boardRef = useRef<WhiteboardHandle>(null)
  const boardPanel = useRef<HTMLElement>(null)
  const [cardReady, setCardReady] = useState(false)
  const onCardReady = useCallback(() => setCardReady(true), [])
  const [fullBoard, setFullBoard] = useState(false)

  // Full screen: the browser's own where it has one (desktop, iPad), and a
  // panel filling the window everywhere, so the board grows either way.
  // Leaving the browser's full screen (Esc) leaves the studio's too.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFullBoard(false)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  function toggleFullBoard() {
    const next = !fullBoard
    setFullBoard(next)
    const panel = boardPanel.current
    if (next && panel && typeof panel.requestFullscreen === 'function' && !document.fullscreenElement) {
      panel.requestFullscreen().catch(() => {
        // Refused (an iPhone, an embedded frame): the window-filling panel stands in.
      })
    } else if (!next && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {})
    }
  }
  const [tab, setTab] = useState<Tab>('write')
  const [paneOpen, setPaneOpen] = useState(true)

  // The explanation in the editor.
  const [group, setGroup] = useState(explanations)
  const [initialOwn] = useState(() => ownExplanation(explanations, question.id))
  const [target, setTarget] = useState<Target>(() => targetOf(initialOwn, true))
  const [items, setItems] = useState<EditorItem[]>(() => itemsOf(initialOwn?.body ?? [], initialOwn?.id ?? 'new'))
  /** The viewer's own work, put aside while an admin edits someone else's. */
  const [stash, setStash] = useState<{ target: Target; items: EditorItem[] } | null>(null)
  const [saving, setSaving] = useState<'draft' | 'submit' | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Recording.
  const [phase, setPhase] = useState<RecordPhase>('idle')
  const [take, setTake] = useState<Take | null>(null)
  /** YouTube has the take: it can go without asking. */
  const [takeSaved, setTakeSaved] = useState(false)
  const [boardNotice, setBoardNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  // The hold on the question's group.
  const [claim, setClaim] = useState(initialClaim)
  const [claimBusy, setClaimBusy] = useState(false)
  /** The teacher let the question go in this visit: it is not taken again until a reload. */
  const [releasedNow, setReleasedNow] = useState(false)
  const claimRef = useRef(initialClaim)
  const claimAsked = useRef(false)
  const released = useRef(false)
  const lastActivity = useRef(0)
  const lastRenewal = useRef(0)

  const [reports, setReports] = useState(initialReports)

  const json = useMemo(() => JSON.stringify(items.map((item) => item.block)), [items])
  const dirty = json !== target.savedJson
  const state = target.status ? explanationState(target.status, target.submittedAt) : null
  const orderVaries = optionOrderVaries(members)
  const recording = phase === 'countdown' || phase === 'recording' || phase === 'paused'
  const backHref = place.subjectSlug ? ROUTES.teachSubject(place.subjectSlug) : ROUTES.teachHome

  const myId = target.mine ? target.solutionId : (stash?.target.solutionId ?? initialOwn?.id ?? null)
  const others = group.filter((explanation) => !(explanation.isMine && explanation.id === myId))
  const liveOther = group.find(
    (explanation) => !explanation.isMine && explanation.kind === 'authored' && explanation.status === 'approved',
  )
  const locked =
    target.mine && liveOther && !viewer.isAdmin && target.status !== 'approved'
      ? `${liveOther.authorName ?? 'Another teacher'} has already published an explanation for this question, and it shows on every copy. Ask an admin if it needs changing.`
      : null
  const blocked = reports.length
    ? 'The answer key is reported as wrong. Save a draft for now; you can submit once an admin has resolved the report.'
    : null
  // A new video on a live explanation goes out at once, so it waits too (attachVideoAction agrees).
  const videoHeld =
    blocked && state === 'live'
      ? 'The answer key is reported as wrong and this explanation is published, so a new video can be attached only once an admin has resolved the report. Download the take to keep it until then.'
      : null

  useEffect(() => {
    claimRef.current = claim
  }, [claim])

  /**
   * Something real happened: note it for the heartbeat, and take the hold
   * the first time (unless the teacher let it go in this visit).
   */
  const touch = useCallback(() => {
    lastActivity.current = Date.now()
    if (claimAsked.current || released.current) return
    claimAsked.current = true
    lastRenewal.current = Date.now()
    void claimAction(question.id)
      .then((result) => setClaim(claimFrom(result, claimRef.current)))
      // Offline: the hold is advisory and the save carries on regardless; the
      // next piece of work asks again.
      .catch(() => {
        claimAsked.current = false
      })
  }, [question.id])

  // The heartbeat: renew the hold while the teacher keeps working with the tab open.
  useEffect(() => {
    const timer = setInterval(() => {
      if (!claimAsked.current || released.current || document.visibilityState !== 'visible') return
      if (!claimRef.current?.mine || lastActivity.current <= lastRenewal.current) return
      lastRenewal.current = Date.now()
      void claimAction(question.id)
        .then((result) => setClaim(claimFrom(result, claimRef.current)))
        .catch(() => undefined)
    }, HEARTBEAT_MS)
    return () => clearInterval(timer)
  }, [question.id])

  // A stroke on the board is work too. Tool changes and the laser are not.
  useEffect(() => {
    const board = boardRef.current
    if (!board) return
    let pages = board.pages()
    return board.onChange(() => {
      const next = board.pages()
      if (next === pages) return
      pages = next
      touch()
    })
  }, [touch])

  // Leaving with a take being recorded or words not saved asks first.
  const guard = recording || dirty
  useEffect(() => {
    if (!guard) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [guard])

  function confirmLeave(event: MouseEvent<HTMLAnchorElement>) {
    if (!guard) return
    const message = recording
      ? 'A take is being recorded. Leave anyway? What was recorded so far is kept in this browser.'
      : 'The explanation has unsaved changes. Leave anyway?'
    if (!window.confirm(message)) event.preventDefault()
  }

  // -------------------------------------------------------------------------
  // Saving
  // -------------------------------------------------------------------------

  async function save(intent: 'draft' | 'submit') {
    if (locked) return
    const prepared = prepareBlocks(items.map((item) => item.block))
    if (!prepared.ok) {
      setSaveError(prepared.error)
      setNotice(null)
      return
    }
    touch()
    const sent = items
    setSaving(intent)
    setSaveError(null)
    setNotice(null)
    let result: SaveExplanationResult
    try {
      result = await saveExplanationAction({
        questionId: question.id,
        body: prepared.blocks,
        intent,
        ...(!target.mine && target.solutionId ? { solutionId: target.solutionId } : {}),
      })
    } catch {
      result = { ok: false, error: 'The explanation could not be saved. Check the connection and try again.' }
    }
    setSaving(null)
    if (!result.ok) {
      setSaveError(result.error)
      return
    }

    const savedJson = JSON.stringify(prepared.blocks)
    const submittedAt =
      result.status !== 'pending' ? target.submittedAt : intent === 'submit' ? new Date().toISOString() : null
    // The editor now holds what was saved, as the server read it (empty blocks
    // dropped, keys in the schema's order) — unless the teacher kept typing
    // while it saved, in which case their newer words stay, still unsaved.
    const solutionId = result.solutionId
    setItems((current) => {
      if (current !== sent) return current
      if (prepared.blocks.length !== current.length) return itemsOf(prepared.blocks, solutionId)
      return current.map((item, index) => ({ key: item.key, block: prepared.blocks[index] }))
    })
    setTarget((current) => ({ ...current, solutionId: result.solutionId, status: result.status, submittedAt, savedJson }))
    if (!target.mine) {
      setGroup((all) =>
        all.map((explanation) =>
          explanation.id === result.solutionId
            ? { ...explanation, body: prepared.blocks, status: result.status, submittedAt }
            : explanation,
        ),
      )
    }

    const copies = `${result.reach} ${result.reach === 1 ? 'copy' : 'copies'} of the question`
    setNotice(
      result.status === 'approved'
        ? `Published. It shows on ${copies}.`
        : intent === 'submit'
          ? `Sent for review. Once approved it shows on ${copies}.`
          : 'Draft saved. Only you and the admins can see it.',
    )
  }

  function onVideo(change: VideoChange) {
    setTarget((current) => {
      // 'keep' leaves the state alone — except that a first save or a
      // rejected explanation becomes a draft, and an untrusted teacher's
      // change to a live one goes back to review.
      let submittedAt = current.submittedAt
      if (change.status === 'pending' && current.status === 'approved') submittedAt = new Date().toISOString()
      else if (change.status === 'pending' && (current.status === null || current.status === 'rejected')) submittedAt = null
      return { ...current, solutionId: change.solutionId, status: change.status, videoUrl: change.videoUrl, submittedAt }
    })
    if (!target.mine) {
      setGroup((all) =>
        all.map((explanation) =>
          explanation.id === change.solutionId ? { ...explanation, videoUrl: change.videoUrl, status: change.status } : explanation,
        ),
      )
    }
  }

  // -------------------------------------------------------------------------
  // An admin editing someone else's explanation
  // -------------------------------------------------------------------------

  function editOther(explanation: GroupExplanation) {
    if (dirty && !window.confirm('Your changes to the explanation are not saved. Put them aside and edit this one?')) return
    if (target.mine) setStash({ target, items })
    setTarget(targetOf(explanation, false))
    setItems(itemsOf(explanation.body, explanation.id))
    setSaveError(null)
    setNotice(null)
    setTab('write')
  }

  function backToMine() {
    if (dirty && !window.confirm('Your changes to this explanation are not saved. Leave them?')) return
    if (stash) {
      setTarget(stash.target)
      setItems(stash.items)
    } else {
      setTarget(targetOf(null, true))
      setItems([])
    }
    setStash(null)
    setSaveError(null)
    setNotice(null)
  }

  // -------------------------------------------------------------------------
  // The hold, and the answer key
  // -------------------------------------------------------------------------

  async function release() {
    setClaimBusy(true)
    const result = await releaseAction(question.id).catch(() => ({ ok: false }))
    setClaimBusy(false)
    if (result.ok) {
      released.current = true
      setReleasedNow(true)
      setClaim(null)
    }
  }

  async function takeOver() {
    if (!window.confirm(`Take this question over from ${claim?.holderName ?? 'the teacher holding it'}?`)) return
    setClaimBusy(true)
    const result = await claimAction(question.id, true).catch(() => null)
    setClaimBusy(false)
    if (!result) return
    claimAsked.current = true
    released.current = false
    setReleasedNow(false)
    lastRenewal.current = Date.now()
    setClaim(claimFrom(result, claimRef.current))
  }

  async function report(description: string): Promise<string | null> {
    try {
      const result = await reportAnswerKeyAction(question.id, description)
      if (!result.ok) return result.error
      setReports((all) => [result.report, ...all])
      return null
    } catch {
      return 'The report could not be sent. Check the connection and try again.'
    }
  }

  // -------------------------------------------------------------------------
  // Takes
  // -------------------------------------------------------------------------

  function onTake(next: Take) {
    setTake(next)
    setTakeSaved(false)
    setTab('board')
  }

  function discardTake() {
    const old = take
    setTake(null)
    void forgetTake(old?.recordingId ?? null)
  }

  function appendSketch(block: SketchBlock) {
    touch()
    setItems((all) => [...all, { key: newItemKey(), block }])
    setBoardNotice({ tone: 'ok', text: 'Added to the written explanation. Save it from the Write tab.' })
  }

  const recordingPlace: RecordingPlace = {
    subjectSlug: place.subjectSlug,
    subjectName: place.subjectName,
    programName: place.programName || null,
    examName: place.examName,
    sessionDate: place.sessionDate,
    setCode: place.setCode,
    number: place.number,
  }
  const editingOther = !target.mine
  const videoEmbed = target.videoUrl ? parseYouTubeUrl(target.videoUrl) : null

  return (
    <>
      <MinWidthNotice backHref={backHref} />

      <div className="fixed inset-0 flex flex-col overscroll-none bg-surface max-md:hidden">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-rule px-3 sm:px-4">
          <BackLink
            href={backHref}
            onClick={confirmLeave}
            aria-label="Back to the queue"
            title="Back to the queue"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-ink hover:bg-surface-2"
          >
            <ArrowLeft size={20} />
          </BackLink>
          <div className="min-w-0 flex-1">
            <p className="truncate text-ui font-medium text-ink">
              <Trail
                parts={[
                  place.subjectName,
                  <span key="exam" className="font-normal text-ink-muted">
                    {place.examName}
                  </span>,
                ]}
              />
            </p>
            <p className="truncate text-meta text-ink-faint tabular-nums">
              <Trail
                parts={[formatSession(place.sessionDate), place.setCode ? `Set ${place.setCode}` : '', `Question ${place.number}`].filter(
                  Boolean,
                )}
              />
            </p>
          </div>

          {recording ? (
            <span className="flex items-center gap-1.5 rounded-control bg-incorrect-soft px-2.5 py-1 text-meta text-incorrect">
              <span aria-hidden className={`h-2 w-2 rounded-full bg-incorrect ${phase === 'recording' ? 'animate-pulse' : ''}`} />
              {phase === 'paused' ? 'Paused' : phase === 'countdown' ? 'Starting' : 'Recording'}
            </span>
          ) : null}
          <span className="hidden text-meta text-ink-faint lg:inline" aria-live="polite">
            {saving ? 'Saving…' : dirty ? 'Unsaved changes' : state ? EXPLANATION_STATE_LABELS[state] : 'Not started'}
          </span>
          <button
            type="button"
            onClick={() => setPaneOpen(!paneOpen)}
            aria-pressed={paneOpen}
            className={buttonClass('ghost', 'sm')}
            title={paneOpen ? 'Hide the question to give the board more room' : 'Show the question'}
          >
            <BookOpenText size={16} aria-hidden="true" />
            {paneOpen ? 'Hide question' : 'Show question'}
          </button>
          <Link
            href={ROUTES.teachHelp}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-9 w-9 items-center justify-center rounded-control text-ink-muted hover:bg-surface-2 hover:text-ink"
            aria-label="Recording help (opens in a new tab)"
            title="Recording help"
          >
            <Question size={18} />
          </Link>
        </header>

        <div className="flex min-h-0 flex-1 overscroll-none max-lg:flex-col max-lg:overflow-y-auto">
          <aside
            aria-label="The question"
            className={`${paneOpen ? '' : 'hidden'} shrink-0 overscroll-none border-rule bg-surface max-lg:max-h-[45dvh] max-lg:overflow-y-auto max-lg:border-b lg:w-[400px] lg:overflow-y-auto lg:border-r xl:w-[440px]`}
          >
            <ReferencePane
              question={question}
              place={place}
              members={members}
              orderVaries={orderVaries}
              others={others}
              viewer={viewer}
              claim={claim}
              released={releasedNow}
              claimBusy={claimBusy}
              onRelease={() => void release()}
              onTakeOver={() => void takeOver()}
              reports={reports}
              onReport={report}
              editingId={editingOther ? target.solutionId : null}
              onEdit={editOther}
            />
          </aside>

          <main className="flex min-w-0 flex-1 flex-col lg:min-h-0">
            <div role="tablist" aria-label="Studio" className="flex shrink-0 gap-1 border-b border-rule bg-surface px-4 py-2 max-lg:sticky max-lg:top-0 max-lg:z-10">
              <TabButton id="write" active={tab === 'write'} onClick={() => setTab('write')}>
                Write
              </TabButton>
              <TabButton id="board" active={tab === 'board'} onClick={() => setTab('board')}>
                Board &amp; record
              </TabButton>
            </div>

            <div className="overscroll-none lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              <section
                id="panel-write"
                role="tabpanel"
                aria-labelledby="tab-write"
                hidden={tab !== 'write'}
                className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6"
              >
                {editingOther ? (
                  <div className="flex flex-wrap items-center gap-3 rounded-control bg-accent-soft px-3 py-2 text-meta text-ink">
                    <span className="min-w-0 flex-1">Editing {target.authorName ?? 'another teacher'}’s explanation.</span>
                    <button type="button" onClick={backToMine} className={buttonClass('outline', 'sm')}>
                      Back to my explanation
                    </button>
                  </div>
                ) : null}

                <section aria-labelledby="video-heading" className="rounded-card border border-rule bg-surface p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 id="video-heading" className="flex items-center gap-2 text-card font-medium text-ink">
                      <VideoCamera size={20} aria-hidden="true" className="text-ink-muted" />
                      Video
                    </h2>
                    <button type="button" onClick={() => setTab('board')} className={buttonClass('ghost', 'sm')}>
                      Record on the board
                    </button>
                  </div>
                  {videoEmbed ? (
                    <div className="mb-3 max-w-xl overflow-hidden rounded-control border border-rule bg-black">
                      <iframe
                        src={youTubeEmbedUrl(videoEmbed)}
                        title="The explanation’s video"
                        loading="lazy"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        referrerPolicy="strict-origin-when-cross-origin"
                        className="aspect-video min-h-[200px] w-full min-w-[200px]"
                      />
                    </div>
                  ) : (
                    <p className="mb-3 text-meta text-ink-muted">
                      No video yet. Record one on the Board &amp; record tab, or paste the link of a video already on the
                      channel.
                    </p>
                  )}
                  {locked ? null : (
                    <LinkVideoField
                      questionId={question.id}
                      solutionId={editingOther && target.solutionId ? target.solutionId : undefined}
                      currentUrl={target.videoUrl}
                      onChange={onVideo}
                      onActivity={touch}
                    />
                  )}
                </section>

                <ExplanationEditor
                  items={items}
                  onItemsChange={setItems}
                  state={state}
                  reviewNote={target.reviewNote}
                  editingName={editingOther ? (target.authorName ?? 'another teacher') : null}
                  dirty={dirty}
                  saving={saving}
                  error={saveError}
                  notice={notice}
                  onSave={(intent) => void save(intent)}
                  trusted={viewer.trusted}
                  locked={locked}
                  blocked={blocked}
                  orderVaries={orderVaries}
                  boardRef={boardRef}
                  questionNumber={question.number}
                  onActivity={touch}
                />
              </section>

              <section
                ref={boardPanel}
                id="panel-board"
                role="tabpanel"
                aria-labelledby="tab-board"
                hidden={tab !== 'board'}
                className={
                  fullBoard
                    ? 'fixed inset-0 z-50 flex w-full flex-col gap-3 overflow-y-auto bg-surface p-3 sm:p-4'
                    : 'flex w-full flex-col gap-4 p-4 sm:p-6'
                }
              >
                <RecordPanel
                  question={question}
                  orderVaries={orderVaries}
                  boardRef={boardRef}
                  active={tab === 'board'}
                  takePending={take !== null}
                  onPhase={setPhase}
                  onTake={onTake}
                  onActivity={touch}
                  onCardReady={onCardReady}
                />

                {take ? (
                  <ReviewPanel
                    take={take}
                    filename={recordingFilename(recordingPlace, take.mime)}
                    saved={takeSaved}
                    onRerecord={discardTake}
                  >
                    {locked ? (
                      <p className="text-meta text-ink-muted">{locked}</p>
                    ) : (
                      <>
                        {videoHeld ? (
                          <p className="mb-4 flex items-start gap-2 text-meta text-marked">
                            <Warning size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
                            {videoHeld}
                          </p>
                        ) : null}
                        <UploadPanel
                          questionId={question.id}
                          take={take}
                          apiUploads={apiUploads && !videoHeld}
                          suggestedTitle={videoTitle(recordingPlace)}
                          suggestedDescription={videoDescription(recordingPlace, {
                            paperUrl: place.paperUrl,
                            snippet: blocksToText(question.body),
                            copies: members.length,
                          })}
                          solutionId={editingOther && target.solutionId ? target.solutionId : undefined}
                          editingOther={editingOther}
                          currentUrl={target.videoUrl}
                          onVideo={onVideo}
                          onUploaded={() => {
                            setTakeSaved(true)
                            void forgetTake(take.recordingId)
                          }}
                          onDiscard={discardTake}
                          onActivity={touch}
                        />
                      </>
                    )}
                  </ReviewPanel>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  <QuestionOnBoard boardRef={boardRef} ready={cardReady} onResult={setBoardNotice} />
                  <PinFigure boardRef={boardRef} question={question} onResult={setBoardNotice} />
                  <InsertBoardPage
                    boardRef={boardRef}
                    questionNumber={question.number}
                    onInsert={appendSketch}
                    label="Add this page to the written explanation"
                    tone="ghost"
                  />
                  <button
                    type="button"
                    onClick={toggleFullBoard}
                    aria-pressed={fullBoard}
                    className={`${buttonClass(fullBoard ? 'primary' : 'outline', 'sm')} ml-auto`}
                  >
                    {fullBoard ? <CornersIn size={16} aria-hidden="true" /> : <CornersOut size={16} aria-hidden="true" />}
                    {fullBoard ? 'Exit full screen' : 'Full screen'}
                  </button>
                  {boardNotice ? (
                    <span
                      className={`flex items-center gap-1.5 text-meta ${boardNotice.tone === 'ok' ? 'text-correct' : 'text-incorrect'}`}
                      aria-live="polite"
                    >
                      {boardNotice.tone === 'ok' ? (
                        <CheckCircle size={16} weight="fill" aria-hidden="true" />
                      ) : (
                        <Warning size={16} aria-hidden="true" />
                      )}
                      {boardNotice.text}
                    </span>
                  ) : null}
                </div>

                {/* As wide as the column allows, but never taller than the screen can show whole. */}
                <div
                  className="mx-auto w-full"
                  style={{
                    maxWidth: fullBoard
                      ? 'max(560px, calc((100dvh - 11rem) * 16 / 9))'
                      : 'max(560px, calc((100dvh - 19rem) * 16 / 9))',
                  }}
                >
                  <Whiteboard handleRef={boardRef} storageKey={`studio:${question.id}`} />
                </div>
              </section>
            </div>
          </main>
        </div>
      </div>
    </>
  )
}

function TabButton({
  id,
  active,
  onClick,
  children,
}: {
  id: Tab
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      id={`tab-${id}`}
      aria-selected={active}
      aria-controls={`panel-${id}`}
      onClick={onClick}
      className={`h-9 rounded-control px-4 text-ui transition-colors ${
        active ? 'bg-ink text-white' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

/** "Pin a figure": puts one of the question's own figures onto the current board page. */
/**
 * Puts the whole question card on the board, beneath the ink: the teacher
 * circles, underlines and writes on the question itself, and the recording
 * shows it that way. As students see it, or with the answer marked.
 */
function QuestionOnBoard({
  boardRef,
  ready,
  onResult,
}: {
  boardRef: RefObject<WhiteboardHandle | null>
  ready: boolean
  onResult: (result: { tone: 'ok' | 'error'; text: string }) => void
}) {
  const menu = useRef<HTMLDetailsElement>(null)

  function place(kind: 'plain' | 'answer') {
    if (menu.current) menu.current.open = false
    const board = boardRef.current
    if (!board) return
    try {
      board.pinCard(kind)
      onResult({
        tone: 'ok',
        text: 'The question is on the board. Write on it; drag it to move it, or its corner to resize it.',
      })
    } catch (failure) {
      onResult({ tone: 'error', text: failure instanceof Error ? failure.message : 'The question could not be placed.' })
    }
  }

  if (!ready) {
    return (
      <span className={`${buttonClass('ghost', 'sm')} cursor-default text-ink-faint`} aria-live="polite">
        <Article size={16} aria-hidden="true" />
        Preparing the question…
      </span>
    )
  }

  return (
    <details ref={menu} className="relative">
      <summary className={`${buttonClass('ghost', 'sm')} cursor-pointer list-none`}>
        <Article size={16} aria-hidden="true" className="text-ink-muted" />
        Question on board
      </summary>
      <ul className="absolute left-0 z-20 mt-1 flex w-72 flex-col rounded-card border border-rule bg-surface p-1">
        <li>
          <button
            type="button"
            onClick={() => place('plain')}
            className="w-full rounded-control px-3 py-2 text-left text-meta text-ink hover:bg-surface-2"
          >
            The question, as students see it
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={() => place('answer')}
            className="w-full rounded-control px-3 py-2 text-left text-meta text-ink hover:bg-surface-2"
          >
            With the answer marked
          </button>
        </li>
      </ul>
    </details>
  )
}

function PinFigure({
  boardRef,
  question,
  onResult,
}: {
  boardRef: RefObject<WhiteboardHandle | null>
  question: QuestionWithOptions
  onResult: (result: { tone: 'ok' | 'error'; text: string }) => void
}) {
  const [figures] = useState(() => questionFigures(question))
  const menu = useRef<HTMLDetailsElement>(null)
  if (!figures.length) return null

  async function pin(image: CloudinaryRef) {
    if (menu.current) menu.current.open = false
    const board = boardRef.current
    if (!board) return
    try {
      await board.pinFigure(image)
      onResult({ tone: 'ok', text: 'Pinned to the board. Drag it to move it, or its corner to resize it.' })
    } catch (failure) {
      onResult({ tone: 'error', text: failure instanceof Error ? failure.message : 'That figure could not be pinned.' })
    }
  }

  return (
    <details ref={menu} className="relative">
      <summary className={`${buttonClass('ghost', 'sm')} cursor-pointer list-none`}>
        <PushPin size={16} aria-hidden="true" className="text-ink-muted" />
        Pin a question figure
      </summary>
      <ul className="absolute left-0 z-20 mt-1 flex w-80 flex-col rounded-card border border-rule bg-surface p-1">
        {figures.map((figure, index) => (
          <li key={`${figure.image.public_id}-${index}`}>
            <button
              type="button"
              onClick={() => void pin(figure.image)}
              className="w-full truncate rounded-control px-3 py-2 text-left text-meta text-ink hover:bg-surface-2"
              title={figure.alt}
            >
              {figure.alt}
            </button>
          </li>
        ))}
      </ul>
    </details>
  )
}
