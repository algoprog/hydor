// Script tests for wiki memory from a project's work: once a pass, the helper (a stand-in here) reads a project's recent
// conversations and its wiki gets sources and articles; which sessions are skipped, where each session was read up to
// (a session read is never read again, a session that goes on is read from its new turns), the caps, when a pass is due, and the one-time backfill of documents already in knowledge.
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
import { updatesOf, workMark } from './store.ts';
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
  assert.equal(kvGet(db, 'wiki.work.since'), undefined, 'no global cursor any more');
  assert.equal(kvGet(db, 'wiki.work.at'), String(now));
  const lastAt = (db.prepare("select max(ts) as ts from chunk_text where key = 'claude:s1' and kind = 'user'").get() as { ts: number }).ts;
  assert.deepEqual(workMark(db, 'claude:s1'), { space: alpha.space.id, upto: lastAt, at: now }, 'where it stopped in the session');
  assert.equal(workMark(db, 'claude:short'), undefined, 'too short to read: not marked');
  assert.equal(workMark(db, 'claude:off'), undefined);
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
  assert.match(prompt, /Conversation "Plan the refunds" \(its newer turns only: the earlier ones were read before and are in the wiki already\):/);
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
  // Two fresh projects: a project has at most 8 conversations read in a day, and alpha has had its share above.
  const p0 = mk('P0');
  const p1 = mk('P1');
  for (const [pi, p] of [p0, p1].entries()) for (let i = 0; i < 6; i++) session(`claude:cap-${pi}-${i}`, p.folder, { title: `Cap ${pi}-${i}`, last: when - (i + 1) * 3600_000 - pi * 1000 });
  const asks = asked.length;
  assert.equal(await learnWikiFromWork(db, ask, when), 2 * PER_PROJECT);
  assert.equal(PER_PROJECT, 4);
  const titles = readTitles(asks);
  for (const pi of [0, 1]) assert.deepEqual(titles.filter((t) => t.startsWith(`Cap ${pi}-`)).map((t) => Number(t.slice(6))).sort(), [0, 1, 2, 3], `project ${pi}: its 4 latest`);
  // The rest keep no mark: they are read in the next pass.
  assert.equal(workMark(db, 'claude:cap-0-5'), undefined);
  const next = asked.length;
  assert.equal(await learnWikiFromWork(db, ask, when + 1000), 2 * 2);
  assert.deepEqual(readTitles(next).sort(), ['Cap 0-4', 'Cap 0-5', 'Cap 1-4', 'Cap 1-5']);
  const done = asked.length;
  assert.equal(await learnWikiFromWork(db, ask, when + 2000), 0, 'all read now');
  assert.equal(asked.length, done);
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

// Each test below works far from the others in time (more than the look-back apart), so a pass sees only its own sessions.
const DAY = 86400_000;
const at = (k: number) => Date.now() + k * 100 * DAY;
const addTurn = (key: string, ts: number, user: string, reply: string | null) => {
  addChunk.run(key, 'user', ts, user);
  if (reply != null) addChunk.run(key, 'assistant', ts + 1000, reply);
};
const convoPrompts = (from: number) => asked.slice(from).filter((q) => q.system === PLAN_SYSTEM_CONVERSATION).map((q) => q.prompt);
const NEWER = 'its newer turns only: the earlier ones were read before and are in the wiki already';

test('a session read once is not read again when nothing new happened', async () => {
  const when = at(1);
  const p = mk('Marks A');
  session('claude:ma', p.folder, { title: 'Marks A work', last: when - 3600_000 });
  assert.equal(await learnWikiFromWork(db, ask, when), 1);
  const asks = asked.length;
  const ups = updatesOf(db, p.space.id).length;
  assert.equal(ups, 1);
  assert.equal(await learnWikiFromWork(db, ask, when + 3600_000), 0);
  assert.equal(await learnWikiFromWork(db, ask, when + 7200_000), 0);
  assert.equal(asked.length, asks, 'the helper is not asked');
  assert.equal(updatesOf(db, p.space.id).length, ups, 'no new update');
});

