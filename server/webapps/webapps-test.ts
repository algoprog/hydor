// Checks for the web apps feature (index.ts) as a real instance: the routes against a database and the apps' own server
// on a port, with small fixture apps (a hydor.json and a build line that makes a server): registering, the build job
// (failing, slow, done; one at a time; never with Hydor's own environment), start and stop, opening by hostname, by a
// domain and by a path with a token (the address signs the person in), what is kept when an app is forgotten, web apps
// turned off, and the shutdown through the features' registry. Ports 4330 to 4336. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/webapps/webapps-test.ts
//   DATA_DIR=<scratch folder> node dist/dev/webapps-test.js
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import type { WebApp, WebAppDetail, WebAppOpen, WebAppsList } from "../../shared/webapps.ts";
import { sandboxAvailable } from "../agent/sandbox.ts";
import { HttpError } from "../auth.ts";
import { kvSet, openDb, type DB } from "../db.ts";
import { registerFeatures, startFeatures, stopFeatures } from "../features/registry.ts";
import type { Deps } from "../features/types.ts";
import { appAddressOf, createWebapps, IDLE_MS, idleMsFromEnv, type Webapps, type WebappsOptions } from "./index.ts";
import { allowFrameBy, carryPathWay, frameOrigin } from "./proxy.ts";
import { processInfo } from "./sweep.ts";
import { writeTestApp } from "./test-apps.ts";

if (!process.env.DATA_DIR?.startsWith("/tmp/")) {
  console.error("Run with DATA_DIR=/tmp/… so nothing touches real data.");
  process.exit(2);
}

const scratch = fs.mkdtempSync(path.join(process.env.DATA_DIR, "webapps-"));
const PORT = 4330;
const PORT_B = 4334;

let passed = 0;
const step = async (name: string, fn: () => Promise<void> | void) => {
  await fn();
  passed++;
  console.log(`ok - ${name}`);
};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const until = async (what: string, fn: () => Promise<boolean> | boolean, ms = 10_000) => {
  const t = Date.now();
  while (!(await fn())) {
    if (Date.now() - t > ms) assert.fail(`Waited ${ms} ms for ${what}`);
    await sleep(60);
  }
};

// A canary: nothing of this may reach a build or an app.
process.env.HYDOR_CANARY_KEY = "canary-value-from-hydor";
process.env.ANTHROPIC_API_KEY = "sk-canary";

// ---- fixture apps -------------------------------------------------------------------------------------------------

/** The server a fixture build makes: health, and who the signed header says is there (checked with the app's secret). */
const SERVER = String.raw`import http from 'node:http';
import crypto from 'node:crypto';
const secret = process.env.APP_SECRET || '';
function person(h) {
  const [payload, sig] = String(h || '').split('.');
  if (!payload || !sig) return null;
  const want = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (sig !== want) return null;
  const p = JSON.parse(Buffer.from(payload, 'base64url').toString());
  return p.exp * 1000 > Date.now() ? p : null;
}
http.createServer((req, res) => {
  const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.url === '/api/health') return send(200, { ok: true });
  if (req.url.split('?')[0] === '/whoami') {
    const p = person(req.headers['x-hydor-person']);
    return p ? send(200, { id: p.id, name: p.name, role: p.role }) : send(401, { error: 'nobody' });
  }
  if (req.url === '/headers') return send(200, { cookie: req.headers.cookie ?? null });
  if (req.url === '/framed') { res.writeHead(200, { 'content-type': 'text/plain', 'content-security-policy': "frame-ancestors 'self'; img-src 'self'", 'x-frame-options': 'DENY' }); return res.end('framed'); }
  send(404, { error: 'not here' });
}).listen(Number(process.env.PORT), '127.0.0.1');
`;

type Build = "ok" | "fail" | "slow" | "nobuild";
/** An app in its own folder, whose build does what `how` says (`nobuild`: it has nothing to build). */
function fixture(name: string, how: Build = "ok", more: Record<string, unknown> = {}): string {
  const dir = path.join(scratch, "apps", name);
  writeTestApp(dir, SERVER, { name, ...(how === "nobuild" ? {} : { build: "node build.mjs" }), ...more });
  // Only a build puts the server there.
  if (how !== "nobuild") fs.rmSync(path.join(dir, ".output"), { recursive: true });
  const make = `
import fs from 'node:fs';
fs.mkdirSync('.output/server', { recursive: true });
fs.writeFileSync('.output/server/index.mjs', ${JSON.stringify(SERVER)});
fs.writeFileSync('.output/build-env.json', JSON.stringify({ env: process.env, cwd: process.cwd() }));
`;
  const script: Record<string, string> = {
    ok: `console.log('compiling the app'); console.log('done');${make}`,
    fail: "console.log('compiling the app'); console.error('boom: something is wrong in src/page.tsx'); process.exit(3);",
    slow: `console.log('compiling the app');
await new Promise((r) => setTimeout(r, 1500));
console.log('almost there');${make}`,
  };
  if (how !== "nobuild") fs.writeFileSync(path.join(dir, "build.mjs"), script[how]);
  return dir;
}

// ---- an instance of the feature, with its own database and data folder ----------------------------------------------

interface Instance {
  feature: Webapps;
  app: FastifyInstance;
  db: DB;
  dataDir: string;
  events: unknown[];
  call<T = any>(method: string, url: string, body?: unknown, headers?: Record<string, string>): Promise<{ status: number; json: T }>;
}

