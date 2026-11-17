// Script tests for the subagents of a session's own program (Claude Code's Agent tool, Codex's spawn_agent), as the
// server shows them like Hydor subagents: their titles and kinds from what is written beside their transcripts
// (agent-<id>.meta.json, a Codex rollout's first line), how many a session has, whether one runs (its lead's agent
// says so), the minimal summary of one the index has not read yet, the refusal to message, resume, fork, hand off or
// delete one, a subagent's transcript read as its own conversation, and Codex's live adapter making tasks of them from
// the app-server's items (both spellings) while leaving the lead's state alone for what a child thread says.
// Build and run with scratch folders:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/subagents-test.ts
//   DATA_DIR=/tmp/hydor-test-subagents2 CLAUDE_CONFIG_DIR=/tmp/hydor-test-subagents2/claude CUDA_VISIBLE_DEVICES= node dist/dev/subagents-test.js
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from './config.ts';
import { openDb } from './db.ts';
import { ClaudeLive } from './agents/claude.ts';
import { CodexLive, liveItem } from './agents/codex.ts';
import { SessionManager } from './sessions.ts';
import { claudeSubagentMeta, codexSubagentMeta, countSubagents, readableName } from './subagents.ts';
import { Timeline } from './timeline.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/') || !config.claudeProjectsDir.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… and CLAUDE_CONFIG_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-subagents-test-'));
const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jsonl = (rows: object[]) => rows.map((r) => JSON.stringify(r) + '\n').join('');

// ---- a session manager on a real database, with a stand-in for the index ----------------------------------------------

const pokes: (string | null | undefined)[] = [];
const indexer: any = Object.assign(new EventEmitter(), { poke: (p: (string | null | undefined)[]) => pokes.push(...p) });
const m: any = new SessionManager(db, indexer, {} as any, {} as any);
const sent: string[] = [];
m.queueSummary = (k: string) => void sent.push(k);

/** A lead session running here, with an agent that lists its tasks as Claude Code or Codex does. */
function lead(agent: 'claude' | 'codex', o: { transcript?: string } = {}) {
  const id = crypto.randomUUID();
  const key = `${agent}:${id}`;
  const adapter: any = Object.assign(new EventEmitter(), {
    agent,
    tasks: new Map(),
    state: { status: 'idle', startedAt: 1000, pendingApprovals: 0 },
    exited: false,
    sessionId: id,
    transcriptPath: o.transcript,
    lastActivity: Date.now(),
  });
  const live = { key, agent, cwd: '/work/shop', adapter, runner: { cleanup() {} } };
  m.lives.set(key, live);
  return { id, key, adapter, live };
}

/** A row of the index, as the indexer writes it for a program subagent. */
function indexed(key: string, file: string, o: { parent?: string; title?: string; created?: number } = {}) {
  db.prepare('insert or replace into sessions (key, agent, id, path, cwd, title, created_at, updated_at, parent_key, hidden) values (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)').run(
    key,
    key.split(':')[0],
    key.slice(key.indexOf(':') + 1),
    file,
    '/work/shop',
    o.title ?? null,
    o.created ?? 5000,
    o.created ?? 5000,
    o.parent ?? null,
  );
}

