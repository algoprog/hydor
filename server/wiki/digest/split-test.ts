// Script tests for splitting a long wiki article into a hub and parts (with a stand-in helper): what is accepted
// (at least 90% of the text, in its words), what is refused and what then happens to the article, the snapshot, the
// log, the links, and where the new text goes.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/wiki/digest/split-test.ts
//   DATA_DIR=/tmp/hydor-test-split node dist/dev/split-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setSettings } from '../../assistants/store.ts';
import { openDb } from '../../db.ts';
import { createSpace } from '../../spaces/index.ts';
import { browseWiki } from '../browse.ts';
import { applyWikiChanges, checkWiki, readWiki, wikiHash } from '../core.ts';
import { wikiRoot } from '../roots.ts';
import { setWikiSettings } from '../settings/settings.ts';
import { digestText } from './digest.ts';
import { readSnapshot, snapshotsOf } from './history.ts';
import { PLAN_SYSTEM, SPLIT_SYSTEM } from './plan.ts';
import { SPLIT_AT, checkSplit, wordsKept } from './split.ts';
import { composeArticle, splitFront, trackingOf } from './write.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-split-test-')));
const db = openDb(path.join(tmp, 'test.db'));
setSettings(db, { taskRoot: path.join(tmp, 'Naget') });
setWikiSettings(db, { enabled: true, hubPath: path.join(tmp, 'hub') });
fs.mkdirSync(path.join(tmp, 'app'));
const space = createSpace(db, { name: 'App', folder: path.join(tmp, 'app') });
const root = wikiRoot(db, space.id, { create: true })!;

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

/** A section of a long article: a heading and distinct sentences, about `size` characters. */
const section = (name: string, size: number) => {
  let t = `## ${name}\n\n`;
  for (let i = 1; t.length < size; i++) t += `The ${name.toLowerCase()} rule number ${i} says that item ${name.toLowerCase()}${i} is handled by team ${i % 7} within ${i * 3} days.\n\n`;
  return t.trim();
};
const SECTIONS = ['Billing', 'Shipping', 'Returns', 'Support'].map((n) => section(n, 3300));
const bodyOfLong = `# Operations\n\nHow the shop is run.\n\n${SECTIONS.join('\n\n')}`;
const front = (text: string) => composeArticle(null, text, { title: 'Operations', source: 'raw/articles/old.md', now: Date.UTC(2026, 10, 1), summary: 'How the shop is run.' });
const put = (rel: string, content: string) => {
  let sha: string | null = null;
  try {
    sha = readWiki(root, rel).sha256;
  } catch {
    /* new */
  }
  applyWikiChanges(root, [{ path: rel, content, expectedSha256: sha }]);
};

const asked: { system: string; prompt: string }[] = [];
let plan: unknown = { update: ['wiki/operations.md'], create: [], notes: [] };
let split: (prompt: string) => unknown = () => ({});
let write: (prompt: string) => unknown = () => ({ articles: [] });
const ask = async (q: { system: string; prompt: string }) => {
  asked.push(q);
  if (q.system === PLAN_SYSTEM) return plan;
  if (q.system === SPLIT_SYSTEM) return split(q.prompt);
  return write(q.prompt);
};
let clock = Date.UTC(2026, 10, 17, 9, 0, 0);
const now = () => (clock += 60_000);
let n = 0;
const digest = async (text: string) => {
  n++;
  return digestText(db, ask, { space: space.id, base: 'docs', title: `Billing update ${n}`, path: `/d/${n}.md`, origin: `knowledge:Docs/${n}.md`, text, cut: false, kind: 'document', notes: false, hash: wikiHash(text), now });
};
const lastError = () => (db.prepare('select error from wiki_updates where space = ? order by id desc limit 1').get(space.id) as { error?: string } | undefined)?.error ?? '';

const goodSplit = () => ({
  hub: { summary: 'How the shop is run: billing, shipping, returns and support.', content: '# Operations\n\nHow the shop is run. Each part below covers one area.\n\n- [Billing](operations/billing.md) — invoices and payments\n- [Shipping](operations/shipping.md)' },
  parts: ['Billing', 'Shipping', 'Returns', 'Support'].map((t, i) => ({ title: t, summary: `The ${t.toLowerCase()} rules.`, content: `# ${t}\n\n${SECTIONS[i]}` })),
  target: 1,
});

test('words kept: moved and rewrapped text counts, a summary does not', () => {
  const body = SECTIONS.join('\n\n');
  assert.ok(wordsKept(body, SECTIONS.slice().reverse().join('\n\n')) > 0.99);
  assert.ok(wordsKept(body, body.replace(/\n\n/g, ' ')) > 0.99);
  assert.ok(wordsKept(body, 'The shop handles billing, shipping, returns and support in teams.') < 0.1);
});

