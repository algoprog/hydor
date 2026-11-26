// What a machine must have to run an app the way a launch runs it, how Hydor finds out, and how it is made ready (Debian
// and Ubuntu only, and only when asked).
import { metadataUnitLines } from "./metadata.ts";
import { q, type Remote } from "./ssh.ts";

/** The least the machine needs. Said in the report, so a person can see why a machine was found too small. */
export const NEEDS = { docker: 24, compose: [2, 20] as const, memoryMb: 1500, diskGb: 5 } as const;

/** One script that says what the machine is, as `key=value` lines. It changes nothing. */
export const LOOK_SCRIPT = `# hydor:look
. /etc/os-release 2>/dev/null || true
echo "os_id=\${ID:-unknown}"
echo "os_name=\${PRETTY_NAME:-unknown}"
echo "arch=$(uname -m)"
echo "user=$(id -un)"
echo "root=$([ "$(id -u)" = 0 ] && echo 1 || echo 0)"
echo "sudo=$(sudo -n true 2>/dev/null && echo 1 || echo 0)"
echo "docker_cli=$(command -v docker >/dev/null 2>&1 && echo 1 || echo 0)"
echo "docker_server=$(docker version --format '{{.Server.Version}}' 2>/dev/null || true)"
echo "docker_denied=$(docker info >/dev/null 2>&1 && echo 0 || echo 1)"
echo "compose=$(docker compose version --short 2>/dev/null || true)"
echo "mem_kb=$(awk '/^MemTotal/{print $2}' /proc/meminfo)"
echo "swap_kb=$(awk '/^SwapTotal/{print $2}' /proc/meminfo)"
echo "disk_kb=$( (df -Pk /var/lib/docker 2>/dev/null || df -Pk "$HOME") | awk 'NR==2{print $4}')"
for p in 80 443; do
  echo "port$p=$(ss -ltnH "sport = :$p" 2>/dev/null | wc -l)"
  echo "port\${p}_by=$(docker ps --filter "publish=$p" --format '{{.Label "com.docker.compose.project"}}|{{.Image}}' 2>/dev/null | tr '\\n' ' ')"
done
echo "cron=$(command -v crontab >/dev/null 2>&1 && echo 1 || echo 0)"
echo "ufw=$( (command -v ufw >/dev/null 2>&1 || [ -x /usr/sbin/ufw ]) && (sudo -n ufw status 2>/dev/null | head -1 | sed 's/Status: //' || echo unknown) || echo none)"
`;

export interface Look {
  os: { id: string; name: string };
  arch: string;
  user: string;
  root: boolean;
  sudo: boolean;
  docker: { cli: boolean; server: string; denied: boolean; compose: string };
  memoryMb: number;
  diskGb: number;
  /** For ports 80 and 443: is anything listening, and the compose project and image of the container that does. */
  ports: Record<"80" | "443", { listening: boolean; project: string; image: string }>;
  ufw: string;
  cron: boolean;
}

export function parseLook(text: string): Look {
  const kv = new Map<string, string>();
  for (const line of text.split("\n")) {
    const i = line.indexOf("=");
    if (i > 0) kv.set(line.slice(0, i), line.slice(i + 1).trim());
  }
  const get = (k: string) => kv.get(k) ?? "";
  const port = (p: "80" | "443") => {
    const [project, image] = get(`port${p}_by`).trim().split(/\s+/)[0]?.split("|") ?? [];
    return { listening: Number(get(`port${p}`)) > 0, project: project ?? "", image: image ?? "" };
  };
  return {
    os: { id: get("os_id"), name: get("os_name") },
    arch: get("arch"),
    user: get("user"),
    root: get("root") === "1",
    sudo: get("sudo") === "1",
    docker: { cli: get("docker_cli") === "1", server: get("docker_server"), denied: get("docker_denied") === "1", compose: get("compose") },
    memoryMb: Math.round((Number(get("mem_kb")) + Number(get("swap_kb"))) / 1024),
    diskGb: Math.round((Number(get("disk_kb")) / 1024 / 1024) * 10) / 10,
    ports: { "80": port("80"), "443": port("443") },
    ufw: get("ufw"),
    cron: get("cron") === "1",
  };
}

export interface Finding {
  what: string;
  /** true: fine; false: has to be fixed; null: worth knowing. */
  ok: boolean | null;
  say: string;
}