const projects = path.join(config.claudeProjectsDir, '-work-shop');
const claudeFiles = (leadId: string, agentId: string, meta?: object) => {
  const dir = path.join(projects, leadId, 'subagents');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `agent-${agentId}.jsonl`);
  fs.writeFileSync(file, jsonl([{ type: 'user', isSidechain: true, agentId, uuid: 'u1', timestamp: '2026-11-10T10:00:00.000Z', message: { role: 'user', content: 'Update the guide' } }]));
  if (meta) fs.writeFileSync(file.replace(/\.jsonl$/, '.meta.json'), JSON.stringify(meta));
  return file;
};
const codexRollout = (id: string, payload: object, size = 0) => {
  const file = path.join(tmp, 'codex', `rollout-2026-11-10T10-00-00-${id}.jsonl`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // The first line holds the agent's instructions, which are long.
  fs.writeFileSync(file, jsonl([{ timestamp: '2026-11-10T10:00:00.000Z', type: 'session_meta', payload: { id, base_instructions: { text: 'x'.repeat(size) }, ...payload } }]));
  return file;
};

// ---- what is written beside a transcript -----------------------------------------------------------------------------

test('names made of words joined by underscores read as words', () => {
  assert.equal(readableName('negotiation_review'), 'Negotiation review');
  assert.equal(readableName('control-plane_audit'), 'Control plane audit');
  assert.equal(readableName(''), '');
});

test('a Claude Code subagent: its description and kind from its meta file, read again when it changes', () => {
  const file = claudeFiles('11111111-1111-1111-1111-111111111111', 'a1', { agentType: 'general-purpose', description: 'Update guide and docs', toolUseId: 'toolu_1', requestShape: 'background', model: 'sonnet' });
  assert.deepEqual(claudeSubagentMeta(file), { title: 'Update guide and docs', type: 'general-purpose' });
  const meta = file.replace(/\.jsonl$/, '.meta.json');
  fs.writeFileSync(meta, JSON.stringify({ agentType: 'Explore', description: 'Find the callers' }));
  fs.utimesSync(meta, new Date(), new Date(Date.now() + 5000));
  assert.deepEqual(claudeSubagentMeta(file), { title: 'Find the callers', type: 'Explore' }, 'the new meta, not the cached one');
  assert.equal(claudeSubagentMeta(file.replace('agent-a1', 'agent-none')), null, 'no meta file: nothing');
});

test('a Codex child thread: its name from the path, its kind from the role, else the nickname; the first line may be long', () => {
  const a = codexRollout('019e0001-0000-7000-8000-000000000001', { agent_path: '/root/negotiation_review', agent_nickname: 'Jason', agent_role: null, source: { subagent: { thread_spawn: { parent_thread_id: 'p' } } } }, 200_000);
  assert.deepEqual(codexSubagentMeta(a), { title: 'Negotiation review', type: 'Jason' });
  const b = codexRollout('019e0001-0000-7000-8000-000000000002', { source: { subagent: { thread_spawn: { parent_thread_id: 'p', agent_path: '/root/audit', agent_role: 'explorer', agent_nickname: 'Ada' } } } });
  assert.deepEqual(codexSubagentMeta(b), { title: 'Audit', type: 'explorer' }, 'also where the spawn says it');
  const c = codexRollout('019e0001-0000-7000-8000-000000000003', { agent_path: '/root', agent_nickname: 'Ned' });
  assert.deepEqual(codexSubagentMeta(c), { title: undefined, type: 'Ned' }, 'the root is no name');
});

// ---- summaries -------------------------------------------------------------------------------------------------------

test('a program subagent’s summary: its lead, title and kind from beside its transcript, its own title when renamed', () => {
  const l = lead('claude');
  const file = claudeFiles(l.id, 'b2', { agentType: 'Explore', description: 'Find the callers' });
  indexed('claude:agent-b2', file, { parent: l.key, title: 'Use the Explore agent to find the callers of…' });
  const s = m.summary('claude:agent-b2');
  assert.equal(s.subagentOf, l.key);
  assert.equal(s.title, 'Find the callers');
  assert.equal(s.subagentType, 'Explore');
  assert.equal(s.live, null, 'its lead has no such task running: it is not working');
  db.prepare('insert into app_sessions (key, agent, title, created_at, updated_at) values (?, ?, ?, ?, ?)').run('claude:agent-b2', 'claude', 'My name', 1, 1);
  assert.equal(m.summary('claude:agent-b2').title, 'My name', 'a title you gave wins');
  const plain = m.summary(l.key);
  assert.equal(plain, null, 'the lead has no row here: no summary');
  // Codex.
  const cl = lead('codex');
  const tid = '019e0002-0000-7000-8000-000000000001';
  indexed(`codex:${tid}`, codexRollout(tid, { agent_path: '/root/negotiation_review', agent_nickname: 'Jason', agent_role: null }), { parent: cl.key, title: 'Review the negotiation' });
  const cs = m.summary(`codex:${tid}`);
  assert.equal(cs.title, 'Negotiation review');
  assert.equal(cs.subagentType, 'Jason');
  assert.equal(cs.subagentOf, cl.key);
  // A session of its own has none of these.
  indexed('claude:00000000-0000-4000-8000-000000000009', '/nowhere.jsonl', { title: 'Fix it' });
  const own = m.summary('claude:00000000-0000-4000-8000-000000000009');
  assert.equal(own.subagentOf, undefined);
  assert.equal(own.title, 'Fix it');
  assert.equal(own.programSubagents, undefined);
});

test('a subagent works while its lead’s agent has its task running, and not after', () => {
  const l = lead('claude');
  const file = claudeFiles(l.id, 'c3', { description: 'Check the docs' });
  indexed('claude:agent-c3', file, { parent: l.key });
  l.adapter.tasks.set('c3', { id: 'c3', description: 'Check the docs', kind: 'local_agent', status: 'running', startedAt: 7000 });
  const s = m.summary('claude:agent-c3');
  assert.deepEqual(s.live, { status: 'working', startedAt: 7000, turnStartedAt: 7000, pendingApprovals: 0 });
  assert.equal(m.liveSnapshot('claude:agent-c3').live.status, 'working', 'its page hears it too');
  l.adapter.tasks.get('c3').status = 'completed';
  assert.equal(m.summary('claude:agent-c3').live, null);
  assert.equal(m.liveSnapshot('claude:agent-c3').live, null);
  // The lead's process ended with the task still listed as running.
  l.adapter.tasks.get('c3').status = 'running';
  l.adapter.exited = true;
  assert.equal(m.summary('claude:agent-c3').live, null);
});

test('a subagent of a session open in VS Code or a terminal works while that session’s transcript lists it running', () => {
  const leadKey = `claude:${crypto.randomUUID()}`;
  const file = claudeFiles(leadKey.slice(7), 'd4', { description: 'Background job' });
  indexed(leadKey, '/nowhere.jsonl');
  indexed('claude:agent-d4', file, { parent: leadKey });
  db.prepare('update sessions set bg_tasks = ? where key = ?').run(JSON.stringify([{ id: 'd4', description: 'Background job', kind: 'agent', status: 'running', startedAt: 9000 }]), leadKey);
  m.external = { get: (k: string) => (k === leadKey ? { status: 'working', client: 'VS Code', pid: 1, startedAt: 1000 } : null), poll() {} };
  assert.equal(m.summary('claude:agent-d4').live?.status, 'working');
  m.external = { get: () => null, poll() {} };
  assert.equal(m.summary('claude:agent-d4').live, null);
});

test('how many program subagents a session has: the index’s, and those a Claude Code agent lists that it has not read yet', async () => {
  const l = lead('claude');
  indexed(l.key, '/nowhere.jsonl');
  indexed('claude:agent-e1', claudeFiles(l.id, 'e1'), { parent: l.key });
  indexed('claude:agent-e2', claudeFiles(l.id, 'e2'), { parent: l.key });
  const counts = countSubagents(db);
  assert.equal(counts.get(l.key), 2);
  m.subCounts = counts;
  assert.equal(m.summary(l.key).programSubagents, 2);
  l.adapter.tasks.set('e3', { id: 'e3', description: 'Just started', kind: 'local_agent', status: 'running', startedAt: 8000 });
  l.adapter.tasks.set('e1', { id: 'e1', description: 'Indexed already', kind: 'local_agent', status: 'running', startedAt: 8000 });
  l.adapter.tasks.set('bash1', { id: 'bash1', description: 'npm run dev', kind: 'local_bash', status: 'running', startedAt: 8000 });
  assert.equal(m.summary(l.key).programSubagents, 3, 'one more, not counted twice once indexed, no commands');
  indexed(`claude:${crypto.randomUUID()}`, '/n.jsonl');
  db.prepare('delete from sessions where key = ?').run('claude:agent-e2');
  indexer.emit('updated', { keys: [], removed: ['claude:agent-e2'] });
  sent.length = 0;
  await wait(450);
  assert.equal(m.subCounts.get(l.key), 1, 'counted again after the index changed');
  assert.ok(sent.includes(l.key), 'its list entry is made again when its count changed');
  l.adapter.tasks.clear();
  const none = lead('claude');
  indexed(none.key, '/nowhere.jsonl');
  assert.equal(m.summary(none.key).programSubagents, undefined, 'none: the field is left out');
});

test('a subagent the index has not read yet: its transcript and summary come from its lead’s agent, and the index is told where to look', () => {
  const leadFile = path.join(projects, 'fff.jsonl');
  const l = lead('claude', { transcript: leadFile });
  l.adapter.tasks.set('f6', { id: 'f6', description: 'Write the tests', kind: 'local_agent', status: 'running', startedAt: 6500, toolUseId: 'toolu_f6' });
  const expected = path.join(projects, l.id, 'subagents', 'agent-f6.jsonl');
  assert.equal(m.transcriptOf('claude:agent-f6'), expected);
  const s = m.summary('claude:agent-f6');
  assert.equal(s.agent, 'claude');
  assert.equal(s.title, 'Write the tests');
  assert.equal(s.cwd, '/work/shop');
  assert.equal(s.subagentOf, l.key);
  assert.equal(s.createdAt, 6500);
  assert.equal(s.live?.status, 'working');
  assert.equal(s.stats.turns, 0);
  assert.equal(m.summary('claude:agent-nothere'), null, 'a subagent no live session lists is unknown');
  pokes.length = 0;
  m.watchSubagents(l.live, new Map());
  assert.ok(pokes.includes(expected), 'the index is poked with its path as soon as the task is seen');
  const listed = m.subagentsOf(l.key);
  assert.deepEqual(listed.map((x: any) => x.key), ['claude:agent-f6'], 'listed with the lead’s subagents');
});

test('the subagents of a session are listed oldest first, indexed ones and live ones together', () => {
  const l = lead('claude', { transcript: path.join(projects, 'ggg.jsonl') });
  indexed('claude:agent-g2', claudeFiles(l.id, 'g2', { description: 'Second' }), { parent: l.key, created: 2000 });
  indexed('claude:agent-g1', claudeFiles(l.id, 'g1', { description: 'First' }), { parent: l.key, created: 1000 });
  l.adapter.tasks.set('g3', { id: 'g3', description: 'Third, live', kind: 'local_agent', status: 'running', startedAt: 3000 });
  assert.deepEqual(m.subagentsOf(l.key).map((x: any) => x.title), ['First', 'Second', 'Third, live']);
  assert.deepEqual(m.subagentsOf(`claude:${crypto.randomUUID()}`), []);
});

test('a change in the lead’s tasks lists the subagent again, follows a running one and ends a finished one’s conversation', async () => {
  const l = lead('claude', { transcript: path.join(projects, 'hhh.jsonl') });
  const file = claudeFiles(l.id, 'h8', { description: 'Reader' });
  indexed('claude:agent-h8', file, { parent: l.key });
  const tl = await m.timeline('claude:agent-h8');
  assert.equal(tl.parser.items.length > 0, true, 'its own conversation');
  const seen = new Map<string, boolean>();
  l.adapter.tasks.set('h8', { id: 'h8', description: 'Reader', kind: 'local_agent', status: 'running', startedAt: 4000 });
  sent.length = 0;
  m.watchSubagents(l.live, seen);
  assert.ok(sent.includes('claude:agent-h8') && sent.includes(l.key), 'the subagent and its lead are listed again');
  sent.length = 0;
  m.watchSubagents(l.live, seen);
  assert.deepEqual(sent, [], 'nothing changed: nothing more');
  l.adapter.tasks.get('h8').status = 'completed';
  m.watchSubagents(l.live, seen);
  assert.deepEqual(sent, ['claude:agent-h8']);
  await wait(900);
  assert.equal((tl as any).finished, true, 'its last turn is closed once it has ended');
  l.adapter.tasks.get('h8').status = 'running';
  m.watchSubagents(l.live, seen);
  assert.equal((tl as any).finished, false, 'it runs again: open again');
  tl.dispose();
});

// ---- the refusal -----------------------------------------------------------------------------------------------------

test('nothing runs or changes a program subagent: a message, resuming it, forking, handing off, deleting it, moving it are refused', async () => {
  const l = lead('claude');
  const file = claudeFiles(l.id, 'i9', { description: 'Reader' });
  indexed('claude:agent-i9', file, { parent: l.key });
  const cl = lead('codex');
  const tid = '019e0003-0000-7000-8000-000000000001';
  const cfile = codexRollout(tid, { agent_path: '/root/auditor' });
  indexed(`codex:${tid}`, cfile, { parent: cl.key });
  const refused = async (what: () => unknown, re: RegExp) => assert.rejects(async () => what(), (e: any) => e.status === 400 && re.test(e.message));
  const claudeSays = /This is a Claude Code subagent that runs inside its own session\. Talk to it there\./;
  const codexSays = /This is a Codex subagent that runs inside its own session\. Talk to it there\./;
  await refused(() => m.send('claude:agent-i9', 'Hello'), claudeSays);
  await refused(() => m.start('claude:agent-i9'), claudeSays);
  await refused(() => m.fork('claude:agent-i9', { prompt: 'Go on' }), claudeSays);
  await refused(() => m.handoff('claude:agent-i9', { agent: 'codex' }), claudeSays);
  await refused(() => m.remove('claude:agent-i9'), claudeSays);
  await refused(() => m.takeover('claude:agent-i9', 'Hi'), claudeSays);
  await refused(() => m.moveToAccount('claude:agent-i9', 'x'), claudeSays);
  await refused(() => m.send(`codex:${tid}`, 'Hello'), codexSays);
  await refused(() => m.start(`codex:${tid}`), codexSays);
  await refused(() => m.remove(`codex:${tid}`), codexSays);
  assert.ok(fs.existsSync(file) && fs.existsSync(cfile), 'their transcripts are still there');
  assert.ok(db.prepare('select 1 from sessions where key = ?').get('claude:agent-i9'), 'and their rows');
  // One not indexed yet, but listed by its lead's agent.
  l.adapter.tasks.set('j1', { id: 'j1', description: 'New', kind: 'local_agent', status: 'running', startedAt: 1 });
  await refused(() => m.send('claude:agent-j1', 'Hello'), claudeSays);
  // Renaming, pinning and archiving stay.
  await m.rename('claude:agent-i9', 'Reader renamed');
  m.setFlags('claude:agent-i9', { pinned: true });
  assert.equal(m.summary('claude:agent-i9').title, 'Reader renamed');
  assert.equal(m.summary('claude:agent-i9').pinned, true);
  // A session of its own is not refused its own checks (it is not there: not found, not a refusal).
  await assert.rejects(async () => m.send(`claude:${crypto.randomUUID()}`, 'Hello'), (e: any) => !/subagent that runs inside/.test(e.message));
});

// ---- the transcript as its own conversation --------------------------------------------------------------------------

const subTranscript = (agentId: string, n = 2) =>
  jsonl([
    { type: 'user', isSidechain: true, agentId, uuid: 'u1', timestamp: '2026-11-10T10:00:00.000Z', message: { role: 'user', content: 'Update the guide' } },
    { type: 'assistant', isSidechain: true, agentId, uuid: 'a1', timestamp: '2026-11-10T10:00:01.000Z', message: { id: 'msg_1', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text: 'Updated.' }], usage: { input_tokens: 5, output_tokens: 2 } } },
  ].slice(0, n));

