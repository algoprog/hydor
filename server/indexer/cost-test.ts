// Checks for what a Claude Code transcript costs as the indexer stores it (cost_usd): the highest total its `cost-state`
// lines gave plus the tokens counted after the line that set it, at the model's price; null with no such line. And that
// spending() rises as a transcript grows after its last total, and that a state saved before the tokens were carried
// still reads. Build and run with a scratch data folder (PRICES_URL= keeps the price table offline):
//   OUTDIR=dist/dev node scripts/build-server.mjs server/indexer/cost-test.ts
//   DATA_DIR=/tmp/hydor-test-cost PRICES_URL= node dist/dev/cost-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../db.ts';
import { ClaudeParser, claudeCost } from '../history/claude.ts';
import { setPriceOverrides } from '../prices.ts';
import { spending } from '../budget/spend.ts';

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
const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

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

for (const [name, fn] of tests) {
  try {
    fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${tests.length} passed`);
fs.rmSync(tmp, { recursive: true, force: true });
