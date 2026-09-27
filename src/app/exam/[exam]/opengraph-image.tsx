import { getSeoCatalogue } from '@/lib/seo/catalogue'
import { formatCount } from '@/lib/format'
import { yearSpan } from '@/lib/seo/names'
import { OG_SIZE, OG_TYPE, ogCard } from '@/lib/seo/og'

export const alt = 'IITM BS previous year papers for one exam, every subject'
export const size = OG_SIZE
export const contentType = OG_TYPE
export const revalidate = 86400

export default async function Image({ params }: { params: Promise<{ exam: string }> }) {
  const slug = (await params).exam
  const { examTypes, papers } = await getSeoCatalogue()
  const exam = examTypes.find((entry) => entry.slug === slug)
  const list = exam ? papers.filter((paper) => paper.examType.id === exam.id) : []
  if (!exam || list.length === 0) return ogCard({ eyebrow: 'IIT Madras BS degree', title: 'IITM BS PYQs with answers' })
  const years = [...new Set(list.flatMap((paper) => (paper.term ? [paper.term.year] : [])))]
  return ogCard({
    eyebrow: 'IIT Madras BS degree',
    title: `IITM BS ${exam.name} PYQ`,
    subtitle: 'Every subject · with answers · timed mock tests',
    chips: [`${formatCount(list.length)} papers`, `${new Set(list.map((paper) => paper.subject.id)).size} subjects`, yearSpan(years)],
  })
}
