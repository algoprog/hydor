// Checks for word suggestions' server: the settings (checked, merged, kept), the routes with a stand-in for the Python
// worker and for llama-server (a script that answers the protocol), a newer suggestion cancelling the one before, the
// texts personalising learns from (on a scratch database, with the injected text that is never typed), and a run of
// personalising with a stand-in for train.py. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/suggest/suggest-test.ts && DATA_DIR=/tmp/hydor-ws-server-test-1 node dist/dev/suggest-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { SUGGEST_DEFAULTS, type SuggestState } from '../../shared/suggest.ts';
import { HttpError } from '../auth.ts';
import { kvGet, openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { memorySchema } from '../memory/store.ts';
import { initPages } from '../pages/store.ts';
import { suggest, suggestService, cleanRequest } from './index.ts';
import { merge, readSettings, writeSettings } from './settings.ts';
import { cleanUser, extractTexts, htmlText, texText, writeTexts } from './texts.ts';
import { SMALL_MODEL_NEEDS } from './pins.ts';

const DATA = process.env.DATA_DIR ?? '';
if (!DATA.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.rmSync(DATA, { recursive: true, force: true });
fs.mkdirSync(DATA, { recursive: true });
process.env.CUDA_VISIBLE_DEVICES = '';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-ws-server-suggest-'));
// The engine's stand-ins: python is a script that ignores what it is asked to run and plays the part (the worker, or train.py).
const fakeDir = path.join(tmp, 'fake');
fs.mkdirSync(fakeDir);
const LOG = path.join(fakeDir, 'log.jsonl');
const fakePy = path.join(fakeDir, 'fake.py');
fs.writeFileSync(
  fakePy,
  String.raw`
import json, os, queue, sys, threading, time
here = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(here, 'log.jsonl')
def log(o):
    with open(LOG, 'a') as f: f.write(json.dumps(o) + '\n')
def out(o):
    sys.stdout.write(json.dumps(o) + '\n'); sys.stdout.flush()
args = sys.argv[1:]
if any(a.endswith('train.py') for a in args):
    a = {k: args[i + 1] for i, k in enumerate(args) if k.startswith('--') and i + 1 < len(args)}
    texts = open(a['--texts']).read().splitlines()
    log({'train': True, 'args': args, 'texts': len(texts), 'mode': oct(os.stat(a['--texts']).st_mode & 0o777), 'nice': os.nice(0)})
    out({'progress': {'done': 1, 'total': 2}, 'loss': 3.0})
    os.makedirs(a['--out'], exist_ok=True)
    open(os.path.join(a['--out'], 'model.safetensors'), 'w').write('weights')
    open(os.path.join(a['--out'], 'config.json'), 'w').write('{}')
    open(os.path.join(a['--out'], 'resume.pt'), 'w').write('state')
    out({'done': True, 'dev_nll': 3.2, 'tokens': 1234, 'seconds': 1, 'languages': {'eng_Latn': 1000}})
    sys.exit(0)
q = queue.Queue()
cancelled = set()
def reader():
    for line in sys.stdin:
        try: m = json.loads(line)
        except Exception: continue
        log({k: v for k, v in m.items() if k != 'texts'} | ({'texts': len(m['texts'])} if 'texts' in m else {}))
        if m.get('op') == 'cancel':
            cancelled.add(m['target']); out({'id': m['id'], 'ok': True}); continue
        q.put(m)
    q.put(None)
threading.Thread(target=reader, daemon=True).start()
out({'status': 'loading'}); out({'ready': True, 'rss': 100})
while True:
    m = q.get()
    if m is None: break
    op = m.get('op')
    if op == 'load': out({'id': m['id'], 'ok': True, 'model': 'personal' if m.get('personal_dir') else 'base', 'languages': {}})
    elif op == 'session': out({'id': m['id'], 'ok': True})
    elif op == 'stats': out({'id': m['id'], 'rss': 100, 'requests': 0, 'p50_ms': 1, 'p90_ms': 2})
    elif op == 'suggest':
        text = m.get('text', '')
        if 'slow' in text:
            end = time.time() + 3
            while time.time() < end and m['id'] not in cancelled: time.sleep(0.02)
            if m['id'] in cancelled: out({'id': m['id'], 'cancelled': True}); continue
        if 'block' in text: time.sleep(2.6)
        if 'broken' in text: out({'id': m['id'], 'error': 'no'}); continue
        out({'id': m['id'], 'word': 'ing', 'next': ' the', 'conf': 0.7, 'conf_next': 0.6, 'theta': 0.4, 'show': True, 'show_next': True, 'plan': 'slm', 'lang': 'eng_Latn', 'ms': {'total': 12, 'llm': 0, 'slm': 12}})
    else: out({'id': m['id'], 'error': 'unknown op'})
`,
);
const fakePython = path.join(fakeDir, 'python');
fs.writeFileSync(fakePython, `#!/bin/sh\nexec python3 -u "${fakePy}" "$@"\n`, { mode: 0o755 });
const fakeLlamaPy = path.join(fakeDir, 'llama.py');
fs.writeFileSync(
  fakeLlamaPy,
  String.raw`
import json, os, sys, time
from http.server import BaseHTTPRequestHandler, HTTPServer
here = os.path.dirname(os.path.abspath(__file__))
open(os.path.join(here, 'llama-args.json'), 'w').write(json.dumps(sys.argv[1:]))
port = int(sys.argv[sys.argv.index('--port') + 1])
class H(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200); self.send_header('content-type', 'application/json'); self.end_headers(); self.wfile.write(b'{"status":"ok"}')
    def log_message(self, *a): pass
time.sleep(0.4)
HTTPServer(('127.0.0.1', port), H).serve_forever()
`,
);
const fakeLlama = path.join(fakeDir, 'llama-server');
fs.writeFileSync(fakeLlama, `#!/bin/sh\nexec python3 -u "${fakeLlamaPy}" "$@"\n`, { mode: 0o755 });
const gguf = path.join(tmp, 'fake.gguf');
fs.writeFileSync(gguf, 'gguf');
const release = path.join(tmp, 'release');
for (const f of SMALL_MODEL_NEEDS) {
  fs.mkdirSync(path.dirname(path.join(release, f)), { recursive: true });
  fs.writeFileSync(path.join(release, f), '{}');
}
Object.assign(process.env, { HYDOR_SUGGEST_PYTHON: fakePython, HYDOR_SUGGEST_MODEL_DIR: release, HYDOR_SUGGEST_GGUF: gguf, HYDOR_SUGGEST_LLAMA_SERVER: fakeLlama });
delete process.env.HYDOR_SUGGEST;

const logLines = (): any[] => (fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<T>(what: string, fn: () => T | Promise<T>, ms = 15_000): Promise<NonNullable<T>> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v as NonNullable<T>;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await sleep(40);
  }
}
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const db = openDb(path.join(tmp, 'test.db'));
memorySchema(db);
initPages(db);
db.exec(`create table if not exists app_runs (id text primary key, key text); create table if not exists task_runs (id text primary key, key text);
  create table if not exists tasks (id text primary key, last_key text);`);

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

// ---- the settings --------------------------------------------------------------------------------------------------

test('settings: defaults, checked changes that merge, and what is kept is only what differs', () => {
  assert.deepEqual(readSettings(db), SUGGEST_DEFAULTS);
  assert.equal(readSettings(db).enabled, false, 'off until turned on');
  const a = merge(SUGGEST_DEFAULTS, { enabled: true, where: { docs: false }, sources: { notes: false }, precision: 0.5 }, true);
  assert.equal(a.enabled, true);
  assert.deepEqual(a.where, { chat: true, docs: false, notes: true, other: true });
  assert.deepEqual(a.sources, { messages: true, replies: true, notes: false, docs: true });
  assert.equal(SUGGEST_DEFAULTS.where.docs, true, 'the defaults are never changed');
  writeSettings(db, a);
  assert.deepEqual(JSON.parse(kvGet(db, 'suggest.settings')!), { enabled: true, where: { chat: true, docs: false, notes: true, other: true }, sources: { messages: true, replies: true, notes: false, docs: true }, precision: 0.5 });
  assert.deepEqual(readSettings(db), a);
  writeSettings(db, SUGGEST_DEFAULTS);
  assert.deepEqual(readSettings(db), SUGGEST_DEFAULTS);
});

test('settings: a wrong value is a 400 that names the field; limits are inclusive', () => {
  const bad = (patch: unknown, field: string) => assert.throws(() => merge(SUGGEST_DEFAULTS, patch, true), (e) => e instanceof HttpError && e.status === 400 && e.message.startsWith(field), field);
  bad({ enabled: 'yes' }, 'enabled');
  bad({ llm: 'maybe' }, 'llm');
  bad({ quant: 'q5' }, 'quant');
  bad({ schedule: 'daily' }, 'schedule');
  bad({ precision: 0.29 }, 'precision');
  bad({ precision: 0.61 }, 'precision');
  bad({ typedWords: 19 }, 'typedWords');
  bad({ typedWords: 100.5 }, 'typedWords');
  bad({ contextWords: -1 }, 'contextWords');
  bad({ threads: 33 }, 'threads');
  bad({ userWeight: 0 }, 'userWeight');
  bad({ userWeight: 17 }, 'userWeight');
  bad({ trainThreads: 65 }, 'trainThreads');
  bad({ where: { chats: true } }, 'where.chats');
  bad({ where: { chat: 1 } }, 'where.chat');
  bad({ sources: 'all' }, 'sources');
  bad({ nonsense: 1 }, 'nonsense');
  bad([], 'Send');
  const edge = merge(SUGGEST_DEFAULTS, { precision: 0.3, typedWords: 200, contextWords: 0, threads: 32, userWeight: 16, trainThreads: 64 }, true);
  assert.deepEqual([edge.precision, edge.typedWords, edge.contextWords, edge.threads, edge.userWeight, edge.trainThreads], [0.3, 200, 0, 32, 16, 64]);
  // What is kept and no longer valid reads as its default.
  assert.equal(merge(SUGGEST_DEFAULTS, { precision: 9, llm: 'x', enabled: true }, false).precision, SUGGEST_DEFAULTS.precision);
  assert.equal(merge(SUGGEST_DEFAULTS, { precision: 9, llm: 'x', enabled: true }, false).enabled, true);
});

test('requests are checked and kept to the end of long texts', () => {
  assert.throws(() => cleanRequest({ surface: 'mail', text: 'a' }), HttpError);
  assert.throws(() => cleanRequest({ surface: 'chat' }), HttpError);
  assert.throws(() => cleanRequest({ surface: 'chat', text: 'a', reply: 3 }), HttpError);
  const r = cleanRequest({ surface: 'chat', text: 'x'.repeat(5000) + 'END', reply: 'r', client: 'tab-1', session: 'claude:s' });
  assert.equal(r.text.length, 4000);
  assert.ok(r.text.endsWith('END'));
  assert.deepEqual([r.reply, r.client, r.session, r.prev], ['r', 'tab-1', 'claude:s', undefined]);
});

// ---- the routes ----------------------------------------------------------------------------------------------------

const app = Fastify();
const events: SuggestState[] = [];
suggest.routes?.({ app, db, broadcast: (e: any) => e.id === 'suggest' && events.push(e.data) } as unknown as Deps);
const svc = suggestService()!;
const get = async () => (await app.inject({ method: 'GET', url: '/api/suggest' })).json() as SuggestState;
const ask = (payload: Record<string, unknown>) => app.inject({ method: 'POST', url: '/api/suggest', payload });

test('routes: GET shows the defaults and off; PUT merges and refuses what is wrong; the route list is the spec’s', async () => {
  const s = await get();
  assert.equal(s.status.state, 'off');
  assert.deepEqual(s.settings, SUGGEST_DEFAULTS);
  assert.equal(s.status.model.kind, 'base');
  assert.equal(s.status.training.state, 'idle');
  const bad = await app.inject({ method: 'PUT', url: '/api/suggest', payload: { precision: 2 } });
  assert.equal(bad.statusCode, 400);
  assert.match(bad.json().message, /precision/);
  const ok = await app.inject({ method: 'PUT', url: '/api/suggest', payload: { where: { notes: false }, llm: 'off' } });
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(ok.json().settings.where, { chat: true, docs: true, notes: false, other: true });
  assert.equal(readSettings(db).llm, 'off', 'kept');
});

test('routes: 204 while it is off, and from a surface that is switched off', async () => {
  const off = await ask({ surface: 'chat', text: 'Hello wor' });
  assert.equal(off.statusCode, 204);
  assert.equal((await app.inject({ method: 'POST', url: '/api/suggest/train' })).statusCode, 409, 'nothing to train while it is off');
  assert.equal(svc.pids().worker, undefined, 'nothing started while off');
  await app.inject({ method: 'PUT', url: '/api/suggest', payload: { enabled: true, where: { docs: false, notes: false, other: false } } });
  assert.equal((await ask({ surface: 'doc', text: 'Hello wor' })).statusCode, 204, 'documents are switched off');
  assert.equal((await ask({ surface: 'text', text: 'Hello wor' })).statusCode, 204, 'so are notes and other boxes');
  assert.equal(logLines().length, 0, 'and the worker never started for them');
});

test('routes: not ready is 204 and starts the worker; then a suggestion comes back with the settings in the request to the worker', async () => {
  const first = await ask({ surface: 'chat', text: 'Hello wor', client: 'tab-a' });
  assert.equal(first.statusCode, 204, 'the worker is not up yet');
  await until('the worker to load', async () => logLines().some((l) => l.op === 'load'));
  const s = await until('a ready state', async () => ((await get()).status.state === 'ready' && svc.pids().worker ? await get() : null));
  assert.equal(s.status.model.kind, 'base');
  const r = await until('a suggestion', async () => {
    const x = await ask({ surface: 'chat', text: 'Hello wor', client: 'tab-a', reply: 'The previous reply', prev: 'before' });
    return x.statusCode === 200 ? x : null;
  });
  assert.deepEqual(r.json(), { word: 'ing', next: ' the', conf: 0.7, confNext: 0.6, show: true, showNext: true, plan: 'slm', lang: 'eng_Latn', ms: 12 });
  const load = logLines().find((l) => l.op === 'load');
  assert.equal(load.model_dir, release);
  assert.equal(load.personal_dir, null);
  assert.equal(load.llm_url, null, 'the language model is off');
  assert.equal(load.threads, 2);
  assert.deepEqual(load.options, { k: 1000 });
  const sug = logLines().filter((l) => l.op === 'suggest').pop();
  assert.deepEqual(
    { ...sug, id: undefined },
    { id: undefined, op: 'suggest', surface: 'chat', text: 'Hello wor', reply: 'The previous reply', prev: 'before', precision: 0.4, next: true, cache: false, switch: true, typed_words: 100, context_words: 100 },
  );
  // The settings go with each request: the next word off hides it.
  await app.inject({ method: 'PUT', url: '/api/suggest', payload: { nextWord: false, precision: 0.5, typedWords: 50, contextWords: 20 } });
  const r2 = (await ask({ surface: 'chat', text: 'Hello wor' })).json();
  assert.deepEqual([r2.next, r2.showNext, r2.confNext], ['', false, 0]);
  const sug2 = logLines().filter((l) => l.op === 'suggest').pop();
  assert.deepEqual([sug2.precision, sug2.next, sug2.typed_words, sug2.context_words], [0.5, false, 50, 20]);
  await app.inject({ method: 'PUT', url: '/api/suggest', payload: { nextWord: true, precision: 0.4, typedWords: 100, contextWords: 100 } });
  // A worker's error line is nothing to show.
  assert.equal((await ask({ surface: 'chat', text: 'broken' })).statusCode, 204);
  assert.ok((await get()).status.stats!.requests >= 2);
  // The page hears of the changes.
  await sleep(400);
  assert.ok(events.length >= 1 && events.some((e) => e.status.state === 'ready'), 'the page is sent the state as it changes');
});

test('a newer suggestion of the same tab cancels the one before; another tab’s stays', async () => {
  const before = logLines().length;
  const a = ask({ surface: 'chat', text: 'slow one', client: 'tab-1' });
  await until('the first to reach the worker', async () => logLines().slice(before).some((l) => l.op === 'suggest' && l.text === 'slow one'));
  const other = ask({ surface: 'chat', text: 'other tab', client: 'tab-2' });
  const b = ask({ surface: 'chat', text: 'newer', client: 'tab-1' });
  const [ra, rb, ro] = await Promise.all([a, b, other]);
  assert.equal(ra.statusCode, 204, 'the older one gets nothing');
  assert.equal(rb.statusCode, 200);
  assert.equal(ro.statusCode, 200, 'the other tab’s request is its own');
  const log = logLines().slice(before);
  const first = log.find((l) => l.op === 'suggest' && l.text === 'slow one');
  assert.ok(log.some((l) => l.op === 'cancel' && l.target === first.id), 'the worker was told to stop it');
  // One still waiting in the queue goes without troubling the worker.
  const c = ask({ surface: 'chat', text: 'slow two', client: 'tab-3' });
  await until('it is running', async () => logLines().some((l) => l.text === 'slow two'));
  const d = ask({ surface: 'chat', text: 'waits', client: 'tab-4' });
  const e = ask({ surface: 'chat', text: 'waits more', client: 'tab-4' });
  assert.equal((await d).statusCode, 204);
  svc.warm();
  await app.inject({ method: 'POST', url: '/api/suggest', payload: { surface: 'chat', text: 'x', client: 'tab-3' } });
  assert.equal((await c).statusCode, 204);
  assert.equal((await e).statusCode, 200);
  assert.equal(logLines().filter((l) => l.op === 'suggest' && l.text === 'waits').length, 0, 'the waiting one never reached the worker');
});

test('an aborted request is cancelled in the worker, and one that waits more than two seconds is dropped', async () => {
  const ac = new AbortController();
  const before = logLines().length;
  const p = svc.suggest({ surface: 'chat', text: 'slow abort', client: 'tab-x' }, ac.signal);
  await until('it to reach the worker', async () => logLines().slice(before).find((l) => l.op === 'suggest' && l.text === 'slow abort'));
  ac.abort();
  assert.equal(await p, null);
  const sent = logLines().slice(before).find((l) => l.text === 'slow abort');
  await until('the cancel', async () => logLines().slice(before).some((l) => l.op === 'cancel' && l.target === sent.id));
  // The worker is busy for 2.6 s; the next request waits more than two seconds and is dropped, one made later is answered.
  const blocked = ask({ surface: 'chat', text: 'block', client: 'tab-b1' });
  await sleep(100);
  const late = ask({ surface: 'chat', text: 'late', client: 'tab-b2' });
  const [rb, rl] = await Promise.all([blocked, late]);
  assert.equal(rb.statusCode, 200);
  assert.equal(rl.statusCode, 204, 'it waited more than two seconds');
  assert.equal(logLines().filter((l) => l.op === 'suggest' && l.text === 'late').length, 0);
  assert.equal((await ask({ surface: 'chat', text: 'later', client: 'tab-b2' })).statusCode, 200);
});

test('the session cache is fed once per session, and again when the session has grown', async () => {
  const ins = db.prepare('insert into chunk_text (key, kind, ts, text) values (?, ?, ?, ?)');
  ins.run('claude:cache', 'user', 1, 'Please check the vector index');
  ins.run('claude:cache', 'assistant', 2, 'The vector index is fine.');
  const sessionOps = () => logLines().filter((l) => l.op === 'session' && l.session === 'claude:cache');
  await ask({ surface: 'chat', text: 'a', session: 'claude:cache' });
  await until('the session text', async () => sessionOps().length === 1);
  assert.equal(sessionOps()[0].texts, 2);
  await ask({ surface: 'chat', text: 'ab', session: 'claude:cache' });
  await ask({ surface: 'chat', text: 'abc', session: 'claude:cache' });
  assert.equal(sessionOps().length, 1, 'not again while nothing grew');
  ins.run('claude:cache', 'user', 3, '<system-reminder>noted</system-reminder>One more message');
  await ask({ surface: 'chat', text: 'abcd', session: 'claude:cache' });
  await until('the second feed', async () => sessionOps().length === 2);
  assert.equal(sessionOps()[1].texts, 3);
  const suggestOp = logLines().filter((l) => l.op === 'suggest' && l.session === 'claude:cache').pop();
  assert.equal(suggestOp.cache, true);
  // With the setting off, nothing is fed and the cache is not used.
  await app.inject({ method: 'PUT', url: '/api/suggest', payload: { sessionCache: false } });
  ins.run('claude:cache', 'user', 4, 'And another');
  await ask({ surface: 'chat', text: 'abcde', session: 'claude:cache' });
  assert.equal(sessionOps().length, 2);
  assert.equal(logLines().filter((l) => l.op === 'suggest').pop().cache, false);
  await app.inject({ method: 'PUT', url: '/api/suggest', payload: { sessionCache: true } });
});

test('the language model: started with llama-server’s flags, given to the worker, and taken away when it is turned off', async () => {
  const put = (payload: object) => app.inject({ method: 'PUT', url: '/api/suggest', payload });
  await put({ llm: 'on', quant: 'q4' });
  await ask({ surface: 'chat', text: 'wake up the language model', client: 'tab-l' });
  const url = await until('the language model to be ready', async () => ((await get()).status.llm.state === 'ready' ? svc.llm.url : null));
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/);
  const args: string[] = JSON.parse(fs.readFileSync(path.join(fakeDir, 'llama-args.json'), 'utf8'));
  const port = url.split(':').pop()!;
  assert.deepEqual(args, ['-m', gguf, '-t', String(Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2)))), '-np', '1', '-c', '2048', '--host', '127.0.0.1', '--port', port, '--no-webui']);
  await until('the worker to be told its address', async () => logLines().filter((l) => l.op === 'load').pop()?.llm_url === url);
  const pid = svc.pids().llm!;
  assert.ok(alive(pid));
  await put({ llm: 'off' });
  await until('the worker to be told there is none', async () => logLines().filter((l) => l.op === 'load').pop()?.llm_url === null);
  await until('llama-server to stop', async () => !alive(pid));
  const st = (await get()).status.llm;
  assert.equal(st.state, 'off');
  assert.match(st.detail ?? '', /Turned off/);
  // Too little memory in "auto": the small model alone, and the status says why (this computer's own memory decides).
  await put({ llm: 'auto' });
  const auto = (await get()).status.llm;
  if (os.totalmem() / 2 ** 20 < 7.5 * 1024) assert.equal(auto.state, 'memory');
  await put({ llm: 'off' });
});

