'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient, requireStaff, type CurrentProfile } from '@/lib/supabase/server'
import { TAG, refresh } from '@/lib/cache'
import { blocksSchema } from '@/lib/blocks/schema'
import type { ContentStatus, ModerationStatus } from '@/types/db'

/**
 * Admin mutations.
 *
 * These run as the signed-in user, not the service role, so RLS is still the
 * backstop: a compromised or buggy action cannot write anything the user's own
 * role would not allow. `requireStaff()` is what turns a confusing empty result
 * into a clear error.
 */

export interface ActionState {
  ok?: boolean
  error?: string
}

function fail(error: string): ActionState {
  return { ok: false, error }
}

type Db = Awaited<ReturnType<typeof createClient>>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ---------------------------------------------------------------------------
// Explanations in the shared cache
//
// Students read explanations through one cached entry per question, all
// cleared at once by TAG.solutions. Editing a question, an option or a paper
// can change what a question shows: a new fingerprint moves the question to
// another group (and sends the live explanation written for it back to
// review), a paper leaving or joining the site takes its questions with it,
// and a deleted question leaves its group. Clearing the cache costs a
// database read per question afterwards, so these first check that a live
// explanation is involved at all. When a check cannot tell, it says yes.
// ---------------------------------------------------------------------------

/** The question's fingerprint (null: never linked), or undefined when it could not be read. */
async function fingerprintOf(supabase: Db, questionId: string): Promise<string | null | undefined> {
  const { data, error } = await supabase
    .from('questions')
    .select('fingerprint')
    .eq('id', questionId)
    .maybeSingle<{ fingerprint: string | null }>()
  if (error || !data) return undefined
  return data.fingerprint
}

/** Short enough to keep each request's address well under the API's limit. */
const IN_CHUNK = 100

/** Is there an explanation in one of `statuses` whose `column` is one of `values`? True when unsure. */
async function anyExplanation(
  supabase: Db,
  column: 'question_id' | 'fingerprint',
  values: string[],
  statuses: ModerationStatus[],
): Promise<boolean> {
  const distinct = [...new Set(values)]
  for (let from = 0; from < distinct.length; from += IN_CHUNK) {
    const { count, error } = await supabase
      .from('solutions')
      .select('id', { count: 'exact', head: true })
      .in('status', statuses)
      .in(column, distinct.slice(from, from + IN_CHUNK))
    if (error || (count ?? 0) > 0) return true
  }
  return false
}

/**
 * After an edit that may have changed a question's fingerprint: clears the
 * explanations cache when the question left or joined a group with a live
 * explanation. An explanation anchored here was just sent back to review by
 * the database, so any anchored one counts, not only live ones.
 */
async function refreshIfRegrouped(
  supabase: Db,
  questionId: string,
  before: string | null | undefined,
): Promise<void> {
  const after = await fingerprintOf(supabase, questionId)
  if (before !== undefined && after !== undefined && before === after) return

  const fingerprints = [before, after].filter((fp): fp is string => typeof fp === 'string')
  if (
    before === undefined ||
    after === undefined ||
    (await anyExplanation(supabase, 'question_id', [questionId], ['approved', 'pending'])) ||
    (await anyExplanation(supabase, 'fingerprint', fingerprints, ['approved']))
  ) {
    refresh(TAG.solutions)
  }
}

/** The most questions read at once below; a bigger paper is simply assumed to matter. */
const SCOPE_LIMIT = 1000

/**
 * Does a live explanation show on any question in this paper or set? Either
 * one written for it, or one shared with it by fingerprint. True when unsure.
 */
async function reachesLiveExplanations(
  supabase: Db,
  scope: { paperId: string } | { setId: string },
): Promise<boolean> {
  const { data, error } = await ('setId' in scope
    ? supabase.from('questions').select('id, fingerprint').eq('set_id', scope.setId)
    : supabase
        .from('questions')
        .select('id, fingerprint, question_sets!inner(paper_id)')
        .eq('question_sets.paper_id', scope.paperId)
  ).limit(SCOPE_LIMIT)
  if (error || !data || data.length >= SCOPE_LIMIT) return true

  const questions = data as { id: string; fingerprint: string | null }[]
  if (!questions.length) return false
  const fingerprints = questions
    .map((question) => question.fingerprint)
    .filter((fp): fp is string => Boolean(fp))

  return (
    (await anyExplanation(supabase, 'question_id', questions.map((question) => question.id), ['approved'])) ||
    (await anyExplanation(supabase, 'fingerprint', fingerprints, ['approved']))
  )
}

