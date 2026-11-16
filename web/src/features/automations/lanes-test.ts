// Checks for the Schedules week's lanes (lanes.ts): blocks that overlap sit side by side, ones that do not keep the
// whole column, and a crowd at one time keeps two lanes and gathers the rest under "+N".
//
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/automations/lanes-test.ts && node dist/dev/lanes-test.js
import assert from 'node:assert/strict';
import { layLanes } from './lanes.ts';

const b = (item: string, top: number, bottom: number) => ({ item, top, bottom });

const alone = layLanes([b('a', 0, 20), b('b', 30, 50)]);
assert.deepEqual(
  alone.placed.map((p) => [p.item, p.lane, p.lanes]),
  [
    ['a', 0, 1],
    ['b', 0, 1],
  ],
);
assert.equal(alone.crowds.length, 0);

// Two at once, and a third that starts once the first has ended: two lanes, the third back in the first.
const two = layLanes([b('a', 0, 20), b('b', 10, 40), b('c', 20, 30)]);
assert.deepEqual(
  two.placed.map((p) => [p.item, p.lane, p.lanes]),
  [
    ['a', 0, 2],
    ['b', 1, 2],
    ['c', 0, 2],
  ],
);

// Five at 08:00: two shown, three under one block in the last lane.
const five = layLanes(['a', 'b', 'c', 'd', 'e'].map((x) => b(x, 100, 122)));
assert.deepEqual(
  five.placed.map((p) => [p.item, p.lane, p.lanes]),
  [
    ['a', 0, 3],
    ['b', 1, 3],
  ],
);
assert.equal(five.crowds.length, 1);
assert.deepEqual(five.crowds[0].items, ['c', 'd', 'e']);
assert.equal(five.crowds[0].lane, 2);
assert.equal(five.crowds[0].top, 100);
assert.equal(five.crowds[0].height, 22);

// Three fit as they are.
assert.equal(layLanes(['a', 'b', 'c'].map((x) => b(x, 0, 10))).crowds.length, 0);
assert.equal(layLanes([]).placed.length, 0);

console.log('lanes: ok');
