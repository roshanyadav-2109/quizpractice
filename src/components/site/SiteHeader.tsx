import Link from 'next/link'
import { paths, programSlug } from '@/lib/seo/paths'
import {
  getBrowseTree,
  getCatalogueCounts,
  getExamTypes,
  getPaperIndex,
  getQualifierSubjectIds,
  type PaperIndexRow,
  type ProgramWithLevels,
} from '@/lib/queries'
import { isSupabaseConfigured } from '@/lib/env'
import { artFor } from '@/lib/art'
import { termsOf } from '@/lib/terms'
import { SHELL } from '@/components/site/Page'
import { BrandLogo } from '@/components/site/Brand'
import { MagnifyingGlass } from '@/components/ui/icons'
import type { ExamType } from '@/types/db'
import { MegaNav, MobileMenu, type MenuItem } from './MegaNav'
import { AccountSlot } from './AccountSlot'
import { SITE } from '@/lib/seo/site'

/**
 * The navigation: the logo, each programme as a menu that opens onto its
 * levels and subjects, the exams as a menu that opens onto the branches and
 * terms each was sat in, then search and the account.
 *
 * The menus only offer what has papers, and a programme or exam with none is
 * left out altogether — a menu full of dead ends is worse than a short one.
 */
export async function SiteHeader() {
  const [tree, counts, examTypes, index, qualifierIds] = isSupabaseConfigured
    ? await Promise.all([
        getBrowseTree(),
        getCatalogueCounts(),
        getExamTypes(),
        getPaperIndex(),
        getQualifierSubjectIds(),
      ])
    : [[], null, [], [], new Set<string>()]

  const programItems: MenuItem[] = tree
    .map((program) => ({
      key: program.slug,
      label: program.short_name ?? program.name,
      columns: [
        // The qualifier — the stage before Foundation — listed first.
        {
          key: 'qualifier',
          name: 'Qualifier',
          virtual: true,
          groups: [
            {
              links: program.levels.flatMap((level) =>
                level.subjects
                  .filter((subject) => qualifierIds.has(subject.id))
                  .map((subject) => ({
                    href: paths.subjectExam(subject.slug, 'qualifier'),
                    title: subject.name,
                    caption: subject.code,
                    icon: artFor('subjects', subject.slug),
                  })),
              ),
            },
          ],
          more: { href: `${paths.exam('qualifier')}#p-${programSlug(program)}`, label: 'All Qualifier papers' },
        },
        ...program.levels.map((level) => ({
          key: level.slug,
          name: level.name,
          groups: [
            {
              links: level.subjects
                .filter((subject) => (counts?.bySubject.get(subject.id)?.papers ?? 0) > 0)
                .map((subject) => ({
                  href: paths.subject(subject.slug),
                  title: subject.name,
                  caption: subject.code,
                  icon: artFor('subjects', subject.slug),
                })),
            },
          ],
          more: { href: paths.level(programSlug(program), level.slug), label: `All of ${level.name}` },
        })),
      ].filter((column) => column.groups[0].links.length > 0),
    }))
    .filter((item) => item.columns.length > 0)

  const examItem = examMenu(examTypes, index, tree)
  const items = examItem ? [...programItems, examItem] : programItems

  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-surface">
      <div className={`${SHELL} flex h-16 items-center gap-2`}>
        <Link href="/" className="flex shrink-0 items-center" aria-label={`${SITE.name} home`}>
          <BrandLogo />
        </Link>
        <span aria-hidden className="mx-3 hidden h-7 w-px bg-rule lg:block" />

        <MegaNav items={items} />

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/search"
            aria-label="Search questions"
            className="hidden h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-ink transition-colors hover:bg-surface-3 sm:flex"
          >
            <MagnifyingGlass size={18} aria-hidden="true" />
            <span className="sr-only">Search questions</span>
          </Link>
          {/* Filled in by the browser: the page itself is the same for everyone. */}
          <AccountSlot />
          <MobileMenu items={items} />
        </div>
      </div>
    </header>
  )
}

/**
 * The exams as one menu: each exam down the left, and on the right the
 * branches and terms it was sat in — the same choices the All papers filters
 * offer, one click from anywhere.
 */
function examMenu(examTypes: ExamType[], index: PaperIndexRow[], tree: ProgramWithLevels[]): MenuItem | null {
  const programOf = new Map<string, ProgramWithLevels>()
  for (const program of tree) {
    for (const level of program.levels) {
      for (const subject of level.subjects) programOf.set(subject.id, program)
    }
  }

  const columns = examTypes
    .map((exam) => {
      const rows = index.filter((row) => row.exam_type_id === exam.id)
      const branches = tree.filter((program) => rows.some((row) => programOf.get(row.subject_id) === program))
      const terms = termsOf(rows)
      return {
        key: exam.slug,
        name: exam.name,
        icon: artFor('exams', exam.slug),
        groups: [
          {
            heading: 'Branch',
            links: branches.map((program) => ({
              href: `${paths.exam(exam.slug)}#p-${programSlug(program)}`,
              title: program.short_name ?? program.name,
              icon: artFor('programs', program.slug),
            })),
          },
          {
            heading: 'Term',
            compact: true,
            links: terms.map((term) => ({
              href: `/papers?exam=${exam.slug}&year=${term.year}&term=${term.season}`,
              title: term.short,
            })),
          },
        ].filter((group) => group.links.length > 0),
        more: { href: paths.exam(exam.slug), label: `All ${exam.name} papers` },
      }
    })
    .filter((column) => column.groups.length > 0)

  return columns.length > 0 ? { key: 'exams', label: 'Exams', columns } : null
}
