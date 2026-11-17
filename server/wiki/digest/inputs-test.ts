// Script tests for what feeds wiki memory on big and busy projects: which documents are read over the limit (the pinned,
// the most used, the newest), the overviews of the folders left unread, the conversations picked by signal, the pass for
// sessions that went quiet (at most 8 a project a day), and the commit messages read once a day. A stand-in helper
// answers everything; it is never a real model.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/wiki/digest/inputs-test.ts
//   CUDA_VISIBLE_DEVICES= DATA_DIR=/tmp/hydor-test-wikiinputs node dist/dev/inputs-test.js
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setSettings } from '../../assistants/store.ts';
import { kvGet, openDb } from '../../db.ts';
import { knowledgeSchema, addSource, createBase, saveDoc } from '../../knowledge/store.ts';
import { setWikiPin, countUses } from '../../knowledge/marks.ts';
import { setEnabled, setLearnOn } from '../../memory/store.ts';
import { setSessionExtra } from '../../sessionExtra.ts';
import { createSpace, updateSpace } from '../../spaces/index.ts';
import { browseWiki } from '../browse.ts';
import { readWiki } from '../core.ts';
import { wikiRoot } from '../roots.ts';
import { setWikiSettings } from '../settings/settings.ts';
import { COMMITS_EVERY_MS, digestCommitsDue, MAX_COMMITS, MAX_COMMIT_CHARS, readCommits } from './commits.ts';
import { createDigest } from './digest.ts';
import { backfillDocuments } from './index.ts';
import { documentsToRead } from './limit.ts';
import { OVERVIEW_MIN_FOLDER, OVERVIEW_PER_HOUR, OVERVIEW_SYSTEM, OVERVIEW_TITLES, unreadFolders, writeOverviews } from './overviews.ts';
import { PLAN_SYSTEM, PLAN_SYSTEM_CONVERSATION } from './plan.ts';
import { claimJob, releaseJob } from '../areas/jobs.ts';
import { readsInDay } from './reads.ts';
import { conversationSignal, CORRECTION } from './signal.ts';
import { updatesOf, workMark } from './store.ts';
import { DAY_MAX, learnWikiFromQuiet, learnWikiFromWork, PER_PROJECT, QUIET_PER_PASS, QUIET_READ_MS } from './work.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-wikiinputs-test-')));
const db = openDb(path.join(tmp, 'test.db'));
setSettings(db, { taskRoot: path.join(tmp, 'Naget') });
setWikiSettings(db, { enabled: true, hubPath: path.join(tmp, 'hub') });
knowledgeSchema(db);

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const mk = (name: string, o: Record<string, unknown> = {}) => {
  const folder = path.join(tmp, name.toLowerCase().replace(/\s+/g, '-'));
  fs.mkdirSync(folder, { recursive: true });
  // Every project has a limit of its own, so one test's small limit never reaches another's project.
  return { space: createSpace(db, { name, description: `The ${name} project`, folder, wikiDocumentLimit: 100, ...o }), folder };
};
const articlesOf = (space: string) => {
  const root = wikiRoot(db, space);
  return root ? browseWiki(root).articles : [];
};

// ---- the stand-in helper --------------------------------------------------------------------------------------------

const asked: { system: string; prompt: string }[] = [];
let failing = false;
let n = 0;
const ask = async (q: { system: string; prompt: string }) => {
  asked.push(q);
  if (failing) throw new Error('the helper is not there');
  if (q.system === OVERVIEW_SYSTEM) return { body: `# ${/Folder "([^"]+)"/.exec(q.prompt)?.[1] ?? 'x'}\n\nA folder of documents the wiki did not read, held for agents to search with knowledge_search.` };
  if (q.system === PLAN_SYSTEM_CONVERSATION || q.system === PLAN_SYSTEM) return { update: [], create: [{ title: `Lesson ${++n}` }], notes: [] };
  const paths = [...q.prompt.matchAll(/New article (wiki\/[^\s]+\.md)/g)].map((m) => m[1]);
  return { articles: paths.map((p) => ({ path: p, content: `# ${p}\n\nThe team decided to keep the booking flow in one place, because splitting it broke refunds.\n` })) };
};
const prompts = (from: number, system: string) => asked.slice(from).filter((q) => q.system === system).map((q) => q.prompt);

