// The proof of the contract with a real scratch Hydor: apps, registered by their hydor.json and used the way a person
// would, through Hydor's own proxy. First a small app this test writes, which takes who is signed in from Hydor (the signed header) and calls the three
// services behind Hydor's own routes, with its keys: checked, previewed, launched, backed up and put back, stopped, and (naming no database) copied with
// it stopped. Then two apps built by agents, with accounts of their own, from fixtures/apps/: a food bank's stock and deliveries (with photos; plain
// Node) and, with HYDOR_PROOF_NETWORK=1 because its build installs Express from npm, crews with invitations. Each is copied into the scratch folder;
// the originals are never touched.
// STAND-INS: the model (a small server that speaks chat completions, behind Custom's models), the embedder (deterministic vectors), the mail server
// (SMTP on this computer, behind a connected account). No real model, key or mail. Ports 4780 to 4799.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/webapps/contract-test.ts
//   HOME=<scratch folder> DATA_DIR=<scratch folder> HYDOR_APPS_DIR=<scratch folder> node dist/dev/contract-test.js
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { SERVER_NEEDS_ACCOUNTS, stopsLaunch, type LaunchJob, type RunBackup, type WebAppChecks, type WebAppDetail, type WebAppKeys, type WebAppLaunchView } from "../../shared/webapps.ts";
import { sandboxAvailable } from "../agent/sandbox.ts";
import { apps as appsFeature } from "../apps/index.ts";
import { startRuns } from "../apps/runs.ts";
import { setTiers } from "../assistants/tiers.ts";
import { HttpError } from "../auth.ts";
import { APP_ROOT } from "../config.ts";
import { appTables } from "../connections/apps.ts";
import { saveAppKey, useMaskDb, vaultTables } from "../connections/vault.ts";
import { kvSet, openDb } from "../db.ts";
import type { Deps, RunCtx, RunTool } from "../features/types.ts";
import { mailTables, saveAccount } from "../mail/accounts.ts";
import { setEmbedderForTests } from "../memory/embed.ts";
import { DIM } from "../memory/vectors.ts";
import { writeAgentModels } from "../models/config.ts";
import { initPages } from "../pages/store.ts";
import { createWebapps } from "./index.ts";
import { webappOpenToken } from "./proxy.ts";
import type { Person } from "./sign.ts";
import { sweepOrphans, writePid } from "./sweep.ts";

for (const v of ["DATA_DIR", "HOME", "HYDOR_APPS_DIR"]) if (!process.env[v]?.startsWith("/tmp/")) (console.error("Run with HOME=/tmp/…, DATA_DIR=/tmp/… and HYDOR_APPS_DIR=/tmp/… so nothing touches real data."), process.exit(2));
process.env.HYDOR_EMBED_MODEL_DIR = path.join(process.env.DATA_DIR!, "no-model-here");
delete process.env.HYDOR_EMBED_PYTHON;

const HYDOR_PORT = 4780;
const MODEL_PORT = 4781;
const SMTP_PORT = 4782;
const APPS_PORT = 4799;
const scratch = fs.mkdtempSync(path.join(process.env.DATA_DIR!, "contract-"));
let passed = 0;
const step = async (name: string, fn: () => Promise<void> | void) => {
  const t = Date.now();
  await fn();
  passed++;
  console.log(`ok - ${name} (${((Date.now() - t) / 1000).toFixed(1)} s)`);
};
const say = (text: string) => console.log(text.replace(/^/gm, "    | "));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const until = async (what: string, fn: () => Promise<boolean> | boolean, ms = 120_000) => {
  const t = Date.now();
  while (!(await fn())) {
    if (Date.now() - t > ms) assert.fail(`Waited ${ms} ms for ${what}`);
    await sleep(80);
  }
};

// ---- the stand-ins -------------------------------------------------------------------------------------------------------------------

const modelAsked: { model: string; messages: { role: string; content: string }[] }[] = [];
const model = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const body = JSON.parse(raw || "{}");
    modelAsked.push({ model: body.model, messages: body.messages });
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(`data: ${JSON.stringify({ id: "gen", choices: [{ delta: { content: "A flat tyre: patch it." }, finish_reason: null }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ id: "gen", choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`);
    res.end(`data: ${JSON.stringify({ id: "gen", choices: [], usage: { prompt_tokens: 12, completion_tokens: 6, cost: 0.0004 } })}\n\ndata: [DONE]\n\n`);
  });
});
await new Promise<void>((r) => model.listen(MODEL_PORT, "127.0.0.1", r));
writeAgentModels([{ id: "sm-quick", label: "Stand-in", provider: "endpoint", baseUrl: `http://127.0.0.1:${MODEL_PORT}/v1`, model: "scripted-quick", tools: "native", local: false }]);

setEmbedderForTests(async (texts) =>
  texts.map((t) => {
    const v = new Float32Array(DIM);
    v[crypto.createHash("sha256").update(t).digest().readUInt16BE(0) % DIM] = 1;
    return v;
  }),
);

const mails: { to: string[]; data: string }[] = [];
const sockets = new Set<net.Socket>();
const smtp = net.createServer((socket) => {
  sockets.add(socket);
  socket.on("error", () => {});
  let buf = "";
  let to: string[] = [];
  let data: string[] | null = null;
  const reply = (line: string) => !socket.destroyed && socket.write(`${line}\r\n`);
  reply("220 stand-in ESMTP");
  socket.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    let at: number;
    while ((at = buf.indexOf("\r\n")) >= 0) {
      const line = buf.slice(0, at);
      buf = buf.slice(at + 2);
      if (data) {
        if (line !== ".") data.push(line);
        else {
          mails.push({ to, data: data.join("\r\n") });
          data = null;
          reply("250 2.0.0 Ok");
        }
      } else if (/^(EHLO|HELO)/i.test(line)) reply("250-stand-in\r\n250 AUTH PLAIN");
      else if (/^AUTH/i.test(line)) reply("235 2.7.0 Accepted");
      else if (/^MAIL FROM:/i.test(line)) ((to = []), reply("250 Ok"));
      else if (/^RCPT TO:/i.test(line)) (to.push(/<([^>]*)>/.exec(line)![1]), reply("250 Ok"));
      else if (/^DATA/i.test(line)) ((data = []), reply("354 End with ."));
      else if (/^QUIT/i.test(line)) (reply("221 Bye"), socket.end());
      else reply("250 Ok");
    }
  });
});
await new Promise<void>((r) => smtp.listen(SMTP_PORT, "127.0.0.1", r));