test('new turns after a pass: the next pass sends only those, with the newer-turns header', async () => {
  const when = at(2);
  const p = mk('Marks B');
  session('claude:mb', p.folder, { title: 'Marks B work', last: when - 3 * 3600_000 });
  const asks = asked.length;
  assert.equal(await learnWikiFromWork(db, ask, when), 1);
  assert.ok(!convoPrompts(asks)[0].includes(NEWER), 'a first read has the usual header');
  assert.match(convoPrompts(asks)[0], /Request 1 on claude:mb/);
  addTurn('claude:mb', when + 1000, `Now the receipts export for the accountants. ${FILLER}${FILLER}`, `Receipts go out as CSV. ${FILLER}${FILLER}`);
  const next = asked.length;
  assert.equal(await learnWikiFromWork(db, ask, when + 3600_000), 1);
  const prompts = convoPrompts(next);
  assert.equal(prompts.length, 1);
  for (const q of asked.slice(next)) {
    assert.ok(!q.prompt.includes('Request 1 on claude:mb') && !q.prompt.includes('Reply 3 on claude:mb'), 'the turns read before are absent');
    assert.match(q.prompt, /receipts export/);
  }
  assert.ok(prompts[0].includes(`Conversation "Marks B work" (${NEWER}):`));
  assert.equal(asked.slice(next).filter((q) => q.system !== PLAN_SYSTEM_CONVERSATION).every((q) => q.prompt.includes(`(${NEWER})`)), true, 'the writing prompt says so too');
  assert.equal(workMark(db, 'claude:mb')!.upto, when + 1000);
});

test('a busy session is skipped, then read with all its turns once it is not busy', async () => {
  const when = at(3);
  const p = mk('Marks C');
  session('claude:mc', p.folder, { title: 'Marks C work', last: when - 3600_000 });
  const asks = asked.length;
  assert.equal(await learnWikiFromWork(db, ask, when, undefined, { busy: (k) => k === 'claude:mc' }), 0);
  assert.equal(asked.length, asks);
  assert.equal(workMark(db, 'claude:mc'), undefined, 'its mark is untouched');
  assert.equal(await learnWikiFromWork(db, ask, when + 1000, undefined, { busy: () => false }), 1);
  const prompt = convoPrompts(asks)[0];
  for (const i of [1, 2, 3]) assert.match(prompt, new RegExp(`Request ${i} on claude:mc`));
  assert.ok(!prompt.includes(NEWER));
});

test('a session beyond the caps in one pass is read in the next', async () => {
  const when = at(4);
  const p = mk('Marks D');
  for (let i = 0; i < PER_PROJECT + 2; i++) session(`claude:md-${i}`, p.folder, { title: `Cap md-${i}`, last: when - (i + 1) * 3600_000 });
  const asks = asked.length;
  assert.equal(await learnWikiFromWork(db, ask, when), PER_PROJECT);
  assert.deepEqual(readTitles(asks).sort(), ['Cap md-0', 'Cap md-1', 'Cap md-2', 'Cap md-3']);
  assert.equal(workMark(db, 'claude:md-5'), undefined);
  const next = asked.length;
  assert.equal(await learnWikiFromWork(db, ask, when + 1000), 2);
  assert.deepEqual(readTitles(next).sort(), ['Cap md-4', 'Cap md-5']);
  assert.ok(convoPrompts(next).every((q) => !q.includes(NEWER)), 'they were never read before');
});

test('a helper failure leaves the session unmarked: the next pass reads the same turns again', async () => {
  const when = at(5);
  const p = mk('Marks E');
  session('claude:me', p.folder, { title: 'Marks E work', last: when - 3600_000 });
  const failing = async (): Promise<never> => {
    throw new Error('the helper is not there');
  };
  const asks = asked.length;
  assert.equal(await learnWikiFromWork(db, failing, when), 1);
  assert.equal(workMark(db, 'claude:me'), undefined, 'not marked');
  assert.match(updatesOf(db, p.space.id)[0].error ?? '', /not there/);
  assert.equal(await learnWikiFromWork(db, ask, when + 1000), 1);
  const prompt = convoPrompts(asks)[0];
  for (const i of [1, 2, 3]) assert.match(prompt, new RegExp(`Request ${i} on claude:me`));
  assert.ok(workMark(db, 'claude:me'));
  assert.equal(await learnWikiFromWork(db, ask, when + 2000), 0);
});

