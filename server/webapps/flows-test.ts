// Checks for the flows half of a web app (flows.ts) with the host's own fixtures: small apps made of a hydor.json and a server that
// reports its environment and calls Hydor with the key it was started with. Linking from a starting recipe and from an agent app that is
// there (its definition, address, keys and runs kept), unlinking, forgetting, the key and where it is kept, the environment a linked
// app is started with (in bubblewrap too, where it is here), what Hydor does with a call made with it, and the refusals. No real app,
// no agent and no model: sessions are a stand-in. Ports 4339 to 4349 (4340 is Hydor itself in these tests).
// Build and run with scratch folders:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/webapps/flows-test.ts
//   HOME=/tmp/hydor-test-flows-home DATA_DIR=/tmp/hydor-test-flows HYDOR_APPS_DIR=/tmp/hydor-test-flows-apps node dist/dev/flows-test.js
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { cleanRecipe } from "../../shared/apps.ts";
import type { WebApp } from "../../shared/webapps.ts";
import { sandboxAvailable } from "../agent/sandbox.ts";
import { apps as appsFeature } from "../apps/index.ts";
import { APP_FILE } from "../apps/folder.ts";
import { saveResult, startRuns, waitFor } from "../apps/runs.ts";
import * as store from "../apps/store.ts";
import { HttpError } from "../auth.ts";
import { kvSet, openDb } from "../db.ts";
import type { Deps } from "../features/types.ts";
import { initPages } from "../pages/store.ts";
import { setSessionExtra } from "../sessionExtra.ts";
import { createWebapps } from "./index.ts";
import { signPerson } from "./sign.ts";
import { writeTestApp } from "./test-apps.ts";

if (!process.env.DATA_DIR?.startsWith("/tmp/") || !process.env.HYDOR_APPS_DIR?.startsWith("/tmp/") || !process.env.HOME?.startsWith("/tmp/")) {
  console.error("Run with HOME=/tmp/…, DATA_DIR=/tmp/… and HYDOR_APPS_DIR=/tmp/… so nothing touches real data.");
  process.exit(2);
}

const HYDOR_PORT = 4340;
const scratch = fs.mkdtempSync(path.join(process.env.DATA_DIR, "flows-"));
let passed = 0;
const tests: [string, () => Promise<void>][] = [];
const test = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---- stand-ins ----------------------------------------------------------------------------------------------------------

/** The session manager: sessions start at once and work until a test ends their turn. */
class FakeSessions extends EventEmitter {
  made: { key: string; o: any }[] = [];
  status = new Map<string, string>();
  replies = new Map<string, string[]>();
  db!: ReturnType<typeof openDb>;
  async create(o: any) {
    const key = `acp:fake-${this.made.length + 1}-${Math.random().toString(36).slice(2, 8)}`;
    this.made.push({ key, o });
    this.status.set(key, "working");
    if (o.extra && Object.keys(o.extra).length) setSessionExtra(this.db, key, o.extra);
    return key;
  }
  setFlags() {}
  summary(key: string) {
    const st = this.status.get(key);
    return st ? ({ key, agent: "acp", stats: { tokensIn: 0, tokensOut: 0, tokensCached: 0 }, live: { status: st } } as any) : null;
  }
  async timeline(key: string) {
    const said = this.replies.get(key) ?? [];
    return { parser: { items: said.map((text, i) => ({ kind: "assistant", id: `a${i}`, seq: i, text })) }, readMore: async () => {} } as any;
  }
  liveSnapshot() {
    return { live: null, overlay: { items: [], patches: {}, approvals: [] } };
  }
  async interrupt(key: string) {
    this.status.set(key, "idle");
    this.emit("live", key);
  }
  async deliverOrQueue() {}
  end(key: string, reply = "All done.") {
    this.replies.set(key, [...(this.replies.get(key) ?? []), reply]);
    this.status.set(key, "idle");
    this.emit("live", key);
  }
}

