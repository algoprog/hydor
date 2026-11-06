// Script tests for the picture tools on this computer (local.ts, cutout.ts, erase.ts, picture_worker.py).
//
// Always: the set-up's states with a stand-in for uv (its steps, a failure and its words, ready); the models'
// downloads from a stand-in server (progress, going on from a part, a damaged one thrown away, one at a time); the
// worker's jobs with a stand-in worker (the routes and the agents' tools, a crash, memory refused with how much is
// needed and made by unloading the other model, the idle unload and quit with short timeouts); the way through
// OpenRouter with a stand-in (cutouts, erasing, putting an answer back in boxes), and words when neither way is there;
// runPython (files in and out, errors, the time limit, stopping, a small environment, isolation, size caps); removing.
//
// With HYDOR_PICTURES_REAL=1: the real thing once (in a capped scope: the cutout model needs about 6 GB while it
// works): setting up with uv, downloading both models (HYDOR_PICTURES_SEED=<folder> copies them from there instead),
// a cutout of a picture with a plain background, an erase of a box (every pixel outside it unchanged), a real plot,
// and the models unloading and the worker quitting when idle.
// Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/images/local-test.ts
//   DATA_DIR=$(mktemp -d /tmp/hydor-test-pictures-XXXX) node dist/dev/local-test.js
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import type { LocalToolsState, PictureAnswer } from '../../shared/images.ts';
import { ASSET } from '../../shared/slides.ts';
import { config } from '../config.ts';
import { kvSet, openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { loadConfig, saveConfig } from '../models/config.ts';
import { getAsset, initAssets, putAsset } from '../pages/assets.ts';
import { readPng, writePng, type Rgba } from '../signatures/png.ts';
import { boxesMask, putBackInBoxes, readBoxes } from './erase.ts';
import { localTools, setCloudTools } from './hooks.ts';
import { localState, pictureTools, pictureWorkerPid, runPython, setPictureToolsForTests, stopPictureTools } from './local.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
process.env.CUDA_VISIBLE_DEVICES = '';
const REAL = process.env.HYDOR_PICTURES_REAL === '1';

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (cond: () => boolean, ms = 8000) => {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await sleep(25);
  return cond();
};
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-pictures-test-')));
const pictures = path.join(config.dataDir, 'pictures');
fs.mkdirSync(config.dataDir, { recursive: true });
// No key to start with, whatever an earlier run left in the scratch folder.
{
  const c = loadConfig();
  delete c.openrouter.apiKey;
  saveConfig(c);
}

/** A picture: `paint(x, y)` gives each pixel's RGBA. */
function picture(w: number, h: number, paint: (x: number, y: number) => [number, number, number, number]): Buffer {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(paint(x, y), (y * w + x) * 4);
  return writePng({ width: w, height: h, data }, { alpha: true });
}
const dataUrl = (b: Buffer) => `data:image/png;base64,${b.toString('base64')}`;
const keptPng = (src: string): Rgba => readPng(getAsset(db, src.slice(ASSET.length))!.data);

const db = openDb(path.join(tmp, 'test.db'));
initAssets(db);
const app = Fastify({ bodyLimit: 40 * 1024 * 1024 });
app.setErrorHandler((err: Error & { status?: number; statusCode?: number }, _req, reply) => reply.code(err.status ?? err.statusCode ?? 500).send({ error: err.message }));
const deps = { app, db, sessions: { adapterByRun: () => null }, broadcast: () => {}, toSubscribers() {}, publicBase: () => 'https://hydor.example' } as unknown as Deps;
pictureTools.routes!(deps);
await app.ready();
const ctx = { runId: 'run1', key: 'claude:p1', agent: 'claude', cwd: tmp, deps } as RunCtx;
const tool = (name: string) => pictureTools.tools!(ctx).find((t) => t.name === name);
const run = async (name: string, args: Record<string, unknown>): Promise<{ text: string; isError?: boolean }> => {
  try {
    const r = await tool(name)!.run(args, ctx);
    return typeof r === 'string' ? { text: r } : r;
  } catch (e) {
    return { text: String((e as Error).message), isError: true };
  }
};
const req = (method: 'GET' | 'POST' | 'DELETE', url: string, body?: unknown) => app.inject({ method, url, payload: body === undefined ? undefined : JSON.stringify(body), headers: body === undefined ? {} : { 'content-type': 'application/json' } });
const state = async (): Promise<LocalToolsState> => (await req('GET', '/api/images/local')).json();
/** A saved picture's line in a tool's answer, as the conversation's card reads it. */
const savedPath = (text: string) => /^(\/.+?\.png) \((\d+)×(\d+), [^)]*\)$/m.exec(text);

ok(localTools() && localTools()!.runPython === runPython, 'the picture tools are lent to the rest (hooks)');