// ---- documents over the limit ---------------------------------------------------------------------------------------

/** A document of a base as the indexer would save it; a bigger age is an older file. */
function doc(base: string, source: string, file: string, o: { age?: number; size?: number; text?: string; title?: string } = {}) {
  saveDoc(db, { base, source, path: file, title: o.title ?? path.basename(file), format: path.extname(file).slice(1) || 'md', size: o.size ?? 1000, mtime: 1_700_000_000_000 - (o.age ?? 0) * 3600_000, status: 'indexed', chunks: [{ text: o.text ?? `The ${path.basename(file)} document: what it says about the project.\nMore text.` }] });
}

test('over its limit a project reads the pinned, then the most used, then the newest: backfill queues them first, once, and later ones that join', () => {
  const p = mk('Over', { wikiDocumentLimit: 4 });
  const dir = path.join(tmp, 'over-docs');
  fs.mkdirSync(dir);
  const b = createBase(db, { name: 'Over docs', space: p.space.id });
  const src = addSource(db, b.id, 'folder', dir);
  for (let i = 0; i < 12; i++) doc(b.id, src.id, `${dir}/d${i}.md`, { age: i });
  setWikiPin(db, b.id, `${dir}/d11.md`, true);
  countUses(db, [{ base: b.id, path: `${dir}/d9.md` }]);
  countUses(db, [{ base: b.id, path: `${dir}/d9.md` }]);
  countUses(db, [{ base: b.id, path: `${dir}/d8.md` }]);
  // A stand-in queue: what waits stays until the test reads it.
  const queued: string[] = [];
  const waits: { base: string; path: string; title: string }[] = [];
  const queue = {
    enqueue: (e: { base: string; path: string; title: string }) => {
      queued.push(path.basename(e.path, '.md'));
      if (!waits.some((w) => w.base === e.base && w.path === e.path)) waits.push(e);
    },
    waiting: () => [...waits],
  };
  backfillDocuments(db, queue);
  const mine = () => queued.filter((q) => /^d\d+$/.test(q));
  assert.deepEqual(mine(), ['d11', 'd9', 'd8', 'd0'], 'pinned, most used, then the newest, in read order');
  assert.equal(kvGet(db, `wiki.digest.backfilled.${p.space.id}`), undefined, 'no mark is kept');
  queued.length = 0;
  backfillDocuments(db, queue);
  assert.deepEqual(mine(), [], 'each waits once');
  // A document that joins the read set (a pin) is queued by the next check; one that falls out is not touched (d0 still waits).
  setWikiPin(db, b.id, `${dir}/d5.md`, true, Date.now() + 10);
  backfillDocuments(db, queue);
  assert.deepEqual(mine(), ['d5']);
  assert.equal(documentsToRead(db, p.space.id)!.length, 4);
  updateSpace(db, p.space.id, { wikiDocumentLimit: 100 });
});

test('the digest reads a document only when it is among those picked: the pinned old one is read, the unpinned old one is not', async () => {
  const p = mk('Reads', { wikiDocumentLimit: 2 });
  const dir = path.join(tmp, 'reads-docs');
  fs.mkdirSync(dir);
  const b = createBase(db, { name: 'Reads docs', space: p.space.id });
  const src = addSource(db, b.id, 'folder', dir);
  for (let i = 0; i < 6; i++) doc(b.id, src.id, `${dir}/r${i}.md`, { age: i, text: `Reads document ${i}. It explains the invoicing rules in enough words to be worth reading, number ${i}.` });
  setWikiPin(db, b.id, `${dir}/r5.md`, true);
  const d = createDigest(db, { ask, quietMs: 0, unref: false });
  for (let i = 0; i < 6; i++) d.enqueue({ base: b.id, path: `${dir}/r${i}.md`, title: `r${i}.md` });
  await d.settled();
  d.dispose();
  assert.deepEqual(updatesOf(db, p.space.id).map((u) => path.basename(u.path, '.md')).sort(), ['r0', 'r5'], 'the pinned one and the newest; never more than the limit');
  updateSpace(db, p.space.id, { wikiDocumentLimit: 100 });
});

// ---- overviews --------------------------------------------------------------------------------------------------------

const SECRET = 'sk-ant-abcdefghijklmnopqrstuvwx';

