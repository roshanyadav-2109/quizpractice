"""
Stage 1: parse a TCS iON answer-key PDF into sections and questions.

    python parse_tcs.py <pdf> <out.json> <img_dir>

The PDFs carry a real text layer: every question's id, type and marks, its
text, its options with ids, and the answer key as colour (green = correct,
red = incorrect). Figures and typeset maths are embedded images, rendered
here to PNG by their on-page box and named by question or option id, so a
section that appears in several PDFs yields the same files.
"""
import json
import os
import re
import sys

import hashlib
import io

import fitz
from PIL import Image

GREEN, RED = 0x008000, 0xFF0000
ZOOM = 2.0

# Older papers (2021 to early 2022) print no question ids, and label options
# A., B. rather than by id.
Q_START = re.compile(r'^Question Number : (\d+)\s*(?:Question Id : (\d+)\s*)?(?:Question Type : ([A-Z_]+))?')
# Some 2021 papers print no type; the label says it instead.
LABEL_TYPE = {
    'Multiple Choice Question': 'MCQ', 'Multiple Select Question': 'MSQ',
    'Short Answer Question': 'SA', 'Comprehension': 'COMPREHENSION',
}
COMP_START = re.compile(r'^(?:Question Number : \d+ )?(?:Question Id : (\d+) )?Question Type : COMPREHENSION')
COMP_RANGE = re.compile(r'Question Numbers : \((\d+) to (\d+)\)')
OPTION_ID = re.compile(r'^(\d{10,}|[A-Z])\.\s*$')
MARKS = re.compile(r'Correct Marks : ([\d.]+)')
WRONG = re.compile(r'Wrong Marks : ([\d.]+)')

# Lines that open a run of paper, section or sub-section settings, which ends
# at the next question.
META_OPENERS = (
    'Sub-Section Number :', 'Section Id :', 'Group Number :', 'Group Id :',
    'Show Attended Group?', 'Section Number :', 'Number of Questions :',
)
PAGE_FOOTER = re.compile(r'^Page \d+ of \d+$')
SA_KEYS = ('Response Type :', 'Evaluation Required For SA', 'Show Word Count', 'Answers Type :', 'Text Areas :')

SUPERSCRIPT = str.maketrans('0123456789+-=()ni', '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ')


def span_text(span):
    text = span['text']
    if span['flags'] & 1 and text.strip():  # superscript
        stripped = text.strip()
        if all(c in '0123456789+-=()ni' for c in stripped):
            return stripped.translate(SUPERSCRIPT)
        return '^(' + stripped + ')'
    return text


def escape(text):
    """Markdown-safe: every character that could start syntax is escaped."""
    return re.sub(r'([\\`*_\[\]<>#|~$&{}])', r'\\\1', text)


def rules_of(page):
    """The visible horizontal strokes on a page: underlines, in practice."""
    rules = []
    for d in page.get_drawings():
        colour, fill = d.get('color'), d.get('fill')
        visible = (colour and not all(v > 0.9 for v in colour)) or (fill and not all(v > 0.9 for v in fill))
        if not visible:
            continue
        for item in d['items']:
            if item[0] == 'l':
                p1, p2 = item[1], item[2]
                if abs(p1.y - p2.y) < 1.5 and abs(p1.x - p2.x) > 3:
                    rules.append((min(p1.x, p2.x), max(p1.x, p2.x), (p1.y + p2.y) / 2))
            elif item[0] == 're':
                r = item[1]
                if r.height < 1.8 and r.width > 3:
                    rules.append((r.x0, r.x1, (r.y0 + r.y1) / 2))
    return rules


def underlined(bbox, rules):
    x0, y0, x1, y1 = bbox
    width = max(x1 - x0, 1)
    for rx0, rx1, ry in rules:
        if y0 + 0.55 * (y1 - y0) <= ry <= y1 + 3 and (min(x1, rx1) - max(x0, rx0)) / width > 0.6:
            return True
    return False


