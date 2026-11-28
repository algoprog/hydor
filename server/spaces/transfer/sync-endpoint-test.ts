// Script tests for the endpoint side of sync: a project's state (files by area, details, notes, mark), the hashes and bytes
// asked for, files pushed (written whole, only over what `expect` says, the sender's time and mode, skills kept right, nothing
// left behind when it fails or a link leads out), renames, removals to the Trash, details, notes, and the mark. Build and run
// with a scratch folder:
//   OUTDIR=dist/dev-hub node scripts/build-server.mjs server/spaces/transfer/sync-endpoint-test.ts
//   HOME=/tmp/hub-home DATA_DIR=/tmp/hub-data node dist/dev-hub/sync-endpoint-test.js
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { openDb } from '../../db.ts';
import type { Deps } from '../../features/types.ts';
import { listTrash } from '../../files.ts';
import { addEntry, entries } from '../../memory/store.ts';
import { history } from '../../skillpack/history.ts';
import { skillsOf, spaceSkillsDir } from '../../skillpack/spaceSkills.ts';
import { createSpace, spaceById } from '../index.ts';
import { memoryKeyOf } from './carry.ts';
import { noteHash } from './merge.ts';
import { syncApply, syncHashes, syncPull, syncPush, syncState, syncStats, setSyncMark, type PullFile } from './sync-endpoint.ts';
import { bundleStream, readBundle } from './stream.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/') || !process.env.HOME?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… and HOME=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
fs.rmSync(process.env.HOME, { recursive: true, force: true });
fs.mkdirSync(process.env.HOME, { recursive: true });

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-syncep-test-')));
const db = openDb(path.join(tmp, 'test.db'));
const told: { id: string; data: any }[] = [];
const d = { db, broadcast: (e: any) => told.push(e) } as unknown as Deps;

let passed = 0;
const tests: [string, () => Promise<void>][] = [];
const test = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);
const sha = (b: Buffer | string) => crypto.createHash('sha256').update(b).digest('hex');
const put = (root: string, rel: string, text: string | Buffer = 'x', mtimeMs?: number) => {
  const f = path.join(root, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
  if (mtimeMs) fs.utimesSync(f, mtimeMs / 1000, mtimeMs / 1000);
  return f;
};
const stat = (f: string) => {
  const s = fs.lstatSync(f);
  return { size: s.size, mtime: Math.round(s.mtimeMs) };
};
/** Every file under a folder (temporary names included), relative. */
const everything = (root: string): string[] => {
  const out: string[] = [];
  const go = (dir: string, rel: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) go(path.join(dir, e.name), r);
      else out.push(r);
    }
  };
  go(root, '');
  return out.sort();
};
const leftovers = (...roots: string[]) => roots.flatMap((r) => everything(r).filter((f) => f.includes('.hydor-sync-')));
const collect = async (s: Readable) => {
  const parts: Buffer[] = [];
  for await (const c of s) parts.push(c as Buffer);
  return Buffer.concat(parts);
};

const folder = path.join(tmp, 'proj');
put(folder, 'a.txt', 'alpha', 1_700_000_000_000);
put(folder, 'src/b.ts', 'bravo', 1_700_000_001_000);
put(folder, 'node_modules/x/index.js', 'rebuilt');
put(folder, '.DS_Store', 'junk');
fs.mkdirSync(path.join(folder, '.git'));
put(folder, '.git/config', 'git');
fs.chmodSync(path.join(folder, 'src/b.ts'), 0o755);
const outside = path.join(tmp, 'outside');
fs.mkdirSync(outside);
fs.symlinkSync(outside, path.join(folder, 'escape'));

const project = createSpace(db, { name: 'Thesis', folder, description: 'about it', color: 'green', wikiMemory: false });
const id = project.id;

/** A bundle of files as a sender would make: each from its own folder, with `expect`. */
const send = (src: string, files: { area?: string; path: string; text?: string; mtime?: number; mode?: number; expect?: { size: number; mtime: number } | null }[]) => {
  for (const f of files) {
    if (f.text !== undefined) put(src, `${f.area ?? 'folder'}/${f.path}`, f.text, f.mtime);
    if (f.mode) fs.chmodSync(path.join(src, `${f.area ?? 'folder'}/${f.path}`), f.mode);
  }
  return bundleStream(async (w) => {
    for (const f of files) await w.file(f.area ?? 'folder', f.path, path.join(src, `${f.area ?? 'folder'}/${f.path}`), { expect: f.expect === undefined ? null : f.expect });
  });
};