test('turning it off stops the worker; a clean slate afterwards', async () => {
  const pid = svc.pids().worker!;
  assert.ok(pid && alive(pid));
  const s = await app.inject({ method: 'PUT', url: '/api/suggest', payload: { enabled: false } });
  assert.equal(s.json().status.state, 'off');
  await until('the worker to stop', async () => !alive(pid));
  assert.equal(svc.pids().worker, undefined);
  assert.equal((await ask({ surface: 'chat', text: 'Hello' })).statusCode, 204);
});

// ---- the texts -----------------------------------------------------------------------------------------------------

test('the filters: what was never typed is cut out of a message, and what is left is the typed words', () => {
  assert.equal(cleanUser('Fix the build please'), 'Fix the build please');
  assert.equal(cleanUser('<system-reminder>Context: secret</system-reminder>Fix the build'), 'Fix the build');
  assert.equal(cleanUser('Look at this <pasted_content name="x">lots of pasted text</pasted_content> please').replace(/\s+/g, ' '), 'Look at this please');
  assert.equal(cleanUser('<ide_selection>int x;</ide_selection>Why is x unused?'), 'Why is x unused?');
  assert.equal(cleanUser('# Context from my IDE setup:\n\n## Active file: a.ts\n\n## My request for Codex:\nrename it\n'), 'rename it');
  assert.equal(cleanUser('# Files mentioned by the user:\n\n## a.ts'), '');
  for (const injected of [
    '[Reply from the Hydor subagent “x”]\n\nDone.',
    '[Cross-session message from claude:abc]\nhello',
    '[Build finished]',
    'Message from the session that started you: do this',
    '<task-notification>done</task-notification>',
    '<local-command-stdout>ok</local-command-stdout>',
    'Another Claude session sent a message: hi',
    'Continue where you left off.',
    'Work reached its usage limit',
    '<environment_context><cwd>/x</cwd></environment_context>',
    '[Request interrupted by user]',
  ])
    assert.equal(cleanUser(injected), '', injected);
  assert.equal(htmlText('<html><head><title>t</title><style>p{}</style></head><body><p>First &amp; second</p><script>x()</script><p>Third</p></body></html>'), 'First & second\n\nThird');
  assert.match(texText('\\documentclass{article}\\begin{document}\\section{Intro} We study words. $x^2$ \\begin{table}no\\end{table} Done. % hidden\n\\end{document}'), /We study words\.\s+Done\./);
});

