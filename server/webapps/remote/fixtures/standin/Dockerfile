# The stand-in for a server, for launch-proof-test.ts: an Ubuntu machine with systemd, an SSH server and a user who may
# use sudo, and nothing else: no Docker, no firewall, no cron. Checking the server with "prepare" is what puts those there,
# as it would on a bought machine. Run privileged, with its own Docker storage (two volumes).
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends systemd systemd-sysv dbus openssh-server sudo ca-certificates curl iproute2 kmod procps less \
 && rm -rf /var/lib/apt/lists/*
# The user a person would log in as: not root, may use sudo without a password (a cloud image gives you exactly this).
RUN useradd --create-home --shell /bin/bash --groups sudo deploy \
 && echo 'deploy ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/deploy && chmod 0440 /etc/sudoers.d/deploy \
 && mkdir -p /run/sshd ~deploy/.ssh && chmod 700 ~deploy/.ssh && chown deploy:deploy ~deploy/.ssh
RUN printf 'PasswordAuthentication no\nPermitRootLogin no\nKbdInteractiveAuthentication no\n' > /etc/ssh/sshd_config.d/10-standin.conf \
 && systemctl enable ssh
# What systemd in a container needs to stop quietly.
RUN systemctl mask systemd-udevd.service systemd-udevd-kernel.socket systemd-udevd-control.socket systemd-modules-load.service sys-kernel-debug.mount sys-kernel-tracing.mount getty.target console-getty.service 2>/dev/null || true
STOPSIGNAL SIGRTMIN+3
# Docker's own folders are volumes: overlayfs cannot be stacked on the container's own overlay root.
VOLUME ["/var/lib/docker", "/var/lib/containerd"]
CMD ["/sbin/init"]
