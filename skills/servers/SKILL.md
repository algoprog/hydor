---
name: servers
description: Use when looking after a server or another computer, usually over SSH (updates, a failing service, a full disk, users and keys, the firewall, backups, many machines). Not for containers (docker) or an unexplained error (troubleshooting).
category: coding
triggers: [ssh into, over ssh, ssh key*, home server*, linux server*, remote server*, vps*, systemctl, journalctl, firewall rule*, ansible*, disk is full]
---

# Servers

Looking after a server (a rented VPS, a home server, a Raspberry Pi, an office machine) mostly
happens over SSH, on a machine other people may rely on. Find out what it is before changing
anything, keep a way back in before touching SSH, the firewall or the network, change one thing at a
time with a check after each, and prove the result from where people use it.

If Hydor itself runs on that computer, the person can add it in **Settings → App → Machines** and
start sessions there, which work on it directly
([Use other machines from one app](/guide/devices#use-other-machines-from-one-app)).

## 1. Find out what it is, without changing anything

- Ask what you cannot see: what the machine is for, who relies on it, whether a few minutes of
  downtime is fine, and whether there is a way in besides SSH (the provider's web console, a screen
  and keyboard, someone on site).
- Your shell cannot answer prompts: `ssh -o BatchMode=yes -o ConnectTimeout=10 web1 'uptime'`.
  "Permission denied (publickey)": the key is not accepted (step 2). "Host key verification failed"
  on a first visit: the person confirms the fingerprint, or add `-o StrictHostKeyChecking=accept-new`
  (takes a new key, still refuses a changed one). A changed key is for the person to explain first.
- Survey it with this skill's script (give its full path):
  `ssh -o BatchMode=yes -o ConnectTimeout=10 web1 'sh -s' < scripts/discover.sh`. It changes nothing
  and works on Linux, macOS and the BSDs, whatever the login shell; `sh scripts/discover.sh` surveys
  this computer.
- Note the OS and version, the service manager (systemd, OpenRC, launchd, rc), the package manager,
  the firewall tool in charge, who you are and how you get root, what listens on which port, how full
  the disks are, a pending reboot, and whether it is a container. Never guess these from the name:
  `apt` is not on Fedora, `systemctl` not on a BSD.

## 2. Keys, passwords and root

- Keys, not passwords. The person makes one (`ssh-keygen -t ed25519`) and copies it over with
  `ssh-copy-id user@web1` in their own terminal (Hydor's **Terminal**, under **System**), typing the
  password there. The `.pub` file is safe to share; the private key never leaves their computer.
- A password you need anyway (for sudo, say): ask with `request_secret` (a name like
  `WEB1_SUDO_PASSWORD`, `commands: true`, a `why` naming the account and machine), never in the chat,
  and use it through `run_with_secrets`:
  `printf '%s\n' "$WEB1_SUDO_PASSWORD" | ssh web1 'sudo -S -p "" systemctl restart nginx'`
  (several commands: `sudo -S -p "" sh -c '...'`). Password-only servers: `references/access.md`.
- Do not change sudo rules, users or keys to make your own access easier without the person's yes.
- Reaching a home server from outside: a private network such as Tailscale, not ports opened on the
  router (`references/access.md`).

## 3. Plan the change and the way back

| Kind | Examples | Before you do it |
| --- | --- | --- |
| Read-only | status, logs, disk use | Go ahead |
| Small, reversible | a package, one setting, restarting a service | Say what and how to undo it |
| Access | SSH settings, firewall, network, sudo, users, keys | The person's yes, and step 4 |
| Big | all updates, reboots, a new OS release, disks | The person's yes, a quiet time, a backup that restores |
| Destructive | deleting data, users or disks | The person's yes after showing exactly what goes |

Before editing a file, copy it (`sudo cp -a /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak-$(date +%F)`),
change the least you can, check it with the program's own checker, then reload:

| Program | Check | Then |
| --- | --- | --- |
| SSH | `sudo sshd -t` | `sudo systemctl reload ssh` (`sshd` on Fedora, RHEL, Arch, SUSE) |
| nginx | `sudo nginx -t` | `sudo systemctl reload nginx` |
| Apache | `sudo apachectl configtest` | `sudo systemctl reload apache2` (`httpd` on Fedora, RHEL) |
| Caddy | `caddy validate --config /etc/caddy/Caddyfile` | `sudo systemctl reload caddy` |
| sudo rules | `sudo visudo -c` | edit only with `sudo visudo -f /etc/sudoers.d/<name>` |
| systemd unit | `systemd-analyze verify <name>.service` | `sudo systemctl daemon-reload`, then restart it |
| nftables | `sudo nft -c -f /etc/nftables.conf` | `sudo nft -f /etc/nftables.conf` |
| PF (BSD, macOS) | `sudo pfctl -nf /etc/pf.conf` | `sudo pfctl -f /etc/pf.conf` |

Use dry runs where they exist (`apt-get -s upgrade`, `dnf upgrade --assumeno`,
`ansible-playbook --check --diff`). One machine first; the others after it works, a few at a time.

## 4. Never lock yourself out

Before changing SSH, the firewall, the network or sudo (the `sudo` commands below run on the server,
with step 2's pattern when sudo asks for a password):

1. **Keep a connection open** that the change cannot end: a background one your commands share
   (`references/access.md`), or the person's own terminal.
2. **Schedule the undo first**, where systemd runs:
   `sudo systemd-run --on-active=5min --unit=undo-fw ufw disable`; make the change; test; then
   `sudo systemctl stop undo-fw.timer`. Cut off? It undoes itself in five minutes. The undo for each
   tool is in the reference.
3. **Allow SSH before turning a firewall on**: `sudo ufw allow OpenSSH`, or the port SSH really uses
   (`sudo ss -tlnp | grep sshd`).
4. **Test a fresh login** before closing anything:
   `ssh -o ControlPath=none -o BatchMode=yes web1 'sudo -n true || echo sudo-needs-password'`.
5. **Password logins off only after** a key login and sudo work for the account you keep; check the
   value in force with `sudo sshd -T | grep -iE 'passwordauth|permitroot'`.

## 5. Common Linux jobs

The commands for each distribution (Debian and Ubuntu, Fedora and RHEL, SUSE, Arch, Alpine) and the
longer checklists are in `references/linux.md`.

- **A service that will not start:** `systemctl status nginx --no-pager -l`, then
  `journalctl -u nginx -n 80 --no-pager`; read the first error, not the last. Usual causes: a syntax
  error (the checker above), the port taken (`sudo ss -tlnp | grep ':80 '`), a file missing or
  unreadable for the service's user, a full disk, SELinux on Fedora and RHEL
  (`sudo ausearch -m avc -ts recent`). After "start request repeated too quickly", fix it, then
  `sudo systemctl reset-failed nginx`. Still unknown: follow troubleshooting.
- **Logs:** `journalctl -p err -b --no-pager | tail -n 50` (errors since boot); a program's own logs
  under `/var/log/`. Always bounded (`-n`, `--since`, `tail`): `-f`, `top` and editors never return.
- **Updates:** preview first (`apt-get -s upgrade`, `dnf upgrade --assumeno`), then run them without
  prompts as the reference shows: a question from a package otherwise stops the run halfway. A new
  release (Ubuntu 24.04 to 26.04) is a separate job, with a backup and the release notes.
- **Reboots:** needed when `/var/run/reboot-required` exists (Debian, Ubuntu) or
  `sudo dnf needs-restarting -r` exits with 1 (Fedora, RHEL). Agree a time, `sudo systemctl reboot`,
  wait for SSH to answer again, then check `systemctl --failed` and the service from outside.
- **A full disk:** `df -h`, `df -i` (millions of small files), then
  `sudo du -xh -d 1 / 2>/dev/null | sort -h | tail -n 15` and down into the biggest folder. Usual
  culprits: logs (`sudo journalctl --vacuum-size=500M`), package caches, old kernels, Docker (docker
  skill), deleted files a program still holds (`sudo lsof +L1`). Ask before deleting anything you did
  not make, and never in `/var/lib` (databases live there).
- **Users and keys:** add a user, give admin rights through the `sudo` group (`wheel` on Fedora,
  RHEL, Arch), and put their public key in `~/.ssh/authorized_keys` with the right owner and modes
  (commands in the reference). To block someone: remove their key line and
  `sudo usermod --expiredate 1 alice`, which stops key logins too.
- **Firewall:** only the tool in charge. ufw: `sudo ufw status verbose`, `sudo ufw allow 443/tcp`.
  firewalld: `sudo firewall-cmd --add-service=https`, test, then `sudo firewall-cmd --runtime-to-permanent`.
  Ports Docker publishes are not guarded by either, and a cloud provider's firewall sits in front.

## 6. macOS and the BSDs

| | macOS | FreeBSD | OpenBSD |
| --- | --- | --- | --- |
| Services | `sudo launchctl print system/<label>`; Homebrew: `brew services list` | `service nginx status`; at boot: `sudo sysrc nginx_enable=YES` | `rcctl ls failed`, `rcctl check nginx` |
| Logs | `log show --last 30m --predicate 'process == "sshd"'` | `/var/log/messages` | `/var/log/messages`, `/var/log/daemon` |
| Updates | `softwareupdate --list` | base: `freebsd-update fetch install`; packages: `pkg upgrade` | base: `syspatch`; packages: `pkg_add -u` |
| Firewall | System Settings → Network → Firewall; PF underneath | PF or IPFW | PF |

Restarts with FileVault, FreeBSD 15's packaged base, NetBSD and more: `references/macos-bsd.md`.

## 7. Many machines: Ansible

- The same change on more than two or three machines, or one you will repeat: write an Ansible
  playbook instead of looping over SSH. It reports per machine and stops on errors.
- In order: `ansible-inventory -i hosts.ini --graph`, `ansible all -i hosts.ini -m ping`, then
  `ansible-playbook -i hosts.ini site.yml --limit web1 --check --diff`, the same without `--check`,
  then the rest, a batch at a time (`serial`).
- Modules rather than `shell:`, so a second run changes nothing. A tested example, the sudo password
  through the vault, and common errors: `references/ansible.md`.

## 8. Check after each change

- A command that succeeded only proves it ran. Go as far as the claim needs: the service manager says
  active; no new errors in its log; it listens where it should (`sudo ss -tlnp`); it answers locally
  (`curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/`); it answers from outside, the
  way people use it (`curl -I https://example.com` from the person's computer); and a fresh SSH login
  with sudo still works.
- Report per machine: what changed, the check that shows it works, how to undo it, and what is left
  (evidence-before-done).

## 9. Backups

- Three copies, on two kinds of storage, one in another place. A mirror disk, a synced folder or a
  snapshot on the same machine is not a backup: a deletion or ransomware reaches it too.
- Databases: back up a dump (`pg_dump`, `mysqldump --single-transaction`), not the live files.
- A backup counts once a restore works: into an empty folder, then open some files or load the dump.
- restic, schedules and restore tests: `references/backups.md`.

## Pitfalls

- The right command on the wrong system (`apt` on Fedora, `systemctl` on FreeBSD).
- Host-key checks or password logins switched off to make a connection work.
- A firewall turned on before SSH is allowed, or the SSH port moved without the firewall knowing.
- `tail -f`, `journalctl -f`, `top` or an editor over SSH: they never return.
- One change sent to every machine at once.
- "Active" taken for "working": check the port and from outside.
- Deleting what you do not recognise to free space.
- A backup that was never restored.
- Passwords in commands, files or the chat.
