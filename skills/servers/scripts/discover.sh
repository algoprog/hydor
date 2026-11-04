#!/bin/sh
# discover.sh: a read-only first look at a computer before you change anything on it.
#
# Prints what the machine is, how it runs services, installs software and filters traffic, who you
# are there and how you get root, what listens on the network, and how full its disks are. It
# changes nothing and asks for nothing. It uses sudo only when sudo needs no password, and then only
# to read (the firewall's rules, the journal's size).
#
# On another computer, over SSH (works whatever that account's login shell is):
#   ssh -o BatchMode=yes -o ConnectTimeout=10 HOST 'sh -s' < discover.sh
# On this computer:
#   sh discover.sh
#
# POSIX sh: Linux (systemd, OpenRC, BusyBox), macOS, FreeBSD, OpenBSD and NetBSD. Each part checks
# that its tool exists first, so a missing tool skips that line instead of failing.

has() { command -v "$1" >/dev/null 2>&1; }
say() { printf '%s\n' "$*"; }
part() { printf '\n== %s\n' "$1"; }

# Run a reading command as root when we are root or sudo needs no password; otherwise say so.
asroot() {
  if [ "$(id -u)" = 0 ]; then "$@"
  elif [ "$SUDO_OK" = yes ]; then sudo -n "$@"
  else say "  (needs root to read: $*)"; return 1
  fi
}

machine() {
  part "machine"
  say "host: $(hostname 2>/dev/null || uname -n)"
  if [ -r /etc/os-release ]; then
    say "os: $(sed -n 's/^PRETTY_NAME=//p' /etc/os-release | tr -d '"')"
    say "$(grep -E '^(ID|ID_LIKE|VERSION_ID)=' /etc/os-release | tr -d '"' | tr '\n' ' ')"
  fi
  has sw_vers && say "os: $(sw_vers -productName) $(sw_vers -productVersion) ($(sw_vers -buildVersion))"
  has freebsd-version && say "freebsd: kernel $(freebsd-version -k), userland $(freebsd-version -u)"
  say "kernel: $(uname -srm)"
  if has uptime; then say "up: $(uptime)"
  elif [ -r /proc/uptime ]; then say "up: $(awk '{printf "%.1f days", $1 / 86400}' /proc/uptime)"
  fi
  if has systemd-detect-virt; then say "virtualisation: $(systemd-detect-virt 2>/dev/null)"
  elif [ -f /.dockerenv ]; then say "virtualisation: a Docker container"
  fi
  if has timedatectl && [ -d /run/systemd/system ]; then
    say "clock synchronised: $(timedatectl show -p NTPSynchronized --value 2>/dev/null)"
  fi
}

you() {
  part "you"
  say "$(id)"
  SUDO_OK=no
  if [ "$(id -u)" = 0 ]; then say "root: you are root (every command counts)"
  elif has sudo && sudo -n true 2>/dev/null; then SUDO_OK=yes; say "sudo: works without a password"
  elif has sudo; then say "sudo: asks for a password, or is not allowed for you"
  fi
  has doas && say "doas: installed (another way to run commands as root)"
}

services() {
  part "services"
  if [ -r /proc/1/comm ]; then say "first process: $(cat /proc/1/comm)"
  elif has ps; then say "first process: $(ps -p 1 -o comm= 2>/dev/null)"
  fi
  if [ -d /run/systemd/system ] && has systemctl; then
    say "systemd state: $(systemctl is-system-running 2>/dev/null)"
    failed=$(systemctl --failed --no-legend --plain --no-pager 2>/dev/null | head -n 20)
    say "failed units: ${failed:-none}"
    say "timers that update software:"
    systemctl list-timers --all --no-legend --no-pager 2>/dev/null \
      | grep -i -E 'apt|dnf|yum|unattended|zypp|packagekit|update' | sed 's/^/  /' | head -n 10
  elif has rc-status; then
    say "service manager: OpenRC"; rc-status --crashed 2>/dev/null | head -n 20
  elif has rcctl; then
    say "service manager: rcctl (OpenBSD); enabled but not running:"; rcctl ls failed 2>/dev/null | head -n 20
  elif has launchctl; then
    say "service manager: launchd (macOS)"
  elif has service && [ -f /etc/rc.conf ]; then
    say "service manager: rc scripts; enabled:"; service -e 2>/dev/null | head -n 30
  fi
}

