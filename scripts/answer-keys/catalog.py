"""
Stage 2: every unique subject section across the Drive PDFs, keyed by
subject, exam and date, compared with what the database already holds.
"""
import collections
import hashlib
import json
import re

metas = [m for m in json.load(open('pdf-meta.json', encoding='utf8')) if 'DUMMY' not in (m['paper_name'] or '')]
subjects = {s['slug']: s for s in json.load(open('subjects.json', encoding='utf8'))}


def term_of(date):
    y, m = int(date[:4]), int(date[5:7])
    if m <= 5:
        return f'jan-{y}'
    if m <= 9:
        return f'may-{y}'
    return f'sep-{y}'


# ---- exam per date --------------------------------------------------------
REGULAR = ('quiz-1', 'quiz-2', 'end-term')
for m in metas:
    m['term2'] = term_of(m['date']) if m['date'] else m['term']
votes = collections.defaultdict(collections.Counter)
for m in metas:
    if m['exam'] in REGULAR and m['date']:
        votes[(m['term2'], m['date'])][m['row_exam']] += 1
date_exam = {k: v.most_common(1)[0][0] for k, v in votes.items()}
# A folder holding a whole term (Sept 2024) labels every date alike; three
# dates under one label are the term's three exams, in order.
by_term = collections.defaultdict(list)
for (term, date), exam in date_exam.items():
    by_term[term].append((date, exam))
for term, pairs in by_term.items():
    pairs.sort()
    if len(pairs) == 3 and len({e for _, e in pairs}) == 1:
        for (date, _), exam in zip(pairs, REGULAR):
            date_exam[(term, date)] = exam
for m in metas:
    if m['exam'] in REGULAR and m['date']:
        m['exam'] = date_exam[(m['term2'], m['date'])]


# ---- subject of a section -------------------------------------------------
def norm(s):
    s = (s or '').upper()
    s = re.sub(r'\((COMPUTER BASED|PEN AND PAPER|COMPUTER BASED/PEN AND PAPER)\s*EXAM\s*\)', '', s)
    s = re.sub(r'^(FOUNDATION/DIPLOMA|FOUNDATION|DIPLOMA|DEGREE|QUALIFIER) LEVEL\s*:\s*', '', s)
    s = re.sub(r'^SEMESTER I+\s*:\s*', '', s)
    return re.sub(r'[^A-Z0-9]+', ' ', s).strip()


