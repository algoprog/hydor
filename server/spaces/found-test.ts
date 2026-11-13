// Script tests for projects found in Claude Code and Codex: folders their sessions worked in (twice or more, a git
// repository for its subfolders) and Codex's own projects become projects by themselves, with the sessions that work
// in a project's folder; what is left out (the home folder, hidden, app-made and "Not a project" folders, those a
// project has already); names that clash; the sidebar keeping a group's place; a deleted project not coming back.
// Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/spaces/found-test.ts
//   DATA_DIR=/tmp/hydor-test-found node dist/dev/found-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { setSettings } from '../assistants/store.ts';
import { agentRoots, config } from '../config.ts';
import { openDb } from '../db.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { setSidebarPlaces, setFolderName, sidebarPlaces } from '../sidebar/index.ts';
import { claimSessions, foundProjects, FOUND_MIN, projectOfFolder, syncFoundProjects } from './found.ts';
import { allSpaces, createSpace, deleteSpace, sessionsIn, spaceById, spaceViews, updateSpace } from './index.ts';
import { hideSuggestion } from './suggest.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-found-test-'));
const db = openDb(path.join(tmp, 'test.db'));
const home = path.join(tmp, 'home');
const codexHome = path.join(tmp, 'codex');
fs.mkdirSync(home);
fs.mkdirSync(codexHome);
agentRoots.codexHomes.splice(0, agentRoots.codexHomes.length, codexHome);
setSettings(db, { taskRoot: path.join(home, 'Hydor') });
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const dir = (...p: string[]) => {
  const d = path.join(home, ...p);
  fs.mkdirSync(d, { recursive: true });
  return d;
};
let n = 0;
/** A session the indexer read: `hydor` for one the app started. Returns its key. */
function session(cwd: string | null, o: { agent?: 'claude' | 'codex'; source?: string | null; hidden?: boolean; hydor?: boolean; at?: number } = {}): string {
  const agent = o.agent ?? 'claude';
  const key = `${agent}:t${++n}`;
  const at = o.at ?? 1_000_000 + n;
  db.prepare('insert into sessions (key, agent, id, path, cwd, source, hidden, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    key,
    agent,
    `t${n}`,
    `/x/${key}`,
    cwd,
    o.source === undefined ? 'cli' : o.source,
    o.hidden ? 1 : 0,
    at - 500,
    at,
  );
  if (o.hydor) db.prepare('insert into app_sessions (key, agent, created_by_app, created_at, updated_at) values (?, ?, 1, ?, ?)').run(key, agent, at - 500, at);
  return key;
}
const appRow = (key: string) =>
  db.prepare('select * from app_sessions where key = ?').get(key) as { extra: string | null; created_at: number; updated_at: number; agent: string; created_by_app: number } | undefined;
const spaceOf = (key: string) => sessionExtra(db, key).space;
const names = () => allSpaces(db).map((s) => s.name);
const reset = () => {
  allSpaces(db); // (makes its table)
  db.exec('delete from sessions; delete from app_sessions; delete from spaces');
  db.exec("delete from kv where k in ('spaces.suggest.hidden', 'sidebar.places', 'sidebar.folderNames')");
  fs.rmSync(home, { recursive: true, force: true });
  fs.mkdirSync(home);
  for (const f of fs.readdirSync(codexHome)) fs.rmSync(path.join(codexHome, f), { force: true });
};
/** A Codex state database with these projects (name and roots), as Codex writes it. */
function codexState(projects: { id: string; name: string; roots: string[] }[]) {
  const file = path.join(codexHome, 'state_5.sqlite');
  fs.rmSync(file, { force: true });
  const c = new Database(file);
  c.exec(
    `CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}', position INTEGER NOT NULL, created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL);
     CREATE TABLE project_roots (project_id TEXT NOT NULL, position INTEGER NOT NULL, path TEXT NOT NULL, PRIMARY KEY (project_id, position));`,
  );
  projects.forEach((p, i) => {
    c.prepare('insert into projects (id, name, position, created_at_ms, updated_at_ms) values (?, ?, ?, 1, 1)').run(p.id, p.name, i);
    p.roots.forEach((r, j) => c.prepare('insert into project_roots (project_id, position, path) values (?, ?, ?)').run(p.id, j, r));
  });
  c.close();
}

