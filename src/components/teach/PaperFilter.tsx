import { FilterSelect } from '@/components/site/FilterSelect'
import type { PaperOption } from '@/lib/teach/queries'

/**
 * Narrows the queue to one sitting, for a teacher working through a paper
 * question by question. A group then stands for its copy in that paper, and
 * its reach still counts every copy everywhere.
 */
export function PaperFilter({ papers, value }: { papers: PaperOption[]; value: string | null }) {
  // One paper needs no filter — unless a link arrived with it set, and the
  // select is then how to clear it.
  if (papers.length < 2 && !value) return null
  return (
    <FilterSelect
      name="paper"
      label="Paper"
      allLabel="All papers"
      value={value}
      options={papers.map((paper) => ({ value: paper.id, label: paper.label }))}
    />
  )
}
