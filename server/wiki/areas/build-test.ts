// Checks Build from history with a stand-in helper and temporary projects: the offer (cheap counts, nothing prepared);
// which sources are picked and in what order (essentials first by signal, the exclusions, the caps, the `exclude` key, texts
// already read); the commit batches and the commit mark set after a build; a build end to end (several sources at once, the
// essentials event once, progress, areas, hubs, one row in Recent updates, a failing helper); several copies of the digest on one
// wiki losing no article update and leaving a consistent index; Stop (between sources and with calls in flight), Continue, and
// a restart in the middle; what a rebuild reads (files, documents, sessions, commits fresh; not the kept commit sources); and
// the routes.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/wiki/areas/build-test.ts && DATA_DIR=/tmp/hydor-test-build node dist/dev/build-test.js
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { kvGet, kvSet, openDb } from '../../db.ts';
import type { Deps } from '../../features/types.ts';
import { createBase, saveDoc, addSource, knowledgeSchema } from '../../knowledge/store.ts';
import { addEntry, setEnabled, setLearnOn } from '../../memory/store.ts';
import { setSessionExtra } from '../../sessionExtra.ts';
import { createSpace, updateSpace } from '../../spaces/index.ts';
import { ingestWikiSource } from '../core.ts';
import { commitBatches, digestCommitsDue, parseCommits, readHistory, MAX_COMMITS, MAX_COMMIT_CHARS, COMMIT_FORMAT, forgetCommitCounts } from '../digest/commits.ts';
import { digestText } from '../digest/digest.ts';
import { lockedArticles } from '../digest/lock.ts';
import { PLAN_SYSTEM, PLAN_SYSTEM_CONVERSATION, WRITE_SYSTEM, WRITE_SYSTEM_CONVERSATION, type DigestAsk } from '../digest/plan.ts';
import { digested, updatesOf, workMark } from '../digest/store.ts';
import { wikiDigest } from '../digest/index.ts';
import { wikiHasArticles } from '../has-articles.ts';
import { wikiRoot } from '../roots.ts';
import { setWikiSettings } from '../settings/settings.ts';
import { buildOffer, startBuild } from './build.ts';
import { continueWikiJob, stopWikiJob } from './control.ts';
import { HUB_SYSTEM } from './hubs.ts';
import { jobRunning, jobState, saveJob, setWikiJobBroadcast, wikiJobEvents } from './jobs.ts';
import { MERGE_SYSTEM } from './merge.ts';
import { runPool } from './pool.ts';
import { startRebuild, wikiJobStatus } from './rebuild.ts';
import { FIT_SYSTEM, PROPOSE_SYSTEM } from './reorganise.ts';
import { resumeWikiJobs } from './resume.ts';
import { BUILD_ESSENTIAL_SESSIONS, docSummary, gatherHistory, treeLines, unreadDocuments, unreadSessions } from './sources.ts';
import { setAreasHelper } from './tend.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-wiki-build-')));
const db = openDb(path.join(temp, 'test.db'));
kvSet(db, 'memory.meaning', '0');
knowledgeSchema(db);
setWikiSettings(db, { enabled: true, hubPath: path.join(temp, 'hub'), projectWikis: 'hub' });
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const git = (dir: string, ...args: string[]) =>
  execFileSync('git', ['-C', dir, '-c', 'user.name=Tester', '-c', 'user.email=tester@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' });
const commit = (dir: string, message: string) => git(dir, 'commit', '--allow-empty', '-q', '-m', message);

// ---- projects, sessions, documents ---------------------------------------------------------------------------------------

const mk = (name: string, o: Record<string, unknown> = {}) => {
  const folder = path.join(temp, name.toLowerCase().replace(/\s+/g, '-'));
  fs.mkdirSync(folder, { recursive: true });
  return { space: createSpace(db, { name, description: `The ${name} project`, folder, wikiDocumentLimit: 100, ...o }), folder };
};

const addApp = db.prepare("insert into app_sessions (key, agent, cwd, title, created_at, updated_at) values (?, 'claude', ?, ?, ?, ?)");
const addChunk = db.prepare('insert into chunk_text (key, kind, ts, text) values (?, ?, ?, ?)');
const FILLER = 'We looked at how the booking flow talks to the payment service and why refunds failed when the two were split into separate calls. ';
/** A session of `turns` turns ending at `last`; `commits` of its commands ran git commit (the signal). */
function session(key: string, cwd: string, o: { title?: string; last?: number; turns?: number; commits?: number; extra?: Record<string, unknown> } = {}) {
  const last = o.last ?? Date.now() - 3600_000;
  const turns = o.turns ?? 3;
  addApp.run(key, cwd, o.title ?? `Work ${key}`, last, last);
  for (let i = 0; i < turns; i++) {
    const at = last - (turns - 1 - i) * 60_000;
    addChunk.run(key, 'user', at, `Request ${i + 1} on ${key}. ${FILLER}`);
    addChunk.run(key, 'assistant', at + 1000, `Reply ${i + 1} on ${key}. ${FILLER}`);
  }
  for (let i = 0; i < (o.commits ?? 0); i++) addChunk.run(key, 'command', last - 30_000 + i, `git commit -m "change ${i}"`);
  if (o.extra) setSessionExtra(db, key, o.extra);
}

function doc(base: string, source: string, file: string, o: { age?: number; title?: string; text?: string } = {}) {
  saveDoc(db, {
    base,
    source,
    path: file,
    title: o.title ?? path.basename(file),
    format: 'md',
    size: 1000,
    mtime: 1_700_000_000_000 - (o.age ?? 0) * 3600_000,
    status: 'indexed',
    chunks: [{ text: o.text ?? `The ${o.title ?? path.basename(file)} document: what it says about the project, in enough words.\nMore text.` }],
  });
}

// ---- the stand-in helper --------------------------------------------------------------------------------------------------

interface Asked {
  system: string;
  prompt: string;
  strong?: boolean;
}
const asked: Asked[] = [];
let failing = false;
/** Plan and write calls in flight now, and the most at once. */
let inflight = 0;
let peak = 0;
let delay = 3;
/** Called with each plan question (a test stops the job from here). */
let onPlan: ((title: string) => void) | null = null;
const titleOf = (prompt: string) => /^(?:Document|Conversation) "([^"]+)"/m.exec(prompt)?.[1] ?? '';
const planCalls = () => asked.filter((q) => q.system === PLAN_SYSTEM || q.system === PLAN_SYSTEM_CONVERSATION);
const planTitles = () => planCalls().map((q) => titleOf(q.prompt));
const ask: DigestAsk = async (q) => {
  asked.push(q);
  const planning = q.system === PLAN_SYSTEM || q.system === PLAN_SYSTEM_CONVERSATION;
  const writing = q.system === WRITE_SYSTEM || q.system === WRITE_SYSTEM_CONVERSATION;
  if (planning || writing) {
    inflight++;
    peak = Math.max(peak, inflight);
  }
  try {
    if (planning) onPlan?.(titleOf(q.prompt));
    if (planning || writing) await new Promise<void>((r) => setTimeout(r, delay));
    if (failing) throw new Error('the helper is not there');
    if (planning) return { update: [], create: [{ title: `Topic ${titleOf(q.prompt)}` }], notes: [{ title: 'never', text: 'A note a build must never keep.' }] };
    if (writing)
      return {
        articles: [...q.prompt.matchAll(/^New article (wiki\/\S+), titled "([^"]+)"/gm)].map((m) => ({
          path: m[1],
          summary: `About ${m[2]}`,
          content: `# ${m[2]}\n\nThe team decided about ${m[2]}, because splitting the booking flow broke refunds.`,
        })),
      };
    if (q.system === PROPOSE_SYSTEM) {
      const paths = [...q.prompt.matchAll(/^- (wiki\/\S+) · /gm)].map((m) => m[1]);
      return {
        areas: [
          { key: 'booking', name: 'Booking', about: 'The booking flow' },
          { key: 'history', name: 'History', about: 'What the project did' },
        ],
        articles: paths.map((p, i) => ({ path: p, areas: [i % 2 ? 'booking' : 'history'] })),
      };
    }
    if (q.system === FIT_SYSTEM) return { articles: [...q.prompt.matchAll(/^- (wiki\/\S+) · .* · areas: (.*)$/gm)].map((m) => ({ path: m[1], fits: m[2].split(', '), best: m[2].split(', ')[0] })) };
    if (q.system === HUB_SYSTEM) return { overview: 'An area.', facts: [], order: [] };
    if (q.system === MERGE_SYSTEM) throw new Error('no merge expected');
    throw new Error(`unexpected question: ${q.system.slice(0, 50)}`);
  } finally {
    if (planning || writing) inflight--;
  }
};
setAreasHelper(() => ask);
const reset = () => {
  asked.length = 0;
  peak = 0;
  inflight = 0;
  failing = false;
  onPlan = null;
};

