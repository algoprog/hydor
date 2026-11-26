// What agents in sessions get of a web app's functions (session-fns.ts, tools.ts): the owner's second switch (In sessions) per function, what a session's agent finds with
// webapp_list_functions and does with webapp_call_function: as the person the session belongs to (the app's own access rules decide: the fixture app checks the signed header itself
// and answers each person with their own rows), the card a function that changes things asks on the first time in a session unless the owner chose "without asking", the version
// called (the one being made, or the launched one), the refusals and limits, and that the flows half's own switches are left as they were. No real app, no agent and no model:
// a fixture web app (a small server) and a stand-in session manager that answers the cards. Ports 4361 to 4369 (4360 is Hydor itself in this test).
//   OUTDIR=dist/dev node scripts/build-server.mjs server/webapps/session-fns-test.ts
//   HOME=<scratch folder> DATA_DIR=<scratch folder> HYDOR_APPS_DIR=<scratch folder> node dist/dev/session-fns-test.js
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import type { WebApp } from "../../shared/webapps.ts";
import { apps as appsFeature } from "../apps/index.ts";
import { startRuns } from "../apps/runs.ts";
import { HttpError } from "../auth.ts";
import { kvSet, openDb } from "../db.ts";
import type { Deps, RunCtx } from "../features/types.ts";
import { registerFeatures, runTools } from "../features/registry.ts";
import { initPages } from "../pages/store.ts";
import { forgetAllowed } from "../guide/api.ts";
import { createWebapps } from "./index.ts";
import { forgetSessionLimits, SESSION_FN_LIMITS } from "./session-fns.ts";
import { releaseDir } from "./hydor-launch.ts";
import { saveLaunch, setLive } from "./launch-store.ts";
import { signPerson } from "./sign.ts";
import { writeTestApp } from "./test-apps.ts";

if (!process.env.DATA_DIR?.startsWith("/tmp/") || !process.env.HYDOR_APPS_DIR?.startsWith("/tmp/") || !process.env.HOME?.startsWith("/tmp/")) {
  console.error("Run with HOME=/tmp/…, DATA_DIR=/tmp/… and HYDOR_APPS_DIR=/tmp/… so nothing touches real data.");
  process.exit(2);
}

const HYDOR_PORT = 4360;
const scratch = fs.mkdtempSync(path.join(process.env.DATA_DIR, "sf-"));
let passed = 0;
const tests: [string, () => Promise<void>][] = [];
const test = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---- stand-ins ----------------------------------------------------------------------------------------------------------

/** The session manager: it answers the cards the person is asked, and records them. */
class FakeSessions extends EventEmitter {
  cards: { title: string; detail: string; facts?: { label: string; value: string; long?: boolean }[]; raw?: string }[] = [];
  decision = "accept";
  mode = "default";
  adapterByRun() {
    return { state: { mode: this.mode }, ask: async (card: { title: string; detail: string; facts?: { label: string; value: string }[]; raw?: string }) => (this.cards.push({ title: card.title, detail: card.detail, facts: card.facts, raw: card.raw }), { decision: this.decision }) };
  }
  summary() {
    return null;
  }
}

const SERVER = "import http from 'node:http';\nhttp.createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{\"ok\":true}'); }).listen(Number(process.env.PORT), '127.0.0.1');\n";

/** A web app in a folder of its own. */
function fixture(name: string, dir = path.join(scratch, "apps", name)): string {
  return writeTestApp(dir, SERVER, { name });
}

// ---- one instance -------------------------------------------------------------------------------------------------------------

fs.mkdirSync(path.join(scratch, "hydor-data"), { recursive: true });
const db = openDb(path.join(scratch, "test.db"));
kvSet(db, "sharing:owner", "Dana");
initPages(db);
const sessions = new FakeSessions();
const server = Fastify();
await server.register(cookie);
server.setErrorHandler((err: Error, _req, reply) => {
  const status = err instanceof HttpError ? err.status : 500;
  reply.code(status).send({ ...(err instanceof HttpError ? err.extra : undefined), error: err.message });
});
const deps = { app: server, db, sessions: sessions as any, scheduler: null as any, models: null as any, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => "http://test.local" } as Deps;
const web = createWebapps({ dataDir: path.join(scratch, "hydor-data"), port: 4361, origin: "", domain: "", idleMs: 600_000, sandbox: true, ports: [4362, 4369], startTimeoutMs: 20_000, hydorUrl: `http://127.0.0.1:${HYDOR_PORT}`, appsRoot: path.join(scratch, "WebApps") });
registerFeatures([appsFeature, web, { id: "scrub-test", scrub: (t: string) => t } as any], deps);
startRuns(deps);
await server.listen({ port: HYDOR_PORT, host: "127.0.0.1" });
web.start!(deps);
await web.ready;