if (!REAL) {
  // ---- a stand-in for uv, models and the worker ----------------------------------------------------------------

  const bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin);
  const uvLog = path.join(tmp, 'uv.log');
  const uvFail = path.join(tmp, 'uv-fail');
  // It makes a "venv" whose Python is this computer's, and pretends to install (or fails, when told).
  fs.writeFileSync(
    path.join(bin, 'uv'),
    [
      '#!/bin/bash',
      `echo "$@" >> ${uvLog}`,
      'if [ "$1" = venv ]; then dir="${@: -1}"; mkdir -p "$dir/bin"; ln -sf "$(command -v python3)" "$dir/bin/python"; exit 0; fi',
      `if [ "$1" = pip ]; then sleep 0.4; if [ -f ${uvFail} ]; then echo "error: no wheels for onnxruntime on this platform" >&2; exit 2; fi; exit 0; fi`,
      'exit 1',
    ].join('\n'),
    { mode: 0o755 },
  );
  process.env.PATH = `${bin}:${process.env.PATH}`;

  // The models: random bytes served in pieces, with ranges, each request noted.
  const blobs: Record<string, Buffer> = { 'cutout.onnx': crypto.randomBytes(300_000), 'erase.onnx': crypto.randomBytes(200_000) };
  const hits: { file: string; range?: string; start: number; end: number }[] = [];
  let ignoreRange = false;
  const srv = http.createServer(async (rq, rs) => {
    const file = (rq.url ?? '').slice(1);
    const hit = { file, range: rq.headers.range, start: Date.now(), end: 0 };
    hits.push(hit);
    const b = blobs[file];
    if (!b) return void rs.writeHead(404).end();
    let from = 0;
    const m = /^bytes=(\d+)-$/.exec(rq.headers.range ?? '');
    if (m && !ignoreRange) {
      from = Number(m[1]);
      if (from >= b.length) return void rs.writeHead(416).end();
      rs.writeHead(206, { 'content-range': `bytes ${from}-${b.length - 1}/${b.length}`, 'content-length': b.length - from });
    } else rs.writeHead(200, { 'content-length': b.length });
    for (let i = from; i < b.length; i += 40_000) {
      rs.write(b.subarray(i, Math.min(b.length, i + 40_000)));
      await sleep(30);
    }
    hit.end = Date.now();
    rs.end();
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
  const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');
  const fakeModels = () => ({
    cutout: { url: `${base}/cutout.onnx`, bytes: blobs['cutout.onnx'].length, sha256: sha(blobs['cutout.onnx']) },
    erase: { url: `${base}/erase.onnx`, bytes: blobs['erase.onnx'].length, sha256: sha(blobs['erase.onnx']) },
  });

  // The worker: the same lines in and out, PNGs of the picture's size, each job noted; a 13×13 picture makes it crash.
  const workerLog = path.join(tmp, 'worker.log');
  const workerCtl = path.join(tmp, 'worker.json');
  fs.writeFileSync(workerCtl, JSON.stringify({ workMs: 40 }));
  const fakeWorker = path.join(tmp, 'fake_worker.py');
  fs.writeFileSync(
    fakeWorker,
    `import json, os, struct, sys, time, zlib
loaded = []
def say(o):
    sys.stdout.write(json.dumps(o) + '\\n'); sys.stdout.flush()
def png(w, h, rgba):
    raw = b''.join(b'\\x00' + bytes(rgba) * w for _ in range(h))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\\x89PNG\\r\\n\\x1a\\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')
def size(p):
    b = open(p, 'rb').read(24)
    return struct.unpack('>II', b[16:24])
def log(s):
    with open(${JSON.stringify(workerLog)}, 'a') as f: f.write(s + '\\n')
say({'ready': True})
for line in sys.stdin:
    req = json.loads(line); rid = req.get('id'); op = req['op']
    if op == 'unload':
        if req['what'] in loaded: loaded.remove(req['what'])
        log(f'unload {req["what"]}')
        say({'id': rid, 'ok': True, 'loaded': loaded}); continue
    w, h = size(req['input'])
    if (w, h) == (13, 13): os._exit(9)
    if op not in loaded:
        say({'id': rid, 'status': 'loading'}); time.sleep(0.08); loaded.append(op)
    say({'id': rid, 'status': 'working'})
    log(json.dumps({'id': rid, 'op': op, 'model': req['model'], 'boxes': req.get('boxes'), 'mask': 'mask' in req, 'max': req.get('max_bytes')}))
    time.sleep(json.load(open(${JSON.stringify(workerCtl)}))['workMs'] / 1000)
    open(req['output'], 'wb').write(png(w, h, (200, 30, 40, 128) if op == 'cutout' else (10, 200, 10, 255)))
    say({'id': rid, 'ok': True, 'w': w, 'h': h, 'scaled': False, 'loaded': loaded, 'rss': 50})
`,
  );
  const jobs = () =>
    fs.existsSync(workerLog)
      ? fs
          .readFileSync(workerLog, 'utf8')
          .split('\n')
          .filter((l) => l.startsWith('{'))
          .map((l) => JSON.parse(l))
      : [];
  setPictureToolsForTests({ models: fakeModels(), worker: fakeWorker, freeMb: () => 64_000 });

  const photo = picture(64, 48, (x, y) => [x * 4, y * 5, 128, 255]);
  fs.writeFileSync(path.join(tmp, 'photo.png'), photo);
  const mask = picture(64, 48, (x, y) => (x >= 10 && x < 30 && y >= 10 && y < 30 ? [255, 255, 255, 255] : [0, 0, 0, 255]));

  // ---- before setting up ----------------------------------------------------------------------------------------

  {
    const s = await state();
    ok(!s.ready && !s.installing && s.canInstall && s.sizeMb === 65 && !s.downloaded.length && !s.loaded.length && !s.error, `nothing set up: ${JSON.stringify(s)}`);
    const hasMpl = (() => {
      try {
        execFileSync('python3', ['-I', '-c', 'import matplotlib'], { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    })();
    const r = await runPython('print(1)', { cwd: path.join(tmp, 'run0'), timeoutMs: 20_000 }).catch((e: Error) => e);
    if (hasMpl) ok(!(r instanceof Error) && r.ok && r.stdout.trim() === '1', 'without the picture tools, a Python here with matplotlib runs plots');
    else ok(r instanceof Error && r.message === 'Plots need Python with matplotlib: set up the picture tools in Settings → Images, video and audio', `no Python with matplotlib: words to act on (${(r as Error).message})`);
    const c = await req('POST', '/api/images/cutout', { src: dataUrl(photo) });
    ok(c.statusCode === 400 && /needs the picture tools on this computer .*Settings → Images, video and audio.*OpenRouter key \(Settings → Models\)/.test(c.json().error), `neither way: ${c.json().error}`);
    const l = await req('POST', '/api/images/cutout', { src: dataUrl(photo), how: 'local' });
    ok(l.statusCode === 400 && /set them up in Settings → Images, video and audio/.test(l.json().error), 'on this computer, asked for, before setting up');
    const cl = await req('POST', '/api/images/cutout', { src: dataUrl(photo), how: 'cloud' });
    ok(cl.statusCode === 400 && cl.json().error === 'Add an OpenRouter key in Settings → Models', 'through OpenRouter without a key');
    const t = await run('remove_background', { path: 'photo.png' });
    ok(t.isError && /neither is set up\. Tell the user/.test(t.text), 'the agent hears what the user can do');
  }

  // ---- setting up ----------------------------------------------------------------------------------------------

  {
    fs.writeFileSync(uvFail, '');
    let s = (await req('POST', '/api/images/local/setup')).json() as LocalToolsState;
    ok(s.installing && !s.ready, 'setting up starts');
    ok(await until(() => !localState().installing), 'and ends');
    s = await state();
    ok(!s.ready && /^Installing ONNX Runtime, NumPy, Pillow and Matplotlib \(about 65 MB\) failed: error: no wheels for onnxruntime/.test(s.error ?? ''), `a failure in words: ${s.error}`);
    fs.rmSync(uvFail);
    const steps = new Set<string>();
    s = (await req('POST', '/api/images/local/setup')).json();
    ok(s.installing && !s.error, 'again, the failure forgotten');
    await until(() => {
      const x = localState();
      if (x.step) steps.add(x.step);
      return !x.installing;
    });
    s = await state();
    ok(s.ready && !s.installing && !s.error && !s.step, `ready: ${JSON.stringify(s)}`);
    ok(
      [...steps].some((x) => /^Installing ONNX Runtime, NumPy, Pillow and Matplotlib \(about 65 MB\)$/.test(x)),
      `its steps shown: ${[...steps].join(' / ')}`,
    );
    const log = fs.readFileSync(uvLog, 'utf8');
    ok(
      /venv --quiet --python >=3\.10,<3\.15 .*pictures\/venv/.test(log) && /pip install --quiet --python .*pictures\/venv\/bin\/python onnxruntime>=1\.20 numpy>=1\.26 pillow>=10\.1 matplotlib>=3\.8/.test(log),
      `uv made the environment and installed: ${log}`,
    );
    ok(fs.readFileSync(path.join(pictures, 'venv', '.packages'), 'utf8') === 'onnxruntime>=1.20 numpy>=1.26 pillow>=10.1 matplotlib>=3.8', 'what it holds is noted');
    ok((await req('POST', '/api/images/local/setup')).json().ready, 'setting up again when ready does nothing');
  }

  // ---- the first use of each tool: its model downloads, one at a time ----------------------------------------------

  {
    const steps = new Set<string>();
    let watching = true;
    void (async () => {
      while (watching) {
        const x = localState();
        if (x.step) steps.add(x.step);
        await sleep(10);
      }
    })();
    const [c, e] = await Promise.all([req('POST', '/api/images/cutout', { src: dataUrl(photo) }), req('POST', '/api/images/erase', { src: dataUrl(photo), mask: dataUrl(mask) })]);
    watching = false;
    const a = c.json() as PictureAnswer;
    ok(c.statusCode === 200 && a.how === 'local' && a.src.startsWith(ASSET) && a.w === 64 && a.h === 48 && a.mime === 'image/png' && a.model === 'BiRefNet-lite' && a.cost === undefined, `a cutout here: ${c.body.slice(0, 200)}`);
    const k = keptPng(a.src);
    ok(k.width === 64 && k.data[3] === 128, 'kept as the editors’ pictures are');
    ok(e.statusCode === 200 && e.json().how === 'local' && e.json().model === 'LaMa', `an erase here: ${e.body.slice(0, 200)}`);
    const downloads = hits.filter((h) => h.file.endsWith('.onnx'));
    ok(downloads.length === 2 && downloads.every((h) => !h.range), 'each model downloaded once, whole');
    ok(downloads[1].start >= downloads[0].end, 'one at a time: the second waited for the first job');
    ok([...steps].some((x) => /^Downloading the background remover \(0 MB, once\): \d+%$/.test(x)) && [...steps].some((x) => /^Downloading the eraser/.test(x)), `downloads show their progress: ${[...steps].join(' / ')}`);
    ok([...steps].includes('Taking the background out on this computer') && [...steps].includes('Erasing on this computer') && [...steps].some((x) => /^Loading the/.test(x)), `and what it does: ${[...steps].join(' / ')}`);
    const s = await state();
    ok(s.downloaded.join() === 'cutout,erase' && s.loaded.join() === 'cutout,erase' && !s.step, `downloaded and loaded: ${JSON.stringify(s)}`);
    ok(fs.readFileSync(path.join(pictures, 'models', 'birefnet-lite.onnx')).equals(blobs['cutout.onnx']) && !fs.readdirSync(path.join(pictures, 'models')).some((f) => f.endsWith('.part')), 'the model kept, no part left');
    const j = jobs();
    ok(j.length === 2 && j[0].op === 'cutout' && j[0].max === 12 * 1024 * 1024 && j[1].op === 'erase' && j[1].mask && /lama\.onnx$/.test(j[1].model), `the worker’s jobs: ${JSON.stringify(j)}`);
    ok(!fs.readdirSync(path.join(pictures, 'jobs')).length, 'each job’s folder goes once done');
  }

  // ---- downloads that stopped, or came out damaged ---------------------------------------------------------------

  {
    stopPictureTools();
    const models = path.join(pictures, 'models');
    fs.rmSync(path.join(models, 'lama.onnx'));
    fs.writeFileSync(path.join(models, 'lama.onnx.part'), blobs['erase.onnx'].subarray(0, 100_000));
    hits.length = 0;
    const e = await req('POST', '/api/images/erase', { src: dataUrl(photo), mask: dataUrl(mask) });
    ok(e.statusCode === 200 && hits.length === 1 && hits[0].range === 'bytes=100000-', `it goes on from where it stopped: ${JSON.stringify(hits)}`);
    ok(fs.readFileSync(path.join(models, 'lama.onnx')).equals(blobs['erase.onnx']), 'and the whole is right');

    fs.rmSync(path.join(models, 'lama.onnx'));
    fs.writeFileSync(path.join(models, 'lama.onnx.part'), blobs['erase.onnx'].subarray(0, 50_000));
    ignoreRange = true;
    hits.length = 0;
    const r = await req('POST', '/api/images/erase', { src: dataUrl(photo), mask: dataUrl(mask) });
    ignoreRange = false;
    ok(r.statusCode === 200 && fs.readFileSync(path.join(models, 'lama.onnx')).equals(blobs['erase.onnx']), 'a server that sends it all again: from the start, still right');

    fs.rmSync(path.join(models, 'lama.onnx'));
    setPictureToolsForTests({ models: { ...fakeModels(), erase: { ...fakeModels().erase, sha256: '0'.repeat(64) } } });
    const bad = await req('POST', '/api/images/erase', { src: dataUrl(photo), mask: dataUrl(mask) });
    ok(bad.statusCode === 502 && /The download of the eraser came out damaged \(it did not match its checksum\), so it was thrown away\. Try again\./.test(bad.json().error), `a damaged download: ${bad.body}`);
    ok(!fs.existsSync(path.join(models, 'lama.onnx')) && !fs.existsSync(path.join(models, 'lama.onnx.part')), 'nothing half kept under its name');
    ok((await state()).error === bad.json().error && !(await state()).downloaded.includes('erase'), 'the state says why');
    setPictureToolsForTests({ models: { ...fakeModels(), erase: { ...fakeModels().erase, url: `${base}/gone.onnx` } } });
    const gone = await req('POST', '/api/images/erase', { src: dataUrl(photo), mask: dataUrl(mask) });
    ok(gone.statusCode === 502 && /The download of the eraser stopped \(the server answered 404\)\. Try again: it goes on from where it stopped\./.test(gone.json().error), `a download that fails: ${gone.body}`);
    setPictureToolsForTests({ models: fakeModels() });
    ok((await req('POST', '/api/images/erase', { src: dataUrl(photo), mask: dataUrl(mask) })).statusCode === 200 && !(await state()).error, 'then it works, and the error is forgotten');
  }

  // ---- what goes in --------------------------------------------------------------------------------------------

  {
    const kept = ASSET + putAsset(db, photo);
    ok((await req('POST', '/api/images/cutout', { src: kept })).json().w === 64, 'a kept picture');
    const cases: [unknown, number, RegExp][] = [
      [undefined, 400, /Which picture/],
      ['naget-asset:0123456789abcdef0123', 404, /no longer kept/],
      ['https://example.com/a.png', 400, /src: a kept picture/],
      [`data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')}`, 415, /is a drawing \(SVG\)/],
      [`data:image/png;base64,${Buffer.from('not a picture at all').toString('base64')}`, 415, /is not a picture/],
    ];
    for (const [src, code, words] of cases) {
      const r = await req('POST', '/api/images/cutout', { src });
      ok(r.statusCode === code && words.test(r.json().error), `${String(src).slice(0, 30)}: ${r.statusCode} ${r.json().error}`);
    }
    ok((await req('POST', '/api/images/cutout', { src: kept, how: 'sideways' })).statusCode === 400, 'how: auto, local or cloud');
    const nm = await req('POST', '/api/images/erase', { src: kept });
    ok(nm.statusCode === 400 && /mask: a PNG data: address/.test(nm.json().error), 'erasing needs a mask');
    const lp = await req('POST', '/api/images/erase', { src: kept, mask: dataUrl(mask), how: 'local', prompt: 'a calm sea' });
    ok(lp.statusCode === 400 && /On this computer it can only erase/.test(lp.json().error), 'what to put there instead is not for this computer');
    const nk = await req('POST', '/api/images/erase', { src: kept, mask: dataUrl(mask), prompt: 'a calm sea' });
    ok(nk.statusCode === 400 && /goes through OpenRouter: add an OpenRouter key in Settings → Models, or leave the words out/.test(nk.json().error), 'nor without a key');
  }

  // ---- the agents' tools ----------------------------------------------------------------------------------------

  {
    fs.rmSync(workerLog, { force: true });
    const c = await run('remove_background', { path: 'photo.png' });
    const m = savedPath(c.text);
    ok(!c.isError && /^Took the background out with BiRefNet-lite, on this computer \(free and private\):/.test(c.text) && m && m[1] === path.join(tmp, 'images', 'photo-cutout.png') && m[2] === '64', `remove_background: ${c.text}`);
    ok(fs.readFileSync(path.join(tmp, 'images', 'photo-cutout.png')).readUInt32BE(0) === 0x89504e47, 'its PNG in images/');
    ok(savedPath((await run('remove_background', { path: 'photo.png', name: 'Logo, clean!' })).text)?.[1] === path.join(tmp, 'images', 'logo-clean.png'), 'a name of its own');
    ok(savedPath((await run('remove_background', { path: 'photo.png' })).text)?.[1] === path.join(tmp, 'images', 'photo-cutout-2.png'), 'never over a file that is there');
    const e = await run('erase_from_image', {
      path: 'photo.png',
      boxes: [
        { x: 10, y: 10, w: 20, h: 20 },
        { x: 40.5, y: 0, w: 100, h: 5 },
      ],
    });
    ok(!e.isError && /^Erased 2 boxes with LaMa, on this computer \(free and private\):/.test(e.text) && savedPath(e.text)?.[1] === path.join(tmp, 'images', 'photo-erased.png'), `erase_from_image: ${e.text}`);
    const sent = jobs().find((x) => x.op === 'erase');
    ok(
      JSON.stringify(sent?.boxes) ===
        JSON.stringify([
          [8, 8, 24, 24],
          [37, -3, 107, 11],
        ]) && !sent.mask,
      `boxes go to the worker with a little room: ${JSON.stringify(sent?.boxes)}`,
    );
    ok(/Give boxes around what to take away, or say what it is in prompt/.test((await run('erase_from_image', { path: 'photo.png' })).text), 'boxes or words');
    ok(/boxes\[0\]: x and y/.test((await run('erase_from_image', { path: 'photo.png', boxes: [{ x: 1, y: 1, w: 0, h: 3 }] })).text), 'a box without a size');
    const w = await run('erase_from_image', { path: 'photo.png', prompt: 'the cat' });
    ok(w.isError && /goes through OpenRouter, and no OpenRouter key is set: give boxes/.test(w.text), `words alone need OpenRouter: ${w.text}`);
    ok((await run('remove_background', { path: 'nope.png' })).text.startsWith('No such picture'), 'a picture that is not there');
    fs.writeFileSync(path.join(tmp, 'notes.txt'), 'hello');
    ok(/notes\.txt is not a picture/.test((await run('remove_background', { path: 'notes.txt' })).text), 'a file that is not a picture');
    kvSet(db, 'images', JSON.stringify({ enabled: false }));
    ok(pictureTools.tools!(ctx).length === 0, 'no tools while images are off in Settings');
    kvSet(db, 'images', JSON.stringify({ enabled: true }));
    ok(
      pictureTools.tools!(ctx)
        .map((t) => t.name)
        .join() === 'remove_background,erase_from_image',
      'and back',
    );
  }

  // ---- a worker that crashes, memory, and the hooks ------------------------------------------------------------------

  {
    const pid = pictureWorkerPid();
    fs.writeFileSync(
      path.join(tmp, 'crash.png'),
      picture(13, 13, () => [0, 0, 0, 255]),
    );
    const c = await run('erase_from_image', { path: 'crash.png', boxes: [{ x: 1, y: 1, w: 3, h: 3 }] });
    ok(c.isError && /^Nothing was erased: The picture tools stopped \(exit 9\)/.test(c.text), `a crash, in words: ${c.text}`);
    ok(pid && !alive(pid) && pictureWorkerPid() === undefined, 'the worker is gone');
    const again = await req('POST', '/api/images/cutout', { src: dataUrl(photo) });
    ok(again.statusCode === 200 && pictureWorkerPid() && pictureWorkerPid() !== pid, 'the next picture starts a new one');

    setPictureToolsForTests({ freeMb: () => 1000 });
    const erases = jobs().filter((j) => j.op === 'erase').length;
    const low = await req('POST', '/api/images/erase', { src: dataUrl(photo), mask: dataUrl(mask) });
    ok(
      low.statusCode === 503 &&
        /^There is not enough free memory to erase part of a picture on this computer now: it needs about 1\.2 GB free, and 1\.0 GB is\. Close some programs and try again, or do it through OpenRouter instead\.$/.test(low.json().error),
      `how much it needs: ${low.json().error}`,
    );
    ok(jobs().filter((j) => j.op === 'erase').length === erases && (await state()).error === low.json().error, 'nothing loaded, and the state says why');
    // Short of memory with the other model in it: that one goes first, then there is room.
    setPictureToolsForTests({ freeMb: () => 64_000 });
    ok((await req('POST', '/api/images/cutout', { src: dataUrl(photo) })).statusCode === 200 && localState().loaded.join() === 'cutout', 'the cutout model is in memory');
    setPictureToolsForTests({ freeMb: () => (localState().loaded.includes('cutout') ? 1000 : 64_000) });
    const made = await req('POST', '/api/images/erase', { src: dataUrl(photo), mask: dataUrl(mask) });
    ok(made.statusCode === 200 && localState().loaded.join() === 'erase' && fs.readFileSync(workerLog, 'utf8').includes('unload cutout'), `the other model unloaded to make room: ${made.body.slice(0, 120)}`);
    setPictureToolsForTests({ freeMb: () => 64_000 });

    const hook = localTools()!;
    ok(hook.ready() && hook.state().ready, 'ready, as the others see it');
    const png = await hook.cutout(photo);
    ok(readPng(png).width === 64, 'a cutout through the hooks: a PNG');
    ok(readPng(await hook.erase(photo, mask)).data[1] === 200, 'an erase through the hooks');
  }

  // ---- idle: models unload, then the worker quits ---------------------------------------------------------------------

  {
    process.env.HYDOR_PICTURES_MODEL_IDLE_MS = '300';
    process.env.HYDOR_PICTURES_WORKER_IDLE_MS = '900';
    const at = Date.now();
    ok((await req('POST', '/api/images/cutout', { src: dataUrl(photo) })).statusCode === 200, 'a picture');
    ok((await req('POST', '/api/images/erase', { src: dataUrl(photo), mask: dataUrl(mask) })).statusCode === 200, 'and another');
    const pid = pictureWorkerPid()!;
    ok(localState().loaded.length === 2, 'both models in memory');
    ok(await until(() => localState().loaded.length === 0, 2000), 'each unloads when idle');
    ok(Date.now() - at < 900 && pictureWorkerPid() === pid && alive(pid), `the worker waits a little longer (${Date.now() - at} ms, ${pictureWorkerPid()} ${pid} ${alive(pid)})`);
    ok(await until(() => pictureWorkerPid() === undefined && !alive(pid), 4000), 'then quits');
    ok(Date.now() - at >= 900, `not before its time (${Date.now() - at} ms)`);
    delete process.env.HYDOR_PICTURES_MODEL_IDLE_MS;
    delete process.env.HYDOR_PICTURES_WORKER_IDLE_MS;
    ok((await req('POST', '/api/images/cutout', { src: dataUrl(photo) })).statusCode === 200 && pictureWorkerPid(), 'and starts again when needed');
  }

  // ---- Python for plots ----------------------------------------------------------------------------------------------

  process.env.HYDOR_SECRET_FOR_TEST = 'never seen';
  {
    const cwd = path.join(tmp, 'plot1');
    const r = await runPython(
      [
        'import os, sys, json',
        "rows = open('data.csv').read().split()",
        "open('out.txt', 'w').write(str(len(rows)))",
        "os.makedirs('sub', exist_ok=True)",
        "open('sub/plot.svg', 'w').write('<svg/>')",
        "print('rows', len(rows))",
        "print('home', os.environ['HOME'])",
        "print('env', os.environ.get('MPLBACKEND'), os.environ.get('HYDOR_SECRET_FOR_TEST'), repr(os.environ.get('CUDA_VISIBLE_DEVICES')))",
        "print('path', '' in sys.path, os.getcwd() in sys.path)",
        "os.symlink('/etc/hostname', 'leak')",
      ].join('\n'),
      { cwd, timeoutMs: 20_000, files: { 'data.csv': Buffer.from('a,b\n1,2\n3,4\n'), 'json.py': Buffer.from('raise SystemExit("a planted json.py ran")') } },
    );
    ok(r.ok && /^rows 3$/m.test(r.stdout), `it runs, with its files: ${r.stdout} ${r.stderr}`);
    ok(Object.keys(r.files).sort().join() === 'out.txt,sub/plot.svg' && r.files['out.txt'].toString() === '3', `what it wrote comes back, nothing else: ${Object.keys(r.files)}`);
    ok(/^home \/tmp\/hydor-python-[^/\n]+\/home$/m.test(r.stdout) && /^env Agg None ''$/m.test(r.stdout), `a small environment of its own (no keys, a home of its own): ${r.stdout}`);
    ok(/^path False False$/m.test(r.stdout), 'its folder is not where Python looks for modules (a planted json.py stays put)');
    const bad = await runPython("raise ValueError('bad data')", { cwd: path.join(tmp, 'plot2'), timeoutMs: 20_000 });
    ok(!bad.ok && /ValueError: bad data/.test(bad.stderr), 'an error comes back as it was');
    const t0 = Date.now();
    const slow = await runPython('while True:\n    pass', { cwd: path.join(tmp, 'plot3'), timeoutMs: 1500 });
    ok(!slow.ok && /Stopped: it ran for longer than 1\.5 seconds\.$/.test(slow.stderr) && Date.now() - t0 < 6000, `stopped at its time: ${slow.stderr} (${Date.now() - t0} ms)`);
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 300);
    const t1 = Date.now();
    const stopped = await runPython('import time\ntime.sleep(30)', { cwd: path.join(tmp, 'plot4'), timeoutMs: 60_000, signal: ac.signal }).catch((e: Error) => e);
    ok(stopped instanceof Error && stopped.name === 'AbortError' && Date.now() - t1 < 5000, 'stopped when asked');
    const big = await runPython("open('big.bin', 'wb').write(b'0' * (21 * 1024 * 1024))\nopen('small.txt', 'w').write('x')", { cwd: path.join(tmp, 'plot5'), timeoutMs: 30_000 });
    ok(big.ok && !big.files['big.bin'] && big.files['small.txt'] && /big\.bin was left out: it is too large/.test(big.stderr), 'files too large to come back are named');
    const out = await runPython('print("x")', { cwd: path.join(tmp, 'plot6'), timeoutMs: 10_000, files: { '../escape.txt': Buffer.from('no') } }).catch((e: Error) => e);
    ok(out instanceof Error && /files go inside the folder/.test(out.message) && !fs.existsSync(path.join(tmp, 'escape.txt')), 'files go only inside its folder');
    const loud = await runPython("print('y' * 200_000)", { cwd: path.join(tmp, 'plot7'), timeoutMs: 10_000 });
    ok(loud.ok && loud.stdout.length <= 64 * 1024, 'what it prints is kept short');
  }
  // ---- through OpenRouter (a stand-in for make.ts) ---------------------------------------------------------------------

  {
    const asked: any[] = [];
    const green = picture(32, 24, () => [0, 255, 0, 255]);
    setCloudTools({
      async edit(_db, ask) {
        asked.push(ask);
        return { src: ASSET + putAsset(db, green), w: 32, h: 24, mime: 'image/png', how: 'cloud', model: 'test/painter', cost: 0.012, ...(ask.mask ? { whole: true } : {}) };
      },
      cleanSvg: () => null,
    });
    const c = loadConfig();
    c.openrouter.apiKey = 'sk-or-test';
    saveConfig(c);
    const cut = await req('POST', '/api/images/cutout', { src: dataUrl(photo), how: 'cloud' });
    ok(cut.statusCode === 200 && cut.json().how === 'cloud' && cut.json().model === 'test/painter' && cut.json().cost === 0.012, `a cutout through OpenRouter: ${cut.body.slice(0, 160)}`);
    ok(asked[0].transparent === true && /^Keep the subject exactly as it is, take away everything behind it/.test(asked[0].prompt) && asked[0].src === dataUrl(photo) && !asked[0].mask, 'asked for a see-through background');
    const er = await req('POST', '/api/images/erase', { src: dataUrl(photo), mask: dataUrl(mask), how: 'cloud' });
    ok(
      er.statusCode === 200 && er.json().whole === true && asked[1].mask === dataUrl(mask) && /^Take away what is in the white area of the mask and fill it in as the surroundings continue/.test(asked[1].prompt),
      'an erase: the mask, its whole answer for the editor',
    );
    const sea = await req('POST', '/api/images/erase', { src: dataUrl(photo), mask: dataUrl(mask), prompt: 'a calm sea' });
    ok(sea.statusCode === 200 && /^Replace what is in the white area of the mask with a calm sea/.test(asked[2].prompt), 'something else in its place goes through OpenRouter');
    ok((await req('POST', '/api/images/cutout', { src: dataUrl(photo) })).json().how === 'local', 'auto: here when the picture tools are ready');

    const t = await run('erase_from_image', { path: 'photo.png', prompt: 'the cat' });
    ok(!t.isError && /^Took away the cat with test\/painter through OpenRouter \(\$0\.012\):/.test(t.text) && /the cat from the picture/.test(asked[3].prompt) && !asked[3].mask, `words alone: ${t.text}`);
    await req('DELETE', '/api/images/local');
    const rb = await run('remove_background', { path: 'photo.png' });
    ok(!rb.isError && /^Took the background out with test\/painter through OpenRouter \(\$0\.012\):/.test(rb.text) && /small details may differ/.test(rb.text), `remove_background through OpenRouter: ${rb.text}`);
    const eb = await run('erase_from_image', { path: 'photo.png', boxes: [{ x: 10, y: 10, w: 20, h: 20 }] });
    const saved = savedPath(eb.text);
    ok(!eb.isError && saved && /^Erased the box with test\/painter through OpenRouter/.test(eb.text) && !/whole picture/.test(eb.text), `boxes through OpenRouter: ${eb.text}`);
    const shown = readPng(asked[asked.length - 1].mask.startsWith('data:') ? Buffer.from(asked[asked.length - 1].mask.split(',')[1], 'base64') : Buffer.alloc(0));
    ok(shown.width === 64 && shown.height === 48 && shown.data[(15 * 64 + 15) * 4] === 255 && shown.data[(40 * 64 + 50) * 4] === 0, 'the model is shown the boxes');
    const out = readPng(fs.readFileSync(saved![1]));
    const px = (x: number, y: number) => [...out.data.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 4)];
    const was = readPng(photo);
    const same = (x: number, y: number) => px(x, y).join() === [...was.data.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 4)].join();
    ok(px(15, 15).join() === '0,255,0,255' && px(8, 8).join() === '0,255,0,255' && px(31, 31).join() === '0,255,0,255' && same(7, 7) && same(32, 32) && same(40, 40), 'its answer put in only in the boxes, the rest as it was');
  }

  // ---- the pieces --------------------------------------------------------------------------------------------------

  {
    ok(JSON.stringify(readBoxes([{ x: 100, y: 50, w: 200, h: 100 }])) === JSON.stringify([{ x: 94, y: 44, w: 212, h: 112 }]), 'a box gets room in proportion');
    ok(readBoxes(undefined).length === 0 && readBoxes([]).length === 0, 'no boxes');
    let threw = '';
    try {
      readBoxes(Array.from({ length: 21 }, () => ({ x: 0, y: 0, w: 1, h: 1 })));
    } catch (e) {
      threw = (e as Error).message;
    }
    ok(threw === 'boxes: at most 20 at once.', 'at most 20');
    const m = readPng(boxesMask(4000, 2000, [{ x: 1000, y: 500, w: 400, h: 400 }]));
    ok(m.width === 1024 && m.height === 512 && m.data[(200 * 1024 + 300) * 4] === 255 && m.data[(100 * 1024 + 100) * 4] === 0, 'a mask in the picture’s shape, at most 1024 across');
    ok(putBackInBoxes(Buffer.from('not a png'), photo, []) === null, 'only PNGs are put back');
  }

  // ---- removing ----------------------------------------------------------------------------------------------------

  {
    const s = (await req('DELETE', '/api/images/local')).json() as LocalToolsState;
    ok(!s.ready && !s.downloaded.length && !s.loaded.length && !fs.existsSync(pictures) && pictureWorkerPid() === undefined, `removed: ${JSON.stringify(s)}`);
    const c = loadConfig();
    delete c.openrouter.apiKey;
    saveConfig(c);
    const r = await req('POST', '/api/images/erase', { src: dataUrl(photo), mask: dataUrl(mask) });
    ok(r.statusCode === 400 && /Erasing needs the picture tools on this computer/.test(r.json().error), 'after removing, without a key: words');
  }
  srv.close();
} else {
  // ---- the real thing ----------------------------------------------------------------------------------------------

  process.env.HYDOR_PICTURES_MODEL_IDLE_MS = '2500';
  process.env.HYDOR_PICTURES_WORKER_IDLE_MS = '6000';
  const seed = process.env.HYDOR_PICTURES_SEED;
  const t0 = Date.now();
  let s = (await req('POST', '/api/images/local/setup')).json() as LocalToolsState;
  ok(s.installing, 'setting up');
  ok(await until(() => !localState().installing, 15 * 60_000), 'set up');
  s = await state();
  ok(s.ready && !s.error, `ready in ${Math.round((Date.now() - t0) / 1000)} s: ${JSON.stringify(s)}`);
  if (seed) {
    fs.mkdirSync(path.join(pictures, 'models'), { recursive: true });
    for (const [from, to] of [
      ['cutout.onnx', 'birefnet-lite.onnx'],
      ['erase.onnx', 'lama.onnx'],
    ])
      fs.copyFileSync(path.join(seed, from), path.join(pictures, 'models', to));
  }

  // A plot, for real.
  {
    const r = await runPython(
      [
        'import matplotlib',
        "matplotlib.use('Agg')",
        'import matplotlib.pyplot as plt',
        'fig, ax = plt.subplots(figsize=(4, 3))',
        'ax.plot([1, 2, 3], [2, 4, 3])',
        "ax.set_title('Sales')",
        "fig.savefig('plot.svg')",
        'print(matplotlib.get_backend())',
      ].join('\n'),
      { cwd: path.join(tmp, 'plot'), timeoutMs: 90_000 },
    );
    ok(r.ok && /<svg/.test(r.files['plot.svg']?.toString() ?? '') && /agg/i.test(r.stdout), `a plot from the picture tools’ Python: ${r.stderr.slice(-300)}`);
  }

  // A red disc and a navy square on a plain background: the background goes, the shapes stay, every colour kept.
  const W = 480;
  const H = 360;
  const plain = picture(W, H, (x, y) => ((x - 240) ** 2 + (y - 180) ** 2 < 100 ** 2 ? [200, 30, 40, 255] : x > 270 && x < 340 && y > 200 && y < 270 ? [20, 40, 120, 255] : [238, 236, 230, 255]));
  {
    const steps = new Set<string>();
    let watching = true;
    void (async () => {
      while (watching) {
        const x = localState();
        if (x.step) steps.add(x.step);
        await sleep(50);
      }
    })();
    const t = Date.now();
    const r = await req('POST', '/api/images/cutout', { src: dataUrl(plain), how: 'local' });
    watching = false;
    const a = r.json() as PictureAnswer;
    ok(r.statusCode === 200 && a.how === 'local' && a.w === W && a.h === H, `a cutout in ${Math.round((Date.now() - t) / 1000)} s: ${r.body.slice(0, 200)}`);
    console.log(`  steps: ${[...steps].join(' / ')}`);
    if (!seed)
      ok(
        [...steps].some((x) => /^Downloading the background remover \(224 MB, once\): \d+%$/.test(x)),
        'its model downloaded, with progress',
      );
    if (r.statusCode === 200) {
      const k = keptPng(a.src);
      const src = readPng(plain);
      const alpha = (x: number, y: number) => k.data[(y * W + x) * 4 + 3];
      ok(alpha(5, 5) === 0 && alpha(W - 5, H - 5) === 0 && alpha(5, H - 5) === 0 && alpha(400, 60) === 0, `the background is gone: ${alpha(5, 5)} ${alpha(400, 60)}`);
      ok(alpha(240, 180) === 255 && alpha(305, 235) === 255 && alpha(160, 180) === 255, `the subject stays whole: ${alpha(240, 180)} ${alpha(305, 235)}`);
      let same = true;
      for (let i = 0; i < W * H && same; i++) for (let c = 0; c < 3; c++) if (k.data[i * 4 + c] !== src.data[i * 4 + c]) same = false;
      ok(same, 'every pixel’s colour as it was: only how see-through each is changed');
    }
  }

  // A textured picture with a dark square: erased, and every pixel outside the mask exactly as it was.
  let seedN = 7;
  const noise = () => ((seedN = (seedN * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 16;
  const textured = picture(W, H, (x, y) => (x >= 200 && x < 260 && y >= 150 && y < 210 ? [12, 12, 12, 255] : [Math.round(120 + 50 * Math.sin(x / 30) + noise()), Math.round(150 + 40 * Math.cos(y / 25) + noise()), Math.round(170 + noise()), 255]));
  fs.writeFileSync(path.join(tmp, 'textured.png'), textured);
  const inMask = (x: number, y: number) => x >= 194 && x < 266 && y >= 144 && y < 216;
  {
    const mask = picture(W, H, (x, y) => (inMask(x, y) ? [255, 255, 255, 255] : [0, 0, 0, 255]));
    const t = Date.now();
    const r = await req('POST', '/api/images/erase', { src: dataUrl(textured), mask: dataUrl(mask), how: 'local' });
    const a = r.json() as PictureAnswer;
    ok(r.statusCode === 200 && a.how === 'local' && a.model === 'LaMa', `an erase in ${Math.round((Date.now() - t) / 1000)} s: ${r.body.slice(0, 200)}`);
    if (r.statusCode === 200) {
      const k = keptPng(a.src);
      const src = readPng(textured);
      let outside = true;
      let dark = 0;
      let n = 0;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          if (!inMask(x, y)) {
            for (let c = 0; c < 4; c++) if (k.data[i + c] !== src.data[i + c]) outside = false;
          } else if (x >= 200 && x < 260 && y >= 150 && y < 210) {
            n++;
            if (k.data[i] + k.data[i + 1] + k.data[i + 2] < 150) dark++;
          }
        }
      ok(outside, 'every pixel outside the mask exactly as it was');
      ok(dark / n < 0.02, `the dark square is gone (${dark} of ${n} still dark)`);
    }
  }
  {
    const t = await run('erase_from_image', { path: 'textured.png', boxes: [{ x: 200, y: 150, w: 60, h: 60 }] });
    const m = savedPath(t.text);
    ok(!t.isError && m && /^Erased the box with LaMa, on this computer/.test(t.text), `erase_from_image here: ${t.text}`);
    if (m) {
      const k = readPng(fs.readFileSync(m[1]));
      const src = readPng(textured);
      let outside = true;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!(x >= 198 && x < 262 && y >= 148 && y < 212)) for (let c = 0; c < 4; c++) if (k.data[(y * W + x) * 4 + c] !== src.data[(y * W + x) * 4 + c]) outside = false;
      ok(outside, 'outside the box (and its room) as it was');
    }
    const far = await run('erase_from_image', { path: 'textured.png', boxes: [{ x: 900, y: 900, w: 10, h: 10 }] });
    ok(far.isError && /The boxes are outside the picture, which is 480×360 pixels\./.test(far.text), `a box outside the picture: ${far.text}`);
  }
  s = await state();
  ok(s.downloaded.join() === 'cutout,erase' && s.loaded.includes('erase'), `both models here, the eraser in memory: ${JSON.stringify(s)}`);
  {
    const pid = pictureWorkerPid()!;
    ok(await until(() => localState().loaded.length === 0, 6000), 'unloaded when idle');
    ok(pictureWorkerPid() === pid, 'the worker still there');
    ok(await until(() => pictureWorkerPid() === undefined && !alive(pid), 9000), 'then it quits');
  }
  setPictureToolsForTests({ freeMb: () => 3000 });
  const low = await req('POST', '/api/images/cutout', { src: dataUrl(plain) });
  ok(low.statusCode === 503 && /it needs about 6\.\d GB free, and 2\.9 GB is/.test(low.json().error), `not enough memory: ${low.json().error}`);
  setPictureToolsForTests({ freeMb: null });
  const gone = (await req('DELETE', '/api/images/local')).json() as LocalToolsState;
  ok(!gone.ready && !fs.existsSync(pictures), 'removed');
}

stopPictureTools();
await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
