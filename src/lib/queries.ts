import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { publicClient, memoise } from '@/lib/supabase/public'
import { blocksToText, parseBlocks } from '@/lib/blocks/schema'
import { classifyAttempt, type AttemptQuality } from '@/lib/analysis'
import { isAutoMarkable } from '@/lib/scoring'
import type {
  ExamType,
  Level,
  Program,
  ProgramStats,
  QuestionOptionRow,
  QuestionPaper,
  QuestionSet,
  QuestionWithOptions,
  SolutionRow,
  Subject,
  SubjectStats,
} from '@/types/db'

/**
 * Every read the public site makes. Pages stay thin and the shape of a query is
 * defined once, which matters because RLS means a mistake here shows up as
 * silently missing rows rather than an error.
 */

export interface SubjectWithStats extends Subject {
  stats: SubjectStats | null
}

export interface LevelWithSubjects extends Level {
  subjects: SubjectWithStats[]
}

export interface ProgramWithLevels extends Program {
  levels: LevelWithSubjects[]
  stats: ProgramStats | null
}

/**
 * Programmes, levels and subjects.
 *
 * Public, and effectively static — it changes when an admin edits the taxonomy
 * and at no other time — so it is read without a session and held briefly in
 * process. That takes three round trips off the front of every browse page.
 */
const loadTaxonomy = memoise(async () => {
  const [programsResult, levelsResult, subjectsResult] = await Promise.all([
    publicClient.from('programs').select('*').eq('is_active', true).returns<Program[]>(),
    publicClient.from('levels').select('*').eq('is_active', true).returns<Level[]>(),
    publicClient.from('subjects').select('*').eq('is_active', true).returns<Subject[]>(),
  ])

  for (const [name, result] of [
    ['programs', programsResult],
    ['levels', levelsResult],
    ['subjects', subjectsResult],
  ] as const) {
    if (result.error) throw new Error(`taxonomy: ${name} failed — ${result.error.message}`)
  }

  return {
    programs: programsResult.data ?? [],
    levels: levelsResult.data ?? [],
    subjects: subjectsResult.data ?? [],
  }
}, 60_000)

/**
 * The full taxonomy tree, which is what every browse surface is built from.
 *
 * The two stats views aggregate the whole bank — every paper, set, question and
 * solution — and cost roughly a second each once the bank is real. Almost
 * nothing needs those numbers, so they are opt-in: pass `withStats` only on a
 * surface that actually prints a count.
 */
export async function getBrowseTree(
  { withStats = false }: { withStats?: boolean } = {},
): Promise<ProgramWithLevels[]> {
  const supabase = await createClient()

  const empty = { data: null, error: null }

  const [taxonomy, programStatsResult, subjectStatsResult] = await Promise.all([
    loadTaxonomy(),
    withStats
      ? supabase.from('program_stats').select('*').returns<ProgramStats[]>()
      : Promise.resolve(empty as unknown as { data: ProgramStats[] | null; error: null }),
    withStats
      ? supabase.from('subject_stats').select('*').returns<SubjectStats[]>()
      : Promise.resolve(empty as unknown as { data: SubjectStats[] | null; error: null }),
  ])

  // A stats request can fail while the rest succeed. Swallowing that renders a
  // subject with 3,728 questions as "0", which reads as missing content rather
  // than as a failed request — so say so instead of showing a wrong number.
  for (const [name, result] of [
    ['program_stats', programStatsResult],
    ['subject_stats', subjectStatsResult],
  ] as const) {
    if (result.error) {
      console.error(`getBrowseTree: ${name} failed — ${result.error.message}`)
    }
  }

  const { programs, levels, subjects } = taxonomy
  const programStats = new Map((programStatsResult.data ?? []).map((s) => [s.program_id, s]))
  const subjectStats = new Map((subjectStatsResult.data ?? []).map((s) => [s.subject_id, s]))

  const bySort = <T extends { sort_order: number; name: string }>(a: T, b: T) =>
    a.sort_order - b.sort_order || a.name.localeCompare(b.name)

  return programs
    .slice()
    .sort(bySort)
    .map((program) => ({
      ...program,
      stats: programStats.get(program.id) ?? null,
      levels: levels
        .filter((level) => level.program_id === program.id)
        .sort(bySort)
        .map((level) => ({
          ...level,
          subjects: subjects
            .filter((subject) => subject.level_id === level.id)
            .sort(bySort)
            .map((subject) => ({
              ...subject,
              stats: subjectStats.get(subject.id) ?? null,
            })),
        })),
    }))
}

/**
 * Which subjects have something to practise.
 *
 * The index only needs the yes/no, not a total, and this reads 187 indexed
 * rows instead of aggregating 10,000 questions behind a per-row EXISTS.
 */
export async function getSubjectsWithPapers(): Promise<Set<string>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('question_papers')
    .select('subject_id')
    .eq('status', 'published')
    .returns<{ subject_id: string }[]>()

  if (error) {
    console.error(`getSubjectsWithPapers failed — ${error.message}`)
    return new Set()
  }

  return new Set((data ?? []).map((row) => row.subject_id))
}

export interface SetCount {
  set_id: string
  paper_id: string
  subject_id: string
  question_count: number
}

/**
 * How many published questions each published set holds, with the paper and
 * subject it belongs to — everything the catalogue counts is a sum over these
 * few hundred rows.
 *
 * Counting through RLS does not work at this size: an embedded count over
 * ~10k questions hits the statement timeout. Migration 0009 adds
 * `published_set_counts()`, a SECURITY DEFINER function that does the count
 * once in a plain grouped join, and this prefers it. Until that migration is
 * applied the same count is taken with the service role. Either way the only
 * thing that leaves is a count of content that is already published and
 * already readable by anyone — no row, draft or answer.
 */
