import { getSeoCatalogue } from '@/lib/seo/catalogue'
import { formatCount } from '@/lib/format'
import { yearSpan } from '@/lib/seo/names'
import { OG_SIZE, OG_TYPE, ogCard } from '@/lib/seo/og'

export const alt = 'IITM BS PYQ — previous year question papers with answers, on Quiz Space by Unknown IITians'
export const size = OG_SIZE
export const contentType = OG_TYPE
export const revalidate = 86400

export default async function Image() {
  const { papers, subjects } = await getSeoCatalogue()
  const years = [...new Set(papers.flatMap((paper) => (paper.term ? [paper.term.year] : [])))]
  return ogCard({
    eyebrow: 'IIT Madras BS degree',
    title: 'IITM BS PYQs with answers',
    subtitle: 'Qualifier · Quiz 1 · Quiz 2 · End Term — timed mock tests, free',
    chips: [
      `${formatCount(papers.length)} papers`,
      `${subjects.filter((subject) => subject.paperCount > 0).length} subjects`,
      yearSpan(years),
    ],
  })
}