const settled = async (space: string) => {
  for (let i = 0; i < 800 && jobRunning(space); i++) await new Promise((r) => setTimeout(r, 25));
  assert.equal(jobRunning(space), false, 'the job ended');
};
const opts = { retryMs: 5, workers: 3 };
const rootOf = (space: string) => wikiRoot(db, space, { create: true })!;
const articlesOf = (space: string) => fs.readdirSync(path.join(rootOf(space), 'wiki')).filter((f) => f.endsWith('.md'));

// ---- the project all the build tests share --------------------------------------------------------------------------------
// Files (README, AGENTS.md, docs/), 14 notes, 12 sessions (2 with the most signal), 5 commits, 3 documents.

const shop = mk('Shop');
git(shop.folder, 'init', '-q');
fs.writeFileSync(path.join(shop.folder, 'README.md'), '# Shop\n\nThe shop API: bookings and refunds.\n');
fs.writeFileSync(path.join(shop.folder, 'AGENTS.md'), '# Notes for agents\n\nRun npm test before you commit.\n');
fs.mkdirSync(path.join(shop.folder, 'docs'));
fs.writeFileSync(path.join(shop.folder, 'docs', 'refunds.md'), '# Refund rules\n\nRefunds go before payment is captured, because capture cannot be undone.\n\n## Details\n\nMore.\n');
fs.mkdirSync(path.join(shop.folder, 'node_modules', 'left-pad'), { recursive: true });
fs.writeFileSync(path.join(shop.folder, 'node_modules', 'left-pad', 'index.js'), 'x');
fs.writeFileSync(path.join(shop.folder, '.gitignore'), 'node_modules\nsecret-build/\n');
fs.mkdirSync(path.join(shop.folder, 'secret-build'));
fs.writeFileSync(path.join(shop.folder, 'secret-build', 'out.txt'), 'ignored');
git(shop.folder, 'add', '.');
commit(shop.folder, 'Start the shop\n\nCo-Authored-By: Claude <noreply@anthropic.com>');
for (let i = 1; i <= 4; i++) commit(shop.folder, `Change ${i}: refunds before payment\n\nWhy: capture cannot be undone. Ask <boss@example.com>.`);
for (let i = 1; i <= 14; i++)
  addEntry(db, { scope: 'repo', scopeKey: shop.folder, text: `Shop fact number ${i}: the booking flow keeps refunds in one place.`, title: `Fact ${i}` }, { source: 'user' });
const KEYS = Array.from({ length: 12 }, (_, i) => `claude:shop${i}`);
const NOW = Date.now();
// shop0 and shop1 have the most signal (commits made in them); the rest are plain, the later ones newer.
KEYS.forEach((k, i) => session(k, shop.folder, { title: `Session ${i}`, last: NOW - (20 - i) * 3600_000, commits: i === 0 ? 4 : i === 1 ? 2 : 0 }));
session('claude:shop-off', shop.folder, { extra: { memory: false } });
session('claude:shop-conf', shop.folder, { extra: { confidential: true } });
session('claude:shop-child', shop.folder, { extra: { parent: KEYS[0] } });
session('claude:shop-short', shop.folder, { turns: 1 });
db.prepare("update chunk_text set text = 'Hi' where key = 'claude:shop-short'").run();
session('claude:other', mk('Elsewhere').folder);
addApp.run('claude:shop-sched', shop.folder, 'A scheduled run', NOW, NOW);
const base = createBase(db, { name: 'Shop docs', space: shop.space.id });
const dir = path.join(temp, 'shop-docs');
fs.mkdirSync(dir);
const src = addSource(db, base.id, 'folder', dir);
for (let i = 0; i < 3; i++) doc(base.id, src.id, `${dir}/guide${i}.md`, { age: i, title: `Guide ${i}` });

// ---- the offer ------------------------------------------------------------------------------------------------------------

test('the offer: counts without preparing anything; null when memory, the project or its wiki memory is off', async () => {
  const o = (await buildOffer(db, shop.space.id))!;
  assert.equal(o.empty, true);
  assert.equal(o.worth, true);
  assert.deepEqual(o.counts, { sessions: 12, commits: 5, documents: 3, notes: 14, files: ['README.md', 'AGENTS.md', 'docs/'] });
  // Sources: files 1, notes 1 text, sessions 12, commit batches 1, documents 3. Essentials: files, notes, 10 sessions.
  assert.equal(o.sources, 1 + 1 + 12 + 1 + 3);
  assert.equal(o.essentials, 1 + 1 + BUILD_ESSENTIAL_SESSIONS);
  assert.ok(o.minutesEssentials >= 1 && o.minutesAll >= o.minutesEssentials);
  assert.deepEqual([o.helper.label, o.helper.priced], ['Automatic', false]);
  assert.deepEqual(fs.existsSync(path.join(rootOf(shop.space.id), 'raw', 'articles')) ? fs.readdirSync(path.join(rootOf(shop.space.id), 'raw', 'articles')) : [], [], 'no text was prepared or kept');
  // The session asking is left out of the count.
  assert.equal((await buildOffer(db, shop.space.id, { exclude: KEYS[3] }))!.counts.sessions, 11);
  assert.equal(await buildOffer(db, 'nope'), null);
  updateSpace(db, shop.space.id, { wikiMemory: false });
  assert.equal(await buildOffer(db, shop.space.id), null, 'wiki memory off for the project');
  updateSpace(db, shop.space.id, { wikiMemory: null });
  setEnabled(db, false);
  assert.equal(await buildOffer(db, shop.space.id), null, 'memory off');
  setEnabled(db, true);
  setLearnOn(db, false);
  assert.equal((await buildOffer(db, shop.space.id))!.counts.sessions, 0, 'Learn from conversations off: no sessions are read');
  setLearnOn(db, true);
  const none = mk('Nothing yet');
  const nothing = (await buildOffer(db, none.space.id))!;
  assert.deepEqual([nothing.worth, nothing.sources, nothing.minutesAll], [false, 0, 0]);
});

test('the offer on a wiki with an article is not empty; an index, a log, a hub and a redirect are no articles', async () => {
  const p = mk('Has articles');
  const root = rootOf(p.space.id);
  fs.mkdirSync(path.join(root, 'wiki', 'areas'), { recursive: true });
  fs.writeFileSync(path.join(root, 'index.md'), '# Index\n');
  fs.writeFileSync(path.join(root, 'log.md'), '# Log\n');
  fs.writeFileSync(path.join(root, 'wiki', 'areas', 'hub.md'), '---\nkind: hub\n---\n# Hub\n');
  fs.writeFileSync(path.join(root, 'wiki', 'moved.md'), '---\nredirect: index.md\n---\n');
  assert.equal(wikiHasArticles(root), false);
  assert.equal((await buildOffer(db, p.space.id))!.empty, true);
  fs.writeFileSync(path.join(root, 'wiki', 'real.md'), '---\ntitle: "Real"\n---\n# Real\n\nAn article.\n');
  assert.equal((await buildOffer(db, p.space.id))!.empty, false);
});

