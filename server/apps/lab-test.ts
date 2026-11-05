// Script tests for the lab's apps and what they stand on: work_log (what the user did in a period, from a scratch
// database with sessions, a Git repository made here and stand-in Experiments runs), updates on chosen days (the
// home settings' days, which the scheduled task follows), and the five ready-made apps (Annotation workbench,
// Research sprint, Sweep planner, Weekly progress report, Lab notebook): their steps and views check out, and their
// programs give the right values on canned inputs.
// Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/apps/lab-test.ts
//   DATA_DIR=/tmp/hydor-test-lab node dist/dev/lab-test.js
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { RunRecord } from '../../shared/experiments.ts';
import { migrateRuns } from '../automations/runs.ts';
import { kvSet, openDb } from '../db.ts';
import { initMedia } from '../media/store.ts';
import { createPage, initPages } from '../pages/store.ts';
import { allSpaces } from '../spaces/index.ts';
import { addRecord, ensureDataTables } from './data.ts';
import * as store from './store.ts';
import { workLog, workLogSources } from './worklog.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-lab-test-'));
const db = openDb(path.join(tmp, 'test.db'));
store.ensureTables(db);
initPages(db);
initMedia(db);
ensureDataTables(db);
migrateRuns(db);
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TZ = 'Europe/Athens';
kvSet(db, 'user.tz', TZ);
/** A day in Athens, as YYYY-MM-DD. */
const dayOf = (at: number) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);

// ---- a scratch Git repository, with a worktree, commits in the period and before it, and another person's ----

function git(cwd: string, args: string[], at?: number, who = 'Ada <ada@example.com>') {
  const [name, email] = [who.replace(/ <.*$/, ''), /<(.*)>/.exec(who)![1]];
  const when = at ? `${Math.floor(at / 1000)} +0000` : undefined;
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email, ...(when ? { GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when } : {}) } });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}
const now = Date.now();
const repo = path.join(tmp, 'retriever');
fs.mkdirSync(repo);
git(repo, ['init', '-q', '-b', 'main']);
git(repo, ['config', 'user.email', 'ada@example.com']);
git(repo, ['config', 'user.name', 'Ada']);
const commit = (msg: string, at: number, who?: string) => {
  fs.appendFileSync(path.join(repo, 'log.txt'), `${msg}\n`);
  git(repo, ['add', '.']);
  git(repo, ['commit', '-q', '-m', msg], at, who);
};
commit('Start the retriever', now - 20 * DAY);
commit('Add hard negatives to training', now - 2 * DAY);
commit('Fix the eval script', now - 1 * DAY - HOUR);
commit('A colleague’s change', now - 1 * DAY, 'Bo <bo@example.com>');
const worktree = path.join(tmp, 'retriever-sprint');
git(repo, ['worktree', 'add', '-q', '-b', 'sprint/curriculum', worktree]);
fs.appendFileSync(path.join(worktree, 'log.txt'), 'curriculum\n');
git(worktree, ['add', '.']);
git(worktree, ['commit', '-q', '-m', 'Try a curriculum on long queries'], now - 3 * HOUR);

// ---- sessions: in VS Code, started here, by a scheduled task; and those left out ----

const space = { id: 'sp-retriever', name: 'Retriever', color: 'blue', folder: repo, createdAt: now - 30 * DAY };
allSpaces(db);
db.prepare('insert into spaces (id, data, created_at) values (?, ?, ?)').run(space.id, JSON.stringify(space), space.createdAt);
db.prepare('insert into spaces (id, data, created_at) values (?, ?, ?)').run('sp-other', JSON.stringify({ id: 'sp-other', name: 'Thesis', color: 'green', folder: path.join(tmp, 'thesis'), createdAt: now - 30 * DAY }), now - 30 * DAY);

