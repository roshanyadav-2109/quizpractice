/**
 * Runs every migration in supabase/migrations against an in-process Postgres
 * (PGlite) so SQL errors surface here rather than in the Supabase dashboard.
 *
 * Supabase-specific objects that PGlite does not have — the auth schema, the
 * anon/authenticated roles, auth.uid() — are shimmed below. Everything else is
 * real Postgres, so syntax, types, constraints, triggers, policies and views
 * are genuinely checked.
 *
 *   npm run db:validate
 */
import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

const SUPABASE_SHIM = `
  create schema if not exists auth;

  create table if not exists auth.users (
    id                    uuid primary key default gen_random_uuid(),
    email                 text,
    raw_user_meta_data    jsonb default '{}'::jsonb,
    email_confirmed_at    timestamptz
  );

  -- In real Supabase this reads the JWT claim. Here it returns a value we can
  -- set per-test with set_config('request.jwt.claim.sub', ...).
  create or replace function auth.uid()
  returns uuid
  language sql
  stable
  as $shim$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $shim$;

  do $shim$
  begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
      create role anon nologin;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
      create role authenticated nologin;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then
      create role service_role nologin bypassrls;
    end if;
  end
  $shim$;

  -- As in Supabase, the API roles may call auth.uid(); the policy checks below
  -- run as those roles.
  grant usage on schema auth to anon, authenticated, service_role;
`

async function main() {
  const db = new PGlite()
  await db.exec(SUPABASE_SHIM)

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  let failed = false

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    try {
      await db.exec(sql)
      console.log(`  ok    ${file}`)
    } catch (error) {
      failed = true
      console.error(`  FAIL  ${file}`)
      console.error(`        ${(error as Error).message}`)
    }
  }

  if (failed) {
    console.error('\nMigrations did not apply cleanly.')
    process.exit(1)
  }

  // Sanity-check the objects the app depends on actually exist and behave.
  const checks: Array<[string, string]> = [
    ['programs seeded', `select count(*)::int as n from public.programs`],
    ['levels seeded', `select count(*)::int as n from public.levels`],
    ['subjects seeded', `select count(*)::int as n from public.subjects`],
    ['exam types seeded', `select count(*)::int as n from public.exam_types`],
    [
      'every subject resolves to a program',
      `select count(*)::int as n
         from public.subjects s
         join public.levels l on l.id = s.level_id
         join public.programs p on p.id = l.program_id`,
    ],
    [
      'jsonb_deep_text walks nested blocks',
      `select public.jsonb_deep_text(
         '[{"type":"text","md":"hello"},
           {"type":"relation","name":"Fee","rows":[[101,"Chennai"]]}]'::jsonb
       ) as n`,
    ],
    ['program_stats view', `select count(*)::int as n from public.program_stats`],
    ['subject_stats view', `select count(*)::int as n from public.subject_stats`],
    ['orphan_media view', `select count(*)::int as n from public.orphan_media`],
    [
      'search_questions callable',
      `select count(*)::int as n from public.search_questions('database')`,
    ],
    [
      'rls enabled on every content table',
      `select count(*)::int as n
         from pg_tables
        where schemaname = 'public' and not rowsecurity`,
    ],
  ]

  console.log('')
  for (const [label, sql] of checks) {
    try {
      const res = await db.query<{ n: unknown }>(sql)
      console.log(`  ok    ${label} -> ${JSON.stringify(res.rows[0]?.n)}`)
    } catch (error) {
      failed = true
      console.error(`  FAIL  ${label}: ${(error as Error).message}`)
    }
  }

  // Exercise the search trigger end to end: insert a paper, set, question and
  // options, then confirm the question is findable by a word buried in a table
  // cell rather than in the prose.
  try {
    await db.exec(`
      insert into public.question_papers (id, subject_id, exam_type_id, session_date, status)
      select '11111111-1111-1111-1111-111111111111',
             (select id from public.subjects where slug = 'dbms'),
             (select id from public.exam_types where slug = 'quiz-1'),
             date '2026-07-16', 'published';

      insert into public.question_sets (id, paper_id, set_code)
      values ('22222222-2222-2222-2222-222222222222',
              '11111111-1111-1111-1111-111111111111', '1563');

      insert into public.questions (id, set_id, number, type, body, marks)
      values ('33333333-3333-3333-3333-333333333333',
              '22222222-2222-2222-2222-222222222222', 1, 'mcq',
              '[{"type":"relation","name":"Delivery_Fee",
                 "columns":[{"name":"city"}],
                 "rows":[["Bengaluru"]]}]'::jsonb, 1);

      insert into public.question_options (question_id, label, content, is_correct)
      values ('33333333-3333-3333-3333-333333333333', 'A',
              '[{"type":"text","md":"Query Optimizer"}]'::jsonb, true);
    `)

    const hit = await db.query<{ n: number }>(
      `select count(*)::int as n from public.search_questions('Bengaluru')`,
    )
    const optionHit = await db.query<{ n: number }>(
      `select count(*)::int as n from public.search_questions('optimizer')`,
    )

    // Block type names must NOT be indexed, or "relation" and "table" would
    // match every question that happens to contain one.
    const noiseHit = await db.query<{ n: number }>(
      `select count(*)::int as n from public.search_questions('relation')`,
    )

    // The catalogue counts: the fixture set holds one published question.
    const counts = await db.query<{ n: number }>(
      `select question_count as n from public.published_set_counts()
        where set_id = '22222222-2222-2222-2222-222222222222'`,
    )
    if (counts.rows[0]?.n === 1) {
      console.log('  ok    published_set_counts counts the fixture set')
    } else {
      failed = true
      console.error(`  FAIL  published_set_counts: got ${JSON.stringify(counts.rows[0])}, want 1`)
    }

    if (hit.rows[0].n === 1 && optionHit.rows[0].n === 1 && noiseHit.rows[0].n === 0) {
      console.log('  ok    search finds words inside table cells and options')
      console.log('  ok    block type names are excluded from the search index')
    } else {
      failed = true
      console.error(
        `  FAIL  search trigger: table-cell hit=${hit.rows[0].n} (want 1), ` +
          `option hit=${optionHit.rows[0].n} (want 1), ` +
          `type-name noise=${noiseHit.rows[0].n} (want 0)`,
      )
    }
  } catch (error) {
    failed = true
    console.error(`  FAIL  search round trip: ${(error as Error).message}`)
  }

  try {
    if (!(await educatorChecks(db))) failed = true
  } catch (error) {
    failed = true
    console.error(`  FAIL  educator checks stopped: ${(error as Error).message}`)
  }

  await db.close()

  if (failed) process.exit(1)
  console.log('\nAll migrations apply cleanly.')
}