test('two Claude Code sessions in a folder make a project with them, keeping their own times', () => {
  reset();
  const app = dir('shop');
  const a = session(app, { source: 'claude-vscode', at: 5000 });
  const b = session(app, { source: 'cli', at: 7000 });
  const before = Date.now();
  const found = foundProjects(db, { home });
  assert.equal(FOUND_MIN, 2);
  assert.deepEqual(
    found.map((f) => [f.folder, f.name, f.found, f.lastAt]),
    [[app, 'shop', ['claude'], 7000]],
  );
  const { made, claimed } = syncFoundProjects(db, { home });
  assert.equal(made.length, 1);
  assert.equal(made[0].folder, app);
  assert.deepEqual(made[0].found, ['claude']);
  assert.equal(spaceById(db, made[0].id)!.found?.[0], 'claude', 'the program is kept');
  assert.deepEqual(claimed.sort(), [a, b].sort());
  assert.equal(spaceOf(a), made[0].id);
  assert.equal(spaceOf(b), made[0].id);
  assert.equal(appRow(a)!.updated_at, 5000, 'not stamped with now');
  assert.equal(appRow(a)!.created_at, 4500);
  assert.equal(appRow(b)!.updated_at, 7000);
  assert.equal(appRow(b)!.agent, 'claude');
  assert.ok(appRow(b)!.updated_at < before);
  assert.deepEqual(sessionsIn(db, made[0].id), [b, a]);
  assert.equal(spaceViews(db)[0].sessions, 2);
  assert.equal(spaceViews(db)[0].lastAt, 7000);
});

test('one session is not enough; scripted, hidden and the app’s own sessions do not count', () => {
  reset();
  const one = dir('one');
  session(one);
  assert.deepEqual(foundProjects(db, { home }), []);
  const scripted = dir('scripted');
  session(scripted, { source: 'sdk-cli' });
  session(scripted, { source: 'exec', agent: 'codex' });
  session(scripted, { source: 'subagent' });
  const hidden = dir('hidden-ones');
  session(hidden, { hidden: true });
  session(hidden, { hidden: true });
  const mine = dir('mine');
  session(mine, { hydor: true });
  session(mine, { hydor: true });
  assert.deepEqual(foundProjects(db, { home }), []);
  // one of each kind that counts, and one that does not
  session(one, { source: null });
  assert.deepEqual(
    foundProjects(db, { home }).map((f) => f.folder),
    [one],
    'no source counts',
  );
  session(mine);
  assert.deepEqual(
    foundProjects(db, { home }).map((f) => f.folder),
    [one],
    'the app’s own do not add up with the others',
  );
  session(mine);
  assert.deepEqual(
    foundProjects(db, { home })
      .map((f) => f.folder)
      .sort(),
    [mine, one].sort(),
  );
});

test('sessions in a subfolder of a git repository count for the repository, and join its project', () => {
  reset();
  const repo = dir('app');
  fs.mkdirSync(path.join(repo, '.git'));
  const sub = dir('app', 'packages', 'web');
  const a = session(repo);
  const b = session(sub);
  const found = foundProjects(db, { home });
  assert.deepEqual(
    found.map((f) => f.folder),
    [repo],
  );
  const { made } = syncFoundProjects(db, { home });
  assert.equal(made.length, 1);
  assert.equal(spaceOf(a), made[0].id);
  assert.equal(spaceOf(b), made[0].id, 'the subfolder session is in the repository’s project');
  // the home folder is never a repository even when it is one
  fs.mkdirSync(path.join(home, '.git'));
  const loose = dir('loose');
  session(loose);
  session(loose);
  assert.deepEqual(
    foundProjects(db, { home }).map((f) => f.folder),
    [loose],
  );
});

test('the home folder, hidden folders, app-made folders, "Not a project" and folders a project has are not made projects', () => {
  reset();
  const twice = (d: string) => (session(d), session(d));
  twice(home);
  twice(dir('.config', 'thing'));
  twice(dir('Hydor', 'Projects', 'x'));
  twice(dir('Hydor', 'Tasks', 'y'));
  const noted = dir('noted');
  twice(noted);
  hideSuggestion(db, noted);
  const own = dir('own');
  const other = dir('other');
  createSpace(db, { name: 'Mine', folder: own, folders: [other] });
  twice(own);
  twice(path.join(dir('own', 'inside')));
  twice(other);
  twice(dir('other', 'deep'));
  twice(path.join(tmp, 'outside'));
  fs.mkdirSync(path.join(tmp, 'outside'));
  twice(path.join(home, 'gone'));
  assert.deepEqual(foundProjects(db, { home }), []);
  // the same is found once it is none of those
  twice(dir('fine'));
  assert.deepEqual(
    foundProjects(db, { home }).map((f) => f.name),
    ['fine'],
  );
});

