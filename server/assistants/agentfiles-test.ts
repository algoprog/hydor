// Script tests for an agent's versions, its examples and its file: a version kept on each kind of save (you, an agent,
// a draft, an import, an install) with what changed in sentences, none when nothing it is changed, the newest 50 kept,
// and an old one brought back; the file's contents (nothing of the person's own in it) and installing it (what it
// brings and needs, a name clash, a file from a newer Hydor, a broken file, its schedules added paused); examples kept
// and checked, a try run as the agent in a throwaway session that sends nothing, and how it went recorded (with a fake
// judge in place of the helper model). Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/assistants/agentfiles-test.ts
//   DATA_DIR=/tmp/hydor-test-agentfiles node dist/dev/agentfiles-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { agentChanges, AGENT_FILE_FORMAT, agentFileName, cleanAgentExamples, VERSIONS_KEEP, type AgentFile } from '../../shared/agent-files.ts';
import type { Assistant } from '../../shared/assistants.ts';
import type { ScheduledTask } from '../../shared/automations.ts';
import type { CreateOpts } from '../sessions.ts';
import { kvGet, kvSet, openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { isDry } from '../outbox/index.ts';
import { initPages } from '../pages/store.ts';
import { sessionExtra, setSessionExtra } from '../sessionExtra.ts';
import { exportAgent, installAgent, previewInstall, readAgentFile } from './agentFile.ts';
import { exampleRun, exampleRuns } from './exampleRuns.ts';
import { estimateTries, examplesByVersion, examplesState, exampleTurnEnded, setJudge, tryExamples } from './examples.ts';
import { handBackTool, resultsOf } from './output.ts';
import { bringBack, findAssistant, removeAssistant, saveAssistant } from './store.ts';
import { agentVersion, agentVersions, currentVersion } from './versions.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
process.env.CUDA_VISIBLE_DEVICES = '';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-agentfiles-test-'));
const db = openDb(path.join(tmp, 'test.db'));
initPages(db);
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const as = (a: Assistant) => a as unknown as Partial<Record<keyof Assistant, unknown>>;

// ---- versions ------------------------------------------------------------------------------------------------

test('versions: each kind of save keeps one, with who saved it and what changed; a save that changes nothing keeps none', () => {
  const a = saveAssistant(db, { name: 'Scout', instructions: 'Find papers.', tier: 'quick' });
  let vs = agentVersions(db, a.id);
  assert.deepEqual(
    vs.map((v) => [v.n, v.by, v.line]),
    [[1, 'you', 'Made it.']],
  );
  const b = saveAssistant(db, { ...as(a), tier: 'best', tools: ['read', 'web'], budgetUsd: 5 }, { by: 'agent' });
  vs = agentVersions(db, a.id);
  assert.equal(vs[0].n, 2);
  assert.equal(vs[0].by, 'agent');
  assert.equal(vs[0].line, 'It thinks with Best now (it was Quick). It may no longer create and change files, run commands and use other tools. Its monthly budget is $5 now.');
  // The same again, and only its examples changed: no version.
  saveAssistant(db, as(b));
  saveAssistant(db, { ...as(b), examples: [{ message: 'Find three papers on retrieval.' }] });
  assert.equal(agentVersions(db, a.id).length, 2);
  assert.equal(findAssistant(db, a.id)!.examples?.length, 1);
  // A save that names no examples keeps them (an editor that does not know of them).
  const { examples: _e, ...noEx } = findAssistant(db, a.id)!;
  saveAssistant(db, { ...as(noEx as Assistant), instructions: 'Find papers. Two lines each.' }, { why: 'Asked for two lines a paper.' });
  assert.equal(findAssistant(db, a.id)!.examples?.length, 1);
  assert.equal(agentVersions(db, a.id)[0].line, 'Asked for two lines a paper.');
  // Drafted, imported, installed.
  const d = saveAssistant(db, { name: 'Drafted one', instructions: 'x' }, { by: 'draft' });
  assert.equal(agentVersions(db, d.id)[0].by, 'draft');
  const i = saveAssistant(db, { name: 'Imported one', instructions: 'x', source: '/home/u/.claude/agents/x.md' }, { by: 'import' });
  assert.deepEqual([agentVersions(db, i.id)[0].by, agentVersions(db, i.id)[0].line], ['import', 'Imported from an agent file.']);
  removeAssistant(db, d.id);
  removeAssistant(db, i.id);
  // Deleting it takes its versions.
  removeAssistant(db, a.id);
  assert.equal(agentVersions(db, a.id).length, 0);
});

test('versions: an agent saved before versions were kept gets the way it was as its first; the newest 50 stay', () => {
  const old: Assistant = { id: 'old-1234', name: 'Old timer', icon: 'bot', description: '', instructions: 'Be brief.' };
  const list = JSON.parse(kvGet(db, 'assistants.mine') ?? '[]') as Assistant[];
  kvSet(db, 'assistants.mine', JSON.stringify([...list, old]));
  saveAssistant(db, { ...as(old), instructions: 'Be very brief.' });
  const vs = agentVersions(db, old.id);
  assert.deepEqual(
    vs.map((v) => [v.n, v.by]),
    [
      [2, 'you'],
      [1, 'before'],
    ],
  );
  assert.equal(agentVersion(db, old.id, 1)!.agent.instructions, 'Be brief.');
  assert.equal(vs[0].line, 'Its instructions changed.');
  for (let k = 0; k < 55; k++) saveAssistant(db, { ...as(old), instructions: `Take ${k}.` });
  const kept = agentVersions(db, old.id);
  assert.equal(kept.length, VERSIONS_KEEP);
  assert.equal(kept[0].n, 57);
  assert.equal(kept.at(-1)!.n, 8);
  removeAssistant(db, old.id);
});

test('bring it back: an earlier version is the current one again, as a new version that says so; its examples and gone agents', () => {
  const helper = saveAssistant(db, { name: 'Helper' });
  const a = saveAssistant(db, { name: 'Writer', instructions: 'Short.', tier: 'quick', canAsk: [helper.id], projects: ['sp-gone'] });
  saveAssistant(db, { ...as(a), instructions: 'Long and flowery.', tier: 'max', canAsk: [], examples: [{ message: 'Write a haiku.' }] });
  removeAssistant(db, helper.id);
  const back = bringBack(db, a.id, 1, { projects: new Set(['sp-other']) });
  assert.equal(back.instructions, 'Short.');
  assert.equal(back.tier, 'quick');
  // Agents and projects gone since are left out; its examples are as they are now.
  assert.equal(back.canAsk, undefined);
  assert.equal(back.projects, undefined);
  assert.equal(back.examples?.[0].message, 'Write a haiku.');
  const vs = agentVersions(db, a.id);
  assert.equal(vs.length, 3);
  assert.match(vs[0].line, /^Brought back version 1\. Its instructions changed\. It thinks with Quick now \(it was Max\)\./);
  assert.throws(() => bringBack(db, a.id, 99, { projects: new Set() }), /no such version/);
  removeAssistant(db, a.id);
});

test('what changed, in sentences: names for ids, places, fields, switches', () => {
  const name = (k: 'agent' | 'project', id: string) => ({ coder: 'Coder', sp1: 'Thesis' })[id] ?? id;
  const said = agentChanges(
    { name: 'A', tools: ['read'], askable: undefined, output: undefined, projects: [] },
    {
      name: 'B',
      tools: undefined,
      askable: false,
      canAsk: ['coder'],
      projects: ['sp1'],
      standing: true,
      output: { fields: [{ id: 't', label: 'Title', type: 'text' }], to: [{ kind: 'notify' }, { kind: 'library' }] },
    },
    name,
  );
  assert.deepEqual(said, [
    'Its name went from “A” to “B”.',
    'It may create and change files, run commands, use the web and use other tools now.',
    'It works in Thesis now.',
    'It may hand work to Coder now.',
    'Other agents may no longer hand it work.',
    'It keeps one conversation of its own now, with an inbox.',
    'It hands back Title now.',
    'Its results go to a notification and a Library page, updated now.',
  ]);
  assert.deepEqual(agentChanges({ name: 'A', examples: [] }, { name: 'A', examples: [{ id: 'x', message: 'y' }] }), []);
});

// ---- the file ------------------------------------------------------------------------------------------------

const PRIVATE = ['anna@example.org', 'hooks.example.com', 'SLACK_KEY', 'page-123', 'sheet-456', 'sp-thesis', 'gmail-77', 'me@work.org', '/home/u/.claude'];

const tasks: ScheduledTask[] = [];
const scheduler = {
  list: () => tasks,
  save: (t: Partial<ScheduledTask>) => {
    const made = { ...t, id: `t${tasks.length + 1}`, createdAt: Date.now() } as ScheduledTask;
    tasks.push(made);
    return made;
  },
};

function fullAgent() {
  const coder = saveAssistant(db, { name: 'Code checker' });
  const a = saveAssistant(db, {
    name: 'Weekly reporter',
    icon: 'newspaper',
    description: 'Writes my weekly report',
    instructions: 'Read my commits.\nWrite the report.',
    tools: ['read', 'web'],
    tier: 'standard',
    skills: ['writing'],
    mode: 'full',
    projects: ['sp-thesis'],
    connections: ['gmail-77'],
    canAsk: [coder.id],
    budgetUsd: 4,
    source: '/home/u/.claude/agents/r.md',
    output: {
      fields: [
        { id: 'summary', label: 'Summary', type: 'markdown', required: true },
        { id: 'count', label: 'Commits', type: 'number' },
      ],
      to: [
        { kind: 'library', page: 'page-123' },
        { kind: 'sheet', page: 'sheet-456', tab: 'Weeks' },
        { kind: 'email', to: ['anna@example.org'], subject: 'Report {date}', account: 'me@work.org' },
        { kind: 'webhook', url: 'https://hooks.example.com/x', secret: 'SLACK_KEY' },
        { kind: 'notify' },
        { kind: 'file', path: 'reports/{date}.md' },
      ],
    },
    examples: [{ name: 'A quiet week', message: 'Write this week’s report: two commits.', checks: ['It says the week was quiet', '{{result.count}} = 2'] }],
  });
  tasks.length = 0;
  tasks.push(
    { id: 's1', name: 'Friday report', schedule: { kind: 'daily', time: '16:00', days: [5] }, prompt: 'Write this week’s report.', agent: 'claude', cwd: '/x', enabled: true, createdAt: 1, extra: { assistant: a.id } },
    { id: 's2', name: 'On a push', schedule: { kind: 'webhook' } as never, prompt: 'Look at the push.', agent: 'claude', cwd: '/x', enabled: true, createdAt: 1, extra: { assistant: a.id } },
    { id: 's3', name: 'Someone else', schedule: { kind: 'every', minutes: 60 }, prompt: 'x', agent: 'claude', cwd: '/x', enabled: true, createdAt: 1, extra: { assistant: coder.id } },
  );
  return { a, coder };
}

test('the file: what it is and does, its team by name, schedules by the clock, examples; nothing of the person’s own', () => {
  const { a, coder } = fullAgent();
  const f = exportAgent(db, scheduler, a, { connName: (id) => (id === 'gmail-77' ? 'Gmail' : id), version: '0.68.0' });
  const text = JSON.stringify(f);
  for (const p of PRIVATE) assert.ok(!text.includes(p), `${p} is in the file`);
  assert.equal(f.hydor, 'agent');
  assert.equal(f.format, AGENT_FILE_FORMAT);
  assert.equal(f.app, '0.68.0');
  assert.equal(f.agent.name, 'Weekly reporter');
  assert.equal(f.agent.instructions, 'Read my commits.\nWrite the report.');
  assert.deepEqual(f.agent.tools, ['read', 'web']);
  assert.equal(f.agent.tier, 'standard');
  assert.deepEqual(f.agent.skills, ['writing']);
  assert.equal(f.agent.budgetUsd, 4);
  assert.equal(f.agent.id, undefined);
  assert.equal(f.agent.examples, undefined);
  assert.deepEqual(f.agent.output?.to, [
    { kind: 'library' },
    { kind: 'sheet', tab: 'Weeks' },
    { kind: 'email', to: [], subject: 'Report {date}' },
    { kind: 'webhook', url: '' },
    { kind: 'notify' },
    { kind: 'file', path: 'reports/{date}.md' },
  ]);
  assert.deepEqual(f.team, ['Code checker']);
  assert.deepEqual(f.schedules, [{ name: 'Friday report', schedule: { kind: 'daily', time: '16:00', days: [5] }, task: 'Write this week’s report.' }]);
  assert.equal(f.examples?.[0].message, 'Write this week’s report: two commits.');
  assert.deepEqual(f.leftOut, [
    'The project it works in: it works everywhere until you pick them again.',
    'The connected apps it had on (Gmail): connect them where it is installed, then turn them on in its settings.',
    'The Library page and spreadsheet its results went to: its first run where it is installed makes new ones.',
    'Who its results are emailed to, and from which mail account: set them again under What it hands back.',
    'The address its results are posted to, and its key: set them again under What it hands back.',
    '1 schedule that starts on a watch, a webhook or a date: it stays here.',
  ]);
  assert.equal(agentFileName({ name: 'Weekly: reporter/2' }), 'Weekly reporter 2.hydor-agent');
  removeAssistant(db, a.id);
  removeAssistant(db, coder.id);
});

test('installing: what it brings and needs before anything is saved; beside one of the same name unless you choose to replace it', () => {
  const { a, coder } = fullAgent();
  const file = JSON.stringify(exportAgent(db, scheduler, a, { connName: () => 'Gmail' }));
  const before = agentVersions(db, a.id).length;
  const p = previewInstall(db, file);
  // Nothing saved yet.
  assert.equal(agentVersions(db, a.id).length, before);
  assert.deepEqual(p.clash, { id: a.id, name: 'Weekly reporter' });
  assert.equal(p.beside, 'Weekly reporter (2)');
  assert.deepEqual(p.team, [{ name: 'Code checker', found: coder.id }]);
  assert.equal(p.agent.mode, 'edits');
  assert.ok(p.notes.some((n) => /Full access/.test(n)));
  // The places that need something of yours are left out until you set them.
  assert.deepEqual(
    p.agent.output?.to?.map((t) => t.kind),
    ['library', 'sheet', 'notify', 'file'],
  );
  assert.ok(p.needs.some((n) => /emailed to/.test(n)));
  assert.ok(p.brings.includes('Its instructions (2 lines).'));
  assert.ok(p.brings.includes('It may read files and use the web.'));
  assert.ok(p.brings.includes('1 example to try it with.'));
  assert.ok(p.brings.includes('1 suggested schedule, added paused if you choose.'));
  // Beside: a new agent, by Installed, with its examples and team; no schedules unless chosen.
  tasks.length = 0;
  const r1 = installAgent({ db, scheduler }, file);
  assert.notEqual(r1.assistant.id, a.id);
  assert.equal(r1.assistant.name, 'Weekly reporter (2)');
  assert.deepEqual(r1.assistant.canAsk, [coder.id]);
  assert.equal(r1.assistant.examples?.length, 1);
  assert.equal(r1.assistant.projects, undefined);
  assert.equal(r1.assistant.connections, undefined);
  assert.equal(r1.schedules, 0);
  assert.equal(agentVersions(db, r1.assistant.id)[0].by, 'install');
  assert.equal(findAssistant(db, a.id)!.instructions, 'Read my commits.\nWrite the report.');
  // Replacing yours: the same agent, a new version by Installed, its schedules added paused.
  saveAssistant(db, { ...as(findAssistant(db, a.id)!), examples: [...(findAssistant(db, a.id)!.examples ?? []), { name: 'Mine', message: 'A busy week: nine commits.' }] });
  const changed = JSON.parse(file) as AgentFile;
  changed.agent.instructions = 'Read my commits and issues.';
  const r2 = installAgent({ db, scheduler }, changed, { replace: true, schedules: true, use: { agent: 'codex' } });
  assert.equal(r2.assistant.id, a.id);
  assert.equal(r2.assistant.name, 'Weekly reporter');
  assert.equal(r2.assistant.instructions, 'Read my commits and issues.');
  // Your own examples stay, after the file's.
  assert.deepEqual(
    r2.assistant.examples?.map((e) => e.message),
    ['Write this week’s report: two commits.', 'A busy week: nine commits.'],
  );
  assert.equal(agentVersions(db, a.id)[0].by, 'install');
  assert.equal(r2.schedules, 1);
  assert.deepEqual(
    tasks.map((t) => [t.name, t.enabled, t.agent, (t.extra as { assistant?: string }).assistant]),
    [['Friday report', false, 'codex', a.id]],
  );
  for (const x of [r1.assistant.id, a.id, coder.id]) removeAssistant(db, x);
});

test('a file from a newer Hydor installs what it knows and says so; a broken file is refused in plain words', () => {
  const newer = { hydor: 'agent', format: AGENT_FILE_FORMAT + 1, agent: { name: 'Futurist', instructions: 'x', hologram: true, tools: ['read', 'teleport'] }, team: ['Nobody here'] };
  const p = previewInstall(db, newer);
  assert.equal(p.newer, true);
  assert.ok(p.notes[0].startsWith('This file comes from a newer Hydor'));
  assert.deepEqual(p.agent.tools, ['read']);
  assert.equal((p.agent as Record<string, unknown>).hologram, undefined);
  assert.ok(p.needs.some((n) => /Nobody here, which you do not have/.test(n)));
  assert.throws(() => readAgentFile('not json {'), /not an agent file: it could not be read/);
  assert.throws(() => readAgentFile({ hydor: 'app', recipe: {} }), /an app’s file/);
  assert.throws(() => readAgentFile({ name: 'x' }), /not a Hydor agent file/);
  assert.throws(() => readAgentFile({ hydor: 'agent', agent: { name: 'x' } }), /no format version/);
  assert.throws(() => readAgentFile({ hydor: 'agent', format: 1, agent: { name: ' ' } }), /no agent in it/);
  assert.throws(() => readAgentFile('x'.repeat(600 * 1024)), /too big/);
  assert.throws(() => previewInstall(db, { hydor: 'agent', format: 1, agent: { name: 'Bad', budgetUsd: -4 } }), /could not be read: A budget/);
});

// ---- examples ------------------------------------------------------------------------------------------------

test('examples: kept with a message and checks; a rule that does not read is said', () => {
  const ok = cleanAgentExamples([{ name: 'Quiet week', message: '  Two commits.  ', checks: ['It is short', '{{result.count}} = 2', ''] }, { message: 'Another' }]);
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.examples, [
    { id: 'quiet-week', name: 'Quiet week', message: 'Two commits.', checks: ['It is short', '{{result.count}} = 2'] },
    { id: 'another', message: 'Another' },
  ]);
  assert.match(cleanAgentExamples([{ message: 'x', checks: ['{{result.count}} >'] }]).errors[0], /its check/);
  assert.match(cleanAgentExamples([{ name: 'Empty' }]).errors[0], /no message/);
  assert.throws(() => saveAssistant(db, { name: 'Bad examples', examples: [{ message: 'x', checks: ['{{reply}} ~~ 3 =='] }] }), /its check/);
});

