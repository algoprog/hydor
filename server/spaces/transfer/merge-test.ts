// Script tests for the sync merge (pure): what to copy, remove, rename or keep from both sides and the base, conflict
// names, the mass-delete guard, settling the base, details, notes, and a randomized two-sides simulation. Build and run:
//   OUTDIR=dist/dev-merge node scripts/build-server.mjs server/spaces/transfer/merge-test.ts
//   node dist/dev-merge/merge-test.js
import assert from 'node:assert/strict';
import type { SyncArea, SyncFile, SyncNote } from '../../../shared/transfer.ts';
import {
  conflictName,
  keyOf,
  mergeDetails,
  mergeFiles,
  mergeNotes,
  noteHash,
  settle,
  splitKey,
  type Base,
  type FilePlan,
  type Outcome,
  type Stat,
} from './merge.ts';

let passed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

const T = 1_700_000_000_000;
const st = (size: number, mtime: number): Stat => ({ size, mtime });
const f = (path: string, size: number, mtime: number, area: SyncArea = 'folder'): SyncFile => ({ area, path, size, mtime });
const sides = (folder: SyncFile[] | null, others: Partial<Record<SyncArea, SyncFile[] | null>> = {}): Record<SyncArea, SyncFile[] | null> => ({
  folder,
  skills: [],
  wiki: [],
  ...others,
});
const baseOf = (...entries: [string, Stat, Stat, string?][]): Base =>
  new Map(entries.map(([p, a, b, hash]) => [keyOf('folder', p), hash ? { a, b, hash } : { a, b }]));
const NAMES = { a: 'Laptop', b: 'GPU box' };
const merge = (a: SyncFile[] | null, b: SyncFile[] | null, base: Base, o: Partial<Parameters<typeof mergeFiles>[3]> = {}): FilePlan =>
  mergeFiles(sides(a), sides(b), base, { names: NAMES, ...o });
const empty = (p: FilePlan): boolean =>
  !p.renames.length && !p.removes.length && !p.copies.length && !p.conflicts.length && !p.same.length && !p.drop.length && !p.needHash.length && !p.held.length;

// ---- keys
test('keyOf and splitKey', () => {
  assert.equal(keyOf('wiki', 'a/b.md'), 'wiki\na/b.md');
  assert.deepEqual(splitKey('wiki\na/b.md'), { area: 'wiki', path: 'a/b.md' });
  assert.deepEqual(splitKey(keyOf('folder', 'odd\nname')), { area: 'folder', path: 'odd\nname' });
});

