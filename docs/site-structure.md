# QuizPractice — site structure and wireframe brief

A brief for producing wireframes. It describes **what every page contains and
why**, not how it should look. Hand it to a designer or a model and ask for
wireframes; nothing here prescribes colour, typeface or ornament.

---

## 1. What the product is

An exam-practice site for the **IIT Madras BS degree**. Students sit previous
question papers under real exam conditions, get marked, and see where they lost
time and marks.

Scale today: **187 papers, 10,134 questions, 27,069 options, 76 subjects across
4 programmes.**

Three things make it different from a PDF archive, and the wireframes should
make all three visible:

1. **Questions are structured data, not pictures.** A relation renders as a real
   table, SQL as syntax-highlighted code, an ER diagram as a diagram. So
   questions are searchable and reflow on a phone.
2. **The exam runner follows NTA CBT conventions** — the same palette, timer and
   controls students already use in the real exam.
3. **Every question can carry an explanation and a video**, written and
   recorded by a teacher — once for every copy of the same question.

---

## 2. Audiences

| Role | What they do |
|---|---|
| **Visitor** (signed out) | Browse the catalogue, read questions, sit a paper without saving |
| **Student** | Sit papers, save attempts, see analysis, discuss, report errors |
| **Teacher** | Everything a student does, plus write and record explanations for their assigned subjects |
| **Admin** | Everything, plus taxonomy, imports, moderation queues |

---

## 3. Page shell

**Top navigation, full-width content, no sidebar.** Location is communicated by
a breadcrumb, not by a persistent rail.

```
┌────────────────────────────────────────────────────────────┐
│  ● QuizPractice    Papers   Search   Dashboard      [ RS ] │   56px, sticky
├────────────────────────────────────────────────────────────┤
│  Data Science › Diploma in Programming › DBMS              │   breadcrumb
│                                                            │
│  Database Management Systems                     BSCS2001  │   h1 + identifier
│  Exam  [All] [Quiz 1] [Quiz 2] [End Term] [OPPE]           │   filter row
│  Year  [All] [2026] [2025]                                 │
│                                                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │   card grid
│  │ …        │ │ …        │ │ …        │ │ …        │       │   4 / 3 / 2 / 1
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
├────────────────────────────────────────────────────────────┤
│  Privacy · Terms                                           │   footer
└────────────────────────────────────────────────────────────┘
```

**Rules that apply everywhere:**

- One content measure: **max 1360px**, 20px gutters on mobile, 32px from `sm`.
- Card grid steps **4 → 3 → 2 → 1** columns. Cards collapse rather than shrink,
  so a subject name never has to truncate.
- Every inner page has a breadcrumb. Without a sidebar it is the only "where am
  I" signal.
- Filter state lives in the **URL** (`?exam=quiz-1&year=2026`) so filtered views
  are linkable and the back button works.
- **The exam runner and the teacher's studio are the exceptions** — they hide
  the header and footer and own the viewport. Sitting a paper, or recording an
  explanation, is a mode, not a page.

---

## 4. Page inventory

### 4.1 Home — `/`

The catalogue index. Not a marketing page; a student should be inside a paper in
two clicks.

1. **Banner.** Headline, one line of positioning, then a **carousel of exam
   types**. Each slide: exam name, duration, one-line description, and its four
   most recent sittings as direct links into the runner, plus "All <exam>
   papers". Auto-advances every 6s; pauses on hover and focus; arrows and dots;
   honours `prefers-reduced-motion`. Exams with nothing published get no slide.
2. **Subject filter** — free-text box matching name, course code and aliases
   (students type "Maths1" long before "Mathematics for Data Science I"). A
   search spans every branch, because you rarely know which branch a code is in.
3. **Programme tabs** — Data Science · Electronic Systems · Management ·
   Aeronautics.
4. **Subject grid**, grouped by level (Foundation, Diploma, BSc, BS). Each card:
   subject name, course code, a marker if it has programming questions.
   **Subjects with no papers are not listed at all** — their pages still resolve,
   so links and search keep working.

> Deliberately absent: totals, question counts, paper counts, "N subjects" —
> anywhere.

### 4.2 Subject — `/subject/[slug]`

Breadcrumb → title + course code → filters (Exam, Year) → papers grouped by exam
type, as a card grid.

**Paper card:** sitting date, set code when a paper has several sets, marks,
duration, your best attempt (score + percentage, linking to its analysis), then
**Start / Re-attempt**.

