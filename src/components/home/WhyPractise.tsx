import Image from 'next/image'
import type { ReactNode } from 'react'

/** The subjects shown on the "every subject" card: one from each stage, the ones most students look for first. */
const SUBJECT_ART = [
  'maths-1',
  'statistics-1',
  'computational-thinking',
  'python',
  'english-1',
  'dbms',
  'pdsa',
  'java',
  'mad-1',
  'mlf',
  'deep-learning',
  'estc',
]

/** The weeks of a term each exam tests: "main" carries the weight, "also" is covered too. */
const EXAM_WEEKS: { exam: string; main: [number, number]; also?: [number, number] }[] = [
  { exam: 'Quiz 1', main: [1, 4] },
  { exam: 'Quiz 2', main: [5, 8], also: [1, 4] },
  { exam: 'End Term', main: [1, 12] },
]

const SHOT = 'rounded-tl-[10px] border border-rule bg-white shadow-sm'

/**
 * Why practise here, each reason shown with the part of the site it is about:
 * the answer key, the solution card, the weeks each exam covers, the
 * discussion under a question, a question on a phone, the subjects. The
 * pictures are the site's own screens and drawings.
 */
export function WhyPractise({ subjects, since }: { subjects: number; since: number }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Reason
        wide
        title="Answers for every question"
        body="Every paper shows its answer key. Mock tests are marked the moment you submit, with where you lost time and marks."
      >
        <Image
          src="/art/home/answer-key.webp"
          alt="A DBMS question with its correct answer, Query Optimizer, marked in green"
          width={995}
          height={500}
          className={`absolute top-8 left-6 w-[32rem] max-w-none lg:w-[40rem] ${SHOT}`}
        />
      </Reason>

      <Reason
        title="Solutions to the questions"
        body="Worked solutions sit under the answer, and questions with a video solution open it from the corner of the screen while you practise."
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <Image
            src="/art/home/solution-card.webp"
            alt="The Watch the solution card for a DBMS question, with its board-style thumbnail"
            width={261}
            height={194}
            className="w-[14rem] rounded-[6px] shadow-md"
          />
        </div>
      </Reason>

      <Reason
        title="Discuss any question"
        body="Every question has its own discussion. Ask where you got stuck, answer someone else, and follow the replies right under the question."
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <Image src="/art/states/no-discussion.webp" alt="" width={720} height={720} className="h-44 w-44" />
        </div>
      </Reason>

      <Reason
        wide
        title="Practise week by week"
        body="Quiz 1 covers weeks 1–4, Quiz 2 weeks 1–8 with most questions from weeks 5–8, and the End Term all twelve weeks. Practise the papers that match the weeks your next exam tests."
      >
        <WeekChart />
      </Reason>

      <Reason
        wide
        title="Free, and every subject"
        body={`${subjects} subjects from Foundation to degree, Data Science and Electronic Systems, from ${since} onwards. No paywall.`}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="grid w-max grid-cols-4 gap-3 lg:grid-cols-6">
            {SUBJECT_ART.map((slug) => (
              <span
                key={slug}
                className="flex h-14 w-14 items-center justify-center rounded-[10px] border border-rule bg-white shadow-sm lg:h-[4.5rem] lg:w-[4.5rem]"
              >
                <Image src={`/art/subjects/${slug}.png`} alt="" width={48} height={48} className="h-3/5 w-3/5" />
              </span>
            ))}
          </div>
        </div>
      </Reason>

      <Reason
        title="Real questions, as text"
        body="Tables, code, equations and ER diagrams are drawn from data, not pasted as screenshots — searchable, sharp on a phone and correct in dark mode."
      >
        {/* A phone, cut off at the panel's foot. */}
        <div className="absolute top-8 left-1/2 w-[12.5rem] -translate-x-1/2 overflow-hidden rounded-t-[26px] border-[7px] border-b-0 border-ink bg-white shadow-sm">
          <Image
            src="/art/banners/phone-question.webp"
            alt="A normal-form question from DBMS, read on a phone"
            width={360}
            height={770}
            className="block w-full"
          />
        </div>
      </Reason>
    </ul>
  )
}

/** The twelve weeks of a term, and which of them each exam tests. */
function WeekChart() {
  const weeks = Array.from({ length: 12 }, (_, index) => index + 1)
  const within = (week: number, range?: [number, number]) => !!range && week >= range[0] && week <= range[1]
  return (
    <div className="absolute inset-0 flex items-center justify-center px-6">
      <div className="w-full max-w-[20rem] rounded-[10px] border border-rule bg-white p-4 shadow-sm lg:max-w-[30rem] lg:p-5">
        <div className="mb-2 flex justify-between pl-[4.5rem] text-[0.6875rem] text-ink-faint tabular-nums">
          <span>Week 1</span>
          <span>12</span>
        </div>
        <div className="flex flex-col gap-2.5">
          {EXAM_WEEKS.map(({ exam, main, also }) => (
            <div key={exam} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-meta text-ink">{exam}</span>
              <span className="grid flex-1 grid-cols-12 gap-[3px]">
                {weeks.map((week) => (
                  <span
                    key={week}
                    className={`h-5 rounded-[3px] ${
                      within(week, main) ? 'bg-accent' : within(week, also) ? 'bg-accent/35' : 'bg-surface-2'
                    }`}
                  />
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Reason({ title, body, wide = false, children }: { title: string; body: string; wide?: boolean; children: ReactNode }) {
  return (
    <li className={`flex flex-col overflow-hidden rounded-card border border-rule bg-surface ${wide ? 'lg:col-span-2' : ''}`}>
      <div aria-hidden="true" className="relative h-60 shrink-0 overflow-hidden bg-accent-soft lg:h-72">
        {children}
      </div>
      <div className="p-5">
        <h3 className="text-card text-ink">{title}</h3>
        <p className="mt-1.5 text-ui leading-relaxed text-ink-muted">{body}</p>
      </div>
    </li>
  )
}
