---
name: security-check
description: Use when asked to check code, an app or a server setup for security problems, before exposing something to the internet, or after a leaked key or a vulnerability alert. Not for a general code review; see code-review.
category: coding
triggers: [security review, security audit, check for vulnerabilit*, vulnerabilities in, cve, sql injection, xss, csrf, ssrf, owasp, npm audit, api key leak*]
---

# Security check

A practical security review finds the ways someone could read, change or break what they should not,
ranks them by how likely and how bad they are, and fixes the worst first. Look where attackers look:
every place outside input comes in, every place a secret lives, every door that should be locked. Back
each finding with evidence rather than listing theoretical worries.

## 1. Scope and threat model, in five lines

- What it is and who can reach it: the public internet, a company network, only this machine.
- What is worth protecting: user data, money, credentials, the server itself.
- Who to worry about: anonymous visitors, signed-in users reaching for others' data, a malicious file,
  package or web page.
- Where input enters: routes, forms, uploads, webhooks, command-line arguments, environment, queues,
  files and URLs it fetches, and text it passes to a language model.
- Test only what you may: the user's own code, and a local or staging copy. Never probe production
  systems or third parties without the owner's written permission.

## 2. Secrets

- In the files: `gitleaks dir -v .` when installed; otherwise search by hand
  (`git grep -n -i -E "api[_-]?key|secret|token|passw"`). Look in config, CI files, Dockerfiles, notebooks,
  test fixtures, and front-end code (anything shipped to the browser is public).
- In the history: `gitleaks git -v .` or `trufflehog git file://. --results=verified,unknown`. A secret
  deleted in a later commit is still in the history.
- A secret found: treat it as leaked. Have it rotated first (revoked and replaced at the provider), then
  removed from the code and history (see git-rescue). Report where it is, never its value.
- Code reads secrets from the environment or a secret store; `.env` is in `.gitignore`; `.env.example`
  holds placeholders.
- In this app, when a check needs a credential, ask with `request_secret` and use it through
  `run_with_secrets` or `http_request`, so the value never enters the conversation.

## 3. Injection: outside input reaching an interpreter

Search for the dangerous calls (patterns per language in `references/checklist.md`), then trace whether
outside input can reach them:

| Kind | Look for | Fix |
| --- | --- | --- |
| SQL | Queries built with `+`, f-strings or template literals; `.raw(` | Bound parameters; identifiers (columns, sort order) from an allowlist |
| Shell | `exec`, `execSync`, `shell: true`, `os.system`, `subprocess` with `shell=True` | Run the program with an argument list (`execFile`, `subprocess.run([...])`); no shell |
| Path traversal | `path.join(base, input)`, `open(base + name)`, unpacking archives | Resolve, then check it is still under the base (below); reject absolute paths |
| XSS | `innerHTML`, `dangerouslySetInnerHTML`, `v-html`, Jinja's `safe` filter, `mark_safe`, user URLs in `href` | Let the framework escape; sanitise HTML you must render (DOMPurify); allow only http(s) links; a Content-Security-Policy |
| Code evaluation | `eval`, `new Function`, `vm`, Python `exec`, templates built from input | Treat input as data, never as code |
| Deserialisation | `pickle.load`, `yaml.load` with an unsafe loader, `marshal`, `torch.load` with `weights_only=False`, Java `ObjectInputStream`, PHP `unserialize` | JSON, `yaml.safe_load`; never unpickle untrusted data |
| SSRF | The server fetching a URL a user supplied (webhooks, previews, imports) | Allowlist schemes and hosts; resolve the name and refuse private, loopback and link-local addresses, including 169.254.169.254; re-check after redirects |
| Redirects and headers | User input in `Location`, headers, log lines | Allowlist redirect targets; strip line breaks |

Path check, Node: `const root = path.resolve(base); const p = path.resolve(root, input);` then refuse
unless `p.startsWith(root + path.sep)`. Python: `p = (base / name).resolve()` then refuse unless
`p.is_relative_to(base.resolve())`. Resolving follows symlinks in Python but not in Node: use
`fs.realpathSync` there when links are possible.

