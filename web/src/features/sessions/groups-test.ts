// Script tests for the sidebar's groups (groups.ts): a space's sessions in its group from the first, a folder's
// once two sessions work in it, never the folders no one picked, a worktree's under its main checkout, and the
// groups in their order. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/sessions/groups-test.ts && node dist/dev/groups-test.js
import assert from 'node:assert/strict';
import type { SpaceView } from '@shared/spaces';
import type { SessionSummary } from '@shared/types';
import { groupSessions, isFolded, STALE_MS, unpickedFolders, type SessionGroup } from './groups';

const HOME = '/home/alex';
const now = new Date(2026, 10, 2, 15, 0);
const H = 3600_000;
let n = 0;
/** A session last at work `ago` before now, in `cwd`. */
const ses = (cwd: string | undefined, ago: number, more: Partial<SessionSummary> = {}): SessionSummary => ({
  key: `claude:${++n}`,
  agent: 'claude',
  id: String(n),
  title: `Session ${n}`,
  cwd,
  updatedAt: now.getTime() - ago,
  stats: { linesAdded: 0, linesRemoved: 0 } as SessionSummary['stats'],
  ...more,
});
const space = (id: string, name: string): SpaceView => ({ id, name, color: 'blue', folder: `${HOME}/Naget/Spaces/${id}`, createdAt: 0, sessions: 0, docs: 0, skills: 0 }) as SpaceView;
const unpicked = unpickedFolders(HOME, HOME, [`${HOME}/Naget`, `${HOME}/naget-apps`, `${HOME}/.naget-agent/worktrees`, `${HOME}/.naget-agent`, '/tmp']);
/** The list as the sidebar has it: newest first. */
const group = (list: SessionSummary[], o: { byFolder?: boolean; spaces?: SpaceView[] } = {}) =>
  groupSessions(
    [...list].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
    { now, byFolder: o.byFolder ?? true, spaces: o.spaces ?? [], unpicked },
  );
const shape = (gs: SessionGroup[]) => gs.map((g) => `${g.label}: ${g.items.map((s) => s.title).join(', ')}`);

let passed = 0;
const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

test('a folder you picked gets a group once two sessions work in it; one session alone goes by day', () => {
  n = 0;
  const gs = group([ses(`${HOME}/code/shop`, 1 * H), ses(`${HOME}/code/shop`, 30 * H), ses(`${HOME}/code/blog`, 2 * H)]);
  assert.deepEqual(shape(gs), ['shop: Session 1, Session 2', 'Today: Session 3']);
  const shop = gs[0];
  assert.equal(shop.kind, 'folder');
  assert.equal(shop.id, `dir:${HOME}/code/shop`);
  assert.equal(shop.path, `${HOME}/code/shop`);
});

test('folders no one picked get none: home, the default folder, task folders, apps, worktrees, temporary ones', () => {
  n = 0;
  const dirs = [HOME, `${HOME}/Naget/2026-11-01-trip`, `${HOME}/naget-apps/trip/run-1`, `${HOME}/.naget-agent/worktrees/x`, '/tmp/scratch', '/'];
  const gs = group(dirs.flatMap((d, i) => [ses(d, i * H + 1), ses(d, i * H + 2)]));
  assert.deepEqual(
    gs.map((g) => g.kind),
    ['day'],
  );
  assert.equal(gs[0].items.length, 12);
  // Inside the home folder, a folder of your own is yours.
  assert.equal(unpicked(`${HOME}/code`), false);
  assert.equal(unpicked(`${HOME}/Naget`), true);
  assert.equal(unpicked(`${HOME}/Nagetful`), false, 'a folder that only starts with the same letters');
  assert.equal(unpicked(`${HOME}/code/`), false, 'a slash at the end');
});

test('a server too old to say which folders it makes: the usual places', () => {
  const old = unpickedFolders(HOME, '/srv/default', undefined);
  for (const d of [HOME, '/srv/default', `${HOME}/Naget/2026-11-01-x`, `${HOME}/naget-apps/a`, `${HOME}/.web-agent/worktrees/w`, '/tmp/t']) assert.equal(old(d), true, d);
  assert.equal(old(`${HOME}/code/shop`), false);
});

