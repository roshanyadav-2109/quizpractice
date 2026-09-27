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
| Term (several sets) | `/pyq/maths-1/qualifier/may-2024` | only where a term had more than one set; otherwise it redirects to the paper |
| Paper | `/pyq/maths-1/quiz-1/16-feb-2025` | the sitting date, plus the set code when one day had several sets (`…/20-apr-2025-qdf2`) |
| Question | `/pyq/maths-1/quiz-1/16-feb-2025/q12-consider-relation-delivery-fee` | the question number, then a few words of its own prose |
| Course code | `/course/BSMA1001` | redirects to the subject |

Old addresses are redirected permanently: `/subject/<slug>?exam=…&year=…&term=…`
in `src/proxy.ts`, `/program/ds` in the programme page, and a question whose
words have changed to its current words (the number is what identifies it).
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

Questions are indexed only when they are worth a result of their own: the
first sitting of a repeated question (the others point to it with
`rel=canonical`), with at least 60 characters of text or code that is not just a
comprehension's shared stem. The rule lives in `src/lib/seo/question-text.ts`
and is mirrored by `public_question_index()` (migration 0030), which feeds the
sitemap — change them together, or the sitemap lists redirects.

## Machine-readable

| Address | What |
|---|---|
| `/robots.txt` | everything public open to every crawler, AI assistants named; private areas, the API and search results closed |
| `/sitemap.xml` | index of `/sitemaps/pages.xml`, `/sitemaps/papers.xml` and `/sitemaps/questions-N.xml` (100 sets each); real `lastmod` dates only |
| `/llms.txt`, `/llms-full.txt` | the site described for AI agents, generated from the catalogue |
| JSON-LD | Organization + WebSite on every page; CollectionPage + ItemList on hubs; Quiz/LearningResource with each Question's accepted answer on papers and questions; BreadcrumbList everywhere |
| `opengraph-image` | a card per subject, exam and paper for shared links |

## After adding papers

```bash
npm run cache:refresh                        # the site picks the new papers up
npm run seo:indexnow -- --since 2026-09-27   # Bing, Copilot and the rest crawl them within hours
```

`seo:indexnow` reads the live sitemaps; the key is the `.txt` file in `public/`.
Google does not use IndexNow — it reads the sitemap.

## One-time setup (owner)

1. **Google Search Console** — add the domain property
   `quizspace.unknowniitians.com` (DNS TXT record), or set
   `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` in Vercel and redeploy. Submit
   `https://quizspace.unknowniitians.com/sitemap.xml`. Under Settings, keep
   "Search generative AI features" on.
2. **Bing Webmaster Tools** — import the site from Search Console (or set
   `NEXT_PUBLIC_BING_SITE_VERIFICATION`), submit the sitemap, then run
   `npm run seo:indexnow` once to submit every page.
3. **Brave Search** — submit the home page and the exam hubs at
   search.brave.com/submit-url (Claude's web search reads Brave's index).
4. Link the site from the Unknown IITians website and YouTube descriptions —
   mentions on YouTube correlate more strongly with AI assistants recommending
   a site than any on-page change.