test('a Claude Code subagent’s transcript shows its items in a timeline, also after it is rewritten', async () => {
  const dir = path.join(tmp, 'sidechain');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'agent-k2.jsonl');
  fs.writeFileSync(file, subTranscript('k2'));
  const sub = new Timeline('claude:agent-k2', 'claude', file);
  await sub.load(false);
  assert.deepEqual(sub.parser.items.filter((i) => i.kind === 'user' || i.kind === 'assistant').map((i) => (i as any).text), ['Update the guide', 'Updated.']);
  const plain = new Timeline(`claude:${crypto.randomUUID()}`, 'claude', file);
  await plain.load(false);
  assert.equal(plain.parser.items.filter((i) => i.kind === 'assistant').length, 0, 'a session of its own does not take sidechain entries for its own');
  // Written again, shorter: read from the start, still as the subagent's own conversation.
  fs.writeFileSync(file, subTranscript('k2', 1));
  await sub.readMore();
  assert.deepEqual(sub.parser.items.filter((i) => i.kind === 'user').map((i) => (i as any).text), ['Update the guide']);
  sub.dispose();
  plain.dispose();
});

test('the last thing written in a session, for a Codex subagent’s reply', async () => {
  const l = lead('claude');
  const file = claudeFiles(l.id, 'l3');
  fs.writeFileSync(file, subTranscript('l3'));
  indexed('claude:agent-l3', file, { parent: l.key });
  assert.equal(await m.lastText('claude:agent-l3'), 'Updated.');
  const empty = path.join(tmp, 'empty.jsonl');
  fs.writeFileSync(empty, '');
  indexed('claude:agent-l4', empty, { parent: l.key });
  assert.equal(await m.lastText('claude:agent-l4'), '');
  m.timelines.get('claude:agent-l3')?.dispose();
  m.timelines.get('claude:agent-l4')?.dispose();
});

