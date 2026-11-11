// Script tests for how the documents editor tidies words as they are typed (a web address made a link, curly quotes,
// dashes, signs, arrows, an ellipsis, fractions), for a table's rows and columns put in or taken out as many as the
// cells picked are in, for the sizes Ctrl+Shift+> steps through, and for the document's language (kept, written to a
// Word file and read back). The editing logic is pure (web/src/features/pages/docs/autoformat.ts and ops.ts), so it is
// checked here without a page. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/doc-editing-test.ts
//   DATA_DIR=/tmp/hydor-test-doc-editing node dist/dev/doc-editing-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { docText, normalizeDoc, type Doc, type TableBlock } from '../../shared/docs.ts';
import { openDb } from '../db.ts';
import { docFromFile, docxOfDoc } from './docs.ts';
import { fractionBefore, lonelyUrl, replaceTyped, urlBefore } from '../../web/src/features/pages/docs/autoformat.ts';
import * as ops from '../../web/src/features/pages/docs/ops.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string, extra?: unknown) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}${extra !== undefined ? ` :: ${JSON.stringify(extra).slice(0, 600)}` : ''}`);
  }
};

/** What typing `ch` after `before` makes of the words: the words with the change made, or as typed. */
const typed = (before: string, ch: string) => {
  const r = replaceTyped(before, ch);
  return r ? before.slice(0, before.length - r.drop) + r.put : before + ch;
};

// ---- curly quotes, dashes and signs ------------------------------------------------------------------------------
ok(typed('', '"') === '“', 'a quote at the start opens');
ok(typed('He said ', '"') === 'He said “', 'a quote after a space opens');
ok(typed('He said “hi', '"') === 'He said “hi”', 'a quote after a word closes');
ok(typed('(', '"') === '(“', 'a quote after a bracket opens');
ok(typed('it', "'") === 'it’', 'an apostrophe after a letter closes');
ok(typed('say ', "'") === 'say ‘', 'a single quote after a space opens');
ok(typed('a-', '-') === 'a–', '-- becomes an en dash');
ok(typed('a–', '-') === 'a—', '--- becomes an em dash');
ok(typed('-', '-') === '--', '-- at a line’s start is left (the line across shortcut)');
ok(typed('--', '-') === '---', '--- at a line’s start is left');
ok(typed('well', '-') === 'well-', 'one hyphen stays a hyphen');
ok(typed('a <', '-') === 'a ←', '<- becomes a left arrow');
ok(typed('a -', '>') === 'a →', '-> becomes a right arrow');
ok(typed('a (c', ')') === 'a ©', '(c) becomes ©');
ok(typed('a (R', ')') === 'a ®', '(R) becomes ®');
ok(typed('a (tm', ')') === 'a ™', '(tm) becomes ™');
ok(typed('wait..', '.') === 'wait…', '... becomes an ellipsis');
ok(typed('wait.', '.') === 'wait..', 'two dots stay two dots');
ok(replaceTyped('a (c', ')', false) === null && replaceTyped('', '"', false) === null, 'with Smart quotes and symbols off nothing changes');
ok(replaceTyped('a', 'b') === null, 'ordinary letters are left alone');

// ---- fractions ---------------------------------------------------------------------------------------------------
ok(fractionBefore('add 1/2')?.put === '½' && fractionBefore('add 1/2')?.drop === 3, '1/2 as a word is ½');
ok(fractionBefore('1/4')?.put === '¼' && fractionBefore('(3/4')?.put === '¾', '1/4 and 3/4 too');
ok(fractionBefore('11/2') === null && fractionBefore('a1/2') === null, 'a fraction inside a number or word is left');
ok(fractionBefore('1/2/3') === null, '1/2/3 (a date) is left');

// ---- web addresses -----------------------------------------------------------------------------------------------
const u1 = urlBefore('see https://example.com/a?b=1');
ok(u1?.url === 'https://example.com/a?b=1' && u1.from === 4 && u1.to === 'see https://example.com/a?b=1'.length, 'a web address at the end is found', u1);
const u2 = urlBefore('(see www.example.com).');
ok(u2?.url === 'https://www.example.com' && '(see www.example.com).'.slice(u2.from, u2.to) === 'www.example.com', 'closing punctuation stays out, www. gets https://', u2);
ok(urlBefore('visit https://a.com.')?.to === 'visit https://a.com'.length, 'a full stop after an address is not in the link');
ok(urlBefore('plain words') === null && urlBefore('www.') === null && urlBefore('http://') === null, 'words that are not an address are not');
ok(urlBefore('xhttps://a.com') === null, 'an address must start a word');
ok(lonelyUrl(' https://a.com/x ') === 'https://a.com/x' && lonelyUrl('two words') === null && lonelyUrl('hello') === null, 'a lone address pasted over words');
ok(lonelyUrl('www.a.com') === 'https://www.a.com', 'a lone www address');

// ---- tables: rows and columns as many as are picked ---------------------------------------------------------------
const base = (rows: number, cols: number): { doc: Doc; id: string } => {
  const md = `| ${Array.from({ length: cols }, (_, c) => `h${c}`).join(' | ')} |\n| ${Array.from({ length: cols }, () => '---').join(' | ')} |\n${Array.from({ length: rows - 1 }, (_, r) => `| ${Array.from({ length: cols }, (_, c) => `r${r}c${c}`).join(' | ')} |`).join('\n')}\n`;
  const doc = normalizeDoc({ markdown: md });
  return { doc, id: doc.blocks.find((b) => b.type === 'table')!.id };
};
const table = (d: Doc, id: string) => d.blocks.find((b) => b.id === id) as TableBlock | undefined;
const cellText = (d: Doc, id: string, r: number, c: number) => table(d, id)!.rows[r][c].runs.map((x) => x.t).join('');

