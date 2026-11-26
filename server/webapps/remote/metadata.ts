// A rented server's provider answers questions about the machine at a link-local address, the setup text pasted into it
// among them. An app has no use for it, and one that is broken into must not have it: nothing that comes from a container
// is let through to it. The machine itself still reaches it (it is its own traffic, which these rules do not see: they
// are for what arrives, and a container's packets arrive).
//
// It is set twice. By each launch, as a service of the app's compose project (compose.ts), which needs no more of the
// login than Docker and which the app waits for. And where Hydor sets a machine up (prepare, and the text a new server
// is given), as a unit that runs before Docker starts, so there is no moment after a restart without it.

/** The addresses providers answer at: the IPv4 one all of them use, and the IPv6 ones (AWS; OpenStack clouds). */
export const METADATA_V4 = "169.254.169.254/32";
export const METADATA_V6 = ["fd00:ec2::254/128", "fe80::a9fe:a9fe/128"];

const rule = (tool: string, address: string) => `${tool} -t raw -C PREROUTING -d ${address} -j DROP 2>/dev/null || ${tool} -t raw -I PREROUTING -d ${address} -j DROP`;

/** Shell that puts the rules in, once each. It fails if the IPv4 rule, or an IPv6 one on a machine with IPv6, cannot be set. */
export const METADATA_RULES = [rule("iptables", METADATA_V4), `if [ -e /proc/net/if_inet6 ]; then ${METADATA_V6.map((a) => `{ ${rule("ip6tables", a)}; }`).join(" && ")}; fi`].join(" && ");

/** The same as a unit of the machine's own, ahead of Docker: lines for prepare's script. */
export const metadataUnitLines = (sudo = "$SUDO"): string[] => [
  'echo "== apps may not reach the provider\'s own address about this machine"',
  `${sudo} tee /usr/local/sbin/hydor-metadata >/dev/null <<'HYDOR_EOF_METADATA'`,
  "#!/bin/sh",
  METADATA_RULES,
  "HYDOR_EOF_METADATA",
  `${sudo} chmod 755 /usr/local/sbin/hydor-metadata`,
  `${sudo} tee /etc/systemd/system/hydor-metadata.service >/dev/null <<'HYDOR_EOF_UNIT'`,
  "[Unit]",
  "Description=Containers may not reach the provider's metadata address (Hydor)",
  "Before=docker.service",
  "[Service]",
  "Type=oneshot",
  "RemainAfterExit=yes",
  "ExecStart=/usr/local/sbin/hydor-metadata",
  "[Install]",
  "WantedBy=multi-user.target",
  "HYDOR_EOF_UNIT",
  `${sudo} systemctl daemon-reload`,
  `${sudo} systemctl enable hydor-metadata.service`,
  `${sudo} systemctl restart hydor-metadata.service`,
];
