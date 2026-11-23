"""The small model on ONNX Runtime and NumPy: what the suggestion worker runs (no torch).

The body (the layers, one chunk of new tokens at a time, with the state of the earlier ones) is the ONNX graph slm.onnx (graph.py
describes it); its weights are put in when the session is made, from a model.safetensors (a release's or a person's), so one graph serves
both. The embedding table (the biggest part of the model: 248k rows) stays in NumPy: a token's row is looked up there, and the output
layer, the table times the body's last hidden state, is a product over its rows in NumPy, split over the threads. The numbers are
model.py's within rounding (the tests and `export_onnx.py --check` compare them).
"""
from __future__ import annotations

import json
import os
import shutil
import tempfile
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

import numpy as np

from .config import SLMConfig, config_to_dict
from .vocab import NEVER_PREDICT

GRAPH_NAME = 'slm.onnx'
BUNDLED_GRAPH = os.path.join(os.path.dirname(os.path.abspath(__file__)), GRAPH_NAME)
MIN_ORT = (1, 17)                    # the graph uses opset 18


class GraphError(Exception):
    """The graph or the weights cannot run here (said as it is to the person)."""


class State:
    """The incremental state: the tokens seen, and per layer the convolution's last values or the attention's (keys, values)."""

    def __init__(self, layers, pos: int = 0):
        self.layers, self.pos = layers, pos


def graph_metadata(path: str) -> dict:
    """The key/value metadata of an ONNX file, read without loading it: the top-level fields of its protobuf are scanned (the graph's own
    bytes are skipped), so this needs neither onnx nor a session."""
    out = {}
    with open(path, 'rb') as f:
        data = f.read()
    i, n = 0, len(data)

    def varint(i):
        v = shift = 0
        while True:
            b = data[i]
            i += 1
            v |= (b & 0x7F) << shift
            if not b & 0x80:
                return v, i
            shift += 7

    while i < n:
        tag, i = varint(i)
        field, wire = tag >> 3, tag & 7
        if wire == 0:
            _, i = varint(i)
        elif wire == 2:
            ln, i = varint(i)
            if field == 14:                       # metadata_props: StringStringEntryProto {1: key, 2: value}
                j, end, key, val = i, i + ln, '', ''
                while j < end:
                    t, j = varint(j)
                    l2, j = varint(j)
                    s = data[j:j + l2].decode('utf-8', 'replace')
                    j += l2
                    if t >> 3 == 1:
                        key = s
                    elif t >> 3 == 2:
                        val = s
                out[key] = val
            i += ln
        elif wire == 1:
            i += 8
        elif wire == 5:
            i += 4
        else:
            raise GraphError('not an ONNX file')
    return out


def _same_architecture(a: dict, b: dict) -> bool:
    drop = lambda d: {k: v for k, v in d.items() if k != 'vocab'}      # the table is not in the graph
    return drop(a) == drop(b)


def find_graph(cfg: SLMConfig, folders: list) -> str:
    """The graph for this configuration: a slm.onnx in one of the folders (a release's own first), else the one that comes with the app."""
    tried = []
    for p in [os.path.join(f, GRAPH_NAME) for f in folders if f] + [BUNDLED_GRAPH]:
        if not os.path.isfile(p):
            continue
        try:
            meta = json.loads(graph_metadata(p).get('hydor_slm') or 'null')
        except Exception:
            meta = None
        if meta and _same_architecture(meta, config_to_dict(cfg)):
            return p
        tried.append(p)
    raise GraphError('no graph for this model (%s: %s)' % ('a different architecture than ' + ', '.join(tried) if tried else 'none found', GRAPH_NAME))


def _check_ort():
    try:
        import onnxruntime as ort
    except Exception as e:                      # not installed, or a build this computer cannot load
        raise GraphError(f'ONNX Runtime could not be loaded on this computer ({type(e).__name__}: {e})') from e
    try:
        have = tuple(int(x) for x in ort.__version__.split('.')[:2])
    except ValueError:
        have = MIN_ORT
    if have < MIN_ORT:
        raise GraphError(f'ONNX Runtime {ort.__version__} is too old (the word suggestions need {MIN_ORT[0]}.{MIN_ORT[1]} or newer)')
    return ort


def read_weights(path: str, names: list) -> dict:
    """The named float32 tensors of a safetensors file, as NumPy arrays."""
    from safetensors import safe_open
    out = {}
    with safe_open(path, framework='np') as f:
        have = set(f.keys())
        missing = [n for n in names if n not in have]
        if missing:
            raise GraphError(f'the weights do not fit the config: missing {missing[:3]}')
        for n in names:
            out[n] = np.ascontiguousarray(f.get_tensor(n), dtype=np.float32)
    return out