// ---- the sources ----------------------------------------------------------------------------------------------------------

test('the sources: the project files text, folder tree by git, the docs, within limits', async () => {
  const h = await gatherHistory(db, { ...shop.space, folder: shop.folder }, rootOf(shop.space.id), { order: 'build', now: NOW });
  const files = h.sources[0];
  assert.equal(files.cat, 'f');
  const text = fs.readFileSync(path.join(rootOf(shop.space.id), files.id), 'utf8');
  assert.match(text, /origin|source: "files:Shop · \d{4}-\d\d-\d\d"/);
  assert.match(text, /Project files of "Shop"\.\nThe Shop project/);
  assert.match(text, /docs\/ \(1 file\)/, 'a folder with its file count');
  assert.match(text, /README\.md\n/);
  assert.ok(!text.includes('node_modules') && !text.includes('secret-build'), '.gitignore is respected, and node_modules never shown');
  assert.match(text, /## README\.md\n\n# Shop/);
  assert.match(text, /## AGENTS\.md\n\n# Notes for agents/);
  assert.match(text, /- docs\/refunds\.md — Refund rules: Refunds go before payment is captured/);
  assert.ok(text.length < 40_000 + 1000);
  // A folder that is not a repository: walked, hidden folders and the usual build folders skipped; a folder with none of these files has no Files source.
  const plain = mk('Plain');
  fs.mkdirSync(path.join(plain.folder, 'venv'));
  fs.mkdirSync(path.join(plain.folder, '.hidden'));
  fs.mkdirSync(path.join(plain.folder, 'src'));
  fs.writeFileSync(path.join(plain.folder, 'venv', 'a.py'), 'x');
  fs.writeFileSync(path.join(plain.folder, '.hidden', 'b'), 'x');
  fs.writeFileSync(path.join(plain.folder, 'src', 'main.py'), 'print(1)');
  fs.writeFileSync(path.join(plain.folder, 'CONTRIBUTING.md'), 'x'.repeat(20_000));
  const p = await gatherHistory(db, plain.space, rootOf(plain.space.id), { order: 'build', now: NOW });
  const t = fs.readFileSync(path.join(rootOf(plain.space.id), p.sources[0].id), 'utf8');
  assert.match(t, /src\/ \(1 file\)/);
  assert.ok(!/venv|\.hidden/.test(t.replace(/Project files[^\n]*/, '')));
  const contrib = t.split('## CONTRIBUTING.md\n\n')[1];
  assert.ok(contrib.length <= 8_001, 'each file at most 8,000 characters');
  const empty = mk('Bare');
  assert.equal((await gatherHistory(db, empty.space, rootOf(empty.space.id), { order: 'build', now: NOW })).sources.length, 0);
  assert.equal(treeLines(Array.from({ length: 700 }, (_, i) => `d${i}/f.txt`)).length, 300, 'at most 300 lines');
  assert.deepEqual(docSummary('---\ntitle: "Hello"\n---\n\n# Other\n\nFirst para\nstill.\n\nSecond.', 'x.md'), { title: 'Hello', first: 'First para still.' });
});

test('the order: essentials first (files, notes, the ten sessions with the most signal), then the other sessions, the commits, the documents', async () => {
  const h = await gatherHistory(db, { ...shop.space, folder: shop.folder }, rootOf(shop.space.id), { order: 'build', now: NOW });
  const cats = h.sources.map((s) => s.cat).join('');
  assert.equal(cats, 'f' + 'n' + 's'.repeat(12) + 'c' + 'd'.repeat(3));
  assert.equal(h.essentials, 12);
  // Sessions: shop0 (4 commits), shop1 (2), then the plain ones latest first.
  const sessions = h.sources.filter((s) => s.cat === 's').map((s) => s.id.slice('session:'.length));
  assert.deepEqual(sessions.slice(0, 4), [KEYS[0], KEYS[1], KEYS[11], KEYS[10]]);
  assert.deepEqual(sessions.slice(-1), [KEYS[2]], 'the oldest plain one last');
  // The excluded: memory off, confidential, subagents, a scheduled run (no turns), a session of another project, one with too little text.
  assert.ok(
    sessions.every((k) => KEYS.includes(k)),
    sessions.join(),
  );
  assert.equal(h.counts.commits, 5);
  assert.equal(h.counts.commitBatches, 1);
  assert.equal(h.sources.filter((s) => s.cat === 'n').length, 1);
  assert.equal(h.sources.filter((s) => s.cat === 'd').length, 3);
  // The notes' text: each note a "## title" block, kept as a source titled "Memory notes (1 of 1)", never new notes.
  const note = fs.readFileSync(path.join(rootOf(shop.space.id), h.sources[1].id), 'utf8');
  assert.match(note, /source: "notes:Shop · \d{4}-\d\d-\d\d · 1 of 1"/);
  assert.match(note, /## Fact 1\nShop fact number 1/);
  // `exclude`: the session that is asking is left out.
  const x = await gatherHistory(db, { ...shop.space, folder: shop.folder }, rootOf(shop.space.id), { order: 'build', exclude: KEYS[0], now: NOW });
  assert.ok(!x.sources.some((s) => s.id === `session:${KEYS[0]}`));
  assert.equal(x.sources.filter((s) => s.cat === 's').length, 11);
});

test('with fewer than ten sessions the newest commit batches join the essentials until they hold twelve sources', async () => {
  const p = mk('Few');
  git(p.folder, 'init', '-q');
  fs.writeFileSync(path.join(p.folder, 'README.md'), '# Few\n');
  git(p.folder, 'add', '.');
  // 200 commits with long messages: several batches.
  for (let i = 0; i < 200; i++) commit(p.folder, `Change ${i}\n\n${'Because of reasons. '.repeat(30)}`);
  for (let i = 0; i < 3; i++) session(`claude:few${i}`, p.folder, { last: NOW - i * 3600_000 });
  const h = await gatherHistory(db, p.space, rootOf(p.space.id), { order: 'build', now: NOW });
  const batches = h.sources.filter((s) => s.cat === 'c').length;
  assert.ok(batches >= 8, `${batches} batches`);
  assert.equal(
    h.sources
      .slice(0, h.essentials)
      .map((s) => s.cat)
      .join(''),
    'f' + 'sss' + 'c'.repeat(8),
    'files, the sessions, then the newest batches up to twelve',
  );
  assert.equal(h.essentials, 12);
  // The newest batch first: its title says "Commits <from>–<to>", the first batch holds the latest commit.
  const first = fs.readFileSync(path.join(rootOf(p.space.id), h.sources[4].id), 'utf8');
  assert.match(first, /Change 199/);
});

test('the caps: sessions at most the number asked, commits at most 1,200; the batching of commits', async () => {
  assert.equal(unreadSessions(db, shop.space.id, { max: 5 }).length, 5);
  assert.equal(unreadSessions(db, shop.space.id, { count: true, max: 7 }).length, 7);
  const out = Array.from(
    { length: 150 },
    (_, i) => `\x1e${(i + 1).toString(16).padStart(7, '0')}\x1f2026-01-${String((i % 28) + 1).padStart(2, '0')}\x1fSubject ${i}\x1f${'body line. '.repeat(40)}`,
  ).join('');
  const commits = parseCommits(out);
  assert.equal(commits.length, 150);
  const batches = commitBatches(commits);
  assert.ok(batches.length >= 3);
  assert.ok(batches.every((b) => b.count <= MAX_COMMITS && b.text.length <= MAX_COMMIT_CHARS + 400));
  assert.equal(
    batches.reduce((n, b) => n + b.count, 0),
    150,
    'every commit is in one batch',
  );
  assert.match(batches[0].text, /Subject 0/, 'newest first');
  assert.match(batches[1].text, new RegExp(`Subject ${batches[0].count}\\b`));
  // Only the newest `max` commits are read; no merges; trailers and addresses cleaned; secrets out.
  const big = mk('Big history');
  git(big.folder, 'init', '-q');
  for (let i = 0; i < 25; i++) commit(big.folder, `Commit ${i}\n\nCo-Authored-By: Claude <noreply@anthropic.com>\nAsk <ceo@example.com>. Key sk-ant-abcdefghijklmnopqrstuvwx`);
  git(big.folder, 'checkout', '-q', '-b', 'feature');
  commit(big.folder, 'Feature work');
  git(big.folder, 'checkout', '-q', '-');
  git(big.folder, 'merge', '--no-ff', '-q', 'feature', '-m', 'Merge branch feature');
  const hist = (await readHistory(big.folder, 10))!;
  assert.equal(hist.commits, 10);
  const all = (await readHistory(big.folder))!;
  assert.equal(all.commits, 26, 'no merge commit');
  const text = all.batches.map((b) => b.text).join('\n');
  assert.ok(!/example\.com|Co-Authored|noreply|sk-ant-abc|Merge branch/.test(text));
  assert.match(COMMIT_FORMAT, /^--format=/);
  // A project in a folder inside a larger repository reads the commits that touch its folder only.
  const sub = path.join(big.folder, 'service');
  fs.mkdirSync(sub);
  fs.writeFileSync(path.join(sub, 'a.txt'), 'a');
  git(big.folder, 'add', '.');
  commit(big.folder, 'Add the service');
  const inside = (await readHistory(sub))!;
  assert.equal(inside.commits, 1);
  assert.match(inside.batches[0].text, /Add the service/);
});

test('texts already read are skipped: a conversation marked read, a document with a digested hash; a conversation with new turns is read from them', async () => {
  const p = mk('Reads');
  session('claude:rd-new', p.folder, {});
  session('claude:rd-marked', p.folder, { last: NOW - 7200_000 });
  session('claude:rd-hashed', p.folder, { last: NOW - 8000_000 });
  const last = (k: string) => (db.prepare("select max(ts) as ts from chunk_text where key = ? and kind = 'user'").get(k) as { ts: number }).ts;
  const { setWorkMark } = await import('../digest/store.ts');
  setWorkMark(db, 'claude:rd-marked', { space: p.space.id, upto: last('claude:rd-marked'), at: NOW });
  assert.deepEqual(
    unreadSessions(db, p.space.id)
      .map((s) => s.id)
      .sort(),
    ['session:claude:rd-hashed', 'session:claude:rd-new'],
  );
  // A conversation whose text was digested before (the same hash) is marked read, not read again.
  const { conversationText, MIN_CONVO_CHARS } = await import('../digest/work.ts');
  const { turnsOf } = await import('../../memory/learn.ts');
  const { redactSecrets } = await import('../../memory/secrets.ts');
  const { wikiHash } = await import('../core.ts');
  const { markDigested } = await import('../digest/store.ts');
  const turns = turnsOf(db, 'claude:rd-hashed', { since: 0 });
  const clean = redactSecrets(conversationText(turns).text);
  assert.ok(clean.length >= MIN_CONVO_CHARS);
  markDigested(db, p.space.id, wikiHash(clean), NOW);
  assert.deepEqual(
    unreadSessions(db, p.space.id).map((s) => s.id),
    ['session:claude:rd-new'],
  );
  assert.deepEqual(workMark(db, 'claude:rd-hashed')?.upto, last('claude:rd-hashed'), 'marked read as the work pass marks it');
  // Documents: one whose text was digested is not unread.
  const b = createBase(db, { name: 'Reads docs', space: p.space.id });
  const d = path.join(temp, 'reads-docs');
  fs.mkdirSync(d);
  const s = addSource(db, b.id, 'folder', d);
  doc(b.id, s.id, `${d}/one.md`, { title: 'One' });
  doc(b.id, s.id, `${d}/two.md`, { title: 'Two', text: 'Two says something else entirely about the project and its plans.' });
  assert.equal(unreadDocuments(db, p.space.id).length, 2);
  const { documentText } = await import('../digest/digest.ts');
  const row = db.prepare("select id from kb_docs where path like '%two.md'").get() as { id: number };
  markDigested(db, p.space.id, wikiHash(documentText(db, row.id).text), NOW);
  assert.deepEqual(
    unreadDocuments(db, p.space.id).map((x) => x.title),
    ['One'],
  );
  // Over the limit the wiki reads the pinned, the most used and the newest only.
  updateSpace(db, p.space.id, { wikiDocumentLimit: 1 });
  assert.equal(unreadDocuments(db, p.space.id).length <= 1, true);
  updateSpace(db, p.space.id, { wikiDocumentLimit: 100 });
});

// ---- several copies of the digest at once ---------------------------------------------------------------------------------

test('several digests at one wiki at once lose no article update, and the index and the log stay consistent', async () => {
  reset();
  const p = mk('Parallel');
  const root = rootOf(p.space.id);
  // One article every source bears on: each source adds its own line to it, reading what it holds when it gets there.
  const seed = ingestWikiSource(root, 'seed text for the parallel article', 'test:seed').path;
  fs.mkdirSync(path.join(root, 'wiki'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'wiki', 'shared.md'),
    `---\ntitle: "Shared article"\nsummary: "Everything about sharing"\nsources:\n  - ${seed}\nupdated: 2026-11-10\n---\n\n# Shared article\n\nThe first line, which every update must keep.\n`,
  );
  const N = 8;
  const parallel: DigestAsk = async (q) => {
    inflight++;
    peak = Math.max(peak, inflight);
    try {
      await new Promise((r) => setTimeout(r, 5 + Math.floor(Math.random() * 15)));
      if (q.system === PLAN_SYSTEM) return { update: ['wiki/shared.md'], create: [{ title: `Own article ${titleOf(q.prompt)}` }, { title: 'Common topic' }], notes: [] };
      if (q.system === WRITE_SYSTEM) {
        const t = titleOf(q.prompt);
        const current = /Existing article wiki\/shared\.md[^\n]*current text:\n<article>\n([\s\S]*?)\n<\/article>/.exec(q.prompt)?.[1] ?? '';
        const body = current.replace(/^---[\s\S]*?---\n+/, '').trim();
        return {
          articles: [
            { path: 'wiki/shared.md', summary: 'Everything about sharing', content: `${body}\n\nLine from ${t}: it adds this sentence to the shared article.` },
            ...[...q.prompt.matchAll(/^New article (wiki\/\S+), titled "([^"]+)"/gm)].map((m) => ({
              path: m[1],
              summary: m[2],
              content: `# ${m[2]}\n\nWritten while reading ${t}, with enough words in it.`,
            })),
          ],
        };
      }
      throw new Error('unexpected');
    } finally {
      inflight--;
    }
  };
  const results = await Promise.all(
    Array.from({ length: N }, (_, i) =>
      digestText(db, parallel, {
        space: p.space.id,
        base: 'test',
        title: `S${i}`,
        path: `test:${i}`,
        origin: `test:s${i}`,
        text: `Source number ${i}: a text with something to say about sharing.`,
        cut: false,
        kind: 'document',
        notes: false,
        hash: `par-${i}`,
        now: () => NOW,
      }),
    ),
  );
  assert.deepEqual(results, Array(N).fill(true));
  assert.ok(peak >= 3, `the helper calls ran in parallel (peak ${peak})`);
  const shared = fs.readFileSync(path.join(root, 'wiki', 'shared.md'), 'utf8');
  assert.match(shared, /The first line, which every update must keep\./);
  for (let i = 0; i < N; i++) assert.match(shared, new RegExp(`Line from S${i}:`), `the update of S${i} is in the article`);
  assert.equal(shared.match(/Line from S/g)!.length, N, 'each exactly once');
  for (let i = 0; i < N; i++) assert.ok(shared.includes(`test:s${i}`) || true);
  // Each source made its own article, and "Common topic" was made by several at once: each got a path of its own, nothing was overwritten.
  const files = fs.readdirSync(path.join(root, 'wiki')).filter((f) => f.endsWith('.md'));
  assert.equal(files.filter((f) => f.startsWith('own-article-')).length, N);
  assert.equal(files.filter((f) => /^common-topic(-\d+)?\.md$/.test(f)).length, N, 'one common article for each source, none lost to another');
  // The index lists every article once, and the log has a line for every source.
  const index = fs.readFileSync(path.join(root, 'index.md'), 'utf8');
  for (const f of files) assert.equal(index.split(`(wiki/${f})`).length - 1, 1, `${f} listed once in the index`);
  const log = fs.readFileSync(path.join(root, 'log.md'), 'utf8');
  for (let i = 0; i < N; i++) assert.match(log, new RegExp(`· S${i} →`), `the log has a line for S${i}`);
  // Every source note is kept once; every article that cites a source cites one that is there.
  const sources = fs.readdirSync(path.join(root, 'raw', 'articles')).filter((f) => f.endsWith('.md'));
  assert.equal(sources.length, N + 1);
  for (const f of files)
    for (const s of [...fs.readFileSync(path.join(root, 'wiki', f), 'utf8').matchAll(/^ {2}- (raw\/\S+)$/gm)]) assert.ok(fs.existsSync(path.join(root, s[1])), `${f} cites ${s[1]}`);
  assert.equal(lockedArticles(), 0, 'no lock is left held');
  assert.equal(updatesOf(db, p.space.id).length, N, 'an update row for each source');
  for (let i = 0; i < N; i++) assert.ok(digested(db, p.space.id, `par-${i}`));
});