const call = async (method: string, url: string, body?: unknown) => {
  const r = await server.inject({ method: method as any, url, headers: body !== undefined ? { "content-type": "application/json" } : {}, payload: body === undefined ? undefined : JSON.stringify(body) });
  let json: any = null;
  try {
    json = r.json();
  } catch {}
  return { status: r.statusCode, json, text: r.body };
};
let made = 0;
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


/** A web app with functions, registered. */
async function desk(name: string, functions: unknown = FUNCTIONS) {
  const unique = `${name}-${++made}`;
  const w = (await call("POST", "/api/webapps", { folder: deskFixture(unique, functions), name: unique })).json.app as WebApp;
  return w;
}
const seen = async (w: WebApp) => {
  const port = await web.parts().host!.ensure({ id: w.id, slug: w.slug, dir: w.folder });
  return (await (await fetch(`http://127.0.0.1:${port}/__calls`)).json()) as { fn: string; person: string | null; role: string | null; input: any }[];
};
const SESSION = "acp:session-1";
/** What a session's agent has: the tools of its MCP server. */
const ctxOf = (key = SESSION): RunCtx => ({ runId: `agent-${key}`, key, agent: "acp", acpAgent: "claude", cwd: scratch, deps });
const toolOf = (name: string, key = SESSION) => {
  const t = runTools(ctxOf(key)).find((x) => x.name === name);
  assert.ok(t, `the tool ${name} is offered to a session's agent`);
  return async (args: Record<string, unknown>) => {
    const r = await t.run(args, ctxOf(key));
    return (typeof r === "string" ? { text: r } : r) as { text: string; isError?: boolean };
  };
};
const offer = (w: WebApp, allow: unknown, free?: string[]) => call("PUT", `/api/webapps/${w.id}/functions/sessions`, { allow, ...(free ? { free } : {}) });

// ---- the tests ---------------------------------------------------------------------------------------------------------------------

test("nothing is offered to sessions until the owner switches a function on: the view has the second switch, off, and a session's agent finds nothing", async () => {
  const w = await desk("desk");
  const v = (await call("GET", `/api/webapps/${w.id}/functions`)).json;
  assert.equal(v.file, "ok");
  assert.deepEqual(v.functions.map((f: any) => [f.name, f.inSessions, f.inSessionsWithoutAsking, f.allowed]), [["search_findings", false, false, false], ["add_finding", false, false, false]]);
  assert.deepEqual((await call("GET", "/api/webapps/functions/offered")).json.apps, []);
  const listed = await toolOf("webapp_list_functions")({});
  assert.match(listed.text, /No web app offers its functions to sessions/);
  const tried = await toolOf("webapp_call_function")({ webapp: w.slug, function: "search_findings", input: { query: "x" } });
  assert.equal(tried.isError, true);
  assert.deepEqual(await seen(w), [], "and the app was not asked");
});

