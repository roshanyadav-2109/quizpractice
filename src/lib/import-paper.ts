import type { SupabaseClient } from '@supabase/supabase-js'
import {
  SCHEMA_VERSION,
  importPaperSchema,
  type Block,
  type CloudinaryRef,
  type ImportPaper,
} from '@/lib/blocks/schema'
import { buildPublicId } from '@/lib/cloudinary'

/**
 * Loads one question paper from JSON into the database.
 *
 * Shared by the CLI (`npm run paper:import`) and the admin importer so both
 * behave identically. Re-importing the same subject + exam + date + set
 * replaces that set's questions rather than duplicating them, which is what
 * makes a bulk load safe to re-run after a fix.
 */

export interface ImportOptions {
  /** Upload any image block carrying source_url to Cloudinary before inserting. */
  uploadImages?: boolean
  createdBy?: string | null
  /** Publish immediately, or leave the paper as a draft for review. */
  publish?: boolean
}

export interface ImportResult {
  paperId: string
  setId: string
  subjectName: string
  examTypeName: string
  questionCount: number
  optionCount: number
  solutionCount: number
  uploadedAssets: string[]
  replacedExisting: boolean
  warnings: string[]
}

export class ImportError extends Error {
  readonly issues: string[]
  constructor(message: string, issues: string[] = []) {
    super(message)
    this.name = 'ImportError'
    this.issues = issues
  }
}