test('an overview for each folder of unread documents: from titles and first lines only, one call a folder, written again when the folder changes', async () => {
  const p = mk('Ov', { wikiDocumentLimit: 3 });
  const dir = path.join(tmp, 'ov-docs');
  fs.mkdirSync(dir);
  const b = createBase(db, { name: 'Ov docs', space: p.space.id });
  const src = addSource(db, b.id, 'folder', dir);
  // 250 papers in a subfolder, 6 contracts in another, 2 loose files (they go with the source folder), 3 newest files that are read.
  for (let i = 0; i < 250; i++) doc(b.id, src.id, `${dir}/papers/p${i}.pdf`, { age: 1000 + i, title: `Paper ${i}`, text: `Paper ${i} abstract.\nDEEP-TEXT-${i} must never reach the helper.` });
  for (let i = 0; i < 6; i++) doc(b.id, src.id, `${dir}/contracts/c${i}.docx`, { age: 900 + i, title: `Contract ${i}`, text: i === 0 ? `Key ${SECRET} in the first line\nmore` : `Contract ${i} between two parties.` });
  doc(b.id, src.id, `${dir}/loose-a.txt`, { age: 800 });
  doc(b.id, src.id, `${dir}/loose-b.txt`, { age: 801 });
  for (let i = 0; i < 3; i++) doc(b.id, src.id, `${dir}/news/n${i}.md`, { age: i });
  const groups = unreadFolders(db, p.space.id)!;
  assert.deepEqual(groups.map((g) => [g.folder, g.docs.length]), [[`${src.name}/papers`, 250], [`${src.name}/contracts`, 6], [src.name, 2 + 0]].map(([f, c]) => [f, c]), 'the news folder is read (3), too small a one goes with its source');
  assert.equal(unreadFolders(db, mk('Within').space.id), null, 'a project within its limit has none');

  const now = Date.now();
  const before = asked.length;
  assert.equal(await writeOverviews(db, ask, now), OVERVIEW_PER_HOUR, 'three folders, three calls');
  const calls = prompts(before, OVERVIEW_SYSTEM);
  assert.equal(calls.length, 3);
  const papers = calls.find((c) => c.includes('/papers'))!;
  assert.match(papers, /250 documents/);
  assert.equal(papers.split('\n').filter((l) => l.startsWith('- Paper')).length, OVERVIEW_TITLES, 'up to 200 titles');
  assert.match(papers, /\(50 more documents not listed\)/);
  assert.match(papers, /- Paper \d+ · pdf · 1000 B · \d{4}-\d\d-\d\d · Paper \d+ abstract\./);
  assert.ok(!papers.includes('DEEP-TEXT'), 'whole texts never reach the helper');
  const contracts = calls.find((c) => c.includes('/contracts'))!;
  assert.ok(!contracts.includes(SECRET) && /Key /.test(contracts), 'a secret in a first line is cut out');
  assert.match(papers, /<folder>[\s\S]*<\/folder>/, 'the list is data in its own tag');

  const root = wikiRoot(db, p.space.id)!;
  const list = articlesOf(p.space.id).filter((a) => a.path.startsWith('wiki/overviews/'));
  assert.equal(list.length, 3);
  const art = readWiki(root, `wiki/overviews/${list.find((a) => /papers/.test(a.path))!.path.split('/').pop()}`).content;
  assert.match(art, /^---\ntitle: "Overview: .*papers"/);
  assert.match(art, /knowledge_search/);
  assert.match(readWiki(root, 'index.md').content, /wiki\/overviews\//);
  assert.match(readWiki(root, 'log.md').content, /Overview: .*papers/);
  const ups = updatesOf(db, p.space.id);
  assert.equal(ups.length, 3);
  assert.ok(ups.every((u) => u.path.startsWith('overview:') && u.document.startsWith('Overview: ') && u.articles.length === 1));

  // Nothing changed: nothing is written, whatever the hour.
  assert.equal(await writeOverviews(db, ask, now + 2 * 3600_000), 0);
  // A document added to contracts: that overview alone is written again, once the hour allows.
  const c = asked.length;
  doc(b.id, src.id, `${dir}/contracts/c9.docx`, { age: 905 });
  assert.equal(await writeOverviews(db, ask, now + 3 * 3600_000), 1);
  assert.equal(prompts(c, OVERVIEW_SYSTEM).length, 1);
  assert.match(prompts(c, OVERVIEW_SYSTEM)[0], /7 documents/);
  assert.equal(articlesOf(p.space.id).filter((a) => a.path.startsWith('wiki/overviews/')).length, 3, 'the same article, written again');
});

test('at most three overviews an hour in all; a helper failure is listed and tried again in a later hour; off when wiki memory or documents are off', async () => {
  const p = mk('Ov cap', { wikiDocumentLimit: 1 });
  const dir = path.join(tmp, 'ovcap-docs');
  fs.mkdirSync(dir);
  const b = createBase(db, { name: 'Ov cap docs', space: p.space.id });
  const src = addSource(db, b.id, 'folder', dir);
  doc(b.id, src.id, `${dir}/keep.md`, { age: 0 });
  for (const f of ['a', 'b', 'c', 'd', 'e']) for (let i = 0; i < OVERVIEW_MIN_FOLDER; i++) doc(b.id, src.id, `${dir}/${f}/x${i}.md`, { age: 100 + i });
  const t = Date.now() + 100 * 3600_000;
  assert.equal(await writeOverviews(db, ask, t), 3);
  assert.equal(await writeOverviews(db, ask, t + 30 * 60_000), 0, 'the hour is used up');
  assert.equal(await writeOverviews(db, ask, t + 3601_000), 2, 'the rest in the next hour');
  assert.equal(await writeOverviews(db, ask, t + 2 * 3601_000), 0, 'all done');
  // A failure: listed with its error, counts against the hour, and the folder is tried again later.
  doc(b.id, src.id, `${dir}/a/x9.md`, { age: 109 });
  failing = true;
  const u = updatesOf(db, p.space.id).length;
  assert.equal(await writeOverviews(db, ask, t + 3 * 3601_000), 0);
  failing = false;
  const err = updatesOf(db, p.space.id);
  assert.equal(err.length, u + 1);
  assert.match(err[0].error ?? '', /not there/);
  assert.equal(await writeOverviews(db, ask, t + 3 * 3601_000 + 60_000), 0, 'not at once');
  assert.equal(await writeOverviews(db, ask, t + 4 * 3601_000), 1);
  // Off.
  doc(b.id, src.id, `${dir}/b/x9.md`, { age: 110 });
  setWikiSettings(db, { fromDocuments: false });
  assert.equal(await writeOverviews(db, ask, t + 10 * 3601_000), 0);
  setWikiSettings(db, { fromDocuments: true });
  setEnabled(db, false);
  assert.equal(await writeOverviews(db, ask, t + 10 * 3601_000), 0);
  setEnabled(db, true);
  assert.equal(await writeOverviews(db, ask, t + 10 * 3601_000), 1);
});

// ---- conversations by signal; the quiet pass ------------------------------------------------------------------------

const addApp = db.prepare("insert into app_sessions (key, agent, cwd, title, created_at, updated_at) values (?, 'claude', ?, ?, ?, ?)");
const addChunk = db.prepare('insert into chunk_text (key, kind, ts, text) values (?, ?, ?, ?)');
const FILLER = 'We looked at how the booking flow talks to the payment service and why refunds failed when the two were split into separate calls. ';
interface Turn {
  user?: string;
  reply?: string;
  cmd?: string;
}
/** A session whose last turn was at `last`: `turns` plain turns, or the given ones. */
function session(key: string, cwd: string, o: { title?: string; last: number; turns?: number | Turn[]; extra?: Record<string, unknown> }) {
  const list: Turn[] = Array.isArray(o.turns) ? o.turns : Array.from({ length: o.turns ?? 3 }, () => ({}));
  addApp.run(key, cwd, o.title ?? `Work ${key}`, o.last, o.last);
  list.forEach((t, i) => {
    const at = o.last - (list.length - 1 - i) * 60_000;
    addChunk.run(key, 'user', at, t.user ?? `Request ${i + 1} on ${key}. ${FILLER}`);
    if (t.cmd) addChunk.run(key, 'command', at + 500, t.cmd);
    addChunk.run(key, 'assistant', at + 1000, t.reply ?? `Reply ${i + 1} on ${key}. ${FILLER}`);
  });
  if (o.extra) setSessionExtra(db, key, o.extra);
}
const readTitles = (from: number) => prompts(from, PLAN_SYSTEM_CONVERSATION).map((q) => /Conversation "([^"]+)"/.exec(q)![1]);
const HOUR = 3600_000;