test('a Codex project with a session becomes a project by its name with its other folders; one with none does not', () => {
  reset();
  const main = dir('papers');
  const second = dir('data', 'refs');
  const missing = path.join(home, 'nowhere');
  const chat = dir('.codex', '.chatgpt-projects', 'g-p-123');
  const idle = dir('idle');
  codexState([
    { id: 'p1', name: 'Thesis', roots: [main + '/', second, missing] },
    { id: 'p2', name: 'Trip planning', roots: [chat] },
    { id: 'p3', name: 'Idle', roots: [idle] },
    { id: 'p4', name: 'Elsewhere', roots: [dir('gone-away')] },
  ]);
  fs.rmSync(path.join(home, 'gone-away'), { recursive: true });
  const k1 = session(path.join(second, 'sub'), { agent: 'codex', source: 'vscode' });
  const k2 = session(chat, { agent: 'codex', source: 'exec' });
  const found = foundProjects(db, { home });
  assert.deepEqual(found.map((f) => f.name).sort(), ['Thesis', 'Trip planning']);
  const thesis = found.find((f) => f.name === 'Thesis')!;
  assert.equal(thesis.folder, main);
  assert.deepEqual(thesis.folders, [second]);
  assert.ok(thesis.found.includes('codex'));
  const trip = found.find((f) => f.name === 'Trip planning')!;
  assert.equal(trip.folder, chat, 'the Codex app’s own folder is not left out as hidden');
  const { made } = syncFoundProjects(db, { home });
  assert.equal(made.length, 2);
  const t = made.find((s) => s.name === 'Thesis')!;
  assert.deepEqual(t.folders, [second]);
  assert.deepEqual(t.found, ['codex']);
  // a session in its other folder is not in the project (only its own folder is claimed by folder)
  assert.equal(spaceOf(k1), undefined);
  assert.equal(spaceOf(k2), made.find((s) => s.name === 'Trip planning')!.id);
  // with Claude Code sessions in its folder too, both are said, the one with more first
  session(main, { agent: 'claude' });
  session(main, { agent: 'claude' });
  deleteSpace(db, t.id);
  db.exec("delete from kv where k = 'spaces.suggest.hidden'");
  const again = foundProjects(db, { home }).find((f) => f.folder === main)!;
  assert.deepEqual(again.found, ['claude', 'codex']);
  assert.equal(again.name, 'Thesis', 'Codex’s name wins');
});

test('a Codex project and a folder found by two sessions are one project', () => {
  reset();
  const main = dir('merge');
  codexState([{ id: 'p', name: 'Merged', roots: [main, dir('extra')] }]);
  session(main, { agent: 'codex' });
  session(main, { agent: 'codex' });
  session(main, { agent: 'claude' });
  const found = foundProjects(db, { home });
  assert.equal(found.length, 1);
  assert.equal(found[0].name, 'Merged');
  assert.deepEqual(found[0].found, ['codex', 'claude']);
  assert.deepEqual(found[0].folders, [path.join(home, 'extra')]);
});

test('a name that is taken gets its parent folder, then a number', () => {
  reset();
  const twice = (d: string) => (session(d), session(d));
  createSpace(db, { name: 'App', folder: dir('own') });
  twice(dir('a', 'app'));
  twice(dir('b', 'app'));
  twice(dir('b', 'x', 'app'));
  twice(dir('c', 'util'));
  twice(dir('d', 'util'));
  const found = foundProjects(db, { home });
  assert.deepEqual(found.map((f) => f.name).sort(), ['a/app', 'b/app', 'x/app', 'c/util', 'util'].sort(), 'in each pass a name is taken once');
  assert.equal(new Set(found.map((f) => f.name.toLowerCase())).size, found.length);
  // clashing even after the parent: a number
  createSpace(db, { name: 'a/app', folder: dir('own2') });
  createSpace(db, { name: 'A/app 2', folder: dir('own3') });
  const apps = foundProjects(db, { home }).filter((f) => f.name.toLowerCase().includes('app') && f.folder.endsWith(path.join('a', 'app')));
  assert.equal(apps[0].name, 'a/app 3');
  // a name the user gave the folder in the sidebar comes first
  setFolderName(db, dir('c', 'util'), 'Utilities');
  assert.ok(foundProjects(db, { home }).some((f) => f.name === 'Utilities'));
});