const loadSetCounts = memoise(async (): Promise<SetCount[]> => {
  const viaFunction = await publicClient.rpc('published_set_counts')
  if (!viaFunction.error) return (viaFunction.data ?? []) as SetCount[]

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { data, error } = await createAdminClient()
    .from('question_sets')
    .select('id, paper_id, question_papers!inner(subject_id, status), questions(count)')
    .eq('question_papers.status', 'published')
    .eq('questions.status', 'published')

  if (error) throw new Error(`set counts failed — ${error.message}`)

  type Raw = {
    id: string
    paper_id: string
    question_papers: { subject_id: string } | null
    questions: { count: number }[] | null
  }
  return ((data ?? []) as unknown as Raw[]).map((row) => ({
    set_id: row.id,
    paper_id: row.paper_id,
    subject_id: row.question_papers?.subject_id ?? '',
    question_count: row.questions?.[0]?.count ?? 0,
  }))
}, 60_000)

export interface CatalogueCounts {
  /** Published questions per set. */
  bySet: Map<string, number>
  /** Sittable papers (sets) and questions per subject. */
  bySubject: Map<string, { papers: number; questions: number }>
}

export async function getCatalogueCounts(): Promise<CatalogueCounts> {
  const rows = await loadSetCounts()

  const bySet = new Map<string, number>()
  const bySubject = new Map<string, { papers: number; questions: number }>()

  // A "paper" here is one sittable set: a sitting with two sets is two papers
  // you can take, and that is the number every surface shows.
  for (const row of rows) {
    bySet.set(row.set_id, row.question_count)
    const entry = bySubject.get(row.subject_id) ?? { papers: 0, questions: 0 }
    entry.papers += 1
    entry.questions += row.question_count
    bySubject.set(row.subject_id, entry)
  }

  return { bySet, bySubject }
}

/** Also public and also static, so it gets the same treatment as the taxonomy. */
const loadExamTypes = memoise(async () => {
  const { data, error } = await publicClient
    .from('exam_types')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')
    .returns<ExamType[]>()

  if (error) throw new Error(`exam_types failed — ${error.message}`)
  return data ?? []
}, 60_000)

export async function getExamTypes(): Promise<ExamType[]> {
  return loadExamTypes()
}

export interface PaperIndexRow {
  exam_type_id: string
  subject_id: string
  year: number | null
  session_date: string | null
}

/**
 * Which exam, subject and year every published paper is, and nothing else —
 * enough for the navigation to offer only menus that lead to papers. It is
 * public and it is read on every page, so it is memoised like the taxonomy.
 */
const loadPaperIndex = memoise(async (): Promise<PaperIndexRow[]> => {
  const { data, error } = await publicClient
    .from('question_papers')
    .select('exam_type_id, subject_id, year, session_date')
    .eq('status', 'published')
    .returns<PaperIndexRow[]>()

  if (error) throw new Error(`paper index failed — ${error.message}`)
  return data ?? []
}, 60_000)

export async function getPaperIndex(): Promise<PaperIndexRow[]> {
  return loadPaperIndex()
}

/**
 * Subjects with qualifier papers. The qualifier is the stage before Foundation
 * — how a student enters the programme — so the catalogue shows it as its
 * own first level in each branch, made of these subjects.
 */
export async function getQualifierSubjectIds(): Promise<Set<string>> {
  const [index, examTypes] = await Promise.all([loadPaperIndex(), loadExamTypes()])
  const qualifier = examTypes.find((exam) => exam.slug === 'qualifier')
  if (!qualifier) return new Set()
  return new Set(index.filter((row) => row.exam_type_id === qualifier.id).map((row) => row.subject_id))
}

export interface SubjectContext {
  subject: Subject
  level: Level
  program: Program
}

/**
 * Resolved from the memoised taxonomy rather than three chained lookups —
 * subject, then its level, then that level's programme were three round trips
 * in strict sequence before the page could render anything.
 */
export async function getSubjectBySlug(slug: string): Promise<SubjectContext | null> {
  const { programs, levels, subjects } = await loadTaxonomy()

  const subject = subjects.find((row) => row.slug === slug)
  if (!subject) return null

  const level = levels.find((row) => row.id === subject.level_id)
  if (!level) return null

  const program = programs.find((row) => row.id === level.program_id)
  if (!program) return null

  return { subject, level, program }
}

export interface PaperWithSets extends QuestionPaper {
  exam_type: ExamType
  sets: (QuestionSet & { question_count: number })[]
}

/** Papers for one subject, newest sitting first, with their sets. */
export interface PaperListing extends PaperWithSets {
  subject: Pick<Subject, 'id' | 'name' | 'slug' | 'code' | 'level_id'>
}

type RawPaper = QuestionPaper & {
  exam_type: ExamType
  subject: PaperListing['subject']
  sets: QuestionSet[] | null
}

/**
 * Every published paper with its exam, subject and sets, newest sitting first.
 *
 * Public, and it changes only when a paper is published, so like the taxonomy
 * it is read once without a session and held briefly. Every listing — a
 * subject, an exam, a year — is then a filter in memory rather than another
 * third of a second to Supabase.
 */
const loadPublishedPapers = memoise(async (): Promise<RawPaper[]> => {
  const { data, error } = await publicClient
    .from('question_papers')
    .select(
      '*, exam_type:exam_types(*), subject:subjects(id, name, slug, code, level_id), sets:question_sets(*)',
    )
    .eq('status', 'published')
    .order('session_date', { ascending: false, nullsFirst: false })

  if (error) throw new Error(`papers failed — ${error.message}`)
  return (data ?? []) as RawPaper[]
}, 60_000)

/**
 * Published papers, newest sitting first, each with its sets and how many
 * questions every set holds.
 *
 * The counts come from the catalogue counts rather than from embedding every
 * question id — that embed is evaluated under RLS row by row and grows with
 * the bank, where the counts are one memoised read.
 */