// ---------------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------------

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const programInput = z.object({
  slug: z.string().regex(slugPattern, 'Use a lowercase slug like "ds" or "mds".'),
  name: z.string().min(2),
  short_name: z.string().optional(),
  description: z.string().optional(),
  accent: z.string().optional(),
  sort_order: z.coerce.number().int().default(0),
})

export async function createProgram(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireStaff()
  } catch {
    return fail('You need a contributor or admin account.')
  }

  const parsed = programInput.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const supabase = await createClient()
  const { error } = await supabase.from('programs').insert(parsed.data)
  if (error) return fail(error.message)

  refresh(TAG.taxonomy)
  revalidatePath('/admin/taxonomy')
  revalidatePath('/browse')
  revalidatePath('/')
  return { ok: true }
}

const levelInput = z.object({
  program_id: z.string().uuid(),
  slug: z.string().regex(slugPattern, 'Use a lowercase slug like "foundation".'),
  name: z.string().min(2),
  code: z.string().optional(),
  credits: z.coerce.number().int().optional(),
  sort_order: z.coerce.number().int().default(0),
})

export async function createLevel(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireStaff()
  } catch {
    return fail('You need a contributor or admin account.')
  }

  const raw = Object.fromEntries(formData)
  if (!raw.credits) delete raw.credits

  const parsed = levelInput.safeParse(raw)
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const supabase = await createClient()
  const { error } = await supabase.from('levels').insert(parsed.data)
  if (error) return fail(error.message)

  refresh(TAG.taxonomy)
  revalidatePath('/admin/taxonomy')
  revalidatePath('/browse')
  return { ok: true }
}

const subjectInput = z.object({
  level_id: z.string().uuid(),
  slug: z.string().regex(slugPattern, 'Use a lowercase slug like "dbms".'),
  name: z.string().min(2),
  short_name: z.string().trim().max(60).optional().transform((value) => value || null),
  code: z.string().optional(),
  aliases: z.string().optional(),
  has_programming: z.coerce.boolean().default(false),
  sort_order: z.coerce.number().int().default(0),
})

export async function createSubject(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireStaff()
  } catch {
    return fail('You need a contributor or admin account.')
  }

  const parsed = subjectInput.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const { aliases, ...rest } = parsed.data
  const supabase = await createClient()

  const { error } = await supabase.from('subjects').insert({
    ...rest,
    // Comma-separated in the form, text[] in the database. These are the
    // spellings that appear on real papers, so the importer can match them.
    aliases: (aliases ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  })
  if (error) return fail(error.message)

  refresh(TAG.taxonomy)
  revalidatePath('/admin/taxonomy')
  revalidatePath('/browse')
  return { ok: true }
}

const examTypeInput = z.object({
  slug: z.string().regex(slugPattern, 'Use a lowercase slug like "quiz-1".'),
  name: z.string().min(2),
  description: z.string().optional(),
  default_duration_minutes: z.coerce.number().int().optional(),
  sort_order: z.coerce.number().int().default(0),
})

export async function createExamType(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireStaff()
  } catch {
    return fail('You need a contributor or admin account.')
  }

  const raw = Object.fromEntries(formData)
  if (!raw.default_duration_minutes) delete raw.default_duration_minutes

  const parsed = examTypeInput.safeParse(raw)
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const supabase = await createClient()
  const { error } = await supabase.from('exam_types').insert(parsed.data)
  if (error) return fail(error.message)

  refresh(TAG.taxonomy)
  revalidatePath('/admin/taxonomy')
  revalidatePath('/browse')
  return { ok: true }
}

