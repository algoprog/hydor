// Checks for what a Claude Code transcript costs as the indexer stores it (cost_usd): the highest total its `cost-state`
// lines gave plus the tokens counted after the line that set it, at the model's price; null with no such line. And that
// spending() rises as a transcript grows after its last total, and that a state saved before the tokens were carried
// still reads. Then Claude Code's subagents: their calls after the lead's highest saved total are added (placed by their
// timestamps), the ones before it are covered by the total, a database from before has nothing to add, and what a scheduled
// run's and an app run's cost read. Build and run with a scratch data folder (PRICES_URL= keeps the price table offline):
//   OUTDIR=dist/dev node scripts/build-server.mjs server/indexer/cost-test.ts
//   DATA_DIR=/tmp/hydor-test-cost PRICES_URL= node dist/dev/cost-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { openDb } from '../db.ts';
import { ClaudeParser, claudeCost } from '../history/claude.ts';
import { setPriceOverrides } from '../prices.ts';
import { ownSpend, spending, spentSoFar, statsCost } from '../budget/spend.ts';
import { Scheduler } from '../scheduler.ts';
import { runCost, startRuns } from '../apps/runs.ts';
import * as appStore from '../apps/store.ts';
import { EventEmitter } from 'node:events';

if (!process.env.DATA_DIR?.startsWith('/tmp/') || process.env.PRICES_URL !== '') {
  console.error('Run with DATA_DIR=/tmp/… and PRICES_URL= (empty) so nothing touches real data or the network.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-cost-test-'));
const db = openDb(path.join(tmp, 'test.db'));
// $10 per million in, $1 cached, $30 out.
setPriceOverrides(db, { 'test-model': { input: 10, output: 30, cacheRead: 1 } });
const opts = { retain: false, collectChunks: false };

let n = 0;
const call = (inp: number, out: number, cached = 0, model = 'test-model') =>
  JSON.stringify({ type: 'assistant', uuid: `a${n}`, timestamp: `2026-11-20T10:00:${String(n % 60).padStart(2, '0')}.000Z`, message: { id: `m${n++}`, role: 'assistant', model, content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: inp, output_tokens: out, cache_read_input_tokens: cached } } });
const total = (usd: unknown) => JSON.stringify({ type: 'cost-state', totalCostUSD: usd });
const near = (a: number | null, b: number) => assert.ok(a != null && Math.abs(a - b) < 1e-9, `${a} should be ${b}`);
const cost = (p: ClaudeParser) => claudeCost(db, p.stats, p.summary.model);
const feed = (p: ClaudeParser, ...lines: string[]) => lines.forEach((l) => p.feed(l));

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

test('no cost-state line: null, the row’s tokens are priced instead', () => {
  const p = new ClaudeParser(opts);
  feed(p, call(1000, 100));
  assert.equal(cost(p), null);
});

test('a total, then more tokens: the total plus the later tokens; a lower or equal total changes nothing; a higher one is the new base', () => {
  const p = new ClaudeParser(opts);
  feed(p, call(1_000_000, 0), total(1.0));
  near(cost(p), 1.0);
  feed(p, call(100_000, 10_000, 200_000)); // 1.0 + 1.0 + 0.3 + 0.2
  near(cost(p), 2.5);
  feed(p, total(0.4)); // lower: the base stays, so do the tokens since
  near(cost(p), 2.5);
  feed(p, total(1.0)); // equal
  near(cost(p), 2.5);
  feed(p, call(0, 10_000)); // + 0.3
  near(cost(p), 2.8);
  feed(p, total(3.0)); // higher: the base, nothing since
  near(cost(p), 3.0);
  feed(p, call(0, 100_000)); // + 3.0
  near(cost(p), 6.0);
  assert.equal(p.stats.costUsd, 3.0);
});

test('totals that go down and up again (a restart): never below the highest', () => {
  const p = new ClaudeParser(opts);
  let last = 0;
  for (const t of [37.778, 4.648, 89.522, 16.637, 103.744, 16.637]) {
    feed(p, call(1000, 1000), total(t));
    const c = cost(p)!;
    assert.ok(c >= last - 1e-9, `${c} fell below ${last}`);
    last = c;
  }
  near(cost(p), 103.784); // the highest, and the one call after it ($0.04) that the last, lower total did not cover
});

test('tokens with no known price add nothing', () => {
  const p = new ClaudeParser(opts);
  feed(p, call(1000, 1000, 0, 'some-unknown-model'), total(2.0), call(5_000_000, 5_000_000, 0, 'some-unknown-model'));
  near(cost(p), 2.0);
});

test('a total that is not a number is ignored', () => {
  const p = new ClaudeParser(opts);
  feed(p, call(1000, 1000), total('3'), total(null));
  assert.equal(cost(p), null);
});