// ---- the table
test('unchanged: nothing', () => {
  const base = baseOf(['x', st(1, T), st(1, T + 5000)]);
  assert.ok(empty(merge([f('x', 1, T)], [f('x', 1, T + 5000)], base)));
});
test('only A adds: copy A→B, target must not be there', () => {
  const p = merge([f('n', 3, T)], [], new Map());
  assert.deepEqual(p.copies, [{ area: 'folder', path: 'n', from: 'a', stat: st(3, T), expect: null }]);
});
test('only A modifies: copy with expect = B stat; mtime alone counts', () => {
  const base = baseOf(['x', st(1, T), st(1, T)]);
  let p = merge([f('x', 2, T)], [f('x', 1, T)], base);
  assert.deepEqual(p.copies, [{ area: 'folder', path: 'x', from: 'a', stat: st(2, T), expect: st(1, T) }]);
  p = merge([f('x', 1, T + 1)], [f('x', 1, T)], base);
  assert.equal(p.copies.length, 1);
});
test('only A deletes: remove on B with expect', () => {
  const p = merge([], [f('x', 1, T)], baseOf(['x', st(1, T), st(1, T)]));
  assert.deepEqual(p.removes, [{ area: 'folder', path: 'x', side: 'b', expect: st(1, T) }]);
  assert.equal(p.copies.length, 0);
});
test('only B mirrors: add, modify, delete', () => {
  let p = merge([], [f('n', 3, T)], new Map());
  assert.deepEqual(p.copies, [{ area: 'folder', path: 'n', from: 'b', stat: st(3, T), expect: null }]);
  const base = baseOf(['x', st(1, T), st(1, T)]);
  p = merge([f('x', 1, T)], [f('x', 9, T + 9)], base);
  assert.deepEqual(p.copies, [{ area: 'folder', path: 'x', from: 'b', stat: st(9, T + 9), expect: st(1, T) }]);
  p = merge([f('x', 1, T)], [], base);
  assert.deepEqual(p.removes, [{ area: 'folder', path: 'x', side: 'a', expect: st(1, T) }]);
});
test('both deleted: dropped from the base', () => {
  const p = merge([], [], baseOf(['x', st(1, T), st(1, T)]));
  assert.deepEqual(p.drop, [keyOf('folder', 'x')]);
  assert.ok(!p.copies.length && !p.removes.length);
});
test('deleted on one, modified on the other: the modified one wins, either way', () => {
  const base = baseOf(['x', st(1, T), st(1, T)]);
  let p = merge([], [f('x', 5, T + 9)], base);
  assert.deepEqual(p.copies, [{ area: 'folder', path: 'x', from: 'b', stat: st(5, T + 9), expect: null }]);
  assert.equal(p.removes.length, 0);
  p = merge([f('x', 5, T + 9)], [], base);
  assert.deepEqual(p.copies, [{ area: 'folder', path: 'x', from: 'a', stat: st(5, T + 9), expect: null }]);
});
test('both added at the same path, same size, within 2 s: same, nothing moves', () => {
  const p = merge([f('x', 4, T)], [f('x', 4, T + 2000)], new Map());
  assert.deepEqual(p.same, [{ key: keyOf('folder', 'x'), a: st(4, T), b: st(4, T + 2000) }]);
  assert.ok(!p.needHash.length && !p.copies.length && !p.conflicts.length);
  assert.equal(merge([f('x', 4, T + 2000)], [f('x', 4, T)], new Map()).same.length, 1);
});
test('same size, more than 2 s apart: needHash, then equal → same with the hash', () => {
  const a = [f('x', 4, T)];
  const b = [f('x', 4, T + 2001)];
  const p1 = merge(a, b, new Map());
  assert.deepEqual(p1.needHash, [{ area: 'folder', path: 'x' }]);
  assert.ok(!p1.copies.length && !p1.conflicts.length && !p1.same.length);
  const hashes = new Map([[keyOf('folder', 'x'), { a: 'h1', b: 'h1' }]]);
  const p2 = merge(a, b, new Map(), { hashes });
  assert.ok(!p2.needHash.length && !p2.conflicts.length);
  assert.deepEqual(p2.same, [{ key: keyOf('folder', 'x'), a: st(4, T), b: st(4, T + 2001), hash: 'h1' }]);
});
test('needHash, then different hashes: conflict; a hash only one side gave asks again; null keeps both', () => {
  const a = [f('x', 4, T)];
  const b = [f('x', 4, T + 5000)];
  const k = keyOf('folder', 'x');
  const p = merge(a, b, new Map(), { hashes: new Map([[k, { a: 'h1', b: 'h2' }]]) });
  assert.equal(p.conflicts.length, 1);
  assert.equal(p.conflicts[0].loser, 'a');
  assert.equal(merge(a, b, new Map(), { hashes: new Map([[k, { a: 'h1' }]]) }).needHash.length, 1);
  assert.equal(merge(a, b, new Map(), { hashes: new Map([[k, { a: null, b: null }]]) }).conflicts.length, 1);
});
test('different sizes: conflict at once; later mtime wins; loser renamed on its side, winner copied with expect null', () => {
  const lm = Date.UTC(2026, 10, 27, 14, 5, 59);
  const p = merge([f('docs/r.docx', 10, lm + 50_000)], [f('docs/r.docx', 11, lm)], new Map());
  // b is earlier here → a wins
  assert.equal(p.conflicts[0].loser, 'b');
  const copy = 'docs/r (conflict, GPU box, 2026-11-27 14.05).docx';
  assert.deepEqual(p.renames, [{ area: 'folder', path: 'docs/r.docx', side: 'b', expect: st(11, lm), to: copy }]);
  assert.deepEqual(p.copies, [{ area: 'folder', path: 'docs/r.docx', from: 'a', stat: st(10, lm + 50_000), expect: null }]);
  assert.deepEqual(p.conflicts, [{ area: 'folder', path: 'docs/r.docx', copy, loser: 'b', at: lm }]);
  // B later: A loses, named after Laptop
  const q = merge([f('y.txt', 1, T)], [f('y.txt', 2, T + 1)], new Map());
  assert.equal(q.renames[0].side, 'a');
  assert.match(q.renames[0].to, /^y \(conflict, Laptop, 2023-11-14 22\.13\)\.txt$/);
  assert.equal(q.copies[0].from, 'b');
});
test('equal mtime but different sizes: A wins the tie', () => {
  const p = merge([f('x', 1, T)], [f('x', 2, T)], new Map());
  assert.equal(p.conflicts[0].loser, 'b');
  assert.equal(p.copies[0].from, 'a');
});
test('modified on both with a base: conflict too', () => {
  const base = baseOf(['x', st(1, T), st(1, T)]);
  const p = merge([f('x', 2, T + 10_000)], [f('x', 3, T + 20_000)], base);
  assert.equal(p.conflicts.length, 1);
  assert.equal(p.conflicts[0].loser, 'a');
});

