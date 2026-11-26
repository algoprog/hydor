// Checks for what an app's own functions do for its agents (flows-functions.ts) and for the flows half's routes that came with them:
// functions.json read leniently; linking a flows folder that already holds a recipe; the person a run started on Hydor's pages acts
// for; where a maker allows the functions; a run for a person calling a function of a fixture web app (a small server that checks the
// signed header itself) as that person and no other; a tool step doing the same; what comes back and how it is cut and classified;
// the app started with the run and held awake until it ends; a run for nobody; the limits; the tool list fixed at the run's start.
// The agent is a stand-in: no model and no real agent runs. Ports 4341 to 4349.
// Build and run with scratch folders:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/webapps/flows-functions-test.ts
//   HOME=/tmp/hydor-test-ff-home DATA_DIR=/tmp/hydor-test-ff HYDOR_APPS_DIR=/tmp/hydor-test-ff-apps node dist/dev/flows-functions-test.js
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { cleanRecipe, type AppDef } from "../../shared/apps.ts";
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
import { registerFeatures } from "../features/registry.ts";
import { runTools } from "../features/registry.ts";
import { stepsOf } from "../apps/flow.ts";
import { FN_LIMITS, forgetLimits, heldBy, readFunctions, defaultPath } from "./flows-functions.ts";
import { callTool } from "../apps/sturdy.ts";
import { signPerson } from "./sign.ts";
import { writeTestApp } from "./test-apps.ts";

if (!process.env.DATA_DIR?.startsWith("/tmp/") || !process.env.HYDOR_APPS_DIR?.startsWith("/tmp/") || !process.env.HOME?.startsWith("/tmp/")) {
  console.error("Run with HOME=/tmp/…, DATA_DIR=/tmp/… and HYDOR_APPS_DIR=/tmp/… so nothing touches real data.");
  process.exit(2);
}

const HYDOR_PORT = 4342;
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
  /** The cards asked of the person (a function that changes things asks), and what they answer. */
  cards: { title: string; detail: string; facts?: { label: string; value: string; long?: boolean }[]; raw?: string }[] = [];
  decision = "accept";
  adapterByRun() {
    return { state: { mode: "default" }, ask: async (card: { title: string; detail: string; facts?: { label: string; value: string }[]; raw?: string }) => (this.cards.push({ title: card.title, detail: card.detail, facts: card.facts, raw: card.raw }), { decision: this.decision }) };
  }
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
registerFeatures([appsFeature, { id: "scrub-test", scrub: (t: string) => t.replace(/SECRET-\w+/g, "[hidden]") } as any], deps);
const web = createWebapps({ dataDir: path.join(scratch, "hydor-data"), port: 4341, origin: "", domain: "", idleMs: 600_000, sandbox: true, ports: [4343, 4349], startTimeoutMs: 20_000, hydorUrl: `http://127.0.0.1:${HYDOR_PORT}`, appsRoot: path.join(scratch, "WebApps") });
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


// ---- a fixture web app with functions ---------------------------------------------------------------------------------------

/** A web app that serves two functions as a real app would: it checks the signed header itself, and answers each person with their own rows. */
const FN_SERVER = String.raw`import http from 'node:http';
import crypto from 'node:crypto';
const secret = process.env.APP_SECRET;
const rows = { p1: ['Ada: the Alfama has the best light', 'Ada: SECRET-1234 is the wifi'], p2: ['Bo: the Belem tower is closed on Mondays'], owner: ['Owner: only the owner sees this'] };
const calls = [];
const who = (req) => {
  const v = req.headers['x-hydor-person'];
  if (typeof v !== 'string') return null;
  const [pay, sig] = v.split('.');
  if (!pay || crypto.createHmac('sha256', secret).update(pay).digest('base64url') !== sig) return null;
  const b = JSON.parse(Buffer.from(pay, 'base64url').toString());
  return b.exp * 1000 < Date.now() ? null : b;
};
http.createServer(async (req, res) => {
  const send = (code, body, type = 'application/json') => { res.writeHead(code, { 'content-type': type }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
  if (req.url === '/api/health') return send(200, { ok: true });
  if (req.url === '/__calls') return send(200, calls);
  let text = '';
  for await (const c of req) text += c;
  const m = /^\/api\/agent-functions\/(\w+)$/.exec(req.url);
  if (!m || req.method !== 'POST') return send(404, { error: 'not here' });
  const p = who(req);
  calls.push({ fn: m[1], person: p ? p.id : null, role: p ? p.role : null, input: JSON.parse(text || '{}') });
  if (!p) return send(401, { error: 'Sign in first.' });
  const input = JSON.parse(text || '{}');
  if (m[1] === 'search_findings') {
    if (input.query === 'forbidden') return send(403, { error: 'That belongs to someone else: you may not look at it.' });
    if (input.query === 'big') return send(200, { rows: 'x'.repeat(50000) });
    if (input.query === 'boom') return send(500, { error: 'Something broke on our side.' });
    if (input.query === 'html') return send(502, '<html><body>Bad gateway</body></html>', 'text/html');
    if (input.query === 'empty') return send(204, '');
    if (input.query === 'slow') return setTimeout(() => send(200, { late: true }), 3000);
    return send(200, { person: p.id, rows: (rows[p.id] || []).filter((r) => !input.query || r.toLowerCase().includes(String(input.query).toLowerCase())) });
  }
  if (m[1] === 'add_finding') {
    if (input.text === 'boom') return send(500, { error: 'It broke before it kept anything.' });
    (rows[p.id] ||= []).push(String(input.text));
    return send(200, { ok: true, count: rows[p.id].length });
  }
  send(404, { error: 'no such function' });
}).listen(Number(process.env.PORT), '127.0.0.1');
`;

const FUNCTIONS = {
  format: 1,
  app: "desk",
  functions: [
    { name: "search_findings", description: "Search the findings the person has kept.", input: { type: "object", properties: { query: { type: "string", description: "Words to look for." } }, required: ["query"] }, calls: { module: "src/x.ts", export: "a" }, writes: false },
    { name: "add_finding", description: "Keep a new finding for the person.", input: { type: "object", properties: { text: { type: "string", description: "What to keep." } }, required: ["text"] }, calls: { module: "src/x.ts", export: "b" }, writes: true },
  ],
};

/** A built web app with a functions.json and a server that serves them. */
function deskFixture(name: string, functions: unknown = FUNCTIONS): string {
  const dir = fixture(name);
  fs.writeFileSync(path.join(dir, ".output", "server", "index.mjs"), FN_SERVER);
  if (functions !== null) fs.writeFileSync(path.join(dir, "functions.json"), typeof functions === "string" ? functions : JSON.stringify(functions, null, 2));
  return dir;
}

