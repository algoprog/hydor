// Checks for spending caps: what a transcript costs (the agent's own figure, tokens at a price, local
// models free), a session's spending with its children's, the caps (its own and its parent's), beforeSend,
// stopping a running turn with a note, the routes, capExtra for scheduled tasks, and Custom's costs: the
// usage chat() reads, and the usage_update lines the ACP parser turns into tokens and dollars.
// Build and run with a scratch data folder (PRICES_URL= keeps the price table offline):
//   OUTDIR=dist/dev node scripts/build-server.mjs server/budget/budget-test.ts
//   DATA_DIR=/tmp/hydor-test-budget PRICES_URL= node dist/dev/budget-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { parseCap, type BudgetNote, type BudgetState } from '../../shared/budget.ts';
import type { AgentModel, LiveState, SessionSummary, TimelineItem } from '../../shared/types.ts';
import { chat } from '../agent/llm.ts';
import { AcpLive } from '../agents/acp.ts';
import { ClaudeLive } from '../agents/claude.ts';
import { CodexLive } from '../agents/codex.ts';
import type { ModelCall } from '../agents/live.ts';
import { HttpError } from '../auth.ts';
import { openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { AcpParser } from '../history/acp.ts';
import { notesOf } from '../notes.ts';
import { rateFor, refreshOpenRouterPrices, setPriceOverrides } from '../prices.ts';
import { setSessionExtra } from '../sessionExtra.ts';
import { budget, capExtra, checkBudget } from './index.ts';
import { budgetState, capReached, childShare, ownSpend, rowCost, spending } from './spend.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/') || process.env.PRICES_URL !== '') {
  console.error('Run with DATA_DIR=/tmp/… and PRICES_URL= (empty) so nothing touches real data or the network.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-budget-test-'));
const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

// ---- fixtures ------------------------------------------------------------------------------------

setPriceOverrides(db, { 'test-model': { input: 10, output: 30, cacheRead: 1 }, 'gpt-test': { input: 2, output: 8 } });

