# Access: SSH, firewalls and staying in

Open this before changing SSH settings, a firewall, the network, sudo rules, users or keys, and when
setting up a way to reach a home server from outside.

## SSH from the person's computer

- An entry in `~/.ssh/config` saves typing (ask before editing the person's `~/.ssh` files):

  ```text
  Host web1
      HostName 203.0.113.10
      User alice
      IdentityFile ~/.ssh/id_ed25519
      # through a jump host:
      # ProxyJump bastion
  ```

- A key with a passphrase works for commands without a prompt only once it is loaded into the person's
  ssh-agent (`ssh-add`, in their terminal).
- First visit: compare the fingerprint ssh shows with the one the provider's panel shows, or with
  `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` run on the machine's console.
- A changed host key means a reinstalled machine or someone in between. Only after the person confirms
  a reinstall: `ssh-keygen -R web1`, then connect again.

## A server that takes only passwords

- Best: the person runs `ssh-copy-id user@web1` once in their own terminal and types the password
  there; from then on, keys.
- Otherwise, with `sshpass` installed on the person's computer and the password in the vault
  (`request_secret`, `commands: true`), through `run_with_secrets`:
  `SSHPASS="$WEB1_PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=accept-new user@web1 'uptime'`.
  Leave out `BatchMode=yes` here: it refuses passwords.

## Keep a connection open while you change access

Each of your commands opens a new SSH connection, so open one in the background that later commands
share. It stays logged in when new logins break and when sshd restarts (tested):

```bash
ssh -fN -o ControlMaster=yes -o ControlPath=~/.ssh/cm-web1 -o BatchMode=yes web1   # open it
ssh -o ControlPath=~/.ssh/cm-web1 web1 'sudo -n true && echo still-in'           # use it
ssh -o ControlPath=none -o BatchMode=yes web1 true && echo new-login-works       # test a NEW login
ssh -o ControlPath=~/.ssh/cm-web1 -O exit web1                                   # close it at the end
```

A firewall that drops established connections ends it too, so firewall changes also need the timed
undo below.

## Schedule the undo before the change

On systemd machines, `systemd-run` runs a command later as a one-off timer. Set it before the change,
cancel it once a fresh login works; if you are cut off, it puts things back by itself.

```bash
sudo systemd-run --on-active=5min --unit=undo-fw ufw disable   # schedule
systemctl list-timers 'undo-*'                                  # see it waiting
sudo systemctl stop undo-fw.timer                               # cancel, after the test passed
```

| Change | Save first | Undo to schedule |
| --- | --- | --- |
| ufw rules or turning it on | nothing | `ufw disable` |
| firewalld | make runtime changes only (no `--permanent`) | `firewall-cmd --reload` (drops runtime changes) |
| nftables | `sudo sh -c 'nft list ruleset > /root/nft-before.nft'` | `sh -c 'nft flush ruleset && nft -f /root/nft-before.nft'` |
| iptables | `sudo sh -c 'iptables-save > /root/iptables-before'` | `sh -c 'iptables-restore < /root/iptables-before'` |
| A new SSH drop-in file | nothing | `sh -c 'rm /etc/ssh/sshd_config.d/10-hardening.conf && systemctl reload ssh'` |
| Network settings (netplan) | nothing | none: `sudo netplan try` applies and puts the old settings back after 120 seconds unless Enter is pressed, so the person runs it in their own terminal |

Without systemd (Alpine, the BSDs), the console is your way back: have the person open it first.

## Firewalls, in a safe order

ufw (Ubuntu), on the server:

```bash
sudo ufw status verbose                  # on or off, and the rules
sudo ss -tlnp | grep sshd                # the port SSH really listens on
sudo systemd-run --on-active=5min --unit=undo-fw ufw disable
sudo ufw allow OpenSSH                   # or: sudo ufw allow 2222/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable                  # --force skips the "may disrupt ssh" question
```

Then from the person's computer `ssh -o ControlPath=none -o BatchMode=yes web1 true`, and only after
it works, `sudo systemctl stop undo-fw.timer` on the server. `sudo ufw status numbered` and
`sudo ufw delete <number>` remove a rule; `sudo ufw limit OpenSSH` slows password guessing.

firewalld (Fedora, RHEL, SUSE):

```bash
sudo firewall-cmd --get-active-zones
sudo firewall-cmd --list-all
sudo firewall-cmd --add-service=https    # runtime only: gone after a reload or reboot
sudo firewall-cmd --runtime-to-permanent # keep it, once tested from outside
```

- nftables directly (`/etc/nftables.conf` on Debian): keep `ct state established,related accept` and
  the SSH rule above any drop; check with `sudo nft -c -f /etc/nftables.conf` before loading.
- Use one tool only: rules added with `nft` or `iptables` beside ufw or firewalld get lost or fight.
- Ports Docker publishes are not guarded by ufw or by firewalld's zones: Docker writes its own rules,
  which come first. Publish only what must be public and bind the rest to the machine itself
  (`-p 127.0.0.1:5432:5432`); rules that must apply to containers go in Docker's `DOCKER-USER` chain.
- A cloud provider's firewall (security groups and the like) sits in front of the machine: a port must
  be open in both, and the person changes that one in the provider's panel.

## Turning off password logins, in a safe order

1. A key login works for the account you keep (`ssh -o ControlPath=none -o BatchMode=yes web1 true`),
   and sudo works for it.
2. Keep a connection open (above).
3. Write a drop-in that sorts first, `/etc/ssh/sshd_config.d/10-hardening.conf`:

   ```text
   PasswordAuthentication no
   KbdInteractiveAuthentication no
   PermitRootLogin no
   ```

   sshd keeps the first value it reads for each setting, and on cloud machines cloud-init often writes
   `50-cloud-init.conf` with `PasswordAuthentication yes`, which would win over a later file. The main
   `sshd_config` must include the folder (`grep -n Include /etc/ssh/sshd_config`).
   `PermitRootLogin prohibit-password` keeps root with keys only.
4. `sudo sshd -t`, then `sudo systemctl reload ssh` (`sshd` on Fedora, RHEL, Arch, SUSE).
5. `sudo sshd -T | grep -iE 'passwordauthentication|kbdinteractive|permitrootlogin'` shows the values in
   force. Test a fresh login, then close the kept connection.

## Moving SSH to another port

It hides from little (scanners find any port); do it only if the person wants it.

1. Open the new port in the firewall and in the provider's firewall first. On Fedora and RHEL, also
   tell SELinux: `sudo semanage port -a -t ssh_port_t -p tcp 2222`.
2. Add `Port 2222` while keeping `Port 22`, so SSH listens on both. On Ubuntu 24.04 and later, where
   SSH starts through `ssh.socket`, a reload is not enough: run `sudo systemctl daemon-reload` and
   `sudo systemctl restart ssh.socket`.
3. Test `ssh -o ControlPath=none -p 2222 web1 true`. Only then remove `Port 22` and its firewall rule,
   and update the person's `~/.ssh/config`.

## Reaching a home server from outside

Opening SSH on the home router invites the whole internet to try. A private network between the
person's own devices avoids opening anything:

- **Tailscale** (WireGuard underneath; free for personal use): install it on the server and on the
  person's devices; `sudo tailscale up` prints a sign-in link for the person to open. Then
  `ssh alice@homeserver` by its Tailscale name, or its `100.x.y.z` address. Checks: `tailscale status`,
  `tailscale ping homeserver`, `tailscale netcheck`.
- For a server, the person turns off key expiry for that machine in Tailscale's admin console
  (**Machines**, the machine's menu, **Disable key expiry**), or it drops off when its key expires
  (after 180 days by default).
- `tailscale serve` shares a local web app with the person's own devices only; `tailscale funnel` puts
  it on the public internet: ask first.
- Tailscale SSH (`tailscale set --ssh`) replaces normal SSH logins over the tailnet with Tailscale's
  rules: do not switch it on or off in passing, and keep normal SSH working as the way back. Never run
  `tailscale down` on a machine you reach through Tailscale: it cuts you off.
- Other ways: plain WireGuard (one UDP port forwarded on the router), Headscale (its own control
  server), or Cloudflare Tunnel for a website.
- Hydor itself is reached the same way: [Reach the app from another device](/guide/devices#reach-the-app-from-another-device).

## Locked out anyway

- The provider's web console (often called Console, Serial console or Recovery) or a rescue system
  started from its panel, a screen and keyboard at home, or someone on site. Undo the change from there.
- A change that was not saved (firewalld without `--permanent`, `nft` rules not written to the file)
  disappears with a reboot from the provider's panel.
- Never "fix" access by accepting an unknown host key, switching off the firewall for good, or resetting
  passwords without the person's yes.
