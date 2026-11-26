// The builders' page's section "An agent app with pages of its own" (skills/web-app-builder/references/hydor-contract.md) tried as it
// is written: a web app linked to an agent app, opened through Hydor's proxy, makes each of the requests the page gives with the key
// and the header it was given; and the functions.json it shows is read as Hydor reads one. The agent is a stand-in: no model and no
// real agent runs. Ports 4780 to 4789.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/webapps/agent-pages-test.ts
//   HOME=<scratch folder> DATA_DIR=<scratch folder> HYDOR_APPS_DIR=<scratch folder> node dist/dev/agent-pages-test.js
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import cookie from "@fastify/cookie";
import Fastify from "fastify";
import type { WebAppDetail, WebAppOpen } from "../../shared/webapps.ts";
import { apps as appsFeature } from "../apps/index.ts";
import { saveResult, startRuns, waitFor } from "../apps/runs.ts";
import * as store from "../apps/store.ts";
import { HttpError } from "../auth.ts";
import { APP_ROOT } from "../config.ts";
import { kvSet, openDb } from "../db.ts";
import type { Deps } from "../features/types.ts";
import { initPages } from "../pages/store.ts";
import { setSessionExtra } from "../sessionExtra.ts";
import { readFunctions } from "./flows-functions.ts";
import { createWebapps } from "./index.ts";
import { writeTestApp } from "./test-apps.ts";

for (const v of ["DATA_DIR", "HOME", "HYDOR_APPS_DIR"]) if (!process.env[v]?.startsWith("/tmp/")) (console.error("Run with HOME, DATA_DIR and HYDOR_APPS_DIR in scratch folders, so nothing touches real data."), process.exit(2));
const scratch = fs.mkdtempSync(path.join(process.env.DATA_DIR!, "pages-"));
const HYDOR_PORT = 4780;
const APPS_PORT = 4781;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
let passed = 0;
const step = async (name: string, fn: () => Promise<void>) => {
  await fn();
  passed++;
  console.log(`ok - ${name}`);
};

/** The session manager: sessions start at once and work until the test ends their turn. */
class FakeSessions extends EventEmitter {
  status = new Map<string, string>();
  n = 0;
  db!: ReturnType<typeof openDb>;
  adapterByRun() {
    return null;
  }
  async create(o: any) {
    const key = `acp:fake-${++this.n}`;
    this.status.set(key, "working");
    if (o.extra && Object.keys(o.extra).length) setSessionExtra(this.db, key, o.extra);
    return key;
  }
  setFlags() {}
  summary(key: string) {
    const st = this.status.get(key);
    return st ? ({ key, agent: "acp", stats: { tokensIn: 0, tokensOut: 0, tokensCached: 0 }, live: { status: st } } as any) : null;
  }
  async timeline() {
    return { parser: { items: [{ kind: "assistant", id: "a", seq: 0, text: "Done." }] }, readMore: async () => {} } as any;
  }
  liveSnapshot() {
    return { live: null, overlay: { items: [], patches: {}, approvals: [] } };
  }
  async interrupt(key: string) {
    this.status.set(key, "idle");
    this.emit("live", key);
  }
  async deliverOrQueue() {}
  end(key: string) {
    this.status.set(key, "idle");
    this.emit("live", key);
  }
}

/** The web app: its server makes whatever request of the section it is asked to, with the key it was started with and the header it got. */
const SERVER = String.raw`import http from 'node:http';
const base = () => process.env.HYDOR_URL + '/api/apps/' + process.env.HYDOR_APP_SLUG;
http.createServer(async (req, res) => {
  if (req.url === '/api/health') return res.end('ok');
  let raw = '';
  for await (const c of req) raw += c;
  const ask = JSON.parse(raw || '{}');
  const body = ask.body && ask.asPerson ? { ...ask.body, personToken: req.headers['x-hydor-person'] } : ask.body;
  const r = await fetch(base() + ask.path, { method: ask.method, headers: { authorization: 'Bearer ' + process.env.HYDOR_APP_KEY, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ status: r.status, text: await r.text() }));
}).listen(Number(process.env.PORT), '127.0.0.1');
`;

const page = fs.readFileSync(path.join(APP_ROOT, "skills/web-app-builder/references/hydor-contract.md"), "utf8");
const section = page.slice(page.indexOf("## An agent app with pages of its own"));

const db = openDb(path.join(scratch, "test.db"));
kvSet(db, "sharing:owner", "Dana");
initPages(db);
const sessions = new FakeSessions();
sessions.db = db;
const server = Fastify();
await server.register(cookie);
server.setErrorHandler((err: Error, _req, reply) => reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message }));
const deps = { app: server, db, sessions: sessions as any, scheduler: null as any, models: null as any, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => "http://test.local" } as Deps;
appsFeature.routes!(deps);
const web = createWebapps({ dataDir: path.join(scratch, "hydor-data"), port: APPS_PORT, origin: "", domain: "", idleMs: 600_000, sandbox: true, ports: [4782, 4789], startTimeoutMs: 20_000, hydorUrl: `http://127.0.0.1:${HYDOR_PORT}`, appsRoot: path.join(scratch, "WebApps"), weekly: false });
web.routes!(deps);
startRuns(deps);
await server.listen({ port: HYDOR_PORT, host: "127.0.0.1" });
web.start!(deps);
await web.ready;