test('the signal: commits, corrections, failures fixed and length, each counted from the indexed text', () => {
  const now = Date.now();
  session('sig:a', '/x', {
    last: now - HOUR,
    turns: [
      { user: 'Please fix the booking flow', cmd: 'git status' },
      { user: "No, that's wrong: the refund goes first.", cmd: 'cd app && git commit -am "refund first"', reply: 'The tests failed with an error in the ledger.' },
      { user: 'Actually do it the other way', cmd: 'git -c user.name=x merge feature', reply: 'Fixed: the tests are passing now.' },
      { user: "Don't touch the ledger", cmd: 'echo git commit is a thing', reply: 'Done.' },
    ],
  });
  const s = conversationSignal(db, 'sig:a', 0);
  assert.deepEqual({ commits: s.commits, corrections: s.corrections, fixes: s.fixes, turns: s.turns }, { commits: 2, corrections: 3, fixes: 1, turns: 4 });
  assert.equal(s.score, 2 * 3 + 3 * 2 + 1 * 2 + 4 * 0.25);
  assert.equal(conversationSignal(db, 'sig:a', now - HOUR - 90_000).commits, 1, 'only after the time given');
  for (const yes of ['No, that is not it', 'no. wrong file', "That's wrong", 'Not what I asked for', 'Instead use the portal', 'actually it was Tuesday', "Don't do that", 'do not do that']) assert.ok(CORRECTION.test(yes), yes);
  for (const no of ['Now add the export', 'Nothing else', 'Note that this is slow', 'Notice the ledger', 'Insteadof is a word', 'Yes, actually fine']) assert.ok(!CORRECTION.test(no), no);
});

