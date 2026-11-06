// Script tests for where whisper.cpp runs: the GPU it is built for (Metal on a Mac, its shaders inside the program;
// CUDA for an NVIDIA GPU with the CUDA toolkit, in the background), the GPU by default and the processor when the GPU
// fails, what it ran on as it said, and how the voice service keeps and shows all that. whisper-cli is a stand-in
// script here: nothing is built, downloaded or run on a GPU. Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/voice/whisper-test.ts
//   mkdir -p /tmp/hydor-test-whisper && CUDA_VISIBLE_DEVICES= DATA_DIR=/tmp/hydor-test-whisper node dist/dev/whisper-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { VoiceState } from '../../shared/voice.ts';
import { silentWav, VoiceService, wantsCudaBuild } from './service.ts';
import { cmakeArgs, deviceOf, findNvcc, gpuToBuild, transcribe, transcribeArgs, type Machine, type Program, type Sources } from './whisper.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
// Nothing here may reach a GPU.
process.env.CUDA_VISIBLE_DEVICES = '';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-whisper-test-'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// What whisper-cli b5454 writes on stderr (the ready-made Linux build's, as it ran here; the GPU ones as ggml writes them).
const CPU_LOG = `load_backend: loaded CPU backend from /x/libggml-cpu-zen4.so
whisper_init_with_params_no_state: use gpu    = 1
whisper_init_with_params_no_state: devices    = 1
whisper_model_load:          CPU total size =    77.11 MB
whisper_backend_init_gpu: device 0: CPU (type: 0)
whisper_backend_init_gpu: no GPU found
system_info: n_threads = 4 / 32 | WHISPER : VITISAI = 0 | COREML = 0 | OPENVINO = 0 | CPU : SSE3 = 1 | AVX2 = 1 |`;
const CUDA_LOG = `ggml_cuda_init: found 2 CUDA devices (Total VRAM: 48160 MiB):
  Device 0: NVIDIA GeForce RTX 4090, compute capability 8.9, VMM: yes, VRAM: 24080 MiB
  Device 1: NVIDIA RTX A5000, compute capability 8.6, VMM: yes, VRAM: 24080 MiB
whisper_model_load:        CUDA0 total size =   147.37 MB
whisper_backend_init_gpu: device 0: CUDA0 (type: 1)
whisper_backend_init_gpu: found GPU device 0: CUDA0 (type: 1, cnt: 0)
whisper_backend_init_gpu: using CUDA0 backend`;
const METAL_LOG = `ggml_metal_device_init: GPU name:   MTL0 (Apple M2 Pro)
ggml_metal_device_init: GPU family: MTLGPUFamilyApple8  (1008)
whisper_backend_init_gpu: device 0: MTL0 (type: 1)
whisper_backend_init_gpu: using MTL0 backend
whisper_backend_init: using BLAS backend
ggml_metal_init: allocating
ggml_metal_init: found device: Apple M2 Pro`;

test('a Mac’s build is for its GPU: Metal on, its shaders inside the one static program; elsewhere none while being set up', () => {
  const mac: Machine = { platform: 'darwin', arch: 'arm64', nvidia: false, nvcc: null };
  const linux: Machine = { platform: 'linux', arch: 'x64', nvidia: true, nvcc: '/usr/local/cuda/bin/nvcc' };
  assert.equal(gpuToBuild(mac), 'metal');
  assert.equal(gpuToBuild(linux), null, 'CUDA comes after, in the background');
  const a = cmakeArgs('/src', '/out', { gpu: 'metal', cmake: [3, 31] });
  for (const f of ['-DGGML_METAL=ON', '-DGGML_METAL_EMBED_LIBRARY=ON', '-DBUILD_SHARED_LIBS=OFF', '-DGGML_NATIVE=ON', '-DGGML_CUDA=OFF']) assert.ok(a.includes(f), f);
  const c = cmakeArgs('/src', '/out', { gpu: null, ninja: true });
  assert.ok(c.includes('-DGGML_METAL=OFF') && c.includes('-DGGML_CUDA=OFF') && c.includes('Ninja'));
});

