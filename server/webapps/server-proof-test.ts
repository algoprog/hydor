// The proof of launching to a server through Hydor's own routes, with a scratch Hydor and a stand-in for a server (the
// engine's: remote/fixtures/standin, an Ubuntu with sshd in a privileged container that runs its own Docker). The food
// bank app from fixtures/apps/ (with a key and a version header added) is registered, checked (its hydor.json's lines and
// its pages), launched inside Hydor, then to the server: a host added and its fingerprint accepted, prepared, the key
// given on the keys card's route, the launch, status and log, a backup made and put back, a version that fails there and
// the one before put back by itself, the way back on request, and the app taken off.
//
// Needs Docker (privileged containers), ssh, ssh-keygen, ssh-keyscan, tar, git, a Chromium, the network (Docker Hub,
// ghcr.io, Docker's apt repository, npm) and about ten minutes. Ports 4780 to 4799. What it makes is named
// hydor-server-proof-<id>-… or lives in a scratch folder, and is removed at the end by its exact name (KEEP=1 leaves it).
//   OUTDIR=dist/dev node scripts/build-server.mjs server/webapps/server-proof-test.ts
//   HOME=<scratch> DATA_DIR=<scratch> HYDOR_APPS_DIR=<scratch> HYDOR_SERVER_PROOF=1 node dist/dev/server-proof-test.js
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import cookie from "@fastify/cookie";
import Fastify from "fastify";
import type { KeysCardView } from "../../shared/keys.ts";
import { stopsLaunch, type LaunchHost, type LaunchJob, type LaunchRecord, type RunBackup, type RunStatus, type WebAppChecks, type WebAppDetail, type WebAppKeys, type WebAppLaunchView } from "../../shared/webapps.ts";
import { HttpError } from "../auth.ts";
import { APP_ROOT } from "../config.ts";
import { connections } from "../connections/index.ts";
import { vaultTables } from "../connections/vault.ts";
import { kvSet, openDb } from "../db.ts";
import type { Deps } from "../features/types.ts";
import { createWebapps } from "./index.ts";

if (process.env.HYDOR_SERVER_PROOF !== "1") {
  console.log("skipped: the server proof needs Docker and the network; set HYDOR_SERVER_PROOF=1 (see the file's head)");
  process.exit(0);
}
for (const v of ["DATA_DIR", "HOME", "HYDOR_APPS_DIR"]) if (!process.env[v]?.startsWith("/tmp/")) (console.error("Run with HOME=/tmp/…, DATA_DIR=/tmp/… and HYDOR_APPS_DIR=/tmp/… so nothing touches real data."), process.exit(2));

const RUN = randomBytes(3).toString("hex");
const NAMES = { server: `hydor-server-proof-${RUN}-server`, image: `hydor-server-proof-${RUN}-standin`, docker: `hydor-server-proof-${RUN}-docker`, containerd: `hydor-server-proof-${RUN}-containerd` };
const PORTS = { apps: 4780, hosted: [4781, 4788] as [number, number], ssh: 4790, http: 4791, https: 4792 };
const scratch = fs.mkdtempSync(path.join(process.env.DATA_DIR!, "server-proof-"));
const KEY_VALUE = `proof-key-${randomBytes(18).toString("hex")}`;

const failures: string[] = [];
let checks = 0;
const say = (text = "") => console.log(text.split(KEY_VALUE).join("«proof key»").split(scratch).join("<scratch>"));
const expect = (condition: unknown, message: string, more = "") => {
  checks++;
  if (condition) say(`  ok    ${message}`);
  else {
    say(`  FAIL  ${message}${more ? `\n${more.slice(0, 3000)}` : ""}`);
    failures.push(message);
  }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const docker = (...args: string[]) => spawnSync("docker", args, { encoding: "utf8", maxBuffer: 1 << 26 });
const onServer = (command: string, input?: string) => spawnSync("docker", ["exec", ...(input === undefined ? [] : ["-i"]), NAMES.server, "bash", "-c", command], { encoding: "utf8", input });

// ---- the scratch Hydor ---------------------------------------------------------------------------------------------------------

const dataDir = path.join(scratch, "hydor-data");
const db = openDb(path.join(scratch, "test.db"));
kvSet(db, "sharing:owner", "Dana");
vaultTables(db);
const app = Fastify();
await app.register(cookie);
app.setErrorHandler((err: Error, _req, reply) => reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message, ...((err as HttpError).extra ?? {}) }));
const sessions = Object.assign(new EventEmitter(), { adapterByRun: () => null, summary: () => null, queueSummary: () => {}, deliverOrQueue: async () => {} });
const deps = { app, db, sessions, scheduler: null, models: {}, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => "http://test.local" } as unknown as Deps;
connections.routes!(deps);
const web = createWebapps({ dataDir, port: PORTS.apps, origin: "", domain: "", idleMs: 600_000, sandbox: true, ports: PORTS.hosted, startTimeoutMs: 30_000, appsRoot: path.join(scratch, "WebApps"), weekly: false });
web.routes!(deps);
await app.ready();
web.start!(deps);
await web.ready;

