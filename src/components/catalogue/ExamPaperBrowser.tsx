'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PaperCard } from '@/components/site/PaperCard'
import { FilterRow, SelectBox, type FilterOption } from '@/components/site/FilterSelect'
import { SubjectPanel, type SubjectGroup } from '@/components/site/SubjectFilter'
import { useViewer } from '@/components/site/Viewer'
import { buttonClass } from '@/components/ui/primitives'

/** One card of the first page, as the all-papers page draws it. */
export interface BrowserCard {
  setId: string
  href: string
  /** The subject's name. */
  title: string
  tags: string[]
  date: string
  facts: string[]
}

/** A choice that opens a page of its own (an exam's page, a year's page) rather than the all-papers page. */
export interface PageChoice extends FilterOption {
  href?: string
}

/** The exam or the year dropdown: what this page is, and where each other choice goes. */
export interface PageSelect {
  /** '' when the page covers every choice. */
  value: string
  options: PageChoice[]
  /** Where "All …" goes. */
  allHref?: string
}

/**
 * An exam's or a year's papers as the all-papers page shows them — the same
 * filters, the newest cards, the pages — for a page that is one copy for
 * everyone from the CDN. The first page is here as delivered. The exam and
 * year dropdowns move between these pages; any other filter, or the next page,
 * opens the all-papers page with this page's exam and year already chosen.
 */
export function ExamPaperBrowser({
  base,
  exam,
  year,
  branches,
  levels,
  subjects,
  terms,
  cards,
  pages,
}: {
  /** The all-papers page's query for this page: its exam, its year. */
  base: Record<string, string>
  exam: PageSelect
  year: PageSelect
  branches: FilterOption[]
  levels: FilterOption[]
  subjects: SubjectGroup[]
  terms: FilterOption[]
  cards: BrowserCard[]
  pages: number
}) {
  const router = useRouter()
  const viewer = useViewer()

  const papersHref = (name?: string, value?: string) => {
    const query = new URLSearchParams(base)
    if (name && value) query.set(name, value)
    return `/papers?${query}`
  }
  const open = (name: string, value: string | null) => router.push(papersHref(name, value ?? undefined))
  const pick = (select: PageSelect, name: string) => (value: string) => {
    const href = value ? select.options.find((option) => option.value === value)?.href : select.allHref
    if (href) router.push(href)
    else open(name, value)
  }

  return (
    <>
      <FilterRow>
        <SelectBox label="Exam" allLabel="All exams" value={exam.value} options={exam.options} onChange={pick(exam, 'exam')} />
        <SelectBox label="Branch" allLabel="All branches" value="" options={branches} onChange={(value) => open('program', value)} />
        {levels.length > 1 ? (
          <SelectBox label="Level" allLabel="All levels" value="" options={levels} onChange={(value) => open('level', value)} />
        ) : null}
        <SubjectPanel groups={subjects} value={null} scope="Every branch" onChoose={(slug) => open('subject', slug)} />
        {year.options.length > 1 ? (
          <SelectBox label="Year" allLabel="All years" value={year.value} options={year.options} onChange={pick(year, 'year')} />
        ) : null}
        {terms.length > 1 ? (
          <SelectBox label="Term" allLabel="All terms" value="" options={terms} onChange={(value) => open('term', value)} />
        ) : null}
      </FilterRow>

      <ul className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <li key={card.setId}>
            <PaperCard {...card} best={viewer.best[card.setId] ?? null} />
          </li>
        ))}
      </ul>

      {pages > 1 ? (
        <nav aria-label="Pages" className="mt-6 flex items-center justify-between gap-3">
          <p className="text-meta text-ink-faint tabular-nums">Page 1 of {pages}</p>
          <Link href={`${papersHref()}&page=2`} className={buttonClass('outline', 'md')}>
            Next
          </Link>
        </nav>
      ) : null}
    </>
  )
}