test('a pass reads the conversations with the most signal first, the latest first among equals', async () => {
  const p = mk('Signal');
  const now = Date.now() + 1000 * HOUR;
  // Six sessions; the older two made commits and were corrected, the newest four are plain.
  for (let i = 0; i < 4; i++) session(`sigp:plain-${i}`, p.folder, { title: `Plain ${i}`, last: now - (i + 1) * HOUR });
  session('sigp:commit', p.folder, { title: 'With commits', last: now - 10 * HOUR, turns: [{ cmd: 'git commit -m one' }, { cmd: 'git commit -m two' }, {}] });
  session('sigp:fix', p.folder, { title: 'Corrected', last: now - 11 * HOUR, turns: [{}, { user: "No, that's wrong, use the other service. " + FILLER }, {}] });
  const before = asked.length;
  assert.equal(await learnWikiFromWork(db, ask, now), PER_PROJECT);
  assert.deepEqual(readTitles(before).sort(), ['Corrected', 'Plain 0', 'Plain 1', 'With commits'], 'two by signal, then the latest two');
  assert.equal(workMark(db, 'sigp:plain-3'), undefined, 'the rest wait');
  assert.equal(readsInDay(db, p.space.id, now), PER_PROJECT);
});

test('the quiet pass: a session that had no turn for 30 minutes is read, never one still being worked in; the same exclusions as the daily pass', async () => {
  const p = mk('Quiet');
  const now = Date.now() + 2000 * HOUR;
  session('q:old', p.folder, { title: 'Quiet one', last: now - QUIET_READ_MS - 60_000 });
  session('q:recent', p.folder, { title: 'Just now', last: now - 5 * 60_000 });
  session('q:busy', p.folder, { title: 'Busy one', last: now - 2 * HOUR });
  session('q:off', p.folder, { title: 'Memory off', last: now - 2 * HOUR, extra: { memory: false } });
  session('q:conf', p.folder, { title: 'Confidential', last: now - 2 * HOUR, extra: { confidential: true } });
  session('q:child', p.folder, { title: 'A child', last: now - 2 * HOUR, extra: { parent: 'q:old' } });
  session('q:short', p.folder, { title: 'Too short', last: now - 2 * HOUR, turns: [{ user: 'Hi', reply: 'Hello' }] });
  // An agent still replying: its reply is newer than 30 minutes though the user wrote long ago.
  addChunk.run('q:busy', 'assistant', now - 60_000, 'Still working on it');
  addApp.run('q:sched', p.folder, 'Scheduled', now - 2 * HOUR, now - 2 * HOUR);
  const before = asked.length;
  const daily = kvGet(db, 'wiki.work.at');
  const active = new Set(['q:busy']);
  assert.equal(await learnWikiFromQuiet(db, ask, now, undefined, { busy: (k) => active.has(k) }), 1);
  assert.deepEqual(readTitles(before), ['Quiet one']);
  assert.ok(workMark(db, 'q:old'));
  for (const k of ['q:recent', 'q:busy', 'q:off', 'q:conf', 'q:child', 'q:short', 'q:sched']) assert.equal(workMark(db, k), undefined, k);
  assert.equal(kvGet(db, 'wiki.work.at'), daily, 'the daily clock is the daily pass’s own');
  // Half an hour later the recent one is quiet too; once nothing is busy the busy one is read; nothing is read twice.
  const next = asked.length;
  assert.equal(await learnWikiFromQuiet(db, ask, now + 40 * 60_000, undefined, { busy: () => false }), 2, 'recent and busy');
  assert.deepEqual(readTitles(next).sort(), ['Busy one', 'Just now']);
  assert.equal(await learnWikiFromQuiet(db, ask, now + 41 * 60_000), 0);
  // Off with memory or learning off.
  setEnabled(db, false);
  session('q:later', p.folder, { title: 'Later', last: now - 3 * HOUR });
  assert.equal(await learnWikiFromQuiet(db, ask, now + 50 * 60_000), 0);
  setEnabled(db, true);
});