Empty state when filters match nothing.

### 4.3 Exam runner — `/practice/[setId]`

The core screen. Chrome hidden; two panes.

```
┌───────────────┬────────────────────────────────────────────┐
│ Quiz 1        │ Q01  [3 marks]  MCQ                        │
│ DBMS          │                                            │
│ SET     1563B │ Consider the relation Delivery_Fee:        │
│ DATE   16 Jul │ ┌────────────────────────────────────────┐ │
│ MARKS       7 │ │ OrderID  Item      Fee                 │ │ ← real table,
│ ┌────┬──────┐ │ │ O1       Laptop     70                 │ │   not an image
│ │Exam│Learn │ │ │ O5       Cable    NULL                 │ │
│ └────┴──────┘ │ └────────────────────────────────────────┘ │
│ TIME LEFT     │ SELECT AVG(Fee) FROM Delivery_Fee;         │ ← highlighted
│ 1:59:56  ⏸ ↺  │                                            │
│               │ (A) 30.00   (B) 35.00                      │
│ QUESTIONS 0/2 │ (C) 40.00   (D) 42.00                      │
│ ┌─┬─┬─┬─┬─┬─┐ │                                            │
│ │1│2│3│4│5│6│ │ [Save & Next] [Mark for Review & Next]     │
│ └─┴─┴─┴─┴─┴─┘ │ [Clear Response]  [Report a problem]       │
│ ■ Answered    │                                            │
│ □ Not visited │                                            │
│ ■ Not answered│                                            │
│ ● Marked      │                                            │
│ [Submit paper]│                                            │
└───────────────┴────────────────────────────────────────────┘
```

**NTA conventions — do not simplify these; students are trained on them:**

- Five palette states: green square = answered · orange square = visited but
  unanswered · grey square = not visited · violet circle = marked for review ·
  violet circle with green dot = answered and marked.
- Controls: **Save & Next**, **Mark for Review & Next**, **Clear Response**.
- Timer counts down, can be paused, and stops when the tab is hidden.
- **Exam mode never loads the answer key** — it is not in the page payload while
  a student is working. **Learning mode** shows answers and solutions inline.
- Per-question dwell time is recorded; it drives the analysis.

### 4.4 Result — `/result/[attemptId]`

Score, percentage, time taken. Then per-question rows: your answer, the correct
answer, marks awarded, time spent, and a link into the solution.

**Attempt taxonomy** — each answer is classified, and this is what makes the page
worth reading: `perfect` · `slow_correct` · `rushed` · `sunk` (long and wrong) ·
`incorrect` · `abandoned` · `skipped` · `unmarked`.

Topic breakdown showing weakest topics first. Peer comparison where at least
three people have attempted the same set.

### 4.5 Search — `/search`

Full-text across question bodies, **including text inside tables and options** —
searching "Bengaluru" finds it inside a relation cell. Filters by subject and
exam type. Results show the matching question with its paper and a link in.

### 4.6 Auth — `/login`, `/auth/*`

Google sign-in, from a dialog available on every page. Demo student and demo
admin shown while demo logins are enabled. Once signed in, the photo in the
header opens the account menu: Dashboard, **Teach** for teachers, **Admin** for
staff, and Sign out — **a user cannot change their own role**.

### 4.7 Student dashboard — `/dashboard`

Signed-in home. Resume bar ("pick up where you left off"), recent attempts,
weakest topics ranked worst-first, papers not yet attempted.

### 4.8 Teacher — `/teach`, `/teach/s/[subject]`, `/teach/q/[questionId]`

Only for teachers (and admins). An admin assigns each teacher **branch+subject
combos** — several subjects in a branch, several branches. A subject is only
ever matched inside the branch it belongs to; the database refuses anything
else, so a teacher never sees a question outside their combos.

- **Desk — `/teach`.** One card per combo, grouped by branch:
  `Data Science › Foundation › English I`, questions, unique questions once
  duplicates are collapsed, and how many are explained, have a video, or wait in
  review, with **Open queue** and **Continue** (the next question to do). Below,
  "My recent explanations" with their status and any review note. With no
  combos: "An admin has not assigned you subjects yet".
- **Queue — `/teach/s/[subject]`.** Filter chips (To do, Needs video, In review,
  Published, Mine, All), a paper filter, 50 rows a page. Each row: question
  number, exam and date, set, type and marks, a snippet, a **+N copies** badge
  (the same question with the same answer in other sets, terms or years —
  explained once, shown on all of them), who is working on it, and its status.
  Copies whose options are shuffled still count, unless an option points at
  another by letter or position ("Both A and B", "None of the above"); then
  the order has to match too.
  A subject outside the teacher's combos answers 403.