test('a CUDA build: with the toolkit’s compiler, for the GPUs here only when CMake knows how (3.24), without NCCL', () => {
  const a = cmakeArgs('/src', '/out', { gpu: 'cuda', nvcc: '/opt/cuda/bin/nvcc', cmake: [3, 28] });
  for (const f of ['-DGGML_CUDA=ON', '-DCMAKE_CUDA_COMPILER=/opt/cuda/bin/nvcc', '-DCMAKE_CUDA_ARCHITECTURES=native', '-DGGML_CUDA_NCCL=OFF', '-DBUILD_SHARED_LIBS=OFF', '-DGGML_METAL=OFF']) assert.ok(a.includes(f), f);
  const old = cmakeArgs('/src', '/out', { gpu: 'cuda', nvcc: '/opt/cuda/bin/nvcc', cmake: [3, 22] });
  assert.ok(!old.some((x) => x.startsWith('-DCMAKE_CUDA_ARCHITECTURES')), 'older CMake: ggml chooses');
});

test('the CUDA compiler: CUDACXX, the PATH, CUDA_HOME, /usr/local/cuda, else the newest /usr/local/cuda-*', () => {
  const root = path.join(tmp, 'root');
  const nvcc = (dir: string) => {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.writeFileSync(path.join(root, dir, 'nvcc'), '#!/bin/sh\n', { mode: 0o755 });
    return path.join(root, dir, 'nvcc');
  };
  assert.equal(findNvcc({ PATH: '/nowhere' }, root), null);
  nvcc('usr/local/cuda-12.4/bin');
  const newest = nvcc('usr/local/cuda-12.10/bin');
  assert.equal(findNvcc({ PATH: '/nowhere' }, root), newest);
  const usual = nvcc('usr/local/cuda/bin');
  assert.equal(findNvcc({ PATH: '/nowhere' }, root), usual);
  const home = nvcc('cuda-home/bin');
  assert.equal(findNvcc({ PATH: '/nowhere', CUDA_HOME: path.join(root, 'cuda-home') }, root), home);
  const own = nvcc('on-path');
  assert.equal(findNvcc({ PATH: path.join(root, 'on-path'), CUDA_HOME: path.join(root, 'cuda-home') }, root), own);
  assert.equal(findNvcc({ PATH: '/nowhere', CUDACXX: usual, CUDA_HOME: path.join(root, 'cuda-home') }, root), usual);
});

test('what it ran on, as whisper.cpp says: the processor, CUDA or Metal by the GPU’s name; a GPU that would not start is the processor', () => {
  assert.deepEqual(deviceOf(CPU_LOG), { on: 'cpu' });
  assert.deepEqual(deviceOf(CUDA_LOG), { on: 'gpu', api: 'CUDA', name: 'NVIDIA GeForce RTX 4090' });
  assert.deepEqual(deviceOf(METAL_LOG), { on: 'gpu', api: 'Metal', name: 'Apple M2 Pro' }, 'BLAS is no GPU');
  assert.deepEqual(deviceOf(`${CUDA_LOG}\nwhisper_backend_init_gpu: failed to initialize CUDA0 backend`), { on: 'cpu' });
  assert.deepEqual(deviceOf('ggml_metal_init: GPU name:   Apple M1\nwhisper_backend_init: using Metal backend'), { on: 'gpu', api: 'Metal', name: 'Apple M1' }, 'an older copy');
  assert.deepEqual(deviceOf('whisper_model_load:    Vulkan0 total size =   147.37 MB\nggml_vulkan: 0 = AMD Radeon RX 7900 XTX (RADV NAVI31) | uma: 0'), { on: 'gpu', api: 'Vulkan', name: 'AMD Radeon RX 7900 XTX' });
  assert.equal(deviceOf('whisper_print_timings: total time = 605.58 ms'), null);
});