test("the owner offers functions to sessions: the flows half's own switches stay as they were, and the refusals say what to fix", async () => {
  const w = await desk("desk");
  const r = await offer(w, ["search_findings", "add_finding"], ["add_finding"]);
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json.functions.map((f: any) => [f.name, f.inSessions, f.inSessionsWithoutAsking, f.allowed]), [["search_findings", true, false, false], ["add_finding", true, true, false]]);
  assert.equal((await offer(w, ["nope"])).status, 400);
  assert.match((await offer(w, ["nope"])).json.error, /does not declare “nope”.*search_findings, add_finding/);
  assert.equal((await offer(w, ["search_findings"], ["search_findings"])).status, 400, "a function that only reads never asks, so it is not in free");
  assert.equal((await offer(w, ["search_findings"], ["add_finding"])).status, 400, "free has to be offered too");
  assert.equal((await offer(w, 5 as any)).status, 400);
  // "*" offers the functions that only read.
  const star = await offer(w, "*");
  assert.deepEqual(star.json.functions.map((f: any) => [f.name, f.inSessions]), [["search_findings", true], ["add_finding", false]]);
  // The flows half's switches do not move these, and these do not move them.
  const linked = await call("POST", `/api/webapps/${w.id}/flows`, {});
  assert.equal(linked.status, 200, linked.text);
  const own = await call("PUT", `/api/webapps/${w.id}/flows/functions`, { allow: ["add_finding"] });
  assert.equal(own.status, 200, own.text);
  assert.deepEqual(own.json.functions.map((f: any) => [f.name, f.allowed, f.inSessions]), [["search_findings", false, true], ["add_finding", true, false]]);
  const back = (await call("GET", `/api/webapps/${w.id}/flows/overview`)).json.functions.list;
  assert.deepEqual(back.map((f: any) => [f.name, f.allowed, f.inSessions]), [["search_findings", false, true], ["add_finding", true, false]], "the Flows tab's list carries both");
  assert.equal((await offer(w, [])).json.functions.every((f: any) => !f.inSessions), true);
});

test("a session's agent lists what is offered, by app, and calls a function as the person the session belongs to: the app's own rules decide", async () => {
  const w = await desk("desk");
  await offer(w, ["search_findings"]);
  const listed = await toolOf("webapp_list_functions")({});
  assert.match(listed.text, new RegExp(`${w.name} \\(${w.slug}, the version being made\\)`));
  assert.match(listed.text, /search_findings \(only reads\): Search the findings/);
  assert.doesNotMatch(listed.text, /add_finding/, "what is not switched on is not listed");
  assert.match(listed.text, /"query"/, "with the shape of its input");
  const r = await toolOf("webapp_call_function")({ webapp: w.name, function: "search_findings", input: { query: "" } });
  assert.notEqual(r.isError, true, r.text);
  assert.match(r.text, /Called search_findings of .* as Dana \(the version being made\): answered in \d+ ms/);
  const calls = await seen(w);
  assert.deepEqual(calls.map((c) => [c.fn, c.person, c.role]), [["search_findings", "owner", "owner"]], "the app got the header Hydor signs for this Hydor's owner, which it checked with its secret");
  // The address given by id, slug or name all reach it; a wrong one says which apps do offer.
  assert.notEqual((await toolOf("webapp_call_function")({ webapp: w.id, function: "search_findings", input: {} })).isError, true);
  const wrong = await toolOf("webapp_call_function")({ webapp: "nothing", function: "search_findings" });
  assert.equal(wrong.isError, true);
  assert.match(wrong.text, new RegExp(`Those that do: ${w.name}`));
  assert.match((await toolOf("webapp_call_function")({ webapp: w.slug, function: "add_finding", input: { text: "x" } })).text, /does not offer a function “add_finding” to sessions \(it offers search_findings\)/);
  // The app's own refusal and failures come back in its words.
  const forbidden = await toolOf("webapp_call_function")({ webapp: w.slug, function: "search_findings", input: { query: "forbidden" } });
  assert.equal(forbidden.isError, true);
  assert.match(forbidden.text, /The app refused it \(403\): That belongs to someone else/);
  assert.match((await toolOf("webapp_call_function")({ webapp: w.slug, function: "search_findings", input: { query: "boom" } })).text, /The app answered 500: Something broke on our side/);
  const big = await toolOf("webapp_call_function")({ webapp: w.slug, function: "search_findings", input: { query: "big" } });
  assert.match(big.text, /cut: the app’s answer is \d+ characters/);
});