async function instance(name: string, o: Partial<WebappsOptions> = {}, viaRegistry = false): Promise<Instance> {
  const dataDir = path.join(scratch, name, "hydor-data");
  fs.mkdirSync(dataDir, { recursive: true });
  const db = openDb(path.join(scratch, name, "test.db"));
  kvSet(db, "sharing:owner", "Dana");
  const app = Fastify();
  app.setErrorHandler((err: Error, _req, reply) => {
    const status = err instanceof HttpError ? err.status : 500;
    reply.code(status).send({ ...(err instanceof HttpError ? err.extra : undefined), error: err.message });
  });
  const events: unknown[] = [];
  const deps = { app, db, sessions: null as never, scheduler: null as never, models: null as never, broadcast: (e: unknown) => events.push(e), toSubscribers: () => {}, publicBase: () => "http://test.local" } as Deps;
  const feature = createWebapps({ dataDir, port: PORT, origin: "", domain: "", idleMs: 600_000, sandbox: true, ports: [4331, 4333], startTimeoutMs: 20_000, ...o });
  if (viaRegistry) {
    registerFeatures([feature], deps);
    startFeatures();
  } else {
    feature.routes!(deps);
  }
  await app.ready();
  if (!viaRegistry) feature.start!(deps);
  await feature.ready;
  return {
    feature,
    app,
    db,
    dataDir,
    events,
    async call(method, url, body, headers) {
      const r = await app.inject({ method: method as "GET", url, headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers }, payload: body === undefined ? undefined : JSON.stringify(body) });
      let json: any = null;
      try {
        json = r.json();
      } catch {}
      return { status: r.statusCode, json };
    },
  };
}
async function end(i: Instance) {
  await i.feature.stop!(null as never);
  await i.app.close();
  i.db.close();
}

// ---- a browser, as host-test's: a request to the apps' server with the Host it names ------------------------------

interface Answer {
  status: number;
  headers: http.IncomingHttpHeaders;
  text: string;
  json: () => any;
}
class Browser {
  jar = new Map<string, string>();
  constructor(readonly port: number) {}
  request(host: string, urlPath: string, o: { follow?: boolean; headers?: Record<string, string>; cookies?: boolean; method?: string; body?: string } = {}): Promise<Answer> {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = { host, ...o.headers };
      const jar = [...this.jar.entries()].filter(([k]) => k.startsWith(`${host.replace(/:\d+$/, "")}|`)).map(([k, v]) => `${k.split("|")[1]}=${v}`);
      if (jar.length && o.cookies !== false) headers.cookie = jar.join("; ");
      if (o.body !== undefined) headers["content-type"] ??= "application/json";
      const req = http.request({ host: "127.0.0.1", port: this.port, method: o.method ?? "GET", path: urlPath, headers, agent: false }, (res) => {
        for (const sc of res.headers["set-cookie"] ?? []) {
          const [pair] = sc.split(";");
          const i = pair.indexOf("=");
          this.jar.set(`${host.replace(/:\d+$/, "")}|${pair.slice(0, i)}`, decodeURIComponent(pair.slice(i + 1)));
        }
        const chunks: Buffer[] = [];
        res.on("data", (b: Buffer) => chunks.push(b));
        res.on("end", async () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const a: Answer = { status: res.statusCode ?? 0, headers: res.headers, text, json: () => JSON.parse(text) };
          if (o.follow !== false && a.status >= 300 && a.status < 400 && typeof res.headers.location === "string") return resolve(await this.request(host, res.headers.location, o));
          resolve(a);
        });
      });
      req.on("error", reject);
      req.end(o.body);
    });
  }
  /** Follows an address Hydor gave, as a browser would: its host and path go to the apps' server. */
  open(url: string, o: { follow?: boolean } = {}): Promise<Answer> {
    const u = new URL(url);
    return this.request(u.host, u.pathname + u.search, o);
  }
}

const portFree = (port: number) =>
  new Promise<boolean>((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.listen(port, "127.0.0.1", () => s.close(() => resolve(true)));
  });
const alive = (pid: number | null) => {
  if (!pid) return false;
  const i = processInfo(pid);
  return !!i && i.cmdline !== "";
};
const bwrap = sandboxAvailable()?.kind === "bwrap";
const open = (i: Instance, id: string, body: unknown = {}, headers: Record<string, string> = { origin: "http://localhost:8790" }) => i.call<WebAppOpen & { error: string }>("POST", `/api/webapps/${id}/open`, body, headers);
const get = async (i: Instance, id: string) => (await i.call<{ app: WebAppDetail }>("GET", `/api/webapps/${id}`)).json.app;
const built = (i: Instance, id: string, ms = 20_000) => until(`${id} to stop building`, async () => (await get(i, id)).build.state !== "building", ms);

