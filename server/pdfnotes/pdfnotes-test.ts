// Script tests for highlights and notes on PDFs: the words of a page laid out in reading order (a paper's two columns
// one after the other) with each character's place, on a paper typeset by LaTeX (test-files/paper.tex) and on the PDF
// code's own test files; words found again (hyphenated over a line's end too), the words inside an area, a paper's
// title; the routes (highlights by the reader and by their words alone, pictures of a page and of a part of it), notes
// that follow the file when Files moves it (or its folder) and when something else does, highlights found again when
// the file changes, the notes as a document in a project's knowledge that follows their changes, the highlights saved
// into the PDF as its own annotations (read back, saved again without doubling), and the agents' tool. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pdfnotes/pdfnotes-test.ts && DATA_DIR=/tmp/hydor-test-pdfnotes node dist/dev/pdfnotes-test.js
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { APP_ROOT, config } from '../config.ts';
import { setSettings } from '../assistants/store.ts';
import { openDb } from '../db.ts';
import { editPages, pdfInfo } from '../documents/pdf/index.ts';
import { PdfFile } from '../documents/pdf/file.ts';
import { isStr } from '../documents/pdf/objects.ts';
import { pages } from '../documents/pdf/pages.ts';
import { which } from '../documents/tools.ts';
import type { Deps, RunCtx, ToolOutput } from '../features/types.ts';
import { ruleFor } from '../guide/api.ts';
import { progress } from '../knowledge/indexer.ts';
import { searchKnowledge } from '../knowledge/search.ts';
import { docsOf, filesDir } from '../knowledge/store.ts';
import { fileAskInstructions } from '../fileask/index.ts';
import { setSessionExtra } from '../sessionExtra.ts';
import { createSpace } from '../spaces/index.ts';
import { hasOurs, withoutOurs, writeHighlights } from './annots.ts';
import { movedPdfNotes, NOTES_TOOL, pdfNotes } from './index.ts';
import { findRuns, loadPdf, runsOf, titleOf, wordsIn } from './layer.ts';
import { notesDocument } from './keep.ts';
import { readNotes } from './store.ts';
import { joinLines, type PdfHighlight, type PdfNotesView } from '../../shared/pdfnotes.ts';
import { pageGlyphs } from '../documents/pdf/text.ts';

if (!config.dataDir.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing real is touched.');
  process.exit(2);
}
fs.mkdirSync(config.dataDir, { recursive: true });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-pdfnotes-test-'));
const PAPER = path.join(APP_ROOT, 'server/pdfnotes/test-files/paper.pdf');
const PDFS = path.join(APP_ROOT, 'server/documents/pdf/test-files');
const poppler = !!(which('pdftoppm') && which('pdftotext'));
const notes: string[] = [];
const paper = fs.readFileSync(PAPER);

// ---- the words of a page ----------------------------------------------------------------------------------

