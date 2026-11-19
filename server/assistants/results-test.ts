// Script tests for where an agent's results go and the history it keeps: a row in a Library spreadsheet each run (the
// first run makes it, later ones add rows, new fields add columns at the end, a person's edits stay), the same Library
// page updated each run (a new version, the same page), an email built from the fields, and the history kept and cut
// by its rule (a year, at most RESULTS_KEEP.count). Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/assistants/results-test.ts
//   DATA_DIR=/tmp/hydor-test-results node dist/dev/results-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AnswerField } from '../../shared/apps.ts';
import { RESULTS_KEEP, type AgentResult } from '../../shared/assistants.ts';
import { computeBook, parseRef, type Workbook } from '../../shared/sheets.ts';
import { appTables } from '../connections/apps.ts';
import { vaultTables } from '../connections/vault.ts';
import { kvGet, kvSet, openDb } from '../db.ts';
import { mailTables } from '../mail/accounts.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { readBook } from '../pages/sheets.ts';
import { addVersion, initPages, pageInfo, pageSource, versionsOf } from '../pages/store.ts';
import { setSessionExtra } from '../sessionExtra.ts';
import { handBackTool, outputNote } from './output.ts';
import { mailSubject, resultMail, sendResultMailVia, type ResultMail } from './resultMail.ts';
import { CUT, keepResult, keptValue, madeOf, resultsOf, resultsPage } from './results.ts';
import { addResultRow, fieldCell, resultsBook, WHEN } from './resultSheet.ts';
import { cleanAssistant, findAssistant, removeAssistant, saveAssistant } from './store.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
process.env.CUDA_VISIBLE_DEVICES = '';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-results-test-'));
const db = openDb(path.join(tmp, 'test.db'));
initPages(db);
vaultTables(db);
appTables(db);
mailTables(db);
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const FIELDS: AnswerField[] = [
  { id: 'spent', label: 'Spent', type: 'number', required: true },
  { id: 'note', label: 'Note', type: 'markdown' },
  { id: 'shops', label: 'Shops', type: 'list' },
];

const cellsOf = (b: Workbook, tab = 0) => b.sheets[tab].cells;
const shown = (b: Workbook, ref: string, tab = 0) => {
  const at = parseRef(ref)!;
  return computeBook(b).value(tab, at.r, at.c);
};

// ---- the row ----------------------------------------------------------------------------------------------

test('a row: when it ran, then each field in order; numbers, dates, links and lists as they should be', () => {
  const at = new Date(2026, 10, 15, 9, 30);
  const r = addResultRow(resultsBook(), { fields: FIELDS, value: { spent: 42.5, note: '**Groceries** mostly', shops: ['Lidl', 'Market'] }, at });
  const c = cellsOf(r.book);
  assert.equal(r.tab, 'Results');
  assert.equal(r.row, 2);
  assert.deepEqual(r.added, [WHEN, 'Spent', 'Note', 'Shops']);
  assert.deepEqual([c.A1.v, c.B1.v, c.C1.v, c.D1.v], ['Date', 'Spent', 'Note', 'Shops']);
  assert.equal(c.A1.s?.b, true);
  assert.equal(c.A2.s?.fmt, 'datetime');
  assert.equal(typeof c.A2.v, 'number');
  assert.equal(c.B2.v, 42.5);
  assert.equal(c.C2.v, 'Groceries mostly');
  assert.equal(c.D2.v, 'Lidl; Market');
  assert.deepEqual(r.book.sheets[0].freeze, { rows: 1 });
  // Kinds of their own.
  assert.deepEqual(fieldCell({ id: 'd', label: 'D', type: 'date' }, '2026-11-03')?.s, { fmt: 'date' });
  assert.equal(typeof fieldCell({ id: 'd', label: 'D', type: 'date' }, '2026-11-03')?.v, 'number');
  assert.deepEqual(fieldCell({ id: 'u', label: 'U', type: 'url' }, 'https://example.org/a'), { v: 'https://example.org/a', link: 'https://example.org/a' });
  assert.deepEqual(fieldCell({ id: 'y', label: 'Y', type: 'yesno' }, false), { v: false });
  assert.equal(
    fieldCell({ id: 't', label: 'T', type: 'table', columns: [{ id: 'city', label: 'City', type: 'text' }, { id: 'n', label: 'N', type: 'number' }] }, [{ city: 'Rome', n: 3 }, { city: 'Paris', n: 2 }])?.v,
    'Rome · 3; Paris · 2',
  );
  // Text that looks like a formula stays text.
  assert.deepEqual(fieldCell({ id: 'x', label: 'X', type: 'text' }, '=HYPERLINK("http://evil")'), { v: '=HYPERLINK("http://evil")' });
  assert.equal(fieldCell({ id: 'x', label: 'X', type: 'text' }, null), null);
});