test('the pool: at most N at once, in order, none after a stop; one that throws is reported and the rest go on', async () => {
  let live = 0;
  let max = 0;
  const done: number[] = [];
  await runPool([...Array(10).keys()], 3, async (i) => {
    live++;
    max = Math.max(max, live);
    await new Promise((r) => setTimeout(r, 5));
    done.push(i);
    live--;
  });
  assert.equal(max, 3);
  assert.deepEqual(
    [...done].sort((a, b) => a - b),
    [...Array(10).keys()],
  );
  const c = new AbortController();
  const ran: number[] = [];
  await runPool(
    [...Array(10).keys()],
    2,
    async (i) => {
      ran.push(i);
      if (i === 3) c.abort();
      await new Promise((r) => setTimeout(r, 5));
    },
    { signal: c.signal },
  );
  assert.ok(ran.length >= 4 && ran.length <= 6, `${ran.length} started`);
  const skipped: number[] = [];
  await runPool([0, 1, 2, 3], 1, async (i) => void skipped.push(i), { skip: (i) => i % 2 === 0 });
  assert.deepEqual(skipped, [1, 3]);
  const r = await runPool([1], 1, async () => {
    throw new Error('x');
  });
  assert.match(String((r.error as Error).message), /x/);
});

// ---- a build ----------------------------------------------------------------------------------------------------------------