{
  const l = loadPdf(PAPER);
  const runs = l.runs(1);
  const at = (s: string) => runs.findIndex((r) => r.text.includes(s));
  // Reading order: the left column, then the right one.
  for (const [a, b] of [
    ['Abstract', '1 Introduction'],
    ['1 Introduction', '2 Method'],
    ['2 Method', 'weight, and the weights go into an inverted index.'],
    ['weight, and the weights go into an inverted index.', '3 Experiments'],
    ['3 Experiments', '4 Conclusion'],
  ])
    assert.ok(at(a) >= 0 && at(a) < at(b), `“${a}” comes before “${b}”`);
  const mid = l.pages[0].width / 2;
  assert.ok(
    runs.filter((r) => r.y > 150 && r.y < 740).every((r) => r.x + r.w < mid + 2 || r.x > mid - 2),
    `between the title and the page's number, no run crosses from one column into the other: ${runs
      .filter((r) => r.y > 150 && r.y < 740 && !(r.x + r.w < mid + 2 || r.x > mid - 2))
      .map((r) => r.text)
      .join(' | ')}`,
  );
  assert.equal(runs[at('ranked list')].text, 'ranked list of documents. Classic systems score docu-');
  for (const r of runs) {
    assert.equal(r.edges.length, r.text.length + 1, 'an edge for each character, and the end');
    for (let i = 1; i < r.edges.length; i++) assert.ok(r.edges[i] >= r.edges[i - 1], 'edges never go back');
    assert.ok(Math.abs(r.edges[0] - r.x) < 0.01 && Math.abs(r.edges[r.edges.length - 1] - (r.x + r.w)) < 1.5, 'the edges span the run');
  }
  // A subscript stays in its line.
  assert.ok(runs.some((r) => r.text.startsWith('wt(d)')), 'w with its subscript t');
  // Found again: over a line's end, hyphenated, case and spaces aside.
  const f = findRuns(runs, 'effectiveness of dense retrievers');
  assert.equal(f.length, 1);
  assert.equal(f[0].text, 'effectiveness of dense retrievers');
  assert.equal(f[0].rects.length, 2, 'a box for each line');
  assert.ok(f[0].rects[0].x > 250 && f[0].rects[1].x < 60, 'from the end of one line to the start of the next');
  assert.equal(findRuns(runs, 'THIS PAPER   DESCRIBES such a model')[0].text, 'This paper describes such a model');
  assert.equal(findRuns(runs, 'not in the paper at all').length, 0);
  // Two matches: the nearest to where it was first.
  const twice = findRuns(runs, 'inverted index');
  assert.ok(twice.length >= 3);
  const near = findRuns(runs, 'inverted index', { x: 311, y: 700 });
  assert.ok(near[0].rects[0].y > 600, 'the nearest one first');
  // The words inside an area, and the longest run of them.
  const fig = runs[at('Encoder, then term weights')];
  const area = { x: fig.x - 20, y: fig.y - 10, w: fig.w + 40, h: 36 };
  const w = wordsIn(runs, area);
  assert.equal(w.text, 'Encoder, then term weights, then an inverted index');
  assert.equal(w.anchor?.t, 'Encoder, then term weights, then an');
  // Titles: the file's own, else the largest words at the top.
  assert.equal(titleOf(l, l.infoTitle(), 'paper.pdf'), 'Sparse Retrieval with Learned Term Weights');
  assert.equal(titleOf(l, 'Microsoft Word - draft3.docx', 'paper.pdf'), 'Sparse Retrieval with Learned Term Weights', 'a word processor’s title is no title');
  assert.equal(titleOf(l, undefined, 'paper.pdf'), 'Sparse Retrieval with Learned Term Weights');
  assert.equal(joinLines(['the effec-', 'tiveness of', 'dense']), 'the effectiveness of dense');
  assert.equal(joinLines(['state-of-the-', 'Art']), 'state-of-the- Art', 'a capital after a hyphen is a new word');

  // The PDF code's own test files: the words where pdf_look says they are.
  const form = loadPdf(path.join(PDFS, 'form.pdf'));
  const first = form.runs(1).find((r) => r.text.startsWith('First name:'));
  assert.ok(first && Math.abs(first.x - 60) < 0.2 && Math.abs(first.y - 93.1) < 0.2, 'First name: at 60, 93.1');
  for (const n of ['printed-form.pdf', 'tex-form.pdf', 'form-aes256.pdf', 'form-updated.pdf']) {
    const f2 = loadPdf(path.join(PDFS, n));
    const all = f2.pages.flatMap((_, i) => f2.runs(i + 1));
    assert.ok(all.length > 3, `${n} has words`);
    assert.ok(
      all.every((r) => r.edges.length === r.text.length + 1 && r.w >= 0 && r.h > 0),
      `${n}'s runs are whole`,
    );
  }
  // Bold drawn twice counts once.
  const g = pageGlyphs(l.pdf, l.pages[0]).filter((x) => x.dir === 0);
  const doubled = runsOf([...g.slice(0, 5), ...g.slice(0, 5).map((x) => ({ ...x, x0: x.x0 + 0.2, x1: x.x1 + 0.2, ox: x.ox + 0.2 }))]);
  assert.equal(doubled.length, 1);
}

// ---- the routes -------------------------------------------------------------------------------------------

const db = openDb(path.join(tmp, 'test.db'));
setSettings(db, { taskRoot: path.join(tmp, 'Tasks') });
const events: { id: string; data: unknown }[] = [];
const app = Fastify();
pdfNotes.routes!({ app, db, broadcast: (e: { t: string; id?: string; data?: unknown }) => e.t === 'feature' && events.push({ id: e.id!, data: e.data }) } as unknown as Deps);
await app.ready();