// ---- Hydor -------------------------------------------------------------------------------------------------------------------------------

const dataDir = path.join(scratch, "hydor-data");
fs.mkdirSync(dataDir, { recursive: true });
const db = openDb(path.join(scratch, "test.db"));
kvSet(db, "sharing:owner", "Dana");
vaultTables(db);
appTables(db);
mailTables(db);
useMaskDb(db);
initPages(db);
setTiers(db, { console: { quick: { model: "sm-quick" } } });
saveAccount(db, { address: "dana@owner.test", name: "Dana Owner", username: "dana@owner.test", imap: { host: "127.0.0.1", port: 9, security: "none" }, smtp: { host: "127.0.0.1", port: SMTP_PORT, security: "none" } }, "stand-in-password");
const sessions = Object.assign(new EventEmitter(), { adapterByRun: () => null, summary: () => null });
const server = Fastify();
await server.register(cookie);
server.setErrorHandler((err: Error, _req, reply) => {
  const status = err instanceof HttpError ? err.status : 500;
  // 501 is an answer here (mail that is not sent yet), not a fault.
  if (status === 500) console.error(err);
  reply.code(status).send({ ...(err instanceof HttpError ? err.extra : undefined), error: err.message });
});
const deps = { app: server, db, sessions: sessions as never, scheduler: null as never, models: null as never, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => "http://test.local" } as unknown as Deps;
appsFeature.routes!(deps);
const web = createWebapps({ dataDir, port: APPS_PORT, origin: "", domain: "", idleMs: 600_000, sandbox: true, ports: [4783, 4798], startTimeoutMs: 30_000, hydorUrl: `http://127.0.0.1:${HYDOR_PORT}`, appsRoot: path.join(scratch, "WebApps"), weekly: false });
web.routes!(deps);
startRuns(deps);
await server.listen({ port: HYDOR_PORT, host: "127.0.0.1" });
web.start!(deps);
assert.equal(await web.ready, APPS_PORT);

const call = async <T = any>(method: string, url: string, body?: unknown, headers?: Record<string, string>) => {
  const r = await server.inject({ method: method as "GET", url, headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers }, payload: body === undefined ? undefined : JSON.stringify(body) });
  let json: any = null;
  try {
    json = r.json();
  } catch {}
  return { status: r.statusCode, json: json as T, text: r.body };
};
const appOf = async (id: string) => (await call<{ app: WebAppDetail }>("GET", `/api/webapps/${id}`)).json.app;
async function register(folder: string): Promise<WebAppDetail> {
  const r = await call("POST", "/api/webapps", { folder });
  assert.equal(r.status, 200, r.text);
  return r.json.app;
}
async function check(id: string): Promise<WebAppChecks> {
  const r = await call("POST", `/api/webapps/${id}/check`);
  assert.equal(r.status, 200, r.text);
  let c!: WebAppChecks;
  await until("the check", async () => !(c = (await call<WebAppChecks>("GET", `/api/webapps/${id}/checks`)).json).running, 300_000);
  assert.ok(c.ran && !c.problem, c.problem);
  return c;
}
const printCheck = (c: WebAppChecks) => say([...c.lines.map((l) => `${l.state.padEnd(6)} ${l.title}: ${l.text}`), c.summary].join("\n"));
async function build(id: string) {
  const r = await call("POST", `/api/webapps/${id}/build`);
  assert.equal(r.status, 200, r.text);
  let a!: WebAppDetail;
  await until("the build", async () => (a = await appOf(id)).build.state !== "building", 300_000);
  assert.equal(a.build.state, "built", a.build.log.join("\n"));
}
async function launch(id: string): Promise<LaunchJob> {
  const r = await call("POST", `/api/webapps/${id}/launch/hydor`, {});
  assert.equal(r.status, 200, r.text);
  let job!: LaunchJob;
  await until("the launch", async () => ["done", "failed", "asking"].includes((job = (await call("GET", `/api/webapps/${id}/launch/job`)).json.job).state), 300_000);
  assert.equal(job.state, "done", JSON.stringify(job, null, 1));
  say(job.steps.map((s) => `${s.state.padEnd(7)} ${s.title}: ${s.say ?? ""}`).join("\n"));
  return job;
}

// ---- a browser, through the apps' server -------------------------------------------------------------------------------------------------

interface Answer {
  status: number;
  headers: http.IncomingHttpHeaders;
  text: string;
  json: any;
}
class Browser {
  cookies = new Map<string, string>();
  constructor(readonly host: string) {}
  /** `from`: the page's origin as the browser would send it (default the app's own); null for none. */
  ask(method: string, at: string, o: { body?: unknown; raw?: Buffer; type?: string; from?: string | null; headers?: Record<string, string> } = {}): Promise<Answer> {
    const body = o.raw ?? (o.body !== undefined ? Buffer.from(JSON.stringify(o.body)) : undefined);
    const from = o.from === undefined ? `http://${this.host}` : o.from;
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port: APPS_PORT,
          method,
          path: at,
          headers: {
            host: this.host,
            ...(this.cookies.size ? { cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
            ...(from && method !== "GET" ? { origin: from } : {}),
            ...(body ? { "content-type": o.type ?? "application/json", "content-length": String(body.length) } : {}),
            ...o.headers,
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => {
            for (const line of res.headers["set-cookie"] ?? []) {
              const [pair] = line.split(";");
              const i = pair.indexOf("=");
              this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
            }
            const text = Buffer.concat(chunks).toString("utf8");
            let json: any = null;
            try {
              json = JSON.parse(text);
            } catch {}
            resolve({ status: res.statusCode ?? 0, headers: res.headers, text, json });
          });
        },
      );
      req.on("error", reject);
      req.end(body);
    });
  }
}
const owner: Person = { id: "owner", name: "Dana", role: "owner" };
/** A browser that has opened a side of the app from Hydor, as `who`. */
async function open(a: WebAppDetail, side: "preview" | "launched", who: Person = owner, frame?: string): Promise<Browser> {
  const live = (await appOf(a.id)).mode.launched;
  const id = side === "launched" ? `${a.id}_live` : a.id;
  const host = `${side === "preview" && live ? `${a.slug}--preview` : a.slug}.localhost:${APPS_PORT}`;
  const b = new Browser(host);
  const r = await b.ask("GET", `/__hydor/open?t=${encodeURIComponent(webappOpenToken(id, who, undefined, frame))}&to=%2F`);
  assert.equal(r.status, 302, r.text);
  return b;
}
const liveStatus = (a: WebAppDetail) => web.parts().host!.status(`${a.id}_live`);

