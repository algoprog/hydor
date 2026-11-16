// Script tests for wiki memory from a project's work: once a pass, the helper (a stand-in here) reads a project's recent
// conversations and its wiki gets sources and articles; which sessions are skipped, the cursor, the caps, when a pass
// is due, and the one-time backfill of documents already in knowledge.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/wiki/digest/work-test.ts
//   CUDA_VISIBLE_DEVICES= DATA_DIR=/tmp/hydor-test-wikiwork node dist/dev/work-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setSettings } from '../../assistants/store.ts';
import { kvGet, kvSet, openDb } from '../../db.ts';
import { createBase, knowledgeSchema } from '../../knowledge/store.ts';
import { setEnabled, setLearnOn, entries, repoRoot } from '../../memory/store.ts';
import { setSessionExtra } from '../../sessionExtra.ts';
import { createSpace } from '../../spaces/index.ts';
import { browseWiki } from '../browse.ts';
import { readWiki } from '../core.ts';
import { ensureWikiKnowledge } from '../knowledge/bindings.ts';
import { wikiRoot } from '../roots.ts';
import { setWikiSettings } from '../settings/settings.ts';
import { backfillDocuments } from './index.ts';
import { PLAN_SYSTEM, PLAN_SYSTEM_CONVERSATION } from './plan.ts';
import { updatesOf } from './store.ts';
import { conversationText, EVERY_MS, learnWikiFromWork, MIN_CONVO_CHARS, PER_PASS, PER_PROJECT, QUIET_MS, wikiWorkDue } from './work.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-wikiwork-test-')));
const db = openDb(path.join(tmp, 'test.db'));
setSettings(db, { taskRoot: path.join(tmp, 'Naget') });
const hub = path.join(tmp, 'hub');
setWikiSettings(db, { enabled: true, hubPath: hub });

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

/** The stand-in helper: every question it was asked; it plans one new article per conversation and writes it. */
const asked: { system: string; prompt: string }[] = [];
let n = 0;
const ask = async (q: { system: string; prompt: string }) => {
  asked.push(q);
  assert.notEqual(q.system, PLAN_SYSTEM, 'a conversation is never asked about with the document wording');
  if (q.system === PLAN_SYSTEM_CONVERSATION) return { update: [], create: [{ title: `Lesson ${++n}` }], notes: [{ title: 'Never kept', text: 'A note the work pass must not add.' }] };
  const paths = [...q.prompt.matchAll(/New article (wiki\/[^\s]+\.md)/g)].map((m) => m[1]);
  return { articles: paths.map((p) => ({ path: p, content: `# ${p}\n\nThe team decided to keep the booking flow in one place, because splitting it broke refunds.\n` })) };
};

const mk = (name: string, o: Record<string, unknown> = {}) => {
  const folder = path.join(tmp, name.toLowerCase());
  fs.mkdirSync(folder, { recursive: true });
  return { space: createSpace(db, { name, description: `The ${name} project`, folder, ...o }), folder };
};
const alpha = mk('Alpha');
const beta = mk('Beta', { wikiMemory: false });

const addApp = db.prepare("insert into app_sessions (key, agent, cwd, title, created_at, updated_at) values (?, 'claude', ?, ?, ?, ?)");
const addChunk = db.prepare('insert into chunk_text (key, kind, ts, text) values (?, ?, ?, ?)');
const FILLER = 'We looked at how the booking flow talks to the payment service and why refunds failed when the two were split into separate calls. ';
/** A session with `turns` turns ending at `last`, each long enough to matter. */
function session(key: string, cwd: string, o: { title?: string; last?: number; turns?: number; extra?: Record<string, unknown>; user?: string } = {}) {
  const last = o.last ?? Date.now() - 3600_000;
  const turns = o.turns ?? 3;
  addApp.run(key, cwd, o.title ?? `Work ${key}`, last, last);
  for (let i = 0; i < turns; i++) {
    const at = last - (turns - 1 - i) * 60_000;
    addChunk.run(key, 'user', at, o.user ?? `Request ${i + 1} on ${key}. ${FILLER}`);
    addChunk.run(key, 'assistant', at + 1000, `Reply ${i + 1} on ${key}. ${FILLER}`);
    addChunk.run(key, 'tool', at + 500, 'TOOL OUTPUT must never be read');
  }
  if (o.extra) setSessionExtra(db, key, o.extra);
}
const sources = (space: string) => {
  const root = wikiRoot(db, space);
  const dir = root && path.join(root, 'raw', 'articles');
  return dir && fs.existsSync(dir) ? fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')) : [];
};
const articles = (space: string) => {
  const root = wikiRoot(db, space);
  return root ? browseWiki(root).articles : [];
};