const dir = path.join(tmp, 'Papers');
fs.mkdirSync(dir);
let file = path.join(dir, 'paper.pdf');
fs.writeFileSync(file, paper);
const q = (p: string) => encodeURIComponent(p);
const get = async (p: string) => {
  const r = await app.inject({ url: `/api/pdf-notes?path=${q(p)}` });
  assert.equal(r.statusCode, 200, r.body);
  return r.json() as PdfNotesView;
};
const post = async (url: string, payload: Record<string, unknown>, status = 200) => {
  const r = await app.inject({ method: 'POST', url, payload });
  assert.equal(r.statusCode, status, r.body);
  return r.json();
};

{
  assert.deepEqual((await get(file)).highlights, []);
  assert.equal((await app.inject({ url: `/api/pdf-notes?path=${q(path.join(dir, 'none.pdf'))}` })).statusCode, 404);
  // The reader's words for a page.
  const t = (await app.inject({ url: `/api/pdf-notes/text?path=${q(file)}&page=1` })).json();
  assert.equal(t.page, 1);
  assert.ok(Math.abs(t.width - 612) < 1);
  assert.ok(t.runs.some((r: { t: string }) => r.t === 'We study sparse retrieval models that learn a weight for'));
  assert.equal((await app.inject({ url: `/api/pdf-notes/text?path=${q(file)}&page=3` })).statusCode, 400);

  // The reader's highlight (its boxes as the page has them), one by words alone (as an agent sends it), and an area.
  const runs = loadPdf(file).runs(1);
  const sel = findRuns(runs, 'This paper describes such a model')[0];
  const fig = runs.find((r) => r.text.startsWith('Encoder, then term'))!;
  const area = { x: fig.x - 20, y: fig.y - 10, w: fig.w + 40, h: 36 };
  let v: PdfNotesView = await post('/api/pdf-notes', {
    path: file,
    from: 'tab1',
    put: [
      { id: 'h1', page: 1, kind: 'text', rects: sel.rects, text: sel.text, color: 'green', o: sel.o },
      { page: 1, text: 'effectiveness of dense retrievers', note: 'Compare with ColBERT' },
      { id: 'a1', page: 1, kind: 'area', rects: [area], color: 'blue', note: 'The whole model in one line' },
    ],
  });
  assert.equal(v.highlights.length, 3);
  assert.deepEqual(
    v.highlights.map((h) => h.text),
    ['effectiveness of dense retrievers', 'This paper describes such a model', 'Encoder, then term weights, then an inverted index'],
    'in reading order, with the area’s words',
  );
  const byWords = v.highlights[0];
  assert.equal(byWords.color, 'yellow', 'yellow unless said');
  assert.equal(byWords.rects.length, 2);
  assert.equal(v.highlights[2].anchor?.t, 'Encoder, then term weights, then an');
  assert.deepEqual(events.at(-1), { id: 'pdfnotes', data: { path: file, from: 'tab1' } }, 'the pages hear of it');
  // Changing a note and a colour, and taking one away.
  v = await post('/api/pdf-notes', { path: file, put: [{ id: 'h1', note: 'Their main claim', color: 'pink' }] });
  const h1 = v.highlights.find((h) => h.id === 'h1')!;
  assert.equal(h1.note, 'Their main claim');
  assert.equal(h1.color, 'pink');
  assert.equal(h1.rects.length, 2, 'its place kept');
  assert.ok(h1.edited);
  // What is refused.
  await post('/api/pdf-notes', { path: file, put: [{ page: 1, text: 'gradient boosting' }] }, 400);
  await post('/api/pdf-notes', { path: file, put: [{ page: 1, text: 'model', color: 'purple' }] }, 400);
  await post('/api/pdf-notes', { path: file, put: [{ page: 2, text: 'model' }] }, 400);
  await post('/api/pdf-notes', { path: file, put: [{ page: 1, kind: 'area', rects: [{ x: 1, y: 1, w: -5, h: 3 }] }] }, 400);
  assert.equal((await get(file)).highlights.length, 3);

  // Pictures: a page, and a part of it as wide as asked, its shape kept.
  if (poppler) {
    const page = await app.inject({ url: `/api/pdf-notes/page?path=${q(file)}&page=1&width=400` });
    assert.equal(page.statusCode, 200);
    assert.equal(page.headers['content-type'], 'image/png');
    assert.equal(page.rawPayload.readUInt32BE(16), 400);
    const pic = await app.inject({ url: `/api/pdf-notes/area?path=${q(file)}&page=1&x=${area.x}&y=${area.y}&w=${area.w}&h=${area.h}&width=600` });
    assert.equal(pic.statusCode, 200, pic.body);
    const pw = pic.rawPayload.readUInt32BE(16);
    const ph = pic.rawPayload.readUInt32BE(20);
    assert.equal(pw, 600);
    assert.ok(Math.abs(ph - (600 * area.h) / area.w) <= 2, `its shape kept: ${pw}×${ph}`);
  } else notes.push('poppler is not installed: pictures not tested');
  assert.equal((await app.inject({ url: `/api/pdf-notes/area?path=${q(file)}&page=1&x=10&y=10&w=0&h=3` })).statusCode, 400);
  // A page cut to a crop box smaller than its paper: drawn as it shows, the size its words are placed on.
  {
    const f = new PdfFile(paper);
    const pg = pages(f)[0];
    f.edit(pg.ref).set('CropBox', [40, 60, 572, 760]);
    const cropped = path.join(tmp, 'cropped.pdf');
    fs.writeFileSync(cropped, f.saveUpdate());
    const runs2 = (await app.inject({ url: `/api/pdf-notes/text?path=${q(cropped)}&page=1` })).json();
    assert.equal(Math.round(runs2.width), 532);
    assert.equal(Math.round(runs2.height), 700);
    if (poppler) {
      const pic = await app.inject({ url: `/api/pdf-notes/page?path=${q(cropped)}&page=1&width=532` });
      assert.equal(pic.statusCode, 200);
      assert.equal(pic.rawPayload.readUInt32BE(20), 700, 'the crop box drawn, not the whole paper');
    }
  }

  // On a paper of two pages: a highlight moved to the other page by its id finds its words there; boxes sent without
  // their words get the words under them.
  {
    // Page 2 is the paper cut to a smaller crop box: the same words, 40 points further left and 32 higher.
    const f = new PdfFile(paper);
    f.edit(pages(f)[0].ref).set('CropBox', [40, 60, 572, 760]);
    const two = path.join(tmp, 'two.pdf');
    fs.writeFileSync(two, editPages(paper, [{ op: 'merge', file: f.saveUpdate() }]).data);
    let w: PdfNotesView = await post('/api/pdf-notes', { path: two, put: [{ id: 'mv', page: 1, text: 'standard benchmarks' }] });
    const at1 = w.highlights[0].rects[0];
    w = await post('/api/pdf-notes', { path: two, put: [{ id: 'mv', page: 2 }] });
    assert.equal(w.highlights[0].page, 2);
    const at2 = w.highlights[0].rects[0];
    assert.ok(Math.abs(at2.x - (at1.x - 40)) < 0.1 && Math.abs(at2.y - (at1.y - 32)) < 0.1, `on its words there: ${JSON.stringify([at1, at2])}`);
    const box = findRuns(loadPdf(two).runs(2), 'single processor')[0].rects;
    w = await post('/api/pdf-notes', { path: two, put: [{ id: 'bx', page: 2, kind: 'text', rects: box }] });
    assert.equal(w.highlights.find((h) => h.id === 'bx')?.text, 'single processor');
  }

  // Agents' app_api may read them freely; changes need the user's OK.
  assert.equal(ruleFor('GET', '/api/pdf-notes').level, 'free');
  assert.equal(ruleFor('POST', '/api/pdf-notes').level, 'confirm');
  assert.equal(ruleFor('POST', '/api/pdf-notes/keep').level, 'confirm');
  assert.equal(ruleFor('POST', '/api/pdf-notes/save').level, 'confirm');
}

