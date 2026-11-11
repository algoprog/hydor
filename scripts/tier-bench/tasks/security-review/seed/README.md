# Filebox

A small file-sharing service: people sign up, keep files, and send a link to anyone they like. Plain Node.js 22 with no
packages.

```bash
ADMIN_PASSWORD=choose-one PORT=3000 DATA_DIR=./data node src/server.mjs
npm test
```

- `PORT`: the port to listen on (3000 if not set).
- `DATA_DIR`: where everything is kept (`./data` if not set): `db.json` (accounts, file records, share links),
  `secret.key` (the key that signs session tokens), `outbox.jsonl` (the e-mails the service "sends") and
  `files/<user name>/` (each person's files).
- `ADMIN_PASSWORD`: when set, the account `admin` is made on the first start with this password. It is the only way to
  get an admin; there is none otherwise.

Every answer that has a body is JSON, except downloads and the share page. Mistakes answer with a 4xx status and
`{ "error": "..." }`. Requests that need you to be logged in carry `Authorization: Bearer <token>`; without a valid one
the answer is 401.

## Accounts

- `POST /signup` with `{ name, password, email }` makes an account and answers 201 `{ id, name }`. The name has 3 to 32
  characters: lower-case letters, digits, `_` or `-`. The password has at least 8 characters. The e-mail address looks
  like `name@host.domain`: letters, digits, dots, hyphens and underscores before the `@`, and a host with at least one
  dot after it. A name that is taken answers 409, anything invalid 400.
- `POST /login` with `{ name, password }` answers 200 `{ token, expiresAt }`; a session lasts 24 hours. A wrong name or
  password answers 401.
- `POST /logout` ends the session whose token you send. Your other sessions keep working. Answers 204.
- `GET /me` answers your profile `{ id, name, displayName, email, role, createdAt }`. `role` is `user` or `admin`.
- `PATCH /me` changes your `displayName` (1 to 100 characters) and your `email`. Nothing else about the account can be
  changed this way. Answers 200 with the profile.
- `POST /me/password` with `{ current, password }` changes your password and answers 200 `{ token, expiresAt }`, a new
  session. Every session you had before, on any device, ends: their tokens are refused from then on. A wrong `current`
  answers 401.
- `POST /reset` with `{ name }` e-mails that account a reset code, and answers 202 whether or not the account exists.
  The e-mail is a line of `outbox.jsonl`: `{ "to", "name", "code", "at" }`.
- `POST /reset/confirm` with `{ name, code, password }` sets a new password if the code is the last one sent to that
  account and is less than an hour old, and answers 204; a wrong or old code answers 400. A code works once. Like a
  password change, a reset ends every session the account had.
- `GET /me/settings` answers your settings, a JSON object. `PUT /me/settings` merges the object you send into it and
  answers 200 with the result: an object inside an object is merged key by key, any other value replaces the old one.
  After `{"theme":{"dark":true}}` and then `{"theme":{"size":2},"lang":"en"}` the settings are
  `{"theme":{"dark":true,"size":2},"lang":"en"}`.

JSON bodies can be up to 1 MB.

## Files

Your files are kept in `DATA_DIR/files/<your name>/`. A name that exists is replaced.

- `POST /files?name=<name>` with the file's bytes as the body saves a file and answers 201
  `{ id, name, size, createdAt }`. A file can be up to 10 MB (10,485,760 bytes); a larger one answers 413 and is not
  kept.
- `GET /files` answers the list of your files, `[{ id, name, size, createdAt }]`, by name.
- `GET /files/<name>` downloads one of your files. Answers 404 if you have no such file.
- `GET /files/by-id/<id>` downloads one of your files by its id. Answers 404 if you have no such file.
- `DELETE /files/<name>` deletes one of your files and the share links to it. Answers 204.
- Downloads are `application/octet-stream` with `Content-Disposition: attachment`.

## Share links

- `POST /files/<name>/share` makes a link for one of your files and answers 201 `{ token, url, expiresAt }`. The link
  works for seven days, for anyone, with no log-in.
- `GET /s/<token>` is a web page for the file (its name, who shares it, its size, a download button).
  `GET /s/<token>/download` downloads it. After the seven days, or after the file is deleted, both answer 404.

## Admins

Only admins can use these; anyone else gets 403.

- `GET /admin/users` answers every account, `[{ id, name, email, role, createdAt }]`.
- `GET /admin/stats` answers `{ users, files, bytes }`.
- `POST /admin/users/<id>/role` with `{ role }` (`user` or `admin`) sets an account's role and answers
  `{ id, role }`.
- `DELETE /admin/users/<id>` removes the account, its files and its share links, and answers 204. An admin cannot
  remove their own account (400).

## Other

- `GET /health` answers `{ "ok": true }`.
