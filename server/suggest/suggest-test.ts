// Checks for word suggestions' server: the settings (checked, merged, kept), the routes with a stand-in for the Python
// worker and for llama-server (a script that answers the protocol), a newer suggestion cancelling the one before, the
// texts personalising learns from (on a scratch database, with the injected text that is never typed), and a run of
// personalising with a stand-in for train.py. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/suggest/suggest-test.ts && DATA_DIR=/tmp/hydor-ws-server-test-1 node dist/dev/suggest-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';
import Fastify from 'fastify';
import { SUGGEST_DEFAULTS, type SuggestState } from '../../shared/suggest.ts';
import { HttpError } from '../auth.ts';
import { kvGet, kvSet, openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { memorySchema } from '../memory/store.ts';
import { initPages } from '../pages/store.ts';
import { downloadFiles } from '../memory/embed.ts';
import { suggest, suggestService, cleanRequest } from './index.ts';
import { LlamaServer } from './llm.ts';
import { killAll, reapLeftovers, track } from './procs.ts';
import { retryAfter, SuggestService } from './service.ts';
import { run as runCommand, unsupportedSystem, withStall } from './setup.ts';
import { chooseDevice, bestGpu, parseCuda, parseGpus, tagSuits, visibleCards, wheelTag, type DevicePick } from './gpu.ts';
import { GRACE, gpuHold, personalDir, recoverPersonal } from './train.ts';
import { merge, readSettings, writeSettings } from './settings.ts';
import { cleanUser, extractTexts, htmlText, texText, writeTexts } from './texts.ts';
import { SMALL_MODEL_NEEDS } from './pins.ts';
import { addUsage, cleanUsage, dayBefore, dayKey, readUsage, resetUsage, USAGE_KEY } from './usage.ts';

const DATA = process.env.DATA_DIR ?? '';
if (!DATA.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.rmSync(DATA, { recursive: true, force: true });
fs.mkdirSync(DATA, { recursive: true });
process.env.CUDA_VISIBLE_DEVICES = '';
// No graphics card is asked about, not even by looking: nvidia-smi is a program that does not exist (a test that needs one gives its own).
process.env.HYDOR_SUGGEST_NVIDIA_SMI = '/nonexistent/nvidia-smi';

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
    import hashlib
    raw = open(a['--texts'], 'rb').read()
    texts = raw.decode().splitlines()
    flag = lambda n: os.path.exists(os.path.join(here, n))
    log({'train': True, 'args': args, 'texts': len(texts), 'sha': hashlib.sha256(raw).hexdigest(), 'mode': oct(os.stat(a['--texts']).st_mode & 0o777), 'nice': os.nice(0), 'cvd': os.environ.get('CUDA_VISIBLE_DEVICES'), 'order': os.environ.get('CUDA_DEVICE_ORDER')})
    out({'progress': {'done': 1, 'total': 2}, 'loss': 3.0})
    os.makedirs(a['--out'], exist_ok=True)
    if flag('trainslowterm'):
        import signal
        def slow(signum, frame):
            time.sleep(1.0)
            log({'termsaved': True})
            sys.exit(143)
        signal.signal(signal.SIGTERM, slow)
    if flag('trainhold'):
        while flag('trainhold'): time.sleep(0.05)
    if flag('trainfail'): sys.exit(1)
    if flag('traingpufail') and a.get('--device') == 'cuda': sys.exit(1)
    if flag('trainnothing'): sys.exit(3)
    if flag('traincode2'): sys.exit(2)
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
log({'boot': os.getpid()})
if os.path.exists(os.path.join(here, 'slowstart')): time.sleep(2)
out({'status': 'loading'}); out({'ready': True, 'rss': 100})
while True:
    m = q.get()
    if m is None: break
    op = m.get('op')
    if op == 'load':
        if os.path.exists(os.path.join(here, 'slowload')): time.sleep(1.5)
        out({'id': m['id'], 'ok': True, 'model': 'personal' if m.get('personal_dir') else 'base', 'languages': {}})
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
  assert.equal(readSettings(db).enabled, true, 'on from the start');
  const a = merge(SUGGEST_DEFAULTS, { enabled: false, where: { docs: false }, sources: { notes: false }, precision: 0.5 }, true);
  assert.equal(a.enabled, false);
  assert.deepEqual(a.where, { chat: true, docs: false, notes: true, other: true });
  assert.deepEqual(a.sources, { messages: true, replies: true, notes: false, docs: true });
  assert.equal(SUGGEST_DEFAULTS.where.docs, true, 'the defaults are never changed');
  writeSettings(db, a);
  assert.deepEqual(JSON.parse(kvGet(db, 'suggest.settings')!), { enabled: false, where: { chat: true, docs: false, notes: true, other: true }, sources: { messages: true, replies: true, notes: false, docs: true }, precision: 0.5 });
  assert.deepEqual(readSettings(db), a);
  writeSettings(db, SUGGEST_DEFAULTS);
  assert.deepEqual(readSettings(db), SUGGEST_DEFAULTS);
});

