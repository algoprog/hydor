# Building an app that Hydor runs

Any stack. Hydor needs one file at the root of the app, `hydor.json`, and an app that does what it says. Check it with
`webapp_contract_check`, or in the app's folder with `node hydor-check.mjs` (the script beside this page; Node 22,
nothing else). A launch runs the same check.

## hydor.json

```json
{
  "name": "Repair desk",
  "build": "npm ci --omit=dev",
  "start": "node server.js",
  "dev": "node --watch server.js",
  "env": { "port": "PORT", "data": "DATA_DIR", "url": "APP_URL", "secret": "APP_SECRET" },
  "ready": "/health",
  "signIn": "hydor",
  "private": "/",
  "keys": [
    { "name": "SMS_API_KEY", "from": "Twilio", "why": "Texts a customer when the bike is ready", "optional": true,
      "how": ["Open the Twilio console", "Account → API keys → Create", "Copy the secret"], "url": "https://console.twilio.com" }
  ],
  "services": { "ai": { "tiers": ["quick"], "usdPerDay": 0.5, "try": { "method": "POST", "path": "/api/suggest", "body": { "text": "flat tyre" } } } },
  "database": { "file": "app.db", "sqlite": true }
}
```

| Field | What it says |
| --- | --- |
| `name` | Optional. What to call it. |
| `build` | Optional. A shell line run in the app's folder before it starts, with no keys, in a sandbox: it reads and writes the app's folder and its home, and reaches only the package registry (npm, PyPI, Go, crates.io, RubyGems). Take anything else it needs as a package. |
| `start` | The one command that runs it in production. One program: no `&&`, `;`, pipes, redirects or `NAME=value` in front. |
| `dev` | Optional. The command for the version being changed (it may write in the app's folder). Without it, that version runs `start` after `build`. |
| `env.port`, `env.data` | Names of the variables the app reads its port and its data folder from. Required. |
| `env.url` | Optional: the variable for the address people reach it at (for links it writes). |
| `env.secret` | The variable for its secret. Required with `"signIn": "hydor"`. |
| `env.host` | Optional (default `HOST`): the variable for the address to listen on. |
| `ready` | An address that answers 2xx or 3xx, with nobody signed in, once the app is ready. |
| `signIn` | `"hydor"`: Hydor says who is there (below); the app has no accounts of its own. `"own"`: the app has its own accounts. |
| `private` | With `"hydor"` only: an address only a signed-in person is answered at (default `/`). The check tries it. |
| `keys` | Keys the owner gives: `name` (the variable), `from` (a provider, `you`, or `made` for a random one Hydor makes), `why`, `how` (steps; not for `made`), and optionally `url`, `label`, `optional`, `group` (`{ "id", "title" }`: keys got together, one tab) and `looks` (`{ "starts": ["sk_"], "say": "starts with sk_", "not": [{ "starts": "pk_", "say": "…" }] }`: a paste that does not look right is warned about; `pattern` matches the whole value). |
| `services` | Only those the app calls: `ai` (`tiers`: `quick`, `standard`, `best`; `usdPerDay`), `embed`, `mail` (`true` or `{}`). Give each a `try`: a request to the app that makes it call the service, so the check can see the call. |
| `database` | Optional: `file`, a name in the data folder (no folders), and `sqlite`. A SQLite file is backed up while the app runs; otherwise the app is stopped while its folder is copied. |
| `accounts` | With `"own"`, so the check can see signed-in pages with a test person of its own: `signUp` and `signIn`, each `{ "path", "body", "send"?: "json"\|"form", "method"?: "POST" }`, with `{name}`, `{email}`, `{password}` in the body. The sign-in is by cookie. |
| `smoke` | Optional: what a launch runs to try the app, one request (`{ "method", "path", "body"? }`, signed out, 2xx or 3xx) or one command (given its address in `SMOKE_URL`, no keys; Node and the system's programs only, as no installed package may be there). |

## What the app is given

Its environment is only: `HOST` (`127.0.0.1` inside Hydor and in the check, `0.0.0.0` on a server of the owner's), the variables named in `env`, `NODE_ENV` (`production`, or
`development` for `dev`), `PATH` (the system's programs and Node's), `HOME` (a folder of its own), each key by its name,
and, when it lists a service, `HYDOR_URL`, `HYDOR_APP_SLUG` and `HYDOR_APP_KEY`. The version being changed and the
launched one each have their own data folder and secret.

## Rules

- Listen on the address in `HOST` (or `env.host`) and the port given, never an address written into the program, and open no other port.
- Keep everything in the data folder (database, uploads, session keys). The app's own folder is read-only inside Hydor and replaced by each new version. Logs go to the screen.
- Make the database as the app starts, if it is not there; never empty or remake one that is.
- Never put a key, the secret or `HYDOR_APP_KEY` in a page, a script, an answer or a log.
- Answer `ready` within 30 s of starting, without calling out to anything slow.
- Stop politely: on `SIGTERM`, stop taking requests, finish what is being answered, close the database, exit within 5 s.
- Run the program itself in `start` (not `npm start`), so the signal reaches it.
- Needs only what is under `/usr`, Node, and what `build` installs in the folder.
- Behind Hydor the request's `Host` is `localhost:<port>`. Use relative links and same-origin checks; do not require `https`.
- Work at any path. Where Hydor is reached through one hostname (a tunnel), an app's Preview shows it under a path (`/w/<token>/…`), and an address that starts with `/` leaves that path and reaches Hydor. So every address the app writes for its own pages, files and API has no leading slash: `href="notes"`, `<form action="login">`, `<script src="app.js">`, `fetch("api/notes")`, CSS `url(img/x.png)`, `location.href = "notes"`. Vite: `base: './'`. A server redirects and builds links relative to the request; behind a path Hydor sends the header `X-Forwarded-Prefix: /w/<token>` (absent at an address of its own), so `prefix + "/notes"` works too. Route in the browser by hash (`#/notes`), or with a basename the server writes into the page from that header. The check line "It works under any path" lists the addresses that start with `/`; it is to be fixed and never stops a launch.

## Who is there (`"signIn": "hydor"`)

Hydor puts a header on every request, signed anew each time and good for a minute:

    x-hydor-person: <A>.<B>
    A = base64url(JSON { "id", "name", "email"?, "role": "owner"|"admin"|"member"|"guest", "teamId"?, "exp" })
    B = base64url(HMAC-SHA256(A, secret))      the secret's text as the key; exp in seconds since 1970

Check it on every request except `ready`; answer 401 without a good one. Key each person's things by `id`.

```js
import crypto from 'node:crypto';

export function person(req, secret = process.env.APP_SECRET) {
  const [body, mac, more] = String(req.headers['x-hydor-person'] ?? '').split('.');
  if (!body || !mac || more !== undefined || !secret) return null;
  const want = crypto.createHmac('sha256', secret).update(body).digest();
  const got = Buffer.from(mac, 'base64url');
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  const who = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  return who.exp * 1000 > Date.now() ? who : null;
}
```

```python
import base64, hashlib, hmac, json, os, time

def person(headers, secret=os.environ.get("APP_SECRET", "")):
    value = headers.get("x-hydor-person") or ""
    if value.count(".") != 1 or not secret:
        return None
    body, mac = value.split(".")
    want = base64.urlsafe_b64encode(hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest()).rstrip(b"=")
    if not hmac.compare_digest(want, mac.encode()):
        return None
    who = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
    return who if who["exp"] > time.time() else None
```

## Services from outside

When the app needs mail, payments, a database or another service outside Hydor, call `webapp_services` with the need
first (`references/services.md`): the person chooses, and the answer gives the `keys` lines to write here, as they are.

## Hydor's services

From the server only. All three: `POST $HYDOR_URL/api/apps/$HYDOR_APP_SLUG/<service>` with
`Authorization: Bearer $HYDOR_APP_KEY` and `Content-Type: application/json`. A refusal is `{ "error": "a sentence" }`
(sometimes with `kind`) and a status; show the sentence or carry on without. Never retry 400, 401, 403 or 413; wait for
`retry-after` on 429 and 503.

**A model** (`/ai`). The owner allows it on the app's page first (until then: 403).

    → { "tier": "quick", "messages": [{ "role": "system"|"user"|"assistant"|"tool", "content": "…" }],
        "schema"?: JSON Schema, "tools"?: [{ "name", "description", "input": JSON Schema }], "maxOutputTokens"?: 1–8192, "stream"?: true }
    ← { "text", "data"?, "toolCalls": [{ "id", "name", "input" }], "stop": "end"|"tools"|"length"|"refused",
        "model", "usage": { "inputTokens", "outputTokens", "usd"? }, "cap": { "usedUsd", "limitUsd" } }

`schema` or `tools`, not both. `data` is the answer that fits the schema. The app runs its own tools: send the
assistant's message back with its `toolCalls`, then one `{ "role": "tool", "toolCallId", "content" }` for each. With
`stream`, server-sent events: `text` (`{ text }`), then `done` (the answer) or `error`. With sign-in by Hydor, pass the
person's `x-hydor-person` header on, as it came. 402/429 `kind: "cap"`: the day's money is spent (`until` says when it
starts again). Limits: 200 messages, 400,000 characters, 60 calls a minute (20 a person), 4 at once.

**Vectors** (`/embed`), for search by meaning.

    → { "texts": ["…"], "kind": "document" | "query" }        1–64 texts, 8,000 characters each
    ← { "model", "dim", "vectors": ["base64 of dim little-endian float32, length 1"] }

Keep `model` with each vector and make them again when it changes. 501: not available here; search by words.
Limits: 30 calls a minute, 20,000 texts a day (429).

**Mail** (`/mail`). Not for sign-up or passwords. Send an `Idempotency-Key` header so a retry does not send twice.

    → { "to": ["a@example.com"], "subject", "text", "html"?, "replyTo"?, "fromName"?, "unsubscribe"?: "https://…" }
    ← { "id", "status": "sent" | "queued" }

501: not sent (not allowed yet, or the version being changed, which sends none unless the owner says so): keep it in the
app and say it was not delivered. 403: the owner turned it off. Limits: 50 addresses, each counting against 100 mails a
day (the owner may change it), 30 requests and 60 mails a minute.

Inside Hydor only people who open the app from Hydor can reach it, so a link in a mail opens for them alone.

## An agent app with pages of its own

When your instructions name an agent app, link it first: `webapp_add_work {with: "<its id>", confirm: true}`. The web
app is then also given `HYDOR_URL`, `HYDOR_APP_SLUG` (the agent app's) and `HYDOR_APP_KEY`. Take `"signIn": "hydor"`,
so runs are made for the person at the screen. Call these from the server only, with
`Authorization: Bearer $HYDOR_APP_KEY`; the key never reaches a browser.

    GET  $HYDOR_URL/api/apps/$HYDOR_APP_SLUG/flows        ← { "app", "flows": [{ "id", "name", "form": [field], "answer": [field] }] }
    POST $HYDOR_URL/api/apps/$HYDOR_APP_SLUG/run          → { "inputs": { "<field id>": value }, "personToken": the x-hydor-person header as received,
                                                              "flow"?: id (default "run"), "ref"?: a short id of your own }  ← run
    GET  …/run/<run id>?wait=30                            ← run (waits up to that many seconds for it to end)
    GET  …/run/<run id>/events                             server-sent events: run, step, status, end
    GET  …/run?person=<person id>                          ← { "runs": [run] }, newest first
    POST …/run/<run id>/answer                             → { "step": question.step, "values": {…} or "yes": true }
    POST …/run/<run id>/stop

A **run** is `{ "id", "state": "waiting"|"working"|"needs-you"|"done"|"failed"|"stopped", "steps"?, "result": {
"<answer field id>": value } or null, "reply", "error"?, "question"?: { "step", "title", "kind": "form"|"yesno",
"fields"? }, "ref"? }`. Show `result` when `state` is `done`; show `question` when it is `needs-you`. Show a person only
their own runs. The web app's runs are held to its daily cap (429 with a sentence when it is reached).

**Functions** the agents may call in the app: write `functions.json` at the app's root and serve each as a `POST`.

```json
{ "format": 1, "functions": [{ "name": "find_notes", "description": "Finds the person's notes by words.",
  "input": { "type": "object", "properties": { "words": { "type": "string" } } }, "writes": false }] }
```

Hydor sends `POST /api/agent-functions/<name>` (or the function's `path`) with the input as JSON and an
`x-hydor-person` header for the person the run acts for: check it, apply the same access rules as for a click, and
answer JSON, or a 4xx with `{ "error" }`. `writes`: it changes what the app keeps. Each is off until the owner allows it
on the app's Flows tab.