export async function toggleActive(
  table: 'programs' | 'levels' | 'subjects' | 'exam_types',
  id: string,
  isActive: boolean,
): Promise<ActionState> {
  try {
    await requireStaff()
  } catch {
    return fail('You need a contributor or admin account.')
  }

  const supabase = await createClient()
  const { error } = await supabase.from(table).update({ is_active: isActive }).eq('id', id)
  if (error) return fail(error.message)

  refresh(TAG.taxonomy)
  revalidatePath('/admin/taxonomy')
  revalidatePath('/browse')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Papers
// ---------------------------------------------------------------------------

export async function setPaperStatus(
  paperId: string,
  status: 'draft' | 'published' | 'archived',
): Promise<ActionState> {
  try {
    await requireStaff()
  } catch {
    return fail('You need a contributor or admin account.')
  }

  const supabase = await createClient()
  const { data: current, error: readError } = await supabase
    .from('question_papers')
    .select('status')
    .eq('id', paperId)
    .maybeSingle<{ status: ContentStatus }>()
  if (readError) return fail(readError.message)
  if (!current) return fail('That paper no longer exists.')

  const { error } = await supabase
    .from('question_papers')
    .update({ status })
    .eq('id', paperId)
  if (error) return fail(error.message)

  refresh(TAG.catalogue)
  // Only a published paper's questions show explanations, so going on or off
  // the site changes what its questions show.
  if (
    (current.status === 'published') !== (status === 'published') &&
    (await reachesLiveExplanations(supabase, { paperId }))
  ) {
    refresh(TAG.solutions)
  }
  revalidatePath('/admin/papers')
  revalidatePath(`/admin/papers/${paperId}`)
  revalidatePath('/browse')
  revalidatePath('/')
  return { ok: true }
}

export async function deletePaper(paperId: string): Promise<ActionState> {
  try {
    await requireStaff()
  } catch {
    return fail('You need a contributor or admin account.')
  }

  const supabase = await createClient()
  // Checked before the questions go: afterwards there is nothing to check by.
  const touchesExplanations = await reachesLiveExplanations(supabase, { paperId })

  const { error } = await supabase.from('question_papers').delete().eq('id', paperId)
  if (error) return fail(error.message)

  refresh(TAG.catalogue)
  if (touchesExplanations) refresh(TAG.solutions)
  revalidatePath('/admin/papers')
  revalidatePath('/browse')
  return { ok: true }
}

/**
 * Refiles a set under another subject: the same sitting of the same exam, in
 * the subject the set's questions really belong to. Teachers are assigned by
 * subject, so a misfiled set lands in the wrong teachers' queues until moved.
 *
 * The set joins that subject's paper for the sitting, which is created (with
 * this paper's details and status) when there is none. When the set is the
 * paper's only one and no such paper exists, the whole paper is refiled
 * instead, keeping everything attached to it. A paper left with no sets is
 * taken off the site (draft), not deleted.
 *
 * Question ids do not change, so attempts, explanations and discussions stay
 * with their questions. Ends on the paper the set now belongs to.
 */
export async function moveSetToSubject(setId: string, subjectId: string): Promise<ActionState> {
  let profile: CurrentProfile
  try {
    profile = await requireStaff()
  } catch {
    return fail('You need a contributor or admin account.')
  }
  if (!UUID.test(setId ?? '')) return fail('That set no longer exists.')
  if (!UUID.test(subjectId ?? '')) return fail('Pick the subject the set belongs to.')

  const supabase = await createClient()

  const { data: set, error: setError } = await supabase
    .from('question_sets')
    .select(
      'id, set_code, question_papers(id, subject_id, exam_type_id, session_date, duration_minutes, total_marks, status, notes)',
    )
    .eq('id', setId)
    .maybeSingle<{
      id: string
      set_code: string
      question_papers: {
        id: string
        subject_id: string
        exam_type_id: string
        session_date: string | null
        duration_minutes: number | null
        total_marks: number | null
        status: ContentStatus
        notes: string | null
      } | null
    }>()
  if (setError) return fail(setError.message)
  const source = set?.question_papers
  if (!set || !source) return fail('That set no longer exists.')
  if (source.subject_id === subjectId) return fail('The set is already filed under that subject.')

  const { data: subject, error: subjectError } = await supabase
    .from('subjects')
    .select('id, name')
    .eq('id', subjectId)
    .maybeSingle<{ id: string; name: string }>()
  if (subjectError) return fail(subjectError.message)
  if (!subject) return fail('That subject no longer exists.')

  // The paper for this sitting in the new subject, found the way the importer finds it.
  const lookup = supabase
    .from('question_papers')
    .select('id, status')
    .eq('subject_id', subject.id)
    .eq('exam_type_id', source.exam_type_id)
  const { data: found, error: lookupError } = await (source.session_date === null
    ? lookup.is('session_date', null)
    : lookup.eq('session_date', source.session_date)
  )
    .order('created_at')
    .limit(1)
  if (lookupError) return fail(lookupError.message)

  const { count: setsOnPaper, error: countError } = await supabase
    .from('question_sets')
    .select('id', { count: 'exact', head: true })
    .eq('paper_id', source.id)
  if (countError) return fail(countError.message)
  const onlySet = (setsOnPaper ?? 0) <= 1

  const clash = () =>
    fail(
      `The ${subject.name} paper for this sitting already has a set ${set.set_code}. Rename one of the two sets, then move it.`,
    )

  let target = (found as { id: string; status: ContentStatus }[] | null)?.[0] ?? null

  if (target) {
    const { error } = await supabase.from('question_sets').update({ paper_id: target.id }).eq('id', set.id)
    if (error) return error.code === '23505' ? clash() : fail(error.message)
    if (onlySet && source.status !== 'draft') {
      await supabase.from('question_papers').update({ status: 'draft' }).eq('id', source.id)
    }
  } else if (onlySet) {
    const { error } = await supabase.from('question_papers').update({ subject_id: subject.id }).eq('id', source.id)
    if (error) return fail(error.message)
    target = { id: source.id, status: source.status }
  } else {
    // The title named the old subject, if anything, so the new paper goes without.
    const { data: created, error: createError } = await supabase
      .from('question_papers')
      .insert({
        subject_id: subject.id,
        exam_type_id: source.exam_type_id,
        session_date: source.session_date,
        duration_minutes: source.duration_minutes,
        total_marks: source.total_marks,
        status: source.status,
        notes: source.notes,
        created_by: profile.id,
      })
      .select('id, status')
      .single<{ id: string; status: ContentStatus }>()
    if (createError || !created) return fail(createError?.message ?? 'The paper could not be created.')

    const { error } = await supabase.from('question_sets').update({ paper_id: created.id }).eq('id', set.id)
    if (error) {
      await supabase.from('question_papers').delete().eq('id', created.id)
      return error.code === '23505' ? clash() : fail(error.message)
    }
    target = created
  }

  refresh(TAG.catalogue)
  if (
    (source.status === 'published') !== (target.status === 'published') &&
    (await reachesLiveExplanations(supabase, { setId: set.id }))
  ) {
    refresh(TAG.solutions)
  }
  revalidatePath('/admin/papers')
  revalidatePath(`/admin/papers/${source.id}`)
  revalidatePath('/browse')
  redirect(`/admin/papers/${target.id}`)
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

const questionInput = z.object({
  id: z.string().uuid(),
  type: z.enum(['mcq', 'msq', 'numerical', 'subjective', 'programming']),
  marks: z.coerce.number().min(0),
  negative_marks: z.coerce.number().min(0),
  correct_answer: z.string().optional(),
  answer_tolerance: z.string().optional(),
  topics: z.string().optional(),
  body: z.string(),
})

export async function updateQuestion(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireStaff()
  } catch {
    return fail('You need a contributor or admin account.')
  }

  const parsed = questionInput.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  let body: unknown
  try {
    body = JSON.parse(parsed.data.body)
  } catch (error) {
    return fail(`The block JSON is not valid JSON: ${(error as Error).message}`)
  }

  const blocks = blocksSchema.safeParse(body)
  if (!blocks.success) {
    const issue = blocks.error.issues[0]
    return fail(`Block ${issue.path.join('.') || '0'}: ${issue.message}`)
  }

  const supabase = await createClient()
  const fingerprintBefore = await fingerprintOf(supabase, parsed.data.id)
  const { error } = await supabase
    .from('questions')
    .update({
      type: parsed.data.type,
      marks: parsed.data.marks,
      negative_marks: parsed.data.negative_marks,
      correct_answer: parsed.data.correct_answer?.trim() || null,
      answer_tolerance: parsed.data.answer_tolerance?.trim()
        ? Number(parsed.data.answer_tolerance)
        : null,
      topics: (parsed.data.topics ?? '')
        .split(',')
        .map((topic) => topic.trim())
        .filter(Boolean),
      body: blocks.data,
    })
    .eq('id', parsed.data.id)

  if (error) return fail(error.message)

  refresh(TAG.catalogue)
  await refreshIfRegrouped(supabase, parsed.data.id, fingerprintBefore)
  revalidatePath(`/admin/questions/${parsed.data.id}`)
  return { ok: true }
}

export async function updateOption(
  optionId: string,
  patch: { content?: string; is_correct?: boolean },
): Promise<ActionState> {
  try {
    await requireStaff()
  } catch {
    return fail('You need a contributor or admin account.')
  }

  const update: Record<string, unknown> = {}

  if (patch.content !== undefined) {
    let parsedContent: unknown
    try {
      parsedContent = JSON.parse(patch.content)
    } catch (error) {
      return fail(`Option JSON is invalid: ${(error as Error).message}`)
    }
    const blocks = blocksSchema.safeParse(parsedContent)
    if (!blocks.success) return fail(blocks.error.issues[0].message)
    update.content = blocks.data
  }

  if (patch.is_correct !== undefined) update.is_correct = patch.is_correct

  const supabase = await createClient()
  // A changed option, and above all a changed correct answer, can move the
  // question to another group of copies.
  const { data: owner, error: ownerError } = await supabase
    .from('question_options')
    .select('question_id, questions(fingerprint)')
    .eq('id', optionId)
    .maybeSingle<{ question_id: string; questions: { fingerprint: string | null } | null }>()

  const { error } = await supabase.from('question_options').update(update).eq('id', optionId)
  if (error) return fail(error.message)
  refresh(TAG.catalogue)

  if (ownerError) {
    refresh(TAG.solutions)
  } else if (owner) {
    await refreshIfRegrouped(supabase, owner.question_id, owner.questions ? owner.questions.fingerprint : undefined)
  }

  return { ok: true }
}

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------

export async function resolveReport(
  reportId: string,
  status: 'resolved' | 'dismissed',
): Promise<ActionState> {
  try {
    const profile = await requireStaff()
    const supabase = await createClient()
    const { error } = await supabase
      .from('reports')
      .update({
        status,
        resolved_by: profile.id,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', reportId)

    if (error) return fail(error.message)
  } catch {
    return fail('You need a contributor or admin account.')
  }

  revalidatePath('/admin/reports')
  return { ok: true }
}

const REVIEW_NOTE_MAX = 1000

/**
 * Approves an explanation (it goes live on every copy of its question) or
 * rejects it. Rejecting a live one is how it is unpublished. The note is what
 * the author sees on their desk and in the studio; approving replaces any
 * earlier note, so "rejected because…" does not linger on live work.
 */
export async function moderateSolution(
  solutionId: string,
  status: 'approved' | 'rejected',
  note?: string,
): Promise<ActionState> {
  let profile: CurrentProfile
  try {
    profile = await requireStaff()
  } catch {
    return fail('You need a contributor or admin account.')
  }
  if (!UUID.test(solutionId ?? '')) return fail('That explanation no longer exists.')
  if (status !== 'approved' && status !== 'rejected') return fail('Approve or reject.')
  const reviewNote = typeof note === 'string' ? note.trim() : ''
  if (reviewNote.length > REVIEW_NOTE_MAX) return fail(`Keep the note under ${REVIEW_NOTE_MAX} characters.`)

  const supabase = await createClient()
  const { data: current, error: readError } = await supabase
    .from('solutions')
    .select('status')
    .eq('id', solutionId)
    .maybeSingle<{ status: ModerationStatus }>()
  if (readError) return fail(readError.message)
  if (!current) return fail('That explanation no longer exists.')

  // A live explanation taken down without a reason still tells its author
  // what happened, rather than showing as a bare rejection.
  const unpublished = status === 'rejected' && current.status === 'approved'

  const { error } = await supabase
    .from('solutions')
    .update({
      status,
      review_note: reviewNote || (unpublished ? 'Unpublished' : null),
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', solutionId)
  if (error) {
    return fail(
      error.code === '23514'
        ? 'The database refused it: the video must be a YouTube link and the explanation under 300 kB.'
        : error.message,
    )
  }

  // Students only ever see approved rows, so only a change to or from
  // approved changes what they see.
  if (current.status === 'approved' || status === 'approved') refresh(TAG.solutions)
  revalidatePath('/admin/solutions')
  revalidatePath('/admin')
  return { ok: true }
}

/**
 * Deletes an explanation for good, whoever wrote it. A live one disappears
 * from every copy of its question at once; unpublishing (reject) is the
 * reversible way to take one down.
 */
export async function deleteSolution(solutionId: string): Promise<ActionState> {
  try {
    await requireStaff()
  } catch {
    return fail('You need a contributor or admin account.')
  }
  if (!UUID.test(solutionId ?? '')) return fail('That explanation no longer exists.')

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('solutions')
    .delete()
    .eq('id', solutionId)
    .select('status')
    .returns<{ status: ModerationStatus }[]>()
  if (error) return fail(error.message)
  if (!data?.length) return fail('That explanation no longer exists.')

  if (data.some((row) => row.status === 'approved')) refresh(TAG.solutions)
  revalidatePath('/admin/solutions')
  revalidatePath('/admin')
  return { ok: true }
}

export async function setExtractionStatus(
  extractionId: string,
  status: 'pending' | 'in_review' | 'approved' | 'rejected',
): Promise<ActionState> {
  try {
    const profile = await requireStaff()
    const supabase = await createClient()
    const { error } = await supabase
      .from('extractions')
      .update({
        status,
        reviewer_id: profile.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', extractionId)

    if (error) return fail(error.message)
  } catch {
    return fail('You need a contributor or admin account.')
  }

  revalidatePath('/admin/review')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Spotlight: exam dates and announcement banners
// ---------------------------------------------------------------------------

const optionalId = z
  .string()
  .optional()
  .transform((value) => value || null)
  .pipe(z.string().uuid().nullable())
const optionalDay = z
  .string()
  .optional()
  .transform((value) => value || null)
  .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a full date.').nullable())
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters.`)
    .optional()
    .transform((value) => value || null)

const examDateInput = z.object({
  exam_type_id: z.string().uuid('Pick an exam.'),
  program_id: optionalId,
  exam_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick the date of the exam.'),
  note: optionalText(80),
})

export async function createExamDate(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireStaff()
  } catch {
    return fail('You need a contributor or admin account.')
  }
  const parsed = examDateInput.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const supabase = await createClient()
  const { error } = await supabase.from('exam_calendar').insert(parsed.data)
  if (error) return fail(error.message)
  refresh(TAG.spotlight)
  revalidatePath('/admin/spotlight')
  return { ok: true }
}

const bannerInput = z
  .object({
    kind: z.enum(['announcement', 'feature', 'release']),
    eyebrow: optionalText(40),
    title: z.string().trim().min(4, 'Give it a title.').max(90, 'Keep the title under 90 characters.'),
    body: optionalText(240),
    cta_label: optionalText(30),
    cta_href: optionalText(300).pipe(
      z.string().regex(/^(\/|https:\/\/)/, 'Links start with / or https://').nullable(),
    ),
    placements: z.array(z.enum(['home', 'dashboard', 'papers'])).min(1, 'Pick at least one page.'),
    program_id: optionalId,
    starts_on: optionalDay,
    ends_on: optionalDay,
  })
  .refine((banner) => Boolean(banner.cta_label) === Boolean(banner.cta_href), 'A button needs both a label and a link.')
  .refine((banner) => !banner.starts_on || !banner.ends_on || banner.starts_on <= banner.ends_on, 'It ends before it starts.')

export async function createBanner(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireStaff()
  } catch {
    return fail('You need a contributor or admin account.')
  }
  const parsed = bannerInput.safeParse({ ...Object.fromEntries(formData), placements: formData.getAll('placements') })
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const supabase = await createClient()
  const { error } = await supabase.from('banners').insert(parsed.data)
  if (error) return fail(error.message)
  refresh(TAG.spotlight)
  revalidatePath('/admin/spotlight')
  return { ok: true }
}

export async function setBannerActive(id: string, isActive: boolean): Promise<ActionState> {
  try {
    await requireStaff()
  } catch {
    return fail('You need a contributor or admin account.')
  }
  const supabase = await createClient()
  const { error } = await supabase.from('banners').update({ is_active: isActive }).eq('id', id)
  if (error) return fail(error.message)
  refresh(TAG.spotlight)
  revalidatePath('/admin/spotlight')
  return { ok: true }
}

export async function deleteSpotlightRow(table: 'banners' | 'exam_calendar', id: string): Promise<ActionState> {
  try {
    await requireStaff()
  } catch {
    return fail('You need a contributor or admin account.')
  }
  const supabase = await createClient()
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) return fail(error.message)
  refresh(TAG.spotlight)
  revalidatePath('/admin/spotlight')
  return { ok: true }
}
