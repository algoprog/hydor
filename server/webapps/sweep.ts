// Apps left behind by a crash. The host writes a pid file for each app it starts (<data>/webapps/<id>/pid) and takes it
// away when the app ends; at start, the sweep looks at the ones still there: a process that is the same one the file
// names (the same pid with the same start time) and still is that app (its environment carries the app's mark) is stopped.
// Nothing else is ever touched: a pid the file names that now belongs to another process, a file that cannot be read,
// and apps of a Hydor that is still running (its server's pid and start time in the file are alive) are left alone.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface PidFile {
  /** The process the host started (the leader of the app's group). */
  pid: number;
  /** When that process started: opaque, only compared with itself. */
  start: string;
  /** The Hydor server that wrote it. */
  server: { pid: number; start: string };
  /** The app's folder. */
  dir: string;
  at: number;
}

export interface ProcessInfo {
  start: string;
  cmdline: string;
}

/** A process as the system knows it: when it started and its command line; null when there is no such process. */
export function processInfo(pid: number): ProcessInfo | null {
  if (!Number.isInteger(pid) || pid < 2) return null;
  try {
    // Linux: the start time is the 22nd field of /proc/<pid>/stat (counted after the name, which may hold spaces and brackets).
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    const cmdline = fs
      .readFileSync(`/proc/${pid}/cmdline`, "utf8")
      .split("\0")
      .join(" ")
      .trim();
    return { start: fields[19] ?? "", cmdline };
  } catch {
    if (fs.existsSync("/proc/self/stat")) return null;
  }
  try {
    // macOS and others: ps. lstart is a fixed-width date, then the command.
    const out = execFileSync(
      "ps",
      ["-o", "lstart=", "-o", "command=", "-p", String(pid)],
      { encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] },
    ).replace(/\n$/, "");
    if (!out.trim()) return null;
    return { start: out.slice(0, 24).trim(), cmdline: out.slice(24).trim() };
  } catch {
    return null;
  }
}

const pidFile = (root: string, id: string) => path.join(root, id, "pid");

/** Records the process the host started for an app. Never throws: a pid file is a safety net. */
export function writePid(root: string, id: string, pid: number, dir: string) {
  try {
    const me = processInfo(process.pid);
    const it = processInfo(pid);
    if (!it) return;
    const body: PidFile = {
      pid,
      start: it.start,
      server: { pid: process.pid, start: me?.start ?? "" },
      dir,
      at: Date.now(),
    };
    fs.mkdirSync(path.join(root, id), { recursive: true, mode: 0o700 });
    fs.writeFileSync(pidFile(root, id), JSON.stringify(body), { mode: 0o600 });
  } catch {}
}

/** Takes the file away, if it still names this process (a later start of the same app has written its own). */
export function removePid(root: string, id: string, pid: number) {
  try {
    const f = JSON.parse(fs.readFileSync(pidFile(root, id), "utf8")) as Partial<PidFile>;
    if (f.pid === pid) fs.rmSync(pidFile(root, id), { force: true });
  } catch {}
}

function readPid(file: string): PidFile | null {
  try {
    const f = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<PidFile>;
    if (
      !Number.isInteger(f.pid) ||
      typeof f.start !== "string" ||
      !f.start ||
      typeof f.dir !== "string" ||
      !f.server ||
      !Number.isInteger(f.server.pid)
    )
      return null;
    return f as PidFile;
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface Swept {
  id: string;
  pid: number;
  /** stopped: it was still running and is ended now; gone: nothing of it was left; left: not touched, and why. */
  result: "stopped" | "gone" | "left";
  why?: string;
}

/** The process was started with this app's mark in its environment (Linux), or, where that cannot be read, there is nothing more to ask. */
function marked(pid: number, id: string): boolean {
  if (!fs.existsSync("/proc/self/environ")) return true;
  try {
    return fs.readFileSync(`/proc/${pid}/environ`, "utf8").split("\0").includes(`HYDOR_APP_PROCESS=${id}`);
  } catch {
    return false;
  }
}

/** Whether the process is the one the file names and still an app's server. */
function stillTheApp(f: PidFile, id: string): boolean {
  const it = processInfo(f.pid);
  return !!it && it.start === f.start && marked(f.pid, id);
}

/**
 * Stops the apps a crash left behind, by the pid files under `root` (<data>/webapps). Each is stopped as the host does:
 * SIGTERM to its group, SIGKILL after a few seconds.
 */
export async function sweepOrphans(
  root: string,
  o: { killAfterMs?: number } = {},
): Promise<Swept[]> {
  const out: Swept[] = [];
  let ids: string[] = [];
  try {
    ids = fs.readdirSync(root);
  } catch {
    return out;
  }
  for (const id of ids) {
    const file = pidFile(root, id);
    if (!fs.existsSync(file)) continue;
    const f = readPid(file);
    if (!f) {
      // Not ours to read: it goes, the process is not touched.
      fs.rmSync(file, { force: true });
      continue;
    }
    // The server that started it, this one or another on the same data folder, is still running: it owns it.
    const owner = processInfo(f.server.pid);
    if (owner && owner.start === f.server.start) {
      out.push({ id, pid: f.pid, result: "left", why: "the Hydor that started it is still running" });
      continue;
    }
    if (!stillTheApp(f, id)) {
      fs.rmSync(file, { force: true });
      out.push({ id, pid: f.pid, result: "gone" });
      continue;
    }
    const send = (sig: NodeJS.Signals) => {
      try {
        process.kill(-f.pid, sig);
      } catch {
        try {
          process.kill(f.pid, sig);
        } catch {}
      }
    };
    send("SIGTERM");
    const until = Date.now() + (o.killAfterMs ?? 5000);
    while (Date.now() < until && stillTheApp(f, id)) await sleep(60);
    if (stillTheApp(f, id)) {
      send("SIGKILL");
      for (let i = 0; i < 50 && stillTheApp(f, id); i++) await sleep(60);
    }
    fs.rmSync(file, { force: true });
    out.push({ id, pid: f.pid, result: "stopped" });
  }
  return out;
}