async function backup(a: WebAppDetail): Promise<RunBackup> {
  const r = await call("POST", `/api/webapps/${a.id}/run/hydor/backups`);
  assert.equal(r.status, 200, r.text);
  return r.json.backup;
}
async function restore(a: WebAppDetail, id: string) {
  const r = await call("POST", `/api/webapps/${a.id}/run/hydor/backups/${id}/restore`);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.ready, "It is ready.", r.text);
}
/** Restart, then stop both sides; the app's own log says it ended by itself (its polite stop), inside the sandbox too. */
async function restartAndStop(a: WebAppDetail) {
  const before = liveStatus(a).pid;
  const r = await call("POST", `/api/webapps/${a.id}/run/hydor/restart`);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.ok, true, r.text);
  assert.notEqual(liveStatus(a).pid, before);
  await web.parts().host!.stop(`${a.id}_live`);
  assert.equal((await call("POST", `/api/webapps/${a.id}/stop`)).status, 200);
  for (const id of [a.id, `${a.id}_live`]) {
    const s = web.parts().host!.status(id);
    assert.equal(s.state, "stopped");
    assert.match(s.log.join("\n"), /--- exited with code 0/, `${id} ended by itself: ${s.log.slice(-4).join(" / ")}`);
  }
}

// ---- 1. a small app that takes who is signed in from Hydor, with keys and the three services -------------------------------------------------

const SERVER = `import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
const dir = process.env.DATA_DIR;
const db = new DatabaseSync(path.join(dir, 'desk.db'));
db.exec('pragma journal_mode = wal; create table if not exists notes (id integer primary key, person text, text text)');
function person(req) {
  const [body, mac] = String(req.headers['x-hydor-person'] ?? '').split('.');
  if (!body || !mac) return null;
  const want = crypto.createHmac('sha256', process.env.APP_SECRET).update(body).digest('base64url');
  if (want.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(mac))) return null;
  const who = JSON.parse(Buffer.from(body, 'base64url'));
  return who.exp * 1000 > Date.now() ? who : null;
}
const hydor = async (service, body, headers = {}) => {
  const r = await fetch(process.env.HYDOR_URL + '/api/apps/' + process.env.HYDOR_APP_SLUG + '/' + service, { method: 'POST', headers: { authorization: 'Bearer ' + process.env.HYDOR_APP_KEY, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};
const read = (req) => new Promise((resolve) => { let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => resolve(s ? JSON.parse(s) : {})); });
const server = http.createServer(async (req, res) => {
  const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.url === '/health') return send(200, { ok: true });
  const who = person(req);
  if (!who) return send(401, { error: 'Open this from Hydor.' });
  const body = req.method === 'POST' ? await read(req) : {};
  if (req.url === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><title>Desk</title><p>Hello ' + who.name.replace(/[<&]/g, '') + '</p>'); }
  if (req.url === '/me') return send(200, who);
  if (req.url === '/keys') return send(200, { sms: process.env.SMS_KEY ? process.env.SMS_KEY.length : 0, link: crypto.createHash('sha256').update(process.env.LINK_KEY ?? '').digest('hex'), hasLink: !!process.env.LINK_KEY, url: process.env.APP_URL, vars: Object.keys(process.env).sort() });
  if (req.url === '/notes' && req.method === 'POST') { db.prepare('insert into notes (person, text) values (?, ?)').run(who.id, String(body.text)); return send(201, { ok: true }); }
  if (req.url === '/notes') return send(200, { rows: db.prepare('select text from notes where person = ? order by id').all(who.id).map((r) => r.text) });
  if (req.url === '/ask') { const r = await hydor('ai', { tier: 'quick', messages: [{ role: 'user', content: String(body.text) }] }, { 'x-hydor-person': req.headers['x-hydor-person'] }); return send(200, r); }
  if (req.url === '/similar') return send(200, await hydor('embed', { texts: [String(body.text)], kind: 'query' }));
  if (req.url === '/remind') return send(200, await hydor('mail', { to: [String(body.to)], subject: 'Your bike is ready', text: 'Come and get it.' }, { 'idempotency-key': String(body.key ?? crypto.randomUUID()) }));
  send(404, { error: 'not here' });
});
server.listen(Number(process.env.PORT), process.env.HOST);
process.on('SIGTERM', () => { server.close(() => { db.close(); fs.writeFileSync(path.join(dir, 'stopped'), 'politely'); process.exit(0); }); server.closeAllConnections(); });
`;
const FILE = {
  name: "Repair desk",
  start: "node --disable-warning=ExperimentalWarning server.mjs",
  env: { port: "PORT", data: "DATA_DIR", url: "APP_URL", secret: "APP_SECRET" },
  ready: "/health",
  signIn: "hydor",
  keys: [
    { name: "SMS_KEY", from: "Texts Inc", why: "Sends a text when a bike is ready.", how: ["Open the console", "Make a key"], url: "https://texts.example/keys", optional: true },
    { name: "LINK_KEY", from: "made", why: "Signs the links it makes." },
  ],
  services: { ai: { tiers: ["quick"], usdPerDay: 0.5, try: { method: "POST", path: "/ask", body: { text: "flat tyre" } } }, embed: { try: { method: "POST", path: "/similar", body: { text: "tyre" } } }, mail: { try: { method: "POST", path: "/remind", body: { to: "sam@example.test" } } } },
  database: { file: "desk.db", sqlite: true },
};
const deskDir = path.join(scratch, "desk");
fs.mkdirSync(deskDir);
fs.writeFileSync(path.join(deskDir, "server.mjs"), SERVER);
let desk!: WebAppDetail;
const alice: Person = { id: "owner", name: "Dana", role: "owner" };
const bob: Person = { id: "bob", name: "Bob", role: "member" };

