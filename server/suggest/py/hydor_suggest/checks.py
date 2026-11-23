"""Compares the ONNX graph with model.py (development: `export_onnx.py --check`; needs torch and ONNX Runtime)."""
from __future__ import annotations

import numpy as np


def compare_with_torch(graph: str, cfg, weights: str, chunks=(17, 1, 1, 12, 1), seed: int = 0) -> float:
    """The largest difference between the two models' log-probabilities (the finite ones) after the same chunks of random tokens."""
    import torch
    from safetensors.torch import load_file
    from .model import build_model, last_logits as torch_last
    from .ort_slm import OrtSlm, last_logits as ort_last, log_softmax
    tm = build_model(cfg, load_file(weights))
    om = OrtSlm(cfg, weights, graph=graph, threads=1)
    rng = np.random.default_rng(seed)
    ts = os_ = None
    worst = 0.0
    for n in chunks:
        ids = [int(x) for x in rng.integers(6, cfg.vocab, n)]
        a, ts = torch_last(tm, ids, ts)
        b, os_ = ort_last(om, ids, os_)
        la, lb = torch.log_softmax(a, -1).numpy(), log_softmax(b)
        fin = np.isfinite(la)
        if not np.array_equal(fin, np.isfinite(lb)):
            return float('inf')
        worst = max(worst, float(np.abs(la[fin] - lb[fin]).max()))
    return worst