const major = (v: string) => Number(v.split(".")[0]);
const atLeast = (v: string, need: readonly number[]) => {
  const parts = v
    .replace(/^v/, "")
    .split(".")
    .map((n) => Number(n.replace(/\D.*$/, "")));
  for (let i = 0; i < need.length; i++) {
    if ((parts[i] ?? 0) > need[i]!) return true;
    if ((parts[i] ?? 0) < need[i]!) return false;
  }
  return true;
};

const isDebianLike = (look: Look) => look.os.id === "ubuntu" || look.os.id === "debian";

/** What is there and what is missing. `project`: the compose project being launched, whose own Caddy may hold 80 and 443. */
export function judge(look: Look, project?: string): Finding[] {
  const out: Finding[] = [];
  out.push({ what: "system", ok: isDebianLike(look) ? true : null, say: `${look.os.name}, ${look.arch}, logged in as ${look.user}${look.root ? " (root)" : look.sudo ? " (may use sudo without a password)" : " (no sudo)"}.` });
  if (!look.docker.cli) out.push({ what: "docker", ok: false, say: "Docker is not installed." });
  else if (look.docker.denied) out.push({ what: "docker", ok: false, say: `Docker is installed, but ${look.user} is not allowed to use it (not in the group “docker”).` });
  else if (look.docker.server === "" || major(look.docker.server) < NEEDS.docker) out.push({ what: "docker", ok: false, say: `Docker ${look.docker.server || "(no answer)"} is too old: a launch needs ${NEEDS.docker} or newer.` });
  else out.push({ what: "docker", ok: true, say: `Docker ${look.docker.server} is there and ${look.user} may use it.` });
  if (look.docker.cli && !look.docker.denied) {
    if (look.docker.compose === "") out.push({ what: "compose", ok: false, say: "The Docker Compose plugin is not installed." });
    else if (!atLeast(look.docker.compose, NEEDS.compose)) out.push({ what: "compose", ok: false, say: `Docker Compose ${look.docker.compose} is too old: a launch needs ${NEEDS.compose.join(".")} or newer.` });
    else out.push({ what: "compose", ok: true, say: `Docker Compose ${look.docker.compose}.` });
  }
  out.push({
    what: "memory",
    ok: look.memoryMb >= NEEDS.memoryMb,
    say:
      look.memoryMb >= NEEDS.memoryMb
        ? `${look.memoryMb} MB of memory (with swap); building an app needs about ${NEEDS.memoryMb} MB.`
        : `${look.memoryMb} MB of memory (with swap) is too little to build an app on the machine (it needs about ${NEEDS.memoryMb} MB): add swap (sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile) or use a bigger machine.`,
  });
  out.push({ what: "disk", ok: look.diskGb >= NEEDS.diskGb, say: look.diskGb >= NEEDS.diskGb ? `${look.diskGb} GB of disk left.` : `${look.diskGb} GB of disk left; images and backups need at least ${NEEDS.diskGb} GB.` });
  for (const port of ["80", "443"] as const) {
    const p = look.ports[port];
    if (!p.listening) out.push({ what: `port ${port}`, ok: true, say: `Port ${port} is free.` });
    else if (/caddy/i.test(p.image) && p.project.startsWith("hydor-")) {
      if (project === undefined || p.project === project) out.push({ what: `port ${port}`, ok: true, say: `Port ${port} is Caddy's, for the app launched there (${p.project.slice("hydor-".length)}).` });
      else out.push({ what: `port ${port}`, ok: false, say: `Port ${port} is taken by another app launched to this server (${p.project.slice("hydor-".length)}): one server holds one app. Take that one down, or use another server.` });
    } else out.push({ what: `port ${port}`, ok: false, say: `Port ${port} is taken${p.image ? ` by a container of ${p.image}` : " by another program (find it with: sudo ss -ltnp)"}; Caddy needs it to get the app's certificate and to answer.` });
  }
  if (look.ufw === "none") out.push({ what: "firewall", ok: null, say: "No firewall program (ufw) is installed." });
  else if (look.ufw.startsWith("active")) out.push({ what: "firewall", ok: true, say: "The firewall (ufw) is on." });
  else out.push({ what: "firewall", ok: null, say: `The firewall (ufw) is ${look.ufw || "not on"}.` });
  out.push({ what: "cron", ok: look.cron ? true : null, say: look.cron ? "cron is there (the daily backup of an app without a SQLite database is its job)." : "cron is not installed: an app without a SQLite database would get no daily backup." });
  return out;
}