test('at most 8 sessions a project a day, quiet and daily passes together; QUIET_PER_PASS at a time', async () => {
  assert.equal(DAY_MAX, 8);
  const p = mk('Day');
  const now = Date.now() + 3000 * HOUR;
  for (let i = 0; i < 14; i++) session(`day:${i}`, p.folder, { title: `Day ${i}`, last: now - (i + 1) * 20 * 60_000 - QUIET_READ_MS });
  assert.equal(await learnWikiFromQuiet(db, ask, now), QUIET_PER_PASS, 'four at a time');
  assert.equal(await learnWikiFromQuiet(db, ask, now + 1000), QUIET_PER_PASS);
  assert.equal(readsInDay(db, p.space.id, now + 2000), 8);
  assert.equal(await learnWikiFromQuiet(db, ask, now + 2000), 0, 'the day is used up');
  assert.equal(await learnWikiFromWork(db, ask, now + 3000), 0, 'the daily pass counts, and is bound by it too');
  // A day later: the next ones.
  assert.equal(await learnWikiFromWork(db, ask, now + 25 * HOUR), PER_PROJECT);
  assert.equal(readsInDay(db, p.space.id, now + 25 * HOUR), PER_PROJECT);
  assert.equal(await learnWikiFromQuiet(db, ask, now + 25 * HOUR + 1000), 2, 'the rest (14 in all) before the day is full');
});

// ---- commits ----------------------------------------------------------------------------------------------------------

const git = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, '-c', 'user.name=Tester', '-c', 'user.email=tester@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' });
const commit = (dir: string, message: string) => git(dir, 'commit', '--allow-empty', '-q', '-m', message);