const ADA = { id: "p1", name: "Ada", role: "member" as const };
const BO = { id: "p2", name: "Bo", role: "member" as const };

/** A linked desk: the web app, its agent app, the key's value and a way to start a run as a person (or as nobody) and to play the agent. */
async function desk(name: string, o: { functions?: unknown; recipe?: Record<string, unknown> } = {}) {
  const w = (await call("POST", "/api/webapps", { folder: deskFixture(name, o.functions), name })).json.app as WebApp;
  assert.equal((await call("PUT", `/api/webapps/${w.id}`, { settings: { dailyCapUsd: 100 } })).status, 200);
  let agent: AppDef | undefined;
  if (o.recipe) {
    agent = store.saveApp(db, { recipe: cleanRecipe(o.recipe) });
    assert.equal((await call("POST", `/api/webapps/${w.id}/flows`, { app: agent.id })).status, 200);
  } else {
    const made = await call("POST", `/api/webapps/${w.id}/flows`, {});
    assert.equal(made.status, 200, made.text);
    agent = store.getApp(db, made.json.flows.app.id)!;
  }
  const key = fs.readFileSync(keyFileOf(w), "utf8").trim();
  const secret = web.parts().host!.secret(w.id);
  const start = async (person: typeof ADA | null, inputs: Record<string, unknown> = { request: "Look into my findings." }) => {
    const r = await server.inject({ method: "POST", url: `/api/apps/${agent!.slug}/run`, headers: { authorization: `Bearer ${key}` }, payload: { inputs, ...(person ? { personToken: signPerson(person, secret) } : {}) } });
    assert.equal(r.statusCode, 200, r.body);
    return r.json() as { id: string; person?: unknown; misses?: { why: string }[] };
  };
  const callApp = async (fn: string, header?: string) => {
    const port = await web.parts().host!.ensure({ id: w.id, slug: w.slug, dir: w.folder });
    return fetch(`http://127.0.0.1:${port}/api/agent-functions/${fn}`, { method: "POST", headers: { "content-type": "application/json", ...(header ? { "x-hydor-person": header } : {}) }, body: "{}" });
  };
  const seen = async () => {
    const port = await web.parts().host!.ensure({ id: w.id, slug: w.slug, dir: w.folder });
    return (await (await fetch(`http://127.0.0.1:${port}/__calls`)).json()) as { fn: string; person: string | null; role: string | null; input: any }[];
  };
  return { w, agent: agent!, key, secret, start, seen, callApp };
}

/** The agent stand-in's view of a run's session: the tools its server offers it (as the app's MCP server lists them) and a way to call one. */
async function sessionOf(runId: string, step = "work") {
  let child: store.RunRecord | undefined;
  for (let i = 0; i < 300 && !(child = store.listRuns(db, { parent: runId, steps: true }).find((r) => r.step === step && r.key)); i++) await sleep(25);
  assert.ok(child, "its agent step started a session");
  const ctx = { runId: `agent-${child.id}`, key: child.key!, agent: "acp" as const, acpAgent: "console", cwd: scratch, deps };
  const tools = () => runTools(ctx);
  return {
    child,
    ctx,
    names: () => tools().map((t) => t.name).filter((n) => n.startsWith("appfn_")),
    tool: (n: string) => tools().find((t) => t.name === n),
    async call(n: string, args: Record<string, unknown>) {
      const t = tools().find((x) => x.name === n);
      assert.ok(t, `the tool ${n} is offered`);
      const r = await t.run(args, ctx);
      return (typeof r === "string" ? { text: r } : r) as { text: string; isError?: boolean; failure?: { status?: number; kind?: string } };
    },
    finish(answer = "Done.") {
      saveResult(child!.id, { answer });
      sessions.end(child!.key!, "Done.");
    },
  };
}

/** Counts the holds the host really has, for the web apps' idle check. */
const holds = { now: 0, taken: 0 };
{
  const h = web.parts().host!;
  const was = h.hold.bind(h);
  h.hold = (id: string) => {
    const release = was(id);
    holds.now++;
    holds.taken++;
    let done = false;
    return () => {
      if (!done) {
        done = true;
        holds.now--;
      }
      release();
    };
  };
}
const until = async (what: string, ok: () => boolean, ms = 8000) => {
  for (let i = 0; i < ms / 25 && !ok(); i++) await sleep(25);
  assert.ok(ok(), `in time: ${what}`);
};

// ---- the tests ----------------------------------------------------------------------------------------------------------------

test("functions.json is read leniently: a missing or broken file is no functions with the reason, a bad entry is left out and named, the rest stay, and an address defaults", async () => {
  const dir = path.join(scratch, "read");
  fs.mkdirSync(dir, { recursive: true });
  const missing = readFunctions(dir);
  assert.equal(missing.file, "missing");
  assert.deepEqual(missing.fns, []);
  assert.match(missing.problems[0], /has no functions\.json .* offers its agents no functions\. Build the app again/);
  fs.writeFileSync(path.join(dir, "functions.json"), "{ not json");
  assert.equal(readFunctions(dir).file, "broken");
  assert.match(readFunctions(dir).problems[0], /cannot be read/);
  fs.writeFileSync(path.join(dir, "functions.json"), JSON.stringify({ format: 1 }));
  assert.match(readFunctions(dir).problems[0], /no list of functions/);
  fs.writeFileSync(path.join(dir, "functions.json"), JSON.stringify({ format: 7, functions: [] }));
  assert.match(readFunctions(dir).problems[0], /format \(7\)/);
  const good = { name: "find_trips", description: "Find the person's trips.", input: { type: "object", properties: { q: { type: "string", description: "x" } } } };
  fs.writeFileSync(
    path.join(dir, "functions.json"),
    JSON.stringify({
      format: 1,
      app: "x",
      functions: [
        good,
        { ...good, name: "Bad-Name" },
        { ...good, name: "a".repeat(41) },
        { ...good }, // the same name twice
        { ...good, name: "no_description", description: "  " },
        { ...good, name: "no_input", input: { type: "array" } },
        { ...good, name: "huge_input", input: { type: "object", properties: { a: { type: "string", description: "y".repeat(25_000) } } } },
        { ...good, name: "bad_path", path: "https://elsewhere.example/x" },
        { ...good, name: "dotdot", path: "/api/../admin" },
        { ...good, name: "own_path", path: "/api/trips/find", writes: true },
        null,
      ],
    }),
  );
  const read = readFunctions(dir);
  assert.equal(read.file, "ok");
  assert.deepEqual(read.fns.map((f) => f.name), ["find_trips", "own_path"]);
  assert.equal(read.fns[0].path, defaultPath("find_trips"));
  assert.equal(read.fns[0].path, "/api/agent-functions/find_trips");
  assert.equal(read.fns[1].path, "/api/trips/find");
  assert.equal(read.fns[1].writes, true);
  assert.equal(read.fns[0].writes, false);
  assert.equal(read.problems.length, 9, read.problems.join("\n"));
  for (const word of ["Bad-Name", "longer than 40", "another has its name", "no_description", "no_input", "huge_input", "bad_path", "dotdot", "(no name)"]) assert.ok(read.problems.some((p) => p.includes(word)), word);
});

