/**
 * What each kind of exam is, in words a student — or an assistant quoting
 * the page — can rely on. Every statement is taken from IIT Madras's own
 * pages (study.iitm.ac.in: the DS and ES academics and admissions pages,
 * the stand-alone Diploma admissions page, and the term grading documents),
 * checked in September 2026, and each fact sheet names its sources.
 *
 * The programme revises its rules from term to term, so the wording stays
 * general where the detail moves (weightage, dates) and every page that
 * shows these links to the official source. What is observed from past
 * papers rather than published is labelled so.
 *
 * Keyed by exam-type slug. An exam type without an entry simply shows no
 * fact sheet: nothing here is needed for a page to render.
 */

export interface Source {
  label: string
  url: string
}

export interface ExamFaq {
  q: string
  a: string
}

export interface ExamFacts {
  /** One sentence on what the exam covers. */
  scope: string
  /** "weeks 1–4", for headings; null where it is not a week range. */
  weeks: string | null
  /** A paragraph for the exam's own hub page. */
  about: string
  /** The exam's format, one fact a line. */
  format: string[]
  faq: ExamFaq[]
  sources: Source[]
}

export const CHECKED = 'September 2026'

const ACADEMICS: Source = { label: 'IITM BS Data Science — Academics', url: 'https://study.iitm.ac.in/ds/academics.html' }
const ADMISSIONS: Source = { label: 'IITM BS Data Science — Admissions', url: 'https://study.iitm.ac.in/ds/admissions.html' }
const ES_ADMISSIONS: Source = { label: 'IITM BS Electronic Systems — Admissions', url: 'https://study.iitm.ac.in/es/admissions.html' }
const DIPLOMA: Source = { label: 'IIT Madras Diploma — Admissions', url: 'https://study.iitm.ac.in/diploma/admissions.html' }

