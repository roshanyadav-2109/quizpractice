/**
 * What each protection rule is, in plain words, for the Rules tab: what it measures, how it decides,
 * what it does, what Watch does, the risk to real students and what we measured. Kept in step with
 * supabase/migrations/0043_scraper_defence.sql (the rules themselves live in the database).
 */

export type RuleGroup = 'limits' | 'signals' | 'actions' | 'manual'

export interface RuleGuide {
  group: RuleGroup
  /** Short name used when another rule refers to this one. */
  short?: string
  measures: string
  how: string[]
  whenItActs: string
  inWatch: string
  risk: string
  measured: string
  undo: string
}

export const GROUPS: { id: RuleGroup; title: string; blurb: string }[] = [
  { id: 'limits', title: 'Limits: how much and how fast', blurb: 'Apply to every signed-in student. They refuse or slow a request.' },
  { id: 'signals', title: 'Signals: what looks like copying', blurb: 'They only observe. A signal on its own flags an account; the Automatic ban rule below decides when signals together ban it.' },
  { id: 'actions', title: 'Actions: what happens to a banned account', blurb: 'They run when an account is banned (or linked to a banned one).' },
  { id: 'manual', title: 'Manual switches', blurb: 'Only change when you decide to.' },
]

export const GUIDE: Record<string, RuleGuide> = {
  caps: {
    group: 'limits',
    measures: 'How many different new papers one account opens: in the last hour, and in the last 24 hours.',
    how: [
      'Counts distinct papers per account. Opening a paper already opened in the last 24 hours is free and not counted.',
      'Staff and teachers are exempt.',
      'Opening a paper, or submitting an attempt on one, both count as an opening.',
      'At the hourly or daily number the next new paper is refused.',
    ],
    whenItActs: 'Refuses the paper and shows the student a notice (retry in about an hour, or a day). Logged as "refused", and the refusal is written to the trap hits.',
    inWatch: 'Logs "would refuse" and lets the paper open.',
    risk: 'Very low: the busiest real student opened 13 papers in a day; the cap is 100.',
    measured: 'Five scrapers opened exactly 100 each (the old cap) in one day: 466 papers, 11,547 questions.',
    undo: 'Set to Watch or Off, or change the two numbers. Nothing is stored against anyone.',
  },
  lockdown: {
    group: 'manual',
    measures: 'Nothing. A manual emergency switch.',
    how: [
      'While Enforce, these numbers replace the Paper limits for everyone: papers a day and an hour.',
      'Use it if a large attack is under way. Switch it off afterwards.',
    ],
    whenItActs: 'Every account (not staff or teachers) is refused after the lowered number of new papers. Logged as "refused" on the lockdown rule.',
    inWatch: 'Logs what it would have refused; nobody is refused.',
    risk: 'High if left on: honest students revising before an exam would hit 10 papers a day.',
    measured: 'Never triggered automatically, on purpose.',
    undo: 'Switch to Off. Nothing is stored against anyone.',
  },
  pace: {
    group: 'limits',
    measures: 'The time since the account last opened a new paper, against how many it has opened today.',
    how: [
      'The first "free first" papers of the day have no wait.',
      'After that the account must wait gap 1 seconds up to "tier 1 until" papers, gap 2 seconds up to "tier 2 until", and gap 3 seconds after that.',
      'Only new papers wait; reopening a paper from today is instant.',
    ],
    whenItActs: 'Refuses the paper with a "wait N seconds" notice. Logged as "slowed".',
    inWatch: 'Logs "would slow" (at most one a half-minute per account) and lets the paper open.',
    risk: 'Low after the first 10 free: replayed on 156 students, nobody would have been slowed. (An earlier count of 11 students was wrong: those were one paper recorded twice a few milliseconds apart.)',
    measured: 'The scrapers opened a paper every 3 to 4 seconds. Real students waited 41 seconds or more.',
    undo: 'Set to Watch or Off, or raise "free first".',
  },
  search_limit: {
    group: 'limits',
    measures: 'Searches by one account, in the last hour and in the last 24 hours.',
    how: ['Each search counts. Staff and teachers are exempt.', 'Search results quote the questions, so unlimited search would be another way to copy them.'],
    whenItActs: 'Refuses the search with a notice. Logged as "refused".',
    inWatch: 'Logs "would refuse" and lets the search run.',
    risk: 'None seen: nobody came near 60 an hour.',
    measured: 'Search was uncounted before, so an account could pull 40 hits per query without limit.',
    undo: 'Set to Watch or Off, or change the numbers.',
  },
  machine_pace: {
    group: 'signals',
    short: 'machine pace',
    measures: 'The typical time (the median) between the last papers an account opened.',
    how: [
      'Needs at least "window" new papers in 24 hours.',
      'Each paper is counted once, at its first opening: one paper recorded twice a few milliseconds apart (two requests at once) used to drag a student\'s typical gap towards zero and no longer does.',
      'Takes the last "window" gaps between openings and finds the middle value.',
      'Fires when that middle value is below "median seconds".',
    ],
    whenItActs: 'Alone: flags the account once a day (event "flagged"). Together with other signals it counts toward the Automatic ban.',
    inWatch: 'Evaluated and logged as flagged / "would ban", never counts toward an actual ban.',
    risk: 'Very low: no student had 15 papers in a window at a typical gap under 41 seconds.',
    measured: 'Scrapers: 3 to 4 seconds. Students: 41 seconds to 55 minutes.',
    undo: 'Set to Watch or Off.',
  },
  no_use: {
    group: 'signals',
    short: 'no use',
    measures: 'Papers opened with no sign they were used, in the last 24 hours.',
    how: [
      'Needs at least "min opens" new papers.',
      'Use means any of: a real attempt (2 minutes or longer), an explanation read, or a reading receipt from the page.',
      'Learning mode never creates an attempt (0 of 73 attempts so far), so attempts alone say nothing about students who practise there.',
      'Fires when there are "max attempts" or fewer real attempts AND no explanation read AND no receipt.',
      'It stays quiet until pages have started sending receipts, so it cannot match a student before the evidence of use exists.',
    ],
    whenItActs: 'Never acts alone. Counts toward the Automatic ban.',
    inWatch: 'Evaluated and logged, never counts toward an actual ban.',
    risk: 'Moderate on its own, which is why it never bans alone and needs the minimum number of papers for a ban.',
    measured: 'All five scrapers: 100 papers, zero attempts, and no explanation or receipt could exist for them. A first version that looked at attempts only would have matched most honest learning-mode students.',
    undo: 'Set to Watch or Off.',
  },
  bot_agent: {
    group: 'signals',
    short: 'bot browser',
    measures: 'The browser name sent with the requests that opened papers.',
    how: [
      'Fires when a paper was opened by a request whose browser name does not contain "Mozilla" (so node, curl, python and similar).',
      'It does NOT use the sign-in session: the site\'s own server completes some Google sign-ins, and those sessions are recorded as "node" on an Amazon address for ordinary students too.',
      'It does not look at data-centre addresses.',
    ],
    whenItActs: 'Never acts alone. Counts toward the Automatic ban once it is set to Enforce.',
    inWatch: 'Evaluated and logged, never counts toward an actual ban. This is the default until real browser names have been recorded for a while.',
    risk: 'Low: real browsers always say Mozilla. A script that fakes the name escapes this signal.',
    measured: 'Nothing yet: browser names per paper started on 2 Oct 2026. An earlier version read the sign-in session and wrongly matched 15 real students; it was corrected.',
    undo: 'Set to Watch or Off.',
  },
  subject_spread: {
    group: 'signals',
    short: 'subject spread',
    measures: 'How many different subjects an account opened papers in over 24 hours.',
    how: ['Counts distinct subjects among the papers opened.', 'Fires at "limit" subjects or more.'],
    whenItActs: 'Alone: flags the account once a day. Together with other signals it counts toward the Automatic ban.',
    inWatch: 'Evaluated and logged as flagged / "would ban", never counts toward an actual ban.',
    risk: 'Very low: the most any student touched was 7 subjects.',
    measured: 'Scrapers: 11 to 47 subjects (about 29 on average) of 89. Students: 2 to 9.',
    undo: 'Set to Watch or Off, or raise the limit.',
  },
  no_receipts: {
    group: 'signals',
    short: 'no reading receipts',
    measures: 'Papers opened that left no sign of being read.',
    how: [
      'A paper page sends a small receipt after a few seconds in view with some scrolling or tapping, and a few more times while it stays open.',
      'Fires when an account has at least "min opens" papers and receipts for fewer than "max ratio" of them.',
      'Only counted once at least one receipt exists from the last day, so it cannot misfire before pages send them.',
    ],
    whenItActs: 'Never acts alone. Counts toward the Automatic ban only when it is Enforce.',
    inWatch: 'Logged only. This is the default, until we have seen real receipt rates.',
    risk: 'Moderate for ad-blockers, slow phones and background tabs, which is why it starts in Watch.',
    measured: 'Not measured yet: receipts are new.',
    undo: 'Set to Watch or Off.',
  },
  auto_ban: {
    group: 'actions',
    measures: 'Combinations of the signals above, for one account.',
    how: [
      'Runs for an account right after it opens a paper, and for all accounts every minute.',
      'Staff, teachers, contributors and accounts you marked Trusted are never banned.',
      'An account with 3 or more real attempts this week is never banned either: it is flagged for you to look at, because it is practising.',
      'A ban needs at least "min opens" new papers in 24 hours (the busiest real student opened 13), and one of these combinations, counting only signals set to Enforce:',
      '1. Machine pace AND (No use OR Bot browser OR Subject spread)',
      '2. Subject spread AND No use',
      '3. No reading receipts AND (Machine pace OR Subject spread)',
      '4. Bot browser AND No use',
      '5. A browser that a banned account used AND (Machine pace OR No use OR Subject spread). This one does not need the minimum papers.',
      'One signal alone never bans.',
    ],
    whenItActs: 'Bans the account until 2099, ends its sessions, saves the evidence in the case, writes a row in the ban log, and then the two actions below block its browser and addresses.',
    inWatch: 'Logs "would ban" with the signals and numbers; bans nobody.',
    risk: 'Low: replayed on every real account, it would have banned and flagged nobody. A hard test with an honest cramming student, a student whose papers were recorded twice, a fast tab-opener and a trusted account banned none of them.',
    measured: 'The five scrapers matched machine pace, subject spread and no use at 100 papers each; every real student matched none.',
    undo: 'Each ban has its own Undo, and "Undo its bans" below releases every ban this rule made.',
  },
  linked: {
    group: 'actions',
    measures: 'Accounts that share a browser and an address with an account already banned.',
    how: [
      'Needs a banned account first.',
      'Looks for another account seen on the same browser (its random id or its trait signature) as the banned one, and also tied to an address the banned account used: it was seen there with that browser, or it signed in from that address with a real browser.',
      'The trait signature is coarse (many phones look alike), which is why it also needs the same address.',
      'Never bans staff, trusted accounts, or an account with 3 or more real attempts this week.',
    ],
    whenItActs: 'Bans the linked account, the same way as the Automatic ban.',
    inWatch: 'Logs "would ban" with the banned account it matched; bans nobody. This is the default.',
    risk: 'Low but real: students on the same phone model on one hostel network could match. Hence Watch first.',
    measured: 'No browser records exist yet, so nothing has been measured.',
    undo: 'Each ban has Undo; "Undo its bans" releases all of this rule\'s bans.',
  },
  device_block: {
    group: 'actions',
    measures: 'The browser of a banned account.',
    how: [
      'When an account is banned, the random id kept in its browser is blocked for good.',
      'An account that later signs in on a blocked browser is only flagged: a shared computer (a lab or a cyber-cafe) may have been used by the banned account.',
      'It is banned only if another signal agrees (machine pace, no use or subject spread). See combination 5 under Automatic ban.',
      'Only the random id is blocked, never the trait signature, which many students share.',
    ],
    whenItActs: 'Blocks the id, flags anyone who signs in on it, and bans them if another signal agrees. Logged as "device blocked" and "flagged".',
    inWatch: 'Logs "would block"; blocks nothing.',
    risk: 'Low: a student on a shared computer is flagged, never banned on that alone.',
    measured: 'A scraper can clear the browser to get a new id, which defeats this.',
    undo: 'Release the browser on Blocked & banned, or "Undo its bans".',
  },
  ip_block: {
    group: 'actions',
    measures: 'The addresses a banned account used.',
    how: [
      'When an account is banned, its addresses (from browser records and sign-ins) are blocked for "hours" hours.',
      'Each time the address is seen again, the block starts over.',
      'It stops signing in and opening papers from that address. Browsing and the free previews still work.',
    ],
    whenItActs: 'Refuses sign-in and paper opening from the address, with a notice. Logged as "blocked".',
    inWatch: 'Logs "would block"; nobody is blocked.',
    risk: 'Low to moderate: other people on the same network (a hostel, a mobile network) are blocked for the same time.',
    measured: 'The scrapers used 6 addresses: five shared mobile-carrier ranges, which we chose not to block, and one Airtel broadband address. (A 7th, an Amazon address, was the site\'s own server and was removed.)',
    undo: 'Release the address on Blocked & banned. It also ends by itself.',
  },
}