test("linking a flows folder that already holds a valid recipe (an app may bring one) makes it the agent app's definition; a broken one is refused with the plain reasons and nothing is left half-made", async () => {
  const good = {
    $schema: "./.naget/app.schema.json",
    name: "Research desk",
    description: "Looks a question up on the web and writes a short, sourced answer.",
    icon: "telescope",
    color: "indigo",
    tier: "standard",
    language: "person",
    prompt: "Research this question.\n\nQuestion: {{question}}",
    fields: [{ id: "question", label: "What do you want to know?", type: "long", required: true }],
    answer: [{ id: "summary", label: "Answer", type: "markdown", required: true }, { id: "sources", label: "Sources", type: "list", required: true }],
    limits: { runsPerDay: 50, capUsd: 0.5 },
  };
  const a = await register("starter");
  fs.mkdirSync(path.join(a.folder, "flows"), { recursive: true });
  fs.writeFileSync(path.join(a.folder, "flows", APP_FILE), JSON.stringify(good, null, 2));
  fs.writeFileSync(path.join(a.folder, "flows", "README.md"), "# flows/\nThe app's own note, kept.\n");
  const r = await call("POST", `/api/webapps/${a.id}/flows`, {});
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.created, true);
  assert.equal(r.json.from, "folder");
  assert.equal(r.json.flows.app.name, "Research desk");
  const agent = store.getApp(db, r.json.flows.app.id)!;
  assert.equal(agent.description, good.description);
  assert.deepEqual(agent.fields.map((f) => f.id), ["question"]);
  assert.deepEqual(agent.answer.map((f) => f.id), ["summary", "sources"]);
  assert.equal(agent.tier, "standard");
  assert.equal(agent.limits.capUsd, 0.5);
  assert.equal(agent.flow, undefined, "the recipe's own shape (one agent with a prompt), not the starting recipe");
  assert.equal(agent.folder, path.join(a.folder, "flows"));
  assert.deepEqual(agent.webapp, { id: a.id, name: "starter" });
  assert.equal(fs.readFileSync(path.join(a.folder, "flows", "README.md"), "utf8"), "# flows/\nThe app's own note, kept.\n");
  assert.ok(fs.existsSync(path.join(a.folder, "flows", "instructions", "task.md")), "the folder is written the way agent apps keep theirs");
  assert.equal(store.listKeys(db, agent.id).length, 1, "and its key is made");
  // The same recipe with an agent app named: refused (its folder is not that app's).
  const b = await register("starter-two");
  fs.mkdirSync(path.join(b.folder, "flows"), { recursive: true });
  fs.writeFileSync(path.join(b.folder, "flows", APP_FILE), JSON.stringify(good));
  const mine = store.saveApp(db, { recipe: cleanRecipe({ name: "Mine", prompt: "x", answer: [{ id: "a", label: "A", type: "text" }] }) });
  const refused = await call("POST", `/api/webapps/${b.id}/flows`, { app: mine.id });
  assert.equal(refused.status, 409);
  assert.match(refused.json.error, /already has files in it/);
  // Broken recipes: each is a 400 with the reasons; no app, no key, the folder as it was.
  const count = () => ({ apps: store.listApps(db).length, keys: (db.prepare("select count(*) as n from app_keys").get() as { n: number }).n });
  const before = count();
  const cases: [string, string, RegExp][] = [
    ["not json", '{ "name": ', /app\.json: /],
    ["no task at all", JSON.stringify({ name: "Empty", fields: [], answer: [] }), /Write the prompt/],
    ["a tool step that is no tool", JSON.stringify({ name: "Bad flow", prompt: "x", fields: [], answer: [{ id: "a", label: "A", type: "text" }], flow: { steps: [{ id: "one", do: "tool", tool: "telepathy" }] } }), /telepathy cannot run as a step/],
    ["a file it points at that is not there", JSON.stringify({ name: "File", prompt: { file: "instructions/missing.md" }, fields: [], answer: [] }), /instructions\/missing\.md is missing/],
  ];
  for (const [what, text, reason] of cases) {
    const c = await register(`broken-${what.replace(/\W+/g, "-")}`);
    fs.mkdirSync(path.join(c.folder, "flows"), { recursive: true });
    fs.writeFileSync(path.join(c.folder, "flows", APP_FILE), text);
    const x = await call("POST", `/api/webapps/${c.id}/flows`, {});
    assert.equal(x.status, 400, `${what}: ${x.text}`);
    assert.match(x.json.error, /recipe \(app\.json\) that cannot be used as it is/, what);
    assert.match(x.json.error, reason, what);
    assert.ok(Array.isArray(x.json.problems) && x.json.problems.length > 0, what);
    assert.equal(fs.readFileSync(path.join(c.folder, "flows", APP_FILE), "utf8"), text, `${what}: the file is untouched`);
    assert.equal((await call("GET", `/api/webapps/${c.id}`)).json.app.flows, undefined);
  }
  assert.deepEqual(count(), before, "no app and no key was made");
  // Files with no recipe among them are still refused, now saying why.
  const d = await register("files-only");
  fs.mkdirSync(path.join(d.folder, "flows"), { recursive: true });
  fs.writeFileSync(path.join(d.folder, "flows", "notes.txt"), "mine");
  const x = await call("POST", `/api/webapps/${d.id}/flows`, {});
  assert.equal(x.status, 409);
  assert.match(x.json.error, /no app\.json to say what the agent app is/);
  // A recipe with screens is not one a linked app can have.
  const e = await register("with-screens");
  fs.mkdirSync(path.join(e.folder, "flows", "screens"), { recursive: true });
  fs.writeFileSync(path.join(e.folder, "flows", "screens", "main.html"), "<p>hi</p>");
  fs.writeFileSync(path.join(e.folder, "flows", APP_FILE), JSON.stringify({ ...good, name: "Screened", screens: { main: { file: "screens/main.html" } } }));
  const y = await call("POST", `/api/webapps/${e.id}/flows`, {});
  assert.equal(y.status, 400);
  assert.match(y.json.error, /has screens/);
});

