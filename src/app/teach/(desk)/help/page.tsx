import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { teacherPageGate } from '@/lib/supabase/server'
import { CLAIM_HOURS, RECORDING_MAX_MS, RECORDING_WARN_MS, ROUTES } from '@/lib/teach/contracts'
import { Breadcrumb } from '@/components/site/Page'
import {
  ArrowRight,
  ArrowsClockwise,
  CheckCircle,
  Monitor,
  Hourglass,
  Microphone,
  PencilSimple,
  Play,
  ShieldCheck,
  Timer,
} from '@/components/ui/icons'

export const metadata: Metadata = { title: 'How it works' }

const WARN_MINUTES = Math.round(RECORDING_WARN_MS / 60_000)
const MAX_MINUTES = Math.round(RECORDING_MAX_MS / 60_000)

/**
 * How a question becomes a published video solution, shown before it is told:
 * five steps, each with a small drawing of the screen it happens on, then how
 * an explanation moves from draft to published, then how to record well.
 * Publishing is automatic: the teacher presses Upload and the studio does the rest.
 */
export default async function TeachHelpPage() {
  await teacherPageGate(ROUTES.teachHelp)

  return (
    <>
      <Breadcrumb crumbs={[{ label: 'Dashboard', href: ROUTES.teachHome }, { label: 'How it works' }]} />
      <header className="border-b border-rule pb-5">
        <h1 className="text-[1.625rem] leading-tight font-medium tracking-[-0.01em] text-ink">How it works</h1>
        <p className="mt-1 text-ui text-ink-muted">Five steps from a question to a published solution.</p>
      </header>

      {/* ------------------------------------------------------------ Steps */}
      <ol className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Step n={1} title="Pick a question" picture={<PickPicture />}>
          Press Explain on any question. It is held for you for {CLAIM_HOURS} hours.
        </Step>
        <Step n={2} title="Write the solution" picture={<WritePicture />}>
          Write the working and the answer. It saves as you go.
        </Step>
        <Step n={3} title="Record on the board" picture={<RecordPicture />}>
          Talk it through on the board. Pause whenever you need.
        </Step>
        <Step n={4} title="Upload" picture={<UploadPicture />}>
          Watch your take, then press Upload. It is published automatically.
        </Step>
        <Step n={5} title="Submit for review" picture={<PublishPicture />}>
          Once approved, it shows on every copy of the question.
        </Step>
      </ol>

      {/* ------------------------------------------------------- The upload */}
      <section className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start" aria-labelledby="upload">
        <div className="rounded-[12px] border border-rule bg-surface p-5">
          <h2 id="upload" className="text-card text-ink">
            Publishing is automatic
          </h2>
          <ul className="mt-4 flex flex-col gap-3">
            <Fact icon={<Play size={16} weight="fill" aria-hidden="true" />}>
              Nothing leaves your browser until you press Upload.
            </Fact>
            <Fact icon={<ArrowsClockwise size={16} aria-hidden="true" />}>Connection dropped? Press Carry on uploading.</Fact>
            <Fact icon={<Hourglass size={16} aria-hidden="true" />}>Cannot upload right now? Your take is kept here for 7 days.</Fact>
          </ul>
        </div>

        {/* How an explanation moves: draft, review, published, and back when changes are asked for. */}
        <div className="rounded-[12px] border border-rule bg-surface p-5" aria-labelledby="states">
          <h2 id="states" className="text-card text-ink">
            Where your explanation is
          </h2>
          <div className="mt-5 flex items-center gap-2" aria-hidden="true">
            <State label="Draft" note="only you" tone="neutral" />
            <ArrowRight size={16} className="shrink-0 text-ink-faint" />
            <State label="In review" note="a reviewer" tone="review" />
            <ArrowRight size={16} className="shrink-0 text-ink-faint" />
            <State label="Published" note="everyone" tone="live" />
          </div>
          {/* From In review back to Draft: the middle of the second box to the middle of the first. */}
          <div className="mt-1 ml-[12%] w-[42%]" aria-hidden="true">
            <svg viewBox="0 0 200 34" className="h-8 w-full text-incorrect" fill="none">
              <path d="M175 2 C 175 28, 22 28, 22 4" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
              <path d="M17 9 L22 3 L27 9" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <p className="-mt-1 text-center text-micro whitespace-nowrap text-incorrect">Needs changes: back to you with a note</p>
          </div>
          <ul className="mt-4 flex flex-col gap-1.5 border-t border-rule pt-4 text-meta text-ink-muted">
            <li>
              <strong className="font-medium text-ink">Save draft</strong>: private to you.
            </li>
            <li>
              <strong className="font-medium text-ink">Submit</strong>: a reviewer publishes it, or sends it back with a note.
            </li>
            <li>
              Trusted teachers see <strong className="font-medium text-ink">Publish</strong> and go live at once.
            </li>
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------------------- Tips */}
      <section className="mt-8" aria-labelledby="tips">
        <h2 id="tips" className="mb-3 text-section font-medium text-ink">
          Recording well
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Tip icon={<Microphone size={20} aria-hidden="true" />} title="A quiet room, a good mic">
            Use a headset or USB mic. Check the level meter first.
          </Tip>
          <Tip icon={<PencilSimple size={20} aria-hidden="true" />} title="A pen, not a mouse">
            A pen tablet or an iPad with Pencil writes best.
          </Tip>
          <Tip icon={<Monitor size={20} aria-hidden="true" />} title="A wide screen">
            A laptop, a desktop, or a tablet turned sideways.
          </Tip>
          <Tip icon={<ShieldCheck size={20} aria-hidden="true" />} title="Only the board is recorded">
            Never your screen, your tabs or your notifications.
          </Tip>
          <Tip icon={<Timer size={20} aria-hidden="true" />} title="Short and complete">
            3 to 8 minutes. It warns you at {WARN_MINUTES} and stops at {MAX_MINUTES}.
          </Tip>
          <Tip icon={<ArrowsClockwise size={20} aria-hidden="true" />} title="Name options by what they say">
            Copies may shuffle options: say &ldquo;the option O(n log n)&rdquo;, not &ldquo;B&rdquo;.
          </Tip>
        </ul>
      </section>
    </>
  )
}

