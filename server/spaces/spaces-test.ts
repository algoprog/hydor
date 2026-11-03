// Script tests for spaces: a new space gets a folder of its own (or uses one given), its fields are cleaned,
// its sessions are counted, it can leave the shared knowledge out, a session in it is told its instructions,
// a group brings spaces together, a space has skills of its own that its sessions get with the skill
// library's, and folders used lately that no space has are suggested for one. Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/spaces/spaces-test.ts
//   DATA_DIR=/tmp/hydor-test-spaces node dist/dev/spaces-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setSettings } from '../assistants/store.ts';
import { APP_ROOT, config } from '../config.ts';
import { openDb } from '../db.ts';
import { registerFeatures, spawnAdditions } from '../features/registry.ts';
import type { Deps } from '../features/types.ts';
import { guidelines } from '../guidelines/index.ts';
import { setSessionExtra } from '../sessionExtra.ts';
import { history } from '../skillpack/history.ts';
import { skillpack } from '../skillpack/index.ts';
import { folders, librarySkills, parseSkill, setFolders, skillText } from '../skillpack/library.ts';
import { copyToSpace, removeSpaceSkill, restoreSpaceSkill, saveSpaceSkill, spaceSkillsDir, spaceSkillsView, spaceSkillText } from '../skillpack/spaceSkills.ts';
import { createSpace, deleteSpace, sessionsIn, spaceById, spaces, spaceViews, updateSpace } from './index.ts';
import { hideSuggestion, spaceSuggestions } from './suggest.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-spaces-test-'));
const db = openDb(path.join(tmp, 'test.db'));
// The skill library: the app's own skills, learned ones and the views agents read, in the scratch folder.
setFolders({ bundled: path.join(APP_ROOT, 'skills'), learned: path.join(tmp, 'learned'), view: path.join(tmp, 'view', 'naget') });
setSettings(db, { taskRoot: path.join(tmp, 'Naget') });
registerFeatures([spaces, guidelines], { db, app: { get() {}, post() {}, put() {}, patch() {}, delete() {} } } as unknown as Deps);
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

test('a new space gets a folder of its own, named for it, and the next colour', () => {
  const a = createSpace(db, { name: '  Taxes 2026 ', instructions: 'Amounts in EUR. I am self-employed in Greece.' });
  assert.equal(a.name, 'Taxes 2026');
  assert.equal(a.folder, path.join(tmp, 'Naget', 'Projects', 'taxes-2026'));
  assert.ok(fs.statSync(a.folder).isDirectory());
  const b = createSpace(db, { name: 'Taxes 2026' });
  assert.equal(b.folder, path.join(tmp, 'Naget', 'Projects', 'taxes-2026-2'));
  assert.notEqual(a.color, b.color);
  assert.throws(() => createSpace(db, { name: '   ' }), /Give the project a name/);
  assert.throws(() => createSpace(db, { name: 'X', folder: path.join(tmp, 'nowhere') }), /No folder at/);
  const own = createSpace(db, { name: 'Thesis', folder: tmp, color: 'violet' });
  assert.equal(own.folder, tmp);
  assert.equal(own.color, 'violet');
});

test('changing a space keeps what was not given; its sessions are counted, the last at work first', () => {
  const [a] = spaceViews(db);
  const next = updateSpace(db, a.id, { description: 'Receipts and the yearly return', assistant: 'researcher' });
  assert.equal(next.instructions, 'Amounts in EUR. I am self-employed in Greece.');
  assert.equal(next.assistant, 'researcher');
  assert.equal(updateSpace(db, a.id, { assistant: '' }).assistant, undefined);
  for (const [k, at] of [['claude:t1', 1], ['claude:t2', 3], ['codex:t3', 2]] as const) {
    db.prepare('insert into app_sessions (key, agent, created_at, updated_at) values (?, ?, ?, ?)').run(k, k.split(':')[0], at, at);
    setSessionExtra(db, k, { space: a.id });
    db.prepare('update app_sessions set updated_at = ? where key = ?').run(at, k);
  }
  assert.deepEqual(sessionsIn(db, a.id), ['claude:t2', 'codex:t3', 'claude:t1']);
  const v = spaceViews(db).find((x) => x.id === a.id)!;
  assert.equal(v.sessions, 3);
  assert.equal(v.lastAt, 3);
});