/** What a fixture app does: says what its environment gives it, and calls Hydor (start a run, read one) with the key it was started with. */
const SERVER = String.raw`import http from 'node:http';
import crypto from 'node:crypto';
const hydor = (path, method, body) => fetch(process.env.HYDOR_URL + path, { method, headers: { authorization: 'Bearer ' + process.env.HYDOR_APP_KEY, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
http.createServer(async (req, res) => {
  const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.url === '/api/health') return send(200, { ok: true });
  if (req.url === '/env') {
    const k = process.env.HYDOR_APP_KEY;
    return send(200, { url: process.env.HYDOR_URL ?? null, slug: process.env.HYDOR_APP_SLUG ?? null, hasKey: !!k, keyHash: k ? crypto.createHash('sha256').update(k).digest('hex') : null, secret: !!process.env.APP_SECRET, names: Object.keys(process.env).filter((n) => n.startsWith('HYDOR_')).sort() });
  }
  if (req.url === '/run' && req.method === 'POST') {
    let text = '';
    for await (const c of req) text += c;
    // As a web app does it: whoever is at the screen is the signed header it was given with the request, passed on as it came.
    const body = JSON.parse(text || '{}');
    if (req.headers['x-hydor-person']) body.personToken = req.headers['x-hydor-person'];
    return send(200, await hydor('/api/apps/' + process.env.HYDOR_APP_SLUG + '/run', 'POST', body));
  }
  if (req.url.startsWith('/run/')) return send(200, await hydor('/api/apps/' + process.env.HYDOR_APP_SLUG + req.url, 'GET'));
  send(404, { error: 'not here' });
}).listen(Number(process.env.PORT), '127.0.0.1');
`;

/** A web app in a folder of its own, already built. */
function fixture(name: string, dir = path.join(scratch, "apps", name)): string {
  return writeTestApp(dir, SERVER, { name });
}

// ---- one instance: Hydor's apps and web apps on one server, its own database and data folder ---------------------------------

fs.mkdirSync(path.join(scratch, "hydor-data"), { recursive: true });
const db = openDb(path.join(scratch, "test.db"));
kvSet(db, "sharing:owner", "Dana");
initPages(db);
const sessions = new FakeSessions();
sessions.db = db;
const server = Fastify();
await server.register(cookie);
server.setErrorHandler((err: Error, _req, reply) => {
  const status = err instanceof HttpError ? err.status : 500;
  reply.code(status).send({ ...(err instanceof HttpError ? err.extra : undefined), error: err.message });
});
const events: any[] = [];
const deps = { app: server, db, sessions: sessions as any, scheduler: null as any, models: null as any, broadcast: (e: unknown) => events.push(e), toSubscribers: () => {}, publicBase: () => "http://test.local" } as Deps;
appsFeature.routes!(deps);
const web = createWebapps({ dataDir: path.join(scratch, "hydor-data"), port: 4339, origin: "", domain: "", idleMs: 600_000, sandbox: true, ports: [4341, 4349], startTimeoutMs: 20_000, hydorUrl: `http://127.0.0.1:${HYDOR_PORT}`, appsRoot: path.join(scratch, "WebApps") });
web.routes!(deps);
startRuns(deps);
await server.listen({ port: HYDOR_PORT, host: "127.0.0.1" });
web.start!(deps);
await web.ready;
const keyRoot = path.join(scratch, "hydor-data", "webapps");

const call = async (method: string, url: string, body?: unknown, headers?: Record<string, string>) => {
  const r = await server.inject({ method: method as any, url, headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers }, payload: body === undefined ? undefined : JSON.stringify(body) });
  let json: any = null;
  try {
    json = r.json();
  } catch {}
  return { status: r.statusCode, json, text: r.body };
};
/** A fixture app registered as a web app. */
async function register(name: string, dir?: string) {
  const r = await call("POST", "/api/webapps", { folder: fixture(name, dir), name });
  assert.equal(r.status, 200, r.text);
  return r.json.app as WebApp;
}
/** What the fixture app says of its environment: started (or already running) by the host, and asked on its own port. */
async function envOf(a: WebApp) {
  const port = await web.parts().host!.ensure({ id: a.id, slug: a.slug, dir: a.folder });
  const r = await fetch(`http://127.0.0.1:${port}/env`);
  return (await r.json()) as { url: string | null; slug: string | null; hasKey: boolean; keyHash: string | null; secret: boolean; names: string[] };
}
const sha = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
const keyFileOf = (a: WebApp) => path.join(keyRoot, a.id, "flows-key");
/** Every file under the folders given, as text, to look for a secret in. */
function everything(...dirs: string[]): string {
  let out = "";
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name !== "flows-key") out += `${p}\n${fs.readFileSync(p, "utf8")}\n`;
    }
  };
  for (const d of dirs) if (fs.existsSync(d)) walk(d);
  return out;
}
const waitingRun = async (slug: string, key: string, inputs: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
  const r = await server.inject({ method: "POST", url: `/api/apps/${slug}/run`, headers: { authorization: `Bearer ${key}` }, payload: { inputs, ...extra } });
  return { status: r.statusCode, json: r.json() };
};