def line_md(spans, rules):
    """A line as markdown, keeping bold, italic and underline."""
    runs = []
    for span in spans:
        text = span_text(span)
        if not text:
            continue
        style = (
            'Bold' in span['font'] or bool(span['flags'] & 16),
            'Italic' in span['font'] or 'Oblique' in span['font'] or bool(span['flags'] & 2),
            bool(text.strip()) and underlined(span['bbox'], rules),
        )
        if runs and runs[-1][0] == style:
            runs[-1][1] += text
        else:
            runs.append([style, text])
    out = ''
    for (bold, italic, under), text in runs:
        core = text.strip()
        if not core:
            out += text
            continue
        lead = text[:len(text) - len(text.lstrip())]
        trail = text[len(text.rstrip()):]
        md = escape(core)
        if italic:
            md = f'*{md}*'
        if bold:
            md = f'**{md}**'
        if under:
            md = f'<u>{md}</u>'
        out += lead + md + trail
    return out.rstrip()


def rows_of(page, page_no):
    """Every text line and image on a page, top to bottom."""
    rows = []
    rules = rules_of(page)
    for block in page.get_text('dict')['blocks']:
        if block['type'] == 1:
            x0, y0, x1, y1 = block['bbox']
            if x1 - x0 < 14 and y1 - y0 < 14:
                # The tick and cross icons. Kept, as the only answer key in
                # papers whose options carry no label.
                digest = hashlib.md5(block.get('image') or b'').hexdigest()
                rows.append({'kind': 'icon', 'page': page_no, 'bbox': [x0, y0, x1, y1], 'hash': digest})
                continue
            rows.append({'kind': 'img', 'page': page_no, 'bbox': [x0, y0, x1, y1]})
            continue
        for line in block['lines']:
            text = ''.join(span_text(s) for s in line['spans'])
            if not text.strip() or PAGE_FOOTER.match(text.strip()):
                continue
            rows.append({
                'kind': 'text', 'page': page_no, 'bbox': list(line['bbox']),
                'text': text.rstrip(), 'md': line_md(line['spans'], rules),
                'color': line['spans'][0]['color'],
                'bold': 'Bold' in line['spans'][0]['font'],
            })
    rows.sort(key=lambda r: (round(r['bbox'][1]), r['bbox'][0]))
    return rows