test('a space’s sessions are in its group from the first, whatever their folder; a deleted space’s go by folder', () => {
  n = 0;
  const thesis = space('sp1', 'Thesis');
  const gs = group(
    [
      ses(`${HOME}/Naget/Spaces/sp1`, 1 * H, { extra: { space: 'sp1' } }),
      ses(`${HOME}/code/shop`, 2 * H, { extra: { space: 'gone' } }),
      ses(`${HOME}/code/shop`, 3 * H),
    ],
    { spaces: [thesis] },
  );
  assert.deepEqual(shape(gs), ['Thesis: Session 1', 'shop: Session 2, Session 3']);
  assert.equal(gs[0].kind, 'space');
  assert.equal(gs[0].space, thesis);
  // Spaces not known yet (still loading): their sessions wait by day.
  assert.deepEqual(
    groupSessions([ses(`${HOME}/Naget/Spaces/sp1`, H, { extra: { space: 'sp1' } })], { now, byFolder: true, spaces: null, unpicked }).map((g) => g.kind),
    ['day'],
  );
});

test('a session in a worktree counts for the checkout it was made from', () => {
  n = 0;
  const wt = { path: `${HOME}/.naget-agent/worktrees/shop-x`, branch: 'fix-x', base: 'main', repo: `${HOME}/code/shop` };
  const gs = group([ses(wt.path, 1 * H, { worktree: wt }), ses(`${HOME}/code/shop`, 2 * H)]);
  assert.deepEqual(shape(gs), ['shop: Session 1, Session 2']);
});

test('active, pinned and snoozed sessions keep their groups, and still count for their folder', () => {
  n = 0;
  const live = { status: 'idle' } as unknown as SessionSummary['live'];
  const gs = group([
    ses(`${HOME}/code/shop`, 1 * H, { live }),
    ses(`${HOME}/code/shop`, 2 * H),
    ses(`${HOME}/code/blog`, 3 * H, { pinned: true }),
    ses(`${HOME}/code/blog`, 4 * H),
    ses(`${HOME}/code/blog`, 5 * H, { snoozedUntil: now.getTime() + H }),
  ]);
  assert.deepEqual(shape(gs), ['Active: Session 1', 'Pinned: Session 3', 'shop: Session 2', 'blog: Session 4', 'Snoozed: Session 5']);
});

test('the order: active, pinned, spaces and folders by their newest session, the days, snoozed', () => {
  n = 0;
  const gs = group(
    [
      ses(`${HOME}/Naget/2026-11-02-a`, 1 * H),
      ses(`${HOME}/code/old`, 50 * H),
      ses(`${HOME}/code/old`, 60 * H),
      ses(`${HOME}/code/new`, 2 * H),
      ses(`${HOME}/code/new`, 3 * H),
      ses(`${HOME}/Naget/2026-11-01-b`, 26 * H),
    ],
    { spaces: [] },
  );
  assert.deepEqual(
    gs.map((g) => g.label),
    ['new', 'old', 'Today', 'Yesterday'],
  );
});

test('two folders of the same name show the folder each is in', () => {
  n = 0;
  const gs = group([ses(`${HOME}/client/app`, H), ses(`${HOME}/client/app`, 2 * H), ses(`${HOME}/server/app`, 3 * H), ses(`${HOME}/server/app`, 4 * H), ses('/app', 5 * H), ses('/app', 6 * H)]);
  assert.deepEqual(
    gs.map((g) => g.label),
    ['client/app', 'server/app', '/app'],
  );
});

test('with grouping off, everything but active, pinned and snoozed goes by day, as before', () => {
  n = 0;
  const gs = group([ses(`${HOME}/code/shop`, H), ses(`${HOME}/code/shop`, 2 * H, { extra: { space: 'sp1' } })], { byFolder: false, spaces: [space('sp1', 'Thesis')] });
  assert.deepEqual(shape(gs), ['Today: Session 1, Session 2']);
});

test('a group shows folded as you left it, else once none of its sessions was at work this week', () => {
  n = 0;
  const fresh = group([ses(`${HOME}/code/a`, H), ses(`${HOME}/code/a`, 2 * H)])[0];
  const stale = group([ses(`${HOME}/code/b`, STALE_MS + H), ses(`${HOME}/code/b`, STALE_MS + 2 * H)])[0];
  assert.equal(isFolded(fresh, {}, now.getTime()), false);
  assert.equal(isFolded(stale, {}, now.getTime()), true);
  assert.equal(isFolded(fresh, { [fresh.id]: true }, now.getTime()), true);
  assert.equal(isFolded(stale, { [stale.id]: false }, now.getTime()), false);
});

for (const [name, fn] of tests) {
  try {
    fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}\n     ${(e as Error).message.split('\n').join('\n     ')}`);
  }
}
console.log(`\n${passed}/${tests.length} passed`);
if (passed !== tests.length) process.exit(1);