const call = async <T = any>(method: string, url: string, body?: unknown): Promise<{ status: number; json: T; text: string }> => {
  const r = await app.inject({ method: method as "GET", url, headers: body !== undefined ? { "content-type": "application/json" } : {}, payload: body === undefined ? undefined : JSON.stringify(body) });
  let json: any = null;
  try {
    json = r.json();
  } catch {}
  return { status: r.statusCode, json, text: r.body };
};
const ok = async <T = any>(method: string, url: string, body?: unknown): Promise<T> => {
  const r = await call<T>(method, url, body);
  if (r.status >= 400) throw new Error(`${method} ${url} answered ${r.status}: ${r.text.slice(0, 600)}`);
  return r.json;
};

/** Waits for the launch job of the app to end, and prints its steps. */
async function follow(id: string, label: string): Promise<LaunchJob> {
  const t = Date.now();
  let job: LaunchJob | null = null;
  for (;;) {
    job = (await ok<{ job: LaunchJob | null }>("GET", `/api/webapps/${id}/launch/job`)).job;
    if (job && job.state !== "running" && job.state !== "asking") break;
    if (job?.state === "asking") {
      say(`        the launch asks: ${job.ask?.kind === "override" ? job.ask.stops.map((s) => `${s.id}: ${s.text}`).join(" | ") : job.ask?.kind}`);
      await ok("POST", `/api/webapps/${id}/launch/answer`, { cancel: true });
    }
    if (Date.now() - t > 20 * 60_000) throw new Error(`${label} did not end in 20 minutes`);
    await sleep(1000);
  }
  say(`        -- ${label}: ${Math.round((Date.now() - t) / 1000)} s`);
  for (const s of job.steps) say(`        ${s.state.padEnd(7)} ${s.id.padEnd(9)} ${(s.say ?? "").slice(0, 240)}`);
  say(`        => ${job.summary ?? ""}`);
  for (const n of job.notes ?? []) say(`        note: ${n.slice(0, 300)}`);
  return job;
}

/** The live app over https, from this computer (Caddy signs a .localhost name itself, so its certificate is not checked here: the launch checks it). */
function site(at: string, o: { method?: string; json?: unknown; cookie?: string } = {}): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  const body = o.json === undefined ? undefined : JSON.stringify(o.json);
  return new Promise((resolve, reject) => {
    const req = https.request(
      { host: "127.0.0.1", port: PORTS.https, path: at, method: o.method ?? "GET", servername: "foodbank.localhost", rejectUnauthorized: false, agent: false, timeout: 15_000, headers: { host: `foodbank.localhost:${PORTS.https}`, ...(body ? { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)), origin: `https://foodbank.localhost:${PORTS.https}`, "sec-fetch-site": "same-origin" } : {}), ...(o.cookie ? { cookie: o.cookie } : {}) } },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (d: string) => (text += d));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end(body);
  });
}
const version = async () => String((await site("/sign-in")).headers["x-proof-version"] ?? "");

// ---- the app -----------------------------------------------------------------------------------------------------------------

