"""The engine: loads a release folder (and the personal model beside it) and answers suggest requests.

A request is cut into the context and R (the word being typed with the whitespace before it); both models read the context; the plan
(mix, llm or slm) decides which distribution the word is decoded from; the decoded word and its confidence are compared with the
threshold for the asked precision.
"""
from __future__ import annotations

import json
import os
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Callable, Optional

import numpy as np
import torch

from . import cache as cache_mod
from . import mix as mix_mod
from . import vocab as V
from .decode import decode, next_word_text, text_after
from .lid import Lid
from .llm import LlamaClient, LlmError, dense_from_top
from .model import SLM, State, build_model, config_from_dict, last_logits
from .tokbytes import PrefixIndex, end_token_ids, token_bytes

FORMAT = 'hydor-suggest/1'
DEFAULTS = {'k': 1000, 'typed_words': 100, 'context_words': 100, 'max_tokens': 8, 'sessions': 20}
PERSONAL_LANG_TOKENS = 2000          # the person's own tokens in a language from which the personal model counts as trained on it
MAX_TYPED_BYTES = 128


def _load_safetensors(path: str) -> dict:
    from safetensors.torch import load_file
    return load_file(path)


def _read_json(path: str):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def theta_for(calibration: dict, plan: str, precision: float) -> float:
    """The confidence threshold for a plan at the asked precision: linear between the listed precisions, clamped to the first and
    last. A plan with no table uses the mix's; with none at all the precision itself."""
    table = calibration.get(plan) or calibration.get('mix') or {}
    pts = sorted((float(k), float(v)) for k, v in table.items())
    if not pts:
        return float(precision)
    if precision <= pts[0][0]:
        return pts[0][1]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if precision <= x1:
            return y0 + (y1 - y0) * (precision - x0) / (x1 - x0)
    return pts[-1][1]


class SlmRunner:
    """The small model with an incremental state: the state after the last context is kept and extended when the next one only adds
    tokens; decoding steps run on copies of it (a State is never changed in place)."""

    def __init__(self, model: SLM):
        self.model = model
        self.ids: list = []
        self.state: Optional[State] = None
        self.base_row: Optional[torch.Tensor] = None       # log-probabilities after self.ids
        self.fed = 0                                       # tokens run through the model (the statistics, the tests)
        self._steps: dict = {}                             # path -> (log-probabilities, state), for this context

    def prepare(self, ids: list) -> None:
        n = len(self.ids)
        if self.state is not None and len(ids) >= n and ids[:n] == self.ids:
            if len(ids) > n:
                self._feed(ids[n:])
        else:
            self.state, self.base_row = None, None
            self._feed(ids)
        self.ids = list(ids)
        self._steps = {(): (self.base_row, self.state)}

    def _feed(self, ids: list) -> None:
        row, self.state = last_logits(self.model, ids, self.state)
        self.base_row = torch.log_softmax(row, -1)
        self.fed += len(ids)

    def logprobs(self, path: tuple) -> torch.Tensor:
        """Log-probabilities of the next token after the context and the tokens of `path` (small-model ids)."""
        hit = self._steps.get(path)
        if hit is None:
            parent = self._steps.get(path[:-1])
            if parent is None:
                self.logprobs(path[:-1])
                parent = self._steps[path[:-1]]
            row, st = last_logits(self.model, [path[-1]], parent[1])
            hit = self._steps[path] = (torch.log_softmax(row, -1), st)
            self.fed += 1
        return hit[0]


@dataclass
class Prepared:
    surface: str
    R: bytes                  # the word being typed with the whitespace before it
    target_text: str          # the typed text before R (its last words)
    agent_ctx: str
    doc_ctx: str
    agent_ids: np.ndarray     # Qwen ids
    doc_ids: np.ndarray
    target_ids: np.ndarray
    llm_prompt: list          # what the language model reads before the next token
    slm_ids: list             # what the small model reads (its own ids)


