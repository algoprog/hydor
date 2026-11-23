"""The keystroke simulation for phrases: show up to N words instead of the rest of one word (scripts/show_filter.py --phrase-compare).

Events: scripts/real_chances.py --phrase-words M --words-per-example 0 (every word of an example, so that a phrase taken at one
word covers the next ones; a chance holds "ph": [[y, c_own, c_path, L, bonus], ...] for the words after the first, M - 1 at most).

A person types an example word by word. At a word, after k = 0, 1, ... letters typed, the app has a suggestion: the first word's
rest and, with the rule below, more words (dimmer). What is shown:
  first word   shown when its confidence c >= theta (as before; theta is chosen for a precision of the first word, as before);
  word i >= 2  rule "path": the confidence of the whole path (the product of the confidences of the words up to i) >= thx;
               rule "own": its own confidence >= thx (what the app does today for the second word, with thx = theta).
               The words shown are a prefix: the first word i that fails stops the phrase. thx is theta ("same") or a stricter
               number (max(theta, a)).
The person takes the suggestion at the first pause where the first word is shown and right (so the precision is the first
word's, as it was), and takes the longest right prefix of what is shown, r words of the m shown: r Tab keys, or one -> key when
the whole phrase shown is right (r == m); a wrong word stops there and the person types on (the keys pressed are those of the
right ones). Keystrokes saved = letters inserted (the word's rest, each taken word's letters, and the single space after each
word) minus keys pressed. Taking r words covers them: the person carries on at the word after them, and the words in between
have no pauses of their own. A word the harness left unaligned is never part of a phrase (it is wrong there), and a phrase is
never past the end of the example. M = 1 words are the old simulation exactly (Events.sim of show_filter.py).

Chances whose first word is wrong have no "ph" (a phrase that starts wrong saves nothing whatever follows), and nothing was decoded
after a path below the floor of the run (--phrase-floor): thresholds below it are not allowed (floor_ok).
"""
import json
import time

import numpy as np

BIG = 1 << 30
ROWS = ("saved", "shown", "good", "chances", "phrase_good", "taken", "words_taken", "words_shown")