test('a subagent that runs is loaded as live: its last turn stays open', async () => {
  const l = lead('claude');
  const file = claudeFiles(l.id, 'n5');
  fs.writeFileSync(file, subTranscript('n5'));
  indexed('claude:agent-n5', file, { parent: l.key });
  l.adapter.tasks.set('n5', { id: 'n5', description: 'x', kind: 'local_agent', status: 'running', startedAt: 1 });
  const tl = await m.timeline('claude:agent-n5');
  assert.equal((tl as any).finished, false);
  const l2 = lead('claude');
  const file2 = claudeFiles(l2.id, 'n6');
  fs.writeFileSync(file2, subTranscript('n6'));
  indexed('claude:agent-n6', file2, { parent: l2.key });
  const tl2 = await m.timeline('claude:agent-n6');
  assert.equal((tl2 as any).finished, true, 'one that is not running is closed');
  tl.dispose();
  tl2.dispose();
});

// ---- Codex's live adapter --------------------------------------------------------------------------------------------

function codexLead() {
  const runner = new EventEmitter() as any;
  runner.writeLine = () => {};
  runner.meta = { runId: 'r1' };
  const a = new CodexLive(runner, { cwd: '/work/shop', threadId: 'lead-thread' } as any);
  const note = (method: string, params: object, replay = false) => runner.emit('line', JSON.stringify({ method, params }), replay);
  const item = (method: 'item/started' | 'item/completed', it: object, threadId = 'lead-thread') => note(method, { threadId, turnId: 't1', item: it });
  return { a, note, item };
}