test('later rows go under the last one; new fields get columns at the end; renamed or moved columns are found by heading', () => {
  let b = addResultRow(resultsBook(), { fields: FIELDS, value: { spent: 10, note: 'a', shops: [] }, at: new Date(2026, 10, 1) }).book;
  b = addResultRow(b, { fields: FIELDS, value: { spent: 20, note: 'b' }, at: new Date(2026, 10, 2) }).book;
  // A field added later: a new column at the end; the old ones do not move.
  const more = [...FIELDS, { id: 'items', label: 'Items', type: 'number' as const }];
  const r = addResultRow(b, { fields: more, value: { spent: 30, note: 'c', shops: ['X'], items: 4 }, at: new Date(2026, 10, 3) });
  assert.deepEqual(r.added, ['Items']);
  assert.equal(r.row, 4);
  const c = cellsOf(r.book);
  assert.deepEqual([c.A1.v, c.B1.v, c.C1.v, c.D1.v, c.E1.v], ['Date', 'Spent', 'Note', 'Shops', 'Items']);
  assert.deepEqual([c.B2.v, c.B3.v, c.B4.v], [10, 20, 30]);
  assert.equal(c.E2, undefined);
  assert.equal(c.E4.v, 4);
  // A field taken away leaves its column empty in new rows, and the others in their places.
  const fewer = addResultRow(r.book, { fields: [FIELDS[0]], value: { spent: 5 }, at: new Date(2026, 10, 4) });
  assert.equal(cellsOf(fewer.book).B5.v, 5);
  assert.equal(cellsOf(fewer.book).C5, undefined);
  assert.deepEqual(fewer.added, []);
});

test('a spreadsheet the person changed keeps their changes: their columns, styles, formulas carried down, totals and charts that follow', () => {
  let b = addResultRow(resultsBook(), { fields: FIELDS, value: { spent: 10 }, at: new Date(2026, 10, 1) }).book;
  b = addResultRow(b, { fields: FIELDS, value: { spent: 20 }, at: new Date(2026, 10, 2) }).book;
  const sh = b.sheets[0];
  // Their own: a running total beside the table, the Spent column as euros, a total in another column, a comment, a chart over the rows so far.
  sh.cells.E1 = { v: 'Running total', s: { b: true } };
  sh.cells.E2 = { f: 'SUM(B$2:B2)' };
  sh.cells.E3 = { f: 'SUM(B$2:B3)' };
  sh.cells.B2.s = { fmt: 'currency', cur: '€' };
  sh.cells.B3.s = { fmt: 'currency', cur: '€' };
  sh.cells.G1 = { v: 'All' };
  sh.cells.G2 = { f: 'SUM(B:B)' };
  sh.comments = [{ id: 'c1', cell: 'B2', by: 'user', text: 'Check this', at: 1 }];
  sh.charts = [{ id: 'ch1', kind: 'line', range: 'A1:B3', from: { c: 8, r: 0 }, to: { c: 14, r: 12 } } as never];
  const r = addResultRow(b, { fields: FIELDS, value: { spent: 30 }, at: new Date(2026, 10, 3) });
  const c = cellsOf(r.book);
  // Under the last row of its own columns, not under the total in G.
  assert.equal(r.row, 4);
  assert.equal(c.B4.v, 30);
  assert.deepEqual(c.B4.s, { fmt: 'currency', cur: '€' });
  assert.equal(c.E4.f, 'SUM(B$2:B4)');
  assert.equal(shown(r.book, 'E4'), 60);
  assert.equal(shown(r.book, 'G2'), 60);
  assert.equal(r.book.sheets[0].charts?.[0].range, 'A1:B4');
  assert.equal(r.book.sheets[0].comments?.length, 1);
  assert.equal(c.E1.v, 'Running total');
  // Their columns moved: the fields are found by their headings wherever they are.
  const moved = structuredClone(r.book);
  const m = moved.sheets[0].cells;
  [m.B1, m.C1] = [m.C1, m.B1];
  const r2 = addResultRow(moved, { fields: FIELDS, value: { spent: 40, note: 'n' }, at: new Date(2026, 10, 4) });
  assert.equal(cellsOf(r2.book).C5.v, 40);
  assert.equal(cellsOf(r2.book).B5.v, 'n');
  assert.deepEqual(r2.added, []);
});