test('state: files by area with the rules, details, no notes, no mark', async () => {
  const s = await syncState(d, id);
  assert.deepEqual(s.files.folder!.map((f) => f.path), ['a.txt', 'src/b.ts']);
  assert.equal(s.files.folder![0].size, 5);
  assert.equal(s.files.folder![0].mtime, 1_700_000_000_000);
  assert.equal(s.files.folder![1].mode, 0o755);
  assert.deepEqual(s.files.skills, [], 'no skills is an empty list');
  assert.equal(s.files.wiki, null, 'wiki memory off: left alone');
  assert.deepEqual(s.details, { name: 'Thesis', color: 'green', description: 'about it' });
  assert.deepEqual(s.notes, []);
  assert.equal(s.mark, null);
});

test('wiki: memory on without a folder yet is an empty area; a file arriving makes the folder', async () => {
  fs.mkdirSync(path.join(tmp, 'wiki-proj'), { recursive: true });
  const w = createSpace(db, { name: 'Wiki one', folder: path.join(tmp, 'wiki-proj'), wikiMemory: true });
  const before = await syncState(d, w.id);
  assert.deepEqual(before.files.wiki, []);
  assert.ok(!(await import('../../wiki/roots.ts')).wikiRoot(db, w.id), 'reading made nothing');
  const r = await syncPush(d, w.id, send(path.join(tmp, 'srcw'), [{ area: 'wiki', path: 'wiki/index.md', text: '# hi' }]));
  assert.equal(r.results[0].ok, true);
  const root = (await import('../../wiki/roots.ts')).wikiRoot(db, w.id)!;
  assert.equal(fs.readFileSync(path.join(root, 'wiki/index.md'), 'utf8'), '# hi');
  assert.deepEqual((await syncState(d, w.id)).files.wiki!.map((f) => f.path), ['wiki/index.md']);
});

test('state: a missing folder is null, a missing project is a 404', async () => {
  fs.mkdirSync(path.join(tmp, 'gone'));
  const gone = createSpace(db, { name: 'Gone', folder: path.join(tmp, 'gone'), wikiMemory: false });
  fs.rmSync(gone.folder, { recursive: true });
  const s = await syncState(d, gone.id);
  assert.equal(s.files.folder, null);
  assert.deepEqual(s.files.skills, []);
  await assert.rejects(syncState(d, 'spnotthere'), /No such project/);
});

test('state: notes of kinds note and finding, once each, with their hashes', async () => {
  const key = memoryKeyOf(folder);
  addEntry(db, { scope: 'repo', scopeKey: key, text: 'The  data is   in /mnt', kind: 'note' }, { source: 'user', at: 1000 });
  addEntry(db, { scope: 'repo', scopeKey: key, text: 'duplicate', kind: 'note' }, { source: 'user', at: 2000 });
  addEntry(db, { scope: 'repo', scopeKey: key, text: 'duplicate', kind: 'note' }, { source: 'user', at: 3000 });
  addEntry(db, { scope: 'repo', scopeKey: key, text: 'A topic', kind: 'topic' }, { source: 'auto' });
  const s = await syncState(d, id);
  assert.deepEqual(s.notes.map((n) => n.text).sort(), ['The data is in /mnt', 'duplicate']);
  assert.equal(s.notes.find((n) => n.text === 'duplicate')!.hash, noteHash('note', 'duplicate'));
});

test('hashes: of what is asked, null for what is not a file; paths are checked', async () => {
  const { hashes } = await syncHashes(d, id, [
    { area: 'folder', path: 'a.txt' },
    { area: 'folder', path: 'nope.txt' },
    { area: 'folder', path: 'src' },
  ]);
  assert.equal(hashes['folder\na.txt'], sha('alpha'));
  assert.equal(hashes['folder\nnope.txt'], null);
  assert.equal(hashes['folder\nsrc'], null);
  await assert.rejects(syncHashes(d, id, [{ area: 'folder', path: '../x' }]), /relative path/);
  await assert.rejects(syncHashes(d, id, [{ area: 'media', path: 'x' }]), /area/);
});