test('on by default, it waits to be used: no personalising scheduled until a message box asks, and a warm-up marks it used', async () => {
  const db2 = openDb(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-suggest-used-')), 'used.db'));
  memorySchema(db2);
  initPages(db2);
  const own = new SuggestService(db2);
  try {
    assert.equal(own.state().settings.enabled, true);
    const later = Date.now() + 30 * 24 * 3600_000;
    assert.equal(own.trainDue(later), false, 'never used: nothing to personalise');
    assert.equal(own.state().status.training.next, undefined);
    assert.ok(!kvGet(db2, 'suggest.used'), 'not used yet');
    own.warm();
    assert.ok(Number(kvGet(db2, 'suggest.used')) > 0, 'a message box used marks it');
    assert.equal(own.trainDue(later), true, 'from then on the schedule runs');
  } finally {
    own.stop();
  }
});

test('before first use it is waiting (nothing downloaded), and a setup that fails waits longer each time to be tried again', async () => {
  assert.deepEqual([0, 1, 2, 3, 4, 8, 9, 50].map(retryAfter), [10, 10, 20, 40, 80, 1280, 1440, 1440].map((m) => m * 60_000));
  const was = process.env.HYDOR_SUGGEST_PYTHON;
  // A Python that is not there: the setup fails at once, as one that cannot download would.
  process.env.HYDOR_SUGGEST_PYTHON = path.join(tmp, 'no-such-python');
  const db3 = openDb(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-suggest-retry-')), 'retry.db'));
  memorySchema(db3);
  initPages(db3);
  const own = new SuggestService(db3);
  const priv = own as unknown as { failure: { at: number } | null; failedTimes: number };
  try {
    const first = own.state().status;
    assert.equal(first.state, 'waiting', 'on, never used, not set up');
    assert.match(first.detail ?? '', /first time you type/);
    own.warm();
    await until('the setup to fail', () => own.state().status.state === 'failed');
    assert.equal(priv.failedTimes, 1);
    assert.equal(own.state().status.training.next, undefined, 'no learning run promised while it is not set up');
    // Within its wait a message box used again does not try again.
    own.warm();
    await sleep(100);
    assert.equal(priv.failedTimes, 1, 'not again within ten minutes');
    priv.failure!.at -= retryAfter(1) + 1000;
    own.warm();
    await until('the second try to fail', () => priv.failedTimes === 2);
    // Ten minutes after the second failure is not enough: it waits twenty.
    priv.failure!.at -= retryAfter(1) + 1000;
    own.warm();
    await sleep(100);
    assert.equal(priv.failedTimes, 2, 'the second failure waits twenty minutes');
    // Turning it off and on tries at once, counting from the start again.
    own.configure({ enabled: false });
    own.configure({ enabled: true });
    await until('the try the switch started to fail', () => own.state().status.state === 'failed' && priv.failedTimes === 1);
  } finally {
    own.stop();
    process.env.HYDOR_SUGGEST_PYTHON = was;
  }
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
  bad({ trainGpu: 'yes' }, 'trainGpu');
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

test('routes: GET shows the defaults, on but nothing started; off when turned off; PUT merges and refuses what is wrong', async () => {
  const on = await get();
  assert.deepEqual(on.settings, SUGGEST_DEFAULTS);
  assert.equal(on.settings.enabled, true, 'on from the start');
  assert.notEqual(on.status.state, 'off');
  assert.equal(svc.pids().worker, undefined, 'nothing starts before a message box is used');
  // Turned off for what follows (each test goes on from the one before).
  const s = (await app.inject({ method: 'PUT', url: '/api/suggest', payload: { enabled: false } })).json() as SuggestState;
  assert.equal(s.status.state, 'off');
  assert.equal(s.settings.enabled, false);
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
    { id: undefined, op: 'suggest', surface: 'chat', text: 'Hello wor', reply: 'The previous reply', prev: 'before', precision: 0.3, next: true, cache: false, switch: true, typed_words: 100, context_words: 100 },
  );
  // The settings go with each request: the next word off hides it.
  await app.inject({ method: 'PUT', url: '/api/suggest', payload: { nextWord: false, precision: 0.5, typedWords: 50, contextWords: 20 } });
  const r2 = (await ask({ surface: 'chat', text: 'Hello wor' })).json();
  assert.deepEqual([r2.next, r2.showNext, r2.confNext], ['', false, 0]);
  const sug2 = logLines().filter((l) => l.op === 'suggest').pop();
  assert.deepEqual([sug2.precision, sug2.next, sug2.typed_words, sug2.context_words], [0.5, false, 50, 20]);
  await app.inject({ method: 'PUT', url: '/api/suggest', payload: { nextWord: true, precision: 0.3, typedWords: 100, contextWords: 100 } });
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
  // The worker is up: it lets go of the model's files before the new one takes their place.
  await ask({ surface: 'chat', text: 'wake the worker for training' });
  await until('the worker', async () => svc.pids().worker);
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
  assert.equal(opt('--device'), 'cpu', 'no graphics card here: the processor, said outright (not auto)');
  assert.ok(!a.includes('--micro-tokens'), 'the processor runs its batch in small pieces');
  assert.equal(svc.pids().worker, undefined, 'the worker was stopped for the swap');
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
  await sleep(20);
  chunk.run('claude:typed', 'user', Date.now() - 5, 'A brand new message after the first run');
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
  await ask({ surface: 'chat', text: 'wake the worker again' });
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

test('with no local copy given, setup downloads the published release, and says why when it cannot', async () => {
  const { SMALL_MODEL } = await import('./pins.ts');
  assert.ok(SMALL_MODEL.revision && SMALL_MODEL.files.length, 'the release is pinned (algoprog/hydor-suggest-49m)');
  const keys = ['HYDOR_SUGGEST_MODEL_DIR', 'HF_ENDPOINT', 'XDG_CACHE_HOME', 'HOME'] as const;
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  // Nothing reaches Hugging Face: its address is a port nothing listens on, and the cache is a scratch folder.
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-suggest-cache-'));
  delete process.env.HYDOR_SUGGEST_MODEL_DIR;
  Object.assign(process.env, { HF_ENDPOINT: 'http://127.0.0.1:9', XDG_CACHE_HOME: cache, HOME: cache });
  try {
    const own = new (await import('./service.ts')).SuggestService(db);
    own.configure({ enabled: false });
    own.configure({ enabled: true });
    await until('it to fail', async () => own.state().status.state === 'failed');
    const detail = own.state().status.detail ?? '';
    assert.notEqual(detail, 'The word-suggestion model is not published yet', 'it tried the published release');
    assert.ok(fs.readdirSync(path.join(cache, 'hydor', 'suggest')).some((d) => d.startsWith('hydor-suggest-49m-')), `the release's folder in the cache (${detail})`);
    own.stop();
  } finally {
    for (const k of keys) saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]);
    fs.rmSync(cache, { recursive: true, force: true });
  }
});


// ---- what keeps running, and what stops ----------------------------------------------------------------------------

const flag = (name: string, on: boolean) => (on ? fs.writeFileSync(path.join(fakeDir, name), '') : fs.rmSync(path.join(fakeDir, name), { force: true }));
const put = (payload: object) => app.inject({ method: 'PUT', url: '/api/suggest', payload });
const priv = svc as any;
const exited = (p: ReturnType<typeof spawn>, ms = 4000) => new Promise<boolean>((resolve) => (p.exitCode != null || p.signalCode ? resolve(true) : (p.once('exit', () => resolve(true)), setTimeout(() => resolve(false), ms).unref())));
const sleeper = (marker: string) => spawn('python3', ['-c', 'import time; time.sleep(60)', marker], { stdio: 'ignore' });

test('1: programs are kept in pids.json, ended when the server exits, and an earlier server’s leftovers are ended at start', async () => {
  const pidsFile = path.join(DATA, 'suggest', 'pids.json');
  await put({ enabled: true, llm: 'off' });
  await ask({ surface: 'chat', text: 'wake the worker for the pids' });
  const worker = await until('the worker', async () => svc.pids().worker);
  const kept = JSON.parse(fs.readFileSync(pidsFile, 'utf8')) as { pid: number; kind: string; marker: string }[];
  const mine = kept.find((e) => e.pid === worker)!;
  assert.equal(mine.kind, 'worker');
  assert.match(mine.marker, /worker\.py$/, 'what it was started with, to tell it from another program that gets its id');
  assert.equal(fs.statSync(pidsFile).mode & 0o777, 0o600);
  assert.ok(process.listeners('exit').includes(killAll), 'the programs are ended as the server exits, whatever the way');
  await put({ enabled: false });
  await until('the worker to stop and be forgotten', async () => !alive(worker) && !fs.existsSync(pidsFile));
  // A leftover of an earlier server that still is what was started: ended.
  const a = sleeper('/leftover/worker.py');
  fs.writeFileSync(pidsFile, JSON.stringify([{ pid: a.pid, kind: 'worker', marker: '/leftover/worker.py' }]));
  assert.equal(reapLeftovers(), 1);
  assert.ok(await exited(a), 'the leftover was ended');
  // The same id given to another program since: left alone.
  const b = sleeper('/something/else');
  fs.writeFileSync(pidsFile, JSON.stringify([{ pid: b.pid, kind: 'llama', marker: '/leftover/model.gguf' }, { pid: process.pid, kind: 'worker', marker: 'node' }, { pid: 1, kind: 'worker', marker: 'init' }]));
  assert.equal(reapLeftovers(), 0);
  assert.ok(alive(b.pid!), 'a process that is not what was started is not touched');
  assert.ok(!fs.existsSync(pidsFile), 'and the list is cleared');
  b.kill('SIGKILL');
  // Everything tracked is ended at once (what runs at the server's exit): train.py with SIGTERM (it saves where it is),
  // llama-server and the worker outright, even one that blocks or ignores SIGTERM (a server started from a shell that
  // blocks it hands that on to what it starts).
  const c = sleeper('/tracked/train.py');
  track('train', c, '/tracked/train.py');
  const deaf = spawn('python3', ['-c', 'import signal, time; signal.signal(signal.SIGTERM, signal.SIG_IGN); time.sleep(60)', '/tracked/model.gguf'], { stdio: 'ignore' });
  track('llama', deaf, '/tracked/model.gguf');
  assert.ok(fs.existsSync(pidsFile));
  killAll();
  assert.ok(await exited(c), 'train.py ended');
  assert.ok(await exited(deaf), 'a llama-server that ignores SIGTERM ended all the same');
  // The list stays for the next start, which finds nothing left to end and clears it.
  assert.ok(fs.existsSync(pidsFile), 'kept for the next start');
  assert.equal(reapLeftovers(), 0);
  assert.ok(!fs.existsSync(pidsFile));
});

test('2: turning it off while the worker starts stops it, and one that is stopped while a port is found starts nothing', async () => {
  flag('slowstart', true);
  const before = logLines().length;
  await put({ enabled: true, llm: 'off' });
  await ask({ surface: 'chat', text: 'start slowly' });
  const boot = (await until('the worker process', async () => logLines().slice(before).find((l) => l.boot))).boot as number;
  assert.ok(alive(boot));
  await put({ enabled: false });
  await until('the starting worker to be stopped', async () => !alive(boot));
  await sleep(2500);
  assert.equal((await get()).status.state, 'off');
  assert.equal(svc.pids().worker, undefined);
  assert.ok(!logLines().slice(before).some((l) => l.op === 'load'), 'it never got to load');
  flag('slowstart', false);
  // The language model: a stop while a port is being found.
  const argsFile = path.join(fakeDir, 'llama-args.json');
  fs.rmSync(argsFile, { force: true });
  const llm = new LlamaServer(() => {});
  const p1 = llm.start({ binary: fakeLlama, gguf, threads: 1 });
  llm.stop('Turned off');
  assert.equal(await p1, null);
  await sleep(700);
  assert.equal(llm.pid, undefined);
  assert.ok(!fs.existsSync(argsFile), 'nothing was started');
  assert.deepEqual(llm.state, { state: 'off', detail: 'Turned off' }, 'and the state is the stop’s');
  // A stop and then a start (a size changed) is a new start, not the old one still going.
  const q1 = llm.start({ binary: fakeLlama, gguf, threads: 1 });
  llm.stop();
  const q2 = llm.start({ binary: fakeLlama, gguf, threads: 1 });
  assert.notEqual(q1, q2);
  assert.equal(await q1, null);
  const url = await q2;
  assert.match(url ?? '', /^http:\/\/127\.0\.0\.1:\d+$/);
  const pid = llm.pid!;
  llm.stop();
  await until('it to stop', async () => !alive(pid));
});

test('3: the language model’s download is one at a time for each size, and not tried again for ten minutes after a failure', async () => {
  await put({ enabled: true, llm: 'on', quant: 'q8' });
  priv.llmPrepFailed.clear();
  const saved = process.env.HYDOR_SUGGEST_GGUF;
  process.env.HYDOR_SUGGEST_GGUF = path.join(tmp, 'not-there.gguf');
  try {
    const p1 = priv.prepareLlm();
    const p2 = priv.prepareLlm();
    assert.equal(p1, p2, 'the second asks the first’s download');
    assert.equal(await p1, false);
    assert.match(svc.llm.state.detail ?? '', /does not exist/);
    assert.equal(svc.llm.state.state, 'failed');
    // A few seconds on, it is not tried again (a retry would fail and say so once more): asked many times, once it failed.
    let failures = 0;
    const note = svc.llm.note.bind(svc.llm);
    svc.llm.note = (st) => (st.state === 'failed' && failures++, note(st));
    assert.equal(await priv.prepareLlm(), false);
    assert.equal(await priv.prepareLlm(), false);
    assert.equal(failures, 0, 'no new attempt within the ten minutes');
    svc.llm.note = note;
    // A change of the size (or of the language model) lifts it.
    await put({ quant: 'q4' });
    process.env.HYDOR_SUGGEST_GGUF = gguf;
    assert.equal(await priv.prepareLlm(), true);
  } finally {
    process.env.HYDOR_SUGGEST_GGUF = saved;
    svc.llm.reset();
    await put({ quant: 'q8', llm: 'off' });
  }
});

test('4 and 5: a download with no data for a while is given up, turning it off stops downloads and commands, and the small model does not wait for the language model', async () => {
  await assert.rejects(withStall(undefined, 200, (sig) => new Promise((_, rej) => sig.addEventListener('abort', () => rej(new Error('aborted'))))), /no data came/);
  assert.equal(
    await withStall(undefined, 300, async (_s, alive) => {
      for (let i = 0; i < 8; i++) (alive(), await sleep(80));
      return 'done';
    }),
    'done',
    'a download that goes on is not a stalled one',
  );
  const ac = new AbortController();
  let inner: AbortSignal | undefined;
  const w = withStall(ac.signal, 60_000, (sig) => ((inner = sig), new Promise((_, rej) => sig.addEventListener('abort', () => rej(new Error('aborted'))))));
  ac.abort();
  await assert.rejects(w, /^Error: aborted$/);
  assert.ok(inner!.aborted);
  // A server that sends a few bytes and then nothing: the stall ends it; so does turning off.
  const hold = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-length': '1000' });
    res.write('0123456789');
  });
  await new Promise<void>((r) => hold.listen(0, '127.0.0.1', r));
  const port = (hold.address() as { port: number }).port;
  const file = { from: 'x', name: 'x.bin', bytes: 1000, sha256: '0'.repeat(64) };
  const dl = (dir: string, sig: AbortSignal, alive: () => void) => downloadFiles(dir, [file], { url: () => `http://127.0.0.1:${port}/x`, mark: 'm', signal: sig, progress: alive });
  try {
    const t0 = Date.now();
    await assert.rejects(withStall(undefined, 400, (sig, alive) => dl(path.join(tmp, 'dl1'), sig, alive)), /no data came/);
    assert.ok(Date.now() - t0 < 5000);
    const off = new AbortController();
    setTimeout(() => off.abort(), 200);
    const t1 = Date.now();
    await assert.rejects(withStall(off.signal, 60_000, (sig, alive) => dl(path.join(tmp, 'dl2'), sig, alive)));
    assert.ok(Date.now() - t1 < 5000, 'turning off ends the download at once');
  } finally {
    hold.closeAllConnections();
    hold.close();
  }
  // A command (pip, uv) that is running is killed.
  const pidFile = path.join(tmp, 'cmd.pid');
  const stop = new AbortController();
  const cmd = runCommand('sh', ['-c', `echo $$ > ${pidFile}; exec sleep 60`], 'Installing', () => {}, stop.signal);
  const cmdPid = Number(await until('the command', async () => (fs.existsSync(pidFile) ? fs.readFileSync(pidFile, 'utf8').trim() : null)));
  stop.abort();
  await assert.rejects(cmd, /Stopped/);
  await until('the command to be gone', async () => !alive(cmdPid));
  // The small model is ready when its own files are: the language model's download goes on without holding it.
  await put({ enabled: true, llm: 'on' });
  let asked = 0;
  priv.prepareLlm = () => (asked++, new Promise(() => {}));
  try {
    const ready = await Promise.race([priv.ensureSetup(), sleep(2000).then(() => 'waited')]);
    assert.equal(ready, true, 'set up while the download is not finished');
    assert.equal(asked, 1, 'and the download was started');
  } finally {
    delete priv.prepareLlm;
    await put({ llm: 'off' });
  }
});

const addTyped = async (text: string) => {
  // A message written after the last run began, and before this one.
  await sleep(20);
  chunk.run('claude:typed', 'user', Date.now() - 5, text);
};
const workFile = (f: string) => path.join(personalDir(), 'train', f);

test('6, 7 and the exit codes: a stopped run goes on with the same texts, no text stays behind, learning off clears what is left, and 3 is "nothing to learn"', async () => {
  await put({ enabled: true, personalise: true, schedule: 'manual', llm: 'off', trainThreads: 1 });
  await app.inject({ method: 'DELETE', url: '/api/suggest/personal' });
  const trains = () => logLines().filter((l) => l.train);
  const n0 = trains().length;
  flag('trainhold', true);
  await addTyped('A message for the stopped run, written before it');
  await app.inject({ method: 'POST', url: '/api/suggest/train' });
  const first = await until('the first run', async () => trains()[n0]);
  // Something is written while it runs, and it is stopped (turning it off ends it).
  await addTyped('A message written after the run began, which must wait for the next');
  await put({ enabled: false });
  await until('the run to end', async () => !svc.trainer.active);
  assert.ok(!fs.existsSync(workFile('texts.jsonl')), 'the texts do not stay behind a stopped run');
  assert.ok(fs.existsSync(workFile('job.json')) && fs.existsSync(workFile('out')), 'its resume state does');
  flag('trainhold', false);
  await put({ enabled: true });
  await app.inject({ method: 'POST', url: '/api/suggest/train' });
  const second = await until('the run again', async () => trains()[n0 + 1]);
  assert.equal(second.sha, first.sha, 'the same texts come back (what was written since is not in them)');
  assert.equal(second.texts, first.texts);
  await until('it to finish', async () => !svc.trainer.active && fs.existsSync(path.join(personalDir(), 'model.safetensors')));
  assert.ok(!fs.existsSync(workFile('texts.jsonl')) && !fs.existsSync(workFile('job.json')));
  // The message that waited is in the next run.
  await sleep(20);
  const third = trains().length;
  await app.inject({ method: 'POST', url: '/api/suggest/train' });
  await until('the next run', async () => trains().length === third + 1);
  assert.equal(trains()[third].texts, 1, 'only the one written since');
  await until('it to finish', async () => !svc.trainer.active);
  // A failure leaves no texts; 3 is nothing to learn from (not a failure), 2 is a failure (a wrong command line).
  for (const [name, state, detail] of [
    ['trainfail', 'failed', /exit 1/],
    ['traincode2', 'failed', /exit 2/],
    ['trainnothing', 'idle', /Nothing new/],
  ] as const) {
    flag(name, true);
    await addTyped(`A message for the ${name} run`);
    const k = trains().length;
    await app.inject({ method: 'POST', url: '/api/suggest/train' });
    await until(`the ${name} run`, async () => trains().length === k + 1 && !svc.trainer.active);
    const t = (await get()).status.training;
    assert.equal(t.state, state, name);
    assert.match(t.detail ?? '', detail, name);
    assert.ok(!fs.existsSync(workFile('texts.jsonl')), `${name}: no texts left`);
    flag(name, false);
  }
  // Learning turned off: a run stops, and what it left goes, the resume state too.
  flag('trainhold', true);
  await addTyped('A message for the run that is turned off');
  const k = trains().length;
  await app.inject({ method: 'POST', url: '/api/suggest/train' });
  await until('the run', async () => trains().length === k + 1);
  await put({ personalise: false });
  await until('the run to end', async () => !svc.trainer.active);
  assert.ok(!fs.existsSync(workFile('job.json')) && !fs.existsSync(workFile('out')) && !fs.existsSync(path.join(personalDir(), 'train')), 'nothing of the run is left');
  flag('trainhold', false);
  await put({ personalise: true });
});

test('13: forgetting a run in progress, or turning learning off while it sets up, puts no model in', async () => {
  await app.inject({ method: 'DELETE', url: '/api/suggest/personal' });
  const trains = () => logLines().filter((l) => l.train);
  flag('trainhold', true);
  await addTyped('A message for a run that is forgotten');
  const k = trains().length;
  await app.inject({ method: 'POST', url: '/api/suggest/train' });
  await until('the run', async () => trains().length === k + 1);
  await app.inject({ method: 'DELETE', url: '/api/suggest/personal' });
  flag('trainhold', false);
  await until('the run to end', async () => !svc.trainer.active);
  await sleep(300);
  assert.ok(!fs.existsSync(path.join(personalDir(), 'model.safetensors')), 'the forgotten run did not put its model in');
  assert.equal((await get()).status.model.kind, 'base');
  // Settings that changed while it waited for the set-up are asked again.
  await addTyped('A message that must not be learned from');
  const before = trains().length;
  svc.train();
  await put({ personalise: false });
  await sleep(500);
  assert.equal(trains().length, before, 'learning was turned off before it began');
  assert.equal(svc.trainer.active, false);
  await put({ personalise: true });
});

// ---- pause, resume and stop ----------------------------------------------------------------------------------------

const trainLog = () => logLines().filter((l) => l.train);
const trainState = async () => (await get()).status.training;
const post = (url: string) => app.inject({ method: 'POST', url });
const del = (url: string) => app.inject({ method: 'DELETE', url });
const PAUSE = 'suggest.train.paused';
const startHeld = async (text: string) => {
  flag('trainhold', true);
  await addTyped(text);
  const k = trainLog().length;
  await post('/api/suggest/train');
  const first = await until('the run', async () => trainLog()[k]);
  await until('its first progress', async () => (await trainState()).progress?.done === 1);
  return { k, first };
};
const resetTraining = async () => {
  flag('trainhold', false);
  flag('traingpufail', false);
  await put({ enabled: true, personalise: true, schedule: 'nightly', llm: 'off', trainThreads: 1, trainGpu: true });
  await del('/api/suggest/personal');
  kvSet(db, PAUSE, 'null');
  kvSet(db, 'suggest.train.gpu.hold', 'null');
};

test('pause: the run stops where it is, the schedule is held, it survives a restart, and Resume goes on with the same texts', async () => {
  await resetTraining();
  const far = Date.now() + 40 * 24 * 3600_000;
  assert.equal(svc.trainDue(far), true, 'due when nothing holds it');
  assert.equal((await post('/api/suggest/train/pause')).statusCode, 409, 'nothing is running');
  const { k, first } = await startHeld('A message for the paused run');
  const p = await post('/api/suggest/train/pause');
  assert.equal(p.statusCode, 200);
  assert.equal(p.json().status.training.state, 'paused', 'paused at once, while the process is still ending');
  assert.deepEqual(p.json().status.training.progress, { done: 1, total: 2 });
  await until('the run to end', async () => !svc.trainer.active);
  const t = await trainState();
  assert.equal(t.state, 'paused');
  assert.deepEqual(t.progress, { done: 1, total: 2 });
  assert.equal(t.next, undefined, 'no time is promised while it is paused');
  assert.equal(t.detail, undefined);
  assert.equal(svc.trainDue(far), false, 'the schedule starts nothing while it is paused');
  assert.ok(fs.existsSync(workFile('job.json')) && fs.existsSync(workFile('out')), 'its work stays for Resume');
  assert.ok(!fs.existsSync(workFile('texts.jsonl')), 'the texts do not');
  assert.equal(trainLog().length, k + 1);
  assert.equal((await post('/api/suggest/train/pause')).statusCode, 409, 'already paused');
  await priv.check();
  assert.equal(trainLog().length, k + 1, 'the scheduled check starts nothing');
  // A server that starts again on the same database still has it paused.
  const again = new SuggestService(db);
  try {
    const st = again.state().status.training;
    assert.equal(st.state, 'paused');
    assert.deepEqual(st.progress, { done: 1, total: 2 });
    assert.equal(again.trainDue(far), false);
  } finally {
    again.stop();
  }
  // Resume (Retrain now does it too): the same texts, from the same resume state.
  flag('trainhold', false);
  await addTyped('Written while it was paused: not in the paused run’s texts');
  const r = await post('/api/suggest/train');
  assert.equal(r.statusCode, 200);
  assert.notEqual(r.json().status.training.state, 'paused');
  const second = await until('the run again', async () => trainLog()[k + 1]);
  assert.equal(second.sha, first.sha, 'the same texts come back');
  assert.equal(second.texts, first.texts);
  await until('it to finish', async () => !svc.trainer.active && fs.existsSync(path.join(personalDir(), 'model.safetensors')));
  assert.equal(kvGet(db, PAUSE), 'null');
  assert.equal((await trainState()).state, 'waiting', 'the schedule goes on');
  assert.equal(svc.trainDue(far), true);
});

test('pause: during "Reading what you wrote", before train.py starts, it also ends as paused', async () => {
  await resetTraining();
  await addTyped('A message read while the pause comes');
  const k = trainLog().length;
  svc.train();
  while (!svc.trainer.active) await Promise.resolve();
  assert.equal(svc.trainer.state.detail, 'Reading what you wrote');
  assert.equal(svc.pause().status.training.state, 'paused');
  await until('the run to end', async () => !svc.trainer.active);
  await sleep(200);
  assert.equal(trainLog().length, k, 'train.py never started');
  assert.equal((await trainState()).state, 'paused');
  await post('/api/suggest/train');
  await until('the run to finish', async () => trainLog().length === k + 1 && !svc.trainer.active);
  assert.equal((await trainState()).state, 'waiting');
});

test('stop: what the run learned so far is dropped, the schedule waits its usual gap, and a paused run can be stopped too', async () => {
  await resetTraining();
  assert.equal((await del('/api/suggest/train')).statusCode, 409, 'nothing is running or paused');
  await startHeld('A message for the stopped run');
  const t0 = Date.now();
  const r = await del('/api/suggest/train');
  assert.equal(r.statusCode, 200);
  assert.notEqual(r.json().status.training.state, 'running');
  await until('the run to end', async () => !svc.trainer.active);
  assert.ok(!fs.existsSync(path.join(personalDir(), 'train')), 'its work is gone, the resume state too');
  assert.ok(Number(kvGet(db, 'suggest.train.at')) >= t0, 'it counts as an attempt');
  const t = await trainState();
  assert.equal(t.state, 'waiting');
  assert.equal(t.detail, undefined);
  assert.ok(t.next! >= t0 + 19 * 3600_000, 'the next run waits its usual gap');
  assert.ok(!hasModel(), 'nothing was put in');
  // Paused, then stopped.
  await startHeld('A message for the run that is paused and then stopped');
  await post('/api/suggest/train/pause');
  await until('the run to end', async () => !svc.trainer.active);
  assert.equal((await trainState()).state, 'paused');
  const s2 = await del('/api/suggest/train');
  assert.equal(s2.statusCode, 200);
  assert.equal(s2.json().status.training.state, 'waiting');
  assert.equal(kvGet(db, PAUSE), 'null');
  assert.ok(!fs.existsSync(path.join(personalDir(), 'train')));
  assert.equal((await del('/api/suggest/train')).statusCode, 409, 'nothing left to stop');
  assert.equal((await post('/api/suggest/train/pause')).statusCode, 409);
  // Stopped while it is being paused (the process has not ended yet): the stop wins.
  await startHeld('A message for a pause that is stopped as it ends');
  await post('/api/suggest/train/pause');
  await del('/api/suggest/train');
  await until('the run to end', async () => !svc.trainer.active);
  assert.ok(!fs.existsSync(path.join(personalDir(), 'train')));
  assert.equal((await trainState()).state, 'waiting');
  flag('trainhold', false);
});
const hasModel = () => fs.existsSync(path.join(personalDir(), 'model.safetensors'));

test('pause: train.py gets time to save its resume state, a stop does not wait for it', async () => {
  await resetTraining();
  const was = { ...GRACE };
  Object.assign(GRACE, { stop: 300, pause: 5000 });
  flag('trainslowterm', true);
  try {
    await startHeld('A message for a run that is slow to leave when paused');
    const saved = () => logLines().filter((l) => l.termsaved).length;
    const n = saved();
    await post('/api/suggest/train/pause');
    await until('the run to end', async () => !svc.trainer.active);
    assert.equal(saved(), n + 1, 'it was not killed before it had saved (it needs a second)');
    // Stopped (or paused, then stopped), it is killed soon.
    await del('/api/suggest/train');
    await startHeld('A message for a run that is stopped');
    const m = saved();
    const t0 = Date.now();
    await del('/api/suggest/train');
    await until('the run to end', async () => !svc.trainer.active);
    assert.ok(Date.now() - t0 < 900, 'killed after the short wait');
    await sleep(1200);
    assert.equal(saved(), m, 'and never saved');
  } finally {
    Object.assign(GRACE, was);
    flag('trainslowterm', false);
    flag('trainhold', false);
  }
});

test('pause: turning learning off, word suggestions off, or Forget clears it', async () => {
  for (const [what, act] of [
    ['learning off', () => put({ personalise: false })],
    ['word suggestions off', () => put({ enabled: false })],
    ['forget', () => del('/api/suggest/personal')],
  ] as const) {
    await resetTraining();
    await startHeld(`A message for the run paused, then ${what}`);
    await post('/api/suggest/train/pause');
    await until('the run to end', async () => !svc.trainer.active);
    assert.equal((await trainState()).state, 'paused', what);
    await act();
    assert.equal(kvGet(db, PAUSE), 'null', what);
    assert.notEqual((await trainState()).state, 'paused', what);
    if (what === 'learning off') assert.ok(!fs.existsSync(path.join(personalDir(), 'train')), 'and its work goes');
    assert.equal((await post('/api/suggest/train/pause')).statusCode, 409, what);
  }
  flag('trainhold', false);
  await put({ enabled: true, personalise: true });
});

// ---- the graphics card -----------------------------------------------------------------------------------------------

const cards = [
  '0, NVIDIA GeForce RTX 4090, 21070, 0',
  '1, NVIDIA GeForce RTX 4090, 24082, 10',
  '2, NVIDIA GeForce RTX 3080, 3000, 0',
  '3, NVIDIA GeForce RTX 4090, 24066, 80',
].join('\n');
const smiOf = (rows: string | null, cuda = '12.4', calls: string[][] = []) => async (args: string[]) => {
  calls.push(args);
  if (rows == null) return null;
  return args.length ? rows : `Mon\n| NVIDIA-SMI 550.54     Driver Version: 550.54     CUDA Version: ${cuda}     |\n`;
};
const choose = (o: Partial<Parameters<typeof chooseDevice>[0]> = {}) => chooseDevice({ enabled: true, platform: 'linux', arch: 'x64', env: {}, smi: smiOf(cards), ...o });

test('the graphics card: the setting, a Mac, and the card with the most memory free that is not busy', async () => {
  const calls: string[][] = [];
  assert.deepEqual(await choose({ enabled: false, smi: smiOf(cards, '12.4', calls) }), { device: { kind: 'cpu' } }, 'the setting off: the processor, no reason');
  assert.deepEqual(await chooseDevice({ enabled: true, platform: 'darwin', arch: 'arm64', env: {}, smi: smiOf(cards, '12.4', calls) }), { device: { kind: 'mps', name: 'Apple silicon' } }, 'a Mac with Apple silicon');
  assert.equal(calls.length, 0, 'nvidia-smi was not asked about');
  assert.equal((await chooseDevice({ enabled: true, platform: 'darwin', arch: 'x64', env: {}, smi: smiOf(cards) })).device.kind, 'cpu');
  assert.equal((await chooseDevice({ enabled: true, platform: 'win32', arch: 'arm64', env: {}, smi: smiOf(cards) })).device.kind, 'cpu');
  const best = await choose({ smi: smiOf(cards, '12.4', calls) });
  assert.deepEqual(best, { device: { kind: 'cuda', name: 'NVIDIA GeForce RTX 4090', index: 1, freeMb: 24082 }, tag: 'cu124' }, 'card 1: the most free, under half busy');
  assert.deepEqual(calls[0], ['--query-gpu=index,name,memory.free,utilization.gpu', '--format=csv,noheader,nounits']);
  assert.equal((await choose({ platform: 'win32' })).device.kind, 'cuda', 'Windows too');
  // The server's own CUDA_VISIBLE_DEVICES: only those listed; an empty list is none.
  assert.equal((await choose({ env: { CUDA_VISIBLE_DEVICES: '0,3' } })).device.index, 0, 'of 0 and 3, the one with room and not busy');
  assert.equal((await choose({ env: { CUDA_VISIBLE_DEVICES: '3,2,0' } })).device.index, 0);
  const none = await choose({ env: { CUDA_VISIBLE_DEVICES: '' } });
  assert.equal(none.device.kind, 'cpu');
  assert.match(none.why!, /CUDA_VISIBLE_DEVICES/);
  assert.match((await choose({ env: { CUDA_VISIBLE_DEVICES: '7' } })).why!, /CUDA_VISIBLE_DEVICES/, 'a number that is no card');
  assert.match((await choose({ env: { CUDA_VISIBLE_DEVICES: 'GPU-0a1b2c3d-1111' } })).why!, /CUDA_VISIBLE_DEVICES/, 'a card named by its id cannot be matched: none');
  // Neither the card too full nor the one too busy.
  const room = await choose({ env: { CUDA_VISIBLE_DEVICES: '2,3' } });
  assert.equal(room.device.kind, 'cpu');
  assert.match(room.why!, /4 GB free/);
  const edge = (free: number, util: number) => choose({ smi: smiOf(`0, Card, ${free}, ${util}`) });
  assert.equal((await edge(4096, 49)).device.kind, 'cuda', '4 GB free and 49% busy are enough');
  assert.equal((await edge(4095, 0)).device.kind, 'cpu', 'a megabyte short');
  assert.equal((await edge(24000, 50)).device.kind, 'cpu', 'half busy is too busy');
  assert.match((await choose({ smi: smiOf(null) })).why!, /No NVIDIA/, 'no nvidia-smi: no card');
  assert.match((await choose({ smi: smiOf('') })).why!, /No NVIDIA/, 'no card listed');
  assert.match((await choose({ smi: smiOf('garbage\n0, Card, [N/A], [N/A]') })).why!, /No NVIDIA/, 'a card that says nothing of its memory is left out');
});

test('the graphics card: the newest PyTorch build the driver supports', async () => {
  for (const [cuda, tag] of [['13.2', 'cu130'], ['13.0', 'cu130'], ['12.9', 'cu129'], ['12.8', 'cu128'], ['12.7', 'cu126'], ['12.6', 'cu126'], ['12.5', 'cu124'], ['12.1', 'cu121'], ['11.8', 'cu118']] as const) {
    const p = await choose({ smi: smiOf(cards, cuda) });
    assert.equal(p.tag, tag, `CUDA ${cuda}`);
  }
  const old = await choose({ smi: smiOf(cards, '11.7') });
  assert.equal(old.device.kind, 'cpu');
  assert.match(old.why!, /too old/);
  assert.match((await choose({ smi: async (a) => (a.length ? cards : 'no version here') })).why!, /CUDA version/);
  assert.deepEqual(parseCuda('Driver Version: 595.91.07      CUDA Version: 13.2'), [13, 2]);
  assert.equal(wheelTag([10, 2]), null);
  assert.deepEqual(parseGpus('0, NVIDIA A100, SXM4, 40000, 1\n'), [{ index: 0, name: 'NVIDIA A100, SXM4', freeMb: 40000, util: 1 }], 'a name with a comma');
  assert.deepEqual(visibleCards(undefined), null);
  assert.deepEqual(visibleCards(' 1, 3 '), [1, 3]);
  assert.deepEqual(visibleCards('0,GPU-abc,2'), [0], 'CUDA reads up to the first entry it cannot');
  assert.equal(bestGpu([], null).hasOwnProperty('why'), true);
  // An environment made for an older CUDA suits a driver that has moved on, not one that went back.
  assert.equal(tagSuits('cu126', 'cu130'), true);
  assert.equal(tagSuits('cu126', 'cu126'), true);
  assert.equal(tagSuits('cu130', 'cu126'), false);
  assert.equal(tagSuits('cpu', 'cu126'), false);
});

test('the graphics card: nvidia-smi is run for real (a stand-in program), and its answers are used', async () => {
  const exe = path.join(fakeDir, 'nvidia-smi');
  fs.writeFileSync(exe, `#!/bin/sh\nif [ -n "$1" ]; then printf '%s\\n' '${cards.split('\n').join("' '")}'; else echo '| NVIDIA-SMI 560.35  Driver Version: 560.35  CUDA Version: 12.6 |'; fi\n`, { mode: 0o755 });
  const env = { HYDOR_SUGGEST_NVIDIA_SMI: exe, CUDA_VISIBLE_DEVICES: '0,2' };
  const p = await chooseDevice({ enabled: true, platform: 'linux', arch: 'x64', env });
  assert.deepEqual(p, { device: { kind: 'cuda', name: 'NVIDIA GeForce RTX 4090', index: 0, freeMb: 21070 }, tag: 'cu126' });
  const missing = await chooseDevice({ enabled: true, platform: 'linux', arch: 'x64', env: { HYDOR_SUGGEST_NVIDIA_SMI: '/nonexistent/nvidia-smi' } });
  assert.match(missing.why!, /No NVIDIA/);
});

test('the graphics card: a run on a card (its set-up first, its environment, one piece), a set-up that fails, a card that fails', async () => {
  await resetTraining();
  const real = svc.trainer.deps;
  const picks: string[] = [];
  const setups: string[] = [];
  let ready = false;
  let setupFails = false;
  let gate: Promise<void> = Promise.resolve();
  let kind: DevicePick['device']['kind'] = 'cuda';
  let tight = false;
  svc.trainer.deps = {
    pick: async () => {
      picks.push(kind);
      return kind === 'mps' ? { device: { kind: 'mps', name: 'Apple silicon' } } : { device: { kind: 'cuda', name: 'Fake RTX 4090', index: 3, ...(tight ? { freeMb: 4500 } : {}) }, tag: 'cu126' };
    },
    gpuReady: () => ready,
    setupGpu: async (tag, report, signal) => {
      setups.push(tag);
      report('Installing PyTorch for the graphics card');
      await new Promise<void>((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('Stopped')), { once: true });
        void gate.then(resolve);
      });
      if (setupFails) throw new Error('no network');
      ready = true;
    },
  };
  try {
    // 1: the first run on the card waits for its environment, with the line saying so.
    let open!: () => void;
    gate = new Promise((r) => (open = r));
    await addTyped('A message for the first run on the card');
    let k = trainLog().length;
    flag('trainhold', true);
    await post('/api/suggest/train');
    const during = await until('the set-up', async () => {
      const t = await trainState();
      return t.state === 'running' && /graphics card/i.test(t.detail ?? '') ? t : null;
    });
    assert.deepEqual(during.device, { kind: 'cuda' });
    assert.equal(trainLog().length, k, 'train.py waits for it');
    open();
    const run = await until('the run on the card', async () => trainLog()[k]);
    const arg = (l: any, n: string) => l.args[l.args.indexOf(n) + 1];
    assert.equal(arg(run, '--device'), 'cuda');
    assert.equal(arg(run, '--micro-tokens'), arg(run, '--batch-tokens'), 'the batch in one piece on a card with room');
    assert.equal(run.cvd, '3', 'only the chosen card is visible to it');
    assert.equal(run.order, 'PCI_BUS_ID', 'numbered as nvidia-smi numbers them');
    assert.equal(run.nice, 19, 'its processor side stays at the lowest priority');
    assert.deepEqual(setups, ['cu126']);
    const live = await trainState();
    assert.deepEqual(live.device, { kind: 'cuda', name: 'Fake RTX 4090' });
    assert.equal(live.noGpu, undefined);
    flag('trainhold', false);
    await until('it to finish', async () => !svc.trainer.active && hasModel());
    assert.equal(gpuHold(db), null, 'a card that worked is not held back');
    // 2: a Mac's own graphics.
    kind = 'mps';
    await addTyped('A message for the run on a Mac');
    k = trainLog().length;
    await post('/api/suggest/train');
    const mac = await until('the run', async () => trainLog()[k]);
    assert.equal(arg(mac, '--device'), 'mps');
    assert.ok(!mac.args.includes('--micro-tokens'));
    await until('it to finish', async () => !svc.trainer.active);
    // A card with little room: the smaller pieces.
    tight = true;
    kind = 'cuda';
    await addTyped('A message for the run on a card with little room');
    k = trainLog().length;
    await post('/api/suggest/train');
    const small = await until('the run', async () => trainLog()[k]);
    assert.equal(arg(small, '--device'), 'cuda');
    assert.ok(!small.args.includes('--micro-tokens'), 'train.py’s own pieces, which fit in under 4 GB');
    await until('it to finish', async () => !svc.trainer.active);
    tight = false;
    // 3: the set-up fails: this run is on the processor, the card is left alone for a day, and the line says why.
    ready = false;
    setupFails = true;
    gate = Promise.resolve();
    await addTyped('A message for the run whose set-up fails');
    k = trainLog().length;
    const before = Date.now();
    await post('/api/suggest/train');
    const cpu = await until('the run on the processor', async () => trainLog()[k]);
    assert.equal(arg(cpu, '--device'), 'cpu');
    assert.ok(!cpu.args.includes('--micro-tokens'));
    assert.equal(cpu.cvd, '', 'no card is visible to it');
    await until('it to finish', async () => !svc.trainer.active);
    const hold = gpuHold(db)!;
    assert.match(hold.why, /could not be set up: no network/);
    assert.ok(hold.until >= before + 23 * 3600_000 && hold.until <= Date.now() + 25 * 3600_000, 'for a day');
    assert.match((await trainState()).noGpu!, /no network/);
    // Held: not asked about, not set up again.
    const [p0, s0] = [picks.length, setups.length];
    await addTyped('A message for the run while the card is held back');
    k = trainLog().length;
    await post('/api/suggest/train');
    await until('the run', async () => trainLog().length === k + 1 && !svc.trainer.active);
    assert.equal(arg(trainLog()[k], '--device'), 'cpu');
    assert.deepEqual([picks.length, setups.length], [p0, s0]);
    // The day is over: it is tried again.
    kvSet(db, 'suggest.train.gpu.hold', JSON.stringify({ until: Date.now() - 1, why: 'old' }));
    ready = false;
    setupFails = false;
    await addTyped('A message for the run when the day is over');
    k = trainLog().length;
    await post('/api/suggest/train');
    await until('the run', async () => trainLog().length === k + 1 && !svc.trainer.active);
    assert.equal(arg(trainLog()[k], '--device'), 'cuda');
    assert.equal(picks.length, p0 + 1);
    assert.equal(gpuHold(db), null);
    // 4: the card fails in the run: it goes on at once on the processor with the same texts, and the card is held back.
    flag('traingpufail', true);
    await addTyped('A message for the run whose card fails');
    k = trainLog().length;
    await post('/api/suggest/train');
    await until('both runs', async () => trainLog().length === k + 2 && !svc.trainer.active);
    const [onCard, onCpu] = [trainLog()[k], trainLog()[k + 1]];
    assert.deepEqual([arg(onCard, '--device'), arg(onCpu, '--device')], ['cuda', 'cpu']);
    assert.equal(onCpu.sha, onCard.sha, 'the same texts');
    assert.ok(onCpu.args.includes('--resume'), 'from its resume state');
    assert.equal(onCpu.cvd, '');
    assert.match(gpuHold(db)!.why, /graphics card failed/);
    const done = await trainState();
    assert.equal(done.state, 'waiting', 'the run itself did not fail');
    assert.match(done.noGpu!, /graphics card failed/);
    assert.equal((await get()).status.model.kind, 'personal');
    // The processor failing too says it was not the card: no hold.
    kvSet(db, 'suggest.train.gpu.hold', 'null');
    flag('trainfail', true);
    await addTyped('A message for the run that fails everywhere');
    k = trainLog().length;
    await post('/api/suggest/train');
    await until('both runs', async () => trainLog().length === k + 2 && !svc.trainer.active);
    assert.equal(gpuHold(db), null, 'the card was not at fault');
    assert.equal((await trainState()).state, 'failed');
    flag('trainfail', false);
    flag('traingpufail', false);
    // 5: the setting off: the card is not even asked about.
    await put({ trainGpu: false });
    const p1 = picks.length;
    await addTyped('A message for the run with the card turned off');
    k = trainLog().length;
    await post('/api/suggest/train');
    await until('the run', async () => trainLog().length === k + 1 && !svc.trainer.active);
    assert.equal(arg(trainLog()[k], '--device'), 'cpu');
    assert.equal(picks.length, p1);
    assert.equal((await trainState()).noGpu, undefined, 'and no reason is given');
    await put({ trainGpu: true });
    // 6: paused while the environment is being set up: it stops, nothing is held back, and Resume sets it up again.
    ready = false;
    gate = new Promise(() => {});
    await addTyped('A message for the pause during the set-up');
    k = trainLog().length;
    const s1 = setups.length;
    await post('/api/suggest/train');
    await until('the set-up', async () => setups.length === s1 + 1);
    assert.equal((await post('/api/suggest/train/pause')).statusCode, 200);
    await until('the run to end', async () => !svc.trainer.active);
    assert.equal(trainLog().length, k);
    assert.equal(gpuHold(db), null, 'a stop is not a failure');
    assert.equal((await trainState()).state, 'paused');
    gate = Promise.resolve();
    await post('/api/suggest/train');
    await until('the run on the card', async () => trainLog().length === k + 1 && !svc.trainer.active);
    assert.equal(arg(trainLog()[k], '--device'), 'cuda');
  } finally {
    svc.trainer.deps = real;
    flag('trainhold', false);
    flag('traingpufail', false);
    flag('trainfail', false);
  }
});