test('a folder’s place in the sidebar goes to its project', () => {
  reset();
  const x = dir('x');
  const y = dir('y');
  const z = dir('z');
  for (const d of [x, y, z]) (session(d), session(d));
  setSidebarPlaces(db, [`dir:${y}`, `dir:/elsewhere`, `dir:${x}`]);
  const { made } = syncFoundProjects(db, { home });
  const id = (d: string) => made.find((s) => s.folder === d)!.id;
  assert.deepEqual(sidebarPlaces(db), [`space:${id(y)}`, 'dir:/elsewhere', `space:${id(x)}`]);
});

test('claiming sessions: the app’s own, the innermost project, the home folder, others’ and gone projects, worktrees', () => {
  reset();
  const outer = dir('work');
  const inner = dir('work', 'client');
  const deep = dir('work', 'client', 'api');
  const sp1 = createSpace(db, { name: 'Work', folder: outer });
  const sp2 = createSpace(db, { name: 'Client', folder: inner });
  const homeSp = createSpace(db, { name: 'Home', folder: home });
  // a Hydor session with no transcript yet, and one with
  db.prepare('insert into app_sessions (key, agent, cwd, created_by_app, created_at, updated_at) values (?, ?, ?, 1, 10, 20)').run('claude:new', 'claude', deep);
  const read = session(outer, { hydor: true, at: 300 });
  const nested = session(deep, { at: 400 });
  const loose = session(dir('elsewhere'));
  const atHome = session(home);
  const underHome = session(dir('some', 'folder'));
  const other = session(deep, { at: 500 });
  const away = session(deep, { at: 600 });
  const hiddenOne = session(deep, { hidden: true });
  db.prepare('insert into app_sessions (key, agent, extra, created_at, updated_at) values (?, ?, ?, 1, 2)').run(other, 'claude', JSON.stringify({ space: sp1.id, memory: false }));
  db.prepare('insert into app_sessions (key, agent, extra, created_at, updated_at) values (?, ?, ?, 1, 2)').run(away, 'claude', JSON.stringify({ space: 'spgone', memory: false }));
  const keys = claimSessions(db, { home });
  assert.deepEqual(keys.sort(), ['claude:new', read, nested, atHome, away].sort());
  assert.equal(spaceOf('claude:new'), sp2.id, 'a session with no transcript yet, in the innermost project');
  assert.equal(appRow('claude:new')!.updated_at, 20);
  assert.equal(spaceOf(read), sp1.id);
  assert.equal(spaceOf(nested), sp2.id);
  assert.equal(spaceOf(loose), undefined);
  assert.equal(spaceOf(atHome), homeSp.id);
  assert.equal(spaceOf(underHome), undefined, 'a project in the home folder has only that folder');
  assert.equal(spaceOf(other), sp1.id, 'a session in another project stays');
  assert.equal(sessionExtra(db, other).memory, false);
  assert.equal(spaceOf(away), sp2.id, 'one naming a deleted project joins the project that has its folder now');
  assert.equal(sessionExtra(db, away).memory, false, 'its other settings stay');
  assert.equal(appRow(away)!.updated_at, 2, 'a row keeps its time');
  assert.equal(appRow(read)!.created_by_app, 1);
  assert.equal(spaceOf(hiddenOne), undefined);
  assert.deepEqual(claimSessions(db, { home }), [], 'nothing left to claim');
  // only the keys asked for
  const later = session(deep);
  const lateToo = session(deep);
  assert.deepEqual(claimSessions(db, { home, keys: [later] }), [later]);
  assert.equal(spaceOf(lateToo), undefined);
  // a session in a worktree counts for its main checkout
  const wtKey = session(path.join(tmp, 'worktrees', 'abc'), { hydor: true });
  db.prepare('update app_sessions set worktree = ? where key = ?').run(JSON.stringify({ path: path.join(tmp, 'worktrees', 'abc'), branch: 'b', base: 'main', repo: inner }), wtKey);
  const plain = session(path.join(tmp, 'worktrees', 'def'), { hydor: true });
  db.prepare('update app_sessions set worktree = ? where key = ?').run('not json', plain);
  assert.deepEqual(claimSessions(db, { home, keys: [wtKey, plain] }), [wtKey]);
  assert.equal(spaceOf(wtKey), sp2.id);
  assert.equal(JSON.parse(appRow(wtKey)!.extra!).space, sp2.id);
});

