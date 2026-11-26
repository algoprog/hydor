// A program run for the launch stage (git, npm, the app's own scripts): a clean environment made here (never Hydor's own), low priority, its lines given as
// they come, a time limit, and its whole process group ended when it is stopped. Not a shell: the program and its arguments, as a list.
import { spawn } from "node:child_process";
import fs from "node:fs";

export interface ProcResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  /** The last lines (stdout and stderr together). */
  tail: string[];
  /** Standard output, whole, up to `capture` bytes. */
  stdout: string;
}

export function runProc(
  cmd: string,
  args: string[],
  o: { cwd: string; env: Record<string, string>; timeoutMs?: number; onLine?: (line: string) => void; capture?: number; nice?: boolean; input?: string | Buffer },
): Promise<ProcResult> {
  return new Promise((resolve) => {
    const nice = o.nice !== false && fs.existsSync("/usr/bin/nice");
    const child = spawn(nice ? "/usr/bin/nice" : cmd, nice ? ["-n", "10", cmd, ...args] : args, { cwd: o.cwd, env: o.env, stdio: [o.input === undefined ? "ignore" : "pipe", "pipe", "pipe"], detached: true });
    const tail: string[] = [];
    let stdout = "";
    const partial = { out: "", err: "" };
    const feed = (k: "out" | "err", b: Buffer) => {
      if (k === "out" && stdout.length < (o.capture ?? 0)) stdout += b.toString("utf8");
      const parts = (partial[k] + b.toString("utf8")).split("\n");
      partial[k] = parts.pop()!.slice(-8000);
      for (const l of parts) {
        const line = l.replace(/\r$/, "");
        tail.push(line.length > 2000 ? `${line.slice(0, 2000)}…` : line);
        if (tail.length > 300) tail.splice(0, tail.length - 300);
        try {
          o.onLine?.(line);
        } catch {}
      }
    };
    child.stdout!.on("data", (b: Buffer) => feed("out", b));
    child.stderr!.on("data", (b: Buffer) => feed("err", b));
    if (o.input !== undefined) child.stdin!.end(o.input);
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
      group("SIGTERM");
      setTimeout(() => group("SIGKILL"), 5000).unref();
    }, o.timeoutMs ?? 15 * 60_000);
    limit.unref();
    child.on("error", (e) => {
      tail.push(`could not start: ${e.message}`);
      clearTimeout(limit);
      resolve({ code: null, signal: null, timedOut, tail, stdout });
    });
    child.on("close", (code, signal) => {
      clearTimeout(limit);
      group("SIGKILL");
      for (const k of ["out", "err"] as const) if (partial[k]) tail.push(partial[k]);
      resolve({ code, signal, timedOut, tail, stdout });
    });
  });
}
