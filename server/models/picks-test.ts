// Script tests for running models here: a model on the GPU with room, split across 2, 4 or 8 GPUs when none has
// room (vLLM's tensor parallelism), on a Mac's Apple silicon, or on the CPU; and the suggested models, by what each
// kind of computer can run (a desktop with NVIDIA cards, a Mac, a computer with neither, a large server).
// Hugging Face is answered here. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/models/picks-test.ts
//   DATA_DIR=/tmp/hydor-test-picks node dist/dev/picks-test.js
import assert from 'node:assert/strict';
import type { LocalModel, MachineInfo, ModelDownload } from '../../shared/types.ts';
import { LOCAL_PICKS, OPENROUTER_PICKS } from '../../shared/model-picks.ts';
import { fit, gpuPlan } from './machine.ts';
import { localPicks, routeOf } from './picks.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const GB = 1e9;
const GiB = 1024 ** 3;
const card = (index: number, name: string, total: number, used = 0) => ({ index, name, totalBytes: total * GiB, freeBytes: (total - used) * GiB });
const box = (gpus: MachineInfo['gpus'], ram = 64, more: Partial<MachineInfo> = {}): MachineInfo => ({ gpus, ramBytes: ram * GiB, ramFreeBytes: ram * 0.8 * GiB, diskFreeBytes: 2000 * GiB, cpus: 16, ...more });
const desktop = box([card(0, 'NVIDIA GeForce RTX 4090', 24, 9), card(1, 'NVIDIA GeForce RTX 4090', 24), card(2, 'NVIDIA GeForce RTX 4090', 24, 3), card(3, 'NVIDIA GeForce RTX 4090', 24, 3)], 125);
const mac = box([], 64, { apple: { chip: 'Apple M3 Max' } });
const laptop = box([], 16);
const server = box(Array.from({ length: 8 }, (_, i) => card(i, 'NVIDIA H200', 141)), 2000);

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

test('a model goes on the GPU with the most room, or split across the fewest GPUs that hold it', () => {
  assert.deepEqual(gpuPlan(desktop, 20 * GiB)?.gpus.map((g) => g.index), [1], 'the emptiest card');
  assert.equal(gpuPlan(desktop, 30 * GiB), null, 'too big for one card, and not asked to split');
  const two = gpuPlan(desktop, 30 * GiB, { split: true });
  assert.deepEqual(two?.gpus.map((g) => g.index), [1, 2], 'the two emptiest, in their order');
  assert.ok(two && two.perGpu < 20 * GiB);
  assert.deepEqual(gpuPlan(desktop, 50 * GiB, { split: true })?.gpus.map((g) => g.index), [0, 1, 2, 3], 'four, the busy one too');
  assert.equal(gpuPlan(desktop, 70 * GiB, { split: true }), null, 'one card is busy: four do not hold it');
  assert.equal(gpuPlan(desktop, 200 * GiB, { split: true }), null, 'more than all four hold');
  assert.equal(gpuPlan(desktop, 30 * GiB, { split: true, only: 1 }), null, 'one card asked for: no splitting');
  assert.equal(gpuPlan(mac, 1 * GiB), null, 'no NVIDIA cards on a Mac');
});

test('how a model runs: one card, several, a Mac’s graphics, the CPU, or not at all', () => {
  const one = fit(desktop, { weightBytes: 8 * GB, cacheBytes: 1 * GB, downloadBytes: 8 * GB, cpuOk: false });
  assert.equal(one.verdict, 'good');
  assert.equal(one.gpu, 1);
  assert.equal(one.gpus, undefined);
  const split = fit(desktop, { weightBytes: 24 * GB, cacheBytes: 2 * GB, downloadBytes: 24 * GB, cpuOk: false, split: true });
  assert.equal(split.verdict, 'good');
  assert.deepEqual(split.gpus, [1, 2]);
  assert.match(split.notes[0], /split across 2 GPUs/);
  assert.equal(fit(desktop, { weightBytes: 24 * GB, cacheBytes: 2 * GB, downloadBytes: 24 * GB, cpuOk: false }).verdict, 'no', 'without splitting it does not fit');
  const m = fit(mac, { weightBytes: 23 * GB, cacheBytes: 2 * GB, downloadBytes: 23 * GB, cpuOk: false, metal: true, active: 1.4 * GB });
  assert.equal(m.verdict, 'good');
  assert.equal(m.where, 'gpu');
  assert.ok((m.tokensPerSec ?? 0) > 50, 'few weights read for each word: quick');
  assert.equal(fit(mac, { weightBytes: 23 * GB, cacheBytes: 2 * GB, downloadBytes: 23 * GB, cpuOk: false }).verdict, 'no', 'a runtime that does not run on a Mac');
  assert.equal(fit(mac, { weightBytes: 60 * GB, cacheBytes: 2 * GB, downloadBytes: 60 * GB, cpuOk: false, metal: true }).verdict, 'no', 'more than its graphics may use');
  const cpu = fit(laptop, { weightBytes: 1.3 * GB, cacheBytes: 0.2 * GB, downloadBytes: 1.3 * GB, cpuOk: true });
  assert.equal(cpu.where, 'cpu');
  assert.equal(cpu.verdict, 'slow');
});

