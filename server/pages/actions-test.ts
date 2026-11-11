// Script tests for page_action, what the Library's editors do in a click to the whole of a page, done by agents: each
// action through the tool on real saved pages (a deck, a document, a spreadsheet, a LaTeX document, a notebook, a page),
// that it makes a version (the one before kept), changes what it says it does, keeps the comments, and shows in the
// editor open on it (the pages hear of it); what it refuses, in words an agent can act on; and what the agent beside a
// page (Ask the agent) is told it can do there. Through the routes and the tools, with a stand-in for the session
// manager and for the model that describes pictures. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/actions-test.ts
//   DATA_DIR=/tmp/hydor-test-actions node dist/dev/actions-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { setWriteForTests } from '../write/index.ts';
import { saveMyTheme } from './my-themes.ts';
import { pages } from './index.ts';
import { everyEl, type Deck } from '../../shared/slides.ts';
import type { Doc } from '../../shared/docs.ts';
import type { Workbook } from '../../shared/sheets.ts';
import type { TexDoc } from '../../shared/latex.ts';
import { partsLead, slideLead } from '../../web/src/features/pages/slides/ops.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-actions-test-')));
const db = openDb(path.join(tmp, 'test.db'));
const app = Fastify({ bodyLimit: 40 * 1024 * 1024 });
app.removeContentTypeParser('application/json');
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_r, b, done) => {
  try {
    done(null, String(b).trim() ? JSON.parse(String(b)) : {});
  } catch (e) {
    done(e as Error, undefined);
  }
});
app.setErrorHandler((err: Error & { status?: number; statusCode?: number }, _req, reply) => reply.code(err.status ?? err.statusCode ?? 500).send({ error: err.message }));
const events: { t: string; id?: string; data?: { what?: string } }[] = [];
const deps = {
  app,
  db,
  sessions: { deliverOrQueue: async () => {}, on: () => {} },
  broadcast: (e: { t: string; id?: string; data?: { what?: string } }) => void events.push(e),
  toSubscribers() {},
  publicBase: () => 'https://naget.example',
} as unknown as Deps;
pages.routes!(deps);
await app.ready();
const ctx = { runId: 'run1', key: 'claude:s1', agent: 'claude', cwd: tmp, deps } as RunCtx;
const tools = Object.fromEntries(pages.tools!(ctx).map((t) => [t.name, t]));

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};
const run = async (name: string, args: Record<string, unknown>): Promise<{ text?: string; error?: string }> => {
  try {
    const r = await tools[name].run(args, ctx);
    return { text: typeof r === 'string' ? r : r.text };
  } catch (e) {
    return { error: (e as Error).message };
  }
};
/** page_action, as a new message of the user's would start it (each a version of its own, not folded into the one before). */
const act = async (args: Record<string, unknown>) => {
  pages.beforeMessage!(ctx.key, deps);
  return run('page_action', args);
};
const idOf = (text?: string) => /\(page ([a-f0-9]{10})/.exec(text ?? '')?.[1] ?? '';
const versionOf = (text?: string) => Number(/, version (\d+)\)/.exec(text ?? '')?.[1] ?? 0);
const model = async <M,>(id: string) => (await app.inject({ method: 'GET', url: `/api/pages/${id}` })).json() as { page: { version: number; title: string; kind?: string }; model: M; versions: { version: number; by: string }[] };
const heard = () => {
  const n = events.filter((e) => e.t === 'feature' && e.id === 'pages' && e.data?.what === 'pages').length;
  events.length = 0;
  return n;
};

// A picture (a red square, 8×8) to put on slides.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC';

