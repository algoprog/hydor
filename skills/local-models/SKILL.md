---
name: local-models
description: Use when running open-weight models on the user's own computer or server (choosing a model and size, memory, quantization, Ollama, llama.cpp or vLLM, context length, an OpenAI-compatible endpoint), or when one is slow or will not fit.
category: ai
triggers: [model locally, models locally, llm locally, llms locally, local llm, local model, ollama, llama.cpp, vllm, gguf, quantiz*, vram]
---

# Running models locally

Running an open-weight model on your own machine: pick one that fits the memory you have, choose a
quantized form and a runtime, set the context length on purpose, serve it as an OpenAI-compatible
endpoint, and prove it works with a test request. Commands for each runtime are in
`references/runtimes.md`.

## In this app

**Settings → Agents → Models** (`/settings?s=models`) does most of this for Custom, the app's own
agent: it shows the machine's graphics cards and memory, searches Hugging Face and says before
downloading how each model would run here, installs GGUF models for Ollama and downloads
safetensors models for vLLM, and starts and stops vLLM models (they start by themselves when a
session first uses them). Local models are given about 32,000 tokens of context. Other servers
(llama.cpp's `llama-server`, LM Studio) can be added under **Runtimes and endpoints** as an
OpenAI-compatible endpoint. Use the steps below to do it by hand, or to explain what the page shows.

## 1. Know the machine

- NVIDIA: `nvidia-smi --query-gpu=name,memory.total,memory.used --format=csv`. AMD: `rocm-smi`.
- Apple Silicon: memory is shared; the graphics side may use about two thirds to three quarters of
  it. Memory and disk: `free -h`, `df -h` (a model takes 2 to 150 GB of disk).
- No graphics card: small models (up to about 8 billion parameters at 4-bit) run on the processor
  with Ollama or llama.cpp, slowly (a few words a second).

## 2. Choose the model

- The task first: general chat, coding, vision, embeddings; an instruct version for conversation;
  tool calling if an agent will use it; a licence that allows the use.
- Within a family, bigger is better; a newer small model often beats an older big one. Check
  recent evaluations on tasks like the user's (model-evaluation skill).
- At equal memory, a larger model at 4-bit usually beats a smaller one at 8 or 16 bits; below about
  3 bits quality falls quickly.
- Mixture-of-experts models (say 30B with 3B active) need memory for all their weights but run
  about as fast as their active part: good when memory is plentiful and speed matters.

## 3. Work out the memory

- **Weights** = parameters × bytes per weight: 2 at 16-bit, 1 at 8-bit, about 0.55 to 0.6 at 4-bit.
  An 8B model: about 16 GB, 8 GB, 5 GB.
- **KV cache**, the model's working memory for the conversation, grows with the context:
  2 × layers × KV heads × head size × bytes × tokens, times the conversations served at once.
  Qwen3-8B: 144 KiB per token at 16-bit, so 32,000 tokens take about 4.5 GiB.
- **Runtime and activations:** add 1 to 2 GB.
- `scripts/estimate_memory.py` (in this skill's folder) reads a model's real configuration from
  Hugging Face and prints the table (sliding-window, mixture-of-experts and DeepSeek-style models
  included): `python3 <this folder>/scripts/estimate_memory.py Qwen/Qwen3-8B --context 32768 --gpu-gb 24`.
- Too big? A smaller quantization, a shorter context, the KV cache at 8-bit, a smaller model, two
  GPUs (vLLM's `--tensor-parallel-size 2`), or some layers on the processor (Ollama and llama.cpp
  do this, at a large cost in speed).

## 4. Pick the quantized form

| Form | Runs on | Notes |
| --- | --- | --- |
| GGUF `Q8_0` | llama.cpp, Ollama, LM Studio | Close to 16-bit quality, half the size |
| GGUF `Q6_K`, `Q5_K_M` | same | Very close; good when memory allows |
| GGUF `Q4_K_M` | same | The usual choice: about 0.6 bytes a weight, small quality loss |
| GGUF `Q3_K_M`, `IQ3`, `Q2_K` | same | Noticeable to large loss; only to squeeze a big model in |
| AWQ, GPTQ (4-bit) | vLLM, Transformers, NVIDIA and AMD GPUs | Fast 4-bit serving |
| FP8 | vLLM on recent NVIDIA GPUs (RTX 40, L4, L40, H100 and newer) | Near 16-bit quality at half the memory |
| MLX 4-bit, 8-bit | Apple Silicon (LM Studio, `mlx-lm`) | Fast on Macs |

Take quantized files from the model's makers or a well-known quantizer, and check that the card
names the exact base model.

## 5. Pick a runtime

| Runtime | Best for | Serves at |
| --- | --- | --- |
| Ollama | The easiest start; any machine; GGUF | `http://localhost:11434/v1` |
| llama.cpp `llama-server` | Full control; any hardware; GGUF | `http://localhost:9931/v1` (8080 in builds before October 2026; or set `--port`) |
| vLLM | NVIDIA or AMD GPUs; many users at once; safetensors, AWQ, GPTQ, FP8 | `http://localhost:8000/v1` |
| LM Studio | A desktop app with a model browser | `http://localhost:1234/v1` |

All of them answer OpenAI-style requests (`/v1/chat/completions`), so the same client code and the
app's endpoint setting work with each. Listen on `127.0.0.1` unless the user wants others on the
network to use it; then set an API key (`--api-key` in vLLM and llama.cpp).

## 6. Set the context length on purpose

- Context is everything the model reads at once: instructions, conversation, documents and the
  reply. Agents and coding tools need at least 32,000 tokens.
- Ollama picks a default from the graphics memory (4,096 tokens below 24 GB): set
  `OLLAMA_CONTEXT_LENGTH=32768` for the server, or `PARAMETER num_ctx 32768` in a Modelfile. Its
  OpenAI-compatible endpoint cannot change it per request.
- llama.cpp: `-c 32768`. Left unset, builds since December 2025 take the largest context that fits
  the free memory (at least 4,096 tokens), which may be less than an agent needs; older builds take
  the model's full length, which may not fit.
- vLLM: `--max-model-len 32768`; it refuses to start when one full-length request would not fit.
- Past the length the model was trained for, quality drops unless its card describes an extension
  (such as YaRN). Prompts longer than the context are cut, often silently, from the start.

## 7. Speed: latency or throughput

- **Latency** (time to the first word, words per second for one user) matters for chat: keep every
  layer on the graphics card, use a smaller model or quantization.
- **Throughput** (total words per second across many requests) matters for batch jobs and teams:
  vLLM's continuous batching, more requests at once (`--max-num-seqs`), room for a larger KV cache.
  Each request gets slower as more run together.
- Measure: `ollama run <model> --verbose` prints rates; otherwise time a request and divide
  `usage.completion_tokens` by the seconds. `ollama ps` shows "100% GPU" when nothing spilled to
  the processor; llama.cpp's startup log says `offloaded 37/37 layers to GPU` (fewer means part runs
  on the processor, much slower), and `llama-server --list-devices` lists the graphics cards the
  build can use (none: a build without GPU support).

## 8. Check that it works

- The server answers: `curl -s http://localhost:8000/v1/models` lists the model's id.
- A test request (`temperature: 0`, a short `max_tokens`, a question with a known answer): the
  answer is sensible, it stops by itself, and `usage` counts look right. Commands in the reference.
- Then a realistic request near the context you need, to check memory and speed under load, and a
  tool call if an agent will use it (vLLM needs `--enable-auto-tool-choice --tool-call-parser` with
  the model's parser; llama.cpp uses the model's template with `--jinja`, on by default).
- Report the model, quantization, runtime, context, memory used (`nvidia-smi`), speed, and address.

## Pitfalls

- Downloading 40 GB before checking that it fits.
- Ollama's small default context: agents then fail in confusing ways.
- A server listening on all addresses with no key on a shared network.
- A GGUF without its chat template, or a base (not instruct) model: rambling or broken answers.
- Testing a thinking model with a small `max_tokens`: the reasoning uses it up and the answer comes
  back empty with `finish_reason: length`.
- Comparing speeds measured with different contexts, quantizations or batch sizes.
- Filling the disk: models collect in `~/.cache/huggingface` and `~/.ollama/models`.
