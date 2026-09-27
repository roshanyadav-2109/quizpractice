import 'server-only'
import { formatCount } from '@/lib/format'
import { getSeoCatalogue } from './catalogue'
import { examFact } from './exam-facts'
import { listOf, shortName, sittingDate, termName, yearSpan } from './names'
import { paths } from './paths'
import { ORIGIN, SITE, absolute } from './site'

/**
 * llms.txt (llmstxt.org): the site described in plain markdown for AI
 * agents — what it is, the facts worth quoting, and a link to every subject.
 * Built from the catalogue, so its numbers are never stale. llms-full.txt
 * adds every paper, one line each.
 *
 * Search crawlers read the HTML pages; this is for agents that are handed
 * the site and for anyone pasting it into an assistant.
 */

function line(name: string, path: string, note?: string): string {
  return `- [${name}](${absolute(path)})${note ? `: ${note}` : ''}`
}

async function summary() {
  const catalogue = await getSeoCatalogue()
  const subjects = catalogue.subjects.filter((subject) => subject.paperCount > 0)
  const questions = catalogue.papers.reduce((sum, paper) => sum + paper.questionCount, 0)
  const years = [...new Set(catalogue.papers.flatMap((paper) => (paper.term ? [paper.term.year] : [])))]
  const exams = catalogue.examTypes
    .map((exam) => ({ exam, count: catalogue.papers.filter((paper) => paper.examType.id === exam.id).length }))
    .filter((entry) => entry.count > 0)
  const newest = catalogue.papers[0] ?? null
  return { catalogue, subjects, questions, years, exams, newest }
}

function header(data: Awaited<ReturnType<typeof summary>>): string[] {
  const { catalogue, subjects, questions, years, exams, newest } = data
  const programs = catalogue.programs.filter((program) => program.levels.some((level) => level.subjects.some((subject) => subject.paperCount > 0)))
  return [
    `# ${SITE.name}`,
    '',
    `> ${SITE.name} (${ORIGIN}) is a free practice site for IIT Madras BS degree (IITM BS) previous year question papers (PYQs): ${listOf(
      exams.map(({ exam }) => exam.name),
    )} papers for the ${listOf(programs.map((program) => program.program.name))}, with the answer key for every question and a timed mock-test mode that mirrors the real exam screen. Run by Unknown IITians; independent and not affiliated with IIT Madras.`,
    '',
    `Key facts (generated ${new Date().toISOString().slice(0, 10)}):`,
    `- ${formatCount(catalogue.papers.length)} papers, ${formatCount(questions)} questions, ${subjects.length} subjects; ${yearSpan(years)}.`,
    `- By exam: ${exams.map(({ exam, count }) => `${exam.name}: ${formatCount(count)} papers`).join(', ')}.`,
    ...(newest ? [`- Newest paper: ${shortName(newest.subject)} ${newest.examType.name}, sat ${sittingDate(newest.sessionDate)} (${termName(newest.term)}).`] : []),
    '- Free to read and to take as mock tests. A Google sign-in is only needed to save attempts and see analysis.',
    '- Papers come from the answer-key papers IIT Madras releases after each exam; questions, options and the correct options are read from those papers, not retyped. Questions are rendered as text, tables, code and equations rather than screenshots.',
    `- Exam scope: Qualifier — ${examFact('qualifier')?.scope ?? ''} Quiz 1 — weeks 1–4. Quiz 2 — weeks 1–8. End Term — the whole course.`,
    '- URL pattern: /pyq/<subject>/<exam>/<date of sitting>, e.g. /pyq/maths-1/quiz-1/16-feb-2025; each question also has its own page.',
    '- Not the same site as quizpractice.space, and not the unrelated "QuizSpace" mobile quiz app.',
    `- Cite as: "${SITE.name} — ${ORIGIN}".`,
    '',
  ]
}

export async function llmsTxt(): Promise<string> {
  const data = await summary()
  const { catalogue, exams } = data
  const out = header(data)

  out.push('## Start here', '')
  out.push(line('Home', paths.home(), 'every exam, the newest papers, and every subject'))
  out.push(line('All subjects', paths.subjects(), 'by programme and level'))
  for (const { exam, count } of exams) out.push(line(`${exam.name} PYQs`, paths.exam(exam.slug), `${formatCount(count)} papers, every subject`))
  out.push('')

  for (const program of catalogue.programs) {
    for (const level of program.levels) {
      const subjects = level.subjects.filter((subject) => subject.paperCount > 0)
      if (subjects.length === 0) continue
      out.push(`## ${program.program.short_name ?? program.program.name} — ${level.level.name}`, '')
      for (const subject of subjects) {
        const short = shortName(subject.subject)
        const name = short === subject.subject.name ? short : `${subject.subject.name} (${short})`
        out.push(
          line(
            name,
            subject.path,
            `${subject.paperCount} papers (${subject.exams.map((exam) => `${exam.examType.name}: ${exam.papers.length}`).join(', ')}), ${yearSpan(subject.years)}${
              subject.subject.code ? `; course code ${subject.subject.code}` : ''
            }`,
          ),
        )
      }
      out.push('')
    }
  }

  out.push('## About', '')
  out.push(line('About Quiz Space', '/about', 'who runs it, where the papers come from, corrections'))
  out.push(`- [Unknown IITians](${SITE.publisherUrl}): the publisher`)
  out.push(line('Terms', '/terms'), line('Privacy', '/privacy'), '')
  out.push('## Optional', '')
  out.push(line('Every paper, one line each', '/llms-full.txt'))
  out.push(`- [Sitemap](${absolute('/sitemap.xml')})`)
  out.push('- [Official IITM BS Data Science site](https://study.iitm.ac.in/ds/)')
  out.push('- [Official IITM BS Electronic Systems site](https://study.iitm.ac.in/es/)', '')
  return out.join('\n')
}

export async function llmsFullTxt(): Promise<string> {
  const data = await summary()
  const out = header(data)
  for (const subject of data.subjects) {
    const short = shortName(subject.subject)
    out.push(`## ${short === subject.subject.name ? short : `${subject.subject.name} (${short})`}`, '')
    out.push(line(`${short} — all papers`, subject.path))
    for (const exam of subject.exams) {
      out.push('', `### ${short} ${exam.examType.name}`, '')
      for (const paper of exam.papers) {
        out.push(
          line(
            `${short} ${exam.examType.name} ${sittingDate(paper.sessionDate)}${paper.setsInSitting > 1 ? ` set ${paper.setCode}` : ''}`,
            paper.path,
            `${termName(paper.term)}; ${paper.questionCount} questions${paper.totalMarks ? `, ${paper.totalMarks} marks` : ''}${
              paper.durationMinutes ? `, ${paper.durationMinutes} min` : ''
            }`,
          ),
        )
      }
    }
    out.push('')
  }
  return out.join('\n')
}