class Release:
    """What a release folder holds, loaded."""

    def __init__(self, folder: str):
        self.folder = folder
        cfg = _read_json(os.path.join(folder, 'config.json'))
        if cfg.get('format') != FORMAT:
            raise ValueError(f"{folder}: unknown format {cfg.get('format')!r}")
        if list(cfg.get('specials') or V.SPECIALS) != V.SPECIALS:
            raise ValueError('the release has other specials than this engine')
        self.config = cfg
        self.slm_config = config_from_dict(cfg['slm'])
        self.V = int(cfg['llm_vocab'])
        if self.slm_config.vocab != self.V + V.NSPEC:
            raise ValueError('the small model\'s vocabulary is not the specials plus the language model\'s')
        self.max_ctx = int(cfg.get('max_ctx_tokens') or V.MAX_CTX_TOKENS)
        from tokenizers import Tokenizer
        self.tok = Tokenizer.from_file(os.path.join(folder, 'tokenizer.json'))
        self.tok.no_truncation()
        self.tok.no_padding()
        self.tb = token_bytes(self.tok, self.V)
        end_ids = end_token_ids(self.tok, self.V)
        self.index = PrefixIndex(self.tb, end_ids)
        eot = self.tok.token_to_id('<|endoftext|>')
        self.eos = int(cfg['llm_eos']) if cfg.get('llm_eos') is not None else (eot if eot is not None and eot < self.V else -1)
        self.gate = mix_mod.Gate.load(os.path.join(folder, 'gate.json')) if os.path.isfile(os.path.join(folder, 'gate.json')) else None
        sw = os.path.join(folder, 'switch.json')
        self.switch = mix_mod.Switch.load(sw) if os.path.isfile(sw) else mix_mod.Switch()
        self.lid = Lid.load(folder)
        cal = os.path.join(folder, 'calibration.json')
        self.calibration = _read_json(cal) if os.path.isfile(cal) else {}
        cf = os.path.join(folder, 'cache.json')
        self.cache_fits = dict(cache_mod.DEFAULT_FITS)
        if os.path.isfile(cf):
            for plan, d in _read_json(cf).items():
                self.cache_fits[plan] = cache_mod.CacheFit(float(d['a']), float(d['b']), float(d['c']))
        self.state_dict = _load_safetensors(os.path.join(folder, 'model.safetensors'))


