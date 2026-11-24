# Word suggestions: the code that built the model

Hydor's word suggestions (the grey word after the caret) run a small model of our own, **hydor-suggest-49m**, beside
[Qwen3.5-0.8B-Base](https://huggingface.co/Qwen/Qwen3.5-0.8B-Base). The model is on Hugging Face:
[algoprog/hydor-suggest-49m](https://huggingface.co/algoprog/hydor-suggest-49m). Its card says what is in it, which
public text it learned from, and how well it does.

This folder is the research code behind it: the model, the training loop, the corpus builders, the tests that measure
a suggestion, and the steps that turned a checkpoint into the files the app downloads. Read it to study the model or
to build another one. You do not need it to use the app.

The app's own code is elsewhere. The engine that runs the model on your computer, and the learning from your own
writing, are in [`server/suggest/py/hydor_suggest/`](../../server/suggest/py/hydor_suggest/). The design is in
[`docs/plans/word-suggestions.md`](../../docs/plans/word-suggestions.md). [`SPEC.md`](SPEC.md) here is the experiment
spec: the data, the contexts, the scorers and every metric, defined exactly.

## Layout

The package `ws/`:

- `types.py`: the types every module shares (an example, a scorer).
- `textdata.py`: builds the test examples (chat, documents, plain paragraphs, FLORES-200, and the public `messages` and `email` tests) and the options every script
  shares for choosing them (`--split`, `--surface`, `--lang`, `--ctx`, `--limit`).
- `vocab.py`: the small model's vocabulary, a projection of Qwen3.5's token ids. The release uses all of them:
  its id is Qwen's id plus 6 (six special tokens come first).
- `tokbytes.py`: the exact bytes of each token, and which tokens fit the letters already typed.
- `slm.py`: the small model (a hybrid of short convolutions and attention, in sizes 5m to 100m) and its scorer.
- `ngram.py`: an n-gram model, a baseline.
- `scorers.py`: the large model as a scorer (a causal language model on the CPU).
- `mlm.py`: a masked-language-model encoder (mmBERT) as a next-token scorer, tried and set aside.
- `mix.py`: mixing the two models' distributions: a fixed weight, a learned gate, per-language gates and the
  per-language switch.
- `cache.py`: the session cache (words already written, mixed on top).
- `evaluate.py`: the metrics, from the exact definitions in `SPEC.md`: bits per byte, next-word accuracy, and the
  keystrokes a suggestion saves at a given share of right suggestions.
- `train.py`: training data, batches, the training loop and the dev measures. This is also how the model learns from
  one person's text, with public text replayed beside it.
- `lora.py`: LoRA for that personalisation (`train_slm.py --lora-rank R`): adapters on the attention, MLP and convolution
  projections, the rest frozen, the embedding projection and table trained in full only when asked
  (`--train-proj`, `--train-embed`); the checkpoint it writes has the adapters merged into the weights.
- `pretrain_data.py`: the pretraining shards as sequences, the replay of public text, and the mix of tokens per
  language.
- `online.py`, `dayroute.py`: experiments in keeping the small model current day by day.
- `nights.py`: the nightly runs of the app, simulated (see `scripts/nights_sim.py`).
- `gpu.py`: the device option, the GPU memory cap (`WS_GPU_MEM_GB`) and GPU versions of the scorer and the metrics.

The pipeline steps in `scripts/`:

- `pretrain_slm.py`: pretrains the small model on the public corpus (one GPU, several under `torchrun`, or the CPU).
- `train_slm.py`: trains or continues the small model on a person's own messages, with `--replay-pretrain` against
  forgetting.
- `flores_forgetting.py`: per-language NLL and acc@1 on FLORES of personalised checkpoints against the base, with paired bootstrap
  intervals.
- `build_vocab.py`: a smaller vocabulary (48,000 ids) from the most used tokens; the early experiments used it. The
  release has the full one.
- `build_lid.py`: the language guess (`lid.json`, `lid.bin`) from token counts per language.
- `build_replay.py`: the 20 million tokens of public text the app replays when it learns from a person.
- `fit_gate.py`: fits the mixing gate, and with `--lang-switch` the per-language switch.
- `eval.py`: scores models and mixes on a test set and writes the metrics.
- `real_chances.py`: decodes every suggestion for real, as the app does, and records whether it was right and how
  sure the model was. This is the trustworthy measure of keystrokes saved.
  `--variant ...|cache:<fit.json>` decodes with the session cache mixed into every row, as the app does. `--reply-cut head:tail` (the
  characters of the agent's reply the page sends), `--agent-words first:last` (the words of that the models read) and
  `--cache-reply-cut head:tail` (what the cache keeps of each earlier reply) change what the reply gives; the defaults are the whole
  reply, its last 100 words, and the whole of each earlier reply. Measured on the chat test (673 messages): the first words of the
  reply, instead of some of its last ones or added to them, did not save more keystrokes, and neither did the first and last
  1,000 characters for the cache instead of the last 2,000.
- `merge_eval.py`, `merge_real.py`: join the shards of an evaluation or a decoding that ran on several GPUs.
- `show_filter.py`: the keystroke simulation. It also finds the confidence thresholds for a given share of right
  suggestions (`--compare-real`).
  `show_filter.py --compare-real ... --min-save 0,1,2,3` measures a minimum length: suggestions that would save fewer than m
  keystrokes (their letters minus the Tab, the `plen` of an event from `real_chances.py`) are hidden, and the threshold is picked again.
- `fit_cache.py`: fits the session cache's weight.
- `export_release.py`: writes `model.safetensors` and `config.json` from a checkpoint.
- `release_manifest.py`: writes `manifest.json`, the size and SHA-256 of every file of a release.
- `check_greedy.py`: checks the quick measure against real constrained decoding.
- `compare_langs.py`, `report.py`: compare runs per language, and gather many runs into one table.
- `online_sim.py`: keeps a model current over the test days (`ws/online.py`).
- `nights_sim.py`, `nights_report.py`, `nights_run.sh`: the app's nightly run simulated over the history (`ws/nights.py`, which runs the app's own trainer): does the model drift when it learns a little every night, and do replaying older writing, a check on held-out public text, or a fresh start every 30 days help. Counts and losses only; the data is private.
- `bench_slm.py`, `bench_full_vocab.py`, `bench_mlm.py`: how fast the small model, the full-vocabulary model and
  mmBERT are on a CPU.
- `personal_meta.py`: counts the languages in your own messages with the release's language guess. It prints numbers
  only.
- `unity_gpu_job.sh`, `unity_train.sh`, `unity_corpus.sh`, `unity_bench.sh`: the Slurm jobs of the cluster runs
  (below).

The corpus builders and test sets in `data/`:

- `pretrain.py`: a first, small corpus in six languages (English, Greek, German, Spanish, French, Chinese) and chats.
- `pretrain200.py`, `pretrain200b.py`: the corpora of the first two training stages (200 languages, about 2 and 4
  billion tokens).
- `pretrain50b.py`: the corpus of the last stage (about 49 billion tokens in 202 languages), built as tasks that
  many jobs can claim at once.
- `pretrain50b_manifest.json`: what that corpus held, per source and language, when it was built.
- `mix_complement.json`: the tokens per language of the last stage (below).
- `iso3to1.json`: three-letter to two-letter language codes.
- `flores.py`: FLORES-200, the 204 language variants, as test data.
- `multi.py`: about 300 Wikipedia paragraphs in six languages, a small multilingual test.
- `oasst2_messages.py`: the public `messages` test, `data/messages_oasst2.jsonl`: 800 human messages of OpenAssistant oasst2's
  validation split (Apache-2.0) with the assistant message each answers as context, every language, seeded. The small model
  was pretrained on oasst2's chats (all but a held-out 1% of the trees), so this test is not unseen for it; the file marks
  the held-out ones.
- `enron_email.py`: the public `email` test, `data/email_enron.jsonl`: 700 emails of the Enron corpus (`corbt/enron-emails`, no
  licence stated; a public-record corpus), quoted replies, forwards, headers and signatures removed, one writer each, English.
  Both run with `--surface messages` or `--surface email --limit 0` (the files are the fixed samples).
- `extract.py`, `stats.py`, `validate.py`: your own chat test set, built from your own Hydor database (see
  "Your own chat test set").

`tests/` has the unit tests.

## Requirements

- Python 3.12 (what it was written and tested on). A GPU only for pretraining, and it helps with
  evaluation. Everything else runs on a CPU.
- Packages: `torch`, `numpy`, `transformers`, `tokenizers`, `safetensors`, `huggingface_hub`, `datasets` and
  `pyarrow` (the corpus builders), and `scikit-learn` (only `show_filter.py`). The CPU environment of the research ran
  torch 2.15, numpy 2.5, transformers 5.23, tokenizers 0.23, safetensors 0.8, datasets 5.2, huggingface_hub 2.4,
  pyarrow 26 and scikit-learn 1.9. The pretraining runs used a CUDA build of torch in a second environment.
- Network access to Hugging Face: the Qwen3.5 tokenizer and model download on first use, and so does the public
  text for the corpora.
- [llama.cpp](https://github.com/ggml-org/llama.cpp) only for the quantisation and speed benchmarks of the large
  model (SPEC.md, E2). It was built for the CPU at commit `5297534` (release `b12498`, 18 November 2026), the one the
  app pins in `server/suggest/pins.ts`. Nothing else here needs it.

Make an environment and run everything from this folder:

```bash
python3.12 -m venv .venv && .venv/bin/pip install torch numpy transformers tokenizers safetensors huggingface_hub datasets pyarrow scikit-learn
export CUDA_VISIBLE_DEVICES=       # CPU only, unless a command says otherwise
```

Evaluation scripts end up with a lot of work for a CPU: run them under `nice -n 19`, and give a few threads with
`--threads`. A shared computer will thank you.

## How the released model was built

The release is a 48.8 million-parameter model (`--size 30m` with the full vocabulary and a factorised embedding of
rank 128), pretrained in three stages, one after the other. All the commands run from this folder. The corpora are
public text from Hugging Face; the model card lists them and their licences. No private text was used.

### 1. The corpora

```bash
python data/flores.py                                       # FLORES-200: the test data, and what to keep out of the corpora
python data/pretrain200.py plan                             # stage 1: about 2 billion tokens in 200 languages
python data/pretrain200.py build --part 0/2 --deadline-min 90    # and --part 1/2 in a second process
python data/pretrain200.py build --only chat                     # the chats (oasst2 and aya)
python data/pretrain200.py merge
```

Stage 2's corpus, `data/pretrain200b/`, links stage 1's files and adds more. Its plan needs the lists of files on the
Hub for Wikipedia and MADLAD-400. Write them first as `data/pretrain200b/hub_lists.json`,
`{"madlad": [...], "wiki": [...]}`, from `huggingface_hub.list_repo_files` of `allenai/MADLAD-400` and
`wikimedia/wikipedia` (both datasets):

```bash
python data/pretrain200b.py plan --iso data/iso3to1.json
python data/pretrain200b.py build --part 0/2 --deadline-min 120  # and --part 1/2 in a second process
python data/pretrain200b.py merge
```

Stage 3's corpus is built as tasks, on a cluster (`unity_corpus.sh`, below), or on one computer:

```bash
python data/pretrain50b.py plan --out data/pretrain50b --total 50e9
python data/pretrain50b.py run --out data/pretrain50b --workers 16 --rayon 2 --deadline-min 660
python data/pretrain50b.py merge --out data/pretrain50b
```

Every builder drops any document that holds a FLORES-200 sentence, and holds out a small share of each source for
measuring. `pretrain50b_manifest.json` is the manifest the last build wrote. `mix_complement.json` is the plan for the
last stage: 10 billion tokens, 70% to the 141 languages where Qwen3.5 is weakest (up to 10 passes over each), 27% to
the others and 3% to chats.

### 2. The small model, in three stages

The runs used four GPUs each. Stages 1 and 2 ran on four RTX 4090s, stage 3 on four A100s of a cluster. The
micro-batch, accumulation, peak learning rate and warm-up below are what the runs' logs show. For the other options
the defaults of `pretrain_slm.py` apply, and the log does not say what else was set, so a rebuild may differ a little.

```bash
# stage 1: from scratch, 2 billion tokens
torchrun --standalone --nproc_per_node 4 scripts/pretrain_slm.py --device cuda --out runs/slm/pre200_30m \
  --pretrain data/pretrain200 --vocab full --emb-rank 128 --size 30m --tokens 2000000000 --bf16 \
  --micro-tokens 8192 --accum 6 --lr 1.5e-3 --warmup 100

# stage 2: warm start, 7.5 billion tokens of the larger corpus
torchrun --standalone --nproc_per_node 4 scripts/pretrain_slm.py --device cuda --out runs/slm/pre200b_30m \
  --pretrain data/pretrain200b --vocab full --emb-rank 128 --size 30m --init runs/slm/pre200_30m/ckpt.pt \
  --tokens 7500000000 --bf16 --micro-tokens 16384 --accum 3 --lr 1e-3 --warmup 300
```

Add `--mem-gb N` (a cap on each process's GPU memory) when the GPUs are shared. A checkpoint of the best held-out
loss is written to `<out>/ckpt.pt`.

Stage 3 is the release: another warm start, on the 49-billion-token corpus, with the language mix of
`mix_complement.json`, and 10 billion tokens read. It ran on the cluster with the job scripts (below):

```bash
export WS=/path/to/workspace ACCOUNT=<your Slurm account> PART=superpod-a100       # code/ in $WS holds this folder
mkdir -p $WS/hydor-runs
cd $WS/code
JOB_SCRIPT=scripts/unity_train.sh JOB_NAME=pre50b_30m_cmix NGPU=4 TIME=08:00:00 \
  NAME=pre50b_30m_cmix SIZE=30m INIT=$WS/runs/warm/pre200b_30m/ckpt.pt MIX=$WS/code/data/mix_complement.json \
  TOKENS=10000000000 LR=6e-4 MICRO=65536 ACCUM=2 bash scripts/unity_gpu_job.sh
```

(Put stage 2's `ckpt.pt` in `$WS/runs/warm/pre200b_30m/` first.) It took about 24 GPU-hours, so about
six hours on four GPUs. The result is
`$WS/runs/pre50b_30m_cmix/ckpt.pt`. A plain pass over the whole corpus gave a model that is better on average and
worse where Qwen3.5 needs help; the mix keeps the small languages.

### 3. The language guess and the replay text

```bash
python scripts/build_lid.py count --procs 6 --out release/_work/lid_counts.npz
python scripts/build_lid.py build --counts release/_work/lid_counts.npz --out release/hydor-suggest-49m --top 20000
python scripts/build_replay.py --out release/hydor-suggest-49m/replay --tokens 20000000
```

`build_lid.py` counts Qwen token ids per language over the web text of `data/pretrain200b`, picks the smoothing on
FLORES-200 dev, and writes `lid.json` and `lid.bin`. `build_replay.py` samples 20 million tokens of the corpus, only
from sources that may be redistributed (FineWeb-2, FineWeb-Edu, OpenAssistant, Aya), and writes `replay.u32` and
`index.json`.

### 4. The gate, the switch and the thresholds

The gate says how much to trust the small model at each step. The switch says, for each language, whether to mix at
all or to use Qwen3.5 alone. Both are fitted on FLORES-200 **dev**, never on test. `--device cuda` is much faster;
leave it out to use the CPU.

```bash
CKPT=runs/slm/pre50b_30m_cmix/ckpt.pt
python scripts/fit_gate.py --split dev --surface flores --limit 15 --llm Qwen/Qwen3.5-0.8B-Base --slm $CKPT \
  --device cuda --out runs/gate/flores_global.json --lang-switch --out-switch runs/gate/flores_switch.json
```

`gate.json` of the release holds the `features`, `w`, `b`, `mu` and `sd` of the first file. `switch.json` holds the
`switch` map and `switch_default` (stored there as `default`) of the second one.

`calibration.json` has, for each way of running the model (`mix`, `llm`, `slm`), the confidence at which 30, 40 and
50 out of 100 shown suggestions are right. They come from real decoding on FLORES-200 devtest, in the languages that
use spaces, 20 sentences each:

```bash
V=llm+slm:langswitch:runs/gate/flores_switch.json
python scripts/real_chances.py --split test --surface flores --limit 20 --words-per-example 16 --llm Qwen/Qwen3.5-0.8B-Base \
  --slm $CKPT --variant llm --device cuda --events-out runs/real/llm.jsonl --out runs/real/llm
python scripts/real_chances.py --split test --surface flores --limit 20 --words-per-example 16 --llm Qwen/Qwen3.5-0.8B-Base \
  --slm $CKPT --variant "$V" --device cuda --events-out runs/real/mix.jsonl --out runs/real/mix
python scripts/real_chances.py --split test --surface flores --limit 20 --words-per-example 16 --llm none \
  --slm $CKPT --variant slm --device cuda --events-out runs/real/slm.jsonl --out runs/real/slm
python scripts/show_filter.py --compare-real runs/real/mix.jsonl runs/real/llm.jsonl runs/real/slm.jsonl \
  --labels mix,llm,slm --out runs/real/calibration
```

The rows with `"tag": "compare_real"` give `theta` for each precision (0.3, 0.4, 0.5). No script writes
`calibration.json`: the release's holds the pooled rows, rounded to four decimals (`mix` is the switch's row), in the
same layout.

### 5. Export and publish

```bash
python scripts/export_release.py --ckpt $CKPT --out release/hydor-suggest-49m --verify
# put tokenizer.json (Qwen3.5's, unchanged), gate.json, switch.json, calibration.json, the licences and the card in the same folder
python scripts/release_manifest.py release/hydor-suggest-49m
```

`export_release.py` writes `model.safetensors` and `config.json`, and with `--verify` it loads them again and checks
that they give the checkpoint's numbers. `release_manifest.py` writes `manifest.json`. Upload the folder to
Hugging Face. The app downloads one pinned revision of it, and checks every file's size and SHA-256 as it does. When
you publish a new one, put its repository, revision and the files' sizes and hashes (they are in `manifest.json`) into
`SMALL_MODEL` in `server/suggest/pins.ts`.

## Evaluation

**FLORES-200** is the public test, in 204 language variants. Its **dev** half fits the gate, the switch and the
thresholds. Its **devtest** half (`--split test`) is the test. `data/flores.py` downloads it from Meta.

```bash
python scripts/eval.py --split test --surface flores --limit 40 --llm Qwen/Qwen3.5-0.8B-Base --slm $CKPT \
  --variants llm,slm,llm+slm:langswitch:runs/gate/flores_switch.json --device cuda --out runs/eval/flores
```

That measures next-word accuracy and bits per byte, quickly, with the gold words as the context ("teacher forced").
Keystrokes saved are measured with `real_chances.py` (above), which decodes each suggestion the way the app does.
Languages that are written without spaces are scored per character. The model card has the results.

`--shard k/n` with `merge_eval.py` or `merge_real.py` splits a long run over several GPUs. `compare_langs.py` and
`report.py` read the outputs.

### Your own chat test set

The experiments also tested on real chat. Your messages are the only data that matches how you write, so the test set
is built on your own computer, from your own Hydor database, and it stays there.

```bash
CUDA_VISIBLE_DEVICES= nice -n 19 python data/extract.py          # reads ~/.web-agent/web-agent.db, read-only
python data/stats.py                                              # data/stats.md: counts per split and language
python data/validate.py 20                                        # checks 20 messages against the raw transcripts
```

`extract.py` keeps what you typed (not what other agents or Hydor wrote into your turns), the agents' replies that came before it (its context), and your notes and documents. It splits them by time:
the newest days are the test, the week before is dev, the rest is train. If your Hydor data is not in `~/.web-agent`,
change `DB` at the top of the script. Then the chat surface works in every script:

```bash
python scripts/train_slm.py --out runs/slm/personal --init $CKPT --vocab full --w-user 4 --epochs 1 --lr 5e-4 \
  --batch-tokens 4096 --replay-pretrain data/pretrain200b --replay-pretrain-ratio 1.0 --bf16 --device cuda
python scripts/eval.py --split test --surface chat --ctx agent+user --llm Qwen/Qwen3.5-0.8B-Base \
  --slm runs/slm/personal/ckpt.pt --variants llm,slm --out runs/eval/chat
```

The first command is the research version of what the app does on its own: it learns from your messages, weighted
four times, with public text replayed beside them so that the other languages are not forgotten.

**Privacy.** What `extract.py` and its neighbours write (`user_msgs.jsonl`, `agent_texts.jsonl`, `other_texts.jsonl`,
`split.json`, `stats.md`, `sessions_typed.json`, `validation*.json`) is your own writing, and so is every model trained
on it. It stays in `data/` and `runs/`. `.gitignore` keeps both out of git, and nothing here sends them anywhere. Do not
commit them, do not paste them into an issue, and do not publish a checkpoint trained on them. No one's messages, and
no model trained on them, are in this repository.

## The Slurm jobs

The four `unity_*.sh` scripts ran the cluster work on the Unity cluster (Slurm; A100 GPUs in the
`superpod-a100` partition). They take where to run from the environment:

- All of them need `WS`, the workspace on the cluster. They run from `$WS/code`, which holds this folder; `data/` and
  `runs/` of the workspace sit beside it (`$WS/data`, `$WS/runs`). Python with the packages, and `torchrun`, must be on
  the `PATH` of the job.
- `unity_gpu_job.sh` submits another script as a one-node job and follows its log, so that a job started from Hydor's
  Experiments shows its metrics. It needs `JOB_SCRIPT` and `JOB_NAME`, and reads `ACCOUNT` (the Slurm account to
  charge, with `sbatch -A`), `PART` (the partition, default `superpod-a100`), `NGPU` (GPUs, default 8; 0 makes a CPU
  job), `CPUS` (48), `MEM` (400G), `TIME` (30 minutes), `QOS` (for example `short`). The log goes to
  `$WS/hydor-runs/$JOB_NAME.log`, a folder you make first. Stopping the launcher cancels the job.
- `unity_train.sh` pretrains and resumes: after a stop or the time limit, the same command carries on from
  `resume.pt`. It needs `NAME`, `SIZE`, `TOKENS` and `LR`, and reads `INIT` (the checkpoint to start from), `MIX`
  (a tokens-per-language file), `DATA` (default `$WS/data/pretrain50b`), `NGPU`, `MICRO` (65536), `ACCUM` (1),
  `WARMUP` (300), `MIN_LR_FRAC` (0.1), `EVAL_EVERY`, `CKPT_MIN` (a checkpoint every 30 minutes), `WORKERS` and `BLOCK`.
  `DRYRUN=1` prints the command only.
- `unity_corpus.sh` builds the 50-billion-token corpus on CPUs (`NGPU=0 PART=cpu`). Several jobs may run it at once,
  and each claims its tasks. It reads `TOTAL`, `WORKERS`, `RAYON` and `DEADLINE_MIN`; `RESET_CLAIMS=1` frees the
  tasks a killed job held.
- `unity_bench.sh` times pretraining of the 30m and 100m models on a small sample (`BENCH_DATA`, default
  `$WS/data/bench_sample`; make it from a few shards of a corpus).

## Tests

```bash
cd scripts/word-suggest
CUDA_VISIBLE_DEVICES= nice -n 19 python -m unittest discover -s tests
```

They need nothing but the packages: no corpus, no data and no GPU. They take about 20 seconds on a CPU. The ones that
need Qwen3.5's tokenizer or mmBERT-small download them on first use, and are skipped when the Hugging Face cache does
not have them and there is no network. The two that need a GPU are skipped without one.

## Licence

AGPL-3.0-only, like the rest of the repository. The model's tokenizer is Qwen3.5's, unchanged, under Apache-2.0
(copyright Alibaba Cloud); the model card has the notices, and the licences of the public text it learned from.
