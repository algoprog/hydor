// The host for web apps: each is a server that Hydor keeps running on this computer, started the way its shape says
// (shape.ts: the command its hydor.json names;
// run-app.ts has how). It starts an app the first time someone opens it, waits until the app answers on its ready
// address, stops it after a while with nobody using it (as the embedding worker does), starts it again when it falls
// over (with a longer wait after each repeated fall), and keeps its last log lines.
//
// An app gets an environment built from nothing (never Hydor's own: none of its keys or settings reach an app),
// a secret of its own for the header that says who is there (sign.ts), a folder of its own to write in, a limit on
// its memory and a low priority. Where bubblewrap runs, it also runs inside it the way code steps do (apps/code.ts),
// adapted for a server: the system read-only, the app's folder read-only, only its data folder writable, a /tmp of
// its own, the network kept (it has to listen on its port), and gone when Hydor is.
import { type ChildProcess, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { sandboxAvailable } from "../agent/sandbox.ts";
import { appEnv, argvOf, nodeBin, type RunShape, sandboxArgs, signalApp } from "./run-app.ts";
import { shapeOf } from "./shape.ts";
import { removePid, writePid } from "./sweep.ts";

/** An app as the host needs to know it: its id (a folder name for its data and secret), its slug, and its folder. */
export interface HostedApp {
  id: string;
  slug: string;
  dir: string;
  /** The path the app is built to live under (`/__hydor_base__`), when it is: its health route is under it. */
  base?: string;
  /** Run the app's development command instead of its production one: an app that is being made. */
  dev?: boolean;
  /** How to run it. Left out: what its folder's hydor.json says. */
  shape?: RunShape;
}

export type AppState = "stopped" | "starting" | "running" | "crashed";

export interface AppStatus {
  state: AppState;
  port: number | null;
  /** The process the host started: bubblewrap's when sandboxed (it ends with everything inside it). */
  pid: number | null;
  /** When it reached its state, in ms since 1970. */
  since: number | null;
  lastUse: number | null;
  /** How many times it was started again after it fell. */
  restarts: number;
  /** It runs inside bubblewrap. */
  sandboxed: boolean;
  /** It is the development server (an app being made), not the built one. */
  dev: boolean;
  /** Why it is not sandboxed when sandboxing was asked for (or null). */
  sandboxNote: string | null;
  /** How the last run ended (for a crashed or stopped app). */
  lastExit: string | null;
  /** The last 200 lines it printed (standard output and error), oldest first. */
  log: string[];
}

export interface HostOptions {
  /** Hydor's data folder: each app's secret and data go in <dataDir>/webapps/<id>/. */
  dataDir: string;
  /** An app nobody has used for this long (ms) is stopped. 0 keeps apps running. */
  idleMs: number;
  /** Run apps inside bubblewrap where it is here. */
  sandbox: boolean;
  /** How long a start may take before it is called failed (ms; 20 s). A development server's first start compiles the app: it gets four times as long. */
  startTimeoutMs?: number;
  /** The ports apps may take, from and to (default: any the system gives). */
  ports?: [number, number];
  /** The address people reach an app at, from its slug (`http://<slug>.localhost:<port>`, or under APPS_DOMAIN): the app is told it as APP_URL, which is where an app that makes links for itself (a mail, a redirect) points them. */
  address?: (slug: string) => string;
  /**
   * More for an app's environment, asked at each start (a key made since the last start is in it): names in capitals and digits only, and
   * never one the host sets itself. The values can be secrets (they go to the app's process and nowhere else), so they are never logged.
   */
  environment?: (app: HostedApp) => Record<string, string> | undefined;
  /** Values to hide in what the app prints (its keys), asked at each start: its log lines are shown to the person and to agents. */
  hidden?: (app: HostedApp) => string[];
}

export interface Host {
  /** The port the app listens on (127.0.0.1), starting it if it is not running; callers at the same time share one start. */
  ensure(app: HostedApp): Promise<number>;
  /** Marks a use of the app (a request), which keeps it from being stopped as idle for a while. */
  touch(id: string): void;
  /** Holds the app for as long as something is using it (an open WebSocket): it is not stopped as idle until the returned function is called. */
  hold(id: string): () => void;
  status(id: string): AppStatus;
  /** Stops it (SIGTERM, then SIGKILL after 5 s) and waits for it to end. */
  stop(id: string): Promise<void>;
  /** Keeps it from being started until the returned function is called (its data is being copied or put back): who asks for it meanwhile waits. */
  block(id: string): () => void;
  stopAll(): Promise<void>;
  /** The app's secret for the header that says who is there; made once and kept (mode 0600). */
  secret(id: string): string;
  /** Ends every app's process at once (SIGKILL to its group), without waiting: for the moment the server itself is going. */
  killNow(): void;
  /** Stops every app and the idle check. */
  close(): Promise<void>;
}

const LOG_LINES = 200;
const LOG_LINE = 1000;
const KILL_AFTER_MS = 5000;
const STABLE_MS = 60_000;
const MAX_WAIT_MS = 30_000;
const NICE = 10;
/** How long an app may take to answer on its ready address (the checker holds it to the same). */
export const READY_LIMIT_MS = 30_000;

interface Rec {
  app: HostedApp;
  state: AppState;
  port: number | null;
  child: ChildProcess | null;
  since: number | null;
  lastUse: number | null;
  restarts: number;
  /** Falls (or failed starts) in a row, since the last start that stayed up for a minute. */
  falls: number;
  fellAt: number;
  sandboxed: boolean;
  sandboxNote: string | null;
  lastExit: string | null;
  log: string[];
  partial: { out: string; err: string };
  starting: Promise<number> | null;
  /** Set while it is being stopped on purpose, so its ending is no fall. */
  stopping: Promise<void> | null;
  /** How many holds there are (open sockets). */
  holds: number;
  /** Called when the process ends (for a start that waits for it). */
  onExit: Array<() => void>;
  /** What was started: the development server (true) or the built one. */
  dev: boolean;
  /** The app is run inside bubblewrap now, so telling it to stop goes to what is inside. */
  boxed: boolean;
  /** Values never kept in its log lines. */
  hide: string[];
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const safeId = (id: string) => /^[A-Za-z0-9_-]{1,80}$/.test(id);

/** Whether the ready address answers on the port with any 2xx or 3xx. */
function healthy(port: number, path: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host: "127.0.0.1",
        port,
        path,
        timeout: 1500,
        headers: { host: `localhost:${port}`, connection: "close" },
      },
      (r) => {
        r.resume();
        const code = r.statusCode ?? 0;
        resolve(code >= 200 && code < 400);
      },
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(false));
  });
}