class Engine:
    def __init__(self):
        self.release: Optional[Release] = None
        self.model: Optional[SLM] = None
        self.runner: Optional[SlmRunner] = None
        self.gate: Optional[mix_mod.Gate] = None
        self.kind = 'base'
        self.languages: dict = {}
        self.client: Optional[LlamaClient] = None
        self.opts = dict(DEFAULTS)
        self.caches: Optional[cache_mod.SessionCaches] = None
        self._session_texts: dict = {}
        self._enc: OrderedDict = OrderedDict()
        self.llm_error: Optional[str] = None
        self.requests = 0
        self.durations: list = []

    # ---- loading ----------------------------------------------------------------------------------------------------------
    def load(self, model_dir: str, personal_dir: Optional[str] = None, llm_url: Optional[str] = None, threads: int = 0,
             options: Optional[dict] = None) -> dict:
        if threads and threads > 0:
            torch.set_num_threads(int(threads))
        self.opts = dict(DEFAULTS)
        self.opts.update({k: v for k, v in (options or {}).items() if v is not None})
        if self.release is None or os.path.abspath(self.release.folder) != os.path.abspath(model_dir):
            self.release = Release(model_dir)
        rel = self.release
        model, kind, self.languages = None, 'base', {}
        self.gate = rel.gate
        personal_error = None
        if personal_dir and os.path.isfile(os.path.join(personal_dir, 'model.safetensors')):
            try:
                cfg = config_from_dict(_read_json(os.path.join(personal_dir, 'config.json')).get('slm') or rel.config['slm'])
                model = build_model(cfg, _load_safetensors(os.path.join(personal_dir, 'model.safetensors')))
                if cfg.vocab != rel.slm_config.vocab:
                    raise ValueError('the personal model has another vocabulary')
                kind = 'personal'
                mp = os.path.join(personal_dir, 'meta.json')
                if os.path.isfile(mp):
                    self.languages = {str(k): int(v) for k, v in (_read_json(mp).get('languages') or {}).items()}
                gp = os.path.join(personal_dir, 'gate.json')
                if os.path.isfile(gp):
                    self.gate = mix_mod.Gate.load(gp)
            except Exception as e:                    # a broken personal model never stops the base one
                model, kind, self.languages, self.gate = None, 'base', {}, rel.gate
                personal_error = str(e)
        if model is None:
            model = build_model(rel.slm_config, rel.state_dict)
        self.model, self.kind = model, kind
        self.runner = SlmRunner(model)
        self.runner.prepare([V.BOS, V.DOC])            # warms the threads and gives the first request a state
        if self.client is not None:
            self.client.close()
        self.client = LlamaClient(llm_url, int(self.opts['k'])) if llm_url else None
        self.llm_error = None
        self.caches = cache_mod.SessionCaches(rel.V, int(self.opts['sessions']))
        for session, texts in list(self._session_texts.items()):
            self._set_session_cache(session, texts)
        out = {'model': kind, 'languages': dict(self.languages)}
        if personal_error:
            out['personal_error'] = personal_error
        return out

    # ---- tokens -----------------------------------------------------------------------------------------------------------
    def encode(self, text: str) -> np.ndarray:
        """Qwen ids of a text (tokenized alone, no special tokens); remembered."""
        if not text:
            return np.zeros(0, dtype=np.int64)
        hit = self._enc.get(text)
        if hit is None:
            hit = np.asarray(self.release.tok.encode(text, add_special_tokens=False).ids, dtype=np.int64)
            self._enc[text] = hit
            if len(self._enc) > 4096:
                self._enc.popitem(last=False)
        else:
            self._enc.move_to_end(text)
        return hit

    # ---- sessions ---------------------------------------------------------------------------------------------------------
    def session(self, session: str, texts: list) -> None:
        self._session_texts[session] = [V.nfc(t) for t in texts if t]
        while len(self._session_texts) > int(self.opts['sessions']):
            self._session_texts.pop(next(iter(self._session_texts)))
        if self.caches is not None:
            self._set_session_cache(session, self._session_texts[session])

    def _set_session_cache(self, session: str, texts: list) -> None:
        self.caches.set(session, [self.encode(t) for t in texts])

    # ---- the plan ---------------------------------------------------------------------------------------------------------
    def choose_plan(self, surface: str, typed_ids: np.ndarray, ctx_ids: np.ndarray, use_switch: bool) -> tuple:
        """(plan, language guessed or None)."""
        rel = self.release
        lang = None
        if rel.lid is not None and surface != 'doc':
            ids = typed_ids if len(typed_ids) >= 8 else np.concatenate([ctx_ids, typed_ids])
            lang, _, _ = rel.lid.guess(ids)
        if surface == 'doc':
            return ('llm' if self.client else 'slm'), lang
        if not self.client:
            return 'slm', lang
        if lang is not None and self.languages.get(lang, 0) >= PERSONAL_LANG_TOKENS:
            return 'mix', lang
        if use_switch and lang is not None:
            return ('llm' if rel.switch.choice(lang) == 'llm' else 'mix'), lang
        return 'mix', lang

    # ---- suggest ----------------------------------------------------------------------------------------------------------
    def prepare(self, req: dict) -> 'Prepared':
        """Cut a request into the contexts and the typed bytes, and tokenize what both models read."""
        rel, o = self.release, self.opts
        surface = req.get('surface') or 'text'
        if surface not in ('chat', 'doc', 'text'):
            raise ValueError(f'unknown surface {surface!r}')
        text = V.nfc(req.get('text') or '')
        typed_words = int(req.get('typed_words') or o['typed_words'])
        ctx_words = int(req['context_words']) if req.get('context_words') is not None else int(o['context_words'])
        ctx_text, R_str = V.split_typed(text)
        target_text = V.last_words(ctx_text, typed_words)
        agent_ctx = V.last_words(V.nfc(req.get('reply') or ''), ctx_words) if surface == 'chat' else ''
        doc_ctx = V.last_words(V.nfc(req.get('doc') or ''), ctx_words) if surface == 'doc' else ''
        agent_ids, doc_ids, target_ids = self.encode(agent_ctx), self.encode(doc_ctx), self.encode(target_text)
        llm_prefix = self.encode(V.build_prefix(agent_ctx, '', doc_ctx))
        if not len(llm_prefix):
            llm_prefix = np.array([max(rel.eos, 0)], dtype=np.int64)
        llm_prompt = np.concatenate([llm_prefix, target_ids]).tolist()
        # the small model: its prefix, then the target; a target that would not fit is cut from the front
        slm_prefix = V.prefix_from_ids(surface, V.to_slm(agent_ids), (), V.to_slm(doc_ids), rel.max_ctx)
        room = rel.slm_config.max_len - len(slm_prefix) - int(o['max_tokens']) * 2 - 1
        slm_target = V.to_slm(target_ids)[-room:] if room > 0 else V.to_slm(target_ids)[:0]
        slm_ids = slm_prefix + [int(t) for t in slm_target]
        return Prepared(surface, R_str.encode('utf-8'), target_text, agent_ctx, doc_ctx, agent_ids, doc_ids, target_ids, llm_prompt, slm_ids)

    def suggest(self, req: dict, cancelled: Optional[Callable] = None) -> dict:
        if self.release is None:
            raise RuntimeError('no model is loaded')
        t0 = time.perf_counter()
        rel = self.release
        pr = self.prepare(req)
        surface, R, target_ids, llm_prompt, slm_ids = pr.surface, pr.R, pr.target_ids, pr.llm_prompt, pr.slm_ids
        if len(R) > MAX_TYPED_BYTES:
            return self._empty(t0, req)
        plan, lang = self.choose_plan(surface, target_ids, np.concatenate([pr.agent_ids, pr.doc_ids]), bool(req.get('switch', True)))
        want_cache = bool(req.get('cache', True)) and surface == 'chat' and self.caches is not None
        extras, extra_key = [], None
        if want_cache:
            sess = req.get('session')
            known = {hash(t) for t in self._session_texts.get(sess, ())} if sess else set()
            texts = [t for t in (V.nfc(req.get('reply') or ''), V.nfc(req.get('prev') or '')) if t and hash(t) not in known]
            extras = [self.encode(t) for t in texts]
            extra_key = tuple(hash(t) for t in texts)
        precision = float(req.get('precision') or 0.4)
        want_next = bool(req.get('next', True))
        used = plan
        stats = {'llm': 0.0, 'slm': 0.0}
        args = (slm_ids, llm_prompt, target_ids, R, req, extras, extra_key, want_cache, precision, want_next, cancelled)
        try:
            result = self._decode(plan, *args, stats)
        except LlmError as e:                       # the language model stopped answering: this suggestion comes from the small model
            if plan == 'slm':
                raise
            self.llm_error = str(e)
            used, stats = 'slm', {'llm': stats['llm'], 'slm': 0.0}
            result = self._decode('slm', *args, stats)
        t_llm, t_slm = stats['llm'], stats['slm']
        word, nxt, conf, conf_next = result
        theta = theta_for(rel.calibration, used, precision)
        show = bool(conf >= theta)
        show_next = bool(show and nxt and conf_next >= theta)
        total = (time.perf_counter() - t0) * 1000
        self._record(total)
        out = {'word': word, 'next': nxt, 'conf': conf, 'conf_next': conf_next, 'theta': theta, 'show': show,
               'show_next': show_next, 'plan': used,
               'ms': {'total': round(total, 1), 'llm': round(t_llm, 1), 'slm': round(t_slm, 1)}}
        if lang:
            out['lang'] = lang
        return out

    def _empty(self, t0: float, req: dict) -> dict:
        total = (time.perf_counter() - t0) * 1000
        return {'word': '', 'next': '', 'conf': 0.0, 'conf_next': 0.0, 'theta': 1.0, 'show': False, 'show_next': False,
                'plan': 'slm', 'ms': {'total': round(total, 1), 'llm': 0.0, 'slm': 0.0}}

    def _decode(self, plan, slm_ids, llm_prompt, target_ids, R, req, extras, extra_key, want_cache, precision, want_next,
                cancelled, stats) -> tuple:
        rel = self.release
        n_target = len(target_ids)
        runner = self.runner
        t = time.perf_counter()
        runner.prepare(slm_ids)
        stats['slm'] += (time.perf_counter() - t) * 1000
        fit = rel.cache_fits.get(plan) or cache_mod.DEFAULT_FITS['mix']
        cs = None
        added = 0
        if want_cache:
            cs = self.caches.state(req.get('session'), extras, extra_key)
            cs.add_sequence(target_ids.tolist())
        memo: dict = {}
        target_list = [int(x) for x in target_ids]

        def row_fn(path: tuple) -> np.ndarray:
            nonlocal added
            hit = memo.get(path)
            if hit is not None:
                return hit
            p_slm = unk = None
            if plan in ('slm', 'mix'):
                t1 = time.perf_counter()
                lp = runner.logprobs(tuple(int(x) + V.NSPEC for x in path))
                p_slm, unk = V.spread(lp, rel.eos)
                stats['slm'] += (time.perf_counter() - t1) * 1000
            if plan == 'slm':
                p = p_slm
            else:
                t1 = time.perf_counter()
                ids, lps = self.client.top_logprobs(llm_prompt + list(path))
                stats['llm'] += (time.perf_counter() - t1) * 1000
                p = dense_from_top(ids, lps, rel.V, p_slm if plan == 'mix' else None)
                if plan == 'mix':
                    t1 = time.perf_counter()
                    gate = self.gate
                    if gate is None:
                        lam = 0.5
                    else:
                        lam = gate.lam(mix_mod.gate_features(p, p_slm, unk, n_target + len(path), 1))
                    p = mix_mod.linear(p, p_slm, lam)
                    stats['slm'] += (time.perf_counter() - t1) * 1000
            if cs is not None:
                for j in range(added, len(path)):
                    cs.add(path[j - 1] if j else (target_list[-1] if target_list else cs.bos), int(path[j]))
                added = max(added, len(path))
                hist = path[-1] if path else (target_list[-1] if target_list else None)
                p = cs.mix(p, hist, hist is not None, fit)
            memo[path] = p
            return p

        d = decode(row_fn, rel.index, R, (), int(self.opts['max_tokens']), cancelled)
        word = text_after(d.produced, R)
        conf = d.conf
        nxt, conf_next = '', 0.0
        theta = theta_for(rel.calibration, plan, precision)
        if want_next and d.ended and not d.eot and conf >= theta:
            d2 = decode(row_fn, rel.index, b'', d.path, int(self.opts['max_tokens']), cancelled)
            nxt, conf_next = next_word_text(d2.produced), d2.conf
        return word, nxt, conf, conf_next

    # ---- statistics -------------------------------------------------------------------------------------------------------
    def _record(self, ms: float) -> None:
        self.requests += 1
        self.durations.append(ms)
        if len(self.durations) > 500:
            del self.durations[:len(self.durations) - 500]

    def percentile(self, q: float) -> Optional[float]:
        if not self.durations:
            return None
        s = sorted(self.durations)
        return round(s[min(len(s) - 1, int(q * (len(s) - 1) + 0.5))], 1)
