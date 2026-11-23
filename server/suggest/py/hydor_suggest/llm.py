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
CUT_STEP = 300          # a prompt over the limit loses its front in steps of this many tokens, so the cut stays put while the person types
TIMEOUT = 2.0           # a step of the small language model takes about 30 ms: a server that needs 2 s is hung


def cut_prompt(ids: list) -> list:
    """The prompt as the server should see it. Up to MAX_PROMPT_TOKENS it is whole. Over that, the front is dropped in whole steps of
    CUT_STEP (the least that brings it to MAX_PROMPT_TOKENS or less: 1501 tokens become 1201): the cut point then stays where it is for
    the next CUT_STEP tokens, so the server's cached prompt (cache_prompt) is still a prefix of the next request's, as it would not
    be if the front slid by one token at every step."""
    n = len(ids)
    if n <= MAX_PROMPT_TOKENS:
        return ids
    drop = -(-(n - MAX_PROMPT_TOKENS) // CUT_STEP) * CUT_STEP
    return ids[drop:]


class LlmError(RuntimeError):
    """The language model gave no usable answer to this request."""


class LlmUnavailable(LlmError):
    """The server is not there: refused, closed, timed out, or answered with an error status. The engine leaves it alone for a while."""


class LlamaClient:
    def __init__(self, url: str, k: int = 1000, timeout: float = TIMEOUT):
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
        """One POST. A connection that was kept from the last call and which the server closed meanwhile (a ConnectionError) is opened
        again once; a timeout or a connection that was new is an error at once: a hung server is not waited for twice."""
        for attempt in (0, 1):
            reused = self._conn is not None
            try:
                if self._conn is None:
                    self._conn = http.client.HTTPConnection(self.host, self.port, timeout=self.timeout)
                self._conn.request('POST', self.base + '/completion', body=body,
                                   headers={'Content-Type': 'application/json', 'Connection': 'keep-alive'})
                r = self._conn.getresponse()
                data = r.read()
                if r.status != 200:
                    raise LlmUnavailable(f'llama-server answered {r.status}: {data[:200]!r}')
                return data
            except LlmUnavailable:
                self.close()
                raise
            except (ConnectionError, http.client.RemoteDisconnected, http.client.BadStatusLine) as e:
                self.close()
                if attempt == 1 or not reused:
                    raise LlmUnavailable(f'llama-server is not reachable: {e}')
            except (OSError, http.client.HTTPException) as e:       # a timeout, an unreachable host
                self.close()
                raise LlmUnavailable(f'llama-server is not answering: {e}')
        raise LlmUnavailable('llama-server is not reachable')

    def top_logprobs(self, prompt_ids) -> tuple:
        """The k most likely next ids and their log-probabilities (numpy int64, float32) after the prompt (its front is cut when it is over
        1500 tokens: see cut_prompt)."""
        ids = cut_prompt([int(t) for t in prompt_ids])
        if not ids:
            raise LlmError('an empty prompt')
        self.calls += 1
        try:
            return self._ask(ids, 1)
        except LlmError as first:
            if isinstance(first, LlmUnavailable):
                raise
        # llama-server leaves the probabilities out when the one token it sampled is a part of a character (its text is not valid UTF-8
        # yet: "content": "\ufffd"). Asked for two tokens it answers with the first one's probabilities, which are what is wanted.
        self.calls += 1
        return self._ask(ids, 2)

    def _ask(self, ids: list, n_predict: int) -> tuple:
        body = json.dumps({'prompt': ids, 'n_predict': n_predict, 'n_probs': self.k, 'temperature': 0, 'cache_prompt': True}).encode()
        data = self._post(body)
        try:
            top = json.loads(data)['completion_probabilities'][0]['top_logprobs']
            tid = np.fromiter((t['id'] for t in top), np.int64, len(top))
            lp = np.fromiter((t['logprob'] for t in top), np.float64, len(top)).astype(np.float32)
        except (KeyError, IndexError, TypeError, ValueError) as e:
            raise LlmError(f'llama-server answered without probabilities: {e!r}')
        if not len(tid):
            raise LlmError('llama-server answered with no probabilities')
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
