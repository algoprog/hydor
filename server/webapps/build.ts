// An app's build, run by Hydor as a tracked job in the app's folder, with an environment made here (never Hydor's own:
// none of its keys or settings reach the build), in the sandbox (build-box.ts: the app's folder, a home of its own, and
// the package registry only), at low priority: the line its hydor.json names (one with none has nothing to build, and
// Build only starts it afresh). One at a time per app; its output is kept (the end in memory, up to 1 MB in
// <data>/webapps/<id>/build.log) and its outcome in build.json, so a build that failed still says so after Hydor restarts.
// Starting a build returns at once.
import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { WebAppBuild } from "../../shared/webapps.ts";
import { HttpError } from "../auth.ts";
import { boxed, buildBoxOf, buildBoxSay, refusedNames, refusedSay } from "./build-box.ts";
import { buildEnv, nodeBin } from "./run-app.ts";

const LOG_LINES = 400;
const LOG_LINE = 2000;
/** What the state carries of the output. */
const TAIL = 30;
const LOG_FILE_MAX = 1024 * 1024;
const TIMEOUT_MS = 15 * 60_000;
const KILL_AFTER_MS = 5000;

interface Job {
  state: WebAppBuild["state"];
  startedAt: number;
  endedAt: number | null;
  exitCode: number | null;
  problem?: string;
  lines: string[];
  child: ChildProcess | null;
  done: Promise<void>;
  /** A build of it worked once: what it made is there. */
  made?: boolean;
  /** Where it tried to go and a build may not. */
  refused?: string[];
}

interface Saved {
  state: WebAppBuild["state"];
  startedAt: number | null;
  endedAt: number | null;
  exitCode: number | null;
  problem?: string;
  made?: boolean;
  refused?: string[];
}

/** An app as a build needs to know it. */
export interface BuiltApp {
  id: string;
  dir: string;
  /** The line its hydor.json names. */
  build?: string;
}

export interface Builds {
  /** Starts the build and returns; throws a plain HttpError when one is running or the folder cannot be built. */
  start(app: BuiltApp, before?: () => Promise<void>): WebAppBuild;
  state(app: BuiltApp): WebAppBuild;
  /** Resolves when the app's build (if one runs) has ended. */
  settled(id: string): Promise<void>;
  /** Ends every build that runs. */
  close(): Promise<void>;
  /** Forgets what is kept of its builds in memory (the files are the data folder's). */
  forget(id: string): void;
}

const tailOf = (lines: string[]) => lines.slice(-TAIL);

function readTail(file: string): string[] {
  try {
    const st = fs.statSync(file);
    const fd = fs.openSync(file, "r");
    try {
      const len = Math.min(st.size, 64 * 1024);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, st.size - len);
      const lines = buf.toString("utf8").split("\n");
      if (st.size > len) lines.shift();
      if (lines[lines.length - 1] === "") lines.pop();
      return tailOf(lines);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return [];
  }
}

