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
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { RunRecord } from '../../shared/experiments.ts';
import type { AppTemplate } from '../../shared/apps.ts';
import { cleanRecipe } from '../../shared/apps.ts';
import { allSteps, checkFlow, cleanFlow, type CodeStep } from '../../shared/app-manifest.ts';
import { checkUi, cleanUi, missingIn, uiEngine } from '../../shared/app-ui.ts';
import { TEMPLATES } from './templates.ts';
import { AGREE } from './templates-lab.ts';
import { LAB_VIEWS } from './views-lab.ts';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { isActive } from '../../shared/apps.ts';
import type { ScheduledTask } from '../../shared/automations.ts';
import { HttpError } from '../auth.ts';
import { automations } from '../automations/index.ts';
import { migrateRuns } from '../automations/runs.ts';
import { kvSet, openDb } from '../db.ts';
import { vaultTables } from '../connections/vault.ts';
import { documents } from '../documents/index.ts';
import { registerFeatures } from '../features/registry.ts';
import type { Deps, Feature, RunCtx } from '../features/types.ts';
import { setHelperModel } from '../helper.ts';
import { AGENT_FILE } from '../models/config.ts';
import { Scheduler } from '../scheduler.ts';
import type { SessionManager } from '../sessions.ts';
import { apps } from './index.ts';
import { saveResult, startRun, startRuns, waitFor } from './runs.ts';
import { keysOfFlow } from './secrets.ts';
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
vaultTables(db);
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
// More than a day apart from the commit before, so the two are never on one day, whatever the hour.
commit('Fix the eval script', now - DAY + HOUR);
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
session({ key: 'claude:task1', title: 'Morning brief · Nov 4, 07:00', cwd: tmp, from: now - DAY + HOUR, to: now - DAY + HOUR + 600_000, app: true, extra: { automations: { task: 't1', run: 'r1' } } });
db.prepare("insert into task_runs (id, task_id, trigger, started_at, status, outcome, summary, key) values ('r1', 't1', 'schedule', ?, 'done', 'done', 'Two meetings and rain later', 'claude:task1')").run(now - DAY + HOUR);
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
  assert.equal(log.runs.find((r) => r.id === 'e2')!.link, 'https://lab.example/system/experiments/e2', 'its page in Experiments');
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

// ---- the five apps ------------------------------------------------------------------------------------------------

const LAB_IDS = ['annotation-workbench', 'research-sprint', 'sweep-planner', 'weekly-report', 'lab-notebook'];
const tpl = (id: string): AppTemplate => TEMPLATES.find((t) => t.id === id)!;
/** A program of a template's step, by its id (in a flow beside the main one when named). */
const codeOf = (t: AppTemplate, id: string, flow?: string): CodeStep => {
  const s = allSteps((flow ? t.flows![flow] : t.flow!).steps).find((x) => x.id === id);
  assert.ok(s && s.do === 'code', `${t.id}: a program called ${id}`);
  return s as CodeStep;
};
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
/** Runs a step's program as the sandbox would (its input through JSON), with a stand-in for ctx. */
const runCode = async (s: CodeStep, input: Record<string, unknown>, ctx: Record<string, unknown> = {}): Promise<any> => new AsyncFunction('input', 'ctx', s.code)(JSON.parse(JSON.stringify(input)), ctx);

test('the lab’s apps: each is there under its kind, its steps and flows check out, its view against its answer, the weekly report and the notebook open on their own page and start updating when they should', () => {
  for (const id of LAB_IDS) {
    const t = tpl(id);
    assert.ok(t, `${id} is a ready-made app`);
    assert.equal(t.category, id === 'weekly-report' || id === 'lab-notebook' ? 'Work' : 'Lab');
    assert.deepEqual(cleanFlow(t.flow).errors, [], `${id}: its steps`);
    assert.deepEqual(cleanRecipe(t).flow, t.flow, `${id}: tidy as written`);
    const c = checkFlow(t);
    assert.deepEqual(c.errors, [], `${id}: its steps check out`);
    assert.deepEqual(c.warnings.filter((w) => !/, which is empty when /.test(w)), [], `${id}: nothing it uses is missing`);
    assert.deepEqual(cleanUi(LAB_VIEWS[id]).errors, [], `${id}: its view as written, nothing dropped when it is tidied`);
    assert.deepEqual(Object.keys(t.ui!.widgets ?? {}), Object.keys(LAB_VIEWS[id].widgets ?? {}), `${id}: its widgets`);
    const v = checkUi(t);
    assert.deepEqual(v.errors, [], `${id}: its view against its answer`);
    assert.deepEqual(v.warnings, [], `${id}: its view, nothing that surprises`);
    assert.ok((t.examples ?? []).length >= 2, `${id}: examples`);
  }
  assert.equal(tpl('weekly-report').sessions, false);
  assert.deepEqual(tpl('weekly-report').home, { time: '16:00', days: [5] }, 'Fridays at 16:00');
  assert.deepEqual(tpl('lab-notebook').home, { time: '21:00' }, 'every evening');
  assert.ok(tpl('weekly-report').ui!.pages.some((p) => p.on === 'app') && tpl('lab-notebook').ui!.pages.some((p) => p.on === 'app'), 'their own pages');
  assert.deepEqual(Object.keys(tpl('annotation-workbench').data ?? {}), ['items']);
  assert.deepEqual(Object.keys(tpl('lab-notebook').data ?? {}), ['entries']);
  assert.deepEqual(tpl('annotation-workbench').secrets?.map((k) => [k.name, k.optional]), [['HF_TOKEN', true]], 'asked only when publishing');
});

test('agreement: the same label’s share, Cohen’s kappa and the confusion matrix, worked out right', () => {
  const { agreement, strength } = new Function(`${AGREE}\nreturn { agreement, strength };`)();
  // The textbook example: 50 items, 20 + 15 agreed, rows 25/25, columns 30/20: po 0.7, pe 0.5, kappa 0.4.
  const pairs = [...Array(20).fill(['yes', 'yes']), ...Array(5).fill(['yes', 'no']), ...Array(10).fill(['no', 'yes']), ...Array(15).fill(['no', 'no'])];
  const a = agreement(pairs, ['yes', 'no']);
  assert.equal(a.n, 50);
  assert.equal(a.po, 0.7);
  assert.ok(Math.abs(a.pe - 0.5) < 1e-12);
  assert.ok(Math.abs(a.kappa - 0.4) < 1e-12);
  assert.deepEqual(a.matrix, [[20, 5], [10, 15]]);
  assert.deepEqual([a.rows, a.cols], [[25, 25], [30, 20]]);
  assert.equal(strength(a.kappa), 'fair');
  // Three labels, one the model never gave: still in the matrix, in the order given.
  const b = agreement([['pos', 'pos'], ['neg', 'neg'], ['neu', 'pos'], ['pos', 'pos']], ['pos', 'neg', 'neu']);
  assert.deepEqual(b.labels, ['pos', 'neg', 'neu']);
  assert.deepEqual(b.matrix, [[2, 0, 0], [0, 1, 0], [1, 0, 0]]);
  assert.ok(Math.abs(b.kappa - (0.75 - (0.5 * 0.75 + 0.25 * 0.25)) / (1 - (0.5 * 0.75 + 0.25 * 0.25))) < 1e-12);
  // Everything one label by both: perfect, though kappa's chance term is 1; nothing yet: no numbers.
  assert.equal(agreement([['a', 'a'], ['a', 'a']], ['a', 'b']).kappa, 1);
  assert.equal(agreement([], ['a']).kappa, null);
  assert.equal(strength(0.85), 'almost perfect');
  assert.equal(strength(-0.1), 'poor');
});

