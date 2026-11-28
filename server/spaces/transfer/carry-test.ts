// Script tests for sending a project: what it carries (details, folder with its Git history, other folders, skills, memory
// notes, agents, knowledge bases, kept pages and pictures, wiki), the plan, and making a project of the bundle on arrival
// (notes re-keyed, the agent mapped, kept things attached to their arrived files so kept-files writes nothing twice, "came"),
// with a broken stream leaving nothing behind, a non-empty folder and a group refused, and leaving after a move. Build and run
// with a scratch folder:
//   OUTDIR=dist/dev-engine node scripts/build-server.mjs server/spaces/transfer/carry-test.ts
//   HOME=/tmp/eng-home DATA_DIR=/tmp/eng-data node dist/dev-engine/carry-test.js
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import zlib from 'node:zlib';
import { allAssistants, findAssistant, saveAssistant, setSettings } from '../../assistants/store.ts';
import { APP_ROOT, config } from '../../config.ts';
import { openDb } from '../../db.ts';
import type { Deps } from '../../features/types.ts';
import { listTrash } from '../../files.ts';
import { addSource, baseRows, createBase, filesDir, sourcesOf } from '../../knowledge/store.ts';
import { addMedia, initMedia, listMedia } from '../../media/store.ts';
import { addEntry, entries, history as memoryHistory } from '../../memory/store.ts';
import { createPage, initPages, pageInfo } from '../../pages/store.ts';
import { history } from '../../skillpack/history.ts';
import { librarySkills, setFolders } from '../../skillpack/library.ts';
import { saveSpaceSkill, setSpaceSwitch, skillsOf, spaceSwitches } from '../../skillpack/spaceSkills.ts';
import { wikiRoot } from '../../wiki/roots.ts';
import { startKeptFiles } from '../kept-files.ts';
import { allSpaces, createSpace, spaceById, updateSpace } from '../index.ts';
import { arrivalPlace, arrive, leave } from './arrive.ts';
import { carryBundle, carryPlan, memoryKeyOf, type BundleManifest } from './carry.ts';
import { bundleStream, readBundle } from './stream.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/') || !process.env.HOME?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… and HOME=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
fs.rmSync(process.env.HOME, { recursive: true, force: true });
fs.mkdirSync(process.env.HOME, { recursive: true });

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-carry-test-')));
const db = openDb(path.join(tmp, 'test.db'));
setFolders({ bundled: path.join(APP_ROOT, 'skills'), learned: path.join(tmp, 'learned'), view: path.join(tmp, 'view', 'naget') });
setSettings(db, { taskRoot: path.join(tmp, 'Naget') });
initPages(db);
initMedia(db);
const told: { id: string; data: any }[] = [];
const d = { db, broadcast: (e: any) => told.push(e), sessions: { queueSummary() {}, deliverOrQueue: async () => {}, on() {} } } as unknown as Deps;
const engine = startKeptFiles(d, { debounceMs: 20, sweepMs: 0, settleMs: 0, backfillMs: 0, backfillGapMs: 0 });

let passed = 0;
const tests: [string, () => Promise<void>][] = [];
const test = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);
const sha = (b: Buffer | string) => crypto.createHash('sha256').update(b).digest('hex');
const collect = async (s: Readable) => {
  const parts: Buffer[] = [];
  for await (const c of s) parts.push(c as Buffer);
  return Buffer.concat(parts);
};
const put = (root: string, rel: string, text: string | Buffer = 'x') => {
  const f = path.join(root, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
  return f;
};
/** Every file of a folder: path → hash, with .git left to its own test. */
const tree = (root: string, skipGit = true): Record<string, string> => {
  const out: Record<string, string> = {};
  const go = (dir: string, rel: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (skipGit && e.name === '.git') continue;
      if (e.isSymbolicLink()) out[r] = `-> ${fs.readlinkSync(p)}`;
      else if (e.isDirectory()) go(p, r);
      else out[r] = sha(fs.readFileSync(p));
    }
  };
  go(root, '');
  return out;
};
const leftovers = (dir: string) => fs.readdirSync(dir).filter((n) => n.startsWith('.hydor-'));

// ---- the project to send ----------------------------------------------------------------------------------------------
const root = path.join(tmp, 'laptop');
const folder = path.join(root, 'thesis');
fs.mkdirSync(folder, { recursive: true });
const papers = path.join(process.env.HOME, `papers-${crypto.randomBytes(3).toString('hex')}`);
put(papers, 'a.pdf.txt', 'a paper');
put(papers, 'sub/b.txt', 'another');
const outsideDocs = path.join(tmp, 'elsewhere-docs');
put(outsideDocs, 'x.md', 'outside the project');

