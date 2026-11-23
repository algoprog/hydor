"""E8: a learned "show or not" filter on top of a variant's suggestions (SPEC.md, Round 2).

  # 1. the chances of a variant on dev and on test (scripts/eval.py; the test run also writes the metrics to check against)
  nice -n 19 .venv/bin/python scripts/eval.py --split dev  --surface chat --llm Qwen/Qwen3.5-0.8B-Base --slm CKPT \
      --variants V --dump-events V --events-out runs/e8/dev.jsonl --out runs/e8/dev_eval --threads 2
  nice -n 19 .venv/bin/python scripts/eval.py --split test --surface chat ... --out runs/e8/test_eval
  # 2. fit on dev, apply on test
  nice -n 19 .venv/bin/python scripts/show_filter.py --dev runs/e8/dev.jsonl --test runs/e8/test.jsonl \
      --check-metrics runs/e8/test_eval/metrics.jsonl --variant V --out runs/e8/filter

Fits a logistic regression (standardised features) and a HistGradientBoosting classifier on the dev chances (label: the
suggestion is right) and, on the test events, runs the keystroke simulation of SPEC.md with "show when the score >= theta"
(theta over 300 quantiles of the test scores). The baseline is the same simulation thresholding the confidence c; at the taus of
scripts/eval.py it must reproduce that script's ksr, prec and cov for the variant (--check-metrics compares them and stops
when they differ).

Reported per scorer (baseline c, lr, hgb) and precision p in 0.3, 0.4, 0.5:
  ksr_p   the most keystrokes saved (share of the characters) over theta with precision >= p, theta chosen on the test
          events as ksr_best does (the same advantage for each scorer); paired bootstrap 95% interval over test examples
          (the best theta is chosen again in every resample) and the paired difference from the baseline;
  dev_p   theta chosen on the dev events (best ksr with dev precision >= p), applied to the test events: the honest figure;
          with its test precision and coverage.
--compare-real a.jsonl b.jsonl c.jsonl --labels llm,mix,slm: the true-c thresholds of several real-decoded event files of the
same examples, ksr at the precisions with paired bootstrap intervals of each difference against the first file (rows tagged
compare_real: pooled over all examples). When the events hold several languages (FLORES): also per language (tag per_language, in
metrics.jsonl only), at the threshold each file's pooled curve picks for that precision, with the per-language difference against the
first file, and per_language_mean rows: the mean over languages, its bootstrap interval (examples resampled within each language),
the mean difference against the first file with its interval, and how many languages are better / worse / equal.
With --dev-real / --test-real (scripts/real_chances.py): the same on really decoded suggestions, see real_comparison().
Also written to <out>: metrics.jsonl, lr.joblib, hgb.joblib, weights.json (the logistic regression's weights in standardised
units and the HGB permutation importances (test events, log loss)).

The features are those of the dump (scripts/eval.py): c, top, second, margin, ent, logn, toplen, k, j, prev and, for mixes,
agree and lam. The logistic regression also gets logit(c) and logit(top) since probabilities are not linear in them. c is the
harness's confidence, measured along the gold path: for a wrong suggestion it is the probability up to the first wrong step times
the arg max's there, so c equals `top` exactly when the first step was already wrong and is smaller when the first step was right.
A filter that sees c and top can read the label off that gap (found in the smoke test: it more than doubled the gain), so by
default the filters are fitted WITHOUT c (and logit(c)); `--with-c` adds it back (a leaky upper bound, for comparison only). The
baseline is always c, as in scripts/eval.py. A gold-free comparison is also reported: the same simulation thresholding `top`
(the first step's top probability). Remaining caveat: at k = 0 the harness joins the space before a word into its first token
only when the gold word starts with a letter (a digit or punctuation gets a separate space token), so logn (the allowed set's
size) at k = 0 hints at that.
"""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np  # noqa: E402

from ws.evaluate import TAUS  # noqa: E402

MODELS = ("c", "top", "lr", "hgb")       # c: the baseline (eval.py), top: gold-free first-step probability
BASE = ["c", "top", "second", "margin", "ent", "logn", "toplen", "k", "j", "prev", "agree", "lam"]


def read_events(path):
    chances, exs = [], {}
    with open(path) as f:
        for line in f:
            r = json.loads(line)
            if r["t"] == "e":
                exs[r["id"]] = r
            else:
                chances.append(r)
    return chances, exs


