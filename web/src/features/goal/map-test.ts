// Checks for the map of attempts (map.ts) and the words of its boxes (words.ts): where each box stands for a history
// with dead ends and an Another way from here, that no two boxes overlap and no link crosses one, that the order is by
// round number, and that a long goal lays out quickly. Nothing here needs a browser.
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/goal/map-test.ts && node dist/dev/map-test.js
import assert from 'node:assert/strict';
import type { GoalRound, GoalState } from '../../../../shared/goals.ts';
import { BOX, boxAt, linkPath, linkPoints, mapLayout, mapSize, type MapLayout } from './map.ts';
import { sampleOf, samples } from './samples.ts';
import { before, biggestMove, fewWords, moveOf, shortWhy, wentBackTo } from './words.ts';

let passed = 0;
let total = 0;
const test = (name: string, fn: () => void) => {
  total++;
  try {
    fn();
    passed++;
  } catch (e) {
    console.log(`✗ ${name}\n${(e as Error).stack ?? e}`);
  }
};

type Seg = { x1: number; y1: number; x2: number; y2: number; from: number; to: number };
const segments = (l: MapLayout): Seg[] =>
  l.links.flatMap((k) => {
    const p = linkPoints(l, k);
    return p.slice(1).map(([x, y], i) => ({ x1: Math.min(x, p[i][0]), y1: Math.min(y, p[i][1]), x2: Math.max(x, p[i][0]), y2: Math.max(y, p[i][1]), from: k.from, to: k.to }));
  });

/** What must hold of every map: columns in the rounds’ order, one box each, nothing over a box, links apart. */
function sound(l: MapLayout, what: string) {
  l.nodes.forEach((n, i) => {
    assert.equal(n.col, i, `${what}: a column each, in order`);
    if (i) assert.ok(n.n > l.nodes[i - 1].n, `${what}: by round number`);
  });
  const boxes = l.nodes.map((n) => boxAt(n));
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++)
      assert.ok(Math.abs(boxes[i].x - boxes[j].x) >= BOX.w || Math.abs(boxes[i].y - boxes[j].y) >= BOX.h, `${what}: boxes ${l.nodes[i].n} and ${l.nodes[j].n} overlap`);
  const size = mapSize(l);
  for (const b of boxes) assert.ok(b.x >= 0 && b.y >= 0 && b.x + BOX.w <= size.width && b.y + BOX.h <= size.height, `${what}: inside the drawing`);
  const segs = segments(l);
  for (const s of segs) {
    assert.ok(s.x1 === s.x2 || s.y1 === s.y2, `${what}: links run level or upright`);
    // No link goes through a box, its own two included (it only meets their edges).
    boxes.forEach((b, i) => {
      const through = s.x1 < b.x + BOX.w && s.x2 > b.x && s.y1 < b.y + BOX.h && s.y2 > b.y;
      assert.ok(!through, `${what}: the link to ${l.nodes[s.to].n} goes through box ${l.nodes[i].n}`);
    });
  }
  // Links from different rounds never run along each other (they may cross).
  for (let i = 0; i < segs.length; i++)
    for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i];
      const b = segs[j];
      if (a.from === b.from || a.to === b.to) continue;
      const level = a.y1 === a.y2 && b.y1 === b.y2 && a.y1 === b.y1 && Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1) > 0;
      const upright = a.x1 === a.x2 && b.x1 === b.x2 && a.x1 === b.x1 && Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1) > 0;
      assert.ok(!level && !upright, `${what}: the links to ${l.nodes[a.to].n} and ${l.nodes[b.to].n} run along each other`);
    }
  assert.equal(l.links.length, Math.max(0, l.nodes.length - 1), `${what}: every box but the first is linked`);
}

const at = (l: MapLayout) => Object.fromEntries(l.nodes.map((n) => [n.kind === 'goal' ? 'goal' : n.n, n.row]));
const link = (l: MapLayout, n: number) => {
  const k = l.links.find((x) => l.nodes[x.to].n === n && l.nodes[x.to].kind !== 'goal')!;
  return `${l.nodes[k.from].n} ${k.shape} ${k.kind}`;
};
const round = (n: number, outcome: GoalRound['outcome'], parent?: number): GoalRound => ({ n, startedAt: 0, endedAt: 0, results: [], score: 0, outcome, usd: 0, ...(parent != null ? { parent } : {}) });
const goalOf = (rounds: GoalRound[], o: Partial<GoalState> = {}): Pick<GoalState, 'rounds' | 'best' | 'round' | 'roundParent' | 'status'> => ({
  status: 'stopped',
  best: rounds.filter((r) => r.outcome !== 'undone').at(-1)?.n ?? 0,
  rounds,
  ...o,
});

