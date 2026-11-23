"""Hydor's word suggestions worker (server/suggest starts it as `python -I <folder>/worker.py`).

It reads requests as JSON lines on stdin and answers each with one JSON line on stdout, carrying the request's id back. First it prints
{"status": "loading"} and, once its libraries are loaded, {"ready": true, "rss": <MB>}.

  {"id", "op": "load", "model_dir", "personal_dir": str|null, "llm_url": str|null, "threads": int, "options": {"k": 1000}}
        -> {"id", "ok": true, "model": "base"|"personal", "languages": {lang: the person's tokens}}
  {"id", "op": "suggest", "surface": "chat"|"doc"|"text", "text", "reply"?, "prev"?, "doc"?, "session"?, "precision": 0.4,
        "next": true, "cache": true, "switch": true}
        -> {"id", "word", "next", "conf", "conf_next", "theta", "show", "show_next", "plan", "lang"?, "ms": {...}}
  {"id", "op": "session", "session", "texts": [str]}                 -> {"id", "ok": true}
  {"id", "op": "cancel", "target": <id>}   drops a suggest that waits or stops it between decoding steps: that suggest's answer is
        then {"id": <target>, "cancelled": true}; the cancel itself is answered {"id", "ok": true}
  {"id", "op": "stats"}                                              -> {"id", "rss", "requests", "p50_ms", "p90_ms"}
  an error: {"id", "error": "..."}

It does one request at a time but reads stdin on a thread, so a cancel arrives while a suggestion is being decoded. Everything else
it prints goes to stderr.
"""
from __future__ import annotations

import json
import os
import queue
import sys
import threading
import time


def rss_mb():
    try:
        with open('/proc/self/statm') as f:
            return round(int(f.read().split()[1]) * os.sysconf('SC_PAGE_SIZE') / 2 ** 20)
    except Exception:
        pass
    try:
        import resource
        r = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        return round(r / 2 ** 20) if sys.platform == 'darwin' else round(r / 1024)
    except Exception:
        return None


class Worker:
    def __init__(self, out):
        self._out = out
        self._lock = threading.Lock()
        self.queue: queue.Queue = queue.Queue()
        self._cancelled: dict = {}                  # request id -> time of the cancel
        self._cancel_lock = threading.Lock()
        self.current = None
        self.engine = None

    # ---- output -----------------------------------------------------------------------------------------------------------
    def say(self, obj: dict) -> None:
        line = json.dumps(obj, separators=(',', ':'))
        with self._lock:
            self._out.write(line + '\n')
            self._out.flush()

    # ---- cancelling -------------------------------------------------------------------------------------------------------
    def _cancel(self, target) -> None:
        now = time.time()
        with self._cancel_lock:
            self._cancelled[target] = now
            if len(self._cancelled) > 200:               # a cancel for a request that was long done
                for k in [k for k, t in self._cancelled.items() if now - t > 300]:
                    del self._cancelled[k]

    def is_cancelled(self, rid) -> bool:
        with self._cancel_lock:
            return rid in self._cancelled

    def _done(self, rid) -> None:
        with self._cancel_lock:
            self._cancelled.pop(rid, None)

    # ---- the reader thread ------------------------------------------------------------------------------------------------
    def read_stdin(self, stream) -> None:
        for raw in stream:
            line = raw.strip()
            if not line:
                continue
            try:
                req = json.loads(line)
                if not isinstance(req, dict):
                    raise ValueError('a request is a JSON object')
            except Exception as e:
                self.say({'id': None, 'error': f'bad request: {e}'})
                continue
            if req.get('op') == 'cancel':
                self._cancel(req.get('target'))
                self.say({'id': req.get('id'), 'ok': True})
                continue
            self.queue.put(req)
        self.queue.put(None)

    # ---- handling ---------------------------------------------------------------------------------------------------------
    def handle(self, req: dict) -> None:
        from .decode import Cancelled
        rid, op = req.get('id'), req.get('op')
        try:
            if op == 'load':
                if self.engine is None:
                    from .engine import Engine
                    self.engine = Engine()
                res = self.engine.load(req['model_dir'], req.get('personal_dir'), req.get('llm_url'), int(req.get('threads') or 0),
                                       req.get('options') or {})
                self.say({'id': rid, 'ok': True, **res})
            elif op == 'suggest':
                if self.is_cancelled(rid):
                    self._done(rid)
                    self.say({'id': rid, 'cancelled': True})
                    return
                if self.engine is None:
                    raise RuntimeError('no model is loaded')
                self.current = rid
                try:
                    res = self.engine.suggest(req, lambda: self.is_cancelled(rid))
                except Cancelled:
                    self.say({'id': rid, 'cancelled': True})
                    return
                finally:
                    self.current = None
                    self._done(rid)
                self.say({'id': rid, **res})
            elif op == 'session':
                if self.engine is None:
                    raise RuntimeError('no model is loaded')
                self.engine.session(str(req['session']), list(req.get('texts') or []))
                self.say({'id': rid, 'ok': True})
            elif op == 'stats':
                e = self.engine
                self.say({'id': rid, 'rss': rss_mb(), 'requests': e.requests if e else 0,
                          'p50_ms': e.percentile(0.5) if e else None, 'p90_ms': e.percentile(0.9) if e else None})
            else:
                raise ValueError(f'unknown op {op!r}')
        except Exception as e:                           # one request's failure never stops the worker
            self.say({'id': rid, 'error': f'{type(e).__name__}: {e}'})
            if os.environ.get('HYDOR_SUGGEST_DEBUG'):
                import traceback
                traceback.print_exc(file=sys.stderr)

    def run(self, stdin) -> None:
        threading.Thread(target=self.read_stdin, args=(stdin,), daemon=True).start()
        while True:
            req = self.queue.get()
            if req is None:
                break
            self.handle(req)


def main() -> None:
    out = sys.stdout
    sys.stdout = sys.stderr                              # nothing but the protocol goes to the real stdout
    os.environ.setdefault('TOKENIZERS_PARALLELISM', 'false')
    os.environ.setdefault('CUDA_VISIBLE_DEVICES', '')    # the engine runs on the CPU
    try:
        sys.stdin.reconfigure(encoding='utf-8')
    except Exception:
        pass
    w = Worker(out)
    w.say({'status': 'loading'})
    import torch  # noqa: F401  (the slow import: the status above is already out)
    from . import engine  # noqa: F401
    w.say({'ready': True, 'rss': rss_mb()})
    w.run(sys.stdin)
