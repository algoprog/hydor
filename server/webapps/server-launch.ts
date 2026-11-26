// Launching to a server of the person's own, and running it there: Hydor's side of the engine in remote/ (which knows
// only a folder, its hydor.json and a host). Here: the hosts' folder (<data>/server-hosts, with a key Hydor makes for
// each; never ~/.ssh), a launch as a job with the engine's steps, from a checkout of a saved commit, with Hydor's own check
// and the app's keys for that place (given to the engine as a map and nowhere else), what is deployed (launch-store.ts,
// nothing written into the app's folder), and the Run tab's looks at it.
import fs from "node:fs";
import path from "node:path";
import { readHydorText, HYDOR_FILE, type HydorFile } from "../../shared/hydor-file.ts";
import { SERVER_NEEDS_ACCOUNTS, stopsLaunch, type CheckLine, type Deployment, type LaunchAsk, type LaunchHost, type LaunchHostOffer, type LaunchJob, type LaunchKey, type LaunchRecord, type LaunchStop, type RunBackup, type RunStatus } from "../../shared/webapps.ts";
import { sandboxAvailable } from "../agent/sandbox.ts";
import { HttpError } from "../auth.ts";
import type { DB } from "../db.ts";
import { runSmoke } from "./contract-check.ts";
import { gitOut, procEnv } from "./hydor-launch.ts";
import { forgetHostDeployments, getDeployment, listDeployments, listLaunches, removeDeployment, saveDeployment, saveLaunch } from "./launch-store.ts";
import { runProc } from "./proc.ts";
import * as engine from "./remote/index.ts";
import { LAUNCH_STEPS, Refused, type CheckOutcome, type LaunchOutcome, type RemoteRecord, type Step } from "./remote/types.ts";
import { buildEnv, nodeBin, sandboxArgs } from "./run-app.ts";
import { shapeOf } from "./shape.ts";
import { saveStep } from "./steps.ts";
import type { WebAppRow } from "./store.ts";

export interface ServerCtx {
  db: DB;
  /** <data>/webapps */
  root: string;
  /** <data>: the hosts are kept in <data>/server-hosts. */
  dataDir: string;
  changed: () => void;
  who: () => { id: string; name: string };
  /** The values the owner saved for a place of the app, by name (made ones are the server's to make). */
  values: (a: WebAppRow, env: string) => Record<string, string>;
  /** Hydor's own check of a checkout (contract-run.ts): it builds a copy, tries it and looks at its pages. */
  check: (a: WebAppRow, dir: string, onStep: (what: string) => void) => Promise<CheckLine[]>;
  /** A version is live on a server: the app is launched. */
  launched?: (a: WebAppRow) => void;
  /** Smoke commands run inside bubblewrap where it is here. */
  sandbox?: boolean;
  /** For tests: how a connection is made and what looks at the live address. */
  connect?: engine.Connect;
  probes?: engine.Place["probes"];
}

export const ENV_NAME = /^[a-z][a-z0-9-]{0,29}$/;
const BACKUP_ID = /^\d{8}-\d{6}(-[a-z0-9-]+)?$/;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const STATUS = { input: 400, missing: 404, conflict: 409, server: 502 } as const;

/** The engine's refusals as answers of a route. */
const http = (e: unknown): never => {
  if (e instanceof Refused) throw new HttpError(STATUS[e.kind], e.message, e.details.length ? { details: e.details } : undefined);
  throw e;
};
const asked = async <T>(p: Promise<T> | (() => Promise<T> | T)): Promise<T> => {
  try {
    return await (typeof p === "function" ? p() : p);
  } catch (e) {
    return http(e);
  }
};

/** The place's name for a server: lower-case letters, digits and hyphens, and not one of Hydor's own. */
export function checkEnv(env: string): string {
  if (!ENV_NAME.test(env)) throw new HttpError(400, "The place's name is lower-case letters, digits and hyphens (like production).");
  if (env === "hydor" || env === "hydor-preview" || env === "all") throw new HttpError(400, "That name is for inside Hydor: launch it there.");
  return env;
}