await step("a folder is registered by its hydor.json, and one that cannot be used says what is wrong in plain sentences", async () => {
  assert.match((await call("POST", "/api/webapps", { folder: deskDir })).json.error, /no hydor\.json/);
  fs.writeFileSync(path.join(deskDir, "hydor.json"), JSON.stringify({ ...FILE, start: "npm i && node server.mjs", ready: "health" }));
  const bad = await call("POST", "/api/webapps", { folder: deskDir });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error, /cannot be used yet:\n- “start” should be one command[\s\S]*\n- “ready” should be an address/);
  fs.writeFileSync(path.join(deskDir, "hydor.json"), JSON.stringify(FILE, null, 2));
  desk = await register(deskDir);
  assert.deepEqual([desk.name, desk.stage, desk.shape.ok, desk.shape.signIn, desk.shape.database, desk.shape.keys], ["Repair desk", "build", true, "hydor", { file: "desk.db", sqlite: true }, 2]);
  assert.deepEqual(desk.mode, { launched: false, runsAs: "built" });
  assert.ok(desk.project, "it is a project");
  assert.deepEqual([desk.ai?.asks, desk.mail?.state, desk.meaning?.texts], [["quick"], "ask", 0]);
  // It lets Hydor say who is there, so there is no server for it.
  const server = await call("POST", `/api/webapps/${desk.id}/launch/server`, { host: "h", address: "https://x.example" });
  assert.equal(server.status, 409);
  assert.equal(server.json.error, SERVER_NEEDS_ACCOUNTS);
});

await step("Hydor's check tries every claim on a copy, in the sandbox: all pass, the folder is not touched, and nothing real is asked", async () => {
  const before = fs.readdirSync(deskDir).sort();
  const c = await check(desk.id);
  printCheck(c);
  assert.deepEqual(c.lines.filter((l) => l.group === "contract").map((l) => [l.id, l.state]), ["file", "build", "ready", "loopback", "signin", "secrets", "ai", "embed", "mail", "stop", "data", "writes"].map((id) => [id, "passed"]));
  assert.deepEqual(c.lines.filter(stopsLaunch), [], "and nothing on its pages stops a launch");
  assert.deepEqual(fs.readdirSync(deskDir).sort(), before);
  assert.deepEqual([modelAsked.length, mails.length], [0, 0], "the stand-in answered, never Hydor");
});

await step("the version being changed, through Hydor's proxy as two people: each is who Hydor says, a forged header from the browser is nothing, each keeps their own notes", async () => {
  const a = await open(desk, "preview", alice);
  const b = await open(desk, "preview", bob);
  assert.deepEqual([(await a.ask("GET", "/me")).json.name, (await b.ask("GET", "/me")).json.name], ["Dana", "Bob"]);
  assert.equal((await b.ask("GET", "/me", { headers: { "x-hydor-person": "forged.value" } })).json.id, "bob");
  assert.equal((await a.ask("POST", "/notes", { body: { text: "patch the front tyre" } })).status, 201);
  assert.equal((await b.ask("POST", "/notes", { body: { text: "order brake pads" } })).status, 201);
  assert.deepEqual([(await a.ask("GET", "/notes")).json.rows, (await b.ask("GET", "/notes")).json.rows], [["patch the front tyre"], ["order brake pads"]]);
  const s = web.parts().host!.status(desk.id);
  assert.deepEqual([s.state, s.sandboxed], ["running", sandboxAvailable()?.kind === "bwrap"]);
});

let previewLink = "";
await step("keys: the app's own, by name, given at start; a made one Hydor makes; nothing of Hydor's else comes along", async () => {
  const list = (await call<WebAppKeys>("GET", `/api/webapps/${desk.id}/keys?env=hydor`)).json;
  assert.deepEqual(list.keys.map((k) => [k.name, k.givenBy, k.needed, k.set]), [["SMS_KEY", "provider", false, false], ["LINK_KEY", "made", true, false]]);
  saveAppKey(db, desk.id, "hydor", "SMS_KEY", "sms-standin-value-0123456789");
  await web.parts().host!.stop(desk.id);
  const a = await open(desk, "preview", alice);
  const got = (await a.ask("GET", "/keys")).json;
  assert.deepEqual([got.sms, got.hasLink], [28, true]);
  previewLink = got.link;
  assert.equal(got.url, `http://${desk.slug}.localhost:${APPS_PORT}`);
  assert.deepEqual(got.vars.filter((v: string) => !["PWD"].includes(v)), ["APP_SECRET", "APP_URL", "DATA_DIR", "HOME", "HOST", "HYDOR_APP_KEY", "HYDOR_APP_PROCESS", "HYDOR_APP_SLUG", "HYDOR_URL", "LINK_KEY", "NODE_ENV", "NODE_OPTIONS", "PATH", "PORT", "SMS_KEY"]);
  assert.ok(!JSON.stringify(web.parts().host!.status(desk.id).log).includes("sms-standin-value"));
  const card = await call("POST", `/api/webapps/${desk.id}/keys/card`, { env: "hydor", names: ["SMS_KEY"], replace: true });
  assert.equal(card.json.card.items[0].title, "Texts Inc", card.text);
});

await step("the three services through Hydor's own routes, with the app's key: a model once the owner allows it, vectors, and mail kept until allowed", async () => {
  const a = await open(desk, "preview", alice);
  assert.equal((await a.ask("POST", "/ask", { body: { text: "x" } })).json.status, 403, "not allowed yet");
  assert.equal((await call("PUT", `/api/webapps/${desk.id}`, { settings: { tiers: ["quick"], dailyCapUsd: 1 } })).status, 200);
  const asked = (await a.ask("POST", "/ask", { body: { text: "flat tyre?" } })).json;
  assert.deepEqual([asked.status, asked.body.text, asked.body.model], [200, "A flat tyre: patch it.", "scripted-quick"]);
  assert.equal(modelAsked.at(-1)!.messages.at(-1)!.content, "flat tyre?");
  const similar = (await a.ask("POST", "/similar", { body: { text: "tyre" } })).json;
  assert.deepEqual([similar.status, similar.body.dim, Buffer.from(similar.body.vectors[0], "base64").length], [200, DIM, DIM * 4]);
  assert.equal((await a.ask("POST", "/remind", { body: { to: "sam@example.test" } })).json.status, 501, "being made: mail is kept in the app");
  assert.equal(mails.length, 0);
});

