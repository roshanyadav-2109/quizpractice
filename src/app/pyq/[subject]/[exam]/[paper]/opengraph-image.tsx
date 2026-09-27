import { findPaper } from '@/lib/seo/catalogue'
import { shortName, sittingDate } from '@/lib/seo/names'
import { OG_SIZE, OG_TYPE, ogCard } from '@/lib/seo/og'

export const alt = 'An IIT Madras BS previous year question paper with answers'
export const size = OG_SIZE
export const contentType = OG_TYPE
export const revalidate = 86400

export default async function Image({ params }: { params: Promise<{ subject: string; exam: string; paper: string }> }) {
  const { subject, exam, paper: slug } = await params
  const paper = await findPaper(subject, exam, slug)
  if (!paper) return ogCard({ eyebrow: 'IIT Madras BS degree', title: 'IITM BS PYQs with answers' })
  return ogCard({
    eyebrow: `IITM BS · ${paper.term?.label ?? 'Previous year paper'}`,
    title: `${shortName(paper.subject)} ${paper.examType.name} PYQ`,
    subtitle: `${sittingDate(paper.sessionDate)}${paper.setsInSitting > 1 ? ` · Set ${paper.setCode}` : ''} — with answers`,
    chips: [
      `${paper.questionCount} questions`,
      ...(paper.totalMarks ? [`${paper.totalMarks} marks`] : []),
      ...(paper.durationMinutes ? [`${paper.durationMinutes} min`] : []),
    ],
  })
}