function Step({ n, title, picture, children }: { n: number; title: string; picture: ReactNode; children: ReactNode }) {
  return (
    <li className="flex flex-col overflow-hidden rounded-[12px] border border-rule bg-surface">
      <div aria-hidden="true" className="relative h-32 border-b border-rule bg-desk-soft/60">
        {picture}
      </div>
      <div className="p-4">
        <p className="flex items-center gap-2 text-ui text-ink">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-desk text-micro font-medium text-white tabular-nums">
            {n}
          </span>
          {title}
        </p>
        <p className="mt-1.5 text-meta leading-relaxed text-ink-muted">{children}</p>
      </div>
    </li>
  )
}

function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-meta text-ink-muted">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-desk-soft text-desk">{icon}</span>
      <span className="pt-1">{children}</span>
    </li>
  )
}

function State({ label, note, tone }: { label: string; note: string; tone: 'neutral' | 'review' | 'live' }) {
  const color = tone === 'live' ? 'border-desk bg-desk-soft text-desk' : tone === 'review' ? 'border-accent/40 bg-accent-soft text-accent' : 'border-rule bg-surface-2 text-ink'
  return (
    <span className={`flex flex-1 flex-col items-center rounded-[10px] border px-2 py-2.5 text-center ${color}`}>
      <span className="text-meta font-medium">{label}</span>
      <span className="text-micro opacity-75">{note}</span>
    </span>
  )
}

function Tip({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="rounded-[12px] border border-rule bg-surface p-4">
      <span className="flex items-center gap-2.5 text-ui text-ink">
        <span className="text-desk">{icon}</span>
        {title}
      </span>
      <p className="mt-1.5 text-meta leading-relaxed text-ink-muted">{children}</p>
    </li>
  )
}

/* ------------------------------------------------ Drawings of each step */

/** A queue: three question rows, the middle one picked. */
function PickPicture() {
  return (
    <div className="absolute inset-x-4 top-4 flex flex-col gap-1.5">
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          className={`flex items-center gap-2 rounded-[6px] border bg-surface px-2 py-1.5 ${row === 1 ? 'border-desk shadow-sm' : 'border-rule'}`}
        >
          <span className="h-4 w-4 rounded-[4px] bg-surface-2" />
          <span className={`h-1.5 flex-1 rounded-full ${row === 1 ? 'bg-ink/40' : 'bg-ink/15'}`} />
          <span className={`rounded-[4px] px-1.5 text-[9px] ${row === 1 ? 'bg-desk text-white' : 'bg-surface-2 text-ink-faint'}`}>
            Explain
          </span>
        </div>
      ))}
    </div>
  )
}

