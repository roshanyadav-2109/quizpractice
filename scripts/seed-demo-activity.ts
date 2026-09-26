/**
 * Fills the Demo Student with a realistic week of practice, so the dashboard
 * has something to show: trends, deltas, a split of answers, weak subjects,
 * an activity calendar and a leaderboard entry.
 *
 *   npm run demo:activity
 *
 * Re-runnable: it first removes every attempt the Demo Student has, then sits
 * 17 real papers across seven subjects over the last seven days — a heavy day,
 * a light day, a rest day — getting better as the week goes on. Each answer is
 * marked by the app's own gradeQuestion, so scores and negative marks are
 * exactly what a real submission would get.
 *
 * Demo data only: it touches nothing but the demo@example.com account.
 */
import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { gradeAttempt, isAutoMarkable } from '../src/lib/scoring'
import type { AnswerResponse, QuestionWithOptions } from '../src/types/db'

loadEnv({ path: '.env.local', quiet: true })
loadEnv({ quiet: true })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}
const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

const DEMO_EMAIL = 'demo@example.com'

/** How strong the student is in each subject, relative to their overall level. */
const SUBJECTS: Record<string, number> = {
  python: 0.12,
  'computational-thinking': 0.08,
  dbms: 0.02,
  java: -0.02,
  pdsa: -0.06,
  'system-commands': -0.04,
  'maths-1': -0.14,
}

/** Papers per day, oldest first, ending today. */
const WEEK = [3, 1, 0, 4, 2, 5, 2]

