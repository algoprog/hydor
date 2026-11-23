"""The output layer and its cross-entropy in one pass, for a large vocabulary on the CPU (training).

The plain way (logits of every position over the whole vocabulary, as a float tensor, then a log-softmax, then the loss, and all of it
again in the backward pass) is memory-bound: for a 248k vocabulary it writes and reads the logits a dozen times, and that was most of
a training step. Here the logits of a block of positions are made once by one matrix product (bf16 on a CPU that has it under
autocast), the softmax is done on pieces of them small enough to stay in the cache (a running maximum and sum per piece), and the
gradients (of the hidden states and of the output table) are made right away from the same logits by two more matrix products, so
nothing is recomputed and only one block of logits is ever in memory. The result is the same weighted cross-entropy and the same
gradients as the plain way, up to rounding (the logits are rounded to bf16 under autocast in both).
"""
from __future__ import annotations

import torch

ROWS = 1024         # positions per block of logits (a block is ROWS x vocabulary x 2 bytes in bf16)
PIECE_ROWS = 128    # the softmax is done on pieces of PIECE_ROWS positions ...
PIECE_COLS = 8192   # ... by PIECE_COLS ids: 4 MB of floats, which stays in the cache

_blocks: dict = {}          # the block of logits and the product's output are kept between calls: a fresh gigabyte each time is page faults
_wcache: dict = {}          # the output table cast to the compute type, kept while it is not changed


def _buffer(key: tuple, shape: tuple, dtype):
    b = _blocks.get(key)
    if b is None or b.shape != shape or b.dtype != dtype:
        _blocks.clear()
        b = _blocks[key] = torch.empty(shape, dtype=dtype)
    return b


def _cast_table(W: torch.Tensor, dtype):
    if W.dtype == dtype:
        return W.detach()
    key = (id(W), W._version, dtype)
    hit = _wcache.get('w')
    if hit is not None and hit[0] == key:
        return hit[1]
    c = W.detach().to(dtype)
    _wcache['w'] = (key, c)
    return c


class FusedCrossEntropy(torch.autograd.Function):
    """sum over positions of weight * (logsumexp(z W^T over the ids not in `never`) - z . W[target]); the gradients are made in the
    forward pass (the loss is a plain sum, so they do not depend on what the caller does with it but a factor)."""

    @staticmethod
    def forward(ctx, z, W, targets, weights, never):
        cd = torch.bfloat16 if torch.is_autocast_enabled('cpu') else torch.float32
        with torch.autocast('cpu', enabled=False):
            M, R = z.shape
            V = W.shape[0]
            Wc = _cast_table(W, cd)
            zc = z.detach().to(cd)
            weights = weights.detach().float()
            rows = ROWS if cd == torch.bfloat16 else ROWS // 2
            cols = PIECE_COLS
            nt = V // cols                              # whole pieces; the last piece is the rest of the vocabulary too
            nt = max(nt, 1)
            edges = [i * cols for i in range(nt)] + [V]
            never = sorted(set(int(i) for i in never if 0 <= int(i) < V))
            dz = torch.empty(M, R, dtype=torch.float32)
            dW = None
            total = torch.zeros((), dtype=torch.float32)
            for r0 in range(0, M, rows):
                r1 = min(M, r0 + rows)
                n = r1 - r0
                L = _buffer('L', (rows, V), cd)[:n]
                torch.mm(zc[r0:r1], Wc.t(), out=L)
                t, w = targets[r0:r1], weights[r0:r1]
                ar = torch.arange(n)
                tl = L[ar, t].float()                    # the logit of the target, as rounded as the others
                Ms = torch.empty(n, nt)
                Ss = torch.empty(n, nt)
                for a in range(0, n, PIECE_ROWS):
                    b = min(n, a + PIECE_ROWS)
                    for ti in range(nt):
                        v0, v1 = edges[ti], edges[ti + 1]
                        x = L[a:b, v0:v1].float()
                        for i in never:
                            if v0 <= i < v1:
                                x[:, i - v0] = float('-inf')
                        m = x.amax(-1, keepdim=True)
                        x.sub_(m).exp_()
                        Ss[a:b, ti] = x.sum(-1)
                        Ms[a:b, ti] = m[:, 0]
                        L[a:b, v0:v1] = x                # e = exp(logit - the piece's maximum), rounded like the logits were
                gm = Ms.amax(-1, keepdim=True)
                lse = gm[:, 0] + torch.log((Ss * torch.exp(Ms - gm)).sum(-1))
                total += ((lse - tl) * w).sum()
                # the gradient of the logits is weight * (softmax - onehot): softmax = e * exp(piece max - lse)
                fac = (torch.exp(Ms - lse[:, None]) * w[:, None]).to(cd)          # (a per-row factor rounded like the logits: its error is below theirs)
                if nt > 1:                               # the equal pieces in one pass, then the last (longer) one
                    L.as_strided((n, nt - 1, cols), (V, cols, 1)).mul_(fac[:, :nt - 1, None])
                L[:, edges[nt - 1]:].mul_(fac[:, nt - 1:nt])
                L[ar, t] = (L[ar, t].float() - w).to(cd)
                dz[r0:r1] = (L @ Wc).float()
                out = _buffer('dW', (V, R), cd)
                torch.mm(L.t(), zc[r0:r1], out=out)
                if dW is None:
                    dW = out.float()
                else:
                    dW.add_(out)
        ctx.save_for_backward(dz, dW)
        ctx.dtypes = (z.dtype, W.dtype)
        return total

    @staticmethod
    def backward(ctx, g):
        dz, dW = ctx.saved_tensors
        zd, Wd = ctx.dtypes
        return (dz * g).to(zd), (dW * g).to(Wd), None, None, None