/** `sandbox`: the host runs apps in a sandbox, and so builds run in one (false: with the owner's own access). */
export function createBuilds(root: string, sandbox = true): Builds {
  const jobs = new Map<string, Job>();
  const node = nodeBin();

  const folder = (id: string) => {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error("Not an app id");
    return path.join(root, id);
  };

  const save = (id: string, s: Saved) => {
    try {
      fs.mkdirSync(folder(id), { recursive: true, mode: 0o700 });
      fs.writeFileSync(path.join(folder(id), "build.json"), JSON.stringify(s));
    } catch {}
  };

  function read(id: string): Saved | null {
    try {
      return JSON.parse(fs.readFileSync(path.join(folder(id), "build.json"), "utf8")) as Saved;
    } catch {
      return null;
    }
  }

  function state(app: BuiltApp): WebAppBuild {
    const job = jobs.get(app.id);
    const saved = job ? null : read(app.id);
    // Built when it has nothing to build, or a build of it has worked.
    const exists = !app.build || !!(job ? job.made || job.state === "built" : saved?.made);
    if (job)
      return {
        state: job.state,
        exists,
        startedAt: job.startedAt,
        endedAt: job.endedAt,
        exitCode: job.exitCode,
        ...(job.problem ? { problem: job.problem } : {}),
        ...(job.refused ? { refused: job.refused } : {}),
        log: tailOf(job.lines),
        box: buildBoxOf(app.dir, sandbox),
      };
    const log = readTail(path.join(folder(app.id), "build.log"));
    const box = buildBoxOf(app.dir, sandbox);
    if (!saved)
      return { state: "none", exists, startedAt: null, endedAt: null, exitCode: null, log, box };
    // A build that was running when Hydor stopped did not finish.
    if (saved.state === "building")
      return {
        state: "failed",
        exists,
        startedAt: saved.startedAt,
        endedAt: null,
        exitCode: null,
        problem: "Hydor stopped while this was building, so the build did not finish.",
        log,
        box,
      };
    return {
      state: saved.state === "failed" ? "failed" : exists ? "built" : "none",
      exists,
      startedAt: saved.startedAt,
      endedAt: saved.endedAt,
      exitCode: saved.exitCode,
      ...(saved.problem ? { problem: saved.problem } : {}),
      ...(saved.refused ? { refused: saved.refused } : {}),
      log,
      box,
    };
  }

  function start(app: BuiltApp, before?: () => Promise<void>): WebAppBuild {
    if (jobs.get(app.id)?.state === "building")
      throw new HttpError(409, "It is already being built: wait for that build to end.");
    const line = app.build;
    const made = !!(jobs.get(app.id)?.made || jobs.get(app.id)?.state === "built" || read(app.id)?.made);
    const lines: string[] = [];
    const job: Job = {
      state: "building",
      startedAt: Date.now(),
      endedAt: null,
      exitCode: null,
      lines,
      child: null,
      done: Promise.resolve(),
      made,
    };
    jobs.set(app.id, job);
    fs.mkdirSync(folder(app.id), { recursive: true, mode: 0o700 });
    const logFile = path.join(folder(app.id), "build.log");
    fs.writeFileSync(logFile, "", { mode: 0o600 });
    let logged = 0;
    const say = (line: string) => {
      const l = line.length > LOG_LINE ? `${line.slice(0, LOG_LINE)}…` : line;
      lines.push(l);
      if (lines.length > LOG_LINES) lines.splice(0, lines.length - LOG_LINES);
      if (logged < LOG_FILE_MAX) {
        logged += l.length + 1;
        try {
          fs.appendFileSync(logFile, `${l}\n`);
        } catch {}
      }
    };
    save(app.id, { state: "building", startedAt: job.startedAt, endedAt: null, exitCode: null, ...(made ? { made } : {}) });

    const finish = (state: "built" | "failed", problem?: string) => {
      job.state = state;
      job.endedAt = Date.now();
      job.child = null;
      if (problem) job.problem = problem;
      if (job.refused) say(`--- ${refusedSay(job.refused)}`);
      say(`--- ${state === "built" ? "built" : `failed: ${problem}`}`);
      if (state === "built") job.made = true;
      save(app.id, {
        state,
        startedAt: job.startedAt,
        endedAt: job.endedAt,
        exitCode: job.exitCode,
        ...(problem ? { problem } : {}),
        ...(job.made ? { made: true } : {}),
        ...(job.refused ? { refused: job.refused } : {}),
      });
    };

    let box: Awaited<ReturnType<typeof boxed>> | null = null;
    job.done = (async () => {
      try {
        // A running app would have its build taken from under it.
        await before?.();
        if (!line) {
          say("--- its hydor.json names no build: there is nothing to build");
          job.exitCode = 0;
          return finish("built");
        }
        say(`--- building ${app.dir} (${line})`);
        const nice = fs.existsSync("/usr/bin/nice") ? ["/usr/bin/nice", "-n", "10"] : [];
        const home = path.join(folder(app.id), "home");
        box = await boxed({
          dir: app.dir,
          home,
          argv: ["/bin/sh", "-c", line],
          env: buildEnv(node, home),
          sandbox,
          blocked: (host) => {
            job.refused = refusedNames([...(job.refused ?? []), host]);
            say(`--- the build tried to reach ${host}, which a build may not: it reaches only the package registry`);
          },
        });
        say(`--- ${buildBoxSay(box.box)}`);
        const cmd = [...nice, ...box.argv];
        const child = spawn(cmd[0], cmd.slice(1), {
          cwd: app.dir,
          env: box.env,
          stdio: ["ignore", "pipe", "pipe"],
          detached: true,
        });
        job.child = child;
        const partial = { out: "", err: "" };
        const feed = (k: "out" | "err", b: Buffer) => {
          const parts = (partial[k] + b.toString("utf8")).split("\n");
          partial[k] = parts.pop()!.slice(-LOG_LINE * 4);
          for (const l of parts) say(l.replace(/\r$/, ""));
        };
        child.stdout!.on("data", (b: Buffer) => feed("out", b));
        child.stderr!.on("data", (b: Buffer) => feed("err", b));
        let timedOut = false;
        const group = (sig: NodeJS.Signals) => {
          try {
            process.kill(-child.pid!, sig);
          } catch {
            try {
              child.kill(sig);
            } catch {}
          }
        };
        const limit = setTimeout(() => {
          timedOut = true;
          say("--- stopped: it took longer than 15 minutes");
          group("SIGTERM");
          setTimeout(() => group("SIGKILL"), KILL_AFTER_MS).unref();
        }, TIMEOUT_MS);
        limit.unref();
        const [code, signal] = await new Promise<[number | null, NodeJS.Signals | null]>((resolve) => {
          child.on("error", (e) => {
            say(`could not start: ${e.message}`);
            resolve([null, null]);
          });
          child.on("close", (c, s) => resolve([c, s]));
        });
        clearTimeout(limit);
        group("SIGKILL");
        for (const k of ["out", "err"] as const) if (partial[k]) say(partial[k]);
        job.exitCode = code;
        if (timedOut) return finish("failed", "The build took longer than 15 minutes and was stopped.");
        if (signal) return finish("failed", `The build was ended by ${signal}.`);
        if (code === null) return finish("failed", "The build could not be started.");
        if (code !== 0) return finish("failed", `The build failed (it ended with code ${code}). Its last lines are below.`);
        finish("built");
      } catch (e) {
        finish("failed", `The build could not run: ${(e as Error).message}`);
      } finally {
        await box?.close();
      }
    })();
    return state(app);
  }

  return {
    start,
    state,
    settled: (id) => jobs.get(id)?.done ?? Promise.resolve(),
    forget: (id) => {
      const j = jobs.get(id);
      if (j && j.state !== "building") jobs.delete(id);
    },
    async close() {
      const running = [...jobs.values()].filter((j) => j.state === "building");
      for (const j of running) {
        try {
          if (j.child?.pid) process.kill(-j.child.pid, "SIGKILL");
        } catch {}
      }
      await Promise.all(running.map((j) => j.done.catch(() => {})));
    },
  };
}
