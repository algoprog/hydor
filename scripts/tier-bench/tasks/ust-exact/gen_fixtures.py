"""Makes fixtures.json: the probability that each link is in the random spanning tree, for the networks check.mjs
makes from a seed. Run, from this folder:

    node check.mjs --dump graphs.json
    python3 gen_fixtures.py graphs.json fixtures.json

A link is in the tree with probability quality times the effective resistance between its ends (Kirchhoff), which
needs one inverse of the Laplacian with a node grounded. Two ways of getting it are compared before anything is
written: float64 numpy, and either exact fractions (networks up to 40 nodes) or the float64 inverse refined in
extended precision (the larger ones). Foster's theorem (the probabilities add up to n - 1) is checked too.
"""
import json
import sys
from fractions import Fraction

import numpy as np

EXACT_UP_TO = 40


def laplacian(n, ends, weights, dtype):
    lap = np.zeros((n, n), dtype=dtype)
    for (a, b), w in zip(ends, weights):
        if a == b:
            continue
        lap[a, a] += w
        lap[b, b] += w
        lap[a, b] -= w
        lap[b, a] -= w
    return lap


def probabilities(x, ends, weights):
    """x is the inverse of the grounded Laplacian, padded with a zero row and column for the grounded node."""
    out = []
    for (a, b), w in zip(ends, weights):
        out.append(0 if a == b else w * (x[a][a] + x[b][b] - 2 * x[a][b]))
    return out


def exact_inverse(rows):
    """Gauss-Jordan on a list of lists of Fractions; the matrix is positive definite, so no pivoting is needed."""
    m = len(rows)
    aug = [list(r) + [Fraction(int(i == j)) for j in range(m)] for i, r in enumerate(rows)]
    for c in range(m):
        p = aug[c][c]
        aug[c] = [v / p for v in aug[c]]
        for r in range(m):
            if r != c and aug[r][c] != 0:
                f = aug[r][c]
                aug[r] = [v - f * u for v, u in zip(aug[r], aug[c])]
    return [row[m:] for row in aug]


def solve(net):
    ids = {name: i for i, name in enumerate(net["nodes"])}
    n = len(ids)
    ends = [(ids[l["a"]], ids[l["b"]]) for l in net["links"]]
    weights = [l["quality"] for l in net["links"]]
    m = n - 1  # the last node is grounded
    lap = laplacian(n, ends, weights, np.float64)[:m, :m]
    x64 = np.linalg.inv(lap)
    pad = np.zeros((n, n))
    pad[:m, :m] = x64
    fast = probabilities(pad, ends, weights)
    # The same, solved a second way: pinv of the full Laplacian.
    full = np.linalg.pinv(laplacian(n, ends, weights, np.float64))
    second = probabilities(full, ends, weights)
    assert max(abs(a - b) for a, b in zip(fast, second)) < 1e-9, "inv and pinv disagree"
    if n <= EXACT_UP_TO:
        fw = [Fraction(repr(w)) for w in weights]  # the decimals JavaScript wrote, not their binary approximations
        lap_f = [[Fraction(0)] * m for _ in range(m)]
        for (a, b), w in zip(ends, fw):
            if a == b:
                continue
            if a < m:
                lap_f[a][a] += w
            if b < m:
                lap_f[b][b] += w
            if a < m and b < m:
                lap_f[a][b] -= w
                lap_f[b][a] -= w
        inv = exact_inverse(lap_f)
        xf = [[Fraction(0)] * n for _ in range(n)]
        for i in range(m):
            for j in range(m):
                xf[i][j] = inv[i][j]
        truth = [float(p) for p in probabilities(xf, ends, fw)]
        kind = "exact"
    else:
        # Newton-Schulz in extended precision: X <- X (2 I - L X), from the float64 inverse.
        lap_l = laplacian(n, ends, weights, np.longdouble)[:m, :m]
        x = x64.astype(np.longdouble)
        eye = np.eye(m, dtype=np.longdouble)
        for _ in range(3):
            x = x @ (2 * eye - lap_l @ x)
        padl = np.zeros((n, n), dtype=np.longdouble)
        padl[:m, :m] = x
        truth = [float(p) for p in probabilities(padl, ends, [np.longdouble(w) for w in weights])]
        kind = "refined"
    err = max(abs(a - b) for a, b in zip(fast, truth))
    assert err < 1e-10, f"float64 and {kind} disagree by {err}"
    assert abs(sum(truth) - (n - 1)) < 1e-9, "Foster's theorem fails"
    assert all(-1e-12 <= p <= 1 + 1e-12 for p in truth)
    return truth, kind, err


def main():
    nets = json.load(open(sys.argv[1]))
    out = {}
    for name, net in nets.items():
        truth, kind, err = solve(net)
        out[name] = [round(min(1.0, max(0.0, p)), 10) for p in truth]
        print(f"{len(net['nodes']):4d} nodes {len(net['links']):5d} links  {kind:8s} float64 off by {err:.1e}  {name}")
    with open(sys.argv[2], "w") as f:
        json.dump(out, f, separators=(",", ":"))


main()