test('12: a swap that a crash cut short is finished or undone at start; the new model is private', () => {
  const dir = personalDir();
  const clear = () => [dir, `${dir}.next`, `${dir}.prev`].forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
  const model = (d: string, at?: number) => {
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'model.safetensors'), 'w');
    fs.writeFileSync(path.join(d, 'config.json'), '{}');
    if (at) fs.writeFileSync(path.join(d, 'state.json'), JSON.stringify({ trainedAt: at, since: at }));
  };
  const at = () => JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')).trainedAt;
  clear();
  model(`${dir}.prev`, 1);
  recoverPersonal();
  assert.equal(at(), 1, 'cut after the old one moved aside, before the new one came: the old one comes back');
  assert.ok(!fs.existsSync(`${dir}.prev`));
  clear();
  model(`${dir}.next`, 2);
  recoverPersonal();
  assert.equal(at(), 2, 'the new one is whole: it takes the place');
  assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(dir, 'model.safetensors')).mode & 0o777, 0o600);
  clear();
  model(dir, 1);
  model(`${dir}.next`, 2);
  recoverPersonal();
  assert.equal(at(), 2, 'cut before the swap began: it is made');
  assert.ok(!fs.existsSync(`${dir}.next`) && !fs.existsSync(`${dir}.prev`));
  clear();
  model(dir, 1);
  model(`${dir}.next`);
  recoverPersonal();
  assert.equal(at(), 1, 'a new model that is not whole is not used');
  assert.ok(!fs.existsSync(`${dir}.next`));
  clear();
  model(dir, 3);
  model(`${dir}.prev`, 1);
  recoverPersonal();
  assert.equal(at(), 3);
  assert.ok(!fs.existsSync(`${dir}.prev`), 'an old one left behind goes');
  clear();
});

