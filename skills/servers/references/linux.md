# Linux jobs, by distribution

Open this for the exact commands on a given distribution, and for the longer checklists: a service
that will not start, logs, a full disk, users and keys, automatic updates, a new release.

## Commands by distribution

| Job | Debian, Ubuntu | Fedora, RHEL, Rocky, Alma | openSUSE, SLES | Arch | Alpine |
| --- | --- | --- | --- | --- | --- |
| Refresh the package lists | `apt-get update` | done by dnf itself | `zypper refresh` | only with an upgrade: `pacman -Syu` | `apk update` |
| List waiting updates | `apt list --upgradable` | `dnf check-update` (exit code 100 means some) | `zypper list-updates` | `checkupdates` (pacman-contrib) | `apk version -l '<'` |
| Preview | `apt-get -s upgrade` | `dnf upgrade --assumeno` | `zypper update --dry-run` | read archlinux.org news first | `apk upgrade --simulate` |
| Install | `apt-get install -y nginx` | `dnf install -y nginx` | `zypper --non-interactive install nginx` | `pacman -S --noconfirm nginx` | `apk add nginx` |
| Which package owns a file | `dpkg -S /usr/sbin/nginx` | `rpm -qf /usr/sbin/nginx` | `rpm -qf /usr/sbin/nginx` | `pacman -Qo /usr/bin/nginx` | `apk info --who-owns /usr/sbin/nginx` |
| Services | systemd | systemd | systemd | systemd | OpenRC: `rc-service nginx restart`, at boot `rc-update add nginx` |
| Logs besides the journal | `/var/log/syslog`, `/var/log/auth.log` | `/var/log/messages`, `/var/log/secure` | the journal | the journal | `/var/log/messages` |
| Firewall usually | ufw on Ubuntu (off until enabled); none on Debian (nftables ready) | firewalld | firewalld | none, or nftables | none, or nftables |
| Admin group | `sudo` | `wheel` | depends on its sudo setup | `wheel` (enable it in sudoers) | `wheel` (with doas or sudo) |
| SSH service name | `ssh` | `sshd` | `sshd` | `sshd` | `sshd` |

- Arch: always the whole system (`pacman -Syu`); `pacman -Sy` followed by installing one package
  leaves a half-upgraded system that can break.
- Alpine run from RAM ("diskless") keeps changes only after `lbu commit`; check with `lbu status`.
- openSUSE MicroOS and SLE Micro change the system with `transactional-update`, which takes effect at
  the next reboot.

## Updates without prompts (Debian, Ubuntu)

```bash
sudo apt-get update
apt-get -s upgrade | grep -E '^(Inst|Remv)'      # what would change; Remv lines deserve a look
sudo DEBIAN_FRONTEND=noninteractive apt-get -y \
  -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold upgrade
```

- Without a terminal, a package that brings a new version of a config file you edited stops the
  upgrade with a question; the two `--force-conf` options keep your version (the new one is saved
  beside it as `.dpkg-dist`).
- `apt-get upgrade` never removes packages; `apt-get dist-upgrade` (`apt full-upgrade`) may: read the
  list first.
- "Could not get lock": another apt is running (often the daily automatic update). Wait and try again;
  never delete the lock files.

## Automatic security updates

- Debian, Ubuntu: `sudo apt-get install -y unattended-upgrades`; it is on when
  `/etc/apt/apt.conf.d/20auto-upgrades` holds `APT::Periodic::Update-Package-Lists "1";` and
  `APT::Periodic::Unattended-Upgrade "1";`. What it did: `/var/log/unattended-upgrades/`. Reboots
  only if asked to, in a file of your own such as `/etc/apt/apt.conf.d/52reboot`:
  `Unattended-Upgrade::Automatic-Reboot "true";` and `Unattended-Upgrade::Automatic-Reboot-Time "04:00";`.
- RHEL and its rebuilds: `sudo dnf install -y dnf-automatic`, set `apply_updates = yes` in
  `/etc/dnf/automatic.conf` (with `upgrade_type = security` for security fixes only), then
  `sudo systemctl enable --now dnf-automatic.timer`.
- Fedora (dnf5): the package is `dnf5-plugin-automatic` and the timer `dnf5-automatic.timer`; the
  settings file is `/etc/dnf/automatic.conf` as above.
- Reboot needed on Fedora and RHEL: `sudo dnf needs-restarting -r` (exit code 1 means yes; on Fedora it
  comes with `dnf5-plugins`).

## A service that will not start

1. `systemctl status nginx --no-pager -l`: whether it is enabled, when it failed and with what exit
   code, and its last log lines.
2. `journalctl -u nginx -b --no-pager | tail -n 80`. Read the first error.
3. `systemctl cat nginx` shows the unit and its drop-ins. Run its `ExecStart` line by hand as the
   service's user to see the error directly, for ten seconds at most:
   `sudo -u www-data timeout 10 /usr/bin/myapp --config /etc/myapp.yml`.
4. Exit codes systemd adds: `203/EXEC` the program is missing or not executable (or a script without a
   `#!` line); `217/USER` the `User=` does not exist; `200/CHDIR` the `WorkingDirectory=` is missing;
   `226/NAMESPACE` a path in the sandboxing settings is missing.
