import { getSeoCatalogue } from '@/lib/seo/catalogue'
import { shortName, yearSpan } from '@/lib/seo/names'
import { OG_SIZE, OG_TYPE, ogCard } from '@/lib/seo/og'

export const alt = 'Previous year papers for an IIT Madras BS subject'
export const size = OG_SIZE
export const contentType = OG_TYPE
export const revalidate = 86400

export default async function Image({ params }: { params: Promise<{ subject: string }> }) {
  const node = (await getSeoCatalogue()).subjectBySlug.get((await params).subject)
  if (!node) return ogCard({ eyebrow: 'IIT Madras BS degree', title: 'IITM BS PYQs with answers' })
  const short = shortName(node.subject)
  return ogCard({
    eyebrow: `IITM BS · ${node.program.short_name ?? node.program.name} · ${node.level.name}`,
    title: `${short} PYQ`,
    subtitle: short === node.subject.name ? 'Previous year papers with answers' : node.subject.name,
    chips: [`${node.paperCount} papers`, yearSpan(node.years), ...node.exams.slice(0, 2).map((exam) => exam.examType.name)],
  })
}