test('where each suggested model would run: vLLM on NVIDIA cards and Macs, Ollama’s build elsewhere', () => {
  const [lfm, gemma, flint, glm] = LOCAL_PICKS;
  assert.equal(routeOf(lfm, desktop), 'vllm');
  assert.equal(routeOf(lfm, mac), 'vllm');
  assert.equal(routeOf(lfm, laptop), 'ollama');
  assert.equal(routeOf(gemma, laptop), 'ollama');
  assert.equal(routeOf(flint, desktop), null, 'its weights are for Apple silicon');
  assert.equal(routeOf(flint, mac), 'vllm');
  assert.equal(routeOf(glm, laptop), null, 'no build for a computer without graphics');
  assert.deepEqual(
    OPENROUTER_PICKS.map((p) => p.role),
    ['text', 'text', 'text', 'text', 'image', 'image', 'music', 'speech', 'video'],
  );
});

// Hugging Face, answered here: each repository's files and config.
const REPOS: Record<string, { files: [string, number][]; config?: Record<string, unknown> }> = {
  'LiquidAI/LFM3-VL-2B': { files: [['config.json', 3000], ['model.safetensors', 3.84 * GB], ['tokenizer.json', 4e6], ['modeling_lfm3.py', 40000]], config: { architectures: ['Lfm3VlForConditionalGeneration'], num_hidden_layers: 16, num_attention_heads: 32, num_key_value_heads: 8, hidden_size: 2048 } },
  'LiquidAI/LFM3-VL-2B-GGUF': { files: [['LFM3-VL-2B-Q4_K_M.gguf', 1.1 * GB], ['LFM3-VL-2B-Q8_0.gguf', 1.85 * GB], ['mmproj-LFM3-VL-2B-Q8_0.gguf', 0.2 * GB]] },
  'google/gemma-4-12B-it': { files: [['config.json', 3000], ['model.safetensors', 23.92 * GB]], config: { architectures: ['Gemma4UnifiedForConditionalGeneration'], text_config: { num_hidden_layers: 48, num_attention_heads: 16, num_key_value_heads: 8, head_dim: 256 } } },
  'google/gemma-4-12B-it-qat-q4_0-gguf': { files: [['gemma-4-12b-it-qat-q4_0.gguf', 6.98 * GB], ['mmproj-gemma-4-12b-it-qat-q4_0.gguf', 0.18 * GB]] },
  'RecursiveSI/flint-int4': { files: [['config.json', 3000], ...Array.from({ length: 5 }, (_, i): [string, number] => [`model-0000${i}.safetensors`, 4.52 * GB])], config: { architectures: ['FlintForCausalLM'], num_hidden_layers: 49, num_attention_heads: 32, num_key_value_heads: 4, head_dim: 128 } },
  'zai-org/GLM-5.3-Flash': { files: [['config.json', 3000], ...Array.from({ length: 62 }, (_, i): [string, number] => [`model-${i}.safetensors`, 5.3 * GB])], config: { architectures: ['Glm5NextForConditionalGeneration'], num_hidden_layers: 78, num_attention_heads: 64, num_key_value_heads: 8, head_dim: 128 } },
};
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = String(input instanceof Request ? input.url : input);
  const info = /^https:\/\/huggingface\.co\/api\/models\/([^?]+)\?blobs=true$/.exec(url);
  if (info && REPOS[info[1]]) return new Response(JSON.stringify({ id: info[1], siblings: REPOS[info[1]].files.map(([rfilename, size]) => ({ rfilename, size })) }));
  const cfg = /^https:\/\/huggingface\.co\/(.+)\/resolve\/main\/config\.json$/.exec(url);
  if (cfg && REPOS[cfg[1]]?.config) return new Response(JSON.stringify(REPOS[cfg[1]].config));
  return new Response('not here', { status: 404 });
}) as typeof fetch;

