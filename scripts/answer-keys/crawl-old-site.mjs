// The old site's paper list, per exam and course, through the same API its
// pages call. Kept under its limit of 60 requests a minute.
//
// Writes old-inventory.json: { courses, rows }.
import { writeFileSync } from 'node:fs'
const decode = (html) => JSON.parse(html.match(/data-page="([^"]*)"/)[1].replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'))
const home = decode(await (await fetch('https://quizpractice.space/')).text())
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const rows = []
const courses = {}
for (const exam of home.props.exams) {
  const page = decode(await (await fetch(`https://quizpractice.space/exam/${exam.uuid}`)).text())
  const en = page.props.exam.en_id
  for (const c of page.props.courses) {
    courses[c.id] = { name: c.course_name, code: c.course_code, program_id: c.program_id }
    for (let attempt = 0; ; attempt++) {
      const r = await fetch('https://quizpractice.space/api/get-questions-paper-by-exam', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ course_id: c.id, year: 'all', exam_id: en }),
      })
      const left = Number(r.headers.get('x-ratelimit-remaining') ?? 30)
      if (r.status === 429) { await sleep(Number(r.headers.get('retry-after') ?? 30) * 1000 + 500); continue }
      const groups = await r.json()
      for (const g of groups) for (const p of g.question_papers) rows.push({ exam: exam.exam_name, course_id: c.id, group_id: g.id, group: g.name, exam_date: g.exam_date, id: p.id, uuid: p.uuid, name: p.question_paper_name, desc: p.question_paper_description, source: p.source, status: p.status })
      await sleep(left < 5 ? 15000 : 1100)
      break
    }
  }
  console.log(exam.exam_name, 'done; rows', rows.length)
}
writeFileSync('old-inventory.json', JSON.stringify({ courses, rows }, null, 1))
console.log('unique papers', new Set(rows.map((r) => r.id)).size)
