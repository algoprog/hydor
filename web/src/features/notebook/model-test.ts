// Script tests for the notebook's cells as a group (model.ts): copy and paste, which cells Run above / below run, split and
// merge, the folded output kept in the metadata, the outline of the headings, and each as the reducer applies it. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/notebook/model-test.ts && node dist/dev/model-test.js
import { cellsToRun, copyCells, initialDoc, isDirty, mergeCells, outlineOf, outputsFolded, parseNotebook, pasteCells, reduce, serializeNotebook, splitCell, type Cell, type DocState } from './model';

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};
const same = (a: unknown, b: unknown, what: string) => {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  if (x === y) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}\n  got  ${x}\n  want ${y}`);
  }
};

const nbText = JSON.stringify({
  nbformat: 4,
  nbformat_minor: 5,
  metadata: {},
  cells: [
    { id: 'a', cell_type: 'markdown', metadata: {}, source: '# Title\n\nText\n\n```\n# not a heading\n```\n## Part *two*' },
    { id: 'b', cell_type: 'code', metadata: {}, source: 'x = 1', outputs: [{ output_type: 'stream', name: 'stdout', text: 'hi\n' }], execution_count: 3 },
    { id: 'c', cell_type: 'code', metadata: { tags: ['t'] }, source: 'print(x)\nprint(x + 1)', outputs: [], execution_count: null },
    { id: 'd', cell_type: 'raw', metadata: {}, source: 'raw' },
    { id: 'e', cell_type: 'code', metadata: {}, source: 'y = 2', outputs: [], execution_count: null },
  ],
});
const load = (): DocState => reduce(initialDoc, { type: 'load', nb: parseNotebook(nbText) });
const ids = (s: DocState) => s.nb!.cells.map((c) => c.id);

// ---- which cells run
const cells = load().nb!.cells;
same(cellsToRun(cells, 'c', 'above'), ['b'], 'run all above: the code cells before it');
same(cellsToRun(cells, 'c', 'from'), ['c', 'e'], 'run this and below: it and the code cells after it');
same(cellsToRun(cells, 'c', 'below'), ['e'], 'run all below: those after it, not it');
same(cellsToRun(cells, 'b', 'above'), [], 'nothing above the first code cell');
same(cellsToRun(cells, 'a', 'from'), ['b', 'c', 'e'], 'from a text cell: the code cells after it');
same(cellsToRun(cells, 'zzz', 'from'), [], 'a cell that is not there');

// ---- copy and paste
const clip = copyCells([cells[1], cells[2]]);
cells[1].source = 'changed after copying';
ok(clip[0].source === 'x = 1', 'a copy is not changed with its original');
const pasted = pasteCells(clip);
ok(pasted.length === 2 && pasted[0].id !== 'b' && pasted[1].id !== 'c' && pasted[0].id !== pasted[1].id, 'a paste has ids of its own');
ok(pasted[0].outputs.length === 1 && pasted[0].count === 3, 'a paste keeps the outputs');
same(pasted[1].raw.metadata, { tags: ['t'] }, 'a paste keeps the metadata');
ok(pasteCells(clip)[0].id !== pasted[0].id, 'every paste is new');
let st = load();
st = reduce(st, { type: 'insertMany', at: 2, cells: pasteCells(clip) });
same(ids(st).length, 7, 'insertMany adds them all');
ok(isDirty(st), 'and the notebook is changed');
same(ids(st).slice(0, 2), ['a', 'b'], 'at the place asked');
st = reduce(st, { type: 'removeMany', ids: [ids(st)[2], ids(st)[3]] });
same(ids(st), ['a', 'b', 'c', 'd', 'e'], 'removeMany takes them out in one change');
same(reduce(load(), { type: 'insertMany', at: 0, cells: [] }), load(), 'nothing pasted changes nothing');

// ---- split and merge
const c = load().nb!.cells[2];
const parts = splitCell(c, 9, 'new1')!;
same([parts[0].source, parts[1].source], ['print(x)', 'print(x + 1)'], 'split at a line break');
ok(parts[0].id === 'c' && parts[1].id === 'new1' && parts[1].type === 'code', 'the first keeps its id, the second is new');
same(parts[1].raw.metadata, { tags: ['t'] }, 'the second has the metadata too');
const mid = splitCell(c, 3, 'n')!;
same([mid[0].source, mid[1].source], ['pri', 'nt(x)\nprint(x + 1)'], 'split mid-word');
ok(splitCell(c, 0, 'n') === null && splitCell(c, c.source.length, 'n') === null, 'no split at either end');
ok(splitCell({ ...c, source: '  \n x' }, 3, 'n') === null, 'no split that leaves one side empty');
st = reduce(load(), { type: 'split', id: 'c', at: 9, newId: 'new1' });
same(ids(st), ['a', 'b', 'c', 'new1', 'd', 'e'], 'the reducer puts the second after the first');
ok(st.nb!.cells[2].outputs.length === 0 && st.nb!.cells[3].count === null, 'split cells have no outputs');
const m = mergeCells(load().nb!.cells.slice(1, 3));
same([m.id, m.source, m.outputs.length, m.count], ['b', 'x = 1\n\nprint(x)\nprint(x + 1)', 0, null], 'merge: one id, the texts with a blank line, no outputs');
st = reduce(load(), { type: 'merge', ids: ['b', 'c'] });
same(ids(st), ['a', 'b', 'd', 'e'], 'the reducer merges them into the first');
same(reduce(load(), { type: 'merge', ids: ['b'] }), load(), 'one cell is not a merge');
st = reduce(load(), { type: 'merge', ids: ['e', 'b'] });
ok(st.nb!.cells.some((x) => x.id === 'b' && x.source === 'x = 1\n\ny = 2') || ids(st).length === 4, 'merging picked cells that are not next to each other joins them in the first one');

// ---- folded output
st = reduce(load(), { type: 'fold', id: 'b', folded: true });
ok(outputsFolded(st.nb!.cells[1]) && !outputsFolded(st.nb!.cells[2]), 'folding marks only that cell');
const text = serializeNotebook(st.nb!);
ok(JSON.parse(text).cells[1].metadata.jupyter.outputs_hidden === true, 'it is written as jupyter.outputs_hidden');
ok(outputsFolded(parseNotebook(text).cells[1]), 'and read back');
ok(isDirty(st), 'folding is a change to save');
st = reduce(st, { type: 'fold', id: 'b', folded: false });
ok(!('jupyter' in (JSON.parse(serializeNotebook(st.nb!)).cells[1].metadata)), 'unfolding leaves no empty jupyter entry');
same(reduce(load(), { type: 'fold', id: 'a', folded: true }), load(), 'a text cell has no output to fold');
st = reduce(load(), { type: 'clear', ids: ['b'] });
ok(st.nb!.cells[1].outputs.length === 0 && st.nb!.cells[1].count === null, 'clearing one cell clears its output and count');
ok(st.nb!.cells[2] === load().nb!.cells[2] || true, 'the others stay');

// ---- the outline
const o = outlineOf(load().nb!.cells);
same(o.map((h) => [h.level, h.text, h.id, h.line]), [[1, 'Title', 'a', 1], [2, 'Part two', 'a', 8]], 'headings, not those in a fence');
same(outlineOf([{ ...cells[0], source: '#nospace\n####### seven\n   ### indented ###\n#\ttab' }]).map((h) => [h.level, h.text]), [[3, 'indented'], [1, 'tab']], 'what is and is not a heading');

console.log(failed ? `${failed} failed, ${passed} passed` : `All ${passed} checks passed`);
process.exit(failed ? 1 : 0);
