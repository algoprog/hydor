// Script tests for comparing two versions of a workbook (shared/sheet-diff.ts), as the spreadsheet editor's Compare
// shows them: values and formulas changed; a row put in that marks only itself (by a key column, and by what rows
// hold), its totals' formulas followed through it rather than marked; a column taken out; a tab renamed (formulas that
// name it left alone) and one added; a number format alone; rows sorted (moved, nothing changed); and each change put
// back, one at a time, until nothing is left to compare. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs shared/sheet-diff-test.ts
//   DATA_DIR=/tmp/hydor-test-sheet-diff node dist/dev/sheet-diff-test.js
import { adjustForDelete, adjustForInsert, normalizeBook, renameSheet, type Cell, type Workbook } from './sheets.ts';
import { diffBooks, putBack, type BookDiff, type PutBack } from './sheet-diff.ts';

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
/** Cells by name, in one order, to compare. */
const sameCells = (x: Record<string, Cell>, y: Record<string, Cell>) => {
  const sorted = (c: Record<string, Cell>) => JSON.stringify(Object.keys(c).sort().map((k) => [k, c[k]]));
  return sorted(x) === sorted(y);
};
const set = (b: Workbook, si: number, name: string, cell: Cell | null): Workbook => {
  const next = clone(b);
  if (cell) next.sheets[si].cells[name] = cell;
  else delete next.sheets[si].cells[name];
  return next;
};

const budget = (): Workbook =>
  normalizeBook({
    sheets: [
      {
        id: 'budget',
        name: 'Budget',
        rows: [
          ['Item', 'Jan', 'Feb', 'Total'],
          ['Rent', 1000, 1000, '=B2+C2'],
          ['Food', 300, 320, '=B3+C3'],
          ['Fun', 100, 90, '=B4+C4'],
          ['Gifts', 50, 60, '=B5+C5'],
          ['Total', '=SUM(B2:B5)', '=SUM(C2:C5)', '=SUM(D2:D5)'],
        ],
      },
      { id: 'notes', name: 'Notes', rows: [['Saved'], ['=Budget!D6']] },
    ],
  });

// ---- nothing changed ------------------------------------------------------------------------------------------------
{
  const b = budget();
  const d = diffBooks(b, clone(b));
  ok(d.same && d.totals.cells === 0 && d.tabs.every((t) => !t.changed), 'the same workbook: nothing changed');
}

// ---- values and formulas ------------------------------------------------------------------------------------------------
{
  const b = budget();
  let a = set(b, 0, 'C3', { v: 350 });
  a = set(a, 0, 'D2', { f: 'B2*2' });
  const d = diffBooks(b, a);
  const t = d.tabs[0];
  ok(t.cells.length === 2 && d.totals.cells === 2 && d.totals.cellTabs === 1, `two cells changed (${t.cells.length})`);
  const c3 = t.cells.find((x) => x.r === 2 && x.c === 2);
  ok(c3?.kind === 'value' && c3.before.input === '320' && c3.after.input === '350', 'a value changed, with what it was and is');
  const d2 = t.cells.find((x) => x.r === 1 && x.c === 3);
  ok(d2?.kind === 'formula' && d2.before.input === '=B2+C2' && d2.after.input === '=B2*2' && d2.before.shown === '2000' && d2.after.shown === '2000', 'a formula changed, with its results');
  ok(t.results.some((x) => x.r === 2 && x.c === 3 && x.before === '620' && x.after === '650') && t.results.some((x) => x.r === 5 && x.c === 2), 'formulas whose results changed with them are listed apart');
  ok(!t.rows.added.length && !t.rows.removed.length && !t.cols.added.length, 'no rows or columns added or removed');
  ok(t.rule.by === 'key' && t.rule.col === 0 && t.rule.header === 'Item', `rows lined up by the key column A, “Item” (${JSON.stringify(t.rule)})`);
}