test('Annotation workbench: labels and sources read, a sample from a CSV, JSON lines or pasted texts, each batch kept with the model’s label, and the card it publishes', async () => {
  const t = tpl('annotation-workbench');
  const setup = await runCode(codeOf(t, 'setup'), { labels: 'Positive, negative;positive\nneutral', guidelines: ' Be fair. ', file: '', dataset: 'https://huggingface.co/datasets/stanfordnlp/imdb/viewer/plain_text/test', texts: '', split: '', size: '5000', run: 'r1' });
  assert.deepEqual(setup.labels, ['Positive', 'negative', 'neutral'], 'each once');
  assert.equal(setup.line, 'Positive, negative, neutral');
  assert.deepEqual([setup.kind, setup.dataset, setup.config, setup.split, setup.size], ['hub', 'stanfordnlp/imdb', 'plain_text', 'test', 1000]);
  assert.equal(setup.size_url, 'https://datasets-server.huggingface.co/size?dataset=stanfordnlp%2Fimdb');
  assert.equal((await runCode(codeOf(t, 'setup'), { labels: 'a,b', texts: 'x', split: 'cfg/val', size: '' })).config, 'cfg');
  await assert.rejects(runCode(codeOf(t, 'setup'), { labels: 'a', texts: '' }), /Give the texts/);
  assert.equal((await runCode(codeOf(t, 'setup'), { labels: '1,2,3,4,5,6,7,8,9,10', texts: 'x' })).dropped.join(), '10', 'nine at most, one for each key');
  // Where to read on Hugging Face: pages of rows at random places, or the whole split when it is small.
  const sizes = { size: { splits: [{ config: 'plain_text', split: 'train', num_rows: 25000 }, { config: 'plain_text', split: 'test', num_rows: 25000 }] } };
  const where = await runCode(codeOf(t, 'where'), { sizes, dataset: 'stanfordnlp/imdb', config: '', split: 'test', size: 100, seed: 3 });
  assert.equal(where.split, 'test');
  assert.equal(where.pages.length, 10);
  assert.ok(where.pages.every((p: any) => /^https:\/\/datasets-server\.huggingface\.co\/rows\?dataset=stanfordnlp%2Fimdb&config=plain_text&split=test&offset=\d+&length=20$/.test(p.url)));
  assert.equal(new Set(where.pages.map((p: any) => p.url)).size, 10, 'no page twice');
  const small = await runCode(codeOf(t, 'where'), { sizes: { size: { splits: [{ config: 'default', split: 'train', num_rows: 35 }] } }, dataset: 'x/y', size: 100, seed: 3 });
  assert.deepEqual(small.pages.map((p: any) => /offset=(\d+)/.exec(p.url)![1]), ['0', '20', '40'].filter((o) => Number(o) < 35), 'the whole split');
  await assert.rejects(runCode(codeOf(t, 'where'), { sizes, dataset: 'x', split: 'nope' }), /no split nope/);
  // A sample: from the dataset's pages (its text column found by its name), from a CSV as read_document gives it, from JSON lines.
  const page = (from: number) => ({ data: { rows: Array.from({ length: 20 }, (_v, i) => ({ row_idx: from + i, row: { label: 1, text: `Review number ${from + i}` } })) } });
  const hub = await runCode(codeOf(t, 'sample'), { kind: 'hub', pages: [page(0), page(100)], total: 25000, dataset: 'stanfordnlp/imdb', config: 'plain_text', split: 'test', size: 30, seed: 9 });
  assert.equal(hub.count, 30);
  assert.equal(hub.column, 'text');
  assert.equal(hub.total, 25000);
  assert.equal(hub.source, 'stanfordnlp/imdb (plain_text, test)');
  assert.deepEqual(hub.items.map((x: any) => x.n), Array.from({ length: 30 }, (_v, i) => i + 1));
  assert.ok(hub.items.every((x: any) => /^Review number \d+$/.test(x.text) && /^row \d+$/.test(x.ref)));
  assert.notDeepEqual(hub.items.map((x: any) => x.text).slice(0, 5), ['Review number 0', 'Review number 1', 'Review number 2', 'Review number 3', 'Review number 4'], 'in a random order');
  assert.deepEqual(hub.batches.map((b: any) => b.first), [1, 21]);
  assert.match(hub.batches[0].lines, /^\[1\] Review number \d+\n\n\[2\] /);
  const again = await runCode(codeOf(t, 'sample'), { kind: 'hub', pages: [page(0), page(100)], total: 25000, dataset: 'stanfordnlp/imdb', size: 30, seed: 9 });
  assert.deepEqual(again.items, hub.items, 'the same run draws the same sample');
  const csv = ['## Sheet: reviews.csv', '', '|  | A | B |', '| --- | --- | --- |', '| 1 | id | review |', '| 2 | 7 | Great \\| funny<br>loved it |', '| 3 | 8 | Dull |'].join('\n');
  const fromCsv = await runCode(codeOf(t, 'sample'), { kind: 'file', file_text: csv, file_name: 'reviews.csv', size: 10, seed: 1 });
  assert.equal(fromCsv.column, 'review', 'the column with the longest texts');
  assert.deepEqual(fromCsv.items.map((x: any) => x.text).sort(), ['Dull', 'Great | funny\nloved it']);
  assert.equal(fromCsv.source, 'reviews.csv');
  const jsonl = '{"id": 1, "body": "First one"}\n{"id": 2, "body": "Second"}\nnot json\n';
  const fromJsonl = await runCode(codeOf(t, 'sample'), { kind: 'file', file_text: jsonl, file_name: 'x.jsonl', column: 'BODY', size: 10, seed: 1 });
  assert.deepEqual([fromJsonl.column, fromJsonl.count], ['body', 2]);
  await assert.rejects(runCode(codeOf(t, 'sample'), { kind: 'file', file_text: jsonl, column: 'nope', size: 10 }), /no column “nope”: it has id, body/);
  // Each batch kept: the model's label matched to one of the labels (without case), the set this run's.
  const added: any[] = [];
  const ctx = { data: { add: async (c: string, r: any) => (added.push([c, r]), { id: `x${added.length}` }) } };
  const kept = await runCode(codeOf(t, 'keep'), { batch: { batch: 1, first: 1 }, items: [{ n: 1, ref: 'line 1', text: 'Good' }, { n: 2, ref: 'line 2', text: 'Bad' }, { n: 21, ref: 'line 21', text: 'Later' }], judged: [{ n: 1, label: 'POSITIVE', reason: 'Praise' }, { n: 2, label: 'meh', reason: '?' }], labels: ['positive', 'negative'], sample: 'run-9' }, ctx);
  assert.deepEqual(kept, { kept: 2, counts: { positive: 1 } });
  assert.deepEqual(added, [
    ['items', { sample: 'run-9', n: 1, order: 1, ref: 'line 1', text: 'Good', model: 'positive', reason: 'Praise', done: false }],
    ['items', { sample: 'run-9', n: 2, order: 2, ref: 'line 2', text: 'Bad', model: '', reason: '?', done: false }],
  ]);
  const tally = await runCode(codeOf(t, 'tally'), { batches: [{ kept: 2, counts: { positive: 1 } }, { kept: 1, counts: { negative: 1 } }], labels: ['positive', 'negative'], source: 'texts pasted', dropped: [] });
  assert.deepEqual(tally, { count: 3, counts: [{ label: 'positive', count: 1 }, { label: 'negative', count: 1 }], name: '3 texts from texts pasted' });
  // What Publish sends: only the texts labelled, the card with the agreement, the commit as the Hub takes it.
  const items = [
    { n: 1, ref: 'line 1', text: 'Good', label: 'positive', model: 'positive', reason: 'Praise', done: true, notes: 'easy' },
    { n: 2, ref: 'line 2', text: 'Bad', label: 'negative', model: 'positive', reason: 'Hm', done: true },
    { n: 3, ref: 'line 3', text: 'Fine', label: 'negative', model: 'negative', done: true },
    { n: 4, ref: 'line 4', text: 'Unlabelled', model: 'negative', done: false },
  ];
  const files = await runCode(codeOf(t, 'files', 'publish'), { items, me: { name: 'ada' }, repo: 'my-labels', private: 'Yes', name: '4 texts from texts pasted', source: 'texts pasted', labels: 'positive, negative', guidelines: 'Be fair.' });
  assert.deepEqual([files.repo, files.org, files.name, files.private, files.rows, files.url], ['ada/my-labels', 'ada', 'my-labels', true, 3, 'https://huggingface.co/datasets/ada/my-labels']);
  assert.equal(files.kappa, 0.4, 'po 2/3, pe 4/9: kappa 0.4');
  const lines = files.body.split('\n').map((l: string) => JSON.parse(l));
  assert.deepEqual(lines.map((l: any) => [l.key, l.value.path]), [['header', undefined], ['file', 'README.md'], ['file', 'data.jsonl']]);
  const data = Buffer.from(lines[2].value.content, 'base64').toString('utf8').trim().split('\n').map((l: string) => JSON.parse(l));
  assert.deepEqual(data[0], { text: 'Good', label: 'positive', model_label: 'positive', model_reason: 'Praise', agree: true, notes: 'easy', source: 'line 1' });
  assert.equal(data.length, 3);
  const card = Buffer.from(lines[1].value.content, 'base64').toString('utf8');
  assert.match(card, /^---\npretty_name: "4 texts from texts pasted"\ntask_categories:\n- text-classification/);
  assert.match(card, /66\.7% agreement, Cohen’s κ 0\.40 \(fair\)/);
  assert.match(card, /\| You ↓, the model → \| positive \| negative \|\n\|---\|---:\|---:\|\n\| positive \| 1 \| 0 \|\n\| negative \| 1 \| 1 \|/);
  assert.match(card, /- `label`: the label given by hand/);
  assert.equal((await runCode(codeOf(t, 'files', 'publish'), { items, me: { name: 'ada' }, repo: 'https://huggingface.co/datasets/lab/x', private: 'No' })).repo, 'lab/x');
  await assert.rejects(runCode(codeOf(t, 'files', 'publish'), { items: [items[3]], me: { name: 'ada' }, repo: 'x' }), /Label some texts first/);
});