// ---- the tests ---------------------------------------------------------------------------------------------------------

test("a web app gets a flows half from a starting recipe: an agent app kept as files in its own flows folder, linked on both sides, with a key of its own that nothing shows", async () => {
  const a = await register("trips");
  assert.equal(a.flows, undefined);
  const r = await call("POST", `/api/webapps/${a.id}/flows`, {});
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.created, true);
  const f = r.json.flows;
  assert.equal(f.app.name, "trips flows");
  assert.equal(f.folder, path.join(a.folder, "flows"));
  assert.ok(f.key.ok && /^napp_.{4}…/.test(f.key.hint), JSON.stringify(f.key));
  assert.equal(typeof f.since, "number");
  // The folder: the app's definition, the machinery agent apps already have for it.
  assert.ok(fs.existsSync(path.join(a.folder, "flows", APP_FILE)));
  assert.ok(fs.existsSync(path.join(a.folder, "flows", "instructions", "work.md")));
  const recipe = JSON.parse(fs.readFileSync(path.join(a.folder, "flows", APP_FILE), "utf8"));
  assert.equal(recipe.flow.steps.length, 1);
  assert.equal(recipe.flow.steps[0].do, "agent");
  assert.deepEqual(recipe.fields.map((x: any) => x.id), ["request"]);
  assert.equal(recipe.webapp, undefined, "the link is Hydor's own, never written into the folder");
  // Both sides know.
  const agent = store.getApp(db, f.app.id)!;
  assert.deepEqual(agent.webapp, { id: a.id, name: "trips" });
  assert.equal(agent.folder, path.join(a.folder, "flows"));
  assert.equal((await call("GET", `/api/apps/${agent.id}`)).json.app?.webapp?.id ?? (await call("GET", `/api/apps/${agent.id}`)).json.webapp?.id, a.id);
  assert.equal((await call("GET", `/api/webapps/${a.id}`)).json.app.flows.app.slug, agent.slug);
  assert.equal((await call("GET", "/api/webapps")).json.apps.find((x: WebApp) => x.id === a.id).flows.app.id, agent.id);
  // A key was made for it, named after the web app; its value is in one file and nowhere a route or the app's folder shows it.
  const keys = store.listKeys(db, agent.id);
  assert.equal(keys.length, 1);
  assert.equal(keys[0].name, "Web app: trips");
  const key = fs.readFileSync(keyFileOf(a), "utf8").trim();
  assert.ok(key.startsWith("napp_"));
  assert.equal(fs.statSync(keyFileOf(a)).mode & 0o777, 0o600);
  assert.ok(store.appOfKey(db, key));
  for (const text of [r.text, (await call("GET", `/api/webapps/${a.id}`)).text, (await call("GET", "/api/webapps")).text, (await call("GET", `/api/apps/${agent.id}/keys`)).text, JSON.stringify(events)]) assert.ok(!text.includes(key), "no route or event shows the key");
  assert.ok(!everything(a.folder, path.join(keyRoot, a.id, "data")).includes(key), "not in the app's folder, nor in the data folder it may write");
});