const sess = db.prepare("insert into sessions (key, agent, id, path, cwd, source, parent_key, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)");
const appSess = db.prepare('insert into app_sessions (key, agent, extra, created_at, updated_at) values (?, ?, ?, 1, 1)');
const chunk = db.prepare('insert into chunk_text (key, kind, ts, text) values (?, ?, ?, ?)');
const T0 = 1_000_000;

test('the texts: the person’s typed words with the reply they answered, agents’ replies, notes and documents they wrote', async () => {
  // A session the person typed in, which a peer session also wrote into (known from its transcript).
  const transcript = path.join(tmp, 'transcript.jsonl');
  fs.writeFileSync(
    transcript,
    [
      { type: 'user', message: { content: 'hello there' } },
      { type: 'user', message: { content: [{ type: 'text', text: 'Another Claude session sent a message from claude:peer\n<cross-session-message from="claude:peer">Please rebase your branch on main now.</cross-session-message>' }] } },
    ].map((l) => JSON.stringify(l)).join('\n') + '\n',
  );
  sess.run('claude:typed', 'claude', 'typed', transcript, '/home/x/project', 'cli', null, 10);
  appSess.run('claude:typed', 'claude', '{}');
  chunk.run('claude:typed', 'user', T0 + 1, 'Add a word suggestions setting to the page');
  chunk.run('claude:typed', 'assistant', T0 + 2, 'I added the setting and wired it to the server.');
  chunk.run('claude:typed', 'assistant', T0 + 3, 'It is switched on by default for everyone.');
  chunk.run('claude:typed', 'user', T0 + 4, '<system-reminder>the date is today</system-reminder>Make it off by default instead');
  chunk.run('claude:typed', 'user', T0 + 5, 'Please rebase your branch on main now.');
  chunk.run('claude:typed', 'user', T0 + 6, '[Reply from the Hydor subagent “checker”]\n\nAll good.');
  chunk.run('claude:typed', 'user', T0 + 7, 'This is a run of the scheduled task “Daily” (every day), started on its schedule. It is now noon.\nReport when done.\n\nDo the daily thing.');
  chunk.run('claude:typed', 'user', T0 + 8, 'x'.repeat(4000));
  chunk.run('claude:typed', 'assistant', T0 + 9, 'ok');
  chunk.run('claude:typed', 'user', T0 + 10, 'Thanks, that works well');
  // A fork of it repeats a message at the same time: it is read once.
  sess.run('claude:fork', 'claude', 'fork', '', '/home/x/project', 'cli', null, 20);
  appSess.run('claude:fork', 'claude', '{}');
  chunk.run('claude:fork', 'user', T0 + 1, 'Add a word suggestions setting to the page');
  // Sessions that are not the person's typing, or that may not be read.
  sess.run('claude:child', 'claude', 'child', '', '/home/x/project', 'cli', 'claude:typed', 11);
  appSess.run('claude:child', 'claude', '{}');
  chunk.run('claude:child', 'user', T0 + 20, 'Child session instruction that nobody typed');
  chunk.run('claude:child', 'assistant', T0 + 21, 'The child agent replies with a long enough sentence.');
  sess.run('claude:started-by-app', 'claude', 'sba', '', '/home/x/project', 'cli', null, 12);
  appSess.run('claude:started-by-app', 'claude', JSON.stringify({ app: 'weather' }));
  chunk.run('claude:started-by-app', 'user', T0 + 22, 'An app started this session with its own prompt');
  sess.run('claude:secret', 'claude', 'secret', '', '/home/x/project', 'cli', null, 13);
  appSess.run('claude:secret', 'claude', JSON.stringify({ confidential: true }));
  chunk.run('claude:secret', 'user', T0 + 23, 'Confidential words that must never be learned');
  sess.run('claude:nomem', 'claude', 'nomem', '', '/home/x/project', 'cli', null, 14);
  appSess.run('claude:nomem', 'claude', JSON.stringify({ memory: false }));
  chunk.run('claude:nomem', 'user', T0 + 24, 'Memory is off in this session');
  sess.run('claude:script', 'claude', 'script', '', '/tmp/scratch', 'sdk-cli', null, 15);
  chunk.run('claude:script', 'user', T0 + 25, 'A script sent this through the SDK');
  db.prepare("insert into app_runs (id, key) values ('r1', 'claude:ran')").run();
  sess.run('claude:ran', 'claude', 'ran', '', '/home/x/project', 'cli', null, 16);
  appSess.run('claude:ran', 'claude', '{}');
  chunk.run('claude:ran', 'user', T0 + 26, 'An app run started this one');
  // Notes and pages.
  const note = db.prepare("insert into memory_entries (scope, scope_key, kind, text, status, created_at, updated_at, source) values ('global', '', 'note', ?, 'active', ?, ?, ?)");
  note.run('I prefer short replies without bullet points.', T0 + 30, T0 + 30, 'user');
  note.run('An agent wrote this note about the user.', T0 + 31, T0 + 31, 'agent');
  note.run('The tidy-up wrote this note about the user.', T0 + 32, T0 + 32, 'auto');
  const page = db.prepare('insert into pages (id, title, version, created_at, updated_at, link_nonce, kind) values (?, ?, 1, ?, ?, ?, ?)');
  const ver = db.prepare("insert into page_versions (page_id, version, title, html, bytes, created_at, by) values (?, 1, ?, ?, 1, ?, ?)");
  page.run('p1', 'Mine', T0, T0, 'n1', null);
  ver.run('p1', 'Mine', '<p>This paragraph I wrote myself in a page of my own.</p>', T0 + 40, 'user');
  page.run('p2', 'Theirs', T0, T0, 'n2', null);
  ver.run('p2', 'Theirs', '<p>This paragraph an agent made for me in a page.</p>', T0 + 41, 'agent');
  page.run('p3', 'Letter', T0, T0, 'n3', 'tex');
  ver.run('p3', 'Letter', '\\begin{document}Dear friend, I hope this letter finds you well.\\end{document}', T0 + 42, 'edit');

  const all = { messages: true, replies: true, notes: true, docs: true };
  const lines = await extractTexts(db, { since: 0, sources: all });
  const users = lines.filter((l) => l.kind === 'user').map((l) => [l.text, l.session, l.reply ?? null]);
  assert.deepEqual(users, [
    ['Add a word suggestions setting to the page', 'claude:typed', null],
    ['Make it off by default instead', 'claude:typed', 'I added the setting and wired it to the server.\n\nIt is switched on by default for everyone.'],
    ['Thanks, that works well', 'claude:typed', 'ok'],
  ]);
  const agents = lines.filter((l) => l.kind === 'agent').map((l) => l.text);
  assert.deepEqual(agents, ['I added the setting and wired it to the server.', 'It is switched on by default for everyone.'], 'replies of the typed session, not the child’s, and not the 2-letter one');
  const docs = lines.filter((l) => l.kind === 'doc').map((l) => l.text).sort();
  assert.deepEqual(docs, ['Dear friend, I hope this letter finds you well.', 'I prefer short replies without bullet points.', 'This paragraph I wrote myself in a page of my own.'].sort());
  const everything = JSON.stringify(lines);
  for (const never of ['Child session', 'An app started', 'Confidential', 'Memory is off', 'A script sent', 'An app run', 'Reply from', 'rebase your branch', 'Do the daily thing', 'the date is today', 'agent wrote this note', 'tidy-up wrote', 'an agent made'])
    assert.ok(!everything.includes(never), `${never} is not learned from`);
  // Each source has its switch; since a time reads only what is newer.
  const only = async (sources: object, since = 0) => (await extractTexts(db, { since, sources: { messages: false, replies: false, notes: false, docs: false, ...sources } })).map((l) => l.kind);
  assert.deepEqual(await only({ messages: true }), ['user', 'user', 'user']);
  assert.deepEqual(await only({ replies: true }), ['agent', 'agent']);
  assert.deepEqual(await only({ notes: true }), ['doc']);
  assert.deepEqual(await only({ docs: true }), ['doc', 'doc']);
  assert.deepEqual(await only({}), []);
  const later = await extractTexts(db, { since: T0 + 5, sources: all });
  assert.deepEqual(
    later.filter((l) => l.kind === 'user').map((l) => l.text),
    ['Thanks, that works well'],
  );
  assert.equal(later.filter((l) => l.kind === 'user')[0].reply, 'ok');
  // Written as JSON lines for train.py, private to the owner.
  const file = path.join(tmp, 'texts.jsonl');
  const n = await writeTexts(db, file, { since: 0, sources: all });
  assert.deepEqual(n, { user: 3, agent: 2, doc: 3 });
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const parsed = fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(parsed.length, 8);
  assert.ok(parsed.every((l) => ['user', 'agent', 'doc'].includes(l.kind) && typeof l.text === 'string' && typeof l.ts === 'number'));
  // Memory turned off for the whole app: no session is read.
  db.prepare("insert into kv (k, v) values ('memory.enabled', '0')").run();
  assert.deepEqual(await only({ messages: true, replies: true }), []);
  db.prepare("delete from kv where k = 'memory.enabled'").run();
});