test('Research sprint: the runs fitted to the budget (the baseline first, each hypothesis in turn), and the sprint summed up whichever way it went', async () => {
  const t = tpl('research-sprint');
  const brief = await runCode(codeOf(t, 'brief'), { budget: '6', count: '9', repo: '~/code/retriever/', run: 'abc123' });
  assert.deepEqual(brief, { budget: 6, count: 5, group: 'sprint-abc123', tag: 'sprint:abc123', wait: 30, readme: '~/code/retriever/README.md', repo: '~/code/retriever' });
  const runs = [
    { name: 'h1-s1', hypothesis: 'H1', condition: 'curriculum', command: 'python train.py --curriculum --seed 1', gpus: 1, hours: 1.5, seed: 1 },
    { name: 'h1-s2', hypothesis: 'H1', condition: 'curriculum', command: 'python train.py --curriculum --seed 2', gpus: 1, hours: 1.5, seed: 2 },
    { name: 'base-s1', hypothesis: 'baseline', condition: 'baseline', command: 'python train.py --seed 1', gpus: 1, hours: 1.5, seed: 1 },
    { name: 'h2-s1', hypothesis: 'H2', condition: 'long-only', command: 'python train.py --long --seed 1', gpus: 2, hours: 2, seed: 1 },
    { name: 'empty', hypothesis: 'H2', condition: 'x', command: ' ' },
  ];
  const fit = await runCode(codeOf(t, 'fit'), { runs, budget: 5, worktree: '/w/retriever-sprint', metric: 'mrr10', better: 'higher', baseline: 'baseline' });
  assert.deepEqual(fit.runs.map((r: any) => r.name), ['base-s1', 'h1-s1', 'h2-s1'], 'the baseline, then the first of each hypothesis, while their GPU hours fit');
  assert.deepEqual(fit.dropped, ['h1-s2']);
  assert.equal(fit.hours, 5);
  assert.equal(fit.runs[0].cwd, '/w/retriever-sprint');
  assert.deepEqual([fit.metric, fit.better, fit.baseline], ['mrr10', 'max', 'baseline']);
  assert.match(fit.lines, /Left out to stay within the budget: h1-s2$/);
  assert.equal((await runCode(codeOf(t, 'fit'), { runs, budget: 100, better: 'lower is better' })).better, 'min');
  const chosen = await runCode(codeOf(t, 'chosen'), { proposed: [{ id: 'H1', hypothesis: 'A curriculum helps', confirm: '+2 MRR' }, { id: 'H2', hypothesis: 'Long only helps' }], mine: 'A curriculum helps\nWarmup matters' });
  assert.deepEqual(chosen.hypotheses.map((h: any) => [h.id, h.hypothesis, h.confirm ?? '']), [['H1', 'A curriculum helps', '+2 MRR'], ['H2', 'Warmup matters', '']]);
  // Summed up: verdicts read as marks, the runs with the metric that decides, how it went.
  const waited = { runs: [
    { id: 'e1', name: 'base-s1', status: 'done', params: { condition: 'baseline', hypothesis: 'baseline' }, metrics: { last: { mrr10: 0.31 } }, startedAt: now - 5 * HOUR, endedAt: now - 4 * HOUR, gpus: 1 },
    { id: 'e2', name: 'h1-s1', status: 'done', params: { condition: 'curriculum', hypothesis: 'H1' }, metrics: { last: { mrr10: 0.33 }, best: { mrr10: 0.34 } }, startedAt: now - 5 * HOUR, endedAt: now - 4.5 * HOUR, gpus: 2 },
  ] };
  const hyps = [{ id: 'H1', hypothesis: 'A curriculum helps', confirm: '+2', refute: 'no gain' }, { id: 'H2', hypothesis: 'Long only helps' }, { id: 'H3', hypothesis: 'Noise' }];
  const verdicts = [{ id: 'h1', verdict: 'Supported', evidence: '0.34 against 0.31' }, { id: 'H2', verdict: 'Not supported: no gain' }, { id: 'H3', verdict: 'Unclear, too noisy' }];
  const wrap = await runCode(codeOf(t, 'wrap'), { question: 'Q?', hypotheses: hyps, verdicts, waited, ids: ['e1', 'e2'], approved: true, metric: 'mrr10', table: { markdown: '| a |' }, report: 'R', notebook: 'https://x/pages/n1', next: '- more seeds', branch: 'sprint/curriculum', worktree: '/w', planned: 3 });
  assert.deepEqual(wrap.hypotheses.map((h: any) => h.mark), ['supported', 'refuted', 'unclear']);
  assert.deepEqual(wrap.runs.map((r: any) => [r.id, r.condition, r.value]), [['e1', 'baseline', 0.31], ['e2', 'curriculum', 0.34]], 'the best when it was kept');
  assert.equal(wrap.status, 'Done: 2 of 2 runs finished');
  assert.equal(wrap.hours, 2, 'GPU hours they took: an hour, and half an hour on two GPUs');
  assert.deepEqual([wrap.results, wrap.report, wrap.notebook, wrap.next], ['| a |', 'R', 'https://x/pages/n1', ['more seeds']]);
  const no = await runCode(codeOf(t, 'wrap'), { question: 'Q?', hypotheses: hyps, approved: false, planned: 3 });
  assert.match(no.status, /^Stopped before its runs/);
  assert.deepEqual(no.hypotheses.map((h: any) => h.mark), ['untested', 'untested', 'untested']);
  assert.equal(no.hours, 3, 'the hours planned when none ran');
  assert.equal((await runCode(codeOf(t, 'wrap'), { hypotheses: hyps, approved: '', ids: [], refused: ['No GPU fits'] })).status, 'No runs started: No GPU fits');
});

test('Sweep planner: the budget read as runs or GPU hours, grid or random within it, your changes, and what mattered (eta squared) with the best run', async () => {
  const t = tpl('sweep-planner');
  const settings = [{ name: 'lr', values: '1e-4, 3e-4, 1e-3', why: '' }, { name: 'batch_size', values: '16, 32', why: '' }];
  const plan = await runCode(codeOf(t, 'plan'), { settings, given: '', command: 'python train.py --lr {lr}', hours: 0.5, gpus: 1, budget: '20 runs' });
  assert.deepEqual(plan.params, { lr: [0.0001, 0.0003, 0.001], batch_size: [16, 32] });
  assert.deepEqual([plan.mode, plan.runs, plan.grid, plan.hours, plan.budget], ['grid', 6, 6, 3, '20 runs']);
  assert.equal(plan.command, 'python train.py --lr {lr} --batch-size {batch_size}', 'a placeholder for each setting');
  const tight = await runCode(codeOf(t, 'plan'), { settings, given: 'dropout: 0, 0.1', command: 'x', hours: 1, gpus: 2, budget: '7 GPU hours' });
  assert.deepEqual([tight.mode, tight.runs, tight.grid, tight.most], ['random', 3, 12, 3], 'seven GPU hours, two GPUs an hour each: three runs, drawn at random');
  assert.deepEqual(tight.params.dropout, [0, 0.1], 'the researcher’s own settings too');
  await assert.rejects(runCode(codeOf(t, 'plan'), { settings: [], given: '', command: 'x', budget: '5' }), /No settings to tune/);
  const final = await runCode(codeOf(t, 'final'), { params: plan.params, changes: 'lr: 3e-4, 1e-3\ndrop batch_size', command: plan.command, most: 20, each: 0.5, gpus: 1, metric: 'val_loss', better: 'Lower', early: 'Yes', steps: 200, run: 'r42' });
  assert.deepEqual(final.params, { lr: [0.0003, 0.001] });
  assert.deepEqual([final.mode, final.runs, final.group, final.better, final.hours], ['grid', 2, 'sweep-r42', 'min', 1]);
  assert.deepEqual(final.early, { metric: 'val_loss', better: 'min', afterSteps: 200 });
  assert.equal((await runCode(codeOf(t, 'final'), { params: plan.params, command: 'x', most: 5, early: 'No', metric: 'acc', better: 'Higher' })).early, null);
  assert.deepEqual((await runCode(codeOf(t, 'started'), { early: { sweep: 's1', runs: ['a', 'b'] }, all: '' })).ids, ['a', 'b']);
  // What mattered: the learning rate explains almost all of the spread, the batch size almost none; lower is better.
  const rec = (id: string, lr: number, bs: number, v: number | null, status = 'done') => ({ id, name: id, status, params: { lr, batch_size: bs }, metrics: v === null ? {} : { last: { val_loss: v } } });
  const waited = { runs: [rec('a', 1e-4, 16, 1.0), rec('b', 1e-4, 32, 1.1), rec('c', 1e-3, 16, 2.0, 'stopped'), rec('d', 1e-3, 32, 2.1), rec('e', 1e-3, 64, null, 'failed')] };
  const an = await runCode(codeOf(t, 'analyse'), { waited, metric: 'val_loss', better: 'Lower', names: { lr: [], batch_size: [] } });
  assert.deepEqual([an.best, an.best_value, an.best_run, an.count, an.scored, an.stopped], ['lr=0.0001, batch_size=16', 1, 'a', 5, 4, 1]);
  assert.deepEqual(an.mattered.map((m: any) => [m.setting, m.effect, m.best]), [['lr', 0.99, '0.0001'], ['batch_size', 0.01, '16']]);
  assert.equal(an.mattered[0].means, '0.0001: 1.05 · 0.001: 2.05');
  assert.deepEqual(an.points.filter((p: any) => p.setting === 'lr').map((p: any) => [p.value, p.metric]), [['0.0001', 1], ['0.0001', 1.1], ['0.001', 2], ['0.001', 2.1]]);
  assert.deepEqual(an.runs.map((r: any) => [r.id, r.best]), [['a', true], ['b', false], ['c', false], ['d', false], ['e', false]], 'best first, those without the metric last');
  const higher = await runCode(codeOf(t, 'analyse'), { waited, metric: 'val_loss', better: 'Higher', names: {} });
  assert.equal(higher.best_run, 'd');
  await assert.rejects(runCode(codeOf(t, 'analyse'), { waited: { runs: [rec('x', 1, 1, null, 'failed')] }, metric: 'val_loss', better: 'Lower' }), /None of its runs reported val_loss \(failed\)/);
});