{
  const { doc, id } = base(5, 3);
  ok(table(doc, id)?.rows.length === 5 && table(doc, id)?.rows[0].length === 3, 'the test table is 5 × 3', table(doc, id)?.rows.length);
  // Rows 1–2 picked: two rows go in above them.
  const a = ops.tableOps(doc, id, [1, 0], [2, 1], 'rowAbove').doc;
  ok(table(a, id)!.rows.length === 7 && cellText(a, id, 1, 0) === '' && cellText(a, id, 2, 0) === '' && cellText(a, id, 3, 0) === 'r0c0', 'two rows picked: two put in above them', table(a, id)!.rows.map((r) => r[0].runs.map((x) => x.t).join('')));
  // And below.
  const b = ops.tableOps(doc, id, [1, 0], [2, 1], 'rowBelow').doc;
  ok(table(b, id)!.rows.length === 7 && cellText(b, id, 2, 0) === 'r1c0' && cellText(b, id, 3, 0) === '' && cellText(b, id, 4, 0) === '' && cellText(b, id, 5, 0) === 'r2c0', 'two rows picked: two put in below them', table(b, id)!.rows.map((r) => r[0].runs.map((x) => x.t).join('')));
  // Columns: picked from the right to the left.
  const c = ops.tableOps(doc, id, [0, 2], [1, 1], 'colLeft').doc;
  ok(table(c, id)!.rows[0].length === 5 && cellText(c, id, 1, 3) === 'r0c1' && cellText(c, id, 1, 1) === '', 'two columns picked: two put in on the left', table(c, id)!.rows[1].map((x) => x.runs.map((y) => y.t).join('')));
  const d = ops.tableOps(doc, id, [0, 1], [0, 2], 'colRight').doc;
  ok(table(d, id)!.rows[0].length === 5 && cellText(d, id, 1, 2) === 'r0c2' && cellText(d, id, 1, 3) === '', 'two columns picked: two put in on the right');
  // Deleting.
  const e = ops.tableOps(doc, id, [3, 0], [1, 2], 'delRow').doc;
  ok(table(e, id)!.rows.length === 2 && cellText(e, id, 0, 0) === 'h0' && cellText(e, id, 1, 0) === 'r3c0', 'three rows picked: all three deleted', table(e, id)!.rows.map((r) => r[0].runs.map((x) => x.t).join('')));
  const f = ops.tableOps(doc, id, [0, 0], [0, 1], 'delCol').doc;
  ok(table(f, id)!.rows[0].length === 1 && cellText(f, id, 1, 0) === 'r0c2', 'two columns picked: both deleted');
  const g = ops.tableOps(doc, id, [0, 0], [4, 0], 'delRow').doc;
  ok(!table(g, id), 'all rows picked: the table goes');
  const h = ops.tableOps(doc, id, [0, 0], [0, 2], 'delCol').doc;
  ok(!table(h, id), 'all columns picked: the table goes');
  // One cell is as before.
  const one = ops.tableOps(doc, id, [2, 1], [2, 1], 'rowBelow').doc;
  ok(table(one, id)!.rows.length === 6 && cellText(one, id, 3, 0) === '', 'one cell picked: one row');
  const two = ops.tableOp(doc, id, [2, 1], 'rowBelow').doc;
  ok(docText(one) === docText(two), 'tableOps on one cell is tableOp');
  // The header row and the table itself pass through.
  ok(!table(ops.tableOps(doc, id, [0, 0], [1, 1], 'delTable').doc, id), 'delete the table with cells picked');
}

// ---- merged cells stay whole while rows go -------------------------------------------------------------------------
{
  const { doc, id } = base(4, 3);
  const merged = ops.mergeCells(doc, id, [1, 0], [2, 0]).doc;
  const gone = ops.tableOps(merged, id, [1, 1], [2, 1], 'delRow').doc;
  ok(table(gone, id)!.rows.length === 2, 'rows through a merged cell are taken out', table(gone, id)!.rows.length);
}

// ---- sizes ---------------------------------------------------------------------------------------------------------
ok(ops.stepSize(11, 1) === 12 && ops.stepSize(12, 1) === 14 && ops.stepSize(11, -1) === 10, 'a size steps through the usual ones');
ok(ops.stepSize(11.5, 1) === 12 && ops.stepSize(11.5, -1) === 11, 'a size between two steps to the next');
ok(ops.stepSize(8, -1) === 7 && ops.stepSize(96, 1) === 108 && ops.stepSize(400, 1) === 400 && ops.stepSize(1, -1) === 1, 'beyond the usual sizes: a point or a dozen at a time, within bounds');

// ---- the document's language ---------------------------------------------------------------------------------------
{
  const doc = normalizeDoc({ markdown: 'Καλημέρα κόσμε', lang: 'el' });
  ok(doc.lang === 'el', 'a document keeps its language', doc.lang);
  ok(normalizeDoc({ markdown: 'x', lang: 'EN_us' }).lang === 'en-US', 'a language tag is written in the usual way');
  ok(normalizeDoc({ markdown: 'x', lang: 'not a language' }).lang === undefined && normalizeDoc({ markdown: 'x' }).lang === undefined, 'no language, or not one: none');
  const again = normalizeDoc(JSON.parse(docText(doc)));
  ok(again.lang === 'el', 'the language is kept in the text a version keeps');
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-doc-editing-test-')));
  const db = openDb(path.join(tmp, 'test.db'));
  const back = docFromFile(docxOfDoc(db, doc, 'Language'), 'Language.docx');
  ok(back.lang === 'el', 'the language goes to a Word file and comes back', back.lang);
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