class OrtSlm:
    """The small model: a session of the graph with these weights, and the embedding table."""

    def __init__(self, cfg: SLMConfig, weights_path: str, graph: Optional[str] = None, threads: int = 0, folders: Optional[list] = None):
        ort = _check_ort()
        self.cfg = cfg
        self.kinds = cfg.layer_types()
        self.threads = max(1, int(threads or 0) or min(4, os.cpu_count() or 1))
        graph = graph or find_graph(cfg, folders or [])
        meta = graph_metadata(graph)
        wlist = json.loads(meta.get('hydor_weights') or '[]')
        sidecar = meta.get('hydor_sidecar') or 'slm.data'
        w = read_weights(weights_path, [src for _, src in wlist] + ['embed.weight'])
        table = w.pop('embed.weight')
        rows = cfg.vocab
        if table.ndim != 2 or table.shape != (rows, cfg.emb_rank or cfg.d):
            raise GraphError(f'the weights do not fit the config: embed.weight is {tuple(table.shape)}')
        self.table = table
        so = ort.SessionOptions()
        so.intra_op_num_threads = self.threads
        so.inter_op_num_threads = 1
        so.enable_mem_pattern = False                  # the shapes change with every chunk
        so.log_severity_level = 3
        keep = []                                      # the buffers must outlive the session
        for name, src in wlist:
            a = w[src]
            ov = ort.OrtValue.ortvalue_from_numpy(a)
            keep += [a, ov]                            # (the session does not own them: a value that is let go makes it crash)
            so.add_initializer(name, ov)
        # The graph's weights are named external data of a file that is never read (they are replaced above) but must exist: a folder
        # with a copy of the graph and an empty file of that name, which is gone once the session has been made.
        tmp = tempfile.mkdtemp(prefix='hydor-slm-')
        try:
            shutil.copyfile(graph, os.path.join(tmp, GRAPH_NAME))
            open(os.path.join(tmp, sidecar), 'wb').close()
            try:
                self.sess = ort.InferenceSession(os.path.join(tmp, GRAPH_NAME), so, providers=['CPUExecutionProvider'],
                                                 disabled_optimizers=['ConstantFolding'])
            except Exception as e:
                raise GraphError(f'ONNX Runtime could not load the model ({type(e).__name__}: {e})') from e
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        self._keep = (keep, so)
        self.out_names = [o.name for o in self.sess.get_outputs()]
        self.pool = ThreadPoolExecutor(self.threads) if self.threads > 1 else None
        self.graph = graph
        # A graph whose weights did not come in gives the same value for every word (ONNX Runtime would have used the empty ones).
        row = last_logits(self, [1, 5])[0]
        fin = row[np.isfinite(row)]
        if not len(fin) or float(fin.max() - fin.min()) < 1e-6:
            self.close()
            raise GraphError('ONNX Runtime did not take the model\'s weights (its output is the same for every word)')

    # ---- the state --------------------------------------------------------------------------------------------------------
    def init_state(self) -> State:
        cfg = self.cfg
        layers = []
        for kind in self.kinds:
            if kind == 'c':
                layers.append(np.zeros((cfg.kernel - 1, cfg.d), np.float32) if cfg.kernel > 1 else None)
            else:
                layers.append((np.zeros((cfg.kv_heads, 0, cfg.head_dim), np.float32), np.zeros((cfg.kv_heads, 0, cfg.head_dim), np.float32)))
        return State(layers, 0)

    # ---- the body ---------------------------------------------------------------------------------------------------------
    def body(self, ids, state: State) -> tuple:
        """Feeds ids (a list of ints) after `state`: (the last token's hidden state taken to the embedding's width [E], the new State).
        The state is not changed."""
        t = len(ids)
        if state.pos + t > self.cfg.max_len:
            raise ValueError('sequence longer than max_len')
        feeds = {'emb': self.table[np.asarray(ids, dtype=np.int64)], 'pos': np.array([state.pos], dtype=np.int64)}
        for i, kind in enumerate(self.kinds):
            s = state.layers[i]
            if kind == 'c':
                if s is not None:
                    feeds[f'conv_in.{i}'] = s
            else:
                feeds[f'k_in.{i}'], feeds[f'v_in.{i}'] = s
        got = dict(zip(self.out_names, self.sess.run(None, feeds)))
        new = []
        for i, kind in enumerate(self.kinds):
            if kind == 'c':
                new.append(got.get(f'conv_out.{i}'))
            else:
                new.append((got[f'k_out.{i}'], got[f'v_out.{i}']))
        return got['head_in'][0], State(new, state.pos + t)

    # ---- the output layer -------------------------------------------------------------------------------------------------
    def logits(self, z: np.ndarray) -> np.ndarray:
        """The table times z: the logits of the whole vocabulary [V] (float32), the specials that are never predicted at -inf."""
        table = self.table
        n = table.shape[0]
        if self.pool is None or n < 4096:
            row = table @ z
        else:
            row = np.empty(n, dtype=np.float32)
            step = -(-n // self.threads)
            list(self.pool.map(lambda a: np.matmul(table[a:a + step], z, out=row[a:a + step]), range(0, n, step)))
        row[list(NEVER_PREDICT)] = -np.inf
        return row

    def close(self) -> None:
        if self.pool is not None:
            self.pool.shutdown(wait=False)
            self.pool = None


def log_softmax(row: np.ndarray) -> np.ndarray:
    """Log-probabilities of a row of logits (float32; -inf stays -inf)."""
    m = row.max()
    e = np.exp(row - m)
    return row - m - np.float32(np.log(e.sum(dtype=np.float64)))


def last_logits(model: OrtSlm, ids, state: Optional[State] = None) -> tuple:
    """Feed ids (a list of ints) after `state` (a fresh one if None). Returns (the logits of the last position [V], float32, with the
    specials that are never predicted at -inf; the new State)."""
    if state is None:
        state = model.init_state()
    z, st = model.body(list(ids), state)
    return model.logits(z), st