test('Weekly progress report: the week’s dates (across a month and a year), its log digested, the report as Markdown and as an email; Lab notebook: the day, the entry and its link', async () => {
  const w = tpl('weekly-report');
  assert.deepEqual(await runCode(codeOf(w, 'week'), { today: '2026-11-06' }), { from: '2026-10-31', to: '2026-11-06', week: '31 October – 6 November 2026', next_from: '2026-11-09', next_to: '2026-11-13', next_week: '9–13 November 2026' });
  assert.deepEqual(await runCode(codeOf(w, 'week'), { today: '2026-11-13' }), { from: '2026-11-07', to: '2026-11-13', week: '7–13 November 2026', next_from: '2026-11-16', next_to: '2026-11-20', next_week: '16–20 November 2026' });
  const ny = await runCode(codeOf(w, 'week'), { today: '2027-01-02' });
  assert.deepEqual([ny.week, ny.next_week], ['27 December 2026 – 2 January 2027', '4–8 January 2027']);
  assert.equal((await runCode(codeOf(w, 'week'), { today: '2026-11-09' })).next_from, '2026-11-16', 'on a Monday, next week is the one after');
  const log = await workLog(db, { from: dayOf(now - 6 * DAY), to: dayOf(now) }, { base: 'https://lab.example', now });
  const d = await runCode(codeOf(w, 'digest'), { log, audience: 'Your team' });
  assert.match(d.text, /^## Retriever \(2 sessions\)\n- Curriculum on long queries/);
  assert.match(d.text, /Its reply ended: …?.*0\.412 MRR@10/);
  assert.match(d.text, /## Commits\n- retriever: Try a curriculum on long queries/);
  assert.match(d.text, /## Experiment runs\n- run e2 \(hard-negatives\): done; mrr10=0\.412/);
  assert.match(d.text, /## Papers read\n- Dense Passage Retrieval/);
  assert.deepEqual(d.stats, [{ what: 'Sessions', count: 4 }, { what: 'Commits', count: 3 }, { what: 'Experiment runs', count: 2 }, { what: 'Made in the Library', count: 2 }, { what: 'Papers read', count: 1 }]);
  assert.equal(d.empty, false);
  assert.match(d.reader, /^their team/);
  const empty = await runCode(codeOf(w, 'digest'), { log: { sessions: [] }, audience: 'Your advisor' });
  assert.deepEqual([empty.empty, empty.reader], [true, 'their advisor']);
  const c = await runCode(codeOf(w, 'compose'), { title: 'Hard negatives help', summary: 'A good week.', done: ['Mined hard negatives', 'Retrained'], results: '- MRR@10 0.412, up from 0.387', problems: [], next: ['Long queries'], questions: [], week: '31 October – 6 November 2026', audience: 'Your team' });
  assert.equal(c.markdown, '## Hard negatives help\n\n*Week of 31 October – 6 November 2026*\n\nA good week.\n\n### Done\n- Mined hard negatives\n- Retrained\n\n### Results\n- MRR@10 0.412, up from 0.387\n\n### Next week\n- Long queries\n');
  assert.equal(c.subject, 'Weekly update, 31 October – 6 November 2026: Hard negatives help');
  assert.match(c.email, /^Hi all,\n\nA good week\.\n\nDone this week:\n- Mined hard negatives\n- Retrained\n\nResults:\n- MRR@10 0\.412, up from 0\.387\n\nNext week:\n- Long queries\n\nThanks,\n$/);
  assert.deepEqual(c.results, ['MRR@10 0.412, up from 0.387']);
  // The notebook: the day (never one still to come), its links as the app's own paths, the entry with its own link.
  const n = tpl('lab-notebook');
  assert.deepEqual(await runCode(codeOf(n, 'day'), { today: '2026-11-05', date: '' }), { date: '2026-11-05', name: 'Thursday 5 November 2026' });
  assert.deepEqual(await runCode(codeOf(n, 'day', 'earlier'), { today: '2026-11-05', date: '2026-11-02' }), { date: '2026-11-02', name: 'Monday 2 November 2026' });
  await assert.rejects(runCode(codeOf(n, 'day', 'earlier'), { today: '2026-11-05', date: '2026-11-06' }), /not come yet/);
  const nd = await runCode(codeOf(n, 'digest'), { log });
  assert.equal(nd.count, 12);
  assert.deepEqual(nd.links.find((l: any) => l.kind === 'session' && l.title === 'Hard negatives for the retriever'), { kind: 'session', title: 'Hard negatives for the retriever', url: '/s/claude%3Avscode1' }, 'the app’s own pages as paths');
  assert.ok(nd.links.some((l: any) => l.kind === 'commit' && /^Fix the eval script · retriever [0-9a-f]+$/.test(l.title) && l.url === ''));
  assert.ok(nd.links.some((l: any) => l.kind === 'paper' && l.url === 'https://arxiv.org/abs/2004.04906'));
  assert.ok(nd.links.some((l: any) => l.kind === 'file' && l.title === path.join(repo, 'train.py')));
  const e = await runCode(codeOf(n, 'entry'), { day: { date: '2026-11-05', name: 'Thursday 5 November 2026' }, written: { title: 'Hard negatives help', summary: 'Retrained.', tried: ['BM25 negatives'], found: '- 0.412 MRR@10', decided: [], open: ['Long queries?'] }, links: nd.links.slice(0, 2), base: 'https://lab.example', run: 'run 7' });
  assert.equal(e.link, 'https://lab.example/apps/runs/run%207');
  assert.match(e.text, /^## Thursday 5 November 2026: Hard negatives help\n\nRetrained\.\n\n### Tried\n- BM25 negatives\n\n### Found\n- 0\.412 MRR@10\n\n### Open questions\n- Long queries\?\n\n### Links\n- /);
  const said = await runCode(codeOf(n, 'say'), { day: { date: '2026-11-05', name: 'Thursday 5 November 2026' }, entry: '', kept: '' });
  assert.deepEqual([said.kept, said.title], [false, 'Nothing on Thursday 5 November 2026']);
});

test('the views draw with a run’s values: the workbench’s next text with a button and a key for each label, and the last one beside the model’s; a chart for each setting; a report; an entry; no name a run page uses is missing', () => {
  const E = uiEngine();
  const draw = (t: AppTemplate, el: string, v: unknown, root: Record<string, unknown> = {}) =>
    E.render(t.ui!.elements![el].html, { root: { result: {}, inputs: {}, run: { id: 'r1' }, app: { id: `tpl:${t.id}` }, last: {}, state: {}, page: {}, data: {}, event: {}, today: '2026-11-05', now: '', ...root }, stack: v === undefined ? [] : [{ v, item: true }], lang: 'en' });
  const t = tpl('annotation-workbench');
  const result = { name: '3 texts from texts pasted', source: 'texts pasted', labels: ['positive', 'negative'], guidelines: 'Be **fair**', count: 3, total: 3, column: 'text', model_counts: [] };
  const records = [
    { id: 'a', n: 1, order: 1, text: 'Loved it', model: 'positive', reason: 'Praise', done: true, label: 'positive', agree: true, updatedAt: 2 },
    { id: 'b', n: 2, order: 2, text: 'Dull & long', model: 'positive', reason: 'Too kind', done: true, label: 'negative', agree: false, updatedAt: 3 },
    { id: 'c', n: 3, order: 3, ref: 'line 3', text: 'Next one <b>', model: 'negative', reason: 'Secret', done: false },
  ];
  const wb = draw(t, 'workbench', records, { result });
  assert.match(wb, /width: calc\(2 \/ 3 \* 100%\)/, 'the bar');
  assert.match(wb, /<b>2<\/b> of 3 labelled · you and the model agreed on <b>1<\/b>/);
  assert.match(wb, /class="last differ">[\s\S]*Text 2[\s\S]*You: <b>negative<\/b>[\s\S]*The model: <b>positive<\/b>[\s\S]*“Too kind”/, 'the last one labelled, beside the model’s');
  const next = wb.slice(wb.indexOf('<article class="item">'));
  assert.match(next, /Text 3 · line 3/);
  assert.match(next, /Next one &lt;b&gt;/, 'what it shows is escaped');
  assert.match(next, /data-event="label" data-id="c" data-label="positive" data-model="negative" data-hotkey="1"><kbd>1<\/kbd><span>positive<\/span>/);
  assert.match(next, /data-hotkey="2"><kbd>2<\/kbd><span>negative<\/span>/);
  assert.doesNotMatch(next, /Secret|The model:/, 'the model’s label and reason stay hidden until you give yours');
  assert.match(next, /data-event="skip" data-id="c" data-order="3" data-hotkey="skip"/);
  assert.match(next, /Keys 1 to 2 label it/);
  assert.match(wb, /^<n-widget name="keys"><\/n-widget>/, 'the keys first, where they stay');
  const all = draw(t, 'workbench', records.map((r) => ({ ...r, done: true, label: 'positive' })), { result });
  assert.match(all, /All 3 are labelled\./);
  assert.doesNotMatch(all, /class="item"/);
  assert.match(draw(t, 'set-head', undefined, { result }), /<kbd>1<\/kbd>positive<\/span><span class="chip"><kbd>2<\/kbd>negative[\s\S]*<strong>fair<\/strong>/);
  const ag = draw(t, 'agreement', records.slice(0, 2), { result, state: { agree: { n: 2, same: 1, po: 0.5, pe: 0.5, kappa: 0, level: 1 } } });
  assert.match(ag, /<b>50%<\/b><span>the same label, on 1 of 2 texts<\/span>/);
  assert.match(ag, /Cohen’s κ: poor/);
  assert.match(ag, /<n-widget name="matrix" value="\[\{&quot;id&quot;:&quot;a&quot;/);
  const ex = draw(t, 'export', records.slice(0, 2), { result, state: { pub: { working: false, error: 'Annotation workbench needs a key first: Hugging Face token.' } } });
  assert.match(ex, /The 2 texts you have labelled/);
  assert.match(ex, /<span class="st err">Annotation workbench needs a key first/);
  // The download link, as the view's event fills it: this app's records of this set, as CSV.
  const url = E.fill(t.ui!.events!.csv[0].url!, { root: { run: { id: 'r 1' }, app: { id: 'tpl:annotation-workbench' } }, stack: [] });
  assert.equal(url, '/api/apps/tpl%3Aannotation-workbench/data/items?where=%7B%22sample%22%3A%22r%201%22%2C%22done%22%3Atrue%7D&sort=n&format=csv&fields=n,ref,text,label,model,reason,agree,notes&name=labels-r%201');
  assert.deepEqual(JSON.parse(decodeURIComponent(/where=([^&]+)/.exec(url)![1])), { sample: 'r 1', done: true });
  // The sweep: a box chart for each setting, from its own points only.
  const sw = tpl('sweep-planner');
  const points = [{ setting: 'lr', value: '0.001', metric: 1, run: 'a' }, { setting: 'bs', value: '16', metric: 1, run: 'a' }];
  const plot = E.render(sw.ui!.elements!['setting-plot'].html, { root: { result: { points }, inputs: { metric: 'val_loss' } }, stack: [{ v: { setting: 'lr', effect: 0.9, best: '0.001' }, item: true }], lang: 'en' });
  assert.match(plot, /value="\[\{&quot;setting&quot;:&quot;lr&quot;,&quot;value&quot;:&quot;0\.001&quot;,&quot;metric&quot;:1,&quot;run&quot;:&quot;a&quot;\}\]"/);
  assert.match(plot, /explains 90% of the spread · best at 0\.001/);
  assert.match(E.render(sw.ui!.elements!.mattered.html, { root: {}, stack: [{ v: { setting: 'lr', effect: 0.825, best: '0.001', means: 'x' }, item: true }], lang: 'en' }), /style="width: 82\.5%"/);
  // The weekly report and a notebook entry, from their answers.
  const w = tpl('weekly-report');
  const report = { title: 'Hard negatives help', week: '2–6 November 2026', audience: 'Your team', summary: 'Good week.', done: ['A', 'B'], results: [], problems: ['Slow GPUs'], next: ['C'], questions: [], stats: [{ what: 'Sessions', count: 4 }, { what: 'Commits', count: 3 }] };
  const head = draw(w, 'report-head', report);
  assert.match(head, /Weekly report · 2–6 November 2026 · for your team/);
  assert.match(head, /<span><b>4<\/b> sessions<\/span><span><b>3<\/b> commits<\/span>/);
  const body = draw(w, 'report-body', report);
  assert.match(body, /<h3>Done this week<\/h3><ul><li>A<\/li><li>B<\/li><\/ul>/);
  assert.match(body, /class="warn"><h3>Problems and blockers<\/h3>/);
  assert.doesNotMatch(body, /Results|Questions/, 'empty parts left out');
  const n = tpl('lab-notebook');
  const entry = draw(n, 'entry', { date: '2026-11-05', title: 'Hard negatives help', summary: 'S', tried: ['T'], found: [], decided: ['D'], open: [], links: [{ kind: 'session', title: 'Hard negatives', url: '/s/x' }, { kind: 'commit', title: 'Fix · retriever abc', url: '' }], link: 'https://lab.example/apps/runs/r1' });
  assert.match(entry, /<time class="date" datetime="2026-11-05"><b>5<\/b><span>Nov 2026<\/span><\/time>/);
  assert.match(entry, /<p class="wd">Thursday<\/p><h2>Hard negatives help<\/h2>/);
  assert.match(entry, /<a href="\/s\/x" class="lk session" data-event="go" data-url="\/s\/x">Hard negatives<\/a><span class="lk commit">Fix · retriever abc<\/span>/);
  assert.match(entry, /data-event="copy_link">Copy its link/);
  assert.doesNotMatch(entry, /<h3>Found<\/h3>/);
  // Every name the run pages use is in their answers (or the form's).
  const answers: Record<string, Record<string, unknown>> = {
    'annotation-workbench': result,
    'research-sprint': { question: 'Q', status: 'Done', hypotheses: [{ id: 'H1', hypothesis: 'h', verdict: 'Supported', mark: 'supported', evidence: 'e', confirm: 'c', refute: 'r' }], runs: [{ id: 'x1', name: 'n', condition: 'c', hypothesis: 'H1', status: 'done', value: 1 }], results: '| a |', results_page: '/system/experiments?table=t1', report: 'R', notebook: '/pages/n', next: ['x'], branch: 'b', worktree: '/w', hours: 1 },
    'sweep-planner': { best: 'lr=1', best_value: 1, best_run: 'a', summary: 'S', next: ['x'], mattered: [{ setting: 'lr', effect: 0.5, best: '1', means: 'm' }], points, runs: [{ id: 'a', settings: 'lr=1', value: 1, status: 'done', best: true }], count: 1, stopped: 0, group: 'g', page: '/system/experiments?sweep=s', hours: 1 },
    'weekly-report': { ...report, from: '2026-11-02', to: '2026-11-06', markdown: 'M', subject: 'S', email: 'E' },
    'lab-notebook': { title: 'T', date: '2026-11-05', day: 'Thursday 5 November 2026', summary: 'S', tried: [], found: [], decided: [], open: [], links: [], link: 'L', kept: true },
  };
  for (const id of LAB_IDS) assert.deepEqual(missingIn(tpl(id).ui!, { result: answers[id], inputs: Object.fromEntries(tpl(id).fields.map((f) => [f.id, f.default ?? 'x'])) }), [], `${id}: its run pages`);
});

// ---- whole runs, with stand-ins: agent sessions, a model, Experiments' tools ------------------------------------------

/** The session manager: sessions start at once and work until a test ends their turn. */
class FakeSessions extends EventEmitter {
  made: { key: string; o: any }[] = [];
  status = new Map<string, string>();
  replies = new Map<string, string[]>();
  archived = new Set<string>();
  async create(o: any) {
    const key = `acp:fake-${this.made.length + 1}-${Math.random().toString(36).slice(2, 8)}`;
    this.made.push({ key, o });
    this.status.set(key, 'working');
    return key;
  }
  setFlags(key: string, f: { archived?: boolean }) {
    if (f.archived) this.archived.add(key);
  }
  summary(key: string) {
    const st = this.status.get(key);
    return st ? ({ key, agent: 'acp', stats: { tokensIn: 0, tokensOut: 0, tokensCached: 0 }, live: { status: st } } as any) : null;
  }
  async timeline(key: string) {
    const said = this.replies.get(key) ?? [];
    return { parser: { items: said.map((text, i) => ({ kind: 'assistant', id: `a${i}`, seq: i, text })) }, readMore: async () => {} } as any;
  }
  liveSnapshot() {
    return { live: null, overlay: { items: [], patches: {}, approvals: [] } };
  }
  async interrupt(key: string) {
    this.status.set(key, 'idle');
    this.emit('live', key);
  }
  async deliverOrQueue(key: string) {
    this.status.set(key, 'working');
  }
  end(key: string, reply = 'Done.') {
    this.replies.set(key, [...(this.replies.get(key) ?? []), reply]);
    this.status.set(key, 'idle');
    this.emit('live', key);
  }
}

/** A model server as Custom's models speak to theirs: answers from `model.answer` (the step's instructions come as the user's message). */
const model = { calls: [] as string[], answer: (_user: string): unknown => ({}) };
const srv = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const b = JSON.parse(body || '{}');
    const user = String(b.messages?.findLast?.((m: any) => m.role === 'user')?.content ?? '');
    model.calls.push(user);
    const said = model.answer(user);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: typeof said === 'string' ? said : JSON.stringify(said) }, finish_reason: 'stop' }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.001 } })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
});
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
fs.mkdirSync(path.dirname(AGENT_FILE), { recursive: true });
fs.writeFileSync(AGENT_FILE, JSON.stringify({ models: [{ id: 'fake', label: 'Fake', provider: 'endpoint', baseUrl: `http://127.0.0.1:${(srv.address() as { port: number }).port}/v1`, model: 'fake-1', tools: 'native' }] }));

