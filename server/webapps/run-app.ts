// How one web app is started and stopped: its command, the environment it is given (built from
// nothing, never Hydor's own), the sandbox it runs in and the polite way it is told to stop. The host (host.ts) runs apps
// with it, and the checker (contract-check.ts) starts an app exactly the same way, so what passes there runs here. Uses only
// Node: the checker a builder runs by itself carries this file as it is.
import { type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { HydorFile, HydorVars } from "../../shared/hydor-file.ts";

/** A command to run: one line for the shell (an app's own `start` or `dev`). */
export type Command = { shell: string };

/** What of an app's shape it takes to run it (shape.ts reads it from hydor.json). */
export interface RunShape {
  /** Production: what the launched version runs, and the version being changed when there is no `dev`. */
  start: Command;
  /** The command of the version being changed, when there is one. */
  dev?: Command;
  /** The names of the variables it reads its port, data folder, address and secret from. */
  vars: HydorVars;
  /** The address that answers once it is ready. */
  ready: string;
}

/** The way an app is run: the commands its hydor.json names, with the variables it names, its data outside its folder. */
export function contractRunShape(file: Pick<HydorFile, "start" | "dev" | "env" | "ready">): RunShape {
  return {
    start: { shell: file.start },
    ...(file.dev ? { dev: { shell: file.dev } } : {}),
    vars: file.env,
    ready: file.ready,
  };
}

export const nodeBin = (): string => fs.realpathSync(process.execPath);
export const pathFor = (node: string): string => `${path.dirname(node)}:/usr/local/bin:/usr/bin:/bin`;

/** The program and arguments of a command. The line is `exec`ed, so what is told to stop is the app itself and not a shell in front of it. */
export function argvOf(command: Command): string[] {
  if (process.platform === "win32") return [process.env.ComSpec ?? "cmd.exe", "/d", "/s", "/c", command.shell];
  return ["/bin/sh", "-c", `exec ${command.shell}`];
}

export interface EnvAsked {
  node: string;
  port: number;
  data: string;
  /** A folder of its own to be HOME. */
  home?: string;
  secret: string;
  address?: string;
  dev: boolean;
  /** The address it listens on (default 127.0.0.1; the checker also gives another of this computer's own). */
  host?: string;
  /** More: keys, Hydor's address and the like. Never over a name set here. */
  extra?: Record<string, string> | undefined;
}

/** The environment an app starts with: only these. Nothing of Hydor's own, and nothing of the person's shell, comes along. */
export function appEnv(shape: RunShape, o: EnvAsked): Record<string, string> {
  const env: Record<string, string> = {
    PATH: pathFor(o.node),
    NODE_ENV: o.dev ? "development" : "production",
    HOST: o.host ?? "127.0.0.1",
    NODE_OPTIONS: "--max-old-space-size=384",
  };
  env[shape.vars.host ?? "HOST"] = o.host ?? "127.0.0.1";
  env[shape.vars.port] = String(o.port);
  env[shape.vars.data] = o.data;
  if (shape.vars.secret) env[shape.vars.secret] = o.secret;
  if (shape.vars.url && o.address) env[shape.vars.url] = o.address;
  if (o.home) env.HOME = o.home;
  for (const [k, v] of Object.entries(o.extra ?? {})) if (/^[A-Z][A-Z0-9_]{0,63}$/.test(k) && !(k in env) && typeof v === "string") env[k] = v;
  return env;
}

/** The read-only top folders a program needs besides /usr and /etc (links into /usr, or folders): as apps/code.ts has it. */
function tops(): string[] {
  const out: string[] = [];
  for (const top of ["/bin", "/sbin", "/lib", "/lib32", "/lib64", "/libx32"]) {
    try {
      const st = fs.lstatSync(top);
      if (st.isSymbolicLink()) out.push("--symlink", fs.readlinkSync(top), top);
      else if (st.isDirectory()) out.push("--ro-bind", top, top);
    } catch {}
  }
  return out;
}

export interface Sandboxed {
  bwrap: string;
  node: string;
  dir: string;
  /** Written to: its data folder, and its home where it has one. */
  write: string[];
  /** Its own folder is written to as well (a development server: its caches). */
  writeDir: boolean;
  argv: string[];
  /** False: a network of its own with loopback only, so nothing outside is reached (a build, build-box.ts). Left out: shared. */
  net?: boolean;
  /** Also read, and only read: folders and files outside its own. */
  read?: string[];
  /** Parts of what is written to that stay as they are (the folder's git history). */
  keep?: string[];
}

/**
 * The arguments of bubblewrap: everything of its own but the network (it listens on its port and may call out), the system and
 * Node read-only, its folder read-only unless it is a development server, only what is named written to, a /tmp of its own, and
 * gone when Hydor is. The environment is what bubblewrap is started with, never on its command line (anyone on this computer can read that).
 */
export function sandboxArgs(o: Sandboxed): string[] {
  const mounts: string[] = [];
  // With the network: names are looked up with the resolver /etc/resolv.conf names, which is often a link to a file elsewhere (systemd's, under /run).
  if (o.net !== false) {
    try {
      const resolver = fs.realpathSync("/etc/resolv.conf");
      if (!resolver.startsWith("/etc/") && !resolver.startsWith("/usr/")) mounts.push("--ro-bind", resolver, resolver);
    } catch {}
  }
  // Node as Hydor runs it, wherever it is installed (its folder's parent: bin and lib).
  const nodeRoot = path.dirname(path.dirname(o.node));
  if (!o.node.startsWith("/usr/")) mounts.push("--ro-bind", nodeRoot, nodeRoot);
  return [
    "--unshare-all",
    ...(o.net === false ? [] : ["--share-net"]),
    "--die-with-parent",
    "--new-session",
    "--ro-bind",
    "/usr",
    "/usr",
    "--ro-bind",
    "/etc",
    "/etc",
    ...tops(),
    ...mounts,
    "--proc",
    "/proc",
    "--dev",
    "/dev",
    // A /tmp of its own; the folders below come after it, so one under /tmp still shows.
    "--tmpfs",
    "/tmp",
    ...(o.read ?? []).flatMap((r) => ["--ro-bind", r, r]),
    o.writeDir ? "--bind" : "--ro-bind",
    o.dir,
    o.dir,
    ...o.write.flatMap((w) => ["--bind", w, w]),
    ...(o.keep ?? []).flatMap((k) => ["--ro-bind", k, k]),
    "--remount-ro",
    "/",
    "--chdir",
    o.dir,
    "--",
    ...o.argv,
  ];
}

/** Every process under `pid`, with its program's name (Linux; none elsewhere). */
export function descendants(pid: number): { pid: number; name: string }[] {
  let ids: string[];
  try {
    ids = fs.readdirSync("/proc").filter((n) => /^\d+$/.test(n));
  } catch {
    return [];
  }
  const kids = new Map<number, { pid: number; name: string }[]>();
  for (const id of ids) {
    try {
      const stat = fs.readFileSync(`/proc/${id}/stat`, "utf8");
      const open = stat.indexOf("(");
      const close = stat.lastIndexOf(")");
      const ppid = Number(stat.slice(close + 2).split(" ")[1]);
      kids.set(ppid, [...(kids.get(ppid) ?? []), { pid: Number(id), name: stat.slice(open + 1, close) }]);
    } catch {}
  }
  const out: { pid: number; name: string }[] = [];
  const walk = (p: number) => {
    for (const k of kids.get(p) ?? []) {
      out.push(k);
      walk(k.pid);
    }
  };
  walk(pid);
  return out;
}

/**
 * Tells an app to stop (or ends it): SIGTERM or SIGKILL to its process group. Inside bubblewrap a signal to the group does not
 * reach the app (it has a session of its own), and ending bubblewrap kills it outright, so the polite signal goes to the
 * processes inside, by their ids: bubblewrap itself then ends when they have.
 */
export function signalApp(child: ChildProcess, sandboxed: boolean, signal: NodeJS.Signals): void {
  if (!child.pid) return;
  if (sandboxed && signal === "SIGTERM") {
    const inside = descendants(child.pid).filter((p) => p.name !== "bwrap");
    if (inside.length) {
      for (const p of inside) {
        try {
          process.kill(p.pid, signal);
        } catch {}
      }
      return;
    }
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {}
  }
}

/** The environment an app's own build runs with: its commands, a home of its own, nothing of Hydor's. */
export function buildEnv(node: string, home: string, extra: Record<string, string> = {}): Record<string, string> {
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  const out: Record<string, string> = {
    PATH: pathFor(node),
    HOME: home,
    CI: "1",
    NO_COLOR: "1",
    LANG: "C.UTF-8",
    GIT_TERMINAL_PROMPT: "0",
    npm_config_update_notifier: "false",
    npm_config_fund: "false",
    npm_config_audit: "false",
    ...extra,
  };
  for (const k of ["HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy", "npm_config_registry", "NPM_CONFIG_REGISTRY", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE"]) if (process.env[k]) out[k] = process.env[k]!;
  return out;
}