class Events:
    """Chances sorted by (example, word, k) with the arrays the simulation needs."""

    def __init__(self, path, no_c=False, names=None):
        ch, exs = read_events(path)
        ch.sort(key=lambda r: (r["id"], r["j"], r["k"]))
        self.ids = sorted(exs)
        eix = {i: n for n, i in enumerate(self.ids)}
        self.n_ex = len(self.ids)
        self.chars = np.array([exs[i]["chars"] for i in self.ids], dtype=np.float64)
        self.lang = np.array([exs[i].get("lang", "") for i in self.ids])
        self.names = list(names) if names else [f for f in BASE if f in ch[0] and not (no_c and f == "c")] if ch else []
        self.X = np.array([[r[f] for f in self.names] for r in ch], dtype=np.float64).reshape(len(ch), len(self.names))
        self.c = np.array([r["c"] for r in ch], dtype=np.float64)
        self.y = np.array([r["y"] for r in ch], dtype=bool)
        # real-decoded events (scripts/real_chances.py) also hold the teacher-forced confidence and label of the same chance
        self.c_tf = np.array([r.get("c_tf", np.nan) for r in ch], dtype=np.float64)
        self.y_tf = np.array([r.get("y_tf", -1) for r in ch], dtype=np.int64)
        ex_of = np.array([eix[r["id"]] for r in ch], dtype=np.int64)
        j = np.array([r["j"] for r in ch], dtype=np.int64)
        key_change = np.ones(len(ch), dtype=bool)
        key_change[1:] = (ex_of[1:] != ex_of[:-1]) | (j[1:] != j[:-1])
        self.starts = np.nonzero(key_change)[0]
        self.size = np.diff(np.append(self.starts, len(ch)))
        self.pos = np.arange(len(ch)) - np.repeat(self.starts, self.size)
        self.group_ex = ex_of[self.starts]
        self.L = np.array([ch[s]["L"] for s in self.starts], dtype=np.float64)
        self.bonus = np.array([ch[s]["bonus"] for s in self.starts], dtype=np.float64)

    def sim(self, score, theta):
        """Per-example sums (saved, shown, correct shown, chances) of the keystroke simulation at 'show when score >= theta'."""
        shown = score >= theta - 1e-12
        good = shown & self.y
        big = 1 << 30
        first = np.minimum.reduceat(np.where(good, self.pos, big), self.starts)
        has = first < big
        upto = np.where(has, first, self.size - 1)
        last = self.starts + upto
        cs, cg = np.cumsum(shown), np.cumsum(good)
        before_s = cs[self.starts] - shown[self.starts]
        before_g = cg[self.starts] - good[self.starts]
        saved = np.where(has, self.L - upto + self.bonus - 1, 0.0)
        out = []
        for w in (saved, (cs[last] - before_s).astype(np.float64), (cg[last] - before_g).astype(np.float64),
                  (upto + 1).astype(np.float64)):
            out.append(np.bincount(self.group_ex, weights=w, minlength=self.n_ex))
        return out

    def sweep(self, score, thetas):
        """[4, E, T]: sim() at every theta."""
        return np.stack([np.stack(self.sim(score, t), 0) for t in thetas], axis=-1)


def grid(score, n=300):
    q = 1.0 - np.logspace(0, -3, n)             # 0 (show everything) ... 0.999
    return np.unique(np.quantile(score, q))


def curve(S, w, chars):
    """ksr, precision, coverage at every theta for example weights w (S: [4, E, T])."""
    tot = np.einsum("e,aet->at", w, S)
    ksr = tot[0] / (w @ chars)
    with np.errstate(invalid="ignore", divide="ignore"):
        prec = np.where(tot[1] > 0, tot[2] / tot[1], 0.0)
        cov = np.where(tot[3] > 0, tot[1] / tot[3], 0.0)
    return ksr, prec, cov


def best_at(ksr, prec, p):
    ok = prec >= p
    return np.where(ok, ksr, 0.0).max() if ok.any() else 0.0


def logit(x):
    x = np.clip(x, 1e-6, 1 - 1e-6)
    return np.log(x / (1 - x))


def lr_matrix(ev):
    cols = [ev.X]
    for f in ("c", "top"):
        if f in ev.names:
            cols.append(logit(ev.X[:, ev.names.index(f)])[:, None])
    return np.hstack(cols)


def lr_names(ev):
    return ev.names + [f"logit_{f}" for f in ("c", "top") if f in ev.names]


