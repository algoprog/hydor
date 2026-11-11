// Checks for child sessions: starting one (agent, model, folder, mode never freer than the parent's, a
// share of the cap, the card in the parent's conversation), one level only, how many run at once, the
// reply flowing back to the parent (whole, summarized when long, stopped, failed, refused by a cap),
// message_child and child_sessions. Sessions are a stub; the helper model is a tiny fake server.
// Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/children/children-test.ts
//   DATA_DIR=/tmp/hydor-test-children PRICES_URL= node dist/dev/children-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { childReplyOf, type ChildNote } from '../../shared/children.ts';
import type { Agent, AgentModel, LiveState, SessionSummary, TimelineItem } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { budget } from '../budget/index.ts';
import { kvSet, openDb } from '../db.ts';
import type { Deps, RunCtx, RunTool } from '../features/types.ts';
import { AGENT_FILE } from '../models/config.ts';
import { notesOf } from '../notes.ts';
import { setPriceOverrides } from '../prices.ts';
import type { CreateOpts } from '../sessions.ts';
import { setSessionExtra } from '../sessionExtra.ts';
import { saveAssistant } from '../assistants/store.ts';
import { setTeam, setTiers } from '../assistants/tiers.ts';
import { costWords, teamInstructions } from './team.ts';
import { inboxOf, inboxTurnEnded, pump, standingKey } from '../assistants/inbox.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { catchUp, CHILD_INSTRUCTIONS, children, findModel, LONG_REPLY, reportTurn, resultMessage } from './index.ts';
import { ancestorsOf, childKeys, parentOf, runningBelow, runningChildren } from './family.ts';
import { childMode } from './modes.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/') || process.env.PRICES_URL !== '') {
  console.error('Run with DATA_DIR=/tmp/… and PRICES_URL= (empty) so nothing touches real data or the network.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-children-test-'));
const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

// ---- a fake model server, for the helper ----------------------------------------------------------

const asked: string[] = [];
/** What the helper model says when it checks a helper's work (stepping up). */
let verdict = '{"pass": true, "why": "it does the job"}';
const srv = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => {
    const body = JSON.parse(b);
    asked.push(String(body.messages.at(-1).content));
    const checking = String(body.messages[0]?.content ?? '').startsWith('You check the work');
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: checking ? verdict : 'SUMMARY: three files changed, tests pass.' }, finish_reason: 'stop' }] })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
});
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
const port = (srv.address() as { port: number }).port;
const MODELS: AgentModel[] = [
  { id: 'openrouter/qwen/qwen3-coder', label: 'Qwen3 Coder', provider: 'openrouter', baseUrl: `http://127.0.0.1:${port}`, model: 'qwen/qwen3-coder', tools: 'native' },
  { id: 'ollama/llama3', label: 'llama3', provider: 'ollama', baseUrl: `http://127.0.0.1:${port}`, model: 'llama3', tools: 'text' },
  { id: 'endpoint/lab/helper', label: 'Helper', provider: 'endpoint', baseUrl: `http://127.0.0.1:${port}`, model: 'helper', tools: 'native' },
];
fs.mkdirSync(path.dirname(AGENT_FILE), { recursive: true });
fs.writeFileSync(AGENT_FILE, JSON.stringify({ models: MODELS }));
kvSet(db, 'helper.model', 'endpoint/lab/helper');
setPriceOverrides(db, { 'test-model': { input: 10, output: 30 } });

// ---- the session manager, as much as children use of it -----------------------------------------------

interface Fake {
  agent: Agent;
  acpAgent?: string;
  cwd: string;
  title: string;
  model?: string;
  mode?: string;
  live?: LiveState['status'];
  items: TimelineItem[];
}

class Sessions extends EventEmitter {
  all = new Map<string, Fake>();
  created: CreateOpts[] = [];
  delivered: { key: string; text: string }[] = [];
  queued: { key: string; text: string }[] = [];
  /** Makes create() wait, to see calls that overlap. */
  gate: Promise<void> | null = null;
  n = 0;
  add(key: string, f: Partial<Fake> & { agent: Agent }) {
    this.all.set(key, { cwd: tmp, title: key, items: [], ...f });
    db.prepare('insert or ignore into app_sessions (key, agent, created_at, updated_at) values (?, ?, ?, ?)').run(key, f.agent, Date.now(), Date.now() + this.n++);
  }
  summary(key: string): SessionSummary | null {
    const f = this.all.get(key);
    if (!f) return null;
    const extra = (db.prepare('select extra from app_sessions where key = ?').get(key) as { extra: string | null } | undefined)?.extra;
    return {
      key,
      agent: f.agent,
      id: key,
      title: f.title,
      cwd: f.cwd,
      acpAgent: f.acpAgent,
      acpName: f.acpAgent === 'console' ? 'Custom' : undefined,
      model: f.model,
      stats: {} as any,
      live: f.live ? { status: f.live, startedAt: 1, pendingApprovals: 0, mode: f.mode, model: f.model } : null,
      extra: extra ? JSON.parse(extra) : undefined,
      updatedAt: Date.now(),
    };
  }
  async create(o: CreateOpts): Promise<string> {
    this.created.push(o);
    if (this.gate) await this.gate;
    const key = `${o.agent}:child${this.created.length}`;
    this.add(key, { agent: o.agent, acpAgent: o.acpAgent, cwd: o.cwd, title: o.title ?? '', model: o.model, mode: o.mode, live: 'working', items: [{ kind: 'user', id: `${key}-u1`, seq: 0, ts: Date.now(), text: o.prompt ?? '' }] });
    if (o.extra) setSessionExtra(db, key, o.extra);
    return key;
  }
  async timeline(key: string) {
    return { parser: { items: this.all.get(key)?.items ?? [] }, readMore: async () => {} };
  }
  async deliverOrQueue(key: string, text: string) {
    await budget.beforeSend!(key, deps);
    this.delivered.push({ key, text });
  }
  /** Whether each queued message was put in a held queue. */
  queuedHeld: boolean[] = [];
  enqueue(key: string, text: string, _images: unknown[] = [], _files: unknown[] = [], hold = false) {
    this.queued.push({ key, text });
    this.queuedHeld.push(hold);
  }
  /** Sessions whose last turn their plan's usage limit stopped. */
  limited = new Set<string>();
  stoppedAtLimit(key: string) {
    return this.limited.has(key);
  }
  /** A session moved to a tier's model (its own step up). */
  moved: { key: string; tier: string; pick: { model?: string; effort?: string }; why: { event: string; why?: string } }[] = [];
  async moveToTier(key: string, tier: string, pick: { model?: string; effort?: string }, why: { event: string; why?: string }) {
    this.moved.push({ key, tier, pick, why });
    const f = this.all.get(key);
    if (f && pick.model) f.model = pick.model;
  }
  accountOf() {
    return undefined;
  }
}

const sessions = new Sessions();
const deps = { app: {}, db, sessions, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => 'https://naget.test' } as unknown as Deps;
const ctxOf = (key: string): RunCtx => {
  const f = sessions.all.get(key)!;
  return { runId: 'r1', key, agent: f.agent, acpAgent: f.acpAgent, cwd: f.cwd, deps };
};
const tool = (key: string, name: string): RunTool => {
  const t = children.tools!(ctxOf(key)).find((x) => x.name === name);
  if (!t) throw new Error(`no ${name} for ${key}`);
  return t;
};
const call = async (key: string, name: string, args: Record<string, unknown>) => {
  const r = await tool(key, name).run(args, ctxOf(key));
  return typeof r === 'string' ? r : r.text;
};

