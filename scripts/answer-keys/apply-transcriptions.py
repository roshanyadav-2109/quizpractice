"""
Puts the transcriptions into the converted papers: every figure crop that was
transcribed becomes text (and code) blocks; what was kept as a figure, or is
not transcribed yet, stays an image.

    python apply-transcriptions.py drive-papers transcriptions.json image-inventory.json drive-papers-text

image-inventory.json groups crops with identical pixels, so one transcription
covers every copy of the same image.
"""
import json
import os
import re
import sys

src, trans_path, inv_path, out = sys.argv[1:5]
transcriptions = json.load(open(trans_path, encoding='utf8'))
inventory = json.load(open(inv_path, encoding='utf8'))

# Every crop's public id -> the ids of all crops with the same pixels; a
# transcription filed under any of them serves them all.
group_of = {}
for members in inventory['groups'].values():
    for pid in members:
        group_of[pid] = members


def transcription(pid):
    found = [transcriptions[os.path.basename(m)] for m in group_of.get(pid, [pid]) if os.path.basename(m) in transcriptions]
    for entry in found:
        if entry['status'] in ('ok', 'unsure'):
            return entry
    return found[0] if found else None

FENCE = re.compile(r'```([A-Za-z0-9_+-]*)\n(.*?)\n?```', re.S)
DISPLAY = re.compile(r'(\$\$.*?\$\$)', re.S)


LIST_MARKER = re.compile(r'[ \t]*([-*+]|\d+[.)])[ \t]')


def hard_breaks(text):
    """A single newline the transcriber kept is a real line break - except
    between list items, where the newline already separates them and a
    trailing backslash would just print as a stray "\\"."""
    parts = DISPLAY.split(text)
    for i in range(0, len(parts), 2):
        def repl(m):
            return '\n' if LIST_MARKER.match(parts[i], m.end()) else '\\\n'
        parts[i] = re.sub(r'(?<![\n\\])\n(?!\n)', repl, parts[i])
    return ''.join(parts)


def blocks_of(md):
    blocks, last = [], 0
    for m in FENCE.finditer(md):
        prose = md[last:m.start()].strip()
        if prose:
            blocks.append({'type': 'text', 'md': hard_breaks(prose)})
        blocks.append({'type': 'code', 'language': m.group(1) or 'text', 'source': m.group(2)})
        last = m.end()
    prose = md[last:].strip()
    if prose:
        blocks.append({'type': 'text', 'md': hard_breaks(prose)})
    return blocks


stats = {'replaced': 0, 'kept': 0, 'pending': 0}


def convert(blocks):
    result = []
    for block in blocks:
        if block.get('type') != 'image':
            result.append(block)
            continue
        entry = transcription(block['image']['public_id'])
        if entry and entry['status'] in ('ok', 'unsure'):
            result.extend(blocks_of(entry['md']))
            stats['replaced'] += 1
        else:
            if entry and entry['status'] == 'keep':
                stats['kept'] += 1
                # The transcriber's note says what the figure shows: a real alt.
                if entry.get('reason'):
                    block = {**block, 'alt': entry['reason'][0].upper() + entry['reason'][1:]}
            else:
                stats['pending'] += 1
            result.append(block)
    return result


papers = 0
for folder, _, files in os.walk(src):
    for name in files:
        if not name.endswith('.json'):
            continue
        path = os.path.join(folder, name)
        paper = json.load(open(path, encoding='utf8'))
        for q in paper['questions']:
            q['body'] = convert(q['body']) or [{'type': 'text', 'md': '(The question is shown in the options.)'}]
            for option in q.get('options', []):
                option['content'] = convert(option['content']) or [{'type': 'text', 'md': '—'}]
        target = os.path.join(out, os.path.relpath(path, src))
        os.makedirs(os.path.dirname(target), exist_ok=True)
        json.dump(paper, open(target, 'w', encoding='utf8'), ensure_ascii=False)
        papers += 1

print(f"papers {papers} | figures transcribed {stats['replaced']} | kept as figures {stats['kept']} | not transcribed yet {stats['pending']}")
