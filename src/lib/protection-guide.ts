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
    risk: 'Low after the first 10 free: replayed on 156 students, nobody would have been slowed. Before the free-first rule, 11 students would have waited at least once.',
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
    measures: 'Papers opened against real attempts made, in the last 24 hours.',
    how: [
      'Needs at least "min opens" new papers.',
      'A real attempt is one that lasted 2 minutes or more.',
      'Fires when real attempts are "max attempts" or fewer.',
    ],
    whenItActs: 'Never acts alone. Counts toward the Automatic ban.',
    inWatch: 'Evaluated and logged, never counts toward an actual ban.',
    risk: 'Moderate on its own, which is why it never bans alone: one honest account (17 papers, no attempts) matched it.',
    measured: 'All five scrapers: 100 papers, zero attempts.',
    undo: 'Set to Watch or Off.',
  },
  bot_agent: {
    group: 'signals',
    short: 'bot browser',
    measures: 'The browser name a live session signed in with.',
    how: [
      'Fires when a session\'s browser string does not contain "Mozilla" (so node, curl, python and similar).',
      'It sees sign-ins only. It does not look at data-centre addresses.',
    ],
    whenItActs: 'Never acts alone. Counts toward the Automatic ban.',
    inWatch: 'Evaluated and logged, never counts toward an actual ban.',
    risk: 'Very low: real browsers always say Mozilla. A script that fakes it escapes this signal.',
    measured: 'One scraper account signed in as "node" from a cloud server.',
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
      'Staff, teachers and contributors are never banned.',
      'A ban needs one of these combinations (signals set to Enforce only):',
      '1. Machine pace AND (No use OR Bot browser OR Subject spread)',
      '2. Subject spread AND No use',
      '3. No reading receipts AND (Machine pace OR Subject spread)',
      '4. Bot browser AND No use AND 20 or more papers',
      'One signal alone never bans.',
    ],
    whenItActs: 'Bans the account until 2099, ends its sessions, saves the evidence in the case, writes a row in the ban log, and then the two actions below block its browser and addresses.',
    inWatch: 'Logs "would ban" with the signals and numbers; bans nobody. A signal set to Watch can make a combination show as "would ban" but never as a real ban.',
    risk: 'Low: replayed on every real account, the combinations would have banned and flagged nobody.',
    measured: 'The five scrapers matched machine pace with no use and subject spread; every real student matched none.',
    undo: 'Each ban has its own Undo, and "Undo its bans" below releases every ban this rule made.',
  },
  linked: {
    group: 'actions',
    measures: 'Accounts that share a browser and an address with an account already banned.',
    how: [
      'Needs a banned account first.',
      'Looks for another account seen on the same browser (its random id or its trait signature) as the banned one, and also tied to an address the banned account used: it was seen there with that browser, or it signed in from that address.',
      'The trait signature is coarse (many phones look alike), which is why it also needs the same address.',
    ],
    whenItActs: 'Bans the linked account, the same way as the Automatic ban.',
    inWatch: 'Logs "would ban" with the banned account it matched; bans nobody. This is the default.',
    risk: 'Low, but real: students on the same phone model on one hostel network could match. Hence Watch first.',
    measured: 'No browser records exist yet, so nothing has been measured.',
    undo: 'Each ban has Undo; "Undo its bans" releases all of this rule\'s bans.',
  },
  device_block: {
    group: 'actions',
    measures: 'The browser of a banned account.',
    how: [
      'When an account is banned, the random id kept in its browser is blocked for good.',
      'An account that signs in on a blocked browser is banned on arrival.',
      'Only the random id is blocked, never the trait signature, which many students share.',
    ],
    whenItActs: 'Blocks the id and bans anyone who arrives with it. Logged as "device blocked" / "banned".',
    inWatch: 'Logs "would block" and "would ban"; blocks and bans nothing.',
    risk: 'Very low: the id is random per browser, so a different student never has it.',
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
    measured: 'The scrapers used 7 addresses; five were shared mobile-carrier ranges, which we chose not to block.',
    undo: 'Release the address on Blocked & banned. It also ends by itself.',
  },
}
