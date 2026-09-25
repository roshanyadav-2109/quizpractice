# QuizPractice — IITM BS question paper practice

A practice platform for previous IIT Madras BS degree question papers.

Two ideas drive the whole design:

**Nothing about the taxonomy is hardcoded.** Branches, levels, subjects, exam
types, papers and questions are all rows. When IIT Madras adds a programme or
renames a course, that is a form submission in `/admin/taxonomy`, not a code
change and a deploy.

**Questions are structured content, not pictures.** A question body is an
ordered array of typed blocks. A database relation is columns and rows with data
types and keys; a truth table is a table; an equation is LaTeX; an ER diagram is
entities and relationships. The frontend draws all of it, so questions are
searchable to the last table cell, readable on a phone, correct in dark mode,
and fixable without redrawing anything. Images are the deliberate escape hatch
for figures whose meaning is spatial — circuit diagrams, waveforms, geometry —
and they carry required alt text so even those stay searchable.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS v4, theme tokens with full light/dark support |
| Type | Inter for text, JetBrains Mono for code and data |
| Database | Supabase (Postgres) with row level security |
| Media | Cloudinary — `public_id` stored, URLs built at render time |
| Maths | KaTeX · Code: prism-react-renderer · Diagrams: hand-drawn SVG |
| Transcription | Claude (`claude-opus-5`) vision, output validated against the block schema |

---

## Getting started

```bash
npm install
cp .env.example .env.local     # then fill it in
```

### 1. Supabase

Create a project, then apply the migrations in order. Either paste each file
from `supabase/migrations/` into the SQL editor, or use the CLI:

```bash
npx supabase link --project-ref <your-ref>
npx supabase db push
```

The migrations create the schema, the search and stats functions, every RLS
policy, and a starting taxonomy: 4 branches, 14 levels, 76 subjects and 7 exam
types, taken from a live audit of the IITM course catalogue.

Copy the project URL and both API keys into `.env.local`. The service-role key
bypasses RLS — it is used only by the importer and must never reach a browser.

### 2. Demo accounts

```bash
npm run demo:users
```

Creates two password accounts so you can sign in without waiting on email:

| Account | Email | Password | Role |
|---|---|---|---|
| Demo Student | `demo@example.com` | `demo1234` | student |
| Demo Admin | `admin@example.com` | `admin1234` | admin |

They appear as one-click buttons on `/login`. Safe to re-run — it resets the
password and role rather than duplicating the accounts.

**Before the site is public**: delete both accounts and set
`NEXT_PUBLIC_DEMO_LOGINS=false`, which removes the panel from the sign-in page.

### 3. Make yourself an admin

Sign in once at `/login` so a profile row exists, then in the SQL editor:

```sql
update public.profiles set role = 'admin' where id = (
  select id from auth.users where email = 'you@example.com'
);
```

Four roles, each with a different home:

| Role | Home | Can do |
|---|---|---|
| `student` | `/dashboard` — top navbar | Practise papers, own their attempts |
| `teacher` | (sidebar shell, not built yet) | Author solutions and upload solution video for any question |
| `contributor` | `/admin` | Import and edit papers and questions |
| `admin` | `/admin` | Everything, including roles |

A teacher is deliberately not a content editor: they write solutions, not
taxonomy or papers. Widening that later is a policy change; starting wide and
narrowing later is a migration nobody performs.

The `role` column is not grantable to `authenticated`, so promotion is
deliberately a service-role operation — a signed-in user cannot promote
themselves.

### 4. Cloudinary

Create a product environment and copy the cloud name, API key and secret. Only
the cloud name is public. Uploads are signed server-side, so the secret never
reaches the browser.

### 5. Load a paper and run it

```bash
npm run paper:validate -- schema/example-paper.json
npm run paper:import   -- schema/example-paper.json
npm run dev
```

---

## The content model

`schema/question-paper.schema.json` is the canonical, language-neutral contract.
`src/lib/blocks/schema.ts` is the runtime Zod mirror of it, used by the
importer, the admin editor and the extraction pipeline alike.

Nine block types cover essentially every IITM question:

| Block | Carries | Typically used by |
|---|---|---|
| `text` | Markdown with inline `$LaTeX$` | everything |
| `math` | display-mode LaTeX | Maths 1/2, Statistics |
| `table` | columns, rows, alignment | truth tables, K-maps, data sets |
| `relation` | name, typed columns, keys, rows | DBMS |
| `code` | language, source, highlighted lines | Python, SQL, C, Java |
| `er` | entities, attributes, relationships | DBMS ER questions |
| `graph` | nodes, edges, weights, layout | PDSA, Algorithmic Thinking |
| `chart` | series, categories, axis labels | Statistics, BDM, Business Analytics |
| `image` | Cloudinary reference + required alt | circuits, waveforms, geometry |

Options are block arrays too, because IITM routinely asks "which of these ER
diagrams is correct" or gives SQL snippets as choices.

Every structured block may also carry a `fallback_image`, so a paper can ship
with a figure as a picture today and be upgraded to structure later without
re-importing anything.

---

## Getting content in

### By hand