/** Experiments' tools and save_doc, as their contracts say (their own parts are not in this branch): runs that end at once, with a metric. */
const exp = { runs: [] as RunRecord[], calls: [] as [string, any][] };
const lossOf = (p: Record<string, unknown>) => Math.round((Math.abs(Math.log10(Number(p.lr) || 1e-3) + 3.5) + Number(p.batch_size ?? 32) / 1000) * 1000) / 1000;
const tool = (name: string, run: (a: any) => unknown) => ({ name, description: name, inputSchema: { type: 'object' }, run: async (a: any) => (exp.calls.push([name, a]), typeof run(a) === 'string' ? (run(a) as string) : JSON.stringify(run(a))) });
const newRun = (o: Partial<RunRecord>): RunRecord => {
  const r: RunRecord = { id: `x${exp.runs.length + 1}`, command: '', cwd: '/', status: 'done', createdAt: Date.now() - HOUR, startedAt: Date.now() - HOUR, endedAt: Date.now(), ...o };
  exp.runs.push(r);
  return r;
};
const fakes: Feature = {
  id: 'fake-experiments',
  tools: () => [
    tool('experiment_run', (a) => {
      const r = newRun({ name: a.name, command: a.command, cwd: a.cwd, group: a.group, tags: a.tags, params: a.params, gpus: a.gpus, metrics: { last: { mrr10: a.params?.condition === 'baseline' ? 0.31 : 0.34 } } });
      return { id: r.id, status: 'queued' };
    }),
    tool('experiment_sweep', (a) => {
      const keys = Object.keys(a.params ?? {});
      let combos: Record<string, unknown>[] = [{}];
      for (const k of keys) combos = combos.flatMap((c) => (a.params[k] as unknown[]).map((v) => ({ ...c, [k]: v })));
      const runs = combos.slice(0, Number(a.maxRuns) || combos.length).map((p) => newRun({ name: keys.map((k) => `${k}=${p[k]}`).join(' '), command: a.command, cwd: a.cwd, group: a.group, params: p as Record<string, string | number>, metrics: { last: { val_loss: lossOf(p) } } }));
      return { sweep: 'sw1', group: a.group, runs: runs.map((r) => r.id), page: '/system/experiments?sweep=sw1' };
    }),
    tool('experiment_wait', (a) => ({ ended: true, runs: exp.runs.filter((r) => (a.ids ?? []).includes(r.id)) })),
    tool('experiment_table', () => ({ id: 't1', markdown: '| Condition | mrr10 |\n|---|---|\n| baseline | 0.310 |\n| curriculum | 0.340* |', latex: '', csv: '', page: '/system/experiments?table=t1' })),
    tool('save_doc', (a) => `Saved "${a.title}" (page pg123, version 1). It shows in the conversation and in the Library (http://test.local/pages/pg123).`),
  ],
};