const big = crypto.randomBytes(3 * 1024 * 1024 + 7);
put(folder, 'README.md', '# Thesis\n');
put(folder, 'chapters/one.tex', '\\chapter{One}');
put(folder, 'data/big.bin', big);
put(folder, 'empty-dir/.keep', '');
fs.rmSync(path.join(folder, 'empty-dir', '.keep'));
put(folder, 'docs/guide.md', 'a documented thing the knowledge base reads');
put(folder, 'run.sh', '#!/bin/sh\necho hi\n');
fs.chmodSync(path.join(folder, 'run.sh'), 0o755);
fs.symlinkSync('README.md', path.join(folder, 'readme-link'));
put(folder, 'node_modules/x/index.js', 'x'.repeat(1000));
const when = new Date('2024-05-06T07:08:09Z');
fs.utimesSync(path.join(folder, 'README.md'), when, when);
const git = (...a: string[]) => execFileSync('git', a, { cwd: folder, stdio: 'ignore', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
git('init', '-q');
put(folder, '.gitignore', 'node_modules/\n');
git('add', '.');
git('commit', '-q', '-m', 'first');

const space = createSpace(db, { name: 'Thesis', folder, color: 'violet', description: 'My PhD', instructions: 'Write in British English.', folders: [papers], wikiDocumentLimit: 50, memoryShared: false });
const id = space.id;
const key = memoryKeyOf(folder);
assert.equal(key, folder, 'a Git root keys its notes');

// Skill, with a switch and history.
saveSpaceSkill(db, id, { name: 'citation-style', description: 'Use when citing papers in this thesis.', body: '# Citation style\n\n1. Cite every paper in APA 7th edition.\n2. Put the reference list at the end of each chapter.\n3. Check each citation against the bibliography file before sending a draft.' });
setSpaceSwitch(db, id, { name: 'citation-style', on: false });
setSpaceSwitch(db, id, { name: 'some-claude-skill', agent: 'claude', on: false });
put(path.join(process.env.DATA_DIR, 'spaces', id, 'skills', 'citation-style'), 'refs/apa.md', 'extra reference file');

// Notes: two notes, a finding and a topic.
const by = { source: 'user' as const, at: 1_700_000_000_000 };
addEntry(db, { scope: 'repo', scopeKey: key, text: 'Chapter two is about retrieval.', kind: 'note', title: 'Ch2' }, by);
addEntry(db, { scope: 'repo', scopeKey: key, text: 'The advisor wants figures in grayscale.', kind: 'note', basis: 'told' as any }, { source: 'agent', at: 1_700_000_100_000 });
addEntry(db, { scope: 'repo', scopeKey: key, text: '', kind: 'finding', finding: { verdict: 'supported', statement: 'Reranking helps', learned: 'By 3 points', evidence: [{ kind: 'file', ref: 'data/big.bin' }], replaces: 12 } }, by);
addEntry(db, { scope: 'repo', scopeKey: key, text: 'A summary topic.', kind: 'topic' }, by);
// What is not the project's: another place's note.
addEntry(db, { scope: 'repo', scopeKey: path.join(tmp, 'else'), text: 'Not this project.', kind: 'note' }, by);

// An agent of its own, which is the project's assistant, and one for another project (it stays).
const reviewer = saveAssistant(db, { name: 'Reviewer', instructions: 'Review chapters kindly.', projects: [id], canAsk: ['general'] });
const otherAgent = saveAssistant(db, { name: 'Elsewhere', instructions: 'Not ours.', projects: ['spother'] });
updateSpace(db, id, { assistant: reviewer.id });

// Knowledge: files dropped, a folder inside the project, a folder outside it.
const base = createBase(db, { name: 'Papers', description: 'What I read', space: id });
put(filesDir(base.id), 'dropped.txt', 'Dropped words about retrieval.');
put(filesDir(base.id), 'nested/two.txt', 'More.');
addSource(db, base.id, 'folder', path.join(folder, 'docs'), 'Docs');
addSource(db, base.id, 'folder', outsideDocs, 'Elsewhere');

// Wiki memory, with an article.
updateSpace(db, id, { wikiMemory: true });
const wiki = wikiRoot(db, id, { create: true })!;
put(wiki, 'wiki/overview.md', '# Overview\nThe thesis wiki.');

// Kept things: a doc and an HTML page and a picture, each with the file kept-files wrote in the project's folder.
const doc = createPage(db, { title: 'Report', kind: 'doc', model: { blocks: [{ type: 'p', text: 'First words of the report.' }] }, by: 'made', space: id });
const html = createPage(db, { title: 'Notes page', html: '<h1>Hello</h1><p>kept</p>', by: 'made', space: id, description: 'A page of notes' });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const pic = path.join(tmp, 'logo.png');
fs.writeFileSync(pic, png);
const logo = await addMedia(db, { kind: 'image', from: pic, ext: 'png', mime: 'image/png', bytes: png.length, title: 'Logo', sha: sha(png), width: 1, height: 1, space: id });
await engine.idle();
const kept = { doc: pageInfo(db, doc.id)!, html: pageInfo(db, html.id)! };
assert.ok(kept.doc.projectFile && fs.existsSync(kept.doc.projectFile), 'kept-files wrote the doc');
assert.ok(kept.html.projectFile && fs.existsSync(kept.html.projectFile), 'kept-files wrote the page');
const logoFile = (db.prepare('select project_file from media where id = ?').get(logo.id) as { project_file: string }).project_file;
assert.ok(logoFile && fs.existsSync(logoFile), 'kept-files copied the picture');

git('add', '.');
git('commit', '-q', '-m', 'kept things');

// ---- the plan ---------------------------------------------------------------------------------------------------------
test('the plan says what would go, what stays behind, and how big', async () => {
  const p = await carryPlan(db, id);
  assert.equal(p.project.name, 'Thesis');
  assert.equal(p.git, true);
  assert.ok(p.files.count >= 8 && p.files.bytes > big.length);
  assert.deepEqual(p.leftOut.map((l) => [l.path, l.why]), [['node_modules', 'rebuilt']]);
  assert.equal(p.leftOutTotal.files, 1);
  assert.equal(p.skills, 1);
  assert.equal(p.notes, 4);
  assert.equal(p.agents, 1);
  assert.equal(p.kept, 3);
  assert.equal(p.wiki?.files, 1);
  assert.equal(p.documents.count, 2, 'the two dropped files (a folder’s documents count once it is read)');
  assert.deepEqual(p.documents.leftOut, [outsideDocs]);
  assert.deepEqual(p.also.map((a) => [a.path, a.files, a.home]), [[papers, 2, true]]);
  const without = p.total.files;
  const withAlso = await carryPlan(db, id, { also: true });
  assert.equal(withAlso.total.files, without + 2, 'other folders count only when asked');
  const all = await carryPlan(db, id, { leaveOut: false });
  assert.equal(all.leftOut.length, 0);
  assert.equal(all.files.count, p.files.count + 1);
});

test('a group is refused, with the way out', async () => {
  const g = createSpace(db, { name: 'Group', members: [id] });
  await assert.rejects(carryPlan(db, g.id), /A group can’t be sent: send its projects one by one/);
  await assert.rejects(carryBundle(db, g.id), /A group can’t be sent/);
  await assert.rejects(carryPlan(db, 'spnothere'), /No such project/);
  fs.rmSync(path.join(tmp, 'gone-folder'), { recursive: true, force: true });
});

let arrived: Awaited<ReturnType<typeof arrive>>;
const dest = path.join(tmp, 'gpu-box', 'thesis');
const alsoDest = path.join(process.env.HOME, `papers-moved-${crypto.randomBytes(3).toString('hex')}`);

test('the bundle carries the manifest and every part, and what is left out stays out', async () => {
  const stream = await carryBundle(db, id, { also: true });
  const seen: { area: string; path: string }[] = [];
  let manifest: BundleManifest | null = null;
  await readBundle(stream, {
    manifest: (m) => void (manifest = m as BundleManifest),
    dir: (r) => void seen.push(r),
    link: (r) => void seen.push(r),
    async file(r, body) {
      seen.push(r);
      for await (const _ of body);
    },
  });
  const m = manifest!;
  assert.equal(m.v, 1);
  assert.equal(m.project.name, 'Thesis');
  assert.equal(m.project.folder, folder);
  assert.equal(m.project.memoryShared, false);
  assert.equal(m.project.wikiDocumentLimit, 50);
  assert.equal((m.project as any).members, undefined);
  assert.ok(!('id' in m.project && (m.project as any).sync), 'no sync mark');
  assert.deepEqual(m.skills, ['citation-style']);
  assert.deepEqual(m.switches, { 'citation-style': false, 'claude:some-claude-skill': false });
  assert.equal(m.notes.length, 4);
  assert.equal((m.notes.find((n) => n.kind === 'finding')!.finding as any).replaces, undefined, 'a finding loses its references');
  assert.equal(m.agents.length, 1);
  assert.equal(m.agents[0].from, reviewer.id);
  assert.equal((m.agents[0].def as any).projects, undefined);
  assert.equal(m.also.length, 1);
  assert.equal(m.also[0].rel, path.relative(process.env.HOME!, papers));
  assert.equal(m.knowledge[0].files, true);
  assert.deepEqual(m.knowledge[0].folders, [{ rel: 'docs', name: 'Docs' }]);
  assert.deepEqual(m.knowledge[0].outside, [outsideDocs]);
  assert.equal(m.kept.pages.length, 2);
  assert.equal(m.kept.media.length, 1);
  assert.ok(m.kept.pages.every((p) => p.file), 'their files in the folder are named');
  assert.deepEqual(m.wiki, {});
  const areas = new Set(seen.map((s) => s.area));
  for (const a of ['folder', 'skills', 'wiki', 'media', `knowledge/${base.id}`, 'also/0']) assert.ok(areas.has(a), a);
  assert.ok(seen.some((s) => s.area === 'folder' && s.path === '.git/HEAD'), 'the Git history goes');
  assert.ok(!seen.some((s) => s.path.startsWith('node_modules')), 'rebuilt folders stay');
  assert.ok(!seen.some((s) => s.area === 'folder' && s.path.startsWith('wiki')), 'the wiki is its own area');
  assert.ok(seen.some((s) => s.area === 'folder' && s.path === 'empty-dir'), 'empty folders go');
});

test('arriving makes a project with all of it', async () => {
  const progress: { files: number; bytes: number }[] = [];
  const spacesBefore = allSpaces(db).length;
  arrived = await arrive(d, await carryBundle(db, id, { also: true }), { folder: dest, how: 'copy', from: 'laptop', also: [alsoDest], onProgress: (p) => progress.push({ ...p }) });
  const s = spaceById(db, arrived.project.id)!;
  assert.equal(allSpaces(db).length, spacesBefore + 1);
  assert.notEqual(s.id, id);
  assert.equal(s.name, 'Thesis');
  assert.equal(s.folder, dest);
  assert.equal(s.color, 'violet');
  assert.equal(s.description, 'My PhD');
  assert.equal(s.instructions, 'Write in British English.');
  assert.equal(s.memoryShared, false);
  assert.equal(s.wikiDocumentLimit, 50);
  assert.equal(s.wikiMemory, true);
  assert.deepEqual(s.folders, [alsoDest]);
  assert.equal(s.sync, undefined);
  assert.equal(s.members, undefined);
  assert.equal(s.found, undefined);
  assert.ok(progress.length && progress[progress.length - 1].files === arrived.files, 'progress ends with everything');
  assert.deepEqual(leftovers(path.dirname(dest)), [], 'no staged folder is left');
  assert.deepEqual(leftovers(process.env.DATA_DIR!), []);
  assert.deepEqual(arrived.leftOut.filter((x) => !/read this folder/.test(x)), []);
  assert.equal(arrived.leftOut.length, 1, 'the documents folder outside the project is said');
  assert.match(arrived.leftOut[0], /elsewhere-docs/);
});

test('the folder arrives as it was: files, times, modes, links, empty folders, Git history', async () => {
  const src = Object.fromEntries(Object.entries(tree(folder)).filter(([k]) => !k.startsWith('node_modules/')));
  assert.deepEqual(tree(dest), src);
  assert.ok(!fs.existsSync(path.join(dest, 'node_modules')));
  assert.ok(fs.statSync(path.join(dest, 'empty-dir')).isDirectory());
  assert.equal(fs.statSync(path.join(dest, 'README.md')).mtimeMs, when.getTime());
  assert.equal(fs.statSync(path.join(dest, 'run.sh')).mode & 0o777, 0o755);
  assert.equal(fs.readlinkSync(path.join(dest, 'readme-link')), 'README.md');
  assert.ok(fs.readFileSync(path.join(dest, 'data/big.bin')).equals(big));
  assert.equal(execFileSync('git', ['log', '--format=%s'], { cwd: dest, encoding: 'utf8' }).trim(), 'kept things\nfirst');
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: dest, encoding: 'utf8' }).trim(), '', 'a clean repository');
});

