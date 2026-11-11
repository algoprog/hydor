// Script tests for what the slides editor does to a deck's parts (ops.ts) that the guides and menus rely on: lining
// parts up by the box they show (turned ones too), several with the slide, spreading them evenly, Lock for every part
// picked, and a table's rows and columns put in above, below, left and right of a cell or taken out (with their merges,
// fills and widths following). Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/pages/slides/ops-test.ts && node dist/dev/ops-test.js
import type { Deck, El, TableEl } from '@shared/slides';
import { align, moveSlides, scalePicked, spinPicked, deleteCol, deleteRow, distribute, insertCol, insertRow, lockEls, TABLE_MAX } from './ops';

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};
const close = (a: number, b: number, d = 0.01) => Math.abs(a - b) <= d;

const shape = (id: string, x: number, y: number, w: number, h: number, rot?: number) => ({ id, type: 'shape', kind: 'rect', x, y, w, h, paras: [], ...(rot ? { rot } : {}) }) as unknown as El;
const deckOf = (els: El[]): Deck => ({ ratio: '16:9', theme: {}, slides: [{ id: 's', els }] }) as unknown as Deck;
const at = (d: Deck, id: string) => d.slides[0].els.find((e) => e.id === id)!;

// ---- lining up -------------------------------------------------------------------------------------------------------
{
  const d = deckOf([shape('a', 100, 100, 200, 100), shape('b', 500, 300, 100, 100)]);
  const l = align(d, 0, ['a', 'b'], 'left');
  ok(at(l, 'a').x === 100 && at(l, 'b').x === 100, 'several line up with each other: left edges');
  const s = align(d, 0, ['a', 'b'], 'left', true);
  ok(at(s, 'a').x === 0 && at(s, 'b').x === 0, 'several with the slide: both to its left edge');
  const c = align(d, 0, ['a', 'b'], 'center', true);
  ok(close(at(c, 'a').x + 100, 640) && close(at(c, 'b').x + 50, 640), 'both centred on the slide, each by its own middle');
  const m = align(d, 0, ['a'], 'middle');
  ok(close(at(m, 'a').y + 50, 360), 'one part to the slide: its middle down');
  // A turned part lines up by the box it shows: 200 × 100 turned 90° shows as 100 × 200 round its middle.
  const t = deckOf([shape('t', 100, 100, 200, 100, 90)]);
  const tl = align(t, 0, ['t'], 'left');
  // Its shown box is x 150..250 (centre 200): moved to 0 means its own x goes from 100 to -50.
  ok(at(tl, 't').x === -50, `a turned part’s shown edge, not its own: x ${at(tl, 't').x}`);
  const tb = align(t, 0, ['t'], 'bottom');
  ok(close(at(tb, 't').y + 50 + 100, 720), `and its bottom: shown box ends at 720 (y ${at(tb, 't').y})`);
  const two = deckOf([shape('p', 100, 100, 200, 100, 90), shape('q', 400, 100, 50, 50)]);
  const tops = align(two, 0, ['p', 'q'], 'top');
  ok(close(at(tops, 'q').y, 50), `the other goes to the turned one’s shown top (50): ${at(tops, 'q').y}`);
}
{
  const d = deckOf([shape('a', 0, 0, 100, 50), shape('b', 110, 0, 100, 50), shape('c', 600, 0, 100, 50)]);
  const r = distribute(d, 0, ['a', 'b', 'c'], 'h');
  ok(close(at(r, 'b').x, 300), `spread evenly: the middle one halfway (${at(r, 'b').x})`);
}
{
  const d = deckOf([shape('a', 0, 0, 10, 10), shape('b', 20, 0, 10, 10)]);
  const l = lockEls(d, 0, ['a', 'b']);
  ok(!!at(l, 'a').lock && !!at(l, 'b').lock, 'Lock locks every part picked');
  const u = lockEls(l, 0, ['a', 'b']);
  ok(!at(u, 'a').lock && !at(u, 'b').lock, 'and unlocks all when all are locked');
  const mixed = lockEls(l, 0, ['a']);
  ok(!at(mixed, 'a').lock && !!at(mixed, 'b').lock, 'one part: unlocked alone');
  const half = lockEls(mixed, 0, ['a', 'b']);
  ok(!!at(half, 'a').lock && !!at(half, 'b').lock, 'a mixed pick is locked, all of it');
}

