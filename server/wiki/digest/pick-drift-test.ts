// Script tests for which articles the helper is shown (title words and meaning, fused; words alone when meaning is
// off or the wiki is not indexed yet) and for article drift (articles that name files that changed since they were
// written: marked stale with no helper, a few revised a day, with the earlier text kept).
//   OUTDIR=dist/dev node scripts/build-server.mjs server/wiki/digest/pick-drift-test.ts
//   DATA_DIR=/tmp/hydor-test-pickdrift node dist/dev/pick-drift-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { setSettings } from '../../assistants/store.ts';
import { kvGet, kvSet, openDb } from '../../db.ts';
import { fillVectors, progress } from '../../knowledge/indexer.ts';
import { docsOf } from '../../knowledge/store.ts';
import { setEmbedderForTests } from '../../memory/embed.ts';
import { setEnabled, words } from '../../memory/store.ts';
import * as vec from '../../memory/vectors.ts';
import { createSpace } from '../../spaces/index.ts';
import { applyWikiChanges, readWiki } from '../core.ts';
import { ensureWikiKnowledge } from '../knowledge/index.ts';
import { wikiRoot } from '../roots.ts';
import { setWikiSettings } from '../settings/settings.ts';
import { forgetFileLists, gitHead } from './anchors.ts';
import { LIST_ARTICLES, listArticles } from './digest.ts';
import { DIFF_CHARS, DRIFT_EVERY_MS, REVISE_PER_DAY, checkWikiDrift, touched } from './drift.ts';
import { readSnapshot, readWhy, snapshotsOf } from './history.ts';
import { DRIFT_SYSTEM } from './plan.ts';
import { composeArticle, trackingOf } from './write.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-pickdrift-test-')));
const db = openDb(path.join(tmp, 'test.db'));
setSettings(db, { taskRoot: path.join(tmp, 'Naget') });
setWikiSettings(db, { enabled: true, hubPath: path.join(tmp, 'hub') });

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

