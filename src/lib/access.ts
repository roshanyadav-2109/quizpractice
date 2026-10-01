import 'server-only'
import { headers } from 'next/headers'
import { after } from 'next/server'
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
  /** Why a paper was refused: over the paper limit, too soon after the last one, or a blocked address. */
  reason: 'cap' | 'pace' | 'blocked' | 'signin' | 'error' | null
  /** Seconds until it is worth trying again. */
  retryAfter: number
}

/** The visitor's address as Vercel sees it. */
export async function requestIp(): Promise<string | null> {
  const request = await headers()
  return request.get('x-real-ip') ?? request.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
}

/**
 * Is this address blocked right now? A block lasts a set time and starts again
 * each time the address is seen (public.ip_is_blocked). Rules set to "watch"
 * only log it. Fails open: a database error must not lock everyone out of
 * sign-in; the paper limit below fails closed.
 */
export async function isIpBlocked(ip?: string | null): Promise<boolean> {
  const address = ip ?? (await requestIp())
  if (!address) return false
  const { data, error } = await contentClient().rpc('ip_is_blocked', { p_ip: address })
  if (error) {
    console.error(`ip_is_blocked failed — ${error.message}`)
    return false
  }
  return data === true
}

/**
 * Record that the signed-in student opened a paper; refused when the account is
 * over its limit, opening papers too fast, or on a blocked address. Afterwards the
 * account is scored (public.run_risk_scan), so a scraper is caught while it works,
 * not at the next sweep. Fails closed: if the limit cannot be checked, the paper
 * is not opened.
 */
export async function openSet(setId: string): Promise<OpenResult> {
  if (await isIpBlocked()) {
    return { allowed: false, openedLastHour: 0, openedToday: 0, reason: 'blocked', retryAfter: 3600 }
  }
  const supabase = await createClient()
  const request = await headers()
  const cookie = /(?:^|;\s*)qs_did=([0-9a-f-]{16,64})/i.exec(request.get('cookie') ?? '')?.[1]
  const { data, error } = await supabase.rpc('open_set', {
    p_set: setId,
    p_ip: await requestIp(),
    p_device: cookie ? `d:${cookie}` : null,
    p_ua: request.get('user-agent'),
  })
  if (error) {
    console.error(`open_set failed — ${error.message}`)
    return { allowed: false, openedLastHour: 0, openedToday: 0, reason: 'error', retryAfter: 5 }
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { allowed: boolean; opened_last_hour: number; opened_today: number; retry_after: number; reason: OpenResult['reason'] }
    | null
  const result: OpenResult = {
    allowed: row?.allowed ?? false,
    openedLastHour: row?.opened_last_hour ?? 0,
    openedToday: row?.opened_today ?? 0,
    reason: row?.reason ?? null,
    retryAfter: row?.retry_after ?? 0,
  }
  if (result.allowed) {
    const { data: auth } = await supabase.auth.getUser()
    const userId = auth.user?.id
    if (userId) {
      after(async () => {
        const { error: scanError } = await contentClient().rpc('run_risk_scan', { p_user: userId })
        if (scanError) console.error(`run_risk_scan failed — ${scanError.message}`)
      })
    }
  }
  return result
}

/** Count a search against the signed-in student's limit; false when over it. */
export async function noteSearch(term?: string): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('note_search', { p_term: term ?? null })
  if (error) {
    console.error(`note_search failed — ${error.message}`)
    return false
  }
  return data === true
}

/** Count an explanation read on the paper's record, after the response is sent so it never slows the answer. */
export function noteExplanation(questionId: string) {
  after(async () => {
    const supabase = await createClient()
    const { error } = await supabase.rpc('note_explanation', { p_question: questionId })
    if (error) console.error(`note_explanation failed — ${error.message}`)
  })
}

/** The sentence a refused student sees, and the HTTP status for an API. */
export function refusal(result: Pick<OpenResult, 'reason' | 'retryAfter'>): { title: string; message: string; status: number } {
  switch (result.reason) {
    case 'pace':
      return {
        title: 'One moment',
        message: `Papers open a little at a time. Try this one again in ${Math.max(1, result.retryAfter)} seconds.`,
        status: 429,
      }
    case 'blocked':
      return {
        title: 'This network is temporarily restricted',
        message: 'Activity from this network looked automated, so opening papers is paused for a while. Browsing still works. If you are a student, try again later or from another network, or use the contact link in the footer.',
        status: 403,
      }
    case 'error':
      return { title: 'Please try again', message: 'The paper could not be opened just now. Try again in a few seconds.', status: 503 }
    default:
      return {
        title: 'That is a lot of papers in a short time',
        message: 'To keep the question bank from being copied, each account can open a limited number of new papers an hour and a day. Papers you have already opened today still open. Try this one again in a little while.',
        status: 429,
      }
  }
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