let seq = 0;
const user = (text: string): TimelineItem => ({ kind: 'user', id: `u${++seq}`, seq, ts: Date.now(), text });
const said = (text: string): TimelineItem => ({ kind: 'assistant', id: `a${++seq}`, seq, text });
const step = (title: string): TimelineItem => ({ kind: 'tool', id: `t${++seq}`, seq, tool: { name: 'Bash', category: 'command', title, status: 'ok' } });
const end = (status = 'completed'): TimelineItem => ({ kind: 'turn', id: `e${++seq}`, seq, status });

// ---- starting a child -----------------------------------------------------------------------------

sessions.add('claude:p', { agent: 'claude', live: 'working', mode: 'acceptEdits', title: 'Parent', items: [user('Build the report'), step('ls')] });

test('a model of Custom’s is found by its id or a name only it has', () => {
  assert.equal(findModel(MODELS, 'openrouter/qwen/qwen3-coder')?.label, 'Qwen3 Coder');
  assert.equal(findModel(MODELS, 'qwen3-coder')?.id, 'openrouter/qwen/qwen3-coder');
  assert.equal(findModel(MODELS, 'Qwen3 Coder')?.id, 'openrouter/qwen/qwen3-coder');
  assert.equal(findModel(MODELS, 'gpt-9'), undefined);
});

test('modes: the parent’s, never freer (plan < ask < edits < auto < full)', () => {
  assert.equal(childMode({ family: 'claude', mode: 'acceptEdits' }, 'custom'), 'edits');
  assert.equal(childMode({ family: 'claude', mode: 'acceptEdits' }, 'codex'), 'read-only');
  assert.equal(childMode({ family: 'custom', mode: 'auto' }, 'claude'), 'auto');
  assert.equal(childMode({ family: 'custom', mode: 'auto' }, 'codex'), 'auto');
  // Full access is equally free across Custom, Claude Code and Codex.
  assert.equal(childMode({ family: 'custom', mode: 'full' }, 'claude'), 'bypassPermissions');
  assert.equal(childMode({ family: 'claude', mode: 'bypassPermissions' }, 'custom'), 'full');
  assert.equal(childMode({ family: 'codex', mode: 'full' }, 'codex'), 'full');
  assert.equal(childMode({ family: 'claude', mode: 'plan' }, 'codex'), 'plan');
  assert.equal(childMode({ family: 'codex', mode: 'auto-review' }, 'codex'), 'auto-review');
  // A mode not known, or another ACP agent's: ask; and that agent keeps its own default.
  assert.equal(childMode({ family: null, mode: 'yolo' }, 'claude'), 'default');
  assert.equal(childMode({ family: 'claude', mode: 'default' }, null), undefined);
});

test('start_child_session: Custom with a named model, the parent’s folder, a mode no freer, a card in the parent’s turn', async () => {
  const out = await call('claude:p', 'start_child_session', { brief: 'Count the words in every chapter and report a table.', agent: 'custom', model: 'qwen3-coder', title: 'Count words' });
  const o = sessions.created.at(-1)!;
  assert.equal(o.agent, 'acp');
  assert.equal(o.acpAgent, 'console');
  assert.equal(o.model, 'openrouter/qwen/qwen3-coder');
  assert.equal(o.mode, 'edits');
  assert.equal(o.cwd, tmp);
  assert.equal(o.remember, false);
  assert.equal(o.prompt, 'Count the words in every chapter and report a table.');
  assert.deepEqual(o.extra, { parent: 'claude:p' });
  const key = /Started child session (\S+):/.exec(out)?.[1];
  assert.equal(key, 'acp:child1');
  assert.equal(parentOf(db, key!), 'claude:p');
  assert.deepEqual(childKeys(db, 'claude:p'), [key]);
  const [note] = notesOf(db, 'claude:p', 'child');
  assert.equal(note.anchor, sessions.all.get('claude:p')!.items[0].id);
  const d = note.data as ChildNote;
  assert.equal(d.child, key);
  assert.equal(d.label, 'Custom · Qwen3 Coder');
  assert.equal(d.title, 'Count words');
  assert.match(out, /Its reply comes to you as a message/);
});

test('start_child_session: Claude Code and another folder; errors that say what to do', async () => {
  const sub = path.join(tmp, 'book');
  fs.mkdirSync(sub, { recursive: true });
  await call('claude:p', 'start_child_session', { brief: 'Proofread chapter 2.', agent: 'claude', model: 'sonnet', cwd: 'book' });
  const o = sessions.created.at(-1)!;
  assert.deepEqual([o.agent, o.model, o.mode, o.cwd], ['claude', 'sonnet', 'acceptEdits', sub]);
  await assert.rejects(call('claude:p', 'start_child_session', { brief: 'x', agent: 'custom' }), /Name the model for Custom\. Its models: openrouter\/qwen\/qwen3-coder \(Qwen3 Coder\)/);
  await assert.rejects(call('claude:p', 'start_child_session', { brief: 'x', agent: 'custom', model: 'gpt-9' }), /Custom has no model "gpt-9"/);
  await assert.rejects(call('claude:p', 'start_child_session', { brief: 'x', agent: 'robot' }), /There is no agent "robot"\. Pick custom \(with a model\), claude, codex/);
  await assert.rejects(call('claude:p', 'start_child_session', { brief: '  ' }), /brief is empty/);
  await assert.rejects(call('claude:p', 'start_child_session', { brief: 'x', cwd: 'nowhere' }), /There is no folder/);
});

test('one level only: a child gets no child tools, and cannot start one', async () => {
  const kid = 'acp:child1';
  assert.deepEqual(children.tools!(ctxOf(kid)), []);
  const start = children.tools!(ctxOf('claude:p')).find((t) => t.name === 'start_child_session')!;
  await assert.rejects(start.run({ brief: 'x', agent: 'custom', model: 'llama3' }, ctxOf(kid)), /cannot start child sessions of its own/);
  assert.deepEqual(children.spawn!({ agent: 'acp', acpAgent: 'console', cwd: tmp, runId: 'r', resume: false, extra: { parent: 'claude:p' } }, deps), { instructions: [CHILD_INSTRUCTIONS] });
});

test('at most N working at once (busy children and ones still starting count)', async () => {
  kvSet(db, 'children.maxRunning', '2');
  // Two children of claude:p are working already.
  await assert.rejects(call('claude:p', 'start_child_session', { brief: 'third', agent: 'custom', model: 'llama3' }), /2 of your child sessions are working already, the most at once/);
  sessions.all.get('acp:child1')!.live = 'idle';
  // A burst: the first is still being created when the second comes.
  let open!: () => void;
  sessions.gate = new Promise((r) => (open = r));
  const first = call('claude:p', 'start_child_session', { brief: 'fourth', agent: 'custom', model: 'llama3' });
  await assert.rejects(call('claude:p', 'start_child_session', { brief: 'fifth', agent: 'custom', model: 'llama3' }), /working already/);
  open();
  sessions.gate = null;
  await first;
  kvSet(db, 'children.maxRunning', '4');
});

test('a child gets a share of the parent’s cap; none when the cap is spent', async () => {
  sessions.add('codex:q', { agent: 'codex', live: 'working', mode: 'full', items: [user('Plan the trip')] });
  setSessionExtra(db, 'codex:q', { capUsd: 5 });
  db.prepare("insert into sessions (key, agent, id, path, model, tokens_in, tokens_out) values ('codex:q', 'codex', 'q', '/tmp/q', 'test-model', 100000, 0)").run();
  await call('codex:q', 'start_child_session', { brief: 'Find trains.', agent: 'custom', model: 'llama3' });
  const o = sessions.created.at(-1)!;
  // Spent $1 of $5: (5 - 1) / (4 + 1).
  assert.deepEqual(o.extra, { parent: 'codex:q', capUsd: 0.8 });
  assert.equal(o.mode, 'full');
  db.prepare("update sessions set tokens_in = 600000 where key = 'codex:q'").run();
  await assert.rejects(call('codex:q', 'start_child_session', { brief: 'more', agent: 'custom', model: 'llama3' }), /spending cap is reached \(\$6\.00 of \$5\.00\)/);
});

