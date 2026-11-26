// Where Hydor keeps the web apps it knows: one row each in the `web_apps` table (id, slug, name, the folder the app lives in,
// what it may use of Hydor, the stage it is at, times). The app itself stays in its folder: its hydor.json is read from there
// each time it is asked for (shape.ts).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_WEBAPP_SETTINGS,
  isWebAppStage,
  type WebAppStage,
  WEBAPP_MAIL_MAX_PER_DAY,
  WEBAPP_MAIL_PER_DAY,
  WEBAPP_MAX_CAP_USD,
  type WebAppAdd,
  type WebAppMailSettings,
  type WebAppSettings,
  webappSlug,
} from "../../shared/webapps.ts";
import { HYDOR_FILE } from "../../shared/hydor-file.ts";
import { isTier } from "../../shared/tiers.ts";
import { HttpError } from "../auth.ts";
import type { DB } from "../db.ts";
import { shapeOf } from "./shape.ts";

/** What the table holds of an app. */
export interface WebAppRow {
  id: string;
  slug: string;
  name: string;
  folder: string;
  /** The stage it is at (null: none yet). */
  stage: WebAppStage | null;
  settings: WebAppSettings;
  createdAt: number;
  updatedAt: number;
}

const made = new WeakSet<DB>();
export function webappTables(db: DB) {
  if (made.has(db)) return;
  db.exec(`
    create table if not exists web_apps (
      id text primary key,
      slug text not null unique,
      name text not null,
      folder text not null unique,
      settings text not null,
      created_at integer not null,
      updated_at integer not null,
      stage text
    );
  `);
  if (!(db.prepare("pragma table_info(web_apps)").all() as { name: string }[]).some((c) => c.name === "stage")) db.exec("alter table web_apps add column stage text");
  made.add(db);
}

const NAME_MAX = 80;
const LIST_MAX = 100;

// ---- settings --------------------------------------------------------------------------------------------------

const strings = (v: unknown): string[] =>
  Array.isArray(v)
    ? [
        ...new Set(
          v
            .filter((x): x is string => typeof x === "string")
            .map((x) => x.trim())
            .filter((x) => x && x.length <= 120),
        ),
      ].slice(0, LIST_MAX)
    : [];

const MAIL_ACCOUNT = /^[A-Za-z0-9_-]{0,64}$/;
const mailPerDay = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= WEBAPP_MAIL_MAX_PER_DAY;

/** The mail settings as stored, read leniently: nothing allowed unless it plainly says so. */
function readMail(raw: unknown): WebAppMailSettings | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const v = raw as Record<string, unknown>;
  const account = typeof v.account === "string" && MAIL_ACCOUNT.test(v.account) ? v.account : "";
  return {
    ...(typeof v.on === "boolean" ? { on: v.on && account !== "" } : {}),
    account,
    perDay: mailPerDay(v.perDay) ? v.perDay : WEBAPP_MAIL_PER_DAY,
    ...(v.whileMaking === true && v.on === true && account !== "" ? { whileMaking: true } : {}),
  };
}

/** A change to the mail settings: the fields named are checked, the rest kept. */
function changeMail(current: WebAppMailSettings | undefined, given: unknown): WebAppMailSettings {
  if (!given || typeof given !== "object" || Array.isArray(given)) throw new HttpError(400, "Mail is an object: { on, account, perDay, whileMaking }.");
  const v = given as Record<string, unknown>;
  const out: WebAppMailSettings = { ...(current ?? { account: "", perDay: WEBAPP_MAIL_PER_DAY }) };
  if (v.account !== undefined) {
    if (typeof v.account !== "string" || !MAIL_ACCOUNT.test(v.account)) throw new HttpError(400, "The mail account is the id of a connected one.");
    out.account = v.account;
  }
  if (v.perDay !== undefined) {
    if (!mailPerDay(v.perDay)) throw new HttpError(400, `Mails a day are a whole number from 1 to ${WEBAPP_MAIL_MAX_PER_DAY}.`);
    out.perDay = v.perDay;
  }
  if (v.on !== undefined) {
    if (typeof v.on !== "boolean") throw new HttpError(400, "Mail is on or off (true or false).");
    out.on = v.on;
  }
  if (out.on && !out.account) throw new HttpError(400, "Choose the account the mail is sent from.");
  if (v.whileMaking !== undefined) {
    if (typeof v.whileMaking !== "boolean") throw new HttpError(400, "whileMaking is true or false.");
    if (v.whileMaking && out.on !== true) throw new HttpError(400, "Allow the app’s mail first, then let it send while it is being made.");
    out.whileMaking = v.whileMaking;
  }
  // Off by default, and off again once mail is: allowing it anew never brings the test mail back by itself.
  if (out.on !== true || !out.whileMaking) delete out.whileMaking;
  return out;
}

