import Link from 'next/link'
import { SHELL } from '@/components/site/Page'
import { isSupabaseConfigured, publicEnv } from '@/lib/env'
import { getSeoCatalogue } from '@/lib/seo/catalogue'
import { shortName } from '@/lib/seo/names'
import { paths } from '@/lib/seo/paths'
import { SITE, SOCIALS, type SocialNetwork } from '@/lib/seo/site'
import {
  InstagramLogo,
  LinkedinLogo,
  LinktreeLogo,
  MediumLogo,
  TelegramLogo,
  WhatsappLogo,
  YoutubeLogo,
} from '@/components/ui/icons'

const SOCIAL_ICONS: Record<SocialNetwork, typeof YoutubeLogo> = {
  youtube: YoutubeLogo,
  instagram: InstagramLogo,
  linkedin: LinkedinLogo,
  telegram: TelegramLogo,
  whatsapp: WhatsappLogo,
  medium: MediumLogo,
  linktree: LinktreeLogo,
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
  // The first level of the first programme: the Foundation courses nearly every student sits.
  const foundation = programs[0]?.levels.find((level) => level.subjects.some((subject) => subject.paperCount > 0))

  return (
    <footer className="border-t border-rule bg-surface">
      <div className={`${SHELL} grid gap-8 py-10 text-meta sm:grid-cols-2 lg:grid-cols-4`}>
        {exams.length > 0 ? (
          <nav aria-label="PYQs by exam">
            <p className="text-ui font-medium text-ink">PYQs by exam</p>
            <ul className="mt-3 flex flex-col gap-2 text-ink-muted">
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
            </ul>
          </nav>
        ) : null}

        {programs.length > 0 ? (
          <nav aria-label="Programmes">
            <p className="text-ui font-medium text-ink">Programmes</p>
            <ul className="mt-3 flex flex-col gap-2 text-ink-muted">
              {programs.flatMap((program) => [
                <li key={program.program.id}>
                  <Link href={program.path} className={link}>
                    {program.program.short_name ?? program.program.name} PYQs
                  </Link>
                </li>,
                ...program.levels
                  .filter((level) => level.subjects.some((subject) => subject.paperCount > 0))
                  .map((level) => (
                    <li key={level.level.id} className="pl-3">
                      <Link href={level.path} className={link}>
                        {level.level.name}
                        <span className="sr-only"> — {program.program.short_name ?? program.program.name}</span>
                      </Link>
                    </li>
                  )),
              ])}
            </ul>
          </nav>
        ) : null}

        {foundation ? (
          <nav aria-label={`${foundation.level.name} subjects`}>
            <p className="text-ui font-medium text-ink">{foundation.level.name} PYQs</p>
            <ul className="mt-3 flex flex-col gap-2 text-ink-muted">
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
            </ul>
          </nav>
        ) : null}

        <div>
          <p className="text-ui font-medium text-ink">{SITE.name}</p>
          <p className="mt-3 leading-relaxed text-ink-muted">
            Free previous year papers of the IIT Madras BS degree, with answers and timed mock tests. An independent
            study resource, not affiliated with IIT Madras.
          </p>
          <nav aria-label="About and policies" className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-muted">
            <Link href="/about" className={link}>
              About
            </Link>
            <span aria-hidden="true" className="text-ink-faint">·</span>
            <Link href="/privacy" className={link}>
              Privacy
            </Link>
            <span aria-hidden="true" className="text-ink-faint">·</span>
            <Link href="/terms" className={link}>
              Terms
            </Link>
            {publicEnv.contactEmail ? (
              <>
                <span aria-hidden="true" className="text-ink-faint">·</span>
                <a href={`mailto:${publicEnv.contactEmail}`} className={link}>
                  Contact
                </a>
              </>
            ) : null}
          </nav>
          <p className="mt-6 text-ui font-medium text-ink">Follow {SITE.publisher}</p>
          <ul aria-label={`${SITE.publisher} elsewhere`} className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-ink-muted">
            {SOCIALS.map((social) => {
              const Icon = SOCIAL_ICONS[social.network]
              return (
                <li key={social.network}>
                  <a
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex min-h-6 items-center gap-2 ${link}`}
                  >
                    <Icon size={16} aria-hidden="true" className="shrink-0" />
                    {social.label}
                  </a>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </footer>
  )
}