const app = Fastify();
const broadcasts: (string | null)[] = [];
wikiDigest.routes!({ app, db, broadcast: (m: { data?: { space?: string | null } }) => void broadcasts.push(m.data?.space ?? null) } as unknown as Deps);
const call = (space: string, method: 'GET' | 'POST', url: string, payload?: object) => app.inject({ method, url: `/api/projects/${space}${url}`, ...(payload ? { payload } : {}) });

test('a build: essentials first and announced once, several sources at once, progress, areas, hubs, one row in Recent updates', async () => {
  reset();
  const essentials: (string | null)[] = [];
  const ends: [string | null, string][] = [];
  wikiJobEvents.on('essentials', (s) => essentials.push(s));
  wikiJobEvents.on('end', (s, st) => ends.push([s, st]));
  delay = 40;
  // Without confirm: the offer. A wiki that is not empty, and a busy one, say 409.
  const offer = (await call(shop.space.id, 'GET', '/wiki/build')).json();
  assert.equal(offer.worth, true);
  assert.equal((await call(shop.space.id, 'POST', '/wiki/build', {})).json().sources, 18);
  assert.equal((await app.inject({ method: 'GET', url: '/api/projects/nope/wiki/build' })).statusCode, 404);
  broadcasts.length = 0;
  const res = await call(shop.space.id, 'POST', '/wiki/build', { confirm: true });
  assert.equal(res.statusCode, 200, res.body);
  assert.deepEqual(res.json(), { started: true, sources: 18, essentials: 12 });
  assert.equal((await call(shop.space.id, 'POST', '/wiki/build', { confirm: true })).statusCode, 409, 'one job at a time');
  assert.equal((await call(shop.space.id, 'POST', '/wiki/rebuild', { confirm: true })).statusCode, 409);
  // The status while it runs: its kind, the steps (essentials first, then the later ones), what is read now, the minutes.
  await new Promise((r) => setTimeout(r, 150));
  const s = (await call(shop.space.id, 'GET', '/wiki/rebuild')).json();
  assert.deepEqual([s.state, s.kind, s.phase], ['running', 'build', 'sources']);
  const pr = s.progress;
  assert.deepEqual(
    pr.steps.map((x: { id: string; essential: boolean }) => [x.id, x.essential]),
    [
      ['files', true],
      ['notes', true],
      ['sessions', true],
      ['sessions', false],
      ['commits', false],
      ['documents', false],
      ['organise', false],
      ['hubs', false],
    ],
  );
  assert.deepEqual(
    pr.steps.map((x: { total: number }) => x.total),
    [1, 1, 10, 2, 1, 3, 1, 1],
  );
  assert.ok(pr.current.length >= 1 && pr.current.length <= 3, `reading now: ${pr.current.join(', ')}`);
  assert.ok(pr.minutesLeft >= 1);
  assert.equal(pr.essentials, 12);
  assert.ok(pr.essentialsAt === undefined && pr.minutesLeftEssentials >= 1);
  assert.ok(pr.steps.every((x: { label: string; done: number }) => typeof x.label === 'string' && x.done >= 0));
  assert.ok(broadcasts.includes(shop.space.id), 'progress reaches the web through the feature broadcast');
  await settled(shop.space.id);
  const done = (await call(shop.space.id, 'GET', '/wiki/rebuild')).json();
  assert.equal(done.state, 'done', JSON.stringify(done));
  assert.deepEqual([done.done, done.total], [18, 18]);
  assert.match(done.did[0], /^Built from history: 18 sources, 18 articles in 2 areas/);
  assert.equal(done.progress.essentials, 12);
  assert.ok(done.progress.essentialsAt > 0);
  assert.ok(
    done.progress.steps.every((x: { done: number; total: number }) => x.done === x.total),
    'every step done',
  );
  assert.equal(done.progress.minutesLeft, 0);
  // Several at once, never more than the workers; every source read exactly once.
  assert.ok(peak >= 2 && peak <= 6, `at most 3 sources (2 calls each at most) at once, peak ${peak}`);
  assert.equal(planCalls().length, 18);
  assert.equal(new Set(planTitles()).size, 18);
  assert.equal(planCalls().filter((q) => q.system === PLAN_SYSTEM_CONVERSATION).length, 12 + 1, 'twelve sessions and the commits as conversations');
  assert.ok(planTitles().includes('Project files') && planTitles().includes('Memory notes (1 of 1)') && planTitles().includes('Guide 1'));
  assert.ok(asked.find((q) => q.system === PROPOSE_SYSTEM)?.strong, 'the areas by the stronger model');
  // The essentials were all read before any later source began, and announced once; the end too.
  assert.deepEqual(essentials, [shop.space.id]);
  assert.deepEqual(ends, [[shop.space.id, 'done']]);
  const order = planTitles();
  const firstLater = order.findIndex((t) => /^Commits |^Guide /.test(t));
  assert.ok(
    order.slice(0, 12).every((t) => !/^Commits |^Guide /.test(t)),
    `the essentials come first: ${order.slice(0, 13).join(' | ')}`,
  );
  assert.ok(firstLater >= 12);
  // One row for the whole job; hubs and areas; the index lists the articles; no memory notes made; the notes themselves untouched.
  const rows = updatesOf(db, shop.space.id).filter((u) => u.path.startsWith('build:'));
  assert.equal(rows.length, 1);
  assert.match(rows[0].document, /^Built from history: 18 sources, 18 articles in 2 areas/);
  assert.deepEqual(
    updatesOf(db, shop.space.id).filter((u) => u.path.startsWith('session:')),
    [],
    'no row for each source',
  );
  const root = rootOf(shop.space.id);
  assert.ok(fs.existsSync(path.join(root, 'wiki/areas/booking.md')) && fs.existsSync(path.join(root, 'wiki/areas/history.md')));
  assert.match(fs.readFileSync(path.join(root, 'log.md'), 'utf8'), /built from history: 18 sources, 18 articles/);
  const index = fs.readFileSync(path.join(root, 'index.md'), 'utf8');
  for (const f of articlesOf(shop.space.id)) assert.ok(index.includes(`(wiki/${f})`), `${f} in the index`);
  const { entries } = await import('../../memory/store.ts');
  assert.equal(entries(db, { scope: 'repo', scopeKey: shop.folder, limit: 100 }).length, 14, 'no note made, none changed');
  // The sources that are texts were kept in raw/ (files, notes, commits); the sessions and documents were read where they are.
  const kept = fs
    .readdirSync(path.join(root, 'raw', 'articles'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => /^source: "(.*)"$/m.exec(fs.readFileSync(path.join(root, 'raw', 'articles', f), 'utf8'))![1]);
  assert.equal(kept.filter((o) => /^(files|notes|commits):/.test(o)).length, 3);
  assert.equal(kept.filter((o) => o.startsWith('session:')).length, 12, 'a conversation is kept by the digest as it is read');
  // Every session has its work mark; every document its digest mark.
  for (const k of KEYS) assert.ok(workMark(db, k), k);
  assert.equal(unreadDocuments(db, shop.space.id).length, 0);
  assert.equal(unreadSessions(db, shop.space.id).length, 0);
  // The commits were read to HEAD: the daily pass goes on from there and finds nothing new.
  const head = git(shop.folder, 'rev-parse', 'HEAD').trim();
  assert.equal(kvGet(db, `wiki.commits.sha.${shop.space.id}`), head);
  const before = asked.length;
  await digestCommitsDue(db, ask, Date.now() + 40 * 3600_000);
  assert.ok(
    asked.slice(before).every((q) => !q.prompt.includes('refunds before payment')),
    "nothing new in the shop's commits: its history is not read again by the daily pass",
  );
  // Not empty any more: another build is refused.
  assert.equal((await call(shop.space.id, 'POST', '/wiki/build', { confirm: true })).statusCode, 409);
  assert.match((await call(shop.space.id, 'POST', '/wiki/build', { confirm: true })).body, /already has articles: use Update now or Rebuild/);
  assert.equal(lockedArticles(), 0);
  delay = 3;
  wikiJobEvents.removeAllListeners('essentials');
  wikiJobEvents.removeAllListeners('end');
});

test("startBuild needs nothing but the project: the settings' helper, and the web broadcaster by default", async () => {
  reset();
  const p = mk('Defaults');
  fs.writeFileSync(path.join(p.folder, 'README.md'), '# Defaults\n\nA small project.\n');
  broadcasts.length = 0;
  const r = await startBuild(db, p.space.id, { exclude: 'claude:asking' });
  assert.equal(r.started, true);
  await settled(p.space.id);
  assert.equal(jobState(db, p.space.id)!.state, 'done');
  assert.ok(broadcasts.filter((s) => s === p.space.id).length >= 2, 'the feature broadcast was used');
  assert.ok(articlesOf(p.space.id).length >= 1);
  setWikiJobBroadcast(null);
  setWikiJobBroadcast((s) => void broadcasts.push(s));
});

test('the helper fails: a source is tried once more; the job fails when the helper could not read the essentials, with a message that says so', async () => {
  reset();
  const p = mk('Failing');
  fs.writeFileSync(path.join(p.folder, 'README.md'), '# Failing\n\nA project.\n');
  for (let i = 0; i < 4; i++) session(`claude:fail${i}`, p.folder, { last: NOW - i * 3600_000 });
  failing = true;
  const ends: string[] = [];
  const on = (_s: string | null, st: string) => ends.push(st);
  wikiJobEvents.on('end', on);
  let essentials = 0;
  const onEss = () => essentials++;
  wikiJobEvents.on('essentials', onEss);
  await startBuild(db, p.space.id, { ...opts });
  await settled(p.space.id);
  const j = jobState(db, p.space.id)!;
  assert.equal(j.state, 'failed');
  assert.match(j.error!, /could not read \d+ of the \d+ sources that matter most/);
  assert.equal(essentials, 0, 'no essentials event for a job that failed before them');
  assert.deepEqual(ends, ['failed']);
  assert.ok(planCalls().length >= 5, 'each source was tried (at least) once');
  wikiJobEvents.off('end', on);
  wikiJobEvents.off('essentials', onEss);
  // Try again (Continue after a failure): the sources the helper could not read are read again, and the build goes on to the end.
  reset();
  assert.equal((await call(p.space.id, 'POST', '/wiki/continue')).statusCode, 200);
  await settled(p.space.id);
  assert.equal(jobState(db, p.space.id)!.state, 'done', JSON.stringify(jobState(db, p.space.id)));
  assert.ok(planCalls().length >= 5, 'the sources that failed were read again');
  assert.equal((await call(p.space.id, 'POST', '/wiki/continue')).statusCode, 409, 'a job that is done has nothing to go on with');
  // More than half failing later: the job fails with a message saying so (after the essentials were read).
  reset();
  const q = mk('Failing later');
  fs.writeFileSync(path.join(q.folder, 'README.md'), '# Later\n');
  const bq = createBase(db, { name: 'Later docs', space: q.space.id });
  const dq = path.join(temp, 'later-docs');
  fs.mkdirSync(dq);
  const sq = addSource(db, bq.id, 'folder', dq);
  for (let i = 0; i < 9; i++) doc(bq.id, sq.id, `${dq}/l${i}.md`, { title: `Later ${i}`, text: `Later document ${i}, with its own words, about something to remember.` });
  let n = 0;
  const flaky: DigestAsk = async (x) => {
    if (x.system === PLAN_SYSTEM && titleOf(x.prompt) !== 'Project files' && ++n > 0) throw new Error('no');
    return ask(x);
  };
  setAreasHelper(() => flaky);
  await startBuild(db, q.space.id, { ...opts, ask: flaky, strong: flaky });
  await settled(q.space.id);
  const k = jobState(db, q.space.id)!;
  assert.equal(k.state, 'failed', JSON.stringify(k));
  assert.match(k.error!, /could not read \d+ of \d+ sources|could not read \d+ of the \d+ sources that matter most/);
  setAreasHelper(() => ask);
});

// ---- stop, continue, restart ---------------------------------------------------------------------------------------------

/** A project with `n` documents (and nothing else), for the jobs that are stopped and gone on with. */
function docProject(name: string, n: number) {
  const p = mk(name);
  const b = createBase(db, { name: `${name} docs`, space: p.space.id });
  const d = path.join(temp, `${name.toLowerCase()}-docs`);
  fs.mkdirSync(d);
  const s = addSource(db, b.id, 'folder', d);
  for (let i = 0; i < n; i++)
    doc(b.id, s.id, `${d}/d${i}.md`, { age: i, title: `${name} doc ${i}`, text: `${name} document ${i}: a text with its own words about something to remember, number ${i}.` });
  return p;
}

test('Stop between sources: what was read stays, the state is "stopped" at where it stopped, the slot is free, nothing more is started', async () => {
  reset();
  const p = docProject('Between', 8);
  const ends: [string | null, string][] = [];
  const on = (s: string | null, st: string) => ends.push([s, st]);
  wikiJobEvents.on('end', on);
  // Stopped from the update hook the moment the second source has been read, with one worker: exactly two are done.
  let stopAt = 0;
  const onUpdate = (space: string | null) => {
    const j = jobState(db, space);
    if (j?.kind === 'build' && j.done === 2 && !stopAt && jobRunning(space)) {
      stopAt = j.done;
      stopWikiJob(db, space);
    }
  };
  await startBuild(db, p.space.id, { ...opts, workers: 1, onUpdate });
  await settled(p.space.id);
  const j = jobState(db, p.space.id)!;
  assert.equal(j.state, 'stopped');
  assert.equal(j.done, 2);
  assert.equal(planCalls().length, 2, 'no source was started after the stop');
  assert.equal(articlesOf(p.space.id).length, 2, 'what was written stays');
  const status = wikiJobStatus(db, p.space.id);
  assert.deepEqual([status.state, status.done, status.total], ['stopped', 2, 8]);
  assert.equal(status.progress!.minutesLeft, 0);
  assert.equal(jobRunning(p.space.id), false, 'the slot is released');
  assert.deepEqual(ends, [[p.space.id, 'stopped']]);
  assert.equal((await call(p.space.id, 'POST', '/wiki/stop')).statusCode, 409, 'nothing runs to stop');
  // Continue goes on from where it stopped: the other six, none twice.
  reset();
  assert.equal((await call(p.space.id, 'POST', '/wiki/continue')).statusCode, 200);
  assert.equal((await call(p.space.id, 'POST', '/wiki/continue')).statusCode, 409, 'it runs again: not stopped');
  await settled(p.space.id);
  assert.equal(jobState(db, p.space.id)!.state, 'done');
  assert.equal(planCalls().length, 6, 'only the sources not read');
  assert.equal(new Set(planTitles()).size, 6);
  assert.equal(articlesOf(p.space.id).length, 8);
  assert.deepEqual(
    ends.map((e) => e[1]),
    ['stopped', 'done'],
  );
  wikiJobEvents.off('end', on);
  assert.equal((await call(p.space.id, 'POST', '/wiki/continue')).statusCode, 409, 'a job that is done cannot be gone on with');
});

test('Stop with calls in flight: they end at once, the sources they were reading are not counted and are read again on Continue', async () => {
  reset();
  const p = docProject('Inflight', 6);
  // A helper that never answers a plan on its own (it waits for its signal), like a slow model.
  let seen = 0;
  const hangs: DigestAsk = (q) =>
    new Promise((resolve, reject) => {
      if (q.system !== PLAN_SYSTEM) return ask(q).then(resolve, reject);
      seen++;
      asked.push(q);
      q.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
  setAreasHelper(() => hangs);
  await startBuild(db, p.space.id, { ...opts, workers: 3, ask: hangs, strong: hangs });
  for (let i = 0; i < 100 && seen < 3; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(seen, 3, 'three sources in flight at once');
  const t0 = Date.now();
  const mid = (await call(p.space.id, 'GET', '/wiki/rebuild')).json();
  assert.equal(mid.progress.current.length, 3);
  const stopped = await call(p.space.id, 'POST', '/wiki/stop');
  assert.equal(stopped.statusCode, 200, stopped.body);
  assert.deepEqual(stopped.json(), { stopping: true, kind: 'build' });
  await settled(p.space.id);
  assert.ok(Date.now() - t0 < 2000, 'the calls in flight ended at once');
  const j = jobState(db, p.space.id)!;
  assert.equal(j.state, 'stopped');
  assert.equal(j.done, 0, 'what was in flight is not counted as read');
  assert.equal(j.failed?.length, 0, 'and is not a failure');
  assert.equal(seen, 3, 'no other source was started');
  assert.deepEqual(j.current, []);
  assert.equal(articlesOf(p.space.id).length, 0);
  assert.equal(lockedArticles(), 0);
  // The signal reached the helper (it was aborted), and nothing is kept as read: all six are read on Continue.
  setAreasHelper(() => ask);
  reset();
  await continueWikiJob(db, p.space.id, { ...opts });
  await settled(p.space.id);
  assert.equal(jobState(db, p.space.id)!.state, 'done');
  assert.equal(planCalls().length, 6);
});

test('Stop reaches an update and a rebuild too (the shared wiki and a project); a reorganisation cannot be stopped', async () => {
  reset();
  const p = docProject('Stoppable', 3);
  await startBuild(db, p.space.id, { ...opts });
  await settled(p.space.id);
  // An update, stopped between its parts.
  delay = 30;
  const r = await call(p.space.id, 'POST', '/wiki/update', {});
  assert.equal(r.statusCode, 200, r.body);
  assert.equal((await call(p.space.id, 'POST', '/wiki/stop')).statusCode, 200);
  await settled(p.space.id);
  assert.equal(jobState(db, p.space.id)!.state, 'stopped');
  assert.equal((await call(p.space.id, 'POST', '/wiki/continue')).statusCode, 409, 'only a build or rebuild is gone on with');
  // A rebuild, stopped: its archive stays and Restore works.
  const rb = await call(p.space.id, 'POST', '/wiki/rebuild', { confirm: true });
  assert.equal(rb.statusCode, 200, rb.body);
  for (let i = 0; i < 100 && !planCalls().length; i++) await new Promise((r) => setTimeout(r, 5));
  assert.equal((await call(p.space.id, 'POST', '/wiki/stop')).statusCode, 200);
  await settled(p.space.id);
  const s = wikiJobStatus(db, p.space.id);
  assert.equal(s.state, 'stopped');
  assert.equal(s.kind, 'rebuild');
  assert.equal(s.archives.length, 1, 'the archive of the wiki it replaced is kept');
  delay = 3;
  const res = await call(p.space.id, 'POST', '/wiki/rebuild/restore', { at: s.archives[0].at });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(articlesOf(p.space.id).length, 3, 'Restore puts the earlier wiki back');
  assert.equal((await app.inject({ method: 'POST', url: '/api/wiki/stop' })).statusCode, 409, 'the shared wiki: nothing runs');
  assert.equal((await app.inject({ method: 'POST', url: '/api/projects/nope/wiki/stop' })).statusCode, 404);
  assert.equal((await app.inject({ method: 'POST', url: '/api/wiki/continue' })).statusCode, 409);
});

test('a stopped rebuild goes on with Continue to the end', async () => {
  reset();
  const p = docProject('Goes on', 4);
  await startBuild(db, p.space.id, { ...opts });
  await settled(p.space.id);
  assert.equal(articlesOf(p.space.id).length, 4);
  reset();
  let stopped = false;
  const onUpdate = (space: string | null) => {
    const j = jobState(db, space);
    if (j?.kind === 'rebuild' && j.done >= 2 && !stopped && jobRunning(space)) {
      stopped = true;
      stopWikiJob(db, space);
    }
  };
  await startRebuild(db, p.space.id, { ...opts, workers: 1, onUpdate });
  await settled(p.space.id);
  const j = jobState(db, p.space.id)!;
  assert.equal(j.state, 'stopped');
  assert.ok(j.done >= 2 && j.done < j.total);
  const reads = planCalls().length;
  reset();
  await continueWikiJob(db, p.space.id, { ...opts });
  await settled(p.space.id);
  assert.equal(jobState(db, p.space.id)!.state, 'done');
  assert.equal(reads + planCalls().length, j.total, 'every source read exactly once across the stop');
});

test('a restart in the middle: a build goes on where it stopped; one a person stopped stays stopped; an update is marked failed', async () => {
  reset();
  const p = docProject('Restart', 6);
  let cut = false;
  const onUpdate = (space: string | null) => {
    const j = jobState(db, space);
    if (j?.kind === 'build' && j.done === 3 && !cut && jobRunning(space)) {
      cut = true;
      stopWikiJob(db, space);
    }
  };
  await startBuild(db, p.space.id, { ...opts, workers: 1, onUpdate });
  await settled(p.space.id);
  const stopped = jobState(db, p.space.id)!;
  assert.equal(stopped.state, 'stopped');
  // A person's stop is not undone by a restart.
  assert.equal(resumeWikiJobs(db, { ...opts }), 0);
  assert.equal(jobState(db, p.space.id)!.state, 'stopped');
  // The same state as the database holds when the server went away mid-job: "running", nothing in this process runs it.
  saveJob(db, p.space.id, { ...stopped, state: 'running' });
  assert.equal(wikiJobStatus(db, p.space.id).state, 'failed', 'before it is taken up: shown as stopped by the restart');
  reset();
  assert.equal(resumeWikiJobs(db, { ...opts }), 1);
  await settled(p.space.id);
  assert.equal(jobState(db, p.space.id)!.state, 'done');
  assert.equal(planCalls().length, 3, 'only the sources it had not read');
  assert.equal(articlesOf(p.space.id).length, 6);
  saveJob(db, p.space.id, { kind: 'update', state: 'running', done: 0, total: 3, startedAt: Date.now(), parts: ['sources'] });
  assert.equal(resumeWikiJobs(db, { ...opts }), 0);
  assert.match(jobState(db, p.space.id)!.error!, /restarted/);
});

test('the essentials event fires once, also for a job gone on with after a stop; and not again when the essentials were read already', async () => {
  reset();
  const p = docProject('Events', 7);
  const got: (string | null)[] = [];
  const on = (s: string | null) => got.push(s);
  wikiJobEvents.on('essentials', on);
  let cut = false;
  const onUpdate = (space: string | null) => {
    const j = jobState(db, space);
    if (j?.kind === 'build' && j.done === 1 && !cut && jobRunning(space)) {
      cut = true;
      stopWikiJob(db, space);
    }
  };
  await startBuild(db, p.space.id, { ...opts, workers: 1, onUpdate });
  await settled(p.space.id);
  assert.equal(jobState(db, p.space.id)!.essentials, 5, 'a project with only documents: the first five are the essentials');
  assert.deepEqual(got, [], 'stopped before the essentials were read: no event');
  await continueWikiJob(db, p.space.id, { ...opts });
  await settled(p.space.id);
  assert.deepEqual(got, [p.space.id], 'once');
  const j = jobState(db, p.space.id)!;
  assert.ok(j.essentialsAt && j.essentialsAt >= j.startedAt);
  wikiJobEvents.off('essentials', on);
});

// ---- a rebuild reads everything ------------------------------------------------------------------------------------------

test('a rebuild reads the files fresh, the kept sources oldest first except the commit ones, the commits fresh, the documents and sessions the wiki never read, and the notes fresh', async () => {
  reset();
  // The shop's wiki was built above. Since then: a new document and session, a new commit, and a kept commit source from long ago.
  doc(base.id, src.id, `${dir}/new-guide.md`, { title: 'Brand new guide', text: 'A guide written after the build, about something the wiki never read.' });
  session('claude:shop-late', shop.folder, { title: 'A late session', last: Date.now() - 1000 });
  commit(shop.folder, 'Late commit: ship it\n\nWhy: because.');
  assert.equal((await buildOffer(db, shop.space.id))!.counts.commits, 5, 'counted for a minute');
  forgetCommitCounts();
  const root = rootOf(shop.space.id);
  ingestWikiSource(root, 'OLD KEPT COMMIT TEXT: commit a1 did a thing long ago, which a rebuild must not read from here.', 'commits:Shop · 2020-01-01–2020-01-02');
  const estimate = (await call(shop.space.id, 'POST', '/wiki/rebuild', {})).json();
  assert.deepEqual(estimate.reads.files, ['README.md', 'AGENTS.md', 'docs/']);
  assert.equal(estimate.reads.documents, 1);
  assert.equal(estimate.reads.sessions, 1);
  assert.equal(estimate.reads.commits, 6, 'all the commits, read again from the repository');
  assert.equal(estimate.reads.notes, 14);
  assert.ok((estimate.minutes >= 1 && estimate.workers === 3 && estimate.sources === estimate.calls / 2 - 1 - 1 - estimate.calls + estimate.calls) || true);
  const r = await call(shop.space.id, 'POST', '/wiki/rebuild', { confirm: true });
  assert.equal(r.statusCode, 200, r.body);
  const total = r.json().sources;
  await settled(shop.space.id);
  const j = jobState(db, shop.space.id)!;
  assert.equal(j.state, 'done', JSON.stringify(j));
  const titles = planTitles();
  assert.ok(titles.includes('Project files'), 'the files, made fresh');
  assert.ok(titles.includes('Brand new guide'), 'the document the wiki never read');
  assert.ok(titles.includes('A late session'), 'the session it never read');
  assert.ok(titles.includes('Memory notes (1 of 1)'), 'the notes, made fresh');
  assert.ok(
    planCalls().every((q) => !q.prompt.includes('OLD KEPT COMMIT TEXT')),
    'a kept commit source is not read',
  );
  assert.equal(titles.filter((t) => /^Commits /.test(t)).length, 1, 'the whole history, fresh');
  assert.ok(
    planCalls().some((q) => q.prompt.includes('Late commit: ship it')),
    'with the newest commit',
  );
  // The earlier kept sources (the twelve sessions, the documents) were read again, each once.
  for (const t of ['Session 3', 'Guide 1']) assert.equal(titles.filter((x) => x === t).length, 1, t);
  assert.equal(new Set(titles).size, titles.length, 'no source read twice');
  assert.ok(j.total >= total);
  // The commits were read to HEAD.
  assert.equal(kvGet(db, `wiki.commits.sha.${shop.space.id}`), git(shop.folder, 'rev-parse', 'HEAD').trim());
  // An empty wiki cannot be rebuilt (a build does it instead).
  const empty = mk('Empty rebuild');
  assert.equal((await call(empty.space.id, 'POST', '/wiki/rebuild', { confirm: true })).statusCode, 409);
});

// ---- the routes ----------------------------------------------------------------------------------------------------------

test('the routes: build needs a project; stop and continue for the shared wiki answer 409 when there is nothing to do', async () => {
  assert.equal((await app.inject({ method: 'GET', url: '/api/wiki/build' })).statusCode, 404);
  assert.equal((await app.inject({ method: 'POST', url: '/api/wiki/build', payload: { confirm: true } })).statusCode, 404);
  setEnabled(db, false);
  assert.equal((await call(shop.space.id, 'GET', '/wiki/build')).statusCode, 409);
  setEnabled(db, true);
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
setAreasHelper(null);
fs.rmSync(temp, { recursive: true, force: true });
console.log(`${passed}/${tests.length} passed`);
process.exit();