// ---- conflict names
test('conflictName: extensions, dotfiles, directories', () => {
  const never = () => false;
  const t = Date.UTC(2026, 10, 27, 14, 5);
  assert.equal(conflictName('docs/report.v2.docx', 'GPU box', t, never), 'docs/report.v2 (conflict, GPU box, 2026-11-27 14.05).docx');
  assert.equal(conflictName('.env', 'M', t, never), '.env (conflict, M, 2026-11-27 14.05)');
  assert.equal(conflictName('a/.config/.env', 'M', t, never), 'a/.config/.env (conflict, M, 2026-11-27 14.05)');
  assert.equal(conflictName('Makefile', 'M', t, never), 'Makefile (conflict, M, 2026-11-27 14.05)');
  assert.equal(conflictName('a.b/Makefile', 'M', t, never), 'a.b/Makefile (conflict, M, 2026-11-27 14.05)');
  assert.equal(conflictName('x.tar.gz', 'M', t, never), 'x.tar (conflict, M, 2026-11-27 14.05).gz');
  assert.equal(conflictName('a/b/c.md', 'M', Date.UTC(2026, 0, 2, 3, 4), never), 'a/b/c (conflict, M, 2026-01-02 03.04).md');
  assert.equal(conflictName('c.md', 'a/b:c', t, never), 'c (conflict, a-b-c, 2026-11-27 14.05).md');
});
test('conflictName: collisions count up before the closing parenthesis', () => {
  const t = Date.UTC(2026, 10, 27, 14, 5);
  const used = new Set(['c (conflict, M, 2026-11-27 14.05).md', 'c (conflict, M, 2026-11-27 14.05 2).md']);
  assert.equal(conflictName('c.md', 'M', t, (p) => used.has(p)), 'c (conflict, M, 2026-11-27 14.05 3).md');
  assert.equal(conflictName('.env', 'M', t, (p) => p === '.env (conflict, M, 2026-11-27 14.05)'), '.env (conflict, M, 2026-11-27 14.05 2)');
});
test('conflict names avoid names listed on either side and names chosen in the same plan', () => {
  const t = Date.UTC(2026, 10, 27, 14, 5);
  const nm = 'x (conflict, Laptop, 2026-11-27 14.05)';
  const nm2 = 'x (conflict, Laptop, 2026-11-27 14.05 2)';
  // two files whose losers share a stamp don't collide with each other; A's listing has the first name already
  const p = merge(
    [f('x', 1, t), f(nm, 1, T)],
    [f('x', 2, t + 10_000)],
    new Map(),
  );
  assert.equal(p.renames[0].to, nm2);
  const q = merge([f('x', 1, t)], [f('x', 2, t + 10_000), f(nm, 1, T)], new Map());
  assert.equal(q.renames[0].to, nm2);
  // two conflicts in one plan: each loser gets a name of its own, and none equals a path that is listed
  const r = merge(
    [f('d/x', 1, t), f('d/y', 1, t)],
    [f('d/x', 2, t + 10_000), f('d/y', 2, t + 10_000), f('d/x (conflict, Laptop, 2026-11-27 14.05)', 1, T)],
    new Map(),
  );
  const names = r.renames.map((x) => x.to);
  assert.equal(r.renames.length, 2);
  assert.equal(new Set(names).size, 2);
  assert.ok(names.includes('d/x (conflict, Laptop, 2026-11-27 14.05 2)'));
  assert.ok(names.includes('d/y (conflict, Laptop, 2026-11-27 14.05)'));
});

