# macOS and the BSDs

Open this when the survey shows macOS, FreeBSD, OpenBSD or NetBSD. They share SSH and much of the
shell with Linux, but services, updates and firewalls work differently: never use the Linux commands
on them.

## macOS

- **Remote Login** (SSH) is turned on in System Settings → General → Sharing → Remote Login, where the
  person also chooses which users may log in.
- **Services** run under launchd. System-wide ones are in `/Library/LaunchDaemons`, per-user ones in
  `~/Library/LaunchAgents`:
  - `sudo launchctl print system/<label>` (state, program, last exit code);
    `launchctl print gui/$(id -u)/<label>` for a user's own.
  - `sudo launchctl kickstart -k system/<label>` restarts one.
  - `sudo launchctl bootout system/<label>` stops and unloads it;
    `sudo launchctl bootstrap system /Library/LaunchDaemons/<file>.plist` loads it.
  - `plutil -lint <file>.plist` checks a job's file before loading it.
  - Homebrew's services: `brew services list`, `brew services restart nginx`. Homebrew lives in
    `/opt/homebrew` on Apple silicon and `/usr/local` on Intel (`brew --prefix`).
- **Logs:** `log show --last 30m --predicate 'process == "sshd"' --style compact`. Always give a time
  and a process or a subsystem, or the output is endless.
- **Updates:** `softwareupdate --list` shows them. On Apple silicon, installing macOS updates from the
  command line asks for an owner's password, so they are usually easiest done by the person in
  System Settings → General → Software Update. Homebrew separately: `brew update && brew upgrade`.
- **Restarts:** with FileVault on, a restarted Mac waits with its disk locked until someone unlocks it.
  Before macOS 26, SSH does not answer until then; from macOS 26, Apple says it can be unlocked over
  SSH when Remote Login is on and the Mac is on the network. `sudo fdesetup authrestart` restarts once
  without that stop (it asks for a password). Agree on a restart with someone who can reach the Mac.
- **Sleep:** a Mac that sleeps drops off the network. `pmset -g` shows the settings; for a Mac used as a
  server, the person turns on "Prevent automatic sleeping when the display is off" (or the like) in
  System Settings.
- **Disk:** the data lives on `/System/Volumes/Data` (`df -h /System/Volumes/Data`); Time Machine's
  local snapshots take space too (`tmutil listlocalsnapshots /`).
- **Firewall:** the Application Firewall (System Settings → Network → Firewall;
  `/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate`). PF exists underneath
  (`/etc/pf.conf`) but is rarely the one to change.
- **Managed Macs:** settings from a company's management profile (`profiles status -type enrollment`)
  come back after local changes; they are changed where they are managed.

## FreeBSD

- Settings live in `/etc/rc.conf`, best changed with `sysrc` (`sudo sysrc nginx_enable=YES`;
  `sysrc -a` lists them). Packages keep their configuration under `/usr/local/etc`.
- Services: `service nginx status`, `sudo service nginx restart`; enabled ones: `service -e`.
- Packages: `sudo pkg update && sudo pkg upgrade`; known vulnerabilities: `pkg audit -F`.
- Base system: `sudo freebsd-update fetch install` on systems installed the classic way (from
  distribution sets), then a reboot when the kernel changed. FreeBSD 15 can instead install the base
  system as packages (the default in its VM and cloud images): then `pkg upgrade` updates it too, and
  `pkg info FreeBSD-runtime` finds the package. A new release follows the handbook's upgrade steps
  for the exact versions.
- Firewall: PF (`/etc/pf.conf`; check with `sudo pfctl -nf /etc/pf.conf`, then `sudo service pf reload`)
  or IPFW. Jails have their own packages and services: know whether you are in the host or a jail
  (`sysctl security.jail.jailed`).
- ZFS boot environments give a way back from a bad upgrade: `sudo bectl create before-upgrade` first,
  `bectl list`, and `sudo bectl activate before-upgrade` to boot the old one. They hold the system,
  not necessarily the data.
- Logs: `/var/log/messages`, `/var/log/auth.log`.

## OpenBSD

- Daemons: `rcctl ls failed` (enabled but not running), `rcctl check nginx`,
  `doas rcctl enable nginx`, `doas rcctl restart nginx`; settings end up in `/etc/rc.conf.local`.
- `doas` takes the place of sudo (`/etc/doas.conf`).
- Updates: base patches with `doas syspatch` (`syspatch -c` lists them), packages with
  `doas pkg_add -u`, firmware with `doas fw_update`, a new release with `doas sysupgrade`.
- PF: `/etc/pf.conf`; check with `doas pfctl -nf /etc/pf.conf`, load with `doas pfctl -f /etc/pf.conf`,
  rules in force: `doas pfctl -sr`. Never `pfctl -d` or a flush to test something.
- Logs: `/var/log/messages`, `/var/log/daemon`, `/var/log/authlog`.

## NetBSD

Services with `service` and `/etc/rc.conf`; packages from pkgsrc with `pkgin` (`pkgin upgrade`); the
NPF firewall (`npfctl show`, `npfctl reload`). Follow the NetBSD guide for base-system upgrades.