def compare(test, dev, score, dscore, models, ps, boot, seed, emit, tag="", base="c"):
    """The keystroke simulation of every scorer in `models` (score / dscore: arrays over the test / dev chances), paired
    bootstrap over test examples, differences from the scorer `base`."""
    rng = np.random.RandomState(seed)
    W = rng.multinomial(test.n_ex, np.full(test.n_ex, 1.0 / test.n_ex), size=boot).astype(np.float64)
    ones = np.ones(test.n_ex)
    res = {}
    for k in models:
        th = grid(score[k])
        S = test.sweep(score[k], th)
        ksr, prec, cov = curve(S, ones, test.chars)
        # bootstrap: per resample the best ksr with precision >= p over theta
        tot = np.einsum("be,aet->abt", W, S)
        denom = W @ test.chars
        kb = tot[0] / denom[:, None]
        with np.errstate(invalid="ignore", divide="ignore"):
            pb = np.where(tot[1] > 0, tot[2] / tot[1], 0.0)
        # theta chosen on dev
        dth = grid(dscore[k])
        dS = dev.sweep(dscore[k], dth)
        dksr, dprec, _ = curve(dS, np.ones(dev.n_ex), dev.chars)
        res[k] = dict(ksr=ksr, prec=prec, cov=cov, boot={p: np.where(pb >= p, kb, 0.0).max(1) for p in ps}, dev_theta={})
        for p in ps:
            ok = dprec >= p
            t_star = dth[np.argmax(np.where(ok, dksr, -1))] if ok.any() else np.inf
            Sd = test.sweep(score[k], [t_star])[..., 0]
            res[k]["dev_theta"][p] = dict(theta=float(t_star), S=Sd, dev_ksr=float(np.where(ok, dksr, 0).max()))
    for k in models:
        for p in ps:
            b = res[k]["boot"][p]
            point = best_at(res[k]["ksr"], res[k]["prec"], p)
            row = dict(tag=tag, model=k, precision=p, ksr=float(point), ksr_lo=float(np.percentile(b, 2.5)),
                       ksr_hi=float(np.percentile(b, 97.5)))
            if k != base:
                d = b - res[base]["boot"][p]
                row.update(delta_vs_base=float(point - best_at(res[base]["ksr"], res[base]["prec"], p)),
                           delta_lo=float(np.percentile(d, 2.5)), delta_hi=float(np.percentile(d, 97.5)),
                           delta_p_le_0=float((d <= 0).mean()))
            # the same at the theta that gives this precision most closely
            i = int(np.argmax(np.where(res[k]["prec"] >= p, res[k]["ksr"], -1))) if (res[k]["prec"] >= p).any() else 0
            row.update(prec_at_best=float(res[k]["prec"][i]), cov_at_best=float(res[k]["cov"][i]))
            dt = res[k]["dev_theta"][p]
            ksr_d = dt["S"][0].sum() / test.chars.sum()
            shown = dt["S"][1].sum()
            wd = (W @ dt["S"][0]) / (W @ test.chars)
            row.update(dev_theta=dt["theta"], dev_ksr_on_dev=dt["dev_ksr"], dev_p_ksr=float(ksr_d),
                       dev_p_prec=float(dt["S"][2].sum() / shown) if shown else None,
                       dev_p_cov=float(shown / dt["S"][3].sum()) if dt["S"][3].sum() else None,
                       dev_p_ksr_lo=float(np.percentile(wd, 2.5)), dev_p_ksr_hi=float(np.percentile(wd, 97.5)))
            if k != base:
                cd = res[base]["dev_theta"][p]
                wc = (W @ cd["S"][0]) / (W @ test.chars)
                dd = wd - wc
                row.update(dev_p_delta=float(ksr_d - cd["S"][0].sum() / test.chars.sum()),
                           dev_p_delta_lo=float(np.percentile(dd, 2.5)), dev_p_delta_hi=float(np.percentile(dd, 97.5)))
            emit(row)


