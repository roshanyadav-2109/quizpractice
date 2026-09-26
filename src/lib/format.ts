/**
 * Shared formatters.
 *
 * The locale is pinned rather than left to the runtime. A bare
 * `toLocaleString()` formats with whatever locale the environment happens to
 * have, which differs between the Node process that renders on the server and
 * the browser that hydrates — 10,134 against 10 134 — and React treats that as
 * a hydration mismatch. Pinning it also keeps grouping consistent for a bank
 * whose audience reads Indian digit grouping.
 */
const counts = new Intl.NumberFormat('en-IN')

/** Grouped integer, for counts shown in the interface. */
export function formatCount(value: number): string {
  return counts.format(value)
}

const sessions = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/**
 * A sitting date, as "16 Jul 2026".
 *
 * Pinned to UTC as well as to a locale: a session_date is a plain date, and
 * parsing it in the viewer's zone moves it a day backwards for anyone west of
 * Greenwich.
 */
export function formatSession(date: string | null): string {
  if (!date) return 'Undated'
  return sessions.format(new Date(`${date}T00:00:00Z`))
}

/** A length of time, as "1h 20m", "12m" or "45s". */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  if (minutes > 0) return `${minutes}m`
  return `${total}s`
}

const istDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' })
const istShort = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })

/** The calendar day an instant falls on in India, as "2026-09-26". */
export function istDayKey(instant: string | Date): string {
  return istDay.format(typeof instant === 'string' ? new Date(instant) : instant)
}

/** An instant as its day in India, "26 Sep". */
export function formatShortDate(instant: string | Date): string {
  return istShort.format(typeof instant === 'string' ? new Date(instant) : instant)
}