test('10: only what is newer is read, and the event loop gets its turns', async () => {
  const big = openDb(path.join(tmp, 'big.db'));
  memorySchema(big);
  initPages(big);
  big.exec(`create table if not exists app_runs (id text primary key, key text); create table if not exists task_runs (id text primary key, key text); create table if not exists tasks (id text primary key, last_key text);`);
  const ses = big.prepare("insert into sessions (key, agent, id, path, cwd, source, parent_key, created_at) values (?, 'claude', ?, '', '/home/x/p', 'cli', null, ?)");
  const app2 = big.prepare("insert into app_sessions (key, agent, extra, created_at, updated_at) values (?, 'claude', '{}', 1, 1)");
  const ch = big.prepare('insert into chunk_text (key, kind, ts, text) values (?, ?, ?, ?)');
  big.exec('begin');
  for (let i = 0; i < 60; i++) {
    const key = `claude:big${i}`;
    ses.run(key, `b${i}`, i);
    app2.run(key);
    const base = i < 30 ? 100 : 5000;
    for (let j = 0; j < 10; j++) {
      ch.run(key, 'user', base + j * 2, `Message ${i} number ${j} that somebody typed`);
      ch.run(key, 'assistant', base + j * 2 + 1, `Reply ${i} number ${j} that the agent wrote back`);
    }
  }
  big.exec('commit');
  let reads = 0;
  const spy = new Proxy(big, {
    get(t: any, k) {
      if (k === 'prepare')
        return (sql: string) => {
          const st = t.prepare(sql);
          return sql.includes('select id, kind, coalesce') ? { all: (...a: unknown[]) => (reads++, st.all(...a)) } : st;
        };
      const v = t[k];
      return typeof v === 'function' ? v.bind(t) : v;
    },
  }) as typeof big;
  let ticks = 0;
  let going = true;
  const spin = () => {
    ticks++;
    if (going) setImmediate(spin);
  };
  setImmediate(spin);
  const lines = await extractTexts(spy, { since: 1000, sources: { messages: true, replies: true, notes: false, docs: false } });
  going = false;
  assert.equal(reads, 30, 'only the sessions with something newer were read');
  assert.equal(lines.filter((l) => l.kind === 'user').length, 300);
  assert.ok(lines.every((l) => l.ts > 1000));
  assert.ok(ticks >= 2, `the event loop ran while the texts were read (${ticks} turns)`);
  // Bounded above too: the same texts again after more were written.
  const bounded = await extractTexts(spy, { since: 1000, until: 5009, sources: { messages: true, replies: false, notes: false, docs: false } });
  assert.equal(bounded.length, 30 * 5, 'only the messages up to the time the run began');
  big.close();
});