test('Codex: a subagent’s activity makes, runs again and ends its task (both spellings)', () => {
  const { a, item } = codexLead();
  item('item/started', { type: 'subAgentActivity', id: 'sa1', agentThreadId: 'child-1', agentPath: '/root/negotiation_review', kind: 'started' });
  let t = a.tasks.get('child-1')!;
  assert.deepEqual({ id: t.id, kind: t.kind, description: t.description, status: t.status }, { id: 'child-1', kind: 'agent', description: 'Negotiation review', status: 'running' });
  assert.ok(t.startedAt && Date.now() - t.startedAt < 5000);
  assert.deepEqual(a.state.backgroundTasks?.map((x) => x.id), ['child-1'], 'a running task of the lead');
  assert.equal(a.overlayItems.size, 0, 'no step of the turn');
  item('item/completed', { type: 'subAgentActivity', id: 'sa2', agentThreadId: 'child-1', agentPath: '/root/negotiation_review', kind: 'completed' });
  assert.equal(a.tasks.get('child-1')!.status, 'completed');
  assert.equal(a.state.backgroundTasks?.length, 0);
  assert.equal(a.state.endedTasks?.[0]?.id, 'child-1', 'listed as ended');
  item('item/completed', { type: 'SubAgentActivity', id: 'sa3', agent_thread_id: 'child-1', agent_path: '/root/negotiation_review', kind: 'interacted' });
  assert.equal(a.tasks.get('child-1')!.status, 'running', 'spoken to: running again (snake_case spelling)');
  item('item/completed', { type: 'sub_agent_activity', agent_thread_id: 'child-1', kind: 'interrupted' });
  assert.equal(a.tasks.get('child-1')!.status, 'stopped');
  item('item/completed', { type: 'subAgentActivity', agentThreadId: 'child-2', agentPath: '/root/audit', kind: 'started' });
  item('item/completed', { type: 'subAgentActivity', agentThreadId: 'child-2', kind: 'errored' });
  assert.equal(a.tasks.get('child-2')!.status, 'failed');
  assert.equal(a.tasks.get('child-2')!.description, 'Audit');
});

