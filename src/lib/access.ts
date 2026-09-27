import 'server-only'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { contentClient } from '@/lib/supabase/content'
import type { QuestionWithOptions } from '@/types/db'

/**
 * Who may see a paper's questions, and how that is kept honest.
 *
 *   - Anyone: the first LEAD_IN questions, without their answers — on the
 *     paper's page and in learning mode. That is what search engines index.
 *   - A signed-in student: the whole paper, its answers and explanations —
 *     each paper opened is recorded, and an account that opens papers far
 *     faster than anyone studies is refused for a while (open_set, 0034).
 *   - Every full paper a student is shown carries an invisible mark of their
 *     account in the question text (src/lib/watermark.ts), so a copy found
 *     elsewhere says which account it came from.
 */

/** Questions of a paper shown before sign-in. */
export const LEAD_IN = 3

export interface OpenResult {
  allowed: boolean
  openedLastHour: number
  openedToday: number
}

/** Record that the signed-in student opened a paper; false when they are over the limit. */
export async function openSet(setId: string): Promise<OpenResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('open_set', { p_set: setId })
  if (error) {
    // The limit is a guard, not the gate: a failure to record must not lock a student out.
    console.error(`open_set failed — ${error.message}`)
    return { allowed: true, openedLastHour: 0, openedToday: 0 }
  }
  const row = (Array.isArray(data) ? data[0] : data) as { allowed: boolean; opened_last_hour: number; opened_today: number } | null
  return { allowed: row?.allowed ?? true, openedLastHour: row?.opened_last_hour ?? 0, openedToday: row?.opened_today ?? 0 }
}

/** May the signed-in student see this question's explanation? (0034) */
export async function mayReadQuestion(questionId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('may_read_question', { p_question: questionId })
  if (error) {
    console.error(`may_read_question failed — ${error.message}`)
    return false
  }
  return data === true
}

/** Note something that looks like copying, for staff to review. Never throws. */
export async function recordSignal(signal: { kind: 'limit' | 'trap'; userId?: string | null; setId?: string | null; path?: string }) {
  try {
    const request = await headers()
    await contentClient()
      .from('scrape_signals')
      .insert({
        kind: signal.kind,
        user_id: signal.userId ?? null,
        set_id: signal.setId ?? null,
        path: signal.path?.slice(0, 300) ?? null,
        ip: request.get('x-real-ip') ?? request.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
        user_agent: request.get('user-agent')?.slice(0, 300) ?? null,
      })
  } catch (error) {
    console.error(`scrape signal not recorded — ${error instanceof Error ? error.message : error}`)
  }
}

/** The first questions of a paper, with nothing that gives their answers away. */
export function leadIn(questions: QuestionWithOptions[]): QuestionWithOptions[] {
  return questions.slice(0, LEAD_IN).map((question) => ({
    ...question,
    correct_answer: null,
    answer_tolerance: null,
    options: question.options.map((option) => ({ ...option, is_correct: false })),
  }))
}
