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
import { AUTO_MODEL, clampTier, defaultTiers, lowerTier, nextTier, sameModel, tierOfModel, tierProgram, type KnownModel } from '../../shared/tiers.ts';
import { kvGet, kvSet } from '../db.ts';
import { openDb } from '../db.ts';
import type { Scheduler } from '../scheduler.ts';
import { setSessionExtra } from '../sessionExtra.ts';
import { BUILTINS } from './builtins.ts';
import { activity, agentSessions, agentStart, monthSpend, monthStart } from './rules.ts';
import { cleanAssistant, findAssistant, removeAssistant, saveAssistant } from './store.ts';
import { modelName, noteModels, seenModels, setTeam, setTiers, teamOf, tierDefaults, tierOf, tierPick, tiersOf } from './tiers.ts';
import { autoPlan, tierNote } from './auto.ts';
import { enoughToGoOn, fromTemplate, kindOf, makeProjectAgent, scanFolder, templateOf } from './projectAgent.ts';
import { createSpace, spaceById } from '../spaces/index.ts';
import { EventEmitter } from 'node:events';
import type { Deps, RunCtx } from '../features/types.ts';
import { initPages } from '../pages/store.ts';
import { handBackTool, markdownHtml, resultMarkdown, resultsOf, targetPath } from './output.ts';
import { instructionsFor } from './instructions.ts';

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