// ---- following the file -------------------------------------------------------------------------------------

{
  // Files renames it: the notes go with it.
  const renamed = path.join(dir, 'Costa 2026.pdf');
  fs.renameSync(file, renamed);
  movedPdfNotes(db, file, renamed);
  assert.equal(readNotes(db, file).highlights.length, 0);
  assert.equal((await get(renamed)).highlights.length, 3);
  // Its folder moves: so do they.
  const moved = path.join(tmp, 'Reading', 'Papers');
  fs.mkdirSync(path.dirname(moved));
  fs.renameSync(dir, moved);
  movedPdfNotes(db, dir, moved);
  file = path.join(moved, 'Costa 2026.pdf');
  assert.equal((await get(file)).highlights.length, 3);
  // Moved by something else (a terminal): found by its contents when it opens where it is now.
  const elsewhere = path.join(tmp, 'Costa (moved).pdf');
  fs.renameSync(file, elsewhere);
  assert.equal((await get(elsewhere)).highlights.length, 3, 'its notes found again');
  assert.equal(readNotes(db, file).highlights.length, 0, 'and no longer at the old place');
  fs.renameSync(elsewhere, file);
  movedPdfNotes(db, elsewhere, file);
  // A copy elsewhere, with the file still where it was: the notes stay with the file.
  const copy = path.join(tmp, 'copy.pdf');
  fs.copyFileSync(file, copy);
  assert.equal((await get(copy)).highlights.length, 0);
  fs.rmSync(copy);
}

