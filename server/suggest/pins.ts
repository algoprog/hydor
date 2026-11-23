// What word suggestions download, pinned: llama.cpp's prebuilt llama-server (one release, each asset's size and SHA-256),
// Qwen3.5-0.8B-Base as GGUF files (one revision of ggml-org's repository), and the small model of the app's own (a
// release on Hugging Face that is not published yet, so its list is empty and HYDOR_SUGGEST_MODEL_DIR runs a local copy).
import type { ModelFile } from '../memory/embed.ts';

/**
 * llama.cpp release b12498 (commit 5297534 of 18 November 2026, the one the experiments behind this ran on), the CPU build
 * of each system: llama-server and its shared libraries.
 */
export const LLAMA_TAG = 'b12498';
export interface LlamaAsset {
  name: string;
  bytes: number;
  sha256: string;
}
/** By `<platform>-<arch>` as Node.js names them (process.platform, process.arch). */
export const LLAMA_ASSETS: Record<string, LlamaAsset> = {
  'linux-x64': { name: `llama-${LLAMA_TAG}-bin-ubuntu-x64.tar.gz`, bytes: 23_784_147, sha256: 'f9506ca78e5a25665f726b0ee429cdc3d5cf3e02a10e4068c8af19dd79337ad7' },
  'linux-arm64': { name: `llama-${LLAMA_TAG}-bin-ubuntu-arm64.tar.gz`, bytes: 19_377_464, sha256: '40ea1e7dbe1400774aceacff72a2b2b5845f7a33f403349291b9c9143d906679' },
  'darwin-arm64': { name: `llama-${LLAMA_TAG}-bin-macos-arm64.tar.gz`, bytes: 17_282_660, sha256: '88ba080b2b24bb69012633588c763b7ed20ea60b3f9e7fcbd1a5434eded3e325' },
  'darwin-x64': { name: `llama-${LLAMA_TAG}-bin-macos-x64.tar.gz`, bytes: 13_054_023, sha256: '329a0d46c7bf43c691dc658271c290baac3010751d40e802b501ce548c4de234' },
  'win32-x64': { name: `llama-${LLAMA_TAG}-bin-win-cpu-x64.zip`, bytes: 25_520_902, sha256: 'eeb67345805510a1a955430d559336a3c535345d9a19467bf89fa0a6a34d4173' },
  'win32-arm64': { name: `llama-${LLAMA_TAG}-bin-win-cpu-arm64.zip`, bytes: 13_838_184, sha256: 'e476e56eb1bf10c35c20853029b0bd506333b6e7aa4c653310acb825ae31c6f3' },
};
export const llamaUrl = (a: LlamaAsset) => `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_TAG}/${a.name}`;

/** Qwen3.5-0.8B-Base as GGUF, at a fixed revision of ggml-org's repository (it has no Q4_K_M: the 4-bit file is Q4_0). */
export const GGUF_REPO = 'ggml-org/Qwen3.5-0.8B-Base-GGUF';
export const GGUF_REVISION = '12458f0e52ed1ac94c072952ff8d7dd4f3388fa7';
export const GGUF_FILES: Record<'q8' | 'q4', ModelFile> = {
  q8: { from: 'Qwen3.5-0.8B-Base-Q8_0.gguf', name: 'Qwen3.5-0.8B-Base-Q8_0.gguf', bytes: 833_591_872, sha256: '02fbcf13dd07601e5801cdef73ace47426c422742fa68fd0c607a8b88eea0790' },
  q4: { from: 'Qwen3.5-0.8B-Base-Q4_0.gguf', name: 'Qwen3.5-0.8B-Base-Q4_0.gguf', bytes: 563_035_840, sha256: '0dabf7f08793293d999ea306cee8c9caa3d76099e791ea2b0ce8f555f4e4098d' },
};

/**
 * The small model's release: its repository, a pinned revision and its files. Empty until it is published: until then
 * HYDOR_SUGGEST_MODEL_DIR (a folder holding these files) is the way to run it.
 */
export const SMALL_MODEL: { repo: string; revision: string; files: ModelFile[] } = {
  repo: 'algoprog/hydor-suggest-49m',
  revision: '',
  files: [],
};
/** The files a folder must hold to run the small model (a release has more: the card and the licence). */
export const SMALL_MODEL_NEEDS = ['config.json', 'model.safetensors', 'tokenizer.json', 'gate.json', 'switch.json', 'calibration.json', 'lid.json', 'lid.bin', 'replay/replay.u32', 'replay/index.json'];

/** What the Python environment holds: another string means making it again. */
export const SUGGEST_PACKAGES = 'suggest/1 torch>=2.4 tokenizers>=0.20 numpy safetensors>=0.4';
