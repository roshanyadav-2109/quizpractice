import { timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cronSecret, supabaseServiceRoleKey, supabaseUrl } from '@/lib/env'

/**
 * The daily pass over student-suggested answers (run by Vercel Cron,
 * vercel.json), for questions the site has no answer key for yet. A
 * question's suggestions fill its key in once enough of them agree —
 * see 0040_answer_suggestions.sql for why suggestions are otherwise
 * unreadable, and src/components/exam/SuggestAnswer.tsx for where they
 * come from.
 *
 * A choice question needs a clear majority pick; a numerical one needs its
 * suggestions to cluster tightly (the spread becomes the tolerance, the
 * middle of the cluster becomes the answer) rather than merely agree to two
 * decimal places, since the point is to recover the real graded range.
 *
 * With CRON_SECRET set only Vercel may call it.
 */
const MIN_SUGGESTIONS = 3
const MAJORITY_RATIO = 0.6

export async function GET(request: NextRequest) {
  const secret = cronSecret()
  if (secret && !sameText(request.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return Response.json({ error: 'Not allowed.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }

  const db = createClient(supabaseUrl(), supabaseServiceRoleKey(), { auth: { persistSession: false } })

  const choiceResult = await resolveChoiceQuestions(db)
  const numericResult = await resolveNumericalQuestions(db)

  return Response.json(
    { ok: true, choice: choiceResult, numerical: numericResult },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

async function resolveChoiceQuestions(db: SupabaseClient) {
  const { data: questions, error } = await db
    .from('questions')
    .select('id, type, options:question_options(id, is_correct)')
    .in('type', ['mcq', 'msq'])
    .returns<{ id: string; type: 'mcq' | 'msq'; options: { id: string; is_correct: boolean }[] }[]>()
  if (error) return { error: error.message, resolved: 0 }

  const withoutKey = (questions ?? []).filter((q) => !q.options.some((o) => o.is_correct))
  if (!withoutKey.length) return { resolved: 0, checked: 0 }

  let resolved = 0
  for (const question of withoutKey) {
    const { data: suggestions, error: sErr } = await db
      .from('answer_suggestions')
      .select('option_ids')
      .eq('question_id', question.id)
      .not('option_ids', 'is', null)
      .returns<{ option_ids: string[] }[]>()
    if (sErr || !suggestions || suggestions.length < MIN_SUGGESTIONS) continue

    const tally = new Map<string, number>()
    for (const s of suggestions) {
      const key = [...s.option_ids].sort().join(',')
      if (!key) continue
      tally.set(key, (tally.get(key) ?? 0) + 1)
    }
    const [topKey, topCount] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0]
    if (!topKey || topCount / suggestions.length < MAJORITY_RATIO) continue

    const winningIds = new Set(topKey.split(','))
    const validIds = new Set(question.options.map((o) => o.id))
    if (![...winningIds].every((id) => validIds.has(id))) continue // a suggestion referenced a stale/deleted option

    for (const id of winningIds) {
      const { error: uErr } = await db.from('question_options').update({ is_correct: true }).eq('id', id)
      if (uErr) continue
    }
    resolved++
  }
  return { resolved, checked: withoutKey.length }
}

async function resolveNumericalQuestions(db: SupabaseClient) {
  const { data: questions, error } = await db
    .from('questions')
    .select('id, correct_answer')
    .eq('type', 'numerical')
    .or('correct_answer.is.null,correct_answer.eq.')
    .returns<{ id: string; correct_answer: string | null }[]>()
  if (error) return { error: error.message, resolved: 0 }
  if (!questions?.length) return { resolved: 0, checked: 0 }

  let resolved = 0
  for (const question of questions) {
    const { data: suggestions, error: sErr } = await db
      .from('answer_suggestions')
      .select('value')
      .eq('question_id', question.id)
      .not('value', 'is', null)
      .returns<{ value: string }[]>()
    if (sErr || !suggestions) continue

    const values = suggestions.map((s) => Number(s.value)).filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
    if (values.length < MIN_SUGGESTIONS) continue

    const cluster = tightestCluster(values, MAJORITY_RATIO)
    if (!cluster || cluster.length < MIN_SUGGESTIONS) continue

    const mid = (cluster[0] + cluster[cluster.length - 1]) / 2
    const tolerance = (cluster[cluster.length - 1] - cluster[0]) / 2

    const { error: uErr } = await db
      .from('questions')
      .update({ correct_answer: String(round(mid)), answer_tolerance: round(tolerance) })
      .eq('id', question.id)
    if (uErr) continue
    resolved++
  }
  return { resolved, checked: questions.length }
}

/**
 * The largest run of sorted values that all sit within 10% of the run's own
 * spread from its neighbours — a plain "everyone within X" band would let one
 * cluster of close values and one of wildly different ones both count as
 * agreement; this instead grows a window only while values keep landing close
 * together, the same idea the official range answers already assume.
 */
function tightestCluster(sorted: number[], minShare: number): number[] | null {
  let best: number[] = []
  let start = 0
  for (let end = 1; end <= sorted.length; end++) {
    if (end < sorted.length) {
      const gap = sorted[end] - sorted[end - 1]
      const span = Math.max(Math.abs(sorted[end - 1]), 1)
      if (gap / span > 0.1) {
        const run = sorted.slice(start, end)
        if (run.length > best.length) best = run
        start = end
      }
    } else {
      const run = sorted.slice(start, end)
      if (run.length > best.length) best = run
    }
  }
  return best.length / sorted.length >= minShare ? best : null
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