// ---- the file changes: found again by their words -----------------------------------------------------------------

{
  const before = (await get(file)).highlights;
  // A page put in at the start: every passage is a page further on, where it was on its page.
  fs.writeFileSync(file, editPages(paper, [{ op: 'insert', after: 0, count: 1 }]).data);
  const after = (await get(file)).highlights;
  assert.equal(after.length, 3);
  for (const h of after) {
    const was = before.find((x) => x.id === h.id)!;
    assert.equal(h.page, 2, `${h.text} is on page 2 now`);
    assert.ok(!h.lost);
    assert.ok(Math.abs(h.rects[0].x - was.rects[0].x) < 0.1 && Math.abs(h.rects[0].y - was.rects[0].y) < 0.1, 'in the same place on its page');
  }
  // A page turned sideways: its words run down the page now, which the reader does not lay out, so its highlights
  // stay where they were, marked lost…
  fs.writeFileSync(file, editPages(paper, [{ op: 'rotate', pages: [1], angle: 90 }]).data);
  const turned = (await get(file)).highlights;
  assert.ok(turned.every((h) => h.lost), 'kept, and marked');
  // …and are found again once it is turned back: all where they were.
  fs.writeFileSync(file, paper);
  const again = (await get(file)).highlights;
  assert.deepEqual(
    again.map((h) => [h.id, h.page, Math.round(h.rects[0].x), Math.round(h.rects[0].y), !!h.lost]),
    before.map((h) => [h.id, 1, Math.round(h.rects[0].x), Math.round(h.rects[0].y), false]),
    'all where they were',
  );
  // A passage taken out of the file is kept, marked lost.
  await post('/api/pdf-notes', { path: file, put: [{ id: 'gone', page: 1, kind: 'text', rects: [{ x: 60, y: 60, w: 40, h: 10 }], text: 'a sentence that was never typeset' }] });
  fs.writeFileSync(file, Buffer.concat([paper, Buffer.from('\n% changed\n')]));
  const lost = (await get(file)).highlights.find((h) => h.id === 'gone')!;
  assert.equal(lost.lost, true);
  await post('/api/pdf-notes', { path: file, remove: ['gone'] });
  fs.writeFileSync(file, paper);
  assert.equal((await get(file)).highlights.length, 3);
}

// ---- kept in a project's knowledge ---------------------------------------------------------------------------------

const settle = async () => {
  await new Promise((r) => setTimeout(r, 30));
  for (let i = 0; i < 300 && progress.size; i++) await new Promise((r) => setTimeout(r, 20));
  await new Promise((r) => setTimeout(r, 50));
};

