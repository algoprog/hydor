// Script tests for what agents add to assistants: where they work (projects), who they may hand work to,
// tiers (Settings → Models → Tiers) and what an agent's tier and monthly budget do when a session starts as
// it, and what the Agents page shows of each (schedules, sessions at work, spending this month). Build and
// run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/assistants/agents-test.ts
//   DATA_DIR=/tmp/hydor-test-agents node dist/dev/agents-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inScope, mayAsk } from '../../shared/assistants.ts';
import type { SessionExtra } from '../../shared/features.ts';
import { clampTier, cleanTiers, DEFAULT_TIERS, tierProgram } from '../../shared/tiers.ts';
import { openDb } from '../db.ts';
import type { Scheduler } from '../scheduler.ts';
import { setSessionExtra } from '../sessionExtra.ts';
import { BUILTINS } from './builtins.ts';
import { activity, agentSessions, agentStart, monthSpend, monthStart } from './rules.ts';
import { cleanAssistant, findAssistant, removeAssistant, saveAssistant } from './store.ts';
import { setTiers, tierPick, tiersOf } from './tiers.ts';
import { enoughToGoOn, fromTemplate, kindOf, makeProjectAgent, scanFolder, templateOf } from './projectAgent.ts';
import { createSpace, spaceById } from '../spaces/index.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-agents-test-'));
const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

/** A session started as an agent, with what it spent (Claude Code's own figure). */
let n = 0;
function session(assistant: string | undefined, usd: number, at = Date.now(), extra: Record<string, unknown> = {}): string {
  const key = `claude:s${++n}`;
  db.prepare('insert into app_sessions (key, agent, created_at, updated_at) values (?, ?, ?, ?)').run(key, 'claude', at, at);
  db.prepare("insert into sessions (key, agent, id, path, cost_usd) values (?, 'claude', ?, '', ?)").run(key, key, usd);
  setSessionExtra(db, key, { ...(assistant ? { assistant } : {}), ...extra });
  return key;
}

// ---- settings ------------------------------------------------------------------------------------------

test('an agent’s new settings are checked: projects, tier, helpers’ highest tier, who it asks, a budget', () => {
  const a = cleanAssistant({ name: 'Scout', projects: ['sp1', 'sp1', ''], tier: 'quick', helperMax: 'huge', canAsk: ['writer'], askable: false, budgetUsd: '3.456' });
  assert.deepEqual(a.projects, ['sp1']);
  assert.equal(a.tier, 'quick');
  assert.equal(a.helperMax, undefined);
  assert.deepEqual(a.canAsk, ['writer']);
  assert.equal(a.askable, false);
  assert.equal(a.budgetUsd, 3.46);
  // Unset ones are left out; a budget of nothing or zero is none; a negative one is refused.
  const b = cleanAssistant({ name: 'Plain', askable: true, budgetUsd: 0 });
  for (const k of ['projects', 'tier', 'helperMax', 'canAsk', 'askable', 'budgetUsd'] as const) assert.equal(k in b, false, k);
  assert.throws(() => cleanAssistant({ name: 'X', budgetUsd: -1 }), /budget/);
  assert.throws(() => cleanAssistant({ name: '' }), /Give the agent a name/);
});

test('an agent never asks itself, and one deleted leaves the lists of those that could ask it', () => {
  const t = saveAssistant(db, { name: 'Translator', instructions: 'Translate.' });
  const lead = saveAssistant(db, { name: 'Lead', instructions: 'Lead.', canAsk: [t.id] });
  const self = saveAssistant(db, { ...lead, canAsk: [lead.id, t.id] });
  assert.deepEqual(self.canAsk, [t.id]);
  removeAssistant(db, t.id);
  assert.equal(findAssistant(db, lead.id)?.canAsk, undefined);
  assert.throws(() => removeAssistant(db, 'general'), /Built-in agents cannot be deleted/);
  assert.throws(() => saveAssistant(db, { id: 'general', name: 'General' }), /Built-in agents stay as they are/);
  removeAssistant(db, lead.id);
});

