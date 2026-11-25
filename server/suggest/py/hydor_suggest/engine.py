"""The engine: loads a release folder (and the personal model beside it) and answers suggest requests.

A request is cut into the context and R (the word being typed with the whitespace before it); the language model and one of the
small models read the context (the published one, or the personal one: both are loaded, see Engine.pick_slot); the plan (mix, llm or
slm) decides which distribution the word is decoded from; the decoded word and its confidence are compared with the threshold for
the asked precision.
"""
from __future__ import annotations

import json
import os
import time
from collections import OrderedDict
from dataclasses import asdict, dataclass
from typing import Callable, Optional

import numpy as np

from . import cache as cache_mod
from . import mix as mix_mod
from . import vocab as V
from .decode import decode, next_word_text, text_after
from .lid import Lid, mostly_letters
from .llm import LlamaClient, LlmError, LlmUnavailable, dense_from_top
from .config import config_from_dict, config_to_dict
from .ort_slm import GraphError, OrtSlm, State, last_logits, log_softmax
from .tokbytes import PrefixIndex, end_token_ids, token_bytes

FORMAT = 'hydor-suggest/1'
LLM_BACKOFF = 30.0                   # seconds the language model is left alone after it failed
ENC_MAX_CHARS = 2_000_000            # the characters the token-id cache may hold
DEFAULTS = {'k': 1000, 'typed_words': 100, 'context_words': 100, 'max_tokens': 8, 'sessions': 20}
PERSONAL_LANG_TOKENS = 2000          # the person's own tokens in a language from which the personal model counts as trained on it
MAX_TYPED_BYTES = 128


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


def with_points(calibration: dict, extra: Optional[dict]) -> dict:
    """A release's calibration with the thresholds `extra` adds: points measured for that release the same way, at precisions its own
    table does not list (the app's pin of the release, pins.ts SMALL_MODEL.calibration). They go only into a plan the release has a
    table for, and never in place of a precision it lists."""
    out = {plan: (dict(t) if isinstance(t, dict) else t) for plan, t in (calibration or {}).items()}
    for plan, pts in (extra or {}).items():
        table = out.get(plan)
        if not isinstance(table, dict) or not isinstance(pts, dict):
            continue
        listed = {float(k) for k in table}
        for k, v in pts.items():
            if float(k) not in listed:
                table[str(k)] = float(v)
    return out


class SlmRunner:
    """The small model with an incremental state: the state after the last context is kept and extended when the next one only adds
    tokens; decoding steps run on copies of it (a State is never changed in place)."""

    def __init__(self, model: OrtSlm):
        self.model = model
        self.ids: list = []
        self.state: Optional[State] = None
        self.base_row: Optional[np.ndarray] = None         # log-probabilities after self.ids
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
        self.base_row = log_softmax(row)
        self.fed += len(ids)

    def logprobs(self, path: tuple) -> np.ndarray:
        """Log-probabilities of the next token after the context and the tokens of `path` (small-model ids)."""
        hit = self._steps.get(path)
        if hit is None:
            parent = self._steps.get(path[:-1])
            if parent is None:
                self.logprobs(path[:-1])
                parent = self._steps[path[:-1]]
            row, st = last_logits(self.model, [path[-1]], parent[1])
            hit = self._steps[path] = (log_softmax(row), st)
            self.fed += 1
        return hit[0]


class Slot:
    """One small model with its own incremental state (the published one, or the personal one), the gate that mixes it with the
    language model, and (the personal one) the languages the person wrote in, with their tokens."""

    def __init__(self, kind: str, model: OrtSlm, key, gate, languages: Optional[dict] = None):
        self.kind = kind                       # 'base' (the published model) | 'personal'
        self.model, self.key, self.gate = model, key, gate
        self.languages = languages or {}
        self.runner = SlmRunner(model)
        self.runner.prepare([V.BOS, V.DOC])    # warms the threads and gives the first request a state


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
        self.own_calibration = _read_json(cal) if os.path.isfile(cal) else {}
        self.calibration = self.own_calibration          # with the points the app adds (Engine.load)
        cf = os.path.join(folder, 'cache.json')
        self.cache_fits = dict(cache_mod.DEFAULT_FITS)
        if os.path.isfile(cf):
            for plan, d in _read_json(cf).items():
                self.cache_fits[plan] = cache_mod.CacheFit(float(d['a']), float(d['b']), float(d['c']))
        self.weights = os.path.join(folder, 'model.safetensors')
        if not os.path.isfile(self.weights):
            raise ValueError(f'{folder}: no model.safetensors')


