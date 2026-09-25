import json, os, sys
from multiprocessing import Pool
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from parse_tcs import parse

def work(f):
    src, out = f"pdf/{f['id']}.pdf", f"parsed/{f['id']}.json"
    if not os.path.exists(src) or os.path.exists(out):
        return None
    try:
        data = parse(src, 'img', render_images=False)
        with open(out, 'w', encoding='utf8') as fh:
            json.dump(data, fh, ensure_ascii=False)
        n = sum(len(s['questions']) for s in data['sections'])
        return f"ok   {f['term']} {f['exam']} {data['paper_name']} | {len(data['sections'])} sec {n} q"
    except Exception as e:
        return f"FAIL {f['id']} {f['name']}: {type(e).__name__}: {e}"

if __name__ == '__main__':
    lst = json.load(open('pdf-list.json', encoding='utf8'))
    os.makedirs('parsed', exist_ok=True)
    with Pool(3) as pool:
        for line in pool.imap_unordered(work, lst):
            if line: print(line, flush=True)
    print('done', flush=True)
