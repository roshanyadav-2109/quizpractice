import type { ExamType, Level, Program, Subject } from '@/types/db'
import type { PaperEntry } from './catalogue'
import { examFact } from './exam-facts'
import { listOf, shortName, sittingDate, yearSpan } from './names'

/**
 * Every page title and main heading, from one set of patterns — the ones
 * students' searches take, measured across 5,000 search suggestions and 370
 * video titles (September 2026):
 *
 *   subject, then exam, then "PYQ", then what comes with it
 *   — "Maths 1 Quiz 1 PYQ with Video Solutions", never "IITM PYQ Maths 1 Quiz 1"
 *
 * What comes with it is the answer key for every question and a video
 * solution on each question's page — so titles say "with Solutions" and
 * "Video Solutions", the words students add to these searches.
 *
 * "IITM BS", never bare "IITM": alone it also means IITM Janakpuri, IITM
 * Pune and NPTEL. Short names lead for Foundation and Diploma courses; the
 * database's short name for a degree-level course is its full name, because
 * that is how those are searched.
 *
 * Each title is the first of its candidates that fits a results page (about
 * 60 characters); the brand is added by pageMetadata when there is room.
 */

type Named = Pick<Subject, 'name' | 'aliases'> & { short_name?: string | null }

/** What a results page shows of a title before cutting it. */
const ROOM = 60
/** A main heading kept to what reads at a glance. */
const HEADING_ROOM = 70

/** The first candidate that fits, else the shortest. */
function fit(candidates: string[], room = ROOM): string {
  return candidates.find((title) => title.length <= room) ?? candidates.reduce((a, b) => (b.length < a.length ? b : a))
}

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

/** "Quiz 1, Quiz 2 & End Term" */
function examList(exams: Pick<ExamType, 'name'>[]): string {
  return listOf(exams.map((exam) => exam.name)).replace(/ and ([^,]*)$/, ' & $1')
}

