// Looking after an app launched to a server: whether it is up, its log, a restart, its backups, the launches it remembers,
// and taking it down. Everything here needs only the hosts folder, the host and the deployment's name: what it has to know
// about the app (its ready address, its database) is on the server, written by the launch.
import fs from "node:fs";
import path from "node:path";
import { alone, checkName, checkSchedule, failureOf, heldSecrets, jsonLine, kvOf, lastLines, parseState, stampOf, webTarget, type Live, type Place } from "./launch.ts";
import { connectionOf } from "./hosts.ts";
import { mask } from "./keys.ts";
import { PROBES } from "./probe.ts";
import * as scripts from "./scripts.ts";
import { connectSsh, type HostConnection, type Remote } from "./ssh.ts";
import { Refused, type RemoteBackup, type RemoteRecord, type RemoteStatus } from "./types.ts";

const BACKUP_ID = /^\d{8}-\d{6}(-[a-z0-9-]+)?$/;
const checkBackupId = (id: string) => {
  if (!BACKUP_ID.test(id)) throw new Refused("That is not a backup's id.", "input");
};
const checkSince = (since: string) => {
  if (!/^\d{1,5}[smhd]$/.test(since)) throw new Refused("“since” is a number and a unit: 30m, 6h, 2d.", "input");
};

async function on<T>(p: Place, work: (remote: Remote, host: HostConnection) => Promise<T>): Promise<T> {
  checkName(p.app);
  const host = connectionOf(p.hostsDir, p.host);
  const remote = (p.connect ?? connectSsh)(p.hostsDir, host);
  try {
    return await work(remote, host);
  } finally {
    await remote.close().catch(() => {});
  }
}

const launched = async (remote: Remote, app: string): Promise<{ live: Live; sqlite: boolean }> => {
  const state = parseState((await remote.run(scripts.stateScript(app), { timeoutMs: 90_000 })).out);
  if (!state.current) throw new Refused("Nothing is launched there under this name.", "missing");
  return { live: state.current, sqlite: !!state.current.database?.sqlite };
};

// ---- the log -----------------------------------------------------------------------------------------------------------

export interface LogCount {
  errors: number | null;
  requests: number | null;
  say: string;
}

export const NOT_STRUCTURED = "The app's log is not structured (its lines are not JSON), so errors and requests are not counted.";

/** Errors and requests, from the app's own lines when they are JSON. */
export function countLog(text: string, since: string): LogCount {
  const lines = text.split("\n").filter((l) => l.trim());
  if (!lines.length) return { errors: null, requests: null, say: `The app has written nothing in its log in the last ${since}.` };
  const parsed: Record<string, unknown>[] = [];
  for (const l of lines) {
    if (!l.startsWith("{")) continue;
    try {
      parsed.push(JSON.parse(l) as Record<string, unknown>);
    } catch {
      /* not a line of JSON */
    }
  }
  // A few plain lines at start do not make a log unstructured; mostly plain lines do.
  if (parsed.length * 2 < lines.length) return { errors: null, requests: null, say: NOT_STRUCTURED };
  const level = (j: Record<string, unknown>) => String(j.level ?? j.severity ?? "").toLowerCase();
  const status = (j: Record<string, unknown>) => Number(j.status ?? j.statusCode ?? (j.res as Record<string, unknown> | undefined)?.statusCode) || 0;
  const errors = parsed.filter((j) => /^(error|fatal|critical)$/.test(level(j)) || status(j) >= 500 || (typeof j.level === "number" && j.level >= 50)).length;
  const requests = parsed.filter((j) => status(j) > 0 || j.msg === "request").length;
  return { errors, requests, say: `${errors} ${errors === 1 ? "error" : "errors"} and ${requests} requests in the log in the last ${since}.` };
}

export interface LogsOptions {
  /** 30m, 6h, 2d. Default 1h. */
  since?: string;
  /** The newest lines, 1 to 2000. Default 200. */
  tail?: number;
  service?: "app" | "caddy" | "backup";
  /** Errors first. */
  errorsFirst?: boolean;
}