{
  const doc = notesDocument('A Paper', '/x/a.pdf', [
    { id: 'a', page: 2, kind: 'text', rects: [{ x: 1, y: 1, w: 1, h: 1 }], text: 'second', color: 'yellow', at: 0, note: 'line one\nline two' },
    { id: 'b', page: 1, kind: 'area', rects: [{ x: 1, y: 1, w: 1, h: 1 }], color: 'blue', at: 0 },
  ] as PdfHighlight[]);
  assert.equal(
    doc,
    '# A Paper\n\nMy highlights and notes on the paper a.pdf, page by page. The PDF is at /x/a.pdf.\n\n## Page 1\n\n- A figure or an equation, picked as a part of the page\n\n## Page 2\n\n- “second”\n  My note: line one\n  line two\n',
  );

  const thesis = createSpace(db, { name: 'Thesis', folder: path.join(tmp, 'Reading') });
  fs.mkdirSync(path.join(tmp, 'Group'));
  const other = createSpace(db, { name: 'Reading group', folder: path.join(tmp, 'Group') });
  let v: PdfNotesView = await post('/api/pdf-notes/keep', { path: file, space: thesis.id });
  assert.equal(v.kept?.space, thesis.id);
  assert.equal(v.kept?.spaceName, 'Thesis');
  const kept = v.kept!.file;
  assert.equal(path.basename(kept), 'Sparse Retrieval with Learned Term Weights (notes).md', 'named after the paper');
  assert.equal(path.dirname(kept), filesDir(v.kept!.base), 'in the files of the project’s knowledge base (made for it)');
  assert.ok(events.some((e) => e.id === 'knowledge'));
  let text = fs.readFileSync(kept, 'utf8');
  assert.match(text, /^# Sparse Retrieval with Learned Term Weights\n/);
  assert.match(text, /## Page 1\n\n- “effectiveness of dense retrievers”\n {2}My note: Compare with ColBERT\n- “This paper describes such a model”\n {2}My note: Their main claim\n- A figure or an equation, picked as a part of the page, with the words: “Encoder, then term weights, then an inverted index”\n {2}My note: The whole model in one line\n/);
  await settle();
  assert.equal(docsOf(db, v.kept!.base).length, 1);
  const found = await searchKnowledge(db, { query: 'ColBERT', mode: 'words', within: [v.kept!.base] });
  assert.equal(found.hits[0]?.title, path.basename(kept), 'the project’s sessions find it');
  // A change to the notes writes it again, a moment later.
  await post('/api/pdf-notes', { path: file, put: [{ id: 'h1', note: 'Their main claim, with numbers in Table 2' }] });
  await new Promise((r) => setTimeout(r, 1800));
  text = fs.readFileSync(kept, 'utf8');
  assert.match(text, /My note: Their main claim, with numbers in Table 2/);
  await settle();
  assert.equal((await searchKnowledge(db, { query: '"Table 2"', mode: 'words', within: [v.kept!.base] })).hits.length, 1, 'read again');
  // The paper moves in Files: the document names its new place.
  const moved = path.join(tmp, 'Reading', 'costa.pdf');
  fs.renameSync(file, moved);
  movedPdfNotes(db, file, moved);
  file = moved;
  await new Promise((r) => setTimeout(r, 600));
  assert.match(fs.readFileSync(kept, 'utf8'), /The PDF is at .*Reading\/costa\.pdf\./);
  // Into another project: out of the first.
  v = await post('/api/pdf-notes/keep', { path: file, space: other.id });
  assert.ok(!fs.existsSync(kept), 'out of the first project');
  assert.ok(fs.existsSync(v.kept!.file));
  // No longer kept.
  const last = v.kept!.file;
  v = await post('/api/pdf-notes/keep', { path: file, space: null });
  assert.equal(v.kept, undefined);
  assert.ok(!fs.existsSync(last));
  await post('/api/pdf-notes/keep', { path: file, space: 'spnothing' }, 404);
}

// ---- saved into the PDF ------------------------------------------------------------------------------------------

/** The app's annotations in a file: per page, their kinds, names and comments. */
const annotsOf = (data: Buffer) => {
  const f = new PdfFile(data);
  return pages(f).flatMap((p) =>
    f.arrayOf(p.dict.get('Annots') ?? null).map((a) => {
      const d = f.dictOf(a)!;
      const s = (k: string) => {
        const v = f.resolve(d.get(k) ?? null);
        return isStr(v) ? v.text() : undefined;
      };
      return { page: p.index, type: d.get('Subtype'), nm: s('NM'), note: s('Contents'), quads: f.arrayOf(d.get('QuadPoints') ?? null).length };
    }),
  );
};

{
  const v = await get(file);
  const r = await post('/api/pdf-notes/save', { path: file });
  assert.equal(r.replaced, false);
  assert.equal(r.path, path.join(path.dirname(file), 'costa (highlighted).pdf'));
  assert.equal(r.count, 3);
  const saved = fs.readFileSync(r.path);
  assert.ok(saved.subarray(0, paper.length).equals(paper), 'every byte of the file kept, the highlights after it');
  const a = annotsOf(saved);
  assert.deepEqual(a.map((x) => x.type).sort(), ['Highlight', 'Highlight', 'Square']);
  const main = a.find((x) => x.nm === 'hydor:h1')!;
  assert.equal(main.note, 'Their main claim, with numbers in Table 2');
  assert.equal(main.quads, 16, 'four corners for each of its two lines');
  assert.ok(hasOurs(saved) && !hasOurs(withoutOurs(saved, 1)), 'the reader’s picture leaves them out');
  assert.equal((await get(r.path)).highlights.length, 3, 'the copy keeps the notes too');
  // Saved over the file, twice: its old version in the Trash, the highlights once.
  const over = await post('/api/pdf-notes/save', { path: file, replace: true });
  assert.ok(over.replaced && fs.existsSync(over.trashed));
  await post('/api/pdf-notes', { path: file, remove: [v.highlights[0].id] });
  await post('/api/pdf-notes/save', { path: file, replace: true });
  const twice = annotsOf(fs.readFileSync(file));
  assert.equal(twice.length, 2, 'the notes as they are now, in place of the last ones');
  assert.equal((await get(file)).highlights.every((h) => !h.lost && h.page === 1), true, 'still placed on the file as it is now');
  if (poppler) {
    const out = spawnSync('pdftoppm', ['-r', '20', '-png', file, path.join(tmp, 'drawn')], { encoding: 'utf8' });
    assert.equal(out.status, 0);
    assert.equal(out.stderr.trim(), '', 'poppler draws it without complaint');
  }
  // An encrypted file (it opens without a password, and allows comments): its annotations' names are encrypted too.
  const enc = writeHighlights(fs.readFileSync(path.join(PDFS, 'form-aes128.pdf')), v.highlights.slice(0, 1));
  assert.equal(enc.count, 1);
  assert.equal(annotsOf(enc.data).filter((x) => x.nm?.startsWith('hydor:')).length, 1);
  assert.ok(hasOurs(enc.data) && !hasOurs(withoutOurs(enc.data, 1)));
}

// ---- agents -------------------------------------------------------------------------------------------------------------

{
  const key = 'claude:pdfnotes-test';
  setSessionExtra(db, key, { file });
  const ctx = { cwd: path.dirname(file), key, deps: { db } } as unknown as RunCtx;
  const out = (await NOTES_TOOL.run({}, ctx)) as ToolOutput;
  assert.match(out.text, /^costa\.pdf · “Sparse Retrieval with Learned Term Weights” · 1 page: 2 highlights on 1 page, 2 with a note\./);
  assert.match(out.text, /\nPage 1\n1\. pink: “This paper describes such a model”\n {3}Note: Their main claim, with numbers in Table 2\n2\. blue, an area \(a figure or an equation(, picture 1)?\) at x [\d.]+, y [\d.]+, [\d.]+ × 36 points; the words in it: “Encoder, then term weights, then an inverted index”\n {3}Note: The whole model in one line/);
  if (poppler) assert.equal(out.images?.length, 1, 'a picture of the area');
  const other = (await NOTES_TOOL.run({ path: path.join(PDFS, 'form.pdf') }, ctx)) as ToolOutput;
  assert.match(other.text, /^No highlights or notes on form\.pdf yet/);
  await assert.rejects(NOTES_TOOL.run({ path: 'nothing.pdf' }, ctx), /No such file/);
  assert.ok(pdfNotes.tools!(ctx).some((t) => t.name === 'pdf_notes'), 'offered once there are notes');
  assert.match(String((await pdfNotes.spawn!({ extra: {} } as never, { db } as unknown as Deps))?.instructions?.[0]), /pdf_notes lists/);
  // Asked from a PDF in Files: the agent knows to read it, that a quote or a picture is a part of it, and where the notes are.
  const asked = fileAskInstructions(file)!;
  assert.match(asked, /read it with read_document/);
  assert.match(asked, /picture of a part of a page/);
  assert.match(asked, /pdf_notes/);
}

// The words found by meaning in the info: a PDF without a Title is named by its largest words.
{
  const info = pdfInfo(paper);
  assert.equal(info.title, 'Sparse Retrieval with Learned Term Weights');
}

await app.close();
db.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`pdfnotes: words in reading order, finding them again, routes, following the file, the project's knowledge, saving into the PDF and the agents' tool passed${notes.length ? ` (${notes.join('; ')})` : ''}`);