// ---- tables ----------------------------------------------------------------------------------------------------------
const table = (over: Partial<TableEl> = {}): TableEl => ({ id: 't', type: 'table', x: 0, y: 0, w: 300, h: 90, size: 14, rows: [['a', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h', 'i']], ...over }) as TableEl;
{
  const t = table();
  const above = insertRow(t, 1)!;
  ok(above.rows.length === 4 && above.rows[1].join() === ',,' && above.rows[2][0] === 'd' && above.h === 120, 'a row above row 1');
  const below = insertRow(t, 2)!;
  ok(below.rows[2][0] === 'd' || below.rows[1][0] === 'd', 'a row below row 1 (before row 2)');
  ok(below.rows[2].join() === ',,' && below.rows[3][0] === 'g', 'is empty, and the rest follows');
  const end = insertRow(t, 3)!;
  ok(end.rows[3].join() === ',,' && end.rows.length === 4, 'at the end, as before');
  const left = insertCol(t, 1)!;
  ok(left.rows.every((r) => r.length === 4 && r[1] === '') && left.rows[0][2] === 'b', 'a column left of column 1');
  const right = insertCol(t, 2)!;
  ok(right.rows[0].join() === 'a,b,,c', 'a column right of column 1');
  ok(insertRow(table({ rows: Array.from({ length: TABLE_MAX.rows }, () => ['x']) }), 0) === null && insertCol(table({ rows: [Array(TABLE_MAX.cols).fill('x')] }), 0) === null, 'no more than the most');
}
{
  // Merges and fills follow.
  const t = table({ merges: [{ r: 1, c: 0, rs: 2, cs: 2 }], fills: { '0,0': '#f00', '2,2': '#0f0' } });
  const a = insertRow(t, 0)!;
  ok(a.merges?.[0].r === 2 && a.fills?.['1,0'] === '#f00' && a.fills?.['3,2'] === '#0f0', 'a row above everything moves merges and fills down');
  const mid = insertRow(t, 2)!;
  ok(mid.merges?.[0].rs === 3, 'a row inside a merge grows it');
  const c = insertCol(t, 1)!;
  ok(c.merges?.[0].cs === 3 && c.fills?.['2,3'] === '#0f0', 'a column inside a merge grows it; fills move right');
  const d = deleteRow(t, 0)!;
  ok(d.merges?.[0].r === 0 && d.fills?.['0,0'] === undefined && d.fills?.['1,2'] === '#0f0' && d.rows.length === 2, 'a row taken out: merges up, its fills gone');
  const e = deleteRow(t, 1)!;
  ok(e.merges?.[0].rs === 1 || !e.merges, 'a row of a merge taken out narrows it (a merge of one cell is gone)');
  ok(!!deleteCol(t, 2) && deleteCol(t, 2)!.rows[0].join() === 'a,b' && deleteCol(t, 2)!.fills?.['2,2'] === undefined, 'a column taken out, its fills gone');
  ok(deleteRow(table({ rows: [['x']] }), 0) === null && deleteCol(table({ rows: [['x']] }), 0) === null, 'a table keeps one row and one column');
  const w = insertCol(table({ cols: [1, 2, 3], aligns: ['left', 'center', 'right'] }), 1)!;
  ok(w.cols?.join() === '1,2,2,3' && w.aligns?.length === 4, 'widths and alignments get the new column');
  const wd = deleteCol(table({ cols: [1, 2, 3], aligns: ['left', 'center', 'right'] }), 0)!;
  ok(wd.cols?.join() === '2,3' && wd.aligns?.join() === 'center,right', 'and lose the one taken out');
}

// ---- parts picked together -------------------------------------------------------------------------------------------
{
  const a = shape('a', 100, 100, 100, 50);
  const s = scalePicked(a, { x: 100, y: 100, w: 400, h: 200 }, { x: 0, y: 0, w: 800, h: 100 }) as El;
  ok(s.x === 0 && s.y === 0 && s.w === 200 && s.h === 25, `sized with the others: ${JSON.stringify([s.x, s.y, s.w, s.h])}`);
  const t = spinPicked(shape('b', 100, 0, 100, 100), { x: 0, y: 0 }, 90) as El;
  ok(t.rot === 90 && close(t.x + 50, -50) && close(t.y + 50, 150), `turned about a point: its middle goes round (${t.x}, ${t.y}, ${t.rot})`);
  const ln = spinPicked({ id: 'l', type: 'line', x: 10, y: 0, w: 100, h: 0, width: 2 } as unknown as El, { x: 0, y: 0 }, 90) as El;
  ok(ln.x === 0 && ln.y === 10 && close(ln.w, 0) && ln.h === 100, 'a line’s ends go round');
}

// ---- slides ----------------------------------------------------------------------------------------------------------
{
  const dk = { ratio: '16:9', theme: {}, slides: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, els: [] })) } as unknown as Deck;
  const order = (x: Deck) => x.slides.map((s) => s.id).join('');
  ok(order(moveSlides(dk, ['a', 'b'], 'd')) === 'cdabe', 'slides picked move together to after the one they were dropped on (from before it)');
  ok(order(moveSlides(dk, ['d', 'e'], 'b')) === 'adebc', 'or before it (from after it)');
  ok(order(moveSlides(dk, ['b', 'd'], 'e')) === 'acebd', 'not next to each other: they come together');
  ok(moveSlides(dk, ['b'], 'b') === dk, 'dropped on themselves: nothing');
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
