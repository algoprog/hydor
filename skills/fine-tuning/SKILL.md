---
name: fine-tuning
description: Use when deciding whether to fine-tune a language model or doing it (chat training data, LoRA or QLoRA with PEFT, TRL or Unsloth, settings, GPU memory, evaluation, merging or exporting the adapter).
category: ai
triggers: [fine-tune a model, fine-tuning a model, fine-tune an llm, llm fine-tun*, fine-tune llama, fine-tune qwen, finetun*, lora fine-tun*, qlora, peft, unsloth, sft]
---

# Fine-tuning language models

Fine-tuning changes a model's weights with your examples. It is the right tool for teaching a
consistent format, style or narrow skill, and a poor one for teaching facts. Decide whether it is
worth it, prepare clean data in the model's chat format, train a LoRA adapter with sensible
settings, and compare it with the untuned model on held-out examples before trusting it. Tested
training and merging scripts are in `references/train-and-export.md`.

## 1. Is it worth it?

| The problem | Try first | Fine-tune when |
| --- | --- | --- |
| The model does not know your facts or documents | Retrieval (RAG) or the documents in the prompt | Rarely: facts learned in training go stale and get mixed up |
| Format, tone or style is inconsistent | A clearer prompt with examples; structured output | Prompting has plateaued on a measured test |
| A narrow task at high volume (classify, extract, rewrite) | A big model with a good prompt; for sorting texts into fixed labels you have examples of, embeddings plus a simple classifier | A small tuned model can match it cheaper and faster |
| Reasoning on new kinds of problems | A stronger model, better prompting | Only with lots of high-quality examples |

Before anything else, build the test set (model-evaluation skill) and measure the base model with
its best prompt. That is the number the fine-tuned model has to beat. Fine-tune only with enough
good examples (very roughly: a few hundred for style or format, a few thousand for a harder task),
a stable task, and a way to measure success.

## 2. Prepare the data

- JSON Lines, one example per line, in the conversational form TRL takes:
  `{"messages": [{"role": "system", ...}, {"role": "user", ...}, {"role": "assistant", ...}]}`.
  TRL applies the model's own chat template; use the same template and system prompt when serving.
- Quality over quantity: correct, consistent replies that are exactly what you want the model to
  write, on inputs like the real ones (including hard cases, and refusals where they belong).
- Split before anything else: training, validation and test (about 80/10/10), by group (all
  examples from one customer or document in the same split), so nothing leaks.
- Check it: `scripts/check_chat_data.py` (in this skill's folder) reports broken rows, lengths,
  duplicates, and test rows that also appear in the training data:
  `python3 <this folder>/scripts/check_chat_data.py train.jsonl --test test.jsonl --max-tokens 2048`.
- Personal data: remove it, or have consent and a reason; respect the licences of your sources.

## 3. Choose the method and the base model

- **LoRA** (low-rank adapters): trains small extra matrices, well under 1% of the weights; little
  memory, fast, the base stays unchanged. The default.
- **QLoRA:** LoRA on a base loaded in 4-bit: a third to a half of the memory, so a bigger model
  fits; a bit slower, a small loss in quality.
- **Full fine-tuning:** every weight; several times the memory and data. Rarely needed.
- **Tools:** TRL's `SFTTrainer` with PEFT (the standard); Unsloth (same ideas, faster and leaner,
  exports straight to GGUF; its Desktop app and `unsloth studio` page train without code, on NVIDIA
  GPUs and Macs); a hosted fine-tuning service when there is no GPU.
- **Beyond example replies:** all of this is supervised fine-tuning (SFT). Preference training
  (DPO: a better and a worse reply to each prompt) suits style and judgement calls; reinforcement
  learning with a scoring program (GRPO) suits answers a program can check, such as sums or code
  with tests. Both usually start from an SFT model. Before a GRPO run, try the scorer on known
  right, wrong, empty and badly formatted answers: a wrong answer must never outscore a right one.
- **Base model:** an instruct model of a size you can serve (start at 1 to 8 billion parameters),
  from the family you will deploy, with a licence that allows your use.

## 4. Work out the GPU memory