test('where an agent works: everywhere without projects, else only in its own', () => {
  assert.equal(inScope({}, null), true);
  assert.equal(inScope({}, 'sp1'), true);
  assert.equal(inScope({ projects: ['sp1'] }, 'sp1'), true);
  assert.equal(inScope({ projects: ['sp1'] }, 'sp2'), false);
  assert.equal(inScope({ projects: ['sp1'] }, null), false);
});

test('who may hand work to whom: built-in agents (or none) any; yours only those listed; never one closed to it, nor itself', () => {
  const general = BUILTINS.find((a) => a.id === 'general')!;
  const target = { id: 't1' };
  assert.equal(mayAsk(null, target), true);
  assert.equal(mayAsk(general, target), true);
  assert.equal(mayAsk({ id: 'mine' }, target), false);
  assert.equal(mayAsk({ id: 'mine', canAsk: ['t1'] }, target), true);
  assert.equal(mayAsk(general, { id: 't1', askable: false }), false);
  assert.equal(mayAsk({ id: 't1', canAsk: ['t1'] }, target), false);
});

// ---- tiers ---------------------------------------------------------------------------------------------

test('tiers: the defaults until set, each program its own; Custom’s none; other ACP agents have no tiers', () => {
  assert.deepEqual(tiersOf(db), DEFAULT_TIERS);
  assert.deepEqual(tierPick(db, 'quick', 'claude'), { model: 'haiku' });
  assert.deepEqual(tierPick(db, 'best', 'codex'), { effort: 'high' });
  assert.deepEqual(tierPick(db, 'standard', 'acp', 'console'), {});
  assert.equal(tierPick(db, 'standard', 'acp', 'gemini'), null);
  assert.equal(tierProgram('acp', 'gemini'), null);
  setTiers(db, { claude: { best: { model: 'opus', effort: 'max' } }, console: { quick: { model: 'ollama/qwen3' } }, junk: { quick: { model: 'x' } } });
  assert.deepEqual(tierPick(db, 'best', 'claude'), { model: 'opus', effort: 'max' });
  assert.deepEqual(tierPick(db, 'quick', 'claude'), { model: 'haiku' });
  assert.deepEqual(tierPick(db, 'quick', 'acp', 'console'), { model: 'ollama/qwen3' });
  // A tier set to nothing keeps the program's default model.
  assert.deepEqual(cleanTiers({ claude: { quick: { model: '  ' } } }).claude.quick, {});
  assert.equal(clampTier('best', 'standard'), 'standard');
  assert.equal(clampTier('quick', 'standard'), 'quick');
  assert.equal(clampTier('best'), 'best');
  setTiers(db, null);
});

// ---- starting a session as an agent --------------------------------------------------------------------

test('a session started as an agent: its tier’s model when none was picked; the one picked otherwise', () => {
  const scout = saveAssistant(db, { name: 'Scout', instructions: 'Find papers.', tier: 'quick' });
  assert.deepEqual(agentStart(db, { agent: 'claude', extra: { assistant: scout.id } }), { agent: 'claude', model: 'haiku', extra: { assistant: scout.id } });
  assert.equal(agentStart(db, { agent: 'claude', model: 'opus', extra: { assistant: scout.id } }).model, 'opus');
  assert.deepEqual(agentStart(db, { agent: 'codex', extra: { assistant: scout.id } }), { agent: 'codex', effort: 'low', extra: { assistant: scout.id } });
  // No tier, or no such agent: as it was.
  const plain = { agent: 'claude' as const, extra: { assistant: 'researcher' } };
  assert.equal(agentStart(db, plain), plain);
  removeAssistant(db, scout.id);
});