// A made-up embedder, as the knowledge tests have: each word a fixed random direction (synonyms share one).
const SAME: Record<string, string> = { holiday: 'leave', vacation: 'leave' };
function direction(c: string): Float32Array {
  let s = 0;
  for (const ch of c) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = (i: number) => {
    let h = (s ^ Math.imul(i + 1, 0x9e3779b9)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32 - 0.5;
  };
  return new Float32Array(vec.DIM).map((_, i) => rnd(3 * i) + rnd(3 * i + 1) + rnd(3 * i + 2));
}
const fake = (text: string) => {
  const v = new Float32Array(vec.DIM);
  for (const w of words(text)) {
    const d = direction(SAME[w] ?? w);
    for (let i = 0; i < vec.DIM; i++) v[i] += d[i];
  }
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
};
vec.setCodebookForTests(new Float32Array(vec.DIM * 16).map((_, i) => -0.12 + ((i % 16) * 0.24) / 15));

const put = (root: string, rel: string, title: string, summary: string, body: string, extra: Partial<Parameters<typeof composeArticle>[2]> = {}) =>
  applyWikiChanges(root, [{ path: rel, content: composeArticle(null, body, { title, summary, source: 'raw/articles/s.md', now: Date.UTC(2026, 10, 1), ...extra }), expectedSha256: null }]);

// ---- picking ----------------------------------------------------------------------------------------------------

const alpha = (() => {
  fs.mkdirSync(path.join(tmp, 'alpha'));
  return createSpace(db, { name: 'Alpha', folder: path.join(tmp, 'alpha') });
})();
const aroot = wikiRoot(db, alpha.id, { create: true })!;
for (let i = 0; i < 25; i++) put(aroot, `wiki/topic-${i}.md`, `Topic zebra${i} notes`, `What the zebra${i} notes cover.`, `# Topic zebra${i} notes\n\nSomething about zebra${i}.`);
put(aroot, 'wiki/zz-leave.md', 'Holiday rules', 'How leave days are given.', '# Holiday rules\n\nLeave days leave policy.');
put(aroot, 'wiki/unrelated.md', 'Unrelated', '', '# Unrelated\n\nThe first line is shown when there is no summary.');
const docWords = Array.from({ length: 25 }, (_, i) => `zebra${i}`).join(' ');

test('with meaning off: the title words alone rank the articles; the best 20, with summaries, and how many more', async () => {
  kvSet(db, 'memory.meaning', '0');
  const l = await listArticles(db, aroot, alpha.id, { title: 'Zebras', text: `${docWords} and more about zebra3 and zebra4` });
  assert.equal(LIST_ARTICLES, 20);
  assert.equal(l.lines.length, 20);
  assert.equal(l.more, 27 - 20);
  assert.equal(l.all.size, 27);
  assert.deepEqual(l.lines.slice(0, 2).map((x) => x.path), ['wiki/topic-0.md', 'wiki/topic-1.md'], 'equal scores by path');
  assert.equal(l.lines[0].first, 'What the zebra0 notes cover.');
  assert.ok(!l.lines.some((x) => x.path === 'wiki/zz-leave.md'), 'nothing in the words points at it');
  const none = await listArticles(db, aroot, alpha.id, { title: 'x', text: 'nothing in common' });
  assert.equal(none.lines.length, 20);
  assert.ok(none.lines.some((x) => x.path === 'wiki/unrelated.md' && x.first === 'The first line is shown when there is no summary.') || none.more === 7);
});

test('with meaning on but the wiki not indexed yet: the words alone, no error', async () => {
  kvSet(db, 'memory.meaning', '1');
  setEmbedderForTests(async (texts) => texts.map(fake));
  const l = await listArticles(db, aroot, alpha.id, { title: 'Vacation', text: 'vacation zebra1 zebra2 zebra3' });
  assert.equal(l.lines.length, 20);
  assert.ok(!l.lines.some((x) => x.path === 'wiki/zz-leave.md'));
});

test('with meaning on and the wiki indexed: an article that shares no word but the meaning is shown among the best', async () => {
  const binding = ensureWikiKnowledge(db, { root: aroot, space: alpha.id });
  for (let i = 0; i < 200 && (docsOf(db, binding.base).length < 27 || progress.size); i++) await new Promise((r) => setTimeout(r, 25));
  assert.ok(docsOf(db, binding.base).length >= 27);
  await fillVectors(db);
  const l = await listArticles(db, aroot, alpha.id, { title: 'Vacation', text: 'vacation zebra1 zebra2 zebra3' });
  assert.equal(l.lines.length, 20);
  const at = l.lines.findIndex((x) => x.path === 'wiki/zz-leave.md');
  assert.ok(at >= 0 && at <= 5, `the meaning match is among the first (at ${at}); without meaning it is not shown at all`);
  assert.equal(l.lines[at].first, 'How leave days are given.');
  assert.ok(l.more > 0);
});

test('with meaning search off again, the same call gives the words alone', async () => {
  kvSet(db, 'memory.meaning', '0');
  const l = await listArticles(db, aroot, alpha.id, { title: 'Vacation', text: 'vacation zebra1 zebra2 zebra3' });
  assert.ok(!l.lines.some((x) => x.path === 'wiki/zz-leave.md'));
});

// ---- drift ------------------------------------------------------------------------------------------------------

let clock = Date.UTC(2026, 10, 17, 9, 0, 0);
const now = () => clock;
const asked: { system: string; prompt: string }[] = [];
let answer: (prompt: string, n: number) => unknown = () => ({ status: 'keep' });
const ask = async (q: { system: string; prompt: string }) => {
  asked.push(q);
  assert.equal(q.system, DRIFT_SYSTEM);
  return answer(q.prompt, asked.length);
};

/** A project that is a git repository; returns its wiki root and a way to commit. */
function project(name: string, files: Record<string, string>) {
  const dir = path.join(tmp, name);
  fs.mkdirSync(dir);
  const git = (...a: string[]) => execFileSync('git', ['-C', dir, '-c', 'user.name=T', '-c', 'user.email=t@e.x', ...a], { stdio: 'pipe' }).toString();
  execFileSync('git', ['init', '-q', dir]);
  const write = (f: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), text);
  };
  for (const [f, t] of Object.entries(files)) write(f, t);
  git('add', '-A');
  git('commit', '-q', '-m', 'first');
  const space = createSpace(db, { name, folder: dir });
  const root = wikiRoot(db, space.id, { create: true })!;
  // git's answers are kept for a few seconds (anchors.ts): a test that commits forgets them, as minutes would pass in use.
  const commit = (f: string, text: string) => {
    write(f, text);
    git('add', '-A');
    git('commit', '-q', '-m', `change ${f}`);
    forgetFileLists();
  };
  return { dir, space, root, commit, git };
}
const updates = (space: string) => db.prepare('select document, articles, error from wiki_updates where space = ? order by id').all(space) as { document: string; articles: string; error: string | null }[];

test('anchors that a changed file touches: the file itself, or anything under a directory', () => {
  assert.deepEqual(touched(['a/b.ts', 'c/', 'd.ts'], ['a/b.ts', 'c/x/y.ts', 'e.ts']), ['a/b.ts', 'c/']);
  assert.deepEqual(touched(['a/b.ts'], ['a/b.tsx']), []);
});