TITLE_MAP = {
    'COMPUTATIONAL THINKING': 'computational-thinking', 'MATHEMATICS FOR DATA SCIENCE I': 'maths-1',
    'MATHEMATICS FOR DATA SCIENCE II': 'maths-2', 'STATISTICS FOR DATA SCIENCE I': 'statistics-1',
    'STATISTICS FOR DATA SCIENCE II': 'statistics-2', 'ENGLISH I': 'english-1', 'ENGLISH II': 'english-2',
    'INTRODUCTION TO PYTHON': 'python', 'PROGRAMMING IN PYTHON': 'python',
    'MACHINE LEARNING FOUNDATIONS': 'mlf', 'MACHINE LEARNING TECHNIQUES': 'mlt', 'MACHINE LEARNING PRACTICE': 'mlp',
    'BUSINESS DATA MANAGEMENT': 'bdm', 'BUSINESS ANALYTICS': 'business-analytics', 'TOOLS IN DATA SCIENCE': 'tds',
    'DATABASE MANAGEMENT SYSTEMS': 'dbms', 'PROGRAMMING DATA STRUCTURES AND ALGORITHMS USING PYTHON': 'pdsa',
    'PROGRAMMING CONCEPTS USING JAVA': 'java', 'MODERN APPLICATION DEVELOPMENT I': 'mad-1',
    'MODERN APPLICATION DEVELOPMENT II': 'mad-2', 'SYSTEM COMMANDS': 'system-commands',
    'INTRODUCTION TO DEEP LEARNING AND GENERATIVE AI': 'dl-genai',
    'SOFTWARE ENGINEERING': 'software-engineering', 'SOFTWARE TESTING': 'software-testing',
    'AI SEARCH METHODS FOR PROBLEM SOLVING': 'ai-search', 'DEEP LEARNING': 'deep-learning',
    'STRATEGIES FOR PROFESSIONAL GROWTH': 'spg', 'PROGRAMMING IN C': 'programming-in-c',
    'ALGORITHMIC THINKING IN BIOINFORMATICS': 'algorithmic-thinking-bio', 'BIG DATA AND BIOLOGICAL NETWORKS': 'bbn',
    'STATISTICAL COMPUTING': 'statistical-computing', 'MATHEMATICAL THINKING': 'mathematical-thinking',
    'LINEAR STATISTICAL MODELS': 'lsm', 'ADVANCED ALGORITHMS': 'advanced-algorithms', 'OPERATING SYSTEMS': 'operating-systems',
    'COMPUTER SYSTEM DESIGN': 'computer-system-design', 'COMPUTER SYSTEM DESIGNS': 'computer-system-design',
    'COMPUTER SYSTEMS DESIGN': 'computer-system-design', 'DISCRETE MATHEMATICS': 'discrete-mathematics',
    'MANAGERIAL ECONOMICS': 'managerial-economics', 'CORPORATE FINANCE': 'corporate-finance',
    'FINANCIAL FORENSICS': 'financial-forensics', 'PRIVACY SECURITY IN ONLINE SOCIAL MEDIA': 'psosm',
    'GAME THEORY AND STRATEGY': 'game-theory', 'GAME THEORY': 'game-theory', 'SPEECH TECHNOLOGY': 'speech-technology',
    'INTRODUCTION TO NATURAL LANGUAGE PROCESSING': 'inlp', 'LARGE LANGUAGE MODELS': 'llm',
    'MATHEMATICAL FOUNDATIONS OF GENERATIVE AI': 'genai-math', 'DATA VISUALIZATION DESIGN': 'dvd',
    'COMPILER DESIGN': 'compiler-design', 'COMPUTER NETWORKS': 'computer-networks',
    'DEEP LEARNING FOR COMPUTER VISION': 'dl-cv', 'DEEP LEARNING PRACTICE': 'dlp', 'REINFORCEMENT LEARNING': 'rl',
    'INDUSTRY 4 0': 'industry-4', 'MARKET RESEARCH': 'market-research',
    'PROGRAMMING IN STATISTICAL METHODS': 'psm',
    # Electronic Systems
    'ELECTRONIC SYSTEMS THINKING AND CIRCUITS': 'estc', 'DIGITAL SYSTEMS': 'digital-systems',
    'ELECTRICAL AND ELECTRONIC CIRCUITS': 'eec', 'MATHEMATICS FOR ELECTRONICS I': 'es-math-1',
    'MATHEMATICS FOR ELECTRONICS II': 'es-math-2', 'INTRODUCTION TO LINUX SHELL': 'es-linux',
    'EMBEDDED C PROGRAMMING': 'embedded-c', 'SIGNALS AND SYSTEMS': 'signals-systems', 'PYTHON PROGRAMMING': 'es-python',
    'DIGITAL SYSTEM DESIGN': 'dsd', 'SENSORS AND APPLICATIONS': 'sensors', 'CONTROL ENGINEERING': 'control-engineering',
    'DIGITAL SIGNAL PROCESSING': 'dsp', 'ANALOG ELECTRONIC SYSTEMS': 'aes', 'ELECTRONIC PRODUCT DESIGN': 'epd',
    'COMPUTER ORGANIZATION': 'computer-organization', 'ELECTRONICS FOR TEST AND MEASUREMENT': 'etm',
    'ELECTROMAGNETIC FIELDS AND TRANSMISSION LINES': 'eftl', 'FPGA DESIGN': 'fpga',
    'SYSTEM DESIGN WITH VERILOG AND VLSI': 'sdvl',
    'DATA VISUALIZATION': 'dvd',
    # Courses added to the site with these papers (migration 0014).
    'ALGORITHMS FOR DATA SCIENCE': 'ads', 'DESIGN THINKING FOR DATA DRIVEN APP DEVELOPMENT': 'design-thinking',
    'DESIGN THINKING': 'design-thinking', 'INTRODUCTION TO BIG DATA': 'intro-big-data',
    'DATA SCIENCE AND AI LAB': 'ds-ai-lab', 'INTRODUCTION TO C PROGRAMMING': 'es-c-programming',
}
NAME_MAP = {
    'CT': 'computational-thinking', 'SEM1 CT': 'computational-thinking', 'COMPUTATIONAL THINKING': 'computational-thinking',
    'MATHS1': 'maths-1', 'MATHS 1': 'maths-1', 'SEM1 MATHS1': 'maths-1', 'MATHEMATICS FOR DATA SCIENCE I': 'maths-1',
    'MATHS2': 'maths-2', 'MATHS 2': 'maths-2', 'SEM2 MATHS2': 'maths-2', 'MATHEMATICS FOR DATA SCIENCE II': 'maths-2',
    'STATISTICS1': 'statistics-1', 'SEM1 STATISTICS1': 'statistics-1', 'SEM1 STATS1': 'statistics-1', 'STATS 1': 'statistics-1',
    'STATISTICS FOR DATA SCIENCE I': 'statistics-1',
    'STATISTICS2': 'statistics-2', 'STATISTICS 2': 'statistics-2', 'SEM2 STATISTICS2': 'statistics-2', 'SEM2 STATS2': 'statistics-2',
    'STATISTICS FOR DATA SCIENCE II': 'statistics-2',
    'ENGLISH1': 'english-1', 'SEM1 ENGLISH1': 'english-1', 'SEM1 ENG1': 'english-1', 'ENGLISH I': 'english-1',
    'ENGLISH2': 'english-2', 'SEM2 ENGLISH2': 'english-2', 'SEM2 ENG2': 'english-2', 'ENGLISH II': 'english-2',
    'SEM2 INTRO TO PYTHON': 'python', 'INTRO TO PYTHON': 'python', 'PYTHON': 'python',
    'APP DEV1': 'mad-1', 'APPDEV 1': 'mad-1', 'APPDEV1': 'mad-1', 'APP DEV2': 'mad-2', 'APPDEV 2': 'mad-2', 'APPDEV2': 'mad-2',
    'BA': 'business-analytics', 'ENGLISH 1': 'english-1', 'DATA VIZ': 'dvd',
    'ADS': 'ads', 'DESIGN THINKING': 'design-thinking', 'INTRO TO BIGDATA': 'intro-big-data',
    'INTRO TO BIG DATA': 'intro-big-data', 'INTRODUCTION TO BIG DATA': 'intro-big-data', 'DS AI LAB': 'ds-ai-lab',
    'INTRO TO C PROGRAMMING': 'es-c-programming', 'C PROGRAMMING': 'es-c-programming',
}
# Courses with no subject on the site yet, and sections that are not a course.
UNMAPPED = collections.Counter()