/** A session manager that starts nothing: it keeps what each session was started with, and plays a turn back. */
function fakeSessions() {
  const made: (CreateOpts & { key: string })[] = [];
  const archived = new Set<string>();
  const live = new Map<string, string>();
  const replies = new Map<string, string>();
  let n = 0;
  const sessions = Object.assign(new EventEmitter(), {
    async create(o: CreateOpts) {
      if (o.extra?.assistant) {
        const a = findAssistant(db, o.extra.assistant);
        if (a?.budgetUsd && a.budgetUsd <= 1) throw new Error(`${a.name} has spent its $${a.budgetUsd} budget for this month`);
      }
      const key = `claude:ex${++n}`;
      db.prepare('insert into app_sessions (key, agent, created_at, updated_at) values (?, ?, ?, ?)').run(key, 'claude', Date.now(), Date.now());
      db.prepare("insert into sessions (key, agent, id, path, cost_usd) values (?, 'claude', ?, '', 0.25)").run(key, key);
      setSessionExtra(db, key, o.extra ?? {});
      made.push({ ...o, key });
      live.set(key, 'working');
      return key;
    },
    setFlags(key: string, f: { archived?: boolean }) {
      if (f.archived) archived.add(key);
    },
    summary(key: string) {
      return { key, live: live.has(key) ? { status: live.get(key) } : undefined };
    },
    async timeline(key: string) {
      const prompt = made.find((m) => m.key === key)?.prompt ?? '';
      const items = [
        { kind: 'user', id: 'u1', text: prompt },
        { kind: 'assistant', id: 'a1', text: replies.get(key) ?? '' },
        { kind: 'turn', id: 't1', status: 'completed' },
      ];
      return { parser: { items }, readMore: async () => {} };
    },
  });
  return { sessions, made, archived, live, replies };
}