/** Settings as stored, read leniently: anything wrong falls back to the default for that field. */
export function readSettings(raw: unknown): WebAppSettings {
  const d = DEFAULT_WEBAPP_SETTINGS;
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const cap = Number(v.dailyCapUsd);
  return {
    tiers: [...new Set((Array.isArray(v.tiers) ? v.tiers : []).filter(isTier))],
    dailyCapUsd: Number.isFinite(cap) && cap >= 0 && cap <= WEBAPP_MAX_CAP_USD ? cap : d.dailyCapUsd,
    apps: strings(v.apps),
    connections: strings(v.connections),
    notify: v.notify === true,
    ...((mail) => (mail ? { mail } : {}))(readMail(v.mail)),
  };
}

/** Settings as a person or an agent sends them (a change): the fields named are checked strictly, those not named are kept. */
export function changeSettings(current: WebAppSettings, given: unknown): WebAppSettings {
  if (given === undefined) return current;
  if (!given || typeof given !== "object" || Array.isArray(given))
    throw new HttpError(400, "Settings are an object: { tiers, dailyCapUsd, apps, connections, notify, mail }.");
  const v = given as Record<string, unknown>;
  const out = { ...current };
  if (v.tiers !== undefined) {
    if (!Array.isArray(v.tiers) || !v.tiers.every(isTier))
      throw new HttpError(400, "Tiers are a list of quick, standard, best or max.");
    out.tiers = [...new Set(v.tiers)];
  }
  if (v.dailyCapUsd !== undefined) {
    const n = Number(v.dailyCapUsd);
    if (typeof v.dailyCapUsd === "boolean" || !Number.isFinite(n) || n < 0 || n > WEBAPP_MAX_CAP_USD)
      throw new HttpError(400, `The daily cap is an amount in dollars, from 0 to ${WEBAPP_MAX_CAP_USD}.`);
    out.dailyCapUsd = n;
  }
  for (const k of ["apps", "connections"] as const) {
    if (v[k] === undefined) continue;
    if (!Array.isArray(v[k]) || !(v[k] as unknown[]).every((x) => typeof x === "string"))
      throw new HttpError(400, `${k === "apps" ? "Apps" : "Connections"} are a list of ids.`);
    if ((v[k] as unknown[]).length > LIST_MAX) throw new HttpError(400, `At most ${LIST_MAX} ${k}.`);
    out[k] = strings(v[k]);
  }
  if (v.notify !== undefined) {
    if (typeof v.notify !== "boolean") throw new HttpError(400, "Notify is true or false.");
    out.notify = v.notify;
  }
  if (v.mail !== undefined) out.mail = changeMail(current.mail, v.mail);
  return out;
}

// ---- the table ---------------------------------------------------------------------------------------------------

interface Row {
  id: string;
  slug: string;
  name: string;
  folder: string;
  settings: string;
  created_at: number;
  updated_at: number;
  stage: string | null;
}

const fromRow = (r: Row): WebAppRow => {
  let settings: unknown;
  try {
    settings = JSON.parse(r.settings);
  } catch {}
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    folder: r.folder,
    stage: isWebAppStage(r.stage) ? r.stage : null,
    settings: readSettings(settings),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
};

export function listWebApps(db: DB): WebAppRow[] {
  webappTables(db);
  return (db.prepare("select * from web_apps order by created_at, id").all() as Row[]).map(fromRow);
}

export function getWebApp(db: DB, id: string): WebAppRow | null {
  webappTables(db);
  const r = db.prepare("select * from web_apps where id = ?").get(String(id)) as Row | undefined;
  return r ? fromRow(r) : null;
}

export function webAppBySlug(db: DB, slug: string): WebAppRow | null {
  webappTables(db);
  const r = db.prepare("select * from web_apps where slug = ?").get(String(slug)) as Row | undefined;
  return r ? fromRow(r) : null;
}

/** A name a person gave: trimmed, one line, not empty, not long. */
export function cleanName(v: unknown): string {
  const s = String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) throw new HttpError(400, "Give the app a name.");
  if (s.length > NAME_MAX) throw new HttpError(400, `A name is at most ${NAME_MAX} characters.`);
  return s;
}

/** The first slug from `name` that no app has: name, name-2, name-3… (at most 48 characters). */
export function freeSlug(db: DB, name: string): string {
  const base = webappSlug(name);
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? "" : `-${n}`;
    const slug = base.slice(0, 48 - suffix.length).replace(/-+$/, "") + suffix;
    if (!db.prepare("select 1 from web_apps where slug = ?").get(slug)) return slug;
  }
}

