import Link from 'next/link'
import type { ReactNode } from 'react'
import { SHELL } from '@/components/site/Page'
import { SocialLogo } from '@/components/site/SocialLogo'
import { isSupabaseConfigured, publicEnv } from '@/lib/env'
import { getSeoCatalogue } from '@/lib/seo/catalogue'
import { shortName } from '@/lib/seo/names'
import { paths } from '@/lib/seo/paths'
import { SITE, SOCIALS } from '@/lib/seo/site'

/** One group of links under its title. */
function Group({ label, title, children }: { label: string; title: ReactNode; children: ReactNode }) {
  return (
    <nav aria-label={label}>
      <p className="text-card font-medium text-ink">{title}</p>
      <ul className="mt-4 flex flex-col gap-3 text-ui text-ink-muted">{children}</ul>
    </nav>
  )
}

/**
 * The foot of every page: the exams, the programmes and their levels, the
 * most-sat subjects, and the site's own pages. Every hub is one link from
 * anywhere — for readers who scroll to the bottom looking for their exam,
 * and for crawlers, which find the whole catalogue from any page.
 *
 * The policy links are not decoration either. Google's YouTube API audit
 * checks that the privacy policy and terms of service are reachable from the
 * site that uploads, so they sit on every page that has chrome, with the
 * contact address beside them.
 */
// Column titles are not headings: the footer is on every page, and headings
// repeated on every page read as a duplicate outline of the page above.
export async function SiteFooter() {
  const catalogue = isSupabaseConfigured ? await getSeoCatalogue().catch(() => null) : null
  const link = 'transition-colors hover:text-ink'

  const exams = catalogue
    ? catalogue.examTypes.filter((exam) => catalogue.papers.some((paper) => paper.examType.id === exam.id))
    : []
  const programs = catalogue
    ? catalogue.programs.filter((program) => program.levels.some((level) => level.subjects.some((subject) => subject.paperCount > 0)))
    : []
  // Every year with papers, newest first: the only link to each year's page from every page.
  const years = catalogue
    ? [...new Set(catalogue.papers.flatMap((paper) => (paper.term ? [paper.term.year] : [])))].sort((a, b) => b - a)
    : []
  // The first level of the first programme: the Foundation courses nearly every student sits.
  const foundation = programs[0]?.levels.find((level) => level.subjects.some((subject) => subject.paperCount > 0))

  return (
    <footer className="bg-surface-2">
      <div className={`${SHELL} grid gap-12 py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16 lg:py-14`}>
        {/* The brand, what the site is, and where else to find the team. */}
        <div className="max-w-[26rem]">
          <Link href="/" className="text-[1.5rem] leading-none font-semibold tracking-[-0.015em] text-ink">
            Quiz Space
          </Link>
          <p className="mt-1.5 text-meta text-ink-muted">A product by {SITE.publisher}</p>
          <p className="mt-5 text-ui leading-relaxed text-ink-muted">
            Free previous year papers of the IIT Madras BS degree, with answers and timed mock tests.
          </p>

          <p className="mt-8 text-card font-medium text-ink">Follow {SITE.publisher}</p>
          <ul aria-label={`${SITE.publisher} elsewhere`} className="mt-4 flex flex-wrap items-center gap-4">
            {SOCIALS.map((social) => (
              <li key={social.network}>
                <a
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={social.label}
                  className="flex transition-transform hover:-translate-y-0.5"
                >
                  <SocialLogo network={social.network} />
                  <span className="sr-only">{social.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-12 lg:grid-cols-3">
          <div className="flex flex-col gap-12">
            {exams.length > 0 ? (
              <Group label="PYQs by exam" title="PYQs by exam">
                {exams.map((exam) => (
                  <li key={exam.id}>
                    <Link href={paths.exam(exam.slug)} className={link}>
                      IITM BS {exam.name} PYQ
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href="/papers" className={link}>
                    All papers, newest first
                  </Link>
                </li>
              </Group>
            ) : null}

            {years.length > 0 ? (
              <Group label="PYQs by year" title="PYQs by year">
                {years.map((year) => (
                  <li key={year}>
                    <Link href={paths.year(year)} className={link}>
                      IITM BS PYQ {year}
                    </Link>
                  </li>
                ))}
              </Group>
            ) : null}
          </div>

          {programs.length > 0 ? (
            <Group label="Programmes" title="Programmes">
              {programs.flatMap((program) => [
                <li key={program.program.id}>
                  <Link href={program.path} className="text-ink transition-colors hover:text-accent">
                    {program.program.short_name ?? program.program.name} PYQs
                  </Link>
                </li>,
                ...program.levels
                  .filter((level) => level.subjects.some((subject) => subject.paperCount > 0))
                  .map((level) => (
                    <li key={level.level.id} className="border-l border-rule-strong pl-3">
                      <Link href={level.path} className={link}>
                        {level.level.name}
                        <span className="sr-only"> — {program.program.short_name ?? program.program.name}</span>
                      </Link>
                    </li>
                  )),
              ])}
            </Group>
          ) : null}

          <div className="flex flex-col gap-12">
            {foundation ? (
              <Group label={`${foundation.level.name} subjects`} title={`${foundation.level.name} PYQs`}>
                {foundation.subjects
                  .filter((subject) => subject.paperCount > 0)
                  .map((subject) => (
                    <li key={subject.subject.id}>
                      <Link href={subject.path} className={link}>
                        {shortName(subject.subject)} PYQ
                      </Link>
                    </li>
                  ))}
                <li>
                  <Link href={paths.subjects()} className={link}>
                    Every subject
                  </Link>
                </li>
              </Group>
            ) : null}

            <Group label="About and policies" title={SITE.name}>
              <li>
                <Link href="/about" className={link}>
                  About
                </Link>
              </li>
              <li>
                <Link href="/privacy" className={link}>
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="/terms" className={link}>
                  Terms
                </Link>
              </li>
              <li>
                <Link href="/refunds" className={link}>
                  Refunds
                </Link>
              </li>
              {publicEnv.contactEmail ? (
                <li>
                  <a href={`mailto:${publicEnv.contactEmail}`} className={link}>
                    Contact
                  </a>
                </li>
              ) : null}
            </Group>
          </div>
        </div>
      </div>
      {/* The scraper trap: invisible, out of the tab order, closed in robots.txt — a
          plain <a>, never next/link, whose prefetch would spring it for real visitors. */}
      <a href="/all-questions" rel="nofollow" tabIndex={-1} aria-hidden="true" hidden>
        All questions
      </a>
    </footer>
  )
}
