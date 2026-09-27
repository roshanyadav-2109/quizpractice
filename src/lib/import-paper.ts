import type { SupabaseClient } from '@supabase/supabase-js'
import {
  SCHEMA_VERSION,
  importPaperSchema,
  type Block,
  type CloudinaryRef,
  type ImportPaper,
  type ImportQuestion,
} from '@/lib/blocks/schema'
import { buildPublicId } from '@/lib/cloudinary'
import { canonicalYouTubeUrl, parseYouTubeUrl } from '@/lib/youtube/url'

/**
 * Loads one question paper from JSON into the database.
 *
 * Shared by the CLI (`npm run paper:import`) and the admin importer so both
 * behave identically. Re-importing the same subject + exam + date + set
 * updates that set's questions in place rather than duplicating them, which
 * is what makes a bulk load safe to re-run after a fix — and keeps every
 * question's explanations, attempts and discussions attached through it.
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

  if (!setId) {
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
  //
  // A re-import updates the set in place rather than deleting and inserting
  // it again. Question and option ids stay the same, so explanations,
  // attempts (which store the chosen option ids), discussions and reports all
  // survive a fix to the JSON. Each incoming question is matched to an
  // existing one by identical content first — which follows a question the
  // new file renumbers — then by number, which is a correction in place. The
  // database re-checks every changed question's fingerprint and sends its
  // live explanations back to review if the question no longer matches them
  // (saveSolutions puts the file's own solution straight back).
  const numbers = new Set<number>()
  for (const question of paper.questions) {
    if (numbers.has(question.number)) {
      throw new ImportError(`Question ${question.number} appears twice in the file.`)
    }
    numbers.add(question.number)
  }

  const existing = replacedExisting ? await loadSetQuestions(supabase, setId) : []
  const plan = matchQuestions(paper.questions, existing)

  // Removed questions go first, freeing their numbers. Their explanations are
  // kept, unanchored, and re-attach to any question with the same fingerprint.
  const removed = existing.filter((row) => !plan.matched.has(row.id))
  if (removed.length) {
    const { error } = await supabase.from('questions').delete().in('id', removed.map((row) => row.id))
    if (error) throw new ImportError(`Could not remove old questions: ${error.message}`)
    const list = removed.map((row) => row.number).join(', ')
    warnings.push(
      removed.length === 1
        ? `Removed question ${list}, which is not in the new file. Its attempts and discussions went with it; its explanations were kept.`
        : `Removed questions ${list}, which are not in the new file. Their attempts and discussions went with them; their explanations were kept.`,
    )
  }

  // Renumbered questions step aside to unused negative numbers first, so two
  // that swap places never collide on (set_id, number).
  const moving = [...plan.pairs].filter(([question, row]) => question.number !== row.number)
  for (const [index, [, row]] of moving.entries()) {
    const { error } = await supabase.from('questions').update({ number: -1 - index }).eq('id', row.id)
    if (error) throw new ImportError(`Could not renumber question ${row.number}: ${error.message}`)
  }

  let optionCount = 0
  const questionIds = new Map<number, string>()

  for (const question of paper.questions) {
    const fields = questionFields(question, paper.schema_version ?? SCHEMA_VERSION)
    const row = plan.pairs.get(question)
    let questionId: string

    if (row) {
      questionId = row.id
      const changes = changedFields(fields, row, moving.some(([, moved]) => moved.id === row.id))
      if (Object.keys(changes).length) {
        const { error } = await supabase.from('questions').update(changes).eq('id', row.id)
        if (error) throw new ImportError(`Could not update question ${question.number}: ${error.message}`)
      }
      await syncOptions(supabase, question, row)
    } else {
      const { data: inserted, error } = await supabase
        .from('questions')
        .insert({ set_id: setId, ...fields, status: 'published' })
        .select('id')
        .single()

      if (error || !inserted) {
        throw new ImportError(
          `Could not insert question ${question.number}: ${error?.message ?? 'unknown error'}`,
        )
      }
      questionId = inserted.id as string

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
      }
    }

    optionCount += question.options?.length ?? 0
    questionIds.set(question.number, questionId)
  }

  const solutionCount = await saveSolutions(supabase, paper, questionIds, options.createdBy ?? null, warnings)

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
// Re-import: matching incoming questions to the ones already in the set
// ---------------------------------------------------------------------------

interface ExistingOption {
  id: string
  label: string
  content: unknown
  is_correct: boolean
  sort_order: number
}

interface ExistingQuestion {
  id: string
  number: number
  type: string
  body: unknown
  schema_version: number
  marks: number
  negative_marks: number
  correct_answer: string | null
  answer_tolerance: number | null
  topics: string[]
  difficulty: string | null
  question_options: ExistingOption[]
}

async function loadSetQuestions(supabase: SupabaseClient, setId: string): Promise<ExistingQuestion[]> {
  const { data, error } = await supabase
    .from('questions')
    .select(
      'id, number, type, body, schema_version, marks, negative_marks, correct_answer, answer_tolerance, topics, difficulty, ' +
        'question_options(id, label, content, is_correct, sort_order)',
    )
    .eq('set_id', setId)
  if (error) throw new ImportError(`Could not read the existing set: ${error.message}`)

  return ((data ?? []) as unknown as ExistingQuestion[]).map((row) => ({
    ...row,
    question_options: [...(row.question_options ?? [])].sort((a, b) => a.sort_order - b.sort_order),
  }))
}

/**
 * Pairs each incoming question with the existing row it replaces:
 *   1. same content, same number   — untouched
 *   2. same content, other number  — the file renumbered it
 *   3. same number, other content  — a correction in place
 * Anything left is inserted (incoming) or removed (existing).
 */