/** What Claude Code and Codex list (November 2026): the names its tiers' defaults are read from. */
const CLAUDE_MODELS: KnownModel[] = [
  { value: 'default', label: 'Default (recommended)', resolved: 'claude-opus-5-5', isDefault: true },
  { value: 'opus', label: 'Opus 5.5', resolved: 'claude-opus-5-5' },
  { value: 'claude-fable-5-2', label: 'Fable 5.2', resolved: 'claude-fable-5-2' },
  { value: 'sonnet', label: 'Sonnet 5.5', resolved: 'claude-sonnet-5-5' },
  { value: 'haiku', label: 'Haiku 5.5', resolved: 'claude-haiku-5-5' },
  { value: 'fable', label: 'Fable 5.1', resolved: 'claude-fable-5-1' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', resolved: 'claude-haiku-4-5-20251001' },
  { value: 'claude-sonnet-5', label: 'Sonnet 5', resolved: 'claude-sonnet-5' },
  { value: 'claude-opus-5', label: 'Opus 5', resolved: 'claude-opus-5' },
  { value: 'claude-opus-4-8', label: 'Opus 4.8', resolved: 'claude-opus-4-8' },
];
const CODEX_FULL: KnownModel[] = [
  { value: 'gpt-6.1-sol', label: 'GPT-6.1-Sol', isDefault: true },
  { value: 'gpt-6.2-astra', label: 'GPT-6.2-Astra' },
  { value: 'gpt-6-terra', label: 'GPT-6-Terra' },
  { value: 'gpt-5.6-terra', label: 'GPT-5.6-Terra' },
  { value: 'gpt-6-luna', label: 'GPT-6-Luna' },
];
const CODEX_FREE: KnownModel[] = [
  { value: 'gpt-6-luna', label: 'GPT-6-Luna', isDefault: true },
  { value: 'gpt-5.6-terra', label: 'GPT-5.6-Terra' },
  { value: 'gpt-5.6-luna', label: 'GPT-5.6-Luna' },
];

test('tiers: four of them, each program its own; before a program lists its models, its own names', () => {
  assert.deepEqual(tiersOf(db), defaultTiers());
  assert.deepEqual(tierPick(db, 'quick', 'claude'), { model: 'haiku' });
  assert.deepEqual(tierPick(db, 'max', 'claude'), { model: 'fable' });
  assert.deepEqual(tierPick(db, 'best', 'codex'), { effort: 'high' });
  assert.deepEqual(tierPick(db, 'standard', 'acp', 'console'), {});
  assert.deepEqual(tierPick(db, 'max', 'acp', 'console'), {});
  assert.equal(tierPick(db, 'standard', 'acp', 'gemini'), null);
  assert.equal(tierProgram('acp', 'gemini'), null);
  assert.equal(nextTier('standard'), 'best');
  assert.equal(nextTier('best'), 'max');
  assert.equal(nextTier('max'), undefined);
  assert.equal(clampTier('max', 'standard'), 'standard');
  assert.equal(clampTier('quick', 'standard'), 'quick');
  assert.equal(clampTier('best'), 'best');
  assert.equal(lowerTier('max', 'best'), 'best');
  assert.equal(lowerTier(undefined, 'quick'), 'quick');
});

test('tiers follow the models a program offers: the newest of each family, small to strongest (Haiku to Fable, Luna to Astra)', () => {
  const d = defaultTiers({ claude: CLAUDE_MODELS, codex: CODEX_FULL });
  assert.deepEqual(d.claude, { quick: { model: 'haiku' }, standard: { model: 'sonnet' }, best: { model: 'opus' }, max: { model: 'claude-fable-5-2' } });
  // Each maker's small model for Quick, its middle one for Standard, its main one for Best, its strongest for Max.
  assert.deepEqual(d.codex, {
    quick: { model: 'gpt-6-luna', effort: 'medium' },
    standard: { model: 'gpt-6-terra', effort: 'medium' },
    best: { model: 'gpt-6.1-sol', effort: 'high' },
    max: { model: 'gpt-6.2-astra', effort: 'high' },
  });
  // A plan without Sol and Astra: the nearest it has, told apart by effort where tiers share a model.
  const free = defaultTiers({ codex: CODEX_FREE }).codex;
  assert.deepEqual(free, {
    quick: { model: 'gpt-6-luna', effort: 'medium' },
    standard: { model: 'gpt-5.6-terra', effort: 'medium' },
    best: { model: 'gpt-5.6-terra', effort: 'high' },
    max: { model: 'gpt-5.6-terra', effort: 'xhigh' },
  });
  // One model for everything: every tier on it, from low effort to the most.
  assert.deepEqual(defaultTiers({ codex: [{ value: 'gpt-6-luna', label: 'GPT-6-Luna', isDefault: true }] }).codex, {
    quick: { model: 'gpt-6-luna', effort: 'low' },
    standard: { model: 'gpt-6-luna', effort: 'medium' },
    best: { model: 'gpt-6-luna', effort: 'high' },
    max: { model: 'gpt-6-luna', effort: 'xhigh' },
  });
  // A Claude plan without Opus: Sonnet leads.
  assert.deepEqual(defaultTiers({ claude: CLAUDE_MODELS.filter((m) => !/opus|fable|default/i.test(m.label)) }).claude, { quick: { model: 'haiku' }, standard: { model: 'sonnet' }, best: { model: 'sonnet' }, max: { model: 'sonnet' } });
  // Families nobody has heard of: the program's own default model, at each effort.
  assert.deepEqual(defaultTiers({ codex: [{ value: 'o9', label: 'o9' }] }).codex.best, { effort: 'high' });
  // A plan without Fable: Opus leads the hardest problems too.
  assert.deepEqual(defaultTiers({ claude: CLAUDE_MODELS.filter((m) => !/fable/i.test(m.label)) }).claude.max, { model: 'opus' });
});

test('the models a program lists are remembered, and the tiers nobody changed move with them', () => {
  noteModels(db, 'claude', CLAUDE_MODELS as any);
  noteModels(db, 'codex', CODEX_FULL as any);
  noteModels(db, 'codex', []);
  assert.equal(seenModels(db).codex?.length, CODEX_FULL.length, 'a program that listed nothing changes nothing');
  assert.deepEqual(tierPick(db, 'max', 'claude'), { model: 'claude-fable-5-2' });
  assert.deepEqual(tierPick(db, 'best', 'codex'), { model: 'gpt-6.1-sol', effort: 'high' });
  assert.equal(modelName(db, 'claude', undefined, 'claude-fable-5-2'), 'Fable 5.2');
  assert.equal(modelName(db, 'claude', undefined, 'opus'), 'Opus 5.5');
  assert.equal(modelName(db, 'claude', undefined, 'made-up'), 'made-up');
  // Only what was changed is kept: the rest still follows the defaults.
  setTiers(db, { ...tiersOf(db), claude: { ...tiersOf(db).claude, best: { model: 'opus', effort: 'max' } }, console: { ...tiersOf(db).console, quick: { model: 'ollama/qwen3' } }, junk: { quick: { model: 'x' } } });
  assert.deepEqual(JSON.parse(kvGet(db, 'models.tiers')!), { v: 2, picks: { claude: { best: { model: 'opus', effort: 'max' } }, console: { quick: { model: 'ollama/qwen3' } } } });
  assert.deepEqual(tierPick(db, 'best', 'claude'), { model: 'opus', effort: 'max' });
  assert.deepEqual(tierPick(db, 'quick', 'claude'), { model: 'haiku' });
  assert.deepEqual(tierPick(db, 'quick', 'acp', 'console'), { model: 'ollama/qwen3' });
  // A newer Fable arrives: Max follows it, the pick that was changed stays.
  noteModels(db, 'claude', [...CLAUDE_MODELS, { value: 'claude-fable-5-3', label: 'Fable 5.3', resolved: 'claude-fable-5-3' }] as any);
  assert.deepEqual(tierPick(db, 'max', 'claude'), { model: 'claude-fable-5-3' });
  assert.deepEqual(tierPick(db, 'best', 'claude'), { model: 'opus', effort: 'max' });
  noteModels(db, 'claude', CLAUDE_MODELS as any);
  // A tier set to nothing keeps the program's default model; back to the defaults keeps nothing.
  setTiers(db, { claude: { quick: { model: '  ' } } });
  assert.deepEqual(tierPick(db, 'quick', 'claude'), {});
  assert.deepEqual(tiersOf(db).claude.best, { model: 'opus' });
  setTiers(db, tierDefaults(db));
  assert.deepEqual(JSON.parse(kvGet(db, 'models.tiers')!), { v: 2, picks: {} });
  // A table kept before there were four tiers had every pick written out: those nobody changed follow the defaults now.
  kvSet(db, 'models.tiers', JSON.stringify({ claude: { quick: { model: 'haiku' }, standard: { model: 'sonnet' }, best: { model: 'opus', effort: 'high' } }, codex: { quick: { effort: 'low' }, standard: { effort: 'medium' }, best: { effort: 'high' } }, console: { quick: {}, standard: { model: 'ollama/qwen3' }, best: {} } }));
  assert.deepEqual(tiersOf(db).codex.best, { model: 'gpt-6.1-sol', effort: 'high' });
  assert.deepEqual(tiersOf(db).claude.best, { model: 'opus', effort: 'high' });
  assert.deepEqual(tiersOf(db).claude.max, { model: 'claude-fable-5-2' });
  assert.deepEqual(tiersOf(db).console.standard, { model: 'ollama/qwen3' });
  setTiers(db, null);
});

test('the tier a model is: by its name or what it stands for, else by its family; none for a model the tiers do not know', () => {
  assert.equal(sameModel(CLAUDE_MODELS, 'opus', 'claude-opus-5-5[1m]'), true);
  assert.equal(sameModel(CLAUDE_MODELS, undefined, 'opus'), true, 'no model is the program’s default');
  assert.equal(sameModel(CLAUDE_MODELS, 'claude-opus-5', 'claude-opus-5-5'), false);
  assert.equal(sameModel(CLAUDE_MODELS, 'claude-haiku-4-5', 'claude-haiku-4-5-20251001'), true);
  const picks = tiersOf(db).claude;
  assert.equal(tierOfModel(picks, CLAUDE_MODELS, 'claude-fable-5-2'), 'max');
  assert.equal(tierOfModel(picks, CLAUDE_MODELS, undefined), 'best');
  assert.equal(tierOfModel(picks, CLAUDE_MODELS, 'claude-sonnet-5-5'), 'standard');
  assert.equal(tierOfModel(picks, CLAUDE_MODELS, 'claude-opus-4-8'), 'best', 'an older Opus is Best where Best is Opus');
  assert.equal(tierOfModel(picks, CLAUDE_MODELS, 'fable'), 'max', 'so is an older Fable Max');
  assert.equal(tierOfModel(picks, CLAUDE_MODELS, 'mystery-1'), undefined);
  assert.equal(tierOf(db, { agent: 'claude', model: 'haiku' }), 'quick');
  assert.equal(tierOf(db, { agent: 'acp', acpAgent: 'gemini', model: 'x' }), undefined);
  // Codex's free plan: one model for every tier, told apart by effort (the highest when none is given).
  const free = defaultTiers({ codex: CODEX_FREE }).codex;
  assert.equal(tierOfModel(free, CODEX_FREE, 'gpt-5.6-terra', 'medium'), 'standard');
  assert.equal(tierOfModel(free, CODEX_FREE, 'gpt-5.6-terra'), 'max');
  assert.equal(tierOfModel(free, CODEX_FREE, 'gpt-6-luna'), 'quick');
  assert.equal(tierOfModel(free, CODEX_FREE, 'gpt-5.6-luna'), 'quick', 'an older Luna is Quick where Quick is Luna');
  assert.equal(tierOfModel(free, CODEX_FREE, 'o9-mystery'), undefined);
});

test('the team: on with Max for hard problems until changed; a change keeps the rest', () => {
  assert.deepEqual(teamOf(db), { on: true, hard: true });
  assert.deepEqual(setTeam(db, { hard: false, junk: 1 }), { on: true, hard: false });
  assert.deepEqual(setTeam(db, { on: false }), { on: false, hard: false });
  assert.deepEqual(setTeam(db, { on: true, hard: true }), { on: true, hard: true });
});

test('Automatic: Best’s model for its program, never Max on a request’s wording', () => {
  assert.equal(AUTO_MODEL, 'auto');
  // Best's model and effort for every program with tiers: a session reaches Max only when its own agent steps up.
  assert.deepEqual(autoPlan(db, { agent: 'claude' }), { tier: 'best', model: 'opus', effort: undefined });
  assert.deepEqual(autoPlan(db, { agent: 'codex' }), { tier: 'best', model: 'gpt-6.1-sol', effort: 'high' });
  assert.equal(autoPlan(db, { agent: 'acp', acpAgent: 'console' })?.tier, 'best', 'Custom before its tiers are set');
  assert.equal(autoPlan(db, { agent: 'acp', acpAgent: 'gemini' }), null, 'a program without tiers');
  // What the conversation says of a move to Max: a step up, and the notes of sessions Automatic once started there.
  assert.deepEqual(tierNote(db, { agent: 'claude', event: 'auto', tier: 'max', model: 'claude-fable-5-2', why: 'a proof' }), { event: 'auto', tier: 'max', label: 'Fable 5.2', why: 'a proof' });
  assert.deepEqual(tierNote(db, { agent: 'acp', acpAgent: 'console', event: 'stepUp', tier: 'max' }), { event: 'stepUp', tier: 'max', label: 'Max' });
});

// ---- starting a session as an agent --------------------------------------------------------------------

test('a session started as an agent: its tier’s model when none was picked; the one picked otherwise', () => {
  const scout = saveAssistant(db, { name: 'Scout', instructions: 'Find papers.', tier: 'quick' });
  assert.deepEqual(agentStart(db, { agent: 'claude', extra: { assistant: scout.id } }), { agent: 'claude', model: 'haiku', extra: { assistant: scout.id } });
  assert.equal(agentStart(db, { agent: 'claude', model: 'opus', extra: { assistant: scout.id } }).model, 'opus');
  assert.deepEqual(agentStart(db, { agent: 'codex', extra: { assistant: scout.id } }), { agent: 'codex', model: 'gpt-6-luna', effort: 'medium', extra: { assistant: scout.id } });
  // An effort picked for the session stays; the tier's model still applies.
  assert.deepEqual(agentStart(db, { agent: 'codex', effort: 'high', extra: { assistant: scout.id } }), { agent: 'codex', model: 'gpt-6-luna', effort: 'high', extra: { assistant: scout.id } });
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


// ---- what an agent hands back --------------------------------------------------------------------------------

test('what an agent hands back is checked: places inside its folder, https addresses, keys by name', () => {
  const o = cleanAssistant({ name: 'Reporter', output: { fields: [{ id: 'summary', label: 'Summary', type: 'markdown', required: true }, { id: 'items', label: 'Items', type: 'list' }], to: [{ kind: 'file', path: 'reports/{date}.md' }, { kind: 'library' }, { kind: 'webhook', url: 'https://hooks.example.com/x', secret: 'hook_token' }, { kind: 'notify' }, { kind: 'bogus' }] } }).output!;
  assert.equal(o.fields?.length, 2);
  assert.deepEqual(o.to, [{ kind: 'file', path: 'reports/{date}.md' }, { kind: 'library' }, { kind: 'webhook', url: 'https://hooks.example.com/x', secret: 'HOOK_TOKEN' }, { kind: 'notify' }]);
  assert.throws(() => cleanAssistant({ name: 'X', output: { to: [{ kind: 'file', path: '/etc/passwd' }] } }), /inside the folder/);
  assert.throws(() => cleanAssistant({ name: 'X', output: { to: [{ kind: 'file', path: '../up.md' }] } }), /inside the folder/);
  assert.throws(() => cleanAssistant({ name: 'X', output: { to: [{ kind: 'webhook', url: 'http://plain.example.com' }] } }), /https/);
  assert.equal(cleanAssistant({ name: 'X', output: {} }).output, undefined);
  // Stepping up and a conversation of its own.
  const a = cleanAssistant({ name: 'X', stepUp: false, standing: true });
  assert.equal(a.stepUp, false);
  assert.equal(a.standing, true);
  assert.equal('stepUp' in cleanAssistant({ name: 'X', stepUp: true }), false);
});

test('a result in words: Markdown for files, HTML for the Library; file paths stay inside the folder', () => {
  const fields = [
    { id: 'summary', label: 'Summary', type: 'markdown' as const },
    { id: 'papers', label: 'Papers', type: 'list' as const },
    { id: 'scores', label: 'Scores', type: 'table' as const, columns: [{ id: 'name', label: 'Name', type: 'text' as const }, { id: 'n', label: 'Score', type: 'number' as const }] },
    { id: 'ok', label: 'All found', type: 'yesno' as const },
  ];
  const md = resultMarkdown(fields, { summary: 'Three **new** papers.', papers: ['A', 'B'], scores: [{ name: 'A', n: 3 }, { name: 'B|C', n: 1 }], ok: true });
  assert.match(md, /^## Summary\n\nThree \*\*new\*\* papers\.\n\n## Papers\n\n- A\n- B\n\n## Scores\n\n\| Name \| Score \|\n\| --- \| --- \|\n\| A \| 3 \|\n\| B\\\|C \| 1 \|\n\n## All found\n\nYes$/);
  const html = markdownHtml(md);
  assert.match(html, /<h2>Summary<\/h2>/);
  assert.match(html, /<strong>new<\/strong>/);
  assert.match(html, /<ul><li>A<\/li><li>B<\/li><\/ul>/);
  assert.match(html, /<table><thead><tr><th>Name<\/th><th>Score<\/th><\/tr><\/thead><tbody><tr><td>A<\/td><td>3<\/td><\/tr><tr><td>B\|C<\/td>/);
  assert.equal(markdownHtml('<script>x</script>'), '<p>&lt;script&gt;x&lt;/script&gt;</p>');
  // A lone Markdown result is itself.
  assert.equal(resultMarkdown([{ id: 'result', label: 'Result', type: 'markdown' }], { result: 'Just this.' }), 'Just this.');
  const day = new Date(2026, 10, 7, 9, 5);
  assert.equal(targetPath('/w', 'reports/{date}-{agent}.md', { name: 'Paper Scout' }, day), '/w/reports/2026-11-07-paper-scout.md');
  assert.equal(targetPath('/w', '{time}.json', { name: 'x' }, day), '/w/0905.json');
  assert.equal(targetPath('/w', '../../etc/x', { name: 'x' }, day), null);
});

test('hand_back: offered to an agent with an output; checked; then to a file, the Library, a webhook and a notification', async () => {
  initPages(db);
  const dir = fs.mkdtempSync(path.join(tmp, 'work-'));
  const reporter = saveAssistant(db, {
    name: 'Reporter',
    instructions: 'Report.',
    output: {
      fields: [{ id: 'summary', label: 'Summary', type: 'markdown', required: true }, { id: 'count', label: 'Count', type: 'number', required: true }],
      to: [{ kind: 'file', path: 'out/{date}.md' }, { kind: 'file', path: 'out/last.json' }, { kind: 'library' }, { kind: 'webhook', url: 'https://127.0.0.1/hook' }, { kind: 'notify' }],
    },
  });
  const plain = saveAssistant(db, { name: 'Plain', instructions: 'Nothing to hand back.' });
  const notes: unknown[] = [];
  const sessionsFake = Object.assign(new EventEmitter(), {});
  sessionsFake.on('notify', (e) => notes.push(e));
  const deps = { db, sessions: sessionsFake, broadcast: () => {} } as unknown as Deps;
  const ctxFor = (key: string, assistant: string): RunCtx => {
    db.prepare('insert or ignore into app_sessions (key, agent, created_at, updated_at) values (?, ?, ?, ?)').run(key, 'claude', Date.now(), Date.now());
    setSessionExtra(db, key, { assistant });
    return { runId: 'r', key, agent: 'claude', cwd: dir, deps } as RunCtx;
  };
  assert.equal(handBackTool(ctxFor('claude:hb0', plain.id)), null);
  const c = ctxFor('claude:hb1', reporter.id);
  const tool = handBackTool(c)!;
  assert.equal(tool.name, 'hand_back');
  // What it is told.
  assert.match(instructionsFor(reporter, '', { agent: 'claude' }), /When you finish a task, hand back its result with hand_back: summary \(Summary, markdown, required\); count \(Count, number, required\)\. It is checked/);
  const bad = (await tool.run({ summary: 'Hi' }, c)) as { text: string; isError?: boolean };
  assert.equal(bad.isError, true);
  assert.match(bad.text, /count: missing/);
  const ok = (await tool.run({ summary: 'Three new papers.', count: 3 }, c)) as string;
  assert.match(ok, /^Handed back\. It went to /);
  assert.match(ok, /It could not go to: a webhook/);
  const today = new Date();
  const p2 = (n: number) => String(n).padStart(2, '0');
  const mdFile = path.join(dir, 'out', `${today.getFullYear()}-${p2(today.getMonth() + 1)}-${p2(today.getDate())}.md`);
  assert.equal(fs.readFileSync(mdFile, 'utf8'), '## Summary\n\nThree new papers.\n\n## Count\n\n3\n');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'out', 'last.json'), 'utf8')), { summary: 'Three new papers.', count: 3 });
  const page = db.prepare("select title from pages where title like 'Reporter · %'").get() as { title: string } | undefined;
  assert.ok(page);
  assert.equal(notes.length, 1);
  assert.match(JSON.stringify(notes[0]), /"title":"Reporter","body":"Three new papers\."/);
  const [r] = resultsOf(db, reporter.id);
  assert.equal(r.key, 'claude:hb1');
  assert.deepEqual(r.value, { summary: 'Three new papers.', count: 3 });
  assert.deepEqual(
    r.sent.map((s) => [s.kind, s.ok]),
    [
      ['file', true],
      ['file', true],
      ['library', true],
      ['webhook', false],
      ['notify', true],
    ],
  );
  removeAssistant(db, reporter.id);
  removeAssistant(db, plain.id);
});

test('a project’s agent from its template, in the language the app speaks', () => {
  const zh = fromTemplate(templateOf('software'), { id: 'sp1', name: 'Shop' }, 'zh');
  assert.equal(zh.name, 'Shop 工程师');
  assert.equal(zh.description, '构建、修复和审查 Shop 的代码');
  assert.match(zh.instructions!, /You are the engineer of Shop/);
  const el = fromTemplate(templateOf('paper'), { id: 'sp1', name: 'Thesis' }, 'el');
  assert.equal(el.name, 'Thesis συγγραφέας δημοσίευσης');
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