export async function importPaper(
  input: unknown,
  supabase: SupabaseClient,
  options: ImportOptions = {},
): Promise<ImportResult> {
  const parsed = importPaperSchema.safeParse(input)
  if (!parsed.success) {
    throw new ImportError(
      'The paper JSON does not match the schema.',
      parsed.error.issues.map(
        (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
      ),
    )
  }

  const paper = parsed.data
  const warnings: string[] = []

  const subject = await resolveSubject(supabase, paper.subject)
  const examType = await resolveExamType(supabase, paper.exam_type)

  // ---- images ------------------------------------------------------------
  const uploadedAssets: string[] = []
  if (options.uploadImages) {
    await uploadPendingImages(paper, subject, examType.slug, uploadedAssets)
  } else {
    const pending = countPendingUploads(paper)
    if (pending > 0) {
      warnings.push(
        `${pending} image${pending === 1 ? '' : 's'} carry source_url but uploads were not requested — they will not render until uploaded.`,
      )
    }
  }

  // ---- paper -------------------------------------------------------------
  const sessionDate = paper.session_date ?? null
  const status = options.publish === false ? 'draft' : 'published'

  const paperLookup = supabase
    .from('question_papers')
    .select('id')
    .eq('subject_id', subject.id)
    .eq('exam_type_id', examType.id)

  const { data: existingPaper } = await (sessionDate === null
    ? paperLookup.is('session_date', null)
    : paperLookup.eq('session_date', sessionDate)
  ).maybeSingle()

  let paperId = (existingPaper as { id?: string } | null)?.id

  if (!paperId) {
    const { data, error } = await supabase
      .from('question_papers')
      .insert({
        subject_id: subject.id,
        exam_type_id: examType.id,
        title: paper.title ?? null,
        session_date: sessionDate,
        duration_minutes: paper.duration_minutes ?? examType.default_duration_minutes ?? null,
        total_marks: paper.total_marks ?? null,
        status,
        created_by: options.createdBy ?? null,
      })
      .select('id')
      .single()

    if (error || !data) {
      throw new ImportError(`Could not create the paper: ${error?.message ?? 'unknown error'}`)
    }
    paperId = data.id as string
  } else {
    await supabase
      .from('question_papers')
      .update({
        title: paper.title ?? null,
        duration_minutes: paper.duration_minutes ?? undefined,
        total_marks: paper.total_marks ?? undefined,
        status,
      })
      .eq('id', paperId)
  }

  // ---- set ---------------------------------------------------------------
  const setCode = paper.set_code ?? '1'

  const { data: existingSet } = await supabase
    .from('question_sets')
    .select('id')
    .eq('paper_id', paperId)
    .eq('set_code', setCode)
    .maybeSingle()

  let setId = (existingSet as { id?: string } | null)?.id
  const replacedExisting = Boolean(setId)

  if (setId) {
    // Replace, don't append. Options and solutions cascade from questions.
    await supabase.from('questions').delete().eq('set_id', setId)
  } else {
    const { data, error } = await supabase
      .from('question_sets')
      .insert({ paper_id: paperId, set_code: setCode })
      .select('id')
      .single()

    if (error || !data) {
      throw new ImportError(`Could not create the set: ${error?.message ?? 'unknown error'}`)
    }
    setId = data.id as string
  }

  // ---- questions ---------------------------------------------------------
  let optionCount = 0
  let solutionCount = 0

  for (const question of paper.questions) {
    const { data: inserted, error } = await supabase
      .from('questions')
      .insert({
        set_id: setId,
        number: question.number,
        type: question.type,
        body: question.body,
        schema_version: paper.schema_version ?? SCHEMA_VERSION,
        marks: question.marks ?? 1,
        negative_marks: question.negative_marks ?? 0,
        correct_answer:
          question.correct_answer === undefined ? null : String(question.correct_answer),
        answer_tolerance: question.answer_tolerance ?? null,
        topics: question.topics ?? [],
        difficulty: question.difficulty ?? null,
        status: 'published',
      })
      .select('id')
      .single()

    if (error || !inserted) {
      throw new ImportError(
        `Could not insert question ${question.number}: ${error?.message ?? 'unknown error'}`,
      )
    }

    const questionId = inserted.id as string

    if (question.options?.length) {
      const rows = question.options.map((option, index) => ({
        question_id: questionId,
        label: option.label,
        content: option.content,
        is_correct: option.is_correct ?? false,
        sort_order: index,
      }))
      const { error: optionError } = await supabase.from('question_options').insert(rows)
      if (optionError) {
        throw new ImportError(
          `Could not insert options for question ${question.number}: ${optionError.message}`,
        )
      }
      optionCount += rows.length
    }

    if (question.solution && (question.solution.body?.length || question.solution.video_url)) {
      const { error: solutionError } = await supabase.from('solutions').insert({
        question_id: questionId,
        kind: question.solution.kind ?? 'authored',
        body: question.solution.body ?? [],
        video_url: question.solution.video_url ?? null,
        author_id: options.createdBy ?? null,
        status: 'approved',
      })
      if (solutionError) {
        warnings.push(
          `Question ${question.number}: solution not saved (${solutionError.message}).`,
        )
      } else {
        solutionCount += 1
      }
    }
  }

  // ---- media registry ----------------------------------------------------
  const referenced = collectRefs(paper)
  if (referenced.length) {
    const rows = referenced.map((ref) => ({
      public_id: ref.public_id,
      version: ref.version ?? null,
      format: ref.format ?? null,
      width: ref.width ?? null,
      height: ref.height ?? null,
      kind: 'figure' as const,
      paper_id: paperId,
    }))
    // Ignore conflicts: the same figure legitimately appears in more than one
    // set when a sitting reuses a diagram across variants.
    await supabase.from('media_assets').upsert(rows, { onConflict: 'public_id' })
  }

  return {
    paperId: paperId!,
    setId: setId!,
    subjectName: subject.name,
    examTypeName: examType.name,
    questionCount: paper.questions.length,
    optionCount,
    solutionCount,
    uploadedAssets,
    replacedExisting,
    warnings,
  }
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

interface ResolvedSubject {
  id: string
  name: string
  slug: string
  programSlug: string | null
}

/**
 * Real papers name the same course three different ways. Match on slug first,
 * then course code, then the alias list — which is exactly what the aliases
 * column exists for.
 */
async function resolveSubject(
  supabase: SupabaseClient,
  identifier: string,
): Promise<ResolvedSubject> {
  const term = identifier.trim()

  const bySlug = await supabase
    .from('subjects')
    .select('id, name, slug, levels(programs(slug))')
    .eq('slug', term.toLowerCase())
    .maybeSingle()

  const byCode = bySlug.data
    ? null
    : await supabase
        .from('subjects')
        .select('id, name, slug, levels(programs(slug))')
        .ilike('code', term)
        .maybeSingle()

  const byAlias =
    bySlug.data || byCode?.data
      ? null
      : await supabase
          .from('subjects')
          .select('id, name, slug, levels(programs(slug))')
          .contains('aliases', [term])
          .maybeSingle()

  const byName =
    bySlug.data || byCode?.data || byAlias?.data
      ? null
      : await supabase
          .from('subjects')
          .select('id, name, slug, levels(programs(slug))')
          .ilike('name', term)
          .maybeSingle()

  const row = (bySlug.data ?? byCode?.data ?? byAlias?.data ?? byName?.data) as
    | {
        id: string
        name: string
        slug: string
        levels?: { programs?: { slug?: string } | null } | null
      }
    | null
    | undefined

  if (!row) {
    throw new ImportError(
      `No subject matches "${identifier}". Add it in the admin taxonomy manager, or add "${identifier}" to an existing subject's aliases.`,
    )
  }

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    programSlug: row.levels?.programs?.slug ?? null,
  }
}

interface ResolvedExamType {
  id: string
  name: string
  slug: string
  default_duration_minutes: number | null
}

async function resolveExamType(
  supabase: SupabaseClient,
  identifier: string,
): Promise<ResolvedExamType> {
  const term = identifier.trim()

  const bySlug = await supabase
    .from('exam_types')
    .select('id, name, slug, default_duration_minutes')
    .eq('slug', term.toLowerCase())
    .maybeSingle()

  const byName = bySlug.data
    ? null
    : await supabase
        .from('exam_types')
        .select('id, name, slug, default_duration_minutes')
        .ilike('name', term)
        .maybeSingle()

  const row = (bySlug.data ?? byName?.data) as ResolvedExamType | null | undefined

  if (!row) {
    throw new ImportError(
      `No exam type matches "${identifier}". Add it in the admin taxonomy manager.`,
    )
  }
  return row
}

// ---------------------------------------------------------------------------
// Image handling
// ---------------------------------------------------------------------------

/** Every Cloudinary reference in the paper, including inside options and solutions. */
function collectRefs(paper: ImportPaper): CloudinaryRef[] {
  const refs: CloudinaryRef[] = []

  const visit = (blocks: Block[] | undefined) => {
    for (const block of blocks ?? []) {
      if (block.type === 'image') refs.push(block.image)
      else if ('fallback_image' in block && block.fallback_image) refs.push(block.fallback_image)
    }
  }

  for (const question of paper.questions) {
    visit(question.body)
    for (const option of question.options ?? []) visit(option.content)
    visit(question.solution?.body)
  }
  return refs
}

function countPendingUploads(paper: ImportPaper): number {
  return collectRefs(paper).filter((ref) => ref.source_url).length
}

/**
 * Uploads every reference carrying source_url, rewrites it in place with the
 * real Cloudinary metadata, and drops source_url so nothing foreign is stored.
 */
async function uploadPendingImages(
  paper: ImportPaper,
  subject: ResolvedSubject,
  examSlug: string,
  uploaded: string[],
): Promise<void> {
  const refs = collectRefs(paper).filter((ref) => ref.source_url)
  if (!refs.length) return

  const { uploadFromUrl } = await import('@/lib/cloudinary-server')

  for (const ref of refs) {
    // A public_id given in the JSON is honoured as-is; otherwise the asset is
    // filed under the taxonomy path so it can be found in the media library.
    const publicId = ref.public_id.includes('/')
      ? ref.public_id
      : buildPublicId({
          programSlug: subject.programSlug,
          subjectSlug: subject.slug,
          examSlug,
          sessionDate: paper.session_date ?? null,
          setCode: paper.set_code ?? null,
          name: ref.public_id,
        })

    const result = await uploadFromUrl(ref.source_url!, publicId)

    ref.public_id = result.public_id
    ref.version = result.version
    ref.format = result.format
    ref.width = result.width
    ref.height = result.height
    delete ref.source_url

    uploaded.push(result.public_id)
  }
}