const BAD_LINE = /"level":\s*"(error|warn|fatal)"|\berror\b|\bfatal\b|"status":\s*5\d\d/i;

/** The newest lines of a service's log, with the keys hidden. */
export async function logs(p: Place, o: LogsOptions = {}): Promise<string[]> {
  const since = o.since ?? "1h";
  checkSince(since);
  const service = o.service ?? "app";
  if (!["app", "caddy", "backup"].includes(service)) throw new Refused("The service is app, caddy or backup.", "input");
  return on(p, async (remote) => {
    const secrets = await heldSecrets(remote, p.app);
    const r = await remote.run(scripts.logsScript(p.app, { since, tail: Math.max(1, Math.min(2000, Math.floor(o.tail ?? 200))), service }), { timeoutMs: 120_000 });
    if (r.code !== 0) throw new Refused(`The log could not be read: ${failureOf(r.out, r.err, 1)}`, "server");
    let lines = r.out
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => mask(l, secrets).slice(0, 2000));
    if (o.errorsFirst) lines = [...lines.filter((l) => BAD_LINE.test(l)), ...lines.filter((l) => !BAD_LINE.test(l))];
    return lines;
  });
}

// ---- status ------------------------------------------------------------------------------------------------------------

const toBackup = (b: Record<string, unknown>): RemoteBackup => ({
  id: String(b.id),
  label: typeof b.label === "string" ? b.label : null,
  at: Date.parse(String(b.createdAt)) || 0,
  bytes: Number((b.archive as { bytes?: number } | undefined)?.bytes ?? b.bytes) || 0,
  tables: (b.tables as Record<string, number> | undefined) ?? {},
  files: Number(b.files) || 0,
  ...(b.stopped ? { stopped: true } : {}),
  ...(b.elsewhere || (b.s3 as { ok?: boolean } | null)?.ok ? { elsewhere: true } : {}),
});

const num = (v: string | undefined) => (v?.trim() && Number.isFinite(Number(v)) ? Number(v) : null);