export async function getPapers(
  filters: { subjectId?: string; subjectIds?: string[]; examTypeId?: string; year?: number } = {},
): Promise<PaperListing[]> {
  const [all, counts] = await Promise.all([
    loadPublishedPapers().catch((error: Error) => {
      console.error(`getPapers failed — ${error.message}`)
      return [] as RawPaper[]
    }),
    getCatalogueCounts(),
  ])

  const subjectIds = filters.subjectIds ? new Set(filters.subjectIds) : null
  const matching = all.filter(
    (paper) =>
      (!filters.subjectId || paper.subject_id === filters.subjectId) &&
      (!subjectIds || subjectIds.has(paper.subject_id)) &&
      (!filters.examTypeId || paper.exam_type_id === filters.examTypeId) &&
      (!filters.year || paper.year === filters.year),
  )

  return matching.map((paper) => ({
    ...paper,
    sets: (paper.sets ?? [])
      .map((set) => ({ ...set, question_count: counts.bySet.get(set.id) ?? 0 }))
      .sort((a, b) => a.sort_order - b.sort_order || a.set_code.localeCompare(b.set_code)),
  }))
}

/** Papers for one subject. Kept as the name every existing caller uses. */
export async function getPapersForSubject(
  subjectId: string,
  filters: { examTypeId?: string; year?: number } = {},
): Promise<PaperWithSets[]> {
  return getPapers({ ...filters, subjectId })
}

export interface SetContext {
  set: QuestionSet
  paper: QuestionPaper
  examType: ExamType
  subject: Subject
  level: Level
  program: Program
  questions: QuestionWithOptions[]
}

/**
 * Everything needed to run or print one question set.
 *
 * `includeAnswers` controls whether is_correct comes back. Exam mode does not
 * ask for it, so the answer key is simply not in the payload while the student
 * is working; learning mode and the results page do.
 *
 * Deduplicated per request, so a page and its metadata share one read.
 */
export function getSetContext(
  setId: string,
  { includeAnswers }: { includeAnswers: boolean },
): Promise<SetContext | null> {
  return loadSetContext(setId, includeAnswers)
}

const loadSetContext = cache(async (setId: string, includeAnswers: boolean): Promise<SetContext | null> => {
  const supabase = await createClient()

  const optionColumns = includeAnswers
    ? 'id, question_id, label, content, is_correct, sort_order'
    : 'id, question_id, label, content, sort_order'

  // The set with its paper, and the questions, both need only the set id, so
  // they are asked for together. This used to be six queries in a row — set,
  // paper, subject, level, programme, questions — about two seconds before
  // the page could render.
  const [{ data: row }, { data: questions }] = await Promise.all([
    supabase
      .from('question_sets')
      .select('*, paper:question_papers(*, exam_type:exam_types(*))')
      .eq('id', setId)
      .maybeSingle<QuestionSet & { paper: (QuestionPaper & { exam_type: ExamType }) | null }>(),
    supabase
      .from('questions')
      .select(`*, options:question_options(${optionColumns})`)
      .eq('set_id', setId)
      .eq('status', 'published')
      .order('number'),
  ])

  if (!row?.paper) return null
  const { paper, ...set } = row

  const subjectContext = await getSubjectContextById(paper.subject_id)
  if (!subjectContext) return null

  type RawQuestion = Omit<QuestionWithOptions, 'body' | 'options'> & {
    body: unknown
    options: (Omit<QuestionOptionRow, 'content' | 'is_correct'> & {
      content: unknown
      is_correct?: boolean
    })[] | null
  }

  const parsed: QuestionWithOptions[] = ((questions ?? []) as RawQuestion[]).map((question) => ({
    ...question,
    body: parseBlocks(question.body),
    options: (question.options ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
      .map((option) => ({
        ...option,
        content: parseBlocks(option.content),
        is_correct: option.is_correct ?? false,
      })),
  }))

  return {
    set,
    paper,
    examType: paper.exam_type,
    ...subjectContext,
    questions: parsed,
  }
})

export interface SetOverview extends Omit<SetContext, 'questions'> {
  questions: Pick<QuestionWithOptions, 'id' | 'type' | 'marks' | 'negative_marks'>[]
}

/**
 * The set, its paper and the outline of its questions — type and marks, no
 * text, no options. Enough for the instructions page and for page titles, at
 * a fraction of the payload. Deduplicated per request.
 */
export const getSetOverview = cache(async (setId: string): Promise<SetOverview | null> => {
  const supabase = await createClient()

  const [{ data: row }, { data: questions }] = await Promise.all([
    supabase
      .from('question_sets')
      .select('*, paper:question_papers(*, exam_type:exam_types(*))')
      .eq('id', setId)
      .maybeSingle<QuestionSet & { paper: (QuestionPaper & { exam_type: ExamType }) | null }>(),
    supabase
      .from('questions')
      .select('id, type, marks, negative_marks')
      .eq('set_id', setId)
      .eq('status', 'published')
      .order('number')
      .returns<SetOverview['questions']>(),
  ])

  if (!row?.paper) return null
  const { paper, ...set } = row

  const subjectContext = await getSubjectContextById(paper.subject_id)
  if (!subjectContext) return null

  return { set, paper, examType: paper.exam_type, ...subjectContext, questions: questions ?? [] }
})

async function getSubjectContextById(subjectId: string): Promise<SubjectContext | null> {
  // Almost always answered from the memoised taxonomy, with no round trip.
  const { programs, levels, subjects } = await loadTaxonomy()
  const cachedSubject = subjects.find((row) => row.id === subjectId)
  const cachedLevel = cachedSubject ? levels.find((row) => row.id === cachedSubject.level_id) : undefined
  const cachedProgram = cachedLevel ? programs.find((row) => row.id === cachedLevel.program_id) : undefined
  if (cachedSubject && cachedLevel && cachedProgram) {
    return { subject: cachedSubject, level: cachedLevel, program: cachedProgram }
  }

  // The taxonomy memo holds active rows only; a paper under a retired subject
  // still resolves, the slow way.
  const supabase = await createClient()

  const { data: subject } = await supabase
    .from('subjects')
    .select('*')
    .eq('id', subjectId)
    .maybeSingle<Subject>()
  if (!subject) return null

  const { data: level } = await supabase
    .from('levels')
    .select('*')
    .eq('id', subject.level_id)
    .maybeSingle<Level>()
  if (!level) return null

  const { data: program } = await supabase
    .from('programs')
    .select('*')
    .eq('id', level.program_id)
    .maybeSingle<Program>()
  if (!program) return null

  return { subject, level, program }
}

/** Approved solutions for every question in a set, keyed by question id. */
export async function getSolutionsForSet(
  questionIds: string[],
): Promise<Record<string, SolutionRow[]>> {
  if (!questionIds.length) return {}
  const supabase = await createClient()

  const { data } = await supabase
    .from('solutions')
    .select('*')
    .in('question_id', questionIds)
    .eq('status', 'approved')
    .order('kind')
    .order('upvotes', { ascending: false })

  const grouped: Record<string, SolutionRow[]> = {}
  for (const raw of (data ?? []) as (Omit<SolutionRow, 'body'> & { body: unknown })[]) {
    const solution: SolutionRow = { ...raw, body: parseBlocks(raw.body) }
    grouped[solution.question_id] = [...(grouped[solution.question_id] ?? []), solution]
  }
  return grouped
}

/**
 * The same, found by the set rather than by its question ids — so it can be
 * asked for alongside the questions instead of waiting for them to arrive.
 */
export async function getSolutionsForSetId(setId: string): Promise<Record<string, SolutionRow[]>> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('solutions')
    .select('*, questions!inner(set_id)')
    .eq('questions.set_id', setId)
    .eq('status', 'approved')
    .order('kind')
    .order('upvotes', { ascending: false })

  const grouped: Record<string, SolutionRow[]> = {}
  for (const raw of (data ?? []) as (Omit<SolutionRow, 'body'> & { body: unknown; questions?: unknown })[]) {
    const { questions: _join, ...rest } = raw
    void _join
    const solution: SolutionRow = { ...rest, body: parseBlocks(rest.body) }
    grouped[solution.question_id] = [...(grouped[solution.question_id] ?? []), solution]
  }
  return grouped
}

