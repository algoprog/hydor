// Where an app's own build runs. A build line, and `npm install`, run whatever the app and its packages say, so they run
// the way the host runs apps: in bubblewrap, with the system and Node read-only and nothing of the computer written to or
// read but the app's folder and the build's home. The network is cut too (a network of its own, with loopback only), and
// the one way out is a proxy of Hydor's that answers only for the package registries the folder needs (npm's, PyPI's,
// Go's, crates.io, RubyGems, or the one npm_config_registry or PIP_INDEX_URL names). Inside, a few lines of Node stand
// where a proxy would (127.0.0.1) and pass each connection to Hydor over a socket file; npm, pip, cargo and go are told
// to use it. Anything else a build tries has no network to reach.
//
// Three ways, said before a build starts: `registry` (as above), `open` (bubblewrap is here but cannot cut the network:
// files are walled, the network is open) and `own` (no sandbox: the build runs with the owner's own access).
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import type { BuildAccess, BuildBox } from "../../shared/webapps.ts";
import { netCutAvailable, sandboxAvailable } from "../agent/sandbox.ts";
import { runProc, type ProcResult } from "./proc.ts";
import { nodeBin, sandboxArgs } from "./run-app.ts";

// ---- which registries ----------------------------------------------------------------------------------------------------

const hostOf = (address: string | undefined): string | null => {
  if (!address) return null;
  try {
    const u = new URL(address);
    return u.protocol === "https:" || u.protocol === "http:" ? u.host : null;
  } catch {
    return null;
  }
};

const ECOSYSTEMS: { files: RegExp; hosts: (env: NodeJS.ProcessEnv) => string[] }[] = [
  {
    files: /^(package\.json|package-lock\.json|pnpm-lock\.yaml|bun\.lockb?)$/,
    hosts: (env) => [hostOf(env.npm_config_registry ?? env.NPM_CONFIG_REGISTRY) ?? "registry.npmjs.org"],
  },
  { files: /^yarn\.lock$/, hosts: (env) => [hostOf(env.npm_config_registry ?? env.NPM_CONFIG_REGISTRY) ?? "registry.yarnpkg.com"] },
  {
    files: /^(requirements[\w.-]*\.txt|pyproject\.toml|Pipfile|setup\.py)$/,
    hosts: (env) => {
      const own = hostOf(env.PIP_INDEX_URL);
      return own ? [own] : ["pypi.org", "files.pythonhosted.org"];
    },
  },
  { files: /^go\.mod$/, hosts: () => ["proxy.golang.org", "sum.golang.org"] },
  { files: /^Cargo\.toml$/, hosts: () => ["index.crates.io", "static.crates.io", "crates.io"] },
  { files: /^Gemfile$/, hosts: () => ["rubygems.org", "index.rubygems.org"] },
];

