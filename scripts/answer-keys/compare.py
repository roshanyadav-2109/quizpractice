import json, collections, os, re
cat = json.load(open('catalog.json', encoding='utf8'))
db = json.load(open('db-inventory.json', encoding='utf8'))
subjects = json.load(open('subjects.json', encoding='utf8'))
old = json.load(open('old-inventory.json', encoding='utf8')) if os.path.exists('old-inventory.json') else {'courses': {}, 'rows': []}

def term_of(date):
    y, m = int(date[:4]), int(date[5:7])
    return f'jan-{y}' if m <= 5 else f'may-{y}' if m <= 9 else f'sep-{y}'

# Drive catalogue groups
drive = collections.defaultdict(lambda: {'sections': 0, 'questions': 0})
for s in cat:
    k = (s['subject'], s['exam'], s['date'])
    drive[k]['sections'] += 1; drive[k]['questions'] += s['questions']
# DB groups
dbg = {}
for p in db:
    k = (p['subject']['slug'], p['exam']['slug'], p['session_date'])
    dbg[k] = {'sets': len(p['sets']), 'questions': sum(x['questions'][0]['count'] for x in p['sets'])}
# Old site: course -> subject
norm = lambda s: re.sub(r'[^a-z0-9]+', '', (s or '').lower())
alias = {}
for s in subjects:
    for a in [s['name'], s['slug']] + (s['aliases'] or []):
        alias.setdefault(norm(a), s['slug'])
EX = {'Quiz 1': 'quiz-1', 'Quiz 2': 'quiz-2', 'End Term Quiz': 'end-term', 'OPPE': 'oppe'}
oldg = collections.defaultdict(set)
unmapped_courses = collections.Counter()
for r in old['rows']:
    c = old['courses'][str(r['course_id'])]
    slug = alias.get(norm(c['name'])) or alias.get(norm(c['code']))
    if not slug: unmapped_courses[c['name']] += 1; continue
    if not r['exam_date']: continue
    oldg[(slug, EX[r['exam']], r['exam_date'])].add(r['id'])

def near(key, pool, days=0):
    return key in pool

missing = [k for k in drive if k not in dbg]
present = [k for k in drive if k in dbg]
db_only = [k for k in dbg if k not in drive]
print(f"Drive groups (subject, exam, date): {len(drive)}  | in DB already: {len(present)} | missing from DB: {len(missing)}")
print(f"  missing sections: {sum(drive[k]['sections'] for k in missing)}, questions: {sum(drive[k]['questions'] for k in missing)}")
print(f"DB groups: {len(dbg)} | DB-only (not in Drive): {len(db_only)}")
# duplicates in DB: DB sets vs unique sections
dup = [(k, dbg[k]['sets'], drive[k]['sections'], dbg[k]['questions'], drive[k]['questions']) for k in present if dbg[k]['sets'] > drive[k]['sections']]
print(f"DB groups with more sets than unique sections (duplicates): {len(dup)}; extra sets {sum(a - b for _, a, b, _, _ in dup)}")
short = [(k, dbg[k], drive[k]) for k in present if dbg[k]['sets'] < drive[k]['sections']]
print(f"DB groups with fewer sets than Drive has: {len(short)}")
# old site coverage
old_missing = [k for k in oldg if k not in dbg]
print(f"\nOld site (subject, exam, date) groups: {len(oldg)} | not in DB: {len(old_missing)}")
cov = [k for k in old_missing if k in drive or (k[0], 'qualifier', k[2]) in drive or (k[0], 'diploma-qualifier', k[2]) in drive or any(d[0]==k[0] and d[2]==k[2] for d in drive)]
print(f"  of those, covered by the Drive papers: {len(cov)}; not covered: {len(old_missing) - len(cov)}")
for k in sorted(set(old_missing) - set(cov), key=lambda k: (k[2], k[0]))[:60]: print('    not covered:', k, len(oldg[k]), 'papers')
print('unmapped old courses:', dict(unmapped_courses))
json.dump({'missing': [list(k) + [drive[k]] for k in sorted(missing, key=lambda k: (k[2] or '', k[0]))]}, open('missing.json', 'w'), indent=1)
by_term = collections.Counter((term_of(k[2]) if k[2] else 'sep-2021', k[1]) for k in missing)
print('\nmissing groups by term/exam:')
for k in sorted(by_term): print('  ', k, by_term[k])