test('commit messages: once a day, since the last time, redacted, as data; "Commits <from>–<to>" listed', async () => {
  const p = mk('Repo');
  git(p.folder, 'init', '-q');
  commit(p.folder, 'Move refunds before payment\n\nDecision: refunds go first because payment cannot be undone.');
  commit(p.folder, `Add the API key ${SECRET} to the config\n\nCo-Authored-By: Claude <noreply@anthropic.com>\nSigned-off-by: Someone <someone@example.com>\nAsk <ceo@example.com> about the rollout.`);
  git(p.folder, 'checkout', '-q', '-b', 'feature');
  commit(p.folder, 'Feature work');
  git(p.folder, 'checkout', '-q', '-');
  git(p.folder, 'merge', '--no-ff', '-q', 'feature', '-m', 'Merge branch feature');
  const now = Date.now();
  const before = asked.length;
  assert.equal(await digestCommitsDue(db, ask, now), 1);
  const plan = prompts(before, PLAN_SYSTEM_CONVERSATION);
  assert.equal(plan.length, 1);
  assert.match(plan[0], /Conversation "Commits \d{4}-\d\d-\d\d–\d{4}-\d\d-\d\d"/);
  assert.match(plan[0], /<conversation>[\s\S]*Move refunds before payment[\s\S]*Decision: refunds go first[\s\S]*<\/conversation>/);
  assert.match(plan[0], /Feature work/);
  assert.ok(!plan[0].includes('Merge branch'), 'no merges');
  assert.ok(!plan[0].includes(SECRET), 'secrets are cut out before the helper sees them');
  assert.ok(!/example\.com|Co-Authored|noreply/i.test(plan[0]), 'no trailers naming people, no addresses');
  assert.match(plan[0], /not a conversation/);
  const ups = updatesOf(db, p.space.id);
  assert.equal(ups.length, 1);
  assert.match(ups[0].document, /^Commits \d{4}-\d\d-\d\d–\d{4}-\d\d-\d\d$/);
  assert.match(ups[0].path, /^commits:[0-9a-f]{12}$/);
  assert.equal(ups[0].notes, 0);
  const root = wikiRoot(db, p.space.id)!;
  const src = fs.readdirSync(path.join(root, 'raw', 'articles')).map((f) => fs.readFileSync(path.join(root, 'raw', 'articles', f), 'utf8'));
  assert.ok(src.some((t) => t.includes('commits:Repo')), 'kept as a source with its origin');
  assert.ok(src.every((t) => !t.includes(SECRET)));
  assert.equal(articlesOf(p.space.id).length, 1);

  // Not again within a day; after a day with nothing new, nothing; with new commits, only those.
  const asks = asked.length;
  assert.equal(await digestCommitsDue(db, ask, now + HOUR), 0);
  assert.equal(await digestCommitsDue(db, ask, now + COMMITS_EVERY_MS + 1000), 0);
  assert.equal(asked.length, asks, 'nothing new: the helper is not asked');
  commit(p.folder, 'Cache the exchange rates\n\nWhy: the API limits calls to 100 an hour.');
  assert.equal(await digestCommitsDue(db, ask, now + 3 * COMMITS_EVERY_MS), 1);
  const second = prompts(asks, PLAN_SYSTEM_CONVERSATION)[0];
  assert.match(second, /Cache the exchange rates/);
  assert.ok(!second.includes('Move refunds before payment'), 'only the commits since the last time');
  assert.equal(updatesOf(db, p.space.id).length, 2);
});

test('commits: at most 60 commits and 12,000 characters; a failing helper is tried again within the hour; skipped without a repository, with wiki memory or memory off', async () => {
  const dir = path.join(tmp, 'many');
  fs.mkdirSync(dir);
  git(dir, 'init', '-q');
  for (let i = 0; i < MAX_COMMITS + 10; i++) commit(dir, `Change number ${i}\n\n${'Because of reasons. '.repeat(40)}`);
  const c = (await readCommits(dir, { since: Date.now() - 86400_000 }))!;
  assert.equal(c.count <= MAX_COMMITS, true);
  assert.ok(c.text.length <= MAX_COMMIT_CHARS + 600, `${c.text.length}`);
  assert.match(c.text, /Change number 69/);
  assert.match(c.text, /older commits left out/);
  assert.equal(await readCommits(dir, { sha: c.head, since: 0 }), null, 'nothing since HEAD');
  assert.equal(await readCommits(path.join(tmp, 'no-such-folder'), { since: 0 }), null);
  const plain = mk('No repo');
  assert.equal(await readCommits(plain.folder, { since: 0 }), null);

  const p = mk('Repo two');
  git(p.folder, 'init', '-q');
  commit(p.folder, 'First decision\n\nWe chose SQLite because it needs no server.');
  const now = Date.now();
  failing = true;
  assert.equal(await digestCommitsDue(db, ask, now), 0);
  failing = false;
  assert.match(updatesOf(db, p.space.id)[0].error ?? '', /not there/);
  assert.equal(await digestCommitsDue(db, ask, now + 30 * 60_000), 0, 'not at once');
  const before = asked.length;
  assert.equal(await digestCommitsDue(db, ask, now + HOUR + 1000), 1, 'an hour later, from the same commits');
  assert.match(prompts(before, PLAN_SYSTEM_CONVERSATION)[0], /First decision/);

  const off = mk('Repo off', { wikiMemory: false });
  git(off.folder, 'init', '-q');
  commit(off.folder, 'Something decided long ago');
  const asks = asked.length;
  await digestCommitsDue(db, ask, now + 100 * HOUR);
  assert.equal(updatesOf(db, off.space.id).length, 0, 'wiki memory off for the project');
  setEnabled(db, false);
  commit(p.folder, 'Another decision made later');
  assert.equal(await digestCommitsDue(db, ask, now + 300 * HOUR), 0, 'memory off');
  setEnabled(db, true);
  assert.equal(asked.slice(asks).filter((q) => q.prompt.includes('Another decision')).length, 0);
  // Learn from conversations off: commits are part of learning from the work, so they stop too (the commit waits, nothing is lost).
  setLearnOn(db, false);
  assert.equal(await digestCommitsDue(db, ask, now + 400 * HOUR), 0, 'learning off');
  assert.equal(asked.slice(asks).filter((q) => q.prompt.includes('Another decision')).length, 0);
  setLearnOn(db, true);
  assert.ok((await digestCommitsDue(db, ask, now + 400 * HOUR)) >= 1, 'read once learning is on again');
  assert.equal(prompts(asks, PLAN_SYSTEM_CONVERSATION).filter((q) => q.includes('Another decision')).length, 1, 'asked about once');
});