export const within = (inner: string, outer: string) => inner === outer || inner.startsWith(outer.endsWith(path.sep) ? outer : outer + path.sep);

/**
 * The folder as a path to keep: absolute, real (links resolved), a folder with a hydor.json that can be read, and nowhere near
 * Hydor's own data. `unwritten`: an app that is only now being made has none yet.
 */
export function checkFolder(db: DB, given: unknown, dataDir: string, o: { unwritten?: boolean } = {}): string {
  if (typeof given !== "string" || !given.trim()) throw new HttpError(400, "Say which folder the app is in.");
  const raw = given.trim();
  if (!path.isAbsolute(raw)) throw new HttpError(400, "The folder has to be a full path, starting with /.");
  let real: string;
  try {
    real = fs.realpathSync(raw);
  } catch {
    throw new HttpError(400, `There is no folder at ${raw}.`);
  }
  if (!fs.statSync(real).isDirectory()) throw new HttpError(400, `${raw} is not a folder.`);
  let data = dataDir;
  try {
    data = fs.realpathSync(dataDir);
  } catch {}
  if (within(real, data))
    throw new HttpError(400, "That folder is inside Hydor’s own data folder: an app has to live somewhere of its own.");
  // A folder that holds Hydor's data would show it to the app (the sandbox lends the app its whole folder).
  if (within(data, real))
    throw new HttpError(400, "That folder holds Hydor’s own data folder: an app has to live in a folder of its own.");
  if (!o.unwritten) {
    if (!fs.existsSync(path.join(real, HYDOR_FILE))) throw new HttpError(400, `This folder has no ${HYDOR_FILE}, the file that says how Hydor builds and runs the app.`);
    const shape = shapeOf(real);
    if (!shape.ok) throw new HttpError(400, `Its ${HYDOR_FILE} cannot be used yet:\n- ${shape.problems.join("\n- ")}`);
  }
  const again = listWebApps(db).find((a) => a.folder === real);
  if (again) throw new HttpError(409, `That folder is already registered, as “${again.name}”.`);
  return real;
}

/** Registers the app in `given.folder` (`unwritten`: one only now being made, whose hydor.json is not written yet). An app being made starts at its brief; one that is already written is at Build. */
export function addWebApp(db: DB, given: WebAppAdd, dataDir: string, o: { unwritten?: boolean } = {}): WebAppRow {
  webappTables(db);
  const folder = checkFolder(db, given?.folder, dataDir, o);
  const name = cleanName(
    given.name !== undefined && String(given.name).trim() ? given.name : (shapeOf(folder).name ?? path.basename(folder)),
  );
  const row = {
    id: crypto.randomBytes(8).toString("hex"),
    slug: freeSlug(db, name),
    name,
    folder,
    stage: o.unwritten ? "brief" : "build",
    settings: JSON.stringify(DEFAULT_WEBAPP_SETTINGS),
    at: Date.now(),
  };
  db.prepare(
    "insert into web_apps (id, slug, name, folder, stage, settings, created_at, updated_at) values (@id, @slug, @name, @folder, @stage, @settings, @at, @at)",
  ).run(row);
  return getWebApp(db, row.id)!;
}

/** Gives an app the address its name makes now (only for one that nobody uses yet). True when it changed. */
export function moveSlug(db: DB, id: string): boolean {
  const cur = getWebApp(db, id);
  if (!cur || webappSlug(cur.name) === cur.slug) return false;
  db.prepare("update web_apps set slug = ?, updated_at = ? where id = ?").run(freeSlug(db, cur.name), Date.now(), id);
  return true;
}

/** Changes the name and what the app may use. The slug stays: it is the app's address. */
export function changeWebApp(db: DB, id: string, change: { name?: unknown; settings?: unknown }): WebAppRow {
  const cur = getWebApp(db, id);
  if (!cur) throw new HttpError(404, "There is no such web app.");
  const name = change.name === undefined ? cur.name : cleanName(change.name);
  const settings = changeSettings(cur.settings, change.settings);
  db.prepare("update web_apps set name = ?, settings = ?, updated_at = ? where id = ?").run(
    name,
    JSON.stringify(settings),
    Date.now(),
    cur.id,
  );
  return getWebApp(db, cur.id)!;
}

/** Says which stage an app is at now. */
export function setStage(db: DB, id: string, stage: WebAppStage) {
  webappTables(db);
  db.prepare("update web_apps set stage = ?, updated_at = ? where id = ?").run(stage, Date.now(), id);
}

/** Forgets the app (its folder is not touched). */
export function removeWebApp(db: DB, id: string): boolean {
  webappTables(db);
  return db.prepare("delete from web_apps where id = ?").run(String(id)).changes > 0;
}