test('the figure is the same read whole as read in parts (a state saved between)', () => {
  const lines = [call(100_000, 1000), total(0.5), call(200_000, 2000), total(0.2), call(300_000, 3000)];
  const whole = new ClaudeParser(opts);
  feed(whole, ...lines);
  let p = new ClaudeParser(opts);
  for (const l of lines) {
    p = ClaudeParser.fromState(JSON.parse(JSON.stringify(p.toState())), opts);
    p.feed(l);
  }
  near(cost(p), cost(whole)!);
  assert.deepEqual(p.stats.costTokens, whole.stats.costTokens);
});

test('a state saved before the tokens were carried: a total but no counters, what it counted is paid for', () => {
  const p = new ClaudeParser(opts);
  feed(p, call(1_000_000, 0), total(1.0), call(1_000_000, 0));
  const old = JSON.parse(JSON.stringify(p.toState()));
  delete old.stats.costTokens;
  const q = ClaudeParser.fromState(old, opts);
  near(cost(q), 1.0);
  feed(q, call(100_000, 0)); // only this one is on top
  near(cost(q), 2.0);
  // A state with no total at all stays null.
  const r = ClaudeParser.fromState(JSON.parse(JSON.stringify(new ClaudeParser(opts).toState())), opts);
  feed(r, call(10, 10));
  assert.equal(cost(r), null);
});

test('spending() rises as tokens come in after the last cost-state line', () => {
  const key = 'claude:cost-test-1';
  const store = (p: ClaudeParser) =>
    db
      .prepare(`insert or replace into sessions (key, agent, id, path, model, tokens_in, tokens_out, tokens_cached, cost_usd, hidden) values (?, 'claude', 'cost-test-1', '/tmp/x', ?, ?, ?, ?, ?, 0)`)
      .run(key, p.summary.model ?? null, p.stats.tokensIn, p.stats.tokensOut, p.stats.tokensCached, cost(p));
  const p = new ClaudeParser(opts);
  feed(p, call(1_000_000, 0), total(1.0));
  store(p);
  near(spending(db, key).spentUsd, 1.0);
  feed(p, call(0, 100_000)); // $3
  store(p);
  near(spending(db, key).spentUsd, 4.0);
  feed(p, call(0, 100_000));
  store(p);
  near(spending(db, key).spentUsd, 7.0);
  // Without a total the row is priced from its tokens, as before.
  const q = new ClaudeParser(opts);
  feed(q, call(1_000_000, 100_000));
  store(q);
  near(spending(db, key).spentUsd, 13.0);
});

// ---- Claude Code's subagents after the saved total --------------------------------------------------------------------

const T0 = Date.parse('2026-11-20T10:00:00.000Z');
const iso = (sec: number) => new Date(T0 + sec * 1000).toISOString();
let k = 0;
/** One model call at `sec` seconds past 10:00:00 (no time at all when sec is null). */
const callAt = (sec: number | null, out: number, model = 'test-model', sidechain = false) =>
  JSON.stringify({ type: 'assistant', uuid: `s${k}`, ...(sec == null ? {} : { timestamp: iso(sec) }), ...(sidechain ? { isSidechain: true } : {}), message: { id: `sm${k++}`, role: 'assistant', model, content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 0, output_tokens: out } } });
const userAt = (sec: number) => JSON.stringify({ type: 'user', uuid: `u${k++}`, timestamp: iso(sec), message: { role: 'user', content: 'go' } });
const sub = () => new ClaudeParser({ ...opts, sidechain: true });

