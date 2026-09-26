import 'server-only'
import { publicClient, memoise } from '@/lib/supabase/public'
import { getCurrentProfile } from '@/lib/supabase/server'
import { getExamTypes, getMistakeBank, getPaperIndex, type PaperIndexRow } from '@/lib/queries'
import { termOf } from '@/lib/terms'
import type { ExamType } from '@/types/db'
import type { Spotlight, SpotlightPlacement, SpotlightTone } from '@/lib/spotlight-shared'

/**
 * The banners at the top of a page, most urgent first: the next exam counting
 * down, the student's own mistakes waiting for a retry, the newest papers, and
 * whatever staff have announced. Everything except the announcements is
 * worked out from the data, so a banner is never stale — the countdown ends on
 * the day, and "just added" stops once the papers are no longer new.
 */

export interface SpotlightContext {
  placement: SpotlightPlacement
  /** The subject the page is about. */
  subject?: { id: string; slug: string; name: string; programId: string }
  /** The subject a student practises most, on their dashboard. */
  focus?: { id: string; slug: string; name: string } | null
  /** The branch a page is filtered to. */
  programSlug?: string | null
}

const MAX = 4
/** How far ahead an exam starts counting down. */
const EXAM_WINDOW_DAYS = 60
/** How long the newest sitting counts as just added. */
const RELEASE_WINDOW_DAYS = 45

/** Real screens of the site, shown in a laptop and a phone on the banner. */
const SCREENS = {
  exam: { desktop: '/art/banners/desk-exam.webp', mobile: '/art/banners/phone-question.webp' },
  release: { desktop: '/art/banners/desk-papers.webp', mobile: '/art/banners/phone-subject.webp' },
  insights: { desktop: '/art/banners/desk-dashboard.webp', mobile: '/art/banners/phone-mistakes.webp' },
}

interface CalendarRow {
  id: string
  exam_type_id: string
  program_id: string | null
  exam_date: string
  note: string | null
}

interface BannerRow {
  id: string
  kind: 'announcement' | 'feature' | 'release'
  eyebrow: string | null
  title: string
  body: string | null
  cta_label: string | null
  cta_href: string | null
  placements: string[]
  program_id: string | null
  starts_on: string | null
  ends_on: string | null
}

interface ProgramRow {
  id: string
  slug: string
  name: string
  short_name: string | null
}

const istDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const examDay = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const satOn = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** Today in India, as YYYY-MM-DD: exam days are Indian days. */
function todayIst(): string {
  return istDay.format(new Date())
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

const loadCalendar = memoise(async (): Promise<CalendarRow[]> => {
  const { data, error } = await publicClient
    .from('exam_calendar')
    .select('id, exam_type_id, program_id, exam_date, note')
    .gte('exam_date', todayIst())
    .order('exam_date')
    .returns<CalendarRow[]>()
  if (error) throw new Error(`exam_calendar failed — ${error.message}`)
  return data ?? []
}, 60_000)

const loadBanners = memoise(async (): Promise<BannerRow[]> => {
  const { data, error } = await publicClient
    .from('banners')
    .select('id, kind, eyebrow, title, body, cta_label, cta_href, placements, program_id, starts_on, ends_on')
    .eq('is_active', true)
    .order('sort_order')
    .order('created_at', { ascending: false })
    .returns<BannerRow[]>()
  if (error) throw new Error(`banners failed — ${error.message}`)
  return data ?? []
}, 60_000)

const loadPrograms = memoise(async (): Promise<ProgramRow[]> => {
  const { data, error } = await publicClient
    .from('programs')
    .select('id, slug, name, short_name')
    .returns<ProgramRow[]>()
  if (error) throw new Error(`programs failed — ${error.message}`)
  return data ?? []
}, 60_000)

/** Every banner for this page, in the order to show them. Never throws. */
export async function getSpotlights(context: SpotlightContext): Promise<Spotlight[]> {
  try {
    const today = todayIst()
    const [profile, examTypes, index, calendar, banners, programs] = await Promise.all([
      getCurrentProfile(),
      getExamTypes(),
      getPaperIndex(),
      loadCalendar(),
      loadBanners(),
      loadPrograms(),
    ])
    const programId =
      context.subject?.programId ?? programs.find((program) => program.slug === context.programSlug)?.id ?? null

    const personal = profile ? await mistakesSpotlight(context, today) : tourSpotlight(context)

    return [
      examSpotlight(context, today, programId, calendar, examTypes, index, programs),
      personal,
      releaseSpotlight(context, today, examTypes, index),
      ...banners.map((row) => announcement(row, context, today, programId)),
    ]
      .filter((item): item is Spotlight => item !== null)
      .slice(0, MAX)
  } catch (error) {
    console.error('spotlight:', error instanceof Error ? error.message : error)
    return []
  }
}

/** The next exam, counting down, with the past papers to sit before it. */
function examSpotlight(
  context: SpotlightContext,
  today: string,
  programId: string | null,
  calendar: CalendarRow[],
  examTypes: ExamType[],
  index: PaperIndexRow[],
  programs: ProgramRow[],
): Spotlight | null {
  const next = calendar.find(
    (row) =>
      daysBetween(today, row.exam_date) >= 0 &&
      daysBetween(today, row.exam_date) <= EXAM_WINDOW_DAYS &&
      (!row.program_id || !programId || row.program_id === programId),
  )
  const exam = next && examTypes.find((type) => type.id === next.exam_type_id)
  if (!next || !exam) return null

  const days = daysBetween(today, next.exam_date)
  const program = next.program_id ? programs.find((p) => p.id === next.program_id) : null

  // Point at the page's subject, or the student's own, when it has this exam.
  const candidate = context.subject ?? context.focus ?? null
  const scope =
    candidate && index.some((row) => row.exam_type_id === exam.id && row.subject_id === candidate.id) ? candidate : null
  const when = days === 0 ? 'is today' : days === 1 ? 'is tomorrow' : `in ${days} days`
  const allHref = `/papers?exam=${exam.slug}${program ? `&program=${program.slug}` : ''}`

  return {
    id: `exam-${next.id.slice(0, 8)}`,
    tone: 'exam',
    eyebrow: `Exam countdown${program ? ` · ${program.short_name ?? program.name}` : ''}`,
    title: `${exam.name} ${when}`,
    body: next.note ?? `${examDay.format(new Date(`${next.exam_date}T00:00:00Z`))}. Sit the past papers first.`,
    cta: scope
      ? { label: `Practise ${scope.name}`, href: `/subject/${scope.slug}?exam=${exam.slug}` }
      : { label: `Past ${exam.name} papers`, href: allHref },
    screens: SCREENS.exam,
  }
}

/** The newest sitting, while it is new. On a subject page, only that subject's paper. */
function releaseSpotlight(
  context: SpotlightContext,
  today: string,
  examTypes: ExamType[],
  index: PaperIndexRow[],
): Spotlight | null {
  const dated = index.filter((row): row is PaperIndexRow & { session_date: string } => row.session_date !== null)
  if (dated.length === 0) return null
  const latest = dated.reduce((a, b) => (b.session_date > a.session_date ? b : a))
  const term = termOf(latest.session_date)
  const exam = examTypes.find((type) => type.id === latest.exam_type_id)
  if (!term || !exam || daysBetween(latest.session_date, today) > RELEASE_WINDOW_DAYS) return null

  const filter = `exam=${exam.slug}&year=${term.year}&term=${term.season}`
  const id = `new-${exam.slug}-${term.key}`
  const subject = context.subject
  if (subject) {
    const inBatch = dated.some(
      (row) => row.subject_id === subject.id && row.exam_type_id === exam.id && termOf(row.session_date)?.key === term.key,
    )
    if (!inBatch) return null
  }

  return {
    id,
    tone: 'release',
    eyebrow: 'Just added',
    title: subject ? `New ${exam.name} paper is here` : `New ${exam.name} papers are in`,
    body: `${term.label}, sat ${satOn.format(new Date(`${latest.session_date}T00:00:00Z`))}.`,
    cta: subject
      ? { label: 'Sit the new paper', href: `/subject/${subject.slug}?${filter}` }
      : { label: 'See the new papers', href: `/papers?${filter}` },
    screens: SCREENS.release,
  }
}

/** Mistakes waiting for a retry. The dashboard shows these itself, so not there. */
async function mistakesSpotlight(context: SpotlightContext, today: string): Promise<Spotlight | null> {
  if (context.placement === 'dashboard') return null
  const bank = await getMistakeBank()
  const subject = context.subject
  const due = bank.filter((m) => m.state !== 'fixed' && (!subject || m.subjectSlug === subject.slug)).length
  if (due === 0) return null

  return {
    id: `mistakes-${today}`,
    tone: 'feature',
    eyebrow: 'Your mistake bank',
    title: `${due} ${due === 1 ? 'mistake' : 'mistakes'} to retry`,
    body: 'Get each one right to clear it.',
    cta: {
      label: 'Retry now',
      href: subject ? `/mistakes/practice?subject=${subject.slug}` : '/mistakes/practice',
    },
    secondary: { label: 'Open the bank', href: subject ? `/mistakes?subject=${subject.slug}` : '/mistakes' },
    screens: SCREENS.insights,
  }
}

/** For a visitor: what signing in adds, beyond sitting papers. */
function tourSpotlight(context: SpotlightContext): Spotlight | null {
  if (context.placement !== 'home' && context.placement !== 'papers') return null
  return {
    id: 'tour-insights',
    tone: 'feature',
    eyebrow: 'Free with Google sign-in',
    title: 'See where your marks go',
    body: 'Speed map, mistake bank and peer gaps.',
    cta: { label: 'Sign in with Google', href: '/dashboard', signIn: true },
    screens: SCREENS.insights,
  }
}

const EYEBROW: Record<BannerRow['kind'], string> = {
  announcement: 'Announcement',
  feature: 'New on QuizPractice',
  release: 'Just added',
}
const KIND_SCREENS: Record<BannerRow['kind'], Spotlight['screens']> = {
  announcement: SCREENS.insights,
  feature: SCREENS.insights,
  release: SCREENS.release,
}

/** A banner staff wrote, if it is live on this page today. */
function announcement(
  row: BannerRow,
  context: SpotlightContext,
  today: string,
  programId: string | null,
): Spotlight | null {
  if (!row.placements.includes(context.placement)) return null
  if (row.program_id && row.program_id !== programId) return null
  if ((row.starts_on && row.starts_on > today) || (row.ends_on && row.ends_on < today)) return null
  const tone: SpotlightTone = row.kind
  return {
    id: `b-${row.id.slice(0, 8)}`,
    tone,
    eyebrow: row.eyebrow || EYEBROW[row.kind],
    title: row.title,
    body: row.body ?? '',
    cta: row.cta_label && row.cta_href ? { label: row.cta_label, href: row.cta_href } : { label: 'All papers', href: '/papers' },
    screens: KIND_SCREENS[row.kind],
  }
}
