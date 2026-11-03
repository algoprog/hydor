---
name: api-requests
description: Use when calling, testing or debugging an HTTP API (REST, GraphQL or webhooks), such as setting up authentication, reading an error response, paging through results, handling rate limits and retries, or reproducing a request with curl.
category: coding
triggers: [rest api, graphql, webhook*, api request, api call*, api endpoint, status code, curl, rate limit*, oauth, bearer token, postman]
---

# API requests

Calling an HTTP API well: read its documentation, authenticate without exposing the key, get one
minimal request working, read the whole response (status, headers, body), then add paging,
retries and the rest. When something fails, the status code and the error body almost always say
why. Status codes, retry code and curl patterns are in `references/http-reference.md`.

## 1. Read the docs first

Find, before writing anything: the base address and version; how to authenticate (a key in a
header or the query, a Bearer token, OAuth, a user name and password); the endpoint's method,
parameters and body; how results are paged; the rate limits; the error format; whether it supports
idempotency keys; and whether there is a test mode or sandbox. Prefer the official reference or its
OpenAPI file, and check that it matches the version you call.

## 2. Keep keys out of sight

- Never put a key in the chat, in code you show, in a URL you print, or in a log.
- `list_connections` shows the keys already in the vault. If one is missing, `request_secret`
  with a clear `why` (what it is for, where to get it) and `domains` limited to the API's host.
- `http_request` signs with a key by name: `auth: NAME` sends `Authorization: Bearer <key>`;
  `auth_header: "X-Api-Key"` puts it in another header; `auth_prefix: "token "` changes the prefix;
  `auth_query: "api_key"` sends it in the query; `{{NAME}}` places it anywhere in the address,
  headers or body; `basic_auth` for a user name and password.
- In commands: `run_with_secrets` with `"$NAME"` (the key must be allowed in commands:
  `request_secret` with `commands: true`). In code: environment variables, never a committed file.
- Ask for the narrowest key that works: read-only, one project, an expiry date. A key that leaked
  is revoked at once, before anything else (the security-check skill).

## 3. Get one minimal request working

- Start with the simplest call that proves the address and the key (a "who am I", a status
  endpoint, or reading one item). Then the real call with only the required fields; add options
  one at a time, so you know which one breaks it.
- JSON bodies: `Content-Type: application/json`, valid JSON, field names and types exactly as
  documented (a number is not a string), dates in the format the API names (usually ISO 8601 with
  a time zone).
- **GraphQL:** one endpoint, `POST` with `{"query": "...", "variables": {...}}`. Ask only for the
  fields you need. Errors often come back with status 200 in an `errors` array: always check it.

## 4. Read the response

- Status first: 2xx worked; 4xx means the request is wrong (fix it, do not retry); 5xx and 429
  are temporary (retry later). The common codes and their usual causes are in the reference.
- Then the error body: it usually names the field or the permission at fault. Quote it exactly
  when you report.
- Then headers: `Retry-After` and rate-limit headers, a request id (`X-Request-Id` and similar) for
  support, `Link` for the next page, `Content-Type` (an HTML page where you expected JSON means a
  wrong address, a login page or a proxy).
- A 200 is not always success: check bodies such as `{"ok": false}` or GraphQL `errors`.

## 5. Page through results

The first answer is rarely all of it. Styles: `page` and `per_page`; `offset` and `limit`; a
cursor (`next_cursor`, `starting_after`, GraphQL `pageInfo { hasNextPage endCursor }`); a `Link`
header with `rel="next"`. Loop until there is no next page, use the largest page size allowed, set
a maximum number of pages, and remove duplicates by id. For data that changes while you read,
cursors are safer than offsets.

## 6. Rate limits and retries

- Retry only what may succeed later: 429, 502, 503, 504, timeouts, dropped connections; a 500 once.
- Wait longer each time, with some randomness (exponential backoff with jitter), honour
  `Retry-After`, and stop after a few tries with a clear message.
- Stay under the limit in the first place: space requests out, limit how many run at once, use
  batch endpoints, cache answers, and send `If-None-Match` with a saved `ETag`.

## 7. Side effects and idempotency

- `GET`, `PUT` and `DELETE` are meant to be safe to repeat; `POST` is not: retrying one can create
  two orders, two payments, two emails.
- When retrying anything that creates, use the API's idempotency key if it has one (an
  `Idempotency-Key` header with a fresh UUID, reused on every retry of the same action), or check
  whether the first attempt went through before trying again.
- Before a call that spends money, sends messages, deletes or changes real records: confirm with
  the user, and try it in the test mode or sandbox first when there is one.

## 8. Webhooks

- **Receiving:** an HTTPS endpoint that verifies the signature (an HMAC of the raw body with the
  shared secret, compared in constant time, with a timestamp check against replays), answers 2xx
  quickly and does the work afterwards, and expects duplicates and events out of order (skip an
  event id already seen). An example is in the reference.
- **Testing:** the provider's test events or command-line tool. Exposing a local port to the
  internet (a tunnel) needs the user's agreement.
- **Sending:** sign the payload, retry with backoff, and document the events and their fields.

## 9. Reproduce, then hand over

- Reproduce a problem with curl through `run_with_secrets`, showing status and headers:
  `curl -sS -i https://api.example.com/v1/items -H "Authorization: Bearer $API_KEY"`.
- A minimal example for a bug report or a support ticket: the smallest request that shows the
  problem, without the key, with the request id, the time, and the full error body.
- When it works, give the user a short working example (curl or code) that reads the key from an
  environment variable, and say what it costs per call if the API charges.

## Pitfalls

- A key in a query string, a screenshot or a log; a key pasted into the chat.
- Treating 200 as success without reading the body.
- Retrying a `POST` blindly, or retrying 4xx errors.
- Reporting "only 100 results" because paging was ignored.
- Mixing test and live keys, or test and live base addresses.
- Time zones and number formats in bodies (`"2026-11-03T09:00:00+01:00"`, not "3/11 9am").
