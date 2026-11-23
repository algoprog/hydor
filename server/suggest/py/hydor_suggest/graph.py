"""The small model's incremental step as an ONNX graph (what the suggestion worker runs through ONNX Runtime).

Making the graph needs the `onnx` package and no torch: `export_onnx.py` writes it (development and tests only; the worker only
loads the file). The graph is the model's body, one chunk of new tokens at a time, the way model.py's incremental forward runs:

  inputs   emb       [T, E]            the new tokens' rows of the embedding table (E = emb_rank, or d without a factorised embedding;
                                       the worker looks them up: the table is the biggest part of the model and stays in NumPy)
           pos       [1] int64         the tokens before this chunk (the rotary position of its first token)
           conv_in.i [K-1, d]          each short-convolution layer's last K-1 values
           k_in.i, v_in.i [kv, S, hd]  each attention layer's keys and values so far (S = 0 at the start; a sliding-window layer keeps
                                       its last window-1)
  outputs  head_in   [1, E]            the last token's final hidden state, taken to the embedding's width (the output layer, the
                                       table times this, is NumPy's: the engine needs the log-probabilities of the whole vocabulary or
                                       of the rows it picks)
           conv_out.i, k_out.i, v_out.i   the new state (the inputs are never changed)

The weights are named initializers that carry no data (external data of a file that is never read): the worker puts the real ones in
when it makes the session, from a release's or a person's model.safetensors (`hydor_weights` in the model's metadata lists graph name,
safetensors name). One file therefore serves every model of the same configuration (`hydor_slm` in the metadata).
"""
from __future__ import annotations

import json
import math

import numpy as np

from .config import SLMConfig, config_to_dict

OPSET = 18
IR_VERSION = 10
INT_MAX = 2 ** 62
SIDECAR = 'slm.data'              # the file the empty external data points at (it must exist and may be empty)