test('other folders go to the place given; the files arrived whole', async () => {
  assert.deepEqual(tree(alsoDest), tree(papers));
});

test('skills arrive with their files, history and switches', async () => {
  const s = arrived.project.id;
  assert.deepEqual(skillsOf(s).map((k) => k.name), ['citation-style']);
  assert.equal(fs.readFileSync(path.join(process.env.DATA_DIR!, 'spaces', s, 'skills', 'citation-style', 'refs', 'apa.md'), 'utf8'), 'extra reference file');
  assert.ok(history(db, 'citation-style', s).length >= 1);
  assert.deepEqual(spaceSwitches(db, s), { 'citation-style': false, 'claude:some-claude-skill': false });
  assert.equal(arrived.skills, 1);
});

test('memory notes are re-keyed to the new folder, with their times and kinds', async () => {
  const there = entries(db, { scope: 'repo', scopeKey: memoryKeyOf(dest), status: 'active' }).sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
  assert.equal(memoryKeyOf(dest), dest);
  assert.deepEqual(there.map((e) => e.kind), ['note', 'finding', 'topic', 'note']);
  assert.equal(there[0].text, 'Chapter two is about retrieval.');
  assert.equal(there[0].title, 'Ch2');
  assert.equal(there[0].createdAt, 1_700_000_000_000);
  assert.equal(there[3].source, 'agent');
  assert.equal(there[1].finding?.statement, 'Reranking helps');
  assert.equal(there[1].finding?.replaces, undefined);
  assert.equal(entries(db, { scope: 'repo', scopeKey: key, status: 'active' }).length, 4, 'the original keeps its own');
  assert.equal(arrived.notes, 4);
});