// A seeded generator, so a re-run produces the same week.
let seed = 20260926
function random(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
const pick = <T,>(items: T[]): T => items[Math.floor(random() * items.length)]
const between = (low: number, high: number) => low + random() * (high - low)

async function main() {
  const { data: profile } = await supabase.from('profiles').select('id').eq('email', DEMO_EMAIL).single()
  if (!profile) throw new Error(`No profile for ${DEMO_EMAIL} — run npm run demo:users first.`)
  const userId = profile.id as string

  // 1. Start from a clean slate. attempt_answers cascade with their attempt.
  const { count: removed } = await supabase.from('attempts').delete({ count: 'exact' }).eq('user_id', userId)
  console.log(`removed ${removed ?? 0} earlier demo attempts`)

  // 2. Candidate papers: published sets with enough auto-marked questions.
  const subjectSlugs = Object.keys(SUBJECTS)
  const { data: sets } = await supabase
    .from('question_sets')
    .select('id, question_papers!inner(status, subjects!inner(slug))')
    .eq('question_papers.status', 'published')
    .in('question_papers.subjects.slug', subjectSlugs)
    .limit(1000)
  type SetRow = { id: string; question_papers: { subjects: { slug: string } } }
  const bySubject = new Map<string, string[]>()
  for (const set of (sets ?? []) as unknown as SetRow[]) {
    const slug = set.question_papers.subjects.slug
    bySubject.set(slug, [...(bySubject.get(slug) ?? []), set.id])
  }

  // 3. The schedule: which day, which hour, which subject.
  const total = WEEK.reduce((sum, n) => sum + n, 0)
  const todayIst = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
  const plan: { submittedAt: Date; subject: string }[] = []
  const rotation = [...subjectSlugs]
  WEEK.forEach((papers, dayIndex) => {
    const daysAgo = WEEK.length - 1 - dayIndex
    const hours = Array.from({ length: papers }, () => between(8, 23)).sort((a, b) => a - b)
    for (const hour of hours) {
      // Midnight IST of that day, then the hour; IST is UTC+5:30.
      const date = new Date(`${todayIst}T00:00:00+05:30`)
      date.setUTCDate(date.getUTCDate() - daysAgo)
      date.setTime(date.getTime() + hour * 3600 * 1000)
      if (date.getTime() > Date.now()) date.setTime(Date.now() - between(20, 90) * 60 * 1000)
      plan.push({ submittedAt: date, subject: rotation[plan.length % rotation.length] })
    }
  })

  const used = new Set<string>()
  let made = 0
  for (const [index, item] of plan.entries()) {
    const progress = total > 1 ? index / (total - 1) : 1
    const candidates = (bySubject.get(item.subject) ?? []).filter((id) => !used.has(id))
    if (!candidates.length) continue

    // Try a few sets until one has enough auto-marked questions.
    let questions: QuestionWithOptions[] = []
    let setId = ''
    for (let tries = 0; tries < 6 && candidates.length; tries++) {
      setId = candidates.splice(Math.floor(random() * candidates.length), 1)[0]
      const { data } = await supabase
        .from('questions')
        .select('*, options:question_options(*)')
        .eq('set_id', setId)
        .order('number')
      questions = ((data ?? []) as QuestionWithOptions[]).map((q) => ({
        ...q,
        options: [...q.options].sort((a, b) => a.sort_order - b.sort_order),
      }))
      if (questions.filter((q) => isAutoMarkable(q)).length >= 8) break
      questions = []
    }
    if (!questions.length) continue
    used.add(setId)

    // The student: more right and less skipped as the week goes on.
    const strength = Math.min(0.9, Math.max(0.15, 0.42 + 0.3 * progress + SUBJECTS[item.subject]))
    const skipRate = Math.max(0.05, 0.26 - 0.18 * progress)
    const pace = 1.15 - 0.35 * progress

    const responses: Record<string, AnswerResponse | null> = {}
    const timings: Record<string, number> = {}
    for (const question of questions) {
      const base = question.type === 'numerical' ? 110 : question.type === 'msq' ? 95 : 65
      timings[question.id] = Math.round(base * pace * between(0.45, 1.7))

      if (!isAutoMarkable(question)) {
        responses[question.id] = random() < 0.5 ? { text: 'Worked answer written in the exam.' } : null
        continue
      }
      if (random() < skipRate) {
        responses[question.id] = null
        timings[question.id] = Math.round(timings[question.id] * 0.3)
        continue
      }
      const right = random() < strength
      const correct = question.options.filter((o) => o.is_correct).map((o) => o.id)
      const wrong = question.options.filter((o) => !o.is_correct).map((o) => o.id)

      if (question.type === 'numerical') {
        const expected = Number(question.correct_answer)
        responses[question.id] = {
          value: right || !Number.isFinite(expected)
            ? String(question.correct_answer ?? '')
            : String(Math.round((expected + pick([-3, -2, -1, 1, 2, 5])) * 100) / 100),
        }
      } else if (question.type === 'msq') {
        responses[question.id] = {
          option_ids: right
            ? correct
            : [...correct.slice(0, Math.max(0, correct.length - 1)), ...(wrong.length ? [pick(wrong)] : [])],
        }
      } else {
        responses[question.id] = { option_ids: right || !wrong.length ? correct.slice(0, 1) : [pick(wrong)] }
      }
    }

    const graded = gradeAttempt(questions, responses)
    const duration = Object.values(timings).reduce((sum, t) => sum + t, 0)
    const { data: attempt, error } = await supabase
      .from('attempts')
      .insert({
        user_id: userId,
        set_id: setId,
        mode: 'exam',
        started_at: new Date(item.submittedAt.getTime() - duration * 1000).toISOString(),
        submitted_at: item.submittedAt.toISOString(),
        score: graded.score,
        max_score: graded.maxScore,
        duration_seconds: duration,
      })
      .select('id')
      .single()
    if (error || !attempt) throw new Error(`attempt insert failed: ${error?.message}`)

    const rows = questions.map((question) => {
      const result = graded.results.find((r) => r.questionId === question.id)
      return {
        attempt_id: attempt.id,
        question_id: question.id,
        response: responses[question.id] ?? null,
        is_correct: result?.autoMarked ? result.isCorrect : null,
        marks_awarded: result?.marksAwarded ?? 0,
        time_spent_seconds: timings[question.id],
      }
    })
    const { error: answerError } = await supabase.from('attempt_answers').insert(rows)
    if (answerError) throw new Error(`answer insert failed: ${answerError.message}`)

    made += 1
    const pct = graded.maxScore ? Math.round((graded.score / graded.maxScore) * 100) : 0
    console.log(
      `${item.submittedAt.toISOString().slice(0, 16)}  ${item.subject.padEnd(24)} ${String(pct).padStart(3)}%  ${questions.length} questions`,
    )
  }
  console.log(`\nsat ${made} papers for ${DEMO_EMAIL}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