test('a long article is split: hub at the same path, parts beside it, the text kept, the update goes to the chosen part', async () => {
  put('wiki/operations.md', front(bodyOfLong));
  const original = readWiki(root, 'wiki/operations.md').content;
  assert.ok(splitFront(original).body.length > SPLIT_AT);
  split = (prompt) => {
    assert.match(prompt, /<article>[\s\S]*billing rule number 1 [\s\S]*<\/article>/);
    assert.match(prompt, /New document "Billing update 1"[\s\S]*<document>/);
    return goodSplit();
  };
  write = (prompt) => {
    // The update is for the part the split named (target 1: the first part, Billing).
    assert.match(prompt, /Existing article wiki\/operations\/billing\.md/, asked.map((a) => a.system.slice(0, 20)).join('|') + ' ' + prompt.slice(0, 80));
    assert.doesNotMatch(prompt, /Existing article wiki\/operations\.md/);
    const body = splitFront(readWiki(root, 'wiki/operations/billing.md').content).body.trim();
    return { articles: [{ path: 'wiki/operations/billing.md', summary: 'The billing rules, with the 2027 change.', content: `${body}\n\nFrom 2027 invoices are sent monthly.` }] };
  };
  const ok = await digest('Billing changes: from 2027 invoices are sent monthly.');
  assert.equal(ok, true, lastError());
  // The hub.
  const hub = readWiki(root, 'wiki/operations.md').content;
  const hubBody = splitFront(hub).body;
  assert.ok(hubBody.length < 1500);
  assert.match(hubBody, /\]\(operations\/billing\.md\)/);
  assert.match(hubBody, /\]\(operations\/shipping\.md\)/);
  assert.match(hubBody, /\]\(operations\/returns\.md\)/, 'a part the helper left out of the hub is linked by the code');
  assert.match(hubBody, /\]\(operations\/support\.md\)/);
  assert.match(hub, /summary: "How the shop is run: billing, shipping, returns and support\."/);
  assert.match(hub, /title: "Operations"/);
  // The parts: under wiki/operations/, with the article's sources and all of its text.
  const parts = ['billing', 'shipping', 'returns', 'support'].map((p) => readWiki(root, `wiki/operations/${p}.md`).content);
  assert.ok(parts.every((p) => /sources:\n {2}- raw\/articles\/old\.md/.test(p)));
  const kept = parts.map((p) => splitFront(p).body).join('\n\n');
  assert.ok(wordsKept(splitFront(original).body, kept) > 0.99);
  assert.ok(kept.length >= splitFront(original).body.trim().length * 0.9);
  assert.match(parts[0], /From 2027 invoices are sent monthly\./);
  assert.match(parts[0], /summary: "The billing rules, with the 2027 change\."/);
  // The original, byte for byte, in the history; the log; the index; the wiki is consistent.
  const snaps = snapshotsOf(root, 'wiki/operations.md');
  assert.equal(readSnapshot(root, snaps[0].path), original);
  assert.match(readWiki(root, 'log.md').content, /- 2026-11-17 · Billing update 1 → split \[Operations\]\(wiki\/operations\.md\) into 4 parts \(earlier text kept\)/);
  const index = readWiki(root, 'index.md').content;
  for (const p of ['operations.md', 'operations/billing.md', 'operations/support.md']) assert.ok(index.includes(`(wiki/${p})`), p);
  assert.deepEqual(checkWiki(root).issues.filter((i) => !/no incoming|Missing or excluded source: raw\/articles\/old\.md/.test(i.detail)), []);
  assert.equal(browseWiki(root).articles.length, 5);
  assert.equal(asked.filter((a) => a.system === SPLIT_SYSTEM).length, 1);
});

test('a split that keeps under 90% of the text, in few or many parts, or in other words, is refused', () => {
  const o = { path: 'wiki/operations.md', oldBody: bodyOfLong, taken: new Set<string>(), exists: () => false, incoming: 'x' };
  const good = goodSplit();
  assert.equal(checkSplit(good, o).ok, true);
  const bad = (what: string, answer: unknown, re: RegExp) => {
    const r = checkSplit(answer, o);
    assert.equal(r.ok, false, what);
    assert.match(r.ok ? '' : r.error, re, what);
  };
  bad('one part', { ...good, parts: good.parts.slice(0, 1) }, /not 2 to 5/);
  bad('six parts', { ...good, parts: [...good.parts, ...good.parts.slice(0, 2)] }, /not 2 to 5/);
  bad('no hub', { ...good, hub: { content: '' } }, /no hub/);
  bad('half the text', { ...good, parts: good.parts.slice(0, 2).map((p) => ({ ...p })) }, /kept \d+%/);
  bad('summarised', { ...good, parts: good.parts.map((p) => ({ ...p, content: `# ${p.title}\n\n${'The shop handles this area well and has many rules. '.repeat(70)}` })) }, /in its words/);
  bad('a secret', { ...good, parts: good.parts.map((p, i) => (i ? p : { ...p, content: `${p.content}\n\nkey sk-ant-abcdefghijklmnopqrstuvwx` })) }, /secret/);
  // Exactly the share that is kept: 90% is enough.
  const ninety = good.parts.map((p, i) => (i === 3 ? { ...p, content: `# Support\n\n${SECTIONS[3].slice(0, Math.floor(SECTIONS[3].length * 0.7))}` } : p));
  assert.equal(checkSplit({ ...good, parts: ninety }, o).ok, true);
  // A part whose file name is taken gets another; the target is a number or, failing that, the part sharing most words.
  const r = checkSplit({ ...good, target: 'Returns' }, { ...o, taken: new Set(['wiki/operations/billing.md']) });
  assert.ok(r.ok && r.plan.parts[0].path === 'wiki/operations/billing-2.md');
  assert.ok(r.ok && r.plan.target === 0, 'no usable target: the part sharing most words with the new text (here the first, nothing shared)');
  const words = checkSplit({ ...good, target: undefined }, { ...o, incoming: 'returns returns number 12 said team returns' });
  assert.ok(words.ok && words.plan.target === 2);
});