/** What to run by hand, as lines a person can paste, for what is missing. */
export function installSteps(look: Look): string[] {
  const steps: string[] = [];
  if (isDebianLike(look)) {
    if (!look.docker.cli || look.docker.server === "" || look.docker.compose === "") {
      steps.push(`Put Docker Engine and its Compose plugin on the machine, from Docker's own repository: https://docs.docker.com/engine/install/${look.os.id}/ (the “apt repository” part: it ends with sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin).`);
    }
    if (look.docker.denied && look.docker.cli) steps.push(`Let ${look.user} use Docker: sudo usermod -aG docker ${look.user}`);
    if (look.ufw === "none" || look.ufw.startsWith("inactive")) steps.push("Set a firewall that lets SSH, 80 and 443 in: sudo apt install ufw; sudo ufw allow <your SSH port>/tcp; sudo ufw allow 80/tcp; sudo ufw allow 443/tcp; sudo ufw enable.");
  } else if (look.os.id !== "" && look.os.id !== "unknown") {
    steps.push(`This machine runs ${look.os.name}. Hydor sets machines up only when they are Debian or Ubuntu; for another system install Docker Engine and the Compose plugin by hand (https://docs.docker.com/engine/install/) and open ports 80 and 443, then check again.`);
  }
  return steps;
}

/** The documented way to put Docker on Debian or Ubuntu (docs.docker.com/engine/install/ubuntu and /debian), then the firewall. */
export function prepareScript(look: Look, sshPorts: number[]): string {
  const dist = look.os.id === "ubuntu" ? "ubuntu" : "debian";
  const suite = look.os.id === "ubuntu" ? "${UBUNTU_CODENAME:-$VERSION_CODENAME}" : "$VERSION_CODENAME";
  const docker = look.docker.server !== "" && look.docker.compose !== "";
  const lines = ["# hydor:prepare", "export DEBIAN_FRONTEND=noninteractive", `SUDO=''; [ "$(id -u)" = 0 ] || SUDO='sudo -n'`, 'echo "== apt update"; $SUDO apt-get update -qq'];
  if (!docker) {
    lines.push(
      'echo "== Docker, from Docker\'s own apt repository"',
      "$SUDO apt-get install -y -qq ca-certificates curl",
      "$SUDO install -m 0755 -d /etc/apt/keyrings",
      `$SUDO curl -fsSL https://download.docker.com/linux/${dist}/gpg -o /etc/apt/keyrings/docker.asc`,
      "$SUDO chmod a+r /etc/apt/keyrings/docker.asc",
      "$SUDO tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF",
      "Types: deb",
      `URIs: https://download.docker.com/linux/${dist}`,
      `Suites: $(. /etc/os-release && echo "${suite}")`,
      "Components: stable",
      "Architectures: $(dpkg --print-architecture)",
      "Signed-By: /etc/apt/keyrings/docker.asc",
      "EOF",
      "$SUDO apt-get update -qq",
      "$SUDO apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin",
      "$SUDO systemctl enable --now docker",
    );
  }
  lines.push('echo "== the user may use Docker"', `$SUDO usermod -aG docker ${q(look.user)}`);
  lines.push(...metadataUnitLines());
  if (!look.cron) lines.push('echo "== cron, for scheduled backups"', "$SUDO apt-get install -y -qq cron", "$SUDO systemctl enable --now cron");
  lines.push('echo "== firewall: SSH, 80 and 443 in, everything else in refused"', "$SUDO apt-get install -y -qq ufw", ...sshPorts.map((p) => `$SUDO ufw allow ${p}/tcp`), "$SUDO ufw allow 80/tcp", "$SUDO ufw allow 443/tcp", "$SUDO ufw --force enable");
  return lines.join("\n");
}

export async function lookAt(remote: Remote): Promise<Look> {
  const result = await remote.run(LOOK_SCRIPT, { timeoutMs: 60_000 });
  return parseLook(result.out);
}

/** The ports sshd listens on, so that the firewall does not shut the person out. `fallback`: the port we came in by. */
export async function sshPortsOf(remote: Remote, fallback: number): Promise<number[]> {
  const result = await remote.run(`# hydor:sshports\n(sudo -n sshd -T 2>/dev/null || sshd -T 2>/dev/null || sudo -n /usr/sbin/sshd -T 2>/dev/null || /usr/sbin/sshd -T 2>/dev/null) | awk '/^port /{print $2}' | sort -un`, { timeoutMs: 30_000 });
  const ports = result.out
    .split("\n")
    .map((s) => Number(s.trim()))
    .filter((n) => n > 0);
  // Both what sshd says and the port we are connected by: a forwarded port would otherwise be shut out.
  return [...new Set(ports.length > 0 ? ports : [fallback])];
}