test('a space searches the shared knowledge too unless it leaves it out; changing something else keeps that', () => {
  const g = createSpace(db, { name: 'Garden' });
  assert.equal(g.sharedKnowledge, undefined);
  assert.equal(updateSpace(db, g.id, { sharedKnowledge: false }).sharedKnowledge, false);
  assert.equal(updateSpace(db, g.id, { description: 'Vegetables' }).sharedKnowledge, false);
  assert.equal(updateSpace(db, g.id, { sharedKnowledge: true }).sharedKnowledge, undefined);
  assert.equal(spaceViews(db).find((x) => x.id === g.id)!.docs, 0);
  deleteSpace(db, g.id);
});

test('a session in a space is told what it is, where its files go, and its guidelines (with the others)', async () => {
  const [a] = spaceViews(db);
  const add = await spawnAdditions({ agent: 'claude', key: 'claude:t9', cwd: a.folder, runId: 'r', resume: false, extra: { space: a.id } });
  const text = add.instructions.join('\n');
  assert.match(text, /^# Project: Taxes 2026\n/);
  assert.match(text, /\(Receipts and the yearly return\)/);
  assert.ok(text.includes(a.folder));
  assert.match(text, /# Agent Guidelines\n[\s\S]*## For the project “Taxes 2026”\nAmounts in EUR/);
  assert.doesNotMatch(text, /In its folder now/, 'an empty folder says nothing');
  assert.deepEqual((await spawnAdditions({ agent: 'claude', key: 'claude:x', cwd: tmp, runId: 'r', resume: false, extra: {} })).instructions, []);
});

test('a new session in a space is told what its folder holds: the last changed first, folders marked, hidden files left out', async () => {
  const [a] = spaceViews(db);
  fs.writeFileSync(path.join(a.folder, 'notes.md'), 'x');
  fs.mkdirSync(path.join(a.folder, 'Receipts'));
  fs.writeFileSync(path.join(a.folder, '.secret'), 'x');
  const old = Date.now() / 1000 - 3600;
  fs.utimesSync(path.join(a.folder, 'notes.md'), old, old);
  fs.writeFileSync(path.join(a.folder, 'contract.pdf'), 'x');
  const text = (await spawnAdditions({ agent: 'codex', key: 'codex:t9', cwd: a.folder, runId: 'r', resume: false, extra: { space: a.id } })).instructions.join('\n');
  const line = /In its folder now \(.*?\): (.*)\. Open those/.exec(text)?.[1] ?? '';
  assert.ok(line.startsWith('contract.pdf, ') || line.startsWith('Receipts/, '), line);
  assert.ok(line.endsWith('notes.md'), line);
  assert.ok(line.includes('Receipts/'), line);
  assert.ok(!line.includes('.secret'), line);
  for (let i = 0; i < 45; i++) fs.writeFileSync(path.join(a.folder, `f${i}.txt`), 'x');
  const more = (await spawnAdditions({ agent: 'codex', key: 'codex:t9', cwd: a.folder, runId: 'r', resume: false, extra: { space: a.id } })).instructions.join('\n');
  assert.match(more, / … and 8 more\. Open those/);
  for (const n of fs.readdirSync(a.folder)) fs.rmSync(path.join(a.folder, n), { recursive: true });
});

test('a group brings spaces together: plain spaces that exist, once; its sessions are told of each and Claude Code works in their folders', async () => {
  const [taxes] = spaceViews(db);
  const thesis = createSpace(db, { name: 'Thesis', description: 'Dairy farming', instructions: 'Cite in APA style.' });
  const all = createSpace(db, { name: 'Everything', members: [taxes.id, thesis.id, thesis.id, 'spnothere'] });
  assert.deepEqual(all.members, [taxes.id, thesis.id]);
  // No groups inside groups, and a space in a group does not become one.
  assert.equal(createSpace(db, { name: 'Bigger', members: [all.id, thesis.id] }).members?.join(), thesis.id);
  assert.throws(() => updateSpace(db, thesis.id, { members: [taxes.id] }), /in a group already/);
  const add = await spawnAdditions({ agent: 'claude', key: 'claude:g1', cwd: all.folder, runId: 'r', resume: false, extra: { space: all.id } });
  const text = add.instructions.join('\n');
  assert.match(text, /"Everything" brings together 2 more projects/);
  assert.match(text, /## Thesis \(Dairy farming\)\nIts folder: .*thesis\nCite in APA style\./);
  assert.match(text, /## Taxes 2026 \(Receipts and the yearly return\)\nIts folder: /);
  assert.deepEqual(add.args, ['--add-dir', taxes.folder, '--add-dir', thesis.folder]);
  // Codex reads their folders as it is; only Claude Code needs them named.
  assert.deepEqual((await spawnAdditions({ agent: 'codex', key: 'codex:g1', cwd: all.folder, runId: 'r', resume: false, extra: { space: all.id } })).args, []);
  // Changing something else keeps who is in it; an empty list makes it a plain space again.
  assert.equal(updateSpace(db, all.id, { description: 'All of it' }).members?.length, 2);
  // Deleting a space takes it out of the groups it was in.
  deleteSpace(db, thesis.id);
  assert.deepEqual(spaceById(db, all.id)!.members, [taxes.id]);
  assert.equal(updateSpace(db, all.id, { members: [] }).members, undefined);
  for (const s of spaceViews(db).filter((x) => x.name === 'Everything' || x.name === 'Bigger')) deleteSpace(db, s.id);
});

test('a space can work in a folder you have, and with more folders of yours; Claude Code works in them as in its own', async () => {
  const shop = fs.mkdtempSync(path.join(tmp, 'shop-'));
  const papers = fs.mkdtempSync(path.join(tmp, 'papers-'));
  const notes = fs.mkdtempSync(path.join(tmp, 'notes-'));
  fs.mkdirSync(path.join(shop, 'src'));
  // Its own folder (inside it too) and repeats come once or not at all; a folder that isn't there is refused.
  const sp = createSpace(db, { name: 'Shop', folder: shop, folders: [papers, `${papers}/`, shop, path.join(shop, 'src'), '  '] });
  assert.equal(sp.folder, shop, 'no new folder is made');
  assert.deepEqual(sp.folders, [papers]);
  assert.throws(() => createSpace(db, { name: 'X', folders: [path.join(tmp, 'nowhere')] }), /No folder at/);
  assert.equal(spaceViews(db).filter((x) => x.name === 'X').length, 0, 'nothing is made when a folder is wrong');
  const add = await spawnAdditions({ agent: 'claude', key: 'claude:f1', cwd: shop, runId: 'r', resume: false, extra: { space: sp.id } });
  assert.deepEqual(add.args, ['--add-dir', papers]);
  assert.match(add.instructions.join('\n'), new RegExp(`It also works with this folder of the user's, where it is: ${papers}\.`));
  // Changing something else keeps them; a new list replaces them; an empty one clears them.
  assert.deepEqual(updateSpace(db, sp.id, { description: 'The web shop' }).folders, [papers]);
  assert.deepEqual(updateSpace(db, sp.id, { folders: [papers, notes] }).folders, [papers, notes]);
  assert.throws(() => updateSpace(db, sp.id, { folders: 'nope' }), /a list of folders/);
  // A group's sessions get the folders its spaces work with too.
  const g = createSpace(db, { name: 'All work', members: [sp.id] });
  const ga = await spawnAdditions({ agent: 'claude', key: 'claude:g2', cwd: g.folder, runId: 'r', resume: false, extra: { space: g.id } });
  assert.deepEqual(ga.args, ['--add-dir', shop, '--add-dir', papers, '--add-dir', notes]);
  assert.match(ga.instructions.join('\n'), /## Shop \(The web shop\)\nIts folder: .*\nIt also works with: /);
  assert.equal(updateSpace(db, sp.id, { folders: [] }).folders, undefined);
  deleteSpace(db, g.id);
  deleteSpace(db, sp.id);
  assert.ok(fs.existsSync(shop) && fs.existsSync(papers), 'deleting a space leaves the folders alone');
});

test('deleting a space keeps its folder and sessions', () => {
  const [a] = spaceViews(db);
  deleteSpace(db, a.id);
  assert.equal(spaceById(db, a.id), null);
  assert.ok(fs.existsSync(a.folder));
  assert.equal(sessionsIn(db, a.id).length, 3);
});

const BODY = '1. List the ingredients first, in grams.\n2. Then the steps, numbered, one action each.\n3. End with how many it serves.';
const linkOf = (view: string, name: string) => fs.readlinkSync(path.join(view, 'skills', name));

test('a space has skills of its own: written, changed, renamed, removed and brought back, each with its history', () => {
  const sp = createSpace(db, { name: 'Recipes' });
  const k = saveSpaceSkill(db, sp.id, { name: 'Recipe format', description: 'Use when writing down a recipe for the book', body: BODY, triggers: ['write a recipe'] });
  assert.equal(k.name, 'recipe-format');
  assert.equal(k.uses, 0);
  assert.equal(spaceViews(db).find((x) => x.id === sp.id)!.skills, 1);
  assert.ok(fs.existsSync(path.join(spaceSkillsDir(sp.id), 'recipe-format', 'SKILL.md')), 'in the data folder');
  assert.ok(!fs.existsSync(path.join(sp.folder, '.claude')), 'nothing in the space’s own folder');
  // The rules: a name, when to use it, real steps, no secrets, one of a name.
  assert.throws(() => saveSpaceSkill(db, sp.id, { name: 'recipe-format', description: 'Use when writing a recipe again', body: BODY }), /already/);
  assert.throws(() => saveSpaceSkill(db, sp.id, { name: '!', description: 'Use when writing a recipe', body: BODY }), /short name/);
  assert.throws(() => saveSpaceSkill(db, sp.id, { name: 'tiny', description: 'Use when', body: BODY }), /when to use/);
  assert.throws(() => saveSpaceSkill(db, sp.id, { name: 'tiny', description: 'Use when writing a recipe', body: 'Too short.' }), /more than that/);
  assert.throws(() => saveSpaceSkill(db, sp.id, { name: 'leaky', description: 'Use when ordering from the shop', body: `${BODY}\nUse the key sk-ant-${'a1B2c3D4'.repeat(4)} to order.` }), /holds a secret/);
  // Changed: what is not given stays (its keywords too); renamed: its other files and its history go with it.
  fs.writeFileSync(path.join(spaceSkillsDir(sp.id), 'recipe-format', 'example.md'), '# Pancakes');
  saveSpaceSkill(db, sp.id, { description: 'Use when writing down any recipe for the family book' }, 'recipe-format');
  assert.deepEqual(parseSkill(spaceSkillText(sp.id, 'recipe-format')!.text).triggers, ['write a recipe']);
  const renamed = saveSpaceSkill(db, sp.id, { name: 'family-recipe' }, 'recipe-format');
  assert.equal(renamed.name, 'family-recipe');
  assert.equal(spaceSkillText(sp.id, 'recipe-format'), null);
  assert.equal(parseSkill(spaceSkillText(sp.id, 'family-recipe')!.text).name, 'family-recipe');
  assert.ok(fs.existsSync(path.join(spaceSkillsDir(sp.id), 'family-recipe', 'example.md')));
  assert.deepEqual(
    history(db, 'family-recipe', sp.id).map((c) => c.action),
    ['update', 'update', 'create'],
  );
  assert.equal(history(db, 'family-recipe').length, 0, 'not the library’s history');
  // Removed, it can come back as it was; the library knows nothing of it.
  removeSpaceSkill(db, sp.id, 'family-recipe');
  assert.deepEqual(
    spaceSkillsView(db, sp.id).removed.map((r) => r.name),
    ['family-recipe'],
  );
  restoreSpaceSkill(db, sp.id, 'family-recipe');
  assert.equal(spaceSkillsView(db, sp.id).removed.length, 0);
  assert.equal(parseSkill(spaceSkillText(sp.id, 'family-recipe')!.text).description, 'Use when writing down any recipe for the family book');
  assert.equal(skillText('family-recipe'), null);
  assert.throws(() => restoreSpaceSkill(db, sp.id, 'family-recipe'), /Nothing to bring back|already/);
  // A library skill copied in, to change for the space alone, with its other files.
  const lib = librarySkills().find((x) => x.source === 'bundled' && fs.readdirSync(path.dirname(x.file)).length > 1)!;
  const copy = copyToSpace(db, sp.id, lib.dir);
  assert.equal(copy.overrides, true);
  assert.deepEqual(fs.readdirSync(path.join(spaceSkillsDir(sp.id), lib.dir)).sort(), fs.readdirSync(path.dirname(lib.file)).sort());
  assert.throws(() => copyToSpace(db, sp.id, lib.dir), /already/);
  assert.throws(() => copyToSpace(db, sp.id, 'no-such-skill'), /no skill named/);
  deleteSpace(db, sp.id);
});

test('a session in a space gets its skills with the library’s, its own in place of one of the same name; a group gets its spaces’ too', async () => {
  const deps = { db } as unknown as Deps;
  const base = { cwd: tmp, runId: 'r', resume: false };
  const kitchen = createSpace(db, { name: 'Kitchen' });
  const garden = createSpace(db, { name: 'Garden' });
  const home = createSpace(db, { name: 'Home', members: [kitchen.id, garden.id] });
  saveSpaceSkill(db, kitchen.id, { name: 'recipe-format', description: 'Use when writing down a recipe', body: BODY });
  saveSpaceSkill(db, kitchen.id, { name: 'writing', description: 'Use when writing anything for the kitchen book', body: BODY });
  saveSpaceSkill(db, garden.id, { name: 'writing', description: 'Use when writing anything about the garden', body: BODY });
  saveSpaceSkill(db, garden.id, { name: 'sowing-plan', description: 'Use when planning what to sow and when', body: BODY });
  // Outside a space: the library's view.
  assert.deepEqual((await skillpack.spawn!({ ...base, agent: 'codex', extra: {} }, deps))?.skillRoots, [path.join(folders().view, 'skills')]);
  // In the kitchen: a view of its own, the library's skills with its own in place of the library's writing.
  const codex = await skillpack.spawn!({ ...base, agent: 'codex', extra: { space: kitchen.id } }, deps);
  const view = path.dirname(codex!.skillRoots![0]);
  assert.notEqual(view, folders().view);
  assert.equal(linkOf(view, 'recipe-format'), path.join(spaceSkillsDir(kitchen.id), 'recipe-format'));
  assert.equal(linkOf(view, 'writing'), path.join(spaceSkillsDir(kitchen.id), 'writing'));
  assert.equal(linkOf(view, 'research'), path.join(APP_ROOT, 'skills', 'research'));
  assert.ok(!fs.existsSync(path.join(view, 'skills', 'sowing-plan')), 'not another space’s');
  assert.equal(JSON.parse(fs.readFileSync(path.join(view, '.claude-plugin', 'plugin.json'), 'utf8')).name, 'hydor', 'skills keep their names');
  const custom = await skillpack.spawn!({ ...base, agent: 'acp', acpAgent: 'console', extra: { space: kitchen.id } }, deps);
  assert.equal(custom?.env?.HYDOR_SKILL_DIRS, path.join(view, 'skills'));
  // In the group: the spaces' skills too, the first space's before the next one's.
  const group = path.dirname((await skillpack.spawn!({ ...base, agent: 'codex', extra: { space: home.id } }, deps))!.skillRoots![0]);
  assert.equal(linkOf(group, 'sowing-plan'), path.join(spaceSkillsDir(garden.id), 'sowing-plan'));
  assert.equal(linkOf(group, 'writing'), path.join(spaceSkillsDir(kitchen.id), 'writing'));
  // The agent is told which skills are the space's.
  const told = (await spawnAdditions({ ...base, agent: 'codex', key: 'codex:k1', extra: { space: kitchen.id } })).instructions.join('\n');
  assert.match(told, /Skills of the project's own: recipe-format and writing\. They are in your skills list/);
  const toldGroup = (await spawnAdditions({ ...base, agent: 'codex', key: 'codex:h1', extra: { space: home.id } })).instructions.join('\n');
  assert.match(toldGroup, /Skills of the project's own: recipe-format, writing and sowing-plan\./);
  // A skill removed from the space is gone from its view at the next start; the library's comes back.
  removeSpaceSkill(db, kitchen.id, 'writing');
  await skillpack.spawn!({ ...base, agent: 'codex', extra: { space: kitchen.id } }, deps);
  assert.equal(linkOf(view, 'writing'), path.join(APP_ROOT, 'skills', 'writing'));
  for (const sp of [home, kitchen, garden]) deleteSpace(db, sp.id);
});

test('deleting a space puts its skills in the skill library, named for the space when the library has one of the name', () => {
  const sp = createSpace(db, { name: 'Thesis 2026' });
  saveSpaceSkill(db, sp.id, { name: 'citation-style', description: 'Use when citing a source in the thesis', body: BODY });
  saveSpaceSkill(db, sp.id, { name: 'research', description: 'Use when looking up papers for the thesis', body: BODY });
  assert.deepEqual(deleteSpace(db, sp.id).sort(), ['citation-style', 'research-thesis-2026']);
  assert.equal(skillText('citation-style')?.source, 'learned');
  const kept = parseSkill(skillText('research-thesis-2026')!.text);
  assert.equal(kept.name, 'research-thesis-2026');
  assert.equal(kept.description, 'Use when looking up papers for the thesis');
  assert.equal(skillText('research')?.source, 'bundled', 'the library’s own stays as it was');
  assert.deepEqual(
    history(db, 'citation-style').map((c) => c.action),
    ['create'],
  );
  assert.ok(!fs.existsSync(spaceSkillsDir(sp.id)), 'its own folder of skills is gone');
  assert.ok(fs.existsSync(path.join(folders().view, 'skills', 'citation-style')), 'in the library’s view');
  for (const n of ['citation-style', 'research-thesis-2026']) fs.rmSync(path.join(folders().learned, n), { recursive: true });
});

test('folders sessions worked in, or changed files in, are suggested for a space until one has them', () => {
  // Its own home: an earlier test's space has the whole scratch folder.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-suggest-test-'));
  const repo = path.join(home, 'code', 'shop');
  const notes = path.join(home, 'Documents', 'notes');
  const once = path.join(home, 'old-thing');
  for (const d of [path.join(repo, '.git'), path.join(repo, 'web', 'src'), notes, once, path.join(home, '.config', 'x')]) fs.mkdirSync(d, { recursive: true });
  const now = Date.now();
  const DAY = 86_400_000;
  const row = db.prepare(`insert into sessions (key, agent, id, path, cwd, updated_at, hidden, user_msgs, state) values (?, 'claude', ?, ?, ?, ?, 0, 1, ?)`);
  let n = 0;
  const add = (cwd: string, ago: number, files: string[] = []) => {
    const key = `claude:sug${++n}`;
    row.run(
      key,
      `sug${n}`,
      `/nowhere/${n}.jsonl`,
      cwd,
      now - ago * DAY,
      JSON.stringify({
        files: Object.fromEntries(files.map((f) => [f, [1, 0]])),
      }),
    );
    return key;
  };
  // In the repository (a folder inside it counts as the repository), changing a note elsewhere.
  add(repo, 1);
  add(path.join(repo, 'web'), 2, [path.join(repo, 'web', 'src', 'a.ts'), path.join(notes, 'todo.md')]);
  add(repo, 3);
  add(once, 80);
  add(once, 200); // too long ago to count
  add(home, 1); // the home folder itself is no project
  add(path.join(home, '.config', 'x'), 1);
  add(path.join(tmp, 'Naget', 'tasks'), 1); // the app's own task folders
  // A session started in a space belongs to it, wherever it ran.
  fs.mkdirSync(path.join(home, 'elsewhere'));
  const sp = createSpace(db, { name: 'Elsewhere' });
  setSessionExtra(db, add(path.join(home, 'elsewhere'), 1), { space: sp.id });
  const opts = { home, now };
  let got = spaceSuggestions(db, opts);
  assert.deepEqual(
    got.map((s) => s.path),
    [repo, notes, once],
  );
  assert.equal(got[0].sessions, 3);
  assert.deepEqual([got[1].sessions, got[1].changed], [1, 1], 'the note only changed from the repository’s session');
  // A space that has the folder, or one inside it, takes it off the list.
  const shop = createSpace(db, { name: 'Shop', folder: repo });
  got = spaceSuggestions(db, opts);
  assert.deepEqual(
    got.map((s) => s.path),
    [notes, once],
  );
  updateSpace(db, shop.id, { folders: [notes] });
  assert.deepEqual(
    spaceSuggestions(db, opts).map((s) => s.path),
    [once],
  );
  hideSuggestion(db, once);
  assert.deepEqual(spaceSuggestions(db, opts), [], 'Not a project hides it');
  deleteSpace(db, shop.id);
  deleteSpace(db, sp.id);
  fs.rmSync(home, { recursive: true, force: true });
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