// ---- areas
test('a null area on either side is skipped: no ops, base kept', () => {
  const base: Base = new Map([[keyOf('wiki', 'w.md'), { a: st(1, T), b: st(1, T) }]]);
  const p = mergeFiles(sides([], { wiki: null }), sides([], { wiki: [f('w.md', 9, T + 9, 'wiki'), f('new.md', 1, T, 'wiki')] }), base, { names: NAMES });
  assert.ok(empty(p));
  const q = mergeFiles(sides([], { wiki: [] }), sides([], { wiki: null }), base, { names: NAMES });
  assert.ok(empty(q));
  assert.equal(settle(base, p, { copies: [], removes: [], renames: [] }).size, 1);
  // other areas work
  const r = mergeFiles(sides([f('a', 1, T)], { wiki: null }), sides([], { wiki: null }), base, { names: NAMES });
  assert.equal(r.copies.length, 1);
  assert.equal(r.copies[0].area, 'folder');
});
test('areas are separate keys', () => {
  const p = mergeFiles(sides([f('a', 1, T)], { skills: [f('a', 1, T, 'skills')] }), sides([]), new Map(), { names: NAMES });
  assert.deepEqual(p.copies.map((c) => c.area).sort(), ['folder', 'skills']);
});

// ---- mass-delete guard
const manyFiles = (n: number, area: SyncArea = 'folder'): { list: SyncFile[]; base: Base } => {
  const list: SyncFile[] = [];
  const base: Base = new Map();
  for (let i = 0; i < n; i++) {
    list.push(f(`f${String(i).padStart(3, '0')}`, 1, T, area));
    base.set(keyOf(area, `f${String(i).padStart(3, '0')}`), { a: st(1, T), b: st(1, T) });
  }
  return { list, base };
};
test('mass-delete guard holds > 20 and > 50% of the area base; force lets them through', () => {
  const { list, base } = manyFiles(30);
  const p = merge([], list, base);
  assert.equal(p.removes.length, 0);
  assert.deepEqual(p.held, [{ side: 'b', area: 'folder', count: 30, of: 30 }]);
  const q = merge([], list, base, { force: true });
  assert.equal(q.removes.length, 30);
  assert.equal(q.held.length, 0);
  // mirror: B deleted
  const r = merge(list, [], base);
  assert.deepEqual(r.held, [{ side: 'a', area: 'folder', count: 30, of: 30 }]);
});
test('mass-delete guard: exactly 20, or half or less, goes through', () => {
  const { list, base } = manyFiles(30);
  assert.equal(merge(list.slice(20), list, base).removes.length, 20);
  const big = manyFiles(100);
  const p = merge(big.list.slice(50), big.list, big.base);
  assert.equal(p.removes.length, 50);
  assert.equal(p.held.length, 0);
  const q = merge(big.list.slice(0, 49), big.list, big.base);
  assert.equal(q.removes.length, 0);
  assert.deepEqual(q.held, [{ side: 'b', area: 'folder', count: 51, of: 100 }]);
});
test('mass-delete guard counts per side and area; other ops stay', () => {
  const { list, base } = manyFiles(30);
  const wiki = manyFiles(5, 'wiki');
  for (const [k, v] of wiki.base) base.set(k, v);
  const p = mergeFiles(sides([], { wiki: [] }), sides(list, { wiki: wiki.list }), base, { names: NAMES });
  assert.equal(p.held.length, 1);
  assert.equal(p.removes.length, 5); // the wiki's five go; the folder's 30 are held
  assert.ok(p.removes.every((r) => r.area === 'wiki'));
  // "of" counts the area's base entries, not the other area's
  const q = mergeFiles(sides(list.slice(0, 22), { wiki: [] }), sides(list, { wiki: wiki.list }), base, { names: NAMES });
  assert.equal(q.held.length, 0); // 8 removals in the folder
  assert.equal(q.removes.length, 13);
});