/** A transcript as the indexer leaves it. */
function indexed(key: string, o: { agent?: string; model?: string; tin?: number; tout?: number; tcached?: number; cost?: number | null; parent?: string }) {
  db.prepare(
    `insert or replace into sessions (key, agent, id, path, model, tokens_in, tokens_out, tokens_cached, cost_usd, parent_key, hidden)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(key, o.agent ?? key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1), `/tmp/${key}`, o.model ?? null, o.tin ?? 0, o.tout ?? 0, o.tcached ?? 0, o.cost ?? null, o.parent ?? null, o.parent ? 1 : 0);
}
function appSession(key: string, extra: Record<string, unknown> = {}) {
  db.prepare('insert or ignore into app_sessions (key, agent, created_at, updated_at) values (?, ?, ?, ?)').run(key, key.slice(0, key.indexOf(':')), Date.now(), Date.now());
  setSessionExtra(db, key, extra);
}

/** The session manager, as much as the budget uses of it. */
class Sessions extends EventEmitter {
  lives = new Map<string, { adapter: { state: LiveState } }>();
  items = new Map<string, TimelineItem[]>();
  interrupted: string[] = [];
  resumed: string[] = [];
  held = new Set<string>();
  summary(key: string): SessionSummary | null {
    const l = this.lives.get(key);
    const extra = (db.prepare('select extra from app_sessions where key = ?').get(key) as { extra: string } | undefined)?.extra;
    return { key, agent: 'claude', id: key, title: `Title of ${key}`, stats: {} as any, live: l ? { ...l.adapter.state } : null, extra: extra ? JSON.parse(extra) : undefined, queueHeld: this.held.has(key) || undefined };
  }
  run(key: string, status: LiveState['status'] = 'working') {
    this.lives.set(key, { adapter: { state: { status, startedAt: Date.now(), turnStartedAt: Date.now(), pendingApprovals: 0 } } });
  }
  async interrupt(key: string) {
    this.interrupted.push(key);
    const l = this.lives.get(key);
    if (l) l.adapter.state.status = 'idle';
  }
  async timeline(key: string) {
    return { parser: { items: this.items.get(key) ?? [] }, readMore: async () => {} };
  }
  queueSummary() {}
  resumeQueue(key: string) {
    this.resumed.push(key);
  }
}

const routes = new Map<string, (req: any) => Promise<any>>();
const fakeApp = Object.fromEntries(['get', 'put', 'post', 'patch', 'delete'].map((m) => [m, (p: string, h: any) => routes.set(`${m.toUpperCase()} ${p}`, h)]));
const sessions = new Sessions();
const told: { key: string; data: any }[] = [];
const toasts: string[] = [];
const deps = {
  app: fakeApp,
  db,
  sessions,
  broadcast: (e: any) => e.t === 'toast' && toasts.push(e.text),
  toSubscribers: (key: string, e: any) => told.push({ key, data: e.data }),
  publicBase: () => 'http://127.0.0.1:1',
} as unknown as Deps;
budget.routes!(deps);

// ---- what transcripts cost --------------------------------------------------------------------------

test('a transcript costs the agent’s own figure, else its tokens at the model’s price', () => {
  assert.equal(rowCost(db, { agent: 'claude', model: 'test-model', tokens_in: 1e6, tokens_out: 0, tokens_cached: 0, cost_usd: 0.5, parent_key: null }), 0.5);
  // 1M in at $10, 1M cached at $1, 0.1M out at $30.
  assert.equal(rowCost(db, { agent: 'codex', model: 'test-model', tokens_in: 1e6, tokens_out: 1e5, tokens_cached: 1e6, cost_usd: null, parent_key: null }), 10 + 1 + 3);
  assert.equal(rowCost(db, { agent: 'codex', model: 'no-such-model', tokens_in: 10, tokens_out: 10, tokens_cached: 0, cost_usd: null, parent_key: null }), null);
  assert.equal(rowCost(db, { agent: 'codex', model: 'no-such-model', tokens_in: 0, tokens_out: 0, tokens_cached: 0, cost_usd: null, parent_key: null }), 0);
});

test('Custom: models on this machine are free; an endpoint’s model is priced by its own name', () => {
  assert.equal(rowCost(db, { agent: 'acp', model: 'ollama/qwen3:8b', tokens_in: 5e6, tokens_out: 1e6, tokens_cached: 0, cost_usd: null, parent_key: null }), 0);
  assert.equal(rowCost(db, { agent: 'acp', model: 'vllm/Qwen/Qwen3-8B', tokens_in: 5e6, tokens_out: 1e6, tokens_cached: 0, cost_usd: null, parent_key: null }), 0);
  assert.equal(rowCost(db, { agent: 'acp', model: 'endpoint/lab/gpt-test', tokens_in: 1e6, tokens_out: 1e6, tokens_cached: 0, cost_usd: null, parent_key: null }), 10);
  assert.equal(rowCost(db, { agent: 'acp', model: 'openrouter/x/y', tokens_in: 1e6, tokens_out: 0, tokens_cached: 0, cost_usd: 0.25, parent_key: null }), 0.25);
});

test('a session’s own spending includes its agent’s helpers; Claude’s own figure already covers them', () => {
  indexed('codex:t1', { model: 'test-model', tin: 1e5 });
  indexed('codex:t1-sub', { agent: 'codex', model: 'test-model', tin: 1e5, parent: 'codex:t1' });
  assert.equal(ownSpend(db, 'codex:t1').usd, 2);
  indexed('claude:c1', { model: 'test-model', cost: 3 });
  indexed('claude:c1-sub', { agent: 'claude', model: 'test-model', tin: 1e6, parent: 'claude:c1' });
  assert.equal(ownSpend(db, 'claude:c1').usd, 3);
  indexed('codex:t2', { model: 'mystery', tin: 100 });
  assert.equal(ownSpend(db, 'codex:t2').unpriced, true);
});

// ---- caps --------------------------------------------------------------------------------------------

test('parseCap and capExtra (for scheduled tasks)', () => {
  assert.deepEqual(parseCap('$12.345'), { cap: 12.35 });
  assert.deepEqual(parseCap(''), { cap: null });
  assert.deepEqual(parseCap(null), { cap: null });
  assert.equal(parseCap('abc'), null);
  assert.equal(parseCap(0), null);
  assert.equal(parseCap(-5), null);
  assert.deepEqual(capExtra('5'), { capUsd: 5 });
  assert.deepEqual(capExtra(undefined), {});
  assert.throws(() => capExtra('lots'), (e: unknown) => e instanceof HttpError && e.status === 400);
});

test('a parent’s spending counts its children; a child is covered by its parent’s cap', () => {
  appSession('claude:p1', { capUsd: 5 });
  indexed('claude:p1', { model: 'test-model', cost: 1 });
  appSession('acp:k1', { parent: 'claude:p1', capUsd: 1 });
  indexed('acp:k1', { model: 'openrouter/x/y', cost: 0.75 });
  appSession('acp:k2', { parent: 'claude:p1' });
  indexed('acp:k2', { model: 'ollama/llama3', tin: 1e6 });
  assert.deepEqual(spending(db, 'claude:p1'), { spentUsd: 1.75, ownUsd: 1, childrenUsd: 0.75, unpriced: false });
  assert.equal(capReached(db, 'claude:p1'), null);
  const st = budgetState(db, 'acp:k1', (k) => `T ${k}`);
  assert.equal(st.capUsd, 1);
  assert.equal(st.reached, false);
  assert.deepEqual(st.parent, { key: 'claude:p1', title: 'T claude:p1', capUsd: 5, spentUsd: 1.75, reached: false });
  // Each new child gets a share of what is left: (5 - 1.75) / (4 + 1).
  assert.equal(childShare(db, 'claude:p1', 4), 0.65);
  assert.equal(childShare(db, 'codex:t1', 4), undefined);
});

test('beforeSend refuses a session over its cap, and a child over its parent’s', async () => {
  indexed('acp:k1', { model: 'openrouter/x/y', cost: 1.2 });
  await assert.rejects(async () => budget.beforeSend!('acp:k1', deps), (e: unknown) => e instanceof HttpError && e.status === 402 && /\$1\.20 of its \$1\.00 spending cap/.test(e.message) && /Raise or clear/.test(e.message));
  await budget.beforeSend!('acp:k2', deps);
  indexed('claude:p1', { model: 'test-model', cost: 4 });
  await assert.rejects(async () => budget.beforeSend!('acp:k2', deps), (e: unknown) => e instanceof HttpError && /The session that started this one \("Title of claude:p1"\) has spent \$5\.20 of its \$5\.00/.test(e.message));
  assert.throws(() => childShare(db, 'claude:p1', 4), /nothing left for a child session/);
});

test('a running turn past the cap stops, once, with a note under it; the cap stops the family', async () => {
  sessions.items.set('claude:p1', [{ kind: 'user', id: 'u1', seq: 0, text: 'go' }, { kind: 'assistant', id: 'a1', seq: 1, text: 'working on it' }]);
  sessions.run('claude:p1');
  sessions.run('acp:k2');
  sessions.run('codex:t1'); // no cap: left alone
  await checkBudget(deps, 'acp:k2');
  assert.deepEqual(sessions.interrupted.sort(), ['acp:k2', 'claude:p1']);
  const [n] = notesOf(db, 'claude:p1', 'budget');
  assert.equal(n.anchor, 'a1');
  assert.deepEqual(n.data, { capUsd: 5, spentUsd: 5.2 } satisfies BudgetNote);
  const [k] = notesOf(db, 'acp:k2', 'budget');
  assert.deepEqual((k.data as BudgetNote).parent, { key: 'claude:p1', title: 'Title of claude:p1' });
  assert.ok(toasts.some((t) => /Stopped at its spending cap · Title of claude:p1/.test(t)));
  // The pages showing the parent heard where it stands.
  assert.ok(told.some((t) => t.key === 'claude:p1' && (t.data as BudgetState).reached));
  // Checked again in the same turn: no second stop or note.
  sessions.run('claude:p1');
  sessions.lives.get('claude:p1')!.adapter.state.turnStartedAt = (sessions.lives.get('acp:k2')!.adapter.state.turnStartedAt = 1);
  const before = notesOf(db, 'claude:p1', 'budget').length;
  await checkBudget(deps, 'claude:p1');
  await checkBudget(deps, 'claude:p1');
  assert.equal(notesOf(db, 'claude:p1', 'budget').length, before + 1);
  sessions.run('codex:t1');
  await checkBudget(deps, 'codex:t1');
  assert.ok(!sessions.interrupted.includes('codex:t1'));
});

test('the routes set, raise and clear a cap; a queue held by the cap goes on once it is raised', async () => {
  const put = routes.get('PUT /api/budget/:key')!;
  await assert.rejects(put({ params: { key: 'claude:p1' }, body: { capUsd: 'x' } }), /amount in dollars/);
  sessions.held.add('claude:p1');
  const st = (await put({ params: { key: 'claude:p1' }, body: { capUsd: 20 } })) as BudgetState;
  assert.equal(st.capUsd, 20);
  assert.equal(st.reached, false);
  assert.deepEqual(sessions.resumed, ['claude:p1']);
  const cleared = (await put({ params: { key: 'claude:p1' }, body: { capUsd: null } })) as BudgetState;
  assert.equal(cleared.capUsd, undefined);
  const got = (await routes.get('GET /api/budget/:key')!({ params: { key: 'acp:k1' } })) as BudgetState;
  assert.equal(got.reached, true);
});

// ---- after each model call ---------------------------------------------------------------------------

test('each model call counts at once: the turn stops right after the call that reaches the cap, before the indexer sees it', async () => {
  budget.start!(deps);
  appSession('claude:live1', { capUsd: 1 });
  indexed('claude:live1', { model: 'test-model', tin: 10_000 }); // $0.10 so far
  sessions.run('claude:live1');
  const call = (c: ModelCall) => sessions.emit('call', 'claude:live1', c);
  const tick = () => new Promise((r) => setTimeout(r, 20));
  call({ id: 'm1', model: 'test-model', tokens: { in: 30_000, cached: 0, out: 0 } });
  await tick();
  assert.ok(Math.abs(spending(db, 'claude:live1').spentUsd - 0.4) < 1e-9);
  // The same call again, with its output: it replaces what was said of it.
  call({ id: 'm1', model: 'test-model', tokens: { in: 30_000, cached: 0, out: 10_000 } });
  await tick();
  assert.ok(Math.abs(spending(db, 'claude:live1').spentUsd - 0.7) < 1e-9);
  assert.ok(!sessions.interrupted.includes('claude:live1'));
  call({ id: 'm2', model: 'test-model', tokens: { in: 20_000, cached: 0, out: 5_000 } });
  await tick();
  assert.ok(sessions.interrupted.includes('claude:live1'), 'stopped at once');
  const [n] = notesOf(db, 'claude:live1', 'budget');
  assert.ok(Math.abs((n.data as BudgetNote).spentUsd - 1.05) < 1e-9);
  await assert.rejects(Promise.resolve().then(() => budget.beforeSend!('claude:live1', deps)), /spent \$1\.05 of its \$1\.00/);
  // The indexer catches up: the same calls are not counted twice.
  indexed('claude:live1', { model: 'test-model', tin: 60_000, tout: 15_000 });
  assert.ok(Math.abs(spending(db, 'claude:live1').spentUsd - 1.05) < 1e-9);
  // A call's own figure (Custom's) is taken as it is.
  appSession('acp:live2', { capUsd: 0.5 });
  sessions.run('acp:live2');
  sessions.emit('call', 'acp:live2', { id: 'c1', model: 'openrouter/x', usd: 0.6, tokens: { in: 1, cached: 0, out: 1 } } satisfies ModelCall);
  await tick();
  assert.ok(sessions.interrupted.includes('acp:live2'));
  appSession('acp:uncapped', {});
  sessions.run('acp:uncapped');
  sessions.emit('call', 'acp:uncapped', { id: 'u1', model: 'openrouter/x', usd: 0.004, tokens: { in: 1, cached: 0, out: 1 } } satisfies ModelCall);
  await tick();
  assert.equal(spending(db, 'acp:uncapped').spentUsd, 0.004, 'OpenRouter usage updates even without a cap');
  assert.ok(!sessions.interrupted.includes('acp:uncapped'));
});

/** Lines from an agent's process, as its adapter reads them. */
class Lines extends EventEmitter {
  meta = { runId: 'run-calls' };
  writeLine() {}
  say(m: unknown, replay = false) {
    this.emit('line', JSON.stringify(m), replay);
  }
}

test('what each agent reports per call: Claude Code’s messages, Codex’s growing totals, an ACP agent’s running totals', () => {
  const got: ModelCall[] = [];
  const claudeLines = new Lines();
  const claude = new ClaudeLive(claudeLines as any, { cwd: tmp, sessionId: 's1' });
  claude.on('call', (c) => got.push(c));
  const msg = { type: 'assistant', message: { id: 'msg1', model: 'claude-x', content: [], usage: { input_tokens: 5, cache_creation_input_tokens: 10, cache_read_input_tokens: 100, output_tokens: 7 } } };
  claudeLines.say(msg);
  claudeLines.say({ ...msg, parent_tool_use_id: 'toolu_1', message: { ...msg.message, id: 'msg2' } });
  claudeLines.say({ ...msg, message: { ...msg.message, id: 'msg3' } }, true);
  assert.deepEqual(got as unknown[], [
    { id: 'msg1', model: 'claude-x', tokens: { in: 15, cached: 100, out: 7 } },
    { id: 'msg2', model: 'claude-x', tokens: { in: 15, cached: 100, out: 7 } },
  ]);
  got.length = 0;
  const codexLines = new Lines();
  const codex = new CodexLive(codexLines as any, { cwd: tmp, model: 'gpt-test' });
  codex.on('call', (c) => got.push(c));
  const usage = (total: object, last: object) => ({ method: 'thread/tokenUsage/updated', params: { tokenUsage: { total, last } } });
  // The first report in a process: the last call's own use (the totals may hold the whole thread's history).
  codexLines.say(usage({ inputTokens: 9000, cachedInputTokens: 4000, outputTokens: 900 }, { inputTokens: 300, cachedInputTokens: 100, outputTokens: 50 }));
  codexLines.say(usage({ inputTokens: 9500, cachedInputTokens: 4300, outputTokens: 980 }, { inputTokens: 500, cachedInputTokens: 300, outputTokens: 80 }));
  assert.deepEqual(got.map((c) => c.tokens), [
    { in: 200, cached: 100, out: 50 },
    { in: 200, cached: 300, out: 80 },
  ]);
  assert.equal(got[0].model, 'gpt-test');
  got.length = 0;
  const transcript = path.join(tmp, 'acp-calls.jsonl');
  const upd = (tokensIn: number, usd?: number) => ({ sessionUpdate: 'usage_update', used: 1, size: 9, ...(usd !== undefined ? { cost: { amount: usd, currency: 'USD' } } : {}), _meta: { naget: { tokensIn, tokensOut: tokensIn / 10, tokensCached: 0, model: 'openrouter/x' } } });
  // A reopened session: what its earlier run reported is in the transcript, and not counted again.
  fs.writeFileSync(transcript, [{ t: 'meta', agent: 'console' }, { t: 'session', acpSession: 'a1' }, { t: 'update', u: upd(1000, 0.5) }].map((l) => JSON.stringify(l)).join('\n') + '\n');
  const acpLines = new Lines();
  const acp = new AcpLive(acpLines as any, { cwd: tmp, id: 'calls', def: { id: 'console', name: 'Custom', command: 'x', args: [] }, transcript, acpSession: 'a1' });
  acp.on('call', (c) => got.push(c));
  acpLines.say({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'a1', update: upd(1500, 0.6) } });
  acpLines.say({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'a1', update: upd(1500, 0.6) } });
  assert.equal(got.length, 1);
  assert.deepEqual(got[0].tokens, { in: 500, cached: 0, out: 50 });
  assert.ok(Math.abs((got[0].usd ?? 0) - 0.1) < 1e-9);
  assert.equal(got[0].model, 'openrouter/x');
});

// ---- Custom's costs ----------------------------------------------------------------------------------

test('chat() reads what a call cost and the tokens read from cache', async () => {
  let asked: any;
  const srv = http.createServer((req, res) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => {
      asked = JSON.parse(b);
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'hi' } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1200, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 1000 }, cost: 0.0042 } })}\n\n`);
      res.end('data: [DONE]\n\n');
    });
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const port = (srv.address() as { port: number }).port;
  const m: AgentModel = { id: 'openrouter/x/y', label: 'Y', provider: 'openrouter', baseUrl: `http://127.0.0.1:${port}`, model: 'x/y', tools: 'native' };
  const r = await chat(m, { messages: [{ role: 'user', content: 'hello' }], signal: AbortSignal.timeout(5000), onText: () => {}, onReasoning: () => {} });
  srv.close();
  assert.equal(r.text, 'hi');
  assert.deepEqual(r.usage, { prompt: 1200, completion: 30, cached: 1000, cost: 0.0042 });
  assert.deepEqual(asked.usage, { include: true });
});