// ---- replies flow back --------------------------------------------------------------------------------

const kid = 'acp:child1';

test('a child’s turn ends: its reply goes to the parent, once', async () => {
  const f = sessions.all.get(kid)!;
  f.live = 'idle';
  f.items.push(step('wc -w ch*.md'), said('Looking.'), step('cat ch1.md'), said('| Chapter | Words |\n| 1 | 1200 |'), end());
  await reportTurn(deps, { key: kid, startedAt: Date.now() - 1000, external: false });
  const m = sessions.delivered.at(-1)!;
  assert.equal(m.key, 'claude:p');
  assert.equal(m.text, `[Reply from the child session "Count words" (${kid}, Custom · Qwen3 Coder)]\n\n| Chapter | Words |\n| 1 | 1200 |`);
  const n = sessions.delivered.length;
  await reportTurn(deps, { key: kid, startedAt: Date.now() - 1000, external: false });
  assert.equal(sessions.delivered.length, n);
  // Not a child, or run outside the app: nothing to report.
  await reportTurn(deps, { key: 'claude:p', startedAt: 0, external: false });
  assert.equal(sessions.delivered.length, n);
});

test('a turn that ended while the app was down is reported once it starts, and only once', async () => {
  const f = sessions.all.get(kid)!;
  f.items.push(user('Message from the session that started you:\n\nCount the appendix too.'), said('The appendix has 300 words.'), end());
  const n = sessions.delivered.length;
  await catchUp(deps);
  assert.equal(sessions.delivered.length, n + 1);
  assert.match(sessions.delivered.at(-1)!.text, /The appendix has 300 words\.$/);
  // Kept with the child: not again, by a turn's end or another start.
  await catchUp(deps);
  await reportTurn(deps, { key: kid, startedAt: Date.now() - 1000, external: false });
  assert.equal(sessions.delivered.length, n + 1);
});

test('a long reply comes back as a summary, with the way to read it whole', async () => {
  const f = sessions.all.get(kid)!;
  f.items.push(user('Message from the session that started you:\n\nNow the appendix.'), said(`Appendix:\n${'word '.repeat(LONG_REPLY / 4)}`), end());
  await reportTurn(deps, { key: kid, startedAt: Date.now() - 1000, external: false });
  const m = sessions.delivered.at(-1)!.text;
  assert.match(m, /Its reply is long \([\d,]+ characters\), so here is a summary\. child_sessions with key "acp:child1" gives the whole of it; the user can open it at https:\/\/naget\.test\/s\/acp%3Achild1\./);
  assert.match(m, /SUMMARY: three files changed, tests pass\.$/);
  assert.match(asked.at(-1)!, /^Appendix:/);
});

test('stopped, failed, or no reply: the parent hears how it ended', () => {
  const base = { key: 'acp:x', title: 'T', label: 'Custom · M', link: 'L' };
  const t = (o: Partial<{ reply: string; status: string }>) => ({ items: [], files: [], commands: [], last: end(), reply: '', ...o });
  assert.equal(resultMessage({ ...base, turn: t({ status: 'interrupted', reply: 'half' }), stopped: 'its spending cap was reached' }), '[The child session "T" (acp:x, Custom · M) was stopped before it finished: its spending cap was reached. What it wrote is below.]\n\nhalf');
  assert.equal(resultMessage({ ...base, turn: t({ status: 'failed' }), error: 'model not found' }), '[The child session "T" (acp:x, Custom · M) stopped with an error: model not found]\n(It wrote no reply. child_sessions shows how it stands; the user can open it at L.)');
});

test('the parent’s conversation reads each kind of reply back as it was sent', () => {
  const base = { key: 'claude:x-1', title: 'Find "the" papers (2018)', label: 'Claude Code · claude-opus-5-5', link: 'https://naget.test/s/claude%3Ax-1' };
  const t = (o: Partial<{ reply: string; status: string }>) => ({ items: [], files: [], commands: [], last: end(), reply: '', ...o });
  const who = { title: base.title, key: base.key, label: base.label };
  assert.deepEqual(childReplyOf(resultMessage({ ...base, turn: t({ reply: '# Found\n\nTwelve papers.' }) })), { ...who, ended: 'replied', text: '# Found\n\nTwelve papers.' });
  assert.deepEqual(childReplyOf(resultMessage({ ...base, turn: t({ reply: 'x'.repeat(5000) }), summary: 'Twelve papers, two disputed.\n\nOne gap.' })), { ...who, ended: 'replied', summaryOf: 5000, text: 'Twelve papers, two disputed.\n\nOne gap.' });
  assert.deepEqual(childReplyOf(resultMessage({ ...base, turn: t({ status: 'interrupted', reply: 'half' }), stopped: 'its spending cap was reached' })), { ...who, ended: 'stopped', why: 'its spending cap was reached', text: 'half' });
  assert.deepEqual(childReplyOf(resultMessage({ ...base, turn: t({ status: 'interrupted' }) })), { ...who, ended: 'stopped', text: '' });
  assert.deepEqual(childReplyOf(resultMessage({ ...base, turn: t({ status: 'failed' }), error: 'model not found [404]' })), { ...who, ended: 'failed', why: 'model not found [404]', text: '' });
  // Anything else is a message like any other.
  assert.equal(childReplyOf('[Reply from me] hello'), null);
  assert.equal(childReplyOf('papers on latent sparse retrieval'), null);
});

test('a parent over its cap gets the reply in its queue instead', async () => {
  setSessionExtra(db, 'claude:p', { capUsd: 1 });
  db.prepare("insert into sessions (key, agent, id, path, model, tokens_in, tokens_out) values ('claude:p', 'claude', 'p', '/tmp/p', 'test-model', 200000, 0)").run();
  const f = sessions.all.get(kid)!;
  f.items.push(user('one more'), said('Done: 3 tables.'), end());
  const n = sessions.delivered.length;
  await reportTurn(deps, { key: kid, startedAt: Date.now() - 1000, external: false });
  assert.equal(sessions.delivered.length, n);
  assert.match(sessions.queued.at(-1)!.text, /Done: 3 tables\.$/);
  setSessionExtra(db, 'claude:p', { capUsd: null });
});

// ---- steering ---------------------------------------------------------------------------------------

test('message_child: only one’s own children; queued while it works', async () => {
  await assert.rejects(call('claude:p', 'message_child', { key: 'codex:q', text: 'hi' }), /not one of your child sessions/);
  sessions.all.get(kid)!.live = 'idle';
  assert.match(await call('claude:p', 'message_child', { key: kid, text: 'Add a total row.' }), /^Sent\./);
  assert.equal(sessions.delivered.at(-1)!.text, 'Message from the session that started you:\n\nAdd a total row.');
  sessions.all.get(kid)!.live = 'working';
  assert.match(await call('claude:p', 'message_child', { key: kid, text: 'And a chart.' }), /^Queued:/);
});

test('child_sessions: each child’s state, and one’s whole latest reply', async () => {
  const list = await call('claude:p', 'child_sessions', {});
  assert.match(list, /- acp:child1 · "Count words" · Custom · openrouter\/qwen\/qwen3-coder · working · last active just now · spent \$0\.00/);
  assert.match(list, /latest reply: Done: 3 tables\./);
  assert.match(list, /- claude:child2 · "Proofread chapter 2\." · claude · sonnet · working/);
  assert.equal(await call('claude:p', 'child_sessions', { key: kid }), `Latest reply of ${kid}:\n\nDone: 3 tables.`);
  await assert.rejects(call('claude:p', 'child_sessions', { key: 'codex:q' }), /not one of your child sessions/);
});