test('the GPU by default: no -ng (nor -np, whose silence would hide what it ran on); -ng only when told', () => {
  const p: Program = { path: '/x/whisper-cli', source: 'built', gpu: 'cuda', sizeBytes: 0, sns: true, vad: false, ng: true };
  const args = transcribeArgs(p, { model: '/m.bin', file: '/a.wav', lang: 'en' });
  assert.ok(!args.includes('-ng') && !args.includes('-np'));
  assert.ok(transcribeArgs(p, { model: '/m.bin', file: '/a.wav', lang: 'en', cpu: true }).includes('-ng'));
  assert.ok(!transcribeArgs({ ...p, ng: false }, { model: '/m.bin', file: '/a.wav', lang: 'en', cpu: true }).includes('-ng'), 'a copy without -ng');
});

// ---- a stand-in whisper-cli -------------------------------------------------------------------------------

/** A whisper-cli that answers as a GPU build would: its mode file says whether the GPU works, runs out of memory, or nothing works. */
function fakeCli(dir: string): { path: string; mode: (m: 'gpu' | 'oom' | 'cpu' | 'broken' | 'slow') => void; calls: () => string[] } {
  fs.mkdirSync(dir, { recursive: true });
  const cli = path.join(dir, 'whisper-cli');
  const cuda = CUDA_LOG.replace(/'/g, '');
  fs.writeFileSync(
    cli,
    `#!/bin/bash
here="$(cd "$(dirname "$0")" && pwd)"
case "$1" in
  --version) echo "whisper.cpp version: 1.9.5"; exit 0;;
  --help) echo "usage: whisper-cli [options] file0 file1 ...
  -m FNAME,  --model FNAME   model path
  -sns,      --suppress-nst  suppress non-speech tokens
  -ng,       --no-gpu        disable GPU" >&2; exit 0;;
esac
echo "$*" >> "$here/calls"
mode="$(cat "$here/mode" 2>/dev/null)"
ng=0; for a in "$@"; do [ "$a" = "-ng" ] && ng=1; done
[ "$mode" = slow ] && exec sleep 5
[ "$mode" = broken ] && { echo "error: failed to read audio data as wav" >&2; exit 2; }
if [ $ng = 1 ] || [ "$mode" = cpu ]; then echo "whisper_backend_init_gpu: no GPU found" >&2; echo " Heard on the processor."; exit 0; fi
if [ "$mode" = oom ]; then
  echo "ggml_backend_cuda_buffer_type_alloc_buffer: allocating 147.37 MiB on device 0: cudaMalloc failed: out of memory" >&2
  echo "error: failed to initialize whisper context" >&2; exit 3
fi
echo '${cuda}' >&2
echo " Heard on the GPU."
`,
    { mode: 0o755 },
  );
  return {
    path: cli,
    mode: (m) => fs.writeFileSync(path.join(dir, 'mode'), m),
    calls: () => (fs.existsSync(path.join(dir, 'calls')) ? fs.readFileSync(path.join(dir, 'calls'), 'utf8').trim().split('\n') : []),
  };
}

test('a GPU that fails (out of its memory): the same recording on the processor, and why the GPU failed', async () => {
  const f = fakeCli(path.join(tmp, 'cli-a'));
  const p: Program = { path: f.path, source: 'built', gpu: 'cuda', sizeBytes: 0, sns: true, vad: false, ng: true };
  const o = { model: '/m.bin', file: '/a.wav', lang: 'en', timeout: 30_000 };
  f.mode('gpu');
  assert.deepEqual(await transcribe(p, o), { text: 'Heard on the GPU.', device: { on: 'gpu', api: 'CUDA', name: 'NVIDIA GeForce RTX 4090' }, gpuError: undefined });
  f.mode('oom');
  const h = await transcribe(p, o);
  assert.equal(h.text, 'Heard on the processor.');
  assert.deepEqual(h.device, { on: 'cpu' });
  assert.match(h.gpuError ?? '', /out of memory/);
  const calls = f.calls();
  assert.equal(calls.length, 3);
  assert.ok(!calls[1].includes('-ng') && calls[2].includes('-ng'), 'tried on the GPU, then on the processor');
});

test('no second try when the processor would fail too, when the copy has no GPU, or when it ran out of time', async () => {
  const f = fakeCli(path.join(tmp, 'cli-b'));
  const gpu: Program = { path: f.path, source: 'built', gpu: 'cuda', sizeBytes: 0, sns: true, vad: false, ng: true };
  const o = { model: '/m.bin', file: '/a.wav', lang: 'en', timeout: 30_000 };
  f.mode('broken');
  await assert.rejects(transcribe(gpu, o), /could not read the recording: error: failed to read audio data/);
  assert.equal(f.calls().length, 2, 'the processor was tried, and failed the same way');
  f.mode('oom');
  await assert.rejects(transcribe({ ...gpu, gpu: undefined, source: 'prebuilt' }, o), /out of memory/, 'the ready-made copy runs on the processor already');
  assert.equal(f.calls().length, 3);
  f.mode('slow');
  await assert.rejects(transcribe(gpu, { ...o, timeout: 500 }), /took too long/);
  assert.equal(f.calls().length, 4);
});

// ---- the service ------------------------------------------------------------------------------------------

/** Nothing comes from the network here: a download fails at once. */
const nowhere = { url: 'http://127.0.0.1:9/nothing.tar.gz' };
const SRC: Sources = { prebuilt: {}, source: nowhere, cmake: { x64: nowhere, arm64: nowhere }, models: () => nowhere, vad: nowhere };
const LINUX_NVIDIA: Machine = { platform: 'linux', arch: 'x64', nvidia: true, nvcc: null };

/** A voice folder with the app's whisper.cpp (the stand-in) and the Base model, turned on. */
function voiceDir(name: string, marker: object): { dir: string; cli: ReturnType<typeof fakeCli> } {
  const dir = path.join(tmp, name);
  const cli = fakeCli(path.join(dir, 'whisper'));
  fs.writeFileSync(path.join(dir, 'whisper', '.naget-voice.json'), JSON.stringify(marker));
  fs.mkdirSync(path.join(dir, 'models'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'models', 'ggml-base.bin'), 'model');
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ engine: 'local', size: 'base', english: false }));
  return { dir, cli };
}

