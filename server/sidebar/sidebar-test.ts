// Script tests for the sidebar's orders: the tools in the order named, any left out in their usual place (right before
// the next tool that follows them in the usual order); a name it does not know refused; the usual order kept as none; the projects' and folders' groups as dragged; the routes, and
// the news to open pages. And where each folder's work began (origins.ts).
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/sidebar/sidebar-test.ts
//   DATA_DIR=/tmp/hydor-test-sidebar node dist/dev/sidebar-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MAX_PLACES, placeOrder, SECTION_TOOLS, SIDEBAR_TOOLS, toolOrder, usualOrder } from '../../shared/sidebar.ts';
import type { ServerEvent } from '../../shared/types.ts';
import { kvGet, openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { setSidebarPlaces, setSidebarTools, sidebar, sidebarPlaces, sidebarTools } from './index.ts';
import { folderOrigins } from './origins.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-sidebar-test-'));
const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const usual = [...SIDEBAR_TOOLS];

test('the usual order: the sections (Browser, Projects, Files, Agents, Apps, Git, Experiments, Jobs), then Search, Usage, System, Settings, Help', () => {
  assert.deepEqual(usual, ['browser', 'spaces', 'files', 'agents', 'apps', 'git', 'experiments', 'jobs', 'search', 'usage', 'system', 'settings', 'help']);
  assert.deepEqual(SECTION_TOOLS, usual.slice(0, 8), 'the rail\'s upper group comes first in the usual order');
  assert.ok(SIDEBAR_TOOLS.indexOf('spaces') === SIDEBAR_TOOLS.indexOf('files') - 1, 'Projects is right before Files');
  assert.ok(SIDEBAR_TOOLS.indexOf('files') === SIDEBAR_TOOLS.indexOf('agents') - 1, 'Files is right before Agents');
});

test('an order: the tools named in their order, any left out in their usual place', () => {
  assert.deepEqual(toolOrder([]), usual);
  assert.deepEqual(toolOrder(undefined), usual);
  assert.deepEqual(toolOrder('settings'), usual, 'not a list: the usual order');
  assert.deepEqual(toolOrder(['help', 'gone', 'help', 3, 'system']), ['settings', 'help', 'browser', 'spaces', 'files', 'agents', 'apps', 'git', 'experiments', 'jobs', 'search', 'usage', 'system'], 'unknown names and repeats skipped; each tool left out right before the next that follows it');
  assert.deepEqual(toolOrder(['terminal', 'preview', 'help']), usual, 'tools that moved into System are passed over');
  assert.deepEqual(toolOrder(['pages', 'help']), usual, 'the Library is gone: passed over');
  // Someone who dragged their tools into their own order before Projects came back: it joins right before Files, and
  // Files right before Agents; Git, Experiments and Jobs, which have no section after them, come right after
  // Apps, among the sections, even where a tool below the gap was dragged first (a phone's drawer is one grid).
  assert.deepEqual(toolOrder(['help', 'apps', 'agents', 'browser', 'settings']), ['help', 'apps', 'git', 'experiments', 'jobs', 'spaces', 'files', 'agents', 'browser', 'search', 'usage', 'system', 'settings']);
  const without = ['settings', 'system', 'usage', 'search', 'apps', 'agents', 'browser', 'help'];
  const got = toolOrder(without);
  assert.equal(got.indexOf('spaces'), got.indexOf('agents') - 2, 'a kept order without Projects and Files gets them before Agents');
  assert.equal(got.indexOf('files'), got.indexOf('agents') - 1);
  assert.deepEqual(got.filter((t) => !['spaces', 'files', 'git', 'experiments', 'jobs'].includes(t)), without, 'and nothing else moves');
  const named = ['settings', 'agents', 'spaces', 'experiments', 'jobs', 'system', 'usage', 'search', 'git', 'apps', 'files', 'browser', 'help'];
  assert.deepEqual(toolOrder(named), named, 'a kept order that names Projects, Files, Git, Experiments and Jobs keeps them where they are');
  const last = ['browser', 'agents', 'apps', 'search', 'usage', 'system', 'settings', 'help', 'spaces', 'files', 'git', 'experiments', 'jobs'];
  assert.deepEqual(toolOrder(last), last, '…even last');
  const reversed = [...usual].reverse();
  assert.deepEqual(toolOrder(reversed), reversed);
  assert.ok(usualOrder(toolOrder([])));
  assert.ok(!usualOrder(reversed));
  // The rail's two groups: the sections above the gap (Projects, Files, Git, Experiments and Jobs among them), the rest below; Search under the Inbox.
  const split = toolOrder(['help', 'apps', 'agents', 'browser']);
  assert.deepEqual(split.filter((t) => SECTION_TOOLS.includes(t)), ['apps', 'git', 'experiments', 'jobs', 'spaces', 'files', 'agents', 'browser']);
  // A kept order of every tool from before Files, Git and Experiments came out of System (the rail's own, sections first).
  const before = ['apps', 'browser', 'spaces', 'agents', 'search', 'usage', 'system', 'settings', 'help'];
  assert.deepEqual(toolOrder(before), ['apps', 'git', 'experiments', 'jobs', 'browser', 'spaces', 'files', 'agents', 'search', 'usage', 'system', 'settings', 'help']);
  assert.deepEqual(split.filter((t) => !SECTION_TOOLS.includes(t) && t !== 'search'), ['usage', 'system', 'settings', 'help'], 'the tools below keep the order they come in');
});