test('the setting: how many at once', async () => {
  const routes = new Map<string, (req: any) => Promise<any>>();
  children.routes!({ ...deps, app: { get: (p: string, h: any) => routes.set(`GET ${p}`, h), put: (p: string, h: any) => routes.set(`PUT ${p}`, h) } } as unknown as Deps);
  assert.deepEqual(await routes.get('GET /api/children/settings')!({}), { maxRunning: 4, swarmSize: 5 });
  assert.deepEqual(await routes.get('PUT /api/children/settings')!({ body: { maxRunning: 6 } }), { maxRunning: 6, swarmSize: 5 });
  await assert.rejects(routes.get('PUT /api/children/settings')!({ body: { maxRunning: 0 } }), (e: unknown) => e instanceof HttpError && e.status === 400);
});

// ---- named agents and tiers ---------------------------------------------------------------------------

const leadKey = (n: string) => {
  const key = `claude:lead-${n}`;
  sessions.add(key, { agent: 'claude', live: 'working', mode: 'acceptEdits', title: 'Lead', items: [user('Ship the release')] });
  return key;
};

test('a tier picks the child’s model for its program: Claude Code’s own names by default, Custom’s as set', async () => {
  const k = leadKey('t1');
  const out = await call(k, 'start_child_session', { brief: 'List the commits since the last release.', tier: 'quick' });
  let o = sessions.created.at(-1)!;
  assert.equal(o.agent, 'claude');
  assert.equal(o.model, 'haiku');
  assert.match(out, /Quick/);
  const d = notesOf(db, k, 'child').at(-1)!.data as ChildNote;
  assert.equal(d.tier, 'quick');
  // A model named wins over the tier.
  await call(k, 'start_child_session', { brief: 'Same, on Opus.', tier: 'quick', model: 'opus' });
  assert.equal(sessions.created.at(-1)!.model, 'opus');
  // Custom: its tiers name its own models; a model that is gone is passed over (the named one is needed then).
  setTiers(db, { console: { quick: { model: 'ollama/llama3' } } });
  await call(k, 'start_child_session', { brief: 'Sort these lines.', agent: 'custom', tier: 'quick' });
  o = sessions.created.at(-1)!;
  assert.equal(o.acpAgent, 'console');
  assert.equal(o.model, 'ollama/llama3');
  setTiers(db, { console: { quick: { model: 'ollama/gone' } } });
  await assert.rejects(call(k, 'start_child_session', { brief: 'Sort these lines.', agent: 'custom', tier: 'quick' }), /Name the model for Custom/);
  setTiers(db, null);
});

test('an agent’s highest tier for helpers: asked for above it, or none asked, the child gets that tier', async () => {
  const boss = saveAssistant(db, { name: 'Release boss', instructions: 'Ship it.', helperMax: 'standard' });
  const k = leadKey('t2');
  setSessionExtra(db, k, { assistant: boss.id });
  await call(k, 'start_child_session', { brief: 'Plan the whole migration.', tier: 'best' });
  assert.equal(sessions.created.at(-1)!.model, 'sonnet');
  await call(k, 'start_child_session', { brief: 'Count the files.' });
  assert.equal(sessions.created.at(-1)!.model, 'sonnet');
  await call(k, 'start_child_session', { brief: 'Count the lines.', tier: 'quick' });
  assert.equal(sessions.created.at(-1)!.model, 'haiku');
  // The tool says so, and offers no tier above it.
  const t = tool(k, 'start_child_session');
  assert.match(t.description, /A child never thinks with a tier above standard\./);
  assert.deepEqual((t.inputSchema as any).properties.tier.enum, ['quick', 'standard']);
});

// ---- the team: a lead on Best or Max, helpers on cheaper tiers -----------------------------------------

/** A lead that thinks with a model of its own. */
const leadOn = (n: string, model: string | undefined, agent: Agent = 'claude') => {
  const key = `${agent}:team-${n}`;
  sessions.add(key, { agent, model, live: 'working', mode: agent === 'claude' ? 'acceptEdits' : 'auto', title: 'Lead', items: [user('Ship the release')] });
  return key;
};
const spawnOf = (o: { agent?: Agent; acpAgent?: string; key?: string; model?: string; extra?: Record<string, unknown> }) =>
  children.spawn!({ agent: o.agent ?? 'claude', acpAgent: o.acpAgent, key: o.key, cwd: tmp, runId: 'r', resume: false, extra: o.extra ?? {}, model: o.model }, deps) as { instructions: string[] } | undefined;

test('in a team a child asked for with no tier gets Standard; with the team off, its program’s own model', async () => {
  const k = leadOn('a', undefined);
  await call(k, 'start_child_session', { brief: 'Add the --json flag to the export command as specified.' });
  assert.equal(sessions.created.at(-1)!.model, 'sonnet');
  assert.equal((notesOf(db, k, 'child').at(-1)!.data as ChildNote).tier, 'standard');
  assert.match(tool(k, 'start_child_session').description, /With no tier a child gets standard\./);
  // A model named for it is used as named, with no tier.
  await call(k, 'start_child_session', { brief: 'Same, on Opus.', model: 'opus' });
  assert.equal(sessions.created.at(-1)!.model, 'opus');
  assert.equal((notesOf(db, k, 'child').at(-1)!.data as ChildNote).tier, undefined);
  setTeam(db, { on: false });
  await call(k, 'start_child_session', { brief: 'Add the --csv flag too.' });
  assert.equal(sessions.created.at(-1)!.model, undefined);
  assert.doesNotMatch(tool(k, 'start_child_session').description, /With no tier/);
  setTeam(db, { on: true });
  // A tier that says nothing for the child's program is no tier: Custom before its tiers are set runs its lead's model, with nothing to step up to.
  const custom = 'acp:team-custom';
  sessions.add(custom, { agent: 'acp', acpAgent: 'console', model: 'ollama/llama3', live: 'working', mode: 'edits', title: 'Custom lead', items: [user('Sort the files')] });
  await call(custom, 'start_child_session', { brief: 'Sort the lines of every file in data/.' });
  assert.equal(sessions.created.at(-1)!.model, 'ollama/llama3');
  assert.equal((notesOf(db, custom, 'child').at(-1)!.data as ChildNote).tier, undefined);
  assert.equal(sessionExtra(db, newest()).stepUp, undefined);
});

