'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { MagnifyingGlass, Play } from '@/components/ui/icons'

/**
 * A short film of the site, played in the page: seven scenes of the real
 * screens, on a laptop and a phone, moving the way the site does. It runs
 * only while on screen, rests while the pointer is over it, and holds still for
 * anyone who has asked their system for less motion.
 *
 * Every picture is a capture of the site itself (public/showcase); the
 * motion is CSS keyframes (globals.css, "sc-…"), set only on the scene that
 * is playing so each element's resting style is its final pose.
 */

const SCENES = [
  { label: 'Every paper', ms: 5200 },
  { label: 'Find a subject', ms: 5200 },
  { label: 'Real exam', ms: 5400 },
  { label: 'Answers', ms: 5200 },
  { label: 'Solutions', ms: 5600 },
  { label: 'Progress', ms: 5200 },
  { label: 'Quiz Space', ms: 4200 },
]

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'

/** The animation for one element of the scene playing; nothing on a scene that is not. */
type Anim = (name: string, ms: number, delay?: number, easing?: string, tail?: string) => CSSProperties | undefined

function animFor(on: boolean): Anim {
  return (name, ms, delay = 0, easing = EASE, tail = 'both') =>
    on ? { animation: `${name} ${ms}ms ${easing} ${delay}ms ${tail}` } : undefined
}

const reducedQuery = '(prefers-reduced-motion: reduce)'
function subscribeReduced(listener: () => void) {
  const query = window.matchMedia(reducedQuery)
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}

