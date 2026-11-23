"""The client of llama-server (llama.cpp), which runs Qwen3.5-0.8B-Base: the next-token distribution after a prompt of token ids.

POST {url}/completion with {"prompt": [ids], "n_predict": 1, "n_probs": k, "temperature": 0, "cache_prompt": true}; the answer's
completion_probabilities[0].top_logprobs lists the k most likely ids with their log-probabilities (about 27 ms a step at 4 threads,
87 KB of JSON at k = 1000). The server keeps the prompt's state between calls, so a prompt that extends the last one costs a token.
One persistent connection; one request at a time.
"""
from __future__ import annotations

import http.client
import json
from typing import Optional
from urllib.parse import urlsplit

import numpy as np

MAX_PROMPT_TOKENS = 1500


class LlmError(RuntimeError):
    pass


class LlamaClient:
    def __init__(self, url: str, k: int = 1000, timeout: float = 20.0):
        u = urlsplit(url if '//' in url else 'http://' + url)
        if u.scheme not in ('http', ''):
            raise LlmError('the language model must be on http')
        self.host, self.port, self.base = u.hostname or '127.0.0.1', u.port or 80, u.path.rstrip('/')
        self.k, self.timeout = int(k), timeout
        self._conn: Optional[http.client.HTTPConnection] = None
        self.calls = 0

    def close(self) -> None:
        if self._conn is not None:
            try:
                self._conn.close()
            except Exception:
                pass
            self._conn = None

    def _post(self, body: bytes) -> bytes:
        last: Optional[Exception] = None
        for attempt in (0, 1):                      # a connection the server closed while idle: one new try
            try:
                if self._conn is None:
                    self._conn = http.client.HTTPConnection(self.host, self.port, timeout=self.timeout)
                self._conn.request('POST', self.base + '/completion', body=body,
                                   headers={'Content-Type': 'application/json', 'Connection': 'keep-alive'})
                r = self._conn.getresponse()
                data = r.read()
                if r.status != 200:
                    raise LlmError(f'llama-server answered {r.status}: {data[:200]!r}')
                return data
            except LlmError:
                self.close()
                raise
            except (OSError, http.client.HTTPException) as e:
                last = e
                self.close()
        raise LlmError(f'llama-server is not reachable: {last}')

    def top_logprobs(self, prompt_ids) -> tuple:
        """The k most likely next ids and their log-probabilities (numpy int64, float32) after the prompt (its last 1500 tokens)."""
        ids = [int(t) for t in prompt_ids][-MAX_PROMPT_TOKENS:]
        if not ids:
            raise LlmError('an empty prompt')
        body = json.dumps({'prompt': ids, 'n_predict': 1, 'n_probs': self.k, 'temperature': 0, 'cache_prompt': True}).encode()
        self.calls += 1
        data = self._post(body)
        try:
            top = json.loads(data)['completion_probabilities'][0]['top_logprobs']
            tid = np.fromiter((t['id'] for t in top), np.int64, len(top))
            lp = np.fromiter((t['logprob'] for t in top), np.float64, len(top)).astype(np.float32)
        except (KeyError, IndexError, TypeError, ValueError) as e:
            raise LlmError(f'llama-server answered without probabilities: {e}')
        return tid, lp


def dense_from_top(ids: np.ndarray, logprobs: np.ndarray, V: int, tail: Optional[np.ndarray] = None) -> np.ndarray:
    """A probability vector over V ids from the top-k list. The missing mass r = 1 - sum(top-k) goes to the other ids in proportion
    to `tail` (the small model's probabilities); with no tail they get 0."""
    keep = (ids >= 0) & (ids < V)
    ids, pr = ids[keep], np.exp(logprobs[keep].astype(np.float64))
    r = 1.0 - float(pr.sum())
    p = np.zeros(V, dtype=np.float32)
    if tail is not None and r > 0:
        t = tail.astype(np.float64)
        t[ids] = 0.0
        s = float(t.sum())
        if s > 0:
            p = (t * (r / s)).astype(np.float32)
    p[ids] = pr.astype(np.float32)
    return p
