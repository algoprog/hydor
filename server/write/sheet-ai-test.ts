// Script tests for the spreadsheet editor's AI helpers: Fill with AI's own patterns (shared/sheet-flash.ts), what Clean
// up the data finds and how it fixes it (shared/sheet-clean.ts), and the helper model's calls (sheets.ts) with a
// stand-in model: AI cells asked together and read back, a formula written and checked (asked again when it does not
// read), a column filled, ideas checked, a table made. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/write/sheet-ai-test.ts
//   DATA_DIR=/tmp/hydor-test-sheet-ai node dist/dev/sheet-ai-test.js
import { flashFill } from '../../shared/sheet-flash.ts';
import { findIssues } from '../../shared/sheet-clean.ts';
import { computeBook, normalizeBook } from '../../shared/sheets.ts';
import type { DB } from '../db.ts';
import { aiCells, analyze, cellsPrompt, fillColumn, ideasOf, makeTable, setSheetAiForTests, writeFormula } from './sheets.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---- Fill with AI: patterns found here --------------------------------------------------------------------------------
{
  const names = [['John Smith'], ['Mary Jones'], ['Ann Lee'], ['Bo Ek']];
  let f = flashFill([{ inputs: names[0], output: 'J. Smith' }], names.slice(1));
  ok(f && same(f.outputs, ['M. Jones', 'A. Lee', 'B. Ek']), 'an initial and the last word');
  f = flashFill([{ inputs: ['ann@example.com'], output: 'ann' }, { inputs: ['bo.ek@mail.org'], output: 'bo.ek' }], [['cy@x.io']]);
  ok(f && same(f.outputs, ['cy']), 'the part before the @');
  f = flashFill([{ inputs: ['Ann', 'Lee'], output: 'Lee, Ann' }], [['Bo', 'Ek'], ['Cy', 'Ma']]);
  ok(f && same(f.outputs, ['Ek, Bo', 'Ma, Cy']), 'two columns joined with words between');
  f = flashFill([{ inputs: ['hello world'], output: 'HELLO WORLD' }], [['good day']]);
  ok(f && same(f.outputs, ['GOOD DAY']), 'in capitals');
  f = flashFill([{ inputs: ['(555) 123-4567'], output: '5551234567' }, { inputs: ['555.987.6543'], output: '5559876543' }], [['+1 202 555 0101']]);
  ok(f && same(f.outputs, ['12025550101']), 'the digits');
  f = flashFill([{ inputs: ['2026-11-06'], output: '2026' }, { inputs: ['2025-01-31'], output: '2025' }], [['2024-07-04']]);
  ok(f && same(f.outputs, ['2024']), 'the first part split at -');
  f = flashFill([{ inputs: ['red'], output: 'Banana' }, { inputs: ['blue'], output: 'Cherry' }], [['green']]);
  ok(f === null, 'no pattern fits: none (the helper model is asked)');
}

// ---- Clean up the data ---------------------------------------------------------------------------------------------
{
  const book = normalizeBook({
    sheets: [
      {
        name: 'S',
        cells: {
          A1: 'Name', B1: 'Status', C1: 'Amount', D1: 'When',
          A2: { v: ' Ann  Lee ' }, B2: 'Received', C2: 10, D2: '2026-01-05',
          A3: 'Bo', B3: { v: 'received' }, C3: { v: '20' }, D3: { v: '6 Jan 2026' },
          A4: 'Cy', B4: 'Received', C4: 30, D4: '2026-01-07',
          A5: 'Dee', B5: 'Recieved', C5: 40, D5: '2026-01-08',
          A6: 'Cy', B6: 'Received', C6: 30, D6: '2026-01-07',
          A8: 'Eve', B8: 'Received', C8: 50, D8: '2026-01-09',
          A9: 'Fay', B9: 'Received', C9: 60, D9: '2026-01-10',
        },
      },
    ],
  });
  const sh = book.sheets[0];
  const calc = computeBook(book);
  const issues = findIssues(sh, calc, 0, { r1: 0, c1: 0, r2: 8, c2: 3 }, true);
  const by = (id: string) => issues.find((i) => i.id === id);
  ok(by('spaces')?.changes?.A2?.v === 'Ann Lee', 'spaces at the ends and twice between words, trimmed');
  ok(by('numbers')?.changes?.C3?.v === 20, 'a number kept as words, made a number');
  ok(typeof by('dates')?.changes?.D3?.v === 'number' && by('dates')?.changes?.D3?.s?.fmt === 'date', 'a date written as words, made a date');
  const sp = by('spelling-1');
  ok(sp?.changes?.B3?.v === 'Received' && sp?.changes?.B5?.v === 'Received', 'different spellings: the case and a letter swapped, as the most common');
  ok(!!by('dups') && by('dups')!.detail.startsWith('1 row'), 'a duplicate row');
  ok(same(by('blank')?.rows, [6]), 'an empty row inside the table');
}