test('stats: whether a path is on disk, listed or not, without reading it; nothing through a link', async () => {
  // Not listed by the state (it is in a folder Git ignores), but on disk.
  const { stats } = await syncStats(d, id, [
    { area: 'folder', path: 'a.txt' },
    { area: 'folder', path: 'node_modules/x/index.js' },
    { area: 'folder', path: 'nope.txt' },
    { area: 'folder', path: 'src' },
    { area: 'folder', path: 'escape/anything.txt' },
    { area: 'skills', path: 'none/SKILL.md' },
  ]);
  assert.deepEqual(stats['folder\na.txt'], { size: 5, mtime: 1_700_000_000_000 });
  assert.equal(stats['folder\nnode_modules/x/index.js']!.size, 'rebuilt'.length, 'a rebuilt folder is not listed, but it is there');
  assert.equal(stats['folder\nnope.txt'], null);
  assert.ok(stats['folder\nsrc'], 'a folder is there too');
  assert.equal(stats['folder\nescape/anything.txt'], null, 'behind a link: nothing');
  assert.equal(stats['skills\nnone/SKILL.md'], null);
  await assert.rejects(syncStats(d, id, [{ area: 'folder', path: '../x' }]), /relative path/);
});

test('pull: a bundle of what is asked, with expect in the records; what changed is not sent', async () => {
  const asked: PullFile[] = [
    { area: 'folder', path: 'a.txt', size: 5, mtime: 1_700_000_000_000, expect: { size: 9, mtime: 5 } },
    { area: 'folder', path: 'src/b.ts', size: 999, mtime: 1_700_000_001_000 },
    { area: 'folder', path: 'missing.txt', size: 1, mtime: 1 },
  ];
  const seen: { path: string; expect: unknown; text: string }[] = [];
  const end = await readBundle(syncPull(d, id, asked), {
    manifest: () => assert.fail('no manifest in a pull'),
    async file(rec, body) {
      seen.push({ path: rec.path, expect: rec.expect, text: (await collect(body)).toString() });
    },
  });
  assert.deepEqual(seen, [{ path: 'a.txt', expect: { size: 9, mtime: 5 }, text: 'alpha' }]);
  assert.equal(end.files, 1);
});

test('push: a new file, the sender\'s time and mode, the stat read back, no temporary left', async () => {
  const src = path.join(tmp, 'src1');
  const r = await syncPush(d, id, send(src, [{ path: 'new/deep/c.sh', text: 'echo hi', mtime: 1_650_000_000_123, mode: 0o755 }]));
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].ok, true);
  const f = path.join(folder, 'new/deep/c.sh');
  assert.equal(fs.readFileSync(f, 'utf8'), 'echo hi');
  assert.deepEqual({ size: r.results[0].size, mtime: r.results[0].mtime }, stat(f));
  assert.ok(Math.abs(r.results[0].mtime! - 1_650_000_000_123) <= 1, 'the sender\'s time');
  assert.equal(fs.statSync(f).mode & 0o777, 0o755);
  assert.deepEqual(leftovers(folder), []);
});

test('push: over a file only when it is as expected; else refused and untouched', async () => {
  const f = path.join(folder, 'a.txt');
  const now = stat(f);
  // The right expect.
  const src = path.join(tmp, 'src2');
  let r = await syncPush(d, id, send(src, [{ path: 'a.txt', text: 'alpha 2', mtime: 1_700_000_005_000, expect: now }]));
  assert.equal(r.results[0].ok, true);
  assert.equal(fs.readFileSync(f, 'utf8'), 'alpha 2');
  // A stale expect (the file moved since the hub looked).
  r = await syncPush(d, id, send(src, [{ path: 'a.txt', text: 'alpha 3', mtime: 1_700_000_006_000, expect: now }]));
  assert.deepEqual([r.results[0].ok, r.results[0].why], [false, 'changed']);
  assert.equal(fs.readFileSync(f, 'utf8'), 'alpha 2', 'untouched');
  // It must not be there (null) but is.
  r = await syncPush(d, id, send(src, [{ path: 'a.txt', text: 'alpha 4', expect: null }]));
  assert.deepEqual([r.results[0].ok, r.results[0].why], [false, 'changed']);
  // It is expected but gone.
  r = await syncPush(d, id, send(src, [{ path: 'nothing-here.txt', text: 'z', expect: { size: 1, mtime: 1 } }]));
  assert.deepEqual([r.results[0].ok, r.results[0].why], [false, 'changed']);
  assert.ok(!fs.existsSync(path.join(folder, 'nothing-here.txt')));
  assert.deepEqual(leftovers(folder), []);
});