/** Whether a port on 127.0.0.1 can be taken now. */
function free(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.listen(port, "127.0.0.1", () => s.close(() => resolve(true)));
  });
}

export function createHost(options: HostOptions): Host {
  const root = path.join(options.dataDir, "webapps");
  const recs = new Map<string, Rec>();
  const taken = new Set<number>();
  const blocked = new Map<string, Promise<void>>();
  const node = nodeBin();

  const sb = options.sandbox ? sandboxAvailable() : null;
  const bwrap = sb?.kind === "bwrap" ? sb.bin : null;
  const sandboxNote =
    options.sandbox && !bwrap
      ? "bubblewrap (bwrap) is not available here, so the app runs without a sandbox"
      : null;

  const folder = (id: string) => {
    if (!safeId(id))
      throw new Error(`Not an app id: ${JSON.stringify(id).slice(0, 60)}`);
    return path.join(root, id);
  };

  function secret(id: string): string {
    const dir = folder(id);
    const file = path.join(dir, "secret");
    try {
      const s = fs.readFileSync(file, "utf8").trim();
      if (s.length >= 32) return s;
    } catch {}
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const s = crypto.randomBytes(32).toString("hex");
    // wx: two callers at once make it once.
    try {
      fs.writeFileSync(file, `${s}\n`, { mode: 0o600, flag: "wx" });
      return s;
    } catch {
      return fs.readFileSync(file, "utf8").trim();
    }
  }

  function rec(app: HostedApp): Rec {
    folder(app.id);
    let r = recs.get(app.id);
    if (!r) {
      r = {
        app,
        state: "stopped",
        port: null,
        child: null,
        since: null,
        lastUse: null,
        restarts: 0,
        falls: 0,
        fellAt: 0,
        sandboxed: false,
        sandboxNote,
        lastExit: null,
        log: [],
        partial: { out: "", err: "" },
        starting: null,
        stopping: null,
        holds: 0,
        onExit: [],
        dev: false,
        boxed: false,
        hide: [],
      };
      recs.set(app.id, r);
    }
    r.app = app;
    return r;
  }

  const say = (r: Rec, text: string) => {
    let line = text;
    for (const v of r.hide) if (line.includes(v)) line = line.split(v).join("«hidden»");
    r.log.push(line.length > LOG_LINE ? `${line.slice(0, LOG_LINE)}…` : line);
    if (r.log.length > LOG_LINES) r.log.splice(0, r.log.length - LOG_LINES);
  };

  const feed = (r: Rec, which: "out" | "err", chunk: Buffer) => {
    const text = r.partial[which] + chunk.toString("utf8");
    const lines = text.split("\n");
    r.partial[which] = lines.pop()!.slice(-LOG_LINE * 4);
    for (const l of lines) say(r, l.replace(/\r$/, ""));
  };

  async function pickPort(): Promise<number> {
    if (!options.ports) {
      for (let i = 0; i < 20; i++) {
        const p = await new Promise<number>((resolve, reject) => {
          const s = net.createServer();
          s.once("error", reject);
          s.listen(0, "127.0.0.1", () => {
            const port = (s.address() as net.AddressInfo).port;
            s.close(() => resolve(port));
          });
        });
        if (!taken.has(p)) return p;
      }
      throw new Error("No free port to start the app on");
    }
    const [from, to] = options.ports;
    for (let p = from; p <= to; p++)
      if (!taken.has(p) && (await free(p))) return p;
    throw new Error(
      `No free port to start the app on (${from} to ${to} are all in use)`,
    );
  }

  const shapeFor = (app: HostedApp): RunShape => {
    if (app.shape) return app.shape;
    const read = shapeOf(path.resolve(app.dir));
    if (!read.ok) throw new Error(read.problem ?? "Its hydor.json cannot be read.");
    return read;
  };

  /** What to run for the app and with what environment: the app's command, its environment built here, in bubblewrap where that is. */
  function command(
    r: Rec,
    port: number,
  ): {
    bin: string;
    args: string[];
    env: NodeJS.ProcessEnv;
    sandboxed: boolean;
    dev: boolean;
    shape: RunShape;
  } {
    const id = r.app.id;
    const dir = path.resolve(r.app.dir);
    const shape = shapeFor(r.app);
    const dev = !!r.app.dev && !!shape.dev;
    const data = path.join(folder(id), "data");
    fs.mkdirSync(data, { recursive: true, mode: 0o700 });
    const home = path.join(folder(id), "home");
    fs.mkdirSync(home, { recursive: true, mode: 0o700 });
    let extra: Record<string, string> | undefined;
    try {
      extra = options.environment?.(r.app);
    } catch (e) {
      // The app starts without them; what it needs of them says what is missing.
      console.warn("[webapps] the extra environment of an app could not be made:", (e as Error).message);
    }
    const env = appEnv(shape, { node, port, data, home, secret: secret(id), address: options.address?.(r.app.slug), dev, extra });
    // How the sweep after a crash knows an app is the one it started (sweep.ts).
    env.HYDOR_APP_PROCESS = id;
    const cmd = argvOf(dev ? shape.dev! : shape.start);
    // Low priority from its first instruction (nice), as well as set on the process once it is there.
    const nice = fs.existsSync("/usr/bin/nice") ? ["/usr/bin/nice", "-n", String(NICE)] : [];
    const run = (c: string[]) => ({ bin: nice[0] ?? c[0], args: nice.length ? [...nice.slice(1), ...c] : c.slice(1) });
    if (!bwrap) return { ...run(cmd), env, sandboxed: false, dev, shape };
    // It writes in its data folder and its home, and a development command of its own in its folder too.
    const write = [data, home];
    const args = sandboxArgs({ bwrap, node, dir, write, writeDir: dev, argv: cmd });
    // The environment is what bubblewrap is started with (built above, nothing of Hydor's own), never its command line: that is readable by anyone on this computer, and it may hold the app's keys.
    return { ...run([bwrap, ...args]), env, sandboxed: true, dev, shape };
  }

  function fell(r: Rec, why: string) {
    // A run that stayed up for a minute starts the count again.
    if (
      r.since !== null &&
      r.state === "running" &&
      Date.now() - r.since >= STABLE_MS
    )
      r.falls = 0;
    r.falls++;
    r.fellAt = Date.now();
    r.state = "crashed";
    r.lastExit = why;
    r.port && taken.delete(r.port);
    r.since = Date.now();
  }

  /** How long to wait after the last fall before starting again: none after the first, then 1 s, 2 s, 4 s… up to 30 s. */
  const backoff = (falls: number) =>
    falls <= 1 ? 0 : Math.min(MAX_WAIT_MS, 1000 * 2 ** (falls - 2));

  async function start(r: Rec): Promise<number> {
    if (r.state === "crashed") {
      const wait = r.fellAt + backoff(r.falls) - Date.now();
      if (wait > 0) await sleep(wait);
      r.restarts++;
    }
    const port = await pickPort();
    taken.add(port);
    let c: ReturnType<typeof command>;
    try {
      c = command(r, port);
    } catch (e) {
      taken.delete(port);
      fell(r, (e as Error).message);
      throw e;
    }
    try {
      r.hide = (options.hidden?.(r.app) ?? []).filter((v) => v.length >= 4).sort((x, y) => y.length - x.length);
    } catch {
      r.hide = [];
    }
    r.state = "starting";
    r.port = port;
    r.since = Date.now();
    r.sandboxed = c.sandboxed;
    r.boxed = c.sandboxed;
    r.dev = c.dev;
    r.sandboxNote = sandboxNote;
    r.partial = { out: "", err: "" };
    say(r, `--- starting on port ${port}${c.dev ? " (its development command)" : ""}${c.sandboxed ? " (bubblewrap)" : ""}`);
    const child = spawn(c.bin, c.args, {
      cwd: path.resolve(r.app.dir),
      env: c.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    r.child = child;
    child.stdout!.on("data", (b: Buffer) => feed(r, "out", b));
    child.stderr!.on("data", (b: Buffer) => feed(r, "err", b));
    let exited = false;
    child.on("error", (e) => {
      say(r, `could not start: ${e.message}`);
    });
    child.on("exit", (code, signal) => {
      exited = true;
      // It is gone: the file that says it is running goes too (sweep.ts).
      if (child.pid) removePid(root, r.app.id, child.pid);
      for (const k of ["out", "err"] as const)
        if (r.partial[k]) say(r, r.partial[k]);
      r.partial = { out: "", err: "" };
      const how = signal
        ? `was ended by ${signal}`
        : `exited with code ${code}`;
      say(r, `--- ${how}`);
      if (r.child === child) {
        r.child = null;
        if (r.stopping) {
          r.state = "stopped";
          r.lastExit = how;
          r.port && taken.delete(r.port);
          r.port = null;
          r.since = Date.now();
        } else {
          fell(r, how);
        }
      }
      const waiting = r.onExit.splice(0);
      for (const f of waiting) f();
    });
    if (child.pid) {
      try {
        os.setPriority(child.pid, NICE);
      } catch {}
      // The process is written down, so a crash of Hydor's own cannot leave it running unnoticed (sweep.ts).
      writePid(root, r.app.id, child.pid, path.resolve(r.app.dir));
    }
    // Ready when its ready address answers; failed when the process ends first or the time is up.
    // A development server compiles the app the first time it is asked, so its start has longer.
    const base = options.startTimeoutMs ?? READY_LIMIT_MS;
    const limit = c.dev ? base * 4 : base;
    const readyAt = `${(r.app.base ?? "").replace(/\/+$/, "")}${c.shape.ready}`;
    const deadline = Date.now() + limit;
    let ended = false;
    r.onExit.push(() => (ended = true));
    for (;;) {
      if (ended || exited) break;
      if (await healthy(port, readyAt)) {
        if (ended || exited) break;
        r.state = "running";
        r.since = Date.now();
        r.lastUse = Date.now();
        say(r, "--- ready");
        return port;
      }
      if (Date.now() > deadline) break;
      await sleep(120);
    }
    // It did not come up: whatever is left of it goes, and the log's end says why.
    const tail = r.log.slice(-12).join("\n");
    if (!ended && !exited) {
      r.stopping = killChild(r, child);
      await r.stopping;
      r.stopping = null;
      // Its ending was on purpose, but the start failed: that is a fall.
      fell(r, `did not answer ${c.shape.ready} within ${Math.round(limit / 1000)} s`);
      r.port = null;
    }
    r.port = null;
    throw new Error(
      `The app did not start (${r.lastExit ?? "it stopped"}). Last lines of its log:\n${tail || "(nothing)"}`,
    );
  }

  /** SIGTERM to its whole process group, SIGKILL after 5 s; resolves when it has ended. */
  function killChild(r: Rec, child: ChildProcess): Promise<void> {
    return new Promise<void>((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null || !child.pid)
        return resolve();
      // The polite signal reaches the app itself, also inside bubblewrap (run-app.ts); ending its group takes whatever is left.
      const group = (sig: NodeJS.Signals) => signalApp(child, false, sig);
      const hard = setTimeout(() => group("SIGKILL"), KILL_AFTER_MS);
      const port = r.port;
      child.once("exit", () => {
        clearTimeout(hard);
        // What else of its group is left goes too (bubblewrap ends on the signal and what it ran follows a moment later).
        group("SIGKILL");
        // Done when its port is free again.
        const t = Date.now();
        const wait = () =>
          (port === null ? Promise.resolve(true) : free(port)).then((ok) =>
            ok || Date.now() - t > 3000 ? resolve() : void setTimeout(wait, 40),
          );
        void wait();
      });
      signalApp(child, r.boxed, "SIGTERM");
    });
  }

  function block(id: string): () => void {
    let release!: () => void;
    const mine = new Promise<void>((res) => (release = res));
    const all = (blocked.get(id) ?? Promise.resolve()).then(() => mine);
    blocked.set(id, all);
    void all.then(() => {
      if (blocked.get(id) === all) blocked.delete(id);
    });
    return release;
  }

  async function ensure(app: HostedApp): Promise<number> {
    while (blocked.has(app.id)) await blocked.get(app.id);
    const r = rec(app);
    r.lastUse = Date.now();
    for (;;) {
      // What is wanted changed (the app was launched, or its packages came): the one that runs is stopped, the right one started.
      if ((r.state === "running" || r.state === "starting") && !r.stopping && r.dev !== (!!app.dev && !!shapeFor(app).dev)) {
        if (r.starting) await r.starting.catch(() => {});
        await stop(app.id);
        continue;
      }
      if (r.state === "running" && r.port !== null) return r.port;
      if (r.stopping) {
        await r.stopping;
        continue;
      }
      if (r.starting) return r.starting;
      const p = start(r);
      r.starting = p.finally(() => {
        r.starting = null;
      });
      return r.starting;
    }
  }

  async function stop(id: string): Promise<void> {
    const r = recs.get(id);
    if (!r) return;
    if (r.starting) await r.starting.catch(() => {});
    if (r.stopping) return r.stopping;
    const child = r.child;
    if (!child) {
      if (r.state !== "stopped") {
        r.state = "stopped";
        r.port = null;
      }
      return;
    }
    const p = killChild(r, child).then(() => {
      r.stopping = null;
    });
    r.stopping = p;
    await p;
  }

  async function stopAll(): Promise<void> {
    await Promise.all([...recs.keys()].map((id) => stop(id)));
  }

  // Idle apps go: checked often enough for the idle time given.
  const idle =
    options.idleMs > 0
      ? setInterval(
          () => {
            const now = Date.now();
            for (const r of recs.values())
              if (
                r.state === "running" &&
                !r.stopping &&
                !r.starting &&
                !r.holds &&
                now - (r.lastUse ?? 0) > options.idleMs
              ) {
                say(r, "--- stopped: nobody has used it for a while");
                void stop(r.app.id).catch(() => {});
              }
          },
          Math.min(10_000, Math.max(100, Math.floor(options.idleMs / 4))),
        )
      : null;
  idle?.unref();

  return {
    ensure,
    touch(id) {
      const r = recs.get(id);
      if (r) r.lastUse = Date.now();
    },
    hold(id) {
      const r = recs.get(id);
      if (!r) return () => {};
      r.holds++;
      let done = false;
      return () => {
        if (done) return;
        done = true;
        r.holds--;
        r.lastUse = Date.now();
      };
    },
    status(id) {
      const r = recs.get(id);
      if (!r)
        return {
          state: "stopped",
          port: null,
          pid: null,
          since: null,
          lastUse: null,
          restarts: 0,
          sandboxed: false,
          dev: false,
          sandboxNote,
          lastExit: null,
          log: [],
        };
      return {
        state: r.state,
        port: r.state === "running" || r.state === "starting" ? r.port : null,
        pid: r.child?.pid ?? null,
        since: r.since,
        lastUse: r.lastUse,
        restarts: r.restarts,
        sandboxed: r.sandboxed,
        dev: r.dev,
        sandboxNote: r.sandboxNote,
        lastExit: r.lastExit,
        log: [...r.log],
      };
    },
    stop,
    block,
    stopAll,
    secret,
    killNow() {
      for (const r of recs.values()) {
        const pid = r.child?.pid;
        if (!pid || r.child?.exitCode !== null || r.child?.signalCode !== null)
          continue;
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          try {
            process.kill(pid, "SIGKILL");
          } catch {}
        }
      }
    },
    async close() {
      if (idle) clearInterval(idle);
      await stopAll();
    },
  };
}