test('11: an Intel Mac is refused at once, before anything is downloaded', async () => {
  assert.equal(unsupportedSystem('linux', 'x64'), null);
  assert.equal(unsupportedSystem('darwin', 'arm64'), null);
  assert.equal(unsupportedSystem('win32', 'x64'), null);
  const python = process.env.HYDOR_SUGGEST_PYTHON;
  delete process.env.HYDOR_SUGGEST_PYTHON;
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  const arch = Object.getOwnPropertyDescriptor(process, 'arch')!;
  const mac = openDb(path.join(tmp, 'mac.db'));
  try {
    assert.equal(unsupportedSystem('darwin', 'x64'), 'Word suggestions need a Mac with Apple silicon');
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    Object.defineProperty(process, 'arch', { value: 'x64' });
    const own = new SuggestService(mac);
    const st = own.configure({ enabled: true }).status;
    assert.equal(st.state, 'failed');
    assert.equal(st.detail, 'Word suggestions need a Mac with Apple silicon');
    assert.ok(!fs.existsSync(path.join(DATA, 'suggest', 'venv')), 'no environment was made');
    own.stop();
  } finally {
    Object.defineProperty(process, 'platform', platform);
    Object.defineProperty(process, 'arch', arch);
    process.env.HYDOR_SUGGEST_PYTHON = python;
    mac.close();
  }
});