/** How a launched app is doing, from the server and from its address. */
export async function status(p: Place, o: { since?: string; now?: () => Date } = {}): Promise<RemoteStatus> {
  const since = o.since ?? "24h";
  checkSince(since);
  const empty: RemoteStatus = { up: null, say: "", address: null, version: null, launch: null, since: null, restarts: null, lastLaunch: null, lastBackup: null, schedule: null, disk: { freeGb: null, dataMb: null, say: "not known" }, errors: null, requests: null, logSay: "", services: [], problems: [] };
  try {
    return await on(p, async (remote, host) => {
      const out = await remote.run(scripts.statusScript(p.app), { timeoutMs: 180_000 });
      if (out.code !== 0) throw new Refused(`The server could not say: ${failureOf(out.out, out.err)}`, "server");
      const kv = kvOf(out.out);
      const live = parseState(out.out).current;
      const last = jsonLine<RemoteRecord>(kv.get("last") ?? "");
      const lastLaunch = last?.id ? { id: last.id, at: Date.parse(last.at) || 0, result: last.action === "rollback" && last.result === "live" ? "back" : last.result, downtimeSeconds: last.downtimeSeconds ?? null } : null;
      const diskKb = num(kv.get("disk_kb"));
      const dataKb = num(kv.get("data_kb"));
      const freeGb = diskKb === null ? null : Math.round((diskKb / 1024 / 1024) * 10) / 10;
      const dataMb = dataKb === null ? null : Math.round((dataKb / 1024) * 10) / 10;
      const disk = { freeGb, dataMb, say: freeGb === null ? "not known" : `${freeGb} GB left${dataMb === null ? "" : ` (the app's data: ${dataMb} MB)`}` };
      if (!live) return { ...empty, up: false, say: last ? "Nothing is live there: the last launch did not finish." : "Nothing is launched there.", lastLaunch, disk };
      const services = (kv.get("services") ?? "")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((s) => {
          const [name, state] = s.split(":");
          return { name: name!, up: state === "running" };
        });
      // From outside: the address itself.
      let up = false;
      let outside = "it is not running";
      if (services.some((s) => s.name === "app" && s.up)) {
        const target = await webTarget(remote, host, p.app, live.address);
        const seen = await (p.probes?.waitReady ?? PROBES.waitReady)(target, live.ready, 5);
        up = seen.ok;
        outside = seen.last;
      }
      let list: Record<string, unknown>[] = [];
      try {
        list = JSON.parse(kv.get("backups") || "[]") as Record<string, unknown>[];
      } catch {
        /* none that can be read */
      }
      const newest = list.length ? toBackup(list[0]!) : null;
      const now = (o.now ?? (() => new Date()))();
      const lastBackup = newest ? { id: newest.id, at: newest.at, ageHours: Math.max(0, Math.round(((now.getTime() - newest.at) / 3_600_000) * 10) / 10) } : null;
      const secrets = await heldSecrets(remote, p.app);
      const log = await remote.run(scripts.logsScript(p.app, { since, tail: 5000, service: "app" }), { timeoutMs: 120_000 });
      const counted = log.code === 0 ? countLog(mask(log.out, secrets), since) : { errors: null, requests: null, say: "The log could not be read." };
      const schedule = kv.get("backup_at") ? { at: kv.get("backup_at")!, keepDays: Number(kv.get("keep_days")) || 14 } : null;
      const started = Date.parse(kv.get("started") ?? "") || null;
      const problems: string[] = [];
      if (!up) problems.push(`The app does not answer at ${live.address}${live.ready} (${outside}). Look at its log, or restart it.`);
      if (counted.errors) problems.push(`${counted.errors} errors in the app's log in the last ${since}.`);
      if (!lastBackup) problems.push("There is no backup yet.");
      else if (lastBackup.ageHours > 36) problems.push(`The newest backup is ${Math.round(lastBackup.ageHours)} hours old.`);
      if (!live.database?.sqlite && (num(kv.get("cron")) ?? 0) === 0) problems.push("No daily backup is set up (cron is not on the server, or its line was taken out).");
      if (freeGb !== null && freeGb < 1) problems.push("Less than 1 GB of disk is left on the server.");
      return {
        up,
        say: `${up ? "Up" : "NOT up"} at ${live.address}${live.version ? `, version ${live.version}` : ""}${up && started ? `, since ${new Date(started).toISOString().slice(0, 19).replace("T", " ")} UTC` : ""}.`,
        address: live.address,
        version: live.version,
        launch: live.id,
        since: up ? started : null,
        restarts: num(kv.get("restarts")),
        lastLaunch,
        lastBackup,
        schedule,
        disk,
        errors: counted.errors,
        requests: counted.requests,
        logSay: counted.say,
        services,
        problems,
      };
    });
  } catch (error) {
    // Asking how it is never fails for a server that cannot be reached: it says so.
    if (error instanceof Refused && error.kind === "server") return { ...empty, say: error.message, problems: [error.message] };
    throw error;
  }
}

/** A polite restart, waited for. */
export async function restart(p: Place): Promise<{ ok: boolean; summary: string; details: string[] }> {
  return alone(p, () =>
    on(p, async (remote) => {
      await launched(remote, p.app);
      const t = Date.now();
      const r = await remote.run(scripts.restartScript(p.app), { timeoutMs: 5 * 60_000 });
      const secrets = await heldSecrets(remote, p.app);
      if (r.code !== 0) return { ok: false, summary: "The app did not come back: look at its log.", details: lastLines(mask(r.out + r.err, secrets), 15) };
      return { ok: true, summary: `Restarted politely (the app finished what it was answering, then started again) and it answers; ${Math.round((Date.now() - t) / 100) / 10} seconds.`, details: [] };
    }),
  );
}

// ---- backups -----------------------------------------------------------------------------------------------------------

export const backups = {
  /** The backups on the server, newest first, and when the daily one is made. */
  async list(p: Place): Promise<{ backups: RemoteBackup[]; schedule: { at: string; keepDays: number } | null }> {
    return on(p, async (remote) => {
      await launched(remote, p.app);
      const r = await remote.run(scripts.backupScript(p.app, ["list"]), { timeoutMs: 120_000 });
      const list = jsonLine<Record<string, unknown>[]>(r.out);
      if (r.code !== 0 || !Array.isArray(list)) throw new Refused(`The backups could not be listed: ${failureOf(r.out, r.err)}`, "server");
      const state = parseState((await remote.run(scripts.stateScript(p.app), { timeoutMs: 90_000 })).out);
      return { backups: list.map(toBackup), schedule: state.backupAt ? { at: state.backupAt, keepDays: state.keepDays ?? 14 } : null };
    });
  },

  /** Makes one and reads it back: it counts only once it did. */
  async now(p: Place): Promise<{ backup: RemoteBackup; verified: boolean; summary: string; problems: string[] }> {
    return alone(p, () =>
      on(p, async (remote) => {
        const { sqlite } = await launched(remote, p.app);
        const secrets = await heldSecrets(remote, p.app);
        const r = await remote.run(scripts.backupScript(p.app, ["now", "--label", "manual"], { stop: !sqlite }), { timeoutMs: 20 * 60_000 });
        const made = jsonLine<Record<string, unknown> & { id?: string; s3?: { ok: boolean; error?: string } | null }>(r.out);
        if (r.code !== 0 || !made?.id) throw new Refused(`The backup could not be made: ${mask(failureOf(r.out, r.err), secrets)}`, "server");
        const checked = await remote.run(scripts.backupScript(p.app, ["verify", made.id]), { timeoutMs: 20 * 60_000 });
        const verdict = jsonLine<{ ok: boolean; problems: string[] }>(checked.out);
        const verified = !!verdict?.ok;
        const problems: string[] = [];
        if (!verified) problems.push(`It did not read back right, so it does not count: ${verdict?.problems.join("; ") || failureOf(checked.out, checked.err)}`);
        if (made.s3 && !made.s3.ok) problems.push(`The copy to your storage failed: ${mask(String(made.s3.error), secrets)}. The backup on the server is there.`);
        return {
          backup: toBackup(made),
          verified,
          summary: `Backup ${made.id} made${sqlite ? "" : " with the app stopped for the copy"}${verified ? " and read back" : ""}${made.s3?.ok ? ", and copied to your storage" : ""}.`,
          problems,
        };
      }),
    );
  },

  async verify(p: Place, id: string): Promise<{ ok: boolean; tables: Record<string, number>; problems: string[] }> {
    checkBackupId(id);
    return on(p, async (remote) => {
      await launched(remote, p.app);
      const r = await remote.run(scripts.backupScript(p.app, ["verify", id]), { timeoutMs: 20 * 60_000 });
      const verdict = jsonLine<{ ok: boolean; found: Record<string, number>; problems: string[] }>(r.out);
      if (!verdict) throw new Refused(`${id} could not be checked: ${failureOf(r.out, r.err)}`, "server");
      return { ok: verdict.ok, tables: verdict.found, problems: verdict.problems };
    });
  },

  /** Puts a backup back: the app is stopped, what is there is kept first, the backup is put back, the app started. */
  async restore(p: Place, id: string, o: { yes?: boolean } = {}): Promise<{ safety: string | null; summary: string }> {
    checkBackupId(id);
    if (!o.yes) throw new Refused(`Putting ${id} back replaces the app's data (its database and files) with what the backup holds, and the app is stopped while it happens. What is there now is backed up first, so it can be undone. Nothing was changed.`, "conflict");
    return alone(p, () =>
      on(p, async (remote) => {
        await launched(remote, p.app);
        const r = await remote.run(scripts.restoreScript(p.app, id), { timeoutMs: 30 * 60_000 });
        const kv = kvOf(r.out);
        const done = jsonLine<{ restored?: boolean; safety?: string | null; text?: string }>(kv.get("restore") ?? "");
        if (!done?.restored) throw new Refused(`The backup was not put back${done?.text ? `: ${done.text}` : `: ${failureOf(r.out, r.err)}`}. The app was started again as it was.`, "server");
        const up = kv.get("up");
        return { safety: done.safety ?? null, summary: `Backup ${id} is back${up === "1" ? " and the app is running again" : up === "down" ? "; the app was taken down before, and stays so" : ", but the app does not answer: look at its log"}. What was there before is kept as ${done.safety ?? "(nothing: the data folder was empty)"}.` };
      }),
    );
  },

  /** The daily time (UTC) and how many days to keep. With neither, says what they are. */
  async schedule(p: Place, o: { at?: string; keepDays?: number } = {}): Promise<{ at: string; keepDays: number }> {
    return alone(p, () =>
      on(p, async (remote) => {
        const { sqlite } = await launched(remote, p.app);
        const state = parseState((await remote.run(scripts.stateScript(p.app), { timeoutMs: 90_000 })).out);
        const at = o.at ?? state.backupAt ?? "03:30";
        const keepDays = o.keepDays ?? state.keepDays ?? 14;
        checkSchedule(at, keepDays);
        if (o.at === undefined && o.keepDays === undefined) return { at, keepDays };
        const r = await remote.run(scripts.scheduleScript(p.app, at, keepDays), { timeoutMs: 3 * 60_000 });
        if (r.code !== 0) throw new Refused(`The schedule could not be changed: ${failureOf(r.out, r.err)}`, "server");
        if (!sqlite) {
          const cron = await remote.run(scripts.cronScript(p.app, at), { timeoutMs: 60_000 });
          if (kvOf(cron.out).get("cron") !== "set") throw new Refused("cron is not on the server, so no daily backup can be set up: checking the server with “prepare” installs it.", "server");
        }
        return { at, keepDays };
      }),
    );
  },

  /** Copies one archive into a folder on this computer. */
  async pull(p: Place, id: string, to: string): Promise<{ file: string; bytes: number }> {
    checkBackupId(id);
    return on(p, async (remote) => {
      await launched(remote, p.app);
      fs.mkdirSync(to, { recursive: true, mode: 0o700 });
      const file = path.join(to, `${id}.tar.gz`);
      const partial = `${file}.partial`;
      const r = await remote.runToFile(scripts.pullScript(p.app, id), partial, { timeoutMs: 30 * 60_000 });
      const bytes = fs.existsSync(partial) ? fs.statSync(partial).size : 0;
      if (r.code !== 0 || !bytes) {
        fs.rmSync(partial, { force: true });
        throw new Refused(`${id} could not be copied: ${failureOf(r.out, r.err, 1)}`, "server");
      }
      // A backup holds the app's data: its owner's alone.
      fs.chmodSync(partial, 0o600);
      fs.renameSync(partial, file);
      return { file, bytes };
    });
  },
};

// ---- the launches it remembers, and taking it down ---------------------------------------------------------------------

/** The launches and ways back written down on the server, newest first. */
export async function history(p: Place): Promise<RemoteRecord[]> {
  return on(p, async (remote) => {
    const r = await remote.run(scripts.historyScript(p.app), { timeoutMs: 90_000 });
    if (r.code !== 0) throw new Refused(`The history could not be read: ${failureOf(r.out, r.err)}`, "server");
    const out: RemoteRecord[] = [];
    for (const line of r.out.split("\n")) {
      const record = jsonLine<RemoteRecord>(line);
      if (record?.id) out.push(record);
    }
    return out.reverse();
  });
}

/** Stops and takes away the app's containers, freeing the server's ports. Its data, keys and backups stay there. */
export async function takeDown(p: Place): Promise<{ summary: string }> {
  return alone(p, () =>
    on(p, async (remote) => {
      const r = await remote.run(scripts.takeDownScript(p.app), { timeoutMs: 10 * 60_000 });
      if (r.code !== 0) throw new Refused(`It could not be taken down: ${failureOf(r.out, r.err)}`, "server");
      if (kvOf(r.out).get("nothing") === "1") return { summary: "Nothing was launched there under this name." };
      return { summary: `Taken down at ${stampOf(new Date())}: nobody is answered any more. Its data, its keys and its backups stay on the server, and launching it again finds them.` };
    }),
  );
}
