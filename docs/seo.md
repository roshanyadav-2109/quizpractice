# Search and AI visibility

How the site is found — by Google, Bing and the AI assistants that answer
from them — and what to keep true when changing it.

## The catalogue's addresses

Every public URL is built in `src/lib/seo/paths.ts`, and they read the way
students search: subject, then exam, then the day the paper was sat.

| Page | Address | Built from |
|---|---|---|
| Home | `/` | the catalogue |
| Exam hub | `/exam/quiz-1`, `/exam/qualifier`, … | every subject with that exam |
| Programme / level | `/program/data-science`, `/program/data-science/foundation` | `programs.short_name`, `levels.slug` |
| Subject | `/pyq/maths-1` | `subjects.slug` |
| Subject × exam | `/pyq/maths-1/quiz-1` | `exam_types.slug` |
| Subject × exam × year | `/pyq/maths-1/quiz-1/2025` | only where that year had two or more papers; one redirects to the paper |
| Year | `/year/2025` | every paper sat that year, by exam |
| Exam × year | `/exam/quiz-1/2025` | every subject's paper from that exam and year, by term |
| Term (several sets) | `/pyq/maths-1/qualifier/may-2024` | only where a term had more than one set; otherwise it redirects to the paper |
| Paper | `/pyq/maths-1/quiz-1/16-feb-2025` | the sitting date, plus the set code when one day had several sets (`…/20-apr-2025-qdf2`) |
| Question (retired) | `/pyq/maths-1/quiz-1/16-feb-2025/q12-…` | redirects permanently to its paper — see "Who sees what" |
| Course code | `/course/BSMA1001` | redirects to the subject |

Old addresses are redirected permanently: `/subject/<slug>?exam=…&year=…&term=…`
in `src/proxy.ts`, `/program/ds` in the programme page, and every question
address to its paper (`#qN` when the question is in the free preview).
`/paper/<set id>` (the instructions before a mock test) and `/practice/<set id>`
(the runner) stay as they are; they are app screens, pointed at the paper's
page by `rel=canonical`.

## Rendering

The catalogue pages never read the session. They are rendered once, served to
everyone from the CDN (`revalidate` of an hour for hubs, a day for papers and
questions), and filled in for a signed-in student by the browser:
`src/components/site/Viewer.tsx` asks `/api/me` once per visit for the account
menu, best scores and mistakes due. The proxy runs only on the private areas.

Two things keep this working, and breaking either quietly turns every page
back into a per-request render:

- Nothing on a catalogue page may call `cookies()`, `getCurrentProfile()` or a
  `personal()` loader — including the header and footer, which are on every
  page. Use `useViewer()` in a client component instead.
- There is no `loading.tsx` above the catalogue pages. A loading boundary makes
  the server stream before it knows a page's status, and every missing paper
  would answer 200 and every redirect become a meta refresh. The private pages
  have their own `loading.tsx`.

Staff edits clear the caches as before (`refresh()` in `src/lib/cache.ts`),
and a catalogue or taxonomy change also marks every rendered page stale.

## Who sees what

The full papers are behind a free Google sign-in; the public pages are what
search engines index.

- **Anyone, search engines included:** every hub, and each paper's page with
  its details and its first three questions (`LEAD_IN` in `src/lib/access.ts`)
  — no answers. A lock card (`src/components/seo/PaperLock.tsx`, class
  `paper-locked`) ends the preview. Learning mode shows the same three.
- **A signed-in student:** the whole paper in learning mode or as a timed
  mock test, its answers and explanations, search, and their results.

Everyone sees the same public page, so there is nothing to cloak. The paper's
structured data lists only the preview's questions, without answers, and says
the page is not free to access in full (`isAccessibleForFree: false`, with a
`WebPageElement` naming `.paper-locked`) — Google's markup for content behind a
login or paywall. Paid access later changes who passes the lock, not the page.

How the questions are protected from copying:

- **The database.** Questions, options, the answer key and explanations are
  not readable with the anon key every browser has (migration 0035), nor are
  the functions that return them. The server reads them with its own key
  (`src/lib/supabase/content.ts`), which must only ever ask for published
  content and never reach the browser.
- **Per account.** Each paper a student opens is recorded (`open_set`,
  migration 0034): 30 new papers an hour and 100 a day, re-opening free. An
  explanation opens only for a paper opened in the last week or a question
  answered (`may_read_question`); marking a paper counts as opening it, so the
  key cannot be found by submitting guesses. Staff and teachers are not limited.