test('an NVIDIA GPU’s build is wanted when the toolkit is here and the program runs on the processor only, and not again after it failed', () => {
  const prebuilt: Program = { path: '/x', source: 'prebuilt', sizeBytes: 0, sns: true, vad: true, ng: true };
  const m: Machine = { ...LINUX_NVIDIA, nvcc: '/usr/local/cuda/bin/nvcc' };
  const base = { engine: 'local' as const, prog: prebuilt, machine: m, busy: false };
  assert.equal(wantsCudaBuild(base), true);
  assert.equal(wantsCudaBuild({ ...base, machine: { ...m, nvcc: null } }), false, 'no toolkit');
  assert.equal(wantsCudaBuild({ ...base, machine: { ...m, nvidia: false } }), false, 'no NVIDIA GPU');
  assert.equal(wantsCudaBuild({ ...base, machine: { ...m, platform: 'darwin' } }), false, 'a Mac has Metal');
  assert.equal(wantsCudaBuild({ ...base, prog: { ...prebuilt, source: 'built', gpu: 'cuda' } }), false, 'built for it already');
  assert.equal(wantsCudaBuild({ ...base, prog: { ...prebuilt, source: 'yours' } }), false, 'your own is used as it is');
  assert.equal(wantsCudaBuild({ ...base, engine: 'off' }), false);
  assert.equal(wantsCudaBuild({ ...base, busy: true }), false, 'while it downloads');
  assert.equal(wantsCudaBuild({ ...base, failedWith: '/usr/local/cuda/bin/nvcc' }), false, 'failed with that toolkit');
  assert.equal(wantsCudaBuild({ ...base, failedWith: '/usr/local/cuda-11.8/bin/nvcc' }), true, 'another toolkit since');
});