class PhraseEvents:
    """Chances sorted by (example, word, k) with the arrays of the phrase simulation."""

    def __init__(self, path, floor=0.05):
        ch, exs = [], {}
        with open(path) as f:
            for line in f:
                r = json.loads(line)
                if r["t"] == "e":
                    exs[r["id"]] = r
                else:
                    ch.append(r)
        ch.sort(key=lambda r: (r["id"], r["j"], r["k"]))
        self.floor = floor
        self.ids = sorted(exs)
        eix = {i: n for n, i in enumerate(self.ids)}
        self.n_ex = len(self.ids)
        self.chars = np.array([exs[i]["chars"] for i in self.ids], dtype=np.float64)
        self.lang = np.array([exs[i].get("lang", "") for i in self.ids])
        n = len(ch)
        self.c = np.array([r["c"] for r in ch], dtype=np.float64)
        self.y = np.array([r["y"] for r in ch], dtype=bool)
        ex_of = np.array([eix[r["id"]] for r in ch], dtype=np.int64)
        j = np.array([r["j"] for r in ch], dtype=np.int64)
        key_change = np.ones(n, dtype=bool)
        key_change[1:] = (ex_of[1:] != ex_of[:-1]) | (j[1:] != j[:-1])
        self.starts = np.nonzero(key_change)[0]
        self.size = np.diff(np.append(self.starts, n))
        self.pos = np.arange(n) - np.repeat(self.starts, self.size)
        self.g_ex = ex_of[self.starts]                       # example of each word (group)
        self.g_j = j[self.starts]
        self.L = np.array([ch[s]["L"] for s in self.starts], dtype=np.float64)
        self.bonus = np.array([ch[s]["bonus"] for s in self.starts], dtype=np.float64)
        self.M = max([len(r.get("ph", ())) for r in ch] + [0])
        M = max(self.M, 1)
        self.P_has = np.zeros((n, M), dtype=bool)
        self.P_y = np.zeros((n, M), dtype=bool)
        self.P_own = np.zeros((n, M))
        self.P_cum = np.zeros((n, M))
        self.P_gold = np.zeros((n, M))                       # letters and the single space of the gold word
        for i, r in enumerate(ch):
            for m, (y, own, cum, L, b) in enumerate(r.get("ph", ())):
                self.P_has[i, m], self.P_y[i, m], self.P_own[i, m], self.P_cum[i, m], self.P_gold[i, m] = True, bool(y), own, cum, L + b
        # groups of words by example, for the walk
        self.ex_first = np.searchsorted(self.g_ex, np.arange(self.n_ex), side="left")
        self.ex_count = np.searchsorted(self.g_ex, np.arange(self.n_ex), side="right") - self.ex_first
        self.max_g = int(self.ex_count.max()) if self.n_ex else 0
        self.n_words_all = len(self.starts)

    def floor_ok(self, theta, thx=None):
        return bool(np.all(np.asarray(theta) >= self.floor - 1e-12) and (thx is None or np.all(np.asarray(thx) >= self.floor - 1e-12)))

    def sim(self, theta, n_words=1, rule="path", stricter=None, chunk=24):
        """[len(ROWS), E, T]: per-example sums of the simulation at each theta (an array). n_words: at most this many words shown;
        stricter: None (the extra words at theta) or a number a (at max(theta, a))."""
        theta = np.asarray(theta, dtype=np.float64)
        T = len(theta)
        out = np.zeros((len(ROWS), self.n_ex, T))
        for t0 in range(0, T, chunk):
            out[:, :, t0:t0 + chunk] = self._sim(theta[t0:t0 + chunk], n_words, rule, stricter)
        return out

    def _sim(self, th, n_words, rule, stricter):
        G, T = self.n_words_all, len(th)
        starts, size = self.starts, self.size
        shown = self.c[:, None] >= th[None] - 1e-12                                   # [C, T]
        good = shown & self.y[:, None]
        first = np.minimum.reduceat(np.where(good, self.pos[:, None], BIG), starts, axis=0)      # [G, T]
        has = first < BIG
        upto = np.where(has, first, (size - 1)[:, None])
        last = starts[:, None] + upto
        cs = np.cumsum(shown, axis=0, dtype=np.int32)
        shown_n = np.take_along_axis(cs, last, 0) - (cs[starts] - shown[starts])
        a = np.minimum(starts[:, None] + np.where(has, first, 0), len(self.c) - 1)     # the chance where the phrase is taken
        r = np.ones((G, T))
        m = np.ones((G, T))
        extra = np.zeros((G, T))
        M = min(n_words - 1, self.M)
        if M > 0:
            thx = th if stricter is None else np.maximum(th, stricter)
            conf = self.P_cum if rule == "path" else self.P_own
            ok_show = np.ones((G, T), dtype=bool)
            ok_right = np.ones((G, T), dtype=bool)
            gold = np.zeros((G, T))
            for i in range(M):
                has_i = self.P_has[a, i]
                ok_show = ok_show & has_i & (conf[a, i] >= thx[None] - 1e-12)
                m = m + ok_show
                ok_right = ok_right & has_i & self.P_y[a, i]
                # the right words that are also shown: the words taken
                taken_i = ok_show & ok_right
                r = r + taken_i
                gold = gold + np.where(taken_i, self.P_gold[a, i], 0.0)
            extra = gold
        keys = np.where(r == m, 1.0, r)
        saved = np.where(has, self.L[:, None] - first + self.bonus[:, None] + extra - keys, 0.0)
        r_g = np.where(has, r, 1.0)
        vals = [saved, shown_n.astype(np.float64), has.astype(np.float64), (upto + 1).astype(np.float64),
                (has & (r == m)).astype(np.float64), has.astype(np.float64), np.where(has, r, 0.0), np.where(has, m, 0.0)]
        # the walk: in each example the words in order; a word is visited unless a phrase taken before covered it
        E = self.n_ex
        res = np.zeros((len(ROWS), E, T))
        cur = np.zeros((E, T))
        for p in range(self.max_g):
            live = np.nonzero(self.ex_count > p)[0]
            gi = self.ex_first[live] + p
            vis = (self.g_j[gi][:, None] >= cur[live] - 1e-9)
            for q, v in enumerate(vals):
                res[q, live] += np.where(vis, v[gi], 0.0)
            cur[live] = np.where(vis, self.g_j[gi][:, None] + r_g[gi], cur[live])
        return res