def real_comparison(a, emit, dev_tf, lr, hgb, ps):
    """E8 with real decoding: the suggestions of scripts/real_chances.py (c = the true confidence of the suggestion made).
    base: thresholding the true c. Filters without c fitted on the teacher-forced dev dump (lr, hgb), and filters with the
    true c fitted on the real-decoded dev sample. Also how much the teacher-forced c overstates wrong suggestions."""
    from sklearn.ensemble import HistGradientBoostingClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    def has(path):
        with open(path) as f:
            for line in f:
                r = json.loads(line)
                if r["t"] == "c":
                    return set(r)
        return set()
    avail = has(a.dev_real) & has(a.test_real)
    nc = [f for f in dev_tf.names if f in avail]
    if nc != dev_tf.names:                       # e.g. variant llm or slm: no agree / lam; refit the teacher-forced filters on the rest
        miss = [f for f in dev_tf.names if f not in avail]
        emit(dict(note=f"real events lack {miss}: the filters without c use {nc}, refitted on the teacher-forced dev dump"))
        dev_tf = Events(a.dev, names=nc)
        lr = make_pipeline(StandardScaler(), LogisticRegression(C=1.0, max_iter=2000)).fit(lr_matrix(dev_tf), dev_tf.y)
        hgb = HistGradientBoostingClassifier(max_iter=200, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=100,
                                             l2_regularization=1.0, random_state=a.seed).fit(dev_tf.X, dev_tf.y)
    withc = (["c"] if "c" not in nc else []) + nc
    dr, tr = Events(a.dev_real, names=withc), Events(a.test_real, names=withc)
    dr_nc, tr_nc = Events(a.dev_real, names=nc), Events(a.test_real, names=nc)
    for tag, ev in (("dev_real", dr), ("test_real", tr)):
        y, ytf = ev.y.astype(int), ev.y_tf
        rep = dict(real_events=tag, examples=ev.n_ex, chances=int(len(y)), right_real=float(y.mean()),
                   right_teacher_forced=float((ytf == 1).mean()), agreement=float((y == ytf).mean()),
                   teacher_right_decode_wrong=int(((ytf == 1) & (y == 0)).sum()),
                   teacher_wrong_decode_right=int(((ytf == 0) & (y == 1)).sum()))
        for name, m in (("wrong", y == 0), ("right", y == 1)):
            ok = m & (ev.c > 0) & np.isfinite(ev.c_tf)
            r = ev.c_tf[ok] / ev.c[ok]
            if len(r):
                rep[f"ratio_ctf_over_ctrue_{name}"] = dict(n=int(len(r)), mean=float(r.mean()), geo_mean=float(np.exp(np.log(r[r > 0]).mean())), median=float(np.median(r)),
                                                           p90=float(np.percentile(r, 90)), share_above_1_01=float((r > 1.01).mean()),
                                                           mean_c_true=float(ev.c[ok].mean()), mean_c_tf=float(ev.c_tf[ok].mean()))
        emit(rep)
    lr_c = make_pipeline(StandardScaler(), LogisticRegression(C=1.0, max_iter=2000)).fit(lr_matrix(dr), dr.y)
    hgb_c = HistGradientBoostingClassifier(max_iter=200, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=50,
                                           l2_regularization=1.0, random_state=a.seed).fit(dr.X, dr.y)
    top = lambda e: e.X[:, e.names.index("top")]
    score = {"c": tr.c, "c_tf": tr.c_tf, "top": top(tr), "lr_nc": lr.predict_proba(lr_matrix(tr_nc))[:, 1],
             "hgb_nc": hgb.predict_proba(tr_nc.X)[:, 1], "lr_c": lr_c.predict_proba(lr_matrix(tr))[:, 1],
             "hgb_c": hgb_c.predict_proba(tr.X)[:, 1]}
    dscore = {"c": dr.c, "c_tf": dr.c_tf, "top": top(dr), "lr_nc": lr.predict_proba(lr_matrix(dr_nc))[:, 1],
              "hgb_nc": hgb.predict_proba(dr_nc.X)[:, 1], "lr_c": lr_c.predict_proba(lr_matrix(dr))[:, 1],
              "hgb_c": hgb_c.predict_proba(dr.X)[:, 1]}
    # the same keystroke simulation on the sampled words (chars = the sampled words' characters plus their single spaces)
    compare(tr, dr, score, dscore, list(score), ps, a.boot, a.seed, emit, tag="real_decoded", base="c")


def compare_real(files, labels, ps, boot, seed, emit):
    """The true-c threshold of several real-decoded event files of the same examples (scripts/real_chances.py): keystrokes
    saved at the precisions in ps (the best theta with precision >= p, as in compare()), paired bootstrap 95% interval over
    examples, and of each difference against the first file."""
    evs = [Events(f, names=["top"]) for f in files]
    for f, e in zip(files[1:], evs[1:]):
        if e.ids != evs[0].ids:
            raise SystemExit(f"{f}: not the same examples as {files[0]}")
        if not np.array_equal(e.chars, evs[0].chars):
            emit(dict(warning=f"{f}: the sampled words differ from {files[0]} (chars differ in {int((e.chars != evs[0].chars).sum())} examples)"))
    n = evs[0].n_ex
    W = np.random.RandomState(seed).multinomial(n, np.full(n, 1.0 / n), size=boot).astype(np.float64)
    out = []
    for e in evs:
        S = e.sweep(e.c, grid(e.c))
        ksr, prec, cov = curve(S, np.ones(n), e.chars)
        tot = np.einsum("be,aet->abt", W, S)
        kb = tot[0] / (W @ e.chars)[:, None]
        with np.errstate(invalid="ignore", divide="ignore"):
            pb = np.where(tot[1] > 0, tot[2] / tot[1], 0.0)
        out.append(dict(grid=grid(e.c), ksr=ksr, prec=prec, cov=cov, boot={p: np.where(pb >= p, kb, 0.0).max(1) for p in ps},
                        right=float(e.y.mean()), chances=int(len(e.y))))
    thetas = []
    for i, (lab, o) in enumerate(zip(labels, out)):
        th = {}
        for p in ps:
            b = o["boot"][p]
            point = best_at(o["ksr"], o["prec"], p)
            ok = o["prec"] >= p
            jbest = int(np.argmax(np.where(ok, o["ksr"], -1))) if ok.any() else 0
            th[p] = float(o["grid"][jbest]) if ok.any() else float("inf")
            row = dict(tag="compare_real", label=lab, precision=p, ksr=float(point), ksr_lo=float(np.percentile(b, 2.5)),
                       ksr_hi=float(np.percentile(b, 97.5)), prec_at_best=float(o["prec"][jbest]), cov_at_best=float(o["cov"][jbest]),
                       theta=th[p], right_rate=o["right"], chances=o["chances"], examples=n, scope="pooled over all languages")
            if i:
                d = b - out[0]["boot"][p]
                row.update(vs=labels[0], delta=float(point - best_at(out[0]["ksr"], out[0]["prec"], p)),
                           delta_lo=float(np.percentile(d, 2.5)), delta_hi=float(np.percentile(d, 97.5)),
                           delta_p_le_0=float((d <= 0).mean()))
            emit(row)
        thetas.append(th)
    langs = sorted({l for l in evs[0].lang if l})
    if len(langs) > 1:
        per_language(evs, labels, langs, thetas, ps, boot, seed, emit)


