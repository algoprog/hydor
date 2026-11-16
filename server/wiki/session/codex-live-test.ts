// Opt-in integration test: a real Codex CLI talks only to isolated local fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import Database from 'better-sqlite3';
import { CodexLive, codexProjectHooksMayExist } from '../../agents/codex.ts';
import { wikiSession } from './index.ts';
import { codexWikiHookCommand } from './codex-hook.ts';
import { wikiHookToken } from './hook-auth.ts';
import { setWikiSettings } from '../settings/settings.ts';
import { checkpointStatus } from './status.ts';
import { latestEvent } from './store.ts';

// Restart with a clean HOME before the product configuration is used.
if (!process.env.HYDOR_CODEX_E2E_CHILD) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-codex-e2e-'));
  const data = path.join(root, 'data');
  fs.mkdirSync(data);
  const probe = net.createServer();
  await new Promise<void>((resolve, reject) => probe.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = (probe.address() as net.AddressInfo).port;
  await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  const allowed = ['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP'];
  const env = Object.fromEntries(allowed.filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]!])) as Record<string, string>;
  Object.assign(env, {
    HOME: root, USERPROFILE: root, DATA_DIR: data, E2E_ROOT: root, PORT: String(port),
    CODEX_BIN: process.env.CODEX_BIN ?? 'codex', HYDOR_CODEX_E2E_CHILD: '1',
  });
  try {
    // The isolated three-phase test can contend with other builds on network-backed workspaces.
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env, encoding: 'utf8', timeout: 120_000 });
    assert.equal(result.status, 0, result.stderr || result.stdout || 'Codex live test timed out');
    process.stdout.write(result.stdout);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
} else {
  const root = process.env.E2E_ROOT!;
  const hub = path.join(root, 'wiki');
  const home = path.join(root, 'codex');
  const cwd = path.join(root, 'workspace');
  for (const dir of [hub, home, cwd]) fs.mkdirSync(dir, { recursive: true });
  // Hydor binds status to the resolved hub path, including on systems where /tmp is a symlink.
  const resolvedHub = fs.realpathSync(hub);
  const order: string[] = [];
  let requestCount = 0;
  let highNext = true;
  let savedBeforeCompact = false;
  let adapter!: CodexLive;
  const db = new Database(':memory:');
  db.exec('create table kv (k text primary key, v text not null); create table app_sessions (key text primary key, agent text, extra text, created_at integer, updated_at integer);');
  setWikiSettings(db, { enabled: true, hubPath: hub });

  // A synthetic Responses provider reports a high token count to trigger real auto-compaction.
  const model = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const request = JSON.parse(body);
      requestCount++;
      const compact = Array.isArray(request.tools) && request.tools.length === 0;
      if (compact) {
        const key = `codex:${adapter.sessionId}`;
        const file = latestEvent(hub, key);
        savedBeforeCompact = checkpointStatus(db, resolvedHub, key)?.status === 'saved' && !!file && fs.readFileSync(file, 'utf8').includes('Synthetic checkpoint summary');
      }
      order.push(compact ? 'compact-request' : 'model-request');
      const i = requestCount;
      const tokens = !compact && highNext ? 90000 : 100;
      if (!compact) highNext = false;
      const item = { id: `msg_${i}`, type: 'message', role: 'assistant', content: [{ type: 'output_text', text: compact ? 'Synthetic summary' : 'Synthetic reply', annotations: [] }] };
      const events = [
        { type: 'response.created', response: { id: `resp_${i}` } },
        { type: 'response.output_item.added', output_index: 0, item },
        { type: 'response.output_item.done', output_index: 0, item },
        { type: 'response.completed', response: { id: `resp_${i}`, status: 'completed', output: [item], usage: {
          input_tokens: tokens, output_tokens: 10, total_tokens: tokens + 10,
          input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 },
        } } },
      ];
      const data = events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Content-Length': Buffer.byteLength(data) });
      res.end(data);
    });
  });
  await new Promise<void>((resolve) => model.listen(0, '127.0.0.1', resolve));
  const port = (model.address() as net.AddressInfo).port;
  fs.writeFileSync(path.join(home, 'config.toml'), `model="gpt-5"\nmodel_provider="mock"\nweb_search="disabled"\nmodel_context_window=100000\nmodel_auto_compact_token_limit=50000\nmodel_post_turn_compact_threshold_percent=0\n[features]\nplugins=false\n[model_providers.mock]\nname="Local mock"\nbase_url="http://127.0.0.1:${port}/v1"\nwire_api="responses"\nrequires_openai_auth=false\nrequest_max_retries=0\nstream_max_retries=0\n`);

  const app = Fastify();
  const runId = '0123456789ab';
  const deps: any = {
    app, db,
    sessions: {
      liveByRun: (id: string) => id === runId && adapter?.sessionId ? { key: `codex:${adapter.sessionId}`, agent: 'codex' } : null,
      // This isolates hook delivery and storage; semantic summary generation is a separate test.
      wikiCheckpointSummary: async () => { order.push('prepare-checkpoint'); return 'Synthetic checkpoint summary'; },
    },
  };
  app.addHook('onResponse', async (req) => { if (req.url === '/agent/codex/wiki-event') order.push('checkpoint-response'); });
  wikiSession.routes!(deps);
  await app.listen({ host: '127.0.0.1', port: Number(process.env.PORT) });

  // Bridge the product adapter to an actual app-server process without involving a user session.
  class TestRunner extends EventEmitter {
    meta = { runId };
    child;
    constructor() {
      super();
      const env = { ...process.env, CODEX_HOME: home, HOME: root, HYDOR_WIKI_HOOK_TOKEN: wikiHookToken(runId) };
      this.child = spawn(process.env.CODEX_BIN ?? 'codex', ['app-server'], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
      createInterface({ input: this.child.stdout }).on('line', (line) => {
        try {
          const message = JSON.parse(line);
          if (message.method === 'turn/completed') order.push('turn-completed');
          else if (message.method?.startsWith('hook/')) order.push(message.method);
          else if (message.method?.startsWith('item/') && message.params?.item?.type === 'contextCompaction') order.push(`${message.method}:contextCompaction`);
        } catch { /* Ignore non-protocol output. */ }
        this.emit('line', line, false);
      });
      this.child.stderr.resume();
    }
    writeLine(message: unknown) { this.child.stdin.write(`${JSON.stringify(message)}\n`); }
  }
  let runner!: TestRunner;
  const begin = async (options: { threadId?: string; forkFrom?: string } = {}) => {
    runner = new TestRunner();
    adapter = new CodexLive(runner as any, { cwd, mode: 'full', wikiHookCommand: codexWikiHookCommand(), ...options });
    await adapter.boot();
  };
  const end = async () => {
    const closed = new Promise<void>((resolve) => runner.child.once('close', () => resolve()));
    runner.child.kill();
    adapter.rpc.failAll('test finished');
    runner.emit('exit', { code: 0 });
    await closed;
  };
  const waitFor = async (condition: () => boolean) => {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (condition()) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out; events: ${JSON.stringify(order)}`);
  };
  try {
    let originalThread = '';
    // Each phase uses real adapter setup with fresh automatic compaction.
    for (const phase of ['start', 'resume', 'fork'] as const) {
      const options = phase === 'resume' ? { threadId: originalThread } : phase === 'fork' ? { forkFrom: originalThread } : {};
      await begin(options);
      if (phase === 'start') originalThread = adapter.sessionId!;
      const coverage = await adapter.hookCoverage();
      if (coverage) assert.equal(coverage.events.preCompact.trusted, 1, `${phase}: product hook must be trusted`);
      const before = order.filter((event) => event === 'prepare-checkpoint').length;
      highNext = true;
      savedBeforeCompact = false;
      for (let i = 0; i < 2; i++) {
        const turns = order.filter((event) => event === 'turn-completed').length;
        await adapter.sendMessage(`Synthetic ${phase} turn ${i}`, []);
        await waitFor(() => order.filter((event) => event === 'turn-completed').length > turns);
      }
      const key = `codex:${adapter.sessionId}`;
      const status = checkpointStatus(db, resolvedHub, key);
      const file = latestEvent(hub, key);
      assert.equal(status?.status, 'saved', `${phase}: expected a checkpoint; events: ${JSON.stringify(order)}`);
      assert.equal(status?.event, 'PreCompact');
      assert.ok(file);
      assert.match(fs.readFileSync(file, 'utf8'), /Synthetic checkpoint summary/);
      assert.equal(order.filter((event) => event === 'prepare-checkpoint').length, before + 1, `${phase}: exactly one checkpoint`);
      assert.ok(savedBeforeCompact, `${phase}: digest and saved status must exist before the compact request`);
      await end();
    }
    process.stdout.write(`Codex automatic wiki checkpoint passed for start, resume and fork: ${JSON.stringify(order)}\n`);
  } finally {
    if (runner! && runner.child.exitCode === null && runner.child.signalCode === null) await end();
    app.server.closeAllConnections();
    await app.close();
    model.closeAllConnections();
    await new Promise<void>((resolve) => model.close(() => resolve()));
    db.close();
  }
  // The disposable child must not wait for adapter housekeeping timers.
  process.exit(0);
}
