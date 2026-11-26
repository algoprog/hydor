// A launch to a server of the person's own, in the steps of LAUNCH_STEPS, and the way back.
//
// The source is sent and built into an image ON THE SERVER (the person may have no Docker here, and another kind of
// processor than the server); the compose project (the app, Caddy for https, the backup service) is written; what runs now
// is backed up; the new version replaces it; the launch waits for the app's ready address at its real address, looks at it,
// and makes a backup that is read back before the launch counts. If anything from the switch on goes wrong, the previous
// version is put back by itself, and its data too when the new version had changed it.
//
// Why the image is built on the server: the source is a few megabytes and an image hundreds, an image built here may not
// run there, and the build then has exactly the system the app runs on. The cost: the server needs about 1.5 GB of memory.
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import fs from "node:fs";
import path from "node:path";
import { BACKUP_PROGRAM } from "./backup-program.ts";
import { BACKUP_DOCKERFILE, caddyfile, composeFile, isLocalName } from "./compose.ts";
import { dockerfileFor } from "./dockerfile.ts";
import { judge, lookAt } from "./host-check.ts";
import { connectionOf } from "./hosts.ts";
import { envLine, envValue, gatherValues, keyStates, mask, secretValues, type Given } from "./keys.ts";
import { connectFor, PROBES, type Probes, type Target as WebTarget } from "./probe.ts";
import * as scripts from "./scripts.ts";
import { holdingValues, makeSourceTar, sourceFiles, sourceHash } from "./source.ts";
import { connectSsh, hostLabel, type Connect, type HostConnection, type Remote } from "./ssh.ts";
import { LAUNCH_STEPS, Refused, type CheckLine, type CheckOutcome, type LaunchOutcome, type RemoteContract, type RemoteRecord, type Step, type StepId } from "./types.ts";

/** Where something is on a server, and how to get there. */
export interface Place {
  /** The folder of the hosts (Hydor's data). */
  hostsDir: string;
  /** The host's name. */
  host: string;
  /** The deployment's name on the server: lower-case letters, digits and hyphens (an app's slug). */
  app: string;
  /** For tests: how a connection is made, and what looks at the live address. */
  connect?: Connect;
  probes?: Partial<Probes>;
}

/** Runs the app's smoke line against the live address; the caller says where and how (Hydor: in its sandbox). */
export type SmokeRunner = (o: { line: string; dir: string; env: Record<string, string>; ca?: string }) => Promise<{ code: number; output: string }>;

export interface LaunchOptions extends Place {
  /** The app's folder (sent as it is, less what must not travel). */
  dir: string;
  /** hydor.json as parsed. */
  contract: RemoteContract;
  /** https://app.example.com; a name ending in .localhost or .test to try it out. */
  address: string;
  /** Values of the keys hydor.json names, by name. */
  keys?: Record<string, string>;
  /** BACKUP_S3_*: a copy of every backup to S3-compatible storage. The app never sees them. */
  storage?: Record<string, string>;
  /** The contract check of the app (it builds and tries it): the lines of server/webapps/contract-check.ts. */
  check: () => Promise<CheckOutcome>;
  /** Check lines that failed and are let through (each is recorded). */
  override?: string[];
  /** Asked about failed lines not yet let through: the ids to let through, or null to stop. */
  askOverride?: (stops: CheckLine[]) => Promise<string[] | null>;
  onStep?: (step: Step) => void;
  /** Lines of progress (the server's build output), secrets hidden. */
  onLine?: (line: string) => void;
  /** The daily backup's time (UTC, HH:MM) and the days kept. Left out: what the server has, else 03:30 and 14. */
  backupAt?: string;
  keepDays?: number;
  /** Written in the record. */
  commit?: string;
  by?: string;
  smokeRunner?: SmokeRunner;
  /** For tests: DNS. */
  resolve?: (name: string) => Promise<string[]>;
  /** For tests: the clock of ids. */
  now?: () => Date;
}

/** What the server knows of a version: enough to run it again without the app's folder. */
export interface Live {
  id: string;
  image: string;
  version: string | null;
  at: string;
  address: string;
  ready: string;
  database: { file: string; sqlite: boolean } | null;
  /** The backup taken just before this version replaced the last one. */
  snapshot: string | null;
  /** The shape of the database while this version ran (null: no SQLite file). */
  schema: string | null;
}

export const NAME_PROBLEM = "A deployment's name is lower-case letters, digits and hyphens (like my-app).";
export function checkName(app: string): string {
  if (!scripts.DEPLOYMENT_NAME.test(app)) throw new Refused(NAME_PROBLEM, "input");
  return app;
}
export const projectOf = (app: string) => `hydor-${app}`;

/** The address people use: https, a name (and a port), no path. */
export function parseAddress(text: string): { origin: string; host: string } {
  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    throw new Refused("The address is a web address starting with https://, like https://app.example.com.", "input");
  }
  if (url.protocol !== "https:") throw new Refused("The address has to start with https:// (the server gets a certificate for it by itself).", "input");
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) throw new Refused(`The address is a name only, with no path: https://${url.host}`, "input");
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(url.hostname) || url.hostname === "localhost" || /^[\d.]+$/.test(url.hostname)) throw new Refused(`“${url.hostname}” cannot be the app's name. Use a name of your own (app.example.com), or one ending in .localhost or .test to try it out.`, "input");
  if (url.port && !isLocalName(url.hostname)) throw new Refused(`The address has no port: the server answers https on 443. Write https://${url.hostname}`, "input");
  return { origin: url.origin, host: url.hostname };
}

export function checkSchedule(at: string, keepDays: number): void {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(at)) throw new Refused("The time is HH:MM, in UTC (like 03:30).", "input");
  if (!Number.isInteger(keepDays) || keepDays < 1 || keepDays > 365) throw new Refused("Keep backups for a whole number of days, 1 to 365.", "input");
}

// ---- one change of a deployment at a time ------------------------------------------------------------------------------