test('an agent’s monthly budget: what is left caps each session; once spent, none starts until next month', () => {
  const bk = saveAssistant(db, { name: 'Bookkeeper', instructions: 'Keep the books.', budgetUsd: 5 });
  session(bk.id, 1.25);
  const lead = session(bk.id, 0.5);
  // A plain helper it started counts towards it; a named agent's work towards that agent.
  session(undefined, 0.25, Date.now(), { parent: lead });
  session('writer', 9, Date.now(), { parent: lead });
  // Last month's spending is not this month's.
  session(bk.id, 50, monthStart() - 1000);
  assert.deepEqual(monthSpend(db, bk.id), { usd: 2, sessions: 2 });
  assert.equal(agentSessions(db, bk.id, 0).length, 3);
  assert.equal((agentStart(db, { agent: 'claude', extra: { assistant: bk.id } }).extra as SessionExtra).capUsd, 3);
  // A lower cap of its own stays.
  assert.equal(agentStart(db, { agent: 'claude', extra: { assistant: bk.id, capUsd: 1 } }).extra?.capUsd, 1);
  session(bk.id, 3);
  assert.throws(() => agentStart(db, { agent: 'claude', extra: { assistant: bk.id } }), /Bookkeeper has spent its \$5 budget for this month/);
  removeAssistant(db, bk.id);
});

test('what the Agents page shows: schedules that run as each agent, sessions at work or waiting, spending this month', () => {
  const scout = saveAssistant(db, { name: 'Paper scout', instructions: 'Find papers.' });
  const a = session(scout.id, 0.4);
  const b = session(scout.id, 0.2);
  const tasks = [
    { id: 'tk1', name: 'Morning papers', schedule: { kind: 'daily', time: '08:00', days: [1, 2, 3, 4, 5] }, enabled: true, nextAt: 123, lastStatus: 'ok', extra: { assistant: scout.id } },
    { id: 'tk2', name: 'Someone else', schedule: { kind: 'every', minutes: 30 }, enabled: true, extra: { assistant: 'writer' } },
    { id: 'tk3', name: 'Nobody', schedule: { kind: 'every', minutes: 30 }, enabled: false },
  ];
  const sched = { list: () => tasks } as unknown as Scheduler;
  const act = activity(db, sched, [
    { key: a, status: 'working' },
    { key: b, status: 'waiting' },
  ]);
  const mine = act[scout.id];
  assert.deepEqual(mine.schedules, [{ id: 'tk1', name: 'Morning papers', schedule: tasks[0].schedule, enabled: true, nextAt: 123, lastStatus: 'ok' }]);
  assert.equal(mine.working, 1);
  assert.equal(mine.waiting, 1);
  assert.equal(mine.monthSessions, 2);
  assert.ok(Math.abs(mine.monthUsd - 0.6) < 1e-9);
  assert.ok(mine.lastAt);
  assert.equal(act.writer.schedules.length, 1);
  assert.equal(act.general.monthSessions, 0);
});

// ---- an agent for a project ---------------------------------------------------------------------------------

/** A folder with these files in it (paths relative to it, with their text). */
function folderWith(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(tmp, 'proj-'));
  for (const [f, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), text);
  }
  return dir;
}

test('a project’s kind: from what its folder holds first, the words it was described with next, else the default', () => {
  const k = (files: Record<string, string>, words = '') => kindOf(scanFolder(folderWith(files)), words);
  assert.equal(k({ 'package.json': '{"dependencies":{"react":"19"}}', 'src/App.tsx': '' }), 'web');
  assert.equal(k({ 'package.json': '{"dependencies":{"express":"5"}}', 'src/index.ts': '' }), 'software');
  assert.equal(k({ 'a.py': '', 'b.py': '', 'c.py': '' }), 'software');
  assert.equal(k({ 'requirements.txt': 'torch\ntransformers\n', 'train.py': '' }), 'ml');
  assert.equal(k({ 'main.tex': '', 'refs.bib': '' }), 'paper');
  assert.equal(k({ 'sales.csv': '', 'costs.csv': '' }), 'data');
  assert.equal(k({ 'analysis.ipynb': '{}' }), 'data');
  assert.equal(k({ 'a.pdf': '', 'b.pdf': '', 'c.pdf': '' }), 'research');
  assert.equal(k({ 'chapter1.docx': '', 'chapter2.md': '' }), 'writing');
  assert.equal(k({ 'talk.pptx': '' }), 'slides');
  assert.equal(k({ '1.png': '', '2.png': '', '3.jpg': '', '4.mp4': '', '5.svg': '' }), 'media');
  // Folders tools make are passed over; an empty folder goes by the words.
  assert.equal(k({ 'node_modules/x/index.js': '', 'node_modules/y/index.js': '', 'node_modules/z/index.js': '' }), 'default');
  assert.equal(k({}, 'My PhD thesis on proactive retrieval'), 'paper');
  assert.equal(k({}, 'Garden'), 'default');
});

