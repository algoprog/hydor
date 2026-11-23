// Checks that a wiki on a slow disk never blocks the server: wikiActiveChecker (fs.promises, what files share asked once)
// gives wikiFileActive's answer on a fixture of every kind of file; browseWiki and areaArticles make no synchronous
// filesystem call, walk only the trees asked for (areaArticles never goes under raw/ or output/) and read each file once;
// the areas line a session start gets is kept for 10 minutes, waited for at most a moment and walked once at a time.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/wiki/walk-test.ts && DATA_DIR=/tmp/hydor-test-walk node dist/dev/walk-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { browseWiki } from './browse.ts';
import { areaArticles } from './areas/articles.ts';
import { emptyRegistry, registryText } from './areas/registry.ts';
import { areasLine, areasLineForSpawn } from './areas/tend.ts';
import { wikiActiveChecker, wikiFileActive } from './knowledge/bindings.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-wiki-walk-')));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const put = (root: string, rel: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
};
const doc = (title: string, extra = '') => `---\ntitle: ${JSON.stringify(title)}\n${extra}---\n\n# ${title}\n\nText of ${title}.\n`;

/** A wiki with one of each kind of file the checks tell apart. */
function fixture(name: string): string {
  const root = path.join(temp, name);
  put(root, 'wiki/a.md', doc('Alpha'));
  put(root, 'wiki/sub/b.md', doc('Beta'));
  put(root, 'wiki/.hidden/c.md', doc('Hidden folder'));
  put(root, 'wiki/retired.md', doc('Retired', 'document_status: archived\n'));
  put(root, 'wiki/stub.md', doc('Stub', 'redirect: wiki/a.md\n'));
  put(root, 'wiki/off/config.md', doc('Off', 'document_status: retired\n'));
  put(root, 'wiki/off/d.md', doc('Under an inactive config.md'));
  put(root, 'wiki/on/config.md', doc('On'));
  put(root, 'wiki/on/e.md', doc('Under an active config.md'));
  put(root, 'wiki/note.txt', 'plain text');
  put(root, 'wiki/pic.png', 'not really a picture');
  put(root, 'projects/other/wiki/x.md', doc('The hub’s other project'));
  put(root, 'topics/live/f.md', doc('A live topic'));
  put(root, 'topics/old/g.md', doc('An archived topic'));
  put(root, 'topics/old/deep/h.md', doc('Deeper in an archived topic'));
  put(root, 'wikis.json', JSON.stringify({ wikis: { live: { status: 'active' }, old: { status: 'Archived' } } }));
  put(root, 'raw/s.md', doc('Source'));
  put(root, 'output/projects/p/plan.md', doc('Plan'));
  put(root, 'output/evidence/p/ev.md', doc('Evidence'));
  fs.symlinkSync(path.join(root, 'wiki/sub'), path.join(root, 'wiki/linkdir'));
  fs.symlinkSync(path.join(root, 'wiki/a.md'), path.join(root, 'wiki/linkfile.md'));
  fs.symlinkSync(path.join(root, 'wiki/a.md'), path.join(root, 'wiki/on/config.md.lnk'));
  put(root, 'wiki/linkcfg/z.md', doc('Under a config.md that is a link'));
  fs.symlinkSync(path.join(root, 'wiki/on/config.md'), path.join(root, 'wiki/linkcfg/config.md'));
  put(temp, `${name}-outside.md`, doc('Outside'));
  return root;
}
const allFiles = (root: string): string[] => {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      out.push(p);
      if (e.isDirectory()) walk(p);
    }
  };
  walk(root);
  return out;
};

