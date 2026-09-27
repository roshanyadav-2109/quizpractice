import { getSeoCatalogue } from '@/lib/seo/catalogue'
import { shortName, yearSpan } from '@/lib/seo/names'
import { OG_SIZE, OG_TYPE, ogCard } from '@/lib/seo/og'

export const alt = "An IIT Madras BS subject's previous year papers for one exam"
export const size = OG_SIZE
export const contentType = OG_TYPE
export const revalidate = 86400

export default async function Image({ params }: { params: Promise<{ subject: string; exam: string }> }) {
  const { subject, exam } = await params
  const node = (await getSeoCatalogue()).subjectBySlug.get(subject)
  const examNode = node?.exams.find((entry) => entry.examType.slug === exam)
  if (!node || !examNode) return ogCard({ eyebrow: 'IIT Madras BS degree', title: 'IITM BS PYQs with answers' })
  const years = [...new Set(examNode.papers.flatMap((paper) => (paper.term ? [paper.term.year] : [])))]
  return ogCard({
    eyebrow: `IITM BS · ${node.subject.name}`,
    title: `${shortName(node.subject)} ${examNode.examType.name} PYQ`,
    subtitle: 'Previous year papers with answers · timed mock tests',
    chips: [`${examNode.papers.length} papers`, yearSpan(years), 'Free'],
  })
}