// ---- a row put in -------------------------------------------------------------------------------------------------------
{
  const b = budget();
  // As the editor puts one in: the rows under it move down, the totals' ranges grow.
  let a = adjustForInsert(b, 'budget', 'row', 3, 1);
  a = set(a, 0, 'A4', { v: 'Travel' });
  a = set(a, 0, 'B4', { v: 200 });
  a = set(a, 0, 'C4', { v: 0 });
  a = set(a, 0, 'D4', { f: 'B4+C4' });
  ok(a.sheets[0].cells.B7?.f === 'SUM(B2:B6)', 'the editor grew the total’s range');
  const d = diffBooks(b, a);
  const t = d.tabs[0];
  ok(t.rows.added.length === 1 && t.rows.added[0] === 3 && !t.rows.removed.length, `one row added, row 4 (${t.rows.added})`);
  ok(t.cells.length === 0, `no cell under it is marked changed (${t.cells.map((x) => `${x.r},${x.c}:${x.kind}`).join(' ')})`);
  ok(t.results.some((x) => x.r === 6 && x.c === 1 && x.before === '1450' && x.after === '1650'), 'the total’s result changed with it');
  ok(d.totals.rowsAdded === 1 && d.tabs[1].cells.length === 0, 'the other tab’s formula into the moved total is followed too');
  const order = t.rows.order.map((x) => `${x.a}:${x.b}`).join(' ');
  ok(order === '0:0 1:1 2:2 3:-1 4:3 5:4 6:5', `the rows in the order they show (${order})`);

  // A list with no key column and no header: lined up by what its rows hold.
  const list = normalizeBook({ sheets: [{ id: 's', name: 'S', rows: [[1, 'a'], [2, 'b'], [2, 'b'], [4, 'd'], [5, 'e'], [6, 'f']] }] });
  const more = adjustForInsert(list, 's', 'row', 2, 1);
  const grown = set(set(more, 0, 'A3', { v: 9 }), 0, 'B3', { v: 'z' });
  const dl = diffBooks(list, grown);
  ok(dl.tabs[0].rule.by === 'content' && dl.tabs[0].rows.added.join() === '2' && dl.tabs[0].cells.length === 0, `without a key, by what rows hold: one row added (${dl.tabs[0].rows.added}; ${dl.tabs[0].cells.length} cells)`);
  // A row changed in place stays a change of its cells, not a row taken out and another put in.
  const edited = set(set(list, 0, 'A4', { v: 40 }), 0, 'B4', { v: 'D' });
  const de = diffBooks(list, edited);
  ok(de.tabs[0].cells.length === 2 && !de.tabs[0].rows.added.length && !de.tabs[0].rows.removed.length, 'a row changed in place: its cells changed');
}

// ---- a column taken out ---------------------------------------------------------------------------------------------------
{
  const b = budget();
  const a = adjustForDelete(b, 'budget', 'col', 2, 1);
  const d = diffBooks(b, a);
  const t = d.tabs[0];
  ok(t.cols.removed.length === 1 && t.cols.removed[0] === 2 && !t.cols.added.length, `column C removed (${t.cols.removed})`);
  ok(!t.rows.added.length && !t.rows.removed.length, 'no rows added or removed');
  ok(t.cells.every((x) => x.kind !== 'value'), 'no value marked changed');
  ok(d.totals.colsRemoved === 1, 'counted');
}

// ---- tabs renamed and added -----------------------------------------------------------------------------------------------
{
  const b = budget();
  let a = renameSheet(b, 'budget', 'Spending');
  a = { ...a, sheets: [...a.sheets, { id: 'new', name: 'Ideas', cells: { A1: { v: 'Bike' } } }] };
  const d = diffBooks(b, a);
  const spend = d.tabs.find((t) => t.name === 'Spending');
  ok(spend?.status === 'kept' && spend.was === 'Budget' && spend.cells.length === 0, 'a tab renamed: its old name, nothing else changed');
  ok(d.tabs.find((t) => t.name === 'Notes')?.cells.length === 0, 'a formula that names the renamed tab is not marked');
  ok(d.tabs.find((t) => t.name === 'Ideas')?.status === 'added' && d.totals.tabsAdded === 1 && d.totals.tabsRenamed === 1, 'a tab added');
  // Renamed with no id to go by (an agent wrote the workbook afresh): matched by what it holds.
  const fresh = normalizeBook({ sheets: [{ name: 'Costs', rows: budget().sheets[0].cells ? [['Item', 'Jan', 'Feb', 'Total'], ['Rent', 1000, 1000, '=B2+C2'], ['Food', 300, 320, '=B3+C3'], ['Fun', 100, 90, '=B4+C4'], ['Gifts', 50, 60, '=B5+C5'], ['Total', '=SUM(B2:B5)', '=SUM(C2:C5)', '=SUM(D2:D5)']] : [] }, { name: 'Notes', rows: [['Saved'], ['=Costs!D6']] }] });
  const df = diffBooks(b, fresh);
  ok(df.tabs.length === 2 && df.tabs[0].was === 'Budget' && df.tabs[0].name === 'Costs' && df.totals.cells === 0, `a tab renamed by an agent that wrote it afresh (${df.tabs.map((t) => `${t.name}:${t.status}:${t.was ?? ''}`).join(', ')}; ${df.totals.cells} cells)`);
  const gone = { ...b, sheets: [b.sheets[0]] };
  const dg = diffBooks(b, gone);
  ok(dg.tabs.length === 2 && dg.tabs[1].status === 'removed' && dg.tabs[1].name === 'Notes' && dg.totals.tabsRemoved === 1, 'a tab removed shows where it was');
}