function matchQuestions(incoming: ImportQuestion[], existing: ExistingQuestion[]) {
  const pairs = new Map<ImportQuestion, ExistingQuestion>()
  const matched = new Set<string>()

  const existingKey = new Map(
    existing.map((row) => [
      row.id,
      stableStringify({
        type: row.type,
        body: row.body,
        answer: row.correct_answer,
        options: row.question_options.map((option) => [option.content, option.is_correct]),
      }),
    ]),
  )
  const incomingKey = new Map(
    incoming.map((question) => [
      question,
      stableStringify({
        type: question.type,
        body: question.body,
        answer: question.correct_answer === undefined ? null : String(question.correct_answer),
        options: (question.options ?? []).map((option) => [option.content, option.is_correct ?? false]),
      }),
    ]),
  )

  const passes: Array<(question: ImportQuestion, row: ExistingQuestion) => boolean> = [
    (question, row) => row.number === question.number && existingKey.get(row.id) === incomingKey.get(question),
    (question, row) => existingKey.get(row.id) === incomingKey.get(question),
    (question, row) => row.number === question.number,
  ]
  for (const fits of passes) {
    for (const question of incoming) {
      if (pairs.has(question)) continue
      const row = existing.find((candidate) => !matched.has(candidate.id) && fits(question, candidate))
      if (row) {
        pairs.set(question, row)
        matched.add(row.id)
      }
    }
  }

  return { pairs, matched }
}

/** The question columns an import sets. */
function questionFields(question: ImportQuestion, schemaVersion: number) {
  return {
    number: question.number,
    type: question.type,
    body: question.body,
    schema_version: schemaVersion,
    marks: question.marks ?? 1,
    negative_marks: question.negative_marks ?? 0,
    correct_answer: question.correct_answer === undefined ? null : String(question.correct_answer),
    answer_tolerance: question.answer_tolerance ?? null,
    topics: question.topics ?? [],
    difficulty: question.difficulty ?? null,
  }
}

/**
 * Only the columns that differ, so an unchanged question is not written at
 * all: no trigger runs, no fingerprint is recomputed, updated_at stays put.
 * A renumbered row always gets its number back from the temporary one.
 */
function changedFields(
  fields: ReturnType<typeof questionFields>,
  row: ExistingQuestion,
  renumbered: boolean,
): Partial<ReturnType<typeof questionFields>> {
  const changes: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    const current = (row as unknown as Record<string, unknown>)[key]
    if (stableStringify(value ?? null) !== stableStringify(current ?? null)) changes[key] = value
  }
  if (renumbered) changes.number = fields.number
  return changes as Partial<ReturnType<typeof questionFields>>
}

/**
 * Brings a kept question's options in line with the file, keeping option ids:
 * attempts store the ids a student chose. Options pair up by identical
 * content, then by label, then by position, so an option the file merely
 * reorders or relabels keeps its id and its content — a student's recorded
 * choice still shows what they chose, and no content passes through another
 * option on the way, which would briefly change the question's fingerprint.
 * Only real differences are written.
 */