const ready = { vllm: { archs: new Set(['Lfm3VlForConditionalGeneration', 'Gemma4UnifiedForConditionalGeneration', 'FlintForCausalLM', 'Glm5NextForConditionalGeneration']) }, ollama: true };
const shown = (list: Awaited<ReturnType<typeof localPicks>>) => list.filter((p) => p.runs).map((p) => `${p.name}${p.best ? '*' : ''}`);

test('a desktop with four 24 GB cards: the small model, and Gemma split across two cards, which is the one to start with', async () => {
  const list = await localPicks({ machine: desktop, runtimes: ready, local: [], downloads: [] });
  assert.deepEqual(shown(list), ['LFM3-VL 2B', 'Gemma 4 12B*']);
  const gemma = list.find((p) => p.name === 'Gemma 4 12B')!;
  assert.deepEqual(gemma.install, { repo: 'google/gemma-4-12B-it' });
  assert.equal(gemma.fit.gpus?.length, 2);
  assert.ok(gemma.sizeBytes > 23 * GB);
  assert.equal(gemma.ready, true);
  assert.equal(list.find((p) => p.name === 'Flint')!.needs, 'A Mac with Apple silicon');
  assert.match(list.find((p) => p.name === 'GLM-5.3 Flash')!.needs ?? '', /^About \d+ GB of graphics memory$/);
});

test('a Mac with an M3 Max and 64 GB: Flint is the one to start with; vLLM runs them all', async () => {
  const list = await localPicks({ machine: mac, runtimes: ready, local: [], downloads: [] });
  assert.deepEqual(shown(list), ['LFM3-VL 2B', 'Gemma 4 12B', 'Flint*']);
  assert.deepEqual(list.find((p) => p.name === 'Flint')!.install, { repo: 'RecursiveSI/flint-int4' });
});

test('a laptop with no graphics card: the small model alone, through Ollama’s build, slowly', async () => {
  const list = await localPicks({ machine: laptop, runtimes: { vllm: null, ollama: true }, local: [], downloads: [] });
  assert.deepEqual(shown(list), ['LFM3-VL 2B']);
  const lfm = list[0];
  assert.deepEqual(lfm.install, { ollama: 'hf.co/LiquidAI/LFM3-VL-2B-GGUF:Q4_K_M' });
  assert.equal(lfm.fit.verdict, 'slow');
  assert.ok(lfm.sizeBytes < 1.5 * GB, 'the 4-bit build and its picture reader');
  assert.equal(lfm.best, undefined, 'nothing runs well: none is the one to start with');
});

test('a server with eight H200s runs GLM-5.3 Flash split across them; what is here or downloading says so', async () => {
  const local = [{ id: 'vllm/LiquidAI/LFM3-VL-2B', repo: 'LiquidAI/LFM3-VL-2B', runtime: 'vllm', sizeBytes: 3.9 * GB } as LocalModel];
  const downloads = [{ key: 'vllm:zai-org/GLM-5.3-Flash', name: 'zai-org/GLM-5.3-Flash', target: 'vllm', doneBytes: 10 * GB, totalBytes: 330 * GB, status: 'running', startedAt: 0 } as ModelDownload];
  const list = await localPicks({ machine: server, runtimes: ready, local, downloads });
  assert.deepEqual(shown(list), ['LFM3-VL 2B', 'Gemma 4 12B', 'GLM-5.3 Flash*']);
  const glm = list.find((p) => p.name === 'GLM-5.3 Flash')!;
  assert.ok((glm.fit.gpus?.length ?? 0) >= 4, 'split across several cards');
  assert.equal(glm.coming, 'vllm:zai-org/GLM-5.3-Flash');
  assert.equal(list[0].have, 'vllm/LiquidAI/LFM3-VL-2B');
});

test('nothing here runs them yet: no vLLM, or one too old for a model, and Ollama not running', async () => {
  const none = await localPicks({ machine: desktop, runtimes: { vllm: null, ollama: false }, local: [], downloads: [] });
  assert.ok(none.filter((p) => p.runs).every((p) => p.ready === false));
  const old = await localPicks({ machine: desktop, runtimes: { vllm: { archs: new Set(['Lfm3VlForConditionalGeneration']) }, ollama: false }, local: [], downloads: [] });
  assert.equal(old.find((p) => p.name === 'LFM3-VL 2B')!.ready, true);
  assert.equal(old.find((p) => p.name === 'Gemma 4 12B')!.ready, false, 'this vLLM does not run Gemma 4 yet');
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
globalThis.fetch = realFetch;
console.log(`\n${passed}/${tests.length} passed`);