test("a run started on Hydor's own pages for a linked app records the signed-in person it acts for, in the shape of a proven person; an app that is not linked records none", async () => {
  const d = await desk("pages", { functions: null });
  const r = await call("POST", `/api/apps/${d.agent.id}/runs`, { inputs: { request: "From the page" } });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json.run.person, { id: "owner", name: "Dana", role: "owner" });
  assert.deepEqual(store.getRun(db, r.json.run.id)!.person, { id: "owner", name: "Dana", role: "owner" });
  // The key routes with the sign-in (no key) too; with the key and no token, nobody.
  const signed = await call("POST", `/api/apps/${d.agent.slug}/run`, { inputs: { request: "By the route" } });
  assert.deepEqual(signed.json.person, { id: "owner", name: "Dana", role: "owner" });
  const job = await d.start(null);
  assert.equal(job.person, null);
  // A test of a recipe on screen acts for nobody; an app that is not linked records no person.
  const tried = await call("POST", `/api/apps/test/runs`, { source: "test", recipe: d.agent, inputs: { request: "x" } });
  assert.equal(tried.status, 200, tried.text);
  assert.equal(tried.json.run.person, undefined);
  const plain = store.saveApp(db, { recipe: cleanRecipe({ name: "Plain", prompt: "Do {{x}}", fields: [{ id: "x", label: "X", type: "text" }], answer: [{ id: "a", label: "A", type: "text" }] }) });
  const p = await call("POST", `/api/apps/${plain.id}/runs`, { inputs: { x: "y" } });
  assert.equal(p.json.run.person, undefined);
});

test("by default a new link offers no function; the maker allows them in the agent app's tools, by the route or by hand, and a function that changes things has to be named", async () => {
  const d = await desk("allow");
  const view = (await call("GET", `/api/webapps/${d.w.id}/flows/functions`)).json;
  assert.equal(view.file, "ok");
  assert.deepEqual(view.functions.map((f: any) => [f.name, f.writes, f.allowed]), [["search_findings", false, false], ["add_finding", true, false]]);
  assert.match(view.allowedIn, /fn:<name>.*fn:\*/);
  assert.equal(d.agent.tools, null, "a new link allows none: its tools are the plain default");
  // Run for Ada with nothing allowed: no function tool, and nothing said (nobody asked for any).
  const run = await d.start(ADA);
  const s = await sessionOf(run.id);
  assert.deepEqual(s.names(), []);
  assert.equal(run.misses, undefined);
  s.finish();
  await waitFor(run.id, 10_000);
  // Allow the one that reads, by the route.
  const put = await call("PUT", `/api/webapps/${d.w.id}/flows/functions`, { allow: ["search_findings"] });
  assert.equal(put.status, 200, put.text);
  assert.ok(put.json.tools.includes("fn:search_findings"));
  assert.equal(put.json.functions.find((f: any) => f.name === "search_findings").allowed, true);
  assert.equal(put.json.functions.find((f: any) => f.name === "add_finding").allowed, false);
  // "*" allows the reads only; a writing function is named.
  const star = await call("PUT", `/api/webapps/${d.w.id}/flows/functions`, { allow: "*" });
  assert.deepEqual(star.json.functions.map((f: any) => f.allowed), [true, false]);
  const both = await call("PUT", `/api/webapps/${d.w.id}/flows/functions`, { allow: ["*", "add_finding"] });
  assert.deepEqual(both.json.functions.map((f: any) => f.allowed), [true, true]);
  const none = await call("PUT", `/api/webapps/${d.w.id}/flows/functions`, { allow: [] });
  assert.deepEqual(none.json.functions.map((f: any) => f.allowed), [false, false]);
  assert.ok(!none.json.tools?.some((t: string) => t.startsWith("fn:")));
  // Refusals say why.
  const bad = await call("PUT", `/api/webapps/${d.w.id}/flows/functions`, { allow: ["delete_everything"] });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error, /does not offer “delete_everything” \(it offers search_findings, add_finding\)/);
  assert.equal((await call("PUT", `/api/webapps/${d.w.id}/flows/functions`, { allow: 7 })).status, 400);
  assert.equal((await call("GET", `/api/webapps/${(await register("no-flows")).id}/flows/functions`)).status, 404);
  // The same by hand, in the recipe's own list, which the folder keeps.
  store.saveApp(db, { id: d.agent.id, recipe: { ...store.getApp(db, d.agent.id)!, tools: ["web_search", "fn:search_findings"] } });
  assert.equal((await call("GET", `/api/webapps/${d.w.id}/flows/functions`)).json.functions[0].allowed, true);
});

test("a run for a person calls a function of the app: the app gets Hydor's own signed header for that person and answers them alone; a second person gets their own rows and never the first's", async () => {
  const d = await desk("calls");
  await call("PUT", `/api/webapps/${d.w.id}/flows/functions`, { allow: ["search_findings"] });
  const held = holds.now;
  // Ada's run: a stand-in agent calls the tool (as an agent does on the session's own MCP server) and hands in an answer built from what it got.
  const run = await d.start(ADA);
  assert.deepEqual(run.person, ADA);
  const s = await sessionOf(run.id);
  assert.deepEqual(s.child.person, ADA, "the run of its agent step carries the person of its parent");
  assert.deepEqual(s.names(), ["appfn_search_findings"], "only the function the recipe allows (not add_finding, which changes things)");
  const t = s.tool("appfn_search_findings")!;
  assert.match(t.description, /Search the findings the person has kept\./);
  assert.match(t.description, /acts as Ada/);
  assert.deepEqual(t.annotations, { readOnlyHint: true, openWorldHint: false });
  assert.deepEqual((t.inputSchema as any).required, ["query"]);
  const got = await s.call("appfn_search_findings", { query: "" });
  assert.ok(!got.isError, JSON.stringify(got));
  const body = JSON.parse(got.text);
  assert.equal(body.person, "p1", "the app saw Ada, from the header Hydor signed");
  assert.deepEqual(body.rows, ["Ada: the Alfama has the best light", "Ada: [hidden] is the wifi"], "Ada's rows only, through Hydor's own scrubbing");
  assert.ok(!got.text.includes("Bo:") && !got.text.includes("SECRET-1234"));
  s.finish(`Ada found: ${body.rows[0]}`);
  const done = (await waitFor(run.id, 10_000))!;
  assert.equal(done.status, "done");
  // Bo, in another run: his own row, never Ada's.
  const run2 = await d.start(BO);
  const s2 = await sessionOf(run2.id);
  const got2 = JSON.parse((await s2.call("appfn_search_findings", { query: "" })).text);
  assert.equal(got2.person, "p2");
  assert.deepEqual(got2.rows, ["Bo: the Belem tower is closed on Mondays"]);
  s2.finish();
  await waitFor(run2.id, 10_000);
  // What the app saw: each call as the person its run acts for, with the role the header named, and nothing else.
  const seen = await d.seen();
  assert.deepEqual(seen.map((c) => [c.fn, c.person, c.role]), [["search_findings", "p1", "member"], ["search_findings", "p2", "member"]]);
  // The app's own check: a header signed with another secret, an expired one and none are refused by the app itself, as for a click.
  assert.equal((await d.callApp("search_findings")).status, 401);
  assert.equal((await d.callApp("search_findings", signPerson(ADA, "another-secret"))).status, 401);
  assert.equal((await d.callApp("search_findings", signPerson(ADA, d.secret, -3600))).status, 401);
  assert.equal((await d.callApp("search_findings", signPerson(ADA, d.secret))).status, 200);
  // Every call is a step of the run's page: which function, for whom, how it ended; nothing of what the app returned.
  const steps = stepsOf(run.id, { values: true }).filter((x) => x.kind === "tool");
  assert.equal(steps.length, 1);
  assert.deepEqual([steps[0].path, steps[0].id, steps[0].title, steps[0].status], ["fn#1", "fn_search_findings", "Called search_findings for Ada", "done"]);
  assert.deepEqual(Object.keys(steps[0].values!).sort(), ["as", "chars", "ended", "function", "ms"]);
  assert.deepEqual(steps[0].values!.as, { id: "p1", name: "Ada" });
  assert.ok(!JSON.stringify(stepsOf(run.id, { values: true }).filter((x) => x.path.startsWith("fn#"))).includes("Alfama"), "no data of the app on the run's page");
  assert.ok(!JSON.stringify(store.listSteps(db, run.id).filter((x) => x.path.startsWith("fn#"))).includes("Alfama"));
  // The key routes show the same step.
  const read = (await server.inject({ method: "GET", url: `/api/apps/${d.agent.slug}/run/${run.id}`, headers: { authorization: `Bearer ${d.key}` } })).json();
  assert.ok(read.steps.some((x: any) => x.step === "fn#1" && x.status === "done" && x.title === "Called search_findings for Ada"));
  assert.equal(holds.now, held, "and the app is no longer held once both runs are over");
});

