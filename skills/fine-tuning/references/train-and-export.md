# Training and exporting (tested)

Both scripts ran with TRL 1.17, PEFT 0.21 and Transformers 5.22 (two steps on a tiny model, on the
processor, as a check). Install in a virtual environment on the GPU machine:

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install torch transformers trl peft datasets accelerate   # QLoRA also: pip install bitsandbytes
```

## train_lora.py

Data: `train.jsonl` and `val.jsonl`, one `{"messages": [...]}` per line. Trial run first:
`python train_lora.py --model Qwen/Qwen3-4B --max-steps 20`, then without `--max-steps`.

```python
"""LoRA (or QLoRA) fine-tuning with TRL's SFTTrainer.
Data: JSONL files, one {"messages": [{"role": ..., "content": ...}, ...]} per line."""
import argparse
import torch
from datasets import load_dataset
from peft import LoraConfig
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from trl import SFTConfig, SFTTrainer

p = argparse.ArgumentParser()
p.add_argument("--model", required=True, help="an instruct model on the Hub, like Qwen/Qwen3-4B")
p.add_argument("--train", default="train.jsonl")
p.add_argument("--eval", default="val.jsonl")
p.add_argument("--out", default="out/lora")
p.add_argument("--qlora", action="store_true", help="load the base in 4-bit (bitsandbytes, NVIDIA GPU)")
p.add_argument("--epochs", type=float, default=2)
p.add_argument("--lr", type=float, default=2e-4)
p.add_argument("--max-length", type=int, default=2048)
p.add_argument("--max-steps", type=int, default=-1, help="for a short trial run, like 20")
a = p.parse_args()

gpu = torch.cuda.is_available()
bf16 = gpu and torch.cuda.is_bf16_supported()
dtype = torch.bfloat16 if bf16 else torch.float16 if gpu else torch.float32
tokenizer = AutoTokenizer.from_pretrained(a.model)
load = {"dtype": dtype}
if a.qlora:
    load["quantization_config"] = BitsAndBytesConfig(
        load_in_4bit=True, bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=dtype, bnb_4bit_use_double_quant=True)
model = AutoModelForCausalLM.from_pretrained(a.model, **load)

data = load_dataset("json", data_files={"train": a.train, "eval": a.eval})

lora = LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05, target_modules="all-linear", task_type="CAUSAL_LM")
args = SFTConfig(
    output_dir=a.out,
    num_train_epochs=a.epochs,
    max_steps=a.max_steps,
    per_device_train_batch_size=2,
    gradient_accumulation_steps=8,          # 2 x 8 = 16 examples per optimizer step
    learning_rate=a.lr,
    lr_scheduler_type="cosine",
    warmup_steps=0.03,                       # a float below 1 is a share of all steps
    max_length=a.max_length,
    assistant_only_loss=True,                # learn the replies, not the prompts
    bf16=bf16,
    fp16=gpu and not bf16,
    gradient_checkpointing=True,
    eval_strategy="steps", eval_steps=50,
    save_strategy="steps", save_steps=50, save_total_limit=2,
    load_best_model_at_end=True, metric_for_best_model="eval_loss",
    logging_steps=10,
    report_to="none",
    seed=42,
)
trainer = SFTTrainer(model=model, args=args, train_dataset=data["train"], eval_dataset=data["eval"],
                     processing_class=tokenizer, peft_config=lora)
trainer.train()
trainer.save_model(a.out)                   # the adapter: adapter_model.safetensors + adapter_config.json
tokenizer.save_pretrained(a.out)
print(trainer.evaluate())
```

Notes:

- Names changed in recent versions: `max_length` (was `max_seq_length`), `processing_class` (was
  `tokenizer`), `dtype` (was `torch_dtype`), `eval_strategy` (was `evaluation_strategy`),
  `warmup_steps=0.03` (was `warmup_ratio`). Old tutorials use the old names.
- With `assistant_only_loss=True`, TRL needs a chat template that marks the assistant's turns; it
  swaps one in for common model families and warns if the end-of-turn token is left out (then the
  model may not learn to stop: check real answers).
- Several GPUs: `accelerate launch train_lora.py ...`.

## merge_lora.py

```python
"""Merge a LoRA adapter into its base model and save 16-bit safetensors."""
import sys
import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

base_id, adapter_dir, out_dir = sys.argv[1], sys.argv[2], sys.argv[3]
base = AutoModelForCausalLM.from_pretrained(base_id, dtype=torch.bfloat16)   # 16-bit, never the 4-bit base
merged = PeftModel.from_pretrained(base, adapter_dir).merge_and_unload()
merged.save_pretrained(out_dir)                                               # safetensors by default
AutoTokenizer.from_pretrained(adapter_dir).save_pretrained(out_dir)

# One test question, answered with the model's own chat template
tok = AutoTokenizer.from_pretrained(out_dir)
model = AutoModelForCausalLM.from_pretrained(out_dir, dtype=torch.bfloat16)
inputs = tok.apply_chat_template([{"role": "user", "content": "How long is the refund window?"}],
                                 add_generation_prompt=True, return_tensors="pt", return_dict=True)
out = model.generate(**inputs, max_new_tokens=40, do_sample=False)
print(tok.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True))
```

Run: `python merge_lora.py Qwen/Qwen3-4B out/lora out/merged`.

## Serving the adapter without merging (vLLM)

```bash
vllm serve Qwen/Qwen3-4B --enable-lora --lora-modules support=out/lora --max-model-len 8192
```

Requests then name the adapter as the model: `"model": "support"`.

## Export to GGUF (llama.cpp, Ollama)

```bash
git clone --depth 1 https://github.com/ggml-org/llama.cpp
pip install -r llama.cpp/requirements.txt
python llama.cpp/convert_hf_to_gguf.py out/merged --outfile model-f16.gguf --outtype f16
llama-quantize model-f16.gguf model-Q4_K_M.gguf Q4_K_M     # from a llama.cpp release, or after building it
```

- An adapter alone can become GGUF too: `python llama.cpp/convert_lora_to_gguf.py out/lora --base out/base-model-folder`,
  then `llama-server -m base.gguf --lora adapter.gguf`.
- Ollama: a `Modelfile` with `FROM ./model-Q4_K_M.gguf`, then `ollama create support-bot -f Modelfile`.
  Check that answers come in the right format; if not, the Modelfile needs the model's `TEMPLATE`.
- Unsloth merges and exports in one call each: `model.save_pretrained_merged("out/merged", tokenizer,
  save_method="merged_16bit")`, `model.save_pretrained_gguf("out/gguf", tokenizer, quantization_method="q4_k_m")`.

Evaluate the exported file again: a 4-bit file answers a little differently from the 16-bit model.
