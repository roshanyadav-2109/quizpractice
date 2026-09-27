import 'server-only'
import { getQuestionIndex } from '@/lib/queries'
import { getSeoCatalogue } from './catalogue'
import { paths, questionSlug } from './paths'
import { headlineTextOf, indexableText } from './question-text'
import { absolute } from './site'
import { getVideoIndex } from './video-solutions'

/**
 * The sitemaps. One index at /sitemap.xml pointing at:
 *
 *   /sitemaps/pages.xml         home, hubs, subjects, exams, years, guides
 *   /sitemaps/papers.xml        every paper
 *   /sitemaps/questions-N.xml   every question page worth indexing, a
 *                               hundred sets per file
 *   /sitemaps/videos.xml        the question pages a video solution plays
 *                               on, with the video's details
 *
 * Only canonical, indexable URLs are listed — never a redirect, a noindex
 * page or a duplicate copy of a question — so Search Console's coverage
 * report reads as the truth about the site.
 */

export interface SitemapUrl {
  loc: string
  lastmod?: string | null
  changefreq?: 'daily' | 'weekly' | 'monthly' | 'yearly'
  priority?: number
}

/** Sets per question sitemap: ~2,000 questions, well under the 50,000 limit and quick to build. */
export const SETS_PER_QUESTION_SITEMAP = 100

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

/** Set ids in a fixed order, cut into the question sitemaps. */
async function questionBatches(): Promise<string[][]> {
  const { papers } = await getSeoCatalogue()
  const ids = papers.map((paper) => paper.setId).sort()
  const batches: string[][] = []
  for (let i = 0; i < ids.length; i += SETS_PER_QUESTION_SITEMAP) batches.push(ids.slice(i, i + SETS_PER_QUESTION_SITEMAP))
  return batches
}

export async function sitemapIndex(): Promise<string> {
  const catalogue = await getSeoCatalogue()
  const newest = latest(catalogue.papers.map((paper) => paper.updatedAt))
  const batches = await questionBatches()
  const videos = (await getVideoIndex()).all.filter((video) => video.indexable)
  return indexXml([
    { loc: absolute('/sitemaps/pages.xml'), lastmod: newest },
    { loc: absolute('/sitemaps/papers.xml'), lastmod: newest },
    ...(videos.length > 0 ? [{ loc: absolute('/sitemaps/videos.xml'), lastmod: latest(videos.map((video) => video.updatedAt)) }] : []),
    ...batches.map((batch, index) => ({
      loc: absolute(`/sitemaps/questions-${index + 1}.xml`),
      lastmod: latest(batch.map((id) => catalogue.paperBySetId.get(id)?.updatedAt)),
    })),
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

/**
 * The video sitemap: each question page a video solution plays on, with the
 * video's thumbnail, title and player — the same details as the page's
 * VideoObject markup. Only canonical, indexable question pages.
 */
export async function videosSitemap(): Promise<string> {
  const videos = (await getVideoIndex()).all.filter((video) => video.indexable && video.thumbnailUrl && video.embedUrl)
  const body = videos
    .map((video) => {
      const published = isoDate(video.createdAt)
      return [
        '  <url>',
        `    <loc>${escapeXml(absolute(video.path))}</loc>`,
        '    <video:video>',
        `      <video:thumbnail_loc>${escapeXml(video.thumbnailUrl!)}</video:thumbnail_loc>`,
        `      <video:title>${escapeXml(video.title.slice(0, 100))}</video:title>`,
        `      <video:description>${escapeXml(video.description.slice(0, 2048))}</video:description>`,
        `      <video:player_loc>${escapeXml(video.embedUrl!)}</video:player_loc>`,
        published ? `      <video:publication_date>${published}</video:publication_date>` : '',
        '      <video:family_friendly>yes</video:family_friendly>',
        '      <video:requires_subscription>no</video:requires_subscription>',
        '    </video:video>',
        '  </url>',
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n${body}\n</urlset>\n`
}

export async function papersSitemap(): Promise<string> {
  const { papers } = await getSeoCatalogue()
  return urlsetXml(
    papers
      .filter((paper) => paper.questionCount > 0)
      .map((paper) => ({ loc: absolute(paper.path), lastmod: paper.updatedAt, changefreq: 'monthly', priority: 0.7 })),
  )
}

/** One question sitemap, 1-based; null past the last. */
export async function questionsSitemap(page: number): Promise<string | null> {
  const batches = await questionBatches()
  const batch = batches[page - 1]
  if (!batch) return null
  const catalogue = await getSeoCatalogue()
  const rows = await getQuestionIndex(batch)
  const urls: SitemapUrl[] = []
  for (const row of rows) {
    if (row.canonicalId !== row.questionId || !indexableText(row.textBlocks, row.substance)) continue
    const paper = catalogue.paperBySetId.get(row.setId)
    if (!paper) continue
    urls.push({
      loc: absolute(
        paths.question(paper.subject.slug, paper.examType.slug, paper.slug, questionSlug(row.number, headlineTextOf(row.textBlocks))),
      ),
      lastmod: paper.updatedAt,
      changefreq: 'monthly',
      priority: 0.5,
    })
  }
  return urlsetXml(urls)
}