test('14: a worker takes requests only once it has its models; short memory is not asked about on every request', async () => {
  await put({ enabled: true, llm: 'off', personalise: true });
  priv.stopWorker();
  await until('it to be gone', async () => svc.pids().worker === undefined);
  flag('slowload', true);
  const before = logLines().length;
  assert.equal((await ask({ surface: 'chat', text: 'wake slowly' })).statusCode, 204);
  await until('the load to begin', async () => logLines().slice(before).some((l) => l.op === 'load'));
  assert.equal(svc.pids().worker, undefined, 'not yet the worker that requests go to');
  assert.equal((await ask({ surface: 'chat', text: 'too early' })).statusCode, 204);
  assert.ok(!logLines().slice(before).some((l) => l.op === 'suggest'), 'and none reached it');
  await until('the worker', async () => svc.pids().worker);
  flag('slowload', false);
  assert.equal((await ask({ surface: 'chat', text: 'now' })).statusCode, 200);
  // Memory found short: asked again only after a while.
  priv.stopWorker();
  priv.memShortUntil = Date.now() + 5000;
  const b = logLines().length;
  assert.equal((await ask({ surface: 'chat', text: 'no memory' })).statusCode, 204);
  await sleep(400);
  assert.ok(!logLines().slice(b).some((l) => l.boot), 'no worker was started while memory is known to be short');
  priv.memShortUntil = 0;
});

