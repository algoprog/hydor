// Script test for one agent process per session: two starts at once start it once (SessionManager.start), a second
// process attached to the same session stops the first (attach), each run reads MCP files of its own
// (server/agents/claude.ts mcpRunFiles), and the files of runs that are gone are swept (sweepMcpRunFiles).
// Two starts 105 ms apart on 23 November 2026 left a session with two agent processes; after a restart the app followed
// one and the other's tools answered "No session runs with that address".
// Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/sessions-starts-test.ts
//   DATA_DIR=/tmp/hydor-test-starts node dist/dev/sessions-starts-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { claudeSpec, mcpRunFiles, removeMcpRunFiles } from './agents/claude.ts';
import { config } from './config.ts';
import { SessionManager } from './sessions.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.mkdirSync(config.dataDir, { recursive: true });

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const proto = SessionManager.prototype as any;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const KEY = 'claude:00000000-0000-0000-0000-0000000000aa';

/** A stand-in for the manager: what start() and attach() read. */
function manager(startNow?: () => Promise<void>) {
  const m: any = {
    lives: new Map(),
    agentStarts: new Map(),
    timelines: new Map(),
    timeline: async () => {},
    queueSummary() {},
    queueAncestors() {},
  };
  m.startNow = startNow ?? (async () => {});
  return m;
}

/** A stand-in for a running agent process of `key`. */
function live(key: string, runId: string) {
  const adapter: any = new EventEmitter();
  adapter.state = { status: 'idle' };
  adapter.stops = 0;
  adapter.stop = () => adapter.stops++;
  return { key, agent: 'claude', cwd: '/', adapter, runner: { meta: { runId } } };
}

test('two starts at once start the agent once, and both wait for it', async () => {
  let n = 0;
  const m = manager();
  m.startNow = async () => {
    n++;
    await sleep(80);
    m.lives.set(KEY, live(KEY, 'r1'));
  };
  const [a, b] = [proto.start.call(m, KEY), proto.start.call(m, KEY)];
  await Promise.all([a, b]);
  assert.equal(n, 1);
  assert.equal(m.agentStarts.size, 0, 'the start is forgotten once it is over');
  await proto.start.call(m, KEY);
  assert.equal(n, 1, 'a running session is not started again');
});

test('a start that fails lets the next one try again', async () => {
  let n = 0;
  const m = manager();
  m.startNow = async () => {
    n++;
    await sleep(20);
    if (n === 1) throw new Error('did not start');
    m.lives.set(KEY, live(KEY, 'r2'));
  };
  await assert.rejects(Promise.all([proto.start.call(m, KEY), proto.start.call(m, KEY)]), /did not start/);
  assert.equal(n, 1, 'both callers shared the one failed start');
  await proto.start.call(m, KEY);
  assert.equal(n, 2);
  assert.ok(m.lives.has(KEY));
});

test('starts of two sessions do not wait for each other', async () => {
  const seen: string[] = [];
  const m = manager();
  m.startNow = async (key: string) => {
    seen.push(key);
    await sleep(30);
  };
  await Promise.all([proto.start.call(m, 'claude:one'), proto.start.call(m, 'claude:two')]);
  assert.deepEqual(seen.sort(), ['claude:one', 'claude:two']);
});

test('a second agent process attached to a session stops the first, and the session follows the second', () => {
  const m = manager();
  const first = live(KEY, 'run-a');
  const second = live(KEY, 'run-b');
  const warn = console.warn;
  console.warn = () => {};
  try {
    proto.attach.call(m, first);
    assert.equal(first.adapter.stops, 0);
    proto.attach.call(m, second);
    assert.equal(first.adapter.stops, 1, 'the older process stops');
    assert.equal(second.adapter.stops, 0);
    assert.equal(m.lives.get(KEY), second);
    proto.attach.call(m, second);
    assert.equal(second.adapter.stops, 0, 'the same process attached again is not stopped');
  } finally {
    console.warn = warn;
  }
});

test('each run of a session reads MCP servers of its own, with its own address', () => {
  const o = (runId: string) => ({ cwd: '/', sessionId: '00000000-0000-0000-0000-0000000000aa', pageServer: `http://127.0.0.1:8790/mcp/run/${runId}.sig`, runId });
  const files = ['run-one', 'run-two'].map((runId) => {
    const spec = claudeSpec(o(runId), {});
    const file = spec.args[spec.args.indexOf('--mcp-config') + 1];
    assert.equal(file, mcpRunFiles(runId).config);
    return file;
  });
  assert.notEqual(files[0], files[1]);
  assert.match(fs.readFileSync(files[0], 'utf8'), /run-one\.sig/);
  assert.match(fs.readFileSync(files[1], 'utf8'), /run-two\.sig/, 'the second run did not overwrite the first one’s file');
  assert.equal((fs.statSync(files[0]).mode & 0o777).toString(8), '600');
  removeMcpRunFiles('run-one');
  assert.ok(!fs.existsSync(files[0]));
  assert.ok(fs.existsSync(files[1]));
  removeMcpRunFiles('run-two');
});

test('the sweep keeps the files of running agents and of runs just starting, and removes the rest', () => {
  const dir = path.dirname(mcpRunFiles('x').config);
  fs.mkdirSync(dir, { recursive: true });
  const old = Date.now() / 1000 - 3600;
  const make = (name: string, fresh = false) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, '{}');
    if (!fresh) fs.utimesSync(p, old, old);
    return p;
  };
  const kept = [make('run-live.json'), make('11111111-2222-3333-4444-555555555555.json'), make('run-new.json', true)];
  const gone = [make('run-gone.json'), make('run-gone-instructions.md')];
  const m = manager();
  m.lives.set('claude:11111111-2222-3333-4444-555555555555', live('claude:11111111-2222-3333-4444-555555555555', 'run-live'));
  proto.sweepMcpRunFiles.call(m);
  for (const p of kept) assert.ok(fs.existsSync(p), `kept: ${path.basename(p)}`);
  for (const p of gone) assert.ok(!fs.existsSync(p), `removed: ${path.basename(p)}`);
  for (const p of kept) fs.rmSync(p, { force: true });
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}\n     ${(e as Error).stack ?? e}`);
  }
}
console.log(`${passed}/${tests.length} passed`);
process.exit(passed === tests.length ? 0 : 1);