test("a function that changes things asks the person on a card the first time in a session, once; 'without asking' skips it; saying no changes nothing; Plan mode refuses", async () => {
  const w = await desk("desk");
  await offer(w, ["search_findings", "add_finding"]);
  sessions.cards.length = 0;
  const add = toolOf("webapp_call_function");
  assert.match((await add({ webapp: w.slug, function: "search_findings", input: { query: "" } })).text, /answered/);
  assert.equal(sessions.cards.length, 0, "a function that only reads asks nobody");
  sessions.decision = "deny";
  const no = await add({ webapp: w.slug, function: "add_finding", input: { text: "Not allowed" } });
  assert.equal(no.isError, true);
  assert.match(no.text, /said no/);
  assert.equal(sessions.cards.length, 1);
  assert.match(sessions.cards[0].title, /Let the agent change what “desk-\d+” keeps for you\?/);
  assert.match(sessions.cards[0].detail, /add_finding.*Keep a new finding for the person.*once for each function in a session/s, "the card says what it does");
  // What it would be given is labels and values from the function's input schema, with the input as it was sent on demand; no JSON in the words.
  assert.deepEqual(sessions.cards[0].facts, [{ label: "Text", value: "Not allowed" }]);
  assert.match(sessions.cards[0].raw!, /"text": "Not allowed"/);
  assert.doesNotMatch(sessions.cards[0].detail, /With:|\{"text"/);
  assert.ok(!(await seen(w)).some((c) => c.fn === "add_finding"), "nothing was sent");
  sessions.decision = "accept";
  assert.match((await add({ webapp: w.slug, function: "add_finding", input: { text: "Kept" } })).text, /answered/);
  assert.match((await add({ webapp: w.slug, function: "add_finding", input: { text: "Kept again" } })).text, /answered/);
  assert.equal(sessions.cards.length, 2, "asked once for the function in this session, not each time");
  // Another session is asked again.
  await toolOf("webapp_call_function", "acp:session-2")({ webapp: w.slug, function: "add_finding", input: { text: "From another session" } });
  assert.equal(sessions.cards.length, 3);
  // Without asking.
  await offer(w, ["search_findings", "add_finding"], ["add_finding"]);
  await toolOf("webapp_call_function", "acp:session-3")({ webapp: w.slug, function: "add_finding", input: { text: "No card" } });
  assert.equal(sessions.cards.length, 3, "the owner chose 'without asking': no card");
  assert.match((await toolOf("webapp_list_functions")({})).text, /add_finding \(changes things, no card\)/);
  // Plan mode: a function that changes things is refused, one that reads still answers.
  sessions.mode = "plan";
  forgetAllowed();
  await offer(w, ["search_findings", "add_finding"]);
  const plan = await toolOf("webapp_call_function", "acp:session-4")({ webapp: w.slug, function: "add_finding", input: { text: "In plan mode" } });
  assert.equal(plan.isError, true);
  assert.match(plan.text, /only reads/);
  assert.match((await toolOf("webapp_call_function", "acp:session-4")({ webapp: w.slug, function: "search_findings", input: { query: "" } })).text, /answered/);
  sessions.mode = "default";
  const rows = (await seen(w)).filter((c) => c.fn === "add_finding").map((c) => c.input.text);
  assert.deepEqual(rows, ["Kept", "Kept again", "From another session", "No card"]);
});

test("the version called: the one being made until the app is launched inside Hydor, then the launched one; a launched app's own functions.json is the one read", async () => {
  const w = await desk("desk");
  await offer(w, ["search_findings"]);
  assert.equal((await call("GET", "/api/webapps/functions/offered")).json.apps[0].version, "in progress");
  // A launched version: its release folder has its own build and its own functions.json (a function the folder being made no longer has is still there).
  const record = { id: "20270101-aaaa", app: w.id, place: "hydor", env: "hydor", at: Date.now() } as any;
  const live = releaseDir(path.join(scratch, "hydor-data", "webapps"), w.id, record.id);
  writeTestApp(live, fs.readFileSync(path.join(w.folder, ".output", "server", "index.mjs"), "utf8"));
  const only = (d: string) => JSON.stringify({ ...FUNCTIONS, functions: FUNCTIONS.functions.slice(0, 1).map((f) => ({ ...f, description: d })) });
  fs.writeFileSync(path.join(live, "functions.json"), only("Search the findings, as the launched version does it."));
  fs.writeFileSync(path.join(w.folder, "functions.json"), only("Search the findings, as the version being made does it."));
  assert.match((await toolOf("webapp_list_functions")({})).text, /as the version being made does it/);
  saveLaunch(db, record);
  setLive(db, w.id, record.id, null);
  try {
    const out = (await call("GET", "/api/webapps/functions/offered")).json.apps[0];
    assert.equal(out.version, "launched");
    assert.match(out.functions[0].description, /as the launched version does it/);
    assert.match((await toolOf("webapp_list_functions")({})).text, /launched version\)/);
    const r = await toolOf("webapp_call_function")({ webapp: w.slug, function: "search_findings", input: { query: "" } });
    assert.match(r.text, /\(launched version\)/, r.text);
    // The call went to the launched side (its own process, its own secret), not to the one being made.
    assert.ok(web.parts().host!.status(`${w.id}_live`).port, "the launched side was started for the call");
  } finally {
    setLive(db, w.id, null, null);
  }
});