Write JSON against the schema, validate it, import it:

```bash
npm run paper:validate -- papers/dbms-quiz1.json
npm run paper:import   -- papers/dbms-quiz1.json --draft
```

Or paste it into `/admin/import`, which validates and previews before
committing.

### From scans

```bash
npm run paper:extract -- scans/page1.png scans/page2.png \
  --subject dbms --exam quiz-1 --date 2026-07-16 --set 1563 \
  --out papers/dbms-quiz1-1563.json
```

The extractor sends the JSON Schema itself as the contract (cached across pages,
so bulk runs stay affordable), asks for a confidence score per question, and
validates the result against the same Zod schema the importer uses. Nothing is
written to the database.

**Review before publishing.** Transcription on real papers lands around 85–90%
correct — excellent for throughput, not publishable unreviewed. Import as
`--draft`, work through `/admin/review` lowest-confidence-first, then publish.
A wrong answer key in a practice bank destroys trust faster than missing content
does.

Re-importing the same subject + exam + date + set replaces that set's questions
rather than duplicating them, so fixing a paper and importing again is safe.

### From official answer-key PDFs

The IITM answer-key PDFs carry real text, so they need no transcription: the
questions, options and answer key (the green options) are read directly, and
figures are cut from the page. `scripts/answer-keys/` takes a sheet of Drive
links through to imported papers, one set per subject section, repeats removed.
Its README has the steps.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run check` | Typecheck, unit tests, and migrations against a real Postgres |
| `npm run test` | Marking-logic unit tests |
| `npm run db:validate` | Applies every migration to an in-process Postgres (PGlite) and checks the objects the app depends on |
| `npm run paper:validate -- <file>` | Validates a paper JSON and reports its block mix |
| `npm run paper:import -- <file...>` | Imports papers. `--upload` uploads images with a `source_url`, `--draft` withholds publishing |
| `npm run paper:extract -- <image...>` | Transcribes scans to block JSON |
| `npm run images:convert -- <manifest>` | Turns a list of question images into block JSON. Caches successes, so a re-run after a failure is cheap |
| `npm run bank:migrate -- <config>` | Turns an exported question bank into paper JSON. `--manifest` lists the images to convert first |
| `npm run icons:cut -- <sheet.png> <n>` | Cuts generated icon sheet `n` into `public/art/` and updates the icon manifest. Sheets and prompts: `docs/artwork-needed.md` |
| `npm run media:orphans` | Lists unreferenced Cloudinary assets. `--delete` removes them |
| `npm run demo:users` | Creates or resets the demo student and admin accounts |
| `npm run db:push` | Applies the migrations to a hosted Supabase project via the Management API (needs `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF`; no Docker or database password) |

`npm run db:validate` is worth knowing about: it applies the migrations to a
real Postgres compiled to WebAssembly, so SQL errors surface locally instead of
in the Supabase dashboard. No Docker required.

---

## Bringing an existing question bank across

Question banks tend to store their content as pictures — the stem, the table,
often the options too. That is the thing this app is built not to do, so
migration is mostly a conversion problem: pictures in, blocks out.

The route in is three steps, none of which touch the database until you have
read the output.

**1. Describe your columns.** Copy `migration/migration.config.example.json`
and point the left-hand names at whatever your export calls things. Export
three tables as CSV or JSON — papers, questions, options. Missing columns are
tolerated and reported rather than guessed at.

**2. Convert the images.**

```bash
npm run bank:migrate -- migration/migration.config.json --manifest migration/images.json
npm run images:convert -- migration/images.json --out migration/image-blocks.json
```

The first command lists every distinct image the export references — one entry
per image, since a figure shared by four questions only needs converting once.
The second reads each one and returns blocks: a table becomes a `table`, a
schema diagram becomes an `er`, a query becomes `code`. Anything genuinely
spatial stays an image. Results are cached by source, so a run interrupted at
image 900 resumes at image 900. Needs `ANTHROPIC_API_KEY`.

**3. Write the papers.**

```bash
npm run bank:migrate -- migration/migration.config.json --out papers/
npm run paper:validate -- papers/<one>.json
npm run paper:import   -- papers/*.json --draft
```

The migrator reports how many questions came out of images, how many are still
pictures, how many landed below 0.8 confidence, and how many have no answer key
— that last count matters, because a question with no key marks every attempt
wrong. `--draft` withholds publishing, so you can read a paper on the site
before students can.

---

## How it is put together

```
src/
  app/
    page.tsx                  home — branches and live counts
    browse/                   Branch → Level → Subject → Exam → Year
    subject/[slug]/           papers for one subject
    practice/[setId]/         the exam runner
    result/[attemptId]/       review of a saved attempt
    print/[setId]/            printable worksheet, optional answer key
    search/                   full-text search across question content
    admin/                    taxonomy, papers, question editor, queues
    api/
      attempts/               marks a submission server-side
      import/                 admin JSON import
      cloudinary/sign/        signed direct upload
  components/
    blocks/                   one renderer per block type
    exam/                     runner, palette, timer, answer inputs
    question/                 solutions, discussion, reports
  lib/
    blocks/schema.ts          the block model (Zod)
    scoring.ts                marking rules — pure and unit tested
    import-paper.ts           JSON → database
    extract.ts                scan → JSON
    queries.ts                every read the public site makes
  proxy.ts                    session refresh + /admin gate
supabase/migrations/          schema, functions, RLS, seed taxonomy
schema/                       the canonical JSON Schema and an example paper
```

### The visual system

The product is modelled on how Indian competitive-exam platforms actually
work, because that is the interface students are already trained on.

**The exam runner follows NTA computer-based-test conventions.** The question
palette carries five states, not three, and shape encodes meaning alongside
colour: green square answered, orange square seen-but-unanswered, grey square
never opened, violet circle marked for review, violet circle with a green dot
answered-and-marked. The action row reads Save & Next / Mark for Review & Next /
Clear Response. Answers autosave regardless — but those labels are what a
student's hands expect, and an unfamiliar exam interface costs them time.

**The home page is an index, not a landing page.** No hero, no feature grid: a
filter box, branch tabs, and every subject with its paper counts. The filter
matches aliases, so typing `Maths1` — the spelling that circulates on real
papers — finds Mathematics for Data Science I.

**Inter** sets everything that is words — interface chrome and question content
alike — at a 14px base.

**JetBrains Mono** is kept for everything that has to line up or stay literal:
code listings, marks, set codes, question numbers and the timer. Marks print as
`[3 marks]`, the way a real paper does. A proportional face would break code
alignment and make the timer jitter as its digits change.

Question content still reads as distinct from the app around it, but through
size and leading rather than a second family: `.paper` is a step larger and
looser than the interface, and prose is held to a 68-character measure while
tables and diagrams keep the full column.

Structure is carried by hairline rules and alignment rather than by giving every
block a rounded, shadowed card — that is what keeps the density readable instead
of noisy. Radii stay at 3px, the base size is 14px, and the answer option marker
is an OMR bubble, which is also the logo.

Colour is a cobalt accent on a cool off-white (or near-black) ground, with green
and red reserved as semantics — correct and incorrect — so a marked answer never
reads as a link. Chart series use a colourblind-validated categorical palette
assigned in fixed order.

Icons are [Phosphor](https://phosphoricons.com), imported from its SSR entry
point and re-exported through `src/components/ui/icons.tsx` so the set stays
consistent and swappable in one place.

### Post-attempt analysis

A score says what happened; the analysis says why. Every answer is classified by
crossing correctness with pace, because a question guessed in nine seconds and
one fought over for four minutes both read as "wrong" and need opposite
responses:

| Class | Meaning |
|---|---|
| Correct, good pace | Right, within the expected time |
| Correct, but slow | Right, at a cost worth knowing about |
| Wrong — answered too fast | Almost certainly a guess |
| Wrong — after a long time | Time sunk with nothing to show |
| Left blank after spending time | The quiet killer in a timed paper |

Expected time comes from peer data once at least three people have attempted a
question, and falls back to a minute per mark otherwise. **Accuracy is reported
separately from percentage** — correct as a share of what was *attempted*, not
of the whole paper — and the topic breakdown lists weakest first, because
"revise indexing" is a plan and "you scored 6/10" is not.

Peer comparison runs through `SECURITY DEFINER` functions that return only
aggregates and withhold everything below three attempts: under that, an average
is noise and a rank identifies someone.

### Marking

Deliberately conservative, because reporting a wrong score is worse than
reporting none:

- **mcq** — exact option match; negative marking applied only when configured
- **msq** — exact set match; no partial credit is invented
- **numerical** — within `answer_tolerance`, inclusive
- **subjective / programming** — never auto-marked, and excluded from the
  denominator rather than counted wrong
- unanswered is zero, never negative

Marking happens on the server against the answer key in the database. In exam
mode the client is never sent `is_correct` at all — the answer key simply is not
in the page payload while a student is working.

### Access rules

Published content is world-readable. Every content write requires
`admin` or `contributor`. A student can only ever read and write their own
attempts. The `/admin` gate is enforced three times over — in `src/proxy.ts`,
again in the admin layout, and finally by RLS — because the admin API routes use
the service-role key, which answers to none of them.

### Signing in

Email and password, or a magic link. Supabase's built-in email is
rate-limited; configure SMTP or enable an OAuth provider before real traffic.
Practising works fully signed-out — an attempt is marked and returned, it is just
not saved.

---

## Notes for later

- `supabase gen types typescript --linked > src/types/database.ts` will give
  fully generated database types once the project is linked; `src/types/db.ts`
  holds the hand-written equivalents until then.
- Video solutions are stored as URLs (YouTube, Vimeo, Cloudflare Stream, Bunny),
  not uploaded to Cloudinary — video burns Cloudinary credits fast.
- The seeded taxonomy is a starting point. IIT Madras revises its curriculum
  regularly, so verify course codes and level placement against the current
  catalogue and correct them in `/admin/taxonomy` rather than editing the
  migration.

---

This is an independent study resource. It is not affiliated with, or endorsed
by, IIT Madras.