test('a trailing turn without a reply is not read until it has one', async () => {
  const when = at(6);
  const p = mk('Marks F');
  session('claude:mf', p.folder, { title: 'Marks F work', last: when - 3600_000 });
  addTurn('claude:mf', when - 1000, `Open question about the tax rounding. ${FILLER}${FILLER}`, null);
  const asks = asked.length;
  assert.equal(await learnWikiFromWork(db, ask, when), 1);
  for (const q of asked.slice(asks)) assert.ok(!q.prompt.includes('tax rounding'), 'the unanswered turn is not read');
  assert.equal(workMark(db, 'claude:mf')!.upto, when - 3600_000, 'marked up to the last answered turn');
  assert.equal(await learnWikiFromWork(db, ask, when + 1000), 0, 'still no reply: nothing to read');
  addChunk.run('claude:mf', 'assistant', when + 2000, `Round each line, then total. ${FILLER}${FILLER}`);
  const next = asked.length;
  assert.equal(await learnWikiFromWork(db, ask, when + 3000), 1);
  const prompt = convoPrompts(next)[0];
  assert.match(prompt, /tax rounding/);
  assert.match(prompt, /Round each line/);
  assert.ok(!prompt.includes('Request 1 on claude:mf'));
  assert.equal(workMark(db, 'claude:mf')!.upto, when - 1000);
});

test('short new turns are not marked: they are read once enough has added up', async () => {
  const when = at(7);
  const p = mk('Marks G');
  session('claude:mg', p.folder, { title: 'Marks G work', last: when - 3600_000 });
  assert.equal(await learnWikiFromWork(db, ask, when), 1);
  const mark = workMark(db, 'claude:mg')!;
  addTurn('claude:mg', when + 1000, 'ok thanks', 'sure');
  const asks = asked.length;
  assert.equal(await learnWikiFromWork(db, ask, when + 2000), 0);
  assert.equal(asked.length, asks);
  assert.deepEqual(workMark(db, 'claude:mg'), { ...mark }, 'the mark did not move');
  assert.ok(MIN_CONVO_CHARS > 'User: ok thanks\nAgent: sure'.length);
  addTurn('claude:mg', when + 3000, `Next, how do refunds show on the statement? ${FILLER}${FILLER}`, `They show as a negative line. ${FILLER}${FILLER}`);
  assert.equal(await learnWikiFromWork(db, ask, when + 4000), 1);
  const prompt = convoPrompts(asks)[0];
  assert.match(prompt, /User: ok thanks/);
  assert.match(prompt, /negative line/);
  assert.ok(!prompt.includes('Request 1 on claude:mg'));
  assert.equal(workMark(db, 'claude:mg')!.upto, when + 3000);
});

test('read marks older than 60 days are dropped at the end of a pass', async () => {
  const when = at(8);
  mk('Marks H');
  db.prepare('insert or replace into wiki_work_sessions (key, space, upto, at) values (?, ?, ?, ?)').run('claude:old', null, 1, when - 61 * DAY);
  db.prepare('insert or replace into wiki_work_sessions (key, space, upto, at) values (?, ?, ?, ?)').run('claude:recent', null, 1, when - 59 * DAY);
  await learnWikiFromWork(db, ask, when);
  assert.equal(workMark(db, 'claude:old'), undefined);
  assert.ok(workMark(db, 'claude:recent'));
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

test('the backfill queues the documents of each place already indexed, once, newest first, never a wiki base', () => {
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
  assert.equal(kvGet(db, `wiki.digest.backfilled.${alpha.space.id}`), undefined, 'not marked while memory is off');
  setEnabled(db, true);
  assert.equal(backfillDocuments(db, queue), 3);
  assert.deepEqual(queued, ['/d/new.md', '/d/mid.md', '/d/old.md']);
  assert.equal(kvGet(db, `wiki.digest.backfilled.${alpha.space.id}`), '1');
  assert.equal(kvGet(db, 'wiki.digest.backfilled.shared'), '1');
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
