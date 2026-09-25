"""
Stage 3: turn each missing section into paper JSON for `npm run paper:import`,
rendering its figures to PNG on the way.

    python convert.py            # every missing (subject, exam, date)
    python convert.py maths-1    # only these subjects
"""
import io
import json
import os
import re
import sys
from collections import defaultdict
from multiprocessing import Pool

import fitz
from PIL import Image

OUT = 'drive-papers'
IMG = os.path.abspath('img')
ZOOM = 2.0

cat = json.load(open('catalog.json', encoding='utf8'))
missing = {tuple(x[:3]) for x in json.load(open('missing.json'))['missing']}
subjects = {s['slug']: s for s in json.load(open('subjects.json', encoding='utf8'))}
only = set(sys.argv[1:])


# ---- markdown ---------------------------------------------------------------
def escape(line):
    return re.sub(r'([\\`*_\[\]<>#|~$&{}])', r'\\\1', line)


def line_start(line):
    # Would otherwise start a list, a heading or a rule.
    line = re.sub(r'^(\s*)([-+=])', r'\1\\\2', line)
    return re.sub(r'^(\s*\d+)([.)])', r'\1\\\2', line)


def text_block(rows):
    out = ''
    for i, row in enumerate(rows):
        # The parser's markdown keeps bold, italic and underline.
        line = line_start((row.get('md') or escape(row['text'])).strip())
        if i == 0:
            out = line
        elif rows[i - 1]['x1'] > 500:
            out += ' ' + line  # the previous line ran to the margin and wrapped
        else:
            out += '\\\n' + line  # a real line break (code, lists, short lines)
    return {'type': 'text', 'md': out}


def blocks(rows, pdf, alt, refs):
    result, run = [], []
    for row in rows:
        if row['t'] == 'text':
            run.append(row)
            continue
        if run:
            result.append(text_block(run))
            run = []
        refs.append((pdf, row))
        result.append({
            'type': 'image', 'alt': alt,
            'image': {'provider': 'cloudinary', 'public_id': row['public_id'], 'source_url': os.path.join(IMG, row['file'])},
        })
    if run:
        result.append(text_block(run))
    return [b for b in result if b['type'] != 'text' or b['md'].strip()]


# ---- answers ----------------------------------------------------------------
def number(value):
    try:
        return float(value)
    except ValueError:
        return None


def clean(x):
    return float(f'{x:.10g}')


def sa_fields(sa):
    answers = sa.get('answers') or []
    numeric = sa.get('Response Type') == 'Numeric'
    kind = sa.get('Answers Type')
    if numeric and kind == 'Range' and len(answers) == 1:
        m = re.match(r'^\s*(-?[\d.]+)\s*to\s*(-?[\d.]+)\s*$', answers[0])
        if m:
            lo, hi = sorted((float(m.group(1)), float(m.group(2))))
            return {'type': 'numerical', 'correct_answer': clean((lo + hi) / 2), 'answer_tolerance': clean((hi - lo) / 2)}
    if numeric and len(answers) == 1 and number(answers[0]) is not None:
        return {'type': 'numerical', 'correct_answer': answers[0].strip(), 'answer_tolerance': 0}
    # Several accepted answers, or words: shown, not auto-marked.
    fields = {'type': 'subjective'}
    if answers:
        fields['correct_answer'] = ' or '.join(a.strip() for a in answers)
    return fields


# ---- one section ------------------------------------------------------------
def notice(q):
    text = ' '.join(b.get('text', '') for b in q['body']).upper()
    opts = ' '.join(b.get('text', '') for o in q['options'] for b in o['content']).upper()
    return (q['marks'] or 0) == 0 and ('QUESTION PAPER FOR THE SUBJECT' in text or 'ARE YOU SURE' in text
                                       or 'USEFUL DATA HAS BEEN MENTIONED' in opts or not q['body'] or len(q['options']) == 2)


