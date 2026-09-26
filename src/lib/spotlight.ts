import 'server-only'
import { publicClient, memoise } from '@/lib/supabase/public'
import { getCurrentProfile } from '@/lib/supabase/server'
import { getCatalogueCounts, getExamTypes, getMistakeBank, getPaperIndex, type PaperIndexRow } from '@/lib/queries'
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
const RETRY_BATCH = 10

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
const count = new Intl.NumberFormat('en-IN')

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
    const [profile, examTypes, index, calendar, banners, programs, catalogue] = await Promise.all([
      getCurrentProfile(),
      getExamTypes(),
      getPaperIndex(),
      loadCalendar(),
      loadBanners(),
      loadPrograms(),
      getCatalogueCounts(),
    ])
    const programId =
      context.subject?.programId ?? programs.find((program) => program.slug === context.programSlug)?.id ?? null

    const personal = profile ? await mistakesSpotlight(context, today) : tourSpotlight(context, catalogue.bySet.size)

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
  const papersFor = (subjectId: string | null) =>
    index.filter((row) => row.exam_type_id === exam.id && (!subjectId || row.subject_id === subjectId))

  // Point at the page's subject, or the student's own, when it has this exam.
  const candidate = context.subject ?? context.focus ?? null
  const scope = candidate && papersFor(candidate.id).length > 0 ? candidate : null
  const rows = papersFor(scope?.id ?? null)
  const terms = new Set(rows.map((row) => termOf(row.session_date)?.key).filter(Boolean)).size
  const subjects = new Set(rows.map((row) => row.subject_id)).size

  const when = days === 0 ? 'is today' : days === 1 ? 'is tomorrow' : `is in ${days} days`
  const pastTerms = `${terms} past ${terms === 1 ? 'term' : 'terms'}`
  const body = scope
    ? `${scope.name} has ${exam.name} papers from ${pastTerms}. Sit the newest first — the closest match to what you’ll see on the day.`
    : `${exam.name} papers from ${pastTerms} across ${subjects} subjects. Sit the ones for your subjects before the day.`
  const allHref = `/papers?exam=${exam.slug}${program ? `&program=${program.slug}` : ''}`

  return {
    id: `exam-${next.id.slice(0, 8)}`,
    tone: 'exam',
    eyebrow: `Exam countdown${program ? ` · ${program.short_name ?? program.name}` : ''}`,
    title: `${exam.name} ${when}`,
    body: next.note ? `${next.note.replace(/\.$/, '')}. ${body}` : body,
    cta: scope
      ? { label: `Practise ${scope.name}`, href: `/subject/${scope.slug}?exam=${exam.slug}` }
      : { label: `Past ${exam.name} papers`, href: allHref },
    secondary: scope ? { label: `All ${exam.name} papers`, href: allHref } : undefined,
    stat: {
      value: days === 0 ? 'Today' : String(days),
      label: days === 0 ? 'all the best' : days === 1 ? 'day to go' : 'days to go',
      detail: examDay.format(new Date(`${next.exam_date}T00:00:00Z`)),
    },
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

  const batch = dated.filter((row) => row.exam_type_id === exam.id && termOf(row.session_date)?.key === term.key)
  const subjectIds = [...new Set(batch.map((row) => row.subject_id))]
  const filter = `exam=${exam.slug}&year=${term.year}&term=${term.season}`
  const id = `new-${exam.slug}-${term.key}`

  if (context.subject) {
    const subject = context.subject
    if (!subjectIds.includes(subject.id)) return null
    return {
      id,
      tone: 'release',
      eyebrow: 'Just added',
      title: `The ${term.label} ${exam.name} is here`,
      body: `${subject.name}’s newest paper, sat in ${satOn.format(new Date(`${latest.session_date}T00:00:00Z`))}. The latest paper is the closest guide to the next one.`,
      cta: { label: 'Sit the new paper', href: `/subject/${subject.slug}?${filter}` },
      stat: { value: 'New', label: exam.name, detail: term.label },
    }
  }

  return {
    id,
    tone: 'release',
    eyebrow: 'Just added',
    title: `${exam.name} papers from the ${term.label}`,
    body: `${subjectIds.length} subjects, sat in ${satOn.format(new Date(`${latest.session_date}T00:00:00Z`))}. The latest papers are the closest guide to the ones you’ll sit next.`,
    cta: { label: 'See the new papers', href: `/papers?${filter}` },
    stat: {
      value: String(subjectIds.length),
      label: subjectIds.length === 1 ? 'new subject' : 'new subjects',
      detail: `${exam.name} · ${term.short}`,
    },
  }
}

/** Mistakes waiting for a retry. The dashboard shows these itself, so not there. */
async function mistakesSpotlight(context: SpotlightContext, today: string): Promise<Spotlight | null> {
  if (context.placement === 'dashboard') return null
  const bank = await getMistakeBank()
  const subject = context.subject
  const due = bank.filter((m) => m.state !== 'fixed' && (!subject || m.subjectSlug === subject.slug)).length
  if (due === 0) return null

  const batch = Math.min(RETRY_BATCH, due)
  return {
    id: `mistakes-${today}`,
    tone: 'feature',
    eyebrow: 'Your mistake bank',
    title: `${due} ${subject ? `${subject.name} ` : ''}${due === 1 ? 'mistake is' : 'mistakes are'} waiting for a retry`,
    body: 'Every question you got wrong, in one place. Put one right and it comes back once, three days later, to check it stuck.',
    cta: {
      label: `Retry ${batch} ${batch === 1 ? 'mistake' : 'mistakes'}`,
      href: subject ? `/mistakes/practice?subject=${subject.slug}` : '/mistakes/practice',
    },
    secondary: { label: 'Open the bank', href: subject ? `/mistakes?subject=${subject.slug}` : '/mistakes' },
    stat: { value: count.format(due), label: 'to retry', detail: subject ? subject.name : 'across your subjects' },
  }
}

/** For a visitor: what signing in adds, beyond sitting papers. */
function tourSpotlight(context: SpotlightContext, papers: number): Spotlight | null {
  if (context.placement !== 'home' && context.placement !== 'papers') return null
  return {
    id: 'tour-insights',
    tone: 'feature',
    eyebrow: 'Free with Google sign-in',
    title: 'See exactly where your marks go',
    body: 'A speed-versus-accuracy map of every answer, a mistake bank that brings questions back until they stick, and the questions most students got right that you missed.',
    cta: { label: 'Sign in with Google', href: '/dashboard', signIn: true },
    stat: { value: count.format(papers), label: 'past papers', detail: 'free to practise' },
  }
}

const EYEBROW: Record<BannerRow['kind'], string> = {
  announcement: 'Announcement',
  feature: 'New on QuizPractice',
  release: 'Just added',
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
  }
}