// ---- slide decks ------------------------------------------------------------------------------------------------------
let deckId = '';
{
  const made = await run('save_slides', {
    title: 'Garden club',
    slides: [
      { layout: 'title', title: 'Garden club', subtitle: 'Spring plans' },
      { layout: 'content', title: 'What we grow', text: '- Beans\n- Peas\n- Squash' },
      {
        els: [
          { type: 'text', role: 'title', text: 'Our plots', x: 80, y: 40, w: 1000, h: 90, size: 44 },
          { type: 'text', text: 'Tiny words', x: 80, y: 150, w: 600, h: 60, size: 12 },
          { id: 'pic', type: 'image', src: PNG, x: 760, y: 200, w: 300, h: 200 },
          { type: 'table', rows: [['Plot', 'Crop'], ['A', 'Beans']], x: 80, y: 300, w: 500, h: 160, head: false },
          { type: 'quiz', question: 'How many plots?', choices: ['1', '*2', '3'], x: 80, y: 480, w: 520, h: 200 },
        ],
      },
    ],
    comments: [{ slide: 2, text: 'Add carrots?' }],
  });
  deckId = idOf(made.text);
  ok(deckId, 'a deck to work on');
  const v0 = (await model<Deck>(deckId)).page.version;
  heard();

  // Animate every slide.
  const anim = await act({ id: deckId, action: 'animate', style: 'lively' });
  ok(anim.text?.startsWith('Saved "Garden club" (page ') && versionOf(anim.text) === v0 + 1, 'animate saves a new version, said as the save tools say it');
  let m = await model<Deck>(deckId);
  ok(m.model.slides.every((s) => s.anims?.length) && /animated every slide \(Lively\)/.test(anim.text ?? ''), 'every slide is animated, and it says so');
  ok(m.versions.some((x) => x.version === v0) && m.versions[0].by === 'agent', 'the version before stays among its versions; the new one is the agent’s');
  ok(m.model.slides[1].comments?.[0]?.text === 'Add carrots?', 'the comments stay on their slides');
  ok(heard() > 0, 'the pages hear of it, so the editor open on the deck shows it at once');
  const one = await act({ id: deckId, action: 'animate', style: 'none', slides: [2] });
  m = await model<Deck>(deckId);
  ok(!m.model.slides[1].anims?.length && m.model.slides[0].anims?.length && /slide 2/.test(one.text ?? ''), 'animate on one slide changes that slide alone');
  ok((await act({ id: deckId, action: 'animate', style: 'none', slides: [2] })).text?.startsWith('There is nothing to take off'), 'nothing to change: nothing is saved, and it says so');
  ok((await act({ id: deckId, action: 'animate', style: 'wild' })).error?.includes('subtle'), 'a style it does not know: it says which there are');
  ok((await act({ id: deckId, action: 'animate', style: 'subtle', slides: [9] })).error?.includes('the deck has 3'), 'a slide that is not there: it says how many there are');

  // Put right what the accessibility check can.
  const fix = await act({ id: deckId, action: 'fix_accessibility' });
  m = await model<Deck>(deckId);
  const els = everyEl(m.model.slides[2].els);
  const tiny = els.find((e) => e.type === 'text' && e.paras.some((p) => p.runs.some((r) => r.t === 'Tiny words')));
  ok(tiny?.type === 'text' && tiny.size >= 18, 'words too small are made 18 px');
  ok(els.some((e) => e.type === 'table' && e.head), 'a table gets its header row');
  ok(/put \d+ things? right/.test(fix.text ?? '') && fix.text?.includes('describe_pictures'), 'it says what it put right, and what is left (a picture without a description)');
  ok(m.model.slides[1].comments?.length === 1, 'fixing keeps the comments');

  // Describe the pictures without a description (a stand-in for the model that looks at them).
  setWriteForTests({ seer: async () => 'A red square on a white page' });
  const desc = await act({ id: deckId, action: 'describe_pictures' });
  m = await model<Deck>(deckId);
  const pic = everyEl(m.model.slides[2].els).find((e) => e.type === 'image');
  ok(pic?.type === 'image' && pic.alt === 'A red square on a white page' && desc.text?.includes('described 1 picture'), 'a picture without a description gets one, said in the answer');
  ok((await act({ id: deckId, action: 'describe_pictures' })).text?.includes('has a description already'), 'none left: nothing to do');
  ok((await act({ id: deckId, action: 'describe_pictures', parts: ['nope'] })).error?.includes('not a picture'), 'a part that is not a picture: said');
  setWriteForTests({ seer: null });

  // PowerPoint compatible, and back.
  const ppt = await act({ id: deckId, action: 'powerpoint', on: true });
  m = await model<Deck>(deckId);
  ok(m.model.format === 'pptx' && !everyEl(m.model.slides[2].els).some((e) => e.type === 'quiz'), 'PowerPoint compatible: the quiz is PowerPoint’s now');
  ok(ppt.text?.includes('Made for PowerPoint'), 'it says what changed on the way');
  ok((await act({ id: deckId, action: 'powerpoint', on: true })).text?.includes('already'), 'twice: nothing to do');
  await act({ id: deckId, action: 'powerpoint', on: false });
  m = await model<Deck>(deckId);
  ok(m.model.format === undefined, 'back to the web format');
  ok((await act({ id: deckId, action: 'powerpoint' })).error?.includes('on: true'), 'without on: it says what to give');

  // A ready-made theme, then one of the user's own (its logo with it).
  await act({ id: deckId, action: 'theme', theme: 'Midnight' });
  m = await model<Deck>(deckId);
  ok(m.model.theme.id === 'midnight', 'a ready-made theme by its name');
  ok((await act({ id: deckId, action: 'theme', theme: 'midnight' })).text?.includes('already'), 'the same theme again: nothing to do');
  saveMyTheme(db, { name: 'Acme', theme: { bg: '#101820', fg: '#f2f2f2', head: '#ffffff', muted: '#a0a0a0', accent: '#ff6600', accentFg: '#000000', soft: '#202830', colors: ['#ff6600', '#00aaff', '#33cc66', '#ffcc00', '#cc33ff', '#ff3366'], font: 'Inter', headFont: 'Poppins' }, logo: { src: PNG, at: 'br', w: 100, h: 100 } });
  const acme = await act({ id: deckId, action: 'theme', theme: 'acme' });
  m = await model<Deck>(deckId);
  ok(m.model.theme.accent === '#ff6600' && m.model.theme.headFont === 'Poppins' && m.model.logo?.at === 'br' && acme.text?.includes('“Acme”'), 'one of the user’s own themes by its name, its logo with it');
  ok((await act({ id: deckId, action: 'theme', theme: 'zebra' })).error?.match(/paper.*“Acme”/), 'a theme it does not know: it lists the ready-made ones and the user’s');

  // The slides' shape.
  const yBefore = everyEl((await model<Deck>(deckId)).model.slides[2].els).find((e) => e.type === 'table')!.y;
  await act({ id: deckId, action: 'slide_shape', ratio: '4:3' });
  m = await model<Deck>(deckId);
  ok(m.model.ratio === '4:3' && everyEl(m.model.slides[2].els).find((e) => e.type === 'table')!.y === Math.round((yBefore * 960) / 720), 'standard slides: every part moved down in step');
  ok((await act({ id: deckId, action: 'slide_shape', ratio: '1:1' })).error?.includes('16:9'), 'a shape it does not know: said');
  await act({ id: deckId, action: 'slide_shape', ratio: '16:9' });

  // Slides from another deck.
  const other = idOf((await run('save_slides', { title: 'Old talk', theme: 'ember', slides: [{ layout: 'title', title: 'Old talk' }, { layout: 'content', title: 'Compost', text: 'Turn it weekly', notes: 'Say why' }] })).text);
  const before = (await model<Deck>(deckId)).model;
  const reused = await act({ id: deckId, action: 'reuse_slides', from: other, slides: [2], after: 1 });
  m = await model<Deck>(deckId);
  const put = m.model.slides[1];
  ok(m.model.slides.length === before.slides.length + 1 && everyEl(put.els).some((e) => e.type !== 'line' && 'paras' in e && e.paras.some((p) => p.runs.some((r) => r.t.includes('Compost')))), 'a slide from another deck goes after slide 1');
  ok(put.notes === 'Say why' && !before.slides.some((s) => s.id === put.id) && put.theme?.accent !== undefined, 'with fresh ids, its notes, and its own look');
  ok(/put 1 slide from “Old talk”/.test(reused.text ?? ''), 'it says what it put in, and where');
  ok((await act({ id: deckId, action: 'reuse_slides', from: deckId.replace(/./g, 'a') })).error?.includes('No saved page'), 'a deck that is not there: said');
}