test('the agent of its own is made again for the new project, and the project’s assistant follows it', async () => {
  const s = spaceById(db, arrived.project.id)!;
  const mine = allAssistants(db).filter((a) => a.projects?.includes(arrived.project.id));
  assert.equal(mine.length, 1);
  assert.equal(mine[0].name, 'Reviewer');
  assert.deepEqual(mine[0].projects, [arrived.project.id]);
  assert.notEqual(mine[0].id, reviewer.id);
  assert.equal(s.assistant, mine[0].id);
  assert.deepEqual(mine[0].canAsk, ['general'], 'a built-in it could ask stays');
  assert.deepEqual(findAssistant(db, reviewer.id)!.projects, [id], 'the first one is as it was');
  assert.deepEqual(findAssistant(db, otherAgent.id)!.projects, ['spother']);
  assert.equal(arrived.agents, 1);
});

test('the knowledge base arrives with its files and its folder pointed at the new folder', async () => {
  const bases = baseRows(db).filter((b) => b.space === arrived.project.id);
  assert.equal(bases.length, 1);
  assert.equal(bases[0].name, 'Papers');
  assert.equal(bases[0].description, 'What I read');
  assert.equal(fs.readFileSync(path.join(filesDir(bases[0].id), 'dropped.txt'), 'utf8'), 'Dropped words about retrieval.');
  assert.equal(fs.readFileSync(path.join(filesDir(bases[0].id), 'nested/two.txt'), 'utf8'), 'More.');
  const src = sourcesOf(db, bases[0].id);
  assert.deepEqual(src.map((x) => [x.kind, x.path]).sort(), [['files', filesDir(bases[0].id)], ['folder', path.join(dest, 'docs')]]);
  assert.equal(baseRows(db).filter((b) => b.space === id).length, 1, 'the first is as it was');
  assert.equal(arrived.documents, 2);
});