5. Common causes: a syntax error (run the program's checker); the port taken
   (`sudo ss -tlnp 'sport = :80'`); a missing `EnvironmentFile=`; permissions along a path
   (`namei -l /srv/app/config.yml` shows each folder's owner and mode); a full disk; SELinux on Fedora
   and RHEL (`getenforce`, `sudo ausearch -m avc -ts recent`; wrong labels after moving files:
   `sudo restorecon -Rv /srv/app`); AppArmor on Ubuntu (`sudo journalctl -k | grep -i apparmor`).
   Never switch SELinux off as the fix.
6. Changes to a unit go in a drop-in, `/etc/systemd/system/nginx.service.d/override.conf`, not in
   `/usr/lib/systemd/system` (updates overwrite it); then `sudo systemctl daemon-reload`.
7. "Start request repeated too quickly": fix the cause, then `sudo systemctl reset-failed nginx`.
8. Afterwards: `systemctl is-active nginx`, the port listening, and a request from outside.

Scheduled jobs: `systemctl list-timers` and `crontab -l` (also `/etc/cron.d/`).

## Logs

- `journalctl -u nginx --since "2026-11-04 09:00" --until "2026-11-04 10:00" --no-pager`
- `journalctl -p warning -b --no-pager | tail -n 100`: warnings and worse since boot.
- `journalctl -b -1 -n 100 --no-pager`: the end of the previous boot (after a crash); this needs a
  journal kept on disk (`/var/log/journal` exists).
- `journalctl -k --no-pager | grep -i -E 'out of memory|oom'`: processes killed for memory.
- Size: `journalctl --disk-usage`; a lasting limit goes in
  `/etc/systemd/journald.conf.d/size.conf` (`[Journal]` then `SystemMaxUse=500M`), then
  `sudo systemctl restart systemd-journald`.
- Programs with their own files: `/var/log/nginx/error.log` and similar; rotation rules in
  `/etc/logrotate.d/`.

## A full disk

```bash
df -h                                              # which filesystem is full
df -i /                                            # IUse% near 100%: too many small files
sudo du -xh -d 1 / 2>/dev/null | sort -h | tail -n 15   # then the same inside the biggest folder
sudo lsof +L1 2>/dev/null | head -n 20             # deleted files still held open
```

| Usually | Safe way to free it |
| --- | --- |
| The journal | `sudo journalctl --vacuum-size=500M` |
| Old rotated logs | `/var/log/*.gz` and `*.1` files, after a look |
| Package caches | `sudo apt-get clean`, `sudo dnf clean packages`, `sudo pacman -Sc` |
| Old kernels | `apt-get -s autoremove`, then `sudo apt-get autoremove` |
| Docker | `docker system df`, then the docker skill's clean-up |
| Deleted but open | restart the program `lsof +L1` names |
| Snap revisions | `snap list --all` shows the disabled ones |

Ask before deleting anything you did not make. Never delete inside `/var/lib` (databases, Docker) to
make room, and check what a big file is before removing it: a backup on the same disk may be the
only one.

## Users and keys

```bash
sudo adduser --disabled-password --gecos "" alice        # Debian, Ubuntu (no questions)
sudo useradd -m -s /bin/bash alice                        # elsewhere
sudo usermod -aG sudo alice                               # admin: 'wheel' on Fedora, RHEL, Arch
sudo install -d -m 700 -o alice -g alice /home/alice/.ssh
printf '%s\n' 'ssh-ed25519 AAAA... alice@laptop' | sudo tee -a /home/alice/.ssh/authorized_keys >/dev/null
sudo chown alice:alice /home/alice/.ssh/authorized_keys && sudo chmod 600 /home/alice/.ssh/authorized_keys
```

- A public key is one line beginning `ssh-ed25519` or `ssh-rsa`. Wrong owner or mode on `.ssh` or the
  file makes sshd ignore it.
- Blocking someone: delete their line from `authorized_keys`, and
  `sudo usermod --expiredate 1 alice` (this stops key logins too; `--expiredate ''` lifts it).
  Deleting the account (`sudo userdel alice`; `-r` also deletes the home folder) needs the person's yes.
- Never remove your own key or account, or the last admin, while you are connected through it.
- Who logged in: `last -n 20`; `journalctl -u ssh --since today --no-pager` (`sshd` on Fedora, RHEL).
  Failed tries from the internet are background noise; key-only logins make them harmless.

## Time

`timedatectl` should say "System clock synchronized: yes". A wrong clock breaks TLS certificates,
logins with codes and the order of logs. Time zone: `sudo timedatectl set-timezone Europe/Athens`.

## A new release of the system

A separate job from updates: a backup that restores, a quiet time, the console at hand, and the
release notes for the exact versions. Run it in the person's terminal inside `tmux`, so a dropped
connection does not kill it.

- Ubuntu: `sudo do-release-upgrade`; it opens a second SSH server on port 1022 while it works, as a
  way back.
- Debian: change the release name in the APT sources as the release notes say, then
  `sudo apt upgrade --without-new-pkgs`, then `sudo apt full-upgrade`.
- Fedora: the `dnf system-upgrade` steps from Fedora's documentation. RHEL and its rebuilds: Leapp,
  following the vendor's guide for the exact versions.