export interface SearchHit {
  question_id: string
  set_id: string
  question_number: number
  question_type: string
  marks: number
  body: unknown
  subject_name: string
  subject_slug: string
  exam_type_name: string
  session_date: string | null
  set_code: string
  rank: number
}

export async function searchQuestions(
  term: string,
  filters: { subjectId?: string; examTypeId?: string } = {},
): Promise<SearchHit[]> {
  return (await searchWithOptions(term, filters)).hits
}

export interface SearchResults {
  hits: SearchHit[]
  /** Each hit's options, in order, parsed — for finding where a match sits. */
  options: Map<string, unknown[]>
}

/**
 * A search and the options of everything it found. Results are the same for
 * every visitor — published content only — so a term is held for a minute:
 * the example searches and a repeated query come back at once.
 */
export async function searchWithOptions(
  term: string,
  filters: { subjectId?: string; examTypeId?: string } = {},
): Promise<SearchResults> {
  const q = term.trim()
  if (!q) return { hits: [], options: new Map() }

  const key = `${q.toLowerCase()}|${filters.subjectId ?? ''}|${filters.examTypeId ?? ''}`
  const held = searches.get(key)
  if (held && held.expires > Date.now()) return held.results

  const { data, error } = await publicClient.rpc('search_questions', {
    q,
    subject: filters.subjectId ?? null,
    exam_type: filters.examTypeId ?? null,
    max_results: 40,
  })
  const hits = (data ?? []) as SearchHit[]

  const options = new Map<string, unknown[]>()
  if (hits.length > 0) {
    const { data: rows } = await publicClient
      .from('question_options')
      .select('question_id, content, sort_order')
      .in(
        'question_id',
        hits.map((hit) => hit.question_id),
      )
      .order('sort_order')
    for (const row of (rows ?? []) as { question_id: string; content: unknown }[]) {
      const list = options.get(row.question_id) ?? []
      list.push(row.content)
      options.set(row.question_id, list)
    }
  }

  const results = { hits, options }
  // A failed search is not held, so a blip does not stick for a minute.
  if (!error) {
    if (searches.size >= 300) searches.delete(searches.keys().next().value!)
    searches.set(key, { results, expires: Date.now() + 60_000 })
  }
  return results
}

const searches = new Map<string, { results: SearchResults; expires: number }>()

/** Distinct years that actually have published papers, for the year filter. */
export async function getAvailableYears(subjectId?: string): Promise<number[]> {
  const supabase = await createClient()
  let query = supabase
    .from('question_papers')
    .select('year')
    .eq('status', 'published')
    .not('year', 'is', null)

  if (subjectId) query = query.eq('subject_id', subjectId)

  const { data } = await query.returns<{ year: number }[]>()
  return [...new Set((data ?? []).map((row) => row.year))].sort((a, b) => b - a)
}

export interface RecentPaper {
  paper_id: string
  set_id: string
  subject_name: string
  subject_slug: string
  exam_type_name: string
  exam_type_slug: string
  session_date: string | null
}