test('OpenRouter automatically supplies catalog rates and missing stream costs without manual prices', async () => {
  const realFetch = globalThis.fetch;
  let generations = 0;
  let streamCost: number | undefined;
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input);
    if (url.endsWith('/models')) return Response.json({ data: [{ id: 'test/auto', pricing: { prompt: '0.000002', completion: '0.000006', input_cache_read: '0.0000005' } }] });
    if (url.includes('/generation?')) {
      generations++;
      assert.match(url, /id=gen-test/);
      return generations === 1 ? Response.json({ data: { total_cost: 0.007, native_tokens_prompt: 1000, native_tokens_completion: 100 } }) : new Response('', { status: 404 });
    }
    assert.equal(JSON.parse(init.body).stream, true);
    return new Response(`data: ${JSON.stringify({ id: 'gen-test', choices: [{ delta: { content: 'hello' } }], usage: { prompt_tokens: 1000, completion_tokens: 100, prompt_tokens_details: { cached_tokens: 200 }, ...(streamCost == null ? {} : { cost: streamCost }) } })}\n\ndata: [DONE]\n\n`);
  }) as typeof fetch;
  try {
    await refreshOpenRouterPrices();
    assert.deepEqual(rateFor(db, 'openrouter/test/auto'), { input: 2, output: 6, cacheRead: 0.5, source: 'table' });
    const m: AgentModel = { id: 'openrouter/test/auto', model: 'test/auto', provider: 'openrouter', baseUrl: 'https://example.invalid', tools: 'native', label: 'Auto' };
    const opts = { messages: [], signal: AbortSignal.timeout(5000), onText: () => {}, onReasoning: () => {} };
    assert.equal((await chat(m, opts)).usage?.cost, 0.007, 'the actual charge wins over catalog rates');
    assert.ok(Math.abs((await chat(m, opts)).usage!.cost! - 0.0023) < 1e-12, 'catalog fallback includes cached input');
    assert.equal(rowCost(db, { agent: 'acp', model: m.id, tokens_in: 800, tokens_cached: 200, tokens_out: 100, cost_usd: null, parent_key: null }), 0.0023);
    streamCost = 0;
    assert.equal((await chat(m, opts)).usage?.cost, 0, 'free calls remain zero and do not trigger a metadata lookup');
    assert.equal(generations, 2);
    streamCost = undefined;
    assert.equal((await chat({ ...m, id: 'openrouter/not/listed' }, opts)).usage?.cost, undefined, 'missing prices stay unknown, not free');
  } finally { globalThis.fetch = realFetch; }
});