- **A mark.** Every full paper shown to a student carries an invisible mark of
  the account in its text (`src/lib/watermark.ts`). `npm run watermark:find --
  copied.html` names the account a copy came from.
- **A trap.** `/all-questions` is linked invisibly from every page and closed
  in `robots.txt`; a visit is a scraper ignoring it, and is logged.
- **Signals.** Refused openings and trap visits land in `scrape_signals`, for
  staff to review with the IP, browser and account.
- **The edge.** Three Vercel Firewall rules on the quizdesk project (the plan's
  limit is three), set 28 September 2026:
  - `/all-questions` → the IP is denied site-wide for an hour. The firewall
    now answers before the trap route runs, so these visits show in Vercel's
    firewall log rather than `scrape_signals`.
  - `/api/solutions/…`, `/api/attempts`, `/api/reviews` → 120 requests a minute
    per IP, then 429.
  - `/practice/…`, `/paper/…` → 240 a minute per IP, then 429.

  The public pages are deliberately not rate-limited: they show only the free
  preview, and a 429 to Googlebot slows its crawl of the whole site. The
  limits are high because many students share one IP (hostel Wi-Fi, mobile
  carriers' NAT); the per-account limit is the precise control.

## What each page says

Titles and headings come from `src/lib/seo/titles.ts`, built from search data
(September 2026): subject, then exam, then "PYQ", then "IITM BS" — never bare
"IITM", which also means other institutes. `subjects.short_name` (migration
0031, editable in `/admin/taxonomy`) is the name a subject is searched by:
"Maths 1", "PDSA", and the full name for degree-level and ES courses.

Every hub opens with a two-sentence answer carrying its real numbers, then the
papers as a table, then questions students ask, answered. The exam facts in
`src/lib/seo/exam-facts.ts` come from study.iitm.ac.in and name their sources;
check them each term — IIT Madras revises the rules.

The words students add to these searches are "with solutions" and "answer
key", so titles, descriptions and questions-answered say what comes with each
paper — and, since September 2026, that the whole paper opens with a free
Google sign-in. Video solutions play in learning mode, under a question's
answer; the pages promise them only where they exist.

## Machine-readable

| Address | What |
|---|---|
| `/robots.txt` | everything public open to every crawler, AI assistants named; private areas, the API and search results closed |
| `/sitemap.xml` | index of `/sitemaps/pages.xml` and `/sitemaps/papers.xml`; real `lastmod` dates only. The retired `questions-N.xml` and `videos.xml` answer 404 |
| `/llms.txt`, `/llms-full.txt` | the site described for AI agents, generated from the catalogue |
| JSON-LD | Organization + WebSite on every page; CollectionPage + ItemList on hubs; on papers, Quiz/LearningResource with the preview's questions (no answers), `isAccessibleForFree: false` and the locked part; BreadcrumbList everywhere |
| `opengraph-image` | a card per subject, exam and paper for shared links |

## After adding papers

```bash
npm run cache:refresh                        # the site picks the new papers up
npm run seo:indexnow -- --since 2026-09-27   # Bing, Copilot and the rest crawl them within hours
```

`seo:indexnow` reads the live sitemaps; the key is the `.txt` file in `public/`.
Google does not use IndexNow — it reads the sitemap.

## One-time setup (owner)

1. **Google Search Console** — the verified `unknowniitians.com` Domain
   property covers this subdomain (done, September 2026; `sitemap.xml`,
   `pages.xml` and `papers.xml` are submitted). A DNS record on `quizspace`
   itself would not work: that name is a CNAME to Vercel. Otherwise, add a
   URL-prefix property and set `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` in Vercel.
   Under Settings, keep "Search generative AI features" on.
2. **Bing Webmaster Tools** — import the site from Search Console (or set
   `NEXT_PUBLIC_BING_SITE_VERIFICATION`), submit the sitemap, then run
   `npm run seo:indexnow` once to submit every page.
3. **Brave Search** — submit the home page and the exam hubs at
   search.brave.com/submit-url (Claude's web search reads Brave's index).
4. Link the site from the Unknown IITians website and YouTube descriptions —
   mentions on YouTube correlate more strongly with AI assistants recommending
   a site than any on-page change.
