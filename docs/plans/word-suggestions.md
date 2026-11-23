# Word suggestions: grey text after the caret

*The spec the first build of word suggestions follows (23 November 2026); change it as the build teaches better.*

## What it is

While someone types in Hydor, the rest of the word they are typing appears after the caret in grey, and the word
after it dimmer still. **Tab** takes the word (pressed again, the next one), **→** at the end of the text takes both,
**Esc** hides them until the next word. Everything runs on the person's own computer: a small model of our own (49M
parameters, 200 languages, kept learning from what this person writes) mixed with Qwen3.5-0.8B-Base (8-bit, through
llama.cpp) when the computer has the memory for it. Nothing typed leaves the machine.

It is on from the start, and sets itself up the first time someone types in a message box or a document (it
downloads about 1.3 GB then; a server no one types on downloads nothing): **Settings → Capabilities → Word
suggestions**, where every part of it can be set, and where it is turned off.

Where the numbers come from: the experiments behind it (FLORES-200 in 193 spaced languages and a test set of real
chat messages, judged by decoding each suggestion as the app would and counting the keystrokes it saves at a given
share of right suggestions) found that the small model, pretrained on public text in 200 languages and personalised
on the person's own writing with the public text replayed beside it, adds to Qwen3.5: through a per-language switch,
9.0% → 10.5% of keystrokes saved over 193 languages at 40% precision; on chat, personalised and mixed through a
learned gate, 30.5% → 31.5%. Documents are best served by Qwen3.5 alone.

## The parts and where the code goes

| Part | Where | What |
|---|---|---|
| Engine (Python) | `server/suggest/py/hydor_suggest/` | the small model, mixing, language guess, session cache, constrained decoding, the llama-server client, the worker, personalisation |
| Server (Node) | `server/suggest/*.ts` | settings, setup (Python, llama.cpp, models), the llama-server and worker processes, routes, the texts for personalisation and its schedule |
| Shared types | `shared/suggest.ts` | the API's bodies and answers, the settings and their defaults |
| Web | `web/src/features/suggest/` | the grey text in message boxes and Docs, keys, the Settings section |
| Model release | Hugging Face `algoprog/hydor-suggest-49m` (pinned revision) | the files below |

### Folders on the computer

- `<DATA_DIR>/suggest/venv/`: the Python for the engine (torch CPU build, tokenizers, numpy, safetensors), made with
  uv when it is there, else `python3 -m venv` + pip, as `server/memory/embed.ts` does; the package string kept in
  `venv/.packages` (a different string rebuilds it). Never the memory venv (its check deletes torch).
- `<DATA_DIR>/suggest/llama/<tag>/`: llama.cpp's prebuilt `llama-server` for this platform (pinned release, per-asset
  SHA-256, as `server/voice/whisper.ts` pins whisper.cpp).
- The model files (the release, the GGUF): the user cache as `modelDir()` in embed.ts does
  (`~/.cache/hydor/suggest/…`, `~/Library/Caches/hydor/suggest/…`, `%LOCALAPPDATA%\hydor\cache\suggest\…`;
  `<DATA_DIR>/suggest/models/…` in Docker), downloaded with `downloadFiles` (resumable, SHA-256, `.complete` mark).
- `<DATA_DIR>/suggest/personal/`: the personalised model, its meta, the training state; private (0700 folder, 0600
  files). The texts handed to training are written to `<DATA_DIR>/suggest/personal/train/texts.jsonl` and deleted
  when training ends.

Environment overrides (for development and tests; documented in docs/configuration.md):
`HYDOR_SUGGEST=off` (never set up), `HYDOR_SUGGEST_PYTHON` (a Python that has the packages: used as it is),
`HYDOR_SUGGEST_MODEL_DIR` (a folder holding the release files: no download), `HYDOR_SUGGEST_GGUF` (a GGUF file),
`HYDOR_SUGGEST_LLAMA_SERVER` (a llama-server binary).

## The model release (one folder, one Hugging Face repo)