await step("launched inside Hydor: the commit, built and checked against hydor.json, with data and a made key of its own; the one being changed keeps its own", async () => {
  await launch(desk.id);
  desk = await appOf(desk.id);
  assert.equal(desk.mode.launched, true);
  const a = await open(desk, "launched", alice);
  const b = await open(desk, "launched", bob);
  assert.deepEqual((await a.ask("GET", "/notes")).json.rows, [], "the launched version starts with data of its own");
  assert.equal((await a.ask("POST", "/notes", { body: { text: "first launched note" } })).status, 201);
  assert.equal((await b.ask("POST", "/notes", { body: { text: "bob's launched note" } })).status, 201);
  assert.deepEqual((await a.ask("GET", "/notes")).json.rows, ["first launched note"]);
  assert.notEqual((await a.ask("GET", "/keys")).json.link, previewLink, "each side has a made key of its own");
  const p = await open(desk, "preview", alice);
  assert.deepEqual((await p.ask("GET", "/notes")).json.rows, ["patch the front tyre"], "and the version being changed has what it had");
  const view = (await call<WebAppLaunchView>("GET", `/api/webapps/${desk.id}/launch`)).json;
  assert.deepEqual(view.places.map((x) => [x.id, x.state]), [["hydor", "ready"], ["server", "unavailable"]]);
  assert.deepEqual([view.envs, view.hosts, view.blocked], [[], [], null]);
});

await step("a change being made takes nothing from the launched version: a hydor.json that is broken, or lists no service, leaves the launched one its model", async () => {
  const file = path.join(deskDir, "hydor.json");
  fs.writeFileSync(file, "{ half written");
  const a = await open(desk, "launched", alice);
  assert.equal((await a.ask("POST", "/ask", { body: { text: "still there?" } })).json.status, 200);
  assert.equal((await appOf(desk.id)).shape.ok, false);
  fs.writeFileSync(file, JSON.stringify(FILE, null, 2));
});

await step("mail from the launched version goes once the owner allows it, from their account", async () => {
  const account = (await call("GET", `/api/webapps/${desk.id}/mail`)).json.accounts[0];
  assert.equal((await call("PUT", `/api/webapps/${desk.id}`, { settings: { mail: { on: true, account: account.id, perDay: 5 } } })).status, 200);
  const a = await open(desk, "launched", alice);
  assert.equal((await a.ask("POST", "/remind", { body: { to: "sam@example.test" } })).json.body.status, "sent");
  assert.deepEqual(mails.map((m) => m.to), [["sam@example.test"]]);
  assert.match(mails[0].data, /Subject: Your bike is ready/);
});

await step("a backup while it runs (SQLite's own), a row changed, the backup put back; the Data tab reads the file hydor.json names", async () => {
  const a = await open(desk, "launched", alice);
  await a.ask("POST", "/notes", { body: { text: "kept in the backup" } });
  const pid = liveStatus(desk).pid;
  const b = await backup(desk);
  assert.equal(liveStatus(desk).pid, pid, "it ran all along");
  assert.deepEqual([b.stopped, b.tables.notes], [undefined, 3]);
  await a.ask("POST", "/notes", { body: { text: "written after" } });
  await restore(desk, b.id);
  assert.deepEqual((await (await open(desk, "launched", alice)).ask("GET", "/notes")).json.rows, ["first launched note", "kept in the backup"]);
  const tables = (await call("GET", `/api/webapps/${desk.id}/data?side=launched`)).json;
  assert.deepEqual([tables.file, tables.tables.map((t: { name: string; rows: number }) => [t.name, t.rows])], ["desk.db", [["notes", 3]]]);
});

await step("it is told to stop and stops by itself inside the sandbox (the app writes what it writes on the way out), and restarts", async () => {
  const live = path.join(dataDir, "webapps", `${desk.id}_live`, "data");
  fs.rmSync(path.join(live, "stopped"), { force: true });
  await (await open(desk, "launched", alice)).ask("GET", "/me");
  await (await open(desk, "preview", alice)).ask("GET", "/me");
  await restartAndStop(desk);
  assert.equal(fs.readFileSync(path.join(live, "stopped"), "utf8"), "politely");
});

await step("an app that names no database is stopped while its folder is copied, said in the record, and a file's name cannot make tar run anything", async () => {
  const { database: _, ...without } = FILE;
  fs.writeFileSync(path.join(deskDir, "hydor.json"), JSON.stringify(without, null, 2));
  await launch(desk.id);
  const live = path.join(dataDir, "webapps", `${desk.id}_live`, "data");
  // Names that GNU tar would read as options that run a command, put there as the app itself could.
  const marker = path.join(scratch, "ran-outside");
  fs.writeFileSync(path.join(live, "--checkpoint=1"), "");
  fs.writeFileSync(path.join(live, `--checkpoint-action=exec=touch ${marker.replaceAll("/", "?")}`), "");
  fs.writeFileSync(path.join(live, "--checkpoint-action=exec=sh run"), "");
  fs.writeFileSync(path.join(live, "run"), `touch ${marker}\n`);
  fs.writeFileSync(path.join(live, "@archive"), "x");
  await (await open(desk, "launched", alice)).ask("GET", "/me");
  assert.equal(liveStatus(desk).state, "running");
  const pid = liveStatus(desk).pid;
  const b = await backup(desk);
  assert.equal(b.stopped, true);
  assert.deepEqual(b.tables, {});
  assert.notEqual(liveStatus(desk).pid, pid, "stopped for the copy and started again");
  assert.equal(liveStatus(desk).state, "running");
  assert.ok(!fs.existsSync(marker) && !fs.existsSync(path.join(live, "ran-outside")), "nothing ran");
  await (await open(desk, "launched", alice)).ask("POST", "/notes", { body: { text: "after the stopped copy" } });
  await restore(desk, b.id);
  assert.ok(!(await (await open(desk, "launched", alice)).ask("GET", "/notes")).json.rows.includes("after the stopped copy"));
  assert.equal(fs.existsSync(path.join(live, "--checkpoint=1")), true, "and the files came back under their own names");
  fs.writeFileSync(path.join(deskDir, "hydor.json"), JSON.stringify(FILE, null, 2));
});

