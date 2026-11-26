// The weekly check and the daily backup of launched apps. Once a week for each launched app Hydor looks at: is it up, are errors rising, and how old the last
// backup is. It tells the person (a notice, which opens the Run tab)
// only when something needs them, and writes what it looked at either way. The time of the last check is kept in Hydor's database, so a restart of Hydor neither
// repeats a check nor loses the week; the timer is Hydor's own (no model, no agent). The daily backup of the launched version inside Hydor works the same way:
// its time and days to keep are the app's (<data>/webapps/<id>/live/backup.json), and a backup missed because Hydor was off is made when it is back.
import fs from "node:fs";
import path from "node:path";
import type { NotifyEvent } from "../../shared/types.ts";
import type { RunStatus, WeeklyCheck } from "../../shared/webapps.ts";
import { count } from "../../shared/webapps.ts";
import { weeklyNotice } from "../../shared/weekly-words.ts";
import { technicalFor } from "./simple.ts";
import type { Deps } from "../features/types.ts";
import { backupsOf } from "./hydor-launch.ts";
import { listBackupRecords } from "./backups.ts";
import { readWeekly, saveWeekly } from "./launch-store.ts";
import type { Launches } from "./hydor-launch.ts";
import type { ServerOps } from "./server-launch.ts";
import { listWebApps, type WebAppRow } from "./store.ts";

export const WEEK_MS = 7 * 86_400_000;
const BACKUP_STALE_HOURS = 72;

export interface BackupSchedule {
  at: string;
  keepDays: number;
}
export const DEFAULT_SCHEDULE: BackupSchedule = { at: "03:30", keepDays: 14 };
const scheduleFile = (root: string, id: string) => path.join(root, id, "live", "backup.json");

export function readSchedule(root: string, id: string): BackupSchedule {
  try {
    const v = JSON.parse(fs.readFileSync(scheduleFile(root, id), "utf8"));
    const at = typeof v.at === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.at) ? v.at : DEFAULT_SCHEDULE.at;
    const keepDays = Number.isInteger(v.keepDays) && v.keepDays >= 1 && v.keepDays <= 365 ? v.keepDays : DEFAULT_SCHEDULE.keepDays;
    return { at, keepDays };
  } catch {
    return { ...DEFAULT_SCHEDULE };
  }
}

export function writeSchedule(root: string, id: string, s: Partial<BackupSchedule>): BackupSchedule {
  const next = { ...readSchedule(root, id), ...(s.at ? { at: s.at } : {}), ...(s.keepDays ? { keepDays: s.keepDays } : {}) };
  fs.mkdirSync(path.dirname(scheduleFile(root, id)), { recursive: true, mode: 0o700 });
  fs.writeFileSync(scheduleFile(root, id), JSON.stringify(next), { mode: 0o600 });
  return next;
}

export interface WeeklyCtx {
  d: Deps;
  root: string;
  launches: Launches;
  server: ServerOps;
  /** The status of the launched version inside Hydor (it wakes the app to look, which is the point of the check). */
  hydorStatus: (a: WebAppRow, wake: boolean) => Promise<RunStatus>;
  /** The places on servers an app is launched to. */
  serverEnvs: (a: WebAppRow) => string[];
  now?: () => number;
}