test('a conversation is read as the user and the agent said it, within its share', () => {
  const turns = Array.from({ length: 40 }, (_, i) => ({ user: `question ${i} ${'x'.repeat(900)}`, reply: `answer ${i} ${'y'.repeat(700)}` }));
  const { text, cut } = conversationText(turns);
  assert.ok(cut && text.length <= 12_000 + 100);
  assert.ok(text.startsWith('User: question 0'));
  assert.match(text, /\(turns in between are left out\)/);
  assert.match(text, /Agent: answer 39/);
  assert.ok(!text.includes('question 1 '));
  const small = conversationText([{ user: 'hello', reply: 'hi' }]);
  assert.deepEqual(small, { text: 'User: hello\nAgent: hi', cut: false });
});

test('one pass: a project conversation becomes a source, an article and an update; the others are passed over', async () => {
  const now = Date.now();
  session('claude:s1', alpha.folder, { title: 'Plan the refunds', user: `Please look at refunds. My key is sk-ant-abcdefghijklmnopqrstuvwx. ${FILLER}` });
  session('claude:off', alpha.folder, { extra: { memory: false } });
  session('claude:conf', alpha.folder, { extra: { confidential: true } });
  session('claude:child', alpha.folder, { extra: { parent: 'claude:s1' } });
  session('claude:beta', beta.folder);
  session('claude:loose', path.join(tmp, 'elsewhere'));
  session('claude:short', alpha.folder, { turns: 1, user: 'Hi' });
  addApp.run('claude:sched', alpha.folder, 'A scheduled run', now, now);
  const before = entries(db, { scope: 'repo', scopeKey: repoRoot(alpha.folder)! }).length;

  assert.equal(kvGet(db, 'wiki.work.at'), undefined);
  const read = await learnWikiFromWork(db, ask, now);
  assert.equal(read, 1);
  assert.equal(asked.length, 2, 'a plan and a writing for the one conversation');
  assert.match(asked[0].prompt, /Conversation "Plan the refunds"/);
  assert.match(asked[0].prompt, /<conversation>[\s\S]*User: Please look at refunds[\s\S]*Agent: Reply 1 on claude:s1/);
  assert.ok(!asked[0].prompt.includes('TOOL OUTPUT'));
  assert.ok(!asked[0].prompt.includes('sk-ant-abcdefghijklmnopqrstuvwx'), 'the secret is redacted');
  assert.ok(!/Notes the project already has/.test(asked[0].prompt));

  const src = sources(alpha.space.id);
  assert.ok(src.length >= 1 && src.some((t) => t.includes('session:Plan the refunds ·')), 'kept as a source with its origin');
  assert.ok(!src.some((t) => t.includes('sk-ant-abcdefghijklmnopqrstuvwx')));
  const list = articles(alpha.space.id);
  assert.equal(list.length, 1);
  const root = wikiRoot(db, alpha.space.id)!;
  assert.match(readWiki(root, list[0].path).content, /keep the booking flow in one place/);

  const ups = updatesOf(db, alpha.space.id);
  assert.equal(ups.length, 1);
  assert.equal(ups[0].path, 'session:claude:s1');
  assert.equal(ups[0].document, 'Plan the refunds');
  assert.equal(ups[0].notes, 0);
  assert.deepEqual(ups[0].articles, [list[0].path]);
  assert.equal(ups[0].error, undefined);
  assert.equal(entries(db, { scope: 'repo', scopeKey: repoRoot(alpha.folder)! }).length, before, 'no memory notes from a conversation');
  assert.equal(updatesOf(db, beta.space.id).length, 0);
  assert.equal(kvGet(db, 'wiki.work.since'), String(now));
  assert.equal(kvGet(db, 'wiki.work.at'), String(now));
});