/** The editor: lines of working and a highlighted answer. */
function WritePicture() {
  return (
    <div className="absolute inset-x-4 top-4 bottom-4 rounded-[6px] border border-rule bg-surface p-2.5">
      <div className="flex gap-1">
        {['B', 'I', '∑', '</>'].map((tool) => (
          <span key={tool} className="rounded-[3px] bg-surface-2 px-1 text-[8px] leading-4 text-ink-muted">
            {tool}
          </span>
        ))}
      </div>
      <span className="mt-2 block h-1.5 w-[85%] rounded-full bg-ink/20" />
      <span className="mt-1.5 block h-1.5 w-[70%] rounded-full bg-ink/20" />
      <span className="mt-1.5 block h-1.5 w-[78%] rounded-full bg-ink/20" />
      <span className="mt-2 inline-block rounded-[4px] bg-desk-soft px-1.5 text-[9px] leading-4 text-desk">Answer: B</span>
    </div>
  )
}

/** The board: squared paper, marker working, the red recording dot. */
function RecordPicture() {
  return (
    <div
      className="absolute inset-x-4 top-4 bottom-4 overflow-hidden rounded-[6px] border border-rule bg-white"
      style={{
        backgroundImage:
          'linear-gradient(to right, rgba(15,118,110,0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,118,110,0.1) 1px, transparent 1px)',
        backgroundSize: '10px 10px',
      }}
    >
      <svg viewBox="0 0 160 70" className="absolute inset-0 h-full w-full" fill="none" strokeLinecap="round">
        <path d="M18 22 C 10 22, 9 38, 18 40 C 27 42, 29 24, 18 22 Z M22 36 L 27 43" stroke="#0c0a09" strokeWidth="2.2" />
        <path d="M34 26 L 38 23 L 38 42" stroke="#0c0a09" strokeWidth="2.2" />
        <path d="M50 32 L 66 32 M61 27 L 66 32 L 61 37" stroke="#0f766e" strokeWidth="2" />
        <path d="M74 22 L 128 21 L 129 42 L 75 43 Z" stroke="#dc2626" strokeWidth="1.8" />
        <path d="M14 52 C 30 48, 44 56, 60 50" stroke="#0f766e" strokeWidth="2" />
      </svg>
      <span className="absolute top-1.5 right-1.5 flex items-center gap-1 rounded-full bg-white/90 px-1.5 text-[8px] leading-4 text-ink">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#dc2626]" />
        REC 03:12
      </span>
    </div>
  )
}

/** The upload: a progress bar filling as the take is published. */
function UploadPicture() {
  return (
    <div className="absolute inset-x-4 top-5 flex flex-col gap-2 rounded-[6px] border border-rule bg-surface p-2.5">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-10 items-center justify-center rounded-[4px] bg-[#115e59] text-white">
          <Play size={10} weight="fill" />
        </span>
        <span className="flex-1">
          <span className="block h-1.5 w-[80%] rounded-full bg-ink/25" />
          <span className="mt-1 block text-[8px] leading-3 text-ink-faint">Publishing…</span>
        </span>
      </div>
      <span className="block h-1.5 overflow-hidden rounded-full bg-surface-3">
        <span className="block h-full w-[68%] rounded-full bg-desk" />
      </span>
      <span className="self-end rounded-[4px] bg-ink px-1.5 text-[8px] leading-4 text-white">Upload</span>
    </div>
  )
}

/** Review and publish: a reviewer's tick, then the same video on three papers. */
function PublishPicture() {
  return (
    <div className="absolute inset-x-4 top-4 bottom-4 flex items-center justify-center gap-2">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-desk text-white">
        <CheckCircle size={24} weight="fill" />
      </span>
      <ArrowRight size={14} className="text-ink-faint" />
      <div className="flex flex-col gap-1">
        {['Quiz 1', 'Quiz 2', 'End Term'].map((paper) => (
          <span key={paper} className="flex items-center gap-1.5 rounded-[4px] border border-rule bg-surface px-1.5 py-0.5 text-[8px] text-ink">
            <Play size={8} weight="fill" className="text-desk" />
            {paper}
          </span>
        ))}
      </div>
    </div>
  )
}