await step("the agents' tools say it as it is: where it stands, the check's lines, and the pages in a dozen lines", async () => {
  const ctx = { runId: "r", key: "k", agent: "claude", cwd: deskDir, deps } as unknown as RunCtx;
  const tools = Object.fromEntries(web.tools!(ctx).map((t) => [t.name, t])) as Record<string, RunTool>;
  const run = async (n: string, a: Record<string, unknown> = {}) => {
    const r = await tools[n].run(a, ctx);
    return typeof r === "string" ? { text: r, isError: false } : r;
  };
  const got = await run("webapp_get");
  assert.match(got.text, /Stage: /);
  assert.match(got.text, /sign-in by Hydor .* database desk\.db \(SQLite\); 2 key\(s\); services: ai, embed, mail\./);
  const checked = await run("webapp_contract_check");
  assert.match(checked.text, /Passed: file, build, ready, loopback, signin, secrets, ai, embed, mail, stop, data, writes\./);
  assert.match(checked.text, /Page checks: \d+ lines on \d+ pages?/);
});

await step("a new app is made before a line of it is written, as a folder, a repository and a project, and shows as being made", async () => {
  const r = await call("POST", "/api/webapps/scratch", { name: "Dough sums" });
  assert.equal(r.status, 200, r.text);
  const a: WebAppDetail = r.json.app;
  assert.deepEqual([a.stage, a.shape.ok, a.name, r.json.folder === a.folder, fs.existsSync(path.join(a.folder, ".git")), !!a.project], ["brief", false, "Dough sums", true, true, true]);
  assert.match(a.shape.problem!, /has no hydor\.json yet/);
  assert.equal((await call("POST", `/api/webapps/${a.id}/start`)).status, 409);
  assert.equal((await call("POST", "/api/webapps/scratch", { name: "Again", folder: deskDir })).status, 409);
  const note = web.spawn!({ key: "s1", cwd: a.folder, extra: { webKind: { name: "Dough sums", line: "Work out how much flour.", app: a.id } } } as never, deps) as { instructions: string[] };
  assert.match(note.instructions[0], new RegExp(`A web app is made for it already \\(id ${a.id}\\), and its folder`));
  assert.match(note.instructions[0], /the name they gave it: “Dough sums”; what they said it is for: “Work out how much flour\.”/);
  assert.match(note.instructions[0], /the contract the app meets is \/.*references\/hydor-contract\.md/);
  assert.equal((await call("DELETE", `/api/webapps/${a.id}`)).status, 200);
});

await step("a launch runs the same check on the commit: a failed line is put to the person, let through by name and written down; the way back starts the one before on the data as it is", async () => {
  await web.parts().host!.stop(`${desk.id}_live`);
  fs.writeFileSync(path.join(deskDir, "server.mjs"), `${SERVER}fs.writeFileSync(new URL('./cache.txt', import.meta.url), 'x');\n`);
  fs.rmSync(path.join(deskDir, "cache.txt"), { force: true });
  const r = await call("POST", `/api/webapps/${desk.id}/launch/hydor`, {});
  assert.equal(r.status, 200, r.text);
  let job!: LaunchJob;
  await until("the question", async () => (job = (await call("GET", `/api/webapps/${desk.id}/launch/job`)).json.job).state !== "running");
  assert.equal(job.state, "asking", JSON.stringify(job, null, 1));
  assert.deepEqual(job.ask?.kind === "override" && job.ask.stops.map((x) => x.id), ["writes"]);
  say(job.ask?.kind === "override" ? job.ask.stops.map((x) => `${x.title}: ${x.text}`).join("\n") : "");
  assert.equal((await call("POST", `/api/webapps/${desk.id}/launch/answer`, { override: ["ready"] })).status, 400);
  assert.equal((await call("POST", `/api/webapps/${desk.id}/launch/answer`, { override: ["writes"] })).status, 200);
  // Let through, but the folder is read-only in the sandbox: it falls as it starts, and the version before comes back by itself.
  await until("the launch", async () => ["done", "failed"].includes((job = (await call("GET", `/api/webapps/${desk.id}/launch/job`)).json.job).state));
  if (sandboxAvailable()?.kind === "bwrap") {
    assert.equal(job.state, "failed", JSON.stringify(job));
    assert.equal(job.previousBack, true, JSON.stringify(job.problems));
    assert.equal((await (await open(desk, "launched", alice)).ask("GET", "/me")).status, 200);
  }
  fs.writeFileSync(path.join(deskDir, "server.mjs"), SERVER);
  fs.rmSync(path.join(deskDir, "cache.txt"), { force: true });
  await launch(desk.id);
  const view = (await call<WebAppLaunchView>("GET", `/api/webapps/${desk.id}/launch`)).json;
  assert.ok(view.hydor.previous, "there is one to go back to");
  const back = await call("POST", `/api/webapps/${desk.id}/launch/back`, {});
  assert.equal(back.status, 200, back.text);
  await until("the way back", async () => ["done", "failed"].includes((job = (await call("GET", `/api/webapps/${desk.id}/launch/job`)).json.job).state));
  assert.equal(job.state, "done", JSON.stringify(job));
  assert.equal((await (await open(desk, "launched", alice)).ask("GET", "/me")).status, 200);
});

await step("with nothing to launch (it never says it is ready), nothing is let through and what runs is not touched", async () => {
  fs.writeFileSync(path.join(deskDir, "server.mjs"), "process.exit(1);\n");
  const pid = liveStatus(desk).pid;
  await call("POST", `/api/webapps/${desk.id}/launch/hydor`, {});
  let job!: LaunchJob;
  await until("the launch", async () => ["done", "failed", "asking"].includes((job = (await call("GET", `/api/webapps/${desk.id}/launch/job`)).json.job).state));
  assert.equal(job.state, "failed", JSON.stringify(job));
  assert.match(job.summary!, /There is nothing to launch yet: It starts and says it is ready/);
  assert.equal(liveStatus(desk).pid, pid);
  fs.writeFileSync(path.join(deskDir, "server.mjs"), SERVER);
});

