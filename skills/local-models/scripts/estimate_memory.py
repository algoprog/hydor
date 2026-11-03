#!/usr/bin/env python3
"""Estimate the memory a language model needs: weights at several precisions, plus the KV cache.

Standard library only; no GPU needed. Give a Hugging Face model id (Qwen/Qwen3-8B), a local
model folder, or a config.json. It reads the model's config (layers, KV heads, head size,
sliding-window and linear-attention layers, MLA) and its parameter count, then prints a table.

  python3 estimate_memory.py Qwen/Qwen3-8B
  python3 estimate_memory.py Qwen/Qwen3-8B --context 65536 --batch 4 --kv-bits 8 --gpu-gb 24
  python3 estimate_memory.py ./my-model --params 7.2B

Gated models: set HF_TOKEN in the environment (or pass --config with a local config.json).
Results are estimates: real use adds a little for activations and the runtime itself.
"""
import argparse
import json
import os
import struct
import sys
import urllib.error
import urllib.request

GIB = 1024 ** 3
# Bits per weight, including scales, for common forms. GGUF figures are llama.cpp's averages.
FORMATS = [
    ("16-bit (BF16/FP16)", 16.0),
    ("8-bit (FP8, INT8)", 8.0),
    ("GGUF Q8_0", 8.5),
    ("GGUF Q6_K", 6.56),
    ("GGUF Q5_K_M", 5.7),
    ("GGUF Q4_K_M", 4.85),
    ("4-bit AWQ/GPTQ", 4.25),
    ("GGUF Q3_K_M", 3.9),
]
FLOAT_DTYPES = {"F64": 8, "F32": 4, "F16": 2, "BF16": 2, "F8_E4M3": 1, "F8_E5M2": 1}