/** Most recent sittings, for the "latest" rail on the index. */
export async function getRecentPapers(limit = 8): Promise<RecentPaper[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('question_papers')
    .select(
      'id, session_date, subjects(name, slug), exam_types(name, slug), question_sets(id)',
    )
    .eq('status', 'published')
    .order('session_date', { ascending: false, nullsFirst: false })
    .limit(limit)

  type Raw = {
    id: string
    session_date: string | null
    subjects: { name: string; slug: string } | null
    exam_types: { name: string; slug: string } | null
    question_sets: { id: string }[] | null
  }

  return ((data ?? []) as unknown as Raw[]).flatMap((paper) => {
    const set = paper.question_sets?.[0]
    if (!set || !paper.subjects) return []
    return [
      {
        paper_id: paper.id,
        set_id: set.id,
        subject_name: paper.subjects.name,
        subject_slug: paper.subjects.slug,
        exam_type_name: paper.exam_types?.name ?? 'Exam',
        exam_type_slug: paper.exam_types?.slug ?? '',
        session_date: paper.session_date,
      },
    ]
  })
}

export interface SetPeerStats {
  attempt_count: number
  avg_percentage: number | null
  median_percentage: number | null
  avg_duration_seconds: number | null
  your_rank: number | null
}

export interface QuestionPeerStats {
  question_id: string
  marked_count: number
  correct_percentage: number | null
  avg_time_seconds: number | null
}

/**
 * How everyone else did on this set.
 *
 * Both sides come from SECURITY DEFINER functions that only ever return
 * aggregates, and that withhold everything until at least three people have
 * submitted — below that an "average" is noise and a rank identifies someone.
 * A null here means "not enough data yet", which the UI must show as absence
 * rather than as zero.
 */
export async function getPeerStats(setId: string): Promise<{
  set: SetPeerStats | null
  questions: Map<string, QuestionPeerStats>
}> {
  const supabase = await createClient()

  const [setResult, questionResult] = await Promise.all([
    supabase.rpc('set_peer_stats', { target_set: setId }),
    supabase.rpc('question_peer_stats', { target_set: setId }),
  ])

  const setRows = (setResult.data ?? []) as SetPeerStats[]
  const questionRows = (questionResult.data ?? []) as QuestionPeerStats[]

  return {
    set: setRows[0] ?? null,
    questions: new Map(questionRows.map((row) => [row.question_id, row])),
  }
}

export interface MyAttempt {
  id: string
  set_id: string
  score: number | null
  max_score: number | null
  submitted_at: string | null
  duration_seconds: number | null
  subject_name: string
  subject_slug: string
  exam_type_name: string
  set_code: string
  session_date: string | null
}

/**
 * The signed-in student's own attempts, newest first. RLS already restricts
 * these to the owner, so no extra filter is needed here.
 */
/**
 * The signed-in user's id, verified locally from the session token — no round
 * trip — or null for a visitor.
 *
 * "Mine" queries filter on it explicitly. Row-level security alone is not
 * enough: it lets an admin read every attempt, which would put other students'
 * attempts on an admin's own dashboard.
 */
async function signedInUserId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const { data } = await supabase.auth.getClaims()
  const sub = data?.claims?.sub
  return typeof sub === 'string' ? sub : null
}

export async function getMyAttempts(limit = 50): Promise<MyAttempt[]> {
  const supabase = await createClient()
  const userId = await signedInUserId(supabase)
  if (!userId) return []

  const { data } = await supabase
    .from('attempts')
    .select(
      `id, set_id, score, max_score, submitted_at, duration_seconds,
       question_sets ( set_code,
         question_papers ( session_date,
           exam_types ( name ),
           subjects ( name, slug ) ) )`,
    )
    .eq('user_id', userId)
    .not('submitted_at', 'is', null)
    .order('submitted_at', { ascending: false })
    .limit(limit)

  type Raw = {
    id: string
    set_id: string
    score: number | null
    max_score: number | null
    submitted_at: string | null
    duration_seconds: number | null
    question_sets: {
      set_code: string
      question_papers: {
        session_date: string | null
        exam_types: { name: string } | null
        subjects: { name: string; slug: string } | null
      } | null
    } | null
  }

  return ((data ?? []) as unknown as Raw[]).flatMap((row) => {
    const paper = row.question_sets?.question_papers
    if (!paper?.subjects) return []
    return [
      {
        id: row.id,
        set_id: row.set_id,
        score: row.score,
        max_score: row.max_score,
        submitted_at: row.submitted_at,
        duration_seconds: row.duration_seconds,
        subject_name: paper.subjects.name,
        subject_slug: paper.subjects.slug,
        exam_type_name: paper.exam_types?.name ?? 'Exam',
        set_code: row.question_sets?.set_code ?? '',
        session_date: paper.session_date,
      },
    ]
  })
}

export interface MyProgress {
  attemptCount: number
  paperCount: number
  averagePercentage: number | null
  best: MyAttempt | null
  /** Best percentage per set, so a paper row can show "you scored 8/10". */
  bySet: Map<string, { percentage: number; attemptId: string; score: number; maxScore: number }>
}

export function summariseMyAttempts(attempts: MyAttempt[]): MyProgress {
  const bySet = new Map<
    string,
    { percentage: number; attemptId: string; score: number; maxScore: number }
  >()
  const percentages: number[] = []

  for (const attempt of attempts) {
    const max = Number(attempt.max_score ?? 0)
    if (max <= 0) continue
    const percentage = Math.round((Number(attempt.score ?? 0) / max) * 100)
    percentages.push(percentage)

    const existing = bySet.get(attempt.set_id)
    if (!existing || percentage > existing.percentage) {
      bySet.set(attempt.set_id, {
        percentage,
        attemptId: attempt.id,
        score: Number(attempt.score ?? 0),
        maxScore: max,
      })
    }
  }

  const best =
    attempts.find(
      (attempt) =>
        Number(attempt.max_score ?? 0) > 0 &&
        Math.round((Number(attempt.score ?? 0) / Number(attempt.max_score)) * 100) ===
          Math.max(...percentages, -1),
    ) ?? null

  return {
    attemptCount: attempts.length,
    paperCount: bySet.size,
    averagePercentage: percentages.length
      ? Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length)
      : null,
    best,
    bySet,
  }
}