test("the environment a linked app is started with: where Hydor is, the agent app’s address and the key (and nothing more of Hydor’s), also through bubblewrap where it is here", async () => {
  const plain = await register("plain");
  const before = await envOf(plain);
  assert.deepEqual([before.url, before.slug, before.hasKey, before.secret], [null, null, false, true]);
  const a = await register("envy");
  await call("POST", `/api/webapps/${a.id}/flows`, {});
  const agent = store.getApp(db, (await call("GET", `/api/webapps/${a.id}`)).json.app.flows.app.id)!;
  const env = await envOf(a);
  assert.equal(env.url, `http://127.0.0.1:${HYDOR_PORT}`);
  assert.equal(env.slug, agent.slug);
  assert.equal(env.hasKey, true);
  assert.equal(env.keyHash, sha(fs.readFileSync(keyFileOf(a), "utf8").trim()), "the key it holds is the one kept");
  assert.equal(env.secret, true);
  assert.deepEqual(env.names, ["HYDOR_APP_KEY", "HYDOR_APP_PROCESS", "HYDOR_APP_SLUG", "HYDOR_URL"], "no other of Hydor's variables");
  const sandboxed = (await call("GET", `/api/webapps/${a.id}`)).json.app.run.sandboxed;
  console.log(`     (the app ran ${sandboxed ? "inside bubblewrap" : "without bubblewrap: not here"}; bubblewrap ${sandboxAvailable()?.kind === "bwrap" ? "is" : "is not"} available)`);
  // It reaches Hydor with the key it was given: a call from inside the app starts a run of the agent app and reads it.
  // The web app may spend a day what it says (the default is $1, which two runs going at $0.50 each already reach): this test starts several.
  assert.equal((await call("PUT", `/api/webapps/${a.id}`, { settings: { dailyCapUsd: 100 } })).status, 200);
  const appPort = await web.parts().host!.ensure({ id: a.id, slug: a.slug, dir: a.folder });
  const secret = web.parts().host!.secret(a.id);
  const asks = async (headers: Record<string, string>, body: object = { inputs: { request: "Plan a day in Lisbon" } }) =>
    (await (await fetch(`http://127.0.0.1:${appPort}/run`, { method: "POST", headers, body: JSON.stringify(body) })).json()) as { status: number; body: any };
  // The person at the screen: the signed header Hydor's proxy would have put on the request, sent on by the app exactly as it came.
  const ada = { id: "p1", name: "Ada", role: "member" as const };
  const started = await asks({ "x-hydor-person": signPerson(ada, secret) });
  assert.equal(started.status, 200, JSON.stringify(started));
  assert.deepEqual(started.body.person, ada, "the person is the one the header proves");
  // A tampered header, one signed with another app's secret, an expired one: refused, nothing started.
  const runs = () => store.listRuns(db, { app: agent.id }).length;
  const runsBefore = runs();
  const good = signPerson(ada, secret);
  const [payload, sig] = good.split(".");
  const forged = `${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), role: "owner" })).toString("base64url")}.${sig}`;
  for (const [what, header, text] of [
    ["tampered", forged, /not one this web app’s own proxy signed/],
    ["another app's secret", signPerson(ada, web.parts().host!.secret(plain.id)), /not one this web app’s own proxy signed/],
    ["expired", signPerson(ada, secret, -3600), /has run out/],
    ["mangled", "garbage", /not an x-hydor-person header/],
  ] as const) {
    const r = await asks({ "x-hydor-person": header });
    assert.equal(r.status, 403, `${what}: ${JSON.stringify(r)}`);
    assert.match(r.body.error, text, what);
  }
  assert.equal(runs(), runsBefore, "none of them started a run");
  // Run out a minute ago: still good (the app forwards it a moment after it got it).
  assert.equal((await asks({ "x-hydor-person": signPerson({ ...ada, id: "p2" }, secret, -60) })).body.person.id, "p2");
  // A person only said is refused; no header, a job of the web app: nobody.
  const claimed = await asks({}, { inputs: { request: "x" }, person: { id: "boss", name: "Boss", role: "owner" } });
  assert.equal(claimed.status, 400);
  assert.match(claimed.body.error, /send personToken/);
  const job = await asks({});
  assert.equal(job.status, 200);
  assert.equal(job.body.person, null, "no one is at the screen: it acts for nobody");
  assert.equal(job.body.flow, "run");
  // Another web app's header is no good here (its secret is not this one's), checked above; and the state words are both there.
  assert.ok(["queued", "starting", "running", "waiting"].includes(job.body.status));
  assert.ok(["waiting", "working", "needs-you"].includes(job.body.state));
  assert.equal(started.body.flow, "run");
  // The starting recipe works end to end with a stand-in agent.
  let child: store.RunRecord | undefined;
  for (let i = 0; i < 200 && !(child = store.listRuns(db, { parent: started.body.id }).find((r) => r.step === "work" && r.key)); i++) await sleep(25);
  assert.ok(child, "its one agent step started");
  saveResult(child.id, { answer: "Start at the Alfama." });
  sessions.end(child.key!, "Done.");
  assert.equal((await waitFor(started.body.id, 20_000))!.status, "done");
  const read = (await (await fetch(`http://127.0.0.1:${await web.parts().host!.ensure({ id: a.id, slug: a.slug, dir: a.folder })}/run/${started.body.id}`)).json()) as { status: number; body: any };
  assert.equal(read.body.status, "done");
  assert.deepEqual(read.body.result, { answer: "Start at the Alfama." });
  assert.equal(read.body.person.id, "p1");
  assert.equal(read.body.state, "done");
  assert.equal(read.body.status, "done");
  // A key made by hand for the same app is not the web app's: it may not name a person.
  const hand = store.createKey(db, agent.id, "By hand");
  const refused = await waitingRun(agent.slug, hand.key, { request: "x" }, { personToken: signPerson(ada, secret) });
  assert.equal(refused.status, 403);
});