const busy = new Set<string>();
/** Runs `work` while nothing else of this program changes that deployment. */
export async function alone<T>(p: Place, work: () => Promise<T>): Promise<T> {
  const key = `${path.resolve(p.hostsDir)}\0${p.host}\0${p.app}`;
  if (busy.has(key)) throw new Refused("Something else is changing this app on the server (a launch, a way back, a restore): wait for it to end.", "conflict");
  busy.add(key);
  try {
    return await work();
  } finally {
    busy.delete(key);
  }
}

// ---- reading what the server says --------------------------------------------------------------------------------------

export const kvOf = (text: string): Map<string, string> => {
  const out = new Map<string, string>();
  for (const line of text.split("\n")) {
    const m = /^([a-z_]+)=(.*)$/.exec(line);
    if (m) out.set(m[1]!, m[2]!);
  }
  return out;
};

export function jsonLine<T = Record<string, unknown>>(text: string): T | null {
  const lines = text.trim().split("\n");
  try {
    return JSON.parse(lines.at(-1) ?? "") as T;
  } catch {
    return null;
  }
}

export const parseLive = (text: string | undefined): Live | null => {
  if (!text?.trim()) return null;
  try {
    const j = JSON.parse(text) as Partial<Live>;
    if (!j.id || !j.image || !j.address || !j.ready) return null;
    return { id: j.id, image: j.image, version: j.version ?? null, at: j.at ?? "", address: j.address, ready: j.ready, database: j.database ?? null, snapshot: j.snapshot ?? null, schema: j.schema ?? null };
  } catch {
    return null;
  }
};

export interface ServerState {
  appKeys: Set<string>;
  backupKeys: Set<string>;
  current: Live | null;
  previous: Live | null;
  running: string[];
  backupAt: string | null;
  keepDays: number | null;
}

export function parseState(text: string): ServerState {
  const appKeys = new Set<string>();
  const backupKeys = new Set<string>();
  for (const line of text.split("\n")) {
    if (line.startsWith("app_key=") && line.length > 8) appKeys.add(line.slice(8));
    if (line.startsWith("backup_key=") && line.length > 11) backupKeys.add(line.slice(11));
  }
  const kv = kvOf(text);
  return {
    appKeys,
    backupKeys,
    current: parseLive(kv.get("current")),
    previous: parseLive(kv.get("previous")),
    running: (kv.get("running") ?? "").trim().split(/\s+/).filter(Boolean),
    backupAt: kv.get("backup_at")?.trim() || null,
    keepDays: Number(kv.get("keep_days")) || null,
  };
}

export const lastLines = (text: string, n: number): string[] =>
  text
    .trim()
    .split("\n")
    .filter((l) => l.trim())
    .slice(-n);