test("the app is started when the run starts, not at the first call, and held awake for the length of the run: released when it ends, however it ends", async () => {
  const d = await desk("held");
  await call("PUT", `/api/webapps/${d.w.id}/flows/functions`, { allow: ["search_findings"] });
  assert.equal(web.parts().host!.status(d.w.id).state, "stopped");
  const before = holds.taken;
  const run = await d.start(ADA);
  await until("the app is running before any call was made", () => web.parts().host!.status(d.w.id).state === "running");
  await until("it is held", () => heldBy(d.w.id) === 1 && holds.taken === before + 1);
  assert.equal((await d.seen()).length, 0, "no function was called yet");
  const s = await sessionOf(run.id);
  await s.call("appfn_search_findings", { query: "alfama" });
  await s.call("appfn_search_findings", { query: "alfama" });
  assert.equal(holds.taken, before + 1, "one hold for the run, not one for each call");
  assert.equal(heldBy(d.w.id), 1);
  s.finish();
  await waitFor(run.id, 10_000);
  await until("released at the end", () => heldBy(d.w.id) === 0);
  // A run that is stopped releases it too.
  const run2 = await d.start(BO);
  await until("held again", () => heldBy(d.w.id) === 1);
  await sessionOf(run2.id);
  assert.equal((await server.inject({ method: "POST", url: `/api/apps/${d.agent.slug}/run/${run2.id}/stop`, headers: { authorization: `Bearer ${d.key}` } })).statusCode, 200);
  await until("released when stopped", () => heldBy(d.w.id) === 0);
  // The app is stopped while a run goes on: the first call starts it again.
  const run3 = await d.start(ADA);
  const s3 = await sessionOf(run3.id);
  await web.parts().host!.stop(d.w.id);
  assert.equal(web.parts().host!.status(d.w.id).state, "stopped");
  const again = await s3.call("appfn_search_findings", { query: "alfama" });
  assert.ok(!again.isError, again.text);
  assert.equal(web.parts().host!.status(d.w.id).state, "running");
  s3.finish();
  await waitFor(run3.id, 10_000);
  await until("released", () => heldBy(d.w.id) === 0);
});

test("a run that acts for nobody gets none of the functions, and the run says so in a sentence rather than failing silently; a child run carries its parent's person", async () => {
  const d = await desk("nobody");
  await call("PUT", `/api/webapps/${d.w.id}/flows/functions`, { allow: ["*", "add_finding"] });
  const job = await d.start(null);
  assert.equal(job.person, null);
  assert.ok(job.misses?.some((m) => /acts for nobody .* none of the app’s functions are offered to its agents/.test(m.why)), JSON.stringify(job.misses));
  const s = await sessionOf(job.id);
  assert.deepEqual(s.names(), [], "no function is offered");
  assert.equal(s.tool("appfn_search_findings"), undefined);
  assert.equal(s.child.person, null);
  // Not even by asking: the session's own server does not have it, and allowTool says no.
  assert.equal(appsFeature.allowTool!("appfn_search_findings", s.ctx), false);
  s.finish();
  const done = (await waitFor(job.id, 10_000))!;
  assert.equal(done.status, "done", "the run itself is not failed by it");
  assert.ok(done.misses?.length);
  const read = (await server.inject({ method: "GET", url: `/api/apps/${d.agent.slug}/run/${job.id}`, headers: { authorization: `Bearer ${d.key}` } })).json();
  assert.ok(read.misses.some((m: any) => /acts for nobody/.test(m.why)), "the program reading the run sees it too");
  assert.equal((await d.seen()).length, 0);
  // Without a link nothing is said: a plain agent app is as it was.
  const plain = store.saveApp(db, { recipe: cleanRecipe({ name: "Plain two", prompt: "Do {{x}}", fields: [{ id: "x", label: "X", type: "text" }], answer: [{ id: "a", label: "A", type: "text" }], tools: ["fn:*"] }) });
  const r = await call("POST", `/api/apps/${plain.id}/runs`, { inputs: { x: "y" } });
  assert.equal(store.getRun(db, r.json.run.id)!.misses, undefined);
});