// ---- charts from a spreadsheet ----------------------------------------------------------------------------------------
{
  const sheetId = idOf((await run('save_sheet', { title: 'Harvest', sheets: [{ name: 'Kilos', rows: [['Month', 'Beans'], ['May', 4], ['June', 9]] }] })).text);
  const deck = idOf(
    (await run('save_slides', { title: 'Harvest talk', slides: [{ layout: 'title', title: 'Harvest' }, { els: [{ id: 'ch', type: 'chart', kind: 'column', labels: ['Old'], series: [{ name: 'Beans', values: [1], color: '#ff0000' }], source: { page: sheetId, sheet: 'Kilos', range: 'A1:B3' }, x: 80, y: 80, w: 800, h: 500 }] }] })).text,
  );
  await run('save_sheet', { id: sheetId, title: 'Harvest', update: [{ sheet: 'Kilos', cells: { B3: 12 } }] });
  const up = await act({ id: deck, action: 'update_charts' });
  const ch = everyEl((await model<Deck>(deck)).model.slides[1].els).find((e) => e.type === 'chart');
  ok(ch?.type === 'chart' && ch.labels.join() === 'May,June' && ch.series[0].values.join() === '4,12' && ch.series[0].color === '#ff0000', 'a chart from a spreadsheet reads its cells again, its series keeping their colour');
  ok(up.text?.includes('read 1 chart again'), 'and says so');
  ok((await act({ id: deckId, action: 'update_charts' })).text?.includes('No chart'), 'a deck without such charts: said');
}

