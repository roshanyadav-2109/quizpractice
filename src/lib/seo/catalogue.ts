import 'server-only'
import { cache } from 'react'
import { getBrowseTree, getExamTypes, getPapers, type PaperListing } from '@/lib/queries'
import { termOf, type Term } from '@/lib/terms'
import type { ExamType, Level, Program, Subject } from '@/types/db'
import { paperSlugs, paths, programSlug } from './paths'

/**
 * The public catalogue as the URLs see it: every published set with its
 * address, grouped by subject and exam. Built in memory from the shared,
 * cached paper list — never from the session — so every page and sitemap
 * that uses it can be rendered once and served to everyone.
 */

export interface PaperEntry {
  setId: string
  paperId: string
  /** "16-feb-2025", or "20-apr-2025-qdf2" where one day had several sets. */
  slug: string
  path: string
  subject: Subject
  level: Level
  program: Program
  examType: ExamType
  sessionDate: string | null
  term: Term | null
  setCode: string
  /** The paper's name as IIT Madras printed it: "IIT M FOUNDATION AN EXAM QDF2 26 Oct 2025". */
  officialTitle: string | null
  /** How many sets the sitting had; above one, the set code is part of its name. */
  setsInSitting: number
  questionCount: number
  totalMarks: number | null
  durationMinutes: number | null
  updatedAt: string | null
}

export interface SubjectExamNode {
  examType: ExamType
  path: string
  /** Newest sitting first. */
  papers: PaperEntry[]
}

export interface SubjectNode {
  subject: Subject
  level: Level
  program: Program
  path: string
  /** In the admin's exam order; only exams with papers. */
  exams: SubjectExamNode[]
  paperCount: number
  questionCount: number
  latest: PaperEntry | null
  years: number[]
}

export interface LevelNode {
  level: Level
  path: string
  subjects: SubjectNode[]
}

export interface ProgramNode {
  program: Program
  /** "data-science" — the address word, not the internal slug. */
  slug: string
  path: string
  levels: LevelNode[]
}

export interface SeoCatalogue {
  programs: ProgramNode[]
  subjects: SubjectNode[]
  papers: PaperEntry[]
  examTypes: ExamType[]
  subjectBySlug: Map<string, SubjectNode>
  paperBySetId: Map<string, PaperEntry>
  /** "maths-1|quiz-1|16-feb-2025" → the paper. */
  paperByPath: Map<string, PaperEntry>
}

function key(subject: string, exam: string, paper: string): string {
  return `${subject}|${exam}|${paper}`
}

export const getSeoCatalogue = cache(async (): Promise<SeoCatalogue> => {
  const [tree, examTypes, listings] = await Promise.all([getBrowseTree(), getExamTypes(), getPapers()])

  const place = new Map<string, { subject: Subject; level: Level; program: Program }>()
  for (const program of tree) {
    for (const level of program.levels) {
      for (const subject of level.subjects) place.set(subject.id, { subject, level, program })
    }
  }

  const sets = listings.flatMap((paper: PaperListing) =>
    paper.sets.map((set) => ({ paper, set })),
  )
  const slugs = paperSlugs(
    sets.map(({ paper, set }) => ({
      setId: set.id,
      subjectId: paper.subject_id,
      examTypeId: paper.exam_type_id,
      sessionDate: paper.session_date,
      setCode: set.set_code,
    })),
  )

  const sittingKey = (paper: PaperListing) => `${paper.subject_id}|${paper.exam_type_id}|${paper.session_date ?? ''}`
  const setsPerSitting = new Map<string, number>()
  for (const { paper } of sets) setsPerSitting.set(sittingKey(paper), (setsPerSitting.get(sittingKey(paper)) ?? 0) + 1)

  const papers: PaperEntry[] = []
  for (const { paper, set } of sets) {
    const where = place.get(paper.subject_id)
    const slug = slugs.get(set.id)
    if (!where || !slug) continue
    const sameDay = setsPerSitting.get(sittingKey(paper)) ?? 1
    papers.push({
      setId: set.id,
      paperId: paper.id,
      slug,
      path: paths.paper(where.subject.slug, paper.exam_type.slug, slug),
      ...where,
      examType: paper.exam_type,
      sessionDate: paper.session_date,
      term: termOf(paper.session_date),
      setCode: set.set_code,
      officialTitle: paper.title?.trim() || null,
      setsInSitting: sameDay,
      questionCount: set.question_count,
      totalMarks: paper.total_marks === null ? null : Number(paper.total_marks),
      durationMinutes: paper.duration_minutes ?? paper.exam_type.default_duration_minutes,
      updatedAt: paper.updated_at ?? paper.created_at ?? null,
    })
  }
  // Newest sitting first, then by set code.
  papers.sort(
    (a, b) =>
      (b.sessionDate ?? '').localeCompare(a.sessionDate ?? '') || a.setCode.localeCompare(b.setCode, 'en', { numeric: true }),
  )

  const examOrder = new Map(examTypes.map((exam, index) => [exam.id, index]))
  const subjects: SubjectNode[] = []
  const subjectBySlug = new Map<string, SubjectNode>()
  for (const { subject, level, program } of place.values()) {
    const mine = papers.filter((paper) => paper.subject.id === subject.id)
    const exams = [...new Set(mine.map((paper) => paper.examType.id))]
      .map((id) => mine.find((paper) => paper.examType.id === id)!.examType)
      .sort((a, b) => (examOrder.get(a.id) ?? 99) - (examOrder.get(b.id) ?? 99))
      .map((examType) => ({
        examType,
        path: paths.subjectExam(subject.slug, examType.slug),
        papers: mine.filter((paper) => paper.examType.id === examType.id),
      }))
    const node: SubjectNode = {
      subject,
      level,
      program,
      path: paths.subject(subject.slug),
      exams,
      paperCount: mine.length,
      questionCount: mine.reduce((sum, paper) => sum + paper.questionCount, 0),
      latest: mine[0] ?? null,
      years: [...new Set(mine.flatMap((paper) => (paper.term ? [paper.term.year] : [])))].sort((a, b) => b - a),
    }
    subjects.push(node)
    subjectBySlug.set(subject.slug, node)
  }

  const programs: ProgramNode[] = tree.map((program) => ({
    program,
    slug: programSlug(program),
    path: paths.program(programSlug(program)),
    levels: program.levels.map((level) => ({
      level,
      path: paths.level(programSlug(program), level.slug),
      subjects: level.subjects.flatMap((subject) => {
        const node = subjectBySlug.get(subject.slug)
        return node ? [node] : []
      }),
    })),
  }))

  return {
    programs,
    subjects,
    papers,
    examTypes,
    subjectBySlug,
    paperBySetId: new Map(papers.map((paper) => [paper.setId, paper])),
    paperByPath: new Map(papers.map((paper) => [key(paper.subject.slug, paper.examType.slug, paper.slug), paper])),
  }
})

/** A paper from its three URL segments. */
export async function findPaper(subject: string, exam: string, paper: string): Promise<PaperEntry | null> {
  const catalogue = await getSeoCatalogue()
  return catalogue.paperByPath.get(key(subject, exam, paper)) ?? null
}

/** The address of a set, for anything that still only knows its id. */
export async function paperPathForSet(setId: string): Promise<string | null> {
  const catalogue = await getSeoCatalogue()
  return catalogue.paperBySetId.get(setId)?.path ?? null
}