- `config.json`: `{"format": "hydor-suggest/1", "slm": {SLMConfig fields: arch, vocab, d, n_layers, ffn, heads,
  kv_heads, kernel, window, sandwich, qk_norm, rotary, rope_theta, max_len, norm_eps, emb_rank}, "specials": ["<unk>",
  "<bos>", "<eos>", "<agent>", "<user>", "<doc>"], "llm_vocab": <rows of Qwen3.5's output>, "max_ctx_tokens": 256,
  "llm": {"repo": "Qwen/Qwen3.5-0.8B-Base", "gguf_repo": "ggml-org/Qwen3.5-0.8B-Base-GGUF"}}`. The small model's ids
  are the specials (0–5), then every Qwen3.5 id shifted by 6.
- `model.safetensors`: the small model's weights, float32, the research model's state_dict names.
- `tokenizer.json`: Qwen3.5's tokenizer (Apache-2.0, its notice in the card); both models read the same ids.
- `gate.json`: the learned gate (research format: features, w, b, mu, sd), fitted on FLORES-200 dev with this model.
- `switch.json`: per language, `llm` or `mix`, chosen on FLORES-200 dev; `default`.
- `lid.json` + `lid.bin`: the language guess: per language (FLORES codes, as `switch.json`), log-probabilities of the
  tokens it uses most (from the pretraining text), and a floor; naive Bayes over the context's token ids.
- `calibration.json`: for each plan (`mix`, `llm`, `slm`), the confidence threshold θ that gives 30%, 40% and 50% of
  shown suggestions right in the research's real decoding (FLORES-200).