// ---- number formats alone --------------------------------------------------------------------------------------------------
{
  const b = budget();
  let a = set(b, 0, 'B2', { v: 1000, s: { fmt: 'currency', cur: '$', dp: 2 } });
  a = set(a, 0, 'A1', { v: 'Item', s: { b: true } });
  const d = diffBooks(b, a);
  const t = d.tabs[0];
  const b2 = t.cells.find((x) => x.r === 1 && x.c === 1);
  ok(b2?.kind === 'format' && b2.before.shown === '1000' && b2.after.shown === '$1,000.00', `a number format alone: shown ${b2?.before.shown} → ${b2?.after.shown}`);
  ok(t.cells.find((x) => x.r === 0 && x.c === 0)?.kind === 'style', 'a look alone (bold)');
  ok(!t.results.length, 'no result changed');
}

// ---- rows sorted ---------------------------------------------------------------------------------------------------------
{
  const b = normalizeBook({ sheets: [{ id: 'p', name: 'People', rows: [['Name', 'Age'], ['Ann', 30], ['Bob', 25], ['Cat', 41], ['Dan', 19]] }] });
  const a = normalizeBook({ sheets: [{ id: 'p', name: 'People', rows: [['Name', 'Age'], ['Dan', 19], ['Bob', 25], ['Ann', 30], ['Cat', 41]] }] });
  const d = diffBooks(b, a);
  const t = d.tabs[0];
  ok(t.cells.length === 0 && !t.rows.added.length && !t.rows.removed.length && t.rows.moved.length > 0, `sorted: rows moved, nothing changed (${t.rows.moved}; ${t.cells.length} cells)`);
}

