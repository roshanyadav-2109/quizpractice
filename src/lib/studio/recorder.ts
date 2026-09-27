import { RECORDING_MAX_MS, RECORDING_WARN_MS } from '@/lib/teach/contracts'
import { ChunkStore, newRecordingId } from './chunk-store'
import {
  AUDIO_BITS_PER_SECOND,
  FRAME_RATE,
  VIDEO_BITS_PER_SECOND,
  isWebKitBrowser,
  pickRecordingMime,
} from './mime'

/**
 * The recorder: one canvas and one microphone into MediaRecorder.
 *
 * The stream holds exactly two tracks for the whole take — the canvas the
 * compositor draws (board, question card, webcam bubble) and ONE audio track
 * from a Web Audio graph:
 *
 *   microphone ─► source ─┬─► analyser            (the level meter)
 *                         └─► gain ─► destination  (the recorded track)
 *
 * Changing microphone swaps the source node and muting turns the gain down;
 * neither adds nor removes a track, which MediaRecorder does not survive.
 * The webcam is not a track at all: the compositor draws it into the canvas.
 *
 * Pieces arrive every two seconds and go to the ChunkStore as they come, so
 * a crash loses at most the last two seconds. Safari has at times ignored
 * the timeslice and delivered everything at the end; when no piece arrives
 * in time, the recorder asks for one with requestData() on the same beat.
 *
 * Browser only.
 */

/** A piece of video every two seconds. */
const TIMESLICE_MS = 2000
/** How often the clock, the warning and the hard stop are checked. */
const TICK_MS = 250

export interface RecordingSupport {
  ok: boolean
  /** The recorder's type when ok. */
  mime: string | null
  /** Why not, worded for the teacher. */
  reason: string | null
}

type AudioContextClass = typeof AudioContext

function audioContextClass(): AudioContextClass | null {
  if (typeof window === 'undefined') return null
  const legacy = (window as unknown as { webkitAudioContext?: AudioContextClass }).webkitAudioContext
  return window.AudioContext ?? legacy ?? null
}

/** Whether this browser can record the studio at all, and in what format. */
export function recordingSupport(): RecordingSupport {
  const no = (reason: string): RecordingSupport => ({ ok: false, mime: null, reason })
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return no('Recording needs a browser.')
  if (!window.isSecureContext) return no('Recording works only over https. Open the site at its https address.')
  if (!navigator.mediaDevices?.getUserMedia) {
    return no('This browser cannot use a microphone. Use a recent Chrome, Edge, Firefox or Safari.')
  }
  if (typeof MediaRecorder === 'undefined') {
    return no('This browser cannot record video. Use a recent Chrome, Edge, Firefox or Safari (14.1 or later).')
  }
  if (typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
    return no('This browser cannot record the board. Use a recent Chrome, Edge, Firefox or Safari.')
  }
  if (!audioContextClass()) return no('This browser cannot record sound. Use a recent Chrome, Edge, Firefox or Safari.')
  const mime = pickRecordingMime(
    (type) => MediaRecorder.isTypeSupported(type),
    isWebKitBrowser(navigator.userAgent),
  )
  if (!mime) return no('This browser cannot record WebM or MP4 video. Use a recent Chrome, Edge, Firefox or Safari.')
  return { ok: true, mime, reason: null }
}

/** A refusal from getUserMedia, as a sentence the teacher can act on. */
export function mediaErrorMessage(error: unknown, what: 'microphone' | 'camera'): string {
  const name = error instanceof DOMException || error instanceof Error ? error.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return `The browser was not allowed to use the ${what}. Allow it for this site (the icon at the left of the address bar), then try again.`
    case 'NotFoundError':
    case 'OverconstrainedError':
      return what === 'microphone'
        ? 'No microphone was found. Plug one in, or pick another, then try again.'
        : 'No camera was found.'
    case 'NotReadableError':
    case 'AbortError':
      return `The ${what} is busy — another app or tab may be using it. Close that, then try again.`
    default:
      return `The ${what} could not be started. Try again, or try another browser.`
  }
}

export interface MicDevice {
  deviceId: string
  label: string
}

/**
 * The microphone, through Web Audio. Kept open between takes so a re-record
 * starts at once; closed when the studio goes.
 */
export class MicInput {
  private context: AudioContext | null = null
  private destination: MediaStreamAudioDestinationNode | null = null
  private gain: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private stream: MediaStream | null = null
  private samples: Float32Array<ArrayBuffer> | null = null
  private muted = false
  /** The microphone in use, once open. */
  deviceId: string | null = null

  /** `onEnded` is called when the microphone goes away (unplugged, or taken by the system). */
  constructor(private onEnded: (() => void) | null = null) {}

  get isOpen(): boolean {
    return this.stream !== null
  }

  get isMuted(): boolean {
    return this.muted
  }

  /** The one track the recorder records, stable across microphone changes. */
  get track(): MediaStreamTrack | null {
    return this.destination?.stream.getAudioTracks()[0] ?? null
  }

