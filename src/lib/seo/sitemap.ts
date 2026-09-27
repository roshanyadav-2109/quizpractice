import 'server-only'
import { getSeoCatalogue } from './catalogue'
import { paths } from './paths'
import { absolute } from './site'

/**
 * The sitemaps. One index at /sitemap.xml pointing at:
 *
 *   /sitemaps/pages.xml    home, hubs, subjects, exams, years, guides
 *   /sitemaps/papers.xml   every paper
 *
 * Only canonical, indexable URLs are listed — never a redirect, a noindex
 * page or a duplicate — so Search Console's coverage report reads as the
 * truth about the site.
 *
 * Until the full papers went behind a sign-in (September 2026) each question
 * had a page, listed in /sitemaps/questions-N.xml, and videos.xml listed the
 * ones with a video. Those addresses now redirect to their papers, and the
 * two sitemaps answer 404, so search engines drop them.
 */

export interface SitemapUrl {
  loc: string
  lastmod?: string | null
  changefreq?: 'daily' | 'weekly' | 'monthly' | 'yearly'
  priority?: number
}

const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }
function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => XML_ESCAPES[char])
}

function isoDate(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function urlsetXml(urls: SitemapUrl[]): string {
  const body = urls
    .map((url) => {
      const lastmod = isoDate(url.lastmod)
      return [
        '  <url>',
        `    <loc>${escapeXml(url.loc)}</loc>`,
        lastmod ? `    <lastmod>${lastmod}</lastmod>` : '',
        url.changefreq ? `    <changefreq>${url.changefreq}</changefreq>` : '',
        url.priority !== undefined ? `    <priority>${url.priority.toFixed(1)}</priority>` : '',
        '  </url>',
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
}

export function indexXml(sitemaps: { loc: string; lastmod?: string | null }[]): string {
  const body = sitemaps
    .map((sitemap) => {
      const lastmod = isoDate(sitemap.lastmod)
      return `  <sitemap>\n    <loc>${escapeXml(sitemap.loc)}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </sitemap>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`
}

function latest(dates: (string | null | undefined)[]): string | null {
  let best: string | null = null
  for (const date of dates) {
    const iso = isoDate(date)
    if (iso && (!best || iso > best)) best = iso
  }
  return best
}

export async function sitemapIndex(): Promise<string> {
  const catalogue = await getSeoCatalogue()
  const newest = latest(catalogue.papers.map((paper) => paper.updatedAt))
  return indexXml([
    { loc: absolute('/sitemaps/pages.xml'), lastmod: newest },
    { loc: absolute('/sitemaps/papers.xml'), lastmod: newest },
  ])
}

/** Home, the hubs, every subject and every subject's exams. */
export async function pagesSitemap(extra: SitemapUrl[]): Promise<string> {
  const catalogue = await getSeoCatalogue()
  const newest = latest(catalogue.papers.map((paper) => paper.updatedAt))
  const urls: SitemapUrl[] = [
    { loc: absolute(paths.home()), lastmod: newest, changefreq: 'daily', priority: 1 },
    { loc: absolute(paths.subjects()), lastmod: newest, changefreq: 'weekly', priority: 0.8 },
    ...extra,
  ]

  const examsWithPapers = catalogue.examTypes.filter((exam) =>
    catalogue.papers.some((paper) => paper.examType.id === exam.id),
  )
  for (const exam of examsWithPapers) {
    urls.push({
      loc: absolute(paths.exam(exam.slug)),
      lastmod: latest(catalogue.papers.filter((paper) => paper.examType.id === exam.id).map((paper) => paper.updatedAt)),
      changefreq: 'weekly',
      priority: 0.9,
    })
  }

  for (const program of catalogue.programs) {
    const programPapers = catalogue.papers.filter((paper) => paper.program.id === program.program.id)
    if (programPapers.length === 0) continue
    urls.push({ loc: absolute(program.path), lastmod: latest(programPapers.map((paper) => paper.updatedAt)), changefreq: 'weekly', priority: 0.8 })
    for (const level of program.levels) {
      if (!level.subjects.some((subject) => subject.paperCount > 0)) continue
      urls.push({
        loc: absolute(level.path),
        lastmod: latest(level.subjects.map((subject) => subject.latest?.updatedAt)),
        changefreq: 'weekly',
        priority: 0.7,
      })
    }
  }

  for (const subject of catalogue.subjects) {
    if (subject.paperCount === 0) continue
    urls.push({
      loc: absolute(subject.path),
      lastmod: latest(subject.exams.flatMap((exam) => exam.papers.map((paper) => paper.updatedAt))),
      changefreq: 'weekly',
      priority: 0.9,
    })
    for (const exam of subject.exams) {
      urls.push({
        loc: absolute(exam.path),
        lastmod: latest(exam.papers.map((paper) => paper.updatedAt)),
        changefreq: 'weekly',
        priority: 0.8,
      })
      // A year of one subject's exam gets a page once it has two papers; one paper is its own page.
      for (const year of new Set(exam.papers.flatMap((paper) => (paper.term ? [paper.term.year] : [])))) {
        const inYear = exam.papers.filter((paper) => paper.term?.year === year)
        if (inYear.length < 2) continue
        urls.push({
          loc: absolute(paths.subjectExamYear(subject.subject.slug, exam.examType.slug, year)),
          lastmod: latest(inYear.map((paper) => paper.updatedAt)),
          changefreq: 'monthly',
          priority: 0.7,
        })
      }
    }
  }

  // Every year, and every exam within it.
  const byYear = new Map<number, typeof catalogue.papers>()
  for (const paper of catalogue.papers) if (paper.term) byYear.set(paper.term.year, [...(byYear.get(paper.term.year) ?? []), paper])
  for (const [year, papers] of byYear) {
    urls.push({ loc: absolute(paths.year(year)), lastmod: latest(papers.map((paper) => paper.updatedAt)), changefreq: 'weekly', priority: 0.8 })
    for (const exam of examsWithPapers) {
      const inExam = papers.filter((paper) => paper.examType.id === exam.id)
      if (inExam.length === 0) continue
      urls.push({
        loc: absolute(paths.examYear(exam.slug, year)),
        lastmod: latest(inExam.map((paper) => paper.updatedAt)),
        changefreq: 'weekly',
        priority: 0.8,
      })
    }
  }
  return urlsetXml(urls)
}

export async function papersSitemap(): Promise<string> {
  const { papers } = await getSeoCatalogue()
  return urlsetXml(
    papers
      .filter((paper) => paper.questionCount > 0)
      .map((paper) => ({ loc: absolute(paper.path), lastmod: paper.updatedAt, changefreq: 'monthly', priority: 0.7 })),
  )
}
