// Launching an app inside this Hydor, as one job with named steps the page shows as they end. After the first launch an app has two
// sides that run at the same time:
//   - **the launched version**: what you use (inside Hydor only the owner is signed in to it). Always the production run of the launched
//     commit, built from a checkout of that commit in a folder of its own (<data>/webapps/<id>/live/releases/<launch>/), with a data folder
//     of its own (<data>/webapps/<id>_live/data: the host's folder for it, kept between versions);
//   - **the one being changed**: Preview, the app's development command (or its production one) on its own folder with its own data. Editing
//     it never changes what people use, until **Launch again**.
// The previous launch's build is kept (and the backup taken just before it was replaced) so that **Back to the launch before** has something to
// go back to. What stops a launch is Hydor's check of the contract (contract-check.ts), run on the commit; a database that is a SQLite file is
// copied while it runs, and otherwise the app is stopped while its data folder is copied.
import fs from "node:fs";
import path from "node:path";
import type { CheckLine, LaunchAsk, LaunchJob, LaunchRecord, LaunchStep, LaunchStop, RunBackup } from "../../shared/webapps.ts";
import { count, stopsLaunch } from "../../shared/webapps.ts";
import { HttpError } from "../auth.ts";
import type { DB } from "../db.ts";
import type { Host, HostedApp } from "./host.ts";
import { asRunBackup, isBackupId, listBackupRecords, makeBackup, pruneBackups, restoreBackup, verifyBackup } from "./backups.ts";
import { refusedSay, runBoxed } from "./build-box.ts";
import { getLaunch, listLaunches, liveOf, saveLaunch, setLive } from "./launch-store.ts";
import { runProc } from "./proc.ts";
import { sandboxAvailable } from "../agent/sandbox.ts";
import { runSmoke } from "./contract-check.ts";
import { buildEnv, nodeBin, sandboxArgs } from "./run-app.ts";
import { shapeOf, type AppShape } from "./shape.ts";
import { PERSON_HEADER, signPerson } from "./sign.ts";
import { saveStep } from "./steps.ts";
import type { WebAppRow } from "./store.ts";

type Json = Record<string, any>;

/** The steps of a launch inside Hydor, in order. */
export const HYDOR_STEPS: { id: string; title: string }[] = [
  { id: "install", title: "Take the commit" },
  { id: "build", title: "Run the app’s build" },
  { id: "check", title: "Check it: what its hydor.json says, and its pages" },
  { id: "data", title: "Give it a data folder of its own, and a backup of the one before" },
  { id: "start", title: "Start it" },
  { id: "ready", title: "Wait until it says it is ready" },
  { id: "smoke", title: "Look at it" },
  { id: "record", title: "Write the launch down" },
];
/** Lines of the check that nobody can let through: without them there is nothing to launch. */
const MUST = ["file", "build", "ready"];

/** The SQLite file of an app that can be copied while it runs, or null (its files are copied with it stopped). */
export const sqliteOf = (shape: Pick<AppShape, "database">): string | null => (shape.database?.sqlite ? shape.database.file : null);

export interface LaunchesCtx {
  db: DB;
  /** <data>/webapps */
  root: string;
  host: () => Host;
  changed: () => void;
  who: () => { id: string; name: string };
  /** The hosted app for the launched side: its id is `<id>_live`, its folder the release. */
  hostedLive: (a: WebAppRow, dir: string) => HostedApp;
  /** For tests: called at the start of each step, and may throw to make it fail. */
  inject?: (step: string, job: LaunchJob) => void | Promise<void>;
  /** Values for the app's environment by name (the keys the hydor environment names, from the vault): given to its process only. */
  keys?: (a: WebAppRow) => Record<string, string>;
  /** Hydor's check of the contract, run on a folder that is already built. */
  checkContract?: (a: WebAppRow, dir: string) => Promise<CheckLine[]>;
  /** A version is live: the app is launched. */
  launched?: (a: WebAppRow) => void;
  /** The host runs apps in a sandbox, so installs and builds run in one (build-box.ts). Left out: they do. */
  sandbox?: boolean;
}