// ---- personalising -------------------------------------------------------------------------------------------------

test('personalising: now, at the lowest priority; the new model takes the old one’s place; forgetting returns to the small model', async () => {
  const put = (payload: object) => app.inject({ method: 'PUT', url: '/api/suggest', payload });
  await put({ enabled: true, personalise: true, trainThreads: 3, userWeight: 6, schedule: 'manual' });
  const personal = path.join(DATA, 'suggest', 'personal');
  assert.equal((await get()).status.training.state, 'idle', 'manual: nothing is waiting');
  const r = await app.inject({ method: 'POST', url: '/api/suggest/train' });
  assert.equal(r.statusCode, 200);
  await until('the model to be in place', async () => fs.existsSync(path.join(personal, 'model.safetensors')), 20_000);
  const s = await until('the status after training', async () => {
    const x = await get();
    return x.status.training.state === 'idle' && x.status.model.kind === 'personal' ? x : null;
  });
  assert.equal(s.status.model.tokens, 1234);
  assert.deepEqual(s.status.model.languages, { eng_Latn: 1000 });
  assert.ok(s.status.model.trainedAt! > Date.now() - 60_000);
  assert.ok(s.status.training.lastAt);
  const t = logLines().find((l) => l.train);
  assert.equal(t.mode, '0o600', 'the texts are the owner’s alone');
  assert.ok(t.texts >= 8, 'every text was handed over');
  assert.equal(t.nice, 19, 'at the lowest priority');
  const a = t.args as string[];
  const opt = (k: string) => a[a.indexOf(k) + 1];
  assert.equal(opt('--threads'), '3');
  assert.equal(opt('--w-user'), '6');
  assert.equal(opt('--base'), release);
  assert.equal(opt('--init'), release, 'the first run starts from the small model');
  assert.equal(opt('--replay'), path.join(release, 'replay'));
  assert.equal(opt('--out'), path.join(personal, 'train', 'out'));
  assert.ok(a.includes('--resume') && a.includes('-I'));
  assert.ok(!fs.existsSync(path.join(personal, 'train', 'texts.jsonl')), 'the texts are deleted');
  assert.ok(!fs.existsSync(path.join(personal, 'resume.pt')), 'the resume state does not stay in the model');
  assert.ok(!fs.existsSync(`${personal}.next`) && !fs.existsSync(`${personal}.prev`));
  assert.ok(fs.existsSync(path.join(personal, 'state.json')));
  // The worker is told to load it once it runs.
  await ask({ surface: 'chat', text: 'wake the worker' });
  await until('the worker to load the personal model', async () => logLines().filter((l) => l.op === 'load').pop()?.personal_dir === personal);
  await until('the model it says it uses', async () => ((await get()).status.model.kind === 'personal' ? true : null));
  // The second run reads from the personal model, and only what is new (nothing new: nothing to do).
  const before = logLines().filter((l) => l.train).length;
  await app.inject({ method: 'POST', url: '/api/suggest/train' });
  await until('the second run to finish', async () => (await get()).status.training.state !== 'running' && !svcActive());
  assert.equal(logLines().filter((l) => l.train).length, before, 'nothing new to learn from, so train.py did not run');
  assert.match((await get()).status.training.detail ?? '', /Nothing new/);
  chunk.run('claude:typed', 'user', Date.now() + 1000, 'A brand new message after the first run');
  await app.inject({ method: 'POST', url: '/api/suggest/train' });
  await until('the second run', async () => logLines().filter((l) => l.train).length === before + 1);
  await until('it is over', async () => !svcActive());
  const t2 = logLines().filter((l) => l.train).pop();
  assert.equal(t2.args[t2.args.indexOf('--init') + 1], personal, 'later runs start from the personal model');
  assert.equal(t2.texts, 1, 'and read only the new text');
  // Forget it.
  const f = await app.inject({ method: 'DELETE', url: '/api/suggest/personal' });
  assert.equal(f.json().status.model.kind, 'base');
  assert.ok(!fs.existsSync(personal));
  await until('the worker to load the small model again', async () => logLines().filter((l) => l.op === 'load').pop()?.personal_dir === null);
  // "Learn from what I write" off refuses to train.
  await put({ personalise: false });
  assert.equal((await app.inject({ method: 'POST', url: '/api/suggest/train' })).statusCode, 409);
});
const svcActive = () => svc.trainer.active;