test("an app already running when it is linked is stopped, so its next start has the environment; unlinking does the same", async () => {
  const a = await register("running");
  assert.equal((await envOf(a)).hasKey, false);
  assert.equal(web.parts().host!.status(a.id).state, "running");
  await call("POST", `/api/webapps/${a.id}/flows`, {});
  assert.equal(web.parts().host!.status(a.id).state, "stopped", "stopped by linking");
  assert.equal((await envOf(a)).hasKey, true, "and started again with it");
  await call("DELETE", `/api/webapps/${a.id}/flows`);
  assert.equal(web.parts().host!.status(a.id).state, "stopped", "and stopped by unlinking, so the key it held is gone with it");
  assert.equal((await envOf(a)).hasKey, false);
});

test("an agent app that is there is linked by its id: its definition moves into the flows folder, and its address, keys, schedules and runs stay", async () => {
  const a = await register("existing");
  const old = path.join(scratch, "elsewhere", "my-agent");
  const mine = store.saveApp(db, { recipe: cleanRecipe({ name: "My agent", prompt: "Do {{topic}}", fields: [{ id: "topic", label: "Topic", type: "text", required: true }], answer: [{ id: "a", label: "A", type: "text" }] }) });
  const { linkFolder } = await import("../apps/folder.ts");
  linkFolder(db, mine, old);
  fs.writeFileSync(path.join(old, "notes.txt"), "kept with the folder");
  const handKey = store.createKey(db, mine.id, "Mine");
  const run = store.insertRun(db, { app: mine.id, appName: mine.name, recipe: mine, source: "web", inputs: { topic: "x" }, status: "done" });
  const r = await call("POST", `/api/webapps/${a.id}/flows`, { app: mine.slug });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.created, false);
  const now = store.getApp(db, mine.id)!;
  assert.equal(now.slug, mine.slug, "its address");
  assert.equal(now.folder, path.join(a.folder, "flows"));
  assert.ok(!fs.existsSync(old), "moved, not copied");
  assert.equal(fs.readFileSync(path.join(a.folder, "flows", "notes.txt"), "utf8"), "kept with the folder", "the folder came whole");
  assert.ok(fs.existsSync(path.join(a.folder, "flows", APP_FILE)));
  assert.ok(store.appOfKey(db, handKey.key), "its own key still opens it");
  assert.equal(store.getRun(db, run.id)!.status, "done", "its runs");
  assert.equal(now.webapp?.id, a.id);
  assert.equal(store.listKeys(db, mine.id).length, 2, "its own key and the web app's");
  // The folder is kept in step as before: a change saved in it becomes a version of the app.
  const file = path.join(a.folder, "flows", APP_FILE);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  json.description = "Changed in the folder";
  fs.writeFileSync(file, JSON.stringify(json, null, 2));
  for (let i = 0; i < 100 && store.getApp(db, mine.id)!.description !== "Changed in the folder"; i++) await sleep(50);
  assert.equal(store.getApp(db, mine.id)!.description, "Changed in the folder");
  // Linked: it cannot be deleted from the Apps page until it is unlinked.
  const del = await call("DELETE", `/api/apps/${mine.id}`);
  assert.equal(del.status, 409);
  assert.match(del.json.error, /flows half of the web app “existing”/);
  // An existing app with no folder gets one.
  const b = await register("existing-two");
  const bare = store.saveApp(db, { recipe: cleanRecipe({ name: "Bare", prompt: "Do it", answer: [{ id: "a", label: "A", type: "text" }] }) });
  assert.equal((await call("POST", `/api/webapps/${b.id}/flows`, { app: bare.id })).status, 200);
  assert.ok(fs.existsSync(path.join(b.folder, "flows", APP_FILE)));
});