export interface StudentTopic {
  topic: string
  attempted: number
  correct: number
  accuracy: number
}

export interface AnswerBreakdown {
  correct: number
  wrong: number
  skipped: number
  /** Answered, but not auto-marked (written answers) — compared by hand. */
  unmarked: number
  /** Seconds, over the answers that recorded time. */
  timeSpent: number
  timedAnswers: number
}

/** How many answers fell in each speed-and-accuracy class (see analysis.ts). */
export type QualityCounts = Partial<Record<AttemptQuality, number>>

export interface MyAnswerAnalytics {
  breakdown: AnswerBreakdown
  /** The same split for each attempt, keyed by attempt id. */
  byAttempt: Record<string, AnswerBreakdown>
  /** Speed-and-accuracy classes for each attempt, keyed by attempt id. */
  qualityByAttempt: Record<string, QualityCounts>
  /** Weakest first. */
  topics: StudentTopic[]
}

function hasResponse(response: unknown): boolean {
  if (response == null) return false
  if (typeof response !== 'object') return true
  const value = response as { option_ids?: unknown[]; value?: unknown; text?: unknown }
  if (Array.isArray(value.option_ids)) return value.option_ids.length > 0
  if (typeof value.value === 'string') return value.value.trim() !== ''
  if (typeof value.text === 'string') return value.text.trim() !== ''
  return Object.keys(value).length > 0
}

/**
 * Every answer this student has submitted, reduced to what the dashboard
 * shows: how answers split between right, wrong and skipped, the time spent,
 * and accuracy per topic (weakest first). One read serves both.
 *
 * PostgREST caps a response at 1,000 rows, so answers are read in pages.
 */
export async function getMyAnswerAnalytics(topicLimit = 6): Promise<MyAnswerAnalytics> {
  const zero = (): AnswerBreakdown => ({ correct: 0, wrong: 0, skipped: 0, unmarked: 0, timeSpent: 0, timedAnswers: 0 })
  const empty: MyAnswerAnalytics = { breakdown: zero(), byAttempt: {}, qualityByAttempt: {}, topics: [] }
  const supabase = await createClient()
  const userId = await signedInUserId(supabase)
  if (!userId) return empty

  type Raw = {
    attempt_id: string
    is_correct: boolean | null
    response: unknown
    time_spent_seconds: number | null
    questions: { topics: string[] | null; marks: number | string; type: string } | null
  }

  const rows: Raw[] = []
  const PAGE = 1000
  for (let from = 0; from < 20_000; from += PAGE) {
    const { data } = await supabase
      .from('attempt_answers')
      .select('attempt_id, is_correct, response, time_spent_seconds, questions(topics, marks, type), attempts!inner(user_id, submitted_at)')
      .eq('attempts.user_id', userId)
      .not('attempts.submitted_at', 'is', null)
      .order('id')
      .range(from, from + PAGE - 1)
    const page = (data ?? []) as unknown as Raw[]
    rows.push(...page)
    if (page.length < PAGE) break
  }

  const breakdown = zero()
  const byAttempt: Record<string, AnswerBreakdown> = {}
  const qualityByAttempt: Record<string, QualityCounts> = {}
  const tally = new Map<string, { attempted: number; correct: number }>()

  for (const row of rows) {
    const answered = hasResponse(row.response)
    const own = (byAttempt[row.attempt_id] ??= zero())
    for (const split of [breakdown, own]) {
      if (row.is_correct === true) split.correct += 1
      else if (row.is_correct === false && answered) split.wrong += 1
      else if (!answered) split.skipped += 1
      else split.unmarked += 1

      if (row.time_spent_seconds && row.time_spent_seconds > 0) {
        split.timeSpent += row.time_spent_seconds
        split.timedAnswers += 1
      }
    }

    const autoMarked = isAutoMarkable({ type: row.questions?.type ?? '' }) && row.is_correct !== null
    const quality = classifyAttempt({
      questionId: '',
      marks: Number(row.questions?.marks ?? 1),
      isCorrect: row.is_correct,
      answered,
      autoMarked,
      timeSpentSeconds: row.time_spent_seconds,
      topics: [],
    })
    const counts = (qualityByAttempt[row.attempt_id] ??= {})
    counts[quality] = (counts[quality] ?? 0) + 1

    if (row.is_correct === null) continue
    for (const topic of row.questions?.topics ?? []) {
      const entry = tally.get(topic) ?? { attempted: 0, correct: 0 }
      entry.attempted += 1
      if (row.is_correct) entry.correct += 1
      tally.set(topic, entry)
    }
  }

  const topics = [...tally.entries()]
    .map(([topic, entry]) => ({
      topic,
      attempted: entry.attempted,
      correct: entry.correct,
      accuracy: Math.round((entry.correct / entry.attempted) * 100),
    }))
    .sort((a, b) => a.accuracy - b.accuracy || b.attempted - a.attempted)
    .slice(0, topicLimit)

  return { breakdown, byAttempt, qualityByAttempt, topics }
}

export interface SuggestedSet {
  set_id: string
  set_code: string
  subject_name: string
  subject_slug: string
  exam_type_name: string
  session_date: string | null
}

/**
 * Papers in the student's own subjects that they have not sat yet, newest
 * sitting first — what to practise next, rather than whatever came first.
 */