test('a second pass adds nothing; a new turn is read alone', async () => {
  const asks = asked.length;
  assert.equal(await learnWikiFromWork(db, ask, Date.now() + 1000), 0);
  assert.equal(asked.length, asks);
  const later = Date.now() + 2 * 3600_000;
  addChunk.run('claude:s1', 'user', later - 1000, `A new request about the invoice export. ${FILLER}${FILLER}`);
  addChunk.run('claude:s1', 'assistant', later - 500, `The export uses the ledger. ${FILLER}${FILLER}`);
  assert.equal(await learnWikiFromWork(db, ask, later), 1);
  const prompt = asked[asks].prompt;
  assert.match(prompt, /invoice export/);
  assert.ok(!prompt.includes('Request 1 on claude:s1'), 'only the turns since the last pass');
  assert.equal(updatesOf(db, alpha.space.id).length, 2);
  assert.equal(updatesOf(db, alpha.space.id)[0].path, 'session:claude:s1');
});

test('nothing happens with Learn from conversations off, or memory off, or wiki memory off for the project', async () => {
  const when = Date.now() + 4 * 3600_000;
  session('claude:new', alpha.folder, { last: when - 3600_000, title: 'Fresh' });
  const asks = asked.length;
  const at = kvGet(db, 'wiki.work.at');
  setLearnOn(db, false);
  assert.equal(await learnWikiFromWork(db, ask, when), 0);
  setLearnOn(db, true);
  setEnabled(db, false);
  assert.equal(await learnWikiFromWork(db, ask, when), 0);
  setEnabled(db, true);
  assert.equal(asked.length, asks);
  assert.equal(kvGet(db, 'wiki.work.at'), at, 'a pass that did not run leaves no mark');
  const gamma = mk('Gamma', { wikiMemory: false });
  const off = gamma.space;
  session('claude:gamma', gamma.folder, { last: when - 1800_000 });
  assert.equal(await learnWikiFromWork(db, ask, when), 1, 'only Fresh');
  assert.match(asked[asks].prompt, /Conversation "Fresh"/);
  assert.equal(updatesOf(db, off.id).length, 0);
});

test('a pass does not run twice at once', async () => {
  const when = Date.now() + 8 * 3600_000;
  session('claude:two', alpha.folder, { last: when - 3600_000, title: 'Two' });
  const [a, b] = await Promise.all([learnWikiFromWork(db, ask, when), learnWikiFromWork(db, ask, when)]);
  assert.equal(a + b, 1);
});

const readTitles = (from: number) => asked.slice(from).filter((q) => q.system === PLAN_SYSTEM_CONVERSATION).map((q) => /Conversation "(Cap [\w-]+)"/.exec(q.prompt)![1]);

test('caps: 4 conversations a project, the latest first', async () => {
  const when = Date.now() + 24 * 3600_000;
  const p1 = mk('P1');
  for (const [pi, p] of [alpha, p1].entries()) for (let i = 0; i < 6; i++) session(`claude:cap-${pi}-${i}`, p.folder, { title: `Cap ${pi}-${i}`, last: when - (i + 1) * 3600_000 - pi * 1000 });
  const asks = asked.length;
  assert.equal(await learnWikiFromWork(db, ask, when), 2 * PER_PROJECT);
  assert.equal(PER_PROJECT, 4);
  const titles = readTitles(asks);
  for (const pi of [0, 1]) assert.deepEqual(titles.filter((t) => t.startsWith(`Cap ${pi}-`)).map((t) => Number(t.slice(6))).sort(), [0, 1, 2, 3], `project ${pi}: its 4 latest`);
  // The rest are not read later: the cursor moved on.
  const next = asked.length;
  assert.equal(await learnWikiFromWork(db, ask, when + 1000), 0);
  assert.equal(asked.length, next);
});