test('stale articles are marked with no helper; the helper revises or keeps them; what it replaced is kept and logged', async () => {
  const p = project('drift', { 'server/billing.ts': '// v1\n', 'server/other.ts': '// o\n', 'web/a.ts': '// w\n' });
  const head1 = (await gitHead(p.dir))!;
  const a = (rel: string, title: string, anchors: string[], body = `# ${title}\n\nInvoices are sent weekly. Refunds take 5 days.\n\nVAT is added at checkout.`) => put(p.root, rel, title, `About ${title}.`, body, { anchors, commit: head1 });
  a('wiki/billing.md', 'Billing', ['server/billing.ts']);
  a('wiki/other.md', 'Other', ['server/other.ts']);
  a('wiki/web.md', 'Web', ['web/']);
  p.commit('server/billing.ts', '// v2: invoices are monthly now\n');
  p.commit('web/b.ts', '// new web file\n');
  const head2 = (await gitHead(p.dir))!;
  // First the helper is not there: the articles are still marked.
  let down = true;
  const failing = async () => {
    throw new Error('The helper model is not there');
  };
  const before = readWiki(p.root, 'wiki/billing.md').content;
  const first = await checkWikiDrift(db, { ask: failing, now, force: true, onUpdate: () => {} });
  assert.equal(first.marked, 2);
  assert.deepEqual(trackingOf(readWiki(p.root, 'wiki/billing.md').content).stale, ['server/billing.ts']);
  assert.deepEqual(trackingOf(readWiki(p.root, 'wiki/web.md').content).stale, ['web/']);
  assert.deepEqual(trackingOf(readWiki(p.root, 'wiki/other.md').content).stale, []);
  assert.equal(readWiki(p.root, 'wiki/billing.md').content.replace(/stale:\n {2}- server\/billing\.ts\n/, ''), before, 'only the front matter changed');
  assert.match(updates(p.space.id)[0].error ?? '', /helper model is not there/);
  void down;
  // Then it answers: the billing article is revised, the web article is still true.
  answer = (prompt) => {
    if (/Article wiki\/web\.md/.test(prompt)) return { status: 'keep' };
    assert.match(prompt, /Article wiki\/billing\.md[\s\S]*<article>[\s\S]*Invoices are sent weekly/);
    assert.match(prompt, /Files it names that changed since: server\/billing\.ts/);
    assert.match(prompt, /<diff>[\s\S]*\+\/\/ v2: invoices are monthly now[\s\S]*<\/diff>/);
    assert.doesNotMatch(prompt, /new web file[\s\S]*<\/diff>[\s\S]*Article/);
    return {
      status: 'revise',
      summary: 'About billing (monthly invoices).',
      content: '# Billing\n\nInvoices are sent monthly. Refunds take 5 days.\n\nVAT is added at checkout.',
      removed: [{ text: 'Invoices are sent weekly.', why: `no longer true as of ${head2.slice(0, 7)}` }],
    };
  };
  asked.length = 0;
  clock += 60_000;
  const second = await checkWikiDrift(db, { ask, now, force: true });
  assert.deepEqual([second.revised, second.marked], [1, 1]);
  const billing = readWiki(p.root, 'wiki/billing.md').content;
  assert.match(billing, /Invoices are sent monthly\./);
  assert.deepEqual(trackingOf(billing).stale, []);
  assert.equal(trackingOf(billing).commit, head2);
  assert.match(billing, /summary: "About billing \(monthly invoices\)\."/);
  const web = trackingOf(readWiki(p.root, 'wiki/web.md').content);
  assert.deepEqual([web.stale, web.commit], [[], head2], 'kept: written against today’s commit');
  const snaps = snapshotsOf(p.root, 'wiki/billing.md');
  assert.equal(snaps.length, 1);
  assert.match(readSnapshot(p.root, snaps[0].path), /Invoices are sent weekly\./);
  assert.match(readWhy(p.root, snaps[0].path).removed[0].why, /^no longer true as of [0-9a-f]{7}$/);
  assert.match(readWiki(p.root, 'log.md').content, /- 2026-11-17 · code changes since [0-9a-f]{7} → revised \[Billing\]\(wiki\/billing\.md\): replaced 1 statement \(earlier text kept\)/);
  assert.match(readWiki(p.root, 'index.md').content, /\[Billing\]\(wiki\/billing\.md\) — About billing \(monthly invoices\)\./);
  assert.deepEqual(snapshotsOf(p.root, 'wiki/web.md'), [], 'a kept article is not rewritten, so no snapshot');
  assert.equal(updates(p.space.id).at(-1)!.document, 'Code changes');
  assert.deepEqual(JSON.parse(updates(p.space.id).at(-1)!.articles), ['wiki/billing.md']);
  // Nothing is stale now: the next check does not ask the helper.
  asked.length = 0;
  clock += 60_000;
  await checkWikiDrift(db, { ask, now, force: true });
  assert.equal(asked.length, 0);
});