await step("a development command runs the version being changed, in a folder it may write in, with data outside it; the launched one runs the production command", async () => {
  const dir = path.join(scratch, "sketchbook");
  fs.mkdirSync(dir);
  const serve = (word: string, more = "") => `import http from 'node:http';\nimport fs from 'node:fs';\n${more}http.createServer((q, s) => s.end(JSON.stringify({ word: '${word}', env: process.env.NODE_ENV, data: process.env.DATA_DIR }))).listen(Number(process.env.PORT), process.env.HOST);\nprocess.on('SIGTERM', () => process.exit(0));\n`;
  fs.writeFileSync(path.join(dir, "prod.mjs"), serve("production"));
  fs.writeFileSync(path.join(dir, "dev.mjs"), serve("development", "fs.writeFileSync('dev-cache', 'x');\n"));
  fs.writeFileSync(path.join(dir, ".gitignore"), "dev-cache\n");
  fs.writeFileSync(path.join(dir, "hydor.json"), JSON.stringify({ start: "node prod.mjs", dev: "node dev.mjs", env: { port: "PORT", data: "DATA_DIR" }, ready: "/", signIn: "own" }));
  const a = await register(dir);
  assert.deepEqual([a.mode.runsAs, a.shape.dev, a.shape.build, a.shape.database], ["dev", true, false, null]);
  const p = (await (await open(a, "preview")).ask("GET", "/")).json;
  assert.deepEqual([p.word, p.env, p.data], ["development", "development", path.join(dataDir, "webapps", a.id, "data")]);
  assert.ok(fs.existsSync(path.join(dir, "dev-cache")));
  assert.equal((await call("GET", `/api/webapps/${a.id}/data`)).status, 404, "it names no database");
  await build(a.id);
  await launch(a.id);
  const l = (await (await open(a, "launched")).ask("GET", "/")).json;
  assert.deepEqual([l.word, l.env, l.data], ["production", "production", path.join(dataDir, "webapps", `${a.id}_live`, "data")]);
  assert.equal((await (await open(a, "preview")).ask("GET", "/")).json.word, "development");
  assert.equal((await call("DELETE", `/api/webapps/${a.id}?data=1`)).status, 200);
});

await step("after a crash, an app that was left running is known by the mark in its environment and stopped; another process is left alone", async () => {
  const root = path.join(scratch, "sweep");
  const start = (id: string, mark: string) => {
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { env: { PATH: process.env.PATH, HYDOR_APP_PROCESS: mark }, detached: true, stdio: "ignore" });
    writePid(root, id, child.pid!, scratch);
    // As if the Hydor that wrote it were gone.
    const file = path.join(root, id, "pid");
    fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, "utf8")), server: { pid: 999_999_9, start: "0" } }));
    return child;
  };
  const left = start("aaaa", "aaaa");
  const other = start("bbbb", "not-it");
  const swept = await sweepOrphans(root, { killAfterMs: 2000 });
  assert.deepEqual(swept.map((x) => [x.id, x.result]).sort(), process.platform === "linux" ? [["aaaa", "stopped"], ["bbbb", "gone"]] : swept.map((x) => [x.id, x.result]).sort());
  await sleep(200);
  if (process.platform === "linux") assert.deepEqual([left.exitCode !== null || left.signalCode !== null, other.exitCode === null && other.signalCode === null], [true, true]);
  other.kill("SIGKILL");
  left.kill("SIGKILL");
});

await step("forgetting it takes its keys and, when asked, what Hydor kept; its folder stays", async () => {
  const r = await call("DELETE", `/api/webapps/${desk.id}?data=1`);
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json.keysRemoved.sort(), ["LINK_KEY", "SMS_KEY"]);
  assert.ok(fs.existsSync(path.join(deskDir, "server.mjs")) && !fs.existsSync(path.join(dataDir, "webapps", desk.id)));
});

// ---- 2 and 3. two apps built by agents, with accounts of their own ------------------------------------------------------------

/** A copy of one of the fixtures' apps (without what npm or git made) in the scratch folder. */
function copyOf(name: string): string {
  const from = path.join(APP_ROOT, "server", "webapps", "fixtures", "apps", name);
  const to = path.join(scratch, name);
  fs.cpSync(from, to, { recursive: true, filter: (src) => !["node_modules", ".git", "data"].includes(path.relative(from, src).split(path.sep)[0]) });
  return to;
}
const account = (name: string) => ({ name, email: `${name.toLowerCase()}@example.test`, password: "a-long-password-1" });

interface Proof {
  name: string;
  /** Its folder under fixtures/apps/. */
  folder: string;
  /** Its build takes packages from the network. */
  network?: boolean;
  /** Uses a side of it as two people; returns how to change one row and how to read it back. */
  use(a: Browser, b: Browser, tag: string): Promise<{ read(): Promise<string>; change(to: string): Promise<void>; was: string }>;
  /** Signs the same two in again (after a restart or a restore). */
  again(a: Browser): Promise<void>;
  /** An account made on one side does not exist on the other. */
  tables: string[];
}