  /**
   * Opens a microphone — the browser asks the first time. Call it from a
   * click: an audio context may only start after the user does something.
   */
  async open(deviceId?: string | null): Promise<void> {
    const context = this.ensureContext()
    if (context.state === 'suspended') await context.resume().catch(() => undefined)
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    })
    this.attach(stream, context)
  }

  private ensureContext(): AudioContext {
    if (this.context) return this.context
    const Context = audioContextClass()
    if (!Context) throw new Error('This browser cannot record sound.')
    const context = new Context()
    const destination = context.createMediaStreamDestination()
    const gain = context.createGain()
    const analyser = context.createAnalyser()
    analyser.fftSize = 2048
    gain.gain.value = this.muted ? 0 : 1
    gain.connect(destination)
    this.context = context
    this.destination = destination
    this.gain = gain
    this.analyser = analyser
    this.samples = new Float32Array(analyser.fftSize)
    return context
  }

  private attach(stream: MediaStream, context: AudioContext): void {
    const previous = { source: this.source, stream: this.stream }
    const source = context.createMediaStreamSource(stream)
    if (this.analyser) source.connect(this.analyser)
    if (this.gain) source.connect(this.gain)
    this.source = source
    this.stream = stream
    previous.source?.disconnect()
    for (const track of previous.stream?.getTracks() ?? []) track.stop()

    const track = stream.getAudioTracks()[0]
    this.deviceId = track?.getSettings?.().deviceId ?? null
    track?.addEventListener('ended', () => {
      if (this.stream === stream) this.onEnded?.()
    })
  }

  /** The microphones this browser offers. Labels appear once one has been allowed. */
  async devices(): Promise<MicDevice[]> {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      return all
        .filter((device) => device.kind === 'audioinput' && device.deviceId)
        .map((device, index) => ({ deviceId: device.deviceId, label: device.label || `Microphone ${index + 1}` }))
    } catch {
      return []
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    const gain = this.gain
    if (!gain || !this.context) return
    // A short ramp rather than a jump, so muting does not click.
    const now = this.context.currentTime
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(gain.gain.value, now)
    gain.gain.linearRampToValueAtTime(muted ? 0 : 1, now + 0.03)
  }

  /** How loud the microphone is right now, 0–1 on a -60 to 0 dB scale. */
  level(): number {
    if (!this.analyser || !this.samples || !this.stream) return 0
    this.analyser.getFloatTimeDomainData(this.samples)
    let sum = 0
    for (const sample of this.samples) sum += sample * sample
    const rms = Math.sqrt(sum / this.samples.length)
    if (rms <= 0) return 0
    const db = 20 * Math.log10(rms)
    return Math.min(1, Math.max(0, (db + 60) / 60))
  }

  /** Lets go of the microphone; the context stays for the next open(). */
  release(): void {
    this.source?.disconnect()
    for (const track of this.stream?.getTracks() ?? []) track.stop()
    this.source = null
    this.stream = null
  }

  /** Lets go of everything. */
  close(): void {
    this.release()
    this.onEnded = null
    void this.context?.close().catch(() => undefined)
    this.context = null
    this.destination = null
    this.gain = null
    this.analyser = null
    this.samples = null
  }
}

/**
 * The webcam, for the bubble in the corner. Off unless the teacher turns it
 * on. The video element is kept in the page (invisible) because some
 * browsers stop decoding a camera that is not in the document.
 */
export async function openWebcam(): Promise<{ video: HTMLVideoElement; stop: () => void }> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 320 }, height: { ideal: 320 }, facingMode: 'user' },
    audio: false,
  })
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.setAttribute('playsinline', '')
  video.setAttribute('aria-hidden', 'true')
  video.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none'
  video.srcObject = stream
  document.body.appendChild(video)
  try {
    await video.play()
  } catch {
    // Muted inline video may play; if not, frames still arrive once it does.
  }
  return {
    video,
    stop: () => {
      for (const track of stream.getTracks()) track.stop()
      video.srcObject = null
      video.remove()
    },
  }
}

/** A finished take. */
export interface Take {
  blob: Blob
  /** The recorder's type, codecs included. */
  mime: string
  durationMs: number
  /** Where the take is kept in this browser; null when it could not be kept. */
  recordingId: string | null
  /** False when some pieces were lost (a recovered take with a gap). */
  complete: boolean
  /** Brought back from the browser's storage rather than just recorded. */
  recovered?: boolean
}

export type StopReason = 'stopped' | 'limit' | 'error'

export interface TakeCallbacks {
  /** Recorded time so far, pauses left out, about four times a second. */
  onTick?: (elapsedMs: number) => void
  /** Once, at RECORDING_WARN_MS. */
  onWarn?: () => void
  onStop: (take: Take, reason: StopReason) => void
  onError?: (message: string) => void
}