test('the wiki arrives in the new project’s wiki folder', async () => {
  const root = wikiRoot(db, arrived.project.id)!;
  assert.notEqual(root, wiki);
  assert.equal(fs.readFileSync(path.join(root, 'wiki/overview.md'), 'utf8'), '# Overview\nThe thesis wiki.');
  assert.equal(arrived.wiki, true);
});

test('kept things are attached to their arrived files, so kept-files writes nothing twice', async () => {
  const s = arrived.project.id;
  assert.equal(arrived.kept, 3);
  const pages = db.prepare('select * from pages where space = ? order by title').all(s) as any[];
  assert.deepEqual(pages.map((p) => p.title), ['Notes page', 'Report']);
  for (const p of pages) {
    assert.ok(p.project_file.startsWith(dest + path.sep), p.project_file);
    assert.ok(fs.existsSync(p.project_file));
    assert.ok(p.project_file_sig && p.project_file_sha && p.project_file_version === p.version, 'recorded as in step');
  }
  assert.equal(pages[0].description, 'A page of notes');
  assert.equal(pages[0].kind, null);
  assert.equal(pages[1].kind, 'doc');
  const media = db.prepare('select * from media where space = ?').all(s) as any[];
  assert.equal(media.length, 1);
  assert.equal(media[0].title, 'Logo');
  assert.ok(fs.readFileSync(media[0].file ? path.join(config.dataDir, 'media', media[0].file) : '').equals(png));
  assert.ok(media[0].project_file.startsWith(dest + path.sep) && media[0].project_file_sha === sha(png));
  // The engine looks at them and has nothing to do: no second copy, no rewritten file.
  const before = tree(dest);
  const mtimes = pages.map((p) => fs.statSync(p.project_file).mtimeMs);
  for (const p of pages) engine.changed('page', p.id);
  engine.changed('media', media[0].id);
  await new Promise((r) => setTimeout(r, 120));
  await engine.idle();
  await engine.sweep();
  await engine.idle();
  assert.deepEqual(tree(dest), before, 'no file added or changed');
  assert.deepEqual(pages.map((p) => fs.statSync(p.project_file).mtimeMs), mtimes);
  // And its versions: one, the current text.
  assert.equal((db.prepare('select count(*) as n from page_versions where page_id = ?').get(pages[0].id) as any).n, 1);
});

test('it came from another machine', async () => {
  const s = spaceById(db, arrived.project.id)!;
  assert.equal(s.came?.from, 'laptop');
  assert.equal(s.came?.how, 'copy');
  assert.ok(Math.abs(s.came!.at - Date.now()) < 60_000);
  assert.equal(spaceById(db, id)!.came, undefined);
  assert.ok(told.some((e) => e.id === 'spaces'), 'the projects change is told');
  assert.ok(told.some((e) => e.id === 'pages'));
});

test('leaving out what can be made again is a choice', async () => {
  const d2 = path.join(tmp, 'again');
  const r = await arrive(d, await carryBundle(db, id, { leaveOut: false }), { folder: d2, how: 'copy', from: 'laptop' });
  assert.ok(fs.existsSync(path.join(d2, 'node_modules/x/index.js')));
  assert.deepEqual(r.leftOut.length, 1);
  // The notes are the same ones, found again under their new place without doubling anything.
  assert.equal(entries(db, { scope: 'repo', scopeKey: d2, status: 'active' }).length, 4);
});

// ---- failures leave nothing -----------------------------------------------------------------------------------------------
const counts = () => ({
  spaces: allSpaces(db).length,
  bases: baseRows(db).length,
  assistants: allAssistants(db).length,
  notes: (db.prepare('select count(*) as n from memory_entries').get() as any).n,
  pages: (db.prepare('select count(*) as n from pages').get() as any).n,
  media: listMedia(db).length,
  folders: (db.prepare('select count(*) as n from library_folders').get() as any).n,
  skillDirs: fs.readdirSync(path.join(process.env.DATA_DIR!, 'spaces')).length,
  kbDirs: fs.existsSync(path.join(process.env.DATA_DIR!, 'knowledge')) ? fs.readdirSync(path.join(process.env.DATA_DIR!, 'knowledge')).length : 0,
  history: (db.prepare('select count(*) as n from skillpack_history').get() as any).n,
});