// ---- settle
const op = (p: FilePlan, ok = true, written?: Stat): Outcome => ({
  copies: p.copies.map(() => ({ ok, written })),
  removes: p.removes.map(() => ok),
  renames: p.renames.map(() => ({ ok })),
});
test('settle: copy ok A→B and B→A; hash is dropped; mode kept', () => {
  const base = baseOf(['x', st(1, T), st(1, T), 'old']);
  const p = merge([f('x', 2, T + 10)], [f('x', 1, T)], base);
  const next = settle(base, p, { copies: [{ ok: true, written: { size: 2, mtime: T + 10, mode: 0o755 } }], removes: [], renames: [] });
  assert.deepEqual(next.get(keyOf('folder', 'x')), { a: st(2, T + 10), b: { size: 2, mtime: T + 10, mode: 0o755 } });
  assert.equal(base.get(keyOf('folder', 'x'))!.hash, 'old'); // not mutated
  const q = merge([f('x', 1, T)], [f('x', 5, T + 10)], base);
  const n2 = settle(base, q, { copies: [{ ok: true, written: st(5, T + 11) }], removes: [], renames: [] });
  assert.deepEqual(n2.get(keyOf('folder', 'x')), { a: st(5, T + 11), b: st(5, T + 10) });
});
test('settle: copy failed keeps the old entry or none; ok without written throws', () => {
  const base = baseOf(['x', st(1, T), st(1, T)]);
  const p = merge([f('x', 2, T + 10), f('n', 1, T)], [f('x', 1, T)], base);
  const next = settle(base, p, op(p, false));
  assert.deepEqual([...next.entries()], [...base.entries()]);
  assert.notEqual(next, base);
  assert.throws(() => settle(base, p, { copies: p.copies.map(() => ({ ok: true })), removes: [], renames: [] }), /written/);
});
test('settle: remove ok deletes the key, failed keeps it', () => {
  const base = baseOf(['x', st(1, T), st(1, T)], ['y', st(1, T), st(1, T)]);
  const p = merge([], [f('x', 1, T), f('y', 1, T)], base);
  assert.equal(p.removes.length, 2);
  const next = settle(base, p, { copies: [], removes: [true, false], renames: [] });
  assert.deepEqual([...next.keys()], [keyOf('folder', 'y')]);
});
test('settle: same sets the entry (with hash), drop deletes', () => {
  const base = baseOf(['gone', st(1, T), st(1, T)]);
  const p = merge([f('x', 4, T), f('z', 4, T)], [f('x', 4, T + 5000), f('z', 4, T + 100)], base, {
    hashes: new Map([[keyOf('folder', 'x'), { a: 'h', b: 'h' }]]),
  });
  const next = settle(base, p, op(p));
  assert.deepEqual(next.get(keyOf('folder', 'x')), { a: st(4, T), b: st(4, T + 5000), hash: 'h' });
  assert.deepEqual(next.get(keyOf('folder', 'z')), { a: st(4, T), b: st(4, T + 100) });
  assert.ok(!next.has(keyOf('folder', 'gone')));
});
test('settle: conflict — renames leave the base, the winner copy sets both stats', () => {
  const base = baseOf(['x', st(1, T), st(1, T)]);
  const p = merge([f('x', 2, T + 10_000)], [f('x', 3, T + 20_000)], base);
  const next = settle(base, p, { copies: [{ ok: true, written: st(3, T + 20_000) }], removes: [], renames: [{ ok: true }] });
  assert.deepEqual(next.get(keyOf('folder', 'x')), { a: st(3, T + 20_000), b: st(3, T + 20_000) });
  assert.equal(next.size, 1);
  // rename ok but copy failed: the old entry stays
  const n2 = settle(base, p, { copies: [{ ok: false }], removes: [], renames: [{ ok: true }] });
  assert.deepEqual(n2.get(keyOf('folder', 'x')), base.get(keyOf('folder', 'x')));
});