def grid_theta(c, floor, n=120):
    """Thresholds between the floor and 0.999: quantiles of the confidences, finer at the top (as show_filter.grid)."""
    q = 1.0 - np.logspace(0, -3, n * 2)
    g = np.unique(np.quantile(c, q))
    g = g[g >= floor - 1e-12]
    if len(g) > n:
        g = g[np.unique(np.linspace(0, len(g) - 1, n).round().astype(int))]
    return g


def curves(S, w, chars):
    """ksr, first-word precision, phrase precision, coverage, words shown per phrase taken at every theta, for example weights w."""
    tot = np.einsum("e,aet->at", w, S)
    ksr = tot[0] / (w @ chars)
    with np.errstate(invalid="ignore", divide="ignore"):
        prec = np.where(tot[1] > 0, tot[2] / tot[1], 0.0)
        pprec = np.where(tot[1] > 0, tot[4] / tot[1], 0.0)
        cov = np.where(tot[3] > 0, tot[1] / tot[3], 0.0)
        wt = np.where(tot[5] > 0, tot[6] / tot[5], 0.0)
    return ksr, prec, pprec, cov, wt


def rules(max_n=5, strict=(0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9)):
    """The settings compared: (name, n_words, rule, stricter). 'today' is the app's: the second word at its own confidence >= theta."""
    out = [("N=1", 1, "path", None), ("today N=2 own", 2, "own", None)]
    for n in range(2, max_n + 1):
        out.append((f"N={n} path same", n, "path", None))
        for a in strict:
            out.append((f"N={n} path >={a:g}", n, "path", a))
    return out


