# Backups

Open this to set up backups for a server or computer, to check the ones it has, or before a big
change. A backup is worth only the restores it has passed.

## What to back up, and where

- **Yes:** what cannot be made again. Databases (as dumps, below), uploaded and user files, `/etc`
  (the settings), home folders, an app's data folder or export, Docker volumes holding data, and the
  list of installed packages (`apt-mark showmanual`, `dnf repoquery --userinstalled`).
- **No:** the system itself (reinstalling is quicker), caches, `node_modules`, Docker images (pulled
  or built again), `/proc`, `/sys`, `/dev`, `/run`, `/tmp`.
- **3-2-1:** three copies of the data, on two kinds of storage, one of them in another place (a cloud
  bucket, a disk at another house). A mirror disk (RAID), a synced folder or a snapshot on the same
  machine is not a backup: a deletion, a fire or ransomware reaches it too. A provider's snapshots are
  handy, but they sit with the same provider.
- **The keys to the backup** (its password, the storage login) are kept somewhere else as well, in the
  person's password manager: without the password the backup cannot be read, by anyone.

## Databases: dump them first

Copying a running database's files gives a backup that may not open. Back up a dump instead:

| Database | Dump | Load it back |
| --- | --- | --- |
| PostgreSQL | `sudo -u postgres pg_dump -Fc mydb > mydb.dump` | `pg_restore -d mydb_restored mydb.dump` (into a database made with `createdb`) |
| MySQL, MariaDB | `mysqldump --single-transaction --routines mydb > mydb.sql` (`mariadb-dump` on new MariaDB) | `mysql mydb_restored < mydb.sql` |
| SQLite | `sqlite3 app.db ".backup 'app-copy.db'"` (safe while in use) | open the copy |
| In Docker Compose | `docker compose exec -T db pg_dump -U postgres -Fc app > app.dump` | as above |

## restic: one good tool

restic makes encrypted, deduplicated snapshots to a local disk, an SFTP server, S3-compatible storage
(Backblaze B2, Wasabi, AWS) or its own REST server. Install it from the package manager
(`apt-get install restic`, `dnf install restic`, `brew install restic`) and check `restic version`.
Other good tools: BorgBackup (with borgmatic), Kopia, Time Machine on a Mac.

```bash
sudo install -d -m 700 /etc/restic
# the password: a long random one, also saved in the person's password manager
sudo sh -c 'umask 077; openssl rand -base64 32 > /etc/restic/password'
export RESTIC_REPOSITORY=sftp:backup@nas.local:/srv/restic/web1   # or /mnt/usb/restic, s3:...
export RESTIC_PASSWORD_FILE=/etc/restic/password

restic init                                        # once, on an empty place
restic backup /etc /srv/app /var/backups --exclude-file /etc/restic/excludes --tag daily
restic snapshots                                   # what exists
restic ls latest | head -n 30                      # what is in the newest one
```

- Run these as root on the server (`sudo -i` first, or through `sudo -S` as SKILL.md shows): root's
  SSH key and `known_hosts` are the ones used for an SFTP target, so test once by hand before
  scheduling.
- `/etc/restic/excludes` holds one pattern per line (`/srv/app/cache`, `*.tmp`).
- Storage logins for S3-compatible targets (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) go in a file
  only root can read, never in the repository address, a unit file or the chat.
- In Hydor, a password the person gives through `request_secret` reaches restic with
  `run_with_secrets` (`RESTIC_PASSWORD="$WEB1_RESTIC_PASSWORD" restic snapshots`); a backup that runs by
  itself on the server needs it in the root-only file.
- A database dump straight into the backup, failing the backup when the dump fails:
  `restic backup --stdin-filename mydb.dump --tag db --stdin-from-command -- sudo -u postgres pg_dump -Fc mydb`.

## Keep, thin out, and check

```bash
restic forget --dry-run --keep-daily 7 --keep-weekly 5 --keep-monthly 12 --group-by host,paths,tags
restic forget --keep-daily 7 --keep-weekly 5 --keep-monthly 12 --group-by host,paths,tags --prune
restic check                          # the repository's structure
restic check --read-data-subset=5%    # and a sample of the data itself
```

- Always read the dry run first: it lists what would be removed. `--group-by` keeps each source and
  tag on its own schedule.
- `forget` alone only drops the snapshot entries; space comes back with `--prune` (or `restic prune`),
  which is slow on big repositories and locks them: run it weekly, not with every backup.
- "Repository is already locked": make sure no restic is running (`pgrep -a restic`, the timer's
  status) before `restic unlock`, which removes only stale locks.

## Schedule it (systemd)

```ini
# /etc/systemd/system/restic-backup.service
[Unit]
Description=Back up with restic
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
EnvironmentFile=/etc/restic/env
ExecStart=/usr/bin/restic backup /etc /srv/app /var/backups --exclude-file=/etc/restic/excludes --tag daily
Nice=10
IOSchedulingClass=idle
```

```ini
# /etc/systemd/system/restic-backup.timer
[Unit]
Description=Daily restic backup

[Timer]
OnCalendar=*-*-* 02:30
Persistent=true
RandomizedDelaySec=15min

[Install]
WantedBy=timers.target
```

- `/etc/restic/env` (mode 600) holds `RESTIC_REPOSITORY=...` and `RESTIC_PASSWORD_FILE=/etc/restic/password`.
- `systemd-analyze verify /etc/systemd/system/restic-backup.service`, then
  `sudo systemctl daemon-reload && sudo systemctl enable --now restic-backup.timer`.
- Run it once now (`sudo systemctl start restic-backup.service`), then read
  `journalctl -u restic-backup -n 50 --no-pager` and `systemctl list-timers restic-backup.timer`.
- The weekly `forget --prune` and `check` get a service and timer of their own, the same way.
- Notice when it stops: `restic snapshots --tag daily --latest 1 --json` gives the newest time. In
  Hydor, a scheduled task (`schedule_task`) can check each morning that it is under a day and a half
  old, and tell the person when it is not.

## Test a restore

Every few months, and after any change to the backup:

```bash
restic snapshots --tag daily                                   # pick one
restic restore latest --tag daily --target /tmp/restore-test --include /etc/nginx
diff -r /tmp/restore-test/etc/nginx /etc/nginx && echo same
restic restore latest:srv/app --tag daily --target /tmp/restore-app   # a folder's contents only
```

- `--include` takes paths as `restic ls latest` shows them.
- Open a few restored files. For a database dump, load it into a scratch database and count the rows of
  a table that matters; drop the scratch database afterwards.
- Never restore over the live data as a first step: restore elsewhere, check, then swap with the
  person's yes.
- Write down what was restored, how long it took and what did not work.