- `replay/`: public pretraining text (FineWeb-2 and the OpenAssistant / Aya chats only), already tokenised
  (`replay.u32` little-endian token ids, `index.json` with the sequences' offsets, kinds and languages): personalising
  replays it 1:1 beside the person's text, or the other languages are forgotten.
- `README.md` (the card: what it is, data and licences, results, how Hydor uses it), `LICENSE`.

## The engine (Python)

Ported from `research/word-suggest` (not in the repository): `ws/slm.py` (model, incremental state), `ws/vocab.py`
(specials, prefixes, mapping to Qwen's ids), `ws/mix.py` (gate features, gate, switch), `ws/cache.py` (session cache),
`ws/tokbytes.py` (token bytes, word ends, allowed sets), `scripts/real_chances.py` (constrained decoding and its
confidence) and `ws/train.py` + `scripts/train_slm.py` (personalising with replay). The port must give the research
code's numbers for the same inputs (its tests compare them).

### The worker: JSON lines on stdin and stdout

Started as `python -I <dist>/server/suggest/py/worker.py`; prints `{"status": "loading"}` and, once loaded,
`{"ready": true, "rss": <MB>}`. Every request has an `id`; every answer carries it back.

- `{"id", "op": "load", "model_dir", "personal_dir": str|null, "llm_url": str|null, "threads": int,
  "options": {"k": 1000}}` → `{"id", "ok": true, "model": "base"|"personal", "languages": {…user token counts…}}`.
  Sent first and again after training or when the LLM starts or stops (a `null` llm_url: the small model alone).
- `{"id", "op": "suggest", "surface": "chat"|"doc"|"text", "text", "reply"?, "prev"?, "doc"?, "session"?,
  "precision": 0.3, "next": true, "cache": true, "switch": true}` → `{"id", "word", "next", "conf", "conf_next",
  "theta", "show", "show_next", "plan", "lang", "ms": {"total", "llm", "slm"}}`.
- `{"id", "op": "session", "session", "texts": [str]}`: the session's earlier text for its cache (Node sends it once
  per session and when it grows); the worker keeps the last 20 sessions' caches.
- `{"id", "op": "cancel", "target": <id>}`: drop a suggest that is waiting or stop it between decoding steps (its
  answer is then `{"id", "cancelled": true}`).
- `{"id", "op": "stats"}` → `{"id", "rss", "requests", "p50_ms", "p90_ms"}`.
- An error: `{"id", "error": "…"}`. The worker reads one request at a time but reads stdin on a thread, so a cancel
  arrives while a suggestion is being decoded.

### What `suggest` does

1. **Split the text**: `R` = the word being typed with the whitespace before it (the research's `lead + word[:k]`:
   at a word boundary right after a space, `R` = that space); the context = everything before `R`, its last
   `typed words` (100) words. Chat: `agent_ctx` = the last 100 words of `reply`, `user_ctx` = "" (the typed text is the
   target's earlier part), as in the research's chat examples; `prev` (the person's previous message) goes in the
   session cache only. Doc: `doc_ctx` = the last 100 words of `doc` (the text before the caret's paragraph) and the
   paragraph's text before the word as the target's earlier part. Text: no context but the typed text.
2. **Token ids**: the LLM reads `build_prefix(plain)` tokenised, then the target's earlier part tokenised on its own
   (as the research did); the small model reads `prefix_from_ids(surface, agent, user, doc)` then the same target
   ids shifted. Both kept from one request to the next: the small model's state is extended when the new context
   only adds tokens (else run again: it is about 300 tokens at most).
3. **The plan** (the distribution suggestions are decoded from):
   - `doc` → `llm` (Qwen3.5 alone; `slm` when the LLM is not running).
   - `chat` and `text` → `slm` when the LLM is not running; else the language guess on the context (posterior ≥ 0.9
     over at least 8 tokens, else no language): a language the personal model was trained on with at least 2,000 of
     the person's own tokens → `mix` (personalisation is what helps there, and the base switch would turn it off: it
     gives English, Greek and every major language to the LLM); else, with `switch` on and a language guessed, the
     switch's choice; else `mix`.
   - `mix` = per step `λ·P_llm + (1 − λ)·P_slm` (λ is the LLM's weight, as in the research's gate), λ from the gate (the personal gate when personalisation made one,
     else the release's).
4. **The LLM's distribution**: llama-server's `/completion` with the prompt as token ids, `n_predict: 1`,
   `n_probs: k` (1000), `temperature: 0`, `cache_prompt: true`: the top k ids with their log-probabilities (about
   27 ms a step at 4 threads, Backspace included: the server keeps snapshots of the recurrent state). The rest of the
   mass, `r = 1 − Σ top-k`, is spread over the other ids in proportion to the small model's probabilities (plan
   `mix`; plan `llm`: a step whose allowed set has no id in the top k ends the suggestion with confidence 0). The gate's
   LLM features (entropy, top probability) come from the same sparse distribution.
5. **Decoding** (the research's, unchanged): greedy inside the allowed set of the typed bytes `R`, then unconstrained,
   until the word ends (the next arg max begins with whitespace or is end-of-text, or the token carries the whitespace)
   or 8 tokens; the confidence `conf` = the product of the renormalised step probabilities inside the allowed sets ×
   the mass of the word-ending tokens at the end. `word` = what it decoded past `R`'s typed letters. With `next` on and
   the word ended, the following word is decoded the same way with nothing typed: `next` (with its leading space) and
   `conf_next`. Session cache (with `cache` on, chat): `P = (1 − μ)·P_plan + μ·P_cache` as the research's E9.
6. **Showing**: `theta` = calibration.json's θ for the plan at the asked precision (between the listed precisions:
   linear); `show = conf ≥ theta`; `show_next = show and conf_next ≥ theta`.

A suggestion takes about 100–150 ms with the LLM at 4 threads, 30–60 ms with the small model alone.

### Personalising (`server/suggest/py/train.py`)

`train.py --texts <jsonl> --base <release dir> --init <release dir|personal dir> --out <new personal dir>
--replay <release dir>/replay --lr 5e-4 --batch-tokens 4096 --w-user 4 --replay-ratio 1.0 --epochs 1 --threads N
--device auto --resume`. Each line of the texts file: `{"kind": "user"|"agent"|"doc", "text", "ts", "session"?,
"reply"?}` (a user message carries the agent reply it answered, for its chat format). The research recipe: chat
sequences in the small model's own format, user-typed tokens weighted `--w-user`, the rest 1; the last 5% of the
person's messages held out (dev loss printed); public text replayed at the same token count; AdamW, bf16 autocast on
CPU, one pass. It prints `{"progress": {"done", "total"}, "loss"}` lines and ends with `{"done": true, "dev_nll",
"tokens", "seconds", "languages": {lang: the person's tokens}}`; it saves a resume state every 10 minutes and writes
`model.safetensors`, `config.json` and `meta.json` into `--out` only at the end (Node then swaps the folder in).
On a CPU it learns about 1,000 tokens a second at 8 threads: the first personalisation on a long history takes hours
(it runs when the computer is idle, at the lowest priority, and resumes after a stop); the daily ones read only the new
text (`--init` the personal model) and take minutes.

## The server (Node)

- **A Feature** (`server/features/`): routes and a `start` that schedules setup and training. Nothing starts while
  the setting is off, nor while it is on but never used (status `waiting`): the first warm-up (a message box got the
  focus) or request, or turning it on by hand, starts the setup (status `setting-up` with a `detail` line such as
  "Downloading the language model: 320 of 834 MB"), and from then on a start of the server carries on a setup a stop
  cut short and the schedule of learning runs. A setup that fails is tried again after ten minutes, then twenty,
  forty, at most a day. Turning it off stops both processes.
- **The LLM** (`llama-server`): started only when the LLM setting allows it: `on`, or `auto` with at least 8 GB of
  memory in the computer and 2.5 GB available now (`server/models/machine.ts`); otherwise the small model alone, and
  the status says why. Flags: `-m <gguf> -t <threads> -np 1 -c 2048 --host 127.0.0.1 --port <free> --no-webui`.
  Stopped after 30 minutes without a request, like the worker; restarted (once a minute at most) if it dies.
- **The worker**: as embed.ts's (lazy start, 3-minute load timeout, idle stop, three crashes in ten minutes = failed).
  Only the newest suggestion of each client (the browser tab's id) is kept: a new one cancels the one before.
- **Personalising**: with `personalise` on and the schedule due (`nightly`: when 20 h have passed and the person has
  not typed for 10 minutes, as memory's tidy-up; `weekly`; `manual`: only "Retrain now"), Node writes the texts
  (below) and runs `train.py` at `nice 19` (Windows: below-normal priority), then `load`s the new personal model.
  The first run reads everything; later ones the texts since the last run, from the personal model. A run is paused
  (`POST /api/suggest/train/pause`: SIGTERM, train.py saves its resume state; the pause is kept in `kv`, so it holds the
  schedule across restarts), resumed (`POST /api/suggest/train`) or stopped (`DELETE /api/suggest/train`: the work folder goes
  and the schedule counts it as an attempt). With `trainGpu` on, each run picks its device first (`server/suggest/gpu.ts`):
  an NVIDIA card with at least 4 GB free and under 50% use (the most free, among those `CUDA_VISIBLE_DEVICES` leaves), run
  with `--device cuda` (and `--micro-tokens <batch>`, the batch in one piece, when the card has 6 GB free; a card with less
  keeps train.py's pieces of 1,024, which peak under 4 GB) from a second private environment (`venv-gpu`, PyTorch's CUDA build for the
  newest CUDA the driver supports), or `mps` on a Mac with Apple silicon. A card that cannot be set up or fails in a run
  makes that run (resumed) go on the processor, and holds the card back for a day.
- **The texts**: the person's own typed words from sessions (`chunk_text` kind `user`, through `ownWords`, sessions
  with memory on and not confidential, not subagents', minus the injected text `research/word-suggest/data/extract.py`
  filters out: cross-session and child messages, scheduled-run text, wrapper tags), each with the agent reply it
  answered; agents' replies; memory notes the person wrote; pages and documents the person wrote (`page_versions.by`).
  Each source has its switch in Settings.

## Settings (`shared/suggest.ts`)

Kept on the server (`kv`, key `suggest.settings`): on/off; the language model (`auto` / `on` / `off`) and its size
(8-bit / 4-bit); how sure (`precision`: 0.3 more suggestions, the default … 0.5 surer ones); the next word; where (message boxes,
documents, notes, other text boxes); words read (typed: 100; the reply or the document: 100); per-language switch;
session cache; threads; personalise (on/off, schedule, sources, the weight of the person's own words, training
threads). Kept by each browser (`shared/device.ts`): show word suggestions in this browser. Every option has its row in
`server/tui/settings-table.ts` and its words in `shared/find-catalog.ts`.

## API

- `GET /api/suggest` → `{settings, status}`. `PUT /api/suggest` (a part of the settings) → the same.
- `POST /api/suggest` (`SuggestRequest`) → `SuggestResponse`; 204 when off or not ready.
- `POST /api/suggest/warm`: start what is set up (a message box got the focus).
- `POST /api/suggest/train`: personalise now; `DELETE /api/suggest/personal`: forget the personal model.
- `POST /api/suggest/usage` `{shown, taken, typedThrough, wrong, saved, typedChars}` (whole numbers, 0 to 5,000 each, no
  other field): adds to the counts kept in `kv` (`suggest.usage`: totals since `since`, and one bucket per local day, the
  last 31); `DELETE /api/suggest/usage` starts them again. `status.usage` = `{since, total, today, week}` (week: the last
  7 days). Counts only, never any text.

## What it counts (`shared/suggest.ts` SuggestCounts)

- A **suggestion** is one grey word shown at the caret (the `word` part; the next word becoming the grey word, after a
  Tab or after the word was typed through, is a new one; → also counts the next word, dimmer, as shown when it takes it).
- **Taken**: inserted with Tab or → (→ with a next word: two). **Typed through**: the person typed the whole grey word
  (its last letter, or the space after it) without Tab. **Right** = taken + typed through. **Wrong**: something else
  typed while it showed (a letter that differs, Backspace). Hidden with Esc, a blur, a caret move or sending: neither.
- **Keystrokes saved**: for each Tab or →, the characters it inserted minus 1. **Characters typed**: the growth of the
  text before the caret in boxes where suggestions are on, only for growth of 1 to 4 characters at once (more is a paste
  or dictation), never what Tab or → inserted, and not an input method's text. **Share saved** = saved / (typed + saved).
- The controller counts (`suggester.ts`, with the pure rules in `logic.ts`); `usage.ts` batches them for the tab and
  sends them every 15 s while there is something to send and when the page is hidden (`keepalive`).

## The web client

- **Message boxes** (the session's and the start page's composer, and with "other text boxes" on: follow-ups, the
  queue's and an earlier prompt's editors, the Ask panels): a mirror of the textarea behind it shows the grey text at
  the caret (same font, wrapping and scroll), `translate="no"`, `aria-hidden`. A request after each input (30 ms
  debounce, the one before aborted) when the caret is at the end of a word or after a space and no IME composition is
  under way; typing the letters the grey word shows uses it without asking again; a different letter, Backspace or a
  caret move clears it.
- **Keys**: Tab takes the word (and the next one becomes the grey word); → at the end of the text takes the word and
  the next; Esc hides until the next word. An open `@`/`/` menu keeps Tab and Esc; Shift+Tab keeps the permission
  mode; with nothing shown, Tab does what it did.
- **Docs**: the same grey text at the caret in a paragraph, through the editor's existing overlay; while a word
  suggestion shows, the AI "Suggest as I type" one waits.
- **Context**: chat: the agent's last reply (`useTimeline`, the streaming overlay); Docs: the text before the caret's
  paragraph.
- **Settings → Capabilities → Word suggestions**: the switch and the status (set-up progress, the LLM's state and why,
  the model: base or personalised, when it last learned, Retrain now, Forget my personal model), then every option.
  **How it's helping** (the keystrokes saved, the suggestions right; today, this week and the total folded; Reset the numbers).