def get(url, token=None):
    headers = {"User-Agent": "estimate-memory/1.0"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as r:
        return json.loads(r.read())


def parse_count(s):
    s = s.strip().upper().replace(",", "")
    mult = {"K": 1e3, "M": 1e6, "B": 1e9, "T": 1e12}.get(s[-1:], 1)
    return float(s[:-1] if mult != 1 else s) * mult


def safetensors_params(folder):
    """Parameter count and byte size of the .safetensors files in a folder (headers only)."""
    params, size, exact = 0, 0, True
    for name in sorted(os.listdir(folder)):
        if not name.endswith(".safetensors"):
            continue
        path = os.path.join(folder, name)
        size += os.path.getsize(path)
        with open(path, "rb") as f:
            n = struct.unpack("<Q", f.read(8))[0]
            header = json.loads(f.read(n))
        for k, v in header.items():
            if k == "__metadata__":
                continue
            if v["dtype"] not in FLOAT_DTYPES:
                exact = False  # packed quantized weights: the element count is not the parameter count
            count = 1
            for d in v["shape"]:
                count *= d
            params += count
    return (params if exact and params else None), (size or None)


def load(model, config_path):
    """config dict, parameter count (or None), bytes of weights as stored (or None), label."""
    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
    if config_path or os.path.isfile(model):
        path = config_path or model
        with open(path) as f:
            cfg = json.load(f)
        folder = os.path.dirname(os.path.abspath(path))
        params, size = safetensors_params(folder)
        return cfg, params, size, model
    if os.path.isdir(model):
        with open(os.path.join(model, "config.json")) as f:
            cfg = json.load(f)
        params, size = safetensors_params(model)
        return cfg, params, size, model
    # A Hugging Face id.
    try:
        cfg = get(f"https://huggingface.co/{model}/resolve/main/config.json", token)
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            sys.exit(f"{model}: could not read its config.json ({e.code}). Either the name is wrong (check it on "
                     "huggingface.co), or the model is gated or private: accept its terms on its page and set HF_TOKEN, "
                     "or pass --config with a local copy.")
        sys.exit(f"{model}: no config.json ({e.code}). Is the name right? GGUF-only repos have none: use the original model's id.")
    params = size = None
    try:
        info = get(f"https://huggingface.co/api/models/{model}", token)
        params = (info.get("safetensors") or {}).get("total")
    except (urllib.error.URLError, ValueError):
        pass
    try:
        tree = get(f"https://huggingface.co/api/models/{model}/tree/main", token)
        files = [e for e in tree if e.get("type") == "file" and e["path"].endswith(".safetensors")]
        size = sum(e.get("size", 0) for e in files) or None
    except (urllib.error.URLError, ValueError):
        pass
    return cfg, params, size, model


def layer_kinds(t):
    """'full', 'sliding' or 'state' (fixed-size, like linear attention or Mamba) for each layer."""
    n = t["num_hidden_layers"]
    lt = t.get("layer_types")
    if isinstance(lt, list) and len(lt) == n:
        out = []
        for x in lt:
            x = str(x).lower()
            out.append("sliding" if ("sliding" in x or "local" in x or "chunk" in x) else "full" if ("full" in x or "global" in x or x == "attention") else "state")
        return out, ""
    if t.get("full_attention_interval"):
        k = int(t["full_attention_interval"])
        return ["full" if (i + 1) % k == 0 else "state" for i in range(n)], ""
    window = t.get("sliding_window")
    if window and t.get("sliding_window_pattern"):
        k = int(t["sliding_window_pattern"])
        return ["full" if (i + 1) % k == 0 else "sliding" for i in range(n)], ""
    if window and t.get("model_type") == "gemma2":
        return ["sliding" if i % 2 == 0 else "full" for i in range(n)], ""
    if window and t.get("use_sliding_window", True) is not False:
        return ["sliding"] * n, f"assumed every layer uses the {window}-token sliding window, as the config suggests"
    return ["full"] * n, ""


def main():
    p = argparse.ArgumentParser(description="Estimate a model's memory: weights and KV cache.")
    p.add_argument("model", help="Hugging Face id, a local model folder, or a config.json")
    p.add_argument("--context", type=int, default=32768, help="tokens kept per conversation (default 32768)")
    p.add_argument("--batch", type=int, default=1, help="conversations served at once (default 1)")
    p.add_argument("--kv-bits", type=int, default=16, choices=[4, 8, 16, 32], help="KV cache precision (default 16)")
    p.add_argument("--params", help="parameter count, like 8B or 7.2e9, when it cannot be read")
    p.add_argument("--config", help="a local config.json to use instead of downloading one")
    p.add_argument("--gpu-gb", type=float, help="your GPU memory in GB, to say what fits")
    a = p.parse_args()

    cfg, params, stored, label = load(a.model, a.config)
    if a.params:
        params = parse_count(a.params)
    t = cfg.get("text_config") or cfg.get("llm_config") or cfg
    notes = []

    # ---- KV cache per token ------------------------------------------------------------------
    kv_full_per_token = 0.0
    desc = "no attention layers found"
    if t.get("num_hidden_layers") and (t.get("num_attention_heads") or t.get("kv_lora_rank")):
        kinds, note = layer_kinds(t)
        if note:
            notes.append(note)
        bytes_kv = a.kv_bits / 8
        if t.get("kv_lora_rank"):  # multi-head latent attention (DeepSeek and kin): one compressed vector
            per_layer = (t["kv_lora_rank"] + (t.get("qk_rope_head_dim") or 0)) * bytes_kv
            desc = f"MLA latent of {t['kv_lora_rank'] + (t.get('qk_rope_head_dim') or 0)} values"
        else:
            heads = t["num_attention_heads"]
            kvh = t.get("num_key_value_heads") or heads
            hd = t.get("head_dim") or t["hidden_size"] // heads
            per_layer = 2 * kvh * hd * bytes_kv
            desc = f"{kvh} KV heads x {hd} dims"
        window = t.get("sliding_window") or a.context
        cached = {"full": a.context, "sliding": min(a.context, window), "state": 0}
        kv_total = sum(per_layer * cached[k] for k in kinds) * a.batch
        kv_upper = sum(per_layer * a.context for k in kinds if k != "state") * a.batch
        kv_full_per_token = sum(per_layer for k in kinds if k != "state")
        counts = {k: kinds.count(k) for k in ("full", "sliding", "state") if kinds.count(k)}
        names = {"full": "full attention", "sliding": f"sliding window ({window} tokens)", "state": "fixed-size state"}
        layers = ", ".join(f"{v} {names[k]}" for k, v in counts.items())
        if counts.get("state"):
            notes.append("fixed-size layers (linear attention, Mamba) keep a small state that does not grow with context; not counted")
    else:
        kv_total = kv_upper = 0.0
        layers = "unknown layers"
        notes.append("the config has no attention details: KV cache not estimated")

    # ---- report ------------------------------------------------------------------------------
    if params:
        print(f"{label}: " + (f"{params / 1e9:.2f} B parameters" if params >= 1e8 else f"{params / 1e6:.2f} M parameters"))
    else:
        print(f"{label}: parameter count unknown (give --params)")
    print(f"Layers: {layers}; {desc}")
    if kv_total:
        print(f"KV cache: {kv_full_per_token / 1024:.0f} KiB per token at most; {kv_total / GIB:.2f} GiB for "
              f"{a.context:,} tokens x {a.batch} conversation(s) at {a.kv_bits}-bit"
              + (f" (up to {kv_upper / GIB:.2f} GiB if the runtime keeps the whole context on every layer)" if kv_upper > kv_total * 1.05 else ""))
    experts = t.get("num_local_experts") or t.get("num_experts") or t.get("n_routed_experts")
    if experts:
        notes.append(f"mixture of experts ({experts} experts): every expert must fit in memory, but it runs about as fast as its active part")

    rows = []
    if stored:
        rows.append(("as stored in the repo", stored))
    if params:
        rows += [(name, params * bits / 8) for name, bits in FORMATS]
    if not rows:
        sys.exit("Give --params (like 8B) to estimate the weights.")
    print()
    print(f"{'Weights as':<24}{'weights':>9}{'+ KV':>8}{'+ runtime':>11}{'= total GiB':>13}" + ("   fits?" if a.gpu_gb else ""))
    for name, w in rows:
        overhead = 1.0 * GIB + min(0.05 * w, 4.0 * GIB)  # CUDA context, activations, fragmentation: a rough allowance
        total = w + kv_total + overhead
        fit = ""
        if a.gpu_gb:
            gpu = a.gpu_gb * GIB
            fit = "   yes" if total <= 0.92 * gpu else "   tight" if total <= gpu else "   no"
        print(f"{name:<24}{w / GIB:>9.2f}{kv_total / GIB:>8.2f}{overhead / GIB:>11.2f}{total / GIB:>13.2f}{fit}")
    if notes:
        print()
        for n in notes:
            print(f"Note: {n}.")
    print("Estimates: check the real figure with nvidia-smi (or ollama ps) once it runs.")


if __name__ == "__main__":
    main()
