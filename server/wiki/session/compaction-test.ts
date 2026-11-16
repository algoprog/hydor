// Exercise the real Custom agent over ACP against a local mock model and lifecycle endpoint.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-compact-'));
// Build the actual agent in an isolated directory with the project's supported Node runtime.
const output = path.join(root, 'build');
fs.symlinkSync(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
const built = spawnSync(process.execPath, ['scripts/build-server.mjs', 'server/agent/main.ts'], { cwd: process.cwd(), env: { ...process.env, OUTDIR: output }, encoding: 'utf8', timeout: 120_000 });
if (built.status !== 0) throw new Error(`Agent build failed: ${(built.stderr || built.error?.message || '').slice(-2000)}`);
const state = path.join(root, 'state');
fs.mkdirSync(state);
const id = 'compacttest';
const old = 'BEFORE-COMPACTION ' + 'context '.repeat(3000);
fs.writeFileSync(path.join(state, `${id}.json`), JSON.stringify({ id, cwd: root, mode: 'ask', model: 'mock', messages: [{ role: 'user', content: old }, { role: 'assistant', content: 'Prior result.' }], allow: [], textTools: [], mcpDefs: [] }));
const events: { event: string; summary?: string; before: string }[] = [];
const server = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  if (req.url === '/wiki-event') {
    const event = JSON.parse(body);
    events.push({ ...event, before: fs.readFileSync(path.join(state, `${id}.json`), 'utf8') });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'saved' }));
  } else if (req.url === '/chat/completions') {
    const request = JSON.parse(body);
    const prompt = String(request.messages?.[0]?.content ?? '');
    const text = /Below (?:are notes|is the earlier part)/.test(prompt) ? 'GOAL: Complete the wiki work.\nDONE: Prior result.\nNEXT: Continue.' : 'Finished.';
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`);
  } else {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(req.url?.startsWith('/context') ? { parts: [], guides: [] } : req.url === '/custom' ? { sandbox: 'off', confidential: false } : []));
  }
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Mock server did not start');
const base = `http://127.0.0.1:${address.port}`;
const models = path.join(root, 'models.json');
fs.writeFileSync(models, JSON.stringify({ models: [{ id: 'mock', label: 'Mock', model: 'mock', provider: 'ollama', baseUrl: base, local: true, contextLength: 4096 }] }));
type Child = ReturnType<typeof spawn>;
const replies = new Map<number, (value: any) => void>();
let errors = '';
let counter = 0;
/** A Custom agent process; `wikiEvents` is what the app tells it at spawn (HYDOR_WIKI_EVENTS). */
function agent(wikiEvents: boolean) {
  const env: NodeJS.ProcessEnv = { ...process.env, HYDOR_MODELS: models, HYDOR_STATE: state, HYDOR_RUNTIME: base, HYDOR_CONFIDENTIAL: '0' };
  if (wikiEvents) env.HYDOR_WIKI_EVENTS = '1'; else delete env.HYDOR_WIKI_EVENTS;
  const child = spawn(process.execPath, [path.join(output, 'main.js')], { cwd: process.cwd(), env, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stderr!.on('data', (chunk) => { errors += String(chunk); });
  readline.createInterface({ input: child.stdout! }).on('line', (line) => {
    try { const message = JSON.parse(line); if (typeof message.id === 'number' && !message.method) replies.get(message.id)?.(message); } catch { /* Ignore unrelated process output. */ }
  });
  const request = (method: string, params: object) => new Promise<any>((resolve, reject) => {
    const number = ++counter;
    const timer = setTimeout(() => reject(new Error(`Timed out in ${method}: ${errors.slice(-1000)}`)), 25_000);
    replies.set(number, (result) => { clearTimeout(timer); resolve(result); });
    child.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id: number, method, params }) + '\n');
  });
  return { child: child as Child, request };
}
function seed(session: string) {
  fs.writeFileSync(path.join(state, `${session}.json`), JSON.stringify({ id: session, cwd: root, mode: 'ask', model: 'mock', messages: [{ role: 'user', content: old }, { role: 'assistant', content: 'Prior result.' }], allow: [], textTools: [], mcpDefs: [] }));
}
async function turn(a: ReturnType<typeof agent>, session: string) {
  const loaded = await a.request('session/load', { sessionId: session, cwd: root, mcpServers: [] });
  assert.ok(!loaded.error, JSON.stringify(loaded.error));
  const result = await a.request('session/prompt', { sessionId: session, prompt: [{ type: 'text', text: 'Continue the task.' }] });
  assert.ok(!result.error, JSON.stringify(result.error));
}
const children: Child[] = [];
try {
  // The app told the agent wiki memory is on: it asks for compaction checkpoints, and for nothing else.
  const on = agent(true);
  children.push(on.child);
  await turn(on, id);
  const pre = events.find((event) => event.event === 'PreCompact');
  const post = events.find((event) => event.event === 'PostCompact');
  assert.ok(pre && post, `Expected pre and post: ${JSON.stringify(events.map((e) => e.event))}`);
  assert.ok(events.indexOf(pre) < events.indexOf(post));
  assert.match(pre.before, /BEFORE-COMPACTION/);
  assert.doesNotMatch(post.before, /BEFORE-COMPACTION/);
  assert.match(pre.summary ?? '', /Complete the wiki work/);
  assert.match(post.before, /Complete the wiki work/);
  assert.deepEqual([...new Set(events.map((e) => e.event))].sort(), ['PostCompact', 'PreCompact'], 'no start, tool-count or end-of-turn events');
  // Wiki memory off for the session (the app set nothing): the agent makes no calls at all.
  events.length = 0;
  seed('compactoff');
  const off = agent(false);
  children.push(off.child);
  await turn(off, 'compactoff');
  assert.deepEqual(events, [], 'no local calls while wiki memory is off');
  assert.doesNotMatch(fs.readFileSync(path.join(state, 'compactoff.json'), 'utf8'), /BEFORE-COMPACTION/, 'the conversation was still compacted');
  process.stdout.write('Custom agent compaction order test passed\n');
} finally {
  for (const child of children) { child.stdin!.end(); child.kill(); }
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(root, { recursive: true, force: true });
}