// ---- details
test('mergeDetails: four cases', () => {
  const d = { name: 'P', color: 'red', description: 'd', instructions: 'i' };
  const same = mergeDetails(d, { ...d }, d);
  assert.deepEqual(same.toA, {});
  assert.deepEqual(same.toB, {});
  assert.deepEqual(same.base, d);
  // B changed → to A
  const r1 = mergeDetails(d, { ...d, name: 'Q' }, d);
  assert.deepEqual(r1.toA, { name: 'Q' });
  assert.deepEqual(r1.toB, {});
  assert.equal(r1.base.name, 'Q');
  // A changed → to B
  const r2 = mergeDetails({ ...d, color: 'blue' }, d, d);
  assert.deepEqual(r2.toB, { color: 'blue' });
  assert.deepEqual(r2.toA, {});
  // both changed → A's to B
  const r3 = mergeDetails({ ...d, name: 'A' }, { ...d, name: 'B' }, d);
  assert.deepEqual(r3.toB, { name: 'A' });
  assert.deepEqual(r3.toA, {});
  assert.equal(r3.base.name, 'A');
  // no base → A's to B; per field independent
  const r4 = mergeDetails({ ...d, name: 'A', description: 'x' }, { ...d, name: 'B', color: 'green' }, null);
  assert.deepEqual(r4.toB, { name: 'A', description: 'x', color: 'red' });
  assert.deepEqual(r4.toA, {});
  // undefined and '' are equal
  const r5 = mergeDetails({ name: 'P', color: 'c' }, { name: 'P', color: 'c', description: '', instructions: '' }, { name: 'P', color: 'c' });
  assert.deepEqual(r5.toA, {});
  assert.deepEqual(r5.toB, {});
  // clearing a field on B reaches A as ''
  const r6 = mergeDetails(d, { ...d, description: undefined }, d);
  assert.deepEqual(r6.toA, { description: '' });
  assert.equal(r6.base.description, undefined);
});

// ---- notes
const note = (text: string, kind: 'note' | 'finding' = 'note'): SyncNote => ({ hash: noteHash(kind, text), kind, text, createdAt: T });
test('noteHash: spaces made one, kind counts, 32 hex', () => {
  assert.equal(noteHash('note', '  a   b\n c '), noteHash('note', 'a b c'));
  assert.notEqual(noteHash('note', 'a'), noteHash('finding', 'a'));
  assert.match(noteHash('note', 'a'), /^[0-9a-f]{32}$/);
});
test('mergeNotes: no base is a union with no forgets', () => {
  const [n1, n2, n3] = [note('one'), note('two'), note('three')];
  const r = mergeNotes([n1, n2], [n2, n3], null);
  assert.deepEqual(r.addToA, [n3]);
  assert.deepEqual(r.addToB, [n1]);
  assert.deepEqual([r.forgetOnA, r.forgetOnB, r.held], [[], [], []]);
  assert.deepEqual([...r.base].sort(), [n1.hash, n2.hash, n3.hash].sort());
});
test('mergeNotes: added on one side goes to the other; deletes forget on the other; gone on both leaves the base', () => {
  const [n1, n2, n3, n4] = [note('one'), note('two'), note('three'), note('four')];
  const base = new Set([n1.hash, n2.hash, n3.hash]);
  // A has n1, n2, n4(new); B has n1, n3 (n2 deleted on B, n3 kept only on B?) …
  const r = mergeNotes([n1, n2, n4], [n1, n3], base);
  assert.deepEqual(r.addToB, [n4]);
  assert.deepEqual(r.addToA, []);
  assert.deepEqual(r.forgetOnA, [n2.hash]); // gone on B, present on A
  assert.deepEqual(r.forgetOnB, [n3.hash]); // gone on A, present on B
  assert.deepEqual([...r.base].sort(), [n1.hash, n4.hash].sort());
  // gone on both: just leaves the base
  const r2 = mergeNotes([n1], [n1], base);
  assert.deepEqual([r2.addToA, r2.addToB, r2.forgetOnA, r2.forgetOnB], [[], [], [], []]);
  assert.deepEqual([...r2.base], [n1.hash]);
  // added on B → to A
  const r3 = mergeNotes([n1], [n1, n4], new Set([n1.hash]));
  assert.deepEqual(r3.addToA, [n4]);
  assert.ok(r3.base.has(n4.hash));
});
test('mergeNotes: the mass guard holds forgets (a held forget keeps its hash in the base); force lets them through', () => {
  const notes = Array.from({ length: 30 }, (_, i) => note('n' + i));
  const base = new Set(notes.map((n) => n.hash));
  const r = mergeNotes(notes, [], base);
  assert.deepEqual(r.forgetOnA, []);
  assert.deepEqual(r.held, [{ side: 'a', count: 30, of: 30 }]);
  assert.equal(r.base.size, 30);
  const q = mergeNotes([], notes, base);
  assert.deepEqual(q.held, [{ side: 'b', count: 30, of: 30 }]);
  const forced = mergeNotes(notes, [], base, { force: true });
  assert.equal(forced.forgetOnA.length, 30);
  assert.equal(forced.held.length, 0);
  assert.equal(forced.base.size, 0);
  // 20 of 30 → through (not more than 20)
  const s = mergeNotes(notes, notes.slice(20), base);
  assert.equal(s.forgetOnA.length, 20);
  assert.equal(s.held.length, 0);
  // 25 of 100: through (not over half)
  const many = Array.from({ length: 100 }, (_, i) => note('m' + i));
  const t = mergeNotes(many, many.slice(25), new Set(many.map((n) => n.hash)));
  assert.equal(t.forgetOnA.length, 25);
});