test("the maker's allow-list rules: a function that is not allowed is not offered, whatever the person; a function that writes has to be named", async () => {
  const d = await desk("rules");
  await call("PUT", `/api/webapps/${d.w.id}/flows/functions`, { allow: ["add_finding"], free: ["add_finding"] });
  let a = store.getApp(db, d.agent.id)!;
  assert.ok(a.tools!.includes("fn:add_finding!"));
  const run = await d.start(ADA);
  const s = await sessionOf(run.id);
  assert.deepEqual(s.names(), ["appfn_add_finding"], "only what is named");
  assert.match(s.tool("appfn_add_finding")!.description, /This changes what the app keeps\./);
  assert.deepEqual(s.tool("appfn_add_finding")!.annotations, { readOnlyHint: false, openWorldHint: false });
  const kept = JSON.parse((await s.call("appfn_add_finding", { text: "Ada: try the tram 28" })).text);
  assert.deepEqual(kept, { ok: true, count: 3 });
  assert.equal(appsFeature.allowTool!("appfn_add_finding", s.ctx), true);
  assert.equal(appsFeature.allowTool!("appfn_search_findings", s.ctx), false, "not allowed");
  assert.equal(appsFeature.allowTool!("appfn_nothing_here", s.ctx), false, "not there");
  s.finish();
  await waitFor(run.id, 10_000);
  // Bo sees none of what Ada kept; Ada does.
  await call("PUT", `/api/webapps/${d.w.id}/flows/functions`, { allow: ["search_findings"] });
  const run2 = await d.start(BO);
  const s2 = await sessionOf(run2.id);
  assert.deepEqual(JSON.parse((await s2.call("appfn_search_findings", { query: "tram" })).text).rows, [], "a row Ada kept is not Bo's");
  s2.finish();
  await waitFor(run2.id, 10_000);
  const ada = await d.start(ADA);
  const s3 = await sessionOf(ada.id);
  assert.deepEqual(JSON.parse((await s3.call("appfn_search_findings", { query: "tram" })).text).rows, ["Ada: try the tram 28"]);
  s3.finish();
  await waitFor(ada.id, 10_000);
  // An agent step with a list of its own: its list decides for it.
  a = store.getApp(db, d.agent.id)!;
  store.saveApp(db, { id: a.id, recipe: { ...a, tools: ["fn:search_findings"], flow: { steps: [{ id: "work", do: "agent", title: "Do the work", instructions: "Do it. {{request}}", tools: ["web_search"], outputs: [{ id: "answer", label: "Answer", type: "markdown", required: true }] }] } } });
  const run3 = await d.start(ADA);
  const s4 = await sessionOf(run3.id);
  assert.deepEqual(s4.names(), [], "the step's own list does not name one");
  s4.finish();
  await waitFor(run3.id, 10_000);
  // A session that is no run's never has them.
  const other = { runId: "x", key: "acp:not-a-run", agent: "acp" as const, acpAgent: "console", cwd: scratch, deps };
  assert.deepEqual(runTools(other).filter((t) => t.name.startsWith("appfn_")), []);
  assert.equal(appsFeature.allowTool!("appfn_search_findings", other), false);
});

test("a tool step calls a function as the person its run acts for, through the same tools; one that is not offered fails the step in a sentence that says what to change", async () => {
  const d = await desk("toolstep", {
    recipe: {
      name: "Look up",
      prompt: "x",
      fields: [{ id: "q", label: "Words", type: "text", required: true }],
      answer: [{ id: "found", label: "Found", type: "text" }],
      tools: ["fn:search_findings"],
      flow: { steps: [{ id: "look", do: "tool", tool: "fn:search_findings", with: { query: "{{q}}" } }], outputs: { found: "Rows: {{look.text}}" } },
    },
  });
  const ask = async (p: typeof ADA | null, q: string) => {
    const run = await d.start(p, { q });
    return (await waitFor(run.id, 20_000))!;
  };
  const ada = await ask(ADA, "alfama");
  assert.equal(ada.status, "done", `${ada.error} ${JSON.stringify(store.listSteps(db, ada.id))}`);
  assert.deepEqual(JSON.parse(String(ada.result!.found).replace(/^Rows: /, "")).rows, ["Ada: the Alfama has the best light"]);
  const bo = await ask(BO, "belem");
  assert.deepEqual(JSON.parse(String(bo.result!.found).replace(/^Rows: /, "")).rows, ["Bo: the Belem tower is closed on Mondays"]);
  const crossed = await ask(BO, "alfama");
  assert.deepEqual(JSON.parse(String(crossed.result!.found).replace(/^Rows: /, "")).rows, [], "Bo asking for Ada's words finds none of hers");
  assert.equal(stepsOf(ada.id).filter((x) => x.kind === "tool" && x.path.startsWith("fn#")).length, 1, "the call is a step of the run, beside the flow's own step");
  // For nobody: the step fails in a sentence, and the run says why.
  const nobody = await ask(null, "alfama");
  assert.equal(nobody.status, "failed");
  assert.match(nobody.error!, /acts for nobody, so the app’s functions are not offered to it/);
  // Not allowed: the sentence says what to add.
  store.saveApp(db, { id: d.agent.id, recipe: { ...store.getApp(db, d.agent.id)!, tools: ["web_search"] } });
  const denied = await ask(ADA, "alfama");
  assert.equal(denied.status, "failed");
  assert.match(denied.error!, /do not allow the function “search_findings”: add fn:search_findings \(or fn:\*\) to the agent app’s tools/);
  // A function the file does not have.
  store.saveApp(db, { id: d.agent.id, recipe: { ...store.getApp(db, d.agent.id)!, tools: ["fn:ghost"], flow: { steps: [{ id: "look", do: "tool", tool: "fn:ghost", with: {} }], outputs: { found: "{{look.text}}" } } } });
  const ghost = await ask(ADA, "x");
  assert.match(ghost.error!, /does not offer a function “ghost” \(it offers search_findings, add_finding\)/);
});