test('the ACP parser adds up Custom’s usage lines: per ACP session, per turn, and the cost when known', () => {
  const p = new AcpParser({ retain: true, collectChunks: false, collectActivity: true } as any);
  const usage = (tin: number, tout: number, cached: number, cost?: number) =>
    JSON.stringify({ t: 'update', ts: 5, u: { sessionUpdate: 'usage_update', used: tin, size: 32000, ...(cost != null ? { cost: { amount: cost, currency: 'USD' } } : {}), _meta: { naget: { tokensIn: tin, tokensOut: tout, tokensCached: cached, model: 'openrouter/x/y' } } } });
  for (const l of [
    JSON.stringify({ t: 'meta', ts: 1, agent: 'console', name: 'Custom', cwd: '/tmp' }),
    JSON.stringify({ t: 'session', ts: 2, acpSession: 's1' }),
    JSON.stringify({ t: 'prompt', ts: 3, id: 'u1', text: 'hi' }),
    usage(100, 10, 0, 0.01),
    usage(300, 30, 50, 0.03),
    JSON.stringify({ t: 'end', ts: 6, stopReason: 'end_turn' }),
    // The agent could not reopen it: a new ACP session, counting from zero.
    JSON.stringify({ t: 'session', ts: 7, acpSession: 's2' }),
    JSON.stringify({ t: 'prompt', ts: 8, id: 'u2', text: 'more' }),
    usage(40, 4, 0, 0.002),
    JSON.stringify({ t: 'end', ts: 9, stopReason: 'end_turn' }),
  ])
    p.feed(l);
  assert.equal(p.stats.tokensIn, 340);
  assert.equal(p.stats.tokensOut, 34);
  assert.equal(p.stats.tokensCached, 50);
  assert.ok(Math.abs((p.stats.costUsd ?? 0) - 0.032) < 1e-9);
  assert.equal(p.summary.model, 'openrouter/x/y');
  const turns = p.items.filter((i): i is Extract<TimelineItem, { kind: 'turn' }> => i.kind === 'turn');
  assert.deepEqual(turns[0].tokens, { input: 300, output: 30, cacheRead: 50 });
  assert.ok(Math.abs((turns[0].costUsd ?? 0) - 0.03) < 1e-9);
  assert.deepEqual(turns[1].tokens, { input: 40, output: 4, cacheRead: 0 });
  // A server that does not say what calls cost: tokens only, priced by the app.
  const q = new AcpParser({ retain: true, collectChunks: false } as any);
  q.feed(JSON.stringify({ t: 'update', ts: 1, u: { sessionUpdate: 'usage_update', used: 9, size: 9, _meta: { naget: { tokensIn: 9, tokensOut: 1, tokensCached: 0 } } } }));
  assert.equal(q.stats.costUsd, undefined);
  assert.equal(q.stats.tokensIn, 9);
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
fs.rmSync(tmp, { recursive: true, force: true });