// ---- documents --------------------------------------------------------------------------------------------------------
let docId = '';
{
  const md = '# Allotment rules\n\nPlots are given out in March.\n\nEvery member keeps their plot tidy.\n';
  docId = idOf((await run('save_doc', { title: 'Allotment rules', markdown: md, description: 'The allotment society’s rules: when plots are given out and how members keep them.' })).text);
  pages.beforeMessage!(ctx.key, deps);
  await run('save_doc', { id: docId, title: 'Allotment rules', markdown: md.replace('in March', 'in April').replace('tidy', 'neat'), suggest: true, comments: [{ text: 'Is April right?', on: 'Plots are given out' }] });
  let m = await model<Doc>(docId);
  const ids = (m.model.suggestions ?? []).map((s) => s.id);
  ok(ids.length >= 2, 'the agent’s changes are suggestions to accept or reject');
  const first = await act({ id: docId, action: 'accept_suggestions', ids: [ids[0]] });
  m = await model<Doc>(docId);
  ok(m.model.suggestions?.length === ids.length - 1 && first.text?.includes('accepted 1 suggested change'), 'one accepted by its id, the others left');
  ok(m.model.comments?.length === 1, 'the comments stay');
  ok((await act({ id: docId, action: 'reject_suggestions', ids: ['s0nope'] })).error?.includes('no suggestion s0nope'), 'a suggestion that is not there: said');
  const rest = await act({ id: docId, action: 'reject_suggestions' });
  m = await model<Doc>(docId);
  const words = JSON.stringify(m.model.blocks);
  ok(!m.model.suggestions?.length && rest.text?.includes('every suggested change'), 'the rest rejected at once');
  ok(words.includes('tidy') !== words.includes('neat') && !(words.includes('March') && words.includes('April')), 'each word is as accepting or rejecting left it');
  ok((await act({ id: docId, action: 'accept_suggestions' })).text?.includes('no suggested changes'), 'none left: said');

  await act({ id: docId, action: 'page_setup', paper: 'letter', margin: 12.7, font: 'Georgia', size: 12 });
  m = await model<Doc>(docId);
  ok(m.model.page.size === 'letter' && m.model.page.margin === 12.7 && m.model.font === 'Georgia' && m.model.size === 12, 'the page set up: paper, margins, font and size');
  ok((await act({ id: docId, action: 'page_setup', margin: 90 })).error?.includes('5 to 60'), 'a margin too wide: said');
  const sides = await act({ id: docId, action: 'page_setup', margins: { top: 30, left: 35 } });
  m = await model<Doc>(docId);
  ok(m.model.page.margin === 12.7 && m.model.page.margins?.top === 30 && m.model.page.margins?.left === 35 && sides.text?.includes('30 mm at the top'), 'sides with margins of their own, the others as they were');
  ok((await act({ id: docId, action: 'page_setup', margins: { top: 3 } })).error?.includes('margins.top'), 'a side’s margin too narrow: said');
  await act({ id: docId, action: 'page_setup', margin: 12.7 });
  m = await model<Doc>(docId);
  ok(m.model.page.margin === 12.7 && !m.model.page.margins, 'a margin for all: every side the same again');
  ok((await act({ id: docId, action: 'page_setup', font: 'Fancy<script>' })).error?.includes('font:'), 'a font name a document cannot have: said');

  await act({ id: docId, action: 'header_footer', footer: { text: 'Page {page} of {pages}', align: 'center' }, header: 'Allotment society', title_page: true });
  m = await model<Doc>(docId);
  ok(m.model.footer?.text === 'Page {page} of {pages}' && m.model.footer.align === 'center' && m.model.header?.text === 'Allotment society' && m.model.titlePage === true, 'a header, page numbers in the footer, none on the title page');
  await act({ id: docId, action: 'header_footer', header: null, footer: null });
  m = await model<Doc>(docId);
  ok(!m.model.header && !m.model.footer && !m.model.titlePage, 'both taken off (and the title page with them)');
  ok((await act({ id: docId, action: 'animate', style: 'subtle' })).error?.includes('animate is for a slide deck'), 'an action of another kind: it says whose it is, and this one’s');
}