// ---- randomized two-sides simulation
interface Sim { content: string; mtime: number }
type Side = Map<string, Sim>; // key = area\npath
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const listOf = (side: Side, area: SyncArea): SyncFile[] =>
  [...side].filter(([k]) => splitKey(k).area === area).map(([k, v]) => ({ area, path: splitKey(k).path, size: v.content.length, mtime: v.mtime }));
const lists = (side: Side): Record<SyncArea, SyncFile[]> => ({ folder: listOf(side, 'folder'), skills: listOf(side, 'skills'), wiki: listOf(side, 'wiki') });
const statSim = (v: Sim | undefined): Stat | null => (v ? { size: v.content.length, mtime: v.mtime } : null);
const sameStatN = (x: Stat | null, y: Stat | null): boolean => (x === null || y === null ? x === y : x.size === y.size && x.mtime === y.mtime);

function round(A: Side, B: Side, base: Base): { base: Base; plan: FilePlan } {
  const get = (s: Side, k: string) => s.get(k)?.content;
  let hashes: Map<string, { a?: string | null; b?: string | null }> | undefined;
  let plan = mergeFiles(lists(A), lists(B), base, { names: NAMES });
  for (let i = 0; plan.needHash.length && i < 2; i++) {
    hashes = new Map();
    for (const n of plan.needHash) {
      const k = keyOf(n.area, n.path);
      hashes.set(k, { a: get(A, k) ?? null, b: get(B, k) ?? null });
    }
    plan = mergeFiles(lists(A), lists(B), base, { names: NAMES, hashes });
  }
  assert.equal(plan.needHash.length, 0, 'hashes given → no more needHash');
  const out: Outcome = { copies: [], removes: [], renames: [] };
  for (const r of plan.renames) {
    const s = r.side === 'a' ? A : B;
    const k = keyOf(r.area, r.path);
    const ok = sameStatN(statSim(s.get(k)), r.expect) && !s.has(keyOf(r.area, r.to));
    if (ok) {
      s.set(keyOf(r.area, r.to), s.get(k)!);
      s.delete(k);
    }
    out.renames.push({ ok });
  }
  for (const r of plan.removes) {
    const s = r.side === 'a' ? A : B;
    const k = keyOf(r.area, r.path);
    const ok = sameStatN(statSim(s.get(k)), r.expect);
    if (ok) s.delete(k);
    out.removes.push(ok);
  }
  // copies read the source as it was listed: take them all before writing any
  const sources = plan.copies.map((c) => {
    const k = keyOf(c.area, c.path);
    const v = (c.from === 'a' ? A : B).get(k);
    assert.ok(v && sameStatN(statSim(v), c.stat), 'source is as listed');
    return { ...v };
  });
  plan.copies.forEach((c, i) => {
    const t = c.from === 'a' ? B : A;
    const k = keyOf(c.area, c.path);
    const ok = sameStatN(statSim(t.get(k)), c.expect);
    if (ok) t.set(k, { ...sources[i] });
    out.copies.push({ ok, written: ok ? { size: sources[i].content.length, mtime: sources[i].mtime } : undefined });
  });
  return { base: settle(base, plan, out), plan };
}