test('a spreadsheet of the person’s own: the tab named (added when missing), under a heading row lower down', () => {
  const book: Workbook = {
    v: 1,
    sheets: [
      { id: 's1', name: 'Budget', cells: { A1: { v: 'Rent' }, B1: { v: 900 } } },
      { id: 's2', name: 'Log', cells: { A3: { v: 'When' }, B3: { v: 'spent' }, A4: { v: 46000 }, B4: { v: 7 } } },
    ],
  };
  const r = addResultRow(book, { tab: 'log', fields: FIELDS, value: { spent: 12, note: 'x' }, at: new Date(2026, 10, 5) });
  assert.equal(r.tab, 'Log');
  assert.equal(r.row, 5);
  const c = cellsOf(r.book, 1);
  assert.equal(c.B5.v, 12);
  assert.equal(c.A5.s?.fmt, 'datetime');
  assert.deepEqual(r.added, ['Note', 'Shops']);
  assert.deepEqual([c.C3.v, c.D3.v], ['Note', 'Shops']);
  assert.equal(c.C5.v, 'x');
  // The other tab as it was.
  assert.deepEqual(r.book.sheets[0], book.sheets[0]);
  // A tab not there is added.
  const t = addResultRow(book, { tab: 'Weekly', fields: FIELDS, value: { spent: 1 }, at: new Date() });
  assert.deepEqual(
    t.book.sheets.map((s) => s.name),
    ['Budget', 'Log', 'Weekly'],
  );
  assert.equal(t.row, 2);
});

// ---- through hand_back ----------------------------------------------------------------------------------------

const notes: unknown[] = [];
const sessionsFake = new EventEmitter();
sessionsFake.on('notify', (e) => notes.push(e));
const deps = { db, sessions: sessionsFake, broadcast: () => {} } as unknown as Deps;
let n = 0;
const ctxFor = (assistant: string): RunCtx => {
  const key = `claude:r${++n}`;
  db.prepare('insert or ignore into app_sessions (key, agent, created_at, updated_at) values (?, ?, ?, ?)').run(key, 'claude', Date.now(), Date.now());
  setSessionExtra(db, key, { assistant });
  return { runId: 'r', key, agent: 'claude', cwd: tmp, deps } as RunCtx;
};
const hand = async (id: string, v: Record<string, unknown>) => {
  const c = ctxFor(id);
  return (await handBackTool(c)!.run(v, c)) as string;
};