test('Codex: a spawnAgent call makes tasks of its receivers, and its states end them; it shows as a step, never its encrypted prompt', () => {
  const { a, item } = codexLead();
  const encrypted = 'gAAAAABp' + 'x'.repeat(60);
  item('item/started', { type: 'collabAgentToolCall', id: 'call_1', tool: 'spawnAgent', status: 'inProgress', senderThreadId: 'lead-thread', receiverThreadIds: [], prompt: encrypted, model: 'gpt-5.5', agentsStates: {} });
  assert.equal(a.tasks.size, 0, 'no receiver yet');
  const step = a.overlayItems.get('call_1');
  assert.equal(step?.kind, 'tool');
  assert.equal((step as any).tool.category, 'task');
  assert.ok(!JSON.stringify(step).includes('gAAAA'), 'the encrypted prompt is never shown');
  item('item/completed', { type: 'collabAgentToolCall', id: 'call_1', tool: 'spawnAgent', status: 'completed', senderThreadId: 'lead-thread', receiverThreadIds: ['child-9'], prompt: encrypted, agentsStates: { 'child-9': { status: 'pendingInit', message: null } } });
  const t = a.tasks.get('child-9')!;
  assert.equal(t.status, 'running');
  assert.equal(t.toolUseId, 'call_1');
  assert.equal(t.description, 'Subagent');
  item('item/started', { type: 'subAgentActivity', id: 'sa', agentThreadId: 'child-9', agentPath: '/root/code_review', kind: 'started' });
  assert.equal(t.description, 'Code review', 'named once its activity says');
  assert.equal(t.toolUseId, 'call_1');
  // A wait that finds it done.
  item('item/completed', { type: 'collabAgentToolCall', id: 'call_2', tool: 'wait', status: 'completed', senderThreadId: 'lead-thread', receiverThreadIds: ['child-9'], agentsStates: { 'child-9': { status: 'completed', message: 'Done.' }, 'other': { status: 'completed' } } });
  assert.equal(t.status, 'completed');
  assert.ok(!a.tasks.has('other'), 'an agent that was no task is not made one');
  // The spawn call completing late does not bring it back.
  item('item/completed', { type: 'collabAgentToolCall', id: 'call_1', tool: 'spawnAgent', status: 'completed', receiverThreadIds: ['child-9'], agentsStates: { 'child-9': { status: 'running' } } });
  assert.equal(t.status, 'completed');
  // A message to it runs it again; a close of one that ended leaves it as it was.
  item('item/started', { type: 'collabAgentToolCall', id: 'call_3', tool: 'sendInput', status: 'inProgress', receiverThreadIds: ['child-9'], prompt: 'More please', agentsStates: { 'child-9': { status: 'running' } } });
  assert.equal(t.status, 'running');
  assert.match(((a.overlayItems.get('call_3') as any).tool.title as string), /More please/);
  item('item/completed', { type: 'collabAgentToolCall', id: 'call_4', tool: 'closeAgent', status: 'completed', receiverThreadIds: ['child-9'], agentsStates: { 'child-9': { status: 'shutdown' } } });
  assert.equal(t.status, 'stopped', 'closed while it ran');
  // Replayed lines (a restart) give no start time.
  const r = codexLead();
  r.note('item/started', { threadId: 'lead-thread', item: { type: 'subAgentActivity', agentThreadId: 'old', agentPath: '/root/old', kind: 'started' } }, true);
  assert.equal(r.a.tasks.get('old')!.startedAt, undefined);
});