test('projectOfFolder: the innermost project wins, a root or home project has only its own folder, siblings do not match', () => {
  const sp = (id: string, folder: string) => ({ id, name: id, color: 'blue', folder, createdAt: 0 });
  const list = [sp('a', '/h/code'), sp('b', '/h/code/app'), sp('c', '/h'), sp('d', '/')];
  assert.equal(projectOfFolder(list, '/h/code/app/src', '/h')?.id, 'b');
  assert.equal(projectOfFolder(list, '/h/code/appx', '/h')?.id, 'a');
  assert.equal(projectOfFolder(list, '/h/code', '/h')?.id, 'a');
  assert.equal(projectOfFolder(list, '/h', '/h')?.id, 'c');
  assert.equal(projectOfFolder(list, '/h/other', '/h'), undefined);
  assert.equal(projectOfFolder(list, '/', '/h')?.id, 'd');
  assert.equal(projectOfFolder(list, '/srv', '/h'), undefined);
  assert.equal(projectOfFolder([], '/h', '/h'), undefined);
});

test('a deleted found project is not made again, and a second sync in a row makes nothing', () => {
  reset();
  const d = dir('gone-soon');
  session(d);
  session(d);
  const first = syncFoundProjects(db, { home });
  assert.equal(first.made.length, 1);
  assert.deepEqual(syncFoundProjects(db, { home }), { made: [], claimed: [] });
  deleteSpace(db, first.made[0].id);
  assert.deepEqual(names(), []);
  assert.deepEqual(syncFoundProjects(db, { home }), { made: [], claimed: [] });
  assert.deepEqual(foundProjects(db, { home }), []);
});

test('a PATCH keeps what the app found; the HTTP body cannot say it', () => {
  reset();
  const d = dir('kept');
  session(d);
  session(d);
  const { made } = syncFoundProjects(db, { home });
  assert.deepEqual(updateSpace(db, made[0].id, { description: 'x' }).found, ['claude']);
  assert.equal(createSpace(db, { name: 'Mine', folder: dir('mine'), found: ['codex'] }).found, undefined);
  assert.deepEqual(createSpace(db, { name: 'Theirs', folder: dir('theirs') }, { found: ['codex'] }).found, ['codex']);
});

test('a project made by hand for a found project’s folder takes it over; a folder of a project of yours can have another', () => {
  reset();
  const d = dir('shop-api');
  const a = session(d);
  session(d);
  const { made } = syncFoundProjects(db, { home });
  const mine = createSpace(db, { name: 'Shop website', folder: `${d}/`, description: 'The online shop', color: 'pink' });
  assert.equal(mine.id, made[0].id, 'the same project');
  assert.equal(mine.name, 'Shop website');
  assert.equal(mine.description, 'The online shop');
  assert.equal(mine.color, 'pink');
  assert.equal(mine.found, undefined, 'it is yours now');
  assert.equal(spaceById(db, mine.id)!.found, undefined);
  assert.deepEqual(names(), ['Shop website']);
  assert.equal(spaceOf(a), mine.id, 'its sessions stay in it');
  assert.deepEqual(syncFoundProjects(db, { home }).made, [], 'the folder is taken: nothing is found there');
  // As before, a second project of yours in the same folder is made (the first keeps the folder's sessions).
  const again = createSpace(db, { name: 'Again', folder: d });
  assert.notEqual(again.id, mine.id);
  assert.deepEqual(names(), ['Shop website', 'Again']);
  assert.equal(projectOfFolder(allSpaces(db), d, home)!.id, mine.id);
});

test('a project’s last activity follows its sessions’ own', () => {
  reset();
  const d = dir('active');
  const sp = createSpace(db, { name: 'Active', folder: d });
  const a = session(d, { at: 1000 });
  const b = session(d, { at: 2000 });
  claimSessions(db, { home });
  assert.equal(spaceViews(db)[0].lastAt, 2000);
  db.prepare('update sessions set updated_at = 9000 where key = ?').run(a);
  assert.equal(spaceViews(db)[0].lastAt, 9000);
  assert.deepEqual(sessionsIn(db, sp.id), [a, b]);
  // a session the app keeps later than its transcript counts too
  db.prepare('update app_sessions set updated_at = 12000 where key = ?').run(b);
  assert.equal(spaceViews(db)[0].lastAt, 12000);
  assert.deepEqual(sessionsIn(db, sp.id), [b, a]);
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
fs.rmSync(path.join(config.dataDir, 'spaces'), { recursive: true, force: true });
