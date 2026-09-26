'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient, requireStaff } from '@/lib/supabase/server'
import { blocksSchema } from '@/lib/blocks/schema'

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

  revalidatePath('/admin/taxonomy')
  revalidatePath('/browse')
  return { ok: true }
}

const subjectInput = z.object({
  level_id: z.string().uuid(),
  slug: z.string().regex(slugPattern, 'Use a lowercase slug like "dbms".'),
  name: z.string().min(2),
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
  const { error } = await supabase
    .from('question_papers')
    .update({ status })
    .eq('id', paperId)
  if (error) return fail(error.message)

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
  const { error } = await supabase.from('question_papers').delete().eq('id', paperId)
  if (error) return fail(error.message)

  revalidatePath('/admin/papers')
  revalidatePath('/browse')
  return { ok: true }
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
  const { error } = await supabase.from('question_options').update(update).eq('id', optionId)
  if (error) return fail(error.message)

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

export async function moderateSolution(
  solutionId: string,
  status: 'approved' | 'rejected',
): Promise<ActionState> {
  try {
    await requireStaff()
  } catch {
    return fail('You need a contributor or admin account.')
  }

  const supabase = await createClient()
  const { error } = await supabase.from('solutions').update({ status }).eq('id', solutionId)
  if (error) return fail(error.message)

  revalidatePath('/admin/solutions')
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
    placements: z.array(z.enum(['home', 'dashboard', 'papers', 'subject'])).min(1, 'Pick at least one page.'),
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
  revalidatePath('/admin/spotlight')
  return { ok: true }
}