test("unlinking: the agent app stays, with its folder moved back where agent apps keep theirs, its key revoked and the web app told; its runs and its own keys stay", async () => {
  const a = await register("unlinked");
  const made = (await call("POST", `/api/webapps/${a.id}/flows`, {})).json;
  const agentId = made.flows.app.id;
  const key = fs.readFileSync(keyFileOf(a), "utf8").trim();
  const handKey = store.createKey(db, agentId, "Mine");
  const run = store.insertRun(db, { app: agentId, appName: "x", recipe: store.getApp(db, agentId)!, source: "api", inputs: { request: "x" }, status: "done" });
  const r = await call("DELETE", `/api/webapps/${a.id}/flows`);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.flows, null);
  assert.equal(r.json.agentApp.id, agentId);
  const agent = store.getApp(db, agentId)!;
  assert.equal(agent.webapp, undefined);
  assert.ok(agent.folder && agent.folder.endsWith(`/Apps/${agent.slug}`), agent.folder);
  assert.equal(r.json.agentApp.folder, agent.folder);
  assert.ok(fs.existsSync(path.join(agent.folder!, APP_FILE)), "its definition is there");
  assert.ok(!fs.existsSync(path.join(a.folder, "flows")), "and no longer in the web app's folder");
  assert.equal(store.appOfKey(db, key), null, "the web app's key is revoked");
  assert.ok(!fs.existsSync(keyFileOf(a)), "and its file gone");
  assert.ok(store.appOfKey(db, handKey.key), "the key made by hand stays");
  assert.equal(store.getRun(db, run.id)!.status, "done");
  assert.equal((await call("GET", `/api/webapps/${a.id}`)).json.app.flows, undefined);
  // It is an agent app like any: its folder is kept in step, and a person is no longer allowed.
  const refused = await waitingRun(agent.slug, handKey.key, { request: "x" }, { personToken: "x.y" });
  assert.equal(refused.status, 400);
  // Linked again later, from the same agent app.
  assert.equal((await call("POST", `/api/webapps/${a.id}/flows`, { app: agent.id })).status, 200);
  assert.equal((await call("DELETE", `/api/apps/${agent.id}`)).status, 409);
  // A second app of the same name does not take its folder.
  const c = await register("unlinked-again");
  const other = (await call("POST", `/api/webapps/${c.id}/flows`, {})).json.flows.app;
  await call("DELETE", `/api/webapps/${a.id}/flows`);
  await call("DELETE", `/api/webapps/${c.id}/flows`);
  assert.notEqual(store.getApp(db, other.id)!.folder, store.getApp(db, agent.id)!.folder);
});

