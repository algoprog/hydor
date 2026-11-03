# HTTP reference for API work

## Status codes and their usual causes

| Code | Meaning | Usual cause, and what to do |
| --- | --- | --- |
| 200, 201, 204 | Worked (201 created, 204 nothing to return) | Still read the body for `ok: false` or `errors` |
| 301, 302, 307, 308 | Moved | Follow it; update the address. 301/302 may turn a POST into a GET: use the final address directly |
| 304 | Not modified | Your cached copy (by `ETag` or date) is current |
| 400 | Bad request | Malformed JSON, a wrong type, a missing field: the body says which |
| 401 | Not authenticated | Missing or wrong key, wrong header name or prefix, expired token |
| 403 | Not allowed | The key works but lacks the scope, plan or permission; an IP allow-list; a bot block |
| 404 | Not found | Wrong path, version or id; some APIs answer 404 for things you may not see |
| 405 | Method not allowed | GET where POST is needed, or the reverse |
| 409 | Conflict | Already exists, or changed since you read it (fetch again, then retry the change) |
| 410 | Gone | The endpoint or item was removed: check the changelog |
| 413 | Too large | Smaller body or batch; upload large files the way the docs say |
| 415 | Unsupported media type | Wrong `Content-Type` (JSON sent as form data, or the reverse) |
| 422 | Unprocessable | Valid JSON, but a value fails validation: the body lists the fields |
| 429 | Too many requests | Wait for `Retry-After`, then go slower |
| 500 | Server error | Retry once; if it persists, report it with the request id |
| 502, 503, 504 | Gateway or service unavailable, timeout | Temporary: retry with backoff |

## Rate-limit headers

Common forms: `Retry-After: 30` (seconds) or an HTTP date; `X-RateLimit-Limit`,
`X-RateLimit-Remaining`, `X-RateLimit-Reset` (a time or seconds); `RateLimit-Limit`,
`RateLimit-Remaining`, `RateLimit-Reset` in newer APIs. Slow down when `Remaining` gets low.

## Retries with backoff (Python, tested)

```python
import random, time, uuid
import requests

RETRY_STATUS = {429, 500, 502, 503, 504}

def call(method, url, *, max_tries=5, base=1.0, cap=60.0, **kw):
    """One API call with retries for temporary failures; other errors are raised at once."""
    if method.upper() == "POST":
        kw.setdefault("headers", {}).setdefault("Idempotency-Key", str(uuid.uuid4()))  # same key on every retry
    for attempt in range(max_tries):
        try:
            r = requests.request(method, url, timeout=30, **kw)
        except (requests.ConnectionError, requests.Timeout):
            r = None
        if r is not None and r.status_code not in RETRY_STATUS:
            r.raise_for_status()          # 4xx: a problem with the request; fix it, do not retry
            return r
        if attempt == max_tries - 1:
            raise RuntimeError(f"gave up after {max_tries} tries: {r.status_code if r is not None else 'no answer'}")
        wait = None
        if r is not None and r.headers.get("Retry-After", "").isdigit():
            wait = float(r.headers["Retry-After"])
        if wait is None:
            wait = min(cap, base * 2 ** attempt) + random.uniform(0, base)   # exponential backoff with jitter
        time.sleep(wait)
```

Send an `Idempotency-Key` only to APIs that document it; others ignore it, and then a retried POST
can still create a duplicate.

## curl patterns

Run with `run_with_secrets` so `$API_KEY` comes from the vault and is masked in the output.

```bash
# Status line and headers, then the body
curl -sS -i "https://api.example.com/v1/items?limit=10" -H "Authorization: Bearer $API_KEY"
# A JSON body
curl -sS -X POST https://api.example.com/v1/items -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" -d '{"name": "Test item", "price": 4.5}'
# Fail on HTTP errors but still print the error body; show just the status code at the end
curl -sS --fail-with-body -w '\n%{http_code}\n' https://api.example.com/v1/items/42 -H "Authorization: Bearer $API_KEY"
# Everything that was sent and received (headers included), when debugging
curl -sS -v https://api.example.com/v1/items -H "Authorization: Bearer $API_KEY" 2>&1 | sed -n '1,40p'
# GraphQL
curl -sS https://api.example.com/graphql -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d '{"query": "query($n: Int!) { items(first: $n) { nodes { id name } pageInfo { hasNextPage endCursor } } }", "variables": {"n": 20}}'
```

`-v` prints request headers too; with `run_with_secrets` the key is masked, but never paste such
output elsewhere unmasked.

## Webhook signatures (Python, tested)

Providers differ in what they sign and how they send it (read their docs); a common scheme is an
HMAC-SHA256 of `timestamp + "." + raw body`:

```python
import hashlib, hmac, time

def verify(secret: bytes, raw_body: bytes, signature_hex: str, timestamp: str, tolerance=300) -> bool:
    if abs(time.time() - int(timestamp)) > tolerance:          # an old message replayed
        return False
    expected = hmac.new(secret, timestamp.encode() + b"." + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_hex)        # constant-time comparison
```

Verify against the raw bytes as received, before any JSON parsing or re-encoding changes them.

## OAuth in one paragraph

Services that act for a user (their calendar, their mailbox) use OAuth: the user signs in on the
service's page and approves access; your side gets an access token (short-lived) and often a
refresh token (to get new access tokens). For a user's own one-off use, a personal access token
from the service's settings is simpler. Store tokens in the vault, ask for the smallest scopes,
and refresh before expiry rather than after a 401.
