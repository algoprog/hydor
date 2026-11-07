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
import { setTiers } from '../assistants/tiers.ts';
import { inboxOf, inboxTurnEnded, pump, standingKey } from '../assistants/inbox.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { catchUp, CHILD_INSTRUCTIONS, children, findModel, LONG_REPLY, reportTurn, resultMessage } from './index.ts';
import { childKeys, parentOf } from './family.ts';
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
  enqueue(key: string, text: string) {
    this.queued.push({ key, text });
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
  // Custom's Full access still asks before risky commands: freer than Auto, not as free as never asking.
  assert.equal(childMode({ family: 'custom', mode: 'full' }, 'claude'), 'auto');
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
  assert.equal(children.spawn!({ agent: 'claude', cwd: tmp, runId: 'r', resume: false, extra: {} }, deps), undefined);
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
  // The tool says so.
  assert.match(tool(k, 'start_child_session').description, /no higher than standard/);
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