test('A row in a spreadsheet: the first run makes one named after the agent, later runs add rows to it, as new versions', async () => {
  const a = saveAssistant(db, { name: 'Bookkeeper', instructions: 'Keep the books.', output: { fields: FIELDS, to: [{ kind: 'sheet' }] } });
  assert.match(outputNote(a), /a row in a spreadsheet/);
  assert.match(outputNote(a), /plain numbers/);
  const first = await hand(a.id, { spent: 12, note: 'Bread' });
  assert.match(first, /Handed back\. It went to "Bookkeeper", row 2 of Results/);
  const id = madeOf(db, a.id).sheet!;
  assert.equal(pageInfo(db, id)?.kind, 'sheet');
  assert.equal(pageInfo(db, id)?.title, 'Bookkeeper');
  // The person edits it: a running total, as a new version of their own.
  const mine = readBook(pageSource(db, id)!.text);
  mine.sheets[0].cells.E1 = { v: 'Total' };
  mine.sheets[0].cells.E2 = { f: 'SUM(B$2:B2)' };
  addVersion(db, id, { model: mine, by: 'edit' });
  await hand(a.id, { spent: 30, note: 'Fish', shops: ['Market'] });
  const b = readBook(pageSource(db, id)!.text);
  assert.equal(b.sheets[0].cells.B3.v, 30);
  assert.equal(b.sheets[0].cells.D3.v, 'Market');
  assert.equal(b.sheets[0].cells.E3.f, 'SUM(B$2:B3)');
  assert.equal(shown(b, 'E3'), 42);
  assert.equal(versionsOf(db, id).length, 3);
  // The spreadsheet picked by the person, by id, and its tab.
  const r = resultsOf(db, a.id);
  assert.equal(r.length, 2);
  assert.deepEqual(r[0].sent, [{ kind: 'sheet', ok: true, detail: '"Bookkeeper", row 3 of Results', page: id }]);
  removeAssistant(db, a.id);
  assert.deepEqual(madeOf(db, a.id), {});
  assert.ok(pageInfo(db, id), 'the spreadsheet stays in the Library');
});

test('Update one page: the same Library page each run, a new version of it; a new page each run stays for those who want it', async () => {
  const a = saveAssistant(db, { name: 'Weekly report', instructions: 'Report.', output: { fields: [{ id: 'summary', label: 'Summary', type: 'markdown', required: true }], to: [{ kind: 'library' }] } });
  assert.deepEqual(a.output?.to, [{ kind: 'library' }]);
  await hand(a.id, { summary: 'Week one.' });
  const id = madeOf(db, a.id).library!;
  await hand(a.id, { summary: 'Week two.' });
  const p = pageInfo(db, id)!;
  assert.equal(p.title, 'Weekly report');
  assert.equal(p.version, 2);
  assert.match(pageSource(db, id)!.text, /Week two\./);
  assert.match(pageSource(db, id, 1)!.text, /Week one\./);
  assert.equal((db.prepare("select count(*) as n from pages where title like 'Weekly report%'").get() as { n: number }).n, 1);
  // A page renamed by the person keeps its name.
  db.prepare('update pages set title = ? where id = ?').run('Reports for Maria', id);
  await hand(a.id, { summary: 'Week three.' });
  assert.equal(pageInfo(db, id)!.title, 'Reports for Maria');
  // A new page each run.
  const b = saveAssistant(db, { ...a, output: { ...a.output, to: [{ kind: 'library', each: 'new' }] } });
  await hand(b.id, { summary: 'Separate.' });
  await hand(b.id, { summary: 'Again.' });
  assert.equal((db.prepare("select count(*) as n from pages where title like 'Weekly report · %'").get() as { n: number }).n, 2);
  removeAssistant(db, a.id);
});

test('agents saved before keep a new page each run; ones saved after update the same page', () => {
  const db2 = openDb(path.join(tmp, 'old.db'));
  kvSet(db2, 'assistants.mine', JSON.stringify([{ id: 'old-1', name: 'Old', icon: 'bot', description: '', instructions: '', output: { to: [{ kind: 'library' }, { kind: 'notify' }] } }]));
  assert.deepEqual(findAssistant(db2, 'old-1')?.output?.to, [{ kind: 'library', each: 'new' }, { kind: 'notify' }]);
  assert.equal(kvGet(db2, 'assistants.libraryEachNew'), '1');
  const fresh = saveAssistant(db2, { name: 'New', output: { to: [{ kind: 'library' }] } });
  assert.deepEqual(findAssistant(db2, fresh.id)?.output?.to, [{ kind: 'library' }]);
  db2.close();
});