// ---- putting changes back ------------------------------------------------------------------------------------------------
/** Every change of a diff that can be put back, the first of them. */
function firstChange(d: BookDiff): PutBack | null {
  for (let i = 0; i < d.tabs.length; i++) {
    const t = d.tabs[i];
    if (t.status === 'added') return { k: 'tab-added', tab: i };
    if (t.status === 'removed') return { k: 'tab-removed', tab: i };
    if (t.was) return { k: 'tab-renamed', tab: i };
    if (t.rows.added.length) return { k: 'row-added', tab: i, a: t.rows.added[0] };
    if (t.rows.removed.length) return { k: 'row-removed', tab: i, b: t.rows.removed[0] };
    if (t.cols.added.length) return { k: 'col-added', tab: i, a: t.cols.added[0] };
    if (t.cols.removed.length) return { k: 'col-removed', tab: i, b: t.cols.removed[0] };
    if (t.cells.length) return { k: 'cell', tab: i, r: t.cells[0].r, c: t.cells[0].c };
  }
  return null;
}
function putAllBack(b: Workbook, a: Workbook): { book: Workbook; steps: number } {
  let book = a;
  let steps = 0;
  for (; steps < 50; steps++) {
    const d = diffBooks(b, book);
    const p = firstChange(d);
    if (!p) break;
    book = putBack(b, book, d, p);
  }
  return { book, steps };
}
{
  const b = budget();
  // One cell put back: as it was.
  const a = set(b, 0, 'C3', { v: 350 });
  const d = diffBooks(b, a);
  const one = putBack(b, a, d, { k: 'cell', tab: 0, r: 2, c: 2 });
  ok(one.sheets[0].cells.C3?.v === 320 && diffBooks(b, one).same, 'a cell put back');

  // A row taken out, put back where it was: its formulas, and the totals' ranges, as they were.
  const cut = adjustForDelete(b, 'budget', 'row', 2, 1);
  const dc = diffBooks(b, cut);
  ok(dc.tabs[0].rows.removed.join() === '2' && dc.tabs[0].cells.length === 0, `a row removed (${dc.tabs[0].rows.removed})`);
  const back = putBack(b, cut, dc, { k: 'row-removed', tab: 0, b: 2 });
  ok(sameCells(back.sheets[0].cells, b.sheets[0].cells), 'a row removed, put back: the cells as they were, formulas and totals too');
  ok(back.sheets[1].cells.A2?.f === 'Budget!D6', 'the other tab’s formula follows it back');

  // A column taken out, put back.
  const noFeb = adjustForDelete(b, 'budget', 'col', 2, 1);
  const r1 = putAllBack(b, noFeb);
  ok(diffBooks(b, r1.book).same && r1.steps >= 1, `a column removed, put back (${r1.steps} steps)`);

  // A row added, a value changed, a tab renamed, one added and one removed: each put back in turn leaves nothing changed.
  let many = adjustForInsert(b, 'budget', 'row', 3, 1);
  many = set(many, 0, 'A4', { v: 'Travel' });
  many = set(many, 0, 'B4', { v: 200 });
  many = set(many, 0, 'C2', { v: 1100 });
  many = renameSheet(many, 'budget', 'Spending');
  many = { ...many, sheets: [many.sheets[0], { id: 'x', name: 'Ideas', cells: { A1: { v: 'Bike' } } }] };
  const dm = diffBooks(b, many);
  ok(dm.totals.tabsAdded === 1 && dm.totals.tabsRemoved === 1 && dm.totals.tabsRenamed === 1 && dm.totals.rowsAdded === 1 && dm.totals.cells === 1, `many changes found (${JSON.stringify(dm.totals)})`);
  const r2 = putAllBack(b, many);
  const left = diffBooks(b, r2.book);
  ok(left.same, `each put back in turn: nothing changed is left (${r2.steps} steps; ${JSON.stringify(left.totals)})`);
  ok(r2.book.sheets.map((s) => s.name).join() === 'Budget,Notes', `the tabs as they were (${r2.book.sheets.map((s) => s.name)})`);
  ok(sameCells(r2.book.sheets[0].cells, b.sheets[0].cells), 'the cells as they were');

  // The only tab that shows cannot go.
  const lone = normalizeBook({ sheets: [{ id: 'a', name: 'A', rows: [[1]] }] });
  const other = normalizeBook({ sheets: [{ id: 'b', name: 'B', rows: [['x', 'y', 'z']] }] });
  const dl = diffBooks(lone, other);
  let threw = false;
  try {
    putBack(lone, other, dl, { k: 'tab-added', tab: dl.tabs.findIndex((t) => t.status === 'added') });
  } catch {
    threw = true;
  }
  ok(threw, 'the only tab is not taken out');
}

// ---- a large sheet stays quick --------------------------------------------------------------------------------------------
{
  const rows: (string | number)[][] = [['Id', 'Name', 'Amount']];
  for (let i = 1; i <= 5000; i++) rows.push([i, `Person ${i}`, (i * 37) % 1000]);
  const b = normalizeBook({ sheets: [{ id: 'big', name: 'Big', rows }] });
  let a = adjustForInsert(b, 'big', 'row', 2500, 3);
  a = set(a, 0, 'A2501', { v: 9001 });
  a = set(a, 0, 'A2502', { v: 9002 });
  a = set(a, 0, 'A2503', { v: 9003 });
  a = set(a, 0, 'C10', { v: 5 });
  const t0 = performance.now();
  const d = diffBooks(b, a);
  const ms = performance.now() - t0;
  ok(d.tabs[0].rows.added.length === 3 && d.tabs[0].cells.length === 1, `5000 rows: three added, one cell changed (${d.tabs[0].rows.added.length}, ${d.tabs[0].cells.length})`);
  ok(ms < 3000, `and quick (${Math.round(ms)} ms)`);
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