test('the map of a goal with dead ends and an Another way from here: the kept line, the stubs below, a second line', () => {
  const l = mapLayout(sampleOf('map-working'));
  assert.deepEqual(at(l), { 0: 0, 1: 0, 2: 0, 3: 1, 4: 0, 5: 1, 6: 1, 7: 2, 8: 3, 9: 2, 10: 2, goal: 2 });
  assert.equal(link(l, 3), '2 hang dead');
  assert.equal(link(l, 4), '2 along kept');
  assert.equal(link(l, 5), '4 hang dead');
  assert.equal(link(l, 6), '4 hang dead', 'two dead ends off one round share a row');
  assert.equal(link(l, 7), '2 branch kept', 'Another way from here leaves the earlier round');
  assert.equal(link(l, 8), '7 hang dead');
  assert.equal(link(l, 10), '9 along working');
  assert.equal(l.nodes.at(-1)!.kind, 'goal');
  assert.equal(l.links.at(-1)!.kind, 'goal');
  assert.equal(l.nodes[l.links.at(-1)!.from].n, 10, 'the goal goes on from the round at work');
  assert.equal(l.rows, 4);
  sound(l, 'map-working');
});

test('where nothing runs the goal goes on from the best, also when that is an earlier round', () => {
  const asking = mapLayout(sampleOf('map-asking'));
  assert.equal(asking.nodes.some((n) => n.kind === 'working'), false);
  assert.equal(asking.nodes[asking.links.at(-1)!.from].n, 9);
  // Right after Another way from here on round 2: the round at work leaves it on a line of its own.
  const from = mapLayout(sampleOf('map-from'));
  assert.equal(link(from, 7), '2 branch working');
  assert.equal(from.nodes.at(-1)!.row, from.nodes.find((n) => n.n === 7)!.row);
  // Gone back, and nothing runs yet: the goal leaves round 2, past what came after it.
  const back = mapLayout(goalOf([round(0, 'start'), round(1, 'kept', 0), round(2, 'kept', 1)], { best: 1 }));
  assert.equal(back.links.at(-1)!.shape, 'branch');
  assert.equal(back.nodes[back.links.at(-1)!.from].n, 1);
  // A round left unchecked by a pause is not at work.
  assert.equal(mapLayout({ ...sampleOf('map-working'), status: 'paused' }).nodes.some((n) => n.kind === 'working'), false);
  // The start alone (the agreement): the start and the goal.
  assert.deepEqual(mapLayout(sampleOf('agreeing')).nodes.map((n) => n.kind), ['start', 'goal']);
  assert.deepEqual(mapLayout(goalOf([])), { nodes: [], links: [], cols: 0, rows: 0 });
});

test('where rounds cannot be undone: those left as they are hang below, and the line goes on from them', () => {
  const l = mapLayout(sampleOf('map-working-no-undo'));
  assert.deepEqual(at(l), { 0: 0, 1: 0, 2: 0, 3: 1, 4: 0, 5: 1, 6: 1, 7: 0, 8: 1, 9: 0, 10: 0, goal: 0 });
  assert.equal(link(l, 4), '3 rise kept');
  assert.equal(link(l, 6), '5 along dead', 'two in a row run on along their row');
  assert.equal(link(l, 7), '6 rise kept');
  sound(l, 'map-working-no-undo');
});

test('a round a limit cut midway hangs from where it started, and the goal goes on from the best', () => {
  const g = sampleOf('limit-midway');
  const l = mapLayout(g);
  assert.equal(link(l, 7), '4 hang dead');
  assert.equal(l.nodes[l.links.at(-1)!.from].n, 4);
  const cut = g.rounds.find((r) => r.n === 7)!;
  assert.equal(shortWhy(g, cut), 'Cut short');
  sound(l, 'limit-midway');
});

test('every sample’s map is sound', () => {
  for (const s of samples()) sound(mapLayout(s.goal), s.id);
});