async function nothingLeft(fn: () => Promise<unknown>, where: string, expect: RegExp | undefined = undefined) {
  const before = counts();
  const parent = path.dirname(where);
  const parentBefore = fs.existsSync(parent) ? fs.readdirSync(parent).sort() : null;
  const dataBefore = fs.readdirSync(process.env.DATA_DIR!).sort();
  if (expect) await assert.rejects(fn, expect);
  else await assert.rejects(fn);
  assert.deepEqual(counts(), before, 'the data is as it was');
  assert.equal(fs.existsSync(where) && !!fs.readdirSync(where).length, false, 'nothing at the place');
  assert.deepEqual(fs.existsSync(parent) ? fs.readdirSync(parent).sort() : null, parentBefore, 'nothing beside it');
  assert.deepEqual(fs.readdirSync(process.env.DATA_DIR!).sort(), dataBefore, 'no staging under the data folder');
}

test('a stream cut short leaves no project, no staged folder and nothing else', async () => {
  const buf = await collect(await carryBundle(db, id, { also: true }));
  const where = path.join(tmp, 'new-parent', 'cut', 'thesis');
  await nothingLeft(() => arrive(d, Readable.from([buf.subarray(0, Math.floor(buf.length * 0.6))]), { folder: where, how: 'copy', from: 'laptop' }), where);
  // The new parent folders made for it are gone too.
  assert.equal(fs.existsSync(path.join(tmp, 'new-parent')), false);
});

test('a corrupted byte fails the hash and leaves nothing', async () => {
  const raw = zlib.gunzipSync(await collect(await carryBundle(db, id)));
  const at = raw.indexOf(Buffer.from('Chapter two'.slice(0, 0) + '\\chapter{One}'));
  assert.ok(at > 0);
  raw[at + 3] ^= 0x55;
  const where = path.join(tmp, 'corrupt', 'thesis');
  await nothingLeft(() => arrive(d, Readable.from([zlib.gzipSync(raw)]), { folder: where, how: 'copy', from: 'laptop' }), where, /did not arrive intact/);
});

test('a failure after the project was made undoes the project and everything it got', async () => {
  const where = path.join(tmp, 'late', 'thesis');
  await nothingLeft(
    async () => {
      const o: any = { folder: where, how: 'copy', from: 'laptop', also: [path.join(process.env.HOME!, `late-${crypto.randomBytes(3).toString('hex')}`)], failAfterPlacing: () => { throw new Error('boom'); } };
      await arrive(d, await carryBundle(db, id, { also: true }), o);
    },
    where,
    /boom/,
  );
  await engine.idle();
});

test('a request that is cancelled leaves nothing', async () => {
  const buf = await collect(await carryBundle(db, id));
  const ac = new AbortController();
  const where = path.join(tmp, 'cancel', 'thesis');
  await nothingLeft(() => arrive(d, Readable.from([buf.subarray(0, 1000), buf.subarray(1000)]), { folder: where, how: 'copy', from: 'laptop', signal: ac.signal, onProgress: () => ac.abort() }), where, /Cancelled/);
});

test('arriving into a folder that has files is refused (409) and the files are untouched; an empty folder is fine', async () => {
  const full = path.join(tmp, 'taken');
  put(full, 'mine.txt', 'mine');
  const before = counts();
  const unused = await carryBundle(db, id);
  await assert.rejects(arrive(d, unused, { folder: full, how: 'copy', from: 'laptop' }), (e: any) => e.status === 409 && /There are files at .* already: pick a new or empty folder/.test(e.message));
  unused.destroy();
  assert.deepEqual(counts(), before);
  assert.deepEqual(fs.readdirSync(full), ['mine.txt']);
  const empty = path.join(tmp, 'empty-place');
  fs.mkdirSync(empty);
  const r = await arrive(d, await carryBundle(db, id), { folder: empty, how: 'copy', from: 'laptop' });
  assert.equal(r.project.folder, empty);
  assert.ok(fs.existsSync(path.join(empty, 'README.md')));
  // A relative place is not one.
  const unused2 = await carryBundle(db, id);
  await assert.rejects(arrive(d, unused2, { folder: 'relative/place', how: 'copy', from: 'laptop' }), (e: any) => e.status === 400);
  unused2.destroy();
});

test('a project cannot arrive without room: 507 says how much it needs', async () => {
  const m: any = { v: 1, from: { host: 'x', platform: 'linux', home: '/h', version: '0' }, project: { id: 'spx', name: 'Huge', color: 'blue', folder: '/x' }, also: [], skills: [], switches: {}, notes: [], agents: [], knowledge: [], kept: { pages: [], media: [], folders: [], assets: [] }, wiki: null, totals: { files: 1, bytes: 1e18 } };
  const stream = bundleStream(async (w) => void (await w.manifest(m)));
  const where = path.join(tmp, 'nospace', 'p');
  await nothingLeft(() => arrive(d, stream, { folder: where, how: 'copy', from: 'laptop' }), where, /has .* free; the project needs 1 EB|the project needs/);
});