test('kept: every device reads the same; the usual order is kept as none', () => {
  assert.deepEqual(sidebarTools(db), usual, 'nothing kept yet');
  const mine = ['settings', 'system', 'apps', ...usual.filter((t) => !['settings', 'system', 'apps'].includes(t))];
  assert.deepEqual(setSidebarTools(db, mine), mine);
  assert.deepEqual(sidebarTools(db), mine);
  assert.deepEqual(setSidebarTools(db, ['help']), usual, 'an order naming one tool only: the rest take their usual places (here Help is last already)');
  assert.deepEqual(setSidebarTools(db, ['agents', 'apps', 'help']).slice(0, 5), ['browser', 'spaces', 'files', 'agents', 'apps'], 'Projects and Files, left out, go before Agents');
  assert.deepEqual(setSidebarTools(db, []), usual);
  assert.equal(kvGet(db, 'sidebar.tools'), '[]');
  setSidebarTools(db, mine);
  assert.deepEqual(setSidebarTools(db, usual), usual, 'dragged back into the usual order');
  assert.equal(kvGet(db, 'sidebar.tools'), '[]');
});

test('a name it does not know is refused, and changes nothing', () => {
  setSidebarTools(db, ['help', 'search']);
  assert.throws(() => setSidebarTools(db, ['search', 'setings']), (e: Error & { status?: number }) => e.status === 400 && /setings/.test(e.message) && /settings/.test(e.message));
  assert.throws(() => setSidebarTools(db, 'system'), /first to last/);
  assert.throws(() => setSidebarTools(db, undefined), /first to last/);
  assert.equal(sidebarTools(db)[0], 'usage');
  // An older page still sending Terminal or Preview: those are passed over, not refused.
  assert.equal(setSidebarTools(db, ['terminal', 'apps', 'preview']).indexOf('apps'), setSidebarTools(db, ['apps']).indexOf('apps'));
  assert.deepEqual(setSidebarTools(db, ['help', 'pages', 'spaces']), setSidebarTools(db, ['help', 'spaces']), 'the Library is passed over');
  // Kept by an older or a hand-edited copy: what it no longer knows is left out.
  db.prepare("insert or replace into kv (k, v) values ('sidebar.tools', ?)").run(JSON.stringify(['notebook', 'help']));
  assert.deepEqual(sidebarTools(db), usual);
  db.prepare("insert or replace into kv (k, v) values ('sidebar.tools', 'not json')").run();
  assert.deepEqual(sidebarTools(db), usual);
});