/** About how many questions one paper holds (49,556 questions over 2,266 papers). */
const QUESTIONS_PER_PAPER = 22

export interface Description {
  what: string
  how: string
  repercussions: string
  warnings: string[]
}

const n = (value: number | undefined, fallback = 0) => (Number.isFinite(value) ? (value as number) : fallback)

/** What a rule will do with the numbers typed in, in plain words (shown under the number boxes). */
export function describe(key: string, p: Record<string, number>): Description {
  const warnings: string[] = []
  switch (key) {
    case 'caps':
    case 'lockdown': {
      const daily = n(p.daily)
      const hourly = n(p.hourly)
      if (hourly > daily) warnings.push('The hourly number is higher than the daily one, so the hourly limit can never matter.')
      if (daily < 5) warnings.push('Under 5 papers a day would stop a student doing a normal revision session.')
      return {
        what: `An account that opens ${hourly} new papers within an hour, or ${daily} within a day, is refused the next new paper.${key === 'lockdown' ? ' While Lockdown is Enforce these numbers replace the normal paper limits for everyone.' : ''}`,
        how: 'The database counts distinct papers per account. Reopening a paper opened in the last 24 hours is free, and staff and teachers are exempt. Past the limit the student sees a notice and can try again after about an hour, or a day.',
        repercussions: `A scraper could still copy about ${daily * QUESTIONS_PER_PAPER} questions a day per account (${daily} papers of about ${QUESTIONS_PER_PAPER} questions). A genuine student who goes past ${hourly} papers in an hour or ${daily} in a day is stopped until the window passes. Lower numbers stop more people; higher numbers let more be copied.`,
        warnings,
      }
    }
    case 'pace': {
      const free = n(p.free_first)
      const t1 = n(p.tier_1_until)
      const t2 = n(p.tier_2_until)
      const g1 = n(p.gap_1)
      const g2 = n(p.gap_2)
      const g3 = n(p.gap_3)
      if (!(t1 > free)) warnings.push('"tier 1 until" should be larger than "free first".')
      if (!(t2 > t1)) warnings.push('"tier 2 until" should be larger than "tier 1 until".')
      if (!(g1 <= g2 && g2 <= g3)) warnings.push('The waits should grow: gap 1 ≤ gap 2 ≤ gap 3.')
      if (g1 > 0 && g1 < 4) warnings.push('A wait under 4 seconds is the pace the scrapers used (3 to 4 seconds); it would not slow them.')
      return {
        what: `The first ${free} papers of a day never wait. After that each new paper needs a wait since the account's last new paper: ${g1} seconds up to paper ${t1}, ${g2} seconds up to paper ${t2}, then ${g3} seconds.`,
        how: 'The database compares the time since the account last opened a new paper with the wait for its place in the day. If it is sooner, the paper is refused with a "wait N seconds" notice in Enforce, or only logged in Watch.',
        repercussions: `At the last tier (${g3} seconds) an account can open at most about ${g3 > 0 ? Math.floor(3600 / g3) : '–'} new papers an hour. A student who opens papers faster than the wait sees a short notice and tries again; scrapers measured 3 to 4 seconds a paper, real students 41 seconds or more.`,
        warnings,
      }
    }
    case 'search_limit': {
      const hourly = n(p.hourly)
      const daily = n(p.daily)
      if (hourly > daily) warnings.push('The hourly number is higher than the daily one.')
      return {
        what: `An account that searches ${hourly} times within an hour, or ${daily} within a day, is refused the next search.`,
        how: 'Every search by a signed-in account is counted. Staff and teachers are exempt. Past the limit the search shows a notice instead of results.',
        repercussions: `Search results quote the questions, so each result page is another way to copy them (up to 40 hits a query). A student searching more than ${hourly} times an hour is stopped for the rest of the hour.`,
        warnings,
      }
    }
    case 'machine_pace': {
      const w = n(p.window)
      const m = n(p.median_seconds)
      if (m >= 30) warnings.push('At 30 seconds or more this reaches the pace of real students (the fastest typical gap was 41 seconds) and could match them.')
      if (m > 0 && m <= 2) warnings.push('At 2 seconds or less this misses the scrapers, who typically took 3 to 4 seconds.')
      return {
        what: `An account whose last ${w} new papers were opened with a typical (median) gap under ${m} seconds shows "machine pace".`,
        how: `Needs at least ${w} new papers in 24 hours. It takes the gaps between the last ${w} openings and finds the middle value. On its own it only flags the account once a day; together with other signals it counts toward the Automatic ban.`,
        repercussions: 'Scrapers measured 3 to 4 seconds and real students 41 seconds or more, so anything from about 5 to 30 separates them. A higher number starts to match real students; a lower number lets scrapers through.',
        warnings,
      }
    }
    case 'no_use': {
      const opens = n(p.min_opens)
      const att = n(p.max_attempts)
      if (opens < 8) warnings.push('Under 8 papers matches ordinary browsing.')
      return {
        what: `An account that opened ${opens} or more papers in 24 hours, with ${att} or fewer real attempts (2 minutes or longer), no explanation read and no reading receipt, shows "no use".`,
        how: 'Learning mode makes no attempts, so use also means an explanation read or a reading receipt from the page. The signal stays quiet until pages have started sending receipts. It never acts alone: it only counts toward the Automatic ban.',
        repercussions: `A student who only browses ${opens}+ papers without reading or practising matches this signal, which is why it needs a second signal and the minimum papers to ban. A lower number matches more honest browsing.`,
        warnings,
      }
    }
    case 'subject_spread': {
      const limit = n(p.limit)
      if (limit <= 9) warnings.push('9 subjects or fewer is a range real students have reached; the most any student touched was 7 in a day, but more will come at exam time.')
      return {
        what: `An account that opens papers in ${limit} or more different subjects within 24 hours shows "subject spread".`,
        how: 'Counts distinct subjects among the papers opened. On its own it flags the account once a day; together with other signals it counts toward the Automatic ban.',
        repercussions: `Scrapers touched 11 to 47 subjects of 89 in a day; students touched 2 to 9. A lower number starts to match students who explore; a higher number lets a scraper cover more subjects before it shows.`,
        warnings,
      }
    }
    case 'no_receipts': {
      const opens = n(p.min_opens)
      const ratio = n(p.max_ratio)
      if (ratio > 0.6) warnings.push('Above 60% this matches students whose phones or ad-blockers stop receipts.')
      return {
        what: `An account with ${opens} or more papers in 24 hours, where fewer than ${Math.round(ratio * 100)}% of them left a reading receipt, shows "no reading receipts".`,
        how: 'A paper page sends a small receipt after a few seconds in view with some scrolling or tapping. The signal only counts once receipts exist from the last day, so it cannot misfire before pages send them.',
        repercussions: 'Ad-blockers, slow phones and background tabs can stop receipts, so honest students could match. That is why it starts in Watch and only counts toward a ban with another signal.',
        warnings,
      }
    }
    case 'bot_agent':
      return {
        what: 'A paper opened by a request whose browser name is not a browser (no "Mozilla": node, curl, python and similar) shows "bot browser".',
        how: 'The browser name sent with each paper-opening request is recorded and checked. The sign-in session is not used, because the site\'s own server completes some sign-ins and shows up as "node" for ordinary students.',
        repercussions: 'Real browsers always say Mozilla, so real students should not match. A script that fakes the name escapes it. It only counts toward the Automatic ban.',
        warnings,
      }
    case 'auto_ban': {
      const min = n(p.min_opens, 25)
      if (min < 15) warnings.push('Under 15 papers is within what a student can open in a day. The busiest real student opened 13.')
      return {
        what: `An account with at least ${min} new papers in 24 hours that shows a strong combination of the signals is banned: machine pace with no use, a bot browser or subject spread; subject spread with no use; no reading receipts with machine pace or subject spread; or bot browser with no use. A browser a banned account used, with machine pace, no use or subject spread, bans at any number of papers.`,
        how: 'Checked right after the account opens a paper and every minute for all accounts. Only signals set to Enforce count toward a real ban. Staff, trusted accounts and accounts with 3 or more real attempts this week are never banned (the last are flagged for you). The ban lasts until 2099, ends the sessions, saves the evidence and blocks the browser and addresses (those two rules).',
        repercussions: `A scraper gets about ${min} papers (about ${min * QUESTIONS_PER_PAPER} questions) before the ban. A lower number bans sooner but moves closer to what an honest student can open; a higher number lets a scraper copy more before it is stopped. A wrongly banned student loses access until you press Undo.`,
        warnings,
      }
    }
    case 'linked':
      return {
        what: 'An account seen on the same browser as a banned account, and tied to an address the banned account used, is banned too.',
        how: 'Needs a banned account first. Looks at browser records (random id and trait signature) and addresses.',
        repercussions: 'Students on the same phone model on one hostel network could match, which is why it starts in Watch.',
        warnings,
      }
    case 'device_block':
      return {
        what: 'When an account is banned, its browser id is blocked, and any account that signs in on that browser is banned on arrival.',
        how: 'Only the browser\'s own random id is blocked, never the shared trait signature.',
        repercussions: 'A scraper who clears the browser gets a new id and escapes this.',
        warnings,
      }
    case 'ip_block': {
      const hours = n(p.hours)
      if (hours > 72) warnings.push('Over 3 days is long for an address that may belong to a network many students share.')
      return {
        what: `When an account is banned, the addresses it used are blocked for ${hours} hours. Each time the address is seen again, the ${hours} hours start over.`,
        how: 'Refuses sign-in and opening papers from that address with a notice. Browsing and the free previews still work.',
        repercussions: 'Everyone on the same network (a hostel, a mobile network) is blocked for the same time, so a longer block affects more innocent people. A shorter one lets the scraper back sooner.',
        warnings,
      }
    }
    default:
      return { what: '', how: '', repercussions: '', warnings }
  }
}