class EventsPlen(Events):
    """Events that also hold plen, the letters each suggestion adds to the typed ones (scripts/real_chances.py writes it)."""

    def __init__(self, path, **kw):
        super().__init__(path, **kw)
        rows = [r for r in read_events(path)[0]]
        rows.sort(key=lambda r: (r["id"], r["j"], r["k"]))
        if not rows or any("plen" not in r for r in rows[:1]):
            raise SystemExit(f"{path}: no plen in its events (decode again with the current scripts/real_chances.py)")
        self.plen = np.array([r["plen"] for r in rows], dtype=np.int64)
        if len(self.plen) != len(self.c):
            raise SystemExit(f"{path}: plen and chances differ in number")


def min_save_scores(ev, m):
    """(score, grid) for hiding the suggestions that would save fewer than m keystrokes (their letters minus the Tab, plen - 1 < m):
    a hidden one gets score -1, below every theta of the grid, which is built on the others' confidences only. m = 0 hides nothing."""
    ok = np.ones(len(ev.c), dtype=bool) if m <= 0 else (ev.plen - 1 >= m)
    score = np.where(ok, ev.c, -1.0)
    return score, (grid(ev.c[ok]) if ok.any() else np.array([np.inf]))


def compare_min_save(files, labels, ps, ms, boot, seed, emit):
    """The minimum length: for every file (a real-decoded variant), every m in ms and every precision p, the threshold on the true
    confidence is picked again (the best ksr with precision >= p, as compare_real), with the suggestions that save fewer than m
    keystrokes hidden. Rows tagged min_save: ksr with a paired bootstrap 95% interval, precision, coverage (shown / chances) with
    its interval at the chosen threshold, the suggestions shown (count and per 1000 characters), the difference from m = 0 of the
    same file and, for the later files, from the first file at the same m (paired: the same resamples everywhere)."""
    evs = [EventsPlen(f, names=["top"]) for f in files]
    for f, e in zip(files[1:], evs[1:]):
        if e.ids != evs[0].ids:
            raise SystemExit(f"{f}: not the same examples as {files[0]}")
    n = evs[0].n_ex
    W = np.random.RandomState(seed).multinomial(n, np.full(n, 1.0 / n), size=boot).astype(np.float64)
    res = {}
    for li, e in enumerate(evs):
        for m in ms:
            score, th = min_save_scores(e, m)
            S = e.sweep(score, th)
            ksr, prec, cov = curve(S, np.ones(n), e.chars)
            tot = np.einsum("be,aet->abt", W, S)
            kb = tot[0] / (W @ e.chars)[:, None]
            with np.errstate(invalid="ignore", divide="ignore"):
                pb = np.where(tot[1] > 0, tot[2] / tot[1], 0.0)
            res[li, m] = dict(S=S, th=th, ksr=ksr, prec=prec, cov=cov, chars=float(e.chars.sum()),
                              boot={p: np.where(pb >= p, kb, 0.0).max(1) for p in ps})
    for li, (lab, e) in enumerate(zip(labels, evs)):
        for m in ms:
            r = res[li, m]
            for p in ps:
                b = r["boot"][p]
                ok = r["prec"] >= p
                j = int(np.argmax(np.where(ok, r["ksr"], -1))) if ok.any() else 0
                point = float(r["ksr"][j]) if ok.any() else 0.0
                shown, chances = r["S"][1][:, j], r["S"][3][:, j]
                cb = (W @ shown) / np.maximum(W @ chances, 1e-9)
                row = dict(tag="min_save", label=lab, min_save=m, precision=p, ksr=point, ksr_lo=float(np.percentile(b, 2.5)),
                           ksr_hi=float(np.percentile(b, 97.5)), prec_at_best=float(r["prec"][j]) if ok.any() else None,
                           cov_at_best=float(r["cov"][j]) if ok.any() else None, cov_lo=float(np.percentile(cb, 2.5)),
                           cov_hi=float(np.percentile(cb, 97.5)), shown=int(shown.sum()),
                           shown_per_1000_chars=float(1000 * shown.sum() / r["chars"]), theta=float(r["th"][j]) if ok.any() else None,
                           chances=int(chances.sum()), examples=n)
                if m != ms[0]:
                    r0 = res[li, ms[0]]
                    k0 = int(np.argmax(np.where(r0["prec"] >= p, r0["ksr"], -1))) if (r0["prec"] >= p).any() else 0
                    d = b - r0["boot"][p]
                    row.update(vs_min_save=ms[0], delta_vs_min=point - float(r0["ksr"][k0]),
                               delta_vs_min_lo=float(np.percentile(d, 2.5)), delta_vs_min_hi=float(np.percentile(d, 97.5)),
                               delta_vs_min_p_le_0=float((d <= 0).mean()))
                if li:
                    r1 = res[0, m]
                    k1 = int(np.argmax(np.where(r1["prec"] >= p, r1["ksr"], -1))) if (r1["prec"] >= p).any() else 0
                    d = b - r1["boot"][p]
                    row.update(vs=labels[0], delta=point - float(r1["ksr"][k1]), delta_lo=float(np.percentile(d, 2.5)),
                               delta_hi=float(np.percentile(d, 97.5)), delta_p_le_0=float((d <= 0).mean()))
                emit(row)