const sessions = new FakeSessions();
const http = Fastify();
await http.register(cookie);
http.setErrorHandler((err: Error, _req, reply) => {
  reply.code(err instanceof HttpError ? err.status : 500).send({ ...(err instanceof HttpError ? err.extra : undefined), error: err.message });
});
const scheduler = new Scheduler(db, sessions as unknown as SessionManager);
const deps = { app: http, db, sessions: sessions as any, scheduler, models: null as any, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => 'https://lab.example' } as Deps;
registerFeatures([apps, documents, fakes, automations], deps);
startRuns(deps);
await http.ready();
setHelperModel(db, 'fake');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function ended(id: string, ms = 60_000) {
  const r = await waitFor(id, ms);
  assert.ok(r && !isActive(r.status), `run ${id} ended (it is ${r?.status})`);
  return r!;
}
/** An agent step's run, once its session is there: it hands in `result` and ends its turn. */
async function agentAnswers(parent: string, step: string, result: Record<string, unknown>) {
  let child: store.RunRecord | undefined;
  for (let i = 0; i < 400 && !(child = store.listRuns(db, { parent }).find((r) => r.step === step && r.key)); i++) await sleep(25);
  assert.ok(child, `the step ${step} started its run`);
  saveResult(child.id, result);
  sessions.end(child.key!);
  return child;
}
const stepsOf = (id: string) => Object.fromEntries(store.listSteps(db, id).map((x) => [x.path, x.status]));