/** The registries a folder's build may reach, from what is in it (its own folder and one below): none when it names no packages. */
export function registriesFor(dir: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const names: string[] = [];
  const read = (at: string, deeper: boolean) => {
    let list: fs.Dirent[] = [];
    try {
      list = fs.readdirSync(at, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of list.slice(0, 400)) {
      if (e.isFile()) names.push(e.name);
      else if (deeper && e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules") read(path.join(at, e.name), false);
    }
  };
  read(dir, true);
  return [...new Set(ECOSYSTEMS.filter((x) => names.some((n) => x.files.test(n))).flatMap((x) => x.hosts(env)))];
}

// ---- the proxy -----------------------------------------------------------------------------------------------------------

/** `host` or `host:port` of what is asked, against what is allowed (a registry with no port means 443 or 80). */
export function allowedHost(allowed: string[], host: string, port: number): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return allowed.some((a) => {
    const m = /^(.*?)(?::(\d+))?$/.exec(a.toLowerCase())!;
    const name = m[1].replace(/^\[|\]$/g, "");
    return name === h && (m[2] ? Number(m[2]) === port : port === 443 || port === 80);
  });
}

/** A connection to a host, by the proxy this computer itself goes through when it has one. */
function connect(host: string, port: number, env: NodeJS.ProcessEnv): Promise<net.Socket> {
  const via = env.HTTPS_PROXY ?? env.https_proxy ?? env.HTTP_PROXY ?? env.http_proxy;
  const none = (env.NO_PROXY ?? env.no_proxy ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const direct = !via || ["localhost", "127.0.0.1", "::1"].includes(host) || none.some((n) => n === "*" || host === n || host.endsWith(`.${n.replace(/^\./, "")}`));
  return new Promise((resolve, reject) => {
    if (direct) {
      const s = net.connect(port, host, () => resolve(s));
      s.once("error", reject);
      return;
    }
    const p = new URL(via);
    const req = http.request({ host: p.hostname, port: Number(p.port || 80), method: "CONNECT", path: `${host}:${port}`, headers: p.username ? { "proxy-authorization": `Basic ${Buffer.from(`${decodeURIComponent(p.username)}:${decodeURIComponent(p.password)}`).toString("base64")}` } : {} });
    req.once("connect", (res, socket) => (res.statusCode === 200 ? resolve(socket) : reject(new Error(`the proxy answered ${res.statusCode}`))));
    req.once("error", reject);
    req.end();
  });
}

/** Hydor's side: listens on a socket file, and passes on only what is for an allowed registry. */
function proxyAt(file: string, allowed: string[], env: NodeJS.ProcessEnv, blocked: (host: string) => void): Promise<{ close: () => Promise<void> }> {
  const open = new Set<net.Socket>();
  const refuse = (what: string) => {
    blocked(what);
    return `Hydor's build sandbox does not reach ${what}: a build reaches only ${allowed.join(", ") || "nothing"}.`;
  };
  // A plain registry (http://, as a local mirror is): the whole address is asked for.
  const server = http.createServer((req, res) => {
    let u: URL;
    try {
      u = new URL(req.url ?? "");
    } catch {
      return void res.writeHead(400).end();
    }
    const port = Number(u.port || 80);
    if (u.protocol !== "http:" || !allowedHost(allowed, u.hostname, port)) return void res.writeHead(403, { "content-type": "text/plain" }).end(refuse(u.host));
    const headers = { ...req.headers };
    delete headers["proxy-connection"];
    delete headers["proxy-authorization"];
    const up = http.request({ host: u.hostname, port, method: req.method, path: `${u.pathname}${u.search}`, headers }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    up.once("error", () => (res.headersSent ? res.destroy() : res.writeHead(502).end()));
    req.pipe(up);
  });
  server.on("connection", (s) => {
    open.add(s);
    s.once("close", () => open.delete(s));
  });
  server.on("connect", (req: http.IncomingMessage, client: net.Socket, head: Buffer) => {
    client.on("error", () => client.destroy());
    const m = /^(\[[^\]]+\]|[^:]+):(\d+)$/.exec(req.url ?? "");
    const host = m?.[1].replace(/^\[|\]$/g, "") ?? "";
    const port = Number(m?.[2]);
    if (!m || !allowedHost(allowed, host, port)) return void client.end(`HTTP/1.1 403 Forbidden\r\ncontent-type: text/plain\r\nconnection: close\r\n\r\n${refuse(req.url ?? "?")}\n`);
    connect(host, port, env).then(
      (up) => {
        open.add(up);
        up.once("close", () => open.delete(up));
        up.on("error", () => client.destroy());
        client.once("close", () => up.destroy());
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) up.write(head);
        up.pipe(client);
        client.pipe(up);
      },
      () => client.end("HTTP/1.1 502 Bad Gateway\r\nconnection: close\r\n\r\n"),
    );
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(file, () =>
      resolve({
        close: () =>
          new Promise<void>((done) => {
            for (const s of open) s.destroy();
            server.close(() => done());
          }),
      }),
    );
  });
}

// The build's side, run inside the sandbox before the build itself: a port on loopback that is passed to the socket file,
// and the variables that send a package manager through it. It ends as the build ends.
const INSIDE = `"use strict";
const net = require("net");
const { spawn } = require("child_process");
const [socket, local, ...argv] = process.argv.slice(2);
const server = net.createServer((c) => {
  const up = net.connect(socket);
  c.on("error", () => up.destroy());
  up.on("error", () => c.destroy());
  c.pipe(up);
  up.pipe(c);
});
server.listen(0, "127.0.0.1", () => {
  const at = "http://127.0.0.1:" + server.address().port;
  const env = { ...process.env };
  for (const k of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "npm_config_proxy", "npm_config_https_proxy"]) env[k] = at;
  env.NO_PROXY = env.no_proxy = env.npm_config_noproxy = local === "local" ? "" : "localhost,127.0.0.1,::1";
  const child = spawn(argv[0], argv.slice(1), { stdio: "inherit", env });
  child.on("error", (e) => {
    console.error("could not start: " + e.message);
    process.exit(127);
  });
  for (const s of ["SIGTERM", "SIGINT"]) process.on(s, () => child.kill(s));
  child.on("exit", (code, signal) => process.exit(signal ? 128 : code));
});
`;

// ---- the box ---------------------------------------------------------------------------------------------------------------

/** How a build runs here, before it runs. `sandbox: false`: the host runs apps with no sandbox, and so builds. */
export function buildAccess(sandbox = true): BuildAccess {
  if (!sandbox || sandboxAvailable()?.kind !== "bwrap") return "own";
  return netCutAvailable() ? "registry" : "open";
}

/** What the pages and the agents are told before a build of this folder. */
export function buildBoxOf(dir: string, sandbox = true): BuildBox {
  const access = buildAccess(sandbox);
  return { access, registries: access === "registry" ? registriesFor(dir) : [] };
}

/** The same in a sentence, for a build's log and for agents. */
export function buildBoxSay(box: BuildBox): string {
  if (box.access === "own") return "There is no sandbox on this computer: the build runs with your own access to its files and the network.";
  const files = "It runs in the sandbox: it reads and writes only the app's folder and the build's own home";
  if (box.access === "open") return `${files}. This computer's sandbox cannot limit the network, so the build can use it; the app itself is not changed by that.`;
  return box.registries.length ? `${files}, and reaches only the package registry (${box.registries.join(", ")}).` : `${files}, and has no network (the folder names no packages).`;
}

/** The names of what a build was refused, as they are said: no port where it is the usual one. */
export const refusedNames = (hosts: string[]): string[] => [...new Set(hosts.map((h) => h.replace(/:(443|80)$/, "")))];
/** The sentence for a build that wanted something from elsewhere, with what its owner can do. */
export const refusedSay = (hosts: string[]): string =>
  `This build tried to reach ${refusedNames(hosts).join(", ")}; builds may only reach the package registry. Take what it needs from the registry or put the file in the app's folder, or turn that download off in the build (many tools have a variable for it).`;

export interface Boxed {
  /** The whole command line to start (bubblewrap's, or the build's own where there is no sandbox). */
  argv: string[];
  env: Record<string, string>;
  box: BuildBox;
  /** Ends the proxy and removes what was made for it. */
  close: () => Promise<void>;
}

export interface BoxAsked {
  /** The app's folder: read and written. */
  dir: string;
  /** The build's HOME, with its caches: read and written. Made when it is not there. */
  home: string;
  argv: string[];
  env: Record<string, string>;
  /** The host runs apps in a sandbox (false: it does not, and builds run as they did). */
  sandbox?: boolean;
  /** `open`: the network is needed as it is (a test of a key calls its provider). `registry` otherwise. */
  network?: "registry" | "open";
  /** The app's folder is only read. */
  readOnly?: boolean;
  /** Folders and files outside the app's that it may read (a browser, for one). */
  read?: string[];
  /** Told each host the build tried and was refused, once. */
  blocked?: (host: string) => void;
}

/** A build command run to its end where builds run (see `boxed`); what it was refused is in its output. */
export async function runBoxed(o: BoxAsked & { timeoutMs?: number }): Promise<ProcResult & { refused: string[] }> {
  const refused: string[] = [];
  const b = await boxed({ ...o, blocked: (h) => (refused.push(h), o.blocked?.(h)) });
  try {
    const r = await runProc(b.argv[0], b.argv.slice(1), { cwd: o.dir, env: b.env, timeoutMs: o.timeoutMs });
    return { ...r, tail: refused.length ? [...r.tail, `--- ${refusedSay(refused)}`] : r.tail, refused };
  } finally {
    await b.close();
  }
}

/** The command of a build as it is to be started here. Always `close` it when the command has ended. */
export async function boxed(o: BoxAsked): Promise<Boxed> {
  let access = buildAccess(o.sandbox !== false);
  if (access === "registry" && o.network === "open") access = "open";
  fs.mkdirSync(o.home, { recursive: true, mode: 0o700 });
  const none = async () => {};
  if (access === "own") return { argv: o.argv, env: o.env, box: { access, registries: [] }, close: none };
  const bwrap = sandboxAvailable()!.bin;
  const node = nodeBin();
  const dir = path.resolve(o.dir);
  const home = path.resolve(o.home);
  const nodeRoot = path.dirname(path.dirname(node));
  const env: Record<string, string> = {
    ...o.env,
    HOME: home,
    npm_config_cache: path.join(home, ".npm"),
    // A native module compiles against the headers Node came with: it has nowhere to fetch them from.
    ...(fs.existsSync(path.join(nodeRoot, "include", "node", "node.h")) ? { npm_config_nodedir: nodeRoot } : {}),
  };
  delete env.TMPDIR;
  // The folder's git history is read, never written: Hydor runs git on it outside, and a build must not leave them anything to run.
  const keep = [path.join(dir, ".git")].filter((p) => fs.existsSync(p));
  const wrap = (argv: string[], write: string[], netShared: boolean) => [bwrap, ...sandboxArgs({ bwrap, node, dir, write, writeDir: !o.readOnly, argv, net: netShared, read: o.read, keep })];
  if (access === "open") return { argv: wrap(o.argv, [home], true), env, box: { access, registries: [] }, close: none };
  const registries = registriesFor(dir, { ...process.env, ...o.env });
  if (!registries.length) return { argv: wrap(o.argv, [home], false), env, box: { access, registries }, close: none };
  // A socket file's path is short (about 100 bytes), so it is in a folder of its own under the temporary folder.
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "hydor-bx-"));
  const socket = path.join(work, "s");
  const shim = path.join(work, "net.cjs");
  fs.writeFileSync(shim, INSIDE, { mode: 0o600 });
  const refused = new Set<string>();
  const proxy = await proxyAt(socket, registries, process.env, (h) => {
    if (refused.has(h) || refused.size >= 20) return;
    refused.add(h);
    o.blocked?.(h);
  });
  // A registry on this computer is reached through the proxy like any other.
  const local = registries.some((r) => /^(localhost|127\.|\[::1\])/.test(r)) ? "local" : "remote";
  const argv = wrap([node, shim, socket, local, ...o.argv], [home, socket, shim], false);
  return {
    argv,
    env,
    box: { access, registries },
    close: async () => {
      await proxy.close();
      fs.rmSync(work, { recursive: true, force: true });
    },
  };
}