software() {
  part "software"
  found=""
  for t in apt dnf yum zypper pacman apk pkg pkg_add pkgin brew port snap flatpak; do
    has "$t" && found="$found $t"
  done
  say "package tools:${found:- none found}"
  if [ -f /var/run/reboot-required ]; then
    say "a reboot is pending, for:"; sed 's/^/  /' /var/run/reboot-required.pkgs 2>/dev/null | head -n 10
  fi
  if [ -f /etc/apt/apt.conf.d/20auto-upgrades ]; then
    say "automatic updates (apt):"; grep -v '^//' /etc/apt/apt.conf.d/20auto-upgrades | sed 's/^/  /'
  fi
}

network() {
  part "network"
  if has ip; then
    addrs=$(ip -brief address 2>/dev/null) || addrs=$(ip -o address 2>/dev/null | awk '{print $2, $3, $4}')
    say "$addrs" | head -n 20
  elif has ifconfig; then ifconfig 2>/dev/null | grep -E '^[a-z]|inet ' | head -n 30
  fi
  say "listening:"
  if has ss; then
    if [ "$(id -u)" = 0 ] || [ "$SUDO_OK" = yes ]; then asroot ss -tlnp 2>/dev/null | head -n 30
    else ss -tln 2>/dev/null | head -n 30
    fi
    say "udp (first 10):"; ss -uln 2>/dev/null | sed 1d | head -n 10
  elif has sockstat; then sockstat -4 -6 -l 2>/dev/null | head -n 30
  elif has netstat; then netstat -an 2>/dev/null | grep -i listen | head -n 30
  fi
}

firewall() {
  part "firewall"
  found=""
  for t in ufw firewall-cmd nft iptables pfctl ipfw npfctl; do has "$t" && found="$found $t"; done
  say "firewall tools:${found:- none found}"
  if has ufw; then asroot ufw status verbose
  elif has firewall-cmd; then
    say "firewalld: $(firewall-cmd --state 2>&1)"
    asroot firewall-cmd --list-all 2>/dev/null
  elif has nft; then asroot nft list ruleset 2>/dev/null | head -n 40
  elif has iptables; then asroot iptables -S 2>/dev/null | head -n 40
  fi
  if has pfctl; then asroot pfctl -s info 2>/dev/null | head -n 3; fi
  fw=/usr/libexec/ApplicationFirewall/socketfilterfw
  [ -x "$fw" ] && say "macOS application firewall: $("$fw" --getglobalstate 2>/dev/null)"
}

storage() {
  part "storage"
  df -h -x tmpfs -x devtmpfs -x squashfs -x overlay 2>/dev/null || df -h 2>/dev/null
  if [ "$(uname -s)" = Linux ]; then
    say "inodes on /:"; df -i / 2>/dev/null | sed 's/^/  /'
    has free && free -h 2>/dev/null
  fi
  if has journalctl && [ -d /run/systemd/system ]; then
    asroot journalctl --disk-usage 2>/dev/null
  fi
}

containers() {
  for t in docker podman; do
    has "$t" || continue
    part "$t"
    if out=$("$t" ps --format '{{.Names}}  {{.Image}}  {{.Status}}' 2>&1); then
      say "${out:-no running containers}" | head -n 20
    else
      say "installed (listing containers needs root or the $t group)"
    fi
  done
}

main() {
  machine
  you
  services
  software
  network
  firewall
  storage
  containers
  printf '\n(read-only: nothing was changed)\n'
}

# Everything runs from main, with no input, so no command can swallow the rest of this script when
# it arrives through 'sh -s' over SSH.
main </dev/null