let seq = 0;
function session(o: { key: string; agent?: string; title: string; first?: string; cwd: string; from: number; to: number; source?: string; extra?: Record<string, unknown>; app?: boolean; archived?: boolean; cost?: number; parent?: string; indexed?: boolean; active?: number[] }) {
  if (o.indexed !== false)
    db.prepare('insert into sessions (key, agent, id, path, cwd, title, first_prompt, source, created_at, updated_at, cost_usd, parent_key) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      o.key,
      o.agent ?? 'claude',
      `id${++seq}`,
      `/x/${o.key}.jsonl`,
      o.cwd,
      o.title,
      o.first ?? o.title,
      o.source ?? null,
      o.from,
      o.to,
      o.cost ?? null,
      o.parent ?? null,
    );
  if (o.app || o.extra || o.archived)
    db.prepare('insert into app_sessions (key, agent, cwd, first_prompt, title, archived, created_by_app, created_at, updated_at, extra) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      o.key,
      o.agent ?? 'claude',
      o.cwd,
      o.first ?? o.title,
      o.indexed === false ? o.title : null,
      o.archived ? 1 : 0,
      o.app ? 1 : 0,
      o.from,
      o.to,
      o.extra ? JSON.stringify(o.extra) : null,
    );
  for (const at of o.active ?? [o.from, o.to]) db.prepare('insert or replace into activity (key, root, agent, hour, prompts, file_edits, lines_added, lines_removed) values (?, ?, ?, ?, 2, 3, 40, 5)').run(o.key, o.key, o.agent ?? 'claude', Math.floor(at / HOUR));
}
const chunk = (key: string, kind: string, text: string, at: number) => db.prepare('insert into chunk_text (key, kind, ts, text) values (?, ?, ?, ?)').run(key, kind, at, text);

session({ key: 'claude:vscode1', title: 'Hard negatives for the retriever', first: 'Add hard negatives mined with BM25 to the training set, then retrain the small model.', cwd: repo, from: now - 2 * DAY - 2 * HOUR, to: now - 2 * DAY, source: 'claude-vscode', cost: 1.234 });
chunk('claude:vscode1', 'assistant', 'I looked at the data loader first.', now - 2 * DAY - HOUR);
chunk('claude:vscode1', 'assistant', `${'Lots of detail about the run. '.repeat(20)}The retrained model reaches 0.412 MRR@10 on the dev set, up from 0.387. I committed the change.`, now - 2 * DAY);
chunk('claude:vscode1', 'file', path.join(repo, 'train.py'), now - 2 * DAY - HOUR);
chunk('claude:vscode1', 'file', path.join(repo, 'mine.py'), now - 2 * DAY - HOUR);
chunk('claude:vscode1', 'file', path.join(repo, 'old.py'), now - 12 * DAY);
session({ key: 'claude:sprint', title: 'Curriculum on long queries', cwd: worktree, from: now - 4 * HOUR, to: now - 3 * HOUR, source: 'cli', app: true });
session({ key: 'acp:here1', agent: 'acp', title: 'Draft the related work', cwd: path.join(tmp, 'thesis'), from: now - DAY, to: now - DAY + HOUR, app: true, indexed: false, extra: { space: 'sp-other' } });
session({ key: 'claude:task1', title: 'Morning brief · Nov 4, 07:00', cwd: tmp, from: now - DAY - 5 * HOUR, to: now - DAY - 5 * HOUR + 600_000, app: true, extra: { automations: { task: 't1', run: 'r1' } } });
db.prepare("insert into task_runs (id, task_id, trigger, started_at, status, outcome, summary, key) values ('r1', 't1', 'schedule', ?, 'done', 'done', 'Two meetings and rain later', 'claude:task1')").run(now - DAY - 5 * HOUR);
// Left out: memory off, Confidential, a child session, a subagent's transcript, an app run nobody watched, work done before the period only.
session({ key: 'claude:nomemory', title: 'Private thing', cwd: tmp, from: now - DAY, to: now - DAY, app: true, extra: { memory: false } });
session({ key: 'claude:secret', title: 'Grant review', cwd: tmp, from: now - DAY, to: now - DAY, app: true, extra: { confidential: true } });
session({ key: 'claude:child', title: 'A part of the work', cwd: repo, from: now - DAY, to: now - DAY, app: true, extra: { parent: 'claude:vscode1' } });
session({ key: 'claude:sub', title: 'Subagent', cwd: repo, from: now - DAY, to: now - DAY, parent: 'claude:vscode1' });
session({ key: 'claude:unwatched', title: 'An app run', cwd: tmp, from: now - DAY, to: now - DAY, archived: true, extra: { app: { id: 'tpl:x', run: 'r', name: 'X' } } });
session({ key: 'claude:before', title: 'Old work', cwd: repo, from: now - 15 * DAY, to: now - DAY, active: [now - 15 * DAY] });