test('the routes: GET reads it, PUT keeps it and tells every open page', async () => {
  const handlers = new Map<string, (req: { body?: unknown }) => Promise<unknown>>();
  const app = {
    get: (p: string, h: (req: { body?: unknown }) => Promise<unknown>) => handlers.set(`GET ${p}`, h),
    put: (p: string, h: (req: { body?: unknown }) => Promise<unknown>) => handlers.set(`PUT ${p}`, h),
  };
  const sent: ServerEvent[] = [];
  sidebar.routes!({ app, db, broadcast: (e: ServerEvent) => sent.push(e) } as unknown as Deps);
  setSidebarPlaces(db, []);
  const order = ['help', ...usual.filter((t) => t !== 'help')];
  assert.deepEqual(await handlers.get('PUT /api/sidebar')!({ body: { tools: order } }), { tools: order, places: [] });
  assert.deepEqual(sent, [{ t: 'feature', id: 'sidebar', data: { tools: order, places: [] } }]);
  assert.deepEqual(await handlers.get('GET /api/sidebar')!({}), { tools: order, places: [], names: {} });
  // The groups' order alone: the tools stay as they were.
  const places = ['dir:/home/alex/blog', 'space:sp1'];
  assert.deepEqual(await handlers.get('PUT /api/sidebar')!({ body: { places } }), { tools: order, places });
  assert.deepEqual(sent[1], { t: 'feature', id: 'sidebar', data: { tools: order, places } });
  assert.deepEqual(await handlers.get('GET /api/sidebar')!({}), { tools: order, places, names: {} });
  await assert.rejects(() => handlers.get('PUT /api/sidebar')!({ body: { tools: ['inbox'] } }), /inbox/);
  await assert.rejects(() => handlers.get('PUT /api/sidebar')!({ body: { places: ['day:Today'] } }), /day:Today/);
  await assert.rejects(() => handlers.get('PUT /api/sidebar')!({}), /tools, places or both/);
  assert.equal(sent.length, 2, 'a refused change tells nobody');
  // A folder's name: kept, told to every open page, and given back with an empty one.
  const named = { '/home/alex/.codex/.chatgpt-projects/g-p-6a8f': 'Thesis' };
  assert.deepEqual(await handlers.get('PUT /api/sidebar/folder-name')!({ body: { path: '/home/alex/.codex/.chatgpt-projects/g-p-6a8f/', name: '  Thesis ' } }), { names: named });
  assert.deepEqual(sent[2], { t: 'feature', id: 'sidebar', data: { names: named } });
  assert.deepEqual(((await handlers.get('GET /api/sidebar')!({})) as { names: unknown }).names, named);
  await assert.rejects(() => handlers.get('PUT /api/sidebar/folder-name')!({ body: { path: 'relative', name: 'x' } }), /full path/);
  await assert.rejects(() => handlers.get('PUT /api/sidebar/folder-name')!({ body: { path: '/a', name: 'x'.repeat(81) } }), /80/);
  assert.deepEqual(await handlers.get('PUT /api/sidebar/folder-name')!({ body: { path: '/home/alex/blog', name: 'blog' } }), { names: named }, 'its own name is no name of yours');
  assert.deepEqual(await handlers.get('PUT /api/sidebar/folder-name')!({ body: { path: '/home/alex/.codex/.chatgpt-projects/g-p-6a8f', name: '' } }), { names: {} });
});

test('the projects’ and folders’ groups: as dragged, repeats and other names refused or passed over, kept for every device', () => {
  assert.deepEqual(sidebarPlaces(db), ['dir:/home/alex/blog', 'space:sp1'], 'as the routes left it');
  assert.deepEqual(setSidebarPlaces(db, ['space:sp2', 'dir:/srv/shop', 'space:sp2']), ['space:sp2', 'dir:/srv/shop']);
  assert.deepEqual(sidebarPlaces(db), ['space:sp2', 'dir:/srv/shop']);
  assert.throws(() => setSidebarPlaces(db, ['space:sp2', 'pinned']), (e: Error & { status?: number }) => e.status === 400 && /pinned/.test(e.message));
  assert.throws(() => setSidebarPlaces(db, 'space:sp2'), /first to last/);
  assert.throws(() => setSidebarPlaces(db, ['dir:relative/path']), /relative/);
  assert.deepEqual(sidebarPlaces(db), ['space:sp2', 'dir:/srv/shop'], 'a refused order changes nothing');
  assert.equal(placeOrder(Array.from({ length: MAX_PLACES + 20 }, (_, i) => `space:s${i}`)).length, MAX_PLACES);
  db.prepare("insert or replace into kv (k, v) values ('sidebar.places', 'not json')").run();
  assert.deepEqual(sidebarPlaces(db), []);
  assert.deepEqual(setSidebarPlaces(db, []), []);
});

