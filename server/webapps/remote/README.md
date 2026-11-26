# Launching an app to a server of your own, and running it there

An app that meets Hydor's contract (a `hydor.json` at its root) can be launched to a server the person controls: over SSH,
with Docker and Caddy on it, https, backups and a way back. This folder is the engine; `index.ts` is its whole surface.
What has never been tried on a real server is in [REAL.md](REAL.md).

## Hosts

A host is added as `user@address[:port]`. Hydor makes an ed25519 key for it in a folder of its own (the caller gives it;
never `~/.ssh`); its public line goes in `~/.ssh/authorized_keys` of that user, or in the provider's "SSH keys" box. The
machine's key fingerprints are then shown, and **nothing is recorded until the person accepts one**. Every later
connection insists on that key (`StrictHostKeyChecking=yes`, the folder's own `known_hosts` and `ssh_config`, only
Hydor's key, no agent): a machine that shows another key is refused in plain words and nothing is sent to it.

`check` says what is there and missing: Docker 24+ and Compose 2.20+, memory (1.5 GB with swap: the image is built on
the machine), disk (5 GB), ports 80 and 443, the firewall, cron. `prepare` (Debian and Ubuntu, as root or with sudo without
a password, only when asked) installs Docker from Docker's own apt repository, adds the user to the `docker` group,
installs cron if it is missing, sets ufw to let in SSH, 80 and 443, and keeps containers from the provider's metadata
address (below). Docker opens the ports it publishes whatever ufw says; a launch publishes 80 and 443 only.

A new rented server can instead be made with a text pasted as it is created (`firstboot.ts`, cloud-init user data): it
gives the machine its first identity, lets in Hydor's key and runs `prepare`'s script. Over the first connection, which
only a machine holding that identity gets, the server makes itself a new one, Hydor records that and no other, the old one
is dropped and the new one is connected to before the server is recorded at all. The text the provider keeps is then of
no use to pose as the server.

**The provider's metadata address** (169.254.169.254, fd00:ec2::254, fe80::a9fe:a9fe), which serves the text pasted into
the server among other things, is refused to everything arriving from a container (`metadata.ts`: a raw `PREROUTING`
rule). The machine itself still reaches it. A launch's compose project has a `guard` service that sets the rules and
that the app waits for; `prepare` and the first-start text also set them as a unit that runs before Docker. On a server
neither has set up that way, there are a few seconds after a restart before the guard is back.

## The steps of a launch

Fourteen steps that do not change (`LAUNCH_STEPS`), each reported as it starts and ends.

| Step | Where | What |
| --- | --- | --- |
| `check` | here | The caller's contract check. Failed `file`, `build` or `ready` lines stop; any other failed line stops unless it is let through by its id, which is recorded. An app with `"signIn": "hydor"` stops here: on a server nobody could sign in. |
| `host` | server | Reached with the accepted key; what `check` looks at. |
| `keys` | here | Every key has a value given, one already on the server, or is to be made. A missing one stops, by name. |
| `address` | here | https, a name, no path. A real name must resolve to the server. `.localhost` (this computer only) and `.test` are for trying: Caddy signs them itself. |
| `files` | here | A Dockerfile (the app's own, or one written for it), what is sent, no key value written in any file. |
| `send` | server | A tar of the app's files over SSH, without dependencies' folders, builds, the data folder, every `.env*` but the examples, databases and git (a git repository sends only what git keeps). |
| `build` | server | `docker build` on the server, and the small image of the backup service. What runs is not touched. |
| `configure` | server | The next compose file, Caddy's file, `.env` (no secret), `app.env` and `backup.env` (mode 600). Keys arrive on SSH's standard input. |
| `snapshot` | server | When something was launched: a backup of its data. An app with no SQLite file is stopped for it. |
| `switch` | server | The old app is told to stop (SIGTERM, 20 s); the data is marked as it is; the new one starts; the launch waits for its ready address on the project's own network. |
| `ready` | here | The ready address at the real address, over https. |
| `smoke` | here | The ready address, the first page (only a server error, a loop or no answer fails it: the contract promises nothing of `/`), and the app's smoke line when it has one. |
| `backup` | server | A backup, restored into a scratch folder and read back (SQLite's `integrity_check`, the rows of every table, or every file). **A launch counts only after this**; else it is "live, but not done". |
| `record` | server | `state/history.jsonl` on the server, and the same record to the caller. No key in it. |

**When it fails.** Before `switch` nothing running was touched. From `switch` on, the previous version is put back by
itself, with its own files and keys; if the new version had changed the data (a SQLite file's contents or shape, or any
file of an app without one), the data is put back as it was when the old version stopped, and what the new one had is
kept as a backup. On a first launch there is nothing to put back: the app is stopped.

**Going back** (`rollback`) returns to the version before, and going back again goes forward. It refuses when the
database has changed shape since that version ran, unless the data is also put back as it was before the launch being
undone (what was written since is lost from the app, and kept in a backup).

**Downtime.** Two versions never write one data folder, so a switch stops one and starts the other: a few seconds,
measured from this computer and said.

## What an app must do

Exactly what the contract says already: read its port and data folder from the variables `env` names, listen on the
address in `HOST`, answer `ready` with 2xx or 3xx with nobody signed in, keep everything in its data folder, and stop
politely on SIGTERM. On a server `HOST` is `0.0.0.0` (inside Hydor it is `127.0.0.1`), so an app that hard-codes
127.0.0.1 never becomes ready; the launch says exactly that. The app is given `HOST`, `NODE_ENV=production`, the port
(3000), the data folder (`/data`), `env.url` (the address), `env.secret` (made on the server, kept there) and its keys.
It gets no `HYDOR_URL`: Hydor's services do not exist on the server.

## Keys

Values come from the caller as a map by name and go to the server over the connection's standard input, never in a
command line, a script, a file of the app, the image, the compose file, a log or a record. They are written to `app.env`,
the backup storage's to `backup.env` (which the app never sees), mode 600. `made` keys and `env.secret` are made on the
server the first time (32 random bytes). A key the server already holds need not be given again. A key is one line.
Everything shown is masked: the values given and those the server holds, `Bearer …`, `…SECRET=…`, a database URL's
password.

## The Dockerfile

The app's own `Dockerfile`, as it is (then `build` and `start` of `hydor.json` are not used on the server, and the image
must listen on `HOST` and the port, keep its data where `env.data` says, and needs `sh` and `id` in it, or a numeric `USER`,
for the data folder to be given to its user). Else Hydor writes one:

- **Node**: `start` runs `node`, `npm`, `npx`, `yarn`, `pnpm` or `node_modules/.bin/…`. `node:<major>-bookworm-slim` (from
  `engines.node` or `.nvmrc`, else 22); `build` runs in a first stage (with a compiler when the lock file has a package
  with an install script), the result is copied to a clean stage; runs as `node`. A `package.json` with dependencies and
  no `build` line is refused with the line to add.
- **Python**: `start` runs `python`, `gunicorn`, `uvicorn` and the like, or a program of a `.venv`. `python:3.12-slim` (or
  `.python-version`'s); `build` runs in it; `pip install --user` works; runs as an unprivileged user.
- **Go**: there is a `go.mod`, `start` runs a program of the folder and `build` makes it. Built in `golang:1-bookworm`, run on
  `debian:bookworm-slim`.

Anything else (Ruby, Java, Rust, PHP, two languages at once…) is refused with a sentence that says to add a Dockerfile.

## Backups

The `backup` service is a small image of its own (Node and `sqlite3`) running `hydor-backup` (`backup-program.ts`). A
backup is `<id>.tar.gz` and `<id>.json` in `~/hydor-apps/<app>/backups`, in the format Hydor writes for apps launched inside
it. A SQLite file named in `hydor.json` is copied by SQLite's online backup while the app runs; for anything else the app
is stopped while its folder is copied, which is said. The daily backup (03:30 UTC, kept 14 days, the newest three always)
is the service's own timer for a SQLite app, and a line in the user's crontab (`backup.sh`) for the others, because only
the server can stop the app. `restore` needs a yes, stops the app, keeps what is there first, puts the backup back and
starts it. `pull` copies one here. With `BACKUP_S3_*` given, every backup is also PUT to S3-compatible storage (AWS
Signature V4, path-style); retention there is the storage's.

## On the server

In the login user's home, `~/hydor-apps/<app>/`: `compose.yaml`, `Caddyfile`, `.env`, `app.env`, `backup.env`,
`releases/<id>/` (the last three sources), `state/` (what is live and was before, the history, each recent version's files),
`backups/`. Docker volumes: the data, Caddy's certificates and its settings. Compose runs `app` (no port published), `caddy`
(80 and 443), `backup` and `guard` (the rules above; host network, `NET_ADMIN` and nothing else). **One server holds one app** (80 and 443 are Caddy's): the host step says so, and `takeDown`
frees a server (data, keys and backups stay).

## Decisions

- **The image is built on the server**: the person may have no Docker, or another kind of processor, and a source is far
  smaller than an image.
- **Compose and Caddy 2**: https by itself (Let's Encrypt or ZeroSSL for a real name). Keep Caddy's volume.
- **The record is on the server and with the caller**: the engine never writes into the app's folder.
- **One change at a time**: in the program by a lock per deployment, on the server by `flock` for what stops or copies.

## Not here: Render, Railway and Fly.io

Earlier code wrote their files (`render.yaml`, `fly.toml`, `.railway/railway.ts`). They are not moved: they need a Dockerfile and
an entry point written into the app, none was ever deployed to, and it is not small. What was learned, for whoever brings
them back (each platform's pages, read 24 November 2026): a disk means one instance everywhere; Render stops the old
instance before the new one (no deploy without downtime), snapshots the disk daily for seven days and needs a paid plan;
Fly.io's `rolling` replaces the one Machine in place (canary and bluegreen do not work with a volume) and snapshots daily
for five days; Railway's `railway.json` is deprecated (not read after 1 December 2026) in favour of `.railway/railway.ts`;
platforms mount a disk as root, so the image's entry point has to give it to the app's user and drop root.

## Checks

```sh
npm test -- webapps/remote        # a stand-in for SSH; the backup program and the server's plain scripts run for real
```

The proof with a machine over real SSH and Docker (a stand-in server in a privileged container; two apps given by their
folders) is `launch-proof-test.ts`; its head says how to run it.