test('push: several files, the rest still written when one is refused', async () => {
  const src = path.join(tmp, 'src3');
  const r = await syncPush(d, id, send(src, [{ path: 'a.txt', text: 'x1', expect: null }, { path: 'm/one.txt', text: '1' }, { path: 'm/two.txt', text: '22' }]));
  assert.deepEqual(r.results.map((x) => x.ok), [false, true, true]);
  assert.equal(fs.readFileSync(path.join(folder, 'm/two.txt'), 'utf8'), '22');
});

test('push: never through a link out of the project, into .git or onto a temporary name', async () => {
  const src = path.join(tmp, 'src4');
  const r = await syncPush(d, id, send(src, [{ path: 'escape/evil.txt', text: 'evil' }, { path: '.git/hooks/pre-commit', text: 'evil' }, { path: 'x/.hydor-sync-abc', text: 'evil' }]));
  assert.deepEqual(r.results.map((x) => [x.ok, x.why]), [[false, 'link'], [false, 'git'], [false, 'temporary']]);
  assert.deepEqual(fs.readdirSync(outside), []);
  assert.ok(!fs.existsSync(path.join(folder, '.git/hooks')));
  assert.deepEqual(leftovers(folder, outside), []);
});

test('push: a broken bundle throws, and leaves nothing behind', async () => {
  const src = path.join(tmp, 'src5');
  const whole = await collect(send(src, [{ path: 'big/one.bin', text: 'a'.repeat(300_000), mtime: 1 }, { path: 'big/two.bin', text: 'b'.repeat(300_000), mtime: 1 }]));
  // Cut in the middle of the second file (the gzip stream is cut: the reader fails in the bundle or in the zip).
  const cut = Readable.from([whole.subarray(0, Math.floor(whole.length * 0.6))]);
  await assert.rejects(syncPush(d, id, cut));
  assert.deepEqual(leftovers(folder), []);
  assert.ok(!fs.existsSync(path.join(folder, 'big/two.bin')), 'the unfinished file is not there');
  // A bit flipped in a file's bytes: its hash fails.
  const bad = Buffer.from(await collect(send(src, [{ path: 'flip.txt', text: 'x'.repeat(1000) }])));
  const gz = (await import('node:zlib')).gunzipSync(bad);
  gz[gz.length - 200] ^= 0xff;
  await assert.rejects(syncPush(d, id, Readable.from([(await import('node:zlib')).gzipSync(gz)])), /intact|bundle/);
  assert.ok(!fs.existsSync(path.join(folder, 'flip.txt')));
  assert.deepEqual(leftovers(folder), []);
});

test('push: skills are written, listed, and their SKILL.md changes are in the history', async () => {
  const src = path.join(tmp, 'src6');
  const text = '---\nname: tidy\ndescription: Use when tidying the data folder, to keep it in order\n---\n\nTidy it.\n';
  let r = await syncPush(d, id, send(src, [{ area: 'skills', path: 'tidy/SKILL.md', text, mtime: 1_700_000_000_000 }, { area: 'skills', path: 'tidy/scripts/run.sh', text: 'echo', mtime: 1_700_000_000_000 }]));
  assert.deepEqual(r.results.map((x) => x.ok), [true, true]);
  assert.deepEqual(skillsOf(id).map((s) => s.name), ['tidy']);
  assert.ok(fs.existsSync(path.join(spaceSkillsDir(id), 'tidy/scripts/run.sh')));
  assert.equal(history(db, 'tidy', id)[0].action, 'create');
  const s = await syncState(d, id);
  assert.deepEqual(s.files.skills!.map((f) => f.path), ['tidy/SKILL.md', 'tidy/scripts/run.sh']);
  assert.ok(told.some((t) => t.id === 'skillpack'));
  const now = stat(path.join(spaceSkillsDir(id), 'tidy/SKILL.md'));
  r = await syncPush(d, id, send(src, [{ area: 'skills', path: 'tidy/SKILL.md', text: text + 'More.\n', mtime: 1_700_000_010_000, expect: now }]));
  assert.equal(r.results[0].ok, true);
  assert.equal(history(db, 'tidy', id)[0].action, 'update');
});