| Model size | QLoRA | LoRA, 16-bit base | Full fine-tuning |
| --- | --- | --- | --- |
| 1 to 2 B | 4 to 6 GB | 6 to 10 GB | 16 to 32 GB |
| 7 to 8 B | 10 to 14 GB | 20 to 24 GB | about 130 GB (several GPUs) |
| 13 to 14 B | 14 to 20 GB | 32 to 40 GB | about 230 GB |
| 30 to 32 B | 24 to 32 GB | 70 to 80 GB | several hundred GB |
| 70 B | 46 to 56 GB | about 150 GB | over 1 TB |

Rough figures for a batch of 1 to 2 at 2,048 tokens with gradient checkpointing. The weights take
parameters × bytes (2 at 16-bit, about 0.55 at 4-bit); full fine-tuning with AdamW needs about 16
bytes per parameter before activations. The local-models skill has a script that reads a model's
real size. Short of memory: shorter `max_length`, batch 1 with more gradient accumulation, QLoRA,
an 8-bit optimizer (`optim="paged_adamw_8bit"`), or a smaller model. No GPU here: do not train on
the processor beyond a toy test; use a rented GPU or a hosted service, and give the user the cost.

## 5. Settings that usually work (LoRA)

| Setting | Start with | Adjust |
| --- | --- | --- |
| Rank `r` | 16 | 8 for style, 32 to 64 for harder tasks with more data |
| `lora_alpha` | 2 × r | |
| `lora_dropout` | 0.05 | 0 for large datasets |
| `target_modules` | `"all-linear"` | |
| Learning rate | 1e-4 to 2e-4 | lower if the loss jumps; 1e-5 to 2e-5 for full fine-tuning |
| Epochs | 1 to 3 | stop when validation loss stops falling |
| Effective batch | 16 to 64 examples | per-device batch × accumulation × GPUs |
| Warm-up, schedule | 3% of steps, cosine | |
| `max_length` | the 95th percentile of your examples | longer costs memory |
| `assistant_only_loss` | `True` for chat data | learn the replies, not the questions |

Fix the seed, log every 10 steps, evaluate on the validation set every few dozen steps, keep the
best checkpoint.

## 6. Train, and watch it

- First a short trial (20 steps, a hundred examples) to catch errors cheaply; then the full run.
  Before it trains, the script prints the exact text the loss learns from and how many examples
  survived the cut to `max_length`: you should see only the assistant's replies, each with its
  end-of-turn token, and all your examples (what to do otherwise is in the reference).
- Training loss should fall steadily; validation loss falls, then flattens. Validation loss rising
  while training loss keeps falling is overfitting: fewer epochs, a lower learning rate, more
  varied data. A loss that will not move: the learning rate is too low, or the data or template is
  wrong (everything masked out). Spikes or NaN: the learning rate is too high, or fp16 overflowed
  (use bf16 where the GPU supports it).
- Read real answers to validation prompts during training: loss hides a model that never stops,
  repeats itself, or breaks the format.

## 7. Evaluate honestly

- The same held-out test set, prompt and decoding for the base model and the tuned one; the task's
  own metric; results with intervals (model-evaluation skill).
- Check what it may have lost: a handful of general prompts, or a small standard benchmark.
- No test example, or near copy, in the training data: rerun the data check with `--test`.
- Report the data size, method, key settings, results and typical failures.

## 8. Merge and export

- Keep the adapter (a few to a few hundred MB): load it on the base with PEFT, or serve it directly
  with vLLM (`--enable-lora --lora-modules name=path`).
- Merge for simpler serving: load the base in 16-bit (never the 4-bit one), `merge_and_unload()`,
  save as safetensors with the tokenizer.
- For llama.cpp and Ollama: convert the merged model to GGUF and quantize it (or Unsloth's
  `save_pretrained_gguf`). Run the evaluation again on the exported model: quantization changes
  answers.
- Publishing it: the hugging-face skill (a model card that names the base model and its licence).

## Pitfalls

- Fine-tuning to add knowledge that retrieval would serve better.
- No baseline, or a test set the model trained on.
- Training with one chat template and serving with another.
- Loss computed on the prompts too, so the model learns to write the user's messages.
- Merging into a 4-bit base; many epochs on a tiny dataset.
- Losing the work with a rented GPU or a notebook session: download the adapter and checkpoints
  before the machine stops, as its disk usually goes with it.