// ---- what suggestions did: counts only -----------------------------------------------------------------------------

const zero = { shown: 0, taken: 0, typedThrough: 0, wrong: 0, saved: 0, typedChars: 0 };
const counts = (c: Partial<typeof zero>) => ({ ...zero, ...c });
const postUsage = (payload: unknown) => app.inject({ method: 'POST', url: '/api/suggest/usage', payload: payload as any });

test('usage routes: counts add up, GET and PUT show them, nothing but counts is kept, and Reset starts again', async () => {
  await app.inject({ method: 'DELETE', url: '/api/suggest/usage' });
  const before = Date.now();
  const first = (await get()).status.usage;
  assert.deepEqual([first.total, first.today, first.week], [zero, zero, zero], 'nothing counted at first');
  assert.ok(first.since >= before - 5000);
  const a = await postUsage({ shown: 10, taken: 3, typedThrough: 2, wrong: 4, saved: 20, typedChars: 90 });
  assert.equal(a.statusCode, 200);
  assert.deepEqual(a.json().usage.total, counts({ shown: 10, taken: 3, typedThrough: 2, wrong: 4, saved: 20, typedChars: 90 }));
  const b = await postUsage({ shown: 1, saved: 2 });
  assert.deepEqual(b.json().usage.total, counts({ shown: 11, taken: 3, typedThrough: 2, wrong: 4, saved: 22, typedChars: 90 }), 'a count left out is 0');
  assert.equal((await postUsage({})).statusCode, 200, 'nothing to add is fine');
  const u = (await get()).status.usage;
  assert.deepEqual(u.total, b.json().usage.total);
  assert.deepEqual(u.today, u.total, 'all of it was today');
  assert.deepEqual(u.week, u.total);
  const put = await app.inject({ method: 'PUT', url: '/api/suggest', payload: {} });
  assert.deepEqual(put.json().status.usage, u, 'PUT shows the same');
  // Only numbers are kept: nothing a body could carry besides them.
  assert.deepEqual(Object.keys(JSON.parse(kvGet(db, USAGE_KEY)!)).sort(), ['days', 'since', 'total']);
  const reset = await app.inject({ method: 'DELETE', url: '/api/suggest/usage' });
  assert.equal(reset.statusCode, 200);
  const r = reset.json().status.usage;
  assert.deepEqual([r.total, r.today, r.week], [zero, zero, zero]);
  assert.ok(r.since >= before, 'counting starts again now');
  assert.deepEqual(Object.keys(JSON.parse(kvGet(db, USAGE_KEY)!).days), []);
});