test('once a day for each project; and not for a project that is not a git repository, or with memory off', async () => {
  const p = project('daily', { 'src/x.ts': '1\n' });
  const head = (await gitHead(p.dir))!;
  put(p.root, 'wiki/x.md', 'X', 'About x.', '# X\n\nIt is in src/x.ts and does things.', { anchors: ['src/x.ts'], commit: head });
  p.commit('src/x.ts', '2\n');
  asked.length = 0;
  answer = () => ({ status: 'keep' });
  clock += DRIFT_EVERY_MS;
  await checkWikiDrift(db, { ask, now });
  assert.equal(asked.length, 1);
  assert.ok(kvGet(db, `wiki.drift.checked.${p.space.id}`));
  // Stale again, but it was looked at a minute ago.
  p.commit('src/x.ts', '3\n');
  clock += 60_000;
  await checkWikiDrift(db, { ask, now });
  assert.equal(asked.length, 1);
  clock += DRIFT_EVERY_MS;
  await checkWikiDrift(db, { ask, now });
  assert.equal(asked.length, 2);
  // A folder that is not a repository: nothing.
  const lone = path.join(tmp, 'lone');
  fs.mkdirSync(lone);
  const ls = createSpace(db, { name: 'Lone', folder: lone });
  put(wikiRoot(db, ls.id, { create: true })!, 'wiki/y.md', 'Y', 'About y.', '# Y\n\nIt names y.ts.', { anchors: ['y.ts'], commit: 'abcdef1234' });
  clock += DRIFT_EVERY_MS;
  p.commit('src/x.ts', '4\n');
  await checkWikiDrift(db, { ask, now });
  assert.equal(asked.length, 3, 'only the repository was looked at');
  setEnabled(db, false);
  p.commit('src/x.ts', '5\n');
  clock += DRIFT_EVERY_MS;
  await checkWikiDrift(db, { ask, now });
  assert.equal(asked.length, 3, 'memory off');
  setEnabled(db, true);
});

test('at most five stale articles a day are revised; one the helper cannot revise does not keep the others waiting; the diff is cut', async () => {
  const p = project('many', { 'lib/core.ts': 'v1\n' });
  const head = (await gitHead(p.dir))!;
  for (let i = 1; i <= 7; i++) put(p.root, `wiki/a${i}.md`, `A${i}`, `About a${i}.`, `# A${i}\n\nUses lib/core.ts for thing ${i}.`, { anchors: ['lib/core.ts'], commit: head });
  p.commit('lib/core.ts', `v2\n${'+ a long line of change\n'.repeat(500)}`);
  asked.length = 0;
  const seen: string[] = [];
  answer = (prompt) => {
    seen.push(/Article (wiki\/a\d\.md)/.exec(prompt)![1]);
    const diff = /<diff>\n([\s\S]*)\n<\/diff>/.exec(prompt)![1];
    assert.ok(diff.length <= DIFF_CHARS + 5, `the diff is cut: ${diff.length}`);
    return { status: 'revise', content: 'x' };
  };
  clock += DRIFT_EVERY_MS;
  const day1 = await checkWikiDrift(db, { ask, now });
  assert.equal(seen.length, REVISE_PER_DAY);
  assert.equal(day1.revised, 0);
  assert.deepEqual(seen.sort(), ['wiki/a1.md', 'wiki/a2.md', 'wiki/a3.md', 'wiki/a4.md', 'wiki/a5.md']);
  assert.match(updates(p.space.id).at(-1)!.error ?? '', /left as it was/);
  // The refused ones are still stale and untouched; the next day the two never tried go first.
  assert.deepEqual(trackingOf(readWiki(p.root, 'wiki/a1.md').content).stale, ['lib/core.ts']);
  assert.equal(snapshotsOf(p.root, 'wiki/a1.md').length, 0);
  seen.length = 0;
  asked.length = 0;
  clock += DRIFT_EVERY_MS;
  await checkWikiDrift(db, { ask, now });
  assert.deepEqual(seen.slice(0, 2).sort(), ['wiki/a6.md', 'wiki/a7.md']);
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}`);
    console.log(e);
    process.exitCode = 1;
  }
}
console.log(`Wiki picking and drift: ${passed} of ${tests.length} tests passed`);
setEmbedderForTests(null);