test("what comes back: the app's plain sentence on a refusal, the answer cut to a sensible size, a failure Hydor's own classification reads, and a call that takes too long", async () => {
  const d = await desk("results");
  await call("PUT", `/api/webapps/${d.w.id}/flows/functions`, { allow: ["search_findings"] });
  const run = await d.start(ADA);
  const s = await sessionOf(run.id);
  const ask = (query: string) => s.call("appfn_search_findings", { query });
  const refused = await ask("forbidden");
  assert.equal(refused.isError, true);
  assert.equal(refused.text, "The app refused it (403): That belongs to someone else: you may not look at it.");
  assert.equal(refused.failure!.status, 403);
  const boom = await ask("boom");
  assert.equal(boom.text, "The app answered 500: Something broke on our side.");
  assert.equal(boom.failure!.status, 500);
  const html = await ask("html");
  assert.equal(html.text, "The app answered 502.", "a page of markup is no sentence");
  const empty = await ask("empty");
  assert.equal(empty.isError, undefined);
  assert.equal(empty.text, "The function answered with nothing.");
  const big = await ask("big");
  assert.ok(!big.isError);
  assert.ok(big.text.length < FN_LIMITS.resultChars + 400, `${big.text.length}`);
  assert.match(big.text, /\(cut: the app’s answer is 50\d{3} characters, and Hydor passes on the first 20000\./);
  const was = FN_LIMITS.timeoutMs;
  FN_LIMITS.timeoutMs = 400;
  try {
    const slow = await ask("slow");
    assert.equal(slow.isError, true);
    assert.equal(slow.text, "The app did not answer within 0.4 seconds.");
    assert.equal(slow.failure!.kind, "timeout");
  } finally {
    FN_LIMITS.timeoutMs = was;
  }
  // The steps say how each ended, with the app's sentence (not its data) on a failure.
  const steps = stepsOf(run.id, { values: true }).filter((x) => x.path.startsWith("fn#"));
  assert.deepEqual(steps.map((x) => x.status), ["failed", "failed", "failed", "done", "done", "failed"]);
  assert.equal(steps[0].error, "The app refused it (403): That belongs to someone else: you may not look at it.");
  assert.equal(steps[0].values!.ended, "the app answered 403");
  // Hydor's own failure classification (a flow tries a call again while its failure may pass; a refusal it does not repeat): through the same call a tool step makes.
  const tool = s.tool("appfn_search_findings")!;
  const c403 = await callTool(tool, { query: "forbidden" }, s.ctx);
  assert.equal(c403.ok, false);
  assert.equal(c403.tries, 1, "a refusal is not tried again");
  assert.equal((c403 as any).failure.status, 403);
  const c500 = await callTool(tool, { query: "boom" }, s.ctx, { random: () => 0.5 });
  assert.equal(c500.ok, false);
  assert.equal(c500.tries, 3, "a read that failed on the app's side is tried again, as every read is");
  s.finish();
  await waitFor(run.id, 10_000);
  // A call that changes things is not tried again after a failure that may have been taken (500), as the tools of Hydor that change things are not.
  await call("PUT", `/api/webapps/${d.w.id}/flows/functions`, { allow: ["add_finding"], free: ["add_finding"] });
  const run2 = await d.start(ADA);
  const s2 = await sessionOf(run2.id);
  const writes = await callTool(s2.tool("appfn_add_finding")!, { text: "x" }, s2.ctx);
  assert.equal(writes.ok, true);
  const w500 = await callTool(s2.tool("appfn_add_finding")!, { text: "boom" }, s2.ctx, { random: () => 0.5 });
  assert.equal(w500.ok, false);
  assert.equal(w500.tries, 1, "not tried again: it may have been taken");
  assert.equal((w500 as any).failure.status, 500);
  s2.finish();
  await waitFor(run2.id, 10_000);
});

test("limits: calls in all and in a minute for one run, calls in a minute for all of an app's runs; a refused call says so and is a step that failed", async () => {
  const d = await desk("limits");
  await call("PUT", `/api/webapps/${d.w.id}/flows/functions`, { allow: ["search_findings"] });
  const was = { ...FN_LIMITS };
  try {
    FN_LIMITS.perRun = 3;
    const run = await d.start(ADA);
    const s = await sessionOf(run.id);
    for (let i = 0; i < 3; i++) assert.ok(!(await s.call("appfn_search_findings", { query: "alfama" })).isError);
    const over = await s.call("appfn_search_findings", { query: "alfama" });
    assert.equal(over.isError, true);
    assert.match(over.text, /This run has made the 3 calls to the app’s functions that one run may make/);
    assert.equal(over.failure!.kind, "refused", "Hydor's flows do not repeat a refusal");
    assert.equal((await d.seen()).length, 3, "the refused call never reached the app");
    const steps = stepsOf(run.id, { values: true }).filter((x) => x.path.startsWith("fn#"));
    assert.deepEqual(steps.map((x) => x.status), ["done", "done", "done", "failed"]);
    assert.match(steps[3].values!.ended as string, /refused: calls for this run used/);
    s.finish();
    await waitFor(run.id, 10_000);
    // In a minute.
    FN_LIMITS.perRun = 60;
    FN_LIMITS.perRunPerMinute = 2;
    const run2 = await d.start(BO);
    const s2 = await sessionOf(run2.id);
    for (let i = 0; i < 2; i++) assert.ok(!(await s2.call("appfn_search_findings", { query: "x" })).isError);
    const slow = await s2.call("appfn_search_findings", { query: "x" });
    assert.match(slow.text, /This run has made 2 calls to the app’s functions in the last minute, the most it may/);
    s2.finish();
    await waitFor(run2.id, 10_000);
    // All the runs of one app in a minute: four calls in all, whoever makes them.
    FN_LIMITS.perRunPerMinute = 20;
    FN_LIMITS.perAppPerMinute = 4;
    const ra = await d.start(ADA);
    const rb = await d.start(BO);
    const sa = await sessionOf(ra.id);
    const sb = await sessionOf(rb.id);
    const outcomes: boolean[] = [];
    for (const x of [sa, sb, sa, sb]) outcomes.push(!(await x.call("appfn_search_findings", { query: "x" })).isError);
    // The two runs before this one count too (two calls were made in the minute): some of these are refused, and never more than four in all got through.
    const last = await sa.call("appfn_search_findings", { query: "x" });
    assert.equal(last.isError, true);
    assert.match(last.text, /called 4 times in the last minute by all the runs of this app/);
    assert.ok(outcomes.filter(Boolean).length <= 4);
    sa.finish();
    sb.finish();
    await Promise.all([waitFor(ra.id, 10_000), waitFor(rb.id, 10_000)]);
  } finally {
    Object.assign(FN_LIMITS, was);
  }
  // A call is not spending: the web app's daily cap is what it was (runs started count, calls do not).
  assert.equal(store.usageSince(db, d.agent.id, 0).spent, 0);
});

test("the tool list is fixed when the run begins: a functions.json rebuilt during the run changes nothing for it, and the next run reads the new one; a missing or broken file is said on the run", async () => {
  const d = await desk("fixed");
  await call("PUT", `/api/webapps/${d.w.id}/flows/functions`, { allow: ["*"] });
  const file = path.join(d.w.folder, "functions.json");
  const run = await d.start(ADA);
  const s = await sessionOf(run.id);
  assert.deepEqual(s.names(), ["appfn_search_findings"]);
  fs.writeFileSync(file, JSON.stringify({ format: 1, functions: [] }));
  assert.deepEqual(s.names(), ["appfn_search_findings"], "the same list, whatever the file says now");
  assert.ok(!(await s.call("appfn_search_findings", { query: "x" })).isError);
  s.finish();
  await waitFor(run.id, 10_000);
  const next = await d.start(ADA);
  const s2 = await sessionOf(next.id);
  assert.deepEqual(s2.names(), [], "the next run reads the file as it is");
  s2.finish();
  await waitFor(next.id, 10_000);
  // Missing and broken: no tools, said on the run, the run itself fine.
  fs.rmSync(file);
  const missing = await d.start(ADA);
  assert.ok(missing.misses?.some((m) => /has no functions\.json/.test(m.why)), JSON.stringify(missing.misses));
  const s3 = await sessionOf(missing.id);
  assert.deepEqual(s3.names(), []);
  s3.finish();
  assert.equal((await waitFor(missing.id, 10_000))!.status, "done");
  fs.writeFileSync(file, "{ nope");
  const broken = await d.start(ADA);
  assert.ok(broken.misses?.some((m) => /cannot be read/.test(m.why)), JSON.stringify(broken.misses));
  (await sessionOf(broken.id)).finish();
  await waitFor(broken.id, 10_000);
  // One bad entry is named, and the good ones stay.
  fs.writeFileSync(file, JSON.stringify({ format: 1, functions: [FUNCTIONS.functions[0], { name: "BAD", description: "x", input: { type: "object", properties: {} } }] }));
  const some = await d.start(ADA);
  assert.ok(some.misses?.some((m) => /“BAD” is left out/.test(m.why)));
  const s4 = await sessionOf(some.id);
  assert.deepEqual(s4.names(), ["appfn_search_findings"]);
  s4.finish();
  await waitFor(some.id, 10_000);
  assert.equal(heldBy(d.w.id), 0);
});

test("a run for the owner on Hydor's own page: the app is called as the signed-in person, as it is for a click", async () => {
  const d = await desk("owner-run");
  await call("PUT", `/api/webapps/${d.w.id}/flows/functions`, { allow: ["search_findings"] });
  const r = await call("POST", `/api/apps/${d.agent.id}/runs`, { inputs: { request: "From the page" } });
  assert.equal(r.status, 200, r.text);
  const s = await sessionOf(r.json.run.id);
  const got = JSON.parse((await s.call("appfn_search_findings", { query: "" })).text);
  assert.equal(got.person, "owner");
  assert.deepEqual(got.rows, ["Owner: only the owner sees this"]);
  assert.equal((await d.seen()).at(-1)!.role, "owner");
  s.finish();
  await waitFor(r.json.run.id, 10_000);
});

test("a function that changes things asks the person on a card the first time a run calls it, unless the owner chose to allow it without asking; one that only reads never asks", async () => {
  const d = await desk("asks");
  assert.equal((await call("PUT", `/api/webapps/${d.w.id}/flows/functions`, { allow: ["search_findings", "add_finding"] })).status, 200);
  const view = (await call("GET", `/api/webapps/${d.w.id}/flows/functions`)).json;
  assert.deepEqual(view.functions.map((f: any) => [f.name, f.allowed, f.withoutAsking]), [["search_findings", true, false], ["add_finding", true, false]]);
  sessions.cards.length = 0;
  sessions.decision = "accept";
  const run = await d.start(ADA);
  const s = await sessionOf(run.id);
  assert.deepEqual(s.names(), ["appfn_search_findings", "appfn_add_finding"]);
  await s.call("appfn_search_findings", { query: "alfama" });
  assert.equal(sessions.cards.length, 0, "a function that only reads never asks");
  const first = await s.call("appfn_add_finding", { text: "Ada: try the tram 28" });
  assert.ok(!first.isError, first.text);
  assert.equal(sessions.cards.length, 1, "the first time, a card");
  assert.match(sessions.cards[0].title, /Ada/);
  assert.match(sessions.cards[0].detail, /add_finding/);
  assert.match(sessions.cards[0].detail, /Keep a new finding for the person\./);
  // The inputs are labels and values from the function's own description of them, not JSON; the input as it was sent comes along.
  assert.deepEqual(sessions.cards[0].facts, [{ label: "Text", value: "Ada: try the tram 28" }]);
  assert.match(sessions.cards[0].raw!, /"text": "Ada: try the tram 28"/);
  assert.doesNotMatch(sessions.cards[0].detail, /\{"text"/);
  await s.call("appfn_add_finding", { text: "Ada: and the lookout" });
  assert.equal(sessions.cards.length, 1, "asked once for the function in this run");
  assert.equal((await d.seen()).filter((c) => c.fn === "add_finding").length, 2);
  s.finish();
  await waitFor(run.id, 10_000);
  // The next run asks again; a no leaves the app untouched, and the call is a step that failed with what the person said.
  const run2 = await d.start(ADA);
  const s2 = await sessionOf(run2.id);
  sessions.decision = "deny";
  const no = await s2.call("appfn_add_finding", { text: "Ada: nothing" });
  assert.equal(no.isError, true);
  assert.match(no.text, /said no/);
  assert.equal(sessions.cards.length, 2, "a new run asks again");
  assert.equal((await d.seen()).filter((c) => c.fn === "add_finding").length, 2, "the app was not called");
  const step = stepsOf(run2.id, { values: true }).filter((x) => x.path.startsWith("fn#")).at(-1)!;
  assert.equal(step.status, "failed");
  assert.match(step.error ?? "", /said no/);
  // After a no it asks again in the same run (nothing was agreed).
  sessions.decision = "accept";
  assert.ok(!(await s2.call("appfn_add_finding", { text: "Ada: ok now" })).isError);
  assert.equal(sessions.cards.length, 3);
  s2.finish();
  await waitFor(run2.id, 10_000);
  // "Without asking": the owner's choice for that function.
  assert.equal((await call("PUT", `/api/webapps/${d.w.id}/flows/functions`, { allow: ["search_findings", "add_finding"], free: ["add_finding"] })).status, 200);
  assert.deepEqual((await call("GET", `/api/webapps/${d.w.id}/flows/functions`)).json.functions.map((f: any) => [f.name, f.withoutAsking]), [["search_findings", false], ["add_finding", true]]);
  const run3 = await d.start(ADA);
  const s3 = await sessionOf(run3.id);
  sessions.decision = "deny";
  assert.ok(!(await s3.call("appfn_add_finding", { text: "Ada: free" })).isError);
  assert.equal(sessions.cards.length, 3, "no card");
  s3.finish();
  await waitFor(run3.id, 10_000);
  // Plan mode: nothing changes at all.
  assert.match((await call("PUT", `/api/webapps/${d.w.id}/flows/functions`, { allow: ["search_findings"], free: ["search_findings"] })).json.error, /only reads/);
  sessions.decision = "accept";
});

test("allowing a function keeps its entry when the agent app's tools were all of Hydor's own (a long list, longer than the 80 an app's tools once held)", async () => {
  const d = await desk("long-tools");
  const many = Array.from({ length: 95 }, (_, i) => `tool_${i}`);
  store.saveApp(db, { id: d.agent.id, recipe: { ...store.getApp(db, d.agent.id)!, tools: many } });
  const r = await call("PUT", `/api/webapps/${d.w.id}/flows/functions`, { allow: ["search_findings"] });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.functions.find((f: any) => f.name === "search_findings").allowed, true, "the entry is not cut off the end of a long list");
  assert.ok(store.getApp(db, d.agent.id)!.tools!.length > 95);
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
