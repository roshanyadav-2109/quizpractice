import type { ExamType, Level, Program, Subject } from '@/types/db'
import type { PaperEntry } from './catalogue'
import { examFact } from './exam-facts'
import { listOf, shortName, sittingDate, yearSpan } from './names'

/**
 * Every page title and main heading, from one set of patterns — the ones
 * students' searches take, measured across 5,000 search suggestions and 370
 * video titles (September 2026):
 *
 *   subject, then exam, then "PYQ", then "IITM BS"
 *   — "Maths 1 Quiz 1 PYQ IITM BS", never "IITM PYQ Maths 1 Quiz 1"
 *
 * "IITM BS", never bare "IITM": alone it also means IITM Janakpuri, IITM
 * Pune and NPTEL. Short names lead for Foundation and Diploma courses; the
 * database's short name for a degree-level course is its full name, because
 * that is how those are searched. The brand is added by pageMetadata when
 * there is room, so these stop short of it.
 */

type Named = Pick<Subject, 'name' | 'aliases'> & { short_name?: string | null }

const LONG_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/** "16 February 2025" */
export function longDate(date: string | null): string {
  return date ? LONG_DATE.format(new Date(`${date}T00:00:00Z`)) : 'Undated'
}

/** "Foundation Level" → "Foundation". */
function levelShort(level: Pick<Level, 'name'>): string {
  return level.name.replace(/\s+level$/i, '').replace(/\s+degree level$/i, '')
}

function programShort(program: Pick<Program, 'name' | 'short_name'>): string {
  return program.short_name ?? program.name
}

export const titles = {
  // Under 60 characters with " | Quiz Space": the whole title shows in results.
  home: () => 'IITM BS PYQ: Quiz, End Term & Qualifier Papers',
  homeHeading: () => 'IITM BS PYQs with answers: Quiz 1, Quiz 2, End Term, Qualifier',

  program(program: Pick<Program, 'name' | 'short_name'>, courses: number): string {
    const short = programShort(program)
    return /electronic/i.test(short)
      ? 'IITM BS Electronic Systems (ES) PYQs: Quiz & End Term Papers'
      : `IITM BS ${short} PYQs: All ${courses} Courses, Quiz & End Term`
  },
  programHeading: (program: Pick<Program, 'name'>, courses: number) =>
    `IIT Madras ${program.name}: previous year papers for all ${courses} courses`,

  level(level: Pick<Level, 'name'>, program: Pick<Program, 'name' | 'short_name'>, subjects: Named[]): string {
    const base = `IITM BS ${/data science/i.test(programShort(program)) ? '' : `${programShort(program)} `}${levelShort(level)} PYQs`
    // As many subject names as fit a results-page title.
    const names: string[] = []
    for (const subject of subjects.map(shortName)) {
      // A long name that does not fit is skipped, not the end of the list.
      if (`${base}: ${[...names, subject].join(', ')}`.length > 60) continue
      names.push(subject)
    }
    return names.length > 0 ? `${base}: ${names.join(', ')}` : base
  },
  levelHeading: (level: Pick<Level, 'name'>, program: Pick<Program, 'name'>) =>
    `${levelShort(level)} PYQs — IIT Madras ${program.name}`,

  subject(subject: Named, exams: Pick<ExamType, 'name'>[]): string {
    const short = shortName(subject)
    const list = listOf(exams.map((exam) => exam.name)).replace(/ and ([^,]*)$/, ' & $1')
    const withPapers = `${short} PYQ IITM BS: ${list} Papers`
    return withPapers.length <= 60 ? withPapers : `${short} PYQ IITM BS: ${list}`
  },
  subjectHeading(subject: Named): string {
    const short = shortName(subject)
    return short === subject.name ? `${subject.name} previous year papers` : `${subject.name} (${short}) previous year papers`
  },

  subjectExam: (subject: Named, exam: Pick<ExamType, 'name'>, count: number) =>
    `${shortName(subject)} ${exam.name} PYQ IITM BS: ${count} ${count === 1 ? 'Paper' : 'Papers'} with Answers`,
  subjectExamHeading(subject: Named, exam: Pick<ExamType, 'name' | 'slug'>): string {
    const weeks = examFact(exam.slug)?.weeks
    return `${shortName(subject)} ${exam.name} previous year papers${weeks ? ` (${weeks})` : ''}`
  },

  paper(paper: PaperEntry): string {
    const short = shortName(paper.subject)
    const set = paper.setsInSitting > 1 ? ` (Set ${paper.setCode})` : ''
    if (paper.examType.slug === 'qualifier') return `IITM BS Qualifier ${short} PYQ: ${sittingDate(paper.sessionDate)}${set}`
    return `${short} ${paper.examType.name} PYQ ${paper.term?.short ?? ''}: ${sittingDate(paper.sessionDate)}${set} · IITM BS`
  },
  paperHeading(paper: PaperEntry): string {
    const set = paper.setsInSitting > 1 ? `, Set ${paper.setCode}` : ''
    const heading = (name: string) =>
      `${name} ${paper.examType.name}: ${longDate(paper.sessionDate)}${set} (${paper.term?.label ?? 'undated'})`
    // The full course name when the heading stays readable; the short one past 70 characters.
    const full = heading(paper.subject.name)
    return full.length <= 70 ? full : heading(shortName(paper.subject))
  },

  question(stem: string, paper: PaperEntry, number: number): string {
    const context = `${shortName(paper.subject)} ${paper.examType.name} PYQ ${paper.term ? sittingDate(paper.sessionDate).replace(/^\d+\s+/, '') : ''}`.trim()
    if (!stem) return `${context}, Question ${number} · IITM BS`
    const cut = stem.length > 48 ? `${stem.slice(0, 47).replace(/\s+\S*$/, '')}…` : stem
    return `${cut} | ${context}`
  },

  exam(exam: Pick<ExamType, 'name' | 'slug'>, years: number[]): string {
    switch (exam.slug) {
      case 'qualifier':
        return `IITM BS Qualifier PYQ: Previous Year Papers ${yearSpan(years)}`
      case 'diploma-qualifier':
        return 'IITM Diploma Qualifier PYQ: Direct Entry Exam Papers'
      case 'quiz-1':
        return 'IITM BS Quiz 1 PYQ: All Subjects, Weeks 1–4 Papers'
      case 'quiz-2':
        return 'IITM BS Quiz 2 PYQ: All Subjects, Previous Year Papers'
      case 'end-term':
        return 'IITM BS End Term PYQ: Previous Year Papers, All Courses'
      default:
        return `IITM BS ${exam.name} PYQ: Previous Year Papers, All Subjects`
    }
  },
  examHeading(exam: Pick<ExamType, 'name' | 'slug'>): string {
    if (exam.slug === 'qualifier') return 'IIT Madras BS Qualifier exam: previous year papers'
    if (exam.slug === 'diploma-qualifier') return 'IIT Madras Diploma (direct entry) Qualifier: previous year papers'
    return `IITM BS ${exam.name} previous year papers for every course`
  },

  subjects: (count: number) => `All IITM BS Subjects: PYQs for ${count} Courses (DS & ES)`,
}