export const liveIdOf = (id: string) => `${id}_live`;
export const baseIdOf = (id: string) => id.replace(/_live$/, "");
const liveFolder = (root: string, id: string) => path.join(root, id, "live");
export const releasesOf = (root: string, id: string) => path.join(liveFolder(root, id), "releases");
export const backupsOf = (root: string, id: string) => path.join(liveFolder(root, id), "backups");
/** The data folder of the launched side: the host's own folder for its id. */
export const liveData = (root: string, id: string) => path.join(root, liveIdOf(id), "data");
export const releaseDir = (root: string, id: string, launch: string) => path.join(releasesOf(root, id), launch);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const rec = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const say1 = (v: unknown, n = 300) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

class Stop extends Error {}

/** A clean environment for git, npm and the app's own scripts (never Hydor's). */
export function procEnv(root: string, id: string, extra: Record<string, string> = {}): Record<string, string> {
  const home = path.join(root, id, "home");
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  const node = fs.realpathSync(process.execPath);
  const out: Record<string, string> = {
    PATH: `${path.dirname(node)}:/usr/local/bin:/usr/bin:/bin`,
    HOME: home,
    CI: "1",
    NO_COLOR: "1",
    LANG: "C.UTF-8",
    GIT_TERMINAL_PROMPT: "0",
    npm_config_update_notifier: "false",
    npm_config_fund: "false",
    npm_config_audit: "false",
    ...extra,
  };
  for (const k of ["HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy", "npm_config_registry", "NPM_CONFIG_REGISTRY", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "TMPDIR"]) if (process.env[k]) out[k] = process.env[k]!;
  return out;
}

// --no-optional-locks: a look (status, rev-list) never takes git's index lock, which a step being saved at the same moment needs.
const GIT = ["--no-optional-locks", "-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", "-c", "safe.directory=*"];

export async function gitOut(folder: string, env: Record<string, string>, args: string[]): Promise<{ ok: boolean; out: string }> {
  const r = await runProc("git", [...GIT, ...args], { cwd: folder, env, capture: 4 * 1024 * 1024, nice: false, timeoutMs: 60_000 });
  return { ok: r.code === 0, out: r.stdout.trim() };
}

