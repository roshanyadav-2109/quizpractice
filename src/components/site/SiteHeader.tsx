import Link from 'next/link'
import { getCurrentProfile, isStaff } from '@/lib/supabase/server'
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
import { MagnifyingGlass } from '@/components/ui/icons'
import type { ExamType } from '@/types/db'
import { MegaNav, MobileMenu, type MenuItem } from './MegaNav'
import { AccountMenu } from './AccountMenu'
import { SignInButton } from './AuthDialog'

/**
 * The navigation: the logo, each programme as a menu that opens onto its
 * levels and subjects, the exams as a menu that opens onto the branches and
 * terms each was sat in, then search, all papers, and the account.
 *
 * The menus only offer what has papers, and a programme or exam with none is
 * left out altogether — a menu full of dead ends is worse than a short one.
 */
export async function SiteHeader() {
  const [profile, tree, counts, examTypes, index, qualifierIds] = isSupabaseConfigured
    ? await Promise.all([
        getCurrentProfile(),
        getBrowseTree(),
        getCatalogueCounts(),
        getExamTypes(),
        getPaperIndex(),
        getQualifierSubjectIds(),
      ])
    : [null, [], null, [], [], new Set<string>()]

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
                    href: `/subject/${subject.slug}?exam=qualifier`,
                    title: subject.name,
                    caption: subject.code,
                    icon: artFor('subjects', subject.slug),
                  })),
              ),
            },
          ],
          more: { href: `/papers?exam=qualifier&program=${program.slug}`, label: 'All Qualifier papers' },
        },
        ...program.levels.map((level) => ({
          key: level.slug,
          name: level.name,
          groups: [
            {
              links: level.subjects
                .filter((subject) => (counts?.bySubject.get(subject.id)?.papers ?? 0) > 0)
                .map((subject) => ({
                  href: `/subject/${subject.slug}`,
                  title: subject.name,
                  caption: subject.code,
                  icon: artFor('subjects', subject.slug),
                })),
            },
          ],
          more: { href: `/subjects?program=${program.slug}&level=${level.slug}`, label: `All of ${level.name}` },
        })),
      ].filter((column) => column.groups[0].links.length > 0),
    }))
    .filter((item) => item.columns.length > 0)

  const examItem = examMenu(examTypes, index, tree)
  const items = examItem ? [...programItems, examItem] : programItems

  return (
    <header className="no-print sticky top-0 z-40 border-b border-rule bg-surface">
      <div className={`${SHELL} flex h-16 items-center gap-2`}>
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="QuizPractice home">
          <Mark />
          <span className="text-[1.125rem] font-medium text-ink">QuizPractice</span>
        </Link>
        <span aria-hidden className="mx-3 hidden h-7 w-px bg-rule lg:block" />

        <MegaNav items={items} />

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/search"
            aria-label="Search questions"
            className="hidden h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-ink transition-colors hover:bg-surface-3 sm:flex"
          >
            <MagnifyingGlass size={18} />
          </Link>
          <Link
            href="/papers"
            className="hidden h-10 items-center justify-center rounded-full border border-rule px-4 text-ui text-ink transition-colors hover:border-rule-strong lg:inline-flex"
          >
            All papers
          </Link>
          {profile ? (
            <AccountMenu name={profile.displayName} email={profile.email} staff={isStaff(profile)} />
          ) : (
            <SignInButton className="inline-flex h-10 items-center justify-center rounded-full bg-ink px-5 text-ui text-white transition-colors hover:bg-ink/85">
              Sign in
            </SignInButton>
          )}
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
              href: `/papers?exam=${exam.slug}&program=${program.slug}`,
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
        more: { href: `/papers?exam=${exam.slug}`, label: `All ${exam.name} papers` },
      }
    })
    .filter((column) => column.groups.length > 0)

  return columns.length > 0 ? { key: 'exams', label: 'Exams', columns } : null
}

/**
 * The mark: an answer bubble, filled. It is the one glyph every student in the
 * programme has looked at hundreds of times.
 */
function Mark() {
  return (
    <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-ink">
      <span className="h-3 w-3 rounded-full bg-ink" />
    </span>
  )
}