test('names the receiving system cannot have are left out and said; the rest arrives', async () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  Object.defineProperty(process, 'platform', { value: 'win32' });
  try {
    const m: any = { v: 1, from: { host: 'x', platform: 'linux', home: '/h', version: '0' }, project: { id: 'spx', name: 'Odd names', color: 'blue', folder: '/x' }, also: [], skills: [], switches: {}, notes: [], agents: [], knowledge: [], kept: { pages: [], media: [], folders: [], assets: [] }, wiki: null, totals: { files: 4, bytes: 20 } };
    const stream = bundleStream(async (w) => {
      await w.manifest(m);
      await w.dir('folder', 'bad:dir', { mode: 0o755, mtime: 1 });
      await w.data('folder', 'bad:dir/inside.txt', Buffer.from('inside'));
      await w.data('folder', 'CON.txt', Buffer.from('con'));
      await w.data('folder', 'trailing.', Buffer.from('dot'));
      await w.data('folder', 'fine.txt', Buffer.from('fine'));
    });
    const where = path.join(tmp, 'win', 'p');
    const r = await arrive(d, stream, { folder: where, how: 'copy', from: 'laptop' });
    assert.deepEqual(fs.readdirSync(where).sort(), ['fine.txt']);
    assert.equal(r.leftOut.length, 3, r.leftOut.join('; '));
    assert.ok(r.leftOut.some((x) => x.startsWith('bad:dir:')) && r.leftOut.some((x) => x.startsWith('CON.txt:')) && r.leftOut.some((x) => x.startsWith('trailing.:')));
    assert.equal(r.files, 1, 'only what was written is counted (the bundle’s own totals still matched)');
  } finally {
    Object.defineProperty(process, 'platform', platform);
  }
});

test('the arrival place: free, numbered beside a taken one, or the new-project place', async () => {
  const home = process.env.HOME!;
  const a = arrivalPlace(db, { rel: 'work/thesis-x' }, '9.9.9');
  assert.equal(a.folder, path.join(home, 'work/thesis-x'));
  assert.equal(a.home, home);
  assert.equal(a.platform, process.platform);
  assert.equal(a.version, '9.9.9');
  assert.ok(typeof a.free === 'number' && a.free > 0);
  fs.mkdirSync(path.join(home, 'work/thesis-x'), { recursive: true });
  put(path.join(home, 'work/thesis-x'), 'f', 'x');
  assert.equal(arrivalPlace(db, { rel: 'work/thesis-x' }, '1').folder, path.join(home, 'work/thesis-x-2'));
  fs.mkdirSync(path.join(home, 'work/thesis-x-2'));
  assert.equal(arrivalPlace(db, { rel: 'work/thesis-x' }, '1').folder, path.join(home, 'work/thesis-x-2'), 'an empty folder is free');
  const n = arrivalPlace(db, { name: 'My Great Thesis!' }, '1');
  assert.equal(n.folder, path.join(tmp, 'Naget', 'Projects', 'my-great-thesis'));
  assert.equal(fs.existsSync(n.folder), false, 'not made');
  assert.deepEqual(arrivalPlace(db, { name: 'x', also: ['work/thesis-x', 'work/other-free', '../escape'] }, '1').also, ['', path.join(home, 'work/other-free'), '']);
  assert.throws(() => arrivalPlace(db, { rel: '../outside' }, '1'));
  assert.throws(() => arrivalPlace(db, { rel: '/abs' }, '1'));
});