test("forgetting a web app that has a flows half says so, revokes its key and leaves the agent app (and the folder it is kept in)", async () => {
  const a = await register("forgotten");
  const made = (await call("POST", `/api/webapps/${a.id}/flows`, {})).json;
  const key = fs.readFileSync(keyFileOf(a), "utf8").trim();
  const r = await call("DELETE", `/api/webapps/${a.id}`);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.flows.kept, true);
  assert.equal(r.json.flows.app.id, made.flows.app.id);
  assert.match(r.json.flows.note, /agent app “forgotten flows”, stays/);
  assert.equal(r.json.flows.folder, path.join(a.folder, "flows"));
  const agent = store.getApp(db, made.flows.app.id)!;
  assert.equal(agent.webapp, undefined, "no longer linked");
  assert.equal(store.appOfKey(db, key), null);
  assert.ok(!fs.existsSync(keyFileOf(a)));
  assert.ok(fs.existsSync(path.join(a.folder, "flows", APP_FILE)), "its files are where they were");
  assert.equal((await call("DELETE", `/api/apps/${agent.id}`)).status, 200, "it can be deleted now");
  // A web app without one says nothing of it.
  const plain = await register("forgotten-plain");
  assert.equal((await call("DELETE", `/api/webapps/${plain.id}`)).json.flows, undefined);
});

test("a key that was revoked is made again at the next start; the link says whether its key still opens the app", async () => {
  const a = await register("revoked");
  const made = (await call("POST", `/api/webapps/${a.id}/flows`, {})).json;
  const was = fs.readFileSync(keyFileOf(a), "utf8").trim();
  const keyId = made.flows.key.id;
  assert.equal((await call("DELETE", `/api/apps/${made.flows.app.id}/keys/${keyId}`)).status, 200);
  assert.equal((await call("GET", `/api/webapps/${a.id}`)).json.app.flows.key.ok, false);
  await web.parts().host!.stop(a.id);
  const env = await envOf(a);
  assert.notEqual(env.keyHash, sha(was));
  const now = (await call("GET", `/api/webapps/${a.id}`)).json.app.flows;
  assert.equal(now.key.ok, true);
  assert.notEqual(now.key.id, keyId);
  assert.equal(store.listKeys(db, made.flows.app.id).length, 1, "the new one only");
  assert.equal(env.keyHash, sha(fs.readFileSync(keyFileOf(a), "utf8").trim()));
});

test("the refusals: linked twice, an agent app that belongs to another web app, one that is not there, a folder that is not free; and nothing is made", async () => {
  const a = await register("refuse-a");
  const b = await register("refuse-b");
  const agents = () => store.listApps(db).length;
  const keys = () => (db.prepare("select count(*) as n from app_keys").get() as { n: number }).n;
  assert.equal((await call("DELETE", `/api/webapps/${a.id}/flows`)).status, 404, "nothing to unlink");
  assert.equal((await call("POST", "/api/webapps/nope/flows", {})).status, 404);
  assert.equal((await call("DELETE", "/api/webapps/nope/flows")).status, 404);
  const linked = (await call("POST", `/api/webapps/${a.id}/flows`, {})).json.flows.app;
  const twice = await call("POST", `/api/webapps/${a.id}/flows`, {});
  assert.equal(twice.status, 409);
  assert.match(twice.json.error, /already has a flows half/);
  const taken = await call("POST", `/api/webapps/${b.id}/flows`, { app: linked.id });
  assert.equal(taken.status, 409);
  assert.match(taken.json.error, /already the flows half of the web app “refuse-a”/);
  const missing = await call("POST", `/api/webapps/${b.id}/flows`, { app: "no-such-app" });
  assert.equal(missing.status, 404);
  assert.equal((await call("POST", `/api/webapps/${b.id}/flows`, { app: "tpl:something" })).status, 400);
  assert.equal((await call("POST", `/api/webapps/${b.id}/flows`, { app: 7 })).status, 400);
  // A flows folder with files that are not an agent app's, a file, a link: refused, and nothing was made.
  const n = agents();
  const k = keys();
  fs.mkdirSync(path.join(b.folder, "flows"));
  fs.writeFileSync(path.join(b.folder, "flows", "mine.txt"), "x");
  const stray = await call("POST", `/api/webapps/${b.id}/flows`, {});
  assert.equal(stray.status, 409);
  assert.match(stray.json.error, /already has files in it/);
  fs.rmSync(path.join(b.folder, "flows", "mine.txt"));
  fs.rmdirSync(path.join(b.folder, "flows"));
  fs.writeFileSync(path.join(b.folder, "flows"), "a file");
  assert.equal((await call("POST", `/api/webapps/${b.id}/flows`, {})).status, 409);
  fs.rmSync(path.join(b.folder, "flows"));
  fs.symlinkSync(fs.mkdtempSync(path.join(scratch, "linktarget-")), path.join(b.folder, "flows"));
  assert.equal((await call("POST", `/api/webapps/${b.id}/flows`, {})).status, 409);
  fs.rmSync(path.join(b.folder, "flows"));
  assert.equal(agents(), n, "no app was made");
  assert.equal(keys(), k, "no key was made");
  assert.ok(!fs.existsSync(keyFileOf(b)));
  // An agent app whose folder holds the web app cannot be moved into it.
  const outer = path.join(scratch, "outer");
  const holder = store.saveApp(db, { recipe: cleanRecipe({ name: "Holder", prompt: "Do it", answer: [{ id: "a", label: "A", type: "text" }] }) });
  const { linkFolder } = await import("../apps/folder.ts");
  linkFolder(db, holder, outer);
  const inside = await register("refuse-inside", path.join(outer, "web"));
  const holds = await call("POST", `/api/webapps/${inside.id}/flows`, { app: holder.id });
  assert.equal(holds.status, 409);
  assert.match(holds.json.error, /holds the web app/);
  assert.ok(fs.existsSync(path.join(outer, APP_FILE)), "its folder was not moved");
  // The web app is unchanged by every refusal.
  assert.equal((await call("GET", `/api/webapps/${b.id}`)).json.app.flows, undefined);
});

