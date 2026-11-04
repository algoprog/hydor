// Script tests for the sidebar's groups (groups.ts): a space's sessions in its group from the first, a folder's
// once two sessions work in it, never the folders no one picked, a worktree's under its main checkout, and the
// groups in their order. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/sessions/groups-test.ts && node dist/dev/groups-test.js
import assert from 'node:assert/strict';
import type { SpaceView } from '@shared/spaces';
import type { SessionSummary } from '@shared/types';
import { ACTIVE_MS, groupSessions, isFolded, STALE_MS, unpickedFolders, type SessionGroup } from './groups';

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
  const gs = group(dirs.flatMap((d, i) => [ses(d, (i + 1) * H + 1), ses(d, (i + 1) * H + 2)]));
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
    ses(`${HOME}/code/shop`, 60_000, { live }),
    ses(`${HOME}/code/shop`, 2 * H),
    ses(`${HOME}/code/blog`, 3 * H, { pinned: true }),
    ses(`${HOME}/code/blog`, 4 * H),
    ses(`${HOME}/code/blog`, 5 * H, { snoozedUntil: now.getTime() + H }),
  ]);
  assert.deepEqual(shape(gs), ['Active: Session 1', 'Pinned: Session 3', 'shop: Session 2', 'blog: Session 4', 'Snoozed: Session 5']);
});

test('Active includes recent finished sessions but excludes stale agents, even working or waiting ones', () => {
  n = 0;
  const recent = ses(HOME, ACTIVE_MS - 1);
  const boundary = ses(HOME, ACTIVE_MS);
  const stale = ['idle', 'working', 'waiting'].map((status) => ses(HOME, H, { live: { status, startedAt: now.getTime() - H, pendingApprovals: 0 } as SessionSummary['live'] }));
  const external = ses(HOME, H, { external: { status: 'idle', client: 'VS Code', pid: 1, since: now.getTime() - H } });
  const gs = group([recent, boundary, ...stale, external]);
  assert.deepEqual(gs.find((g) => g.kind === 'active')?.items.map((s) => s.key), [recent.key]);
  const expired = groupSessions([recent], { now: new Date(now.getTime() + 1), byFolder: false, spaces: [], unpicked });
  assert.equal(expired.some((g) => g.kind === 'active'), false);
});

test('sessions awaiting auto-resume stay Active beyond five minutes, until the scheduled resume is cleared', () => {
  const pending = ses(HOME, 2 * H, { resumeAt: now.getTime() + H });
  const overdue = ses(HOME, 3 * H, { resumeAt: now.getTime() - H, pinned: true });
  const stopped = ses(HOME, 2 * H, { live: { status: 'exited', startedAt: now.getTime() - 2 * H, pendingApprovals: 0 } });
  const gs = group([pending, overdue, stopped]);
  assert.deepEqual(gs.find((g) => g.kind === 'active')?.items.map((s) => s.key), [pending.key, overdue.key]);
  const cleared = group([{ ...pending, resumeAt: undefined }, { ...overdue, resumeAt: undefined }, stopped]);
  assert.equal(cleared.some((g) => g.kind === 'active'), false);
  assert.equal(cleared.find((g) => g.kind === 'pinned')?.items[0].key, overdue.key);
});

test('sessions with background agents or commands still running stay Active, here or elsewhere, until they end', () => {
  n = 0;
  const task = { id: 't1', description: 'Review the change', kind: 'local_agent', status: 'running' } as const;
  const live = (backgroundTasks: (typeof task)[], status = 'idle') =>
    ({ status, startedAt: now.getTime() - 2 * H, pendingApprovals: 0, backgroundTasks }) as unknown as SessionSummary['live'];
  const here = ses(HOME, H, { live: live([task]) });
  const elsewhere = ses(HOME, H, { external: { status: 'idle', client: 'VS Code', pid: 1, since: now.getTime() - 2 * H, backgroundTasks: [task] } as SessionSummary['external'] });
  const done = ses(HOME, H, { live: live([]) });
  const exited = ses(HOME, H, { live: live([task], 'exited') });
  const gs = group([here, elsewhere, done, exited]);
  assert.deepEqual(gs.find((g) => g.kind === 'active')?.items.map((s) => s.key), [here.key, elsewhere.key]);
});