/** One take: start, pause, resume, stop. Make a new one for the next take. */
export class TakeRecorder {
  private readonly recorder: MediaRecorder
  private readonly videoTrack: MediaStreamTrack | null
  private readonly chunks: Blob[] = []
  private seq = 0
  private startedAt = 0
  private pausedAt: number | null = null
  private pausedTotal = 0
  private gotData = false
  private warned = false
  private kept = false
  private finished = false
  private reason: StopReason = 'stopped'
  private tickTimer: ReturnType<typeof setInterval> | undefined
  private pollTimer: ReturnType<typeof setInterval> | undefined
  private watchTimer: ReturnType<typeof setTimeout> | undefined
  readonly mime: string
  recordingId: string | null = null

  constructor(
    canvas: HTMLCanvasElement,
    audioTrack: MediaStreamTrack,
    mime: string,
    private readonly store: ChunkStore | null,
    private readonly questionId: string,
    private readonly callbacks: TakeCallbacks,
  ) {
    const captured = canvas.captureStream(FRAME_RATE)
    this.videoTrack = captured.getVideoTracks()[0] ?? null
    const stream = new MediaStream([...captured.getVideoTracks(), audioTrack])
    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      })
    } catch {
      // A browser that refuses the bitrates still records at its own.
      recorder = new MediaRecorder(stream, { mimeType: mime })
    }
    this.recorder = recorder
    this.mime = recorder.mimeType || mime
  }

  get state(): RecordingState {
    return this.recorder.state
  }

  /** Recorded time so far, pauses left out. */
  elapsed(): number {
    if (!this.startedAt) return 0
    const now = this.pausedAt ?? performance.now()
    return Math.max(0, now - this.startedAt - this.pausedTotal)
  }

  async start(): Promise<void> {
    const startedAt = Date.now()
    const id = newRecordingId(startedAt)
    if (this.store) {
      this.kept = await this.store.create({
        id,
        questionId: this.questionId,
        mime: this.mime,
        startedAt,
        durationMs: 0,
        finalized: false,
        bytes: 0,
        chunks: 0,
      })
    }
    this.recordingId = this.kept ? id : null

    this.recorder.ondataavailable = (event) => this.onData(event.data)
    this.recorder.onstop = () => this.finish()
    this.recorder.onerror = () => {
      this.callbacks.onError?.('The recording stopped unexpectedly. What was recorded so far has been kept.')
      this.reason = 'error'
      if (this.recorder.state !== 'inactive') {
        try {
          this.recorder.stop()
        } catch {
          this.finish()
        }
      }
    }

    this.recorder.start(TIMESLICE_MS)
    this.startedAt = performance.now()
    this.tickTimer = setInterval(() => this.tick(), TICK_MS)
    this.watchTimer = setTimeout(() => {
      if (this.gotData) return
      this.pollTimer = setInterval(() => {
        if (this.recorder.state === 'recording') {
          try {
            this.recorder.requestData()
          } catch {
            // Not recording after all.
          }
        }
      }, TIMESLICE_MS)
    }, TIMESLICE_MS * 2.5)
  }

  pause(): void {
    if (this.recorder.state !== 'recording') return
    this.recorder.pause()
    this.pausedAt = performance.now()
    this.callbacks.onTick?.(this.elapsed())
  }

  resume(): void {
    if (this.recorder.state !== 'paused') return
    if (this.pausedAt !== null) this.pausedTotal += performance.now() - this.pausedAt
    this.pausedAt = null
    this.recorder.resume()
  }

  stop(reason: StopReason = 'stopped'): void {
    if (this.recorder.state === 'inactive') return
    this.reason = reason
    if (this.pausedAt !== null) {
      this.pausedTotal += performance.now() - this.pausedAt
      this.pausedAt = null
    }
    this.recorder.stop()
  }

  private tick(): void {
    const elapsed = this.elapsed()
    this.callbacks.onTick?.(elapsed)
    if (!this.warned && elapsed >= RECORDING_WARN_MS) {
      this.warned = true
      this.callbacks.onWarn?.()
    }
    if (elapsed >= RECORDING_MAX_MS) this.stop('limit')
  }

  private onData(blob: Blob): void {
    if (!blob || blob.size === 0) return
    this.gotData = true
    this.chunks.push(blob)
    const seq = this.seq++
    if (this.kept && this.recordingId) void this.store?.append(this.recordingId, seq, blob, this.elapsed())
  }

  private finish(): void {
    if (this.finished) return
    this.finished = true
    clearInterval(this.tickTimer)
    clearInterval(this.pollTimer)
    clearTimeout(this.watchTimer)
    this.videoTrack?.stop()
    const durationMs = this.elapsed()
    const blob = new Blob(this.chunks, { type: this.mime })
    if (this.kept && this.recordingId) void this.store?.finalize(this.recordingId, durationMs)
    this.callbacks.onStop(
      { blob, mime: this.mime, durationMs, recordingId: this.recordingId, complete: true },
      this.reason,
    )
  }
}
