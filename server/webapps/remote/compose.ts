// The compose project of a launched app (the app, Caddy for https, the backup service), Caddy's file, and the small image
// the backups run in. The app's own port is not published: only Caddy, on the project's own network, reaches it.
import { APP_PORT, DATA_PATH } from "./dockerfile.ts";
import { METADATA_RULES } from "./metadata.ts";
import type { RemoteContract } from "./types.ts";

/** A name only this computer or a test knows: no public certificate authority signs it, so Caddy signs it with its own. */
export function isLocalName(host: string): boolean {
  return /(^|\.)(localhost|test|local|internal|home\.arpa|example)$/i.test(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
}

/** A value inside a compose file: quoted (JSON is YAML), and `$` is not compose's to fill in. */
const value = (v: string) => JSON.stringify(v.replaceAll("$", "$$$$"));

export interface ComposeAsked {
  project: string;
  contract: RemoteContract;
  /** https://app.example.com */
  address: string;
}

/** What the guard runs: the rules put in, then again every minute should something have taken them out. */
const GUARD = `set -e; rm -f /tmp/blocked; while true; do ${METADATA_RULES}; touch /tmp/blocked; sleep 60; done`;

export function composeFile({ project, contract: c, address }: ComposeAsked): string {
  const appEnv: [string, string][] = [
    // Inside Hydor HOST is 127.0.0.1; on a server the app answers Caddy, which is another container.
    ["HOST", "0.0.0.0"],
    // The variable the contract names for it (env.host), when it is another.
    ...(c.env.host && c.env.host !== "HOST" ? ([[c.env.host, "0.0.0.0"]] as [string, string][]) : []),
    ["NODE_ENV", "production"],
    [c.env.port, String(APP_PORT)],
    [c.env.data, DATA_PATH],
    ...(c.env.url ? ([[c.env.url, address]] as [string, string][]) : []),
  ];
  const backupEnv: [string, string][] = [
    ["HYDOR_DB_FILE", c.database?.file ?? ""],
    ["HYDOR_DB_SQLITE", c.database?.sqlite ? "1" : "0"],
    ["HYDOR_PORT", String(APP_PORT)],
    ["HYDOR_READY", c.ready],
    ["HYDOR_HOST_HEADER", new URL(address).host],
  ];
  const env = (pairs: [string, string][]) => pairs.map(([k, v]) => `      ${k}: ${value(v)}`);
  // Nothing of an image is copied into the data volume: Docker would do it again for each container that finds it empty,
  // the owner of the folder with it, and which container is last is chance. Who owns it is set by the launch.
  const dataVolume = ["      - type: volume", "        source: data", `        target: ${DATA_PATH}`, "        volume:", "          nocopy: true"];
  return `${[
    "# Written by Hydor at each launch: the app, Caddy (https) and the backups. The values in ${…} come from the file .env beside",
    "# this one; the app's keys are in app.env (the backup storage's in backup.env), readable by their owner only.",
    `name: ${project}`,
    "services:",
    "  guard:     # keeps containers from the address the server's provider answers at about the machine (metadata.ts)",
    "    image: ${HYDOR_BACKUP_IMAGE}",
    "    init: true",
    "    restart: unless-stopped",
    '    user: "0:0"',
    "    network_mode: host    # the rules are the machine's own",
    "    cap_drop: [ALL]",
    "    cap_add: [NET_ADMIN, NET_RAW]",
    "    read_only: true",
    "    tmpfs: [/run, /tmp]",
    '    entrypoint: ["/bin/sh", "-c"]',
    `    command: [${value(GUARD)}]`,
    "    stop_grace_period: 2s",
    "    healthcheck:",
    '      test: ["CMD", "test", "-f", "/tmp/blocked"]',
    "      interval: 2s",
    "      timeout: 3s",
    "      retries: 15",
    "    logging:",
    "      driver: json-file",
    '      options: { max-size: "1m", max-file: "2" }',
    "",
    "  app:",
    "    image: ${HYDOR_IMAGE}",
    "    init: true",
    "    restart: unless-stopped",
    "    depends_on:    # not started until the guard's rules are in",
    "      guard:",
    "        condition: service_healthy",
    "    env_file: ./app.env",
    "    environment:",
    ...env(appEnv),
    "    volumes:",
    ...dataVolume,
    "    expose:",
    `      - "${APP_PORT}"`,
    "    stop_grace_period: 20s    # the app is told to stop (SIGTERM) and finishes what it is answering before it is stopped by force",
    "    logging:",
    "      driver: json-file",
    '      options: { max-size: "10m", max-file: "5" }',
    "",
    "  caddy:",
    "    image: caddy:2-alpine",
    "    restart: unless-stopped",
    "    ports:",
    '      - "80:80"',
    '      - "443:443"',
    "    volumes:",
    "      - ./Caddyfile:/etc/caddy/Caddyfile:ro",
    "      - caddy_data:/data        # the certificates and Caddy's own certificate authority: keep it",
    "      - caddy_config:/config",
    "    depends_on:",
    "      - app",
    "    logging:",
    "      driver: json-file",
    '      options: { max-size: "10m", max-file: "3" }',
    "",
    "  backup:",
    "    image: ${HYDOR_BACKUP_IMAGE}",
    "    init: true",
    "    restart: unless-stopped",
    '    user: "0:0"',
    '    command: ["daemon"]',
    "    env_file: ./backup.env",
    "    environment:",
    ...env(backupEnv),
    "      HYDOR_LAUNCH_ID: ${HYDOR_LAUNCH_ID}",
    "      HYDOR_BACKUP_AT: ${HYDOR_BACKUP_AT}    # UTC",
    "      HYDOR_BACKUP_KEEP_DAYS: ${HYDOR_BACKUP_KEEP_DAYS}",
    "    volumes:",
    ...dataVolume,
    "      - ./backups:/backups",
    "    logging:",
    "      driver: json-file",
    '      options: { max-size: "5m", max-file: "3" }',
    "",
    "volumes:",
    "  data:",
    "  caddy_data:",
    "  caddy_config:",
  ].join("\n")}\n`;
}

/** Caddy's file: one site, the app behind it. */
export function caddyfile(domain: string): string {
  const local = isLocalName(domain);
  return `${[
    "# Written by Hydor at each launch. Caddy asks for the certificate itself and renews it.",
    ...(local ? ["# A name that is not on the public internet gets no public certificate: Caddy signs it with its own authority", "# (its root is /data/caddy/pki/authorities/local/root.crt in the caddy container)."] : []),
    `${domain} {`,
    ...(local ? ["\ttls internal"] : []),
    "\tencode zstd gzip",
    `\treverse_proxy app:${APP_PORT} {`,
    "\t\ttransport http {",
    "\t\t\tdial_timeout 5s",
    "\t\t}",
    "\t}",
    "}",
  ].join("\n")}\n`;
}

/** The image of the backup service: Node and SQLite's own program (for its online backup), with Hydor's backup program. */
export const BACKUP_DOCKERFILE = `${[
  "FROM node:22-bookworm-slim",
  "RUN apt-get update && apt-get install -y --no-install-recommends sqlite3 ca-certificates iptables && rm -rf /var/lib/apt/lists/*",
  "COPY hydor-backup.mjs /usr/local/bin/hydor-backup",
  "RUN chmod +x /usr/local/bin/hydor-backup && mkdir -p /backups",
  'ENTRYPOINT ["hydor-backup"]',
].join("\n")}\n`;