test('the places are checked: email addresses, at most twenty, one of each kind', () => {
  const o = cleanAssistant({
    name: 'Mailer',
    output: {
      to: [
        { kind: 'email', to: 'anna@example.org, Sam Lee <sam@example.com>', subject: 'Week {date}\nBcc: x', account: 'me@example.net' },
        { kind: 'email', to: ['other@example.org'] },
        { kind: 'sheet', page: 'abc123', tab: 'Log/2026' },
        { kind: 'library', each: 'new', page: 'zzz' },
      ],
    },
  }).output!;
  assert.deepEqual(o.to, [
    { kind: 'email', to: ['anna@example.org', 'Sam Lee <sam@example.com>'], subject: 'Week {date} Bcc: x', account: 'me@example.net' },
    { kind: 'sheet', page: 'abc123', tab: 'Log2026' },
    { kind: 'library', each: 'new' },
  ]);
  assert.throws(() => cleanAssistant({ name: 'X', output: { to: [{ kind: 'email', to: [] }] } }), /Say who the email goes to/);
  assert.throws(() => cleanAssistant({ name: 'X', output: { to: [{ kind: 'email', to: 'not an address' }] } }), /is not an email address/);
  assert.throws(() => cleanAssistant({ name: 'X', output: { to: [{ kind: 'email', to: Array.from({ length: 21 }, (_, i) => `p${i}@example.org`) }] } }), /at most 20/);
});

// ---- email -----------------------------------------------------------------------------------------------------

test('An email of results: its subject filled in, the fields as readable HTML with styles on each part and as plain text', () => {
  const now = new Date(2026, 10, 15, 8, 5);
  assert.equal(mailSubject(undefined, { name: 'Shopper' }, now), 'Shopper · 2026-11-15');
  assert.equal(mailSubject('List for {date} at {time} from {agent}', { name: 'Shopper' }, now), 'List for 2026-11-15 at 08:05 from Shopper');
  const fields: AnswerField[] = [
    { id: 'items', label: 'To buy', type: 'list' },
    { id: 'total', label: 'Total', type: 'number' },
  ];
  const md = '## To buy\n\n- Milk\n- <Eggs>\n\n## Total\n\n12.5';
  const m = resultMail({ kind: 'email', to: ['anna@example.org'] }, { name: 'Shopper' }, { fields, markdown: md, html: '<h2>To buy</h2>\n<ul><li>Milk</li><li>&lt;Eggs&gt;</li></ul>\n<h2>Total</h2>\n<p>12.5</p>', now });
  assert.deepEqual(m.to, ['anna@example.org']);
  assert.equal(m.subject, 'Shopper · 2026-11-15');
  assert.match(m.html, /<h2 style="[^"]+">To buy<\/h2>/);
  assert.match(m.html, /<li style="[^"]+">&lt;Eggs&gt;<\/li>/);
  assert.match(m.html, /Sent by Shopper, an agent in Hydor/);
  assert.match(m.text, /^Shopper · 15 November 2026/);
  assert.match(m.text, /- Milk\n- <Eggs>/);
  assert.doesNotMatch(m.text, /<h2|<li/);
});

test('hand_back emails people through the mail code; what the server refused, or no mail account, shows where it went', async () => {
  const sent: { account?: string; mail: ResultMail }[] = [];
  sendResultMailVia(async (_db, account, mail) => {
    sent.push({ account, mail });
    return { accepted: mail.to.filter((t) => !t.startsWith('bad')), rejected: mail.to.filter((t) => t.startsWith('bad')) };
  });
  const a = saveAssistant(db, {
    name: 'Shopper',
    instructions: 'Shop.',
    output: { fields: [{ id: 'items', label: 'To buy', type: 'list', required: true }], to: [{ kind: 'email', to: ['anna@example.org', 'bad@example.org'], subject: 'Shopping {date}', account: 'me@example.net' }] },
  });
  assert.match(outputNote(a), /an email to anna@example\.org, bad@example\.org/);
  const ok = await hand(a.id, { items: ['Milk', 'Eggs'] });
  assert.match(ok, /It went to an email to anna@example\.org \(refused: bad@example\.org\)/);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].account, 'me@example.net');
  assert.match(sent[0].mail.subject, /^Shopping \d{4}-\d{2}-\d{2}$/);
  assert.match(sent[0].mail.text, /- Milk\n- Eggs/);
  // Through the Email connection itself: with no mail account connected, the result says so where it went.
  sendResultMailVia(null);
  const no = await hand(a.id, { items: ['Bread'] });
  assert.match(no, /It could not go to: an email \(No mail account is connected\. Connect one in Apps → Connected apps → Email\.\)/);
  assert.equal(resultsOf(db, a.id)[0].sent[0].ok, false);
  removeAssistant(db, a.id);
});

