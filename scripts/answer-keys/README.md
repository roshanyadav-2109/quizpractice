# Answer-key papers

Imports the official IITM answer-key PDFs (the TCS iON "Question Paper Name / Options shown in green are correct" papers) into the site, exactly, answer keys included.

These PDFs have a real text layer. Every question's type, marks, text and options are there as text; the answer key is the colour of each option (green is correct, red is not); equations, figures and code screenshots are embedded images. So nothing is transcribed by a model: the text is read, and the images are cut from the page.

## What it handles

- **Both layouts.** Papers from 2022 on print question and option ids. The 2021 papers print option letters, some print no question type (taken from the label), and some have no labels at all (the tick or cross icon is the key).
- **One paper per subject.** Each PDF is a whole sitting: every subject at that level, plus the improvement sections. It is split by section, and each section becomes one set of its subject's paper.
- **Repeats.** The same section appears in many PDFs (a Foundation paper and each improvement paper carry the same Computational Thinking questions), each time under new question ids. A section counts as a repeat only when the subject, exam, date and questions all match, and is then imported once.
- **Formatting.** Bold, italic and underline are kept. Underline is written `<u>…</u>`, which the site's question text renders (`src/lib/blocks/remark-underline.ts`). It matters: "the part of speech of the underlined word".
- **Comprehension.** A passage is put in front of each of its sub-questions.
- **Answers.** One numeric answer, or a range, is marked automatically (a range becomes its midpoint with a tolerance). Several accepted answers, or words, are shown as the answer but not auto-marked.
- **Images.** Each figure is rendered at 2x from the page. A paper's figures are then packed into one sheet (more if it would pass Cloudinary's size limits), and the site shows each figure as a window onto its part (`region` on the image reference). Cloudinary counts every upload against the plan, so a sheet per paper is about 1,300 uploads where single figures would be 36,000. Sheets are served as uploaded (`delivery: "original"`), so viewing them costs no transformations. They live on a second Cloudinary account (`CLOUDINARY_SHEETS_*` in `.env.local`, and `cloud` on each reference).

## Running it

Needs Python with PyMuPDF and Pillow, and the repo's `.env.local`. Work in a folder outside the repo. `$K` below is this folder.

```sh
# 1. The sheet's links. The HTML export keeps every link in a cell.
curl -L -o sheet.zip "https://docs.google.com/spreadsheets/d/<sheet id>/export?format=zip"
unzip -o sheet.zip -d sheet_html
node $K/sheet-links.mjs                 # sheet-cells.json
node $K/list-drive.mjs                  # drive-files.json, pdf-list.json
node $K/download.mjs                    # pdf/<id>.pdf

# 2. Read the papers.
python $K/parse_all.py                  # parsed/<id>.json
python $K/catalog_meta.py               # pdf-meta.json: date, exam, set, programme
node $K/export-db.mjs <repo>            # subjects.json, db-inventory.json
node $K/crawl-old-site.mjs              # old-inventory.json (optional)
python $K/catalog.py                    # catalog.json: every unique section
python $K/compare.py                    # missing.json, and what the site lacks

# 3. Convert what is missing, check it, upload, import.
python $K/convert.py [subject ...]      # drive-papers/, img/
npx tsx $K/validate.mts drive-papers    # from the repo root
python $K/sheets.py drive-papers sheets   # sheets/*.png, sheets/map.json
node $K/upload-sheets.mjs <repo> drive-papers sheets drive-final sheets-uploaded.json
npx tsx $K/import.mts <work>/drive-final <work>/import.log   # from the repo root
```

Every step can be re-run. The download, parse, render and upload skip what is done. The import logs each file and skips those already logged. Re-importing a set replaces its questions.

## Checking the result

`compare.py` prints what is still missing, and lists sections whose subject it could not name. `catalog.py` has the name and title maps; a new course needs a subject on the site (see `supabase/migrations/0014_subjects_from_papers.sql`) and a line in those maps.

A paper with no date anywhere in it (the September 2021 End Term) is left out rather than guessed.