test("limits: a session's calls a minute and in all, the input's size; and the routes of an app that is not there or has no functions", async () => {
  forgetSessionLimits();
  const w = await desk("desk");
  await offer(w, ["search_findings"]);
  const go = toolOf("webapp_call_function", "acp:limits");
  let refused = 0;
  for (let i = 0; i < SESSION_FN_LIMITS.perSessionPerMinute + 3; i++) {
    const r = await go({ webapp: w.slug, function: "search_findings", input: { query: "" } });
    if (r.isError) {
      refused++;
      assert.match(r.text, /20 calls to web apps’ functions in the last minute/);
    }
  }
  assert.equal(refused, 3, "the 21st call in a minute is the first refused");
  forgetSessionLimits();
  const big = await call("POST", `/api/webapps/${w.id}/functions/search_findings/call`, { input: { query: "x".repeat(25_000) } });
  assert.equal(big.status, 413);
  assert.equal((await call("POST", `/api/webapps/${w.id}/functions/add_finding/call`, { input: {} })).status, 403, "a function that is not offered is refused by the route too");
  assert.equal((await call("POST", "/api/webapps/nope/functions/x/call", {})).status, 404);
  const none = await desk("empty", null);
  assert.equal((await offer(none, ["search_findings"])).status, 400);
  assert.equal((await call("GET", `/api/webapps/${none.id}/functions`)).json.file, "missing");
  // An app that is forgotten offers nothing.
  assert.equal((await call("DELETE", `/api/webapps/${w.id}`)).status, 200);
  assert.deepEqual((await call("GET", "/api/webapps/functions/offered")).json.apps, []);
});

test("webapp_functions offers functions to sessions on a card, and lists where each is switched on", async () => {
  const w = await desk("desk");
  sessions.cards.length = 0;
  const fns = toolOf("webapp_functions");
  const before = await fns({ webapp: w.slug });
  assert.match(before.text, /search_findings \(only reads, off\)/);
  const r = await fns({ webapp: w.slug, in_sessions: ["search_findings", "add_finding"], in_sessions_without_asking: ["add_finding"] });
  assert.notEqual(r.isError, true, r.text);
  assert.equal(sessions.cards.length, 1);
  assert.match(sessions.cards[0].title, /Let agents in your sessions use search_findings, add_finding/);
  assert.match(r.text, /add_finding: off, in sessions without asking/);
  assert.match(r.text, /search_findings: off, in sessions\n/);
  const flowsOnly = await fns({ webapp: w.slug, in_sessions: [] });
  assert.match(flowsOnly.text, /search_findings: off/);
  // Through app_api the route that calls a function is refused, and the one that offers asks.
  const { ruleFor } = await import("../guide/api.ts");
  assert.equal(ruleFor("POST", `/api/webapps/${w.id}/functions/add_finding/call`).level, "refuse");
  assert.equal(ruleFor("PUT", `/api/webapps/${w.id}/functions/sessions`).level, "ask");
  assert.equal(ruleFor("GET", `/api/webapps/${w.id}/functions`).level, "free");
});

for (const [name, fn] of tests) {
  try {
    // Each starts with no web app: what an earlier one made is forgotten.
    for (const a of ((await call("GET", "/api/webapps")).json.apps ?? []) as WebApp[]) await call("DELETE", `/api/webapps/${a.id}`);
    await fn();
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