def subject_of(section, program):
    title, name = norm(section['title']), norm(section['name'])
    slug = TITLE_MAP.get(title) or NAME_MAP.get(name) or TITLE_MAP.get(name)
    if not slug:
        for s in subjects.values():
            if name and (norm(s['name']) == name or name in [norm(a) for a in (s['aliases'] or [])]):
                slug = s['slug']
                break
    if not slug:
        UNMAPPED[(section['name'], section['title'])] += 1
        return None
    # The Electronic Systems papers share some course names with Data Science.
    if program == 'es':
        slug = {'english-1': 'es-english-1', 'python': 'es-python', 'computer-system-design': 'es-computer-system-design'}.get(slug, slug)
    return slug


# ---- sections -------------------------------------------------------------
def is_notice(q):
    text = ' '.join(b.get('text', '') for b in q['body']).upper()
    return (q['marks'] or 0) == 0 and ('QUESTION PAPER FOR THE SUBJECT' in text or 'ARE YOU SURE' in text
                                       or 'USEFUL DATA HAS BEEN MENTIONED' in ' '.join(b.get('text', '') for o in q['options'] for b in o['content']).upper()
                                       or not q['body'] or len(q['options']) == 2)


def fingerprint(q):
    # TCS numbers questions afresh in every paper, so identical sections in
    # different papers only match by content: text, type, marks, figures.
    def text(blocks):
        return re.sub(r'[^a-z0-9]+', '', ' '.join(b.get('text', '') for b in blocks).lower())

    def figs(blocks):
        return sum(1 for b in blocks if b['t'] == 'img')

    parts = [q['type'], str(q['marks']), text(q['body']), str(figs(q['body']))]
    parts += sorted(text(o['content']) + '#' + str(figs(o['content'])) for o in q['options'])
    parts.append('|'.join(q['sa'].get('answers') or []))
    return hashlib.md5('\n'.join(parts).encode('utf8')).hexdigest()


unique = {}
for m in metas:
    d = json.load(open(f"parsed/{m['id']}.json", encoding='utf8'))
    for idx, sec in enumerate(d['sections']):
        qs = [q for q in sec['questions'] if not is_notice(q)]
        if not qs:
            continue
        slug = subject_of(sec, m['program'])
        if not slug:
            continue
        real_ids = all(q['id'].isdigit() for q in qs)
        exam = 'qualifier' if (sec['title'] or '').upper().startswith('QUALIFIER LEVEL') and m['exam'] in REGULAR else m['exam']
        # A repeat is only the same paper: same subject, exam and date, and
        # the same questions.
        key = (slug, exam, m['date'], tuple(sorted(fingerprint(q) for q in qs)))
        entry = unique.setdefault(key, {
            'subject': slug, 'exam': exam, 'date': m['date'], 'term': m['term2'],
            'questions': len(qs), 'marks': sum(q['marks'] or 0 for q in qs),
            'sources': [], 'id_based': real_ids,
        })
        entry['sources'].append({'pdf': m['id'], 'section': idx, 'set': m['set'], 'paper': m['paper_name'], 'program': m['program']})

sections = list(unique.values())
json.dump(sections, open('catalog.json', 'w', encoding='utf8'), indent=1)

print('unique sections', len(sections), '| questions', sum(s['questions'] for s in sections))
print('unmapped section names:')
for (n, t), c in UNMAPPED.most_common():
    print(f'   {c:4} {n} | {t}')
table = collections.Counter((s['term'], s['exam'], s['date']) for s in sections)
print('\nterm/exam/date -> unique sections')
for k in sorted(table, key=lambda k: (k[2] or '', k[1])):
    print('  ', k, table[k])