// ---- runs, the Library and the Reading list ----

const runRec = (id: string, at: number, extra: Partial<RunRecord> = {}): RunRecord => ({ id, command: 'python train.py --lr 3e-4', cwd: repo, status: 'done', createdAt: at, startedAt: at, endedAt: at + HOUR, name: `run ${id}`, group: 'hard-negatives', metrics: { last: { mrr10: 0.412 } }, ...extra });
workLogSources.runs = () => [runRec('e2', now - DAY), runRec('e1', now - 20 * DAY), runRec('e3', now - 2 * HOUR, { status: 'running', endedAt: undefined, cwd: path.join(tmp, 'thesis'), name: 'bert baseline', metrics: { last: { loss: 1.2 } } })];
const page = createPage(db, { title: 'Results so far', kind: 'doc', model: { blocks: [] }, by: 'agent', space: 'sp-retriever' });
const old = createPage(db, { title: 'Old notes', html: '<p>x</p>', by: 'agent' });
db.prepare('update pages set created_at = ?, updated_at = ? where id = ?').run(now - 30 * DAY, now - 30 * DAY, old.id);
db.prepare("insert into media (id, kind, title, file, mime, bytes, caption, created_at, updated_at) values ('m1', 'image', 'Loss curves', 'x.png', 'image/png', 10, '', ?, ?)").run(now - DAY, now - DAY);
const papers = { papers: {} };
addRecord(db, 'tpl:reading-list', papers, 'papers', { title: 'Dense Passage Retrieval for Open-Domain Question Answering', authors: ['Karpukhin', 'Oğuz'], read: true, readAt: new Date(now - DAY).toISOString(), url: 'https://arxiv.org/abs/2004.04906' });
addRecord(db, 'tpl:reading-list', papers, 'papers', { title: 'Not read yet', status: 'to read' });

