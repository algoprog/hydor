---
name: model-evaluation
description: Use when measuring how good a model, prompt or AI system is, or comparing two of them (standard benchmarks, a test set of your own, LLM-as-judge, an A/B comparison), and reporting the result with honest uncertainty.
category: ai
triggers: [model evaluation, evaluate the model, evaluate a model, evaluate our model, eval set, evaluation set, lm-eval, lm-evaluation-harness, llm as a judge, llm-as-a-judge, benchmark score*, which model is better]
---

# Evaluating models honestly

An evaluation is only as good as its test set and its comparison. Define the task and what "good"
means, test on examples the system has never seen, compare systems under the same conditions,
measure enough examples to tell a real difference from noise, and report the uncertainty with the
result. Harness commands are in `references/lm-eval.md`; judge rubrics in
`references/judge-rubric.md`.

## 1. Define the task and the metric

- Write down the decision the evaluation serves (ship the fine-tuned model? which prompt? which
  provider?), the task, the inputs it will meet in real use, and what a good output is.
- Pick the metric that fits the task:

| Task | Metric |
| --- | --- |
| One right answer (a number, a label, a choice) | Accuracy, exact match after normalising |
| Classes of unequal size, extraction | Precision, recall, F1 per class and macro-averaged |
| Code | Tests passed (pass@1), in a sandbox |
| Open-ended text (answers, summaries, emails) | A rubric scored by people or a validated judge model |
| Translation, summaries, as a rough signal | chrF, ROUGE; never alone |
| Always, beside quality | Cost per item and latency |

- Decide beforehand what difference matters ("at least 3 points more accuracy, at no more cost")
  and the threshold for passing.

## 2. Build a clean test set

- **Representative:** sampled from real use (anonymised), plus edge cases and known hard cases, in
  proportions you state.
- **Held out:** never used for training, for few-shot examples, or for tuning prompts. Keep a
  separate development set for iterating, and freeze the test set (a version and a file hash).
- **Uncontaminated:** public benchmarks may be in a model's training data. Prefer new or private
  items, or items dated after the model's training cutoff; check overlap with any training data you
  control (the fine-tuning skill's dataset check does it with `--test`); say the risk when you
  report public benchmark scores.
- **Correct labels:** have a second person (or a careful second pass) label a sample, measure how
  often they agree, and fix or drop ambiguous items.

## 3. Standard benchmarks: lm-evaluation-harness

- `pip install "lm-eval[hf]"` (or `[vllm]`), then for example
  `lm-eval run --model hf --model_args pretrained=Qwen/Qwen3-8B,dtype=bfloat16 --tasks gsm8k,ifeval --apply_chat_template --batch_size auto --output_path results --log_samples`.
- A model behind an OpenAI-compatible server: `--model local-chat-completions` with its address;
  it handles generation tasks only. Multiple-choice tasks scored by likelihood (MMLU, HellaSwag,
  ARC) need `--model hf`, `--model vllm`, or `local-completions` with a tokenizer.
- `--limit 20` is for a smoke test only; never report a limited run. `lm-eval ls tasks` lists the
  tasks.
- Compare like with like: the same harness version, task version, few-shot count, chat template
  and generation settings. Published scores often used other settings: rerun the baseline yourself.
- Benchmarks measure benchmark skill; always add a test of your own task.

## 4. LLM-as-judge, with care

- For open-ended outputs, a strong model can score answers against a rubric, cheaply and at scale,
  but it has biases: it favours the first answer shown, longer answers, and its own family's style.
- Write a rubric with concrete criteria and an anchored scale (what a 1, 3 and 5 look like), or
  yes/no checks ("states the refund deadline"). Ask for a short justification before the score;
  give a reference answer when one exists.
- Prefer pairwise comparisons (A or B) to absolute scores; show each pair in both orders and count
  a win only when both orders agree; allow ties; keep answers' lengths in view.
- Validate the judge before trusting it: people label 50 to 100 items, you measure agreement
  (Cohen's kappa; aim for 0.6 or more), and read the disagreements. Use a judge from another model
  family than the systems judged; temperature 0; fixed prompt and model version; keep every raw
  judgement.

## 5. Enough items, and the uncertainty

The 95% interval around an accuracy is roughly:

| Items | Near 50% | Near 80% |
| --- | --- | --- |
| 100 | ± 10 points | ± 8 |
| 400 | ± 5 | ± 4 |
| 1,000 | ± 3 | ± 2.5 |
| 2,500 | ± 2 | ± 1.6 |

- A difference smaller than that, from one run, is not established. Scoring both systems on the
  same items (a paired comparison) detects smaller differences.
- `scripts/compare_runs.py` (in this skill's folder) takes per-item scores of one or two runs (JSONL
  or CSV with `id` and `score`) and prints each mean with its interval, the difference with a paired
  bootstrap interval, and McNemar's test (or a sign-flip test for ratings):
  `python3 <this folder>/scripts/compare_runs.py base.jsonl tuned.jsonl --names base,tuned`.
- Many variants tried on one test set: the best looks better than it is. Confirm the winner on
  fresh items.
- Sampling at temperature above 0: run several seeds and report the spread.

## 6. Compare fairly

- The same items, in the same order, scored by the same code.
- The same prompt and template, or each system's best prompt tuned on the development set, said so.
- The same decoding: temperature, maximum length, stop sequences, reasoning settings.
- The same tools, context and retrieval.
- Failures count: timeouts, refusals and unparseable answers are wrong unless you report them apart.
- Cost and latency next to quality.

## 7. Report

- The headline: the metric with its interval and the number of items, the comparison, and what it
  means for the decision.
- The setup: model names and versions, prompts, decoding, dates, harness version, the test set and
  how it was built.
- Breakdowns by category, and an error analysis: read 20 to 50 failures, group them, give examples.
- Limits: contamination risk, judge reliability, sample size, what was not tested.
- Keep per-item outputs and scores (JSONL), so anyone can check and recompute.

## Pitfalls

- Tuning prompts on the test set, then reporting the test score.
- One number without the item count or an interval.
- Your model's numbers set against a paper's numbers from different settings.
- An unvalidated judge, or a judge grading its own model family.
- Dropping unparseable answers instead of counting them as failures.