test('usage routes: whole numbers from 0 to 5,000, known counts only; a refused body adds nothing', async () => {
  await app.inject({ method: 'DELETE', url: '/api/suggest/usage' });
  const bad = async (payload: unknown, field: string) => {
    const r = await postUsage(payload);
    assert.equal(r.statusCode, 400, JSON.stringify(payload));
    assert.match(r.json().message, new RegExp(field), JSON.stringify(payload));
  };
  await bad({ shown: -1 }, 'shown');
  await bad({ taken: 1.5 }, 'taken');
  await bad({ wrong: '3' }, 'wrong');
  await bad({ saved: null }, 'saved');
  await bad({ typedChars: 5001 }, 'typedChars');
  await bad({ typedThrough: Infinity }, 'typedThrough');
  await bad({ text: 'hello' }, 'text');
  await bad({ shown: 1, taken: 2, extra: 1 }, 'extra');
  await bad([1, 2], 'object');
  assert.deepEqual((await get()).status.usage.total, zero, 'none of them added anything, not even the valid counts beside a bad one');
  const edge = await postUsage({ shown: 5000, typedChars: 5000, taken: 0 });
  assert.equal(edge.statusCode, 200, '5,000 is allowed');
  assert.deepEqual(edge.json().usage.total, counts({ shown: 5000, typedChars: 5000 }));
  assert.throws(() => cleanUsage({ shown: 5001 }), HttpError);
  await app.inject({ method: 'DELETE', url: '/api/suggest/usage' });
});

test('usage: today and the week are summed by local day, the last 31 days are kept, and what is kept is only counts', () => {
  const udb = openDb(path.join(tmp, 'usage.db'));
  const at = (back: number, hour = 10) => new Date(2026, 5, 20 - back, hour).getTime();
  const now = at(0, 15);
  assert.equal(dayKey(now), '2026-06-20');
  assert.equal(dayBefore(now, 0), '2026-06-20');
  assert.equal(dayBefore(now, 7), '2026-06-13');
  assert.equal(dayBefore(now, 20), '2026-05-31', 'across a month');
  assert.equal(dayBefore(new Date(2026, 0, 3, 9).getTime(), 5), '2025-12-29', 'and a year');
  resetUsage(udb, at(40));
  // One count of each size on days 40 (the start), 31, 30, 7, 6, 1 and 0 before `now`: the day is the local one.
  addUsage(udb, counts({ shown: 1 }), at(31));
  addUsage(udb, counts({ shown: 2 }), at(30, 0)); // just after midnight
  addUsage(udb, counts({ shown: 4 }), at(7, 23)); // just before midnight
  addUsage(udb, counts({ shown: 8 }), at(6, 0));
  addUsage(udb, counts({ shown: 16, saved: 5 }), at(1));
  addUsage(udb, counts({ shown: 32, saved: 7 }), now);
  const u = readUsage(udb, now);
  assert.equal(u.since, at(40));
  assert.deepEqual(u.today, counts({ shown: 32, saved: 7 }), 'today is the local day');
  assert.deepEqual(u.week, counts({ shown: 8 + 16 + 32, saved: 12 }), 'the week is today and the six days before it');
  const kept = JSON.parse(kvGet(udb, USAGE_KEY)!);
  assert.deepEqual(Object.keys(kept.days).sort(), ['2026-05-21', '2026-06-13', '2026-06-14', '2026-06-19', '2026-06-20'], 'the 31st day back is gone (the 30 before today stay)');
  assert.equal(kept.total.shown, 63, 'the total keeps what the pruned days held');
  assert.deepEqual(readUsage(udb, now + 40 * 86400_000).week, zero, 'a later week is empty');
  assert.deepEqual(readUsage(udb, now + 40 * 86400_000).total, kept.total, 'and the total is not');
  assert.deepEqual(Object.keys(JSON.parse(kvGet(udb, USAGE_KEY)!).days).length, 5, 'reading changes nothing kept');
  // A damaged value reads as nothing counted.
  kvSet(udb, USAGE_KEY, '{nonsense');
  assert.deepEqual(readUsage(udb, now).total, zero);
  kvSet(udb, USAGE_KEY, JSON.stringify({ since: 5, total: { shown: -3, taken: 'x', saved: 4.9 }, days: { 'not a day': { shown: 1 }, '2026-06-20': { shown: 2, typedChars: NaN } } }));
  const d = readUsage(udb, now);
  assert.deepEqual([d.since, d.total, d.today], [5, counts({ saved: 4 }), counts({ shown: 2 })], 'what is not a count reads as 0');
  udb.close();
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