test('leaving: everything of the project goes with it and nothing else is touched', async () => {
  const r = await arrive(d, await carryBundle(db, id), { folder: path.join(tmp, 'to-move', 'thesis'), how: 'move', from: 'laptop' });
  const moved = spaceById(db, r.project.id)!;
  assert.equal(moved.came?.how, 'move');
  const other = arrived.project.id;
  const dataDir = process.env.DATA_DIR!;
  // An agent that works in this project and in the first copy, and a group that has the project.
  const both = saveAssistant(db, { name: 'Both', instructions: 'Works in two projects.', projects: [id, other] });
  const group = allSpaces(db).find((x) => x.name === 'Group')!;
  assert.deepEqual(group.members, [id]);
  const wikiDir = wikiRoot(db, id)!;
  assert.ok(fs.existsSync(wikiDir) && !wikiDir.startsWith(folder), 'its wiki is in the hub, outside the folder');
  const wikiName = path.basename(wikiDir);
  assert.ok((db.prepare('select count(*) as n from wiki_project_dirs where space = ?').get(id) as any).n === 1);
  const myNotes = entries(db, { scope: 'repo', scopeKey: key, status: 'active' });
  assert.equal(myNotes.length, 4);
  const mine = { base: baseRows(db).find((b) => b.space === id)!, pages: (db.prepare('select id from pages where space = ?').all(id) as any[]).length, media: (db.prepare('select id from media where space = ?').all(id) as any[]).length };
  assert.equal(mine.pages, 2);
  assert.equal(mine.media, 1);

  // What must stay as it is: the shared bases, the skill library, and the other project's things.
  const sharedBefore = baseRows(db).filter((b) => !b.space).map((b) => b.id).sort();
  const libraryBefore = librarySkills().map((k) => k.dir).sort();
  const snapshot = () => ({
    pages: (db.prepare('select id from pages where space = ?').all(other) as any[]).map((x) => x.id).sort(),
    media: (db.prepare('select id from media where space = ?').all(other) as any[]).map((x) => x.id).sort(),
    bases: baseRows(db).filter((b) => b.space === other).map((b) => b.id),
    notes: entries(db, { scope: 'repo', scopeKey: memoryKeyOf(dest), status: 'active' }).length,
    skills: skillsOf(other).map((k) => k.name),
    switches: spaceSwitches(db, other),
    agents: allAssistants(db).filter((a) => a.projects?.includes(other) && a.name === 'Reviewer').length,
    files: tree(dest),
    dropped: fs.readdirSync(filesDir(baseRows(db).find((b) => b.space === other)!.id)).sort(),
    wiki: fs.readFileSync(path.join(wikiRoot(db, other)!, 'wiki/overview.md'), 'utf8'),
  });
  const otherBefore = snapshot();
  const keptDropped = path.dirname(filesDir(mine.base.id));
  assert.ok(fs.existsSync(keptDropped) && fs.existsSync(path.join(dataDir, 'spaces', id)));
  const trashBefore = (await listTrash()).items.length;
  told.length = 0;

  const out = await leave(d, id, { to: 'gpu box' });

  assert.deepEqual(Object.keys(out).sort(), ['ok', 'trashed'], 'the same shape, and nothing stays behind');
  assert.equal(out.ok, true);
  assert.ok(out.trashed && fs.existsSync(out.trashed), 'the folder is in the Trash');
  assert.equal(fs.existsSync(folder), false);
  assert.equal(spaceById(db, id), null);
  const trash = (await listTrash()).items;
  const inTrash = (name: string) => trash.some((i) => i.name === name && fs.existsSync(i.path));
  assert.ok(trash.length >= trashBefore + 4);
  assert.ok(inTrash('thesis'), 'the folder');
  assert.ok(inTrash(id), 'its skills (spaces/<id>)');
  assert.ok(inTrash(path.basename(keptDropped)), 'the documents dropped into its knowledge base');
  assert.ok(inTrash(wikiName), 'its wiki');
  assert.equal(fs.existsSync(path.join(dataDir, 'spaces', id)), false);
  assert.equal(fs.existsSync(keptDropped), false);
  assert.equal(fs.existsSync(wikiDir), false);
  assert.equal((db.prepare('select count(*) as n from wiki_project_dirs where space = ?').get(id) as any).n, 0);
  // No shared base appeared, the library has no new skill.
  assert.deepEqual(baseRows(db).filter((b) => !b.space).map((b) => b.id).sort(), sharedBefore);
  assert.equal(baseRows(db).some((b) => b.id === mine.base.id), false, 'its base is deleted');
  assert.equal(sourcesOf(db, mine.base.id).length, 0);
  assert.deepEqual(librarySkills().map((k) => k.dir).sort(), libraryBefore);
  assert.equal(fs.existsSync(path.join(tmp, 'learned', 'citation-style')), false);
  assert.deepEqual(spaceSwitches(db, id), {});
  assert.equal((db.prepare('select count(*) as n from skillpack_history where space = ?').get(id) as any).n, 0);
  // No page, board or picture of it remains, anywhere.
  for (const t of ['pages', 'media']) assert.equal((db.prepare(`select count(*) as n from ${t} where space = ? or space is null`).get(id) as any).n, 0, `${t} in no project`);
  assert.equal((db.prepare('select count(*) as n from library_folders where space = ? or space is null').get(id) as any).n, 0);
  assert.equal((db.prepare('select count(*) as n from pages where id in (?, ?)').get(doc.id, html.id) as any).n, 0);
  assert.equal(listMedia(db).some((m) => m.id === logo.id), false);
  // Its agent is gone; the one that works elsewhere too only lost this project.
  assert.equal(findAssistant(db, reviewer.id), null);
  assert.deepEqual(findAssistant(db, both.id)!.projects, [other]);
  assert.deepEqual(findAssistant(db, otherAgent.id)!.projects, ['spother']);
  assert.ok(told.some((e) => e.id === 'assistants'));
  // Its notes are forgotten, and stay in the history with the reason.
  assert.equal(entries(db, { scope: 'repo', scopeKey: key, status: 'active' }).length, 0);
  const forgotten = entries(db, { scope: 'repo', scopeKey: key, status: 'deleted' });
  assert.equal(forgotten.length, 4);
  for (const n of myNotes) {
    const last = memoryHistory(db, n.id).find((h) => h.action === 'deleted');
    assert.ok(last, 'in the history');
    assert.equal(last!.why, 'Moved to gpu box');
  }
  // It left its group.
  assert.equal(spaceById(db, group.id)!.members, undefined);
  // The broadcasts the delete route makes.
  for (const e of ['spaces', 'pages', 'media', 'knowledge', 'skillpack']) assert.ok(told.some((t) => t.id === e), `${e} is told`);
  // The other project's things are untouched.
  assert.deepEqual(snapshot(), otherBefore);
  assert.ok(spaceById(db, other) && spaceById(db, r.project.id));
  // It cannot leave twice.
  await assert.rejects(leave(d, id), /No such project/);
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n`, e);
    process.exit(1);
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed}/${tests.length} carry tests passed`);
process.exit(0);
