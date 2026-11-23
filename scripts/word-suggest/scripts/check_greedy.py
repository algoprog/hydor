"""Check the teacher-forced suggestion measure against real constrained greedy decoding (SPEC.md, Metrics).

For each word boundary of N examples and k = 0..2 typed characters, the evaluator says whether the suggestion is correct
by walking the gold tokens. Here the LLM really decodes: its state after the context and the gold tokens before the
word (KV cache / recurrent state, copied for each branch), then greedy decoding constrained to the typed bytes (any
tokenization of the word is allowed), unconstrained once they are typed, until the arg max starts with whitespace (or
is end-of-text). The suggestion is right if the produced word equals the gold word. Reports the agreement.

  nice -n 19 .venv/bin/python scripts/check_greedy.py --limit 50 --threads 4 --out runs/eval/check_greedy
"""
import argparse
import copy
import json
import os
import random
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import torch  # noqa: E402

from ws.evaluate import DEFAULT_LLM, EvalConfig, Evaluator, setup_env  # noqa: E402
from ws.textdata import add_data_args, load_examples  # noqa: E402


@torch.inference_mode()
def advance(model, ids, cache):
    """Feed ids (a list) after the cache; returns (last-position logits float32 [V], cache)."""
    out = model(input_ids=torch.tensor([ids]), past_key_values=cache, use_cache=True, logits_to_keep=1)
    return out.logits[0, -1].float(), out.past_key_values


def decode_word(llm, index, tb, logits, cache, R, max_steps=16):
    """Constrained greedy decoding from the state (logits = distribution of the next token, cache = state before it)."""
    produced = b""
    first = True
    cache = copy.deepcopy(cache)
    pad = llm._pad_mask
    for _ in range(max_steps):
        lg = logits.clone()
        if pad is not None:
            lg[pad] = float("-inf")
        if R:
            ids = index.allowed(R)
            t = int(ids[lg.index_select(0, ids).argmax()])
        else:
            if not first or produced:
                t_any = int(lg.argmax())
                if index.ends_word[t_any]:
                    break
            t = int(lg.masked_fill(~index.valid, float("-inf")).argmax())
        first = False
        b = tb[t]
        produced += b
        R = R[len(b):] if len(b) < len(R) else b""
        if not R and b[-1:] in (b" ", b"\n", b"\t", b"\r"):   # a token that carries the whitespace ending the word
            break
        logits, cache = advance(llm.model, [t], cache)
    return produced


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    add_data_args(ap)
    ap.set_defaults(limit=50)
    ap.add_argument("--fmt", default="plain", choices=["plain", "roles"])
    ap.add_argument("--llm", default=DEFAULT_LLM)
    ap.add_argument("--dtype", default="float32", help="float32 keeps the two computations numerically alike")
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--ks", default="0,1,2")
    ap.add_argument("--words-per-example", type=int, default=0, help="sample this many words per example (0 = all)")
    ap.add_argument("--out", default=None)
    a = ap.parse_args(argv)
    setup_env(a.threads)

    from transformers import AutoTokenizer
    from ws.scorers import LLMScorer, llm_vocab_size
    from ws.tokbytes import end_token_ids, token_bytes
    tok = AutoTokenizer.from_pretrained(a.llm)
    V = llm_vocab_size(a.llm)
    tb = token_bytes(tok, V)
    ev = Evaluator(tb, end_token_ids(tok, V), EvalConfig(), keep_details=True)
    llm = LLMScorer(a.llm, a.dtype, a.threads, a.fmt)
    exs = load_examples(tok, a.split, a.surface, a.ctx, a.limit, a.seed, a.lang, a.data, a.min_words)
    ks = [int(k) for k in a.ks.split(",")]
    rng = random.Random(a.seed)
    stat = {k: dict(n=0, agree=0, tf1_real0=0, tf0_real1=0) for k in ks}
    examples_out = []
    t0 = time.time()
    for ei, ex in enumerate(exs):
        lp = llm.logprobs(ex)
        ev.score(ex, lp)
        words = [w for w in ev.details if w["aligned"]]
        if a.words_per_example and len(words) > a.words_per_example:
            words = sorted(rng.sample(words, a.words_per_example), key=lambda w: w["a"])
        pre = llm.prefix_ids(ex)
        logits, cache = advance(llm.model, pre, None)
        pos = 0
        for w in words:
            if w["a"] > pos:
                logits, cache = advance(llm.model, list(ex.target_ids[pos:w["a"]]), cache)
                pos = w["a"]
            wb = w["word"].encode("utf-8")
            for k in ks:
                if k >= len(w["correct"]):
                    continue
                R = w["lead"] + w["word"][:k].encode("utf-8")
                out = decode_word(llm, ev.index, tb, logits, cache, R).strip()
                real, tf = out == wb, bool(w["correct"][k])
                s = stat[k]
                s["n"] += 1
                s["agree"] += int(real == tf)
                s["tf1_real0"] += int(tf and not real)
                s["tf0_real1"] += int(real and not tf)
                if real != tf and len(examples_out) < 200:
                    examples_out.append(dict(id=ex.id, word=w["word"], k=k, teacher_forced=tf,
                                             decoded=out.decode("utf-8", "replace"), conf=w["conf"][k]))
        print(f"# {ei + 1}/{len(exs)}  {time.time() - t0:.0f}s", file=sys.stderr, flush=True)
    tot = dict(n=sum(s["n"] for s in stat.values()), agree=sum(s["agree"] for s in stat.values()),
               tf1_real0=sum(s["tf1_real0"] for s in stat.values()), tf0_real1=sum(s["tf0_real1"] for s in stat.values()))
    lines = []
    for k, s in list(stat.items()) + [("all", tot)]:
        lines.append(dict(k=k, examples=len(exs), n=s["n"], agreement=s["agree"] / max(s["n"], 1),
                          teacher_right_decode_wrong=s["tf1_real0"], teacher_wrong_decode_right=s["tf0_real1"],
                          dtype=a.dtype, seconds=time.time() - t0))
        print(json.dumps(lines[-1]), flush=True)
    if a.out:
        os.makedirs(a.out, exist_ok=True)
        with open(os.path.join(a.out, "metrics.jsonl"), "w") as f:
            for l in lines:
                f.write(json.dumps(l) + "\n")
        with open(os.path.join(a.out, "disagreements.jsonl"), "w") as f:
            for l in examples_out:
                f.write(json.dumps(l, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