def build(entry, set_code, prefix):
    src = entry['sources'][0]
    d = json.load(open(f"parsed/{src['pdf']}.json", encoding='utf8'))
    sec = d['sections'][src['section']]
    refs = []

    def tag(rows):
        for r in rows:
            if r['t'] == 'img':
                r['public_id'] = f"{prefix}/{os.path.splitext(r['file'])[0]}"
        return rows

    passages = {pid: blocks(tag(rows), src['pdf'], 'Figure from the passage in the original paper', refs)
                for pid, rows in sec['passages'].items()}
    questions = []
    for q in sec['questions']:
        if notice(q):
            continue
        body = list(passages.get(q['passage']) or []) + blocks(tag(q['body']), src['pdf'], 'Figure from the original question paper', refs)
        if not body:
            body = [{'type': 'text', 'md': '(The question is shown in the options.)'}]
        question = {'number': len(questions) + 1, 'marks': q['marks'] or 0, 'body': body}
        if q['wrong']:
            question['negative_marks'] = q['wrong']
        if q['type'] in ('MCQ', 'MSQ'):
            question['type'] = 'msq' if q['type'] == 'MSQ' else 'mcq'
            question['options'] = []
            for i, o in enumerate(q['options']):
                content = blocks(tag(o['content']), src['pdf'], 'Option figure from the original question paper', refs)
                option = {'label': chr(65 + i), 'content': content or [{'type': 'text', 'md': '—'}]}
                if o['correct']:
                    option['is_correct'] = True
                question['options'].append(option)
        else:
            question.update(sa_fields(q['sa']))
        questions.append(question)

    paper = {
        'schema_version': 1,
        'subject': entry['subject'],
        'exam_type': entry['exam'],
        'session_date': entry['date'],
        'set_code': set_code,
        'title': re.sub(r'\s+', ' ', src['paper'] or '').strip() or None,
        'total_marks': sum(q['marks'] for q in questions),
        'source': {'extracted_by': 'tcs-answer-key-pdf', 'confidence': 1, 'reviewed': False},
        'questions': questions,
    }
    if not paper['title']:
        del paper['title']
    return paper, refs


CONTROL = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f]')


def clean_strings(node):
    """Control characters from the PDF text layer (NUL above all) that
    Postgres will not store in jsonb. Newlines and tabs stay."""
    if isinstance(node, str):
        return CONTROL.sub('', node)
    if isinstance(node, list):
        return [clean_strings(n) for n in node]
    if isinstance(node, dict):
        return {k: clean_strings(v) for k, v in node.items()}
    return node


def render(job):
    pdf, rows = job
    doc = fitz.open(f'pdf/{pdf}.pdf')
    for row in rows:
        path = os.path.join(IMG, row['file'])
        if os.path.exists(path):
            continue
        x0, y0, x1, y1 = row['bbox']
        pix = doc[row['page']].get_pixmap(matrix=fitz.Matrix(ZOOM, ZOOM), clip=fitz.Rect(x0 - 1, y0 - 1, x1 + 1, y1 + 1), alpha=False)
        image = Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGB')
        tmp = path + f'.{os.getpid()}.tmp'
        image.quantize(colors=64, method=Image.Quantize.MEDIANCUT).save(tmp, 'PNG', optimize=True)
        os.replace(tmp, path)
    return len(rows)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(IMG, exist_ok=True)
    groups = defaultdict(list)
    for entry in cat:
        key = (entry['subject'], entry['exam'], entry['date'])
        if key in missing and entry['date'] and (not only or entry['subject'] in only):
            groups[key].append(entry)

    jobs = defaultdict(list)
    written = 0
    for (slug, exam, date), entries in sorted(groups.items()):
        program = subjects[slug]['level']['program']['slug']
        used = set()
        for entry in sorted(entries, key=lambda e: e['sources'][0]['set']):
            code = entry['sources'][0]['set']
            n = 2
            while code in used:
                code = f"{entry['sources'][0]['set']}-{n}"
                n += 1
            used.add(code)
            prefix = f'qp/{program}/{slug}/{exam}/{date}/set-{code}'
            paper, refs = build(entry, code, prefix)
            if not paper['questions']:
                continue
            for pdf, row in refs:
                jobs[pdf].append(row)
            paper = clean_strings(paper)
            path = os.path.join(OUT, date, f'{slug}-{exam}-{code}.json')
            os.makedirs(os.path.dirname(path), exist_ok=True)
            json.dump(paper, open(path, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
            written += 1

    print('papers written', written, '| images to render', sum(len(v) for v in jobs.values()))
    with Pool(3) as pool:
        done = sum(pool.imap_unordered(render, list(jobs.items())))
    print('rendered', done)