test('Annotation workbench, a whole run: pasted texts labelled by the model in batches and kept as records; you label through its routes; a download as CSV and JSON lines; Publish asks for the Hugging Face token; a set removed', async () => {
  model.answer = (user) => {
    if (!user.includes('Label each text below')) return {};
    const labels = [...user.matchAll(/^\[(\d+)\] (.*)$/gm)].map((m) => ({ n: Number(m[1]), label: /loved|great|best/i.test(m[2]) ? 'Positive' : 'negative', reason: 'Its tone' }));
    return { labels };
  };
  const res = await http.inject({ method: 'POST', url: '/api/apps/tpl:annotation-workbench/runs', payload: { inputs: { labels: 'positive, negative', texts: 'I loved it\nDull and long\nGreat cast\nA mess\nThe best film\nNot for me', guidelines: 'Would they recommend it?' } } });
  assert.equal(res.statusCode, 200, res.body);
  const run = await ended(res.json().run.id);
  assert.equal(run.status, 'done', run.error);
  const r = run.result as any;
  assert.equal(r.count, 6);
  assert.deepEqual(r.labels, ['positive', 'negative']);
  assert.deepEqual(r.model_counts, [{ label: 'positive', count: 3 }, { label: 'negative', count: 3 }]);
  assert.equal(r.name, '6 texts from texts pasted');
  assert.match(model.calls.find((c) => c.includes('Label each text below'))!, /The guidelines:\nWould they recommend it\?/);
  // Its records, through the routes a view uses (a ready-made app keeps them under its own id).
  const where = encodeURIComponent(JSON.stringify({ sample: run.id }));
  const items = (await http.inject({ method: 'GET', url: `/api/apps/tpl:annotation-workbench/data/items?where=${where}&sort=n` })).json().records;
  assert.equal(items.length, 6);
  assert.deepEqual(items.map((x: any) => [x.n, x.order, x.done]).slice(0, 2), [[1, 1, false], [2, 2, false]]);
  assert.ok(items.every((x: any) => ['positive', 'negative'].includes(x.model) && x.reason === 'Its tone' && x.sample === run.id));
  const one = items.find((x: any) => x.text === 'I loved it');
  const lab = await http.inject({ method: 'PATCH', url: `/api/apps/tpl:annotation-workbench/data/items/${one.id}`, payload: { set: { label: 'positive', done: true, agree: true, notes: 'clear' } } });
  assert.equal(lab.statusCode, 200, lab.body);
  const two = items.find((x: any) => x.text === 'A mess');
  await http.inject({ method: 'PATCH', url: `/api/apps/tpl:annotation-workbench/data/items/${two.id}`, payload: { set: { label: 'positive', done: true, agree: false } } });
  const done = encodeURIComponent(JSON.stringify({ sample: run.id, done: true }));
  const csv = await http.inject({ method: 'GET', url: `/api/apps/tpl:annotation-workbench/data/items?where=${done}&sort=n&format=csv&fields=n,text,label,model,agree,notes&name=labels-${run.id}` });
  assert.equal(csv.statusCode, 200);
  assert.match(String(csv.headers['content-type']), /^text\/csv/);
  assert.equal(csv.headers['content-disposition'], `attachment; filename="labels-${run.id}.csv"`);
  const rowsOf = csv.body.trim().split('\r\n');
  assert.equal(rowsOf[0], 'n,text,label,model,agree,notes');
  assert.equal(rowsOf.length, 3);
  assert.ok(rowsOf.includes(`${one.n},I loved it,positive,positive,Yes,clear`), csv.body);
  const jsonl = await http.inject({ method: 'GET', url: `/api/apps/tpl:annotation-workbench/data/items?where=${done}&sort=n&format=jsonl&fields=text,label` });
  assert.deepEqual(jsonl.body.trim().split('\n').map((l) => JSON.parse(l)).sort((a, b) => a.text.localeCompare(b.text)), [{ text: 'A mess', label: 'positive' }, { text: 'I loved it', label: 'positive' }]);
  assert.equal((await http.inject({ method: 'GET', url: '/api/apps/tpl:annotation-workbench/data' })).json().collections[0].name, 'items');
  assert.equal((await http.inject({ method: 'GET', url: '/api/apps/tpl:deep-research/data/items' })).statusCode, 404, 'a ready-made app that keeps nothing');
  // Publish needs the Hugging Face token, which the rest of the app does without: asked for when it runs.
  assert.deepEqual(keysOfFlow(tpl('annotation-workbench'), 'publish'), ['HF_TOKEN']);
  assert.deepEqual(keysOfFlow(tpl('annotation-workbench')), []);
  const pub = await http.inject({ method: 'POST', url: '/api/apps/tpl:annotation-workbench/runs', payload: { flow: 'publish', source: 'screen', inputs: { sample: run.id, repo: 'ada/x' } } });
  assert.equal(pub.statusCode, 409);
  assert.match(pub.json().error, /needs a key first: Hugging Face token/);
  assert.deepEqual(pub.json().secrets.map((k: any) => k.name), ['HF_TOKEN']);
  // A set removed: its texts go, the others stay.
  const clear = await http.inject({ method: 'POST', url: '/api/apps/tpl:annotation-workbench/runs', payload: { flow: 'clear', source: 'screen', inputs: { sample: run.id } } });
  assert.equal(clear.statusCode, 200, clear.body);
  assert.equal((await ended(clear.json().run.id)).result?.removed, 6);
  assert.equal((await http.inject({ method: 'GET', url: `/api/apps/tpl:annotation-workbench/data/items?where=${where}` })).json().count, 0);
});

test('Research sprint and Sweep planner, whole runs with Experiments’ tools as steps: hypotheses to runs to verdicts; a sweep to what mattered', async () => {
  model.answer = (user) => {
    if (user.includes('plan a short research sprint'))
      return { hypotheses: [{ id: 'H1', hypothesis: 'A curriculum helps long queries', why: 'Hard ones last', confirm: '+2 MRR@10', refute: 'No gain', test: 'Curriculum against baseline, 2 seeds', hours: 2 }, { id: 'H2', hypothesis: 'Long-only training helps', hours: 2 }, { id: 'H3', hypothesis: 'Extra' }], metric: 'mrr10', better: 'higher' };
    if (user.includes('A hyperparameter sweep of')) return { summary: 'The learning rate mattered most.', next: ['Try 3e-5', 'More seeds'] };
    return {};
  };
  const s = startRun({ app: 'tpl:research-sprint', slug: 'research-sprint', recipe: tpl('research-sprint'), source: 'api', inputs: { question: 'Does a curriculum help long queries?', repo: '~/code/retriever', budget: '6', count: '2', gates: 'Yes' } });
  const build = await agentAnswers(s.id, 'build', {
    branch: 'sprint/curriculum',
    worktree: '/w/retriever-sprint',
    plan: 'SPRINT.md: baseline against a curriculum.',
    metric: 'mrr10',
    better: 'max',
    baseline: 'baseline',
    runs: [
      { name: 'base-s1', hypothesis: 'baseline', condition: 'baseline', command: 'python train.py --seed 1', gpus: 1, hours: 1, seed: 1 },
      { name: 'cur-s1', hypothesis: 'H1', condition: 'curriculum', command: 'python train.py --curriculum --seed 1', gpus: 1, hours: 1, seed: 1 },
      { name: 'long-s1', hypothesis: 'H2', condition: 'long-only', command: 'python train.py --long --seed 1', gpus: 1, hours: 5, seed: 1 },
    ],
  });
  assert.match(sessions.made.find((m) => m.key === build.key)!.o.prompt, /H1\. A curriculum helps long queries\n {4}Supported if: \+2 MRR@10/);
  const analyse = await agentAnswers(s.id, 'analyse', { verdicts: [{ id: 'H1', verdict: 'supported', evidence: '0.34 against 0.31' }, { id: 'H2', verdict: 'Not tested: over the budget' }], report: '## What we found\nThe curriculum helps.', notebook: 'https://lab.example/pages/nb1', next: ['Three seeds'] });
  assert.match(sessions.made.find((m) => m.key === analyse.key)!.o.prompt, /\| curriculum \| 0\.340\* \|/, 'it reads the results table');
  const sprint = await ended(s.id);
  assert.equal(sprint.status, 'done', sprint.error);
  const sr = sprint.result as any;
  assert.equal(stepsOf(s.id).check, 'skipped', 'from the API nobody is there to ask');
  assert.deepEqual(exp.calls.filter(([n]) => n === 'experiment_run').map(([, a]) => [a.name, a.cwd, a.group, a.tags, a.params.condition]), [
    ['base-s1', '/w/retriever-sprint', `sprint-${s.id.slice(-10)}`, [`sprint:${s.id.slice(-10)}`, 'baseline'], 'baseline'],
    ['cur-s1', '/w/retriever-sprint', `sprint-${s.id.slice(-10)}`, [`sprint:${s.id.slice(-10)}`, 'H1'], 'curriculum'],
  ]);
  const table = exp.calls.find(([n]) => n === 'experiment_table')![1];
  assert.deepEqual([table.rows, table.columns, table.baseline, table.test], ['param:condition', [{ metric: 'mrr10', better: 'max' }], 'baseline', undefined], 'the test left to Experiments (paired over shared seeds)');
  assert.deepEqual(exp.calls.find(([n]) => n === 'experiment_run')![1].better, { mrr10: 'max' }, 'each run knows which way is better');
  assert.equal(sr.results_page, '/system/experiments?table=t1');
  assert.deepEqual(sr.hypotheses.map((h: any) => [h.id, h.mark]), [['H1', 'supported'], ['H2', 'unclear']]);
  assert.deepEqual(sr.runs.map((r: any) => [r.condition, r.value]), [['baseline', 0.31], ['curriculum', 0.34]]);
  assert.equal(sr.status, 'Done: 2 of 2 runs finished');
  assert.match(sr.results, /curriculum \| 0\.340\*/);
  assert.equal(sr.branch, 'sprint/curriculum');
  // The sweep: the researcher's settings kept, the budget's runs, bad trials stopped early, what mattered worked out.
  exp.calls.length = 0;
  const w = startRun({ app: 'tpl:sweep-planner', slug: 'sweep-planner', recipe: tpl('sweep-planner'), source: 'api', inputs: { command: 'python train.py', folder: '/w/model', metric: 'val_loss', better: 'Lower', settings: 'lr: 1e-4, 3e-4, 1e-3\nbatch_size: 16, 32', budget: '4 runs', early: 'Yes', check: 'Yes' } });
  await agentAnswers(w.id, 'read', { command: 'python train.py --lr {lr} --batch-size {batch_size}', settings: [{ name: 'lr', values: '1e-4, 3e-4, 1e-3' }, { name: 'batch_size', values: '16, 32' }], mode: 'grid', hours: 0.5, gpus: 1, steps: 100, notes: 'It logs val_loss each epoch.' });
  const sweep = await ended(w.id);
  assert.equal(sweep.status, 'done', sweep.error);
  const call = exp.calls.find(([n]) => n === 'experiment_sweep')![1];
  assert.deepEqual([call.command, call.cwd, call.mode, call.maxRuns, call.earlyStop], ['python train.py --lr {lr} --batch-size {batch_size}', '/w/model', 'random', 4, { metric: 'val_loss', better: 'min', afterSteps: 100 }]);
  assert.deepEqual(call.params, { lr: [0.0001, 0.0003, 0.001], batch_size: [16, 32] });
  const wr = sweep.result as any;
  assert.equal(wr.count, 4);
  assert.equal(wr.best, 'lr=0.0003, batch_size=16', 'the lowest loss of the four');
  assert.deepEqual(wr.mattered.map((m: any) => m.setting), ['lr', 'batch_size']);
  assert.equal(wr.summary, 'The learning rate mattered most.');
  assert.equal(wr.page, '/system/experiments?sweep=sw1', 'the sweep’s page in Experiments');
  assert.ok(wr.points.length >= 8, 'a point for each run and setting');
});