// ---------------------------------------------------------------------------
// Educators (0024) and shared explanations (0025)
//
// Fingerprints on real-shaped questions, explanations following their copies,
// and the permission model — mostly the refusals, run as the roles the API
// uses. Returns false when anything is off.
// ---------------------------------------------------------------------------

const ID = {
  admin: 'a0000000-0000-4000-8000-000000000001',
  teacher: 'a0000000-0000-4000-8000-000000000002', // DS › DBMS
  pyTeacher: 'a0000000-0000-4000-8000-000000000003', // DS › Python only
  colleague: 'a0000000-0000-4000-8000-000000000004', // DS › DBMS
  trusted: 'a0000000-0000-4000-8000-000000000005', // DS › DBMS, publishes without review
  student: 'a0000000-0000-4000-8000-000000000006',
  paper: 'b0000000-0000-4000-8000-000000000001', // DBMS, published
  pyPaper: 'b0000000-0000-4000-8000-000000000002', // Python, published
  draftPaper: 'b0000000-0000-4000-8000-000000000003', // DBMS, draft
  setA: 'c0000000-0000-4000-8000-00000000000a',
  setB: 'c0000000-0000-4000-8000-00000000000b',
  setC: 'c0000000-0000-4000-8000-00000000000c',
  setD: 'c0000000-0000-4000-8000-00000000000d',
  setE: 'c0000000-0000-4000-8000-00000000000e',
  setPy: 'c0000000-0000-4000-8000-0000000000f1',
  setDraft: 'c0000000-0000-4000-8000-0000000000f2',
  qA: 'd0000000-0000-4000-8000-000000000001', // the anchor
  qB: 'd0000000-0000-4000-8000-000000000002', // same question, 1/2/3/4 labels
  qC: 'd0000000-0000-4000-8000-000000000003', // same question, options shuffled
  qE: 'd0000000-0000-4000-8000-000000000004', // same body, other answer
  qR1: 'd0000000-0000-4000-8000-000000000011', // options that name other options
  qR2: 'd0000000-0000-4000-8000-000000000012',
  qR3: 'd0000000-0000-4000-8000-000000000013',
  qOpen: 'd0000000-0000-4000-8000-000000000021', // subjective, no answer
  qBoiler: 'd0000000-0000-4000-8000-000000000022',
  qPrev: 'd0000000-0000-4000-8000-000000000023', // leans on the previous question
  qN1: 'd0000000-0000-4000-8000-000000000031', // 2.50
  qN2: 'd0000000-0000-4000-8000-000000000032', // 2.5
  qD1: 'd0000000-0000-4000-8000-000000000041', // twice in one set
  qD2: 'd0000000-0000-4000-8000-000000000042',
  qPy: 'd0000000-0000-4000-8000-000000000051',
  qDraft: 'd0000000-0000-4000-8000-000000000061',
  qA2: 'd0000000-0000-4000-8000-000000000071', // qA imported again
  qK1: 'd0000000-0000-4000-8000-000000000081', // two options equal after clean-up
  qK2: 'd0000000-0000-4000-8000-000000000082', // the same, the other one marked
  qK3: 'd0000000-0000-4000-8000-000000000083', // qK1 with a looser body
  qNe: 'd0000000-0000-4000-8000-000000000091', // a != b
  qEq: 'd0000000-0000-4000-8000-000000000092', // a = b
  sol: 'e0000000-0000-4000-8000-000000000001',
}