// ---- spreadsheets -----------------------------------------------------------------------------------------------------
{
  const made = await run('save_sheet', {
    title: 'Stock',
    sheets: [
      {
        name: 'Stock',
        rows: [
          ['Item', 'Qty', 'Price', 'Total'],
          ['pears', 3, 2.5, '=B2*C2'],
          ['apples', 5, 1.2, '=B3*C3'],
          ['figs', 1, 4, '=B4*C4'],
          ['apples', 5, 1.2, '=B5*C5'],
          ['  kiwi  fruit ', 2, 3, '=B6*C6'],
        ],
        cells: { F1: 'Sum', F2: '=SUM(D2:D6)', H1: 'Name', H2: 'Ada Lovelace', H3: 'Alan Turing', K2: 'x y', L2: 'keep' },
        styles: { 'A1:D1': { b: true } },
      },
      { name: 'Notes', cells: { A1: '=Stock!F2' } },
    ],
    comments: [{ sheet: 'Stock', cell: 'A4', text: 'Fresh?' }],
  });
  const id = idOf(made.text);
  const book = async () => (await model<Workbook>(id)).model;
  const cell = (b: Workbook, sheet: string, ref: string) => b.sheets.find((s) => s.name === sheet)?.cells[ref];

  const sorted = await act({ id, action: 'sort', by: 'Price', descending: true });
  let b = await book();
  ok(cell(b, 'Stock', 'A2')?.v === 'figs' && cell(b, 'Stock', 'A1')?.v === 'Item', 'sorted by a column’s header words, largest first; the header row stays on top');
  ok(cell(b, 'Stock', 'D2')?.f === 'B2*C2', 'each row’s formula moved with it');
  ok(b.sheets[0].comments?.[0]?.cell === 'A2', 'the comment moved with its row');
  ok(sorted.text?.includes('C (Price) Z to A'), 'it says how it sorted');
  ok((await act({ id, action: 'sort', by: 'Colour' })).error?.includes('A (Item), B (Qty), C (Price), D (Total)'), 'a column it does not know: it lists the table’s columns');
  const trimmed = await act({ id, action: 'trim_spaces' });
  b = await book();
  ok(Object.values(b.sheets[0].cells).some((c) => c.v === 'kiwi fruit') && trimmed.text?.includes('trimmed 1 cell'), 'spaces trimmed on the whole sheet');
  await act({ id, action: 'sort', by: ['Item', { column: 'C', descending: true }] });
  b = await book();
  ok(['apples', 'apples', 'figs', 'kiwi fruit', 'pears'].every((w, i) => cell(b, 'Stock', `A${i + 2}`)?.v === w), 'sorted by two columns in turn');

  const dups = await act({ id, action: 'remove_duplicates' });
  b = await book();
  ok(dups.text?.includes('took 1 duplicate row') && ['apples', 'figs', 'kiwi', 'pears'].every((w) => Object.values(b.sheets[0].cells).some((c) => typeof c.v === 'string' && c.v.includes(w))), 'a row that repeats one above it goes, the others stay');
  ok((await act({ id, action: 'remove_duplicates' })).text?.startsWith('No row'), 'none left: said');

  await run('save_sheet', { id, title: 'Stock', update: [{ sheet: 'Stock', cells: { E1: 'Double', E2: '=D2*2' } }] });
  await act({ id, action: 'fill', range: 'E2:E5' });
  b = await book();
  ok(cell(b, 'Stock', 'E4')?.f === 'D4*2', 'filled down, the formula moving as a copied one does');
  ok((await act({ id, action: 'fill', range: 'E2:E5', direction: 'up' })).error?.includes('down'), 'a direction it does not know: said');

  await act({ id, action: 'insert_rows', at: 3, count: 2 });
  b = await book();
  ok(cell(b, 'Stock', 'F2')?.f === 'SUM(D2:D8)' && cell(b, 'Notes', 'A1')?.f === 'Stock!F2', 'rows put in: the sum spanning them grows, a reference above them stays');
  await act({ id, action: 'delete_rows', rows: '3:4' });
  b = await book();
  ok(cell(b, 'Stock', 'F2')?.f === 'SUM(D2:D6)', 'and taken out again');
  await act({ id, action: 'insert_columns', at: 'B' });
  b = await book();
  ok(cell(b, 'Stock', 'G2')?.f === 'SUM(E2:E6)' && cell(b, 'Notes', 'A1')?.f === 'Stock!G2', 'a column put in: the formulas of every sheet follow');
  await act({ id, action: 'delete_columns', columns: 'B' });
  b = await book();
  ok(cell(b, 'Stock', 'F2')?.f === 'SUM(D2:D6)' && cell(b, 'Notes', 'A1')?.f === 'Stock!F2', 'and taken out again');

  const sp = await act({ id, action: 'split_text', range: 'H2:H3' });
  b = await book();
  ok(cell(b, 'Stock', 'H2')?.v === 'Ada' && cell(b, 'Stock', 'I3')?.v === 'Turing' && sp.text?.includes('space'), 'words split into the column beside, the separator guessed');
  ok((await act({ id, action: 'split_text', range: 'K2' })).error?.includes('overwrite: true'), 'a split that would write over cells asks for overwrite first');
  ok((await act({ id, action: 'split_text', range: 'K2:L2' })).error?.includes('one column'), 'a split of several columns: said');

  const sum = await act({ id, action: 'summarize', by: 'Item', values: [{ column: 'Qty', fn: 'sum' }] });
  b = await book();
  const summary = b.sheets.find((s) => s.name.startsWith('Summary of Stock'));
  ok(summary && b.sheets[1] === summary && Object.values(summary.cells).some((c) => c.f?.startsWith('SUMIFS(')) && sum.text?.includes('added the sheet'), 'a summary of the table as formulas, on a sheet after it');

  await act({ id, action: 'clear', range: 'A1:D1', what: 'formatting' });
  b = await book();
  ok(cell(b, 'Stock', 'A1')?.v === 'Item' && !cell(b, 'Stock', 'A1')?.s, 'the looks cleared, the words kept');
  await act({ id, action: 'clear', range: 'K2:L2' });
  b = await book();
  ok(!cell(b, 'Stock', 'K2') && !cell(b, 'Stock', 'L2'), 'what cells hold cleared');

  await act({ id, action: 'rename_sheet', sheet: 'Stock', name: 'Larder' });
  b = await book();
  ok(b.sheets[0].name === 'Larder' && cell(b, 'Notes', 'A1')?.f === 'Larder!F2', 'a sheet renamed, the formulas that name it following');
  await act({ id, action: 'duplicate_sheet', sheet: 'Notes' });
  b = await book();
  ok(b.sheets.filter((s) => s.name.startsWith('Notes')).length === 2, 'a sheet copied');
  await act({ id, action: 'move_sheet', sheet: 'Notes', to: 1 });
  b = await book();
  ok(b.sheets[0].name === 'Notes', 'a sheet moved to the front');
  await act({ id, action: 'delete_sheet', sheet: 'Larder' });
  b = await book();
  ok(!b.sheets.some((s) => s.name === 'Larder') && cell(b, 'Notes', 'A1')?.f?.includes('#REF!'), 'a sheet deleted: formulas that used it show #REF!');
  ok((await act({ id, action: 'delete_sheet' })).error?.includes('sheet:'), 'delete_sheet without saying which: refused');
  ok((await act({ id, action: 'move_sheet', sheet: 'Notes', to: 9 })).error?.includes('1 to'), 'a place that is not there: said');

  // What the audit leaves to save_sheet, as easily: freezing and a filter, the cells as they were.
  const plain = idOf((await run('save_sheet', { title: 'Plain', sheets: [{ name: 'S', rows: [['A', 'B'], [1, 2], [3, 4]] }] })).text);
  pages.beforeMessage!(ctx.key, deps);
  await run('save_sheet', { id: plain, title: 'Plain', update: [{ sheet: 'S', freeze: { rows: 1 }, filter: { range: 'A1:B3' } }] });
  const pb = (await model<Workbook>(plain)).model.sheets[0];
  ok(pb.freeze?.rows === 1 && pb.filter?.range === 'A1:B3' && pb.cells.B3?.v === 4, 'save_sheet’s update freezes rows and makes a filter, leaving the cells as they were');
}