export async function getSuggestedSets(
  subjectSlugs: string[],
  attemptedSetIds: Set<string>,
  limit = 10,
): Promise<SuggestedSet[]> {
  if (!subjectSlugs.length) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('question_sets')
    .select(
      'id, set_code, question_papers!inner(session_date, status, exam_types(name), subjects!inner(name, slug))',
    )
    .eq('question_papers.status', 'published')
    .in('question_papers.subjects.slug', subjectSlugs)
    .limit(400)

  type Raw = {
    id: string
    set_code: string
    question_papers: {
      session_date: string | null
      exam_types: { name: string } | null
      subjects: { name: string; slug: string } | null
    } | null
  }

  return ((data ?? []) as unknown as Raw[])
    .flatMap((set) => {
      const paper = set.question_papers
      if (!paper?.subjects || attemptedSetIds.has(set.id)) return []
      return [
        {
          set_id: set.id,
          set_code: set.set_code,
          subject_name: paper.subjects.name,
          subject_slug: paper.subjects.slug,
          exam_type_name: paper.exam_types?.name ?? 'Exam',
          session_date: paper.session_date,
        },
      ]
    })
    .sort((a, b) => (b.session_date ?? '').localeCompare(a.session_date ?? ''))
    .slice(0, limit)
}

export interface SuggestedPaper {
  set_id: string
  subject_name: string
  subject_slug: string
  exam_type_name: string
  session_date: string | null
  question_count: number
}

/**
 * Papers this student has not attempted yet. "What next" is the second thing a
 * returning student wants, right after "where was I".
 */
export async function getUnattemptedPapers(
  attemptedSetIds: string[],
  limit = 5,
): Promise<SuggestedPaper[]> {
  const supabase = await createClient()

  let query = supabase
    .from('question_sets')
    .select(
      'id, question_papers!inner(session_date, status, exam_types(name), subjects(name, slug)), questions(id)',
    )
    .eq('question_papers.status', 'published')
    .limit(limit + attemptedSetIds.length)

  if (attemptedSetIds.length) {
    query = query.not('id', 'in', `(${attemptedSetIds.join(',')})`)
  }

  const { data } = await query

  type Raw = {
    id: string
    question_papers: {
      session_date: string | null
      exam_types: { name: string } | null
      subjects: { name: string; slug: string } | null
    } | null
    questions: { id: string }[] | null
  }

  return ((data ?? []) as unknown as Raw[])
    .flatMap((set) => {
      const paper = set.question_papers
      if (!paper?.subjects) return []
      return [
        {
          set_id: set.id,
          subject_name: paper.subjects.name,
          subject_slug: paper.subjects.slug,
          exam_type_name: paper.exam_types?.name ?? 'Exam',
          session_date: paper.session_date,
          question_count: set.questions?.length ?? 0,
        },
      ]
    })
    .slice(0, limit)
}

export type LeaderboardScope = 'overall' | 'subject' | 'exam' | 'level' | 'program'

export interface LeaderboardRow {
  rank: number
  displayName: string
  avatarUrl: string | null
  papers: number
  avgPercentage: number
  isYou: boolean
}

/**
 * Students ranked by their average best score per paper, overall or within a
 * subject, exam type, level (by id — level slugs repeat across branches) or
 * branch. The top rows, plus the caller's own row wherever they stand.
 */
export async function getLeaderboard(
  scope: LeaderboardScope,
  scopeKey: string | null = null,
  topN = 10,
): Promise<LeaderboardRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('leaderboard', { scope, scope_key: scopeKey, top_n: topN, min_papers: 1 })
  if (error || !data) return []
  type Raw = {
    rank: number
    display_name: string
    avatar_url: string | null
    papers: number
    avg_percentage: number | string
    is_you: boolean
  }
  return (data as Raw[]).map((row) => ({
    rank: Number(row.rank),
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    papers: Number(row.papers),
    avgPercentage: Number(row.avg_percentage),
    isYou: row.is_you,
  }))
}

// ---------------------------------------------------------------------------
// Mistake bank
// ---------------------------------------------------------------------------

/** Days a fixed mistake waits before it comes back once, to check it stuck. */
export const RECAP_DAYS = 3

export type MistakeState = 'open' | 'recap' | 'fixed'

export interface MistakeItem {
  questionId: string
  setId: string
  number: number
  snippet: string
  subjectName: string
  subjectSlug: string
  examName: string
  session: string | null
  state: MistakeState
  /** Times answered wrong or left blank, across papers and retries. */
  misses: number
  lastSeen: string
  /** For a fixed mistake still waiting on its recap: when it comes back. */
  recapOn: string | null
}

/**
 * Every question this student has got wrong or left blank, with where it
 * stands now. A question's state comes from its whole history — papers and
 * retries together, newest last:
 *
 *   open   the latest answer is still wrong
 *   recap  put right once, RECAP_DAYS ago or more — due for one more check
 *   fixed  right twice in a row since the last miss, or right once and not
 *          yet due for its recap
 */
