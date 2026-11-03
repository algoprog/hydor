# Runtimes: commands that work

## Ollama

```bash
ollama pull qwen3:8b                      # from Ollama's library
ollama run qwen3:8b --verbose             # chat in the terminal, with speed figures
ollama run hf.co/Qwen/Qwen3-8B-GGUF:Q4_K_M  # any GGUF repository on Hugging Face, by quantization
ollama ps                                 # loaded models: size, PROCESSOR (100% GPU?), CONTEXT
ollama show qwen3:8b                      # parameters, quantization, context length, template
ollama stop qwen3:8b                      # unload it
OLLAMA_CONTEXT_LENGTH=32768 ollama serve  # the server's default context (restart the service)
```

A fixed context for one model, usable through the OpenAI-compatible endpoint:

```text
# Modelfile
FROM qwen3:8b
PARAMETER num_ctx 32768
```

`ollama create qwen3-8b-32k -f Modelfile`, then use the model name `qwen3-8b-32k`. Memory grows with
`OLLAMA_NUM_PARALLEL` × context. Models live in `~/.ollama/models` (or `/usr/share/ollama/.ollama`
for the Linux service).

## llama.cpp: llama-server

```bash
# Download from Hugging Face and serve: 32k context, all layers on the GPU, local only
llama-server -hf Qwen/Qwen3-8B-GGUF:Q4_K_M -c 32768 -ngl 99 --host 127.0.0.1 --port 8080
# A local file, two conversations at once (each gets half of -c unless --kv-unified), 8-bit KV cache
llama-server -m ./Qwen3-8B-Q4_K_M.gguf -c 65536 -np 2 -ctk q8_0 -ctv q8_0 --port 8080
```

- `-c` context (0 means the model's full length); `-ngl` layers on the GPU (`auto` by default; a
  number lower than the layer count keeps the rest on the processor); `-np` parallel slots;
  `-fa on|off|auto` flash attention; `--jinja` (default on) uses the model's chat template;
  `--api-key KEY` requires a key; `--lora adapter.gguf` adds a LoRA adapter.
- Health check: `curl -s http://127.0.0.1:8080/health`. A built-in chat page is at the server's
  address in a browser.
- Get the binaries from llama.cpp's GitHub releases (CUDA, Vulkan, Metal and CPU builds), a package
  manager, or build with CMake.

## vLLM

```bash
pip install vllm                          # in a virtual environment, on Linux with an NVIDIA GPU
vllm serve Qwen/Qwen3-8B --max-model-len 32768 --gpu-memory-utilization 0.90 --port 8000
vllm serve Qwen/Qwen3-8B-AWQ --max-model-len 32768             # 4-bit AWQ checkpoint
vllm serve Qwen/Qwen3-8B-FP8 --max-model-len 32768             # FP8 checkpoint
vllm serve Qwen/Qwen3-8B --quantization fp8 --kv-cache-dtype fp8   # quantize on loading
vllm serve Qwen/Qwen3-32B --tensor-parallel-size 2             # split across two GPUs
```

- `--gpu-memory-utilization` is the share of the GPU vLLM takes, whatever the model needs: lower it
  when something else uses the same card.
- `--max-num-seqs` caps requests served at once; `--served-model-name` sets the name clients use;
  `--api-key` requires a key; `--enable-auto-tool-choice --tool-call-parser hermes` (or the parser
  the model's card names) enables tool calls.
- Gated models need `HF_TOKEN` in the environment. Downloads go to `~/.cache/huggingface`.
- Startup prints the KV cache size and the maximum concurrency for the chosen length: read it.

## LM Studio and MLX (Macs)

LM Studio's app downloads GGUF and MLX models and starts a server (Developer tab; default
`http://localhost:1234/v1`). Without the app: `pip install mlx-lm`, then
`mlx_lm.server --model mlx-community/<model>-4bit --port 8080`.

## A test request (any of them)

```bash
curl -sS -w '\n%{time_total} s\n' http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "Qwen/Qwen3-8B",
       "messages": [{"role": "user", "content": "What is the capital of Portugal? One word."}],
       "max_tokens": 200, "temperature": 0}'
```

Use the model name the server lists at `/v1/models` (Ollama: `qwen3:8b`). Check
`choices[0].message.content`, `finish_reason` (`stop`, not `length`), and `usage`. Models that think
before answering spend tokens on reasoning first: give them room in `max_tokens`, or turn thinking
off as their card describes.

Speed: `usage.completion_tokens` divided by the time. Under load, send several requests at once
(or use `vllm bench serve` for vLLM) and compare total tokens per second.