test('the service: what it ran on shows soon after it is ready, is kept, and a failing GPU sends the next recordings to the processor', async () => {
  const { dir, cli } = voiceDir('svc-a', { source: 'built', gpu: 'cuda' });
  cli.mode('gpu');
  const seen: VoiceState[] = [];
  const svc = new VoiceService({ dir, sources: SRC, machine: () => ({ ...LINUX_NVIDIA, nvcc: '/usr/local/cuda/bin/nvcc' }), onChange: (s) => seen.push(s) });
  await svc.init();
  assert.equal(svc.state().local.status, 'ready');
  assert.equal(svc.state().local.program?.gpu, 'cuda');
  // The check: a second of silence, a moment after it is ready.
  for (let i = 0; i < 40 && !svc.state().local.program?.runsOn; i++) await sleep(100);
  assert.deepEqual(svc.state().local.program?.runsOn, { on: 'gpu', api: 'CUDA', name: 'NVIDIA GeForce RTX 4090' });
  assert.ok(seen.some((s) => s.local.program?.runsOn?.on === 'gpu'), 'the pages heard of it');
  assert.equal(svc.state().local.gpuBuild, undefined, 'built for CUDA already: nothing to build');
  assert.deepEqual(new VoiceService({ dir, sources: SRC, machine: () => LINUX_NVIDIA }).state().local.program, undefined, 'not found before init');
  const again = new VoiceService({ dir, sources: SRC, machine: () => LINUX_NVIDIA });
  await again.init();
  assert.deepEqual(again.state().local.program?.runsOn, { on: 'gpu', api: 'CUDA', name: 'NVIDIA GeForce RTX 4090' }, 'kept for the same program');
  cli.mode('oom');
  const r = await svc.transcribe(silentWav(1), 'en');
  assert.equal(r.text, 'Heard on the processor.');
  assert.deepEqual(svc.state().local.program?.runsOn, { on: 'cpu' });
  assert.match(svc.state().local.program?.gpuError ?? '', /out of memory/);
  const before = cli.calls().length;
  await svc.transcribe(silentWav(1), 'en');
  assert.equal(cli.calls().length, before + 1, 'straight to the processor, for now');
  assert.ok(cli.calls().at(-1)!.includes('-ng'));
});

test('an NVIDIA GPU without the CUDA toolkit says what it needs; a build that failed says why, and Try again builds once more', async () => {
  const { dir, cli } = voiceDir('svc-b', { source: 'prebuilt' });
  cli.mode('cpu');
  const nvcc = path.join(tmp, 'toolkit', 'bin', 'nvcc');
  let machine: Machine = LINUX_NVIDIA;
  const svc = new VoiceService({ dir, sources: SRC, machine: () => machine });
  await svc.init();
  assert.deepEqual(svc.state().local.gpuBuild, { status: 'needs-toolkit' });
  for (let i = 0; i < 40 && !svc.state().local.program?.runsOn; i++) await sleep(100);
  assert.deepEqual(svc.state().local.program?.runsOn, { on: 'cpu' });
  // The toolkit comes: Check again builds (here it fails at once: nothing can be downloaded), and the failure stays.
  fs.mkdirSync(path.dirname(nvcc), { recursive: true });
  fs.writeFileSync(nvcc, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  machine = { ...LINUX_NVIDIA, nvcc };
  const st = await svc.retryGpu();
  assert.equal(st.local.gpuBuild?.status, 'building');
  for (let i = 0; i < 100 && svc.state().local.gpuBuild?.status === 'building'; i++) await sleep(100);
  const failed = svc.state().local.gpuBuild;
  assert.equal(failed?.status, 'failed');
  assert.ok(failed?.error, 'with its reason');
  assert.equal(svc.state().local.status, 'ready', 'dictation still works, on the processor');
  assert.ok(!fs.existsSync(path.join(dir, 'build-gpu')) && !fs.existsSync(path.join(dir, 'whisper-gpu')), 'nothing left of the build');
  const later = new VoiceService({ dir, sources: SRC, machine: () => machine });
  await later.init();
  assert.equal(later.state().local.gpuBuild?.status, 'failed', 'not tried again with that toolkit by itself');
  await svc.remove({ all: true });
  assert.equal(svc.state().local.gpuBuild, undefined);
  assert.ok(!fs.existsSync(path.join(dir, 'gpu-build.json')) && !fs.existsSync(path.join(dir, 'ran.json')));
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed}/${tests.length} passed`);
fs.rmSync(tmp, { recursive: true, force: true });