- **Help — `/teach/help`.** Recording tips, and the YouTube Studio steps for
  uploading a recording by hand.
- **Studio — `/teach/q/[questionId]`.** Full viewport, no header or footer, like
  the exam runner.
  - Top bar: back to the queue, who is working on the question, save state.
  - Reference: the whole question as students see it — text, code, tables,
    maths, figures, every option — with the **correct answer marked**, the
    numeric answer with its tolerance, and the marks. "Also shows on" lists every
    copy the explanation will reach. When the copies list the options in a
    different order, a notice asks the teacher to name options by their content,
    never by letter.
  - Write: an explanation built from blocks (text with inline maths, equation,
    code, table, a page of the board as a drawing), with a live preview.
  - Board & record: a whiteboard (pen, highlighter, eraser, colours, thickness,
    shapes, undo/redo, clear page, several pages, laser pointer, stylus pressure)
    with the question card beside it, recorded with the microphone and an
    optional webcam bubble. Review the take, re-record or download it.
  - Video: paste the YouTube link of the upload (checked before it is saved), or
    upload to YouTube from the page once the channel's API access is approved.
  - **Save draft**, then **Submit** for review — or **Publish** for a teacher an
    admin trusts to publish without review.

### 4.9 Admin — `/admin/*`

Taxonomy editor (programmes, levels, subjects, exam types), paper import,
extraction review, reports queue, media cleanup, plus:

- **Educators — `/admin/educators`.** Find a person by name or email and make
  them a teacher, contributor or student. Each teacher's card shows their combo
  chips (`Data Science › Foundation › English I ×`), an **Add combo** form that
  picks a branch first and then offers only that branch's subjects, and a
  "Publish without review" switch. The YouTube panel connects the channel for
  one-click uploads.
- **Explanations — `/admin/solutions`.** The review queue: In review (default),
  Drafts, Approved, Rejected, All, filtered by subject and teacher. Each card
  shows the question, how many copies the explanation reaches, the explanation
  and its video, and Approve, Reject with a note, Unpublish, Delete.
- **Duplicates — `/admin/duplicates`.** How questions are grouped as copies:
  repeats inside one set (probably import errors), the largest groups, and groups
  that span subjects, each with Allow, Block and Clear.

---

## 5. Content blocks

Every question body and every option is an **array of typed blocks**. Wireframes
need to show that each of these renders natively, because this is the product:

| Block | Renders as |
|---|---|
| `text` | Markdown paragraph |
| `math` | LaTeX, inline or display |
| `table` | Real table, scrolls horizontally on overflow |
| `relation` | Database relation — column types, primary-key marker, NULLs distinct from 0 |
| `code` | Syntax-highlighted listing with line numbers |
| `er` | Entity-relationship diagram |
| `graph` | Node-and-edge graph |
| `chart` | Plotted chart |
| `image` | The escape hatch — only for genuinely spatial content |

A teacher's explanation is built from the same blocks — text, maths, code,
tables — plus `sketch`: a page of the studio whiteboard, kept as vector strokes
and drawn as an inline drawing on a white card.

---

## 6. States every page needs

- **Empty** — no papers for these filters, no attempts yet, no solutions yet
- **Signed out** — everything readable; attempts prompt sign-in to save
- **Loading** — pages are server-rendered, so this is mostly navigation feedback
- **Error** — a failed query must read as a failure, never as zero content
- **Long content** — a 42-question paper, a subject name that is 60 characters
- **Dark and light** — both are first-class

---

## 7. Responsive

| Width | Behaviour |
|---|---|
| `< 640px` | Single column. Exam runner palette becomes a collapsible drawer. |
| `640–1024px` | Two-column grids. |
| `1024–1280px` | Three columns. Runner splits into its two panes. |
| `> 1280px` | Four columns, capped at 1360px. |

Wide content — tables, code, diagrams — scrolls **inside its own container**.
The page body never scrolls horizontally.

---

## 8. What to produce

Wireframes for: **Home**, **Subject**, **Exam runner** (exam and learning
modes), **Result**, **Search**, **Student dashboard**. Greyscale, no brand, no
ornament. Show the empty state and the mobile layout for each.