export const titles = {
  // With " | Quiz Space" this is 60 characters: the whole title shows in results.
  home: () => 'IITM BS PYQs with Video Solutions & Answer Keys',
  homeHeading: () => 'IITM BS PYQs with solutions: Quiz 1, Quiz 2, End Term, Qualifier',

  program(program: Pick<Program, 'name' | 'short_name'>, courses: number): string {
    const short = /electronic/i.test(programShort(program)) ? 'Electronic Systems' : programShort(program)
    return fit([
      `IITM BS ${short} PYQs with Solutions: All ${courses} Courses`,
      `IITM BS ${short} PYQs with Solutions`,
      `IITM BS ${short} PYQs`,
    ])
  },
  programHeading: (program: Pick<Program, 'name'>) =>
    fit([`${program.name} PYQs with solutions`, `${program.name} PYQs`], HEADING_ROOM),

  level(level: Pick<Level, 'name'>, program: Pick<Program, 'name' | 'short_name'>, subjects: Named[]): string {
    const base = `IITM BS ${/data science/i.test(programShort(program)) ? '' : `${programShort(program)} `}${levelShort(level)} PYQs with Solutions`
    // As many subject names as fit; a long one that does not is skipped, not the end of the list.
    const names: string[] = []
    for (const subject of subjects.map(shortName)) {
      if (`${base}: ${[...names, subject].join(', ')}`.length > ROOM) continue
      names.push(subject)
    }
    return names.length > 0 ? `${base}: ${names.join(', ')}` : base
  },
  levelHeading: (level: Pick<Level, 'name'>, program: Pick<Program, 'name'>) =>
    fit([`${levelShort(level)} PYQs with solutions — IIT Madras ${program.name}`, `${levelShort(level)} PYQs with solutions`], HEADING_ROOM),

  subject(subject: Named, exams: Pick<ExamType, 'name'>[]): string {
    const short = shortName(subject)
    return fit([
      `${short} PYQ with Solutions: IITM BS ${examList(exams)}`,
      `${short} PYQ with Video Solutions & Answer Keys | IITM BS`,
      `${short} PYQ with Video Solutions | IITM BS`,
      `${short} PYQ with Solutions | IITM BS`,
      `${short} PYQ | IITM BS`,
    ])
  },
  subjectHeading(subject: Named): string {
    const short = shortName(subject)
    return fit(
      [
        ...(short === subject.name ? [] : [`${subject.name} (${short}) PYQs with solutions`]),
        `${subject.name} PYQs with solutions`,
        `${short} PYQs with solutions`,
      ],
      HEADING_ROOM,
    )
  },

  subjectExam: (subject: Named, exam: Pick<ExamType, 'name'>, count: number) => {
    const short = shortName(subject)
    const papers = `${count} IITM BS ${count === 1 ? 'Paper' : 'Papers'}`
    return fit([
      `${short} ${exam.name} PYQ with Video Solutions: ${papers}`,
      `${short} ${exam.name} PYQ with Solutions: ${papers}`,
      `${short} ${exam.name} PYQ with Solutions | IITM BS`,
      `${short} ${exam.name} PYQ | IITM BS`,
    ])
  },
  subjectExamHeading(subject: Named, exam: Pick<ExamType, 'name' | 'slug'>): string {
    const weeks = examFact(exam.slug)?.weeks
    const base = `${shortName(subject)} ${exam.name} PYQs with solutions`
    return fit([weeks ? `${base} (${weeks})` : base, base], HEADING_ROOM)
  },

  paper(paper: PaperEntry): string {
    const short = shortName(paper.subject)
    const set = paper.setsInSitting > 1 ? ` (Set ${paper.setCode})` : ''
    const date = sittingDate(paper.sessionDate)
    if (paper.examType.slug === 'qualifier') {
      return fit([
        `IITM BS Qualifier ${short} PYQ ${date}${set} with Solutions`,
        `IITM BS Qualifier ${short} PYQ ${date}${set}`,
        `Qualifier ${short} PYQ ${date}${set}`,
      ])
    }
    const term = paper.term?.short ?? ''
    return fit([
      `${short} ${paper.examType.name} PYQ ${term}: ${date}${set} with Video Solutions`,
      `${short} ${paper.examType.name} PYQ ${term}: ${date}${set} with Solutions`,
      `${short} ${paper.examType.name} PYQ ${date}${set} with Solutions`,
      `${short} ${paper.examType.name} PYQ ${date}${set} · IITM BS`,
    ])
  },
  paperHeading(paper: PaperEntry): string {
    const set = paper.setsInSitting > 1 ? `, Set ${paper.setCode}` : ''
    const heading = (name: string) =>
      `${name} ${paper.examType.name}: ${longDate(paper.sessionDate)}${set} (${paper.term?.label ?? 'undated'})`
    // The full course name when the heading stays readable; the short one past 70 characters.
    return fit([heading(paper.subject.name), heading(shortName(paper.subject))], HEADING_ROOM)
  },

  /** The question's own words first — what a student pastes into a search — then where it is from. */
  question(stem: string, paper: PaperEntry, number: number): string {
    const month = paper.term ? sittingDate(paper.sessionDate).replace(/^\d+\s+/, '') : ''
    const context = `${shortName(paper.subject)} ${paper.examType.name} ${month}`.replace(/\s+/g, ' ').trim()
    if (!stem) return `${context} PYQ Q${number} with Video Solution · IITM BS`
    const cut = stem.length > 44 ? `${stem.slice(0, 43).replace(/\s+\S*$/, '')}…` : stem
    return `${cut} | ${context} PYQ Video Solution`
  },

  exam(exam: Pick<ExamType, 'name' | 'slug'>, years: number[]): string {
    switch (exam.slug) {
      case 'qualifier':
        return fit([
          `IITM BS Qualifier PYQ with Video Solutions ${yearSpan(years)}`,
          `IITM BS Qualifier PYQ with Solutions ${yearSpan(years)}`,
        ])
      case 'diploma-qualifier':
        return 'IITM Diploma Qualifier PYQ with Solutions: Direct Entry'
      case 'quiz-1':
        return 'IITM BS Quiz 1 PYQ with Video Solutions: Weeks 1–4'
      case 'quiz-2':
        return 'IITM BS Quiz 2 PYQ with Video Solutions: All Subjects'
      case 'end-term':
        return 'IITM BS End Term PYQ with Video Solutions: All Courses'
      default:
        return fit([`IITM BS ${exam.name} PYQ with Solutions: All Subjects`, `IITM BS ${exam.name} PYQ with Solutions`])
    }
  },
  examHeading(exam: Pick<ExamType, 'name' | 'slug'>): string {
    if (exam.slug === 'qualifier') return 'IIT Madras BS Qualifier exam PYQs with solutions'
    if (exam.slug === 'diploma-qualifier') return 'IIT Madras Diploma (direct entry) Qualifier PYQs'
    return `IITM BS ${exam.name} PYQs with solutions, every course`
  },

  examYear: (exam: Pick<ExamType, 'name'>, year: number) =>
    fit([`IITM BS ${exam.name} PYQ ${year} with Solutions: All Subjects`, `IITM BS ${exam.name} PYQ ${year} with Solutions`]),
  examYearHeading: (exam: Pick<ExamType, 'name'>, year: number) => `IITM BS ${exam.name} ${year} question papers with solutions`,
  year: (year: number) => fit([`IITM BS PYQ ${year} with Solutions: Quiz, End Term & Qualifier`, `IITM BS PYQ ${year} with Solutions`]),
  yearHeading: (year: number) => `IITM BS ${year} previous year papers with solutions`,
  subjectExamYear: (subject: Named, exam: Pick<ExamType, 'name'>, year: number, count: number) => {
    const short = shortName(subject)
    return fit([
      `${short} ${exam.name} PYQ ${year} with Solutions: ${count} IITM BS Papers`,
      `${short} ${exam.name} PYQ ${year} with Solutions`,
      `${short} ${exam.name} PYQ ${year} | IITM BS`,
    ])
  },
  subjectExamYearHeading: (subject: Named, exam: Pick<ExamType, 'name'>, year: number) =>
    `${shortName(subject)} ${exam.name} ${year} question papers with solutions`,

  subjects: (count: number) => `All IITM BS Subjects: PYQs with Solutions for ${count} Courses`,
}