def compare(files, labels, ps, boot, seed, emit, max_n=5, floor=0.05, n_theta=120, strict=(0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9),
            folds=2):
    """For each event file (a setting) and each setting of rules(): the keystrokes saved at the first-word precisions ps, as
    show_filter.compare_real does it (the best theta with precision >= p, the paired bootstrap over examples choosing it again in every
    resample), plus the phrase's own precision, coverage and words shown. For each N the stricter threshold is chosen among `strict`
    as the one with most keystrokes saved (rows tagged phrase_best), and a cross-fitted figure (theta and the stricter threshold
    chosen on half of the examples, the keystrokes counted on the other half) is given for every rule family (rows phrase_crossfit)."""
    t0 = time.time()
    rl = rules(max_n, strict)
    for f, lab in zip(files, labels):
        ev = PhraseEvents(f, floor)
        n = ev.n_ex
        th = grid_theta(ev.c, floor, n_theta)
        W = np.random.RandomState(seed).multinomial(n, np.full(n, 1.0 / n), size=boot).astype(np.float64)
        ones = np.ones(n)
        fold = (np.arange(n) % folds)                       # examples are sorted by id: neighbours go to different folds
        res = {}
        for name, nw, rule, strictv in rl:
            S = ev.sim(th, nw, rule, strictv)
            ksr, prec, pprec, cov, wt = curves(S, ones, ev.chars)
            tot = np.einsum("be,aet->abt", W, S)
            kb = tot[0] / (W @ ev.chars)[:, None]
            with np.errstate(invalid="ignore", divide="ignore"):
                pb = np.where(tot[1] > 0, tot[2] / tot[1], 0.0)
            res[name] = dict(S=S, ksr=ksr, prec=prec, pprec=pprec, cov=cov, wt=wt,
                             boot={p: np.where(pb >= p, kb, 0.0).max(1) for p in ps})
        emit(dict(tag="phrase_setting", setting=lab, file=f, examples=n, chances=int(len(ev.c)), words=int(ev.n_words_all),
                  chars=float(ev.chars.sum()), floor=floor, thetas=int(len(th)), first_word_right_rate=float(ev.y.mean()),
                  with_phrase=int(ev.P_has[:, 0].sum()) if ev.M else 0, seconds=time.time() - t0))
        base = res["N=1"]
        today = res["today N=2 own"]

        def best(r, p):
            ok = r["prec"] >= p
            i = int(np.argmax(np.where(ok, r["ksr"], -1))) if ok.any() else 0
            return (float(r["ksr"][i]) if ok.any() else 0.0), i, bool(ok.any())

        for p in ps:
            for name, nw, rule, strictv in rl:
                r = res[name]
                point, i, anyok = best(r, p)
                b = r["boot"][p]
                row = dict(tag="phrase", setting=lab, rule=name, n_words=nw, stricter=strictv, precision=p, ksr=point,
                           ksr_lo=float(np.percentile(b, 2.5)), ksr_hi=float(np.percentile(b, 97.5)), theta=float(th[i]),
                           first_precision=float(r["prec"][i]), phrase_precision=float(r["pprec"][i]), coverage=float(r["cov"][i]),
                           words_per_phrase=float(r["wt"][i]), examples=n)
                for ref, key in ((base, "vs_N1"), (today, "vs_today")):
                    d = b - ref["boot"][p]
                    row[key] = dict(delta=float(point - best(ref, p)[0]), lo=float(np.percentile(d, 2.5)), hi=float(np.percentile(d, 97.5)))
                emit(row)
            # the app's own theta: the one that the first word alone picks (calibration), the second word at its own confidence
            _, i0, _ = best(base, p)
            for name in ("N=1", "today N=2 own"):
                r = res[name]
                emit(dict(tag="phrase_app_theta", setting=lab, rule=name, precision=p, theta=float(th[i0]), ksr=float(r["ksr"][i0]),
                          first_precision=float(r["prec"][i0]), phrase_precision=float(r["pprec"][i0]), coverage=float(r["cov"][i0]),
                          words_per_phrase=float(r["wt"][i0])))
            # for each N: the best stricter threshold (chosen on these events)
            for nw in range(2, max_n + 1):
                fam = [x[0] for x in rl if x[1] == nw and x[2] == "path"]
                cand = [(best(res[x], p)[0], x) for x in fam]
                k, x = max(cand)
                emit(dict(tag="phrase_best", setting=lab, n_words=nw, precision=p, rule=x, ksr=k,
                          same=best(res[f"N={nw} path same"], p)[0]))
            # cross-fitted: choose on one fold, count on the others
            if folds > 1:
                for nw in range(1, max_n + 1):
                    fams = {"same": [f"N={nw} path same"] if nw > 1 else ["N=1"]}
                    if nw > 1:
                        fams["stricter"] = [x[0] for x in rl if x[1] == nw and x[2] == "path"]
                    if nw == 2:
                        fams["today"] = ["today N=2 own"]
                    for kind, names in fams.items():
                        held = np.zeros(n)
                        sel = []
                        stats = np.zeros(len(ROWS))
                        for fo in range(folds):
                            tr, te = fold != fo, fold == fo
                            bestv, bi = -1.0, None
                            for x in names:
                                S = res[x]["S"]
                                ksr_f, prec_f, _, _, _ = curves(S[:, tr, :], np.ones(tr.sum()), ev.chars[tr])
                                ok = prec_f >= p
                                if ok.any():
                                    v = np.where(ok, ksr_f, -1).max()
                                    if v > bestv:
                                        bestv, bi = v, (x, int(np.argmax(np.where(ok, ksr_f, -1))))
                            if bi is None:
                                continue
                            x, ti = bi
                            held[te] = res[x]["S"][0][te, ti]
                            stats += res[x]["S"][:, te, ti].sum(1)
                            sel.append((x, float(th[ti])))
                        wb = (W @ held) / (W @ ev.chars)
                        sh = stats[1]
                        emit(dict(tag="phrase_crossfit", setting=lab, family=kind, n_words=nw, precision=p, ksr=float(held.sum() / ev.chars.sum()),
                                  ksr_lo=float(np.percentile(wb, 2.5)), ksr_hi=float(np.percentile(wb, 97.5)),
                                  first_precision=float(stats[2] / sh) if sh else None, phrase_precision=float(stats[4] / sh) if sh else None,
                                  coverage=float(sh / stats[3]) if stats[3] else None, words_per_phrase=float(stats[6] / stats[5]) if stats[5] else None,
                                  chosen=sel, examples=n))
                        res.setdefault("_held", {})[(kind, nw, p)] = held
            # paired differences of the cross-fitted figures against N=1 and today
            if folds > 1:
                H = res["_held"]
                for (kind, nw, pp), h in H.items():
                    if pp != p or (kind, nw) == ("same", 1):
                        continue
                    for ref_key, ref_name in ((("same", 1, p), "N=1"), (("today", 2, p), "today")):
                        ref = H[ref_key]
                        d = (W @ (h - ref)) / (W @ ev.chars)
                        emit(dict(tag="phrase_crossfit_delta", setting=lab, family=kind, n_words=nw, precision=p, vs=ref_name,
                                  delta=float((h - ref).sum() / ev.chars.sum()), lo=float(np.percentile(d, 2.5)), hi=float(np.percentile(d, 97.5))))
