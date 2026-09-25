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
   questions are searchable, reflow on a phone, and print properly.
2. **The exam runner follows NTA CBT conventions** — the same palette, timer and
   controls students already use in the real exam.
3. **Every question can carry a video solution**, recorded by a teacher.

---

## 2. Audiences

| Role | What they do |
|---|---|
| **Visitor** (signed out) | Browse the catalogue, read questions, sit a paper without saving |
| **Student** | Sit papers, save attempts, see analysis, discuss, report errors |
| **Teacher** | Everything a student does, plus write and record solutions |
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
│  Disclaimer · not affiliated with IIT Madras               │   footer
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
- **The exam runner is the one exception** — it hides the chrome and owns the
  viewport. Sitting a paper is a mode, not a page.

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
**Start / Re-attempt** and a printable-worksheet icon.

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

### 4.6 Printable worksheet — `/print/[setId]`

Paper laid out for A4, no app chrome, page breaks that never split a question.
This is how "save as PDF" works without a PDF library.

### 4.7 Auth — `/login`, `/auth/*`, `/account`

Email sign-in. Demo student and demo admin shown while demo logins are enabled.
Account page: display name and avatar only — **a user cannot change their own
role**.

### 4.8 Student dashboard — `/dashboard`

Signed-in home. Resume bar ("pick up where you left off"), recent attempts,
weakest topics ranked worst-first, papers not yet attempted.

### 4.9 Teacher — `/teacher/*` *(not built)*

Solution queue showing questions with no solution, ranked by how often they are
attempted and missed. Write a text solution, attach or record a video, submit
for approval.

### 4.10 Admin — `/admin/*`

Taxonomy editor (programmes, levels, subjects, exam types), paper import,
extraction review, reports queue, media cleanup.

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