## 4. Authentication and authorisation

- List every route, endpoint and job that touches data, and who may call each. Look for ones with no
  auth check: read the router, not only the files that changed.
- Object-level checks: `/api/invoices/123` must confirm invoice 123 belongs to the caller. This is the
  most common serious bug. Test it: as user A, request user B's ids.
- Admin actions are checked on the server, not just hidden in the interface.
- Passwords hashed with argon2id, bcrypt or scrypt (never plain SHA or MD5); sign-in rate-limited; the
  session id renewed at sign-in; sign-out ends the session on the server.
- Cookies `HttpOnly`, `Secure`, `SameSite=Lax` or `Strict`; CSRF protection for state changes when auth is
  by cookie.
- Tokens: signature, algorithm, expiry and audience verified (refuse `alg: none`); nothing secret inside
  them (anyone can read them).
- Mass assignment: binding a whole request body to a model lets users set `role` or `isAdmin`; allowlist
  the fields.

## 5. Input, defaults and configuration

- Validate at the boundary: type, length, range, format, allowed values (zod, pydantic, JSON Schema).
  Reject what does not fit rather than "cleaning" it.
- Uploads: size limits, type checked from the content, stored outside the web root under generated names.
- Debug mode and stack traces off in production; errors to users carry no queries, paths or internals.
- CORS not `*` for APIs that use cookies or tokens; services bound to 127.0.0.1 unless they must be
  reachable; least-privilege database users; TLS; security headers (CSP, HSTS, `X-Content-Type-Options`).
- Rate limits on sign-in, sign-up, password reset, and expensive endpoints.
- Apps that pass untrusted text to a language model: treat the model's output as untrusted too, and keep
  the tools it can call scoped to what that user may do.

## 6. Dependencies and images

| What | Command |
| --- | --- |
| npm | `npm audit --omit=dev` (production dependencies); `npm audit fix` (not `--force` without review) |
| Python | `pip-audit` (the active environment) or `pip-audit -r requirements.txt` |
| Most lock files | `osv-scanner scan source -r .` |
| Go, Rust | `govulncheck ./...`, `cargo audit` |
| Container images | `trivy image <image>` or `osv-scanner scan image <image>` |

- Triage, do not just bump: is the vulnerable code reachable, is it a development-only dependency, is
  there a fixed version? Upgrade the smallest step that fixes it, then run the tests.
- Lock files committed; CI actions pinned to versions or commit hashes; no install scripts piped from the
  network into a shell.
- A tool not installed: say which checks you could not run. Use one-off runners (`npx`, `pipx run`, a
  container) rather than installing system-wide.

## 7. Report and fix by severity

Each finding: severity, place (file and line, or the URL), what an attacker can do, evidence (the request
and response, or the code path from input to sink), and the fix.

| Severity | Examples |
| --- | --- |
| Critical | Remote code execution, SQL injection on a public endpoint, an auth bypass, a live production secret exposed |
| High | Reading or changing other users' data, stored XSS, SSRF into internal services, an exploited dependency on a reachable path |
| Medium | Reflected XSS, no rate limit on sign-in, internals leaked in errors, CSRF on a minor action |
| Low | Missing hardening headers, a vulnerable dependency on an unreachable path |

- Fix critical and high first, each with a test that proves it (the attacker's request now fails).
- Lead the report with critical and high; then list what you checked and what you did not, so silence is
  not read as "secure".
- Leave secret values and working exploits for third-party systems out of the report.

## Pitfalls

- A long list of theoretical issues burying the one real hole.
- Checking that users are signed in, but not that they may see this particular record.
- Escaping by hand instead of using parameters and the framework's escaping.
- Removing a secret from the code without rotating it.
- Trusting checks in the browser: anything there can be changed.
- Pasting scanner output without triage, or calling something "secure" instead of saying what was checked.