test('trying examples: each in a throwaway session as the agent that sends nothing; what it hands back stays with the try; its checks are read', async () => {
  const f = fakeSessions();
  const deps = { db, sessions: f.sessions, broadcast: () => {} } as unknown as Deps;
  const a = saveAssistant(db, {
    name: 'Counter',
    instructions: 'Count the commits.',
    tier: 'quick',
    output: { fields: [{ id: 'count', label: 'Commits', type: 'number', required: true }], to: [{ kind: 'notify' }] },
    examples: [
      { name: 'Two', message: 'How many commits this week? There were two.', checks: ['It says there were two', '{{result.count}} = 2'] },
      { name: 'None', message: 'How many commits today? None.', checks: ['It must fail this'] },
    ],
  });
  // Before anything ran: no estimate to give.
  assert.deepEqual(estimateTries(db, a, 2), { count: 2, tier: 'Quick' });
  const started = await tryExamples(deps, a, { use: { agent: 'claude' } });
  assert.equal(started.length, 2);
  assert.ok(started.every((r) => r.status === 'running' && r.version === currentVersion(db, a.id)));
  const [m1, m2] = f.made;
  assert.equal(m1.prompt, 'How many commits this week? There were two.');
  assert.equal(m1.agent, 'claude');
  assert.equal(m1.extra?.assistant, a.id);
  assert.deepEqual(m1.extra?.agentExample, { agent: a.id, run: started[0].id, example: 'two' });
  assert.ok(m1.cwd.startsWith(os.tmpdir()) && fs.readdirSync(m1.cwd).length === 0);
  assert.ok(f.archived.has(m1.key) && f.archived.has(m2.key));
  // It sends nothing: connected apps' calls that act are held as ones it would have sent.
  assert.equal(isDry(db, m1.key), true);
  // Trying again while they run starts none twice.
  assert.equal((await tryExamples(deps, a)).length, 0);
  // What it hands back stays with the try: not in its history, nowhere else.
  const ctx = { runId: 'r', key: m1.key, agent: 'claude', cwd: m1.cwd, deps } as RunCtx;
  const said = await handBackTool(ctx)!.run({ count: 2 }, ctx);
  assert.equal(said, 'Handed back. Finish with a short reply; no need to repeat the result.');
  assert.deepEqual(exampleRun(db, started[0].id)!.result, { count: 2 });
  assert.equal(resultsOf(db, a.id).length, 0);
  // A waiting session says so.
  f.live.set(m2.key, 'waiting');
  assert.equal(examplesState(deps, a).runs.find((r) => r.example === 'none')!.status, 'waiting');
  // Their turns end: a fake judge reads the sentences.
  const asked: string[][] = [];
  setJudge(async (_db, q) => (asked.push(q.checks), q.checks.map((c) => ({ ok: !/fail/.test(c), why: 'What it saw.' }))));
  f.replies.set(m1.key, 'There were two commits this week.');
  f.replies.set(m2.key, 'None today.');
  f.live.set(m1.key, 'idle');
  f.live.set(m2.key, 'idle');
  await exampleTurnEnded(deps, { key: m1.key, status: 'idle' });
  await exampleTurnEnded(deps, { key: m2.key, status: 'idle' });
  const r1 = exampleRun(db, started[0].id)!;
  assert.equal(r1.status, 'passed');
  assert.equal(r1.reply, 'There were two commits this week.');
  assert.equal(r1.costUsd, 0.25);
  assert.deepEqual(
    r1.checks!.map((c) => [c.check, c.ok]),
    [
      ['It hands back a result', true],
      ['It says there were two', true],
      ['{{result.count}} = 2', true],
    ],
  );
  const r2 = exampleRun(db, started[1].id)!;
  assert.equal(r2.status, 'failed');
  assert.deepEqual(
    r2.checks!.map((c) => [c.check, c.ok, c.why]),
    [
      ['It hands back a result', false, 'It ended without handing back a result.'],
      ['It must fail this', false, 'What it saw.'],
    ],
  );
  // Only sentences go to the judge.
  assert.deepEqual(asked, [['It says there were two'], ['It must fail this']]);
  // What a try costs, from these; how its version did.
  assert.deepEqual(estimateTries(db, a, 2), { count: 2, tier: 'Quick', perRun: 0.25, from: 'tries', total: 0.5 });
  assert.deepEqual(examplesByVersion(db, a.id).get(currentVersion(db, a.id)), { tried: 2, passed: 1 });
  let st = examplesState(deps, a);
  assert.equal(st.changedSince, undefined);
  // It changes: the page offers to try them again.
  const b = saveAssistant(db, { ...as(a), instructions: 'Count the commits, and the authors.' });
  st = examplesState(deps, b);
  assert.equal(st.changedSince, currentVersion(db, a.id) - 1);
  // A budget spent: the try says why it could not start.
  const poor = saveAssistant(db, { ...as(b), budgetUsd: 1 });
  const [failed] = await tryExamples(deps, poor, { only: ['two'] });
  assert.equal(failed.status, 'error');
  assert.match(failed.error!, /budget/);
  assert.equal(exampleRuns(db, a.id).length, 3);
  // Built-in agents and agents without examples have none to try.
  await assert.rejects(tryExamples(deps, findAssistant(db, 'general')!), /Built-in agents have no examples/);
  await assert.rejects(tryExamples(deps, saveAssistant(db, { name: 'Bare' })), /has no examples yet/);
  setJudge(null);
  removeAssistant(db, a.id);
  assert.equal(exampleRuns(db, a.id).length, 0);
  assert.equal(sessionExtra(db, m1.key).assistant, a.id);
});

// ---- run ------------------------------------------------------------------------------------------------------

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