test('recent starts, turns, completions and external activity count; seen sessions do not', () => {
  const ts = now.getTime() - 1000;
  const live = { status: 'idle', startedAt: now.getTime() - H, pendingApprovals: 0 } as const;
  const recent = [
    ses(HOME, H, { live: { ...live, startedAt: ts } }),
    ses(HOME, H, { live: { ...live, turnStartedAt: ts } }),
    ses(HOME, H, { doneAt: ts }),
    ses(HOME, H, { external: { status: 'waiting', client: 'terminal', pid: 1, since: ts } }),
    ses(HOME, H, { updatedAt: undefined, createdAt: ts }),
  ];
  const gs = group([...recent, ses(HOME, H, { seenAt: ts }), ses(HOME, H, { updatedAt: undefined })]);
  assert.equal(gs.find((g) => g.kind === 'active')?.items.length, recent.length);
});

test('recent pinned sessions return to Pinned after five minutes; snoozed ones stay snoozed', () => {
  const pinned = ses(HOME, 1000, { pinned: true });
  const snoozed = ses(HOME, 1000, { snoozedUntil: now.getTime() + H });
  assert.deepEqual(group([pinned, snoozed]).map((g) => g.kind), ['active', 'snoozed']);
  assert.deepEqual(groupSessions([pinned, snoozed], { now: new Date(now.getTime() + ACTIVE_MS), byFolder: false, spaces: [], unpicked }).map((g) => g.kind), ['pinned', 'snoozed']);
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

test('spaces and folders you dragged keep their places, after the ones you never moved, which go by their newest session', () => {
  n = 0;
  const list = [
    ses(`${HOME}/code/new`, 1 * H),
    ses(`${HOME}/code/new`, 2 * H),
    ses(`${HOME}/code/old`, 50 * H),
    ses(`${HOME}/code/old`, 60 * H),
    ses(`${HOME}/somewhere`, 3 * H, { extra: { space: 'sp1' } }),
    ses(`${HOME}/code/fresh`, 0.5 * H),
    ses(`${HOME}/code/fresh`, 0.6 * H),
  ];
  const sorted = [...list].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  const at = (places?: string[]) =>
    groupSessions(sorted, { now, byFolder: true, spaces: [space('sp1', 'Thesis')], unpicked, places })
      .filter((g) => g.kind === 'space' || g.kind === 'folder')
      .map((g) => g.label);
  assert.deepEqual(at(), ['fresh', 'new', 'Thesis', 'old'], 'by their newest session');
  assert.deepEqual(at([`dir:${HOME}/code/old`, 'space:sp1', `dir:${HOME}/code/new`]), ['fresh', 'old', 'Thesis', 'new'], 'the one never moved first, then as dragged');
  assert.deepEqual(at([`dir:${HOME}/gone`, `dir:${HOME}/code/fresh`, 'space:sp1', `dir:${HOME}/code/old`, `dir:${HOME}/code/new`]), ['fresh', 'Thesis', 'old', 'new'], 'a group no longer there is passed over');
});

test('two folders of the same name show the folder each is in', () => {
  n = 0;
  const gs = group([ses(`${HOME}/client/app`, H), ses(`${HOME}/client/app`, 2 * H), ses(`${HOME}/server/app`, 3 * H), ses(`${HOME}/server/app`, 4 * H), ses('/app', 5 * H), ses('/app', 6 * H)]);
  assert.deepEqual(
    gs.map((g) => g.label),
    ['client/app', 'server/app', '/app'],
  );
});

test('ChatGPT projects\' folders (named by an id) get no group, unless Codex names the project; same-named folders go up until they differ', () => {
  n = 0;
  const gp = `${HOME}/.codex/.chatgpt-projects/g-p-6a8f480744908191a58f758776c01519`;
  const gq = `${HOME}/.codex/.chatgpt-projects/g-p-6a8f2b6112e481`;
  const list = [ses(gp, 1 * H), ses(gp, 2 * H), ses(gq, 3 * H), ses(gq, 4 * H), ses(`${HOME}/a/projects/readable990`, 5 * H), ses(`${HOME}/a/projects/readable990`, 6 * H), ses(`${HOME}/b/projects/readable990`, 7 * H), ses(`${HOME}/b/projects/readable990`, 8 * H)];
  const sorted = [...list].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  const gs = groupSessions(sorted, { now, byFolder: true, spaces: [], unpicked, names: { [gp]: 'Thesis notes' } });
  assert.deepEqual(
    gs.filter((g) => g.kind === 'folder').map((g) => g.label),
    ['Thesis notes', 'a/projects/readable990', 'b/projects/readable990'],
  );
  assert.equal(gs.filter((g) => g.kind === 'day').flatMap((g) => g.items).length, 2, 'the unnamed ChatGPT project\'s sessions go by day');
});

test('a folder none of whose sessions Hydor started says where they came from, by agent and account; one it started in does not', () => {
  n = 0;
  const gs = group([
    // Codex in VS Code and a terminal, and Claude Code in its desktop app under an added account.
    ses(`${HOME}/code/shop`, 1 * H, { agent: 'codex', source: 'vscode' }),
    ses(`${HOME}/code/shop`, 2 * H, { agent: 'codex', source: 'cli' }),
    ses(`${HOME}/code/shop`, 3 * H, { agent: 'codex', source: 'vscode' }),
    ses(`${HOME}/code/shop`, 4 * H, { source: 'claude-desktop', account: 'work' }),
    // A sub-agent's thread counts for its parent.
    ses(`${HOME}/code/shop`, 5 * H, { agent: 'codex', source: 'subagent' }),
    // One session started here: the folder is Hydor's too.
    ses(`${HOME}/code/blog`, 6 * H, { source: 'cli' }),
    ses(`${HOME}/code/blog`, 7 * H, { source: 'sdk-cli', createdByApp: true }),
    // Started here, and active now, so outside the folder's group: it still counts.
    ses(`${HOME}/code/notes`, 1000, { createdByApp: true }),
    ses(`${HOME}/code/notes`, 8 * H, { source: 'claude-vscode' }),
    ses(`${HOME}/code/notes`, 9 * H, { source: 'claude-vscode' }),
    // An agent that did not say where it was started.
    ses(`${HOME}/code/old`, 10 * H),
    ses(`${HOME}/code/old`, 11 * H),
  ]);
  const at = (dir: string) => gs.find((g) => g.path === `${HOME}/code/${dir}`)!;
  assert.deepEqual(at('shop').from, [
    { agent: 'codex', account: undefined, sessions: 3, apps: ['VS Code', 'Terminal'] },
    { agent: 'claude', account: 'work', sessions: 1, apps: ['Claude desktop'] },
  ]);
  assert.equal(at('blog').from, undefined);
  assert.equal(at('notes').from, undefined);
  assert.deepEqual(at('old').from, [{ agent: 'claude', account: undefined, sessions: 2, apps: [] }]);
  // A space is Hydor's own.
  n = 0;
  const sp = group([ses(`${HOME}/code/x`, H, { extra: { space: 's1' } }), ses(`${HOME}/code/x`, 2 * H, { extra: { space: 's1' } })], { spaces: [space('s1', 'Shop')] });
  assert.equal(sp[0].kind, 'space');
  assert.equal(sp[0].from, undefined);
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