/** A jsonb literal for SQL text. */
function jsonb(value: unknown): string {
  return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`
}

function text(md: string) {
  return [{ type: 'text', md }]
}

/** One multiple-choice question and its options, as the importer writes them. */
function mcq(id: string, setId: string, number: number, body: string, options: Array<[string, string, boolean]>) {
  return `
    insert into public.questions (id, set_id, number, type, body) values ('${id}', '${setId}', ${number}, 'mcq', ${jsonb(text(body))});
    insert into public.question_options (question_id, label, content, is_correct, sort_order) values
      ${options.map(([label, md, correct], index) => `('${id}', '${label}', ${jsonb(text(md))}, ${correct}, ${index})`).join(',\n      ')};`
}

async function educatorChecks(db: PGlite): Promise<boolean> {
  let ok = true
  const pass = (label: string) => console.log(`  ok    ${label}`)
  const flag = (label: string, detail: string) => {
    ok = false
    console.error(`  FAIL  ${label}: ${detail}`)
  }
  const check = (label: string, condition: boolean, detail: unknown = '') =>
    condition ? pass(label) : flag(label, typeof detail === 'string' ? detail : JSON.stringify(detail))
  const rows = async <T>(sql: string) => (await db.query<T>(sql)).rows
  const one = async <T>(sql: string) => (await db.query<T>(sql)).rows[0]
  const refused = async (label: string, sql: string, code: string) => {
    try {
      await db.query(sql)
      flag(label, 'was allowed')
    } catch (error) {
      const got = (error as { code?: string }).code
      if (got === code) pass(label)
      else flag(label, `expected ${code}, got ${got}: ${(error as Error).message}`)
    }
  }
  /** Act as a signed-in user (or anon when `who` is null), as PostgREST would. */
  const actAs = (who: string | null) =>
    db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who ?? ''}', false); set role ${who ? 'authenticated' : 'anon'};`)
  const actAsOwner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
  const fp = async (id: string) =>
    (await one<{ f: string | null }>(`select fingerprint as f from public.questions where id = '${id}'`))?.f ?? null

  await actAsOwner()

  // ---- people and papers ---------------------------------------------------
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${ID.admin}', 'admin@test.local', '{"full_name":"Ada Admin"}'),
      ('${ID.teacher}', 'teacher@test.local', '{"full_name":"Tara Teacher"}'),
      ('${ID.pyTeacher}', 'py@test.local', '{"full_name":"Pat Python"}'),
      ('${ID.colleague}', 'colleague@test.local', '{"full_name":"Cole League"}'),
      ('${ID.trusted}', 'trusted@test.local', '{"full_name":"Trude Trusted"}'),
      ('${ID.student}', 'student@test.local', '{"full_name":"Sam Student"}');
    update public.profiles set role = 'admin' where id = '${ID.admin}';
    update public.profiles set role = 'teacher' where id in ('${ID.teacher}', '${ID.pyTeacher}', '${ID.colleague}', '${ID.trusted}');

    insert into public.question_papers (id, subject_id, exam_type_id, session_date, status) values
      ('${ID.paper}', (select id from public.subjects where slug = 'dbms'), (select id from public.exam_types where slug = 'end-term'), date '2025-12-07', 'published'),
      ('${ID.pyPaper}', (select id from public.subjects where slug = 'python'), (select id from public.exam_types where slug = 'quiz-1'), date '2025-10-12', 'published'),
      ('${ID.draftPaper}', (select id from public.subjects where slug = 'dbms'), (select id from public.exam_types where slug = 'quiz-1'), date '2026-02-01', 'draft');
    insert into public.question_sets (id, paper_id, set_code) values
      ('${ID.setA}', '${ID.paper}', 'A'), ('${ID.setB}', '${ID.paper}', 'B'), ('${ID.setC}', '${ID.paper}', 'C'),
      ('${ID.setD}', '${ID.paper}', 'D'), ('${ID.setE}', '${ID.paper}', 'E'),
      ('${ID.setPy}', '${ID.pyPaper}', '1'), ('${ID.setDraft}', '${ID.draftPaper}', '1');
  `)

  const normalForms: Array<[string, string, boolean]> = [
    ['A', '1NF', false],
    ['B', '2NF', true],
    ['C', '3NF', false],
    ['D', 'BCNF', false],
  ]
  const statements = (order: string[]): Array<[string, string, boolean]> =>
    order.map((md, index) => [String.fromCharCode(65 + index), md, md === 'Both A and B'])

  await db.exec(
    mcq(ID.qA, ID.setA, 1, 'Which normal form removes **partial** dependencies?', normalForms) +
      mcq(ID.qB, ID.setB, 1, 'Which normal form removes partial dependencies', [
        ['1', '1NF', false],
        ['2', '2NF', true],
        ['3', '3NF', false],
        ['4', 'BCNF', false],
      ]) +
      mcq(ID.qC, ID.setC, 1, 'Which normal form removes “partial” dependencies?', [
        ['A', '3NF', false],
        ['B', 'BCNF', false],
        ['C', '2NF', true],
        ['D', '1NF', false],
      ]) +
      mcq(ID.qE, ID.setE, 1, 'Which normal form removes partial dependencies?', [
        ['A', '1NF', false],
        ['B', '2NF', false],
        ['C', '3NF', true],
        ['D', 'BCNF', false],
      ]) +
      mcq(ID.qR1, ID.setA, 2, 'Statement A: a key is minimal. Statement B: a superkey is minimal. Which is true?', statements(['Only A', 'Only B', 'Both A and B', 'Neither A nor B'])) +
      mcq(ID.qR2, ID.setB, 2, 'Statement A: a key is minimal. Statement B: a superkey is minimal. Which is true?', statements(['Only A', 'Only B', 'Both A and B', 'Neither A nor B'])) +
      mcq(ID.qR3, ID.setC, 2, 'Statement A: a key is minimal. Statement B: a superkey is minimal. Which is true?', statements(['Only B', 'Only A', 'Both A and B', 'Neither A nor B'])) +
      mcq(ID.qD1, ID.setD, 1, 'Pick the candidate key.', [['A', 'roll_no', true], ['B', 'name', false]]) +
      mcq(ID.qD2, ID.setD, 2, 'Pick the candidate key.', [['A', 'roll_no', true], ['B', 'name', false]]) +
      mcq(ID.qPy, ID.setPy, 1, 'What does len([]) return?', [['A', '0', true], ['B', '1', false]]) +
      mcq(ID.qDraft, ID.setDraft, 1, 'A draft question about joins.', [['A', 'Inner', true], ['B', 'Outer', false]]) +
      mcq(ID.qK1, ID.setB, 7, 'What does `printf("C Programming !!")` print?', [['A', 'C Programming !!', true], ['B', 'C Programming', false], ['C', 'Nothing', false]]) +
      mcq(ID.qK2, ID.setC, 7, 'What does `printf("C Programming !!")` print?', [['A', 'C Programming !!', false], ['B', 'C Programming', true], ['C', 'Nothing', false]]) +
      mcq(ID.qK3, ID.setE, 7, 'What does `printf("C Programming !!")` print', [['A', 'Nothing', false], ['B', 'C Programming !!', true], ['C', 'C Programming', false]]) +
      mcq(ID.qNe, ID.setB, 8, 'When is `a != b` true?', [['A', 'Always', false], ['B', 'When they differ', true]]) +
      mcq(ID.qEq, ID.setC, 8, 'When is `a = b` true?', [['A', 'Always', false], ['B', 'When they differ', true]]) +
      `
      insert into public.questions (id, set_id, number, type, body, correct_answer) values
        ('${ID.qOpen}', '${ID.setA}', 3, 'subjective', ${jsonb(text('Explain normalisation in your own words.'))}, null),
        ('${ID.qBoiler}', '${ID.setA}', 4, 'subjective', ${jsonb(text('THIS IS QUESTION PAPER FOR THE SUBJECT "DBMS"'))}, 'x'),
        ('${ID.qPrev}', '${ID.setA}', 5, 'numerical', ${jsonb(text('Consider the algorithm in the previous question. How many passes does it make?'))}, '5'),
        ('${ID.qN1}', '${ID.setA}', 6, 'numerical', ${jsonb(text('What is 5/2?'))}, '2.50'),
        ('${ID.qN2}', '${ID.setB}', 6, 'numerical', ${jsonb(text('What is 5 / 2 ?'))}, '2.5');
    `,
  )

  // ---- fingerprints --------------------------------------------------------
  const fA = await fp(ID.qA)
  check('fingerprint: same question in another set, 1/2 labels, gets the same fingerprint', fA !== null && fA === (await fp(ID.qB)), [fA, await fp(ID.qB)])
  check('fingerprint: shuffled options, same correct content, still link', fA === (await fp(ID.qC)))
  check('fingerprint: a different correct option gives a different fingerprint', (await fp(ID.qE)) !== null && fA !== (await fp(ID.qE)))
  check('fingerprint: options that name other options keep their order', (await fp(ID.qR1)) === (await fp(ID.qR2)) && (await fp(ID.qR1)) !== (await fp(ID.qR3)))
  check('fingerprint: options equal after clean-up still tell which one is correct',
    (await fp(ID.qK1)) !== null && (await fp(ID.qK2)) !== null && (await fp(ID.qK1)) !== (await fp(ID.qK2)))
  check('fingerprint: and such a question still links a shuffled, loosely formatted copy', (await fp(ID.qK1)) === (await fp(ID.qK3)))
  check('fingerprint: "!=" is not prose punctuation', (await fp(ID.qNe)) !== null && (await fp(ID.qNe)) !== (await fp(ID.qEq)))
  check('fingerprint: 2.50 and 2.5 are the same answer', (await fp(ID.qN1)) !== null && (await fp(ID.qN1)) === (await fp(ID.qN2)))
  check('fingerprint: answerless subjective, boilerplate and "previous question" are never linked',
    (await fp(ID.qOpen)) === null && (await fp(ID.qBoiler)) === null && (await fp(ID.qPrev)) === null)
  const orders = await rows<{ id: string; option_order: string | null; fingerprint_strict: string | null }>(
    `select id, option_order, fingerprint_strict from public.questions where id in ('${ID.qA}', '${ID.qB}', '${ID.qC}')`,
  )
  const orderOf = (id: string) => orders.find((row) => row.id === id)?.option_order
  check('option order: kept per copy, and differs only for the shuffled copy', orderOf(ID.qA) === orderOf(ID.qB) && orderOf(ID.qA) !== orderOf(ID.qC))
  check('strict hash: differs where only formatting differs', new Set(orders.map((row) => row.fingerprint_strict)).size > 1)
  const sameSet = await one<{ shareable: boolean }>(
    `select public.fingerprint_shareable(fingerprint) as shareable from public.questions where id = '${ID.qD1}'`,
  )
  await db.exec(`select set_config('request.jwt.claim.sub', '${ID.admin}', false)`)
  const sameSetKey = (await one<{ key: string | null }>(`select public.group_key('${ID.qD1}') as key`)).key
  const hiddenKey = await actAs(ID.student).then(() => one<{ key: string | null }>(`select public.group_key('${ID.qD1}') as key`))
  await actAsOwner()
  check('same-set repeat: not shared, stands alone', sameSet.shareable === false && sameSetKey === `q:${ID.qD1}`, [sameSet, sameSetKey])
  check('group key: not given to someone who cannot teach the question', hiddenKey.key === null)
  await db.exec(`insert into public.fingerprint_overrides (fingerprint, decision) select fingerprint, 'allow' from public.questions where id = '${ID.qD1}'`)
  check('same-set repeat: an admin "allow" shares it', (await one<{ s: boolean }>(`select public.fingerprint_shareable(fingerprint) as s from public.questions where id = '${ID.qD1}'`)).s === true)
  await db.exec(`delete from public.fingerprint_overrides`)

  // ---- explanations follow their copies --------------------------------------
  await db.exec(`
    insert into public.solutions (id, question_id, kind, body, author_id, status)
    values ('${ID.sol}', '${ID.qA}', 'authored', ${jsonb(text('2NF removes partial dependencies on a key.'))}, '${ID.colleague}', 'approved');
  `)
  const forQ = (id: string) =>
    rows<{ id: string; shared: boolean }>(`select id, shared from public.solutions_for_question('${id}')`)
  const onB = await forQ(ID.qB)
  check('sharing: the explanation shows on a copy, marked shared', onB.length === 1 && onB[0].shared === true, onB)
  check('sharing: and on the shuffled copy', (await forQ(ID.qC)).length === 1)
  check('sharing: not on the question with a different answer', (await forQ(ID.qE)).length === 0)
  check('sharing: its own question shows it unshared', (await forQ(ID.qA))[0]?.shared === false)

  await db.exec(`delete from public.questions where id = '${ID.qA}'`)
  const orphan = await one<{ question_id: string | null; fingerprint: string | null }>(`select question_id, fingerprint from public.solutions where id = '${ID.sol}'`)
  check('delete: the explanation survives, unanchored, with its fingerprint', orphan.question_id === null && orphan.fingerprint === fA, orphan)
  check('delete: copies still show it', (await forQ(ID.qB)).length === 1)
  await db.exec(mcq(ID.qA2, ID.setA, 1, 'Which normal form removes **partial** dependencies?', normalForms))
  check('re-import: an identical question takes the explanation back', (await one<{ q: string }>(`select question_id as q from public.solutions where id = '${ID.sol}'`)).q === ID.qA2)

  await db.exec(`update public.question_options set is_correct = (content->0->>'md' = '3NF') where question_id = '${ID.qA2}'`)
  const drifted = await one<{ status: string; fingerprint: string | null; review_note: string | null }>(
    `select status, fingerprint, review_note from public.solutions where id = '${ID.sol}'`,
  )
  check('drift: a changed answer key sends the live explanation back to review',
    drifted.status === 'pending' && drifted.fingerprint === (await fp(ID.qA2)) && /question changed/i.test(drifted.review_note ?? ''), drifted)
  check('drift: the old copies no longer show it', (await forQ(ID.qB)).length === 0 && (await forQ(ID.qE)).length === 0)
  await db.exec(`update public.question_options set is_correct = (content->0->>'md' = '2NF') where question_id = '${ID.qA2}'`)

  await db.exec(`update public.questions set fingerprint = null, fingerprint_strict = null, option_order = null where id = '${ID.qB}'`)
  const filled = await one<{ n: number }>(`select public.backfill_fingerprints((select id from public.subjects where slug = 'dbms')) as n`)
  check('backfill: refills a missing fingerprint and nothing else', filled.n === 1 && (await fp(ID.qB)) === fA, filled)

  // ---- combos --------------------------------------------------------------
  await actAs(ID.admin)
  await db.exec(`
    insert into public.teacher_assignments (teacher_id, program_id, subject_id)
    select t.id, p.id, s.id
    from (values ('${ID.teacher}'::uuid, 'dbms'), ('${ID.pyTeacher}'::uuid, 'python'), ('${ID.colleague}'::uuid, 'dbms'), ('${ID.trusted}'::uuid, 'dbms')) t(id, slug)
    join public.subjects s on s.slug = t.slug
    join public.programs p on p.slug = 'ds';
    select public.set_auto_publish('${ID.trusted}', true);
  `)
  check('combos: the trigger records who assigned them',
    (await one<{ n: number }>(`select count(*)::int as n from public.teacher_assignments where assigned_by = '${ID.admin}'`)).n === 4)
  await refused('combos: Electronic Systems + DBMS is refused (23514)',
    `insert into public.teacher_assignments (teacher_id, program_id, subject_id) values ('${ID.colleague}', (select id from public.programs where slug = 'es'), (select id from public.subjects where slug = 'dbms'))`, '23514')
  await refused('combos: a student cannot be given subjects (23514)',
    `insert into public.teacher_assignments (teacher_id, program_id, subject_id) values ('${ID.student}', (select id from public.programs where slug = 'ds'), (select id from public.subjects where slug = 'dbms'))`, '23514')
  await refused('trust: only a teacher publishes without review (22023)', `select public.set_auto_publish('${ID.student}', true)`, '22023')
  await refused('roles: an admin cannot change their own role', `select public.set_user_role('${ID.admin}', 'student')`, '42501')
  await refused('roles: nobody is made admin through the API', `select public.set_user_role('${ID.student}', 'admin')`, '42501')
  const people = await rows<{ email: string }>(`select email from public.admin_list_people('test.local', null, 10)`)
  check('people: an admin can search by email', people.length === 6, people.length)

  // ---- access by email (0027) ---------------------------------------------------
  const invited = await one<{ r: string }>(`select public.admin_invite(' New.Teacher@Test.Local ', 'teacher') as r`)
  check('invites: an unknown address waits as an invite, stored lowercase', invited.r === 'invited' &&
    (await one<{ n: number }>(`select count(*)::int as n from public.access_invites where email = 'new.teacher@test.local'`)).n === 1)
  await db.exec(`insert into public.invite_assignments (email, program_id, subject_id)
    values ('new.teacher@test.local', (select id from public.programs where slug = 'ds'), (select id from public.subjects where slug = 'dbms'))`)
  await refused('invites: a subject outside the branch is refused (23514)',
    `insert into public.invite_assignments (email, program_id, subject_id) values ('new.teacher@test.local', (select id from public.programs where slug = 'es'), (select id from public.subjects where slug = 'python'))`, '23514')
  await refused('invites: nobody is invited as admin (22023)', `select public.admin_invite('boss@test.local', 'admin')`, '22023')
  const already = await one<{ r: string }>(`select public.admin_invite('student@test.local', 'contributor') as r`)
  check('invites: someone already signed in gets the role at once',
    already.r === 'applied' && (await one<{ role: string }>(`select role from public.profiles where id = '${ID.student}'`)).role === 'contributor')
  await actAsOwner()
  await db.exec(`update public.profiles set role = 'student' where id = '${ID.student}'`)
  await actAs(ID.admin)
  await db.exec(`select public.admin_invite('late.confirm@test.local', 'teacher')`)

  await actAs(ID.teacher)
  check('invites: a teacher cannot see who is invited',
    (await one<{ n: number }>(`select count(*)::int as n from public.access_invites`)).n === 0)
  await refused('invites: a teacher cannot invite (42501)', `select public.admin_invite('x@test.local', 'teacher')`, '42501')

  await actAsOwner()
  await db.exec(`insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at)
    values ('00000000-0000-4000-8000-00000000e001', 'new.teacher@test.local', '{"full_name":"Nia New"}', now())`)
  const newcomer = await one<{ role: string; combos: number; by: string | null }>(`
    select p.role, (select count(*)::int from public.teacher_assignments where teacher_id = p.id) as combos,
           (select assigned_by::text from public.teacher_assignments where teacher_id = p.id limit 1) as by
    from public.profiles p where p.id = '00000000-0000-4000-8000-00000000e001'`)
  check('invites: first sign-in applies the role and the combos, credited to the inviter',
    newcomer.role === 'teacher' && newcomer.combos === 1 && newcomer.by === ID.admin, newcomer)
  check('invites: used up after sign-in',
    (await one<{ n: number }>(`select count(*)::int as n from public.access_invites where email = 'new.teacher@test.local'`)).n === 0)
  await db.exec(`insert into auth.users (id, email, raw_user_meta_data)
    values ('00000000-0000-4000-8000-00000000e002', 'late.confirm@test.local', '{}')`)
  check('invites: an unconfirmed sign-up with the address gets nothing',
    (await one<{ role: string }>(`select role from public.profiles where id = '00000000-0000-4000-8000-00000000e002'`)).role === 'student')
  await db.exec(`update auth.users set email_confirmed_at = now() where id = '00000000-0000-4000-8000-00000000e002'`)
  check('invites: confirming the address applies the invite',
    (await one<{ role: string }>(`select role from public.profiles where id = '00000000-0000-4000-8000-00000000e002'`)).role === 'teacher')
  await db.exec(`delete from auth.users where id in ('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000e002')`)

  // ---- admin by email: the owner only (0028) --------------------------------------
  await db.exec(`insert into public.access_invites (email, role) values ('owner.pick@test.local', 'admin')`)
  await actAs(ID.admin)
  await refused('invites: a site admin cannot write an admin invite (42501)',
    `insert into public.access_invites (email, role) values ('sneaky@test.local', 'admin')`, '42501')
  await refused('invites: nor overwrite the owner admin invite (42501)', `select public.admin_invite('owner.pick@test.local', 'teacher')`, '42501')
  await db.exec(`delete from public.access_invites where email = 'owner.pick@test.local'`)
  check('invites: nor cancel it',
    (await one<{ n: number }>(`select count(*)::int as n from public.access_invites where email = 'owner.pick@test.local'`)).n === 1)
  await actAsOwner()
  await db.exec(`insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at)
    values ('00000000-0000-4000-8000-00000000e003', 'owner.pick@test.local', '{}', now())`)
  check('invites: the owner admin invite makes an admin at first sign-in',
    (await one<{ role: string }>(`select role from public.profiles where id = '00000000-0000-4000-8000-00000000e003'`)).role === 'admin')
  await db.exec(`delete from auth.users where id = '00000000-0000-4000-8000-00000000e003'`)
  await actAs(ID.admin)

  await actAs(ID.teacher)
  await refused('combos: a teacher cannot assign themselves a subject',
    `insert into public.teacher_assignments (teacher_id, program_id, subject_id) values ('${ID.teacher}', (select id from public.programs where slug = 'ds'), (select id from public.subjects where slug = 'python'))`, '42501')

  // ---- a teacher inside and outside their combos -------------------------------
  const insertAs = (question: string, status: string, extra = '') =>
    `insert into public.solutions (question_id, kind, body, author_id, status${extra ? ', video_url' : ''})
     values ('${question}', 'authored', ${jsonb(text('Worked answer.'))}, '${ID.teacher}', '${status}'${extra ? `, '${extra}'` : ''})
     returning id, status, submitted_at`
  await refused('teacher: no explanation for a subject outside the combo', insertAs(ID.qPy, 'pending'), '42501')
  await refused('teacher: cannot write an official answer',
    `insert into public.solutions (question_id, kind, body, author_id, status) values ('${ID.qB}', 'official', '[]'::jsonb, '${ID.teacher}', 'pending')`, '42501')
  await refused('teacher: cannot write in a colleague’s name',
    `insert into public.solutions (question_id, kind, body, author_id, status) values ('${ID.qB}', 'authored', '[]'::jsonb, '${ID.colleague}', 'pending')`, '42501')
  const mine = await one<{ id: string; status: string; submitted_at: string | null }>(insertAs(ID.qB, 'approved'))
  await refused('teacher: cannot move an explanation to another question (column grant)',
    `update public.solutions set question_id = '${ID.qPy}' where id = '${mine.id}'`, '42501')
  check('teacher: an untrusted "approved" lands as in review', mine.status === 'pending' && mine.submitted_at !== null, mine)
  await refused('teacher: one authored explanation per question (23505)', insertAs(ID.qB, 'pending'), '23505')
  await refused('teacher: a non-YouTube video link is refused (23514)', `update public.solutions set video_url = 'https://evil.example/v' where id = '${mine.id}'`, '23514')
  await db.exec(`update public.solutions set review_note = 'self-approved', status = 'approved' where id = '${mine.id}'`)
  const escalated = await one<{ status: string; review_note: string | null }>(`select status, review_note from public.solutions where id = '${mine.id}'`)
  check('teacher: cannot approve their own work or write the review note', escalated.status === 'pending' && escalated.review_note === null, escalated)
  const pendingDelete = await rows(`delete from public.solutions where id = '${ID.sol}' returning id`)
  check('teacher: cannot delete another author’s work', pendingDelete.length === 0)
  const draftOnDraft = await rows(`select id from public.questions where id = '${ID.qDraft}'`)
  check('teacher: sees unpublished questions of their own subjects', draftOnDraft.length === 1)

  await actAs(ID.pyTeacher)
  check('other teacher: cannot see a DBMS draft explanation', (await rows(`select id from public.solutions where id = '${mine.id}'`)).length === 0)
  check('other teacher: cannot change it', (await rows(`update public.solutions set body = '[]'::jsonb where id = '${mine.id}' returning id`)).length === 0)
  check('other teacher: cannot see unpublished DBMS questions', (await rows(`select id from public.questions where id = '${ID.qDraft}'`)).length === 0)
  await refused('other teacher: no DBMS queue', `select * from public.teacher_queue((select id from public.subjects where slug = 'dbms'))`, '42501')

  await actAs(ID.colleague)
  check('colleague in the same combo: sees the draft', (await rows(`select id from public.solutions where id = '${mine.id}'`)).length === 1)

  await actAs(ID.admin)
  await db.exec(`update public.solutions set status = 'approved', review_note = null, reviewed_by = '${ID.admin}', reviewed_at = now() where id = '${mine.id}'`)

  await actAs(ID.teacher)
  await db.exec(`update public.solutions set body = ${jsonb(text('A better worked answer.'))} where id = '${mine.id}'`)
  const edited = await one<{ status: string; review_note: string | null }>(`select status, review_note from public.solutions where id = '${mine.id}'`)
  check('teacher: editing a live explanation sends it back to review', edited.status === 'pending' && /edited by the author/i.test(edited.review_note ?? ''), edited)
  await actAs(ID.admin)
  await db.exec(`update public.solutions set status = 'approved' where id = '${mine.id}'`)
  await actAs(ID.teacher)
  check('teacher: cannot delete a live explanation', (await rows(`delete from public.solutions where id = '${mine.id}' returning id`)).length === 0)
  const scratch = await one<{ id: string }>(insertAs(ID.qC, 'pending'))
  check('teacher: can delete their own draft', (await rows(`delete from public.solutions where id = '${scratch.id}' returning id`)).length === 1)
  // The studio's Submit sends an untrusted teacher's live explanation back as
  // pending itself; the reviewer still learns it was live.
  await db.exec(`update public.solutions set status = 'pending', submitted_at = now() where id = '${mine.id}'`)
  const resubmitted = await one<{ status: string; review_note: string | null }>(`select status, review_note from public.solutions where id = '${mine.id}'`)
  check('teacher: resubmitting a live explanation notes it for the reviewer',
    resubmitted.status === 'pending' && /edited by the author/i.test(resubmitted.review_note ?? ''), resubmitted)
  await actAs(ID.admin)
  await db.exec(`update public.solutions set status = 'approved', review_note = null where id = '${mine.id}'`)

  await actAs(ID.trusted)
  const trusted = await one<{ status: string }>(
    `insert into public.solutions (question_id, kind, body, author_id, status) values ('${ID.qN2}', 'authored', ${jsonb(text('5/2 = 2.5'))}, '${ID.trusted}', 'approved') returning status`,
  )
  check('trusted teacher: publishes directly', trusted.status === 'approved')

  await actAs(ID.student)
  await refused('student: cannot write an authored explanation',
    `insert into public.solutions (question_id, kind, body, author_id, status) values ('${ID.qB}', 'authored', '[]'::jsonb, '${ID.student}', 'pending')`, '42501')
  check('student: may still suggest a community solution for review',
    (await rows(`insert into public.solutions (question_id, kind, body, author_id, status) values ('${ID.qB}', 'community', ${jsonb(text('My way.'))}, '${ID.student}', 'pending') returning id`)).length === 1)
  await refused('student: set_user_role is refused (42501)', `select public.set_user_role('${ID.student}', 'teacher')`, '42501')
  await refused('student: no queue (42501)', `select * from public.teacher_queue((select id from public.subjects where slug = 'dbms'))`, '42501')
  await refused('student: no duplicate review (42501)', `select * from public.duplicate_review('largest')`, '42501')
  await refused('student: no people list (42501)', `select * from public.admin_list_people()`, '42501')
  check('student: cannot see unpublished questions', (await rows(`select id from public.questions where id = '${ID.qDraft}'`)).length === 0)

  // ---- desk and studio RPCs ------------------------------------------------------
  await actAs(ID.teacher)
  const queue = await rows<{ question_id: string; copies: number; order_varies: boolean; group_key: string; total: number }>(
    `select question_id, copies, order_varies, group_key, total from public.teacher_queue((select id from public.subjects where slug = 'dbms'), 'all')`,
  )
  const normalGroup = queue.find((row) => row.group_key === fA)
  check('queue: copies collapse into one row with their reach', normalGroup?.copies === 3, normalGroup)
  check('queue: the group knows its copies order options differently', normalGroup?.order_varies === true)
  check('queue: a same-set repeat stays two separate rows', queue.filter((row) => [ID.qD1, ID.qD2].includes(row.question_id)).length === 2)
  const summary = await rows<{ subject_slug: string; valid: boolean; questions: number; explained: number }>(`select * from public.teacher_subject_summary()`)
  check('summary: one card per combo, counted', summary.length === 1 && summary[0].valid && summary[0].questions > 0 && summary[0].explained >= 1, summary)
  const members = await rows<{ question_id: string; is_self: boolean; same_option_order: boolean }>(`select * from public.question_group_members('${ID.qB}')`)
  check('studio: group members, self first, shuffled copy flagged',
    members[0]?.is_self === true && members.length === 3 && members.some((m) => m.question_id === ID.qC && !m.same_option_order), members)
  check('studio: group explanations include the teacher’s own',
    (await rows<{ is_mine: boolean }>(`select is_mine from public.group_explanations('${ID.qB}')`)).some((row) => row.is_mine))
  check('claim: the first teacher holds the group', (await one<{ ok: boolean }>(`select * from public.claim_question('${ID.qB}')`)).ok === true)
  await actAs(ID.colleague)
  const held = await one<{ ok: boolean; holder_name: string }>(`select * from public.claim_question('${ID.qC}')`)
  check('claim: a colleague sees who holds it', held.ok === false && held.holder_name === 'Tara Teacher', held)
  await actAs(ID.admin)
  check('claim: an admin does not take it over just by looking', (await one<{ ok: boolean }>(`select * from public.claim_question('${ID.qB}')`)).ok === false)
  check('claim: an admin takes over when asking', (await one<{ ok: boolean }>(`select * from public.claim_question('${ID.qB}', true)`)).ok === true)
  const kinds = await rows<{ fingerprint: string }>(`select fingerprint from public.duplicate_review('shuffled')`)
  check('duplicates: the shuffled group is listed for review', kinds.some((row) => row.fingerprint === fA))
  check('duplicates: so is the formatting-only group', (await rows<{ fingerprint: string }>(`select fingerprint from public.duplicate_review('normalised_only')`)).some((row) => row.fingerprint === fA))
  check('duplicates: and the same-set repeat', (await rows(`select 1 from public.duplicate_review('same_set')`)).length === 1)

  await actAs(ID.trusted)
  await db.exec(`select public.claim_question('${ID.qN2}')`)
  await actAs(ID.admin)
  await db.exec(`select public.set_user_role('${ID.trusted}', 'student')`)
  await actAsOwner()
  const demoted = await one<{ combos: number; claims: number; trusted: boolean }>(`
    select (select count(*)::int from public.teacher_assignments where teacher_id = '${ID.trusted}') as combos,
           (select count(*)::int from public.explanation_claims where teacher_id = '${ID.trusted}') as claims,
           (select auto_publish from public.profiles where id = '${ID.trusted}') as trusted`)
  check('demotion: combos, claims and trust go with the teacher role', demoted.combos === 0 && demoted.claims === 0 && !demoted.trusted, demoted)
  await actAs(ID.trusted)
  check('demotion: a former teacher can no longer change their live explanation',
    (await rows(`update public.solutions set body = '[]'::jsonb where author_id = '${ID.trusted}' returning id`)).length === 0)
  await actAsOwner()

  // ---- body size: whatever the app accepts, the table accepts ---------------------
  // The app counts compact JSON (EXPLANATION_MAX_BYTES, 300 kB); jsonb prints a
  // space after every comma, so a body of single digits is the worst case.
  const digits = (bytes: number) => [{ type: 'sketch', pts: Array<number>(Math.floor((bytes - 30) / 2)).fill(1) }]
  const bodyInsert = (body: unknown) =>
    `insert into public.solutions (question_id, kind, body, status) values ('${ID.qB}', 'official', ${jsonb(body)}, 'pending') returning id`
  const fullBody = digits(300_000)
  const accepted = await rows<{ id: string }>(bodyInsert(fullBody))
  check('body size: a 300 kB explanation of small numbers fits the table',
    accepted.length === 1 && new TextEncoder().encode(JSON.stringify(fullBody)).length <= 300_000)
  await db.exec(`delete from public.solutions where id = '${accepted[0]?.id}'`)
  await refused('body size: a much larger one is refused (23514)', bodyInsert(digits(320_000)), '23514')

  // ---- what the public roles may not touch ---------------------------------------
  await actAs(ID.teacher)
  await refused('authenticated: profiles.email is not readable', `select email from public.profiles`, '42501')
  await refused('authenticated: cannot insert a profile with a role and trust flag of their choosing',
    `insert into public.profiles (id, role, auto_publish) values ('${ID.teacher}', 'teacher', true)`, '42501')
  await refused('authenticated: the YouTube connection is not readable', `select * from public.youtube_connection`, '42501')
  await refused('authenticated: an upload session address is not readable', `select session_uri from public.video_uploads`, '42501')
  check('authenticated: their own uploads are readable', Array.isArray(await rows(`select id, status from public.video_uploads`)))
  await refused('authenticated: backfill is service-role only', `select public.backfill_fingerprints(null)`, '42501')
  await refused('authenticated: fingerprints cannot be recomputed by RPC', `select public.refresh_question_fingerprint('${ID.qB}')`, '42501')

  await actAs(null)
  await refused('anon: profiles.email is not readable', `select email from public.profiles`, '42501')
  await refused('anon: refresh_question_fingerprint is not callable', `select public.refresh_question_fingerprint('${ID.qB}')`, '42501')
  await refused('anon: set_user_role is not callable', `select public.set_user_role('${ID.student}', 'teacher')`, '42501')
  await refused('anon: the normaliser is not callable', `select public.fp_text('x')`, '42501')
  await refused('anon: review notes are not readable', `select review_note from public.solutions`, '42501')
  try {
    const visible = await one<{ q: number; o: number; s: number; st: number }>(`
      select (select count(*)::int from public.questions) as q, (select count(*)::int from public.question_options) as o,
             (select count(*)::int from public.solutions) as s, (select count(*)::int from public.subject_stats) as st`)
    check('anon: published questions, options, live explanations and stats still read', visible.q > 0 && visible.o > 0 && visible.s > 0 && visible.st > 0, visible)
    check('anon: reads explanations through solutions_for_question', (await forQ(ID.qC)).length >= 1)
    const copies = await rows<{ question_id: string; copy_question_id: string; copy_set_id: string }>(
      `select question_id, copy_question_id, copy_set_id from public.public_question_copies('${ID.setB}')`,
    )
    check(
      'anon: public_question_copies names published copies in other sets, never drafts',
      copies.some((row) => row.question_id === ID.qB && row.copy_question_id === ID.qC) &&
        copies.every((row) => row.copy_set_id !== ID.setDraft && row.copy_question_id !== ID.qB),
      copies,
    )
    const listed = await rows<{ question_id: string; canonical_id: string; text_blocks: string[]; substance: number }>(
      `select question_id, canonical_id, text_blocks, substance from public.public_question_index(array['${ID.setB}', '${ID.setC}', '${ID.setDraft}']::uuid[])`,
    )
    const b = listed.find((row) => row.question_id === ID.qB)
    const c = listed.find((row) => row.question_id === ID.qC)
    const videos = await rows<{ question_id: string; video_url: string }>(`select question_id, video_url from public.public_video_solutions()`)
    check(
      'anon: public_video_solutions lists only questions with an approved video',
      videos.every((row) => typeof row.video_url === 'string' && row.video_url.length > 0),
      videos,
    )
    check(
      'anon: public_question_index gives copies one canonical, with their text, and skips drafts',
      Boolean(b && c && b.canonical_id === c.canonical_id && b.substance > 0 && b.text_blocks.join(' ').includes('normal form')) &&
        listed.every((row) => row.question_id !== ID.qDraft),
      listed,
    )
  } catch (error) {
    flag('anon: public reads', (error as Error).message)
  }

  await actAsOwner()
  const anonAllowed = [
    'active_students_by_subject', 'can_teach_question', 'is_admin', 'is_staff', 'is_teacher', 'popular_searches',
    'public_question_copies', 'public_question_index', 'public_video_solutions', 'published_set_counts', 'question_peer_stats', 'search_questions', 'set_peer_stats',
    'solutions_for_question',
  ]
  const authAllowed = [
    ...anonAllowed, 'admin_invite', 'admin_list_people', 'can_teach_subject', 'claim_question', 'duplicate_review', 'group_explanations',
    'group_key', 'leaderboard', 'my_auto_publish', 'my_peer_gaps', 'question_group_members', 'release_claim',
    'set_auto_publish', 'set_user_role', 'teacher_exam_progress', 'teacher_queue', 'teacher_subject_summary',
  ]
  for (const [role, allowed] of [['anon', anonAllowed], ['authenticated', authAllowed]] as const) {
    const exposed = await rows<{ name: string }>(`
      select p.proname as name from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.prosecdef
        and p.prorettype <> 'trigger'::regtype
        and has_function_privilege('${role}', p.oid, 'execute')
        and p.proname <> all (array[${allowed.map((name) => `'${name}'`).join(', ')}])`)
    check(`${role}: no SECURITY DEFINER function callable beyond the allowlist`, exposed.length === 0, exposed.map((row) => row.name).join(', '))
  }

  return ok
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