const folder = path.join(scratch, "food-bank");
fs.cpSync(path.join(APP_ROOT, "server", "webapps", "fixtures", "apps", "food-bank"), folder, { recursive: true });
const edit = (file: string, find: string, replace: string) => {
  const p = path.join(folder, file);
  const text = fs.readFileSync(p, "utf8");
  if (!text.includes(find)) throw new Error(`${file} no longer has: ${find}`);
  fs.writeFileSync(p, text.replace(find, replace));
};
edit("server.js", "async function handle(req, res) {\n", "async function handle(req, res) {\n  res.setHeader('X-Proof-Version', '1.0.0');\n");
const contract = JSON.parse(fs.readFileSync(path.join(folder, "hydor.json"), "utf8"));
contract.keys = [{ name: "PROOF_API_KEY", from: "you", why: "A key of the proof's, to see where it goes and where it does not.", how: ["Make one up"] }];
contract.smoke = { method: "GET", path: "/sign-in" };
fs.writeFileSync(path.join(folder, "hydor.json"), `${JSON.stringify(contract, null, 2)}\n`);
const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=Proof", "-c", "user.email=proof@example.test", ...args], { cwd: folder, encoding: "utf8" });
git("init", "-q");
git("add", "-A");
git("commit", "-qm", "The food bank, version 1.0.0");

