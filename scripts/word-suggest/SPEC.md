# Word suggestions: experiment spec

Goal: inline next-word and current-word suggestions for Hydor (ghost text after the caret; Tab accepts one word;
the next word shown dimmer). Prediction mixes a large model (LLM, at most 0.8B parameters, 8 or 4 bits at run time)
with a small model (SLM, a few M to ~100M parameters) trained on this computer from the user's own data, with the
user's own writing weighted higher. When memory is short, the SLM runs alone. Everything here is CPU only.

## Ground rules (every script)
- CPU only: `CUDA_VISIBLE_DEVICES=""` (the venv's torch is the CPU build), run under `nice -n 19`.
- Threads: `torch.set_num_threads(N)` from `--threads` (default 4, never more than 8).
- Python: the environment of README.md (the scripts' own examples call it `.venv/bin/python`). Code in `ws/` (a package), scripts in `scripts/`.
- The data is private: it stays in this folder's `data/` (`.gitignore` keeps it out of git). Never send it anywhere.
- Metrics: print one JSON object per line with numeric fields (Hydor's Experiments reads them), and write the same
  to `--out <dir>/metrics.jsonl`; per-example scores to `<dir>/scores.jsonl` ({"id": ..., "<metric>": number}).

## Data (written by data/extract.py, read by everything else)
- `data/user_msgs.jsonl`: messages the user typed. Fields: `id`, `session`, `agent`, `source`, `ts` (ms),
  `split` ("train" | "dev" | "test"), `lang` ("en", "el", "zh", "de", ... or "other"), `text` (typed text only:
  pasted blocks and injected context removed), `prev_agent` (the agent's last reply before it in the session, full
  text, "" if none), `prev_user` (list of the user's earlier typed messages in the session, oldest first).
- `data/agent_texts.jsonl`: agents' prose replies: `id`, `session`, `ts`, `split`, `text`.
- `data/other_texts.jsonl`: notes, docs, wiki, knowledge, pages: `id`, `source`, `ts`, `split`, `author`
  ("user" | "agent" | "unknown"), `text`.
- `data/split.json`: the time boundaries and counts. `data/multi/<lang>.jsonl`: public text in other languages
  (`id`, `lang`, `text`, paragraphs), test only.

## Tokens
- The LLM's own tokenizer is the only tokenizer (default LLM: `Qwen/Qwen3.5-0.8B-Base`).
- The SLM uses a projection of it (`ws/vocab.py`): the LLM token ids seen at least `min_count` times in the SLM's
  training data, plus specials `<unk> <bos> <eos> <agent> <user> <doc>`. `llm2slm[V_llm]` maps any LLM id to its SLM
  id or `<unk>`; `slm2llm[V_sub]` maps back (specials map to -1).
- Token bytes: a helper returns each LLM token's exact bytes (byte-level BPE: invert `bytes_to_unicode`;
  SentencePiece: `▁` is a space, `<0xNN>` is one byte). Special/control tokens have no bytes and are never suggested.
- A target is tokenized alone: `target_ids = tok(target, add_special_tokens=False)`, with offsets. A model's input is
  its context ids followed by these exact ids (concatenate ids, never re-tokenize the joined string), so every scorer
  predicts the same target positions.

## Examples and context (where the user is decides the context)
`ws/textdata.py` builds `Example(id, surface, lang, agent_ctx, user_ctx, doc_ctx, target, target_ids, offsets)`.
- chat: `agent_ctx` = the last A words of `prev_agent` (A=100); `user_ctx` = the user's earlier typed words in the
  session, most recent last, so that typed context is at most T=100 words in all (T counts the words of the target
  already typed, so a long target leaves less room); `target` = the message.
- doc: `doc_ctx` = the last D=100 words before the target in the document; `target` = the next paragraph.
- plain (multilingual tests): `doc_ctx` = the previous paragraph's last 100 words.
- Targets longer than 100 words are cut into segments of up to 100 words; each segment's `user_ctx`/`doc_ctx` is the
  previous 100 words of the same text, so no position sees more than the budget.
- Context switches for experiments: `--ctx none|agent|agent+user` and `--fmt plain|roles`.
  LLM prefix, plain: the context parts joined by `\n\n`, then `\n\n`. Roles: `Assistant: <agent>\n\nUser: <user
  ctx>\n\nUser: ` (a part left out when empty; doc: `Document: <doc>\n\n`). The prefix ends right before the target.
  SLM prefix: `<bos> <agent> agent ids <user> user ctx ids <user>` (doc: `<bos> <doc> doc ids <doc>`).

## Scorers (`ws/scorers.py`)
`scorer.logprobs(ex) -> torch.float32 [len(target_ids) + 1, V_llm]`: row i is log P(next token) before target token
i; the last row is the position after the target (used to check that a word ends). Implementations:
- `LLMScorer(name, dtype, threads)`: HF `AutoModelForCausalLM` on CPU, one forward over prefix+target with
  `logits_to_keep=len(target_ids)+1`.
- `SLMScorer(ckpt, vocab, mode)`: SLM log-probs over V_sub mapped to V_llm. `mode="alone"`: tokens outside V_sub get
  -inf. `mode="with_llm"`: the SLM's `<unk>` mass is spread over the tokens outside V_sub in proportion to the
  LLM's probabilities (given the LLM's row), so the result is a full distribution.
- `NgramScorer`: token-level interpolated Kneser-Ney (order 4) on SLM ids, same output contract as SLMScorer.
- Mixtures (`ws/mix.py`): `linear(λ)`: λ·P_llm + (1-λ)·P_slm; `loglinear(α)`: softmax(α·log P_llm + (1-α)·log
  P_slm); `gate`: λ per position = sigmoid(w·f + b) with f = [entropy and max prob of each, P_slm(<unk>),
  log(1 + position in target), word-start flag], w fitted on dev positions by maximising the log of the mixed
  probability of the gold token (LBFGS).

## Metrics (`ws/evaluate.py`): exact definitions
Words are the target's maximal non-whitespace runs. A word's gold path is the target tokens from the one holding its
first character (with the space or newline before it when the tokenizer joins them) to the one holding its last.
A word whose tokens straddle another word is skipped and counted (`unaligned`).
For word j and typed prefix length k (0..len(word)-1), with R = the bytes the tokens must still match (the joined
whitespace, if part of the first token, plus the first k characters), walk the gold path s = 1..m at its rows:
- allowed set A_s: every token if R is empty; else tokens whose bytes start with R, plus tokens whose bytes are a
  proper prefix of R (found with a sorted byte list and bisect, plus a dict lookup for the prefixes).
- the step is right if the gold token is the arg max over A_s; p_s = P(gold)/sum over A_s of P; R shrinks by the
  gold token's bytes (or empties once covered).
- after the last token, the word must end: the arg max of the next row (unconstrained) starts with whitespace, or
  is the end-of-text token; for the target's last word use the extra row.
The suggestion at (j,k) is correct if every step and the end check are right (greedy decoding constrained to the
typed letters, measured along the gold path: a different tokenization of the same word counts as wrong; check this
approximation on 50 examples by real constrained greedy decoding and report the agreement).
Confidence c(j,k) = product of p_s up to the first wrong step, times the arg max's probability there (an upper
bound for wrong suggestions).
- `acc@k` for k = 0, 1, 2, 3: correct suggestions over words longer than k. `acc@0` after the first word is the
  dimmed next word's accuracy.
- Keystroke simulation at threshold τ: every character costs one key. For each word the user takes the first k with
  a correct suggestion and c ≥ τ: they press Tab (1 key), which types the rest of the word and, if the next character
  is a single space, that space too. Shown = suggestions with c ≥ τ at every k up to the taken one (all k if none).
  `ksr@τ` = keys saved / characters; `prec@τ` = correct shown / shown; `cov@τ` = shown / chances.
  Report τ in {0, .1, .2, .3, .4, .5, .6, .7} and the best ksr with prec ≥ 0.5.
- `bpb`: sum of -log2 P(gold) over target tokens / UTF-8 bytes of the targets. `nll`: mean nats per target token.
- Report everything overall, per surface and per language; and the example count, word count, unaligned count.

## Experiments
- E1, LLM and context: LLM alone on the chat test set with ctx none / agent / agent+user and fmt plain / roles;
  LLMs: Qwen3.5-0.8B-Base, Qwen3-0.6B-Base, LFM2.5-350M-Base, gemma-3-270m (if downloadable); multilingual
  test sets (bpb, acc@0; zh: next-character accuracy).
- E2, quantization (llama.cpp): bf16 vs Q8_0 vs Q4_K_M: KL divergence and same-top-token rate vs bf16, size, memory,
  speed at 4 and 8 threads, and the cost of the operations the feature needs.
- E3, SLM: LFM-like hybrid vs plain transformer at about 5M, 15M, 30M parameters (and a larger one if it keeps
  helping), user weight 1 / 4 / 16, n-gram baseline; alone and mixed with the LLM.
- E4, mixing: linear (λ grid), loglinear (α grid), gate; per surface.
- E5, keeping it current: over the test days, frozen vs daily continued training (with replay) vs per-message
  updates; quality and CPU seconds per update.
- E6, cost: SLM training tokens/s and inference latency at 1, 2, 4 threads; memory of each mode.

## Round 2 (19 November): three follow-ups
- E7, a multilingual base for the SLM: pretrain the lfm "15m" body (d=256, 8 layers, kernel 3) once on public text
  (web text in en, el, de, zh, es, fr plus multilingual assistant chats, in the SLM's own `<doc>` / `<agent>` /
  `<user>` formats), with a multilingual SLM vocabulary (the most frequent LLM tokens of that corpus plus every token
  seen 3 times in the local train split). Then personalise it on the local train split exactly as before (user
  weight 4). Compare base only, base + personalised, and the from-scratch lfm15m_w4: alone and mixed (gate fitted per
  model on dev), on the chat test set and on the plain multilingual sets. Plain sets split by paragraph: even `idx`
  = dev (gates), odd `idx` = test. Public text must not contain the multilingual test paragraphs.
- E8, a learned show filter: for every chance (word j, letters typed k) of a variant, record features known at that
  moment without the gold word: the suggestion's confidence c; inside the allowed set at the first step: the top
  probability, the second, their margin, the entropy, log of the allowed set's size, the top token's byte length;
  k; j; whether the previous word was predicted right at k=0; for mixes, the LLM-alone and SLM-alone top tokens'
  agreement inside the allowed set and the gate's λ. Label: the suggestion is right. Fit on dev chances, apply on
  test: show when the filter's score ≥ θ. Same keystroke simulation (Tab on the first shown right suggestion) and
  precision; compare keystrokes saved at precision 0.3, 0.4 and 0.5 against thresholding c, with paired bootstrap.
- E9, a session cache: a token cache of the session's earlier text (every earlier agent reply in the session, the
  user's earlier messages, and the target's own earlier tokens as they are typed); for documents, the document's
  text before the target. P_cache = interpolated bigram/unigram over the cache (zero outside it). Mixed on top of a
  variant: P = (1 - μ)·P_variant + μ·P_cache, μ = sigmoid(a + b·log(1 + cache tokens) + c·[previous token seen in
  the cache]), fitted on dev by log-likelihood. Report every metric with and without it, chat and doc.