/** The deployment's name on the server: the app's address for production, else with the place after it. */
export const deploymentName = (slug: string, env: string) =>
  `${env === "production" ? slug : `${slug}-${env}`}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 52)
    .replace(/-+$/, "") || "app";

/** hydor.json of a folder as the engine takes it, or null when it cannot be read. */
function contractOf(dir: string): HydorFile | null {
  try {
    const r = readHydorText(fs.readFileSync(path.join(dir, HYDOR_FILE), "utf8"));
    return r.ok ? r.file : null;
  } catch {
    return null;
  }
}

export function createServerOps(c: ServerCtx) {
  const hostsDir = path.join(c.dataDir, "server-hosts");
  const jobs = new Map<string, LaunchJob>();
  const waiting = new Map<string, (a: { override?: string[]; cancel?: boolean }) => void>();
  const runs = new Map<string, Promise<void>>();

  const place = (host: string, name: string): engine.Place => ({ hostsDir, host, app: name, ...(c.connect ? { connect: c.connect } : {}), ...(c.probes ? { probes: c.probes } : {}) });
  const deployed = (a: WebAppRow, env: string): Deployment => {
    const d = getDeployment(c.db, a.id, env);
    if (!d) throw new HttpError(404, `This app has no place called ${env} on a server.`);
    return d;
  };
  const placeOf = (a: WebAppRow, env: string) => {
    const d = deployed(a, env);
    return { d, p: place(d.host, d.name) };
  };

  // ---- hosts ------------------------------------------------------------------------------------------------------------------------

  const asHost = (h: ReturnType<typeof engine.getHost>, apps: string[]): LaunchHost => ({ ...h, authorizedLine: h.publicKey, ...(apps.length ? { apps } : {}) });
  const appsOn = (host: string) => listDeployments(c.db).filter((d) => d.host === host).map((d) => d.name);

  async function listHosts(): Promise<LaunchHost[]> {
    return asked(() => engine.listHosts(hostsDir).map((h) => asHost(h, appsOn(h.name))));
  }
  async function addHost(name: string, ssh: string, pending?: string): Promise<LaunchHost> {
    if (name === "hydor" || name === "hydor-preview" || name === "all") throw new HttpError(400, "That name is Hydor's own: name the server something else.");
    const h = await asked(engine.addHost(hostsDir, name, ssh, pending ? { pending } : {}));
    c.changed();
    return asHost(h, []);
  }
  const connect = (name: string): Promise<LaunchHostOffer> => asked(engine.offerHost(hostsDir, name));
  async function accept(name: string, fingerprint: string): Promise<LaunchHost> {
    const h = await asked(engine.acceptHost(hostsDir, name, fingerprint));
    c.changed();
    return asHost(h, appsOn(name));
  }
  async function checkHost(name: string, o: { prepare?: boolean } = {}) {
    try {
      return await asked(engine.checkHost(hostsDir, name, { prepare: o.prepare, ...(c.connect ? { connect: c.connect } : {}) }));
    } finally {
      c.changed();
    }
  }
  async function removeHost(name: string): Promise<void> {
    if (jobs.size && [...jobs.values()].some((j) => j.host === name && ["running", "asking"].includes(j.state))) throw new HttpError(409, "A launch to it is going: wait for it to end.");
    await asked(() => engine.removeHost(hostsDir, name));
    forgetHostDeployments(c.db, name);
    c.changed();
  }

  // ---- what a launch needs ---------------------------------------------------------------------------------------------------------

  /**
   * The keys an app needs in a place and where each value comes from. The values never leave this function but in `values`.
   * `host`: the server meant; the one the place is deployed on holds what it was given before.
   */
  function keysOf(a: WebAppRow, env: string, host?: string, dir = a.folder): { list: LaunchKey[]; values: Record<string, string> } {
    const contract = contractOf(dir);
    if (!contract) return { list: [], values: {} };
    const saved = c.values(a, env);
    const values = Object.fromEntries(contract.keys.filter((k) => k.from.toLowerCase() !== "made" && saved[k.name]).map((k) => [k.name, saved[k.name]]));
    const d = getDeployment(c.db, a.id, env);
    const held = d && (!host || d.host === host) ? new Set(contract.keys.map((k) => k.name)) : new Set<string>();
    if (d && (!host || d.host === host) && contract.env.secret) held.add(contract.env.secret);
    const list = engine.keyStates(contract, values, held).flatMap((k): LaunchKey[] => (k.state === "unset" ? [] : [{ name: k.name, state: k.state === "given" ? "vault" : k.state, why: k.why }]));
    return { list, values };
  }

  /** What a launch would build the app with, or why it cannot be built. */
  function buildOf(a: WebAppRow): { ok: boolean; say: string } | undefined {
    const contract = contractOf(a.folder);
    if (!contract) return undefined;
    try {
      const x = engine.dockerfileFor(a.folder, contract);
      return { ok: x.ok, say: x.say };
    } catch (e) {
      return { ok: false, say: (e as Error).message };
    }
  }

  // ---- launching --------------------------------------------------------------------------------------------------------------------

  const id8 = () => `${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "").replace("T", "-")}-${Math.random().toString(36).slice(2, 6)}`;
  const current = (app: string) => jobs.get(app) ?? null;
  const busy = (app: string) => ["running", "asking"].includes(current(app)?.state ?? "");

  function ask(a: WebAppRow, job: LaunchJob, q: LaunchAsk): Promise<{ override?: string[]; cancel?: boolean }> {
    job.state = "asking";
    job.ask = q;
    c.changed();
    return new Promise((resolve) => {
      waiting.set(a.id, (v) => {
        job.state = "running";
        delete job.ask;
        waiting.delete(a.id);
        c.changed();
        resolve(v);
      });
    });
  }

  function answer(a: WebAppRow, v: { override?: string[]; cancel?: boolean }): LaunchJob {
    const w = waiting.get(a.id);
    const job = current(a.id);
    if (!w || !job) throw new HttpError(409, "No launch of this app is waiting for an answer.");
    if (job.ask?.kind === "override") {
      const ids = new Set(job.ask.stops.map((s) => s.id));
      for (const id of v.override ?? []) if (!ids.has(id)) throw new HttpError(400, `“${id}” is not one of the lines that stopped the launch.`);
    }
    w(v);
    return job;
  }

  const stepInto = (job: LaunchJob) => (s: Step) => {
    const at = job.steps.find((x) => x.id === s.id);
    if (at) Object.assign(at, { state: s.state, ...(s.say ? { say: s.say } : {}), ...(s.details?.length ? { details: s.details.slice(-12) } : {}), ...(s.ms !== undefined ? { ms: s.ms } : {}) });
    c.changed();
  };
  const stepsOf = (ids: readonly string[]) => LAUNCH_STEPS.filter((s) => ids.includes(s.id)).map((s) => ({ id: s.id, title: s.title, state: "waiting" as const }));

  /** The commit's files in a folder of the launch's own: never the folder being edited. */
  async function takeCommit(a: WebAppRow, commit: string, dir: string, env: Record<string, string>) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const tar = `${dir}.tar`;
    const g = await runProc("git", ["--no-optional-locks", "-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", "-c", "safe.directory=*", "archive", "--format=tar", "-o", tar, commit], { cwd: a.folder, env, nice: false, timeoutMs: 120_000 });
    if (g.code !== 0) throw new Error(`The commit could not be taken out of the app's repository: ${g.tail.slice(-1).join(" ")}`);
    const x = await runProc("tar", ["-xf", tar, "-C", dir], { cwd: path.dirname(dir), env, nice: false, timeoutMs: 120_000 });
    fs.rmSync(tar, { force: true });
    if (x.code !== 0) throw new Error("The commit's files could not be put in the folder of the launch.");
  }

  /** The app's own smoke command, run here against the live address, in the sandbox, with no key. */
  const smokeRunner = (scratch: string): NonNullable<engine.LaunchOptions["smokeRunner"]> => async ({ line, dir, env, ca }) => {
    const home = path.join(scratch, "smoke-home");
    fs.mkdirSync(home, { recursive: true, mode: 0o700 });
    if (ca) fs.writeFileSync(path.join(home, "ca.pem"), ca);
    const node = nodeBin();
    const sb = c.sandbox !== false ? sandboxAvailable() : null;
    const given = buildEnv(node, home, { ...env, ...(ca ? { NODE_EXTRA_CA_CERTS: path.join(home, "ca.pem") } : {}) });
    const ran = await runSmoke(line, dir, given, sb?.kind === "bwrap" ? (argv) => [sb.bin, ...sandboxArgs({ bwrap: sb.bin, node, dir, write: [home], writeDir: false, argv })] : undefined);
    return { code: ran.code ?? 1, output: ran.code === null ? `${ran.tail.join("\n")}\nit did not finish in time` : ran.tail.join("\n") };
  };

  /** Starts a launch to a server and returns at once. What cannot work is refused before anything starts. */
  function launch(a: WebAppRow, b: { host: string; env?: string; address: string; override?: string[] }): LaunchJob {
    if (busy(a.id)) throw new HttpError(409, "A launch of this app is going: wait for it to end.");
    const env = checkEnv(b.env ?? "production");
    const shape = shapeOf(a.folder);
    if (!shape.ok) throw new HttpError(409, `Its hydor.json cannot be used yet: ${shape.problems.join(" ")}`);
    if (shape.signIn === "hydor") throw new HttpError(409, SERVER_NEEDS_ACCOUNTS);
    let address: string;
    let host: ReturnType<typeof engine.getHost>;
    try {
      address = engine.parseAddress(String(b.address)).origin;
      host = engine.getHost(hostsDir, b.host);
    } catch (e) {
      return http(e);
    }
    if (host.state !== "recorded") throw new HttpError(409, `The server ${host.name} is not recorded yet: compare its fingerprint and accept it first.`);
    const before = getDeployment(c.db, a.id, env);
    if (before && before.host !== host.name) throw new HttpError(409, `${env} of this app runs on the server ${before.host}. Take it off that server first (on its Launch tab), or launch to ${host.name} under another name for the place.`);
    const { list } = keysOf(a, env, host.name);
    const missing = list.filter((k) => k.state === "missing").map((k) => k.name);
    if (missing.length) throw new HttpError(409, `The app needs ${missing.length === 1 ? "a key" : "keys"} it does not have yet: ${missing.join(", ")}. Give ${missing.length === 1 ? "it" : "them"} first, for ${env}.`, { missing });
    const job: LaunchJob = { id: id8(), app: a.id, place: "server", action: "launch", env, host: host.name, address, state: "running", steps: stepsOf(LAUNCH_STEPS.map((s) => s.id)), startedAt: Date.now(), endedAt: null, overrides: [] };
    jobs.set(a.id, job);
    start(a, job, run(a, job, before?.name ?? deploymentName(a.slug, env), (b.override ?? []).map(String)));
    return job;
  }

  /** Follows a job's work to its end, whatever it throws. */
  function start(a: WebAppRow, job: LaunchJob, work: Promise<void>) {
    runs.set(
      a.id,
      work
        .catch((e) => {
          job.state = "failed";
          job.summary = job.summary ?? String((e as Error).message).slice(0, 800);
          job.problems = job.problems ?? [job.summary, ...(e instanceof Refused ? e.details : [])];
          if (e instanceof Refused && e.details[0] === "restoreData") (job.needsData = true), (job.problems = [job.summary]);
          for (const s of job.steps) if (s.state === "running") s.state = "failed";
        })
        .finally(() => {
          if (job.state === "running" || job.state === "asking") job.state = "failed";
          job.endedAt = Date.now();
          waiting.delete(a.id);
          runs.delete(a.id);
          c.changed();
        }),
    );
    c.changed();
  }

  async function run(a: WebAppRow, job: LaunchJob, name: string, wanted: string[]): Promise<void> {
    const g = procEnv(c.root, a.id);
    const scratch = path.join(c.root, a.id, "server");
    const dir = path.join(scratch, job.id);
    try {
      // The version being launched is a commit: nothing that was not saved goes live by accident.
      const dirty = await gitOut(a.folder, g, ["status", "--porcelain"]);
      if (dirty.ok && dirty.out) await saveStep(a.folder, "Before launching");
      const head = await gitOut(a.folder, g, ["rev-parse", "HEAD"]);
      if (!head.ok || !head.out) throw new Error("The app has no commit to launch (its folder is not a git repository with steps yet).");
      const commit = head.out;
      fs.mkdirSync(scratch, { recursive: true, mode: 0o700 });
      await takeCommit(a, commit, dir, g);
      const contract = contractOf(dir);
      if (!contract) throw new Error("The committed hydor.json cannot be read.");
      const { values } = keysOf(a, job.env, job.host, dir);
      // The group of each line, for the card that asks about the failed ones.
      const groups = new Map<string, CheckLine>();
      const check = async (): Promise<CheckOutcome> => {
        const lines = await c.check(a, dir, (what) => {
          const s = job.steps.find((x) => x.id === "check")!;
          s.say = what;
          c.changed();
        });
        for (const l of lines) groups.set(l.id, l);
        // Of the pages' lines only what could hurt someone stops a launch: the others are said on the Checks tab.
        return { lines: lines.map((l) => ({ id: l.id, title: l.title ?? l.id, state: l.state === "failed" && !stopsLaunch(l) ? "note" : l.state, text: l.text, ...(l.hint ? { hint: l.hint } : {}) })) };
      };
      const outcome = await engine.launch({
        ...place(job.host!, name),
        dir,
        contract,
        address: job.address!,
        keys: values,
        check,
        override: wanted,
        askOverride: async (stops) => {
          const step = job.steps.find((x) => x.id === "check")!;
          step.say = `${stops.length === 1 ? "A failed line stops" : `${stops.length} failed lines stop`} the launch: waiting for your answer. Nothing has been sent.`;
          const cards = stops.map((s): LaunchStop => {
            const l = groups.get(s.id);
            return { id: s.id, title: s.title, ...(l?.group ? { group: l.group } : {}), text: s.text, ...(s.hint ? { hint: s.hint } : {}), ...(l?.details?.length ? { details: l.details.slice(0, 3) } : {}) };
          });
          const v = await ask(a, job, { kind: "override", stops: cards });
          return v.cancel ? null : (v.override ?? null);
        },
        onStep: stepInto(job),
        commit,
        by: c.who().name,
        smokeRunner: smokeRunner(dir + "-run"),
      });
      finished(a, job, outcome, { name, commit });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(`${dir}-run`, { recursive: true, force: true });
      fs.rmSync(`${dir}.tar`, { force: true });
    }
  }

  /** What a launch or a way back came to: said in the job, and kept. */
  function finished(a: WebAppRow, job: LaunchJob, o: LaunchOutcome, kept: { name: string; commit?: string }) {
    job.summary = o.summary;
    job.problems = o.problems;
    job.notes = o.notes;
    job.downtimeSeconds = o.downtimeSeconds;
    job.previousBack = o.previousBack;
    job.overrides = o.overrides.length ? o.overrides : job.overrides;
    for (const s of o.steps) stepInto(job)(s);
    const commit = o.record?.commit ?? kept.commit ?? "";
    if (o.record) {
      const r = o.record;
      const record: LaunchRecord = { ...recordOf(a, job.env, r), id: job.id, commit, by: r.by ?? c.who().name, remote: r.id };
      saveLaunch(c.db, record);
      job.record = record.id;
    }
    // Remembered when something is live there now: a launch that failed leaves what was remembered as it was.
    if (o.result === "live" || o.result === "unfinished") {
      saveDeployment(c.db, { app: a.id, env: job.env, host: job.host!, name: kept.name, address: o.address, commit, at: Date.now() });
      c.launched?.(a);
    }
    // The job ends only now: whoever sees it done finds the record kept.
    job.state = o.ok ? "done" : "failed";
  }

  const recordOf = (a: WebAppRow, env: string, r: RemoteRecord): LaunchRecord => ({
    id: `server-${r.id}`,
    app: a.id,
    place: "server",
    env,
    host: r.host,
    address: r.address,
    commit: r.commit ?? "",
    ...(r.version ? { version: r.version } : {}),
    by: r.by ?? "",
    at: Date.parse(r.at) || 0,
    ms: r.ms,
    result: r.action === "rollback" && r.result === "live" ? "back" : r.result === "live" ? "live" : r.result === "rolled-back" ? "rolled-back" : "failed",
    overrides: r.overrides,
    downtimeSeconds: r.downtimeSeconds,
    ...(r.said ? { summary: r.said } : r.result === "unfinished" ? { summary: "Live, but no backup that reads back was made." } : {}),
    remote: r.id,
  });

  /** The server's own history of a place, with what Hydor keeps of the same launches; Hydor's alone when the server cannot say. */
  async function history(a: WebAppRow, env: string): Promise<LaunchRecord[]> {
    const own = listLaunches(c.db, a.id, { place: "server", env });
    const d = getDeployment(c.db, a.id, env);
    if (!d) return own;
    const there = await engine.history(place(d.host, d.name)).catch(() => []);
    const merged = there.map((r) => own.find((x) => x.remote === r.id) ?? recordOf(a, env, r));
    for (const x of own) if (!merged.includes(x)) merged.push(x);
    return merged.sort((x, y) => y.at - x.at);
  }

  /** Back to the launch before; with `restoreDatabase` also the data as it was before the launch being undone (what was written since is lost). */
  function back(a: WebAppRow, b: { env?: string; restoreDatabase?: boolean }): LaunchJob {
    if (busy(a.id)) throw new HttpError(409, "A launch of this app is going: wait for it to end.");
    const env = checkEnv(b.env ?? "production");
    const { d, p } = placeOf(a, env);
    const job: LaunchJob = { id: id8(), app: a.id, place: "server", action: "back", env, host: d.host, address: d.address, state: "running", steps: stepsOf(["switch", "ready", "smoke", "record"]), startedAt: Date.now(), endedAt: null };
    jobs.set(a.id, job);
    start(
      a,
      job,
      engine.rollback({ ...p, restoreData: b.restoreDatabase === true, onStep: stepInto(job), by: c.who().name }).then((o) => {
        // The commit of what is live again, from the launch of it Hydor keeps.
        const was = listLaunches(c.db, a.id, { place: "server", env }).find((r) => r.remote === o.id);
        finished(a, job, o, { name: d.name, commit: was?.commit });
      }),
    );
    return job;
  }

  /** Stops the app on the server and takes its containers away; its data, keys and backups stay there. */
  async function takeDown(a: WebAppRow, env: string): Promise<{ summary: string }> {
    if (busy(a.id)) throw new HttpError(409, "A launch of this app is going: wait for it to end.");
    const { p } = placeOf(a, env);
    const r = await asked(engine.takeDown(p));
    removeDeployment(c.db, a.id, env);
    c.changed();
    return r;
  }

  // ---- running it ---------------------------------------------------------------------------------------------------------------------

  /** Is it up: what the server says, and its real address. */
  async function status(a: WebAppRow, env: string): Promise<RunStatus> {
    const { d, p } = placeOf(a, env);
    let s: Awaited<ReturnType<typeof engine.status>>;
    try {
      s = await engine.status(p);
    } catch (e) {
      return { place: env, kind: "server", up: null, say: (e as Error).message, problem: (e as Error).message, address: d.address, host: d.host };
    }
    return {
      place: env,
      kind: "server",
      host: d.host,
      up: s.up,
      say: [s.say, s.errors === null && s.logSay ? s.logSay : ""].filter(Boolean).join(" "),
      ...(s.version ? { version: s.version } : {}),
      since: s.since,
      lastLaunch: s.lastLaunch ? { at: s.lastLaunch.at, result: s.lastLaunch.result } : null,
      lastBackup: s.lastBackup,
      disk: { freeGb: s.disk.freeGb, say: s.disk.say },
      ...(s.errors !== null ? { errors: s.errors } : {}),
      ...(s.requests !== null ? { requests: s.requests } : {}),
      address: s.address ?? d.address,
      services: s.services,
      schedule: s.schedule,
      ...(s.problems[0] ? { problem: s.problems[0] } : {}),
    };
  }

  /** The app's own lines (or Caddy's, or the backups'), keys hidden. */
  function logs(a: WebAppRow, env: string, o: { since?: string; tail?: number; service?: string; errors?: boolean } = {}): Promise<string[]> {
    const { p } = placeOf(a, env);
    return asked(engine.logs(p, { since: o.since, tail: o.tail, service: o.service as engine.LogsOptions["service"], errorsFirst: o.errors }));
  }

  const restart = async (a: WebAppRow, env: string): Promise<{ ok: boolean; summary: string; details?: string[] }> => asked(engine.restart(placeOf(a, env).p));

  const checkBackup = (id: string) => {
    if (!BACKUP_ID.test(id)) throw new HttpError(400, "That is not a backup's id.");
  };
  const backups = {
    async list(a: WebAppRow, env: string): Promise<{ backups: RunBackup[]; schedule: { at: string; keepDays: number } | null }> {
      return asked(engine.backups.list(placeOf(a, env).p));
    },
    async now(a: WebAppRow, env: string): Promise<{ backup: RunBackup | null; verified: boolean; summary: string }> {
      const r = await asked(engine.backups.now(placeOf(a, env).p));
      if (!r.verified) throw new HttpError(502, r.problems[0] ?? "The backup could not be read back, so it does not count.");
      return { backup: r.backup, verified: r.verified, summary: r.summary };
    },
    async restore(a: WebAppRow, env: string, id: string): Promise<{ safety: string | null; summary: string }> {
      checkBackup(id);
      return asked(engine.backups.restore(placeOf(a, env).p, id, { yes: true }));
    },
    async schedule(a: WebAppRow, env: string, o: { at?: string; keepDays?: number }): Promise<{ at: string; keepDays: number } | null> {
      return asked(engine.backups.schedule(placeOf(a, env).p, o));
    },
    /** Copies one backup into a folder of Hydor's (for the person to download). */
    async pull(a: WebAppRow, env: string, id: string, to: string): Promise<string> {
      checkBackup(id);
      fs.mkdirSync(to, { recursive: true, mode: 0o700 });
      return (await asked(engine.backups.pull(placeOf(a, env).p, id, to))).file;
    },
  };

  return {
    hostsDir,
    listHosts,
    addHost,
    connect,
    accept,
    checkHost,
    removeHost,
    keysOf,
    buildOf,
    launch,
    answer,
    back,
    takeDown,
    history,
    status,
    logs,
    restart,
    backups,
    deployments: (a: WebAppRow) => listDeployments(c.db, a.id),
    job: current,
    async settled(id: string, ms = 60 * 60_000): Promise<void> {
      const p = runs.get(id);
      if (p) await Promise.race([p, sleep(ms)]);
    },
    /** The app is removed: a launch waiting for an answer is told to stop. What runs on a server keeps running. */
    forget(id: string) {
      waiting.get(id)?.({ cancel: true });
      jobs.delete(id);
      waiting.delete(id);
    },
  };
}
export type ServerOps = ReturnType<typeof createServerOps>;
