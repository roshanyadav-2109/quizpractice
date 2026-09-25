"""
Packs each converted paper's figures into sheets: one image per paper (more
if it would pass Cloudinary's size limits), figures stacked top to bottom.
A sheet is one upload where the figures would be dozens, and the site shows
each figure as a window onto its part of the sheet.

    python sheets.py drive-papers sheets

Writes sheets/<paper>-<n>.png and sheets/map.json:
  { paper file: { "sheets": [{file, width, height}], "figures": {public_id: {sheet, x, y, width, height}} } }
"""
import json
import os
import sys

from PIL import Image

GAP = 8                     # white rows between figures
MAX_PIXELS = 20_000_000     # Cloudinary Free allows 25 MP per image
MAX_HEIGHT = 30_000


def figures(node, out):
    if isinstance(node, list):
        for n in node:
            figures(n, out)
    elif isinstance(node, dict):
        if isinstance(node.get('public_id'), str) and node.get('source_url'):
            out.setdefault(node['public_id'], node['source_url'])
        for v in node.values():
            figures(v, out)
    return out


def pack(items):
    """Split figures into sheets that stay inside the size limits."""
    sheets, current, height, width = [], [], 0, 0
    for public_id, image in items:
        w, h = image.size
        new_width, new_height = max(width, w), height + (GAP if current else 0) + h
        if current and (new_width * new_height > MAX_PIXELS or new_height > MAX_HEIGHT):
            sheets.append(current)
            current, height, width = [], 0, 0
            new_width, new_height = w, h
        current.append((public_id, image))
        width, height = new_width, new_height
    if current:
        sheets.append(current)
    return sheets


def main(src, out):
    os.makedirs(out, exist_ok=True)
    mapping = {}
    files = sorted(os.path.join(d, f) for d, _, fs in os.walk(src) for f in fs if f.endswith('.json'))
    for n, path in enumerate(files, 1):
        rel = os.path.relpath(path, src).replace('\\', '/')
        paper = json.load(open(path, encoding='utf8'))
        refs = figures(paper, {})
        if not refs:
            mapping[rel] = {'sheets': [], 'figures': {}}
            continue
        items = [(pid, Image.open(file).convert('RGB')) for pid, file in refs.items()]
        entry = {'sheets': [], 'figures': {}}
        stem = rel[:-5].replace('/', '__')
        for i, group in enumerate(pack(items), 1):
            width = max(img.size[0] for _, img in group)
            height = sum(img.size[1] for _, img in group) + GAP * (len(group) - 1)
            sheet = Image.new('RGB', (width, height), 'white')
            y = 0
            for public_id, img in group:
                sheet.paste(img, (0, y))
                entry['figures'][public_id] = {'sheet': i, 'x': 0, 'y': y, 'width': img.size[0], 'height': img.size[1]}
                y += img.size[1] + GAP
            name = f'{stem}-{i}.png'
            file = os.path.join(out, name)
            if not os.path.exists(file):
                tmp = file + '.tmp'
                sheet.quantize(colors=128, method=Image.Quantize.MEDIANCUT).save(tmp, 'PNG', optimize=True)
                os.replace(tmp, file)
            entry['sheets'].append({'file': name, 'width': width, 'height': height})
        mapping[rel] = entry
        if n % 100 == 0:
            print('papers', n, '/', len(files), flush=True)
    json.dump(mapping, open(os.path.join(out, 'map.json'), 'w', encoding='utf8'))
    sheets = sum(len(e['sheets']) for e in mapping.values())
    size = sum(os.path.getsize(os.path.join(out, s['file'])) for e in mapping.values() for s in e['sheets'])
    print(f'papers {len(mapping)} | sheets {sheets} | figures {sum(len(e["figures"]) for e in mapping.values())} | {size / 1e6:.0f} MB')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
