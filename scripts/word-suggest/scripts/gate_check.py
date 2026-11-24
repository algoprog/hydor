"""Teacher-forced next-word accuracy (acc@1) and log-likelihood of the LLM alone, the small model alone and the mix through each of several gates,
on the examples of a surface (scripts/fit_gate.py's switch pass, but with gates that are already fitted). Aggregates only.

  python scripts/gate_check.py --split test --surface messages --limit 0 --llm Qwen/Qwen3.5-0.8B-Base --slm CKPT \
      --gates flores=runs/gate/flores_pre50b_30m_cmix_global.json,typed=runs/typedgate/pilot_typed_global.json --device cuda
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import torch  # noqa: E402

from ws import mix  # noqa: E402
from ws.evaluate import DEFAULT_LLM, EvalConfig, Evaluator, Scorers, parse_variant, setup_env  # noqa: E402
from ws.textdata import add_data_args, load_examples  # noqa: E402
from ws.tokbytes import end_token_ids, token_bytes, word_start_flags  # noqa: E402


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    add_data_args(ap)
    ap.add_argument("--llm", default=DEFAULT_LLM)
    ap.add_argument("--slm", required=True)
    ap.add_argument("--gates", required=True, help="label=gate.json,label=gate.json")
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--device", default="cpu")
    a = ap.parse_args(argv)
    setup_env(a.threads)
    from ws.gpu import setup_device
    device = setup_device(a.device)
    from transformers import AutoTokenizer
    from ws.scorers import llm_vocab_size
    tok = AutoTokenizer.from_pretrained(a.llm)
    V = llm_vocab_size(a.llm)
    tb = token_bytes(tok, V)
    sc = Scorers(a.llm, a.slm, "none", "bfloat16", a.threads, "plain", device=str(device))
    var = parse_variant("llm+slm:linear:0.5")
    sc.check([var])
    gates = {k: mix.Gate.load(v) for k, v in (x.split("=", 1) for x in a.gates.split(","))}
    exs = load_examples(tok, a.split, a.surface, a.ctx, a.limit, a.seed, a.lang, a.data, a.min_words)
    ev = Evaluator(tb, end_token_ids(tok, V), EvalConfig(), device=str(sc.device))
    acc = {k: [0, 0, 0.0, 0] for k in ["llm", "slm", *gates]}          # hits, words, log-lik sum, tokens
    for ex in exs:
        r = sc.rows(ex, [var])
        llm_lp, slm_lp = r["llm"], r["slm+"]
        ws = word_start_flags(tb, ex.target_ids)
        rows = {"llm": llm_lp, "slm": slm_lp}
        for k, g in gates.items():
            rows[k] = mix.gate(llm_lp, slm_lp, g, r.get("unk:slm"), ws)
        gold = torch.tensor(ex.target_ids, device=llm_lp.device)
        idx = torch.arange(len(ex.target_ids), device=llm_lp.device)
        for k, lp in rows.items():
            c = ev.score(ex, lp)
            acc[k][0] += c.get("acc_hit@1", 0)
            acc[k][1] += c.get("acc_n@1", 0)
            acc[k][2] += float(lp[idx, gold].clamp_min(-60).sum())
            acc[k][3] += len(ex.target_ids)
    for k, (h, n, ll, t) in acc.items():
        print(json.dumps(dict(surface=a.surface, split=a.split, model=k, acc1=round(h / max(n, 1), 4), words=n, ll_per_token=round(ll / max(t, 1), 4))), flush=True)


if __name__ == "__main__":
    main()