/** One check of one app: what it found, kept, and a notice when something needs the person. */
export async function checkApp(c: WeeklyCtx, a: WebAppRow, o: { notify?: boolean } = {}): Promise<WeeklyCheck> {
  const now = (c.now ?? Date.now)();
  const before = readWeekly(c.d.db, a.id);
  const needs: WeeklyCheck["needs"] = [];
  const looked: string[] = [];
  const places: RunStatus[] = [];
  if (c.launches.live(a)) places.push(await c.hydorStatus(a, true).catch((e) => ({ place: "hydor", kind: "hydor" as const, up: null, say: (e as Error).message, problem: (e as Error).message })));
  for (const env of c.serverEnvs(a)) places.push(await c.server.status(a, env));
  for (const p of places) {
    const name = p.kind === "hydor" ? "inside Hydor" : `on the server (${p.place})`;
    if (p.up === false) needs.push({ id: `down-${p.place}`, say: `The app is down ${name}. ${p.problem ?? p.say}`, tab: "run" });
    else if (p.up === null && p.problem) needs.push({ id: `unknown-${p.place}`, say: `Hydor could not tell whether the app is up ${name}: ${p.problem}`, tab: "run" });
    else looked.push(`up ${name}`);
    const was = Number((before as (WeeklyCheck & { errors?: Record<string, number> }) | null)?.errors?.[p.place] ?? 0);
    if (typeof p.errors === "number") {
      if (p.errors >= 10 && p.errors > was * 2) needs.push({ id: `errors-${p.place}`, say: `The app wrote ${count(p.errors, "error")} ${name} lately${was ? ` (it was ${was} the week before)` : ""}. Its log says what.`, tab: "run" });
      else looked.push(`${count(p.errors, "error")} in its log ${name}`);
    }
    if (p.lastBackup) {
      if (p.lastBackup.ageHours > BACKUP_STALE_HOURS) needs.push({ id: `backup-${p.place}`, say: `There is no backup ${name} from the last ${Math.floor(BACKUP_STALE_HOURS / 24)} days (the last is ${count(Math.round(p.lastBackup.ageHours / 24), "day")} old).`, tab: "run", days: Math.round(p.lastBackup.ageHours / 24) });
      else looked.push(`a backup ${name} ${count(Math.round(p.lastBackup.ageHours), "hour")} old`);
    } else if (p.up !== null) needs.push({ id: `backup-${p.place}`, say: `There is no backup ${name} at all yet.`, tab: "run" });
  }
  const result: WeeklyCheck & { errors?: Record<string, number> } = {
    at: now,
    needs,
    looked,
    next: now + WEEK_MS,
    errors: Object.fromEntries(places.filter((p) => typeof p.errors === "number").map((p) => [p.place, p.errors as number])),
  };
  saveWeekly(c.d.db, a.id, result);
  if (needs.length && o.notify !== false) {
    // With Technical details off: one plain sentence, opening the app's page, where what is needed is listed.
    const technical = technicalFor(c.d);
    c.d.sessions.emit("notify", {
      key: `webapp-weekly:${a.id}`,
      kind: "waiting",
      title: technical ? `${a.name}: this week's check` : a.name,
      body: technical ? needs.map((n) => n.say).join(" ").slice(0, 300) : weeklyNotice(a.name, needs),
      agent: "claude",
      at: now,
      url: `/apps/web/${encodeURIComponent(a.id)}${technical ? "?tab=run" : ""}`,
    } satisfies NotifyEvent);
  }
  c.d.broadcast({ t: "feature", id: "webapps", data: { changed: "webapps" } });
  return result;
}

/** Launched apps whose week is up (never checked, or the last check is a week old). */
export function dueApps(c: WeeklyCtx): WebAppRow[] {
  const now = (c.now ?? Date.now)();
  return listWebApps(c.d.db).filter((a) => {
    const launched = !!c.launches.live(a) || c.serverEnvs(a).length > 0;
    if (!launched) return false;
    const last = readWeekly(c.d.db, a.id);
    return !last || now - last.at >= WEEK_MS;
  });
}

/** The daily backup of the launched version inside Hydor: made when today's time has passed and no scheduled backup was made since. */
export async function dailyBackups(c: WeeklyCtx): Promise<string[]> {
  const now = new Date((c.now ?? Date.now)());
  const made: string[] = [];
  for (const a of listWebApps(c.d.db)) {
    if (!c.launches.live(a)) continue;
    const s = readSchedule(c.root, a.id);
    const [h, m] = s.at.split(":").map(Number);
    const due = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m);
    if (now.getTime() < due) continue;
    const have = listBackupRecords(backupsOf(c.root, a.id)).some((b) => b.label === "scheduled" && Date.parse(b.createdAt) >= due);
    if (have) continue;
    try {
      const b = await c.launches.backups.now(a, "scheduled");
      c.launches.backups.prune(a, s.keepDays);
      made.push(`${a.id}:${b.id}`);
    } catch (e) {
      console.warn("[webapps] the daily backup of", a.id, "failed:", (e as Error).message);
    }
  }
  return made;
}

/** Starts the timer: once an hour it makes the daily backups that are due and the weekly checks whose week is up. Returns what stops it. */
export function startWeekly(c: WeeklyCtx, every = 60 * 60_000): () => void {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await dailyBackups(c);
      for (const a of dueApps(c)) await checkApp(c, a).catch((e) => console.warn("[webapps] the weekly check of", a.id, "failed:", (e as Error).message));
    } finally {
      busy = false;
    }
  };
  // A first look a few minutes after Hydor starts (not at once: the apps' own server is still coming up), then every hour: what is due is decided from the database.
  const first = setTimeout(() => void tick(), Math.min(5 * 60_000, every));
  first.unref();
  const t = setInterval(() => void tick(), every);
  t.unref();
  return () => {
    clearTimeout(first);
    clearInterval(t);
  };
}