def parse(pdf_path, img_dir, render_images=True):
    doc = fitz.open(pdf_path)
    first = doc[0].get_text()
    # The name can wrap onto a second line.
    name = re.search(r'Question Paper Name :\n(.+?)\n(?:Subject Name|Creation Date|Duration|Total Marks) :', first, re.S)
    subject_line = re.search(r'Subject Name :\n([^\n]+)', first)
    duration = re.search(r'Duration :\n(\d+)', first)
    total = re.search(r'Total Marks :\n([\d.]+)', first)
    file_key = os.path.splitext(os.path.basename(pdf_path))[0]

    rows = []
    for i, page in enumerate(doc):
        rows.extend(rows_of(page, i))

    # Page 1's legend shows the tick first, then the cross.
    legend = [r['hash'] for r in rows if r['kind'] == 'icon' and r['page'] == 0]
    tick = legend[0] if legend else None

    # A section's name is the line just above its "Section Id :" - or, in the
    # older papers, the last text above "Number of Questions :", skipping the
    # counts printed beside the labels.
    older = not any(r['kind'] == 'text' and r['text'].startswith('Section Id :') for r in rows)
    for i, row in enumerate(rows):
        if row['kind'] != 'text' or i == 0:
            continue
        if row['text'].startswith('Section Id :'):
            rows[i - 1]['section_name'] = True
        elif older and row['text'].startswith('Number of Questions :'):
            j = i - 1
            while j >= 0 and (rows[j]['kind'] != 'text' or rows[j]['text'].strip().replace('.', '').isdigit()):
                j -= 1
            if j >= 0 and not rows[j]['text'].startswith(('Question', 'Total Marks', 'Section', 'Correct Marks')):
                rows[j]['section_name'] = True

    sections = []
    section = None
    question = None
    passage = None
    state = 'meta'

    def close_question():
        nonlocal question
        if question is not None and section is not None:
            section['questions'].append(question)
        question = None

    for i, row in enumerate(rows):
        text = row.get('text', '')

        if row['kind'] == 'icon':
            if state == 'options' and question is not None and row['bbox'][0] < 100:
                question.setdefault('icons', []).append(row)
            continue

        if row.get('section_name'):
            close_question()
            passage = None
            section = {'name': text.strip(), 'questions': []}
            sections.append(section)
            state = 'meta'
            continue

        if row['kind'] == 'text':
            # Checked first: in the older papers a passage also opens with
            # "Question Number :".
            m = COMP_START.match(text)
            if m:
                close_question()
                pid = m.group(1) or f'{file_key}-{len(sections)}-p{i}'
                passage = {'id': pid, 'from': 0, 'to': 0, 'body': []}
                section and section.setdefault('passages', {}).__setitem__(pid, passage)
                state = 'passage-head'
                continue
            m = Q_START.match(text)
            if m:
                close_question()
                number, qid, qtype = int(m.group(1)), m.group(2), m.group(3)
                if not qid:
                    qid = f'{file_key}-{len(sections)}-{number}'
                if passage and not (passage['from'] <= number <= passage['to']):
                    passage = None
                question = {
                    'number': number, 'id': qid, 'type': qtype, 'marks': None, 'wrong': 0,
                    'body': [], 'options': [], 'sa': {}, 'passage': passage['id'] if passage else None,
                    'page': row['page'] + 1,
                }
                marks = MARKS.search(text)
                if marks:
                    question['marks'] = float(marks.group(1))
                state = 'head'
                continue
            if text.startswith(META_OPENERS):
                close_question()
                state = 'meta'
                continue

        if state == 'meta':
            continue

        if state == 'passage-head':
            if row['kind'] == 'text':
                rng = COMP_RANGE.search(text)
                if rng:
                    passage['from'], passage['to'] = int(rng.group(1)), int(rng.group(2))
                if text.startswith('Question Label :'):
                    state = 'passage'
            continue

        if state == 'passage':
            if row['kind'] == 'text' and text.strip() == 'Sub questions':
                state = 'meta'
                continue
            passage['body'].append(row)
            continue

        if question is None:
            continue

        if state == 'head':
            if row['kind'] == 'text':
                marks = MARKS.search(text)
                if marks:
                    question['marks'] = float(marks.group(1))
                wrong = WRONG.search(text)
                if wrong:
                    question['wrong'] = float(wrong.group(1))
                if text.startswith('Question Label :'):
                    label = text.split(':', 1)[1].strip()
                    if not question['type']:
                        question['type'] = LABEL_TYPE.get(label)
                    if question['type'] == 'COMPREHENSION':
                        # A passage printed as if it were a question.
                        pid = question['id']
                        passage = {'id': pid, 'from': question['number'] + 1, 'to': 10 ** 6, 'body': []}
                        section and section.setdefault('passages', {}).__setitem__(pid, passage)
                        question = None
                        state = 'passage'
                        continue
                    state = 'stem'
            continue

        if state == 'stem':
            if row['kind'] == 'text' and text.strip() == 'Options :':
                state = 'options'
                continue
            if row['kind'] == 'text' and text.startswith(SA_KEYS):
                state = 'sa'
                # fall through to the sa handler below
            else:
                question['body'].append(row)
                continue

        if state == 'sa':
            if row['kind'] == 'text':
                for key in SA_KEYS:
                    if text.startswith(key):
                        question['sa'][key.rstrip(' :')] = text.split(':', 1)[1].strip()
                if text.strip() == 'Possible Answers :':
                    question['sa']['answers'] = []
                    state = 'answers'
            continue

        if state == 'answers':
            if row['kind'] == 'text' and text.strip():
                question['sa']['answers'].append(text.strip())
            continue

        if state == 'options':
            if row['kind'] == 'text':
                m = OPTION_ID.match(text.strip())
                if m and row['bbox'][0] < 100:
                    question['options'].append({
                        'id': m.group(1), 'correct': row['color'] == GREEN,
                        'page': row['page'], 'y': (row['bbox'][1] + row['bbox'][3]) / 2, 'rows': [],
                    })
                    continue
            question['options_pending'] = question.get('options_pending', [])
            question['options_pending'].append(row)
            continue

    close_question()

    # Hand each option's content to its option: an image goes to the option
    # whose id line sits inside its height (images are centred on it), a text
    # line to the last option that starts at or above it.
    for sec in sections:
        for q in sec['questions']:
            pending = q.pop('options_pending', [])
            icons = q.pop('icons', [])
            if not q['options'] and icons:
                # No labels: each tick or cross icon starts an option.
                for n, icon in enumerate(sorted(icons, key=lambda r: (r['page'], r['bbox'][1]))):
                    q['options'].append({
                        'id': chr(65 + n), 'correct': icon['hash'] == tick,
                        'page': icon['page'], 'y': (icon['bbox'][1] + icon['bbox'][3]) / 2, 'rows': [],
                    })
            opts = q['options']
            for row in pending:
                if not opts:
                    q['body'].append(row)
                    continue
                target = None
                if row['kind'] == 'img':
                    for o in opts:
                        if o['page'] == row['page'] and row['bbox'][1] - 2 <= o['y'] <= row['bbox'][3] + 2:
                            target = o
                            break
                if target is None:
                    key = (row['page'], row['bbox'][1] + 3)
                    earlier = [o for o in opts if (o['page'], o['y'] - 8) <= key]
                    target = earlier[-1] if earlier else opts[0]
                target['rows'].append(row)

    # Render every image once, named for what it belongs to.
    os.makedirs(img_dir, exist_ok=True)

    def render(rows, stem):
        out = []
        n = 0
        for row in rows:
            if row['kind'] != 'img':
                out.append({'t': 'text', 'text': row['text'], 'md': row['md'], 'x0': row['bbox'][0], 'x1': row['bbox'][2], 'bold': row['bold']})
                continue
            n += 1
            file = f'{stem}-{n}.png'
            path = os.path.join(img_dir, file)
            if render_images and not os.path.exists(path):
                x0, y0, x1, y1 = row['bbox']
                clip = fitz.Rect(x0 - 1, y0 - 1, x1 + 1, y1 + 1)
                pix = doc[row['page']].get_pixmap(matrix=fitz.Matrix(ZOOM, ZOOM), clip=clip, alpha=False)
                # A 64-colour palette keeps text renders crisp at a third of the size.
                image = Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGB')
                tmp = path + f'.{os.getpid()}.tmp'
                image.quantize(colors=64, method=Image.Quantize.MEDIANCUT).save(tmp, 'PNG', optimize=True)
                os.replace(tmp, path)
            out.append({'t': 'img', 'file': file, 'page': row['page'], 'bbox': [round(v, 2) for v in row['bbox']],
                        'w': round(row['bbox'][2] - row['bbox'][0]), 'h': round(row['bbox'][3] - row['bbox'][1])})
        return out

    result = []
    for sec in sections:
        passages = {pid: render(p['body'], f'p{pid}') for pid, p in sec.get('passages', {}).items()}
        qs = []
        for q in sec['questions']:
            qs.append({
                'number': q['number'], 'id': q['id'], 'type': q['type'], 'marks': q['marks'], 'wrong': q['wrong'],
                'page': q['page'], 'passage': q['passage'],
                'body': render(q['body'], f'q{q["id"]}'),
                # Older papers label options A, B, ... with no ids; their images
                # are named for the question too, or every paper's option A would
                # share one file.
                'options': [{'id': o['id'], 'correct': o['correct'],
                             'content': render(o['rows'], f'o{o["id"]}' if o['id'].isdigit() else f'o{q["id"]}-{o["id"]}')}
                            for o in q['options']],
                'sa': q['sa'],
            })
        # The "is this your subject?" question names the subject in full.
        title = None
        for q in qs[:2]:
            joined = ' '.join(b.get('text', '') for b in q['body'])
            m = re.search(r'QUESTION PAPER FOR THE SUBJECT\s*"([^"]+)"', joined)
            if m:
                title = re.sub(r'\s+', ' ', m.group(1)).strip()
                break
        result.append({'name': sec['name'], 'title': title, 'passages': passages, 'questions': qs})

    return {
        'file': os.path.basename(pdf_path),
        'pages': doc.page_count,
        'paper_name': re.sub(r'\s+', ' ', name.group(1)).strip() if name else None,
        'subject_line': subject_line.group(1).strip() if subject_line else None,
        'duration': int(duration.group(1)) if duration else None,
        'total_marks': float(total.group(1)) if total else None,
        'sections': result,
    }


if __name__ == '__main__':
    pdf, out, img_dir = sys.argv[1:4]
    data = parse(pdf, img_dir)
    with open(out, 'w', encoding='utf8') as f:
        json.dump(data, f, ensure_ascii=False)
    n = sum(len(s['questions']) for s in data['sections'])
    print(f"{data['paper_name']}: {len(data['sections'])} sections, {n} questions")