test('personalising: the schedule waits for the gap and for a quiet ten minutes', async () => {
  await app.inject({ method: 'PUT', url: '/api/suggest', payload: { personalise: true, schedule: 'nightly' } });
  const now = Date.now();
  const s = (await get()).status.training;
  assert.equal(s.state, 'waiting');
  assert.ok(s.next && s.next > now - 1000, 'a time is given');
  // The last run was a moment ago: not due for 20 hours.
  assert.equal(svc.trainDue(now), false);
  assert.equal(svc.trainDue(now + 19 * 3600_000), false);
  // After the gap it is due when nothing was typed for ten minutes, not while someone types.
  const quiet = Math.max(Date.now(), T0 + 100_000) + 21 * 3600_000;
  db.prepare("insert into app_sessions (key, agent, extra, created_at, updated_at) values ('claude:now', 'claude', '{}', 1, 1) on conflict(key) do nothing").run();
  chunk.run('claude:now', 'user', quiet - 5 * 60_000, 'typing right now');
  assert.equal(svc.trainDue(quiet), false, 'typed five minutes ago');
  assert.equal(svc.trainDue(quiet + 6 * 60_000), true, 'quiet for eleven minutes');
  await app.inject({ method: 'PUT', url: '/api/suggest', payload: { schedule: 'weekly' } });
  assert.equal(svc.trainDue(quiet + 6 * 60_000), false, 'weekly waits longer');
  await app.inject({ method: 'PUT', url: '/api/suggest', payload: { schedule: 'manual' } });
  assert.equal(svc.trainDue(quiet + 400 * 3600_000), false, 'manual never starts by itself');
  assert.equal((await get()).status.training.next, undefined);
});

test('setup says why when the model is not published and none was given', async () => {
  const saved = process.env.HYDOR_SUGGEST_MODEL_DIR;
  delete process.env.HYDOR_SUGGEST_MODEL_DIR;
  try {
    const own = new (await import('./service.ts')).SuggestService(db);
    own.configure({ enabled: false });
    own.configure({ enabled: true });
    await until('it to fail', async () => own.state().status.state === 'failed');
    assert.equal(own.state().status.detail, 'The word-suggestion model is not published yet');
    own.stop();
  } finally {
    process.env.HYDOR_SUGGEST_MODEL_DIR = saved;
  }
});

const only = process.argv[2];
for (const [name, fn] of tests) {
  if (only && !name.includes(only)) continue;
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}\n${(e as Error).stack ?? e}`);
  }
}
console.log(`${passed}/${tests.filter(([n]) => !only || n.includes(only)).length} passed`);
suggestService()?.stop();
await app.close();
db.close();
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(passed === tests.filter(([n]) => !only || n.includes(only)).length ? 0 : 1);