// ---- the history -------------------------------------------------------------------------------------------------

const result = (at: number, i: number): AgentResult => ({ at, key: `claude:h${i}`, line: `Result ${i}`, value: { n: i }, sent: [] });

test(`the history keeps results for a year, at most ${RESULTS_KEEP.count} an agent, newest first, in pages`, () => {
  const now = Date.now();
  const day = 86_400_000;
  // Some older than a year go at once; the rest are kept.
  for (let i = 0; i < 5; i++) keepResult(db, 'hist-a', result(now - (400 - i) * day, i), now);
  assert.equal(resultsPage(db, 'hist-a').total, 0);
  for (let i = 0; i < 10; i++) keepResult(db, 'hist-a', result(now - (300 - i) * day, i), now);
  assert.equal(resultsPage(db, 'hist-a').total, 10);
  // Seventy days later, the four now over 366 days old go (they were 300 to 291 days old).
  keepResult(db, 'hist-a', result(now, 99), now + 70 * day);
  const left = resultsPage(db, 'hist-a', { limit: 200 }).results;
  assert.equal(left.length, 7);
  assert.equal(left[0].line, 'Result 99');
  // At most RESULTS_KEEP.count: the oldest go.
  const tx = db.transaction(() => {
    for (let i = 0; i < RESULTS_KEEP.count + 30; i++) keepResult(db, 'hist-b', result(now - 1000 + i, i), now);
  });
  tx();
  const p1 = resultsPage(db, 'hist-b', { limit: 100 });
  assert.equal(p1.total, RESULTS_KEEP.count);
  assert.equal(p1.results.length, 100);
  assert.equal(p1.more, true);
  assert.equal(p1.results[0].line, `Result ${RESULTS_KEEP.count + 29}`);
  const p2 = resultsPage(db, 'hist-b', { limit: 100, before: p1.results[99].id });
  assert.equal(p2.results[0].line, `Result ${RESULTS_KEEP.count + 29 - 100}`);
  let all = 0;
  let before: number | undefined;
  for (;;) {
    const p = resultsPage(db, 'hist-b', { limit: 200, before });
    all += p.results.length;
    if (!p.more) {
      assert.equal(p.results.at(-1)?.line, 'Result 30');
      break;
    }
    before = p.results.at(-1)!.id;
  }
  assert.equal(all, RESULTS_KEEP.count);
  // Other agents' are their own.
  assert.equal(resultsPage(db, 'hist-a').total, 7);
});

test('the history: a long field is put aside, the others kept; the last twenty kept before move in once', () => {
  const v = keptValue({ big: 'x'.repeat(30_000), n: 3, list: ['a'] });
  assert.deepEqual(v, { big: CUT, n: 3, list: ['a'] });
  kvSet(db, 'assistants.results.old-agent', JSON.stringify([result(3000, 3), result(2000, 2), result(1000, 1)]));
  const r = resultsOf(db, 'old-agent');
  assert.deepEqual(
    r.map((x) => x.line),
    ['Result 3', 'Result 2', 'Result 1'],
  );
  assert.equal(kvGet(db, 'assistants.results.old-agent'), undefined);
  assert.equal(resultsOf(db, 'old-agent').length, 3);
});

// ---- run ----------------------------------------------------------------------------------------------

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}`);
    console.log(e);
    process.exitCode = 1;
  }
}
console.log(`\n${passed}/${tests.length} passed`);
db.close();
fs.rmSync(tmp, { recursive: true, force: true });
