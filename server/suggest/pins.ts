// What word suggestions download, pinned: llama.cpp's prebuilt llama-server (one release, each asset's size and SHA-256),
// Qwen3.5-0.8B-Base as GGUF files (one revision of ggml-org's repository), and the small model of the app's own (a
// release on Hugging Face, algoprog/hydor-suggest-49m, at one revision; HYDOR_SUGGEST_MODEL_DIR runs a local copy instead).
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
 * The small model's release (https://huggingface.co/algoprog/hydor-suggest-49m, AGPL-3.0-only; its tokenizer Apache-2.0):
 * its repository, a pinned revision and its files, each checked by its SHA-256 as it downloads. HYDOR_SUGGEST_MODEL_DIR
 * (a folder holding these files) still runs another copy instead.
 */
export const SMALL_MODEL: { repo: string; revision: string; files: ModelFile[]; calibration?: Record<'mix' | 'llm' | 'slm', Record<string, number>> } = {
  repo: 'algoprog/hydor-suggest-49m',
  revision: 'db7f41395e51501c99b8896bf63c98e7e445a18b',
  /**
   * Thresholds for this revision at precisions its calibration.json does not list (it has 0.3, 0.4 and 0.5): 0.2 is Settings' More,
   * 0.25 lies between. Measured as its own were (show_filter.py --compare-real on the same real-decoded FLORES-200 devtest events, 193
   * spaced languages x 20 sentences). The worker adds them to the release's table; a release that lists these precisions itself needs none.
   */
  calibration: {
    mix: { '0.2': 0.0825, '0.25': 0.1416 },
    llm: { '0.2': 0.101, '0.25': 0.1641 },
    slm: { '0.2': 0.1154, '0.25': 0.1757 },
  },
  files: [
    { from: 'LICENSE', name: 'LICENSE', bytes: 34_523, sha256: '0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0' },
    { from: 'LICENSE.Apache-2.0', name: 'LICENSE.Apache-2.0', bytes: 11_358, sha256: 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30' },
    { from: 'NOTICE', name: 'NOTICE', bytes: 690, sha256: '97249394e99179d156041d3584a52514dd84446b1ea8d9cee94db1e2abc7ed03' },
    { from: 'README.md', name: 'README.md', bytes: 33_519, sha256: 'f702ee4cc23a8618b8558c5d5eb4a70374d1c88c5c11b0640bfeaaff6b721991' },
    { from: 'calibration.json', name: 'calibration.json', bytes: 318, sha256: '94c7a20c49b1d41c95fc0a3cc6f454175afaf4a3c81440343f20950a204e6068' },
    { from: 'config.json', name: 'config.json', bytes: 638, sha256: '52d3a69a5b7553138c1cea66fa873eb185c500de19fc1bbb4b081b7a1913934f' },
    { from: 'gate.json', name: 'gate.json', bytes: 887, sha256: '675f95ec6a477ff047c29d090a7dee26b4e8d28b6bb1a8b0662e73c75e48878c' },
    { from: 'lid.bin', name: 'lid.bin', bytes: 23_160_000, sha256: 'b0c735486d3699115dd1a9e05e86b09f58da309ade393621a8a20a63f16b1663' },
    { from: 'lid.json', name: 'lid.json', bytes: 4_482, sha256: '2d0c7fc81cbe0a2b098e7f05cbb7ba7a17b626a44a45c8e5b8132d85f760c04d' },
    { from: 'model.safetensors', name: 'model.safetensors', bytes: 195_076_072, sha256: '69a4ba215692171c2e18a31150e08c630f7b445f7381123c9517fae2e8f59424' },
    { from: 'replay/index.json', name: 'replay/index.json', bytes: 2_864_722, sha256: '341a125eb80438a50583294c4cae64fac4c045ff596a74776283edc9ca592c71' },
    { from: 'replay/replay.u32', name: 'replay/replay.u32', bytes: 80_000_628, sha256: 'f21beeda1c0d69f9571f77bf14e4e1817c900a1598e5315831f3736607285007' },
    { from: 'switch.json', name: 'switch.json', bytes: 4_555, sha256: '19afa0f370ffadc8c2805649abfa8fe69d120ff87b970368755c5279b2a918e9' },
    { from: 'tokenizer.json', name: 'tokenizer.json', bytes: 12_807_196, sha256: 'fe000e3ed39ed12b8d2481d527d44f93c65d37e87645d2dcc80d1bf9d50d2927' },
  ],
};
/** The files a folder must hold to run the small model (a release has more: the card and the licence). */
export const SMALL_MODEL_NEEDS = ['config.json', 'model.safetensors', 'tokenizer.json', 'gate.json', 'switch.json', 'calibration.json', 'lid.json', 'lid.bin', 'replay/replay.u32', 'replay/index.json'];

/**
 * What the suggestion environment holds: ONNX Runtime (the small model runs on it), the tokenizer, NumPy and safetensors, about 150 MB
 * installed. Another string means making it again.
 */
export const SUGGEST_PACKAGES = 'suggest/2 onnxruntime>=1.23 tokenizers>=0.20 numpy safetensors>=0.4';
/** Learning (train.py) needs PyTorch, put into the same environment the first time it is needed (about 1 GB installed): the marker says so. */
export const TORCH_PACKAGE = 'torch>=2.4';
export const SUGGEST_PACKAGES_TORCH = `${SUGGEST_PACKAGES} ${TORCH_PACKAGE}`;
/**
 * What learning's own environments hold: PyTorch, the tokenizer, NumPy and safetensors. The graphics card's environment (venv-gpu) has
 * been this since it was first made (with its CUDA build after it), and the suggestion environment of the first versions was this too
 * (PyTorch ran the suggestions then): it is kept, with ONNX Runtime added.
 */
export const TRAIN_PACKAGES = 'suggest/1 torch>=2.4 tokenizers>=0.20 numpy safetensors>=0.4';
