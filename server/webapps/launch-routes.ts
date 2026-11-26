// The routes of the Launch and Run stages. Launch: the places card, the person's own servers, a launch (inside this Hydor, or
// to a server: server-launch.ts) as a job whose steps show as they end, the way back and taking it off a server. Run: is it
// up, logs, restart, backups and the weekly check, for each place the app is launched to.
import fs from "node:fs";
import path from "node:path";
import type { FastifyReply } from "fastify";
import { SERVER_NEEDS_ACCOUNTS, type LaunchHost, type LaunchPlace, type LaunchRecord, type RunBackup, type RunStatus, type WebAppLaunchView, type WebAppRunView } from "../../shared/webapps.ts";
import { HttpError } from "../auth.ts";
import type { Deps } from "../features/types.ts";
import { asRunBackup, listBackupRecords } from "./backups.ts";
import { shapeOf } from "./shape.ts";
import { backupsOf, gitOut, type Launches, liveData, liveIdOf, procEnv } from "./hydor-launch.ts";
import { getDeployment, listLaunches, liveOf, readWeekly } from "./launch-store.ts";
import { launchPlaces, withCatalog } from "./places.ts";
import { readCatalog } from "./services.ts";
import { checkEnv, type ServerOps } from "./server-launch.ts";
import type { Host, HostedApp } from "./host.ts";
import type { WebAppRow } from "./store.ts";
import { checkApp, readSchedule, startWeekly, writeSchedule, type WeeklyCtx } from "./weekly.ts";

type Json = Record<string, any>;

export interface LaunchRoutesCtx {
  root: string;
  launches: Launches;
  server: ServerOps;
  host: () => Host;
  changed: () => void;
  enabled: () => void;
  own: (req: { params: unknown }) => WebAppRow;
  who: () => { id: string; name: string };
  modeFor: (a: WebAppRow) => { launched: boolean };
  hosted: (a: WebAppRow) => HostedApp;
  hostedLive: (a: WebAppRow, dir: string) => HostedApp;
  /** What the launched version inside Hydor is given: hidden in anything shown of it. */
  values: (a: WebAppRow) => Record<string, string>;
  /** How often the weekly timer looks (ms; default an hour); false: no timer (tests). */
  weekly?: number | false;
}

const rec = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const B = (req: { body: unknown }) => (req.body ?? {}) as Json;

const mask = (line: string, secrets: string[]): string => {
  let out = line;
  for (const s of secrets) if (s.length >= 4) out = out.split(s).join("«hidden»");
  return out.replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/g, "$1«hidden»").replace(/\b([A-Z][A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|KEY)[A-Z0-9_]*=)\S+/g, "$1«hidden»");
};