test('caps: 12 conversations a pass, the latest first', async () => {
  const when = Date.now() + 48 * 3600_000;
  const projects = ['Q0', 'Q1', 'Q2', 'Q3'].map((x) => mk(x));
  for (const [pi, p] of projects.entries()) for (let i = 0; i < 6; i++) session(`claude:capq-${pi}-${i}`, p.folder, { title: `Cap q${pi}-${i}`, last: when - (i + 1) * 3600_000 - pi * 1000 });
  const asks = asked.length;
  assert.equal(await learnWikiFromWork(db, ask, when), PER_PASS);
  const titles = readTitles(asks);
  assert.equal(titles.length, 12);
  // The 12 latest are the 3 latest of each project.
  assert.ok(titles.every((t) => Number(t.slice(-1)) <= 2), titles.join());
});

test('when a pass is due: 20 hours since the last, and nobody writing for 10 minutes', () => {
  const t = Date.now() + 96 * 3600_000;
  db.prepare('delete from chunk_text').run();
  kvSet(db, 'wiki.work.at', String(t - EVERY_MS + 1000));
  assert.equal(wikiWorkDue(db, t), false);
  kvSet(db, 'wiki.work.at', String(t - EVERY_MS));
  assert.equal(wikiWorkDue(db, t), true);
  addChunk.run('claude:now', 'user', t - QUIET_MS + 1000, 'still writing');
  assert.equal(wikiWorkDue(db, t), false);
  assert.equal(wikiWorkDue(db, t + 2000), true);
  db.prepare('delete from kv where k = ?').run('wiki.work.at');
  assert.equal(wikiWorkDue(db, t + 2000), true, 'never ran');
});

test('the backfill queues the documents already indexed, once, newest first, never a wiki base', () => {
  knowledgeSchema(db);
  const doc = db.prepare("insert into kb_docs (base, source, path, title, format, size, mtime, passages, status, indexed_at) values (?, 's', ?, ?, 'md', 1, 0, 1, ?, ?)");
  const base = createBase(db, { name: 'Alpha docs', space: alpha.space.id });
  const shared = createBase(db, { name: 'Shared docs' });
  const own = ensureWikiKnowledge(db, { root: wikiRoot(db, alpha.space.id)!, space: alpha.space.id });
  doc.run(base.id, '/d/old.md', 'old.md', 'indexed', 100);
  doc.run(base.id, '/d/new.md', 'new.md', 'indexed', 300);
  doc.run(shared.id, '/d/mid.md', 'mid.md', 'indexed', 200);
  doc.run(base.id, '/d/broken.md', 'broken.md', 'error', 400);
  doc.run(own.base, '/wiki/a.md', 'a.md', 'indexed', 500);
  const queued: string[] = [];
  const queue = { enqueue: (d: { path: string }) => void queued.push(d.path) };
  setEnabled(db, false);
  assert.equal(backfillDocuments(db, queue), 0);
  assert.equal(kvGet(db, 'wiki.digest.backfilled'), undefined, 'not marked while memory is off');
  setEnabled(db, true);
  assert.equal(backfillDocuments(db, queue), 3);
  assert.deepEqual(queued, ['/d/new.md', '/d/mid.md', '/d/old.md']);
  assert.equal(kvGet(db, 'wiki.digest.backfilled'), '1');
  assert.equal(backfillDocuments(db, queue), 0);
  assert.equal(queued.length, 3);
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
  console.log(`Wiki memory from work: ${passed} tests passed`);
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(0);
})();
