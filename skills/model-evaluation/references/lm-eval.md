# lm-evaluation-harness (lm-eval 0.4)

Install in a virtual environment: `pip install "lm-eval[hf]"`, or `"lm-eval[vllm]"` to run models
through vLLM. Commands are `lm-eval run`, `lm-eval ls tasks` and `lm-eval validate`; the older form
without `run` still works.

## A model from the Hub, on a GPU

```bash
lm-eval run --model hf \
  --model_args pretrained=Qwen/Qwen3-8B,dtype=bfloat16 \
  --tasks gsm8k,ifeval,mmlu \
  --apply_chat_template --fewshot_as_multiturn \
  --batch_size auto --seed 1234 \
  --output_path results/qwen3-8b --log_samples
```

- `--apply_chat_template` for instruct and chat models (they are meant to see their template);
  `--fewshot_as_multiturn` gives few-shot examples as earlier turns.
- `--num_fewshot 5` sets the number of examples; leave it out to use each task's default, and
  report what you used.
- `--log_samples` keeps every prompt, answer and score: read some before trusting a number.
- A fine-tuned adapter: `--model_args pretrained=<base>,peft=<adapter folder>,dtype=bfloat16`.
- Faster with vLLM: `--model vllm --model_args pretrained=Qwen/Qwen3-8B,dtype=auto,gpu_memory_utilization=0.85,max_model_len=8192`.

## A model behind an OpenAI-compatible server

```bash
lm-eval run --model local-chat-completions \
  --model_args model=qwen3-8b,base_url=http://localhost:8000/v1/chat/completions,num_concurrent=4,max_retries=3 \
  --tasks gsm8k,ifeval --apply_chat_template --output_path results/server
```

Chat endpoints return text only, so only generation tasks work (gsm8k, ifeval, bbh's generative
variants...). Tasks scored by comparing answer likelihoods (mmlu, hellaswag, arc_easy,
arc_challenge, winogrande) need `--model local-completions` with `tokenizer=<hub id>` against a
`/v1/completions` endpoint that returns log-probabilities, or the `hf` or `vllm` backends.

## Choosing tasks

| Measures | Tasks |
| --- | --- |
| Knowledge, multiple choice | `mmlu`, `mmlu_pro`, `arc_challenge` |
| Grade-school maths, step by step | `gsm8k` |
| Following formatting instructions | `ifeval` |
| Commonsense | `hellaswag`, `winogrande` |
| Hard reasoning | `bbh`, `gpqa_diamond_zeroshot` |
| Code (runs generated code: sandbox only) | `humaneval`, `mbpp`, with `--confirm_run_unsafe_code` |

`lm-eval ls tasks` lists everything (thousands, including other languages). Popular benchmarks
are likely in recent models' training data: treat high scores on them with suspicion, and test
your own task as well.

## Reading results

`results/.../results_*.json` holds each task's metrics with a standard error (`*_stderr`): the 95%
interval is about the score plus or minus twice the standard error. Two models whose intervals
overlap heavily are not shown to differ by that run.

Smoke test before a long run: `--limit 20` (never report a limited run).