test('the activity check gives wikiFileActive’s answer for every kind of file', async () => {
  const root = fixture('kinds');
  const check = wikiActiveChecker(root);
  const files = [...allFiles(root), root, path.join(root, 'wiki/missing.md'), path.join(temp, 'kinds-outside.md'), path.join(root, '..', 'kinds-outside.md'), path.join(root, 'wiki', '..', 'wiki', 'a.md')];
  for (const f of files) assert.equal(await check(f), wikiFileActive(root, f), path.relative(root, f));
  // The fixture exercises each rule: these are the answers, not only the same ones.
  const yes = ['wiki/a.md', 'wiki/sub/b.md', 'wiki/on/e.md', 'wiki/note.txt', 'topics/live/f.md', 'raw/s.md', 'output/projects/p/plan.md'];
  const no = ['wiki/.hidden/c.md', 'wiki/retired.md', 'wiki/stub.md', 'wiki/off/d.md', 'wiki/linkdir/b.md', 'wiki/linkfile.md', 'wiki/linkcfg/z.md', 'projects/other/wiki/x.md', 'topics/old/g.md', 'topics/old/deep/h.md', 'wiki/missing.md', 'wiki'];
  for (const rel of yes) assert.equal(await check(path.join(root, rel)), true, rel);
  for (const rel of no) assert.equal(await check(path.join(root, rel)), false, rel);
  assert.equal(await check(path.join(temp, 'kinds-outside.md')), false, 'outside the root');
  // The text the caller has read is used: no read, and the same rules.
  assert.equal(await check(path.join(root, 'wiki/a.md'), doc('Alpha')), true);
  assert.equal(await check(path.join(root, 'wiki/a.md'), doc('Alpha', 'document_status: retired\n')), false);
  assert.equal(await check(path.join(root, 'wiki/a.md'), doc('Alpha', 'redirect: wiki/sub/b.md\n')), false);
});

test('an inactive config.md at the root, and a registry that is not JSON, hide what wikiFileActive hides', async () => {
  const off = fixture('rootoff');
  put(off, 'config.md', doc('Root', 'document_status: superseded\n'));
  const broken = fixture('badregistry');
  put(broken, 'wikis.json', '{ not json');
  const linked = fixture('rootlink');
  fs.symlinkSync(path.join(linked, 'wiki/a.md'), path.join(linked, 'config.md'));
  const dangling = fixture('rootdangling');
  fs.symlinkSync(path.join(temp, 'nowhere.md'), path.join(dangling, 'config.md'));
  for (const root of [off, broken, linked, dangling]) {
    const check = wikiActiveChecker(root);
    for (const f of allFiles(root)) assert.equal(await check(f), wikiFileActive(root, f), `${path.basename(root)}: ${path.relative(root, f)}`);
  }
  assert.equal(await wikiActiveChecker(off)(path.join(off, 'wiki/a.md')), false);
  assert.equal(await wikiActiveChecker(broken)(path.join(broken, 'topics/live/f.md')), false);
  assert.equal(await wikiActiveChecker(broken)(path.join(broken, 'wiki/a.md')), true, 'the registry only matters under topics/');
  assert.equal(await wikiActiveChecker(linked)(path.join(linked, 'wiki/a.md')), false);
  assert.equal(await wikiActiveChecker(dangling)(path.join(dangling, 'wiki/a.md')), true, 'a link to nothing is no config.md');
});

/** Runs `job` with each synchronous filesystem call it would make replaced by one that throws; the calls made are listed. */
async function withoutSyncCalls<T>(job: () => Promise<T>): Promise<{ result: T; sync: string[] }> {
  const names = ['readdirSync', 'readFileSync', 'statSync', 'lstatSync', 'existsSync', 'opendirSync'] as const;
  const original = Object.fromEntries(names.map((n) => [n, fs[n]]));
  const sync: string[] = [];
  for (const n of names) (fs as unknown as Record<string, unknown>)[n] = (p: unknown) => { sync.push(`${n}(${String(p)})`); throw new Error(`${n} blocks the server`); };
  try {
    return { result: await job(), sync };
  } finally {
    for (const n of names) (fs as unknown as Record<string, unknown>)[n] = original[n];
  }
}

