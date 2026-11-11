# Security review of Filebox

I read every module, then tried each route as someone who is not supposed to be able to do the thing. Thirteen problems
came out of it. All are fixed; `test/security.test.mjs` has a test for each, and the service still does everything
README.md describes.

## What I found and how I fixed it

1. **Path traversal when downloading** (`GET /files/<name>`). The name was joined onto the account's folder as it came,
   so `..%2f..%2fsecret.key` read the key that signs sessions, `db.json` with every password hash, or the folder of
   another account. Fixed: every name is checked to be a plain file name (no `/`, `\`, NUL, `.` or `..`, at most 255
   bytes) and the resolved path must have the account's folder as its parent. A folder whose name only begins with the
   account's name (`bob` and `bobby`) is not mistaken for the account's own.
2. **Path traversal when uploading** (`POST /files?name=`). The same join let an upload overwrite any file the server
   can write, such as `secret.key`, and plant files in other accounts' folders. Fixed with the same check, which answers
   400 for such a name; delete uses it too.
3. **Files by id belonged to everyone** (`GET /files/by-id/<id>`). It only checked that you were logged in. Fixed: the
   file must be yours, otherwise 404.
4. **Mass assignment in `PATCH /me`**. Every field of the body was copied onto the account, so
   `{"role":"admin"}` made the sender an admin (and `{"__proto__":{"role":"admin"}}` did the same through the
   prototype). Fixed: only `displayName` and `email` are read from the body.
5. **Prototype pollution in `PUT /me/settings`**. The deep merge followed `__proto__` and `constructor.prototype`, so
   one request put `role: "admin"` on `Object.prototype`, and every account without its own `role` (all but the admin)
   became an admin until the server restarted. Fixed: the merge skips those keys, and only ever looks at a target's own
   keys.
6. **Session tokens accepted without a signature**. The signature was compared with `startsWith`, so an empty one (and a
   one-character one that happened to match) passed, and anyone could write `{"user":"admin"}.` Fixed: the token must
   have exactly two parts and the signature must equal the expected one, compared in constant time.
7. **Predictable password-reset codes**. The code was a hash of the name and the current second, so anyone could work it
   out. Fixed: 24 random bytes from `crypto`, kept only as a hash in the data.
8. **Regular expression that backtracks in the e-mail check** (sign-up and `PATCH /me`). `([a-z0-9]+[._-]?)+` takes
   exponential time on an address like `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!`, which froze the whole server. Fixed:
   the address is cut at the `@` and each part is checked by a pattern that cannot backtrack; at most 254 characters.
9. **Stored XSS on the share page**. The file name went into the HTML as it was, so a file named
   `<img src=x onerror=...>` ran in the browser of anyone who opened the link. Fixed: the name is escaped.
10. **Share links never expired**. The expiry was saved but never looked at. Fixed: a link past its time (page and
    download) answers 404.
11. **`GET /admin/users` had no admin check**. Any logged-in account could list all accounts and e-mail addresses.
    Fixed: `requireAdmin`, as the other admin routes.
12. **Sessions survived log-out and password changes**. Tokens named only the account, so a stolen one worked until it
    ran out. Fixed: a token now names a session kept in the data; log-out ends that session, a password change or reset
    (and removing an account) ends all of the account's sessions, and a changed password returns a new token.
13. **The 10 MB upload limit was not enforced**. README.md promises it, the code read any size into memory. Fixed:
    uploads are read with a limit of 10,485,760 bytes (a larger length header is refused before reading, and a body
    sent in chunks is cut when it passes the limit), answering 413.

## Not changed

Logging in has no limit on the number of attempts, and the service speaks plain HTTP: put it behind a proxy with TLS and
a rate limit before it faces the internet.