test('work_log: the period’s sessions (VS Code, started here, by a task), each with its project, how it ended, what was asked and how the reply ended; the rest left out', async () => {
  const log = await workLog(db, { from: dayOf(now - 6 * DAY), to: dayOf(now) }, { base: 'https://lab.example', now });
  assert.equal(log.timezone, TZ);
  assert.deepEqual(log.sessions.map((s) => s.key).sort(), ['acp:here1', 'claude:sprint', 'claude:task1', 'claude:vscode1']);
  const v = log.sessions.find((s) => s.key === 'claude:vscode1')!;
  assert.equal(v.via, 'VS Code');
  assert.equal(v.agent, 'Claude Code');
  assert.equal(v.project, 'Retriever', 'its project, from its folder');
  assert.equal(v.cost, 1.23);
  assert.equal(v.outcome, 'finished');
  assert.match(v.asked, /^Add hard negatives mined with BM25/);
  assert.match(v.replied, /0\.412 MRR@10 on the dev set, up from 0\.387\. I committed the change\.$/, 'the end of the last reply');
  assert.ok(v.replied.length <= 290, 'short');
  assert.deepEqual(v.files.sort(), [path.join(repo, 'mine.py'), path.join(repo, 'train.py')], 'the files it changed in the period');
  assert.deepEqual(v.work, { prompts: 4, edits: 6, added: 80, removed: 10 });
  assert.equal(v.link, 'https://lab.example/s/claude%3Avscode1');
  assert.match(v.started, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  const here = log.sessions.find((s) => s.key === 'acp:here1')!;
  assert.equal(here.via, 'Hydor');
  assert.equal(here.agent, 'Custom');
  assert.equal(here.project, 'Thesis', 'its project, from its settings');
  assert.equal(log.sessions.find((s) => s.key === 'claude:task1')!.outcome, 'done: Two meetings and rain later');
  assert.equal(log.sessions.find((s) => s.key === 'claude:task1')!.via, 'a scheduled task');
  assert.equal(log.sessions.find((s) => s.key === 'claude:sprint')!.project, 'Retriever', 'a worktree’s work is its repository’s project’s');
});

test('work_log: the commits of the repositories those sessions worked in (a worktree’s too), the user’s own, in the period; runs, Library items and papers read', async () => {
  const log = await workLog(db, { from: dayOf(now - 6 * DAY), to: dayOf(now) }, { base: 'https://lab.example', now });
  assert.deepEqual(
    log.commits.map((c) => c.subject),
    ['Try a curriculum on long queries', 'Fix the eval script', 'Add hard negatives to training'],
    'newest first; not a colleague’s, not before the period',
  );
  assert.ok(log.commits.every((c) => c.repo === fs.realpathSync(repo)), 'the worktree’s commits are its repository’s');
  assert.match(log.commits[0].hash, /^[0-9a-f]{7,}$/);
  assert.deepEqual(log.runs.map((r) => r.id).sort(), ['e2', 'e3'], 'runs at work in the period, a running one too');
  assert.deepEqual(log.runs.find((r) => r.id === 'e2')!.metrics, { mrr10: 0.412 });
  assert.deepEqual(log.library.map((l) => [l.kind, l.title, l.changed]).sort(), [['document', 'Results so far', 'made'], ['picture', 'Loss curves', 'made']]);
  assert.equal(log.library.find((l) => l.title === 'Results so far')!.link, `https://lab.example/pages/${page.id}`);
  assert.deepEqual(log.read.map((r) => [r.title, r.authors, r.link]), [['Dense Passage Retrieval for Open-Domain Question Answering', 'Karpukhin, Oğuz', 'https://arxiv.org/abs/2004.04906']]);
  assert.deepEqual(log.counts, { sessions: 4, commits: 3, runs: 2, library: 2, read: 1 });
});

test('work_log: one project’s work only, by its name; a day alone; dates checked', async () => {
  const p = await workLog(db, { from: dayOf(now - 6 * DAY), to: dayOf(now), project: 'retriever' }, { now });
  assert.equal(p.project, 'Retriever');
  assert.deepEqual(p.sessions.map((s) => s.key).sort(), ['claude:sprint', 'claude:vscode1'], 'its own and those in its folders');
  assert.equal(p.commits.length, 3);
  assert.deepEqual(p.runs.map((r) => r.id), ['e2']);
  assert.deepEqual(p.library.map((l) => l.title), ['Results so far']);
  const unknown = await workLog(db, { from: dayOf(now - 6 * DAY), to: dayOf(now), project: 'Nope' }, { now });
  assert.equal(unknown.sessions.length, 4, 'a project that is not there: everything');
  assert.match(unknown.notes.join(), /No project is called “Nope”/);
  const day = await workLog(db, { from: dayOf(now - 2 * DAY), to: dayOf(now - 2 * DAY) }, { now });
  assert.deepEqual(day.sessions.map((s) => s.key), ['claude:vscode1'], 'one day');
  assert.deepEqual(day.commits.map((c) => c.subject), ['Add hard negatives to training']);
  await assert.rejects(workLog(db, { from: '2026-11-31', to: '2026-12-01' }), /days, as 2026-11-02/);
  await assert.rejects(workLog(db, { from: '2026-11-06', to: '2026-11-02' }), /from comes before to/);
  await assert.rejects(workLog(db, { from: '2026-01-01', to: '2026-11-02' }), /At most 92 days/);
  const def = await workLog(db, {}, { now });
  assert.equal(def.to, dayOf(now));
  assert.equal(def.from, dayOf(now - 6 * DAY), 'the week up to today unless told');
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed} of ${tests.length} passed`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(process.exitCode ?? 0);