test('any history is sound: undone rounds, rounds left as they are, going back, rounds you undid after others', () => {
  let seed = 7;
  const rnd = (n: number) => (seed = (seed * 48271) % 2147483647) % n;
  for (let t = 0; t < 1500; t++) {
    const undo = t % 3 !== 0;
    const rounds = [round(0, 'start')];
    let best = 0;
    for (let n = 1, len = 1 + rnd(30); n <= len; n++) {
      // Another way from any earlier round now and then.
      if (undo && rnd(8) === 0) best = rnd(n);
      const outcome = rnd(5) < 3 ? 'kept' : undo ? 'undone' : 'stays';
      rounds.push(round(n, outcome, best));
      if (outcome !== 'undone') best = n;
      // You undo an earlier round, which others may have started from.
      if (undo && rnd(10) === 0) rounds[1 + rnd(n)].outcome = 'undone';
    }
    const running = rnd(2) === 0;
    sound(mapLayout(goalOf(rounds, { best, status: running ? 'working' : 'stopped', ...(running ? { round: rounds.length, roundParent: best } : {}) })), `history ${t}`);
  }
});

test('200 rounds lay out in bounded time', () => {
  const rounds = [round(0, 'start')];
  let best = 0;
  for (let n = 1; n <= 200; n++) {
    if (n % 17 === 0) best = Math.max(0, best - 9);
    const kept = n % 3 !== 0;
    rounds.push(round(n, kept ? 'kept' : 'undone', best));
    if (kept) best = n;
  }
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) mapLayout(goalOf(rounds, { best }));
  assert.ok((performance.now() - t0) / 20 < 50, 'one layout takes milliseconds');
  const l = mapLayout(goalOf(rounds, { best }));
  assert.equal(l.cols, 202);
  assert.ok(l.rows < 40, `lines that ended give their room back: ${l.rows} rows`);
  sound(l, '200 rounds');
});

test('a link’s path starts and ends where its corners do', () => {
  assert.equal(linkPath([[0, 0], [10, 0]]), 'M0 0L10 0');
  assert.equal(linkPath([[0, 0], [0, 20], [30, 20]]), 'M0 0L0 12Q0 20 8 20L30 20');
});

test('a round is compared with the one it started from, not the one before it in number', () => {
  const g = sampleOf('map-working');
  const r = (n: number) => g.rounds.find((x) => x.n === n)!;
  assert.equal(before(g, r(7))!.n, 2);
  assert.equal(biggestMove(g, r(7)), 'Relevance 0.73 → 0.77');
  assert.deepEqual(moveOf(g, r(9)), { name: 'Speed', from: '352', to: '224 ms' });
  assert.equal(wentBackTo(g, r(8))!.n, 7);
  // One you undid yourself went back to the latest round kept before it.
  assert.equal(wentBackTo(g, { ...r(7), outcome: 'undone', by: 'you' })!.n, 4);
  assert.equal(before(g, r(0)), undefined);
});

test('a box’s words: why a round was not kept in a word or two, and a few words of what it tried', () => {
  const g = sampleOf('map-working');
  const r = (n: number) => g.rounds.find((x) => x.n === n)!;
  assert.deepEqual([3, 5, 6].map((n) => shortWhy(g, r(n))), ['Fell behind', 'No gain', 'Broke a check']);
  assert.equal(shortWhy(g, { ...r(3), cause: 'protected' }), 'Protected files');
  assert.equal(shortWhy(g, { ...r(3), cause: 'rule' }), 'Broke a rule');
  assert.equal(shortWhy(g, { ...r(3), by: 'you' }), 'Undone by you');
  assert.equal(shortWhy(g, { ...r(5), cause: undefined, why: undefined }), 'Undone');
  assert.equal(shortWhy(g, { ...r(5), outcome: 'stays', cause: undefined, why: undefined }), 'Left as it is');
  assert.equal(fewWords('Tune BM25.'), 'Tune BM25');
  assert.equal(fewWords('Weighted fields: title ×3, brand ×2'), 'Weighted fields…');
  assert.equal(fewWords('Re-rank the top 50 with a cross-encoder'), 'Re-rank the top 50…');
  assert.equal(fewWords('Supercalifragilisticexpialidocious'), 'Supercalifragilisti…');
});

console.log(`${passed}/${total} passed`);
if (passed !== total) process.exit(1);