test("a failure part-way leaves nothing half-made: no app, no key, no folder, no link", async () => {
  if (process.getuid?.() === 0) return void console.log("     (skipped: running as root, where a folder cannot be made unwritable)");
  const a = await register("rollback");
  const agents = store.listApps(db).length;
  const keys = (db.prepare("select count(*) as n from app_keys").get() as { n: number }).n;
  fs.chmodSync(a.folder, 0o555);
  try {
    const r = await call("POST", `/api/webapps/${a.id}/flows`, {});
    assert.ok(r.status >= 400, `${r.status} ${r.text}`);
  } finally {
    fs.chmodSync(a.folder, 0o755);
  }
  assert.equal(store.listApps(db).length, agents, "the app it began to make is gone");
  assert.equal((db.prepare("select count(*) as n from app_keys").get() as { n: number }).n, keys);
  assert.ok(!fs.existsSync(path.join(a.folder, "flows")));
  assert.ok(!fs.existsSync(keyFileOf(a)));
  assert.equal((await call("GET", `/api/webapps/${a.id}`)).json.app.flows, undefined);
  assert.equal((await call("POST", `/api/webapps/${a.id}/flows`, {})).status, 200, "and it can be linked afterwards");
});

test("web apps turned off: the flows routes say so, like the rest", async () => {
  const off = createWebapps({ dataDir: path.join(scratch, "off-data"), port: 0, origin: "", domain: "", idleMs: 600_000, sandbox: true });
  const app2 = Fastify();
  app2.setErrorHandler((err: Error, _req, reply) => reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message }));
  const d2 = { ...deps, app: app2, db: openDb(path.join(scratch, "off.db")) } as Deps;
  off.routes!(d2);
  await app2.ready();
  const r = await app2.inject({ method: "POST", url: "/api/webapps/x/flows", payload: {} });
  assert.equal(r.statusCode, 400);
  assert.match(r.json().error, /Web apps are off/);
  assert.equal((await app2.inject({ method: "DELETE", url: "/api/webapps/x/flows" })).statusCode, 400);
  await app2.close();
});

for (const [name, fn] of tests) {
  try {
    await fn();
    // Apps a test started stop with it, so the next has ports.
    await web.parts().host!.stopAll();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed} of ${tests.length} passed`);
await web.stop!(null as never);
await server.close();
fs.rmSync(scratch, { recursive: true, force: true });
fs.rmSync(process.env.HYDOR_APPS_DIR!, { recursive: true, force: true });
process.exit(process.exitCode ?? 0);
