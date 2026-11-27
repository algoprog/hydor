// Script tests for what an experiment's runs show as (runList.ts): folding attempts under the run that took their
// place, what the filters leave, the starred first, the counts, the words for an attempt and why one ended, and what an
// action on picked runs takes along. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/experiments/runList-test.ts && node dist/dev/runList-test.js
import assert from 'node:assert/strict';
import { attemptsOf } from '@shared/experiment-attempts';
import type { RunRecord, RunStatus } from '@shared/experiments';

const g = globalThis as any;
g.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const W = await import('./runList');

let clock = 0;
const run = (id: string, status: RunStatus = 'done', o: Partial<RunRecord> = {}): RunRecord => ({ id, status, name: id, command: `python ${id}.py`, cwd: '/p', group: 'g', createdAt: (clock += 10), endedAt: clock + 5, ...o });
const marked = (runs: RunRecord[]) => {
  const at = attemptsOf(runs);
  return runs.map((r) => ({ ...r, ...at.get(r.id) }));
};
const all = () => true;
const ids = (rs: RunRecord[]) => rs.map((r) => r.id);
// a: failed, b: stopped, c: done (the 3rd attempt); d: done; e: failed, alone.
const runs = marked([
  run('a', 'failed', { why: 'It ran out of memory on GPU 0', note: 'tokenizer bug' }),
  run('b', 'stopped', { from: 'a', why: 'Stopped by you' }),
  run('c', 'done', { from: 'b' }),
  run('d', 'done', { starredAt: 5 }),
  run('e', 'failed', { exitCode: 2 }),
]);

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

test('one row for a chain, its earlier attempts folded under it, the one before first', () => {
  const stand = W.standingsOf(runs);
  const t = W.tableRows(runs, stand, {}, all, []);
  assert.deepEqual(ids(t.rows), ['c', 'd', 'e']);
  assert.deepEqual(ids(t.earlier!.get(':c')!), ['b', 'a']);
  assert.equal(t.open.size, 0);
  assert.deepEqual(W.countWords(stand), ['3 runs', '+ 2 earlier attempts', '2 done', '1 failed']);
});

test('Earlier attempts too, Starred and Archived are flat lists; the status is the row’s', () => {
  const stand = W.standingsOf(runs);
  assert.deepEqual(ids(W.tableRows(runs, stand, { earlierToo: true }, all, []).rows), ['a', 'b', 'c', 'd', 'e']);
  assert.equal(W.tableRows(runs, stand, { earlierToo: true }, all, []).earlier, undefined);
  assert.deepEqual(ids(W.tableRows(runs, stand, { starred: true }, all, []).rows), ['d']);
  assert.deepEqual(ids(W.tableRows(runs, stand, {}, (r) => r.status === 'failed', []).rows), ['e']);
  assert.deepEqual(ids(W.chartedRuns(runs, stand, false)), ['c', 'd', 'e']);
  assert.deepEqual(ids(W.chartedRuns(runs, stand, true)), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(ids(W.starredFirst(runs)), ['d', 'a', 'b', 'c', 'e']);
});

test('the find box looks in notes, and a row found by an earlier attempt is unfolded', () => {
  const stand = W.standingsOf(runs);
  const t = W.tableRows(runs, stand, {}, all, ['tokenizer']);
  assert.deepEqual(ids(t.rows), ['c']);
  assert.deepEqual([...t.open], [':c']);
  assert.equal(W.tableRows(runs, stand, {}, all, ['c.py']).open.size, 0);
});

test('an archived row takes its earlier attempts; an archived earlier attempt leaves alone; Bring back takes what it needs', () => {
  const gone = runs.map((r) => (r.id === 'c' ? { ...r, archivedAt: 1 } : r));
  const stand = W.standingsOf(gone);
  assert.deepEqual(ids(stand.rows), ['d', 'e']);
  assert.deepEqual(ids(stand.archived), ['a', 'b', 'c']);
  assert.deepEqual(W.countWords(stand), ['2 runs', '1 done', '1 failed']);
  assert.deepEqual(ids(W.tableRows(gone, stand, { archived: true }, all, []).rows), ['a', 'b', 'c']);
  assert.deepEqual(ids(W.bringBack(gone, [gone[0]])), ['c'], 'an earlier attempt comes back with the row’s run');
  const one = runs.map((r) => (r.id === 'b' ? { ...r, archivedAt: 1 } : r));
  const s2 = W.standingsOf(one);
  assert.deepEqual([ids(s2.rows), ids(s2.earlier.get(':c')!), ids(s2.archived)], [['c', 'd', 'e'], ['a'], ['b']]);
});

test('the same id on two computers is two runs', () => {
  const two = [...runs, ...runs.map((r) => ({ ...r, machine: { id: 'm1', name: 'Other' } }))];
  const stand = W.standingsOf(two);
  assert.equal(stand.rows.length, 6);
  assert.equal(stand.earlier.size, 2);
});

test('what the picked runs’ bar offers, and what Archive says', () => {
  const live = [...runs, run('f', 'running')];
  const a = W.pickedActions(live, [live[2], live[5]]);
  assert.deepEqual([ids(a.going), ids(a.ended), a.starred, a.archived], [['f'], ['c'], false, false]);
  assert.equal(W.pickedActions(live, [live[3]]).starred, true);
  assert.equal(W.archivedSaid(live, [live[2], live[5]]), '1 run archived · with 2 earlier attempts · 1 still going was left: stop it first');
  assert.equal(W.archivedSaid(live, [live[3], live[4]]), '2 runs archived');
});

test('the words: ordinals, the chip, why an earlier attempt ended, the sentence on a run’s page', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map((n) => W.ordinal(n, 'en')), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th']);
  assert.equal(W.ordinal(4, 'de-DE'), '4.');
  assert.deepEqual([W.ordinal(4, 'es-ES'), W.ordinal(4, 'pt-BR'), W.ordinal(1, 'fr-FR')], ['4.º', '4.ª', '1re']);
  assert.equal(W.attemptChip(4, 'en'), '4th attempt');
  assert.deepEqual(W.endedFew(runs[0]), { words: 'Failed: out of memory' });
  assert.deepEqual(W.endedFew(runs[1]), { words: 'Stopped by you' });
  assert.deepEqual(W.endedFew(runs[4]), { words: 'Failed with exit code 2' });
  assert.deepEqual(W.endedFew({ status: 'failed', error: "KeyError: 'rank'", exitCode: 1 }), { words: 'Failed', own: "KeyError: 'rank'" });
  assert.deepEqual(W.endedFew({ status: 'lost' }), { words: 'Went missing' });
  assert.equal(W.afterWords(4, { status: 'failed', why: 'It ran out of memory' }, 'en'), 'The 4th attempt: the 3rd ran out of memory');
  assert.equal(W.afterWords(2, { status: 'stopped', why: 'Stopped early: behind' }, 'en'), 'The 2nd attempt: the 1st was stopped early');
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`✗ ${name}\n  ${(e as Error).stack ?? e}`);
  }
}
console.log(`\n${tests.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