test('Weekly progress report and Lab notebook, whole runs: the week written from work_log, saved as a document; a day’s entry kept under its date, written again in its place, found by a search', async () => {
  model.answer = (user) => {
    if (user.includes("weekly progress report")) return { title: 'Hard negatives help', summary: 'Retrained with hard negatives; MRR@10 up.', done: ['Mined hard negatives'], results: ['MRR@10 0.412, up from 0.387'], problems: [], next: ['Long queries'], questions: ['Should we try a curriculum?'] };
    if (user.includes("lab notebook's entry")) return { title: 'Hard negatives help on short queries', summary: 'Retrained the small model.', tried: ['BM25 hard negatives'], found: ['0.412 MRR@10'], decided: ['Keep them'], open: [] };
    return {};
  };
  const wk = startRun({ app: 'tpl:weekly-report', slug: 'weekly-report', recipe: tpl('weekly-report'), source: 'task', inputs: { audience: 'Your advisor', projects: '', include: '' } });
  const week = await ended(wk.id);
  assert.equal(week.status, 'done', week.error);
  const wr = week.result as any;
  assert.equal(wr.title, 'Hard negatives help');
  assert.equal(wr.audience, 'Your advisor');
  assert.equal(wr.to, dayOf(Date.now()));
  assert.match(wr.markdown, /^## Hard negatives help\n\n\*Week of .+\*\n\nRetrained/);
  assert.match(wr.email, /^Hi,\n/);
  assert.ok(wr.stats.some((x: any) => x.what === 'Sessions' && x.count >= 3), JSON.stringify(wr.stats));
  const asked = model.calls.find((c) => c.includes('weekly progress report'))!;
  assert.match(asked, /for their advisor/);
  assert.match(asked, /Hard negatives for the retriever/, 'what it was told comes from work_log');
  assert.doesNotMatch(asked, /Grant review|Private thing/, 'never a Confidential or private session');
  const saved = startRun({ app: 'tpl:weekly-report', slug: 'weekly-report', recipe: tpl('weekly-report'), source: 'screen', flow: 'save', inputs: { title: wr.title, markdown: wr.markdown } });
  assert.equal((await ended(saved.id)).result?.page, '/pages/pg123');
  assert.deepEqual(exp.calls.find(([n]) => n === 'save_doc')![1], { title: 'Hard negatives help', markdown: wr.markdown });
  // The notebook: an earlier day written, kept under its date; written again, it takes the old one's place.
  const day = dayOf(now - 2 * DAY);
  const first = await ended(startRun({ app: 'tpl:lab-notebook', slug: 'lab-notebook', recipe: tpl('lab-notebook'), source: 'screen', flow: 'earlier', inputs: { date: day } }).id);
  assert.equal(first.status, 'done', first.error);
  assert.equal(first.result?.kept, true);
  assert.equal(first.result?.title, 'Hard negatives help on short queries');
  assert.equal(first.result?.link, `https://lab.example/apps/runs/${first.id}`);
  let entries = (await http.inject({ method: 'GET', url: '/api/apps/tpl:lab-notebook/data/entries' })).json().records;
  assert.deepEqual(entries.map((e: any) => [e.id, e.date, e.run]), [[day, day, first.id]]);
  assert.ok(entries[0].links.some((l: any) => l.kind === 'session' && l.url === '/s/claude%3Avscode1'));
  const second = await ended(startRun({ app: 'tpl:lab-notebook', slug: 'lab-notebook', recipe: tpl('lab-notebook'), source: 'screen', flow: 'earlier', inputs: { date: day } }).id);
  entries = (await http.inject({ method: 'GET', url: '/api/apps/tpl:lab-notebook/data/entries' })).json().records;
  assert.deepEqual(entries.map((e: any) => [e.id, e.run]), [[day, second.id]], 'one entry for the day, the new one');
  // A day with nothing done: no entry.
  const quiet = await ended(startRun({ app: 'tpl:lab-notebook', slug: 'lab-notebook', recipe: tpl('lab-notebook'), source: 'screen', flow: 'earlier', inputs: { date: dayOf(now - 40 * DAY) } }).id);
  assert.equal(quiet.result?.kept, false);
  assert.equal(stepsOf(quiet.id).write, 'skipped', 'no model asked');
  const found = await ended(startRun({ app: 'tpl:lab-notebook', slug: 'lab-notebook', recipe: tpl('lab-notebook'), source: 'screen', flow: 'search', inputs: { question: 'hard negatives' } }).id);
  assert.deepEqual((found.result?.entries as any[]).map((e) => e.id), [day]);
});

test('updates on chosen days: a ready-made app’s own start (the weekly report on Fridays at 16:00); on weekdays or once a week, the scheduled task follows; days checked', async () => {
  const tasks = () => scheduler.list().filter((t: ScheduledTask) => t.origin === 'daily:tpl:weekly-report');
  let h = (await http.inject({ method: 'GET', url: '/api/apps/tpl:weekly-report' })).json().home;
  assert.deepEqual(h, { inputs: { audience: 'Your advisor', projects: '', include: '' }, daily: { on: false, time: '16:00', days: [5] } }, 'off, ready to start on Fridays at 16:00');
  h = (await http.inject({ method: 'PUT', url: '/api/apps/tpl:weekly-report/home', payload: { daily: { on: true } } })).json().home;
  assert.deepEqual(h.daily, { on: true, time: '16:00', days: [5] });
  assert.deepEqual(tasks().map((t) => t.schedule), [{ kind: 'daily', time: '16:00', days: [5] }]);
  h = (await http.inject({ method: 'PUT', url: '/api/apps/tpl:weekly-report/home', payload: { daily: { days: [1, 2, 3, 4, 5], time: '09:30' } } })).json().home;
  assert.deepEqual(h.daily, { on: true, time: '09:30', days: [1, 2, 3, 4, 5] });
  assert.deepEqual(tasks().map((t) => t.schedule), [{ kind: 'daily', time: '09:30', days: [1, 2, 3, 4, 5] }], 'the same task, on weekdays');
  h = (await http.inject({ method: 'PUT', url: '/api/apps/tpl:weekly-report/home', payload: { daily: { days: null } } })).json().home;
  assert.deepEqual(h.daily, { on: true, time: '09:30' }, 'every day');
  assert.deepEqual(tasks().map((t) => t.schedule), [{ kind: 'daily', time: '09:30' }]);
  for (const days of [[7], [], 'Friday', [1.5]]) assert.equal((await http.inject({ method: 'PUT', url: '/api/apps/tpl:weekly-report/home', payload: { daily: { days } } })).statusCode, 400, JSON.stringify(days));
  h = (await http.inject({ method: 'PUT', url: '/api/apps/tpl:weekly-report/home', payload: { daily: { days: [3], on: false } } })).json().home;
  assert.equal(tasks().length, 0, 'off removes it');
  assert.deepEqual(h.daily, { on: false, time: '09:30', days: [3] }, 'what was picked is kept for next time');
  assert.deepEqual((await http.inject({ method: 'GET', url: '/api/apps/tpl:lab-notebook' })).json().home.daily, { on: false, time: '21:00' }, 'the notebook: every evening');
});

test('read_document: a text file (JSON lines) as it is, numbered, so a step can read an upload', async () => {
  const f = path.join(tmp, 'labels.jsonl');
  fs.writeFileSync(f, '{"text": "one"}\n{"text": "two"}\n');
  const ctx = { runId: 'r', key: 'acp:flow-x', agent: 'acp', cwd: tmp, deps, step: true } as RunCtx;
  const read = documents.tools!(ctx).find((t) => t.name === 'read_document')!;
  const out = String(await read.run({ path: f }, ctx));
  assert.match(out, /^labels\.jsonl · JSONL · lines 1–3 of 3\n\n {5}1\t\{"text": "one"\}\n {5}2\t\{"text": "two"\}/);
  fs.writeFileSync(path.join(tmp, 'x.bin'), 'x');
  await assert.rejects(read.run({ path: path.join(tmp, 'x.bin') }, ctx), /not a kind of document this reads/);
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