class Engine:
    def __init__(self):
        self.release: Optional[Release] = None
        self.base: Optional[Slot] = None               # the published small model: always loaded
        self.personal: Optional[Slot] = None           # the personal one, when there is one: loaded beside it
        self.client: Optional[LlamaClient] = None
        self.opts = dict(DEFAULTS)
        self.caches: Optional[cache_mod.SessionCaches] = None
        self._session_texts: OrderedDict = OrderedDict()
        self._enc: OrderedDict = OrderedDict()
        self._enc_chars = 0
        self._clock: Callable = time.monotonic
        self.llm_down_until = 0.0
        self.llm_error: Optional[str] = None
        self.requests = 0
        self.durations: list = []

    # ---- the models in use ------------------------------------------------------------------------------------------------
    @property
    def primary(self) -> Optional[Slot]:
        """The small model that answers where nothing says otherwise: the personal one when there is one, else the published one."""
        return self.personal or self.base

    @property
    def model(self) -> Optional[OrtSlm]:
        return self.primary.model if self.primary else None

    @property
    def runner(self) -> Optional[SlmRunner]:
        return self.primary.runner if self.primary else None

    @property
    def gate(self) -> Optional[mix_mod.Gate]:
        return self.primary.gate if self.primary else None

    @property
    def kind(self) -> str:
        return 'personal' if self.personal else 'base'

    @property
    def languages(self) -> dict:
        return self.personal.languages if self.personal else {}

    # ---- loading ----------------------------------------------------------------------------------------------------------
    def load(self, model_dir: str, personal_dir: Optional[str] = None, llm_url: Optional[str] = None, threads: int = 0,
             options: Optional[dict] = None, calibration: Optional[dict] = None) -> dict:
        """Load a release and the personal model beside it (both stay loaded: the graph is the same, the weights are two sets), and
        connect the language model. `calibration`: thresholds the app adds to the release's own (with_points). Everything is built
        before anything is swapped in: a load that fails leaves the engine as it was."""
        threads = max(0, int(threads or 0))
        opts = dict(DEFAULTS)
        opts.update({k: v for k, v in (options or {}).items() if v is not None})
        same = self.release is not None and os.path.abspath(self.release.folder) == os.path.abspath(model_dir)
        rel = self.release if same else Release(model_dir)
        thresholds = with_points(rel.own_calibration, calibration)
        old = [x for x in (self.base, self.personal) if x is not None]
        base_model, base_key = self._slm(rel.slm_config, rel.weights, [rel.folder], threads, old)
        built = [base_model] if all(x.model is not base_model for x in old) else []     # the models made here (closed if the load fails)
        personal_model = personal_key = None
        languages, gate, personal_error = {}, rel.gate, None
        pw = os.path.join(personal_dir, 'model.safetensors') if personal_dir else None
        if pw and os.path.isfile(pw):
            try:
                cfg = config_from_dict(_read_json(os.path.join(personal_dir, 'config.json')).get('slm') or rel.config['slm'])
                if cfg.vocab != rel.slm_config.vocab:
                    raise ValueError('the personal model has another vocabulary')
                # the same graph as the published model's when it is the same architecture: one graph, two weight sets
                graph = base_model.graph if config_to_dict(cfg) == config_to_dict(rel.slm_config) else None
                personal_model, personal_key = self._slm(cfg, pw, [personal_dir, rel.folder], threads, old, graph)
                if all(x.model is not personal_model for x in old):
                    built.append(personal_model)
                mp = os.path.join(personal_dir, 'meta.json')
                if os.path.isfile(mp):
                    languages = {str(k): int(v) for k, v in (_read_json(mp).get('languages') or {}).items()}
                gp = os.path.join(personal_dir, 'gate.json')
                if os.path.isfile(gp):
                    gate = mix_mod.Gate.load(gp)
            except Exception as e:                    # a broken personal model never stops the published one
                if personal_model is not None and all(x.model is not personal_model for x in old):
                    personal_model.close()
                    built = [m for m in built if m is not personal_model]
                personal_model, personal_key, languages, gate = None, None, {}, rel.gate
                personal_error = str(e)
        try:
            kept = {id(x.model): x for x in old}
            base = kept.get(id(base_model)) or Slot('base', base_model, base_key, rel.gate)
            personal = None
            if personal_model is not None:
                personal = kept.get(id(personal_model)) or Slot('personal', personal_model, personal_key, gate, languages)
                personal.gate, personal.languages = gate, languages
            client = LlamaClient(llm_url, int(opts['k'])) if llm_url else None
        except Exception:
            for m in built:
                m.close()
            raise
        base.gate = rel.gate
        # nothing failed: swap it all in
        if self.client is not None:
            self.client.close()
        if not same:
            self._enc.clear()
            self._enc_chars = 0
        now = {id(base.model), id(personal.model) if personal else None}
        for x in old:
            if id(x.model) not in now:
                x.model.close()
        rel.calibration = thresholds
        self.opts, self.release, self.base, self.personal = opts, rel, base, personal
        self.client, self.llm_error, self.llm_down_until = client, None, 0.0
        self.caches = cache_mod.SessionCaches(rel.V, int(opts['sessions']))
        for session, texts in list(self._session_texts.items()):
            self._set_session_cache(session, texts)
        out = {'model': self.kind, 'languages': dict(self.languages)}
        if personal_error:
            out['personal_error'] = personal_error
        return out

    def _slm(self, cfg, weights: str, folders: list, threads: int, loaded: list, graph: Optional[str] = None) -> tuple:
        """The small model for these weights: the one already loaded when it is the same file (the same size and time) at the same
        threads, else a new one (its graph is the release's own, else the one that comes with the app)."""
        st = os.stat(weights)
        key = (os.path.abspath(weights), st.st_mtime_ns, st.st_size, threads, json.dumps(asdict(cfg), sort_keys=True))
        for x in loaded:
            if x.key == key:
                return x.model, key
        return OrtSlm(cfg, weights, graph=graph, threads=threads, folders=folders), key

    # ---- the language model's health -------------------------------------------------------------------------------------
    def llm(self) -> Optional[LlamaClient]:
        """The language model's client, or None when there is none or it failed less than LLM_BACKOFF seconds ago (plans are then made as
        if there were no language model: it is not asked again, and a hung server is not waited for at every keystroke)."""
        if self.client is None or self._clock() < self.llm_down_until:
            return None
        return self.client

    def _llm_failed(self, error: Exception) -> None:
        self.llm_error = str(error)
        self.llm_down_until = self._clock() + LLM_BACKOFF

    # ---- tokens -----------------------------------------------------------------------------------------------------------
    def encode(self, text: str) -> np.ndarray:
        """Qwen ids of a text (tokenized alone, no special tokens); remembered."""
        if not text:
            return np.zeros(0, dtype=np.int64)
        hit = self._enc.get(text)
        if hit is None:
            hit = np.asarray(self.release.tok.encode(text, add_special_tokens=False).ids, dtype=np.int64)
            self._enc[text] = hit
            self._enc_chars += len(text)
            while self._enc and (len(self._enc) > 4096 or self._enc_chars > ENC_MAX_CHARS):      # bounded by entries and by characters
                old, _ = self._enc.popitem(last=False)
                self._enc_chars -= len(old)
        else:
            self._enc.move_to_end(text)
        return hit

    # ---- sessions ---------------------------------------------------------------------------------------------------------
    def session(self, session, texts: list) -> None:
        """The earlier texts of a session, for its cache. The last `sessions` sessions are kept (least recently used out); ids are strings."""
        session = str(session)
        self._session_texts.pop(session, None)                 # re-inserted last: the order is the order of use
        self._session_texts[session] = [V.nfc(t) for t in texts if t]
        while len(self._session_texts) > int(self.opts['sessions']):
            self._session_texts.popitem(last=False)
        if self.caches is not None:
            self._set_session_cache(session, self._session_texts[session])

    @staticmethod
    def _session_id(req: dict) -> Optional[str]:
        sid = req.get('session')
        return None if sid is None or sid == '' else str(sid)

    def _set_session_cache(self, session: str, texts: list) -> None:
        self.caches.set(session, [self.encode(t) for t in texts])

    # ---- the plan ---------------------------------------------------------------------------------------------------------
    def lang_of(self, surface: str, typed_ids: np.ndarray, ctx_ids: np.ndarray, typed_text: str = '', ctx_text: str = '') -> Optional[str]:
        """The language guessed on the typed text (with the context's when fewer than 8 tokens were typed), and only when that text is
        mostly letters (None otherwise, and in documents)."""
        rel = self.release
        if rel.lid is None or surface == 'doc':
            return None
        short = len(typed_ids) < 8
        ids = np.concatenate([ctx_ids, typed_ids]) if short else typed_ids
        if mostly_letters(f'{ctx_text} {typed_text}' if short else typed_text):
            return rel.lid.guess(ids)[0]
        return None

    def pick_slot(self, surface: str, lang: Optional[str]) -> Slot:
        """Which small model answers. The personal one (when there is one) in a language the person writes in (at least
        PERSONAL_LANG_TOKENS of their tokens in it), where no language could be guessed, and in documents; the published one in every
        other language: personalising costs the languages the person does not write in, so they keep the model that came with the app."""
        if self.personal is None or surface == 'doc' or lang is None:
            return self.personal or self.base
        return self.personal if self.personal.languages.get(lang, 0) >= PERSONAL_LANG_TOKENS else self.base

    def choose_plan(self, surface: str, typed_ids: np.ndarray, ctx_ids: np.ndarray, use_switch: bool, typed_text: str = '',
                    ctx_text: str = '') -> tuple:
        """(plan, language guessed or None, the small model's slot). The plan of a request with the published small model is the
        language's switch (Qwen3.5 alone or the mix with it); with the personal one it is the mix."""
        lang = self.lang_of(surface, typed_ids, ctx_ids, typed_text, ctx_text)
        slot = self.pick_slot(surface, lang)
        rel = self.release
        if surface == 'doc':
            return ('llm' if self.llm() else 'slm'), lang, slot
        if not self.llm():
            return 'slm', lang, slot
        if slot.kind == 'personal':
            return 'mix', lang, slot
        if use_switch and lang is not None:
            return ('llm' if rel.switch.choice(lang) == 'llm' else 'mix'), lang, slot
        return 'mix', lang, slot

    # ---- suggest ----------------------------------------------------------------------------------------------------------
    def prepare(self, req: dict) -> 'Prepared':
        """Cut a request into the contexts and the typed bytes, and tokenize what both models read."""
        rel, o = self.release, self.opts
        surface = req.get('surface') or 'text'
        if surface not in ('chat', 'doc', 'text'):
            raise ValueError(f'unknown surface {surface!r}')
        text = V.nfc(req.get('text') or '')
        typed_words = int(req['typed_words']) if req.get('typed_words') is not None else int(o['typed_words'])
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
        plan, lang, slot = self.choose_plan(surface, target_ids, np.concatenate([pr.agent_ids, pr.doc_ids]), bool(req.get('switch', True)),
                                      pr.target_text, pr.agent_ctx or pr.doc_ctx)
        want_cache = bool(req.get('cache', True)) and surface == 'chat' and self.caches is not None
        extras, extra_key = [], None
        if want_cache:
            sess = self._session_id(req)
            if sess in self._session_texts:
                self._session_texts.move_to_end(sess)             # used: the last to be forgotten
            known = {hash(t) for t in self._session_texts.get(sess, ())} if sess else set()
            texts = [t for t in (V.nfc(req.get('reply') or ''), V.nfc(req.get('prev') or '')) if t and hash(t) not in known]
            extras = [self.encode(t) for t in texts]
            extra_key = tuple(hash(t) for t in texts)
        precision = float(req.get('precision') or 0.2)
        want_next = bool(req.get('next', True))
        used = plan
        stats = {'llm': 0.0, 'slm': 0.0}
        args = (slot, slm_ids, llm_prompt, target_ids, R, req, extras, extra_key, want_cache, precision, want_next, cancelled)
        try:
            result = self._decode(plan, *args, stats)
        except LlmError as e:                       # the language model stopped answering: this suggestion comes from the small model
            if plan == 'slm':
                raise
            if isinstance(e, LlmUnavailable):
                self._llm_failed(e)                 # the server is not there: not asked again for a while
            else:
                self.llm_error = str(e)             # no answer for this prompt only: the next request asks again
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
        if used != 'llm':                           # Qwen3.5 alone does not use the small model
            out['model'] = slot.kind
        return out

    def _empty(self, t0: float, req: dict) -> dict:
        total = (time.perf_counter() - t0) * 1000
        return {'word': '', 'next': '', 'conf': 0.0, 'conf_next': 0.0, 'theta': 1.0, 'show': False, 'show_next': False,
                'plan': 'slm', 'ms': {'total': round(total, 1), 'llm': 0.0, 'slm': 0.0}}

    def _decode(self, plan, slot, slm_ids, llm_prompt, target_ids, R, req, extras, extra_key, want_cache, precision, want_next,
                cancelled, stats) -> tuple:
        rel = self.release
        n_target = len(target_ids)
        runner = slot.runner
        t = time.perf_counter()
        runner.prepare(slm_ids)
        stats['slm'] += (time.perf_counter() - t) * 1000
        fit = rel.cache_fits.get(plan) or cache_mod.DEFAULT_FITS['mix']
        cs = None
        added = 0
        if want_cache:
            cs = self.caches.state(self._session_id(req), extras, extra_key)
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
                    gate = slot.gate
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