async function syncOptions(supabase: SupabaseClient, question: ImportQuestion, row: ExistingQuestion) {
  const incoming = question.options ?? []
  const existing = row.question_options
  const used = new Set<string>()
  const pairedWith: (ExistingOption | undefined)[] = incoming.map(() => undefined)
  const label = (value: string) => value.trim().toLowerCase()

  const passes: Array<(option: (typeof incoming)[number], index: number, candidate: ExistingOption) => boolean> = [
    (option, _, candidate) => stableStringify(candidate.content) === stableStringify(option.content),
    (option, _, candidate) => label(candidate.label) === label(option.label),
    (_, index, candidate) => candidate.sort_order === index,
  ]
  for (const fits of passes) {
    incoming.forEach((option, index) => {
      if (pairedWith[index]) return
      const hit = existing.find((candidate) => !used.has(candidate.id) && fits(option, index, candidate))
      if (hit) {
        pairedWith[index] = hit
        used.add(hit.id)
      }
    })
  }

  const gone = existing.filter((option) => !used.has(option.id)).map((option) => option.id)
  if (gone.length) {
    const { error } = await supabase.from('question_options').delete().in('id', gone)
    if (error) throw new ImportError(`Could not update options for question ${question.number}: ${error.message}`)
  }

  const added: Record<string, unknown>[] = []
  for (const [index, option] of incoming.entries()) {
    const wanted = {
      label: option.label,
      content: option.content,
      is_correct: option.is_correct ?? false,
      sort_order: index,
    }
    const current = pairedWith[index]
    if (!current) {
      added.push({ question_id: row.id, ...wanted })
      continue
    }
    const changes = Object.fromEntries(
      Object.entries(wanted).filter(
        ([key, value]) => stableStringify(value) !== stableStringify((current as unknown as Record<string, unknown>)[key]),
      ),
    )
    if (Object.keys(changes).length) {
      const { error } = await supabase.from('question_options').update(changes).eq('id', current.id)
      if (error) throw new ImportError(`Could not update options for question ${question.number}: ${error.message}`)
    }
  }

  if (added.length) {
    const { error } = await supabase.from('question_options').insert(added)
    if (error) throw new ImportError(`Could not insert options for question ${question.number}: ${error.message}`)
  }
}

/**
 * Saves the file's own solutions. One already on the question with the same
 * kind, body and video is kept, so re-importing never stacks copies; a
 * changed one replaces the file's earlier version. Either stays live even
 * when this import changed its question. Video links must be YouTube, stored
 * in their canonical form.
 */
async function saveSolutions(
  supabase: SupabaseClient,
  paper: ImportPaper,
  questionIds: Map<number, string>,
  createdBy: string | null,
  warnings: string[],
): Promise<number> {
  const wanted = paper.questions.filter(
    (question) => question.solution && (question.solution.body?.length || question.solution.video_url),
  )
  if (!wanted.length) return 0

  const ids = wanted.map((question) => questionIds.get(question.number)).filter((id): id is string => Boolean(id))
  const { data, error } = await supabase
    .from('solutions')
    .select('id, question_id, kind, body, video_url, author_id, status')
    .in('question_id', ids)
  if (error) {
    warnings.push(`Solutions not saved: ${error.message}`)
    return 0
  }
  const present = (data ?? []) as {
    id: string
    question_id: string
    kind: string
    body: unknown
    video_url: string | null
    author_id: string | null
    status: string
  }[]

  // Changing a question sends the explanations written for it back to review
  // (0025). The file's own solution came in with that change, so the file
  // vouches for it and it goes live again. A teacher's authored explanation
  // is not the file's to approve, and a rejected one stays down: that was an
  // admin's decision.
  const republish = (row: (typeof present)[number]) =>
    row.status === 'pending' && (row.kind !== 'authored' || row.author_id === createdBy)
      ? { status: 'approved', review_note: null }
      : {}

  let count = 0
  for (const question of wanted) {
    const questionId = questionIds.get(question.number)
    const solution = question.solution
    if (!questionId || !solution) continue

    let videoUrl: string | null = null
    if (solution.video_url) {
      const ref = parseYouTubeUrl(solution.video_url)
      if (ref) {
        videoUrl = canonicalYouTubeUrl(ref)
      } else {
        warnings.push(`Question ${question.number}: the solution video is not a YouTube link and was left out.`)
      }
    }
    const body = solution.body ?? []
    if (!body.length && !videoUrl) continue

    const kind = solution.kind ?? 'authored'
    const sameKind = present.filter((row) => row.question_id === questionId && row.kind === kind)
    const identical = sameKind.find(
      (row) => stableStringify(row.body) === stableStringify(body) && row.video_url === videoUrl,
    )
    if (identical) {
      const restore = republish(identical)
      if ('status' in restore) {
        const { error: restoreError } = await supabase.from('solutions').update(restore).eq('id', identical.id)
        if (restoreError) {
          warnings.push(`Question ${question.number}: solution left in review (${restoreError.message}).`)
        }
      }
      count += 1
      continue
    }

    const earlier = sameKind.find((row) => row.author_id === createdBy)
    const { error: saveError } = earlier
      ? await supabase
          .from('solutions')
          .update({ body, video_url: videoUrl, ...republish(earlier) })
          .eq('id', earlier.id)
      : await supabase.from('solutions').insert({
          question_id: questionId,
          kind,
          body,
          video_url: videoUrl,
          author_id: createdBy,
          status: 'approved',
        })
    if (saveError) {
      warnings.push(`Question ${question.number}: solution not saved (${saveError.message}).`)
    } else {
      count += 1
    }
  }
  return count
}

/** JSON with object keys sorted, so equal content compares equal whatever order it was written in. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
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
