"""Running the harness on a GPU: a device-aware SLM scorer, the memory cap, and the device option.

The SLM scorer (ws/slm.py) and its vocabulary (ws/vocab.py) are CPU code; `to_device` moves them without changing them:
the model goes to the device behind a thin wrapper that moves the input ids, and the vocabulary's lookup tensors
(Vocab._t(), used by Vocab.spread) are moved too, so spread() and the log-softmax run on the device.
tests/test_gpu.py checks that the device run gives the CPU's numbers.
"""
from __future__ import annotations

import os

import torch
import torch.nn as nn


class _ToDevice(nn.Module):
    """model(ids, keep=...) with the ids moved to the model's device."""

    def __init__(self, model, device):
        super().__init__()
        self.model, self.device = model, device

    def forward(self, ids, *a, **kw):
        return self.model(ids.to(self.device), *a, **kw)

    def __getattr__(self, name):
        try:
            return super().__getattr__(name)
        except AttributeError:
            return getattr(self.model, name)


def to_device(scorer, device) -> None:
    """Move an SLMScorer to `device` (in place)."""
    device = torch.device(device)
    scorer.model = _ToDevice(scorer.model.to(device).eval(), device)
    v = scorer.vocab
    t = v._t()
    v._torch = {k: x.to(device) if torch.is_tensor(x) else x for k, x in t.items()}
    scorer.device = device


def setup_device(device: str):
    """The torch device for `--device cpu|cuda` (`cuda` or `cuda:N`), with WS_GPU_MEM_GB (e.g. 6) as a hard cap on this
    process's GPU memory: the GPUs are shared with live services, so a run that needs more fails here, inside this process."""
    dev = torch.device(device)
    if dev.type == "cuda":
        if not torch.cuda.is_available():
            raise SystemExit("--device cuda: no GPU visible (is CUDA_VISIBLE_DEVICES empty? use .venv-gpu)")
        idx = dev.index if dev.index is not None else torch.cuda.current_device()
        torch.cuda.set_device(idx)
        if os.environ.get("WS_GPU_MEM_GB"):
            total = torch.cuda.get_device_properties(idx).total_memory
            torch.cuda.set_per_process_memory_fraction(min(1.0, float(os.environ["WS_GPU_MEM_GB"]) * 2 ** 30 / total), idx)
        dev = torch.device("cuda", idx)
    return dev
