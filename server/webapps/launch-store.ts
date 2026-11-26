// What Hydor keeps of launches, in its own database: each launch of an app (when, who, the commit, the lines of the check
// let through, how long), which launch inside this Hydor is the one people use and which the one before it (the way back),
// what is deployed on a server of the person's own (app, place, host, name, address, commit: nothing of this is written into
// the app's folder), and the weekly check's last result. No key and no value of a key is ever kept.
import type { Deployment, LaunchRecord, WeeklyCheck } from "../../shared/webapps.ts";
import type { DB } from "../db.ts";

const made = new WeakSet<DB>();
export function launchTables(db: DB) {
  if (made.has(db)) return;
  db.exec(`
    create table if not exists web_launches (
      id text primary key,
      app text not null,
      place text not null,
      env text not null,
      at integer not null,
      record text not null
    );
    create index if not exists web_launches_app on web_launches (app, at);
    create table if not exists web_live (
      app text primary key,
      current text,
      previous text
    );
    create table if not exists web_weekly (
      app text primary key,
      at integer not null,
      result text not null
    );
    create table if not exists web_deployments (
      app text not null,
      env text not null,
      host text not null,
      name text not null,
      address text not null,
      commit_id text not null,
      at integer not null,
      primary key (app, env)
    );
  `);
  made.add(db);
}

export function saveLaunch(db: DB, r: LaunchRecord): void {
  launchTables(db);
  db.prepare("insert into web_launches (id, app, place, env, at, record) values (?, ?, ?, ?, ?, ?) on conflict(id) do update set record = excluded.record, at = excluded.at").run(r.id, r.app, r.place, r.env, r.at, JSON.stringify(r));
}

export function getLaunch(db: DB, id: string): LaunchRecord | null {
  launchTables(db);
  const row = db.prepare("select record from web_launches where id = ?").get(id) as { record: string } | undefined;
  return row ? (JSON.parse(row.record) as LaunchRecord) : null;
}

/** The launches of an app, newest first. */
export function listLaunches(db: DB, app: string, o: { place?: "hydor" | "server"; env?: string; limit?: number } = {}): LaunchRecord[] {
  launchTables(db);
  const rows = db.prepare("select record from web_launches where app = ? order by at desc, id desc limit ?").all(app, 500) as { record: string }[];
  return rows
    .map((r) => JSON.parse(r.record) as LaunchRecord)
    .filter((r) => (!o.place || r.place === o.place) && (!o.env || r.env === o.env))
    .slice(0, o.limit ?? 50);
}

/** The launched version inside this Hydor and the one before it. */
export function liveOf(db: DB, app: string): { current: LaunchRecord | null; previous: LaunchRecord | null } {
  launchTables(db);
  const row = db.prepare("select current, previous from web_live where app = ?").get(app) as { current: string | null; previous: string | null } | undefined;
  return { current: row?.current ? getLaunch(db, row.current) : null, previous: row?.previous ? getLaunch(db, row.previous) : null };
}

export function setLive(db: DB, app: string, current: string | null, previous: string | null): void {
  launchTables(db);
  db.prepare("insert into web_live (app, current, previous) values (?, ?, ?) on conflict(app) do update set current = excluded.current, previous = excluded.previous").run(app, current, previous);
}

export function readWeekly(db: DB, app: string): WeeklyCheck | null {
  launchTables(db);
  const row = db.prepare("select result from web_weekly where app = ?").get(app) as { result: string } | undefined;
  try {
    return row ? (JSON.parse(row.result) as WeeklyCheck) : null;
  } catch {
    return null;
  }
}

export function saveWeekly(db: DB, app: string, w: WeeklyCheck): void {
  launchTables(db);
  db.prepare("insert into web_weekly (app, at, result) values (?, ?, ?) on conflict(app) do update set at = excluded.at, result = excluded.result").run(app, w.at, JSON.stringify(w));
}

/** What of an app (or of every app) is deployed on servers. */
export function listDeployments(db: DB, app?: string): Deployment[] {
  launchTables(db);
  const rows = (app ? db.prepare("select * from web_deployments where app = ? order by env").all(app) : db.prepare("select * from web_deployments order by app, env").all()) as (Omit<Deployment, "commit"> & { commit_id: string })[];
  return rows.map(({ commit_id, ...r }) => ({ ...r, commit: commit_id }));
}

export const getDeployment = (db: DB, app: string, env: string): Deployment | null => listDeployments(db, app).find((d) => d.env === env) ?? null;

export function saveDeployment(db: DB, d: Deployment): void {
  launchTables(db);
  db.prepare("insert into web_deployments (app, env, host, name, address, commit_id, at) values (?, ?, ?, ?, ?, ?, ?) on conflict(app, env) do update set host = excluded.host, name = excluded.name, address = excluded.address, commit_id = excluded.commit_id, at = excluded.at").run(d.app, d.env, d.host, d.name, d.address, d.commit, d.at);
}

export function removeDeployment(db: DB, app: string, env: string): void {
  launchTables(db);
  db.prepare("delete from web_deployments where app = ? and env = ?").run(app, env);
}

/** A server is removed: what Hydor remembered being on it goes (the server itself is not touched). */
export function forgetHostDeployments(db: DB, host: string): void {
  launchTables(db);
  db.prepare("delete from web_deployments where host = ?").run(host);
}

/** Forgets everything kept of an app's launches (the app is forgotten). */
export function forgetLaunches(db: DB, app: string): void {
  launchTables(db);
  for (const t of ["web_launches", "web_live", "web_weekly", "web_deployments"]) db.prepare(`delete from ${t} where app = ?`).run(app);
}