export function createLaunches(c: LaunchesCtx) {
  const jobs = new Map<string, LaunchJob>();
  const waiting = new Map<string, (answer: { override?: string[]; cancel?: boolean }) => void>();
  const runs = new Map<string, Promise<void>>();

  const id8 = () => `${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "").replace("T", "-")}-${Math.random().toString(36).slice(2, 6)}`;

  /** Whether a release folder holds something that can be run. */
  const runnable = (dir: string): boolean => shapeOf(dir).ok;

  /** The launched side of an app: the current launch's record and release folder, when it is there. */
  function live(a: WebAppRow): { record: LaunchRecord; dir: string } | null {
    const cur = liveOf(c.db, a.id).current;
    if (!cur) return null;
    const dir = releaseDir(c.root, a.id, cur.id);
    return runnable(dir) ? { record: cur, dir } : null;
  }

  const stepsFor = (): LaunchStep[] => HYDOR_STEPS.map((s) => ({ ...s, state: "waiting" as const }));
  const current = (id: string) => jobs.get(id) ?? null;

  /** Waits until the live side answers its ready address, up to `ms`; what it said when it did not. */
  async function waitReady(dir: string, port: number, ms = 60_000): Promise<{ ok: boolean; said: string }> {
    const at = shapeOf(dir).ready;
    const end = Date.now() + ms;
    let said = "it did not answer";
    for (;;) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}${at}`, { redirect: "manual", signal: AbortSignal.timeout(3000) });
        const t = (await r.text()).slice(0, 300);
        if (r.status >= 200 && r.status < 400) return { ok: true, said: `${at} answers ${r.status}` };
        said = `answered ${r.status}: ${say1(t, 160)}`;
      } catch (e) {
        said = (e as Error).message;
      }
      if (Date.now() > end) return { ok: false, said };
      await sleep(400);
    }
  }

  /** The page at `/`, a hop or two of redirect inside the app followed; its words. */
  async function home(port: number, headers: Record<string, string>): Promise<{ status: number; page: string }> {
    const base = `http://127.0.0.1:${port}`;
    let url = `${base}/`;
    for (let hop = 0; hop < 3; hop++) {
      const r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8000), headers: { accept: "text/html", ...headers } });
      if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
        url = new URL(r.headers.get("location")!, url).toString();
        if (!url.startsWith(base)) throw new Error("The home page sends people to another address.");
        continue;
      }
      return { status: r.status, page: await r.text() };
    }
    return { status: 310, page: "" };
  }

  /** The app's own smoke test (hydor.json `smoke`), against the launched version: a command in the sandbox, or one request. */
  async function ownSmoke(port: number, dir: string, shape: AppShape, headers: Record<string, string>): Promise<string> {
    const t = shape.file?.smoke;
    if (!t) return "";
    const address = `http://127.0.0.1:${port}`;
    if (typeof t === "string") {
      const home = fs.mkdtempSync(path.join(c.root, "smoke-"));
      try {
        const node = nodeBin();
        const sb = c.sandbox !== false ? sandboxAvailable() : null;
        const env = buildEnv(node, home, { SMOKE_URL: address, ...(shape.vars.url ? { [shape.vars.url]: address } : {}) });
        const ran = await runSmoke(t, dir, env, sb?.kind === "bwrap" ? (argv) => [sb.bin, ...sandboxArgs({ bwrap: sb.bin, node, dir, write: [home], writeDir: false, argv })] : undefined);
        if (ran.code !== 0) throw new Error(`Its own smoke test (${t}) failed: ${say1(ran.tail.slice(-3).join(" "), 400) || "it did not finish in time"}`);
        return " Its own smoke test passed.";
      } finally {
        fs.rmSync(home, { recursive: true, force: true });
      }
    }
    const r = await fetch(`${address}${t.path}`, {
      method: t.method,
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: { ...headers, origin: address, "sec-fetch-site": "same-origin", ...(t.body !== undefined ? { "content-type": "application/json" } : {}) },
      ...(t.body !== undefined && t.method !== "GET" ? { body: typeof t.body === "string" ? t.body : JSON.stringify(t.body) } : {}),
    });
    await r.arrayBuffer().catch(() => {});
    if (r.status < 200 || r.status >= 400) throw new Error(`Its own smoke request (${t.method} ${t.path}) was answered ${r.status}.`);
    return ` Its own smoke request (${t.method} ${t.path}) was answered ${r.status}.`;
  }

  /** The smoke: the app's home page, as the person who launched it would get it. */
  async function smoke(a: WebAppRow, port: number, dir: string): Promise<string> {
    const shape = shapeOf(dir);
    const headers: Record<string, string> = shape.signIn === "hydor" ? { [PERSON_HEADER]: signPerson({ ...c.who(), role: "owner" }, c.host().secret(liveIdOf(a.id))) } : {};
    const r = await home(port, headers);
    if (r.status >= 400) throw new Error(`The home page answered ${r.status}.`);
    const said = shape.ready === "/" ? "The home page answered." : `${shape.ready} and the home page answered.`;
    return said + (await ownSmoke(port, dir, shape, headers));
  }

  /** A backup of the launched data: copied while it runs when its database is SQLite, else with it stopped for the copy and started again. */
  async function copyData(a: WebAppRow, dir: string, o: { label: string; launch?: string; stayStopped?: boolean }) {
    const data = liveData(c.root, a.id);
    const db = sqliteOf(shapeOf(dir));
    const out = backupsOf(c.root, a.id);
    if (db) return makeBackup(data, out, { label: o.label, launch: o.launch, db });
    const id = liveIdOf(a.id);
    const wasUp = c.host().status(id).state === "running" || c.host().status(id).state === "starting";
    const release = c.host().block(id);
    try {
      await c.host().stop(id);
      return await makeBackup(data, out, { label: o.label, launch: o.launch, db: null, stopped: true });
    } finally {
      release();
      // Started again when it was running: whoever asks meanwhile waited for this.
      if (wasUp && !o.stayStopped) await c.host().ensure(c.hostedLive(a, dir)).catch((e) => console.warn(`[webapps] ${a.slug} did not start again after its backup: ${(e as Error).message}`));
    }
  }

  /** Starts a launch inside Hydor and returns at once with the job. */
  function start(a: WebAppRow, body: { override?: string[] } = {}): LaunchJob {
    if (current(a.id)?.state === "running" || current(a.id)?.state === "asking") throw new HttpError(409, "A launch of this app is going: wait for it to end.");
    const shape = shapeOf(a.folder);
    if (!shape.ok) throw new HttpError(409, `Its hydor.json cannot be used yet: ${shape.problems.join(" ")}`);
    const job: LaunchJob = { id: id8(), app: a.id, place: "hydor", action: "launch", env: "hydor", state: "running", steps: stepsFor(), startedAt: Date.now(), endedAt: null, overrides: [] };
    jobs.set(a.id, job);
    const wanted = (body.override ?? []).map(String);
    runs.set(
      a.id,
      run(a, job, wanted).catch((e) => {
        job.state = "failed";
        job.summary = job.summary ?? (e as Error).message;
        job.endedAt = Date.now();
      }).finally(() => {
        runs.delete(a.id);
        c.changed();
      }),
    );
    c.changed();
    return job;
  }

  async function run(a: WebAppRow, job: LaunchJob, wanted: string[]): Promise<void> {
    const t0 = Date.now();
    const env = procEnv(c.root, a.id);
    const liveId = liveIdOf(a.id);
    const releases = releasesOf(c.root, a.id);
    const dir = releaseDir(c.root, a.id, job.id);
    const before = liveOf(c.db, a.id);
    let commit = "";
    let startedNew = false;
    let preBackup: string | undefined;
    const step = async (id: string, fn: () => Promise<string | void>) => {
      const s = job.steps.find((x) => x.id === id)!;
      s.state = "running";
      c.changed();
      const t = Date.now();
      try {
        await c.inject?.(id, job);
        const text = await fn();
        s.state = "passed";
        if (text) s.say = text;
      } catch (e) {
        s.state = "failed";
        s.say = e instanceof Stop ? e.message : say1((e as Error).message, 600);
        throw e;
      } finally {
        s.ms = Date.now() - t;
        c.changed();
      }
    };
    const fail = (text: string): never => {
      throw new Stop(text);
    };
    try {
      // The version being launched is a commit: nothing that was not saved goes live by accident.
      const dirty = await gitOut(a.folder, env, ["status", "--porcelain"]);
      if (dirty.ok && dirty.out) {
        await saveStep(a.folder, "Before launching");
      }
      const head = await gitOut(a.folder, env, ["rev-parse", "HEAD"]);
      if (!head.ok || !head.out) fail("The app has no commit to launch (its folder is not a git repository with steps yet).");
      commit = head.out;

      /** The commit's files, in a folder of this launch's own. */
      const takeCommit = async () => {
        fs.mkdirSync(releases, { recursive: true, mode: 0o700 });
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        const tarFile = path.join(releases, `${job.id}.tar`);
        const g = await runProc("git", [...GIT, "archive", "--format=tar", "-o", tarFile, commit], { cwd: a.folder, env, nice: false, timeoutMs: 120_000 });
        if (g.code !== 0) fail(`The commit could not be taken out of the app's repository: ${say1(g.tail.slice(-1).join(" "))}`);
        const x = await runProc("tar", ["-xf", tarFile, "-C", dir], { cwd: releases, env, nice: false, timeoutMs: 120_000 });
        fs.rmSync(tarFile, { force: true });
        if (x.code !== 0) fail("The commit's files could not be put in the folder of the launch.");
      };
      /** The lines that stop a launch are put to the person, who may let some through (written down in the launch), unless none can be. */
      const letThrough = async (broke: CheckLine[]): Promise<Set<string>> => {
        const allowed = new Set<string>();
        for (const id of wanted) {
          // A line that did not stop it is refused: a typo lets nothing through.
          if (!broke.some((l) => l.id === id)) fail(`“${id}” did not fail in a way that stops a launch, so there is nothing to let through.`);
          allowed.add(id);
        }
        for (;;) {
          const open = broke.filter((l) => !allowed.has(l.id));
          if (!open.length) return allowed;
          const stops: LaunchStop[] = open.map((l) => ({ id: l.id, title: l.title ?? l.id, ...(l.group ? { group: l.group } : {}), text: l.text, ...(l.hint ? { hint: l.hint } : {}), ...(l.details?.length ? { details: l.details.slice(0, 3) } : {}) }));
          const answer = await ask(a, job, { kind: "override", stops });
          if (answer.cancel) fail(`The launch was stopped at the check (${open.map((l) => l.id).join(", ")} failed).`);
          for (const id of answer.override ?? []) if (open.some((l) => l.id === id)) allowed.add(id);
          if (!(answer.override ?? []).length) fail(`The launch was stopped at the check (${open.map((l) => l.id).join(", ")} failed).`);
        }
      };

      await step("install", async () => {
        await takeCommit();
        const shape = shapeOf(dir);
        if (!shape.ok) fail(`The committed hydor.json cannot be used: ${shape.problems.join(" ")}`);
        return `Commit ${commit.slice(0, 8)} is in a folder of its own.`;
      });
      await step("build", async () => {
        const shape = shapeOf(dir);
        if (!shape.build) return "It has nothing to build.";
        const home = path.join(c.root, a.id, "home");
        const b = await runBoxed({ dir, home, argv: ["/bin/sh", "-c", shape.build], env: buildEnv(nodeBin(), home), sandbox: c.sandbox, timeoutMs: 20 * 60_000 });
        if (b.code !== 0) fail(`Its build failed (${shape.build}): ${say1(b.tail.filter((l) => l.trim() && !l.startsWith("--- ")).slice(-3).join(" "), 400)}${b.refused.length ? ` ${refusedSay(b.refused)}` : ""}`);
        return `Built (${shape.build}).`;
      });
      // Built here and read-only from now: nothing the check wrote is left in it (it fails a line when the app writes there).
      await step("check", async () => {
        if (!c.checkContract) return "The check of the contract is not available here.";
        const lines = await c.checkContract(a, dir);
        // Of the pages' lines only what could hurt someone stops a launch; the rest is on the Checks tab.
        const broke = lines.filter(stopsLaunch);
        const hard = broke.filter((l) => MUST.includes(l.id));
        if (hard.length) fail(`There is nothing to launch yet: ${hard.map((l) => `${l.title ?? l.id}: ${l.text}`).join(" ")}`);
        const allowed = await letThrough(broke);
        job.overrides = [...allowed];
        const passed = lines.filter((l) => l.state === "passed").length;
        const untried = lines.filter((l) => l.state === "notRun").length;
        const shown = lines.filter((l) => l.state === "failed" && !stopsLaunch(l)).length;
        return `${count(passed, "line")} passed${allowed.size ? `, ${allowed.size} let through` : ""}${untried ? `, ${untried} could not be tried` : ""}${shown ? `; ${count(shown, "other thing")} to fix, on the Checks tab, which stop nothing` : ""}.`;
      });

      await step("data", async () => {
        const data = liveData(c.root, a.id);
        fs.mkdirSync(data, { recursive: true, mode: 0o700 });
        if (before.current && fs.readdirSync(data).length) {
          const b = await copyData(a, releaseDir(c.root, a.id, before.current.id), { label: "pre-launch", launch: job.id, stayStopped: true });
          preBackup = b.id;
          return `A data folder of its own, kept between versions; what the version before wrote is backed up first (${b.id}${b.stopped ? ", with it stopped for the copy" : ""}).`;
        }
        return "A data folder of its own, kept between versions (the first launch starts with nothing in it).";
      });

      let port = 0;
      await step("start", async () => {
        const h = c.host();
        // The version before is told to stop (SIGTERM, ten seconds to finish what it is answering), then the new one starts on the same data.
        await h.stop(liveId);
        startedNew = true;
        try {
          port = await h.ensure(c.hostedLive(a, dir));
        } catch (e) {
          fail(`The launched version did not start: ${say1((e as Error).message, 500)}`);
        }
        return "It runs with its production command on a port of its own, against its own data.";
      });

      await step("ready", async () => {
        const r = await waitReady(dir, port);
        if (!r.ok) fail(`It never said it was ready: ${r.said}`);
        return `${r.said}.`;
      });

      await step("smoke", () => smoke(a, port, dir));

      await step("record", async () => {
        const rec1: LaunchRecord = {
          id: job.id,
          app: a.id,
          place: "hydor",
          env: "hydor",
          commit,
          ...(pkgVersion(dir) ? { version: pkgVersion(dir) } : {}),
          by: c.who().name,
          at: Date.now(),
          ms: Date.now() - t0,
          result: "live",
          overrides: job.overrides ?? [],
          ...(preBackup ? { backup: preBackup } : {}),
          ...(before.current ? { previous: before.current.id } : {}),
          summary: "Launched inside this Hydor.",
        };
        saveLaunch(c.db, rec1);
        setLive(c.db, a.id, rec1.id, before.current?.id ?? null);
        job.record = rec1.id;
        c.launched?.(a);
        // What is older than the version before goes (its checkout and build), and the app is marked as launched.
        if (fs.existsSync(releases)) for (const n of fs.readdirSync(releases)) if (n !== rec1.id && n !== before.current?.id) fs.rmSync(path.join(releases, n), { recursive: true, force: true });
        return `Launch ${rec1.id}: commit ${commit.slice(0, 8)}, by ${rec1.by}, in ${Math.round(rec1.ms / 1000)} s.`;
      });
      job.state = "done";
      job.summary = `Launched: this version is what you open from now on. What you change from now on is the version being changed, in Preview, with data of its own, until you launch again.`;
    } catch (e) {
      const msg = e instanceof Stop ? e.message : say1((e as Error).message, 600);
      job.problems = [msg];
      // From the start of the new version on, the one before is put back by itself (and its data, when the new one had changed the database).
      if (startedNew) {
        const notes: string[] = [];
        try {
          await c.host().stop(liveId);
          if (before.current && live(a)) {
            const prevDir = releaseDir(c.root, a.id, before.current.id);
            const p = await c.host().ensure(c.hostedLive(a, prevDir));
            const r = await waitReady(prevDir, p, 30_000);
            job.previousBack = r.ok;
            notes.push(r.ok ? "The version before is back and answering." : `The version before was started again but says: ${r.said}.`);
          } else notes.push("There was no version before (this was the first launch): nothing is running.");
        } catch (e2) {
          notes.push(`Putting the version before back failed: ${say1((e2 as Error).message, 200)}`);
        }
        job.problems = [msg, ...notes];
      } else {
        job.problems = [msg, "Nothing that was running was touched."];
      }
      fs.rmSync(dir, { recursive: true, force: true });
      saveLaunch(c.db, { id: job.id, app: a.id, place: "hydor", env: "hydor", commit, by: c.who().name, at: Date.now(), ms: Date.now() - t0, result: startedNew && before.current ? "rolled-back" : "failed", overrides: job.overrides ?? [], summary: msg });
      job.summary = msg;
      // Failed only now, with the way back done and the record kept: whoever sees it failed finds all of that.
      job.state = "failed";
    } finally {
      job.endedAt = Date.now();
      waiting.delete(a.id);
      c.changed();
    }
  }

  const pkgVersion = (dir: string): string | undefined => {
    try {
      const v = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).version;
      return typeof v === "string" ? v : undefined;
    } catch {
      return undefined;
    }
  };

  /** Puts a question to the person, on a card, and waits for the answer. */
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

  // ---- the way back ---------------------------------------------------------------------------------------------------------------

  /** What a way back would do now, for the card. */
  function backPlan(a: WebAppRow): { ok: boolean; refuse?: string; target?: LaunchRecord } {
    const now = liveOf(c.db, a.id);
    if (!now.current) return { ok: false, refuse: "This app has not been launched inside Hydor." };
    if (!now.previous) return { ok: false, refuse: "There is no launch before this one to go back to." };
    if (!runnable(releaseDir(c.root, a.id, now.previous.id))) return { ok: false, refuse: "The build of the launch before is no longer there, so it cannot be put back." };
    return { ok: true, target: now.previous };
  }

  /** Back to the launch before, as a job. With `restoreDatabase` the data goes back from the backup taken just before the launch now live. */
  function back(a: WebAppRow, o: { restoreDatabase?: boolean } = {}): LaunchJob {
    if (current(a.id)?.state === "running" || current(a.id)?.state === "asking") throw new HttpError(409, "A launch of this app is going: wait for it to end.");
    const plan = backPlan(a);
    if (!plan.ok) throw new HttpError(409, plan.refuse ?? "It cannot go back.");
    const now = liveOf(c.db, a.id);
    if (o.restoreDatabase && !now.current!.backup) throw new HttpError(409, "There is no backup from before the launch now live, so the data cannot be put back.");
    const target = now.previous!;
    const job: LaunchJob = {
      id: id8(),
      app: a.id,
      place: "hydor",
      action: "back",
      env: "hydor",
      state: "running",
      steps: [
        { id: "backup", title: "Back up what the data is now", state: "waiting" },
        { id: "restore", title: "Put the data back from before the launch", state: "waiting" },
        { id: "start", title: "Start the launch before", state: "waiting" },
        { id: "ready", title: "Wait until it says it is ready", state: "waiting" },
      ],
      startedAt: Date.now(),
      endedAt: null,
    };
    jobs.set(a.id, job);
    const liveId = liveIdOf(a.id);
    const t0 = Date.now();
    void (async () => {
      const step = async (id: string, fn: () => Promise<string | void>, skip = false) => {
        const s = job.steps.find((x) => x.id === id)!;
        if (skip) {
          s.state = "skipped";
          return;
        }
        s.state = "running";
        c.changed();
        const t = Date.now();
        try {
          const text = await fn();
          s.state = "passed";
          if (text) s.say = text;
        } catch (e) {
          s.state = "failed";
          s.say = say1((e as Error).message, 400);
          throw e;
        } finally {
          s.ms = Date.now() - t;
          c.changed();
        }
      };
      try {
        const data = liveData(c.root, a.id);
        await c.host().stop(liveId);
        await step("backup", async () => `Backup ${(await makeBackup(data, backupsOf(c.root, a.id), { label: "before-back", launch: job.id, db: sqliteOf(shapeOf(releaseDir(c.root, a.id, now.current!.id))) })).id} (the data as it is now).`, !o.restoreDatabase);
        await step("restore", async () => {
          const r = await restoreBackup(data, backupsOf(c.root, a.id), now.current!.backup!);
          return `The data is as it was at ${r.id}.`;
        }, !o.restoreDatabase);
        let port = 0;
        await step("start", async () => {
          port = await c.host().ensure(c.hostedLive(a, releaseDir(c.root, a.id, target.id)));
        });
        await step("ready", async () => {
          const r = await waitReady(releaseDir(c.root, a.id, target.id), port);
          if (!r.ok) throw new Error(`It did not say it was ready: ${r.said}`);
          return r.said;
        });
        // Going back again goes forward: the two change places.
        setLive(c.db, a.id, target.id, now.current!.id);
        job.state = "done";
        job.summary = `Back to the launch before (commit ${target.commit.slice(0, 8)})${o.restoreDatabase ? ", with the data as it was just before the launch that was undone" : ""}. Going back again goes forward.`;
        job.record = target.id;
      } catch (e) {
        job.state = "failed";
        job.summary = say1((e as Error).message, 500);
        job.problems = [job.summary];
      } finally {
        job.endedAt = Date.now();
        void t0;
        c.changed();
      }
    })();
    c.changed();
    return job;
  }

  // ---- backups -------------------------------------------------------------------------------------------------------------------

  const backups = {
    list: (a: WebAppRow): RunBackup[] => listBackupRecords(backupsOf(c.root, a.id)).map(asRunBackup),
    async now(a: WebAppRow, label = "manual"): Promise<RunBackup> {
      const l = live(a);
      if (!l) throw new HttpError(409, "This app is not launched inside Hydor, so it has no launched data to back up.");
      return asRunBackup(await copyData(a, l.dir, { label }));
    },
    verify(a: WebAppRow, id: string) {
      if (!isBackupId(id)) throw new HttpError(400, "That is not a backup's id.");
      try {
        return verifyBackup(backupsOf(c.root, a.id), id);
      } catch (e) {
        throw new HttpError(404, (e as Error).message);
      }
    },
    /** Stops the launched app, puts the backup back, and starts it again: the app is down for those seconds. */
    async restore(a: WebAppRow, id: string): Promise<{ safety: string | null; ready: string }> {
      if (!isBackupId(id)) throw new HttpError(400, "That is not a backup's id.");
      const l = live(a);
      if (!l) throw new HttpError(409, "This app is not launched inside Hydor.");
      const out = backupsOf(c.root, a.id);
      if (!fs.existsSync(path.join(out, `${id}.tar.gz`))) throw new HttpError(404, `There is no backup called ${id}.`);
      // Nobody's visit starts it while its data is being put back.
      const release = c.host().block(liveIdOf(a.id));
      let r;
      try {
        await c.host().stop(liveIdOf(a.id));
        r = await restoreBackup(liveData(c.root, a.id), out, id);
      } finally {
        release();
        // It starts again either way: with the backup put back, or with its data as it was.
        await c.host().ensure(c.hostedLive(a, l.dir));
      }
      const port = c.host().status(liveIdOf(a.id)).port ?? 0;
      const ready = await waitReady(l.dir, port, 60_000);
      c.changed();
      return { safety: r.safety, ready: ready.ok ? "It is ready." : ready.said };
    },
    prune: (a: WebAppRow, keepDays: number) => pruneBackups(backupsOf(c.root, a.id), keepDays),
    file: (a: WebAppRow, id: string): string => {
      if (!isBackupId(id)) throw new HttpError(400, "That is not a backup's id.");
      const f = path.join(backupsOf(c.root, a.id), `${id}.tar.gz`);
      if (!fs.existsSync(f)) throw new HttpError(404, `There is no backup called ${id}.`);
      return f;
    },
  };

  return {
    start,
    answer,
    back,
    backPlan,
    job: current,
    live,
    backups,
    /** Resolves when the app's launch (if one goes) has ended. */
    async settled(id: string, ms = 60 * 60_000): Promise<void> {
      const p = runs.get(id);
      if (p) await Promise.race([p, sleep(ms)]);
      for (let i = 0; i < 400 && ["running", "asking"].includes(jobs.get(id)?.state ?? ""); i++) await sleep(100);
    },
    forget(id: string) {
      jobs.delete(id);
      waiting.delete(id);
    },
    history: (a: WebAppRow) => listLaunches(c.db, a.id, { place: "hydor" }),
    get: (id: string) => getLaunch(c.db, id),
  };
}
export type Launches = ReturnType<typeof createLaunches>;