// ---- LaTeX ------------------------------------------------------------------------------------------------------------
{
  const id = idOf(
    (await run('save_latex', { title: 'Garden paper', source: '\\documentclass{article}\n\\begin{document}\n\\input{chapters/intro}\n\\end{document}\n', files: { 'chapters/intro.tex': 'Beans grow fast.\n' } })).text,
  );
  ok(id, 'a LaTeX document to work on');
  const moved = await act({ id, action: 'move_files', moves: [{ from: 'chapters/', to: 'parts/' }] });
  const m = await model<TexDoc>(id);
  ok(m.model.files.some((f) => f.name === 'parts/intro.tex') && m.model.main.includes('\\input{parts/intro}'), 'a folder moved, the \\input that names it following');
  ok(moved.text?.includes('chapters/intro.tex → parts/intro.tex') && /(Typeset|not typeset)/.test(moved.text ?? ''), 'it says what moved, and how typesetting went');
  ok((await act({ id, action: 'move_files', moves: [{ from: 'main.tex', to: 'x.tex' }] })).error?.includes('main.tex'), 'main.tex keeps its name');
  ok((await act({ id, action: 'move_files', moves: [{ from: 'parts/intro.tex', to: 'parts/in?tro.tex' }] })).error?.includes('not a name'), 'a name a document’s file cannot have: said');
}

