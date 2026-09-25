import json, os, re, collections
import fitz
MONTHS = {m: i + 1 for i, m in enumerate(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'])}
MON = r'(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*'

def term_year(term, month):
    season, year = term.split('-'); year = int(year)
    if season == 'sep' and month <= 2: return year + 1
    return year

def find_date(texts, term):
    for t in texts:
        if not t: continue
        s = t.lower()
        m = re.search(r'(\d{4})\s*' + MON + r'\s*(\d{1,2})\b', s)          # 2025 Oct26
        if m: return f'{int(m.group(1)):04d}-{MONTHS[m.group(2)[:3]]:02d}-{int(m.group(3)):02d}'
        m = re.search(r'\b(\d{1,2})\s*(?:st|nd|rd|th)?\s*' + MON + r'\.?\s*(\d{4})?', s)   # 26 Oct 2025 / 26 Oct
        if m:
            month = MONTHS[m.group(2)[:3]]
            year = int(m.group(3)) if m.group(3) else term_year(term, month)
            return f'{year:04d}-{month:02d}-{int(m.group(1)):02d}'
    return None

def exam_type(row_exam, name):
    n = (name or '').upper()
    if 'QUALIFIER' in n or 'REATTEMPT' in n:
        return 'diploma-qualifier' if 'DAD' in n else 'qualifier'
    return row_exam

def program(name):
    n = ' ' + (name or '').upper() + ' '
    return 'es' if ' ES ' in n else 'ds'

def set_code(name, fallback):
    n = re.sub(r'\s+', ' ', name or '').strip()
    m = re.search(r'\bEXAM ([A-Z0-9]+(?: S\d)?)\b', n)
    if m: return m.group(1).replace(' ', '-')
    m = re.search(r'\b(AN\d|FN\d|QP[A-Z]?\d?)\b', n)
    if m: return m.group(1)
    return fallback

def meta_of(f, d):
    fname = f['name'] or ''
    page1 = fitz.open(f"pdf/{f['id']}.pdf")[0].get_text()
    texts = [d['paper_name'], d['subject_line'], fname, ' '.join(f['path']), page1]
    return {
        'id': f['id'], 'term': f['term'], 'row_exam': f['exam'], 'tab': f['tab'],
        'paper_name': d['paper_name'], 'file': fname, 'path': '/'.join(f['path']),
        'date': find_date(texts, f['term']),
        'exam': exam_type(f['exam'], (d['paper_name'] or '') + ' ' + fname),
        'program': program((d['paper_name'] or '') + ' ' + fname),
        'set': set_code(d['paper_name'], None) or set_code(re.sub(r'\s+', ' ', page1), None) or os.path.splitext(fname)[0] or f['id'][:8],
    }

if __name__ == '__main__':
    lst = json.load(open('pdf-list.json', encoding='utf8'))
    metas = []
    for f in lst:
        p = f"parsed/{f['id']}.json"
        if not os.path.exists(p): continue
        d = json.load(open(p, encoding='utf8'))
        if not d['sections']: continue
        metas.append(meta_of(f, d))
    json.dump(metas, open('pdf-meta.json', 'w', encoding='utf8'), indent=1)
    by = collections.defaultdict(list)
    for m in metas: by[(m['term'], m['row_exam'])].append(m)
    order = ['may-2021','sep-2021','jan-2022','may-2022','sep-2022','jan-2023','may-2023','sep-2023','jan-2024','may-2024','sep-2024','jan-2025','may-2025','sep-2025']
    for key in sorted(by, key=lambda k: (order.index(k[0]), k[1])):
        ms = by[key]
        dates = collections.Counter(m['date'] for m in ms)
        exams = collections.Counter(m['exam'] for m in ms)
        print(key, len(ms), 'pdfs | dates', dict(dates), '| exams', dict(exams))
    print('no date:', [(m['term'], m['row_exam'], m['paper_name']) for m in metas if not m['date']][:20])