test('a helper never thinks with a tier above its lead’s own: Sonnet leads Standard at most, Max may hand out max', async () => {
  // A lead on Sonnet: best is not offered, and asked for it gives Standard.
  const low = leadOn('b', 'sonnet');
  assert.deepEqual((tool(low, 'start_child_session').inputSchema as any).properties.tier.enum, ['quick', 'standard']);
  await call(low, 'start_child_session', { brief: 'Design the whole thing.', tier: 'best' });
  assert.equal(sessions.created.at(-1)!.model, 'sonnet');
  // A lead on Opus (or its program's default, or a model the tiers do not know): up to Best.
  for (const model of [undefined, 'opus', 'claude-opus-5-5', 'mystery-9']) {
    const k = leadOn(`c-${model}`, model);
    assert.deepEqual((tool(k, 'start_child_session').inputSchema as any).properties.tier.enum, ['quick', 'standard', 'best'], String(model));
    await call(k, 'start_child_session', { brief: 'The hardest part.', tier: 'max' });
    assert.equal(sessions.created.at(-1)!.model, 'opus', String(model));
  }
  // A lead on Max: every tier, and its helpers step up by themselves no higher than Best.
  const top = leadOn('d', 'fable');
  assert.deepEqual((tool(top, 'start_child_session').inputSchema as any).properties.tier.enum, ['quick', 'standard', 'best', 'max']);
  assert.match(tool(top, 'start_child_session').description, /or max \(only the hardest part of a hard problem\)/);
  await call(top, 'start_child_session', { brief: 'Find the invariant.', tier: 'max' });
  assert.equal(sessions.created.at(-1)!.model, 'fable');
  assert.equal(sessionExtra(db, newest()).stepUp, undefined, 'nothing above Max');
  await call(top, 'start_child_session', { brief: 'Check the base case.', tier: 'best', title: 'Base case' });
  const best = newest();
  assert.deepEqual({ tier: (sessionExtra(db, best).stepUp as any).tier, max: (sessionExtra(db, best).stepUp as any).max }, { tier: 'best', max: 'max' });
  verdict = '{"pass": false, "why": "it proves the wrong claim"}';
  finish(best, 'Proved something else.');
  const n = sessions.created.length;
  await reportTurn(deps, { key: best, startedAt: Date.now() - 1000, external: false });
  assert.equal(sessions.created.length, n, 'a failed check does not put a helper on Max by itself');
  verdict = '{"pass": true, "why": "it does the job"}';
  // Its lead may: step_up_child runs it again on Max.
  assert.match(await call(top, 'step_up_child', { key: best, why: 'it proves the wrong claim' }), /It runs again on Max/);
  assert.equal(sessions.created.at(-1)!.model, 'fable');
});

