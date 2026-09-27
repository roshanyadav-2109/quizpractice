'use client'

import { memo, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { WhiteboardHandle } from '@/components/board/Whiteboard'
import { QuestionWithAnswer } from '@/components/question/QuestionWithAnswer'
import {
  Eye,
  EyeSlash,
  Microphone,
  MicrophoneSlash,
  Pause,
  Play,
  RecordIcon,
  Shuffle,
  Stop,
  VideoCamera,
  VideoCameraSlash,
  Warning,
} from '@/components/ui/icons'
import { buttonClass } from '@/components/ui/primitives'
import { ChunkStore, pickRecoverable, type RecordingMeta } from '@/lib/studio/chunk-store'
import { Compositor, type CardImages } from '@/lib/studio/compositor'
import { formatClock } from '@/lib/studio/filename'
import { CARD_CSS_WIDTH, rasterizeCard } from '@/lib/studio/question-raster'
import {
  MicInput,
  TakeRecorder,
  mediaErrorMessage,
  openWebcam,
  recordingSupport,
  type MicDevice,
  type RecordingSupport,
  type Take,
} from '@/lib/studio/recorder'
import { RECORDING_MAX_MS, RECORDING_WARN_MS } from '@/lib/teach/contracts'
import type { QuestionWithOptions } from '@/types/db'
import { OnAirPreview } from './OnAirPreview'
import { formatWhen } from './ReferencePane'

/**
 * Where a recording is in its life. After 'recording' (or 'paused') the take
 * goes to the studio for review, and this panel is 'ready' again.
 */
export type RecordPhase = 'idle' | 'permissions' | 'ready' | 'countdown' | 'recording' | 'paused'

const MIC_KEY = 'qp-studio-mic'
/** Red, as record buttons are everywhere; otherwise the primary button's shape. */
const RECORD_BUTTON =
  'inline-flex h-10 items-center justify-center gap-2 rounded-control bg-incorrect px-4 text-ui whitespace-nowrap text-white transition-colors hover:bg-incorrect/90 disabled:pointer-events-none disabled:opacity-45'
const WARN_MINUTES = Math.round(RECORDING_WARN_MS / 60_000)
const MAX_MINUTES = Math.round(RECORDING_MAX_MS / 60_000)

// What the browser can do is fixed for the page's life: asked once, and not
// during the server render, where there is no browser to ask.
let supportCache: RecordingSupport | null = null
const getSupport = () => (supportCache ??= recordingSupport())
const getServerSupport = () => null
const getMounted = () => true
const getServerMounted = () => false
const subscribeNever = () => () => {}

function savedMic(): string | null {
  try {
    return window.localStorage.getItem(MIC_KEY)
  } catch {
    return null
  }
}

function saveMic(deviceId: string | null): void {
  try {
    if (deviceId) window.localStorage.setItem(MIC_KEY, deviceId)
  } catch {
    // A convenience only.
  }
}

function pageFonts(): { sans: string; mono: string } {
  const style = getComputedStyle(document.body)
  const mono = style.getPropertyValue('--font-jetbrains').trim()
  return { sans: style.fontFamily || 'sans-serif', mono: mono ? `${mono}, ui-monospace, monospace` : 'ui-monospace, monospace' }
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
}

/**
 * The recorder's controls: set up the microphone, pick the camera and the
 * question card, count down, record, pause, stop.
 *
 * What is recorded is the compositor's canvas — board, question card, webcam
 * bubble — and the microphone; see src/lib/studio. The canvas is shown in
 * the floating on-air preview, which stays on screen for the whole take.
 * Every take is also kept in this browser as it is recorded, and one left
 * unfinished (a crash, a reload) is offered back here.
 */
export function RecordPanel({
  question,
  orderVaries,
  boardRef,
  active,
  takePending,
  onPhase,
  onTake,
  onActivity,
}: {
  question: QuestionWithOptions
  orderVaries: boolean
  boardRef: RefObject<WhiteboardHandle | null>
  /** The Board & record tab is on screen. */
  active: boolean
  /** A take is waiting for review: no new one until it is dealt with. */
  takePending: boolean
  onPhase: (phase: RecordPhase) => void
  onTake: (take: Take) => void
  onActivity: () => void
}) {
  const support = useSyncExternalStore(subscribeNever, getSupport, getServerSupport)
  const mounted = useSyncExternalStore(subscribeNever, getMounted, getServerMounted)

  const [phase, setPhaseState] = useState<RecordPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [mics, setMics] = useState<MicDevice[]>([])
  const [micId, setMicId] = useState('')
  const [muted, setMuted] = useState(false)
  const [webcamOn, setWebcamOn] = useState(false)
  const [webcamBusy, setWebcamBusy] = useState(false)
  const [showAnswer, setShowAnswer] = useState(false)
  const [cardOpen, setCardOpen] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [elapsed, setElapsed] = useState(0)
  const [warned, setWarned] = useState(false)
  const [count, setCount] = useState<number | null>(null)
  const [rasterWanted, setRasterWanted] = useState(false)
  const [raster, setRaster] = useState<{ fallback: boolean } | null>(null)
  const [recoverable, setRecoverable] = useState<RecordingMeta | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const meterRef = useRef<HTMLDivElement>(null)
  const plainRef = useRef<HTMLDivElement>(null)
  const answerRef = useRef<HTMLDivElement>(null)
  const compositor = useRef<Compositor | null>(null)
  const mic = useRef<MicInput | null>(null)
  const recorder = useRef<TakeRecorder | null>(null)
  const webcam = useRef<{ video: HTMLVideoElement; stop: () => void } | null>(null)
  /** undefined: not opened yet; null: this browser gives the studio no storage. */
  const store = useRef<ChunkStore | null | undefined>(undefined)
  const cardImages = useRef<CardImages | null>(null)
  const cardOpenNow = useRef(true)
  const countdown = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function setPhase(next: RecordPhase) {
    setPhaseState(next)
    onPhase(next)
  }

  // A take left unfinished on an earlier visit, offered back.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const opened = await ChunkStore.open()
      if (cancelled) return
      store.current = opened
      if (!opened) return
      await opened.sweep(Date.now())
      const found = pickRecoverable(await opened.list(question.id), question.id, Date.now())
      if (!cancelled) setRecoverable(found)
    })()
    return () => {
      cancelled = true
    }
  }, [question.id])

  // Everything is let go when the studio closes. An unfinished take is
  // already in the browser's storage, and is offered back next time.
  useEffect(() => {
    const refs = { recorder, webcam, mic, compositor, countdown }
    return () => {
      clearTimeout(refs.countdown.current)
      refs.recorder.current?.stop()
      refs.webcam.current?.stop()
      refs.mic.current?.close()
      refs.compositor.current?.dispose()
    }
  }, [])

  // The level meter, drawn straight onto its bar every frame.
  useEffect(() => {
    if (phase === 'idle' || phase === 'permissions') return
    let frame = 0
    const loop = () => {
      const level = mic.current?.level() ?? 0
      if (meterRef.current) meterRef.current.style.transform = `scaleX(${level.toFixed(3)})`
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [phase])

  // The question card's pictures, once the hidden copies of the card are on the page.
  useEffect(() => {
    if (!rasterWanted) return
    const plain = plainRef.current
    const answer = answerRef.current
    if (!plain || !answer) return
    let cancelled = false
    void rasterizeCard({ plain, answer }, question, pageFonts(), { hideLabels: orderVaries }).then((result) => {
      if (cancelled) return
      cardImages.current = result.images
      compositor.current?.setCard(result.images)
      setRaster({ fallback: result.fallback })
    })
    return () => {
      cancelled = true
    }
  }, [rasterWanted, question, orderVaries])

  // Q folds the card away and back, while the board is on screen.
  useEffect(() => {
    if (!active || phase === 'idle' || phase === 'permissions') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || isEditable(event.target)) return
      if (event.key.toLowerCase() !== 'q') return
      event.preventDefault()
      const next = !cardOpenNow.current
      cardOpenNow.current = next
      compositor.current?.setCardOpen(next)
      setCardOpen(next)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, phase])

  function startCompositor() {
    const canvas = canvasRef.current
    if (!canvas || compositor.current) return
    const drawing = new Compositor(canvas, () => boardRef.current, {
      label: `Question ${question.number}`,
      fontFamily: pageFonts().sans,
    })
    drawing.setCardOpen(cardOpenNow.current)
    drawing.setShowAnswer(showAnswer)
    if (cardImages.current) drawing.setCard(cardImages.current)
    drawing.start()
    compositor.current = drawing
  }

  async function setUp() {
    if (!support?.ok) return
    onActivity()
    setError(null)
    setNotice(null)
    setPhase('permissions')

    mic.current?.close()
    const input = new MicInput(() => {
      setError('The microphone went away. Plug it back in or pick another, then carry on.')
      if (recorder.current?.state === 'recording') {
        recorder.current.pause()
        setPhase('paused')
      }
    })
    mic.current = input
    const preferred = savedMic()
    try {
      await input.open(preferred)
    } catch (first) {
      try {
        // The microphone used last time may be gone: the default one will do.
        if (!preferred) throw first
        await input.open(null)
      } catch (failure) {
        setError(mediaErrorMessage(failure, 'microphone'))
        setPhase('idle')
        return
      }
    }
    setMics(await input.devices())
    setMicId(input.deviceId ?? '')
    saveMic(input.deviceId)
    if (store.current === undefined) store.current = await ChunkStore.open()
    startCompositor()
    setRasterWanted(true)
    setPhase('ready')
  }

  function shutDown() {
    webcam.current?.stop()
    webcam.current = null
    setWebcamOn(false)
    compositor.current?.dispose()
    compositor.current = null
    mic.current?.close()
    mic.current = null
    setPhase('idle')
  }

  async function changeMic(deviceId: string) {
    setMicId(deviceId)
    try {
      await mic.current?.open(deviceId || null)
      saveMic(deviceId)
      setError(null)
    } catch (failure) {
      setError(mediaErrorMessage(failure, 'microphone'))
    }
  }

  function toggleMute() {
    const next = !muted
    mic.current?.setMuted(next)
    setMuted(next)
  }

  async function toggleWebcam() {
    if (webcam.current) {
      webcam.current.stop()
      webcam.current = null
      compositor.current?.setWebcam(null)
      setWebcamOn(false)
      return
    }
    setWebcamBusy(true)
    try {
      const camera = await openWebcam()
      webcam.current = camera
      compositor.current?.setWebcam(camera.video)
      setWebcamOn(true)
    } catch (failure) {
      setError(mediaErrorMessage(failure, 'camera'))
    } finally {
      setWebcamBusy(false)
    }
  }

  function toggleAnswer() {
    const next = !showAnswer
    compositor.current?.setShowAnswer(next)
    setShowAnswer(next)
  }

  function toggleCard() {
    const next = !cardOpenNow.current
    cardOpenNow.current = next
    compositor.current?.setCardOpen(next)
    setCardOpen(next)
  }

  function zoomCard(factor: number) {
    const next = compositor.current?.zoomCard(factor)
    if (next) setZoom(next)
  }

  function record() {
    if (takePending || !support?.ok || !mic.current?.track) return
    onActivity()
    setError(null)
    setNotice(null)
    setWarned(false)
    setElapsed(0)
    setPhase('countdown')
    let remaining = 3
    setCount(remaining)
    const step = () => {
      remaining -= 1
      if (remaining > 0) {
        setCount(remaining)
        countdown.current = setTimeout(step, 1000)
        return
      }
      setCount(null)
      void begin()
    }
    countdown.current = setTimeout(step, 1000)
  }

  function cancelCountdown() {
    clearTimeout(countdown.current)
    setCount(null)
    setPhase('ready')
  }

  async function begin() {
    const canvas = canvasRef.current
    const track = mic.current?.track
    if (!canvas || !track || !support?.mime) {
      setPhase('ready')
      return
    }
    compositor.current?.draw()
    let take: TakeRecorder
    try {
      take = new TakeRecorder(canvas, track, support.mime, store.current ?? null, question.id, {
        onTick: setElapsed,
        onWarn: () => setWarned(true),
        onError: setError,
        onStop: (result, reason) => {
          recorder.current = null
          setPhase('ready')
          if (reason === 'limit') {
            setNotice(`The take stopped at ${MAX_MINUTES} minutes, the longest one take can be. Review it below.`)
          }
          if (result.blob.size > 0) onTake(result)
          else setError('Nothing was recorded. Try again; if it happens again, try another browser.')
        },
      })
      await take.start()
    } catch {
      setError('The recording could not start. Try again, or try another browser.')
      setPhase('ready')
      return
    }
    recorder.current = take
    setPhase('recording')
  }

  function pause() {
    recorder.current?.pause()
    setPhase('paused')
  }

  function resume() {
    onActivity()
    recorder.current?.resume()
    setPhase('recording')
  }

  function stop() {
    recorder.current?.stop()
  }

  async function recover() {
    const meta = recoverable
    const kept = store.current
    if (!meta || !kept) return
    const loaded = await kept.load(meta)
    setRecoverable(null)
    if (!loaded) {
      setError('That recording could not be read back from the browser.')
      await kept.remove(meta.id)
      return
    }
    onTake({
      blob: loaded.blob,
      mime: meta.mime,
      durationMs: meta.durationMs,
      recordingId: meta.id,
      complete: loaded.complete,
      recovered: true,
    })
  }

  async function discardRecovered() {
    const meta = recoverable
    if (!meta || !window.confirm('Throw this recording away? It cannot be brought back.')) return
    setRecoverable(null)
    await store.current?.remove(meta.id)
  }

  const live = phase === 'recording' || phase === 'paused'
  const busy = live || phase === 'countdown'
  const previewShown = (active && phase !== 'idle' && phase !== 'permissions') || busy
  const toggle = (on: boolean) =>
    `inline-flex h-8 items-center gap-1.5 rounded-control border px-2.5 text-meta transition-colors disabled:opacity-45 ${
      on ? 'border-ink bg-ink text-white' : 'border-rule bg-surface text-ink-muted hover:border-rule-strong hover:text-ink'
    }`

  return (
    <section aria-label="Recorder" className="rounded-card border border-rule bg-surface p-3">
      {recoverable && !takePending && !busy ? (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control bg-accent-soft px-3 py-2 text-meta text-ink">
          <span className="min-w-0 flex-1">
            A {recoverable.finalized ? '' : 'cut-off '}take of {formatClock(recoverable.durationMs)} from{' '}
            {formatWhen(new Date(recoverable.startedAt).toISOString())} is kept in this browser.
          </span>
          <button type="button" onClick={() => void recover()} className={buttonClass('primary', 'sm')}>
            Review it
          </button>
          <button type="button" onClick={() => void discardRecovered()} className={buttonClass('ghost', 'sm')}>
            Throw away
          </button>
        </div>
      ) : null}

      {phase === 'idle' || phase === 'permissions' ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="min-w-0 flex-1 basis-72 text-meta text-ink-muted">
            {support === null
              ? 'Checking what this browser can record…'
              : support.ok
                ? 'Record the board, the question card and your voice. Only those are recorded — never the rest of your screen.'
                : support.reason}
          </p>
          <button
            type="button"
            onClick={() => void setUp()}
            disabled={!support?.ok || phase === 'permissions'}
            className={buttonClass('primary', 'md')}
          >
            <Microphone size={16} aria-hidden="true" />
            {phase === 'permissions' ? 'Allow the microphone…' : 'Set up recording'}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="studio-mic">
              Microphone
            </label>
            <select
              id="studio-mic"
              value={micId}
              onChange={(event) => void changeMic(event.target.value)}
              className="h-8 max-w-[12rem] truncate rounded-control border border-rule bg-surface px-2 text-meta text-ink outline-none focus:border-accent"
            >
              {mics.length === 0 ? <option value="">Default microphone</option> : null}
              {mics.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </option>
              ))}
            </select>
            <div
              className="h-2 w-20 overflow-hidden rounded-full bg-surface-2"
              title="Microphone level: speak, and the bar should move"
              aria-hidden="true"
            >
              <div ref={meterRef} className={`h-full origin-left ${muted ? 'bg-rule-strong' : 'bg-correct'}`} style={{ transform: 'scaleX(0)' }} />
            </div>
            <button type="button" onClick={toggleMute} className={toggle(muted)} aria-pressed={muted}>
              {muted ? <MicrophoneSlash size={16} aria-hidden="true" /> : <Microphone size={16} aria-hidden="true" />}
              {muted ? 'Muted' : 'Mute'}
            </button>
          </div>

          <button type="button" onClick={() => void toggleWebcam()} disabled={webcamBusy} className={toggle(webcamOn)} aria-pressed={webcamOn}>
            {webcamOn ? <VideoCamera size={16} aria-hidden="true" /> : <VideoCameraSlash size={16} aria-hidden="true" />}
            Webcam
          </button>
          <button type="button" onClick={toggleAnswer} className={toggle(showAnswer)} aria-pressed={showAnswer}>
            {showAnswer ? <Eye size={16} aria-hidden="true" /> : <EyeSlash size={16} aria-hidden="true" />}
            Show answer on video
          </button>
          <button type="button" onClick={toggleCard} className={toggle(cardOpen)} aria-pressed={cardOpen} title="Q folds the card away and back">
            Question card
            <kbd className="rounded border border-current/30 px-1 text-micro opacity-70">Q</kbd>
          </button>

          <div className="ml-auto flex items-center gap-2">
            {live ? (
              <span className={`text-ui tabular-nums ${phase === 'paused' ? 'text-ink-muted' : 'text-incorrect'}`} aria-live="off">
                {phase === 'paused' ? 'Paused' : '● REC'} {formatClock(elapsed)}
              </span>
            ) : null}
            {phase === 'ready' ? (
              <>
                <button type="button" onClick={shutDown} className={buttonClass('ghost', 'sm')}>
                  Turn off microphone
                </button>
                <button
                  type="button"
                  onClick={record}
                  disabled={takePending}
                  title={takePending ? 'Review the take below first: keep it or throw it away' : undefined}
                  className={RECORD_BUTTON}
                >
                  <RecordIcon size={16} weight="fill" aria-hidden="true" />
                  Record
                </button>
              </>
            ) : null}
            {phase === 'countdown' ? (
              <>
                <span className="text-ui text-ink tabular-nums" aria-live="assertive">
                  Starting in {count ?? 0}…
                </span>
                <button type="button" onClick={cancelCountdown} className={buttonClass('outline', 'md')}>
                  Cancel
                </button>
              </>
            ) : null}
            {phase === 'recording' ? (
              <button type="button" onClick={pause} className={buttonClass('outline', 'md')}>
                <Pause size={16} weight="fill" aria-hidden="true" />
                Pause
              </button>
            ) : null}
            {phase === 'paused' ? (
              <button type="button" onClick={resume} className={buttonClass('outline', 'md')}>
                <Play size={16} weight="fill" aria-hidden="true" />
                Resume
              </button>
            ) : null}
            {live ? (
              <button type="button" onClick={stop} className={buttonClass('primary', 'md')}>
                <Stop size={16} weight="fill" aria-hidden="true" />
                Stop
              </button>
            ) : null}
          </div>
        </div>
      )}

      <div aria-live="polite" className="empty:hidden mt-2 flex flex-col gap-1.5">
        {takePending && phase === 'ready' ? (
          <p className="text-meta text-ink-muted">Your take is below. Keep it or throw it away to record another.</p>
        ) : null}
        {warned && live ? (
          <p className="flex items-start gap-2 text-meta text-marked">
            <Warning size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            {WARN_MINUTES} minutes recorded: the take stops by itself at {MAX_MINUTES}. Wrap up, or stop and record the rest
            as a second video.
          </p>
        ) : null}
        {orderVaries && (phase === 'ready' || phase === 'countdown') ? (
          <p className="flex items-start gap-2 text-meta text-review">
            <Shuffle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            Options are shuffled on some copies: name each option by what it says, never by its letter.
          </p>
        ) : null}
        {rasterWanted && !raster && phase !== 'idle' ? (
          <p className="text-meta text-ink-faint">Preparing the question card for the video…</p>
        ) : null}
        {raster?.fallback && phase !== 'idle' ? (
          <p className="text-meta text-ink-faint">
            This browser could not photograph the question, so the card on the video is a plain version of it.
          </p>
        ) : null}
        {notice ? <p className="text-meta text-ink">{notice}</p> : null}
        {error ? (
          <p className="flex items-start gap-2 text-meta text-incorrect">
            <Warning size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            {error}
          </p>
        ) : null}
      </div>

      {/* Outside the tab panel, which is hidden on the Write tab: the preview
          stays on screen while a take runs, and the card copies stay laid out. */}
      {mounted
        ? createPortal(
            <>
              <OnAirPreview
                canvasRef={canvasRef}
                shown={previewShown}
                recording={live}
                paused={phase === 'paused'}
                elapsedMs={elapsed}
                count={count}
                card={{ ready: raster !== null, open: cardOpen, zoom }}
                onToggleCard={toggleCard}
                onZoom={zoomCard}
                onScroll={(px) => compositor.current?.scrollCard(px)}
              />
              {rasterWanted ? (
                <RasterSource question={question} hideLabels={orderVaries} plainRef={plainRef} answerRef={answerRef} />
              ) : null}
            </>,
            document.body,
          )
        : null}
    </section>
  )
}

/**
 * The two copies of the question card that are photographed for the video,
 * off screen at the card's fixed width. Wide code and tables wrap or spill
 * rather than scroll, so the picture holds all of them. Memoised: the
 * recorder's clock re-renders the panel four times a second.
 */
const RasterSource = memo(function RasterSource({
  question,
  hideLabels,
  plainRef,
  answerRef,
}: {
  question: QuestionWithOptions
  hideLabels: boolean
  plainRef: RefObject<HTMLDivElement | null>
  answerRef: RefObject<HTMLDivElement | null>
}) {
  const card =
    'bg-white p-5 [&_.overflow-x-auto]:overflow-visible [&_pre]:break-all [&_pre]:whitespace-pre-wrap'
  return (
    <div aria-hidden="true" inert className="pointer-events-none fixed top-0 -left-[20000px] flex flex-col gap-4">
      <div ref={plainRef} className={card} style={{ width: CARD_CSS_WIDTH }}>
        <QuestionWithAnswer question={question} showAnswer={false} hideLabels={hideLabels} />
      </div>
      <div ref={answerRef} className={card} style={{ width: CARD_CSS_WIDTH }}>
        <QuestionWithAnswer question={question} showAnswer hideLabels={hideLabels} />
      </div>
    </div>
  )
})