test('where each folder began: Hydor, or outside it, with the agents, accounts and apps its sessions came from', () => {
  let n = 0;
  /** A session the indexer read from an agent's history, `at` hours ago; `here` when Hydor started it. */
  const ses = (cwd: string, at: number, o: { agent?: string; source?: string; here?: boolean; hidden?: boolean; worktree?: string; account?: string } = {}) => {
    const key = `${o.agent ?? 'claude'}:o${++n}`;
    db.prepare(`insert into sessions (key, agent, id, path, cwd, source, created_at, updated_at, hidden) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      key, o.agent ?? 'claude', `o${n}`, `/x/${n}.jsonl`, cwd, o.source ?? null, 1000 - at, 1000 - at, o.hidden ? 1 : 0,
    );
    if (o.here || o.worktree || o.account)
      db.prepare(`insert into app_sessions (key, agent, cwd, created_by_app, worktree, account, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        key, o.agent ?? 'claude', cwd, o.here ? 1 : 0, o.worktree ? JSON.stringify({ path: cwd, branch: 'b', base: 'main', repo: o.worktree }) : null, o.account ?? null, 1000 - at, 1000 - at,
      );
  };
  // Begun in Codex (VS Code, then a terminal), then worked on from Hydor and from Claude Code under an added account.
  ses('/home/a/shop', 90, { agent: 'codex', source: 'vscode' });
  ses('/home/a/shop/', 80, { agent: 'codex', source: 'cli' });
  ses('/home/a/shop', 70, { agent: 'codex', source: 'vscode' });
  ses('/home/a/shop', 60, { here: true, source: 'sdk-cli' });
  ses('/home/a/shop', 50, { source: 'claude-vscode', account: 'acc1' });
  // A sub-agent's thread or an empty session (hidden) is not one of the folder's.
  ses('/home/a/shop', 95, { here: true, hidden: true });
  // Begun in Hydor, in a worktree of the checkout; later from a terminal.
  ses('/home/a/.hydor/worktrees/blog-x', 40, { here: true, worktree: '/home/a/blog' });
  ses('/home/a/blog', 30, { source: 'cli' });
  // One session alone: no group, so not said.
  ses('/home/a/notes', 20, { source: 'cli' });
  // Started in Hydor and not indexed yet: only the app's own row.
  db.prepare(`insert into app_sessions (key, agent, cwd, created_by_app, created_at, updated_at) values ('claude:fresh', 'claude', '/home/a/notes', 1, 990, 990)`).run();
  const o = folderOrigins(db);
  assert.deepEqual(o['/home/a/shop'], [
    { agent: 'codex', account: undefined, sources: ['vscode', 'cli'], sessions: 3 },
    { agent: 'claude', account: 'acc1', sources: ['claude-vscode'], sessions: 1 },
  ]);
  assert.deepEqual(o['/home/a/blog'], []);
  // The fresh one makes two: it began outside (an hour before it).
  assert.deepEqual(o['/home/a/notes'], [{ agent: 'claude', account: undefined, sources: ['cli'], sessions: 1 }]);
  assert.equal('/home/a/.hydor/worktrees/blog-x' in o, false);
  db.exec(`delete from sessions where key like '%:o%'; delete from app_sessions where key like '%:o%' or key = 'claude:fresh'`);
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed}/${tests.length} passed`);
fs.rmSync(tmp, { recursive: true, force: true });