/** A transcript's row as the indexer writes it (worker.ts). */
function put(key: string, p: ClaudeParser, parent?: string) {
  db.prepare(
    `insert or replace into sessions (key, agent, id, path, model, tokens_in, tokens_out, tokens_cached, cost_usd, parent_key, hidden, cost_at, calls)
     values (?, 'claude', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(key, key.slice(7), `/tmp/${key}`, p.summary.model ?? null, p.stats.tokensIn, p.stats.tokensOut, p.stats.tokensCached, claudeCost(db, p.stats, p.summary.model), parent ?? null, parent ? 1 : 0, p.stats.costAt ?? null, p.callsJson());
}
/** An old row: what an indexer from before wrote (no moment, no calls). */
function putOld(key: string, p: ClaudeParser, parent?: string) {
  put(key, p, parent);
  db.prepare('update sessions set cost_at = null, calls = null where key = ?').run(key);
}

test('a total remembers when it was saved: the last timestamp before its line', () => {
  const p = new ClaudeParser(opts);
  feed(p, userAt(0), callAt(5, 10), total(1.0), callAt(60, 10), total(0.5));
  assert.equal(p.stats.costAt, T0 + 5000);
  feed(p, total(2.0));
  assert.equal(p.stats.costAt, T0 + 60000, 'a higher total takes the moment with it');
  const q = new ClaudeParser(opts);
  feed(q, callAt(null, 10), total(1.0));
  assert.equal(q.stats.costAt, undefined, 'no timestamps: not known');
});

test('a subagent’s calls: after the lead’s saved total are priced and added, before it (or in its own 10 s) are not', () => {
  const lead = new ClaudeParser(opts);
  feed(lead, userAt(0), callAt(5, 0), total(1.0)); // saved at 10:00:05
  put('claude:lead-a', lead);
  const s1 = sub();
  // $3 per 100 000 output tokens: before (:02), in the same 10 s as the total (:08), after (:30 and 1:10).
  feed(s1, callAt(2, 100_000, 'test-model', true), callAt(8, 100_000, 'test-model', true), callAt(30, 100_000, 'test-model', true), callAt(70, 100_000, 'test-model', true));
  put('claude:sub-a1', s1, 'claude:lead-a');
  near(ownSpend(db, 'claude:lead-a').usd, 1.0 + 6.0);
  // Another subagent, its calls all before: nothing.
  const s2 = sub();
  feed(s2, callAt(1, 100_000, 'test-model', true), callAt(3, 100_000, 'test-model', true));
  put('claude:sub-a2', s2, 'claude:lead-a');
  near(spending(db, 'claude:lead-a').spentUsd, 7.0);
  // The lead's own later calls count too, once (they are in its figure).
  feed(lead, callAt(90, 100_000));
  put('claude:lead-a', lead);
  near(spending(db, 'claude:lead-a').spentUsd, 10.0);
});

test('a higher saved total takes the calls it covers out of the subagents’ share, and spending is never counted twice', () => {
  const lead = new ClaudeParser(opts);
  feed(lead, userAt(0), callAt(5, 0), total(1.0));
  const s = sub();
  feed(s, callAt(30, 100_000, 'test-model', true));
  put('claude:lead-b', lead);
  put('claude:sub-b1', s, 'claude:lead-b');
  near(spending(db, 'claude:lead-b').spentUsd, 4.0);
  // The lead saves 4.50 at 10:01:00: the subagent's call at :30 is in it now.
  feed(lead, callAt(60, 0), total(4.5));
  put('claude:lead-b', lead);
  near(spending(db, 'claude:lead-b').spentUsd, 4.5);
  // A lower total later changes nothing.
  feed(lead, total(1.0));
  put('claude:lead-b', lead);
  near(spending(db, 'claude:lead-b').spentUsd, 4.5);
});

test('a subagent with no timestamps, an unpriced model, or a lead with no moment: nothing added', () => {
  const lead = new ClaudeParser(opts);
  feed(lead, userAt(0), callAt(5, 0), total(1.0));
  put('claude:lead-c', lead);
  const bare = sub();
  feed(bare, callAt(null, 100_000, 'test-model', true));
  put('claude:sub-c1', bare, 'claude:lead-c');
  assert.equal((db.prepare("select calls from sessions where key = 'claude:sub-c1'").get() as any).calls, null);
  const odd = sub();
  feed(odd, callAt(300, 100_000, 'some-unknown-model', true));
  put('claude:sub-c2', odd, 'claude:lead-c');
  near(spending(db, 'claude:lead-c').spentUsd, 1.0);
  // A lead whose total came from a state saved before (no moment): its subagents add nothing, as before.
  const s = sub();
  feed(s, callAt(300, 100_000, 'test-model', true));
  put('claude:sub-c3', s, 'claude:lead-c');
  near(spending(db, 'claude:lead-c').spentUsd, 1.0 + 3.0);
  db.prepare("update sessions set cost_at = null where key = 'claude:lead-c'").run();
  near(spending(db, 'claude:lead-c').spentUsd, 1.0);
});

test('a lead with no saved total: its subagents are counted whole from their tokens, as before', () => {
  const lead = new ClaudeParser(opts);
  feed(lead, userAt(0), callAt(5, 100_000));
  put('claude:lead-d', lead);
  const s = sub();
  feed(s, callAt(1, 100_000, 'test-model', true));
  put('claude:sub-d1', s, 'claude:lead-d');
  assert.equal((db.prepare("select cost_usd from sessions where key = 'claude:lead-d'").get() as any).cost_usd, null);
  near(spending(db, 'claude:lead-d').spentUsd, 3.0 + 3.0);
});

test('rows from before (no moment, no calls): the figures are as before', () => {
  const lead = new ClaudeParser(opts);
  feed(lead, userAt(0), callAt(5, 0), total(1.0));
  const s = sub();
  feed(s, callAt(300, 100_000, 'test-model', true));
  putOld('claude:lead-e', lead);
  putOld('claude:sub-e1', s, 'claude:lead-e');
  near(spending(db, 'claude:lead-e').spentUsd, 1.0);
});

test('a database from before gets the two columns, empty', () => {
  const file = path.join(tmp, 'old.db');
  const a = openDb(file);
  a.exec('alter table sessions drop column cost_at');
  a.exec('alter table sessions drop column calls');
  a.prepare("insert into sessions (key, agent, id, path, cost_usd) values ('claude:old', 'claude', 'old', '/tmp/old', 2.5)").run();
  a.close();
  const b = openDb(file);
  const cols = (b.prepare('pragma table_info(sessions)').all() as { name: string }[]).map((c) => c.name);
  assert.ok(cols.includes('cost_at') && cols.includes('calls'));
  assert.deepEqual(b.prepare("select cost_at, calls from sessions where key = 'claude:old'").get(), { cost_at: null, calls: null });
  near(spending(b, 'claude:old').spentUsd, 2.5);
  b.close();
});

test('a subagent’s calls are carried between passes, and a state from before carries on with the calls it sees', () => {
  const s = sub();
  feed(s, callAt(30, 100_000, 'test-model', true));
  const t = ClaudeParser.fromState(JSON.parse(JSON.stringify(s.toState())), { ...opts, sidechain: true });
  feed(t, callAt(31, 100_000, 'test-model', true), callAt(75, 100_000, 'test-model', true));
  assert.deepEqual(JSON.parse(t.callsJson()!), [[Math.floor((T0 + 30000) / 10000), 0, 0, 200_000], [Math.floor((T0 + 75000) / 10000), 0, 0, 100_000]]);
  const old = JSON.parse(JSON.stringify(s.toState()));
  delete old.callBuckets;
  const u = ClaudeParser.fromState(old, { ...opts, sidechain: true });
  assert.equal(u.callsJson(), null);
  feed(u, callAt(75, 100_000, 'test-model', true));
  assert.equal(JSON.parse(u.callsJson()!).length, 1);
  // A lead keeps none.
  const lead = new ClaudeParser(opts);
  feed(lead, callAt(5, 10));
  assert.equal(lead.callsJson(), null);
});

test('a scheduled run’s and an app run’s cost read what spending counts', async () => {
  const lead = new ClaudeParser(opts);
  feed(lead, userAt(0), callAt(5, 0), total(1.0));
  put('claude:lead-f', lead);
  const s = sub();
  feed(s, callAt(30, 100_000, 'test-model', true));
  put('claude:sub-f1', s, 'claude:lead-f');
  const summary = (key: string, stats: any, model = 'test-model') => ({ key, agent: 'claude', model, stats });
  const stats = { ...lead.stats, costUsd: 1.0, tokensIn: 0, tokensOut: 0, tokensCached: 0 };
  const sessions = new EventEmitter() as any;
  sessions.summary = (key: string) => (key === 'claude:missing' ? null : key === 'claude:nope' ? summary(key, { ...stats, costUsd: 2.0, costTokens: { tokensIn: 0, tokensCached: 0, tokensOut: 0 }, tokensOut: 100_000 }) : summary(key, stats));
  // Scheduler: indexed → spending (the subagent's later call is in); not indexed → the summary's total and the tokens since it.
  const costNow = (key: string): number => (Scheduler.prototype as any).costNow.call({ db, sessions }, key);
  near(costNow('claude:lead-f'), 4.0);
  near(costNow('claude:nope'), 5.0);
  near(costNow('claude:missing'), 0);
  // An app run: the same.
  appStore.ensureTables(db);
  startRuns({ db, sessions } as any);
  const r = { recipe: {} as any, source: 'web' as const, key: 'claude:lead-f' };
  near(runCost(r, sessions.summary('claude:lead-f'), []) ?? NaN, 4.0);
  near(runCost({ ...r, key: 'claude:nope' }, sessions.summary('claude:nope'), []) ?? NaN, 5.0);
  // Nothing priced: as before.
  assert.equal(runCost({ ...r, key: undefined }, summary('x', { ...stats, costUsd: undefined, tokensIn: 10, tokensOut: 10 }, 'some-unknown-model') as any, []), undefined);
  assert.equal(spentSoFar(db, 'claude:missing', null), null);
  assert.equal(statsCost(db, { ...stats, costUsd: undefined, tokensIn: 10 }, 'some-unknown-model'), null);
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
console.log(`${passed}/${tests.length} passed`);
fs.rmSync(tmp, { recursive: true, force: true });
// The apps' runs follow their sessions on a timer.
process.exit(process.exitCode ?? 0);