export function ProductShowcase() {
  const reduced = useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(reducedQuery).matches,
    () => false,
  )
  // Rests while pointed at, so a scene can be looked at for as long as wanted.
  const [hovered, setHovered] = useState(false)
  const playing = !reduced && !hovered
  const [visible, setVisible] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [index, setIndex] = useState(0)
  const [previous, setPrevious] = useState<number | null>(null)
  const [runs, setRuns] = useState<number[]>(() => SCENES.map((_, i) => (i === 0 ? 1 : 0)))
  const stage = useRef<HTMLDivElement>(null)
  const remaining = useRef(SCENES[0].ms)
  const running = playing && visible && !hidden

  function go(next: number) {
    if (next === index) return
    setPrevious(index)
    setIndex(next)
    setRuns((all) => all.map((count, i) => (i === next ? count + 1 : count)))
  }

  // Plays only while on screen and while the tab is in front.
  useEffect(() => {
    const element = stage.current
    if (!element) return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.35 })
    observer.observe(element)
    const onVisibility = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  // A new scene starts with its whole length to run.
  useEffect(() => {
    remaining.current = SCENES[index].ms
  }, [index])

  // Moves on when the scene's time is up; a pause keeps what was left of it.
  useEffect(() => {
    if (!running) return
    const started = performance.now()
    const timer = setTimeout(() => go((index + 1) % SCENES.length), remaining.current)
    return () => {
      clearTimeout(timer)
      remaining.current -= performance.now() - started
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- go reads index, which is listed
  }, [running, index])

  // The scene going out fades for a moment before it stops.
  useEffect(() => {
    if (previous === null) return
    const timer = setTimeout(() => setPrevious(null), 650)
    return () => clearTimeout(timer)
  }, [previous])

  const scenes = [SceneEveryPaper, SceneFind, SceneExam, SceneAnswers, SceneSolutions, SceneProgress, SceneOutro]

  return (
    <div
      ref={stage}
      data-paused={running ? undefined : ''}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="sc-stage @container relative isolate aspect-[4/5] overflow-hidden rounded-[18px] bg-[#060a1a] text-white md:aspect-video"
    >
      <Backdrop />

      {scenes.map((Scene, i) => {
        const shown = i === index
        const on = shown || i === previous
        return (
          <div
            key={`${i}-${runs[i]}`}
            aria-hidden={!shown}
            className={`absolute inset-0 transition-opacity duration-500 ${shown ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          >
            <Scene a={animFor(on)} on={on} running={running} />
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ pieces */


function Backdrop() {
  return (
    <div aria-hidden="true" className="absolute inset-0 -z-10">
      <div
        className="absolute -top-[20%] -left-[10%] h-[70%] w-[60%] rounded-full bg-[#1d4ed8] opacity-45 blur-[80px]"
        style={{ animation: 'sc-glow 16s ease-in-out infinite' }}
      />
      <div
        className="absolute -right-[10%] -bottom-[25%] h-[70%] w-[55%] rounded-full bg-[#0f766e] opacity-40 blur-[90px]"
        style={{ animation: 'sc-glow 19s ease-in-out -6s infinite reverse' }}
      />
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgb(255 255 255 / 0.05) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.05) 1px, transparent 1px)',
          backgroundSize: '4cqw 4cqw',
          maskImage: 'radial-gradient(ellipse at 60% 40%, black 30%, transparent 75%)',
        }}
      />
    </div>
  )
}

/** The words of a scene: a headline that rises word by word, and a line under it. */
function Caption({ a, title, body }: { a: Anim; title: string; body: string }) {
  return (
    <div className="absolute top-[7cqw] right-[6cqw] left-[6cqw] z-10 md:top-[6.5cqw] md:right-auto md:left-[4.5cqw] md:w-[32cqw]">
      <p className="text-[7.4cqw] leading-[1.08] font-semibold tracking-[-0.02em] md:mt-[0.8cqw] md:text-[3.3cqw]">
        {title.split(' ').map((word, i) => (
          <span key={i} className="mr-[0.25em] inline-block overflow-hidden pb-[0.08em] align-bottom">
            <span className="inline-block" style={a('sc-word', 800, 120 + i * 70)}>
              {word}
            </span>
          </span>
        ))}
      </p>
      <p className="mt-[2.5cqw] text-[3.6cqw] leading-relaxed text-white/70 md:mt-[1.2cqw] md:text-[1.3cqw]" style={a('sc-fade', 900, 600)}>
        {body}
      </p>
    </div>
  )
}

function Browser({
  src,
  url,
  className,
  style,
  imageStyle,
  dim = false,
  children,
}: {
  src: string
  url: string
  className: string
  style?: CSSProperties
  imageStyle?: CSSProperties
  /** Set back, behind what the scene is about. */
  dim?: boolean
  children?: ReactNode
}) {
  return (
    <div className={`absolute hidden md:block ${className}`} style={style}>
      <div className={`overflow-hidden rounded-[0.9cqw] bg-white shadow-[0_3cqw_6cqw_-1.5cqw_rgba(0,0,0,0.7)] ring-1 ring-white/15 ${dim ? 'opacity-50' : ''}`}>
        <div className="flex items-center gap-[0.45cqw] bg-[#eef0f4] px-[0.9cqw] py-[0.6cqw]">
          <span className="h-[0.6cqw] w-[0.6cqw] rounded-full bg-[#ff5f57]" />
          <span className="h-[0.6cqw] w-[0.6cqw] rounded-full bg-[#febc2e]" />
          <span className="h-[0.6cqw] w-[0.6cqw] rounded-full bg-[#28c840]" />
          <span className="ml-[0.8cqw] truncate rounded-full bg-white px-[1cqw] py-[0.2cqw] text-[0.75cqw] text-[#57534e]">{url}</span>
        </div>
        <div className="relative aspect-[16/10] overflow-hidden">
          <Image src={src} alt="" fill unoptimized sizes="60vw" className="object-cover object-top" style={{ transformOrigin: 'top left', ...imageStyle }} />
          {children}
        </div>
      </div>
    </div>
  )
}

function Phone({ src, className, style, children }: { src: string; className: string; style?: CSSProperties; children?: ReactNode }) {
  return (
    <div className={`absolute ${className}`} style={style}>
      <div className="rounded-[15%/7%] bg-[#0b0b0f] p-[3.4%] shadow-[0_4cqw_7cqw_-2cqw_rgba(0,0,0,0.8)] ring-1 ring-white/20">
        <div className="relative aspect-[390/844] overflow-hidden rounded-[12%/5.6%] bg-white">
          <Image src={src} alt="" fill unoptimized sizes="30vw" className="object-cover object-top" />
          {children}
          <span className="absolute top-[1.3%] left-1/2 h-[3%] w-[30%] -translate-x-1/2 rounded-full bg-black" />
        </div>
      </div>
    </div>
  )
}

function Chip({ children, className, style }: { children: ReactNode; className: string; style?: CSSProperties }) {
  return (
    <span
      className={`absolute hidden items-center gap-[0.5cqw] rounded-full border border-white/20 bg-white/10 px-[1.2cqw] py-[0.55cqw] text-[1.05cqw] whitespace-nowrap text-white backdrop-blur-md md:inline-flex ${className}`}
      style={style}
    >
      {children}
    </span>
  )
}

const float = (a: Anim, delay: number) => a('sc-float', 3200, delay, 'ease-in-out', 'infinite alternate')

/* ------------------------------------------------------------------ scenes */

type SceneProps = { a: Anim; on: boolean; running: boolean }

function SceneEveryPaper({ a }: SceneProps) {
  return (
    <>
      <Caption a={a} title="Every IITM BS paper, in one place." body="Qualifier, Quiz 1, Quiz 2 and End Term papers for every subject, with answers. Free." />
      <Browser src="/showcase/d-papers.webp" url="quizspace.unknowniitians.com/exam/end-term" className="top-[9cqw] left-[52cqw] w-[42cqw]" dim style={a('sc-tilt', 1300)} />
      <div className="absolute top-[15cqw] left-[39cqw] hidden w-[47cqw] md:block" style={a('sc-tilt', 1300, 160)}>
        <div style={float(a, 1500)}>
          <Browser src="/showcase/d-home.webp" url="quizspace.unknowniitians.com" className="relative !block w-full" />
        </div>
      </div>
      <Phone src="/showcase/m-home.webp" className="top-[50cqw] left-[27cqw] w-[46cqw] md:top-[19cqw] md:left-[81cqw] md:w-[14cqw]" style={a('sc-from-right', 1200, 650)} />
      {['Qualifier', 'Quiz 1', 'Quiz 2', 'End Term'].map((exam, i) => (
        <Chip key={exam} className={['top-[8cqw] left-[40cqw]', 'top-[5.5cqw] left-[53cqw]', 'top-[5.5cqw] left-[64.5cqw]', 'top-[8cqw] left-[76cqw]'][i]} style={a('sc-pop', 700, 1100 + i * 140)}>
          {exam}
        </Chip>
      ))}
    </>
  )
}

function SceneFind({ a }: SceneProps) {
  return (
    <>
      <Caption a={a} title="Find your subject in a second." body="Every level of Data Science and Electronic Systems, and a search that knows course codes and nicknames." />
      <Browser src="/showcase/d-subjects.webp" url="quizspace.unknowniitians.com/program/data-science" className="top-[8cqw] left-[40cqw] w-[54cqw]" style={a('sc-rise', 1100)} />
      {/* The search box, typing. */}
      <div className="absolute top-[13.5cqw] left-[47cqw] hidden w-[30cqw] md:block" style={a('sc-pop', 700, 700)}>
        <div className="flex items-center gap-[0.8cqw] rounded-full bg-white px-[1.4cqw] py-[0.9cqw] text-[1.3cqw] text-[#0c0a09] shadow-[0_1.5cqw_3cqw_-0.5cqw_rgba(0,0,0,0.45)] ring-2 ring-[#1d4ed8]">
          <MagnifyingGlass size={18} aria-hidden="true" className="shrink-0 text-[#57534e]" />
          <span className="whitespace-nowrap">
            {'DBMS'.split('').map((letter, i) => (
              <span key={i} style={a('sc-fade', 1, 1300 + i * 190, 'linear')}>
                {letter}
              </span>
            ))}
          </span>
          <span className="-ml-[0.6cqw] h-[1.5cqw] w-[2px] bg-[#1d4ed8]" style={a('sc-caret', 900, 0, 'steps(1)', 'infinite')} />
        </div>
        <div className="mt-[0.8cqw] rounded-[0.8cqw] bg-white px-[1.4cqw] py-[1cqw] text-[1.1cqw] text-[#0c0a09] shadow-[0_1.5cqw_3cqw_-0.5cqw_rgba(0,0,0,0.45)]" style={a('sc-rise', 700, 2400)}>
          Database Management Systems <span className="text-[#57534e]">(BSCS2001)</span>
        </div>
      </div>
      <Phone src="/showcase/m-subject.webp" className="top-[50cqw] left-[27cqw] w-[46cqw] md:top-[21cqw] md:left-[82cqw] md:w-[14cqw]" style={a('sc-from-right', 1200, 1100)} />
    </>
  )
}

function SceneExam({ a, running }: SceneProps) {
  return (
    <>
      <Caption a={a} title="Sit the real exam screen." body="The timer, palette, Mark for Review and Save & Next of the IITM exam portal, so nothing is new on the day." />
      <Browser
        src="/showcase/d-exam.webp"
        url="quizspace.unknowniitians.com/practice"
        className="top-[8cqw] left-[38cqw] w-[56cqw]"
        style={a('sc-rise', 1100)}
        imageStyle={a('sc-zoom', 6000, 400, 'linear')}
      />
      {/* The timer, counting down. */}
      <div className="absolute top-[4cqw] left-[79cqw] z-10 hidden rounded-[0.9cqw] bg-[#0c0a09] px-[1.4cqw] py-[0.9cqw] shadow-[0_1.5cqw_3cqw_-0.5cqw_rgba(0,0,0,0.6)] ring-1 ring-white/15 md:block" style={a('sc-pop', 700, 700)}>
        <p className="text-[0.8cqw] tracking-[0.18em] text-white/60">TIME LEFT</p>
        <Countdown className="text-[2cqw] font-semibold" running={running} />
      </div>
      {/* The palette, filling as questions are answered. */}
      <div className="absolute top-[31cqw] left-[4.5cqw] hidden w-[22cqw] rounded-[1cqw] bg-white/10 p-[1.3cqw] ring-1 ring-white/15 backdrop-blur-md md:block" style={a('sc-rise', 900, 900)}>
        <p className="mb-[0.9cqw] text-[1cqw] text-white/70">Choose a question</p>
        <div className="grid grid-cols-6 gap-[0.6cqw]">
          {Array.from({ length: 18 }, (_, i) => (
            <span
              key={i}
              className="flex aspect-square items-center justify-center rounded-[0.4cqw] bg-white/10 text-[0.9cqw] text-white tabular-nums"
              style={i < 11 ? a('sc-cell', 350, 1300 + i * 230) : undefined}
            >
              {i + 1}
            </span>
          ))}
        </div>
      </div>
      <Phone src="/showcase/m-exam.webp" className="top-[50cqw] left-[27cqw] w-[46cqw] md:hidden" style={a('sc-rise', 1100, 300)} />
      <div className="absolute top-[58cqw] right-[5cqw] z-10 rounded-[2cqw] bg-[#0c0a09] px-[3cqw] py-[2cqw] ring-1 ring-white/15 md:hidden" style={a('sc-pop', 700, 800)}>
        <p className="text-[2.4cqw] tracking-[0.18em] text-white/60">TIME LEFT</p>
        <Countdown className="text-[4.4cqw] font-semibold" running={running} />
      </div>
    </>
  )
}

/** Two hours, counting down a second at a time while the scene plays. */
function Countdown({ className, running }: { className: string; running: boolean }) {
  const [gone, setGone] = useState(0)
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setGone((seconds) => seconds + 1), 1000)
    return () => clearInterval(timer)
  }, [running])
  const left = 2 * 60 * 60 - 1 - gone
  const pad = (value: number) => String(value).padStart(2, '0')
  return (
    <p className={`font-mono tabular-nums ${className}`}>
      {pad(Math.floor(left / 3600))}:{pad(Math.floor((left % 3600) / 60))}:{pad(left % 60)}
    </p>
  )
}

function SceneAnswers({ a }: SceneProps) {
  return (
    <>
      <Caption a={a} title="Check every answer." body="Reveal the answer key on any question, on your phone or your laptop, and see what you got right." />
      <Browser src="/showcase/d-learn.webp" url="quizspace.unknowniitians.com/practice" className="top-[12cqw] left-[36cqw] w-[40cqw]" dim style={a('sc-rise', 1100)} />
      <Phone src="/showcase/m-q-before.webp" className="top-[44cqw] left-[20cqw] w-[60cqw] md:top-[3.5cqw] md:left-[62cqw] md:w-[22cqw]" style={a('sc-rise', 1100, 250)}>
        <Image src="/showcase/m-q-after.webp" alt="" fill unoptimized sizes="30vw" className="object-cover object-top" style={a('sc-fade', 450, 2100)} />
        {/* The tap on "Show answer". */}
        <span
          className="absolute top-[72.3%] left-[20%] aspect-square w-[34%] rounded-full bg-[#1d4ed8]/40"
          style={{ opacity: 0, ...a('sc-ripple', 800, 1500, 'ease-out') }}
        />
      </Phone>
      {/* The tick, landing on the right answer. */}
      <span
        className="absolute top-[98cqw] left-[69cqw] z-10 flex h-[10cqw] w-[10cqw] items-center justify-center rounded-full bg-[#16a34a] text-[5cqw] text-white shadow-[0_0_0_1.5cqw_rgba(22,163,74,0.25)] md:top-[23.5cqw] md:left-[78cqw] md:h-[4cqw] md:w-[4cqw] md:text-[2cqw]"
        style={a('sc-pop', 600, 2500)}
      >
        ✓
      </span>
      <div
        className="absolute top-[30cqw] left-[36cqw] z-10 hidden rounded-[1cqw] bg-white px-[1.6cqw] py-[1.1cqw] text-[#0c0a09] shadow-[0_2cqw_4cqw_-1cqw_rgba(0,0,0,0.6)] md:block"
        style={a('sc-from-left', 900, 2800)}
      >
        <p className="text-[0.95cqw] text-[#16a34a]">Correct answer</p>
        <p className="mt-[0.2cqw] text-[1.4cqw] font-medium">B. Query Optimizer</p>
      </div>
    </>
  )
}

function SceneSolutions({ a }: SceneProps) {
  const stroke = (delay: number, ms = 700) => a('sc-draw', ms, delay, 'ease-in-out')
  return (
    <>
      <Caption a={a} title="Watch the solution." body="Teachers work each question out on a board, and the video opens right beside it while you practise." />
      <Browser src="/showcase/d-learn.webp" url="quizspace.unknowniitians.com/practice" className="top-[8cqw] left-[38cqw] w-[56cqw]" dim style={a('sc-rise', 1000)} />
      {/* The solution card, growing from its corner into the video. */}
      <div className="absolute top-[50cqw] left-[8cqw] z-10 w-[84cqw] md:top-[13cqw] md:left-[44cqw] md:w-[42cqw]" style={{ transformOrigin: 'bottom left', ...a('sc-grow', 1100, 800) }}>
        <div className="overflow-hidden rounded-[1cqw] bg-[#115e59] shadow-[0_3cqw_6cqw_-1.5cqw_rgba(0,0,0,0.7)] ring-1 ring-[#134e4a]">
          <div className="flex items-center gap-[1.2cqw] px-[2.2cqw] py-[1.8cqw] md:gap-[0.6cqw] md:px-[1.2cqw] md:py-[0.9cqw]">
            <span className="flex h-[5cqw] w-[5cqw] items-center justify-center rounded-[0.8cqw] bg-white/15 md:h-[2cqw] md:w-[2cqw] md:rounded-[0.4cqw]">
              <Play size={12} weight="fill" aria-hidden="true" />
            </span>
            <span className="text-[3.6cqw] font-semibold md:text-[1.25cqw]">Video solution</span>
          </div>
          <div
            className="relative aspect-video bg-white"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(15,118,110,0.09) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,118,110,0.09) 1px, transparent 1px)',
              backgroundSize: '1.6cqw 1.6cqw',
            }}
          >
            {/* The board: the question's number, an arrow, the answer boxed, notes under it. */}
            <svg viewBox="0 0 320 180" className="absolute inset-0 h-full w-full" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <g stroke="#0c0a09" strokeWidth="4">
                <path pathLength={1} strokeDasharray="1" d="M52 44 C 30 44, 26 84, 48 88 C 70 92, 76 50, 52 44 Z" style={stroke(1800)} />
                <path pathLength={1} strokeDasharray="1" d="M58 78 L 70 94" style={stroke(2300, 300)} />
                <path pathLength={1} strokeDasharray="1" d="M86 52 L 96 44 L 96 92" style={stroke(2500, 500)} />
              </g>
              <path pathLength={1} strokeDasharray="1" stroke="#0f766e" strokeWidth="4" d="M28 106 C 56 99, 84 110, 112 102" style={stroke(2900, 500)} />
              <path pathLength={1} strokeDasharray="1" stroke="#0f766e" strokeWidth="3.5" d="M118 68 C 134 66, 146 66, 160 66 M152 59 L 161 66 L 152 73" style={stroke(3300, 500)} />
              <path pathLength={1} strokeDasharray="1" stroke="#dc2626" strokeWidth="3.5" d="M170 46 L 298 44 L 300 88 L 172 90 Z" style={stroke(3700, 700)} />
              <text x="236" y="72" textAnchor="middle" fontSize="15" fill="#0c0a09" style={{ fontFamily: 'inherit', ...a('sc-fade', 500, 4200) }}>
                Query Optimizer
              </text>
              <g stroke="#78716c" strokeWidth="2.5" opacity="0.7">
                <path pathLength={1} strokeDasharray="1" d="M172 112 L 290 112" style={stroke(4400, 400)} />
                <path pathLength={1} strokeDasharray="1" d="M172 128 L 270 128" style={stroke(4600, 400)} />
                <path pathLength={1} strokeDasharray="1" d="M172 144 L 282 144" style={stroke(4800, 400)} />
              </g>
            </svg>
            {/* The player's progress line. */}
            <span className="absolute inset-x-0 bottom-0 h-[0.8cqw] bg-black/10 md:h-[0.35cqw]">
              <span className="block h-full origin-left bg-[#dc2626]" style={{ transform: 'scaleX(0.02)', ...a('sc-progress', 4200, 1500, 'linear') }} />
            </span>
          </div>
        </div>
      </div>
    </>
  )
}

function SceneProgress({ a }: SceneProps) {
  return (
    <>
      <Caption a={a} title="See where your marks go." body="Scores, speed and accuracy after every paper, and a mistake bank that brings wrong answers back." />
      <div className="absolute top-[9cqw] left-[38cqw] hidden w-[50cqw] md:block" style={a('sc-tilt', 1200)}>
        <div style={float(a, 1400)}>
          <Browser src="/showcase/d-dashboard.webp" url="quizspace.unknowniitians.com/dashboard" className="relative !block w-full" imageStyle={{ objectPosition: 'left top' }} />
        </div>
      </div>
      <Phone src="/showcase/m-mistakes.webp" className="top-[50cqw] left-[27cqw] w-[46cqw] md:top-[21cqw] md:left-[81cqw] md:w-[14cqw]" style={a('sc-from-right', 1200, 700)} />
      {['Recent form', 'Speed vs accuracy', 'Mistake bank'].map((label, i) => (
        <Chip key={label} className={['top-[5cqw] left-[40cqw]', 'top-[5cqw] left-[52cqw]', 'top-[5cqw] left-[67cqw]'][i]} style={a('sc-pop', 700, 1200 + i * 180)}>
          {label}
        </Chip>
      ))}
    </>
  )
}

function SceneOutro({ a }: SceneProps) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-[8cqw] pb-[10cqw] text-center md:pb-[4cqw]">
      <div className="flex items-center" style={a('sc-pop', 900, 100)}>
        <Image src="/brand/quizspace-mark.webp" alt="" width={120} height={120} unoptimized className="mr-[1cqw] h-[16cqw] w-[16cqw] brightness-0 invert md:mr-[0.4cqw] md:h-[6.5cqw] md:w-[6.5cqw]" />
        <span className="text-[12cqw] leading-none font-semibold tracking-[-0.03em] md:text-[5.2cqw]">uiz Space</span>
      </div>
      <p className="mt-[4cqw] max-w-[80cqw] text-[4.2cqw] text-white/75 md:mt-[1.8cqw] md:max-w-[46cqw] md:text-[1.6cqw]" style={a('sc-rise', 900, 700)}>
        Free previous year papers for the IIT Madras BS degree, with answers, solutions and timed mock tests.
      </p>
      <div className="mt-[6cqw] md:mt-[2.6cqw]" style={a('sc-rise', 900, 1100)}>
        <Link
          href="/subjects"
          className="inline-flex items-center rounded-full bg-white px-[6cqw] py-[3cqw] text-[4cqw] font-medium text-[#060a1a] transition-transform hover:scale-105 md:px-[2.4cqw] md:py-[1.1cqw] md:text-[1.35cqw]"
        >
          Start practising
        </Link>
      </div>
      <p className="mt-[5cqw] text-[3.2cqw] text-white/50 md:mt-[2cqw] md:text-[1cqw]" style={a('sc-fade', 800, 1500)}>
        A product by Unknown IITians
      </p>
    </div>
  )
}