const dir = writeTestApp(path.join(scratch, "apps", "desk"), SERVER, { name: "Desk" });
const functions = /```json\n([\s\S]*?)\n```/.exec(section)![1];
fs.writeFileSync(path.join(dir, "functions.json"), functions);
const call = async <T = any>(method: string, url: string, body?: unknown) => {
  const r = await server.inject({ method: method as "GET", url, headers: body === undefined ? {} : { "content-type": "application/json" }, payload: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.statusCode, json: r.json() as T };
};
const app = (await call<{ app: WebAppDetail }>("POST", "/api/webapps", { folder: dir })).json.app;
await call("PUT", `/api/webapps/${app.id}`, { settings: { dailyCapUsd: 100 } });
const linked = await call("POST", `/api/webapps/${app.id}/flows`, {});
assert.equal(linked.status, 200, JSON.stringify(linked.json));
const agent = store.getApp(db, linked.json.flows.app.id)!;

// Opened as the person would: through the proxy, which signs who is there on each request.
const open = new URL((await call<WebAppOpen>("POST", `/api/webapps/${app.id}/open`, {})).json.url.replace(".localhost", ".localhost"));
const request = (p: string, headers: Record<string, string>, body?: string) =>
  new Promise<{ text: string; cookie: string }>((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port: APPS_PORT, path: p, method: body === undefined ? "GET" : "POST", headers: { host: open.host, ...headers } }, (res) => {
      let text = "";
      res.on("data", (c) => (text += c));
      res.on("end", () => resolve({ text, cookie: (res.headers["set-cookie"] ?? []).map((c) => c.split(";")[0]).join("; ") }));
    });
    r.on("error", reject);
    r.end(body);
  });
const { cookie: session } = await request(open.pathname + open.search, {});
/** One of the section's requests, made by the app's server for the person at the screen. */
const hydor = async (method: string, p: string, body?: unknown, asPerson = false) => {
  const r = JSON.parse((await request("/call", { cookie: session, "content-type": "application/json", origin: `http://${open.host}` }, JSON.stringify({ method, path: p, body, asPerson }))).text) as { status: number; text: string };
  let json: any = null;
  try {
    json = JSON.parse(r.text);
  } catch {}
  return { status: r.status, text: r.text, json };
};

await step("the section's requests are the ones it names", async () => {
  for (const line of ["GET  $HYDOR_URL/api/apps/$HYDOR_APP_SLUG/flows", "POST $HYDOR_URL/api/apps/$HYDOR_APP_SLUG/run", "GET  …/run/<run id>?wait=30", "GET  …/run/<run id>/events", "GET  …/run?person=<person id>", "POST …/run/<run id>/answer", "POST …/run/<run id>/stop"]) assert.ok(section.includes(line), line);
});

let runId = "";
await step("the flows, a run started for the person at the screen with the header as received, its result, and the person's runs", async () => {
  const flows = await hydor("GET", "/flows");
  assert.equal(flows.status, 200, flows.text);
  assert.deepEqual([flows.json.flows[0].id, flows.json.flows[0].form[0].id, flows.json.flows[0].answer[0].id], ["run", "request", "answer"]);
  const started = await hydor("POST", "/run", { inputs: { request: "Look into the notes." }, ref: "note-1" }, true);
  assert.equal(started.status, 200, started.text);
  runId = started.json.id;
  assert.deepEqual([started.json.person.id, started.json.ref], ["owner", "note-1"]);
  assert.ok(["waiting", "working"].includes(started.json.state), started.json.state);
  let child: store.RunRecord | undefined;
  for (let i = 0; i < 300 && !(child = store.listRuns(db, { parent: runId }).find((r) => r.step === "work" && r.key)); i++) await sleep(25);
  assert.ok(child, "its agent step started");
  saveResult(child.id, { answer: "There are three." });
  sessions.end(child.key!);
  await waitFor(runId, 20_000);
  const got = await hydor("GET", `/run/${runId}?wait=30`);
  assert.deepEqual([got.json.state, got.json.result], ["done", { answer: "There are three." }]);
  const events = await hydor("GET", `/run/${runId}/events`);
  assert.match(events.text, /^event: run\n[\s\S]*event: end\n/);
  const list = await hydor("GET", "/run?person=owner");
  assert.deepEqual(list.json.runs.map((r: any) => r.id), [runId]);
});

await step("answering a run that does not ask is refused, and a run that is going can be stopped", async () => {
  assert.equal((await hydor("POST", `/run/${runId}/answer`, { step: "x", yes: true })).status, 409);
  const going = await hydor("POST", "/run", { inputs: { request: "Again." } }, true);
  const stopped = await hydor("POST", `/run/${going.json.id}/stop`);
  assert.equal(stopped.status, 200, stopped.text);
  assert.equal(stopped.json.state, "stopped");
});

await step("the functions.json the section shows is read as Hydor reads one, and shows on the app's Flows tab", async () => {
  const read = readFunctions(dir);
  assert.deepEqual([read.file, read.problems, read.fns.map((f) => [f.name, f.writes, f.path])], ["ok", [], [["find_notes", false, "/api/agent-functions/find_notes"]]]);
  const o = (await call("GET", `/api/webapps/${app.id}/flows/overview`)).json;
  assert.deepEqual([o.app.id, o.functions.list.map((f: any) => [f.name, f.allowed]), o.runs.length], [agent.id, [["find_notes", false]], 2]);
});

await web.stop!(null as never);
server.server.closeAllConnections();
await server.close();
db.close();
fs.rmSync(scratch, { recursive: true, force: true });
console.log(`\n${passed} checks passed`);
process.exit(0);