test('apply: a rename only when it is as expected and the new name is free', async () => {
  const f = path.join(folder, 'm/one.txt');
  const st = stat(f);
  let r = await syncApply(d, id, { rename: [{ area: 'folder', path: 'm/one.txt', expect: { size: 99, mtime: st.mtime }, to: 'm/one (conflict).txt' }] });
  assert.deepEqual([r.results[0].ok, r.results[0].why], [false, 'changed']);
  r = await syncApply(d, id, { rename: [{ area: 'folder', path: 'm/one.txt', expect: st, to: 'm/two.txt' }] });
  assert.deepEqual([r.results[0].ok, r.results[0].why], [false, 'taken']);
  r = await syncApply(d, id, { rename: [{ area: 'folder', path: 'm/one.txt', expect: st, to: 'm/one (conflict, gpu box, 2026-11-27 10.00).txt' }] });
  assert.equal(r.results[0].ok, true);
  assert.deepEqual({ size: r.results[0].size, mtime: r.results[0].mtime }, st, 'a renamed file keeps its time');
  assert.ok(!fs.existsSync(f));
  r = await syncApply(d, id, { rename: [{ area: 'folder', path: 'm/two.txt', expect: stat(path.join(folder, 'm/two.txt')), to: '../out.txt' }] });
  assert.equal(r.results[0].ok, false);
});

test('apply: removals go to the Trash, only when as expected; one already gone is done', async () => {
  const f = path.join(folder, 'm/two.txt');
  const st = stat(f);
  let r = await syncApply(d, id, { remove: [{ area: 'folder', path: 'm/two.txt', expect: { size: st.size, mtime: st.mtime + 5 } }] });
  assert.deepEqual([r.results[0].ok, r.results[0].why], [false, 'changed']);
  assert.ok(fs.existsSync(f));
  const before = (await listTrash()).items.length;
  r = await syncApply(d, id, { remove: [{ area: 'folder', path: 'm/two.txt', expect: st }, { area: 'folder', path: 'never-was.txt', expect: st }, { area: 'folder', path: '../x', expect: st }] });
  assert.deepEqual(r.results.map((x) => x.ok), [true, true, false]);
  assert.ok(!fs.existsSync(f));
  const trash = await listTrash();
  assert.equal(trash.items.length, before + 1);
  assert.ok(trash.items.some((i) => i.name.endsWith('two.txt')));
  // A skill's SKILL.md going is in its history.
  const sk = path.join(spaceSkillsDir(id), 'tidy/SKILL.md');
  await syncApply(d, id, { remove: [{ area: 'skills', path: 'tidy/SKILL.md', expect: stat(sk) }] });
  assert.equal(history(db, 'tidy', id)[0].action, 'remove');
});

test('apply: details and notes added and forgotten', async () => {
  const key = memoryKeyOf(folder);
  const r = await syncApply(d, id, {
    details: { name: 'Thesis (final)', description: '' },
    addNotes: [
      { hash: noteHash('note', 'from the other side'), kind: 'note', text: 'from the other side', createdAt: 5000 },
      { hash: noteHash('note', 'duplicate'), kind: 'note', text: 'duplicate', createdAt: 5000 },
      { hash: 'x', kind: 'finding', text: 'no data', createdAt: 5000 },
    ],
    forgetNotes: [noteHash('note', 'The data is in /mnt')],
  });
  assert.equal(r.results.find((x) => x.op === 'details')!.ok, true);
  assert.equal(spaceById(db, id)!.name, 'Thesis (final)');
  assert.equal(spaceById(db, id)!.description, undefined);
  assert.equal(spaceById(db, id)!.color, 'green', 'what was not given stays');
  const texts = entries(db, { scope: 'repo', scopeKey: key, kinds: ['note'] }).map((e) => e.text).sort();
  assert.deepEqual(texts, ['duplicate', 'duplicate', 'from the other side'], 'the duplicate already there is not added again; the forgotten one is gone');
  assert.equal(r.results.find((x) => x.op === 'notes')!.ok, false, 'a finding without its data is said');
  const s = await syncState(d, id);
  assert.equal(s.notes.length, 2);
});