test('a project’s agent from its template: named after the project, working there only, with the template’s tier and skills', () => {
  const a = fromTemplate(templateOf('software'), { id: 'sp1', name: 'Shop' });
  assert.equal(a.name, 'Shop engineer');
  assert.match(a.instructions!, /You are the engineer of Shop/);
  assert.deepEqual(a.projects, ['sp1']);
  assert.equal(a.folder, 'project');
  assert.equal(a.tier, 'standard');
  assert.ok(a.skills?.includes('test-first'));
  assert.equal(enoughToGoOn({ description: 'short' }, scanFolder(folderWith({}))), false);
  assert.equal(enoughToGoOn({ description: 'x'.repeat(130) }, scanFolder(folderWith({}))), true);
  assert.equal(enoughToGoOn({}, scanFolder(folderWith({ 'README.md': 'y'.repeat(400) }))), true);
});

test('making a project’s agent: little to go on, its kind’s template; nothing, the default; enough, drafted to fit (the template if the helper fails)', async () => {
  const shop = createSpace(db, { name: 'Shop', folder: folderWith({ 'package.json': '{}', 'src/a.ts': '' }) });
  const r1 = await makeProjectAgent(db, shop.id, { draft: async () => assert.fail('no draft with little to go on') });
  assert.equal(r1.how, 'template');
  assert.equal(r1.kind, 'software');
  assert.equal(r1.agent.name, 'Shop engineer');
  assert.deepEqual(r1.agent.projects, [shop.id]);
  // The project now starts its sessions as it.
  assert.equal(spaceById(db, shop.id)?.assistant, r1.agent.id);

  const garden = createSpace(db, { name: 'Garden', folder: folderWith({}) });
  const r2 = await makeProjectAgent(db, garden.id);
  assert.equal(r2.how, 'default');
  assert.equal(r2.agent.name, 'Garden agent');

  const thesis = createSpace(db, {
    name: 'Thesis',
    folder: folderWith({ 'main.tex': '' }),
    description: 'My PhD thesis on proactive retrieval and conversational search at UMass Amherst, chapters as separate files, due in May.',
    assistant: 'researcher',
  });
  let asked = '';
  const r3 = await makeProjectAgent(db, thesis.id, {
    draft: async (_db, _system, prompt) => {
      asked = prompt;
      return {
        name: 'Thesis co-author',
        icon: 'graduation-cap',
        description: 'Writes the thesis chapters',
        instructions: 'You are the co-author of the Thesis: chapters in LaTeX, cited carefully, compiled after each change.',
        tools: ['read', 'edit', 'run', 'web'],
        tier: 'best',
      };
    },
  });
  assert.equal(r3.how, 'drafted');
  assert.equal(r3.kind, 'paper');
  assert.match(asked, /Template \(the paper writer of a paper project\)/);
  assert.match(asked, /proactive retrieval/);
  assert.equal(r3.agent.name, 'Thesis co-author');
  assert.equal(r3.agent.tier, 'best');
  assert.deepEqual(r3.agent.tools, ['read', 'edit', 'run', 'web']);
  // A project that names its agent keeps it.
  assert.equal(spaceById(db, thesis.id)?.assistant, 'researcher');

  const r4 = await makeProjectAgent(db, thesis.id, {
    draft: async () => {
      throw new Error('no helper');
    },
  });
  assert.equal(r4.how, 'template');
  assert.equal(r4.agent.name, 'Thesis paper writer');
  for (const r of [r1, r2, r3, r4]) removeAssistant(db, r.agent.id);
});

// ---- run ----------------------------------------------------------------------------------------------

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
console.log(`\n${passed}/${tests.length} passed`);
db.close();
fs.rmSync(tmp, { recursive: true, force: true });