/** Runs `job` and lists the folders asked of fs.promises.readdir / opendir, and the files given to readFile / stat / lstat. */
async function recording<T>(job: () => Promise<T>): Promise<{ result: T; dirs: string[]; reads: string[]; stats: string[] }> {
  const dirs: string[] = [];
  const reads: string[] = [];
  const stats: string[] = [];
  const p = fs.promises as unknown as Record<string, (...a: unknown[]) => unknown>;
  const original = { readdir: p.readdir, opendir: p.opendir, readFile: p.readFile, stat: p.stat, lstat: p.lstat };
  const wrap = (name: keyof typeof original, into: string[]) => (p[name] = (file: unknown, ...rest: unknown[]) => (into.push(String(file)), original[name](file, ...rest)));
  wrap('readdir', dirs);
  wrap('opendir', dirs);
  wrap('readFile', reads);
  wrap('stat', stats);
  wrap('lstat', stats);
  try {
    return { result: await job(), dirs, reads, stats };
  } finally {
    Object.assign(p, original);
  }
}

test('browseWiki and areaArticles make no synchronous filesystem call', async () => {
  const root = fixture('async');
  const { result, sync } = await withoutSyncCalls(async () => {
    assert.throws(() => fs.statSync(root), /blocks the server/, 'the stand-ins are in place');
    return { browse: await browseWiki(root), articles: await areaArticles(root) };
  });
  assert.deepEqual(sync, [`statSync(${root})`], 'only the probe');
  assert.deepEqual(result.browse.articles.map((a) => a.path), ['wiki/a.md', 'wiki/on/config.md', 'wiki/on/e.md', 'wiki/sub/b.md']);
  assert.deepEqual(result.browse.sources.map((a) => a.path), ['raw/s.md']);
  assert.deepEqual(result.browse.plans.map((a) => a.path), ['output/projects/p/plan.md', 'output/evidence/p/ev.md']);
  assert.equal(result.browse.truncated, false);
  assert.equal(result.browse.articles[0].title, 'Alpha');
  assert.equal(result.browse.articles[0].summary, undefined);
  assert.deepEqual(result.articles.map((a) => a.path), ['wiki/a.md', 'wiki/on/config.md', 'wiki/on/e.md', 'wiki/sub/b.md']);
  assert.match(result.articles[0].content, /Text of Alpha/);
});

test('only the trees asked for are walked, and areaArticles reads each article once', async () => {
  const root = fixture('trees');
  const articles = await recording(() => areaArticles(root));
  const under = (list: string[], dir: string) => list.filter((p) => p === path.join(root, dir) || p.startsWith(path.join(root, dir) + path.sep));
  assert.equal(articles.result.length, 4);
  for (const dir of ['raw', 'output', 'topics', 'projects']) {
    assert.deepEqual([under(articles.dirs, dir), under(articles.reads, dir)], [[], []], `nothing is read under ${dir}/`);
  }
  // (A folder's config.md is also read for the rule it sets on its folder, once for the folder.)
  for (const a of articles.result) assert.equal(articles.reads.filter((p) => p === path.join(root, a.path)).length, a.path.endsWith('/config.md') ? 2 : 1, `${a.path} is read once`);
  const sources = await recording(() => browseWiki(root, { trees: ['sources'] }));
  assert.deepEqual(sources.result.sources.map((e) => e.path), ['raw/s.md']);
  assert.deepEqual(sources.result.articles, []);
  assert.deepEqual(under(sources.dirs, 'wiki'), []);
  const plans = await recording(() => browseWiki(root, { trees: ['plans'] }));
  assert.equal(plans.result.plans.length, 2);
  assert.deepEqual([under(plans.dirs, 'wiki'), under(plans.dirs, 'raw')], [[], []]);
});

test('a link to a tree is never entered, and a wiki without a tree lists nothing of it', async () => {
  const root = fixture('treelink');
  fs.rmSync(path.join(root, 'raw'), { recursive: true });
  put(temp, 'treelink-elsewhere/s.md', doc('Elsewhere'));
  fs.symlinkSync(path.join(temp, 'treelink-elsewhere'), path.join(root, 'raw'));
  const view = await browseWiki(root);
  assert.deepEqual(view.sources, []);
  assert.deepEqual((await browseWiki(path.join(temp, 'no-such-wiki'))).articles, []);
});

