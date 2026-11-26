# What has never been tried on a real server

`launch-proof-test.ts` stands in for a server with an Ubuntu 24.04 machine (systemd, sshd, a user with sudo) in a
**privileged Docker container that runs its own Docker**, reached over SSH with a key Hydor made, on ports of one computer.
That is a good stand-in for what Hydor does (every command, script and file is the real one, run over real SSH against a
real Docker, Compose and Caddy) and a poor one for the facts below. **No server and no platform account was used or asked
for.** Each item says what is not proven and how to try it. Nothing here has been run; none of it is claimed.

"Check the server", "prepare", "launch", "status", "logs", "backups" and "restore" below are the buttons of the app's
Launch and Run pages (the engine's `checkHost`, `launch`, `status`, `logs`, `backups`).

## What the stand-in does not prove

| # | Not proven | Why the stand-in cannot say | Try it |
| --- | --- | --- | --- |
| 1 | **A real certificate for a real name** (Let's Encrypt or ZeroSSL, through Caddy) | The proof uses `.localhost` names, so Caddy signs them with its own authority. The ACME exchange (the challenge on 80 and 443, rate limits, a name that does not yet resolve) never happens. | Point an `A` record of a spare name at a small server, add it, check and prepare it, launch to `https://app.example.com`. The address step should pass, ready takes a few seconds longer the first time, and the browser's padlock is a public one. Caddy's log says "certificate obtained successfully". |
| 2 | **A name under `.test` to a server** | The proof's server is this computer (`.localhost`); `.test` was checked with stand-ins only. | Launch to a server at `https://app.test`, and open it with the server's address in your computer's hosts file. |
| 3 | **Prepare on a real machine, and on Debian** | The container has an Ubuntu userland and systemd but shares the outer kernel; memory and disk figures are the outer computer's; no cloud-init, provider firewall or real apt mirrors. Debian was never tried. | On a fresh Ubuntu 24.04 and a fresh Debian 12 server (1 and 2 GB of memory): check (Docker missing, steps printed, nothing installed), then prepare ("ready for apps"). `sudo ufw status` shows SSH, 80 and 443; from outside, nothing else answers. Also a user with no sudo (refused with what to do) and another system, such as Fedora ("Debian and Ubuntu only"). |
| 4 | **A firewall that is enforced** | ufw ran in a container that shares the outer kernel's netfilter: it said it was active; whether packets are dropped was not tried. | From another computer: `nc -vz <address> 3000` (the app's port) must be refused; 22, 80 and 443 open. |
| 5 | **A build on a small machine** | The stand-in has the whole computer's memory. | On a 1 GB server without swap the host step should refuse and say how to add swap; with swap, the build should pass. Time it on 2 GB. |
| 6 | **Another processor** | x86-64 only. | Launch from an x86 computer to an ARM server (the image is built there, so it should simply work). |
| 7 | **A reboot** | The stand-in was never rebooted. | `sudo reboot`; a minute later status says up with the same data, and the daily backup is still scheduled. |
| 8 | **The daily backup by itself** | The proof ran the cron script by hand, and read the SQLite service's log for the scheduled time; it does not wait a day. | Leave a launched app a day and a night: the backups list shows `-scheduled` entries (for an app without a SQLite file, `backup.log` in its folder too), and old ones go after the days to keep. |
| 9 | **cron on a server whose clock is not UTC** | The stand-in is UTC. | On a server in another time zone, set the backup time and look at `crontab -l`: the line is in the server's own time. A summer-time change moves it by an hour until the schedule is set again. |
| 10 | **S3 storage other than VersityGW** | The signing was tried against VersityGW (path-style, http) and a recording server. AWS S3, Cloudflare R2, Backblaze B2 and others may differ in region names, addressing or payload rules. | Give `BACKUP_S3_ENDPOINT`, `_BUCKET`, `_REGION`, `_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY`, launch, back up now, look in the bucket. |
| 11 | **Real DNS and several visitors** | One computer, one visitor. | Use it from two networks. |
| 12 | **Downtime on a busy server, with a large database** | The proof's apps are tiny: 3 to 6 seconds. A large database makes the copy at the switch longer; an app without a SQLite file is stopped while its whole folder is copied, twice. | Launch a version of an app with gigabytes of data, with your own poller running; the number the launch says should match. |
| 13 | **Many launches** | The proof makes a handful. Pruning old images, sources and version files was read from the script, not watched over months. Docker's build cache is Docker's to clean. | Launch ten times: `docker image ls` keeps three of the app's images, `releases/` three folders. |
| 14 | **A connection lost half way** | Tried with stand-ins only. | Cut the network during the build, and during a switch. The switch script runs on, on the server; the status says what is live. |

## Apps and Dockerfiles never built for real

| What | Tried | Not tried |
| --- | --- | --- |
| Node, plain and with packages installed by `build` | Both apps of the proof. | A package that compiles from source (the compiler stage), `yarn` and `pnpm`, a build that makes a `dist` folder. |
| Python and Go | Docker's lint (`docker build --check`) of the written files. | A real build and run of either. |
| An app with its own Dockerfile | Unit tests of the choice. | A real build and run: in particular the data folder being given to a user that is not root, in an image without `sh`. |
| A Postgres or other server database | — | Nothing: its data is not in the data folder, so it is not backed up; use the provider's backups. |
| The smoke line | The proof's, run by a runner of the proof's. | Hydor's own runner. The reader of `hydor.json` does not accept `smoke` yet. |

## Things left as they are

- **One app on one server.** A second would need ports 80 and 443 too; sharing one Caddy is not built.
- **No zero-downtime switch**: a data folder cannot have two writers.
- **A key is one line**: a multi-line secret (a private key in PEM) cannot be given yet.
- **The launch's own look is from this computer**: a server only reachable from elsewhere is not looked at.
- **Moving to a new server** keeps neither the keys made on the old one (the app's secret: everyone signs in again) nor the
  backups: pull them first, and give the keys again.
- **Platforms** (Render, Railway, Fly.io): no files are written for them now ([README.md](README.md)).