test('randomized: two sides converge, then the plan is empty', () => {
  const rand = rng(12345);
  const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
  const names = ['a.txt', 'b.txt', 'dir/c.md', 'dir/d.md', '.env', 'Makefile', 'e', 'f.tar.gz'];
  const keys: string[] = [];
  for (const area of ['folder', 'skills', 'wiki'] as SyncArea[]) for (const n of names) keys.push(keyOf(area, n));
  let clock = T;
  let ver = 0;
  let conflicts = 0;
  let needHashRounds = 0;
  let mirrors = 0;
  for (let game = 0; game < 60; game++) {
    const A: Side = new Map();
    const B: Side = new Map();
    let base: Base = new Map();
    for (let r = 0; r < 12; r++) {
      const edits = Math.floor(rand() * 7);
      for (let e = 0; e < edits; e++) {
        const s = rand() < 0.5 ? A : B;
        const other = s === A ? B : A;
        const k = pick(keys);
        const kind = rand();
        clock += 10_000 + Math.floor(rand() * 50_000);
        if (kind < 0.3) s.delete(k);
        else if (kind < 0.45 && other.has(k)) {
          // the same content as the other side's at a time within 2 s (or far, to need a hash)
          const o = other.get(k)!;
          s.set(k, { content: o.content, mtime: o.mtime + (rand() < 0.5 ? 1000 : -1000 + Math.floor(rand() * 2000)) });
          mirrors++;
        } else if (kind < 0.6 && other.has(k)) s.set(k, { content: other.get(k)!.content, mtime: clock });
        else s.set(k, { content: 'v' + ver++ + 'x'.repeat(Math.floor(rand() * 3)), mtime: clock });
      }
      if (rand() < 0.4) continue; // a round that does not happen: edits pile up on both sides
      const res = round(A, B, base);
      base = res.base;
      conflicts += res.plan.conflicts.length;
      if (res.plan.same.some((x) => x.hash)) needHashRounds++;
      assert.ok(res.plan.held.length === 0);
    }
    // no new edits: it settles in a few rounds (a conflict copy takes one more round to be carried over)
    let plan: FilePlan | undefined;
    for (let r = 0; r < 6; r++) {
      const res = round(A, B, base);
      base = res.base;
      plan = res.plan;
      if (!plan.copies.length && !plan.removes.length && !plan.renames.length) break;
    }
    assert.ok(plan && !plan.copies.length && !plan.removes.length && !plan.renames.length && !plan.conflicts.length, 'settled');
    assert.deepEqual([...A.keys()].sort(), [...B.keys()].sort(), 'same files');
    for (const [k, v] of A) assert.equal(B.get(k)!.content, v.content, 'same contents');
    const again = mergeFiles(lists(A), lists(B), base, { names: NAMES });
    assert.deepEqual([again.copies, again.removes, again.renames, again.conflicts, again.needHash, again.held], [[], [], [], [], [], []], 'next plan is empty');
    // the base now holds every file, with both sides' stats
    for (const [k, v] of A) assert.ok(sameStatN(base.get(k)?.a ?? null, statSim(v)), 'base a');
    for (const [k, v] of B) assert.ok(sameStatN(base.get(k)?.b ?? null, statSim(v)), 'base b');
    assert.equal(base.size, A.size);
  }
  assert.ok(conflicts > 20, `conflicts exercised (${conflicts})`);
  assert.ok(needHashRounds > 5, `hash path exercised (${needHashRounds})`);
  assert.ok(mirrors > 20, `near-same exercised (${mirrors})`);
});

console.log(`merge-test: ${passed} tests passed`);