export const stampOf = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "").replace("T", "-");
const seconds = (since: number) => Math.round((Date.now() - since) / 100) / 10;
const count = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/** The values held on the server, to be hidden from anything shown. */
export async function heldSecrets(remote: Remote, app: string): Promise<string[]> {
  const r = await remote.run(scripts.heldScript(app), { timeoutMs: 60_000 });
  const values: Record<string, string> = {};
  let i = 0;
  for (const line of r.out.split("\n")) {
    const v = envValue(line);
    // The same name twice (the next file and the one in use) is kept twice.
    if (v) values[`${v.name}#${i++}`] = v.value;
  }
  return Object.entries(values)
    .filter(([name]) => !/(^|_)(PREFIX|BUCKET|REGION|ENDPOINT|HOST|USER|USERNAME)#\d+$/.test(name))
    .map(([, value]) => value);
}

/** What reaches the live address from here: the CA for a local name (read from the server) and where to connect. */
export async function webTarget(remote: Remote, host: HostConnection, app: string, address: string): Promise<WebTarget> {
  const name = new URL(address).hostname;
  if (!isLocalName(name)) return { address };
  const target: WebTarget = { address, connectTo: connectFor(address, host.address) };
  const ca = await remote.run(scripts.caRootScript(app), { timeoutMs: 90_000 });
  if (ca.code === 0 && ca.out.includes("BEGIN CERTIFICATE")) target.ca = ca.out.slice(ca.out.indexOf("-----BEGIN"));
  return target;
}

// ---- the steps ---------------------------------------------------------------------------------------------------------

class Stop extends Error {
  readonly details: string[];
  constructor(message: string, details: string[] = []) {
    super(message);
    this.details = details;
  }
}

class Steps {
  readonly list: Step[];
  secrets: string[] = [];
  failed: { id: StepId; say: string; details: string[] } | null = null;
  constructor(
    ids: readonly StepId[],
    private readonly onStep?: (step: Step) => void,
  ) {
    this.list = ids.map((id) => ({ ...LAUNCH_STEPS.find((s) => s.id === id)!, state: "waiting" as const }));
  }
  hide(text: string): string {
    return mask(text, this.secrets);
  }
  private get(id: StepId): Step {
    return this.list.find((s) => s.id === id)!;
  }
  private tell(step: Step): void {
    try {
      this.onStep?.({ ...step });
    } catch {
      /* the page that listens is not the launch's concern */
    }
  }
  /** Runs one step: it passes with what `work` returns, or fails with what it throws (and the launch stops). */
  async run(id: StepId, work: () => Promise<string | { say: string; details?: string[] }>): Promise<void> {
    const step = this.get(id);
    const start = Date.now();
    step.state = "running";
    this.tell(step);
    try {
      const out = await work();
      step.state = "passed";
      step.say = this.hide(typeof out === "string" ? out : out.say);
      if (typeof out !== "string" && out.details?.length) step.details = out.details.map((d) => this.hide(d));
    } catch (error) {
      const message = this.hide(error instanceof Error ? error.message : String(error));
      const details = (error instanceof Stop || error instanceof Refused ? error.details : []).map((d) => this.hide(d));
      step.state = "failed";
      step.say = message;
      if (details.length) step.details = details;
      this.failed = { id, say: message, details };
      throw error;
    } finally {
      step.ms = Date.now() - start;
      this.tell(step);
    }
  }
  skip(id: StepId, say: string): void {
    const step = this.get(id);
    step.state = "skipped";
    step.say = say;
    this.tell(step);
  }
}

/** The check's lines that nobody can let through: without them there is nothing to launch. */
export const MUST_PASS = ["file", "build", "ready"];

async function runCheck(o: LaunchOptions): Promise<{ say: string; overrides: string[] }> {
  const outcome = await o.check();
  const failed = outcome.lines.filter((l) => l.state === "failed");
  const hard = failed.filter((l) => MUST_PASS.includes(l.id));
  if (hard.length) throw new Stop(`There is nothing to launch yet: ${hard.map((l) => `${l.title}: ${l.text}`).join(" ")}`, hard.map((l) => l.hint ?? "").filter(Boolean));
  const allowed = new Set<string>();
  for (const id of o.override ?? []) {
    // A line that did not fail is refused: a typo lets nothing through.
    if (!failed.some((l) => l.id === id)) throw new Stop(`“${id}” did not fail, so there is nothing to let through.`);
    allowed.add(id);
  }
  for (;;) {
    const open = failed.filter((l) => !allowed.has(l.id));
    if (!open.length) break;
    const answer = await o.askOverride?.(open);
    const more = (answer ?? []).filter((id) => open.some((l) => l.id === id));
    if (!more.length) throw new Stop(`The check stopped the launch (${open.map((l) => l.id).join(", ")} failed). Nothing was sent.`, open.map((l) => `${l.title}: ${l.text}${l.hint ? ` To do: ${l.hint}` : ""}`));
    more.forEach((id) => allowed.add(id));
  }
  const passed = outcome.lines.filter((l) => l.state === "passed").length;
  const untried = outcome.lines.filter((l) => l.state === "notRun").length;
  return { say: `${count(passed, "line")} passed${allowed.size ? `; let through and recorded: ${[...allowed].join(", ")}` : ""}${untried ? `; ${untried} could not be tried` : ""}.`, overrides: [...allowed] };
}

const SIGN_IN =
  'This app lets Hydor say who is there ("signIn": "hydor"), and on a server of your own there is no Hydor to say it: nobody could use it. It runs inside Hydor; to run it on a server it needs accounts of its own ("signIn": "own").';

function packageVersion(dir: string): string | null {
  try {
    const v = (JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as { version?: unknown }).version;
    return typeof v === "string" && v.length <= 60 ? v : null;
  } catch {
    return null;
  }
}

const composeEnv = (p: { image: string; backupImage: string; id: string; at: string; keepDays: number }) =>
  ["# Written by Hydor at each launch; nothing here is a secret.", `HYDOR_IMAGE=${p.image}`, `HYDOR_BACKUP_IMAGE=${p.backupImage}`, `HYDOR_LAUNCH_ID=${p.id}`, `HYDOR_BACKUP_AT=${p.at}`, `HYDOR_BACKUP_KEEP_DAYS=${p.keepDays}`].join("\n");

export const backupImageTag = () => `hydor-backup:${createHash("sha256").update(BACKUP_DOCKERFILE).update(BACKUP_PROGRAM).digest("hex").slice(0, 12)}`;

/** Why an app did not come up, from what the switch printed. */
function whyNot(out: string, ready: string, hostVar: string): { say: string; details: string[] } {
  const kv = kvOf(out);
  const logs = out
    .split("\n")
    .filter((l) => l.startsWith("log: "))
    .map((l) => l.slice(5));
  const listening = jsonLine<string[]>(kv.get("listening") ?? "") ?? [];
  const probe = jsonLine<{ say?: string }>(kv.get("probe") ?? "")?.say;
  const gaveUp = kv.get("gave_up");
  let say = gaveUp ? `The new version did not become ready (${gaveUp}).` : "The new version did not start.";
  if (listening.some((l) => l.startsWith("this machine only")) && !listening.some((l) => l.startsWith("every address"))) {
    say += ` It listens on 127.0.0.1 only: on a server it has to listen on the address in ${hostVar}, or Caddy cannot reach it.`;
  } else if (gaveUp?.includes("fell over")) say += " Its last lines say why.";
  else if (probe) say += ` Asked for ${ready}: ${probe}.`;
  return { say, details: logs.length ? ["Its last lines:", ...logs] : lastLines(out, 12) };
}

export const failureOf = (out: string, err: string, n = 3) => lastLines(`${out}\n${err}`, n).join(" | ");

/** A version that is being left, with the shape its database had when it stopped. */
const withShape = (live: Live, mark: { schema: string } | null): Live => (live.database?.sqlite && mark?.schema ? { ...live, schema: mark.schema } : live);

interface Switched {
  mark: { schema: string; data: string } | null;
}

/** The switch itself, shared by a launch and a way back. */
async function doSwitch(remote: Remote, app: string, asked: scripts.SwitchAsked, ready: string, state: { switched: boolean; restored: string | null }, hostVar = "HOST"): Promise<Switched & { seconds: string }> {
  const r = await remote.run(scripts.switchScript(app, asked), { timeoutMs: (asked.waitSeconds + 600) * 1000 });
  const kv = kvOf(r.out);
  state.switched = kv.get("switched") === "1";
  state.restored = kv.get("restored") ?? null;
  const mark = jsonLine<{ schema: string; data: string }>(kv.get("mark") ?? "");
  if (kv.get("mark_failed")) throw new Stop("The data could not be read before the switch, so the version that was running was started again.", lastLines(r.out + r.err, 8));
  if (kv.get("restore_failed")) throw new Stop(`The backup could not be put back (${kv.get("restore_failed")}), so nothing was changed.`);
  if (r.code !== 0) {
    if (!state.switched) throw new Stop(`The switch did not happen: ${failureOf(r.out, r.err)}`);
    const why = whyNot(r.out, ready, hostVar);
    throw new Stop(why.say, why.details);
  }
  return { mark, seconds: kv.get("switch_seconds") ?? "?" };
}

/** After a switch that failed. Returns what to say about it. */
async function putBack(remote: Remote, app: string, asked: scripts.PutBackAsked): Promise<{ notes: string[]; back: boolean }> {
  const r = await remote.run(scripts.putBackScript(app, asked), { timeoutMs: 15 * 60_000 });
  const kv = kvOf(r.out);
  if (!asked.hadPrevious) return { notes: ["This was the first launch, so there is no earlier version to put back: the app was stopped and is not running."], back: false };
  const back = kv.get("previous_back") === "1";
  const notes: string[] = [];
  const restored = jsonLine<{ safety?: string | null }>(kv.get("data_restored") ?? "");
  const failed = kv.get("restore_failed");
  notes.push(back ? "The previous version is back and answering." : `The previous version was started again but does not answer: look at its log. ${failureOf(r.out, r.err)}`);
  if (restored) notes.push(`The new version had changed the data, so the data was put back as it was just before the switch: whatever was written while the new version was live is no longer in the app${restored.safety ? ` (it is kept in the backup ${restored.safety})` : ""}.`);
  else if (failed) notes.push(`The new version had changed the data, and it could NOT be put back: the previous version runs on the changed data. ${failed}`);
  else if (kv.get("data") === "unchanged") notes.push("The data is as it was: the new version had not changed it.");
  return { notes, back };
}

/** Starts a launch and returns how it ended. It never throws for a launch that fails: the outcome says why. */
export async function launch(o: LaunchOptions): Promise<LaunchOutcome> {
  checkName(o.app);
  const address = parseAddress(o.address);
  checkSchedule(o.backupAt ?? "03:30", o.keepDays ?? 14);
  return alone(o, () => launchNow(o, address));
}

async function launchNow(o: LaunchOptions, address: { origin: string; host: string }): Promise<LaunchOutcome> {
  const c = o.contract;
  const probes: Probes = { ...PROBES, ...o.probes };
  const started = Date.now();
  const now = (o.now ?? (() => new Date()))();
  const steps = new Steps(
    LAUNCH_STEPS.map((s) => s.id),
    o.onStep,
  );
  const notes: string[] = [];
  const problems: string[] = [];
  let remote: Remote | null = null;
  let host!: HostConnection;
  let state!: ServerState;
  let given!: Given;
  let overrides: string[] = [];
  let id: string | null = null;
  let image: string | null = null;
  const version = packageVersion(o.dir);
  let sent = false;
  let result: RemoteRecord["result"] = "failed";
  let downtime: number | null = null;
  let previousBack = false;
  let backup: LaunchOutcome["backup"] = null;
  let watcher: ReturnType<Probes["watchDowntime"]> | null = null;
  const sw = { switched: false, restored: null as string | null };
  let switchStarted = false;
  let configured = false;
  // The new version is up and passed its look: whatever goes wrong after that, it is what people are using.
  let looked = false;
  const stopWatching = async () => {
    if (!watcher) return;
    const seen = await watcher.stop();
    watcher = null;
    downtime = Math.round(((downtime ?? 0) + seen.seconds) * 10) / 10;
  };

  try {
    await steps.run("check", async () => {
      if (c.signIn === "hydor") throw new Stop(SIGN_IN);
      const checked = await runCheck(o);
      overrides = checked.overrides;
      return checked.say;
    });

    await steps.run("host", async () => {
      host = connectionOf(o.hostsDir, o.host);
      remote = (o.connect ?? connectSsh)(o.hostsDir, host);
      const seen = await lookAt(remote);
      const bad = judge(seen, projectOf(o.app)).filter((f) => f.ok === false);
      if (bad.length) throw new Stop(`The server ${o.host} is not ready: ${bad[0]!.say}`, [...bad.map((b) => b.say), "Check the server: on Debian and Ubuntu, “prepare” installs Docker and sets the firewall."]);
      return `${hostLabel(host)}: ${seen.os.name}, Docker ${seen.docker.server}, Compose ${seen.docker.compose}, ${seen.memoryMb} MB memory, ${seen.diskGb} GB disk.`;
    });
    const r = remote!;

    await steps.run("keys", async () => {
      given = gatherValues(c, o.keys, o.storage);
      steps.secrets = [...secretValues(given.app), ...secretValues(given.storage)];
      state = parseState((await r.run(scripts.stateScript(o.app), { timeoutMs: 90_000 })).out);
      const states = keyStates(c, given.app, state.appKeys);
      const missing = states.filter((k) => k.state === "missing");
      if (missing.length) throw new Stop(`The app needs ${missing.length === 1 ? "a key" : "keys"} that ${missing.length === 1 ? "has" : "have"} no value yet: ${missing.map((k) => k.name).join(", ")}.`, missing.map((k) => `${k.name}: ${k.why}`));
      if (given.unused.length) notes.push(`Not sent, because hydor.json does not name them: ${given.unused.join(", ")}.`);
      const part = (s: string, say: string) => {
        const names = states.filter((k) => k.state === s).map((k) => k.name);
        return names.length ? `${say}: ${names.join(", ")}` : "";
      };
      const parts = [part("given", "given now"), part("server", "already on the server"), part("made", "to be made there"), part("unset", "optional and not set")].filter(Boolean);
      return parts.length ? `${parts.join("; ")}.` : "The app needs no key.";
    });

    let target: WebTarget = { address: address.origin };
    await steps.run("address", async () => {
      if (/(^|\.)localhost$/i.test(address.host) && !/^(127\.[\d.]+|::1|localhost)$/.test(host.address)) {
        throw new Stop(`A name ending in .localhost always means this computer, and the server is ${host.address}: nothing could reach the app by it. To try a launch on a server without a name of your own, use one ending in .test.`);
      }
      if (isLocalName(address.host)) {
        target = { address: address.origin, connectTo: connectFor(address.origin, host.address) };
        return `${address.origin} is a name for trying out: Caddy signs it with its own certificate authority, which this computer trusts for its own looks only.`;
      }
      const resolve = o.resolve ?? (async (name: string) => (await lookup(name, { all: true })).map((a) => a.address));
      let found: string[] = [];
      try {
        found = await resolve(address.host);
      } catch {
        found = [];
      }
      if (!found.length) throw new Stop(`${address.host} does not resolve to any address yet. Make a DNS record for it that points at the server (${host.address}), wait until it spreads, and launch again: Caddy cannot get a certificate for a name that does not lead to the machine.`);
      if (/^[\d.]+$|:/.test(host.address) && !found.includes(host.address)) throw new Stop(`${address.host} points at ${found.join(", ")}, and the server is ${host.address}. Caddy cannot get a certificate for a name that leads somewhere else: change the DNS record, wait, and launch again.`);
      return `${address.host} points at ${found.join(", ")}.`;
    });

    let files: string[] = [];
    const extras = new Map<string, string>();
    await steps.run("files", async () => {
      const choice = dockerfileFor(o.dir, c);
      if (!choice.ok) throw new Stop(choice.say);
      files = await sourceFiles(o.dir, c);
      if (!files.length) throw new Stop("There is no file to send: the app's folder is empty, or everything in it is left out.");
      if (choice.text !== null) extras.set("Dockerfile", choice.text);
      else if (!files.includes("Dockerfile")) extras.set("Dockerfile", fs.readFileSync(path.join(o.dir, "Dockerfile"), "utf8"));
      const held = holdingValues(o.dir, files, steps.secrets);
      if (held.length) {
        const nameOf = (value: string) => Object.entries({ ...given.app, ...given.storage }).find(([, v]) => v === value)?.[0] ?? "a key";
        throw new Stop(`The value of ${nameOf(held[0]!.value)} is written in the app's file ${held[0]!.file}: take it out (the app reads it from its environment). Nothing was sent.`, held.map((h) => `${h.file} holds the value of ${nameOf(h.value)}`));
      }
      const services = Object.keys(c.services);
      if (services.length) notes.push(`The app asks Hydor for ${services.join(", ")}: on a server of your own there is no Hydor (it gets no HYDOR_URL), so those parts do not work unless the app carries on without them.`);
      if (!c.database?.sqlite) notes.push(`${c.database ? `Its database (${c.database.file}) is not a SQLite file` : "hydor.json names no database"}: the app is stopped while its data folder is copied, at each launch and each day.`);
      return `${count(files.length, "file")} go to the server. ${choice.say}`;
    });

    const hash = sourceHash(o.dir, files, extras).slice(0, 7);
    id = `${stampOf(now)}-${hash}`;
    image = `hydor-${o.app}:${id}`;
    const backupImage = backupImageTag();

    await steps.run("send", async () => {
      const tar = await makeSourceTar(o.dir, files, extras);
      try {
        sent = true;
        const out = await r.runWithFile(scripts.receiveScript(o.app, id!), tar.file, { timeoutMs: 10 * 60_000 });
        if (out.code !== 0 || !out.out.includes("received")) throw new Stop(`The source could not be put on the server: ${failureOf(out.out, out.err)}`);
        const size = tar.bytes < 1024 * 1024 ? `${Math.max(1, Math.round(tar.bytes / 1024))} KB` : `${(tar.bytes / 1024 / 1024).toFixed(1)} MB`;
        return `${size} sent to ~/${scripts.ROOT}/${o.app}/releases/${id}.`;
      } finally {
        fs.rmSync(tar.folder, { recursive: true, force: true });
      }
    });

    await steps.run("build", async () => {
      const t = Date.now();
      let partial = "";
      const lines = (text: string) => {
        const parts = (partial + text).split("\n");
        partial = parts.pop()!;
        for (const l of parts) o.onLine?.(steps.hide(l));
      };
      const out = await r.run(scripts.buildScript(o.app, id!), { timeoutMs: 30 * 60_000, onOutput: o.onLine ? lines : undefined });
      if (out.code !== 0) throw new Stop("The image could not be built on the server. The version that is running was not touched.", lastLines(out.out + out.err, 25));
      const built = await r.run(scripts.backupImageScript(o.app, backupImage, BACKUP_DOCKERFILE), { input: BACKUP_PROGRAM, timeoutMs: 20 * 60_000 });
      if (built.code !== 0) throw new Stop("The image of the backup service could not be built on the server. The version that is running was not touched.", lastLines(built.out + built.err, 15));
      return `Built ${image} in ${seconds(t)} seconds. Nothing is running from it yet.`;
    });

    const backupAt = o.backupAt ?? state.backupAt ?? "03:30";
    const keepDays = o.keepDays ?? state.keepDays ?? 14;
    const compose = composeFile({ project: projectOf(o.app), contract: c, address: address.origin });
    await steps.run("configure", async () => {
      const input = [...Object.entries(given.app).map(([k, v]) => `app:${envLine(k, v)}`), ...Object.entries(given.storage).map(([k, v]) => `backup:${envLine(k, v)}`)].join("\n");
      const made = keyStates(c, given.app, state.appKeys)
        .filter((k) => k.state === "made")
        .map((k) => k.name);
      configured = true;
      const out = await r.run(scripts.configureScript(o.app, { compose, caddyfile: caddyfile(address.host), env: composeEnv({ image: image!, backupImage, id: id!, at: backupAt, keepDays }) }, made), { input: `${input}\n`, timeoutMs: 90_000 });
      if (out.code !== 0) throw new Stop(`The server's files could not be written: ${failureOf(out.out, out.err)}`);
      const after = parseState(out.out);
      steps.secrets.push(...(await heldSecrets(r, o.app)));
      return `The compose file, Caddy's file and the key files are written (${count(after.appKeys.size + after.backupKeys.size, "key")} held, values never shown). Daily backup at ${backupAt} UTC, kept ${keepDays} days.`;
    });

    const hadPrevious = !!state.current;
    const serving = hadPrevious && state.running.includes("app");
    const previousSqlite = !!state.current?.database?.sqlite;
    // The downtime is measured where people are now; a launch that moves the app to another name has nothing to measure.
    const sameName = !!state.current && new URL(state.current.address).host === new URL(address.origin).host;
    if (serving && sameName) target = await webTarget(r, host, o.app, address.origin);
    const watch = () => {
      if (serving && sameName && !watcher && (!isLocalName(address.host) || target.ca)) watcher = probes.watchDowntime(target, state.current!.ready);
    };
    let snapshot: string | null = null;
    if (hadPrevious) {
      await steps.run("snapshot", async () => {
        if (!previousSqlite) watch();
        let out: Awaited<ReturnType<Remote["run"]>>;
        try {
          out = await r.run(previousSqlite ? scripts.snapshotScript(o.app) : scripts.snapshotStoppedScript(o.app), { timeoutMs: 20 * 60_000 });
        } catch (error) {
          // Stopped for the copy and the connection lost: it is started again if the server can still be reached.
          if (!previousSqlite) await r.run(scripts.startAgainScript(o.app), { timeoutMs: 120_000 }).catch(() => {});
          throw error;
        }
        const made = jsonLine<{ id: string }>(kvOf(out.out).get("snapshot") ?? "");
        if (out.code !== 0 || !made?.id) throw new Stop(`The version that is running could not be backed up, so nothing was changed: ${failureOf(out.out, out.err)}`);
        snapshot = made.id;
        return `Backed up as ${snapshot}${previousSqlite ? ", while it runs" : ", with the app stopped for the copy"}.`;
      });
    } else steps.skip("snapshot", "Nothing was launched there before: there is nothing to back up.");

    // The data as the outgoing version left it, taken with it stopped.
    const marked: { value: Switched["mark"] } = { value: null };
    try {
      watch();
      await steps.run("switch", async () => {
        switchStarted = true;
        const done = await doSwitch(r, o.app, { id: id!, image: image!, hadPrevious, waitSeconds: 120 }, c.ready, sw, c.env.host ?? "HOST");
        marked.value = done.mark;
        return `The new version is up on the server; this took ${done.seconds} seconds there.`;
      });

      await steps.run("ready", async () => {
        if (!target.ca) target = await webTarget(r, host, o.app, address.origin);
        const waited = await probes.waitReady(target, c.ready, hadPrevious ? 60 : 180);
        if (!waited.ok) throw new Stop(`The app did not answer ${address.origin}${c.ready} in ${Math.round(waited.seconds)} seconds: ${waited.last}`);
        return `${address.origin}${c.ready} answers${waited.seconds > 1 ? ` (after ${waited.seconds.toFixed(1)} seconds, the certificate included)` : ""}.`;
      });
      await stopWatching();

      await steps.run("smoke", async () => {
        const lines = await probes.smoke(target, c.ready);
        const bad = lines.filter((l) => !l.ok);
        if (bad.length) throw new Stop(`The live address fails its smoke look: ${bad[0]!.say}`, lines.map((l) => `${l.ok ? "ok" : "failed"}: ${l.say}`));
        let own = "";
        if (typeof c.smoke === "object") {
          const a = await probes.request(target, c.smoke);
          if (a.status < 200 || a.status >= 400) throw new Stop(`The app's own smoke request (${c.smoke.method} ${c.smoke.path}) was answered ${a.status}.`, lastLines(a.body.slice(0, 600), 4));
          own = `, and the app's own smoke request (${c.smoke.method} ${c.smoke.path}) is answered ${a.status}`;
        } else if (c.smoke) {
          if (!o.smokeRunner) notes.push("The app's own smoke line was not run: nothing here was given to run it.");
          else {
            const env: Record<string, string> = { SMOKE_URL: address.origin, ...(c.env.url ? { [c.env.url]: address.origin } : {}), ...(target.connectTo ? { SMOKE_CONNECT_TO: target.connectTo } : {}) };
            const ran = await o.smokeRunner({ line: c.smoke, dir: o.dir, env, ...(target.ca ? { ca: target.ca } : {}) });
            if (ran.code !== 0) throw new Stop(`The app's own smoke line (${c.smoke}) failed.`, lastLines(ran.output, 8));
            own = ", and the app's own smoke line passes";
          }
        }
        return { say: `The ready address and the first page answer over https${own}.`, details: lines.map((l) => l.say) };
      });
      looked = true;
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      if (switchStarted) {
        // From the switch on, the previous version is put back by itself.
        try {
          const done = await putBack(r, o.app, { id: id!, hadPrevious, restore: !hadPrevious ? null : previousSqlite ? { kind: "mark" } : snapshot ? { kind: "backup", id: snapshot } : null });
          notes.push(...done.notes.map((n) => steps.hide(n)));
          previousBack = done.back;
          if (done.back && isLocalName(address.host) && !target.ca) target = await webTarget(r, host, o.app, address.origin);
        } catch (again) {
          notes.push(`Putting the version before back failed: ${steps.hide((again as Error).message)} Look at the server's status and log.`);
        }
      }
      await stopWatching();
      throw error;
    }

    // The new version is what is live: written down, so that a way back knows.
    const schemaNow = c.database?.sqlite ? (jsonLine<{ schema: string }>((await r.run(scripts.fingerprintScript(o.app), { timeoutMs: 10 * 60_000 })).out)?.schema ?? null) : null;
    const live: Live = { id: id!, image: image!, version, at: now.toISOString(), address: address.origin, ready: c.ready, database: c.database ?? null, snapshot, schema: schemaNow };
    const before: Live | null = state.current ? withShape(state.current, marked.value) : null;
    const committed = await r.run(scripts.commitScript(o.app, id!, JSON.stringify(live), before ? JSON.stringify(before) : null, [image!, ...(before ? [before.image] : [])]), { timeoutMs: 180_000 });
    if (committed.code !== 0) problems.push(`What is live could not be written down on the server, so a way back may not work: ${failureOf(committed.out, committed.err)}`);
    result = "live";

    const cron = await r.run(scripts.cronScript(o.app, c.database?.sqlite ? null : backupAt), { timeoutMs: 60_000 });
    if (!c.database?.sqlite && kvOf(cron.out).get("cron") !== "set") problems.push("No daily backup is set up: cron is not on the server (checking the server with “prepare” installs it). Make backups by hand until then.");

    try {
      await steps.run("backup", async () => {
        const stopped = !c.database?.sqlite;
        if (stopped && (!isLocalName(address.host) || target.ca)) watcher = probes.watchDowntime(target, c.ready);
        let made: { id: string; database: boolean; s3: { ok: boolean; error?: string; key?: string } | null } | null;
        try {
          const out = await r.run(scripts.backupScript(o.app, ["now", "--label", "launch"], { stop: stopped }), { timeoutMs: 20 * 60_000 });
          made = jsonLine(out.out);
          if (out.code !== 0 || !made?.id) throw new Stop(`The backup could not be made: ${failureOf(out.out, out.err)}`);
        } finally {
          await stopWatching();
        }
        if (c.database?.sqlite && !made.database) throw new Stop(`hydor.json names ${c.database.file} as the database, and there is no such file in the data folder after the app started: check “database.file”. The backup ${made.id} holds the other files only.`);
        const checked = await r.run(scripts.backupScript(o.app, ["verify", made.id]), { timeoutMs: 20 * 60_000 });
        const verdict = jsonLine<{ ok: boolean; found: Record<string, number>; problems: string[] }>(checked.out);
        if (!verdict) throw new Stop(`The backup ${made.id} could not be read back: ${failureOf(checked.out, checked.err)}`);
        backup = { id: made.id, verified: verdict.ok };
        if (!verdict.ok) throw new Stop(`The backup ${made.id} was restored into a scratch folder and did not read back right: ${verdict.problems.join("; ")}`);
        if (made.s3 && !made.s3.ok) notes.push(`The copy of the backup to your storage failed: ${made.s3.error}. The backup on the server is fine; check the storage's keys (BACKUP_S3_*).`);
        const tables = Object.entries(verdict.found).map(([n, rows]) => `${n} ${rows}`);
        return `Backup ${made.id} made${stopped ? " with the app stopped" : ""}, restored into a scratch folder and read back${c.database?.sqlite ? `: SQLite says ok; ${count(tables.length, "table")}${tables.length ? ` (${tables.slice(0, 6).join(", ")}${tables.length > 6 ? "…" : ""})` : ""}` : ""}${made.s3?.ok ? `; copied to your storage (${made.s3.key})` : ""}.`;
      });
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      result = "unfinished";
    }
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    // A failure outside a step (the connection dropping between two) is still said.
    if (!steps.failed) problems.push(steps.hide(error.message));
    result = previousBack ? "rolled-back" : looked ? "unfinished" : "failed";
    if (looked) problems.push("The new version is live and passed its look, but the launch could not be finished. Look at the server's status, then launch again.");
  } finally {
    await stopWatching().catch(() => {});
    // `configured`: the server holds copies of the key files only once they were being written.
    if (configured) await (remote as Remote | null)?.run(scripts.tidyScript(o.app), { timeoutMs: 60_000 }).catch(() => {});
  }

  const failed = steps.failed;
  if (failed) problems.unshift(...(failed.details.length ? [failed.say, ...failed.details] : [failed.say]));
  const outSummary =
    result === "live"
      ? `Live at ${address.origin}${version ? ` (version ${version})` : ""}${downtime !== null ? `; people reached nothing for ${downtime} seconds while it replaced the last version` : state.current ? "" : " (the first launch: nothing was interrupted)"}.`
      : result === "unfinished"
        ? `Live at ${address.origin}, but the launch is NOT done: ${failed?.id === "backup" ? `no backup that reads back was made. ${failed.say}` : (problems[0] ?? "")}`
        : switchStarted
          ? `The launch failed at “${failed?.id ?? "switch"}”${previousBack ? " and the previous version is back" : state.current ? "" : " (there was no version before)"}. ${failed?.say ?? problems[0] ?? ""}`
          : `The launch failed${failed ? ` at “${failed.id}”` : ""}; nothing that was running was touched. ${failed?.say ?? problems[0] ?? ""}`;

  let record: RemoteRecord | null = null;
  if (sent && id && image) {
    record = {
      id,
      at: now.toISOString(),
      action: "launch",
      version,
      image,
      result,
      downtimeSeconds: downtime,
      ...(failed ? { failedStep: failed.id, said: failed.say } : {}),
      overrides,
      backup,
      host: o.host,
      address: address.origin,
      ...(o.commit ? { commit: o.commit } : {}),
      ...(o.by ? { by: o.by } : {}),
      ms: Date.now() - started,
    };
    try {
      await steps.run("record", async () => {
        const out = await remote!.run(scripts.historyAppendScript(o.app), { input: `${JSON.stringify(record)}\n`, timeoutMs: 60_000 });
        if (out.code !== 0) throw new Stop(`The launch could not be written down on the server: ${failureOf(out.out, out.err)}`);
        return "Written down on the server (no key in it).";
      });
    } catch (error) {
      problems.push(steps.hide((error as Error).message));
    }
  }
  await (remote as Remote | null)?.close().catch(() => {});

  return {
    ok: result === "live",
    result,
    summary: steps.hide(outSummary.trim()),
    problems: result === "live" ? problems : [...new Set(problems)],
    notes,
    steps: steps.list,
    id,
    image,
    version,
    address: address.origin,
    downtimeSeconds: downtime,
    previousBack,
    overrides,
    backup,
    record,
  };
}

// ---- the way back ------------------------------------------------------------------------------------------------------

export interface RollbackOptions extends Place {
  /** Also put the data back as it was just before the launch being undone (what was written since is not in the app after). */
  restoreData?: boolean;
  onStep?: (step: Step) => void;
  by?: string;
  now?: () => Date;
}

/** Back to the version that was live before this one. Going back again goes forward. */
export async function rollback(o: RollbackOptions): Promise<LaunchOutcome> {
  checkName(o.app);
  return alone(o, () => rollbackNow(o));
}

async function rollbackNow(o: RollbackOptions): Promise<LaunchOutcome> {
  const probes: Probes = { ...PROBES, ...o.probes };
  const now = (o.now ?? (() => new Date()))();
  const started = Date.now();
  const host = connectionOf(o.hostsDir, o.host);
  const remote = (o.connect ?? connectSsh)(o.hostsDir, host);
  const steps = new Steps(["switch", "ready", "smoke", "record"], o.onStep);
  let prepared = false;
  try {
    const state = parseState((await remote.run(scripts.stateScript(o.app), { timeoutMs: 90_000 })).out);
    const cur = state.current;
    const prev = state.previous;
    if (!cur) throw new Refused("Nothing is recorded as live on the server, so there is nothing to go back from.", "conflict");
    if (!prev) throw new Refused("There is no earlier version on the server to go back to (it has been launched once).", "conflict");
    const back = prev.id < cur.id;
    if (o.restoreData && !back) throw new Refused("Going forward again puts no data back: only going back to an earlier version can.", "input");
    if (o.restoreData && !cur.snapshot) throw new Refused("There is no backup from before this version was launched, so no data can be put back.", "conflict");
    steps.secrets = await heldSecrets(remote, o.app);
    if (back && !o.restoreData && cur.database?.sqlite && prev.database?.sqlite && prev.schema) {
      const nowShape = jsonLine<{ schema: string }>((await remote.run(scripts.fingerprintScript(o.app), { timeoutMs: 10 * 60_000 })).out)?.schema;
      if (nowShape !== prev.schema) {
        throw new Refused(`The database has changed shape since the earlier version ran on it, so that version could fail on it. Nothing was changed. To go back and also put the data back as it was before the launch of ${cur.version ?? cur.id}, ask for that too: what was written since then will no longer be in the app (a backup of it is made first).`, "conflict", ["restoreData"]);
      }
    }
    prepared = true;
    const files = await remote.run(scripts.previousFilesScript(o.app, prev.id), { timeoutMs: 90_000 });
    if (files.code !== 0) throw new Refused("The server no longer keeps the files of the earlier version, so it cannot be put back. Launch the app as it was instead.", "conflict");
    let target = await webTarget(remote, host, o.app, cur.address);
    const sameName = new URL(prev.address).host === new URL(cur.address).host;
    let watcher = state.running.includes("app") && sameName && (!isLocalName(new URL(cur.address).hostname) || target.ca) ? probes.watchDowntime(target, cur.ready) : null;
    const switchId = `back-${stampOf(now)}`;
    const sw = { switched: false, restored: null as string | null };
    const marked: { value: Switched["mark"] } = { value: null };
    let downtime: number | null = null;
    let switchStarted = false;
    const notes: string[] = [];
    let previousBack = false;
    const stopWatching = async () => {
      if (!watcher) return;
      downtime = (await watcher.stop()).seconds;
      watcher = null;
    };
    try {
      await steps.run("switch", async () => {
        switchStarted = true;
        const done = await doSwitch(remote, o.app, { id: switchId, image: prev.image, hadPrevious: true, waitSeconds: 120, ...(o.restoreData ? { restore: cur.snapshot! } : {}) }, prev.ready, sw);
        marked.value = done.mark;
        return `${prev.image} is running again${o.restoreData ? `, on the data as it was in the backup ${cur.snapshot}` : ""}.`;
      });
      await steps.run("ready", async () => {
        if (!sameName || !target.ca) target = await webTarget(remote, host, o.app, prev.address);
        const waited = await probes.waitReady(target, prev.ready, 60);
        if (!waited.ok) throw new Stop(`The earlier version did not answer ${prev.address}${prev.ready}: ${waited.last}`);
        return `${prev.address}${prev.ready} answers.`;
      });
      await stopWatching();
      await steps.run("smoke", async () => {
        const lines = await probes.smoke(target, prev.ready);
        const bad = lines.filter((l) => !l.ok);
        if (bad.length) throw new Stop(`The live address fails its smoke look: ${bad[0]!.say}`);
        return "The ready address and the first page answer over https.";
      });
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      if (switchStarted) {
        const safety = jsonLine<{ safety?: string }>(sw.restored ?? "")?.safety;
        const restore: scripts.PutBackAsked["restore"] = cur.database?.sqlite ? { kind: "mark" } : safety ? { kind: "backup", id: safety } : null;
        const done = await putBack(remote, o.app, { id: switchId, hadPrevious: true, restore });
        notes.push(...done.notes.map((n) => steps.hide(n)));
        previousBack = done.back;
      }
      await stopWatching();
    }
    const failed = steps.failed;
    if (!failed) {
      // (A way back that fails after this is thrown to the caller: the earlier version is live, and status says so.)
      // The one gone back to is current now; the one left keeps the shape it had, so that going forward again is a plain switch.
      await remote.run(scripts.swapStateScript(o.app, JSON.stringify(prev), JSON.stringify(withShape(cur, marked.value))), { timeoutMs: 60_000 });
      const at = state.backupAt ?? "03:30";
      await remote.run(scripts.cronScript(o.app, prev.database?.sqlite ? null : at), { timeoutMs: 60_000 });
      if (!cur.database?.sqlite || !prev.database?.sqlite) notes.push("Hydor cannot tell whether this data changed shape between the two versions: look at the app.");
    }
    const summary = failed
      ? `The way back failed at “${failed.id}”${previousBack ? " and the version that was live is back" : ""}: ${failed.say}`
      : `${back ? "Went back" : "Went forward"}: ${prev.version ? `version ${prev.version}` : prev.id} is live at ${prev.address}${downtime !== null ? `; people reached nothing for ${downtime} seconds` : ""}${o.restoreData ? "; the data was put back as it was before the launch that was undone" : ""}. Going back again returns to ${cur.version ? `version ${cur.version}` : cur.id}.`;
    const record: RemoteRecord = { id: stampOf(now), at: now.toISOString(), action: "rollback", version: prev.version, image: prev.image, result: failed ? "failed" : "live", downtimeSeconds: downtime, ...(failed ? { failedStep: failed.id, said: failed.say } : {}), overrides: [], backup: null, host: o.host, address: prev.address, ...(o.by ? { by: o.by } : {}), ms: Date.now() - started };
    await steps.run("record", async () => {
      await remote.run(scripts.historyAppendScript(o.app), { input: `${JSON.stringify(record)}\n`, timeoutMs: 60_000 });
      return "Written down on the server.";
    });
    return {
      ok: !failed,
      result: failed ? "failed" : "live",
      summary,
      problems: failed ? [failed.say, ...failed.details] : [],
      notes,
      steps: steps.list,
      id: prev.id,
      image: prev.image,
      version: prev.version,
      address: prev.address,
      downtimeSeconds: downtime,
      previousBack,
      overrides: [],
      backup: null,
      record,
    };
  } finally {
    if (prepared) await remote.run(scripts.tidyScript(o.app), { timeoutMs: 60_000 }).catch(() => {});
    await remote.close().catch(() => {});
  }
}
