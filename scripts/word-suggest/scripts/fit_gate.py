"""Fit the mixing gate (SPEC.md Scorers) on dev positions and compare it with fixed lambda.

  nice -n 19 .venv/bin/python scripts/fit_gate.py --split dev --surface chat --llm Qwen/Qwen3.5-0.8B-Base \
      --slm runs/slm/xyz/best.pt --limit 300 --out runs/gate/xyz.json

Collects, for every target position of the dev examples, the gate features (entropy and max probability of the LLM and
of the SLM, P_slm(<unk>), log(1 + position), word-start flag) and the log-probability each model gives the gold token;
fits w, b by LBFGS to maximise the mean log of the mixed probability of the gold token; saves JSON (--out); prints the
dev log-likelihood (nats per token, higher is better) of the LLM alone, the SLM alone, fixed lambda in a grid, the gate
fitted on all positions, and the gate fitted on the even examples and scored on the odd ones (and the reverse), which
is the honest comparison with a fixed lambda chosen the same way.

Language-aware options (for surfaces with many languages, e.g. FLORES-200):
  --per-lang        also fit one bias per language code (ex.lang), jointly with the shared weights, L2-regularised towards 0 with
                    the strength --lang-l2 (in positions: see ws/mix.py fit_gate; larger = closer to the shared gate); saved in
                    the --out JSON ("lang_bias"), which `llm+slm:gate:<json>` then uses with ex.lang. A language not seen in
                    fitting gets bias 0. Prints the held-out log-likelihood (two folds by example) of the shared and of the
                    per-language gate.
  --out-global F    also write the shared gate without biases (the same pass), to compare with the per-language one.
  --lang-switch     for each language pick, on the same examples, the LLM alone or the shared gate, whichever has the higher
                    acc@1 (a tie goes to the LLM), and save the choice per language (with the shared gate) to --out-switch F,
                    the JSON of the variant `llm+slm:langswitch:F`. Costs a second pass over the examples (the shared gate
                    has to be fitted before the mixed rows can be scored).
"""
import argparse
import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import torch  # noqa: E402

from ws import mix  # noqa: E402
from ws.evaluate import DEFAULT_LLM, Scorers, parse_variant, setup_env  # noqa: E402
from ws.textdata import add_data_args, load_examples  # noqa: E402
from ws.tokbytes import word_start_flags  # noqa: E402