def per_language(evs, labels, langs, thetas, ps, boot, seed, emit):
    """Keystrokes saved per language at the threshold each file's pooled curve picks for the precision p (one threshold for all
    languages: what one deployed setting would do), the per-language difference against the first file, and the mean over
    languages with a bootstrap 95% interval (examples resampled within each language, the same resample for every file)."""
    rng = np.random.RandomState(seed + 1)
    lang_ix = {l: np.nonzero(evs[0].lang == l)[0] for l in langs}
    Wl = {l: rng.multinomial(len(ix), np.full(len(ix), 1.0 / len(ix)), size=boot).astype(np.float64) for l, ix in lang_ix.items()}
    chars = evs[0].chars
    for p in ps:
        res = []
        for e, th in zip(evs, thetas):
            S = np.stack(e.sim(e.c, th[p]), 0) if np.isfinite(th[p]) else np.zeros((4, e.n_ex))
            per = {}
            for l, ix in lang_ix.items():
                c = chars[ix].sum()
                saved, shown, good, chances = S[0, ix].sum(), S[1, ix].sum(), S[2, ix].sum(), S[3, ix].sum()
                bs = (Wl[l] @ S[0, ix]) / np.maximum(Wl[l] @ chars[ix], 1e-9)
                per[l] = dict(ksr=saved / c if c else 0.0, prec=good / shown if shown else None,
                              cov=shown / chances if chances else None, boot=bs, chars=float(c))
            res.append(per)
        use = [l for l in langs if chars[lang_ix[l]].sum() > 0]
        for i, (lab, per) in enumerate(zip(labels, res)):
            for l in use:
                r = dict(tag="per_language", label=lab, precision=p, lang=l, ksr=float(per[l]["ksr"]), prec=per[l]["prec"],
                         cov=per[l]["cov"], examples=int(len(lang_ix[l])), chars=per[l]["chars"])
                if i:
                    r.update(vs=labels[0], delta=float(per[l]["ksr"] - res[0][l]["ksr"]))
                emit(r, quiet=True)
            mean_b = np.mean([per[l]["boot"] for l in use], axis=0)
            row = dict(tag="per_language_mean", label=lab, precision=p, languages=len(use),
                       mean_ksr=float(np.mean([per[l]["ksr"] for l in use])), lo=float(np.percentile(mean_b, 2.5)),
                       hi=float(np.percentile(mean_b, 97.5)), median_ksr=float(np.median([per[l]["ksr"] for l in use])),
                       theta=thetas[i][p])
            if i:
                dl = np.array([per[l]["ksr"] - res[0][l]["ksr"] for l in use])
                db = mean_b - np.mean([res[0][l]["boot"] for l in use], axis=0)
                row.update(vs=labels[0], mean_delta=float(dl.mean()), delta_lo=float(np.percentile(db, 2.5)),
                           delta_hi=float(np.percentile(db, 97.5)), languages_better=int((dl > 1e-12).sum()),
                           languages_worse=int((dl < -1e-12).sum()), languages_equal=int((np.abs(dl) <= 1e-12).sum()))
            emit(row)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dev", default=None)
    ap.add_argument("--test", default=None)
    ap.add_argument("--out", required=True)
    ap.add_argument("--compare-real", nargs="+", default=None, metavar="EVENTS",
                    help="compare the true-c thresholds of these real-decoded event files (same examples); needs --labels; "
                         "no --dev / --test then")
    ap.add_argument("--min-save", default=None, metavar="M,M,..",
                    help="with --compare-real: instead of those rows, the minimum length of a suggestion (compare_min_save): hide the "
                         "suggestions that would save fewer than m keystrokes (their letters minus the Tab), for each m of the list "
                         "(0 = today), the threshold picked again; needs events with plen (scripts/real_chances.py)")
    ap.add_argument("--labels", default=None, help="comma list of names for --compare-real, one per file")
    ap.add_argument("--phrase-compare", nargs="+", default=None, metavar="EVENTS",
                    help="the keystroke simulation for phrases (scripts/phrase_sim.py) on real-decoded events made with "
                         "real_chances.py --phrase-words and --words-per-example 0; needs --labels; no --dev / --test then")
    ap.add_argument("--phrase-max-n", type=int, default=5, help="--phrase-compare: the most words shown")
    ap.add_argument("--phrase-calibration", default=None, help="--phrase-compare: the app's calibration.json, and --phrase-plans "
                    "names its row (mix, llm or slm) for each file: also every rule at the app's own thresholds")
    ap.add_argument("--phrase-plans", default=None, help="comma list, one per file (see --phrase-calibration)")
    ap.add_argument("--phrase-floor", type=float, default=0.05, help="--phrase-compare: the --phrase-floor of the decoding run")
    ap.add_argument("--dev-real", default=None, help="real-decoded dev events (scripts/real_chances.py)")
    ap.add_argument("--test-real", default=None, help="real-decoded test events: also compare on these (needs --dev-real)")
    ap.add_argument("--variant", default=None, help="the variant's spec, to find its line in --check-metrics")
    ap.add_argument("--check-metrics", default=None, help="scripts/eval.py's metrics.jsonl of the test run")
    ap.add_argument("--precisions", default="0.3,0.4,0.5")
    ap.add_argument("--boot", type=int, default=1000)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--with-c", action="store_true", help="also give the filters the harness's confidence c (leaks the label)")
    ap.add_argument("--threads", type=int, default=2)
    a = ap.parse_args(argv)
    os.environ.setdefault("OMP_NUM_THREADS", str(min(a.threads, 2)))
    os.environ["CUDA_VISIBLE_DEVICES"] = ""
    from joblib import dump
    from sklearn.ensemble import HistGradientBoostingClassifier
    from sklearn.inspection import permutation_importance
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import log_loss, roc_auc_score
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    from threadpoolctl import threadpool_limits
    threadpool_limits(min(a.threads, 2))

    os.makedirs(a.out, exist_ok=True)
    t0 = time.time()
    if a.phrase_compare:
        import phrase_sim
        labels = a.labels.split(",") if a.labels else [os.path.splitext(os.path.basename(f))[0] for f in a.phrase_compare]
        if len(labels) != len(a.phrase_compare):
            raise SystemExit("--phrase-compare needs one label per file")
        lines = []

        def emit1(d):
            lines.append(d)
            print(json.dumps(d), flush=True)
        cal = None
        if a.phrase_calibration:
            table = json.load(open(a.phrase_calibration))
            plans = a.phrase_plans.split(",")
            if len(plans) != len(labels):
                raise SystemExit("--phrase-plans needs one plan per file")
            cal = {lab: {float(p): t for p, t in table[pl].items()} for lab, pl in zip(labels, plans)}
        phrase_sim.compare(a.phrase_compare, labels, [float(x) for x in a.precisions.split(",")], a.boot, a.seed, emit1,
                           max_n=a.phrase_max_n, floor=a.phrase_floor, calibrated=cal)
        with open(os.path.join(a.out, "metrics.jsonl"), "w") as f:
            for l in lines:
                f.write(json.dumps(l) + "\n")
        return
    if a.compare_real:
        labels = a.labels.split(",") if a.labels else [os.path.splitext(os.path.basename(f))[0] for f in a.compare_real]
        if len(labels) != len(a.compare_real) or (len(labels) < 2 and not a.min_save):
            raise SystemExit("--compare-real needs two or more files and one label each (one file is enough with --min-save)")
        lines = []

        def emit0(d, quiet=False):
            lines.append(d)
            if not quiet:                            # the per-language rows go to metrics.jsonl only
                print(json.dumps(d), flush=True)
        if a.min_save:
            compare_min_save(a.compare_real, labels, [float(x) for x in a.precisions.split(",")],
                             [int(x) for x in a.min_save.split(",")], a.boot, a.seed, emit0)
        else:
            compare_real(a.compare_real, labels, [float(x) for x in a.precisions.split(",")], a.boot, a.seed, emit0)
        with open(os.path.join(a.out, "metrics.jsonl"), "w") as f:
            for l in lines:
                f.write(json.dumps(l) + "\n")
        return
    if not (a.dev and a.test):
        raise SystemExit("--dev and --test are needed (or --compare-real)")
    dev, test = Events(a.dev, not a.with_c), Events(a.test, not a.with_c)
    assert dev.names == test.names, (dev.names, test.names)
    print(f"# dev: {dev.n_ex} examples, {len(dev.y)} chances ({dev.y.mean():.3f} right); test: {test.n_ex} examples, "
          f"{len(test.y)} chances ({test.y.mean():.3f} right); features {dev.names}", file=sys.stderr)
    lines = []

    def emit(d):
        lines.append(d)
        print(json.dumps(d), flush=True)

    # ---- the baseline reproduces scripts/eval.py ------------------------------------------------------------------------
    tau_curves = {}
    for t in TAUS:
        s, sh, cs, ch = (x.sum() for x in test.sim(test.c, t))
        tau_curves[t] = dict(ksr=s / test.chars.sum(), prec=cs / sh if sh else None, cov=sh / ch if ch else None)
    if a.check_metrics:
        ref = None
        for l in open(a.check_metrics):
            d = json.loads(l)
            if a.variant is None or d.get("variant") == a.variant:
                ref = d
                break
        if ref is None:
            raise SystemExit(f"no line for variant {a.variant!r} in {a.check_metrics}")
        worst = 0.0
        for t, v in tau_curves.items():
            for key, mine in (("ksr", v["ksr"]), ("prec", v["prec"]), ("cov", v["cov"])):
                theirs = ref.get(f"{key}@{t:g}")
                if theirs is None and mine is None:
                    continue
                if theirs is None or mine is None:
                    raise SystemExit(f"baseline check failed: {key}@{t:g} mine {mine} eval.py {theirs}")
                worst = max(worst, abs(mine - theirs))
        if worst > 1e-9:
            raise SystemExit(f"baseline check failed: simulation differs from scripts/eval.py by {worst:.3g}")
        emit(dict(check="baseline c reproduces scripts/eval.py", variant=a.variant, max_abs_diff=worst,
                  taus=list(TAUS), ksr_best_eval=ref.get("ksr_best")))
    emit(dict(baseline_c_at_tau={f"{t:g}": v for t, v in tau_curves.items()}, chars=float(test.chars.sum())))

    # ---- fit -------------------------------------------------------------------------------------------------------------
    lr = make_pipeline(StandardScaler(), LogisticRegression(C=1.0, max_iter=2000))
    lr.fit(lr_matrix(dev), dev.y)
    hgb = HistGradientBoostingClassifier(max_iter=200, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=100,
                                         l2_regularization=1.0, random_state=a.seed)
    hgb.fit(dev.X, dev.y)
    score = {"c": test.c, "top": test.X[:, test.names.index("top")], "lr": lr.predict_proba(lr_matrix(test))[:, 1],
             "hgb": hgb.predict_proba(test.X)[:, 1]}
    dscore = {"c": dev.c, "top": dev.X[:, dev.names.index("top")], "lr": lr.predict_proba(lr_matrix(dev))[:, 1],
              "hgb": hgb.predict_proba(dev.X)[:, 1]}
    dump(lr, os.path.join(a.out, "lr.joblib"))
    dump(hgb, os.path.join(a.out, "hgb.joblib"))
    for k in MODELS:
        p = np.clip(score[k], 1e-6, 1 - 1e-6)
        emit(dict(model=k, test_auc=float(roc_auc_score(test.y, score[k])), test_logloss=float(log_loss(test.y, p)),
                  dev_auc=float(roc_auc_score(dev.y, dscore[k])), chances_test=int(len(test.y))))
    # weights / importances
    names = lr_names(dev)
    coef = lr[-1].coef_[0]
    sub = np.random.RandomState(a.seed).permutation(len(test.y))[:20000]
    imp = permutation_importance(hgb, test.X[sub], test.y[sub], scoring="neg_log_loss", n_repeats=3,
                                 random_state=a.seed, n_jobs=1)
    weights = dict(features=dev.names, lr_features=names, lr_weights_standardised=dict(zip(names, map(float, coef))),
                   lr_intercept=float(lr[-1].intercept_[0]),
                   hgb_permutation_importance_logloss=dict(zip(dev.names, map(float, imp.importances_mean))),
                   hgb_permutation_importance_std=dict(zip(dev.names, map(float, imp.importances_std))))
    with open(os.path.join(a.out, "weights.json"), "w") as f:
        json.dump(weights, f, indent=1)
    emit(dict(weights=weights))

    # ---- keystroke simulation ---------------------------------------------------------------------------------------------
    ps = [float(x) for x in a.precisions.split(",")]
    compare(test, dev, score, dscore, MODELS, ps, a.boot, a.seed, emit, tag="teacher_forced", base="c")
    if a.test_real:
        if not a.dev_real:
            raise SystemExit("--test-real needs --dev-real (for theta and the filters that use the true c)")
        real_comparison(a, emit, dev, lr, hgb, ps)
    emit(dict(done=True, seconds=time.time() - t0, bootstrap=a.boot, test_examples=test.n_ex))
    with open(os.path.join(a.out, "metrics.jsonl"), "w") as f:
        for l in lines:
            f.write(json.dumps(l) + "\n")


if __name__ == "__main__":
    main()