test('the background passes skip a project while a job runs on its wiki: the commits, the work pass, the quiet pass and the document queue', async () => {
  const p = mk('Busy job');
  git(p.folder, 'init', '-q');
  commit(p.folder, 'A decision made while a job runs\n\nWhy: it must wait.');
  session('busy-job', p.folder, { title: 'busy-job', last: Date.now() - 3 * HOUR });
  const b = createBase(db, { name: 'Busy docs', space: p.space.id }).id;
  doc(b, addSource(db, b, 'folder', p.folder).id, `${p.folder}/busy.md`, { text: 'A busy document with enough words to be read by the wiki, about nothing in particular.' });
  assert.ok(claimJob(p.space.id));
  const before = asked.length;
  await digestCommitsDue(db, ask, Date.now() + 500 * HOUR);
  const others = await learnWikiFromWork(db, ask, Date.now());
  assert.equal(workMark(db, 'busy-job'), undefined, `the daily pass reads none of its conversations (it read ${others} of others)`);
  await learnWikiFromQuiet(db, ask, Date.now());
  assert.equal(workMark(db, 'busy-job'), undefined);
  const d = createDigest(db, { ask, quietMs: 0, unref: false });
  d.enqueue({ base: b, path: `${p.folder}/busy.md`, title: 'busy.md' });
  await d.settled();
  assert.equal(d.pending(), 1, 'the document waits in the queue');
  assert.ok(asked.slice(before).every((q) => !/while a job runs|busy-job|busy document/i.test(q.prompt)), 'nothing of the project was read');
  releaseJob(p.space.id);
  // When the job has ended the same queue reads it, and the passes read the project again.
  await d.readNow(() => true);
  assert.equal(d.pending(), 0);
  assert.ok(asked.slice(before).some((q) => /busy document/i.test(q.prompt)));
  await learnWikiFromWork(db, ask, Date.now());
  assert.ok(workMark(db, 'busy-job'), 'read once the job is over');
  d.dispose();
});

test('the quiet pass is gated as the daily pass: nothing with Learn from conversations off', async () => {
  const p = mk('Gate');
  const now = Date.now() + 4000 * HOUR;
  session('gate:1', p.folder, { title: 'Gate one', last: now - 2 * HOUR });
  setLearnOn(db, false);
  const before = asked.length;
  assert.equal(await learnWikiFromQuiet(db, ask, now), 0);
  assert.equal(await learnWikiFromWork(db, ask, now), 0);
  assert.equal(asked.length, before);
  assert.equal(workMark(db, 'gate:1'), undefined);
  setLearnOn(db, true);
  assert.equal(await learnWikiFromQuiet(db, ask, now), 1);
});

(async () => {
  for (const [name, fn] of tests) {
    try {
      await fn();
      passed++;
      console.log(`ok  ${name}`);
    } catch (e) {
      console.error(`FAIL ${name}\n${(e as Error).stack}`);
      db.close();
      fs.rmSync(tmp, { recursive: true, force: true });
      process.exit(1);
    }
  }
  console.log(`Wiki inputs: ${passed} tests passed`);
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(0);
})();