def switch_pass(a, g, tok, tb, sc, var, exs, other):
    """--lang-switch: acc@1 of the LLM alone and of the shared gate on every language of the examples; the better one per
    language (a tie: the LLM) goes into the --out-switch JSON together with the shared gate."""
    from ws.evaluate import EvalConfig, Evaluator
    from ws.tokbytes import end_token_ids
    V = len(tb)
    ev = Evaluator(tb, end_token_ids(tok, V), EvalConfig(), device=str(sc.device))
    hits: dict = {}
    t0 = time.time()
    for i, ex in enumerate(exs):
        try:
            r = sc.rows(ex, [var])
        except torch.OutOfMemoryError:             # a very long example on a capped GPU: free what is cached and try once more
            torch.cuda.empty_cache()
            r = sc.rows(ex, [var])
        lp_mix = mix.gate(r["llm"], r[other + "+"], g, r.get("unk:" + other), word_start_flags(tb, ex.target_ids))
        h = hits.setdefault(ex.lang, dict(llm=[0, 0], mix=[0, 0]))
        for name, lp in (("llm", r["llm"]), ("mix", lp_mix)):
            c = ev.score(ex, lp)
            h[name][0] += c.get("acc_hit@1", 0)
            h[name][1] += c.get("acc_n@1", 0)
        if (i + 1) % 20 == 0:
            print(f"# switch pass {i + 1}/{len(exs)} {time.time() - t0:.0f}s", file=sys.stderr, flush=True)
    base = mix.Gate.load(a.switch_base) if a.switch_base else None
    choice, rows, evidence = (dict(base.switch) if base else {}), [], {}
    for lang, h in sorted(hits.items()):
        n = max(h["llm"][1], 1)
        al, am = h["llm"][0] / n, h["mix"][0] / n
        if h["llm"][1] >= a.switch_min_words:
            choice[lang] = "mix" if am > al else "llm"
        rows.append((lang, al, am))
        evidence[lang] = [h["llm"][1], round(al, 4), round(am, 4), choice.get(lang, "default") if h["llm"][1] >= a.switch_min_words else "kept"]
    g.switch, g.switch_default = choice, (base.switch_default if base else "mix")
    g.meta = dict(g.meta, lang_switch=True, switch_criterion="acc@1 on the fitting examples, a tie goes to the LLM",
                  switch_base=os.path.basename(a.switch_base) if a.switch_base else None, switch_min_words=a.switch_min_words,
                  switch_evidence=evidence)
    os.makedirs(os.path.dirname(os.path.abspath(a.out_switch)), exist_ok=True)
    g.save(a.out_switch)
    tot = sum(h["llm"][1] for h in hits.values())
    best = sum(h[choice[l]][0] for l, h in hits.items())
    print(json.dumps(dict(summary="language switch", languages=len(choice), use_mix=sum(v == "mix" for v in choice.values()),
                          use_llm=sum(v == "llm" for v in choice.values()), words=tot,
                          acc1_llm=sum(h["llm"][0] for h in hits.values()) / max(tot, 1),
                          acc1_mix=sum(h["mix"][0] for h in hits.values()) / max(tot, 1),
                          acc1_switch_on_fit_data=best / max(tot, 1), saved=a.out_switch,
                          per_language={l: [round(x, 4), round(y, 4)] for l, x, y in rows})), flush=True)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    add_data_args(ap, plain_split=True)
    ap.set_defaults(split="dev")
    ap.add_argument("--fmt", default="plain", choices=["plain", "roles"])
    ap.add_argument("--llm", default=DEFAULT_LLM)
    ap.add_argument("--dtype", default="bfloat16")
    ap.add_argument("--slm", default="none", help="one SLM checkpoint")
    ap.add_argument("--ngram", default="none", help="or an n-gram model")
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--device", default="cpu", help="cpu | cuda | cuda:N (cuda: .venv-gpu; WS_GPU_MEM_GB caps the memory)")
    ap.add_argument("--l2", type=float, default=1e-3)
    ap.add_argument("--extra", default=None, metavar="SURFACE:LIMIT[,..]", help="more examples fitted together with --surface's (same --split, --ctx, "
                    "--seed): each SURFACE with its own --limit, e.g. flores:15 to fit on FLORES dev as well")
    ap.add_argument("--dump-features", default=None, metavar="FILE", help="save the positions' features and gold log-probs (torch file) after collecting them")
    ap.add_argument("--features-in", default=None, metavar="FILE", help="fit from a --dump-features file instead of running the models (no --lang-switch)")
    ap.add_argument("--sources", default=None, help="with --features-in: only the positions of these sources (a comma list of surface or record source, e.g. wildchat:dev)")
    ap.add_argument("--langs", default=None, help="with --features-in: only the positions of these languages (comma list of codes)")
    ap.add_argument("--lambdas", default="0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9")
    ap.add_argument("--out", required=True, help="gate JSON to write (with --per-lang: with the language biases)")
    ap.add_argument("--per-lang", action="store_true", help="add a bias per language to the gate")
    ap.add_argument("--lang-l2", type=float, default=10.0, help="strength of the pull of every language bias to 0, in positions")
    ap.add_argument("--out-global", default=None, help="also write the shared gate (no language biases) here")
    ap.add_argument("--lang-switch", action="store_true", help="per language: the LLM alone or the mix, by acc@1 on these examples")
    ap.add_argument("--out-switch", default=None, help="JSON of the language switch (needs --lang-switch)")
    ap.add_argument("--switch-base", default=None, metavar="JSON", help="a switch to start from: only the languages with at least --switch-min-words "
                    "scored words here are decided again, every other language keeps its choice there (and its default)")
    ap.add_argument("--switch-min-words", type=int, default=0, help="a language with fewer scored words than this is not decided (it keeps --switch-base's "
                    "choice, or the default 'mix')")
    a = ap.parse_args(argv)
    if a.features_in and a.lang_switch:
        raise SystemExit("--lang-switch needs the models: run it without --features-in")
    if a.lang_switch and not a.out_switch:
        raise SystemExit("--lang-switch needs --out-switch")
    if a.features_in:
        d = torch.load(a.features_in)
        if "ids" in d:                      # the email surfaces share a name: tell Enron and Sinabis by the record id
            d["SRC"] = [x if x != "email" else ("sinabis" if "sinabis" in d["ids"][e] else "enron") for x, e in zip(d["SRC"], d["EX"].tolist())]
        keep = torch.ones(len(d["F"]), dtype=torch.bool)
        if a.sources:
            keep &= torch.tensor([s in a.sources.split(",") for s in d["SRC"]])
        if a.langs:
            keep &= torch.tensor([l in a.langs.split(",") for l in d["LANG"]])
        idx = keep.nonzero().squeeze(1).tolist()
        F, GL, GS, EX = d["F"][keep], d["GL"][keep], d["GS"][keep], d["EX"][keep]
        LANG = [d["LANG"][i] for i in idx]
        SRC = [d["SRC"][i] for i in idx]
        kept_ex = sorted(set(EX.tolist()))
        remap = {e: i for i, e in enumerate(kept_ex)}
        EX = torch.tensor([remap[e] for e in EX.tolist()])
        NBYTES = [d["NBYTES"][e] for e in kept_ex]
        other = "slm"
        exs = [None] * len(kept_ex)
        a.slm = a.slm if a.slm.lower() != "none" else d.get("slm", "none")
    else:
        setup_env(a.threads)
        from ws.gpu import setup_device
        device = setup_device(a.device)

        from transformers import AutoTokenizer
        from ws.scorers import llm_vocab_size
        from ws.tokbytes import token_bytes, word_start_flags
        tok = AutoTokenizer.from_pretrained(a.llm)
        tb = token_bytes(tok, llm_vocab_size(a.llm))
        other = "slm" if a.slm.lower() != "none" else "ngram"
        sc = Scorers(a.llm, a.slm, a.ngram, a.dtype, a.threads, a.fmt, device=str(device))
        var = parse_variant(f"llm+{other}:linear:0.5")
        sc.check([var])
        exs = load_examples(tok, a.split, a.surface, a.ctx, a.limit, a.seed, a.lang, a.data, a.min_words, plain_split=a.plain_split)
        for part in (a.extra.split(",") if a.extra else []):
            surf, lim = part.split(":")
            exs += load_examples(tok, a.split, surf, a.ctx, int(lim), a.seed, a.lang, a.data, a.min_words)
        if not exs:
            raise SystemExit("no examples")

        F, GL, GS, EX, NBYTES, LANG, SRC = [], [], [], [], [], [], []
        t0 = time.time()
        for i, ex in enumerate(exs):
            r = sc.rows(ex, [var])
            llm_lp, slm_lp, unk = r["llm"], r[other + "+"], r.get("unk:" + other)
            feats = mix.gate_features(llm_lp, slm_lp, unk, word_start_flags(tb, ex.target_ids))[:-1]
            n = len(ex.target_ids)
            idx = torch.arange(n, device=llm_lp.device)
            gold = torch.tensor(ex.target_ids, device=llm_lp.device)
            F.append(feats.cpu())
            GL.append(llm_lp[idx, gold].cpu())
            GS.append(slm_lp[idx, gold].cpu())
            EX.append(torch.full((n,), i))
            LANG.extend([ex.lang] * n)
            SRC.extend([(ex.meta or {}).get("source") or ex.surface] * n)
            NBYTES.append(len(ex.target.encode("utf-8")))
            if (i + 1) % 20 == 0:
                print(f"# {i + 1}/{len(exs)} {time.time() - t0:.0f}s", file=sys.stderr, flush=True)
        F, GL, GS, EX = torch.cat(F), torch.cat(GL), torch.cat(GS), torch.cat(EX)
        if a.dump_features:
            os.makedirs(os.path.dirname(os.path.abspath(a.dump_features)), exist_ok=True)
            torch.save(dict(F=F, GL=GL, GS=GS, EX=EX, LANG=LANG, SRC=SRC, NBYTES=NBYTES, slm=a.slm, llm=a.llm,
                            ids=[e.id for e in exs]), a.dump_features)
    N = len(F)
    nb = torch.tensor(NBYTES, dtype=torch.double)

    def stats(name, lp_mixed, mask=None):
        m = torch.ones(N, dtype=torch.bool) if mask is None else mask
        v = lp_mixed[m].double()
        bits = -v.sum() / math.log(2)
        nbytes = nb[torch.unique(EX[m])].sum()
        row = dict(model=name, ll_nats_per_token=float(v.mean()), bpb=float(bits / nbytes), positions=int(m.sum()))
        print(json.dumps(row), flush=True)
        return row

    stats("llm", GL)
    stats(f"{other}", GS.clamp_min(-60))
    best = None
    for lam in [float(x) for x in a.lambdas.split(",")]:
        row = stats(f"fixed_lambda_{lam:g}", torch.logaddexp(GL + math.log(lam), GS.clamp_min(-60) + math.log1p(-lam)))
        if best is None or row["ll_nats_per_token"] > best[1]:
            best = (lam, row["ll_nats_per_token"])
    g = mix.fit_gate(F, GL, GS, a.l2)
    g.meta = dict(llm=a.llm, other=a.slm if other == "slm" else a.ngram, split=a.split, surface=a.surface, ctx=a.ctx,
                  fmt=a.fmt, positions=N, examples=len(exs), l2=a.l2, best_fixed_lambda=best[0])
    if a.features_in:
        g.meta.update(features_in=os.path.basename(a.features_in), sources=a.sources, langs=a.langs)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    if a.out_global:
        os.makedirs(os.path.dirname(os.path.abspath(a.out_global)), exist_ok=True)
        g.save(a.out_global)
    gl = torch.logaddexp(GL + torch.log(g.lam(F).double().float()), GS.clamp_min(-60) + torch.log1p(-g.lam(F)))
    stats("gate_fit_on_all (optimistic)", gl)
    groups: dict = {}
    for i, key in enumerate(zip(SRC, LANG)):
        groups.setdefault(key, []).append(i)
    for key, ix in sorted(groups.items(), key=lambda kv: -len(kv[1])):
        if len(ix) < 3000:
            break
        ix = torch.tensor(ix)
        print(json.dumps(dict(group=list(key), positions=len(ix), llm=float(GL[ix].mean()), slm=float(GS[ix].clamp_min(-60).mean()),
                              gate=float(gl[ix].double().mean()),
                              fixed_0_5=float(torch.logaddexp(GL[ix] + math.log(0.5), GS[ix].clamp_min(-60) + math.log(0.5)).mean()))), flush=True)
    gp = None
    if a.per_lang:
        gp = mix.fit_gate(F, GL, GS, a.l2, langs=LANG, lang_l2=a.lang_l2)
        gp.meta = dict(g.meta, per_lang=True, lang_l2=a.lang_l2, languages=len(gp.lang_bias))
        gp.save(a.out)
        bias = torch.tensor([gp.lang_bias[l] for l in LANG], dtype=torch.float)
        lamp = torch.sigmoid(((F - torch.tensor(gp.mu)) / torch.tensor(gp.sd)) @ torch.tensor(gp.w) + gp.b + bias)
        stats("per_lang_gate_fit_on_all (optimistic)",
              torch.logaddexp(GL + torch.log(lamp), GS.clamp_min(-60) + torch.log1p(-lamp)))
    else:
        g.save(a.out)
    # two folds by example: fit on one half, score on the other; fixed lambda is chosen on the same fitting half
    even = (EX % 2 == 0)
    res = {"gate": [], "fixed": [], "perlang": []}
    for fit_m, test_m in ((even, ~even), (~even, even)):
        gg = mix.fit_gate(F[fit_m], GL[fit_m], GS[fit_m], a.l2)
        lam_of = lambda k: torch.logaddexp(GL + math.log(k), GS.clamp_min(-60) + math.log1p(-k))
        kbest = max((float(x) for x in a.lambdas.split(",")), key=lambda k: float(lam_of(k)[fit_m].mean()))
        lg = torch.logaddexp(GL + torch.log(gg.lam(F)), GS.clamp_min(-60) + torch.log1p(-gg.lam(F)))
        res["gate"].append(float(lg[test_m].double().mean()) * int(test_m.sum()))
        if a.per_lang:
            lang_l = [l for l, m in zip(LANG, fit_m.tolist()) if m]
            gq = mix.fit_gate(F[fit_m], GL[fit_m], GS[fit_m], a.l2, langs=lang_l, lang_l2=a.lang_l2)
            bq = torch.tensor([gq.lang_bias.get(l, 0.0) for l in LANG], dtype=torch.float)
            lq = torch.sigmoid(((F - torch.tensor(gq.mu)) / torch.tensor(gq.sd)) @ torch.tensor(gq.w) + gq.b + bq)
            lpq = torch.logaddexp(GL + torch.log(lq), GS.clamp_min(-60) + torch.log1p(-lq))
            res["perlang"].append(float(lpq[test_m].double().mean()) * int(test_m.sum()))
        res["fixed"].append(float(lam_of(kbest)[test_m].double().mean()) * int(test_m.sum()))
    summary = dict(summary="held-out (2 folds by example)", gate_ll=sum(res["gate"]) / N, fixed_lambda_ll=sum(res["fixed"]) / N,
                   best_fixed_lambda_on_all=best[0], llm_ll=float(GL.mean()), saved=a.out,
                   gate_w={n: round(w, 4) for n, w in zip(mix.FEATURES, g.w)}, gate_b=round(g.b, 4))
    if a.per_lang:
        summary.update(per_lang_gate_ll=sum(res["perlang"]) / N, lang_l2=a.lang_l2, languages=len(gp.lang_bias),
                       lang_bias_range=[round(min(gp.lang_bias.values()), 3), round(max(gp.lang_bias.values()), 3)])
    print(json.dumps(summary), flush=True)
    if a.lang_switch:
        switch_pass(a, g, tok, tb, sc, var, exs, other)


if __name__ == "__main__":
    main()