const food: Proof = {
  name: "the food bank (accounts of its own, two lists, photos; plain Node)",
  folder: "food-bank",
  tables: ["stock", "deliveries", "users"],
  async again(a) {
    assert.equal((await a.ask("POST", "/api/sign-in", { body: account("Ana") })).status, 200);
  },
  async use(a, b, tag) {
    const first = await a.ask("POST", "/api/sign-up", { body: account("Ana") });
    assert.deepEqual([first.status, first.json?.role], [201, "coordinator"], first.text);
    const code = /<strong class="code">([A-Z0-9]+)<\/strong>/.exec((await a.ask("GET", "/team")).text)![1];
    assert.equal((await b.ask("POST", "/api/sign-up", { body: account("Ben") })).status, 403, "no team code, no account");
    const second = await b.ask("POST", "/api/sign-up", { body: { ...account("Ben"), code } });
    assert.deepEqual([second.status, second.json?.role], [201, "volunteer"], second.text);
    const added = await b.ask("POST", "/api/stock", { body: { name: `Beans ${tag}`, category: "tinned", quantity: 12 } });
    assert.equal(added.status, 201, added.text);
    const id = added.json.id;
    assert.ok((await a.ask("GET", "/api/stock")).json.rows.some((r: { name: string }) => r.name === `Beans ${tag}`), "the second person's row is the first one's too");
    assert.equal((await a.ask("POST", "/api/deliveries", { body: { stockId: id, from: "Corner shop", arrived: "2026-11-20", kilos: 5, putAway: false } })).status, 201);
    // A photo, through the app's own form.
    const form = new FormData();
    for (const [k, v] of Object.entries({ name: `Jam ${tag}`, category: "tinned", quantity: "3", bestBefore: "", notes: "" })) form.set(k, v);
    form.set("photo", new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64")], { type: "image/png" }), "jam.png");
    const packed = new Response(form);
    const sent = await a.ask("POST", "/stock", { raw: Buffer.from(await packed.arrayBuffer()), type: packed.headers.get("content-type")! });
    assert.equal(sent.status, 303, sent.text);
    const jam = (await b.ask("GET", "/api/stock")).json.rows.find((r: { name: string }) => r.name === `Jam ${tag}`);
    const photo = await b.ask("GET", jam.photo.startsWith("/") ? jam.photo : `/photos/${jam.photo}`);
    assert.deepEqual([photo.status, photo.headers["content-type"]], [200, "image/png"]);
    return {
      was: "12",
      read: async () => String((await a.ask("GET", `/api/stock/${id}`)).json.quantity),
      change: async (to) => assert.equal((await a.ask("PATCH", `/api/stock/${id}`, { body: { quantity: Number(to) } })).status, 200),
    };
  },
};

const crews: Proof = {
  name: "the crews (accounts, crews, invitations; Express, installed by its build)",
  folder: "crews",
  network: true,
  tables: ["users", "crews", "memberships", "invitations", "customers"],
  async again(a) {
    assert.equal((await a.ask("POST", "/api/sign-in", { body: account("Lee") })).status, 200);
  },
  async use(a, b, tag) {
    assert.equal((await a.ask("POST", "/api/sign-up", { body: account("Lee") })).status, 201);
    const crew = (await a.ask("POST", "/api/crews", { body: { name: `Roofers ${tag}` } })).json;
    const invited = await a.ask("POST", "/api/invitations", { body: { crew: crew.id, email: account("Mo").email, role: "member" } });
    assert.equal(invited.status, 201, invited.text);
    assert.ok(invited.json.link.startsWith(`http://${a.host.replace("--preview", "")}/invite/`), `a link the app writes points at the address Hydor gave it: ${invited.json.link}`);
    assert.equal((await b.ask("POST", "/api/sign-up", { body: account("Mo") })).status, 201);
    assert.equal((await b.ask("GET", `/api/customers?crew=${crew.id}`)).status, 404, "not in the crew yet");
    const accepted = await b.ask("POST", `/api/invitations/${invited.json.link.split("/").pop()}/accept`, { body: {} });
    assert.equal(accepted.status, 200, accepted.text);
    const added = await b.ask("POST", "/api/customers", { body: { crew: crew.id, name: `Mrs Ward ${tag}`, address: "2 Mill Lane" } });
    assert.equal(added.status, 201, added.text);
    const id = added.json.id;
    assert.ok((await a.ask("GET", "/api/customers")).json.rows.some((r: { name: string }) => r.name === `Mrs Ward ${tag}`));
    return {
      was: `Mrs Ward ${tag}`,
      read: async () => (await a.ask("GET", `/api/customers/${id}`)).json.name,
      change: async (to) => assert.equal((await a.ask("PATCH", `/api/customers/${id}`, { body: { name: to } })).status, 200),
    };
  },
};

for (const proof of [food, crews]) {
  if (proof.network && process.env.HYDOR_PROOF_NETWORK !== "1") {
    console.log(`skipped - ${proof.name}: its build needs the network (HYDOR_PROOF_NETWORK=1)`);
    continue;
  }
  const folder = copyOf(proof.folder);
  let a!: WebAppDetail;
  await step(`${proof.name}: registered by its hydor.json, and checked`, async () => {
    a = await register(folder);
    assert.deepEqual([a.shape.ok, a.shape.signIn], [true, "own"]);
    const c = await check(a.id);
    printCheck(c);
    assert.deepEqual(c.lines.filter(stopsLaunch), [], c.pagesSummary);
    assert.equal(c.signedIn, undefined, "a test person was made as its hydor.json says, and signed-in pages were looked at");
    if (a.shape.build) await build(a.id);
  });
  await step(`${proof.name}: the version being changed, used through the proxy by two people`, async () => {
    const one = await open(a, "preview");
    const two = await open(a, "preview");
    await proof.use(one, two, "preview");
    // A page of another origin cannot act with the person's cookies: the app sees whose page it was.
    assert.equal((await one.ask("POST", "/api/sign-out", { body: {}, from: "http://another.localhost:4799" })).status, 403);
    // Shown in a frame of Hydor's page (Preview), its own cookies are ones a browser keeps there.
    const framed = await open(a, "preview", owner, "http://localhost:8790");
    const signed = await framed.ask("POST", "/api/sign-in", { body: account(proof === food ? "Ana" : "Lee") });
    const cookie = (signed.headers["set-cookie"] ?? [])[0] ?? "";
    assert.match(cookie, /; SameSite=None; Secure; Partitioned$/, cookie);
    assert.doesNotMatch(cookie, /SameSite=Lax/i);
    const data = (await call("GET", `/api/webapps/${a.id}/data`)).json;
    for (const t of proof.tables) assert.ok(data.tables.some((x: { name: string }) => x.name === t), `${t} in ${JSON.stringify(data.tables)}`);
  });
  await step(`${proof.name}: launched inside Hydor, with data of its own, and used by two people`, async () => {
    await launch(a.id);
    a = await appOf(a.id);
    const probe = await open(a, "launched");
    assert.equal((await probe.ask("POST", "/api/sign-in", { body: account(proof === food ? "Ana" : "Lee") })).status < 300, false, "the preview's account is not here");
    const one = await open(a, "launched");
    const two = await open(a, "launched");
    const row = await proof.use(one, two, "live");
    assert.equal(await row.read(), row.was);

    const kept = await backup(a);
    assert.equal(kept.stopped, undefined, "its SQLite file is copied while it runs");
    say(`backup ${kept.id}: ${Object.entries(kept.tables).map(([k, n]) => `${k} ${n}`).join(", ")}; ${kept.files ?? 0} other file(s)`);
    await row.change(proof === food ? "99" : "Someone else");
    assert.notEqual(await row.read(), row.was);
    await restore(a, kept.id);
    assert.equal(await row.read(), row.was, "the backup put the row back (the session from before it too)");

    await restartAndStop(a);
    const back = await open(a, "launched");
    await proof.again(back);
    // The preview kept its own rows through all of it.
    const p = await open(a, "preview");
    await proof.again(p);
    await web.parts().host!.stop(a.id);
  });
  await step(`${proof.name}: forgotten, its folder untouched`, async () => {
    assert.equal((await call("DELETE", `/api/webapps/${a.id}?data=1`)).status, 200);
    assert.ok(fs.existsSync(path.join(folder, "server.js")));
  });
}

await web.stop!(null as never);
await server.close();
model.close();
for (const s of sockets) s.destroy();
smtp.close();
fs.rmSync(scratch, { recursive: true, force: true });
console.log(`\n${passed} checks passed`);
process.exit(0);