def build(cfg: SLMConfig):
    """The ModelProto of the incremental step for this configuration."""
    import onnx
    from onnx import TensorProto as TP, helper, numpy_helper

    assert cfg.kernel >= 1 and (cfg.window == 0 or cfg.window >= 2), 'a sliding window of 1 keeps no keys'
    nodes, inits, weights = [], [], []
    consts: dict = {}
    count = [0]

    def uid(p):
        count[0] += 1
        return f'{p}_{count[0]}'

    def const(value, dtype=np.int64, shape=None):
        """A small constant, shared between uses."""
        a = np.asarray(value, dtype=dtype)
        if shape is not None:
            a = a.reshape(shape)
        key = (a.dtype.str, a.shape, a.tobytes())
        if key not in consts:
            consts[key] = uid('c')
            inits.append(numpy_helper.from_array(a, consts[key]))
        return consts[key]

    def ints(*v):
        return const(list(v), np.int64)

    def f32(v):
        return const(v, np.float32, ())

    def op(kind, ins, n=1, **attrs):
        outs = [uid(kind.lower()) for _ in range(n)]
        nodes.append(helper.make_node(kind, list(ins), outs, **attrs))
        return outs[0] if n == 1 else outs

    def weight(name, shape):
        """A weight of the safetensors file: an initializer with its shape and no data."""
        t = onnx.TensorProto()
        t.name = name
        t.data_type = TP.FLOAT
        t.dims.extend(int(x) for x in shape)
        t.data_location = onnx.TensorProto.EXTERNAL
        for k, v in (('location', SIDECAR), ('offset', '0'), ('length', str(4 * int(np.prod(shape))))):
            e = t.external_data.add()
            e.key, e.value = k, v
        inits.append(t)
        weights.append([name, name])
        return name

    def slice_(x, starts, ends, axes):
        """starts, ends: lists of ints or names of int64 tensors."""
        s = starts if isinstance(starts, str) else ints(*starts)
        e = ends if isinstance(ends, str) else ints(*ends)
        return op('Slice', [x, s, e, ints(*axes)])

    d, H, KV, hd, K = cfg.d, cfg.heads, cfg.kv_heads, cfg.head_dim, cfg.kernel
    rot = cfg.rot_dim
    E = cfg.emb_rank or d
    eps = f32(cfg.norm_eps)
    two = f32(2.0)

    def rms(x, wname, width):
        sq = op('Pow', [x, two])
        mean = op('ReduceMean', [sq, ints(-1)], keepdims=1)
        den = op('Sqrt', [op('Add', [mean, eps])])
        return op('Mul', [op('Div', [x, den]), weight(wname, (width,))])

    def linear(x, wname, out, inn):
        return op('Gemm', [x, weight(wname, (out, inn))], transB=1)

    inputs = [helper.make_tensor_value_info('emb', TP.FLOAT, ['T', E]), helper.make_tensor_value_info('pos', TP.INT64, [1])]
    outputs = []
    kinds = cfg.layer_types()
    for i, kind in enumerate(kinds):
        if kind == 'c':
            if K > 1:
                inputs.append(helper.make_tensor_value_info(f'conv_in.{i}', TP.FLOAT, [K - 1, d]))
        else:
            inputs.append(helper.make_tensor_value_info(f'k_in.{i}', TP.FLOAT, [KV, f'S{i}', hd]))
            inputs.append(helper.make_tensor_value_info(f'v_in.{i}', TP.FLOAT, [KV, f'S{i}', hd]))

    # T (the chunk's length, a scalar and a vector) and the rotary tables' rows for the chunk
    t_vec = slice_(op('Shape', ['emb']), [0], [1], [0])
    t_scalar = op('Squeeze', [t_vec, ints(0)])
    if rot:
        inv = 1.0 / (cfg.rope_theta ** (np.arange(0, rot, 2, dtype=np.float32) / rot))
        ang = np.outer(np.arange(cfg.max_len, dtype=np.float32), inv.astype(np.float32))
        cos_t, sin_t = const(np.cos(ang), np.float32), const(np.sin(ang), np.float32)
        stop = op('Add', ['pos', t_vec])
        cos = slice_(cos_t, 'pos', stop, [0])
        sin = slice_(sin_t, 'pos', stop, [0])

    def rope(x):
        """x [H', T, hd]: the first `rot` dims rotated (half-split layout), the rest kept."""
        x1 = slice_(x, [0], [rot // 2], [2])
        x2 = slice_(x, [rot // 2], [rot], [2])
        a = op('Sub', [op('Mul', [x1, cos]), op('Mul', [x2, sin])])
        b = op('Add', [op('Mul', [x2, cos]), op('Mul', [x1, sin])])
        parts = [a, b]
        if hd > rot:
            parts.append(slice_(x, [rot], [hd], [2]))
        return op('Concat', parts, axis=2)

    def attention(h, i, window):
        q = op('Transpose', [op('Reshape', [linear(h, f'blocks.{i}.mixer.q_proj.weight', H * hd, d), ints(0, H, hd)])], perm=[1, 0, 2])
        k = op('Transpose', [op('Reshape', [linear(h, f'blocks.{i}.mixer.k_proj.weight', KV * hd, d), ints(0, KV, hd)])], perm=[1, 0, 2])
        v = op('Transpose', [op('Reshape', [linear(h, f'blocks.{i}.mixer.v_proj.weight', KV * hd, d), ints(0, KV, hd)])], perm=[1, 0, 2])
        if cfg.qk_norm:
            q, k = rms(q, f'blocks.{i}.mixer.q_norm.weight', hd), rms(k, f'blocks.{i}.mixer.k_norm.weight', hd)
        if rot:
            q, k = rope(q), rope(k)
        k_all = op('Concat', [f'k_in.{i}', k], axis=1)
        v_all = op('Concat', [f'v_in.{i}', v], axis=1)
        if window > 0:
            nk, nv = slice_(k_all, [-(window - 1)], [INT_MAX], [1]), slice_(v_all, [-(window - 1)], [INT_MAX], [1])
        else:
            nk, nv = op('Identity', [k_all]), op('Identity', [v_all])
        outputs.append((nk, f'k_out.{i}'))
        outputs.append((nv, f'v_out.{i}'))
        # which keys each query may read: the ones before it (and inside the window); the queries of one key head are laid out
        # one group after the other, so the mask is repeated for each
        s_scalar = op('Gather', [op('Shape', [k_all]), const(1, np.int64, ())], axis=0)
        qpos = op('Unsqueeze', [op('Range', [op('Sub', [s_scalar, t_scalar]), s_scalar, const(1, np.int64, ())]), ints(1)])
        kpos = op('Unsqueeze', [op('Range', [const(0, np.int64, ()), s_scalar, const(1, np.int64, ())]), ints(0)])
        allow = op('LessOrEqual', [kpos, qpos])
        if window > 0:
            allow = op('And', [allow, op('Less', [op('Sub', [qpos, kpos]), const(window, np.int64, ())])])
        mask = op('Where', [allow, f32(0.0), f32(-np.inf)])
        rep = H // KV
        if rep > 1:
            mask = op('Tile', [mask, ints(rep, 1)])
        qg = op('Reshape', [q, ints(KV, -1, hd)])                                  # [kv, rep*T, hd]
        scores = op('MatMul', [qg, op('Transpose', [k_all], perm=[0, 2, 1])])      # [kv, rep*T, S]
        scores = op('Add', [op('Mul', [scores, f32(1.0 / math.sqrt(hd))]), mask])
        ctx = op('MatMul', [op('Softmax', [scores], axis=-1), v_all])               # [kv, rep*T, hd]
        o = op('Reshape', [op('Transpose', [op('Reshape', [ctx, ints(H, -1, hd)])], perm=[1, 0, 2]), ints(-1, H * hd)])
        return linear(o, f'blocks.{i}.mixer.o_proj.weight', d, H * hd)

    def short_conv(h, i):
        bcx = linear(h, f'blocks.{i}.mixer.in_proj.weight', 3 * d, d)
        b, c, xx = op('Split', [bcx], n=3, axis=1, num_outputs=3)
        bx = op('Mul', [b, xx])
        if K > 1:
            full = op('Concat', [f'conv_in.{i}', bx], axis=0)                      # [K-1+T, d]
            outputs.append((slice_(full, [-(K - 1)], [INT_MAX], [0]), f'conv_out.{i}'))
        else:
            full = bx
        w = weight(f'blocks.{i}.mixer.conv', (K, d))
        y = None
        for j in range(K):
            part = slice_(full, [j], op('Add', [t_vec, ints(j)]), [0])
            term = op('Mul', [part, op('Gather', [w, const(j, np.int64, ())], axis=0)])
            y = term if y is None else op('Add', [y, term])
        return linear(op('Mul', [c, y]), f'blocks.{i}.mixer.out_proj.weight', d, d)

    # the chunk's input: the table's rows, taken up to the model's width
    x = 'emb'
    if cfg.emb_rank:
        x = op('Gemm', [x, weight('emb_proj.weight', (d, cfg.emb_rank))], transB=1)
    for i, kind in enumerate(kinds):
        h = rms(x, f'blocks.{i}.n1.weight', d)
        m = short_conv(h, i) if kind == 'c' else attention(h, i, cfg.window if kind == 's' else 0)
        if cfg.sandwich:
            m = rms(m, f'blocks.{i}.p1.weight', d)
        x = op('Add', [x, m])
        h = rms(x, f'blocks.{i}.n2.weight', d)
        gate = linear(h, f'blocks.{i}.mlp.gate.weight', cfg.ffn, d)
        up = linear(h, f'blocks.{i}.mlp.up.weight', cfg.ffn, d)
        act = op('Mul', [op('Mul', [gate, op('Sigmoid', [gate])]), up])
        m = linear(act, f'blocks.{i}.mlp.down.weight', d, cfg.ffn)
        if cfg.sandwich:
            m = rms(m, f'blocks.{i}.p2.weight', d)
        x = op('Add', [x, m])
    last = slice_(x, [-1], [INT_MAX], [0])
    last = rms(last, 'norm.weight', d)
    if cfg.emb_rank:
        last = op('MatMul', [last, weight('emb_proj.weight', (d, cfg.emb_rank))])      # the output layer's first factor: [1, rank]
    nodes.append(helper.make_node('Identity', [last], ['head_in']))

    outs = [helper.make_tensor_value_info('head_in', TP.FLOAT, [1, E])]
    for name, public in outputs:
        nodes.append(helper.make_node('Identity', [name], [public]))
        if public.startswith('conv_out'):
            outs.append(helper.make_tensor_value_info(public, TP.FLOAT, [K - 1, d]))
        else:
            outs.append(helper.make_tensor_value_info(public, TP.FLOAT, [KV, None, hd]))
    # a weight used twice (emb_proj) is one initializer
    seen, uniq_inits = set(), []
    for t in inits:
        if t.name not in seen:
            seen.add(t.name)
            uniq_inits.append(t)
    uniq_w = []
    for w in weights:
        if w not in uniq_w:
            uniq_w.append(w)
    graph = helper.make_graph(nodes, 'hydor_suggest_slm', inputs, outs, uniq_inits)
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid('', OPSET)], producer_name='hydor-suggest')
    model.ir_version = IR_VERSION
    for k, v in (('hydor_slm', json.dumps(config_to_dict(cfg), sort_keys=True)), ('hydor_weights', json.dumps(uniq_w)), ('hydor_sidecar', SIDECAR)):
        p = model.metadata_props.add()
        p.key, p.value = k, v
    return model


def write(model, path: str) -> None:
    """Saves the model and has onnx check it (its checker wants the empty external data file beside it for the moment)."""
    import os
    import onnx
    onnx.save_model(model, path)
    side = os.path.join(os.path.dirname(os.path.abspath(path)), SIDECAR)
    made = not os.path.exists(side)
    if made:
        open(side, 'wb').close()
    try:
        onnx.checker.check_model(path)
    finally:
        if made:
            os.remove(side)