test('a failed split leaves the article alone and the update goes on as before (an article under the hard limit); over it, it is left as it was', async () => {
  const text = front(bodyOfLong.replace(/Support/g, 'Helpdesk'));
  put('wiki/operations.md', text);
  fs.rmSync(path.join(root, 'wiki', 'operations'), { recursive: true, force: true });
  const before = readWiki(root, 'wiki/operations.md').content;
  split = () => ({ ...goodSplit(), parts: goodSplit().parts.slice(0, 2) });
  let wrote = '';
  write = (prompt) => {
    wrote = prompt;
    return { articles: [{ path: 'wiki/operations.md', content: `${splitFront(before).body.trim()}\n\nA new line.` }] };
  };
  const asks = asked.length;
  await digest('Something new about operations.');
  assert.match(wrote, /Existing article wiki\/operations\.md/, 'under 20,000 characters: the update goes on');
  assert.ok(asked.slice(asks).some((a) => a.system === SPLIT_SYSTEM));
  assert.match(lastError(), /could not split it/);
  assert.match(readWiki(root, 'wiki/operations.md').content, /A new line\./);
  // Over the hard limit.
  const huge = front(`${bodyOfLong}\n\n${section('Extra', 9000)}`);
  put('wiki/operations.md', huge);
  wrote = '';
  await digest('More about operations.');
  assert.equal(wrote, '');
  assert.match(lastError(), /could not split it[\s\S]*too long to rewrite: left as it was/);
  assert.equal(readWiki(root, 'wiki/operations.md').content, huge);
});

test('a split is not applied when the article changes while the helper splits it', async () => {
  const text = front(bodyOfLong);
  put('wiki/operations.md', text);
  split = () => {
    put('wiki/operations.md', `${text.replace(/\n$/, '')}\n\nAdded by someone else.\n`);
    return goodSplit();
  };
  write = () => ({ articles: [] });
  await digest('Billing again.');
  assert.match(lastError(), /changed meanwhile/);
  assert.match(readWiki(root, 'wiki/operations.md').content, /Added by someone else\./);
  assert.ok(splitFront(readWiki(root, 'wiki/operations.md').content).body.length > SPLIT_AT, 'the article was not replaced by the hub');
  // Its text is in the history before the hub was tried, and the parts that were written hold it.
  assert.ok(snapshotsOf(root, 'wiki/operations.md').length >= 1);
});

test('anchors and the commit are carried to the parts and the hub in a repository', async () => {
  const repo = path.join(tmp, 'repo');
  fs.mkdirSync(path.join(repo, 'server'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'server', 'billing.ts'), '// billing\n');
  const { execFileSync } = await import('node:child_process');
  const g = (...a: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=T', '-c', 'user.email=t@e.x', ...a], { stdio: 'pipe' });
  execFileSync('git', ['init', '-q', repo]);
  g('add', '-A');
  g('commit', '-q', '-m', 'one');
  const sp = createSpace(db, { name: 'Repo', folder: repo });
  const r = wikiRoot(db, sp.id, { create: true })!;
  const withPath = bodyOfLong.replace('The billing rule number 1 says', 'The billing rule in server/billing.ts number 1 says');
  applyWikiChanges(r, [{ path: 'wiki/operations.md', content: front(withPath), expectedSha256: null }]);
  const first = SECTIONS[0].replace('The billing rule number 1 says', 'The billing rule in server/billing.ts number 1 says');
  split = () => ({ ...goodSplit(), parts: goodSplit().parts.map((p, i) => (i ? p : { ...p, content: `# Billing\n\n${first}` })) });
  write = () => ({ articles: [] });
  plan = { update: ['wiki/operations.md'], create: [], notes: [] };
  n++;
  await digestText(db, ask, { space: sp.id, base: 'docs', title: 'Doc', path: '/r.md', origin: 'knowledge:Docs/r.md', text: 'about billing', cut: false, kind: 'document', notes: false, hash: 'r1', now });
  const billing = readWiki(r, 'wiki/operations/billing.md').content;
  assert.deepEqual(trackingOf(billing).anchors, ['server/billing.ts']);
  assert.match(trackingOf(billing).commit ?? '', /^[0-9a-f]{40}$/);
  assert.match(trackingOf(readWiki(r, 'wiki/operations.md').content).commit ?? '', /^[0-9a-f]{40}$/);
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
console.log(`Wiki splitting: ${passed} of ${tests.length} tests passed`);