export async function getMistakeBank(): Promise<MistakeItem[]> {
  const supabase = await createClient()
  const userId = await signedInUserId(supabase)
  if (!userId) return []

  type Event = { at: string; correct: boolean }
  const history = new Map<string, Event[]>()
  const add = (questionId: string, event: Event) => history.set(questionId, [...(history.get(questionId) ?? []), event])

  const PAGE = 1000
  for (let from = 0; from < 20_000; from += PAGE) {
    const { data } = await supabase
      .from('attempt_answers')
      .select('question_id, is_correct, attempts!inner(user_id, submitted_at)')
      .eq('attempts.user_id', userId)
      .not('attempts.submitted_at', 'is', null)
      .not('is_correct', 'is', null)
      .order('id')
      .range(from, from + PAGE - 1)
    const page = (data ?? []) as unknown as {
      question_id: string
      is_correct: boolean
      attempts: { submitted_at: string }
    }[]
    for (const row of page) add(row.question_id, { at: row.attempts.submitted_at, correct: row.is_correct })
    if (page.length < PAGE) break
  }
  for (let from = 0; from < 20_000; from += PAGE) {
    const { data } = await supabase
      .from('question_reviews')
      .select('question_id, is_correct, reviewed_at')
      .eq('user_id', userId)
      .order('id')
      .range(from, from + PAGE - 1)
    const page = (data ?? []) as { question_id: string; is_correct: boolean; reviewed_at: string }[]
    for (const row of page) add(row.question_id, { at: row.reviewed_at, correct: row.is_correct })
    if (page.length < PAGE) break
  }

  const now = Date.now()
  const states = new Map<string, Pick<MistakeItem, 'state' | 'misses' | 'lastSeen' | 'recapOn'>>()
  for (const [questionId, events] of history) {
    const misses = events.filter((e) => !e.correct).length
    if (!misses) continue
    events.sort((a, b) => a.at.localeCompare(b.at))
    const last = events[events.length - 1]
    let streak = 0
    for (let i = events.length - 1; i >= 0 && events[i].correct; i--) streak += 1

    let state: MistakeState = 'open'
    let recapOn: string | null = null
    if (streak >= 2) state = 'fixed'
    else if (streak === 1) {
      const due = new Date(last.at).getTime() + RECAP_DAYS * 24 * 3600 * 1000
      if (due <= now) state = 'recap'
      else {
        state = 'fixed'
        recapOn = new Date(due).toISOString()
      }
    }
    states.set(questionId, { state, misses, lastSeen: last.at, recapOn })
  }

  const ids = [...states.keys()]
  const items: MistakeItem[] = []
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await supabase
      .from('questions')
      .select('id, number, set_id, body, question_sets(question_papers(session_date, exam_types(name), subjects(name, slug)))')
      .in('id', ids.slice(i, i + 150))
    type Raw = {
      id: string
      number: number
      set_id: string
      body: unknown
      question_sets: {
        question_papers: {
          session_date: string | null
          exam_types: { name: string } | null
          subjects: { name: string; slug: string } | null
        } | null
      } | null
    }
    for (const q of (data ?? []) as unknown as Raw[]) {
      const paper = q.question_sets?.question_papers
      const state = states.get(q.id)
      if (!paper?.subjects || !state) continue
      // A one-line preview: the question's words without Markdown or LaTeX marks.
      const text = blocksToText(parseBlocks(q.body))
        .replace(/\|[\s:|-]*-[\s:|-]*\|/g, ' ')
        .replace(/[|*_`$#>]+|\\(?=\s)/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      items.push({
        questionId: q.id,
        setId: q.set_id,
        number: q.number,
        snippet: text.length > 160 ? `${text.slice(0, 157)}…` : text || 'Question with an image',
        subjectName: paper.subjects.name,
        subjectSlug: paper.subjects.slug,
        examName: paper.exam_types?.name ?? 'Exam',
        session: paper.session_date,
        ...state,
      })
    }
  }

  const order: Record<MistakeState, number> = { open: 0, recap: 1, fixed: 2 }
  return items.sort((a, b) => order[a.state] - order[b.state] || b.lastSeen.localeCompare(a.lastSeen))
}

/**
 * Published questions by id, with their answer keys — for retrying mistakes,
 * where the student has already seen the paper's solutions.
 */
export async function getQuestionsWithAnswers(ids: string[]): Promise<QuestionWithOptions[]> {
  if (!ids.length) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('questions')
    .select('*, options:question_options(id, question_id, label, content, is_correct, sort_order)')
    .in('id', ids)
    .eq('status', 'published')

  type RawQuestion = Omit<QuestionWithOptions, 'body' | 'options'> & {
    body: unknown
    options: (Omit<QuestionOptionRow, 'content'> & { content: unknown })[] | null
  }
  const byId = new Map<string, QuestionWithOptions>(
    ((data ?? []) as RawQuestion[]).map((question) => [
      question.id,
      {
        ...question,
        body: parseBlocks(question.body),
        options: (question.options ?? [])
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
          .map((option) => ({ ...option, content: parseBlocks(option.content) })),
      },
    ]),
  )
  return ids.flatMap((id) => {
    const question = byId.get(id)
    return question ? [question] : []
  })
}

// ---------------------------------------------------------------------------
// Easy for others, missed by you
// ---------------------------------------------------------------------------

export interface PeerGap {
  questionId: string
  setId: string
  number: number
  subjectName: string
  subjectSlug: string
  examName: string
  session: string | null
  peerCount: number
  peerCorrect: number
  peerSeconds: number | null
  yourSeconds: number | null
  answered: boolean
}

/** Questions this student got wrong that most other students got right. */
export async function getMyPeerGaps(limit = 8): Promise<PeerGap[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('my_peer_gaps', { max_rows: limit, min_peers: 3 })
  if (error || !data) return []
  type Raw = {
    question_id: string
    set_id: string
    question_number: number
    subject_name: string
    subject_slug: string
    exam_type_name: string
    session_date: string | null
    peer_count: number
    peer_correct_percentage: number | string
    peer_avg_seconds: number | string | null
    your_seconds: number | null
    answered: boolean
  }
  return (data as Raw[]).map((row) => ({
    questionId: row.question_id,
    setId: row.set_id,
    number: row.question_number,
    subjectName: row.subject_name,
    subjectSlug: row.subject_slug,
    examName: row.exam_type_name,
    session: row.session_date,
    peerCount: Number(row.peer_count),
    peerCorrect: Number(row.peer_correct_percentage),
    peerSeconds: row.peer_avg_seconds === null ? null : Number(row.peer_avg_seconds),
    yourSeconds: row.your_seconds,
    answered: row.answered,
  }))
}