test('mark: set, unchanged, cleared only by its own link, PATCH leaves it alone', async () => {
  const mark = { link: 'l1', by: { id: 'm1', name: 'laptop' }, peer: { name: 'GPU box', project: 'sp2', projectName: 'Thesis' }, state: 'ok' as const, at: 5 };
  told.length = 0;
  assert.equal(setSyncMark(d, id, mark), true);
  assert.equal(spaceById(db, id)!.sync!.peer.name, 'GPU box');
  assert.ok(told.some((t) => t.id === 'spaces'));
  told.length = 0;
  assert.equal(setSyncMark(d, id, mark), false, 'the same mark is no change');
  assert.equal(told.length, 0);
  assert.throws(() => setSyncMark(d, id, { link: 'l1' }), /mark:/);
  assert.equal(setSyncMark(d, id, null, 'other-link'), false, 'not its link');
  assert.ok(spaceById(db, id)!.sync);
  const { updateSpace } = await import('../index.ts');
  updateSpace(db, id, { name: 'Thesis again', sync: null });
  assert.ok(spaceById(db, id)!.sync, 'a PATCH keeps it');
  assert.equal(setSyncMark(d, id, null, 'l1'), true);
  assert.equal(spaceById(db, id)!.sync, undefined);
});

test('links: nothing is read, written, renamed or removed through a symbolic link', async () => {
  // `escape` is a link to a folder outside the project; `selflink` a link to a file there, inside the project.
  put(outside, 'y.txt', 'outside y', 1_600_000_000_000);
  put(outside, 'deep/w.txt', 'outside w', 1_600_000_000_000);
  fs.symlinkSync(path.join(outside, 'y.txt'), path.join(folder, 'selflink.txt'));
  put(folder, 'real.txt', 'real', 1_600_000_000_000);
  const snapshot = () => JSON.stringify(everything(outside).map((f) => [f, fs.readFileSync(path.join(outside, f), 'utf8'), stat(path.join(outside, f))]));
  const before = snapshot();
  // A push to <link>/x, <link>/deep/new and onto the link itself.
  const src = path.join(tmp, 'src7');
  const r = await syncPush(d, id, send(src, [{ path: 'escape/x.txt', text: 'evil' }, { path: 'escape/deep/new.txt', text: 'evil' }, { path: 'selflink.txt', text: 'evil', expect: stat(path.join(folder, 'selflink.txt')) }]));
  assert.deepEqual(r.results.map((x) => [x.ok, x.why]), [[false, 'link'], [false, 'link'], [false, 'link']]);
  // A remove of <link>/y, a rename into <link>/z and one out of it, and of the link itself.
  const y = stat(path.join(outside, 'y.txt'));
  const a = await syncApply(d, id, {
    remove: [{ area: 'folder', path: 'escape/y.txt', expect: y }, { area: 'folder', path: 'selflink.txt', expect: y }],
    rename: [
      { area: 'folder', path: 'real.txt', expect: stat(path.join(folder, 'real.txt')), to: 'escape/z.txt' },
      { area: 'folder', path: 'escape/y.txt', expect: y, to: 'taken-from-outside.txt' },
    ],
  });
  assert.deepEqual(a.results.map((x) => [x.op, x.ok, x.why]), [['rename', false, 'link'], ['rename', false, 'link'], ['remove', false, 'link'], ['remove', false, 'link']]);
  // Hashes and pulls do not follow it either.
  const h = await syncHashes(d, id, [{ area: 'folder', path: 'escape/y.txt' }, { area: 'folder', path: 'real.txt' }]);
  assert.deepEqual([h.hashes['folder\nescape/y.txt'], h.hashes['folder\nreal.txt']], [null, sha('real')]);
  const seen: string[] = [];
  await readBundle(syncPull(d, id, [{ area: 'folder', path: 'escape/y.txt', ...stat(path.join(outside, 'y.txt')) }, { area: 'folder', path: 'real.txt', ...stat(path.join(folder, 'real.txt')) }]), {
    async file(rec, body) {
      seen.push(rec.path);
      await collect(body);
    },
  });
  assert.deepEqual(seen, ['real.txt']);
  // Nothing outside changed, nothing arrived inside, the real file is where it was.
  assert.equal(snapshot(), before);
  assert.ok(fs.existsSync(path.join(folder, 'real.txt')) && fs.lstatSync(path.join(folder, 'selflink.txt')).isSymbolicLink());
  assert.ok(!fs.existsSync(path.join(folder, 'taken-from-outside.txt')));
  assert.deepEqual(leftovers(folder, outside), []);
  fs.rmSync(path.join(folder, 'selflink.txt'));
});

test('nothing temporary was left anywhere', async () => {
  assert.deepEqual(leftovers(folder, outside, spaceSkillsDir(id).replace(/\/skills$/, '')), []);
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
console.log(`${passed}/${tests.length} sync-endpoint tests passed`);
process.exit(0);
