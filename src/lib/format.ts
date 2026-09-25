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