// ---- notebooks --------------------------------------------------------------------------------------------------------
{
  const nb = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {},
    cells: [
      { id: 'c1', cell_type: 'code', source: 'print(1)', metadata: {}, execution_count: 1, outputs: [{ output_type: 'stream', name: 'stdout', text: '1\n' }] },
      { id: 'c2', cell_type: 'markdown', source: '# Hello', metadata: {} },
    ],
  };
  const id = idOf((await run('save_notebook', { title: 'Counts', notebook: nb })).text);
  const cleared = await act({ id, action: 'clear_outputs' });
  const m = await model<{ cells: { outputs?: unknown[]; execution_count?: number | null }[] }>(id);
  ok(!m.model.cells[0].outputs?.length && m.model.cells[0].execution_count == null && cleared.text?.includes('1 code cell'), 'a notebook’s outputs cleared');
  ok((await act({ id, action: 'clear_outputs' })).text?.startsWith('No cell'), 'none left: said');
}

// ---- any of them --------------------------------------------------------------------------------------------------------
{
  const copy = await act({ id: docId, action: 'duplicate' });
  const cid = idOf(copy.text);
  const m = await model<Doc>(cid);
  ok(cid && cid !== docId && m.page.title === 'Allotment rules (copy)' && m.page.kind === 'doc' && m.versions[0].by === 'agent', 'a copy of a document beside it, made by the agent');
  ok((m.page as { description?: string }).description?.startsWith('The allotment society’s rules'), 'the copy says what it is, as the first does');
  const html = idOf((await run('save_page', { title: 'Tracker', html: '<!doctype html><html><body><h1>Tracker</h1></body></html>' })).text);
  const pc = await act({ id: html, action: 'duplicate', title: 'Tracker two' });
  ok((await model<unknown>(idOf(pc.text))).page.title === 'Tracker two', 'a page of HTML copied, under the title given');
  ok((await act({ id: html, action: 'sort' })).error?.includes('sort is for a spreadsheet'), 'a page of HTML: its actions are said');
  const turn = await act({ id: docId, action: 'turn_into', to: 'slides' });
  ok(turn.text?.includes('Make slides from my document “Allotment rules”') && turn.text.includes('Nothing is changed yet'), 'turn_into gives what the Library’s Turn it into asks for');
  ok((await act({ id: docId, action: 'turn_into', to: 'sheet' })).error?.includes('turns into slides'), 'a kind it does not turn into: said');
  ok((await act({ id: 'abcdef0123', action: 'duplicate' })).error?.includes('No saved page'), 'a page that is not there: said');
  ok((await act({ id: docId, action: 'explode' })).error?.includes('there is no action “explode”'), 'an action that is not one: it lists the kind’s actions');
  ok((await act({ action: 'duplicate' })).error?.includes('id:'), 'without an id: said');
}