export function launchRoutes(d: Deps, c: LaunchRoutesCtx) {
  const { app, db } = d;
  const own = c.own;

  // ---- what is shared by pages and tools -------------------------------------------------------------------------------------------

  const env = (a: WebAppRow) => procEnv(c.root, a.id);

  /** What the Launch tab reads. */
  async function view(a: WebAppRow): Promise<WebAppLaunchView> {
    const live = liveOf(db, a.id);
    const g = env(a);
    const unsaved = !!(await gitOut(a.folder, g, ["status", "--porcelain", "--", "."])).out;
    let ahead: number | null = null;
    if (live.current) {
      const n = await gitOut(a.folder, g, ["rev-list", "--count", `${live.current.commit}..HEAD`, "--", "."]);
      ahead = n.ok ? Number(n.out) || 0 : null;
    }
    const shape = shapeOf(a.folder);
    const deployments = c.server.deployments(a);
    const serverRecords = listLaunches(db, a.id, { place: "server" });
    const noServer = shape.ok && shape.signIn === "hydor" ? SERVER_NEEDS_ACCOUNTS : undefined;
    const places: LaunchPlace[] = withCatalog(launchPlaces(noServer), readCatalog(), Date.now()).map((p) => {
      if (p.id === "hydor" && live.current) return { ...p, launched: { env: "hydor", at: live.current.at, ...(live.current.version ? { version: live.current.version } : {}) } };
      if (p.id === "server" && deployments.length) {
        const d = deployments.find((x) => x.env === "production") ?? deployments[0];
        return { ...p, launched: { env: d.env, at: d.at, address: d.address, host: d.host } };
      }
      return p;
    });
    const job = c.server.job(a.id) && c.launches.job(a.id) ? ((c.server.job(a.id)!.startedAt >= c.launches.job(a.id)!.startedAt ? c.server.job(a.id) : c.launches.job(a.id))!) : c.server.job(a.id) ?? c.launches.job(a.id);
    const st = live.current ? c.host().status(liveIdOf(a.id)) : null;
    const build = shape.ok && !noServer ? c.server.buildOf(a) : undefined;
    return {
      places,
      hydor: {
        launched: live.current,
        previous: live.previous,
        openable: !!c.launches.live(a),
        ahead,
        unsaved,
        run: st ? { state: st.state, pid: st.pid, since: st.since, lastUse: st.lastUse, restarts: st.restarts, sandboxed: st.sandboxed, sandboxNote: st.sandboxNote, lastExit: st.lastExit } : null,
      },
      envs: deployments.map((d) => ({ ...d, keys: c.server.keysOf(a, d.env).list, last: serverRecords.find((r) => r.env === d.env) ?? null })),
      hosts: await c.server.listHosts().catch(() => [] as LaunchHost[]),
      ...(build ? { serverBuild: build } : {}),
      job: job ?? null,
      history: [...listLaunches(db, a.id, { limit: 30 })],
      // What stops a launch is a hydor.json that cannot be read.
      blocked: shape.ok ? null : (shape.problem ?? "Its hydor.json cannot be read."),
    };
  }

  /** The place a Run route means: `hydor`, or a place of the app that runs on a server. */
  function placeOf(a: WebAppRow, place: string): { kind: "hydor" } | { kind: "server"; env: string } {
    if (place === "hydor") {
      if (!c.launches.live(a)) throw new HttpError(409, "This app has not been launched inside this Hydor.");
      return { kind: "hydor" };
    }
    const e = checkEnv(place);
    if (!getDeployment(db, a.id, e)) throw new HttpError(404, `This app has no place called ${e} on a server.`);
    return { kind: "server", env: e };
  }

  /** The values to hide in anything shown of the launched app. */
  const secretsOf = (a: WebAppRow): string[] => {
    const out = [c.host().secret(liveIdOf(a.id))];
    try {
      out.push(...Object.values(c.values(a)));
    } catch {}
    return out;
  };

  /** Whether the launched version answers at its ready address. */
  async function answersReady(dir: string, port: number, ms: number): Promise<boolean> {
    const r = await fetch(`http://127.0.0.1:${port}${shapeOf(dir).ready}`, { redirect: "manual", signal: AbortSignal.timeout(ms) }).catch(() => null);
    return !!r && r.status >= 200 && r.status < 400;
  }

  /** Is it up, for the launched version inside Hydor: from the host and the app's log. */
  async function hydorStatus(a: WebAppRow, wake = false): Promise<RunStatus> {
    const l = c.launches.live(a);
    if (!l) return { place: "hydor", kind: "hydor", up: null, say: "Not launched inside this Hydor.", problem: "This app has not been launched inside this Hydor." };
    const id = liveIdOf(a.id);
    let st = c.host().status(id);
    let up: boolean | null = st.state === "running";
    let say = "";
    if (wake && st.state !== "running") {
      try {
        const port = await c.host().ensure(c.hostedLive(a, l.dir));
        up = await answersReady(l.dir, port, 5000);
        say = up ? "It was asleep and woke up when asked: it answers." : "It started but does not say it is ready.";
      } catch (e) {
        up = false;
        say = `It would not start: ${String((e as Error).message).split("\n")[0]}`;
      }
      st = c.host().status(id);
    } else if (st.state === "running") {
      up = await answersReady(l.dir, st.port!, 3000);
      say = up ? "It is up and says it is ready." : "It runs but does not say it is ready.";
    } else if (st.state === "crashed") {
      up = false;
      say = `It fell: ${st.lastExit ?? "it stopped"}.`;
    } else say = "It is asleep (nobody has used it for a while) and starts again when someone opens it.";
    const backups = listBackupRecords(backupsOf(c.root, a.id));
    const lb = backups[0];
    let free: number | null = null;
    try {
      const s = fs.statfsSync(liveData(c.root, a.id));
      free = Math.round(((s.bavail * s.bsize) / 1e9) * 10) / 10;
    } catch {}
    const sch = readSchedule(c.root, a.id);
    return {
      place: "hydor",
      kind: "hydor",
      up,
      say,
      ...(l.record.version ? { version: l.record.version } : {}),
      since: st.since,
      lastLaunch: { at: l.record.at, result: l.record.result, ...(l.record.version ? { version: l.record.version } : {}) },
      lastBackup: lb ? { id: lb.id, at: Date.parse(lb.createdAt), ageHours: Math.round(((Date.now() - Date.parse(lb.createdAt)) / 3_600_000) * 10) / 10 } : null,
      disk: { freeGb: free, say: free === null ? "not known" : `${free} GB left` },
      services: [{ name: "app", up }],
      schedule: sch,
    };
  }

  const weeklyCtx: WeeklyCtx = {
    d,
    root: c.root,
    launches: c.launches,
    server: c.server,
    hydorStatus,
    serverEnvs: (a) => c.server.deployments(a).map((d) => d.env),
  };
  const stopWeekly = c.weekly === false ? () => {} : startWeekly(weeklyCtx, c.weekly ?? 60 * 60_000);

  /** The launch that is going, or the last that ended: read from memory (no git: the page asks every second while it runs, and git's own lock would meet the step it saves). */
  const jobOf = (a: WebAppRow) => {
    const s = c.server.job(a.id);
    const h = c.launches.job(a.id);
    return Promise.resolve(s && h ? (s.startedAt >= h.startedAt ? s : h) : (s ?? h ?? null));
  };
  const need = (v: unknown, what: string) => {
    if (typeof v !== "string" || !v.trim()) throw new HttpError(400, `${what} is needed.`);
    return v.trim();
  };

  // ---- hosts ----------------------------------------------------------------------------------------------------------------------

  app.get("/api/webapps/hosts", async () => {
    c.enabled();
    return { hosts: await c.server.listHosts() };
  });
  app.post("/api/webapps/hosts", async (req) => {
    c.enabled();
    const b = B(req);
    // `key`: the app whose key was made ahead (GET /api/webapps/:id/server-key), already pasted on the server.
    return { host: await c.server.addHost(need(b.name, "A name"), need(b.ssh, "The server (user@address)"), typeof b.key === "string" && b.key ? b.key : undefined) };
  });
  app.post("/api/webapps/hosts/:name/connect", async (req) => {
    c.enabled();
    return await c.server.connect((req.params as { name: string }).name);
  });
  app.post("/api/webapps/hosts/:name/accept", async (req) => {
    c.enabled();
    return { host: await c.server.accept((req.params as { name: string }).name, need(B(req).fingerprint, "The fingerprint")) };
  });
  app.post("/api/webapps/hosts/:name/check", async (req) => {
    c.enabled();
    return await c.server.checkHost((req.params as { name: string }).name, { prepare: B(req).prepare === true });
  });
  app.delete("/api/webapps/hosts/:name", async (req) => {
    c.enabled();
    await c.server.removeHost((req.params as { name: string }).name);
    return { ok: true };
  });

  // ---- launch ---------------------------------------------------------------------------------------------------------------------

  app.get("/api/webapps/:id/launch", async (req) => {
    c.enabled();
    return await view(own(req));
  });
  app.get("/api/webapps/:id/launch/job", async (req) => {
    c.enabled();
    return { job: await jobOf(own(req)) };
  });
  app.post("/api/webapps/:id/launch/hydor", async (req) => {
    c.enabled();
    const a = own(req);
    const b = B(req);
    if (c.server.job(a.id)?.state === "running" || c.server.job(a.id)?.state === "asking") throw new HttpError(409, "A launch of this app is going: wait for it to end.");
    return { job: c.launches.start(a, { override: arr(b.override).map(String) }) };
  });
  app.post("/api/webapps/:id/launch/server", async (req) => {
    c.enabled();
    const a = own(req);
    const b = B(req);
    if (c.launches.job(a.id)?.state === "running" || c.launches.job(a.id)?.state === "asking") throw new HttpError(409, "A launch of this app is going: wait for it to end.");
    return { job: c.server.launch(a, { host: need(b.host, "A host"), env: b.env === undefined ? undefined : String(b.env), address: need(b.address, "The address"), override: arr(b.override).map(String) }) };
  });
  app.post("/api/webapps/:id/launch/takedown", async (req) => {
    c.enabled();
    return await c.server.takeDown(own(req), need(B(req).env, "The place"));
  });
  app.post("/api/webapps/:id/launch/answer", async (req) => {
    c.enabled();
    const a = own(req);
    const b = B(req);
    const v = { override: arr(b.override).map(String), cancel: b.cancel === true };
    return { job: c.launches.job(a.id)?.state === "asking" ? c.launches.answer(a, v) : c.server.answer(a, v) };
  });
  app.get("/api/webapps/:id/launch/keys", async (req) => {
    c.enabled();
    const a = own(req);
    const q = (req.query ?? {}) as { env?: unknown; host?: unknown };
    const e = checkEnv(String(q.env ?? "production"));
    return { env: e, keys: c.server.keysOf(a, e, typeof q.host === "string" ? q.host : undefined).list };
  });
  app.get("/api/webapps/:id/launch/history", async (req) => {
    c.enabled();
    const a = own(req);
    const e = (req.query as { env?: unknown })?.env;
    if (e === undefined || e === "hydor") return { history: listLaunches(db, a.id, { place: "hydor" }) };
    return { history: await c.server.history(a, checkEnv(String(e))) };
  });
  app.get("/api/webapps/:id/launch/back", async (req) => {
    c.enabled();
    const a = own(req);
    const p = c.launches.backPlan(a);
    return { ok: p.ok, ...(p.refuse ? { refuse: p.refuse } : {}), ...(p.target ? { target: p.target } : {}) };
  });
  app.post("/api/webapps/:id/launch/back", async (req) => {
    c.enabled();
    const a = own(req);
    const b = B(req);
    if (b.place === "server" || (b.env !== undefined && b.env !== "hydor")) {
      if (c.launches.job(a.id)?.state === "running" || c.launches.job(a.id)?.state === "asking") throw new HttpError(409, "A launch of this app is going: wait for it to end.");
      return { job: c.server.back(a, { env: b.env === undefined ? undefined : String(b.env), restoreDatabase: b.restoreDatabase === true }) };
    }
    return { job: c.launches.back(a, { restoreDatabase: b.restoreDatabase === true }) };
  });
  // ---- run --------------------------------------------------------------------------------------------------------------------------

  app.get("/api/webapps/:id/run", async (req) => {
    c.enabled();
    const a = own(req);
    const places: RunStatus[] = [];
    if (c.launches.live(a)) places.push(await hydorStatus(a));
    for (const e of weeklyCtx.serverEnvs(a)) places.push(await c.server.status(a, e));
    const out: WebAppRunView = { places, weekly: readWeekly(db, a.id) };
    return out;
  });
  app.get("/api/webapps/:id/run/weekly", async (req) => {
    c.enabled();
    return { weekly: readWeekly(db, own(req).id) };
  });
  app.post("/api/webapps/:id/run/weekly", async (req) => {
    c.enabled();
    const a = own(req);
    return { weekly: await checkApp(weeklyCtx, a, { notify: B(req).notify !== false }) };
  });
  app.get("/api/webapps/:id/run/:place/status", async (req) => {
    c.enabled();
    const a = own(req);
    const p = placeOf(a, (req.params as { place: string }).place);
    return { status: p.kind === "hydor" ? await hydorStatus(a, (req.query as { wake?: unknown })?.wake === "1") : await c.server.status(a, p.env) };
  });
  app.get("/api/webapps/:id/run/:place/logs", async (req) => {
    c.enabled();
    const a = own(req);
    const p = placeOf(a, (req.params as { place: string }).place);
    const q = (req.query ?? {}) as { since?: string; tail?: string; errors?: string; service?: string };
    const tail = Math.max(1, Math.min(1000, Number(q.tail) || 200));
    if (p.kind === "server") return { lines: await c.server.logs(a, p.env, { since: q.since, tail, errors: q.errors === "1", service: q.service }) };
    const all = c.host().status(liveIdOf(a.id)).log.map((l) => mask(l, secretsOf(a)));
    const bad = (l: string) => /"level":"(error|warn)"|"status":5\d\d/.test(l);
    const lines = q.errors === "1" ? [...all.filter(bad), ...all.filter((l) => !bad(l))] : all;
    return { lines: lines.slice(-tail) };
  });
  const restart = async (a: WebAppRow, place: string) => {
    const p = placeOf(a, place);
    if (p.kind === "server") return await c.server.restart(a, p.env);
    const l = c.launches.live(a)!;
    await c.host().stop(liveIdOf(a.id));
    const port = await c.host().ensure(c.hostedLive(a, l.dir));
    const ok = await answersReady(l.dir, port, 20_000);
    c.changed();
    return { ok, summary: ok ? "It was stopped politely and started again, and says it is ready." : "It was started again but does not say it is ready." };
  };
  app.post("/api/webapps/:id/run/:place/restart", async (req) => {
    c.enabled();
    return await restart(own(req), (req.params as { place: string }).place);
  });
  app.get("/api/webapps/:id/run/:place/backups", async (req) => {
    c.enabled();
    const a = own(req);
    const p = placeOf(a, (req.params as { place: string }).place);
    if (p.kind === "server") return await c.server.backups.list(a, p.env);
    return { backups: c.launches.backups.list(a) as RunBackup[], schedule: readSchedule(c.root, a.id) };
  });
  app.post("/api/webapps/:id/run/:place/backups", async (req) => {
    c.enabled();
    const a = own(req);
    const p = placeOf(a, (req.params as { place: string }).place);
    if (p.kind === "server") return await c.server.backups.now(a, p.env);
    const b = await c.launches.backups.now(a);
    return { backup: b, verified: true, summary: "Backed up, restored into a scratch folder and read back." };
  });
  app.put("/api/webapps/:id/run/:place/backups/schedule", async (req) => {
    c.enabled();
    const a = own(req);
    const p = placeOf(a, (req.params as { place: string }).place);
    const b = B(req);
    const at = b.at === undefined ? undefined : String(b.at);
    const keepDays = b.keepDays === undefined ? undefined : Number(b.keepDays);
    if (p.kind === "server") return { schedule: await c.server.backups.schedule(a, p.env, { at, keepDays }) };
    if (at !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(at)) throw new HttpError(400, "The time is HH:MM, in UTC (like 03:30).");
    if (keepDays !== undefined && (!Number.isInteger(keepDays) || keepDays < 1 || keepDays > 365)) throw new HttpError(400, "Keep them for a whole number of days, 1 to 365.");
    return { schedule: writeSchedule(c.root, a.id, { at, keepDays }) };
  });
  app.post("/api/webapps/:id/run/:place/backups/:bid/restore", async (req) => {
    c.enabled();
    const a = own(req);
    const p = placeOf(a, (req.params as { place: string }).place);
    const bid = (req.params as { bid: string }).bid;
    if (p.kind === "server") return await c.server.backups.restore(a, p.env, bid);
    return await c.launches.backups.restore(a, bid);
  });
  app.get("/api/webapps/:id/run/:place/backups/:bid/download", async (req, reply: FastifyReply) => {
    c.enabled();
    const a = own(req);
    const p = placeOf(a, (req.params as { place: string }).place);
    const bid = (req.params as { bid: string }).bid;
    const file = p.kind === "server" ? await c.server.backups.pull(a, p.env, bid, path.join(c.root, a.id, "pulled", p.env)) : c.launches.backups.file(a, bid);
    const stream = fs.createReadStream(file);
    // The copy brought from a server is not kept here once it has been sent.
    if (p.kind === "server") stream.once("close", () => fs.rm(file, { force: true }, () => {}));
    return reply.header("content-type", "application/gzip").header("content-disposition", `attachment; filename="${bid}.tar.gz"`).send(stream);
  });

  return { view, hydorStatus, weeklyCtx, restart, asRunBackup, stopWeekly };
}
export type LaunchRoutes = ReturnType<typeof launchRoutes>;
export type { LaunchHost, LaunchRecord };