test('Codex: liveItem gives no step for subagent activity, and a readable one for its calls in either spelling', () => {
  assert.equal(liveItem({ type: 'subAgentActivity', id: 'x', agentThreadId: 't', kind: 'started' }, 1), null);
  assert.equal(liveItem({ type: 'SubAgentActivity', id: 'x', agent_thread_id: 't', kind: 'started' }, 1), null);
  const call = liveItem({ type: 'CollabAgentToolCall', id: 'c', tool: 'spawnAgent', status: 'failed', prompt: 'gAAAAAB' }, 1) as any;
  assert.equal(call.tool.category, 'task');
  assert.equal(call.tool.status, 'error');
  assert.equal(call.tool.title, 'Start a subagent');
  assert.equal(call.tool.input, undefined);
  const wait = liveItem({ type: 'collabAgentToolCall', id: 'w', tool: 'wait', status: 'inProgress' }, 1) as any;
  assert.equal(wait.tool.title, 'Wait for subagents');
  assert.equal(wait.tool.status, 'running');
});

test('Codex: what a child thread says on the same connection never changes the lead’s state', () => {
  const { a, note, item } = codexLead();
  note('turn/started', { threadId: 'lead-thread', turn: { id: 'lt' } });
  note('thread/settings/updated', { threadId: 'lead-thread', threadSettings: { model: 'gpt-5.5' } });
  assert.equal(a.state.status, 'working');
  assert.equal(a.state.model, 'gpt-5.5');
  // The child ends its own turn, goes idle, changes its settings, reports its usage, steps and errors.
  note('turn/completed', { threadId: 'child-1', turn: { id: 'ct', status: 'completed' } });
  note('thread/status/changed', { threadId: 'child-1', status: { type: 'idle' } });
  note('thread/settings/updated', { threadId: 'child-1', threadSettings: { model: 'gpt-5.5-mini' } });
  note('thread/tokenUsage/updated', { threadId: 'child-1', tokenUsage: { last: { inputTokens: 9, outputTokens: 1 }, total: { inputTokens: 9, outputTokens: 1 }, modelContextWindow: 1000 } });
  note('turn/started', { threadId: 'child-1', turn: { id: 'ct2' } });
  note('error', { threadId: 'child-1', error: { message: 'boom' }, willRetry: false });
  item('item/started', { type: 'agentMessage', id: 'child-msg', text: 'I am the child' }, 'child-1');
  item('item/completed', { type: 'commandExecution', id: 'child-cmd', command: 'ls', status: 'completed' }, 'child-1');
  assert.equal(a.state.status, 'working', 'the lead is still in its turn');
  assert.equal(a.state.model, 'gpt-5.5');
  assert.equal(a.state.contextTokens, undefined);
  assert.equal(a.state.error, undefined);
  assert.equal(a.overlayItems.size, 0, 'no step of the child’s in the lead’s conversation');
  assert.equal(a.turnId, 'lt');
  // Subagent items from a child still count (a deeper subagent), but make no step.
  item('item/completed', { type: 'subAgentActivity', agentThreadId: 'grandchild', agentPath: '/root/a/b', kind: 'started' }, 'child-1');
  assert.equal(a.tasks.get('grandchild')?.status, 'running');
  item('item/started', { type: 'collabAgentToolCall', id: 'cc', tool: 'spawnAgent', status: 'inProgress' }, 'child-1');
  assert.equal(a.overlayItems.size, 0);
  // Its own lines still work, and its turn ends as ever.
  item('item/started', { type: 'agentMessage', id: 'lead-msg', text: 'Done' });
  assert.ok(a.overlayItems.has('lead-msg'));
  note('turn/completed', { threadId: 'lead-thread', turn: { id: 'lt', status: 'completed' } });
  assert.equal(a.state.status, 'idle');
  // A thread id of its own that is not known yet is not a child's.
  const runner = new EventEmitter() as any;
  runner.writeLine = () => {};
  runner.meta = { runId: 'r2' };
  const fresh = new CodexLive(runner, { cwd: '/x' } as any);
  runner.emit('line', JSON.stringify({ method: 'turn/started', params: { threadId: 'first-thread', turn: { id: 'z' } } }), false);
  assert.equal(fresh.state.status, 'working');
});

test('Claude Code: its subagents are tasks of kind local_agent with the call’s id, foreground ones too', () => {
  const runner = new EventEmitter() as any;
  runner.writeLine = () => {};
  const a = new ClaudeLive(runner, { sessionId: 's' } as any);
  runner.emit('line', JSON.stringify({ type: 'system', subtype: 'task_started', task_id: 'a1b2', tool_use_id: 'toolu_9', description: 'Update guide and docs', task_type: 'local_agent' }), false);
  const t = a.tasks.get('a1b2')!;
  assert.equal(t.kind, 'local_agent');
  assert.equal(t.toolUseId, 'toolu_9');
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n`, e);
    process.exitCode = 1;
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed}/${tests.length} passed`);
process.exit(process.exitCode ?? 0);