test('what a session’s main agent is told: to lead helpers on cheaper tiers, in the same words each time', () => {
  const told = spawnOf({ extra: { auto: true } })!.instructions;
  assert.equal(told.length, 1);
  assert.match(told[0], /^# Working with helpers\nYou are this session’s main agent/);
  assert.match(told[0], /^- Sort the work before you start on it/m);
  assert.match(told[0], /^- Hand over the doing, keep the deciding\./m);
  assert.match(told[0], /^- quick, for a job specified so exactly/m);
  assert.match(told[0], /^- standard, for a clear part/m);
  assert.match(told[0], /You answer for what helpers hand back/);
  // With no prices known, what helpers cost is said in words alone.
  assert.match(told[0], /one on quick costs a small fraction of what you do, one on standard clearly less than you\./);
  // Claude Code's own Agent tool gets the tiers' models by its names for them; it may step itself up.
  assert.match(told[0], /Your own Agent tool, for a part of a few minutes: .* each with model "haiku" for a quick part and model "sonnet" for a standard one \(with no model it runs on yours and saves nothing\)/);
  assert.match(told[0], /start_child_session, for a long part/);
  assert.match(told[0], /call step_up_session/);
  assert.equal(told[0], teamInstructions({ native: { standard: 'sonnet', quick: 'haiku' }, stepUp: true }));
  // The same for a lead on Opus, on Max, and on a model the tiers do not know.
  for (const model of ['opus', 'fable', 'mystery-9']) assert.deepEqual(spawnOf({ model, extra: { auto: true } })!.instructions, told, model);
  // A session whose model was picked by name leads helpers too, but stays on its model: no word of stepping up.
  assert.equal(spawnOf({ model: 'opus' })!.instructions[0], teamInstructions({ native: { standard: 'sonnet', quick: 'haiku' } }));
  // Codex has no Agent tool of its own; before it lists its models its tiers differ by effort alone.
  const codex = spawnOf({ agent: 'codex' })!.instructions[0];
  assert.doesNotMatch(codex, /Agent tool/);
  assert.match(codex, /^- Start parts that do not depend on each other together with start_child_session, then end your turn/m);
  // What a helper costs beside its lead, from the prices: a fortieth, a half, nothing for a model on this computer.
  assert.equal(costWords(0.025), 'about 1/40 of what you do');
  assert.equal(costWords(0.0125), 'about 1/80 of what you do');
  assert.equal(costWords(0.1), 'about 1/10 of what you do');
  assert.equal(costWords(0.25), 'about a quarter of what you do');
  assert.equal(costWords(0.5), 'about half of what you do');
  assert.equal(costWords(1), 'about what you do');
  assert.equal(costWords(0), 'nothing');
  setPriceOverrides(db, { 'test-model': { input: 10, output: 30 }, opus: { input: 4, output: 20 }, sonnet: { input: 2, output: 10 }, haiku: { input: 0.1, output: 0.5 } });
  assert.match(spawnOf({ model: 'opus' })!.instructions[0], /one on quick costs about 1\/40 of what you do, one on standard about half of what you do\./);
  setPriceOverrides(db, { 'test-model': { input: 10, output: 30 } });
  // A Quick model that Claude Code's Agent tool has no name for is left out of that line.
  setTiers(db, { claude: { quick: { model: 'claude-3-mini' } } });
  assert.match(spawnOf({})!.instructions[0], /each with model "sonnet" for a standard one \(with no model/);
  setTiers(db, null);
  // Not told: a main agent on a cheaper tier itself, a swarm's lead, an app's run, a question on Help, a confidential
  // session, a program without tiers, Custom before its tiers are set, and the team turned off.
  assert.equal(spawnOf({ model: 'sonnet' }), undefined);
  assert.equal(spawnOf({ model: 'haiku' }), undefined);
  assert.equal(spawnOf({ extra: { swarm: true } }), undefined);
  assert.equal(spawnOf({ extra: { swarm: 'campaign' } }), undefined);
  assert.equal(spawnOf({ extra: { app: { run: 'r1' } } }), undefined);
  assert.equal(spawnOf({ extra: { help: true } }), undefined);
  assert.equal(spawnOf({ extra: { confidential: true } }), undefined);
  assert.equal(spawnOf({ agent: 'acp', acpAgent: 'gemini' }), undefined);
  assert.equal(spawnOf({ agent: 'acp', acpAgent: 'console' }), undefined);
  setTiers(db, { console: { standard: { model: 'ollama/llama3' } } });
  assert.match(spawnOf({ agent: 'acp', acpAgent: 'console' })!.instructions[0], /^# Working with helpers/);
  setTiers(db, null);
  setTeam(db, { on: false });
  assert.equal(spawnOf({}), undefined);
  setTeam(db, { on: true, hard: false });
  assert.doesNotMatch(spawnOf({ extra: { auto: true } })!.instructions[0], /step_up_session/);
  setTeam(db, { hard: true });
  // An agent of the user's that names its own tier stays on it: no step up for it.
  const fixed = saveAssistant(db, { name: 'Fixed tier', instructions: 'Work.', tier: 'best' });
  assert.doesNotMatch(spawnOf({ extra: { assistant: fixed.id, auto: true } })!.instructions[0], /step_up_session/);
});

test('step_up_session: on Automatic the main agent carries on with Max when its problem proves hard; not twice, not when turned off', async () => {
  // A session whose model was picked by name stays on it.
  assert.equal(children.tools!(ctxOf(leadOn('e0', 'opus'))).some((t) => t.name === 'step_up_session'), false);
  /** A lead that started on Automatic. */
  const autoOn = (n: string, model: string, agent: Agent = 'claude') => {
    const key = leadOn(n, model, agent);
    setSessionExtra(db, key, { auto: true });
    return key;
  };
  const k = autoOn('e', 'opus');
  assert.ok(children.tools!(ctxOf(k)).some((t) => t.name === 'step_up_session'));
  const out = await call(k, 'step_up_session', { why: 'the deadlock survives two fixes' });
  assert.match(out, /^You now think with fable\. Carry on from where you are\.$/);
  assert.deepEqual(sessions.moved.at(-1), { key: k, tier: 'max', pick: { model: 'fable' }, why: { event: 'stepUp', why: 'the deadlock survives two fixes' } });
  // On Max now: the tool is gone, and a call that still comes says so.
  assert.equal(children.tools!(ctxOf(k)).some((t) => t.name === 'step_up_session'), false);
  const again = autoOn('f', 'opus');
  const stale = tool(again, 'step_up_session');
  sessions.all.get(again)!.model = 'fable';
  await assert.rejects(stale.run({ why: 'x' }, ctxOf(again)), /strongest model already/);
  // Codex takes a new model with its next turn: it is told to end this one, and is woken to carry on.
  setTiers(db, { codex: { best: { model: 'gpt-6.1-sol', effort: 'high' }, max: { model: 'gpt-6.2-astra', effort: 'high' } } });
  const cx = autoOn('g', 'gpt-6.1-sol', 'codex');
  const n = sessions.delivered.length;
  assert.match(await call(cx, 'step_up_session', { why: 'no cause found' }), /From your next turn you think with gpt-6\.2-astra\. End this turn now/);
  assert.match(sessions.delivered[n].text, /^\[You now think with gpt-6\.2-astra\. Carry on with the task from where you stopped\.\]$/);
  assert.equal(sessions.delivered[n].key, cx);
  setTiers(db, null);
  // Not offered: to a child, to an agent with a tier of its own, with Max for hard problems off, or where Max is Best.
  assert.equal(children.tools!(ctxOf('acp:child1')).length, 0);
  const fixed = saveAssistant(db, { name: 'Fixed tier 2', instructions: 'Work.', tier: 'best' });
  const own = autoOn('h', 'opus');
  setSessionExtra(db, own, { assistant: fixed.id });
  assert.equal(children.tools!(ctxOf(own)).some((t) => t.name === 'step_up_session'), false);
  setTeam(db, { hard: false });
  const off = autoOn('i', 'opus');
  assert.equal(children.tools!(ctxOf(off)).some((t) => t.name === 'step_up_session'), false);
  setTeam(db, { hard: true });
  setTiers(db, { claude: { max: { model: 'opus' } } });
  assert.equal(children.tools!(ctxOf(autoOn('j', 'opus'))).some((t) => t.name === 'step_up_session'), false);
  setTiers(db, null);
});

test('as: one of the user’s agents works the part, with its own settings and tier; only where it works, and when allowed', async () => {
  const translator = saveAssistant(db, {
    name: 'Translator',
    description: 'Translates the guide',
    instructions: 'Translate into Chinese and Greek.',
    tier: 'quick',
    tools: ['read', 'edit'],
    connections: ['deepl'],
    mode: 'ask',
  });
  // A session as no agent of yours (or a built-in one) may ask any agent.
  const k = leadKey('t3');
  assert.match(tool(k, 'start_child_session').description, /Translator \(Translates the guide; Quick\)/);
  const out = await call(k, 'start_child_session', { brief: 'Translate docs/guide/05-agents.md.', as: 'translator' });
  const o = sessions.created.at(-1)!;
  assert.equal(o.model, 'haiku');
  // Its own mode, stricter than the parent's.
  assert.equal(o.mode, 'default');
  assert.deepEqual({ ...o.extra, stepUp: undefined }, { parent: k, assistant: translator.id, connections: { deepl: true }, stepUp: undefined });
  assert.equal((o.extra?.stepUp as { tier: string }).tier, 'quick');
  assert.match(out, /Translator · Claude Code · haiku · Quick/);
  const d = notesOf(db, k, 'child').at(-1)!.data as ChildNote;
  assert.equal(d.as, 'Translator');
  assert.equal(d.asId, translator.id);
  // An agent of yours asks only those it lists.
  const lone = saveAssistant(db, { name: 'Lone', instructions: 'Work alone.' });
  const k2 = leadKey('t4');
  setSessionExtra(db, k2, { assistant: lone.id });
  assert.doesNotMatch(tool(k2, 'start_child_session').description, /Translator/);
  await assert.rejects(call(k2, 'start_child_session', { brief: 'Translate.', as: 'Translator' }), /Lone may not hand work to Translator/);
  saveAssistant(db, { ...lone, canAsk: [translator.id] });
  await call(k2, 'start_child_session', { brief: 'Translate.', as: 'Translator' });
  assert.equal(sessions.created.at(-1)!.extra?.assistant, translator.id);
  // One that takes no work from other agents, one that works only in its projects, one that is not there.
  saveAssistant(db, { ...translator, askable: false });
  await assert.rejects(call(k, 'start_child_session', { brief: 'Translate.', as: 'Translator' }), /does not take work from other agents/);
  saveAssistant(db, { ...translator, projects: ['sp-hydor'] });
  await assert.rejects(call(k, 'start_child_session', { brief: 'Translate.', as: 'Translator' }), /works only in its own projects/);
  setSessionExtra(db, k, { space: 'sp-hydor' });
  await call(k, 'start_child_session', { brief: 'Translate.', as: 'Translator' });
  assert.equal(sessions.created.at(-1)!.extra?.assistant, translator.id);
  await assert.rejects(call(k, 'start_child_session', { brief: 'Translate.', as: 'Nobody' }), /no agent "Nobody"/);
});

// ---- stepping up ---------------------------------------------------------------------------------

/** A child's turn as it ends: what it was asked, then its reply (or an error). */
const finish = (key: string, reply: string, status = 'completed') => {
  const f = sessions.all.get(key)!;
  f.live = 'idle';
  f.items.push(user('Message from the session that started you:\n\nAgain.'), ...(reply ? [said(reply)] : []), end(status));
};
const newest = () => `${sessions.created.at(-1)!.agent}:child${sessions.created.length}`;

test('a helper on a tier that fails the check runs again one tier up, up to Best; then its reply goes as it is', async () => {
  const k = leadKey('s1');
  await call(k, 'start_child_session', { brief: 'Find the bug in parser.ts and fix it.', tier: 'quick', title: 'Fix the parser' });
  const first = newest();
  assert.equal(sessions.created.at(-1)!.model, 'haiku');
  assert.equal((sessionExtra(db, first).stepUp as { tier: string }).tier, 'quick');
  verdict = '{"pass": false, "why": "it gave up without fixing anything"}';
  finish(first, 'I could not find the bug.');
  await reportTurn(deps, { key: first, startedAt: Date.now() - 1000, external: false });
  const second = newest();
  assert.notEqual(second, first);
  assert.equal(sessions.created.at(-1)!.model, 'sonnet');
  assert.match(sessions.created.at(-1)!.prompt!, /^Find the bug in parser\.ts and fix it\.\n\n\(A try on Quick fell short: it gave up without fixing anything\./);
  assert.match(sessions.delivered.at(-1)!.text, /on Quick fell short: it gave up without fixing anything\. It runs again on Standard\.\]\nStarted child session/);
  const note = notesOf(db, k, 'child').at(-1)!.data as ChildNote;
  assert.deepEqual(note.steppedFrom, { key: first, tier: 'quick', why: 'it gave up without fixing anything' });
  assert.equal(note.tier, 'standard');
  // Standard falls short too: Best. Best falls short: nothing above it, so its reply goes back.
  finish(second, 'Still nothing.');
  await reportTurn(deps, { key: second, startedAt: Date.now() - 1000, external: false });
  const third = newest();
  assert.equal(sessions.created.at(-1)!.model, 'opus');
  assert.equal(sessionExtra(db, third).stepUp, undefined);
  const n = sessions.created.length;
  finish(third, 'Fixed it: the loop was off by one.');
  await reportTurn(deps, { key: third, startedAt: Date.now() - 1000, external: false });
  assert.equal(sessions.created.length, n);
  assert.match(sessions.delivered.at(-1)!.text, /Fixed it: the loop was off by one\.$/);
  verdict = '{"pass": true, "why": "it does the job"}';
});

test('stepping up: an error steps up without asking; a reply that passes goes back; never above the lead’s highest, nor when its agent says no', async () => {
  const k = leadKey('s2');
  await call(k, 'start_child_session', { brief: 'Translate the README.', tier: 'quick' });
  const a = newest();
  finish(a, '', 'failed');
  await reportTurn(deps, { key: a, startedAt: Date.now() - 1000, external: false });
  assert.equal(sessions.created.at(-1)!.model, 'sonnet');
  const b = newest();
  finish(b, 'Done: README.zh.md and README.el.md.');
  const n = sessions.created.length;
  await reportTurn(deps, { key: b, startedAt: Date.now() - 1000, external: false });
  assert.equal(sessions.created.length, n);
  assert.match(sessions.delivered.at(-1)!.text, /README\.zh\.md/);
  // A lead whose agent lets helpers go no higher than Standard: a Standard helper never steps up.
  const capped = saveAssistant(db, { name: 'Capped lead', instructions: 'Lead.', helperMax: 'standard' });
  const k2 = leadKey('s3');
  setSessionExtra(db, k2, { assistant: capped.id });
  await call(k2, 'start_child_session', { brief: 'Sum up the logs.', tier: 'standard' });
  assert.equal(sessionExtra(db, newest()).stepUp, undefined);
  // A lead whose agent says no to stepping up: the reply goes back as it is.
  const steady = saveAssistant(db, { name: 'Steady lead', instructions: 'Lead.', stepUp: false });
  const k3 = leadKey('s4');
  setSessionExtra(db, k3, { assistant: steady.id });
  await call(k3, 'start_child_session', { brief: 'Sum up the logs.', tier: 'quick' });
  const c = newest();
  verdict = '{"pass": false, "why": "too short"}';
  finish(c, 'Logs: fine.');
  const m = sessions.created.length;
  await reportTurn(deps, { key: c, startedAt: Date.now() - 1000, external: false });
  assert.equal(sessions.created.length, m);
  verdict = '{"pass": true, "why": "it does the job"}';
});

test('only the reply to the brief is checked: a later turn, answering a message, never runs the whole job again', async () => {
  const k = leadKey('s9');
  await call(k, 'start_child_session', { brief: 'Write the comparison pages.', tier: 'standard', title: 'Pages' });
  const a = newest();
  finish(a, 'Done: four pages, each with its sources.');
  await reportTurn(deps, { key: a, startedAt: Date.now() - 1000, external: false });
  const n = sessions.created.length;
  // Asked afterwards to open one in a browser, it says only that: judged by the whole brief it would fail.
  verdict = '{"pass": false, "why": "it only opened a page"}';
  finish(a, 'I opened the overview in the browser and it loads.');
  await reportTurn(deps, { key: a, startedAt: Date.now() - 1000, external: false });
  assert.equal(sessions.created.length, n, 'no helper started again');
  assert.match(sessions.delivered.at(-1)!.text, /it loads\.$/);
  verdict = '{"pass": true, "why": "it does the job"}';
});

test('a helper its plan’s usage limit stopped is not run again a tier up: another account takes it over, or it waits', async () => {
  const k = leadKey('s6');
  await call(k, 'start_child_session', { brief: 'Write the six tasks.', tier: 'standard', title: 'Tasks' });
  const a = newest();
  // The session manager saw the limit end its turn.
  sessions.limited.add(a);
  finish(a, '', 'failed');
  const n = sessions.created.length;
  await reportTurn(deps, { key: a, startedAt: Date.now() - 1000, external: false });
  assert.equal(sessions.created.length, n);
  sessions.limited.delete(a);
  // Or the turn's own error says so (read back after a restart).
  await call(k, 'start_child_session', { brief: 'Write the six tasks again.', tier: 'quick', title: 'Tasks 2' });
  const b = newest();
  sessions.all.get(b)!.items.push(said('Half done.'), { kind: 'turn', id: 'lim-1', seq: 9999, status: 'failed' } as TimelineItem, { kind: 'system', id: 'lim-2', seq: 10000, level: 'error', text: 'You’ve hit your session limit · resets 9am (UTC)' } as TimelineItem);
  sessions.all.get(b)!.live = 'idle';
  const m = sessions.created.length;
  await reportTurn(deps, { key: b, startedAt: Date.now() - 1000, external: false });
  assert.equal(sessions.created.length, m);
});

test('step_up_child: the lead runs a finished helper’s brief again one tier up, saying why', async () => {
  const k = leadKey('s5');
  await call(k, 'start_child_session', { brief: 'Write the release notes.', tier: 'quick' });
  const a = newest();
  await assert.rejects(call(k, 'step_up_child', { key: a, why: 'too thin' }), /still working/);
  finish(a, 'Notes: things changed.');
  await reportTurn(deps, { key: a, startedAt: Date.now() - 1000, external: false });
  const out = await call(k, 'step_up_child', { key: a, why: 'too thin: name each change' });
  assert.match(out, /fell short: too thin: name each change\. It runs again on Standard/);
  assert.equal(sessions.created.at(-1)!.model, 'sonnet');
  await assert.rejects(call(k, 'step_up_child', { key: 'claude:nobody', why: 'x' }), /not one of your child sessions/);
});

test('as: an agent that keeps a conversation of its own takes the brief in its inbox; its answer comes back as a message', async () => {
  const keeper = saveAssistant(db, { name: 'Docs keeper', description: 'Keeps the guide current', instructions: 'Keep the guide current.', standing: true });
  const k = leadKey('s6');
  const out = await call(k, 'start_child_session', { brief: 'Update the guide for the new Agents page.', as: 'Docs keeper' });
  assert.match(out, /Put in Docs keeper's inbox/);
  await new Promise((r) => setTimeout(r, 50));
  const own = standingKey(db, keeper.id)!;
  assert.ok(own);
  // Its conversation was at work (as the fake makes every new session): the message waits, and goes in once it is free.
  assert.equal(inboxOf(db, keeper.id)[0].status, 'queued');
  sessions.all.get(own)!.live = 'idle';
  await pump(deps, keeper.id);
  assert.equal(sessionExtra(db, own).standing, keeper.id);
  assert.equal(sessionExtra(db, own).parent, undefined);
  const [item] = inboxOf(db, keeper.id);
  assert.equal(item.status, 'sent');
  const sent = sessions.delivered.at(-1)!;
  assert.equal(sent.key, own);
  assert.match(sent.text, new RegExp(`^From Lead \\(another agent\\) · inbox ${item.id.slice(0, 6)} · your reply goes back to it\\n\\nUpdate the guide`));
  // A second message waits its turn.
  await call(k, 'start_child_session', { brief: 'And the API topic.', as: 'Docs keeper' });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(inboxOf(db, keeper.id)[0].status, 'queued');
  // Its turn ends: the answer goes back to the lead, and the next message goes in.
  const f = sessions.all.get(own)!;
  f.live = 'idle';
  f.items.push(user(sent.text), said('Done: the Agents topic is updated.'), end());
  await inboxTurnEnded(deps, { key: own });
  const back = sessions.delivered.filter((x) => x.key === k).at(-1)!;
  assert.equal(back.text, '[Reply from Docs keeper, to the message you put in its inbox]\n\nDone: the Agents topic is updated.');
  const items = inboxOf(db, keeper.id);
  assert.equal(items[1].status, 'answered');
  assert.equal(items[1].reply, 'Done: the Agents topic is updated.');
  assert.equal(items[0].status, 'sent');
  assert.match(sessions.delivered.at(-1)!.text, /And the API topic\.$/);
});

// ---- running helpers: a lead is not done while its child sessions run ------------------------------------

/** The running-children map as plain arrays, for comparing. */
const running = (statuses: [string, string | undefined][]) => Object.fromEntries([...runningChildren(db, statuses)].map(([k, v]) => [k, [...v].sort()]));

test('running helpers: starting, working and waiting children count; idle, ended and errored ones do not', () => {
  setSessionExtra(db, 'claude:hl', {});
  for (const c of ['c1', 'c2', 'c3', 'c4', 'c5']) setSessionExtra(db, `claude:hl-${c}`, { parent: 'claude:hl' });
  assert.deepEqual(running([['claude:hl-c1', 'starting'], ['claude:hl-c2', 'working'], ['claude:hl-c3', 'waiting'], ['claude:hl-c4', 'idle'], ['claude:hl-c5', 'exited']]), { 'claude:hl': ['claude:hl-c1', 'claude:hl-c2', 'claude:hl-c3'] });
  // A child waiting for you is still running; one that errored is not.
  assert.deepEqual(running([['claude:hl-c3', 'waiting'], ['claude:hl-c1', 'error']]), { 'claude:hl': ['claude:hl-c3'] });
  assert.deepEqual(running([['claude:hl-c1', 'idle'], ['claude:hl-c3', 'exited'], ['claude:hl-c4', undefined]]), {});
  // The lead's own status does not matter: its process may have stopped between turns (it is not live at all).
  assert.deepEqual(running([['claude:hl-c2', 'working'], ['claude:hl', 'idle']]), { 'claude:hl': ['claude:hl-c2'] });
  // Every running one is among the lead's child sessions.
  for (const k of ['claude:hl-c1', 'claude:hl-c2', 'claude:hl-c3']) assert.ok(childKeys(db, 'claude:hl').includes(k));
});

test('running helpers: a child kept working by running children of its own counts, all the way up', () => {
  setSessionExtra(db, 'claude:g0', {});
  setSessionExtra(db, 'claude:g1', { parent: 'claude:g0' });
  setSessionExtra(db, 'claude:g2', { parent: 'claude:g1' });
  setSessionExtra(db, 'claude:g2b', { parent: 'claude:g1' });
  assert.deepEqual(ancestorsOf(db, 'claude:g2'), ['claude:g1', 'claude:g0']);
  // Only the grandchild runs, and its parent is idle: both above it are at work.
  assert.deepEqual(running([['claude:g2', 'working'], ['claude:g1', 'idle']]), { 'claude:g1': ['claude:g2'], 'claude:g0': ['claude:g1'] });
  // Two grandchildren: the middle one is still one child of the top one.
  assert.deepEqual(running([['claude:g2', 'waiting'], ['claude:g2b', 'starting']]), { 'claude:g1': ['claude:g2', 'claude:g2b'], 'claude:g0': ['claude:g1'] });
  // The middle child works itself and has a running child: counted once.
  assert.deepEqual(running([['claude:g1', 'working'], ['claude:g2', 'working']]), { 'claude:g1': ['claude:g2'], 'claude:g0': ['claude:g1'] });
  // Nothing below running: nothing above counts.
  assert.deepEqual(running([['claude:g0', 'working']]), {});
});

test('running helpers: a loop in who started whom ends, and a session is never its own helper', () => {
  setSessionExtra(db, 'claude:x1', { parent: 'claude:x2' });
  setSessionExtra(db, 'claude:x2', { parent: 'claude:x1' });
  setSessionExtra(db, 'claude:x3', { parent: 'claude:x3' });
  assert.deepEqual(ancestorsOf(db, 'claude:x1'), ['claude:x2']);
  assert.deepEqual(running([['claude:x1', 'working']]), { 'claude:x2': ['claude:x1'] });
  assert.deepEqual(running([['claude:x3', 'working']]), {});
});

// ---- stop all ----------------------------------------------------------------------------------------

test('stop all: what it stops below a session is its running children, theirs in turn, each once, after the one that started it', () => {
  setSessionExtra(db, 'claude:s0', {});
  setSessionExtra(db, 'claude:s1', { parent: 'claude:s0' });
  setSessionExtra(db, 'claude:s1b', { parent: 'claude:s0' });
  setSessionExtra(db, 'claude:s2', { parent: 'claude:s1' });
  // The middle child is idle, kept at work by its running child; the other child is done.
  const below = (st: [string, string][]) => runningBelow(runningChildren(db, st), 'claude:s0');
  assert.deepEqual(below([['claude:s2', 'working'], ['claude:s1', 'idle'], ['claude:s1b', 'idle']]), ['claude:s1', 'claude:s2']);
  assert.deepEqual(below([['claude:s1b', 'waiting'], ['claude:s2', 'starting']]), ['claude:s1b', 'claude:s1', 'claude:s2']);
  assert.deepEqual(below([['claude:s0', 'working']]), []);
  // A loop in who started whom ends, and the session itself is never in the list.
  setSessionExtra(db, 'claude:l1', { parent: 'claude:l2' });
  setSessionExtra(db, 'claude:l2', { parent: 'claude:l1' });
  assert.deepEqual(runningBelow(runningChildren(db, [['claude:l1', 'working'], ['claude:l2', 'working']]), 'claude:l1'), ['claude:l2']);
});

test('stop all: a child cut short with its parent is not reported back, and a report after the stop waits in the held queue', async () => {
  sessions.add('claude:sp', { agent: 'claude', live: 'idle', title: 'Stopped parent', items: [user('Go')] });
  sessions.add('claude:sc', { agent: 'claude', live: 'idle', title: 'Stopped child', items: [user('Do it'), said('Half of it.'), end('interrupted')] });
  setSessionExtra(db, 'claude:sc', { parent: 'claude:sp' });
  const started = Date.now() - 1000;
  const n = { delivered: sessions.delivered.length, queued: sessions.queued.length };
  // Stopped with its parent after its turn began: nothing is told.
  setSessionExtra(db, 'claude:sc', { stoppedWithParent: Date.now() });
  await reportTurn(deps, { key: 'claude:sc', startedAt: started, external: false });
  assert.equal(sessions.delivered.length, n.delivered);
  assert.equal(sessions.queued.length, n.queued);
  // Stopped before its turn began (an older stop): the turn is reported as any other.
  sessions.all.get('claude:sc')!.items.push(user('Again'), said('Part two.'), end('interrupted'));
  setSessionExtra(db, 'claude:sc', { stoppedWithParent: started - 5000 });
  await reportTurn(deps, { key: 'claude:sc', startedAt: started, external: false });
  assert.equal(sessions.delivered.length, n.delivered + 1);
  assert.match(sessions.delivered.at(-1)!.text, /was stopped before it finished/);
  // The parent was stopped after the turn began: even a finished turn's report waits, held, instead of waking it.
  sessions.all.get('claude:sc')!.items.push(user('Third'), said('All done.'), end());
  setSessionExtra(db, 'claude:sp', { stoppedAll: Date.now() });
  await reportTurn(deps, { key: 'claude:sc', startedAt: started, external: false });
  assert.equal(sessions.delivered.length, n.delivered + 1);
  assert.equal(sessions.queued.length, n.queued + 1);
  assert.match(sessions.queued.at(-1)!.text, /All done\.$/);
  assert.equal(sessions.queuedHeld.at(-1), true);
  // A turn that began after the stop reports as usual.
  sessions.all.get('claude:sc')!.items.push(user('Fourth'), said('Later.'), end());
  await reportTurn(deps, { key: 'claude:sc', startedAt: Date.now() + 1000, external: false });
  assert.equal(sessions.delivered.length, n.delivered + 2);
  assert.match(sessions.delivered.at(-1)!.text, /Later\.$/);
});

// ---- run ---------------------------------------------------------------------------------------------

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
console.log(`${passed}/${tests.length} passed`);
srv.close();
fs.rmSync(tmp, { recursive: true, force: true });