test('the walk stops at 5000 entries and says so', async () => {
  const root = path.join(temp, 'big');
  fs.mkdirSync(path.join(root, 'wiki'), { recursive: true });
  for (let i = 0; i < 5003; i++) fs.writeFileSync(path.join(root, 'wiki', `n${String(i).padStart(5, '0')}.txt`), 'x');
  fs.writeFileSync(path.join(root, 'wiki', 'a.md'), doc('First'));
  const view = await browseWiki(root);
  assert.equal(view.truncated, true);
  assert.deepEqual(view.articles.map((a) => a.path), ['wiki/a.md']);
});

test('what the checks share is asked once for many files', async () => {
  const root = fixture('shared');
  put(root, 'config.md', doc('Root'));
  for (let i = 0; i < 20; i++) put(root, `topics/live/n${i}.md`, doc(`N${i}`));
  const { result, reads } = await recording(() => browseWiki(root, { trees: ['articles'] }));
  assert.equal(result.articles.length, 4);
  const check = wikiActiveChecker(root);
  const second = await recording(async () => {
    for (let i = 0; i < 20; i++) assert.equal(await check(path.join(root, `topics/live/n${i}.md`)), true);
  });
  assert.equal(second.reads.filter((p) => p === path.join(root, 'config.md')).length, 1, 'the root’s config.md once');
  assert.equal(second.reads.filter((p) => p === path.join(root, 'wikis.json')).length, 1, 'the registry once');
  assert.equal(second.reads.filter((p) => p.endsWith('config.md')).length, 1, 'no folder’s config.md more than once');
  assert.equal(reads.filter((p) => p === path.join(root, 'config.md')).length, 1);
  assert.equal(second.stats.filter((p) => p === path.join(root, 'topics')).length, 1, 'a folder’s link check once');
});

test('the areas line a session start gets: kept, waited for briefly, walked once at a time', async () => {
  const root = path.join(temp, 'areas');
  const reg = emptyRegistry();
  reg.areas.unshift({ id: 'cats', name: 'Cats', about: '', parent: null, aliases: [], createdAt: '', updatedAt: '' });
  put(root, '.structure/areas.json', registryText(reg));
  for (let i = 0; i < 3; i++) put(root, `wiki/c${i}.md`, doc(`Cat ${i}`, 'areas: [cats]\n'));
  const line = 'Wiki areas: Cats (3)';
  assert.equal(await areasLine(root), line);
  // A slow disk: a first start does not wait for it, and the walk goes on in the background for the next one.
  const p = fs.promises as unknown as Record<string, (...a: unknown[]) => unknown>;
  const readdir = p.readdir;
  let walks = 0;
  p.readdir = async (dir: unknown, ...rest: unknown[]) => {
    if (dir === path.join(root, 'wiki')) { walks++; await new Promise((r) => setTimeout(r, 400)); }
    return readdir(dir, ...rest);
  };
  try {
    const began = Date.now();
    const [first, second] = await Promise.all([areasLineForSpawn(root, { waitMs: 50 }), areasLineForSpawn(root, { waitMs: 50 })]);
    assert.ok(Date.now() - began < 300, 'did not wait for the slow disk');
    assert.deepEqual([first, second], [null, null], 'no line yet');
    assert.equal(walks, 1, 'one walk at a time');
    assert.equal(await areasLineForSpawn(root, { waitMs: 5000 }), line, 'the walk that was left running gave the line');
    assert.equal(walks, 1, 'and no other was started');
    // Kept: no walk for the next sessions.
    assert.equal(await areasLineForSpawn(root), line);
    assert.equal(walks, 1);
    // Old enough: a new walk, and a slow one leaves the session the line it had.
    const later = Date.now() + 11 * 60_000;
    assert.equal(await areasLineForSpawn(root, { waitMs: 50, now: later }), line, 'the kept line while the new one is walked');
    assert.equal(walks, 2);
    await new Promise((r) => setTimeout(r, 500));
  } finally {
    p.readdir = readdir;
  }
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (e) {
    console.error(`not ok - ${name}`);
    console.error(e);
    process.exitCode = 1;
    break;
  }
}
fs.rmSync(temp, { recursive: true, force: true });
console.log(`${passed}/${tests.length} passed`);