let failed: unknown = null;
const instances: Instance[] = [];
try {
  // ---- the idle time ----------------------------------------------------------------------------------------------
  await step("APPS_IDLE_MINUTES sets how long an unused app is kept (default 15 minutes; only a number above 0 counts)", () => {
    assert.equal(IDLE_MS, 15 * 60_000);
    assert.equal(idleMsFromEnv({}), IDLE_MS);
    assert.equal(idleMsFromEnv({ APPS_IDLE_MINUTES: "" }), IDLE_MS);
    assert.equal(idleMsFromEnv({ APPS_IDLE_MINUTES: "2" }), 120_000);
    assert.equal(idleMsFromEnv({ APPS_IDLE_MINUTES: " 0.5 " }), 30_000);
    assert.equal(idleMsFromEnv({ APPS_IDLE_MINUTES: "0.0001" }), 100, "never shorter than a tenth of a second");
    for (const bad of ["0", "-3", "soon", "NaN", "Infinity", "100000"]) assert.equal(idleMsFromEnv({ APPS_IDLE_MINUTES: bad }), IDLE_MS, bad);
  });

  await step("the address an app is told it is reached at (APP_URL) is the one open gives: .localhost, or its subdomain with APPS_ORIGIN's scheme and port", () => {
    assert.equal(appAddressOf({ port: 8792, origin: "", domain: "" }, "shop"), "http://shop.localhost:8792");
    assert.equal(appAddressOf({ port: 8792, origin: "https://x.example", domain: "" }, "shop"), "http://shop.localhost:8792", "no domain: the local hostname");
    assert.equal(appAddressOf({ port: 8792, origin: "", domain: "apps.example.org" }, "shop"), "http://shop.apps.example.org:8792");
    assert.equal(appAddressOf({ port: 8792, origin: "https://apps.example.org", domain: "apps.example.org" }, "shop"), "https://shop.apps.example.org");
    assert.equal(appAddressOf({ port: 8792, origin: "http://apps.example.org:81", domain: "apps.example.org" }, "shop"), "http://shop.apps.example.org:81");
  });

  // ---- web apps off ---------------------------------------------------------------------------------------------
  await step("web apps off (APPS_PORT=0): every route says so plainly, nothing listens", async () => {
    const off = await instance("off", { port: 0 });
    instances.push(off);
    assert.equal(await off.feature.ready, null);
    assert.deepEqual(off.feature.parts(), { host: null, proxy: null });
    for (const [method, url, body] of [
      ["GET", "/api/webapps"],
      ["POST", "/api/webapps", { folder: "/tmp" }],
      ["GET", "/api/webapps/abc"],
      ["PUT", "/api/webapps/abc", { name: "x" }],
      ["DELETE", "/api/webapps/abc"],
      ["POST", "/api/webapps/abc/build"],
      ["POST", "/api/webapps/abc/start"],
      ["POST", "/api/webapps/abc/stop"],
      ["POST", "/api/webapps/abc/open", {}],
    ] as const) {
      const r = await off.call(method, url, body);
      assert.equal(r.status, 400, `${method} ${url}`);
      assert.match(r.json.error, /Web apps are off on this computer \(APPS_PORT=0\)/, url);
      assert.equal(r.json.off, true);
    }
    await end(off);
    instances.pop();
  });

  // ---- registering, building, running (fixture apps) ------------------------------------------------------------------
  const main = await instance("main", {}, true);
  instances.push(main);
  const dataRoot = path.join(main.dataDir, "webapps");
  assert.equal(await main.feature.ready, PORT);
  let ok: WebApp;

  await step("the list is empty at first and says how apps are reached", async () => {
    const r = await main.call<WebAppsList>("GET", "/api/webapps");
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { reach: { enabled: true, port: PORT, origin: null, domain: null, sandbox: true, error: null }, apps: [] });
  });

  await step("registering: a folder with a hydor.json becomes an app (a name, a slug, nothing built, nothing running, default settings)", async () => {
    const dir = fixture("club-notes", "ok", { name: "Club Notes" });
    const r = await main.call<{ app: WebAppDetail }>("POST", "/api/webapps", { folder: dir });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    ok = r.json.app;
    assert.deepEqual(r.json.app.log, []);
    assert.equal(ok.name, "Club Notes");
    assert.equal(ok.slug, "club-notes");
    assert.equal(ok.folder, fs.realpathSync(dir));
    assert.equal(ok.shape.ok, true);
    assert.equal(ok.stage, "build");
    assert.deepEqual(ok.decisions, []);
    assert.deepEqual(ok.settings, { tiers: [], dailyCapUsd: 1, apps: [], connections: [], notify: false });
    assert.equal(ok.run.state, "stopped");
    assert.equal(ok.run.pid, null);
    assert.equal(ok.build.state, "none");
    assert.equal(ok.build.exists, false);
    assert.ok(main.events.some((e: any) => e.t === "feature" && e.id === "webapps"), "the pages are told");
    const list = (await main.call<WebAppsList>("GET", "/api/webapps")).json;
    assert.deepEqual(list.apps.map((a) => a.id), [ok.id]);
    assert.equal("log" in (list.apps[0] as object), false, "the list carries no log");
  });

  await step("registering is refused in plain sentences: no folder, a relative one, none there, no hydor.json, twice, inside Hydor's data", async () => {
    const bad = async (body: unknown, status: number, re: RegExp) => {
      const r = await main.call("POST", "/api/webapps", body);
      assert.equal(r.status, status, JSON.stringify(r.json));
      assert.match(r.json.error, re);
    };
    await bad({}, 400, /Say which folder/);
    await bad({ folder: "apps/x" }, 400, /full path/);
    await bad({ folder: path.join(scratch, "nowhere") }, 400, /no folder at/);
    const bare = path.join(scratch, "apps", "bare");
    fs.mkdirSync(bare, { recursive: true });
    await bad({ folder: bare }, 400, /no hydor\.json/);
    await bad({ folder: ok.folder }, 409, /already registered, as “Club Notes”/);
    const inside = path.join(main.dataDir, "app-inside");
    fs.mkdirSync(inside);
    fs.writeFileSync(path.join(inside, "hydor.json"), "{}");
    await bad({ folder: inside }, 400, /inside Hydor’s own data folder/);
    assert.equal(((await main.call<WebAppsList>("GET", "/api/webapps")).json).apps.length, 1);
  });

  await step("an app not built cannot be started or opened: it says to build it first", async () => {
    for (const [url, body] of [[`/api/webapps/${ok.id}/start`, undefined], [`/api/webapps/${ok.id}/open`, {}]] as const) {
      const r = await main.call("POST", url, body, { origin: "http://localhost:8790" });
      assert.equal(r.status, 409, url);
      assert.match(r.json.error, /not built yet: build it first/);
    }
    assert.equal((await get(main, ok.id)).run.state, "stopped");
  });

  await step("a build that fails: returns at once as building, then failed with the exit code and the end of its output", async () => {
    const f = (await main.call<{ app: WebAppDetail }>("POST", "/api/webapps", { folder: fixture("failing", "fail") })).json.app;
    const t = Date.now();
    const r = await main.call<{ app: WebAppDetail }>("POST", `/api/webapps/${f.id}/build`);
    assert.equal(r.status, 200);
    assert.equal(r.json.app.build.state, "building");
    assert.ok(Date.now() - t < 1500, "the request did not wait for the build");
    await built(main, f.id);
    const a = await get(main, f.id);
    assert.equal(a.build.state, "failed");
    assert.equal(a.build.exitCode, 3);
    assert.match(a.build.problem!, /The build failed \(it ended with code 3\)/);
    assert.ok(a.build.log.includes("boom: something is wrong in src/page.tsx"), a.build.log.join("|"));
    assert.ok(a.build.log.includes("compiling the app"));
    assert.equal(a.build.exists, false);
    assert.ok(a.build.endedAt! >= a.build.startedAt!);
    // Its output is kept in a file, and the outcome beside it.
    assert.match(fs.readFileSync(path.join(dataRoot, f.id, "build.log"), "utf8"), /boom: something is wrong/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dataRoot, f.id, "build.json"), "utf8")).state, "failed");
    // Building again is allowed once it has ended.
    assert.equal((await main.call("POST", `/api/webapps/${f.id}/build`)).status, 200);
    await built(main, f.id);
  });

  await step("an app with no build line has nothing to build: Build says so and it counts as built", async () => {
    const b = (await main.call<{ app: WebAppDetail }>("POST", "/api/webapps", { folder: fixture("nobuild", "nobuild") })).json.app;
    assert.equal(b.build.exists, true);
    await main.call("POST", `/api/webapps/${b.id}/build`);
    await built(main, b.id);
    const a = await get(main, b.id);
    assert.equal(a.build.state, "built", JSON.stringify(a.build));
    assert.ok(a.build.log.some((l) => /nothing to build/.test(l)));
  });

  await step("a slow build: one at a time, the requests in the meantime are answered (and say wait), and it ends built with a clean environment", async () => {
    const s = (await main.call<{ app: WebAppDetail }>("POST", "/api/webapps", { folder: fixture("slow", "slow") })).json.app;
    const r = await main.call<{ app: WebAppDetail }>("POST", `/api/webapps/${s.id}/build`);
    assert.equal(r.json.app.build.state, "building");
    const t = Date.now();
    const list = await main.call<WebAppsList>("GET", "/api/webapps");
    assert.ok(Date.now() - t < 800, "listing is not held up by a build");
    assert.equal(list.json.apps.find((a) => a.id === s.id)!.build.state, "building");
    for (const [method, url, re] of [
      ["POST", `/api/webapps/${s.id}/build`, /already being built/],
      ["POST", `/api/webapps/${s.id}/start`, /being built/],
      ["POST", `/api/webapps/${s.id}/open`, /being built/],
      ["DELETE", `/api/webapps/${s.id}`, /being built/],
    ] as const) {
      const x = await main.call(method, url, method === "POST" ? {} : undefined, { origin: "http://localhost:8790" });
      assert.equal(x.status, 409, `${method} ${url}`);
      assert.match(x.json.error, re);
    }
    await until("its first line", async () => (await get(main, s.id)).build.log.includes("compiling the app"));
    await built(main, s.id);
    const a = await get(main, s.id);
    assert.equal(a.build.state, "built", JSON.stringify(a.build));
    assert.equal(a.build.exists, true);
    assert.equal(a.build.exitCode, 0);
    assert.ok(a.build.log.includes("almost there"));
    assert.ok(a.build.log.at(-1)!.startsWith("--- built"));
    // The environment the build had: its own, for the hydor environment, nothing of Hydor's.
    const seen = JSON.parse(fs.readFileSync(path.join(a.folder, ".output", "build-env.json"), "utf8")) as { env: Record<string, string>; cwd: string };
    assert.equal(seen.env.CI, "1");
    assert.equal(seen.cwd, a.folder);
    assert.equal(seen.env.HOME, path.join(dataRoot, s.id, "home"));
    for (const k of ["HYDOR_CANARY_KEY", "ANTHROPIC_API_KEY", "DATA_DIR", "CUDA_VISIBLE_DEVICES"]) assert.equal(seen.env[k], undefined, `${k} did not reach the build`);
    assert.ok(!JSON.stringify(seen.env).includes("canary"), "no value of Hydor's either");
  });

  await step("the built app starts on request and the state says so (a pid, sandboxed where bubblewrap is, a log); stop ends it", async () => {
    await main.call("POST", `/api/webapps/${ok.id}/build`);
    await built(main, ok.id);
    ok = await get(main, ok.id);
    assert.equal(ok.build.state, "built", JSON.stringify(ok.build));
    const r = await main.call<{ app: WebAppDetail }>("POST", `/api/webapps/${ok.id}/start`);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const a = r.json.app;
    assert.equal(a.run.state, "running");
    assert.ok(a.run.pid && alive(a.run.pid));
    assert.equal(a.run.sandboxed, bwrap);
    if (!bwrap) assert.match(a.run.sandboxNote!, /bubblewrap/);
    assert.ok(a.log.includes("--- ready"), a.log.join("|"));
    assert.ok(a.run.since! > 0 && a.run.lastUse! > 0);
    // Starting a running app is harmless; the list shows it running.
    assert.equal((await main.call("POST", `/api/webapps/${ok.id}/start`)).status, 200);
    assert.equal((await main.call<WebAppsList>("GET", "/api/webapps")).json.apps.find((x) => x.id === ok.id)!.run.state, "running");
    const pid = a.run.pid;
    const s = await main.call<{ app: WebAppDetail }>("POST", `/api/webapps/${ok.id}/stop`);
    assert.equal(s.json.app.run.state, "stopped");
    assert.equal(s.json.app.run.pid, null);
    assert.equal(alive(pid), false);
    assert.equal((await main.call("POST", `/api/webapps/${ok.id}/stop`)).status, 200, "stopping a stopped app is harmless");
  });

  await step("opening by hostname (Hydor opened on localhost): an address that starts the app and signs this person in, once", async () => {
    for (const headers of [{ origin: "http://localhost:8790" }, { origin: "http://127.0.0.1:8790" }, { host: "localhost:8790" }, { origin: "null", host: "127.0.0.1:8790" }, {}] as Record<string, string>[]) {
      const r = await open(main, ok.id, {}, headers);
      assert.equal(r.status, 200, JSON.stringify(r.json));
      assert.equal(r.json.way, "hostname", JSON.stringify(headers));
      assert.match(r.json.url, new RegExp(`^http://club-notes\\.localhost:${PORT}/__hydor/open\\?t=[^&]+&to=%2F$`));
    }
    assert.equal((await get(main, ok.id)).run.state, "running", "opening started it");
    const b = new Browser(PORT);
    const url = (await open(main, ok.id, { path: "/whoami" })).json.url;
    assert.match(url, /&to=%2Fwhoami$/);
    const page = await b.open(url);
    assert.equal(page.status, 200, page.text);
    assert.deepEqual(page.json(), { id: "owner", name: "Dana", role: "owner" });
    // The session is the browser's now, on that host only; the entry link works once.
    assert.equal((await b.request(`club-notes.localhost:${PORT}`, "/whoami")).json().name, "Dana");
    assert.equal((await b.request(`club-notes.localhost:${PORT}`, "/whoami", { cookies: false })).status, 403);
    assert.equal((await new Browser(PORT).open(url)).status, 403, "a used link is no link");
    // The page's address wins over a Host that only reached Hydor: a tunnel's page, Hydor itself at localhost behind it.
    const t = await open(main, ok.id, {}, { origin: "https://hydor.example.org", host: "localhost:8790" });
    assert.equal(t.json.way, "path");
    // A path that is not inside the app is refused.
    for (const p of ["notes", "//evil.example", "/a\\b", 5]) {
      const x = await open(main, ok.id, { path: p });
      assert.equal(x.status, 400, String(p));
      assert.match(x.json.error, /start with one slash/);
    }
  });

  await step("opening for a frame of Hydor's page (Preview): the app lets that page, and no other, show it, and its session is a partitioned third-party cookie", async () => {
    // The pieces.
    assert.equal(frameOrigin("http://localhost:8790"), "http://localhost:8790");
    assert.equal(frameOrigin("https://hydor.example.org"), "https://hydor.example.org");
    for (const bad of ["http://localhost:8790/", "null", "javascript:alert(1)", "ftp://x.test", "http://a.test/path", "", 5, null, undefined, "http://a.test; script-src *", "x".repeat(400)]) assert.equal(frameOrigin(bad), null, String(bad));
    const O = "http://localhost:8790";
    assert.equal(allowFrameBy("frame-ancestors 'self'", O), `frame-ancestors 'self' ${O}`);
    assert.equal(allowFrameBy("frame-ancestors 'none'", O), `frame-ancestors ${O}`);
    assert.equal(allowFrameBy("default-src 'self'; frame-ancestors 'self'; img-src data:", O), `default-src 'self'; frame-ancestors 'self' ${O}; img-src data:`);
    assert.equal(allowFrameBy(`Frame-Ancestors  'self'  ${O}`, O), `frame-ancestors 'self' ${O}`);
    assert.equal(allowFrameBy("default-src 'self'", O), "default-src 'self'", "no frame-ancestors: nothing is restricted, nothing is added");
    assert.equal(allowFrameBy("frame-ancestors-x 'self'", O), "frame-ancestors-x 'self'");
    // Through the apps' server.
    const framed = async (headers: Record<string, string>, body: unknown) => {
      const r = await open(main, ok.id, body, headers);
      assert.equal(r.status, 200, JSON.stringify(r.json));
      return r;
    };
    const f = await framed({ origin: O }, { frame: true, path: "/framed" });
    assert.equal(f.json.way, "hostname");
    const b = new Browser(PORT);
    const entry = await b.open(f.json.url, { follow: false });
    assert.equal(entry.status, 302);
    const cookie = String(entry.headers["set-cookie"]);
    assert.match(cookie, /^wa_app=[^;]+; Path=\/; HttpOnly; SameSite=None; Secure; Partitioned; Max-Age=\d+$/, cookie);
    const page = await b.request(`club-notes.localhost:${PORT}`, "/framed");
    assert.equal(page.status, 200);
    assert.equal(page.headers["content-security-policy"], `frame-ancestors 'self' ${O}; img-src 'self'`, "this page may frame it, and the rest of the app's policy stays");
    assert.equal(page.headers["x-frame-options"], undefined);
    // A link for a frame with nothing to name (no usable Origin) is a plain one: the app keeps saying no to every other page.
    for (const headers of [{ origin: "null", host: "localhost:8790" }, { host: "localhost:8790" }] as Record<string, string>[]) {
      const plain = await framed(headers, { frame: true, path: "/framed" });
      const pb = new Browser(PORT);
      const e = await pb.open(plain.json.url, { follow: false });
      assert.match(String(e.headers["set-cookie"]), /SameSite=Lax/);
      const p = await pb.request(`club-notes.localhost:${PORT}`, "/framed");
      assert.equal(p.headers["content-security-policy"], "frame-ancestors 'self'; img-src 'self'");
      assert.equal(p.headers["x-frame-options"], "DENY");
    }
    // Not asked for a frame (the Open button): as before, whoever the page is.
    const tab = await framed({ origin: O }, { path: "/framed" });
    const tb = new Browser(PORT);
    const te = await tb.open(tab.json.url, { follow: false });
    assert.match(String(te.headers["set-cookie"]), /SameSite=Lax/);
    assert.doesNotMatch(String(te.headers["set-cookie"]), /Partitioned/);
    const tp = await tb.request(`club-notes.localhost:${PORT}`, "/framed");
    assert.equal(tp.headers["content-security-policy"], "frame-ancestors 'self'; img-src 'self'");
    assert.equal(tp.headers["x-frame-options"], "DENY");
    // The frame is a claim Hydor signed: the browser's own cookie cannot add one, and a link made for one frame does not name another page.
    const other = await framed({ origin: "http://127.0.0.1:8790" }, { frame: true, path: "/framed" });
    const ob = new Browser(PORT);
    await ob.open(other.json.url, { follow: false });
    assert.equal((await ob.request(`club-notes.localhost:${PORT}`, "/framed")).headers["content-security-policy"], "frame-ancestors 'self' http://127.0.0.1:8790; img-src 'self'");
    // The path way is framed too, by that page only, and its page stays in a sandbox with an origin of no one; one opened for a tab is no frame.
    const path = await framed({ origin: "https://hydor.example.org" }, { frame: true, path: "/framed" });
    assert.equal(path.json.way, "path");
    const pa = await new Browser(PORT).open(path.json.url);
    assert.equal(pa.status, 200, pa.text);
    assert.equal(pa.headers["x-frame-options"], undefined);
    const pcsp = [pa.headers["content-security-policy"]].flat().join(", ");
    assert.match(pcsp, /frame-ancestors 'self' https:\/\/hydor\.example\.org; img-src 'self'/, "the app's own policy lets that page frame it");
    assert.match(pcsp, /sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads; frame-ancestors https:\/\/hydor\.example\.org$/);
    assert.doesNotMatch(pcsp, /allow-same-origin/);
    const pathTab = await framed({ origin: "https://hydor.example.org" }, { path: "/framed" });
    const tp2 = await new Browser(PORT).open(pathTab.json.url);
    assert.doesNotMatch([tp2.headers["content-security-policy"]].flat().join(", "), /hydor\.example\.org/);
    assert.equal(tp2.headers["x-frame-options"], "DENY");
  });

  await step("Hydor's own server carries the path way: /w/<token>/… (requests and sockets) goes to the apps' server before anything of its own, the rest stays its own", async () => {
    const own: string[] = [];
    const s = http.createServer((req, res) => {
      own.push(req.url ?? "");
      res.writeHead(200, { "content-type": "text/plain" }).end("hydor");
    });
    let upgraded = 0;
    s.on("upgrade", (_req, socket) => {
      upgraded++;
      socket.destroy();
    });
    carryPathWay(s, () => main.feature.parts().proxy);
    await new Promise<void>((resolve) => s.listen(0, "127.0.0.1", resolve));
    const port = (s.address() as net.AddressInfo).port;
    try {
      const r = await open(main, ok.id, { path: "/whoami" }, { origin: "https://hydor.example.org" });
      const u = new URL(r.json.url);
      assert.equal(u.origin, "https://hydor.example.org", "at Hydor's own address");
      const via = new Browser(port);
      const page = await via.request("hydor.example.org", u.pathname + u.search);
      assert.equal(page.status, 200, page.text);
      assert.equal(page.json().name, "Dana");
      assert.match(String(page.headers["content-security-policy"]), /sandbox/);
      // Hydor's own cookies never reach the app, and the app's never reach the browser.
      const echoed = await via.request("hydor.example.org", u.pathname.replace(/\/whoami$/, "/headers"), { headers: { cookie: "wa_session=secret; other=1" } });
      assert.equal(echoed.status, 200, echoed.text);
      assert.doesNotMatch(echoed.text, /secret/);
      // Without a token, or with a bad one: the apps' server's own no.
      assert.equal((await via.request("hydor.example.org", "/w/nonsense/whoami")).status, 403);
      // Everything else is Hydor's own, sockets too.
      assert.equal((await via.request("hydor.example.org", "/api/health")).text, "hydor");
      assert.equal((await via.request("hydor.example.org", "/wonder")).text, "hydor");
      assert.deepEqual(own, ["/api/health", "/wonder"]);
      await new Promise<void>((resolve) => {
        const q = http.request({ host: "127.0.0.1", port, path: "/ws", headers: { connection: "upgrade", upgrade: "websocket" } });
        q.on("error", () => resolve());
        q.on("close", () => resolve());
        q.end();
      });
      assert.equal(upgraded, 1);
      // With web apps off there is nothing to carry it to: it is Hydor's own.
      const off = http.createServer((req, res) => res.writeHead(404).end(req.url));
      carryPathWay(off, () => null);
      await new Promise<void>((resolve) => off.listen(0, "127.0.0.1", resolve));
      const offAt = await new Browser((off.address() as net.AddressInfo).port).request("hydor.example.org", u.pathname);
      assert.equal(offAt.status, 404);
      await new Promise<void>((resolve) => off.close(() => resolve()));
    } finally {
      await new Promise<void>((resolve) => s.close(() => resolve()));
    }
  });

  await step("opening by path (an address that is not localhost, no domain): /w/<token>/…, a page in a sandbox, signed in as the same person", async () => {
    const r = await open(main, ok.id, { path: "/whoami?x=1" }, { origin: "http://192.168.1.20:8790" });
    assert.equal(r.json.way, "path");
    assert.match(r.json.url, new RegExp(`^http://192\\.168\\.1\\.20:8790/w/[^/]+/whoami\\?x=1$`), "at Hydor's own address, which carries it");
    const b = new Browser(PORT);
    const page = await b.open(r.json.url);
    assert.equal(page.status, 200, page.text);
    assert.equal(page.json().name, "Dana");
    assert.match(String(page.headers["content-security-policy"]), /sandbox/);
    assert.doesNotMatch(String(page.headers["content-security-policy"]), /allow-same-origin/);
    assert.equal(page.headers["set-cookie"], undefined);
    // https from a tunnel, and a Host header only; an IPv6 address.
    const h = await open(main, ok.id, {}, { origin: "https://hydor.example.org" });
    assert.match(h.json.url, /^https:\/\/hydor\.example\.org\/w\/[^/]+\/$/);
    const f = await open(main, ok.id, {}, { host: "hydor.lan:8790", "x-forwarded-proto": "https" });
    assert.match(f.json.url, /^https:\/\/hydor\.lan:8790\/w\/[^/]+\/$/);
    const v6 = await open(main, ok.id, {}, { origin: "http://[fd00::1]:8790" });
    assert.match(v6.json.url, /^http:\/\/\[fd00::1\]:8790\/w\/[^/]+\/$/);
    // No hostname way on a host with no app, and no port way: the plain host has nothing without a token.
    assert.equal((await new Browser(PORT).request(`192.168.1.20:${PORT}`, "/whoami")).status, 403);
    assert.equal((await new Browser(PORT).request(`localhost:${PORT}`, "/whoami")).status, 403);
  });

  await step("changing: a new name keeps the address, settings are kept and checked, a bad one is a sentence, an unknown app is 404", async () => {
    const r = await main.call<{ app: WebAppDetail }>("PUT", `/api/webapps/${ok.id}`, { name: "Club notes, renamed", settings: { tiers: ["quick", "standard"], dailyCapUsd: 3, notify: true } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.app.name, "Club notes, renamed");
    assert.equal(r.json.app.slug, "club-notes");
    assert.deepEqual(r.json.app.settings, { tiers: ["quick", "standard"], dailyCapUsd: 3, apps: [], connections: [], notify: true });
    assert.equal(r.json.app.run.state, "running", "a change does not restart it");
    assert.deepEqual((await get(main, ok.id)).settings, r.json.app.settings);
    const bad = await main.call("PUT", `/api/webapps/${ok.id}`, { settings: { dailyCapUsd: "much" } });
    assert.equal(bad.status, 400);
    assert.match(bad.json.error, /daily cap/);
    assert.equal((await main.call("PUT", `/api/webapps/${ok.id}`, { name: " " })).json.error, "Give the app a name.");
    assert.equal((await main.call("PUT", "/api/webapps/nothing", { name: "x" })).status, 404);
    for (const [m, u] of [["GET", "/api/webapps/nothing"], ["DELETE", "/api/webapps/nothing"], ["POST", "/api/webapps/nothing/build"], ["POST", "/api/webapps/nothing/start"], ["POST", "/api/webapps/nothing/stop"], ["POST", "/api/webapps/nothing/open"]] as const) {
      const x = await main.call(m, u, m === "POST" ? {} : undefined);
      assert.equal(x.status, 404, u);
      assert.equal(x.json.error, "There is no such web app.");
    }
  });

  await step("a build of a running app stops it first (its build is taken from under it otherwise)", async () => {
    const pid = (await get(main, ok.id)).run.pid;
    assert.ok(alive(pid));
    await main.call("POST", `/api/webapps/${ok.id}/build`);
    await built(main, ok.id);
    const a = await get(main, ok.id);
    assert.equal(a.build.state, "built");
    assert.equal(a.run.state, "stopped");
    assert.equal(alive(pid), false);
  });

  await step("a broken hydor.json is said in the app's state (never a crash): the list and the page still answer, and it cannot be built or opened", async () => {
    const file = path.join(ok.folder, "hydor.json");
    const was = fs.readFileSync(file, "utf8");
    fs.writeFileSync(file, "{ broken");
    const a = await get(main, ok.id);
    assert.equal(a.shape.ok, false);
    assert.equal((await main.call<WebAppsList>("GET", "/api/webapps")).json.apps.find((x) => x.id === ok.id)!.shape.ok, false);
    const o = await open(main, ok.id);
    assert.equal(o.status, 409);
    assert.equal((await main.call("POST", `/api/webapps/${ok.id}/build`)).status, 409);
    fs.writeFileSync(file, was);
    assert.equal((await get(main, ok.id)).shape.ok, true);
  });

  await step("forgetting an app stops it and forgets it: its folder and its data stay", async () => {
    await main.call("POST", `/api/webapps/${ok.id}/start`);
    const pid = (await get(main, ok.id)).run.pid;
    assert.ok(alive(pid));
    const dataBefore = path.join(dataRoot, ok.id);
    assert.ok(fs.existsSync(path.join(dataBefore, "data")) && fs.existsSync(path.join(dataBefore, "secret")));
    fs.writeFileSync(path.join(dataBefore, "data", "mine.txt"), "kept");
    const r = await main.call("DELETE", `/api/webapps/${ok.id}`);
    assert.deepEqual(r.json, { ok: true, data: "kept" });
    assert.equal(alive(pid), false);
    assert.equal((await main.call("GET", `/api/webapps/${ok.id}`)).status, 404);
    assert.equal((await main.call<WebAppsList>("GET", "/api/webapps")).json.apps.some((a) => a.id === ok.id), false);
    assert.ok(fs.existsSync(path.join(ok.folder, "hydor.json")), "its folder stays");
    assert.ok(fs.existsSync(path.join(ok.folder, ".output", "server", "index.mjs")), "and its build");
    assert.equal(fs.readFileSync(path.join(dataBefore, "data", "mine.txt"), "utf8"), "kept", "and its data");
    // Its address is gone: the entry link of an app that is not registered opens nothing.
    assert.equal((await new Browser(PORT).request(`club-notes.localhost:${PORT}`, "/whoami")).status, 403);
    // Registered again: a new app with the old name's address, and it starts afresh.
    const again = (await main.call<{ app: WebAppDetail }>("POST", "/api/webapps", { folder: ok.folder })).json.app;
    assert.notEqual(again.id, ok.id);
    assert.equal(again.slug, "club-notes");
    ok = again;
  });

  await step("forgetting with ?data=1 also removes what Hydor kept for it (data, secret, build log); its folder stays", async () => {
    await main.call("POST", `/api/webapps/${ok.id}/build`);
    await built(main, ok.id);
    await main.call("POST", `/api/webapps/${ok.id}/start`);
    const pid = (await get(main, ok.id)).run.pid;
    const kept = path.join(dataRoot, ok.id);
    assert.ok(fs.existsSync(kept));
    const r = await main.call("DELETE", `/api/webapps/${ok.id}?data=1`);
    assert.deepEqual(r.json, { ok: true, data: "removed" });
    assert.equal(alive(pid), false);
    assert.equal(fs.existsSync(kept), false);
    assert.ok(fs.existsSync(path.join(ok.folder, "hydor.json")));
    // Other apps' data is not touched.
    const others = fs.readdirSync(dataRoot).filter((d) => fs.existsSync(path.join(dataRoot, d, "secret")) || fs.existsSync(path.join(dataRoot, d, "build.json")));
    assert.ok(others.length >= 1);
    ok = (await main.call<{ app: WebAppDetail }>("POST", "/api/webapps", { folder: ok.folder })).json.app;
    await main.call("POST", `/api/webapps/${ok.id}/build`);
    await built(main, ok.id);
  });

  await step("a build that was running when Hydor stopped shows as failed after a restart; a finished one is remembered", async () => {
    const f = (await main.call<WebAppsList>("GET", "/api/webapps")).json.apps.find((a) => a.slug === "failing")!;
    // What a crash in the middle of a build leaves.
    fs.writeFileSync(path.join(dataRoot, f.id, "build.json"), JSON.stringify({ state: "building", startedAt: 5, endedAt: null, exitCode: null }));
    await main.feature.stop!(null as never);
    // A new feature on the same database and data folder, as after a restart.
    const restarted = createWebapps({ dataDir: main.dataDir, port: PORT, origin: "", domain: "", idleMs: 600_000, sandbox: true, ports: [4331, 4333] });
    const app2 = Fastify();
    app2.setErrorHandler((err: Error, _q, reply) => reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message }));
    restarted.routes!({ app: app2, db: main.db, broadcast: () => {} } as unknown as Deps);
    await app2.ready();
    const r = await app2.inject({ method: "GET", url: `/api/webapps/${f.id}` });
    const a = (r.json() as { app: WebAppDetail }).app;
    assert.equal(a.build.state, "failed");
    assert.match(a.build.problem!, /Hydor stopped while this was building/);
    assert.ok(a.build.log.includes("boom: something is wrong in src/page.tsx"), "its output was kept in the file");
    const n = (await app2.inject({ method: "GET", url: "/api/webapps" })).json() as WebAppsList;
    assert.equal(n.apps.find((x) => x.slug === "slow")!.build.state, "built");
    await restarted.stop!(null as never);
    await app2.close();
  });

  // ---- the same through the features' registry: a restart of the feature on the same data ------------------------------
  await step("shutdown through the registry stops every app, closes the apps' server and leaves no pid file", async () => {
    // main was stopped above by hand; a fresh instance for this, on the same data.
    instances.splice(instances.indexOf(main), 1);
    await main.app.close();
    main.db.close();
    const i = await instance("main", {}, true);
    instances.push(i);
    assert.equal(await i.feature.ready, PORT);
    const apps = (await i.call<WebAppsList>("GET", "/api/webapps")).json.apps;
    const slow = apps.find((a) => a.slug === "slow")!;
    const club = apps.find((a) => a.slug === "club-notes")!;
    assert.equal((await i.call("POST", `/api/webapps/${slow.id}/start`)).status, 200);
    assert.equal((await i.call("POST", `/api/webapps/${club.id}/start`)).status, 200);
    const pids = [slow, club].map((a) => i.feature.parts().host!.status(a.id).pid!);
    assert.ok(pids.every(alive));
    assert.ok(fs.existsSync(path.join(i.dataDir, "webapps", slow.id, "pid")));
    assert.equal(await portFree(PORT), false, "the apps' server listens");
    await stopFeatures();
    await until("the apps to end", () => pids.every((p) => !alive(p)));
    assert.equal(await portFree(PORT), true, "the apps' server is closed");
    assert.ok(!fs.existsSync(path.join(i.dataDir, "webapps", slow.id, "pid")) && !fs.existsSync(path.join(i.dataDir, "webapps", club.id, "pid")));
    await i.app.close();
    i.db.close();
    instances.pop();
  });

  // ---- a domain, and an origin ---------------------------------------------------------------------------------------
  await step("with APPS_DOMAIN and APPS_ORIGIN: `<slug>.<domain>` (the origin's scheme and port), local pages still get .localhost, and the address works", async () => {
    const d = await instance("domain", { port: PORT_B, domain: "apps.example.test", origin: "https://apps.example.test", ports: [4335, 4336] });
    instances.push(d);
    const a = (await d.call<{ app: WebAppDetail }>("POST", "/api/webapps", { folder: fixture("on-domain", "ok") })).json.app;
    await d.call("POST", `/api/webapps/${a.id}/build`);
    await built(d, a.id);
    const r = await open(d, a.id, { path: "/whoami" }, { origin: "https://hydor.example.org" });
    assert.equal(r.json.way, "hostname");
    assert.match(r.json.url, /^https:\/\/on-domain\.apps\.example\.test\/__hydor\/open\?t=[^&]+&to=%2Fwhoami$/);
    const b = new Browser(PORT_B);
    const page = await b.open(r.json.url);
    assert.equal(page.status, 200, page.text);
    assert.equal(page.json().name, "Dana");
    // The link opens that hostname only.
    assert.equal((await new Browser(PORT_B).request(`other.apps.example.test`, new URL(r.json.url).pathname + new URL(r.json.url).search)).status, 403);
    // Hydor on localhost: the hostname that needs no DNS.
    const l = await open(d, a.id);
    assert.match(l.json.url, new RegExp(`^http://on-domain\\.localhost:${PORT_B}/__hydor/open`));
    assert.deepEqual((await d.call<WebAppsList>("GET", "/api/webapps")).json.reach, { enabled: true, port: PORT_B, origin: "https://apps.example.test", domain: "apps.example.test", sandbox: true, error: null });
    await end(d);
    instances.pop();
    // Without the domain, the origin is where the path way is.
    const o = await instance("origin", { port: PORT_B, origin: "https://apps.example.test", ports: [4335, 4336] });
    instances.push(o);
    const a2 = (await o.call<{ app: WebAppDetail }>("POST", "/api/webapps", { folder: fixture("on-domain", "ok") })).json.app;
    await o.call("POST", `/api/webapps/${a2.id}/build`);
    await built(o, a2.id);
    const p = await open(o, a2.id, {}, { origin: "https://hydor.example.org" });
    assert.equal(p.json.way, "path");
    assert.match(p.json.url, /^https:\/\/apps\.example\.test\/w\/[^/]+\/$/);
    const viaPath = await new Browser(PORT_B).request("apps.example.test", new URL(p.json.url).pathname + "whoami");
    assert.equal(viaPath.json().id, "owner");
    await end(o);
    instances.pop();
  });

  await step("the apps' server on a port in use: routes work, and opening says why it cannot", async () => {
    const hold = net.createServer();
    await new Promise<void>((r) => hold.listen(PORT_B, "127.0.0.1", () => r()));
    const u = await instance("inuse", { port: PORT_B, ports: [4335, 4336] });
    instances.push(u);
    assert.equal(await u.feature.ready, null);
    const list = (await u.call<WebAppsList>("GET", "/api/webapps")).json;
    assert.match(list.reach.error!, /port 4334 is in use \(set APPS_PORT to another\)/);
    const a = (await u.call<{ app: WebAppDetail }>("POST", "/api/webapps", { folder: fixture("in-use", "ok") })).json.app;
    await u.call("POST", `/api/webapps/${a.id}/build`);
    await built(u, a.id);
    const r = await open(u, a.id);
    assert.equal(r.status, 502);
    assert.match(r.json.error, /server for web apps is not running: port 4334 is in use/);
    await end(u);
    instances.pop();
    await new Promise<void>((r) => hold.close(() => r()));
  });

} catch (e) {
  failed = e;
  console.error(e);
} finally {
  for (const i of instances) await end(i).catch(() => {});
  fs.rmSync(scratch, { recursive: true, force: true });
}

if (failed) {
  console.error(`\nFAILED after ${passed} checks`);
  process.exit(1);
}
console.log(`\n${passed} checks passed`);
process.exit(0);