const FACTS: Record<string, ExamFacts> = {
  qualifier: {
    scope:
      'The Qualifier exam is the entrance to the IIT Madras BS degree: it covers the first four weeks of the four qualifier courses.',
    weeks: 'weeks 1–4',
    about:
      'The Qualifier is how students enter the IIT Madras BS degree. Applicants study four weeks of coursework in four Foundation courses — for Data Science: English I, Mathematics for Data Science I, Statistics for Data Science I and Computational Thinking; for Electronic Systems: English I, Math for Electronics I, Electronic Systems Thinking and Circuits and Introduction to C Programming — submit the weekly assignments, and then sit a 4-hour, in-person Qualifier exam covering all four courses.',
    format: [
      'In person, at an exam centre; 4 hours for all four courses.',
      'Covers the four weeks of coursework in each qualifier course.',
      'To sit it: in every course, the average of the best 2 of the first 3 weekly assignments must be at least 40% (35% OBC-NCL/EWS, 30% SC/ST/PwD).',
      'To pass: at least 40% in each course and an average of at least 50% (35%/45% OBC-NCL/EWS, 30%/40% SC/ST/PwD).',
      'Past papers show MCQ, MSQ and numerical-answer questions and no negative marking (observed, not an official rule).',
    ],
    faq: [
      {
        q: 'What is the IITM BS Qualifier exam?',
        a: 'A 4-hour, in-person exam taken after four weeks of coursework in four Foundation courses. Clearing it admits you to the Foundation level of the IIT Madras BS degree.',
      },
      {
        q: 'Which subjects are in the IITM BS Qualifier?',
        a: 'For Data Science: English I, Maths 1, Stats 1 and Computational Thinking. For Electronic Systems: English I, Math for Electronics I, ESTC and Introduction to C Programming.',
      },
      {
        q: 'What is the IITM Qualifier passing criteria?',
        a: 'At least 40% in each course and an average of at least 50% across the four (General). For OBC-NCL/EWS it is 35% and 45%; for SC/ST/PwD, 30% and 40%.',
      },
      {
        q: 'Who is eligible to write the Qualifier exam?',
        a: 'Anyone whose average of the best 2 of the first 3 weekly assignments is at least 40% in every qualifier course (35% OBC-NCL/EWS, 30% SC/ST/PwD). Only they receive a hall ticket.',
      },
      {
        q: 'Can I re-attempt the Qualifier?',
        a: 'Yes — in the same term, without redoing the assignments, for a fee. Candidates who missed the assignment cut-off have to apply again in full.',
      },
      {
        q: 'How long is a Qualifier result valid?',
        a: 'Three terms (one year), or six terms (two years) for candidates who have not yet sat Class 12.',
      },
      {
        q: 'Does the Qualifier score count as Quiz 1?',
        a: 'Yes — for the Foundation courses you register for in the same term as the Qualifier, the Qualifier marks count as Quiz 1.',
      },
      {
        q: 'How should I prepare for the Qualifier with PYQs?',
        a: 'Finish every weekly assignment first, then sit past Qualifier papers as timed 4-hour mock tests and review each answer. Foundation Quiz 1 papers cover the same four weeks and make good extra practice.',
      },
    ],
    sources: [ADMISSIONS, ES_ADMISSIONS, ACADEMICS],
  },
  'diploma-qualifier': {
    scope:
      'The Diploma Qualifier is the entrance exam for the stand-alone IIT Madras Diploma programme for graduates.',
    weeks: null,
    about:
      'IIT Madras runs a stand-alone Diploma programme for applicants who hold (or are in the second year of) an undergraduate degree, with its own qualifier. The Diploma in Programming qualifier covers English, Aptitude and Basic Mathematics in 3 hours; the Diploma in Data Science qualifier covers English, Programming in Python, Mathematics and Statistics in 4 hours. Within the BS degree itself there is no direct entry to the Diploma level.',
    format: [
      'Diploma in Programming: English, Aptitude and Basic Mathematics — 3 hours.',
      'Diploma in Data Science: English, Programming in Python, Mathematics and Statistics — 4 hours.',
      'To pass: at least 50% in total and 40% in each subject (General); 45%/35% OBC-NCL/EWS; 40%/30% SC/ST/PwD.',
    ],
    faq: [
      {
        q: 'What is the IITM Diploma Qualifier?',
        a: 'The entrance exam for the stand-alone IIT Madras Diploma programme for graduates — separate from the Qualifier that admits students to the BS degree.',
      },
      {
        q: 'What is in the Diploma Qualifier exam?',
        a: 'Diploma in Programming: English, Aptitude and Basic Mathematics (3 hours). Diploma in Data Science: English, Programming in Python, Mathematics and Statistics (4 hours).',
      },
      {
        q: 'Is there direct entry to the Diploma level of the IITM BS degree?',
        a: 'No. BS students complete the Foundation level first; direct entry at Diploma level is only through the separate Diploma programme and its qualifier.',
      },
    ],
    sources: [DIPLOMA],
  },
  'quiz-1': {
    scope: 'Quiz 1 is held at the end of week 4 of the term and covers the content of weeks 1–4.',
    weeks: 'weeks 1–4',
    about:
      'Quiz 1 is the first in-person, invigilated exam of an IIT Madras BS term. It is held at the end of week 4 and covers the content of weeks 1 to 4 of each course. Each quiz is a single session: 4 hours to attempt 4 subjects, 3 hours for 3, and 2 hours for 1 or 2. A quiz not attempted scores 0, there is no make-up quiz, and every student must attend at least one of the two quizzes.',
    format: [
      'In person and invigilated, at the end of week 4.',
      'Covers weeks 1–4 of each course.',
      'One session: 4 h for 4 subjects, 3 h for 3, 2 h for 1–2.',
      'Missed quizzes score 0 — no make-up; at least one of the two quizzes is compulsory.',
    ],
    faq: [
      { q: 'What is the Quiz 1 syllabus?', a: 'The content of weeks 1–4 of each course.' },
      {
        q: 'How long is Quiz 1?',
        a: 'It is one session for all your courses: 4 hours for 4 subjects, 3 hours for 3, and 2 hours for 1 or 2.',
      },
      {
        q: 'Is Quiz 1 compulsory?',
        a: 'You must attend at least one of the two quizzes. A quiz you miss scores 0, and there is no make-up.',
      },
      {
        q: 'Does the Qualifier count as Quiz 1?',
        a: 'Yes, for Foundation courses registered in the same term as the Qualifier exam.',
      },
    ],
    sources: [ACADEMICS],
  },
  'quiz-2': {
    scope: 'Quiz 2 is held at the end of week 8 and covers the content of weeks 1–8, with the weight on weeks 5–8.',
    weeks: 'weeks 1–8',
    about:
      'Quiz 2 is the second in-person exam of an IIT Madras BS term, held at the end of week 8. Officially it is based on the content of weeks 1 to 8; in practice its questions lean on weeks 5 to 8. It runs the same way as Quiz 1 — one session, 4 hours for 4 subjects down to 2 hours for 1 or 2 — and a missed quiz scores 0 with no make-up.',
    format: [
      'In person and invigilated, at the end of week 8.',
      'Covers weeks 1–8 of each course (mostly weeks 5–8).',
      'One session: 4 h for 4 subjects, 3 h for 3, 2 h for 1–2.',
      'Many course formulas count the better of the two quizzes more heavily.',
    ],
    faq: [
      {
        q: 'What is the Quiz 2 syllabus?',
        a: 'Officially the content of weeks 1–8 of each course; in practice most questions come from weeks 5–8.',
      },
      { q: 'How long is Quiz 2?', a: 'One session for all your courses: 4 hours for 4 subjects, 3 hours for 3, 2 hours for 1 or 2.' },
      {
        q: 'What if I miss Quiz 2?',
        a: 'It scores 0 and there is no make-up. You must have attended at least one of the two quizzes to be eligible for the End Term.',
      },
    ],
    sources: [ACADEMICS],
  },
  'end-term': {
    scope: 'The End Term exam covers the whole course, all twelve weeks, in 1.5 hours per course.',
    weeks: 'weeks 1–12',
    about:
      'The End Term is the final in-person exam of an IIT Madras BS course. It covers the whole course, all twelve weeks, with 1.5 hours for each course, and is held in 3-hour Sunday sessions. It usually carries the largest share of the course score. To be eligible (January 2026 term, most courses) the average of the best 5 of the first 7 weekly assignment scores must be at least 40/100 and you must have attended at least one quiz.',
    format: [
      'In person; 1.5 hours per course, in 3-hour Sunday sessions.',
      'Covers all twelve weeks of the course.',
      'Eligibility (January 2026 term, most courses): best 5 of the first 7 weekly assignments averaging ≥ 40/100, and at least one quiz attended.',
      'Its weight in the final score depends on the course.',
    ],
    faq: [
      { q: 'What does the End Term cover?', a: 'The whole course — all twelve weeks, including the last ones.' },
      { q: 'How long is the End Term exam?', a: '1.5 hours for each course, in 3-hour Sunday sessions.' },
      {
        q: 'What is the End Term eligibility?',
        a: 'For most courses (January 2026 term): the best 5 of the first 7 weekly assignment scores must average at least 40/100, and you must have attended at least one of the two quizzes.',
      },
      {
        q: 'What are the End Term passing marks?',
        a: 'There is no single pass mark for the End Term alone: the course grade comes from the course’s formula combining the End Term, the quizzes and the assignments.',
      },
    ],
    sources: [ACADEMICS],
  },
  oppe: {
    scope: 'OPPE is the online proctored programming exam, solved by writing and running code.',
    weeks: null,
    about:
      'The OPPE (Online Proctored Programming Exam) is taken remotely under proctoring in the programming courses — Python, PDSA, DBMS, Java, System Commands and others. Students write and run code against test cases, and must first pass a System Compatibility Test.',
    format: ['Remote, online and proctored.', 'Code is written and run against test cases.', 'A System Compatibility Test comes first.'],
    faq: [
      {
        q: 'What is OPPE in the IITM BS?',
        a: 'The Online Proctored Programming Exam: a remote, proctored exam in the programming courses where you write and run code instead of choosing options.',
      },
    ],
    sources: [ACADEMICS],
  },
}

export function examFact(slug: string): ExamFacts | null {
  return FACTS[slug] ?? null
}