// ---- folding: two actions in one turn are one version ---------------------------------------------------------------
{
  pages.beforeMessage!(ctx.key, deps);
  const a = await run('page_action', { id: deckId, action: 'animate', style: 'subtle' });
  const b = await run('page_action', { id: deckId, action: 'animate', style: 'bold' });
  ok(versionOf(b.text) === versionOf(a.text) + 1 && b.text?.includes(`took the place of version ${versionOf(a.text)}`), 'two in a row, in one turn, are kept as one version, and it says so');
}

// ---- the agent beside the page ---------------------------------------------------------------------------------------
{
  const told = async (id: string) => ((await pages.spawn!({ agent: 'claude', cwd: tmp, runId: 'r', resume: false, extra: { page: id } }, deps)) ?? {}).instructions?.join('\n') ?? '';
  const deck = await told(deckId);
  ok(deck.includes('page_action') && deck.includes('fix_accessibility') && deck.includes('reuse_slides'), 'beside a deck: its page_action actions');
  ok(deck.includes('/api/write/design-ideas') && deck.includes('edit_image') && deck.includes('naget-asset:'), 'and design ideas, and the picture tools for the part picked');
  ok(deck.includes('a slide or a part and its id'), 'and that a message starting with what was picked is about exactly that');
  // What the editor puts before the request: the slide's id, a part's kind and id, a picture's source.
  const d = (await model<Deck>(deckId)).model;
  const at = d.slides.findIndex((s) => everyEl(s.els).some((e) => e.type === 'image'));
  const pic = everyEl(d.slides[at].els).find((e) => e.type === 'image')!;
  ok(slideLead(at, d.slides[at]) === `On slide ${at + 1} (“Our plots”, id ${d.slides[at].id}): `, 'a slide’s lead names it by its number, title and id');
  ok(pic.type === 'image' && partsLead(at, d.slides[at], [pic]).includes(`(image part ${pic.id}, ${pic.src})`), 'a picture’s lead gives its kind, its id and its source, for the picture tools');
  const doc = await told(docId);
  ok(doc.includes('accept_suggestions') && doc.includes('/api/write/rewrite') && doc.includes('generate_image'), 'beside a document: its actions, rewriting and pictures');
  const sheet = idOf((await run('save_sheet', { title: 'Tiny', sheets: [{ name: 'S', rows: [[1]] }] })).text);
  const sh = await told(sheet);
  ok(sh.includes('sort') && sh.includes('insert_rows') && !sh.includes('generate_image'), 'beside a spreadsheet: its actions, and no picture tools');
}

console.log(`${passed} passed, ${failed} failed`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