const removed: string[] = [];
let started = false;
const imagesBefore = new Set(docker("images", "--format", "{{.Repository}}:{{.Tag}}").stdout.split("\n"));
try {
  say(`run ${RUN}`);
  say("\n== 1. Registered and checked: what hydor.json says, then its pages");
  const added = await ok<{ app: WebAppDetail }>("POST", "/api/webapps", { folder });
  const id = added.app.id;
  const api = `/api/webapps/${id}`;
  expect(added.app.shape.ok && added.app.shape.signIn === "own", `${added.app.name} is registered by its hydor.json`);
  await ok("POST", `${api}/check`);
  let c: WebAppChecks;
  for (;;) {
    await sleep(700);
    c = await ok<WebAppChecks>("GET", `${api}/checks`);
    if (!c.running) break;
  }
  say(`        ${c.summary}`);
  for (const l of c.lines.filter((x) => x.group === "contract")) say(`        ${l.state.padEnd(7)} ${l.title}: ${l.text.slice(0, 200)}`);
  say((c.pagesSummary ?? "(no page checks)").replace(/^/gm, "        "));
  if (c.signedIn) say(`        ${c.signedIn}`);
  expect(c.ran && !c.lines.some(stopsLaunch), "nothing that stops a launch failed", JSON.stringify(c.lines.filter(stopsLaunch), null, 1));
  expect(c.lines.some((l) => l.group === "safety") && !c.signedIn, "the pages were looked at, signed-in ones too, with a test person");

  say("\n== 2. Launched inside Hydor");
  await ok("POST", `${api}/launch/hydor`, {});
  const inside = await follow(id, "the launch inside Hydor");
  expect(inside.state === "done", "it is live inside Hydor", inside.summary);

  say("\n== 3. The stand-in for a server, and a host added through Hydor's routes");
  const built = docker("build", "-q", "-t", NAMES.image, path.join(APP_ROOT, "server/webapps/remote/fixtures/standin"));
  if (built.status !== 0) throw new Error(`The stand-in image could not be built: ${built.stderr.slice(-800)}`);
  for (const v of [NAMES.docker, NAMES.containerd]) docker("volume", "create", v);
  const ran = docker("run", "-d", "--name", NAMES.server, "--hostname", "standin", "--privileged", "--cgroupns=private", "--cpus=8", "--tmpfs", "/run", "--tmpfs", "/run/lock", "-v", `${NAMES.docker}:/var/lib/docker`, "-v", `${NAMES.containerd}:/var/lib/containerd`, "-p", `127.0.0.1:${PORTS.ssh}:22`, "-p", `127.0.0.1:${PORTS.http}:80`, "-p", `127.0.0.1:${PORTS.https}:443`, NAMES.image);
  if (ran.status !== 0) throw new Error(`The stand-in could not be started: ${ran.stderr.slice(-800)}`);
  started = true;
  for (let i = 0; i < 90 && onServer("systemctl is-active ssh").stdout.trim() !== "active"; i++) await sleep(1000);
  expect(onServer("systemctl is-active ssh").stdout.trim() === "active" && onServer("command -v docker || echo none").stdout.trim() === "none", "the stand-in has sshd and no Docker");

  const made = (await ok<{ host: LaunchHost }>("POST", "/api/webapps/hosts", { name: "stand", ssh: `deploy@127.0.0.1:${PORTS.ssh}` })).host;
  expect(made.state === "made" && made.authorizedLine?.startsWith("ssh-ed25519 "), "POST /api/webapps/hosts makes a key of Hydor's own for it");
  onServer("cat > ~deploy/.ssh/authorized_keys && chown deploy:deploy ~deploy/.ssh/authorized_keys && chmod 600 ~deploy/.ssh/authorized_keys", `${made.authorizedLine}\n`);
  const offer = await ok<{ offered: { type: string; fingerprint: string }[]; where: string }>("POST", "/api/webapps/hosts/stand/connect", {});
  const ed = offer.offered.find((o) => o.type === "ssh-ed25519")?.fingerprint ?? "";
  expect(ed && onServer("ssh-keygen -l -E sha256 -f /etc/ssh/ssh_host_ed25519_key.pub").stdout.includes(ed), "connect shows the machine's own fingerprint, and records nothing");
  const wrong = await call("POST", "/api/webapps/hosts/stand/accept", { fingerprint: `SHA256:${"A".repeat(43)}` });
  expect(wrong.status === 409, "another fingerprint is refused", wrong.text);
  const accepted = (await ok<{ host: LaunchHost }>("POST", "/api/webapps/hosts/stand/accept", { fingerprint: ed })).host;
  expect(accepted.state === "recorded", "the right one records the host");
  const bare = await ok<{ ok: boolean; summary: string }>("POST", "/api/webapps/hosts/stand/check", {});
  expect(!bare.ok && /Docker is not installed/.test(bare.summary), "check says what is missing", bare.summary);
  const t = Date.now();
  const prepared = await ok<{ ok: boolean; prepared: boolean; summary: string }>("POST", "/api/webapps/hosts/stand/check", { prepare: true });
  say(`        -- prepare: ${Math.round((Date.now() - t) / 1000)} s`);
  expect(prepared.ok && prepared.prepared, "prepare installs what was missing", prepared.summary);

  say("\n== 4. The key, on the keys card's route");
  const address = `https://foodbank.localhost:${PORTS.https}`;
  const early = await call("POST", `${api}/launch/server`, { host: "stand", address });
  expect(early.status === 409 && early.json.missing?.[0] === "PROOF_API_KEY", `a launch without it is refused before anything starts (${early.status})`, early.text);
  const card = (await ok<{ card: KeysCardView }>("POST", `${api}/keys/card`, { env: "production" })).card;
  await ok("POST", `/api/connections/requests/${card.id}/items/${card.items[0].id}`, { values: { PROOF_API_KEY: KEY_VALUE } });
  const keys = await ok<WebAppKeys>("GET", `${api}/keys?env=production`);
  expect(keys.keys[0].set && !keys.inside && !JSON.stringify(keys).includes(KEY_VALUE), "it is saved for production, apart from inside Hydor's, and never read back");
  expect(!(await ok<WebAppKeys>("GET", `${api}/keys?env=hydor`)).keys[0].set, "inside Hydor has none");

  say("\n== 5. Launched to the server");
  await ok("POST", `${api}/launch/server`, { host: "stand", env: "production", address });
  const first = await follow(id, "the first launch to the server");
  expect(first.state === "done", "it is live on the server", [first.summary, ...(first.problems ?? [])].join("\n"));
  expect(first.steps.length === 14 && first.steps.every((s) => s.state === "passed" || s.state === "skipped"), "its fourteen steps are said as they end");
  const launched = (await ok<{ app: WebAppDetail }>("GET", api)).app;
  expect(launched.stage === "run" && launched.mode.servers?.join() === "production", "the app is at Run, with its place on a server", JSON.stringify([launched.stage, launched.mode]));
  expect((await version()) === "1.0.0", "it answers over https with the version launched");
  const view = await ok<WebAppLaunchView>("GET", `${api}/launch`);
  const head = git("rev-parse", "HEAD").trim();
  expect(view.envs[0]?.host === "stand" && view.envs[0].address === address && view.envs[0].commit === head && view.envs[0].name === added.app.slug, "Hydor remembers the deployment: place, host, name, address, commit", JSON.stringify(view.envs));
  expect(git("status", "--porcelain").trim() === "" && git("rev-parse", "HEAD").trim() === head, "nothing was written into the app's folder");
  const held = onServer(`grep -c . ~deploy/hydor-apps/${added.app.slug}/app.env; grep -q '${KEY_VALUE}' ~deploy/hydor-apps/${added.app.slug}/app.env && echo has-key; stat -c %a ~deploy/hydor-apps/${added.app.slug}/app.env`).stdout;
  expect(/has-key/.test(held) && /600/.test(held), "the server holds the key, in a file only its owner reads", held);
  expect(!JSON.stringify([first, view]).includes(KEY_VALUE), "no key in the job or the Launch tab");

  say("\n== 6. Status and log");
  const status = (await ok<{ status: RunStatus }>("GET", `${api}/run/production/status`)).status;
  say(`        ${status.up ? "up" : "DOWN"}: ${status.say}`);
  say(`        services: ${status.services?.map((s) => `${s.name} ${s.up ? "running" : "not running"}`).join(", ")}; disk: ${status.disk?.say}; last backup: ${status.lastBackup?.id}`);
  expect(status.up === true && status.host === "stand" && !!status.lastBackup, "the Run tab's status", JSON.stringify(status));
  const logs = (await ok<{ lines: string[] }>("GET", `${api}/run/production/logs?tail=20&since=1h`)).lines;
  say(logs.slice(-4).map((l) => `        | ${l.slice(0, 200)}`).join("\n"));
  expect(logs.length > 0 && !logs.join("\n").includes(KEY_VALUE), "the app's log is read, keys hidden");

  say("\n== 7. A backup made and put back");
  const person = { name: "Ana", email: "ana@example.test", password: "a-long-password-1" };
  const up = await site("/api/sign-up", { method: "POST", json: person });
  const jar = ([] as string[]).concat(up.headers["set-cookie"] ?? []).map((x) => x.split(";")[0]).join("; ");
  expect(up.status === 201 && jar, "a person signs up on the launched app", `${up.status} ${up.body}`);
  const add = async (name: string) => (await site("/api/stock", { method: "POST", cookie: jar, json: { name, category: "tinned", quantity: 3 } })).status;
  const names = async () => (JSON.parse((await site("/api/stock", { cookie: jar })).body).rows as { name: string }[]).map((r) => r.name).sort();
  expect((await add("Beans")) === 201, "and adds a row");
  const backup = await ok<{ backup: RunBackup; verified: boolean }>("POST", `${api}/run/production/backups`, {});
  expect(backup.verified && backup.backup.tables.stock === 1, `a backup is made and read back (${backup.backup.id})`, JSON.stringify(backup));
  expect((await add("Rice")) === 201 && (await names()).length === 2, "another row after it");
  const list = await ok<{ backups: RunBackup[]; schedule: { at: string; keepDays: number } }>("GET", `${api}/run/production/backups`);
  expect(list.backups.some((b) => b.id === backup.backup.id) && list.schedule, "it is listed, with the daily time");
  await ok("PUT", `${api}/run/production/backups/schedule`, { at: "02:15", keepDays: 7 });
  expect((await ok<{ schedule: { at: string } }>("GET", `${api}/run/production/backups`)).schedule.at === "02:15", "the daily time is changed");
  const download = await app.inject({ method: "GET", url: `${api}/run/production/backups/${backup.backup.id}/download` });
  expect(download.statusCode === 200 && download.rawPayload.length > 500 && download.rawPayload[0] === 0x1f, `it can be downloaded (${download.rawPayload.length} bytes)`);
  const restored = await ok<{ safety: string | null; summary: string }>("POST", `${api}/run/production/backups/${backup.backup.id}/restore`, {});
  say(`        ${restored.summary}`);
  for (let i = 0; i < 30 && (await site("/sign-in").then((x) => x.status, () => 0)) !== 200; i++) await sleep(1000);
  expect((await names()).join() === "Beans" && restored.safety, "put back: the row added after it is gone, and what was there is kept", (await names()).join());

  say("\n== 8. A version that fails on the server: the one before comes back by itself");
  edit("server.js", "res.setHeader('X-Proof-Version', '1.0.0');\n", "res.setHeader('X-Proof-Version', '1.1.0');\n  // Passes the check here and fails on a server, where HOST is every address.\n  if (process.env.HOST === '0.0.0.0') { res.statusCode = 500; return res.end('broken on a server'); }\n");
  git("commit", "-qam", "1.1.0, which fails on a server");
  await ok("POST", `${api}/launch/server`, { host: "stand", env: "production", address });
  const broken = await follow(id, "the launch that fails");
  expect(broken.state === "failed" && broken.previousBack === true, "it failed and the version before is back", `${broken.summary}\n${broken.problems?.join("\n")}`);
  expect((await version()) === "1.0.0" && (await names()).join() === "Beans", "version 1.0.0 answers, with its data");
  expect((await ok<WebAppLaunchView>("GET", `${api}/launch`)).envs[0].commit === head, "what Hydor remembers deployed is still the commit before");

  say("\n== 9. A good version, and the way back on request");
  git("revert", "-n", "HEAD");
  edit("server.js", "'1.0.0'", "'1.2.0'");
  git("commit", "-qam", "1.2.0");
  const second = git("rev-parse", "HEAD").trim();
  await ok("POST", `${api}/launch/server`, { host: "stand", env: "production", address });
  const good = await follow(id, "the launch of 1.2.0");
  expect(good.state === "done" && (await version()) === "1.2.0", "1.2.0 is live", good.summary);
  await ok("POST", `${api}/launch/back`, { place: "server", env: "production" });
  const back = await follow(id, "back to the launch before");
  expect(back.state === "done" && (await version()) === "1.0.0", "back to 1.0.0", back.summary);
  const after = await ok<WebAppLaunchView>("GET", `${api}/launch`);
  expect(after.envs[0].commit === head, `Hydor remembers the commit live again (${after.envs[0].commit.slice(0, 8)}, not ${second.slice(0, 8)})`);
  const history = (await ok<{ history: LaunchRecord[] }>("GET", `${api}/launch/history?env=production`)).history;
  say(history.map((r) => `        ${r.result.padEnd(11)} ${r.commit.slice(0, 8)} ${r.summary?.slice(0, 120) ?? ""}`).join("\n"));
  expect(history.length >= 4 && history[0].result === "back" && history.some((r) => r.result === "rolled-back" || r.result === "failed"), "the history says each");

  say("\n== 10. Restart, taking it off, and removing the server");
  const restarted = await ok<{ ok: boolean; summary: string }>("POST", `${api}/run/production/restart`, {});
  expect(restarted.ok, restarted.summary);
  const off = await ok<{ summary: string }>("POST", `${api}/launch/takedown`, { env: "production" });
  say(`        ${off.summary}`);
  expect((await ok<WebAppLaunchView>("GET", `${api}/launch`)).envs.length === 0 && (await site("/sign-in").then(() => false, () => true)), "it is off the server, and Hydor says so");
  await ok("DELETE", "/api/webapps/hosts/stand");
  expect((await ok<{ hosts: LaunchHost[] }>("GET", "/api/webapps/hosts")).hosts.length === 0 && !fs.existsSync(path.join(dataDir, "server-hosts", "keys", "stand")), "the server and the key made for it are gone from Hydor");
  const inDb = ["web_launches", "web_deployments"].map((table) => JSON.stringify(db.prepare(`select * from ${table}`).all())).join("");
  expect(!inDb.includes(KEY_VALUE), "no key in what Hydor keeps of launches");
} catch (e) {
  failures.push((e as Error).message);
  say(`\nFAILED: ${(e as Error).stack}`);
  if (started) say(onServer("docker ps -a 2>/dev/null; docker logs --tail 20 $(docker ps -aq | head -1) 2>&1").stdout.slice(-3000));
} finally {
  await web.stop?.(undefined as never);
  await app.close();
  if (process.env.KEEP !== "1") {
    if (docker("rm", "-f", NAMES.server).status === 0) removed.push(`container ${NAMES.server}`);
    for (const v of [NAMES.docker, NAMES.containerd]) if (docker("volume", "rm", v).status === 0) removed.push(`volume ${v}`);
    if (docker("image", "rm", NAMES.image).status === 0) removed.push(`image ${NAMES.image}`);
    if (!imagesBefore.has("ubuntu:24.04") && docker("image", "rm", "ubuntu:24.04").status === 0) removed.push("image ubuntu:24.04 (pulled for the stand-in)");
    fs.rmSync(scratch, { recursive: true, force: true });
    removed.push("the scratch folder");
  }
  say(`\nremoved: ${removed.join(", ")}`);
}
say(`\n${checks - failures.length} of ${checks} checks held${failures.length ? `; failed: ${failures.join(" | ")}` : ""}`);
process.exit(failures.length ? 1 : 0);
