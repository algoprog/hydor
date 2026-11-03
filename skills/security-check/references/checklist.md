# Security checklist and search patterns

Searches find candidates, not bugs: for each hit, trace whether outside input can reach it and what an
attacker would gain. `git grep` searches tracked files; add `-i` for case-insensitive, `-l` for file
names only. With ripgrep installed, `rg -n` takes the same patterns.

## Where input enters

```bash
git grep -n -E "\b(app|router)\.(get|post|put|patch|delete|all|route)\(|@app\.route|@router\.|\bpath\(\s*['\"]|@(Get|Post|Put|Delete)Mapping"
git grep -n -E "req\.(body|query|params|headers|cookies)|request\.(args|form|json|GET|POST|data)"
git grep -n -E "multer|formidable|UploadFile|request\.files|FileStorage"
```

List each route with its method, who may call it, and which inputs it reads.

## Injection sinks by language

**JavaScript / TypeScript**

```bash
git grep -n -E '\.query\(\s*`|\.query\([^)]*\+|\.raw\(|sequelize\.query|knex\.raw|\$queryRawUnsafe|\$executeRawUnsafe'
git grep -n -E "child_process|execSync\(|(^|[^.[:alnum:]_])exec\(|shell:\s*true"
git grep -n -E "eval\(|new Function\(|vm\.run|setTimeout\(\s*['\"\`]"
git grep -n -E "innerHTML|outerHTML|insertAdjacentHTML|document\.write|dangerouslySetInnerHTML|v-html"
git grep -n -E "res\.redirect\(|location\.href\s*=|window\.open\("
git grep -n -E "fetch\(|axios\.|got\(|http\.get\(|request\(" -- '*.ts' '*.js'
```

**Python**

```bash
git grep -n -E "execute\(\s*f[\"']|execute\([^)]*%|execute\([^)]*\+|\.raw\(|text\(\s*f[\"']"
git grep -n -E "os\.system|subprocess\.[a-z_]+\(.*shell\s*=\s*True|os\.popen"
git grep -n -E "\beval\(|\bexec\(|pickle\.loads?|yaml\.load\(|yaml\.unsafe_load|marshal\.loads|shelve\.open|torch\.load"
git grep -n -E "mark_safe|\|\s*safe\b|Markup\(|render_template_string"
git grep -n -E "requests\.(get|post)|httpx\.|urllib\.request\.urlopen"
git grep -n -E "open\([^)]*\+|send_file\(|send_from_directory\(|extractall\("
```

**Other**

- Go: `fmt.Sprintf` building SQL, `exec.Command("sh", "-c", ...)`, `template.HTML(`, `filepath.Join` with
  user input, `http.Get(` with user URLs.
- Java: `Statement.execute` with concatenation, `Runtime.exec`, `ObjectInputStream`, XML parsers without
  disabled external entities (XXE).
- PHP: `mysqli_query` with concatenation, `system(`, `exec(`, `unserialize(`, `include $_GET`.
- Ruby: `where("... #{...}")`, `system(`, backticks, `Marshal.load`, `YAML.load` on old Psych, `html_safe`.

## Secrets

```bash
git grep -n -I -i -E "(api[_-]?key|secret|token|passw(or)?d|private[_-]?key)\s*[:=]" -- . ':!*.lock' ':!package-lock.json'
git grep -n -I -E "BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY"
git ls-files | grep -i -E '(^|/)\.env($|\.)|\.pem$|\.p12$|\.pfx$|id_rsa|credentials'
gitleaks git -v .                          # the whole history, when installed
trufflehog git file://. --results=verified,unknown
```

Placeholders and test values are fine; real-looking values are findings. Report the place, never the value.

## Authentication and sessions

- [ ] Every route requires sign-in unless it is meant to be public; the public ones are listed.
- [ ] Each read or write of an object by id checks the caller owns it or may act on it.
- [ ] Admin and support functions are checked on the server.
- [ ] Passwords: argon2id, bcrypt or scrypt; minimum length; no maximum below 64; breached-password check
      if possible.
- [ ] Sign-in, sign-up and reset are rate-limited; messages do not reveal whether an account exists.
- [ ] Reset and invite tokens are random, single-use, short-lived, and stored hashed.
- [ ] Sessions: new id at sign-in, expiry, server-side invalidation at sign-out and password change.
- [ ] Cookies: `HttpOnly`, `Secure`, `SameSite`; CSRF protection on state-changing requests with cookie auth.
- [ ] JWT: algorithm pinned, signature verified, `exp`, `aud`, `iss` checked; keys rotated.
- [ ] Multi-tenant data: every query filters by tenant; tested with two tenants.

## Configuration and headers

- [ ] Production runs without debug mode, verbose errors, or development servers.
- [ ] `Content-Security-Policy` (at least `default-src 'self'`, `frame-ancestors 'none'` or the allowed
      parents), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`.
- [ ] CORS: explicit origins; never `*` together with credentials.
- [ ] Services bound to 127.0.0.1 unless they must be reachable; firewall closes everything else.
- [ ] Database users have only the rights the app needs; no app connecting as a superuser.
- [ ] Containers run as non-root, read-only file system where practical, no secrets in images.
- [ ] Backups exist, are encrypted, and restoring them has been tried.
- [ ] Logs record security events (sign-ins, permission denials) without passwords, tokens or full
      card numbers.

## Uploads and files

- [ ] Size limit enforced before reading the whole body.
- [ ] Type checked from the content (magic bytes), not the name or the browser's declared type.
- [ ] Stored outside the web root, under generated names; served with `Content-Disposition: attachment`
      or from a separate domain when users upload HTML or SVG.
- [ ] Archives unpacked with a path check on every entry (zip slip) and a limit on total size.
- [ ] Images re-encoded or stripped of metadata when privacy matters.

## Outgoing requests (SSRF)

- [ ] Only `http` and `https`; hosts on an allowlist when possible.
- [ ] The resolved address is checked against private ranges: 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12,
      192.168.0.0/16, 169.254.0.0/16 (cloud metadata), 0.0.0.0/8, ::1, fc00::/7, fe80::/10.
- [ ] Redirects disabled, or each hop checked again; the connection goes to the address that was checked
      (no second lookup that could return another one).
- [ ] Timeouts and response size limits set.

## Language-model features

- [ ] Text from users, documents and web pages is treated as data; it cannot widen the model's tools or
      permissions.
- [ ] Tools the model can call act with the current user's rights, not the app's.
- [ ] Model output is escaped before it is rendered as HTML, and validated before it is used in queries,
      commands or file paths.
- [ ] Secrets never go into prompts.

## Severity guide

Rate by impact (what an attacker gains) and likelihood (who can reach it, how hard it is):

| | Easy to reach (anonymous, public) | Needs an account | Needs admin or local access |
| --- | --- | --- | --- |
| Full control, all data | Critical | Critical | High |
| Other users' data | Critical | High | Medium |
| Own data, limited effect | Medium | Medium | Low |
| Information only | Low | Low | Low |