// ---- the helper model's calls, with a stand-in --------------------------------------------------------------------
const db = null as unknown as DB;
const never = new AbortController().signal;
{
  const asks: string[] = [];
  setSheetAiForTests(async (q) => {
    asks.push(q.prompt);
    return '```json\n{"answers": {"1": "France", "2": 42, "3": null}}\n```';
  });
  const r = await aiCells(db, { asks: [{ key: 'aaaa1', prompt: 'Country?', context: ['Paris'] }, { key: 'aaaa2', prompt: 'Country?', context: ['Rome'] }, { key: 'aaaa3', prompt: 'Other?', context: [] }, { key: 'bad key', prompt: 'x', context: [] }] }, never);
  ok(r.answers.aaaa1 === 'France' && r.answers.aaaa2 === 42 && r.failed?.aaaa3, 'AI cells: answers by key, numbers as numbers, none said so');
  ok(asks.length === 1 && asks[0].split('Prompt: Country?').length === 2, 'asked together, one prompt for the cells that share it');
  ok(cellsPrompt([{ prompt: 'P', context: ['a\tb\nc\td'] }]).includes('      a\tb'), 'a range given as rows');

  let tries = 0;
  setSheetAiForTests(async () => (++tries === 1 ? '{"formula": "=SUMIF(B2:B9,\\"Paid\\",C2:C9", "explain": "x"}' : '{"formula": "=SUMIF(B2:B9,\\"Paid\\",C2:C9)", "explain": "The total of column C where B says Paid."}'));
  const f = await writeFormula(db, { ask: 'total of C where B is Paid', sheet: 'S', at: 'D1', table: '' }, never);
  ok(f.formula === '=SUMIF(B2:B9,"Paid",C2:C9)' && tries === 2, 'a formula that does not read is asked for again');
  setSheetAiForTests(async () => '{"formula": "=MAGIC(A1)", "explain": "x"}');
  let threw = '';
  await writeFormula(db, { ask: 'x', sheet: 'S', at: 'A1', table: '' }, never).catch((e) => (threw = (e as Error).message));
  ok(/MAGIC/.test(threw), 'a function the sheet does not have is refused, saying which');

  setSheetAiForTests(async () => '{"outputs": ["a", "", "c"]}');
  const fill = await fillColumn(db, { examples: [{ inputs: ['x'], output: 'y' }], rows: [['1'], ['2'], ['3']] }, never);
  ok(same(fill.outputs, ['a', null, 'c']), 'Fill with AI: one a row, none where it could not tell');

  const ideas = ideasOf([{ kind: 'chart', title: 'T', chart: 'line', x: 'a', ys: ['C', '??'] }, { kind: 'pivot', title: 'P', by: 'B', values: [{ col: 'C', fn: 'average' }] }, { kind: 'formula', title: 'F', formula: 'SUM(C2:C9' }, { kind: 'formula', title: 'G', formula: 'SUM(C2:C9)' }]);
  ok(ideas.length === 3 && ideas[0].kind === 'chart' && same((ideas[0] as { ys: string[] }).ys, ['C']) && ideas[2].kind === 'formula' && (ideas[2] as { formula: string }).formula === '=SUM(C2:C9)', 'ideas checked: columns by letter, formulas that read');
  setSheetAiForTests(async () => '{"answer": "March sold most.", "ideas": []}');
  const an = await analyze(db, { columns: [{ letter: 'A', name: 'Month', about: 'words' }], table: '', sheet: 'S', range: 'A1:B4', question: 'Which month?' }, never);
  ok(an.answer === 'March sold most.', 'Analyze the data: the answer');

  setSheetAiForTests(async () => '{"title": "Iceland packing list", "columns": [{"name": "Item", "type": "text"}, {"name": "Qty", "type": "number"}, {"name": "Packed", "type": "checkbox"}, {"name": "Bag", "type": "list", "options": ["Carry-on", "Checked"]}], "rows": [["Wool socks", "4", "yes", "Checked"], ["Rain jacket", 1, false, "Carry-on"]]}');
  const t = await makeTable(db, { ask: 'packing list' }, never);
  ok(t.columns.length === 4 && t.rows[0][1] === 4 && t.rows[0][2] === true && t.rows[1][2] === false && same(t.columns[3].options, ['Carry-on', 'Checked']), 'a table made: its kinds of columns, values as they go in');
  setSheetAiForTests(null);
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
