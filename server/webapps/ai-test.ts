// Checks for what Hydor makes of a web app's AI (ai.ts, the route POST /api/apps/:slug/ai and what the app is started with), with the host's own fixtures: small apps made of a hydor.json and a
// server that says what its environment gives it. Who may ask (the key made for the web app, only when it lists `ai`, only a tier its hydor.json lists and its owner allowed), the answer in the route's
// shapes (text, data, tool calls, stop, model, usage, cap), a schema, tools passed back and never run, the answer as it is written, every refusal and limit with its kind, the daily cap with when it lifts,
// the person proven by the header Hydor signed (a forged one refused, an expired one told to open the app again), what is counted for the app and for each person, and that nothing anyone wrote is kept.
// STAND-IN: the model is a small server on this computer that speaks the chat completions protocol, scripted by each test, behind Hydor's own model path (Custom's models: helper.ts → agent/llm.ts), so the
// route, the tiers, the accounting and the cap are real; no real model is ever called. Ports 4780 (Hydor), 4781 (the stand-in model), 4782 to 4789 (apps).
//   OUTDIR=dist/dev node scripts/build-server.mjs server/webapps/ai-test.ts
//   HOME=<scratch folder> DATA_DIR=<scratch folder> HYDOR_APPS_DIR=<scratch folder> node dist/dev/ai-test.js
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import type { WebApp } from "../../shared/webapps.ts";
import { apps as appsFeature } from "../apps/index.ts";
import { startRuns } from "../apps/runs.ts";
import { setTiers } from "../assistants/tiers.ts";
import { HttpError } from "../auth.ts";
import { kvSet, openDb } from "../db.ts";
import type { Deps } from "../features/types.ts";
import { writeAgentModels } from "../models/config.ts";
import { initPages } from "../pages/store.ts";
import { AI_LIMITS, forgetAiLimits, misfits } from "./ai.ts";
import { createWebapps } from "./index.ts";
import { signPerson } from "./sign.ts";
import { writeTestApp } from "./test-apps.ts";

if (!process.env.DATA_DIR?.startsWith("/tmp/") || !process.env.HYDOR_APPS_DIR?.startsWith("/tmp/") || !process.env.HOME?.startsWith("/tmp/")) {
  console.error("Run with HOME=/tmp/…, DATA_DIR=/tmp/… and HYDOR_APPS_DIR=/tmp/… so nothing touches real data.");
  process.exit(2);
}
const HYDOR_PORT = 4780;
const MODEL_PORT = 4781;
const scratch = fs.mkdtempSync(path.join(process.env.DATA_DIR, "ai-"));
let passed = 0;
const tests: [string, () => Promise<void>][] = [];
const test = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---- the stand-in model: the chat completions protocol, scripted -----------------------------------------------------------------------

interface Seen {
  model: string;
  messages: any[];
  tools?: any[];
  maxTokens?: number;
  closedEarly?: boolean;
}
type Piece = { text?: string; calls?: { id: string; name: string; args: string }[]; finish?: string; usage?: { prompt: number; completion: number; cost?: number } };
/** What the stand-in says next: a script (a function of what it was asked), or a fixed reply. */
let script: (seen: Seen) => Piece | { status: number; body: string } = () => ({ text: "ok", usage: { prompt: 10, completion: 5, cost: 0.001 } });
let delayMs = 0;
const asked: Seen[] = [];
const modelServer = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", async () => {
    const body = JSON.parse(raw || "{}");
    const seen: Seen = { model: body.model, messages: body.messages, tools: body.tools, maxTokens: body.max_tokens ?? body.max_completion_tokens };
    asked.push(seen);
    res.on("close", () => {
      if (!res.writableFinished) seen.closedEarly = true;
    });
    const out = script(seen);
    if ("status" in out) {
      res.writeHead(out.status, { "content-type": "application/json" });
      return res.end(out.body);
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    const chunk = (delta: any, finish?: string, usage?: any) => res.write(`data: ${JSON.stringify({ id: "gen-1", choices: [{ delta, finish_reason: finish ?? null }], ...(usage ? { usage } : {}) })}\n\n`);
    if (delayMs) await sleep(delayMs);
    for (const piece of (out.text ?? "").match(/.{1,12}/gs) ?? []) {
      chunk({ content: piece });
      await sleep(2);
    }
    (out.calls ?? []).forEach((c, index) => {
      chunk({ tool_calls: [{ index, id: c.id, function: { name: c.name, arguments: c.args.slice(0, 5) } }] });
      chunk({ tool_calls: [{ index, function: { arguments: c.args.slice(5) } }] });
    });
    chunk({}, out.finish ?? (out.calls?.length ? "tool_calls" : "stop"));
    const u = out.usage ?? { prompt: 10, completion: 5, cost: 0.001 };
    res.write(`data: ${JSON.stringify({ id: "gen-1", choices: [], usage: { prompt_tokens: u.prompt, completion_tokens: u.completion, ...(u.cost !== undefined ? { cost: u.cost } : {}) } })}\n\ndata: [DONE]\n\n`);
    res.end();
  });
});
await new Promise<void>((r) => modelServer.listen(MODEL_PORT, "127.0.0.1", r));

const customModel = (id: string, tools: "native" | "text" = "native") => ({ id, label: `Stand-in ${id}`, provider: "endpoint" as const, baseUrl: `http://127.0.0.1:${MODEL_PORT}/v1`, model: `scripted-${id}`, tools, local: false });
writeAgentModels([customModel("sm-quick"), customModel("sm-standard"), customModel("sm-best"), customModel("sm-plain", "text")]);

// ---- fixtures ---------------------------------------------------------------------------------------------------------------------

const SERVER = String.raw`import http from 'node:http';
http.createServer((req, res) => {
  const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.url === '/api/health') return send(200, { ok: true });
  if (req.url === '/env') { const k = process.env.HYDOR_APP_KEY; return send(200, { url: process.env.HYDOR_URL ?? null, slug: process.env.HYDOR_APP_SLUG ?? null, key: k ?? null }); }
  send(404, { error: 'not here' });
}).listen(Number(process.env.PORT), '127.0.0.1');
`;
function fixture(name: string, blocks: Record<string, unknown>, uses?: unknown): string {
  const u = (uses ?? {}) as { tiers?: unknown; usdPerDay?: unknown };
  const services = { ...("ai" in blocks ? { ai: { tiers: u.tiers ?? [], ...(u.usdPerDay !== undefined ? { usdPerDay: u.usdPerDay } : {}) } } : {}), ...("search" in blocks ? { embed: {} } : {}) };
  return writeTestApp(path.join(scratch, "apps", name), SERVER, { name, services });
}

fs.mkdirSync(path.join(scratch, "hydor-data"), { recursive: true });
const db = openDb(path.join(scratch, "test.db"));
kvSet(db, "sharing:owner", "Dana");
initPages(db);
setTiers(db, { console: { quick: { model: "sm-quick" }, standard: { model: "sm-standard" }, best: { model: "sm-best" } } });
const sessions = Object.assign(new EventEmitter(), { adapterByRun: () => null, summary: () => null });
const server = Fastify();
await server.register(cookie);
server.setErrorHandler((err: Error, _req, reply) => {
  const status = err instanceof HttpError ? err.status : 500;
  reply.code(status).send({ ...(err instanceof HttpError ? err.extra : undefined), error: err.message });
});
const deps = { app: server, db, sessions: sessions as any, scheduler: null as any, models: null as any, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => "http://test.local" } as Deps;
appsFeature.routes!(deps);
const web = createWebapps({ dataDir: path.join(scratch, "hydor-data"), port: 4789, origin: "", domain: "", idleMs: 600_000, sandbox: true, ports: [4782, 4788], startTimeoutMs: 20_000, hydorUrl: `http://127.0.0.1:${HYDOR_PORT}`, appsRoot: path.join(scratch, "WebApps") });
web.routes!(deps);
startRuns(deps);
await server.listen({ port: HYDOR_PORT, host: "127.0.0.1" });
web.start!(deps);
await web.ready;

const call = async (method: string, url: string, body?: unknown, headers?: Record<string, string>) => {
  const r = await server.inject({ method: method as any, url, headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers }, payload: body === undefined ? undefined : JSON.stringify(body) });
  let json: any = null;
  try {
    json = r.json();
  } catch {}
  return { status: r.statusCode, json, text: r.body, headers: r.headers };
};
const aiCall = (slug: string, key: string | null, body: unknown, headers?: Record<string, string>) => call("POST", `/api/apps/${slug}/ai`, body, { ...(key ? { authorization: `Bearer ${key}` } : {}), ...headers });
let made = 0;
const ASKS = { tiers: ["quick", "standard"], usdPerDay: 2 };
async function register(name: string, blocks: Record<string, unknown>, uses?: unknown, allow: string[] | null = ["quick", "standard"], cap = 5) {
  const unique = `${name}-${++made}`;
  const r = await call("POST", "/api/webapps", { folder: fixture(unique, blocks, uses), name: unique });
  assert.equal(r.status, 200, r.text);
  const a = r.json.app as WebApp;
  if (allow) assert.equal((await call("PUT", `/api/webapps/${a.id}`, { settings: { tiers: allow, dailyCapUsd: cap } })).status, 200);
  return a;
}
async function envOf(a: WebApp) {
  const port = await web.parts().host!.ensure({ id: a.id, slug: a.slug, dir: a.folder });
  return (await (await fetch(`http://127.0.0.1:${port}/env`)).json()) as { url: string | null; slug: string | null; key: string | null };
}
const aiApp = async (name = "chat", opts: { uses?: unknown; allow?: string[] | null; cap?: number } = {}) => {
  const a = await register(name, { ai: { version: "0.1.0" } }, "uses" in opts ? (opts.uses ?? undefined) : ASKS, opts.allow === undefined ? ["quick", "standard"] : opts.allow, opts.cap ?? 5);
  return { a, key: (await envOf(a)).key! };
};
const hi = (extra: object = {}) => ({ tier: "standard", messages: [{ role: "user", content: "hello" }], ...extra });
const sse = (text: string) =>
  text
    .split("\n\n")
    .filter((b) => b.trim() && !b.startsWith(":"))
    .map((b) => ({ event: /^event: (.*)$/m.exec(b)?.[1] ?? "", data: JSON.parse(/^data: (.*)$/m.exec(b)?.[1] ?? "null") }));
const person = (a: WebApp, id: string, name: string, secret = web.parts().host!.secret(a.id), ttl = 60) => signPerson({ id, name, role: "member" }, secret, ttl);
const reset = () => {
  script = () => ({ text: "ok", usage: { prompt: 10, completion: 5, cost: 0.001 } });
  delayMs = 0;
  asked.length = 0;
  forgetAiLimits();
};

// ---- the tests ---------------------------------------------------------------------------------------------------------------------

test("a web app with the ai block is started with where Hydor is, its own address and a key; one without the block or the search block gets none", async () => {
  const { a, key } = await aiApp();
  const env = await envOf(a);
  assert.equal(env.url, `http://127.0.0.1:${HYDOR_PORT}`);
  assert.equal(env.slug, a.slug);
  assert.match(key, /^napp_w[A-Za-z0-9_-]{43}$/);
  const plain = await register("plain", {});
  const e2 = await envOf(plain);
  assert.deepEqual([e2.url, e2.slug, e2.key], [null, null, null]);
});

test("the answer as the driver asks: text, no calls, a stop, the model, the usage with its cost, and the cap with what is spent; the tier picks the owner's model and the messages go through as they are", async () => {
  reset();
  const { a, key } = await aiApp();
  script = () => ({ text: "Four.", usage: { prompt: 812, completion: 240, cost: 0.0061 } });
  const r = await aiCall(a.slug, key, { tier: "standard", messages: [{ role: "system", content: "Be brief." }, { role: "user", content: "2+2?" }], maxOutputTokens: 300 });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.text, "Four.");
  assert.deepEqual(r.json.toolCalls, []);
  assert.equal(r.json.stop, "end");
  assert.equal(r.json.model, "scripted-sm-standard");
  assert.deepEqual(r.json.usage, { inputTokens: 812, outputTokens: 240, usd: 0.0061 });
  assert.deepEqual(r.json.cap, { usedUsd: 0.0061, limitUsd: 5 });
  assert.equal(r.headers["cache-control"], "no-store");
  assert.equal(asked.length, 1);
  assert.deepEqual(asked[0].messages, [{ role: "system", content: "Be brief." }, { role: "user", content: "2+2?" }]);
  assert.equal(asked[0].maxTokens, 300);
  const q = await aiCall(a.slug, key, hi({ tier: "quick" }));
  assert.equal(q.json.model, "scripted-sm-quick", "quick is the owner's quick model (Settings → Models → Tiers)");
  assert.equal(q.json.cap.usedUsd, 0.0122, "what the two answers cost, added");
});

test("who may ask: no key, a wrong key, another web app's key, an address that is nothing, an app that lists no `ai`, a tier its hydor.json does not list", async () => {
  reset();
  const { a, key } = await aiApp();
  const other = await aiApp("other");
  assert.equal((await aiCall(a.slug, null, hi())).status, 401);
  assert.equal((await aiCall(a.slug, "napp_nonsense", hi())).status, 401);
  assert.equal((await aiCall(a.slug, other.key, hi())).status, 401, "another web app's key does not open this one");
  assert.equal((await aiCall("no-such-app", key, hi())).status, 401);
  const search = await register("searchonly", { search: {} }, ASKS);
  const sk = (await envOf(search)).key!;
  const no = await aiCall(search.slug, sk, hi());
  assert.equal(no.status, 403, "a key that opens its search does not give it a model");
  assert.equal(no.json.kind, "none");
  const best = await aiCall(a.slug, key, hi({ tier: "best" }));
  assert.equal(best.status, 403);
  assert.equal(best.json.kind, "none");
  assert.match(best.json.error, /not said it uses the best tier.*quick, standard/);
  assert.deepEqual(asked, [], "nothing of this reached a model");
});

test("the owner's say: until they allow the tier the answer is a 403 that says so (and the app's page counts the tries); turned off again, it stops", async () => {
  reset();
  const { a, key } = await aiApp("waiting", { allow: null });
  const r = await aiCall(a.slug, key, hi());
  assert.equal(r.status, 403);
  assert.equal(r.json.kind, "none");
  assert.match(r.json.error, /not allowed this app to use their models yet/);
  const view = (await call("GET", `/api/webapps/${a.id}`)).json.app;
  assert.deepEqual(view.ai.asks, ["quick", "standard"]);
  assert.deepEqual(view.ai.allowed, []);
  assert.equal(view.ai.today.refused, 1);
  assert.equal(view.ai.capUsd, 1, "the default cap is a dollar a day");
  assert.equal(view.ai.asksUsdPerDay, 2);
  assert.equal((await call("PUT", `/api/webapps/${a.id}`, { settings: { tiers: ["standard"] } })).status, 200);
  assert.equal((await aiCall(a.slug, key, hi())).status, 200);
  assert.equal((await aiCall(a.slug, key, hi({ tier: "quick" }))).status, 403, "only the tiers allowed");
  assert.equal((await call("PUT", `/api/webapps/${a.id}`, { settings: { tiers: [] } })).status, 200);
  assert.equal((await aiCall(a.slug, key, hi())).status, 403, "turned off");
  assert.equal(asked.length, 1);
});

test("an answer to fit a schema comes back in data; one that does not fit is asked again once with what was wrong (both counted), and then refused", async () => {
  reset();
  const { a, key } = await aiApp();
  const schema = { type: "object", required: ["title", "n"], properties: { title: { type: "string" }, n: { type: "integer", minimum: 1 } } };
  script = () => ({ text: '```json\n{"title":"Hi","n":3}\n```', usage: { prompt: 20, completion: 8, cost: 0.002 } });
  const ok = await aiCall(a.slug, key, hi({ schema }));
  assert.equal(ok.status, 200, ok.text);
  assert.deepEqual(ok.json.data, { title: "Hi", n: 3 });
  assert.match(asked[0].messages[0].content, /JSON Schema/, "the shape is asked for in words");
  asked.length = 0;
  let n = 0;
  script = () => (++n === 1 ? { text: '{"title":"Hi","n":0}', usage: { prompt: 20, completion: 8, cost: 0.002 } } : { text: '{"title":"Hi","n":2}', usage: { prompt: 30, completion: 9, cost: 0.003 } });
  const again = await aiCall(a.slug, key, hi({ schema }));
  assert.deepEqual(again.json.data, { title: "Hi", n: 2 });
  assert.equal(asked.length, 2);
  assert.match(asked[1].messages.at(-1).content, /should be at least 1/);
  assert.deepEqual(again.json.usage, { inputTokens: 50, outputTokens: 17, usd: 0.005 }, "both asks are counted");
  script = () => ({ text: "not json at all", usage: { prompt: 5, completion: 5, cost: 0.001 } });
  const no = await aiCall(a.slug, key, hi({ schema }));
  assert.equal(no.status, 502);
  assert.equal(no.json.kind, "failed");
  assert.ok(misfits(schema, { title: 1, n: 1.5 }).length === 2);
  assert.ok(misfits({ type: "array", items: { enum: ["a"] } }, ["a", "b"]).length === 1);
});

test("tools: the model's request for them comes back as toolCalls (one it was not offered is dropped), results go back as tool messages, and the host calls nothing", async () => {
  reset();
  const { a, key } = await aiApp();
  script = (s) =>
    s.messages.some((m) => m.role === "tool")
      ? { text: "There are 3.", usage: { prompt: 40, completion: 6, cost: 0.002 } }
      : { text: "", calls: [{ id: "c1", name: "count_notes", args: '{"label":"work"}' }, { id: "c2", name: "format_disk", args: "{}" }], usage: { prompt: 30, completion: 12, cost: 0.002 } };
  const tools = [{ name: "count_notes", description: "How many notes.", input: { type: "object", properties: { label: { type: "string" } } } }];
  const first = await aiCall(a.slug, key, hi({ tools }));
  assert.equal(first.status, 200, first.text);
  assert.equal(first.json.stop, "tools");
  assert.equal(first.json.text, "");
  assert.deepEqual(first.json.toolCalls, [{ id: "c1", name: "count_notes", input: { label: "work" } }], "format_disk was not offered");
  assert.deepEqual(asked[0].tools, [{ type: "function", function: { name: "count_notes", description: "How many notes.", parameters: tools[0].input } }]);
  const second = await aiCall(a.slug, key, {
    tier: "standard",
    tools,
    messages: [{ role: "user", content: "how many?" }, { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "count_notes", input: { label: "work" } }] }, { role: "tool", toolCallId: "c1", content: "3" }],
  });
  assert.equal(second.json.text, "There are 3.");
  assert.equal(second.json.stop, "end");
  assert.deepEqual(asked[1].messages[1], { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "count_notes", arguments: '{"label":"work"}' } }] });
  assert.deepEqual(asked[1].messages[2], { role: "tool", content: "3", tool_call_id: "c1" });
  // a model whose tools are not native cannot be asked for them
  setTiers(db, { console: { quick: { model: "sm-plain" }, standard: { model: "sm-standard" }, best: { model: "sm-best" } } });
  const plain = await aiCall(a.slug, key, hi({ tier: "quick", tools }));
  assert.equal(plain.status, 403);
  assert.equal(plain.json.kind, "none");
  assert.match(plain.json.error, /cannot use the app's functions|cannot call tools/);
  const text = await aiCall(a.slug, key, hi({ tier: "quick" }));
  assert.equal(text.status, 200, "the same model answers in words");
  setTiers(db, { console: { quick: { model: "sm-quick" }, standard: { model: "sm-standard" }, best: { model: "sm-best" } } });
});

test("the answer as it is written: events text, then done with the whole answer; a failure after it began is an error event with its kind", async () => {
  reset();
  const { a, key } = await aiApp();
  script = () => ({ text: "One two three four five six seven eight.", usage: { prompt: 9, completion: 9, cost: 0.004 } });
  const r = await aiCall(a.slug, key, hi({ stream: true }));
  assert.equal(r.status, 200, r.text);
  assert.match(String(r.headers["content-type"]), /^text\/event-stream/);
  const ev = sse(r.text);
  assert.ok(ev.filter((e) => e.event === "text").length >= 3, "in pieces");
  assert.equal(ev.filter((e) => e.event === "text").map((e) => e.data.text).join(""), "One two three four five six seven eight.");
  const done = ev[ev.length - 1];
  assert.equal(done.event, "done");
  assert.equal(done.data.text, "One two three four five six seven eight.");
  assert.deepEqual(done.data.usage, { inputTokens: 9, outputTokens: 9, usd: 0.004 });
  script = () => ({ status: 400, body: '{"error":{"message":"bad things inside Hydor: secret detail"}}' });
  const bad = await aiCall(a.slug, key, hi({ stream: true }));
  assert.equal(bad.status, 200);
  const e2 = sse(bad.text).at(-1)!;
  assert.equal(e2.event, "error");
  assert.equal(e2.data.kind, "busy");
  assert.ok(!bad.text.includes("secret detail"), "what the model's server said stays with Hydor");
});

test("what a model's failure is told as: no credit is 402 (cap), too long is 413, anything else is busy, with a sentence that says nothing of Hydor's insides", async () => {
  reset();
  const { a, key } = await aiApp();
  script = () => ({ status: 402, body: '{"error":{"message":"Insufficient credits"}}' });
  const credit = await aiCall(a.slug, key, hi());
  assert.equal(credit.status, 402);
  assert.equal(credit.json.kind, "cap");
  assert.match(credit.json.error, /no credit/);
  script = () => ({ status: 400, body: '{"error":{"message":"This model\'s maximum context length is 1000 tokens"}}' });
  const long = await aiCall(a.slug, key, hi());
  assert.equal(long.status, 413);
  assert.equal(long.json.kind, "too-long");
  script = () => ({ status: 400, body: '{"error":{"message":"a path inside Hydor leaked"}}' });
  const other = await aiCall(a.slug, key, hi());
  assert.equal(other.status, 502);
  assert.equal(other.json.kind, "busy");
  assert.ok(!other.text.includes("a path inside Hydor"));
});

test("the cap: spend is counted for the app, a hard stop at the cap says when it lifts (429, kind cap, until, the cap object) and nothing reaches the model; the owner raising it lets answers go on", async () => {
  reset();
  const { a, key } = await aiApp("capped", { cap: 0.01 });
  script = () => ({ text: "a", usage: { prompt: 100, completion: 100, cost: 0.006 } });
  assert.equal((await aiCall(a.slug, key, hi())).status, 200);
  assert.equal((await aiCall(a.slug, key, hi())).status, 200, "0.006 is under 0.01: this one starts, and passes it");
  const stop = await aiCall(a.slug, key, hi());
  assert.equal(stop.status, 429, stop.text);
  assert.equal(stop.json.kind, "cap");
  assert.equal(stop.json.cap.limitUsd, 0.01);
  assert.ok(stop.json.cap.usedUsd >= 0.01);
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  assert.equal(Date.parse(stop.json.until), midnight.getTime(), "it lifts at the owner's midnight");
  assert.match(stop.json.error, /can answer again in about \d+ (hours|minutes?)/);
  assert.ok(Number(stop.headers["retry-after"]) > 0);
  assert.equal(asked.length, 2, "the third never reached the model");
  const view = (await call("GET", `/api/webapps/${a.id}`)).json.app.ai;
  assert.equal(view.atCap, true);
  assert.equal(view.today.calls, 2);
  assert.equal(view.today.usd, 0.012);
  assert.equal(view.until, stop.json.until);
  assert.equal((await call("PUT", `/api/webapps/${a.id}`, { settings: { dailyCapUsd: 1 } })).status, 200);
  assert.equal((await aiCall(a.slug, key, hi())).status, 200, "raised: it goes on");
  assert.equal((await call("PUT", `/api/webapps/${a.id}`, { settings: { dailyCapUsd: 0 } })).status, 200);
  const zero = await aiCall(a.slug, key, hi());
  assert.equal(zero.status, 403, "a cap of nothing is no model, not a wait until midnight");
});

test("a model with no price counts as nothing against the cap but is counted in tokens, and a day's ceiling of tokens stops it", async () => {
  reset();
  const { a, key } = await aiApp("unpriced");
  script = () => ({ text: "a", usage: { prompt: 1000, completion: 1000 } });
  const r = await aiCall(a.slug, key, hi());
  assert.equal(r.status, 200);
  assert.equal(r.json.usage.usd, undefined, "the host does not make up a price");
  const t = (await call("GET", `/api/webapps/${a.id}`)).json.app.ai.today;
  assert.equal(t.unpriced, 1);
  assert.equal(t.inputTokens + t.outputTokens, 2000);
  script = () => ({ text: "a", usage: { prompt: AI_LIMITS.tokensPerDay, completion: 0 } });
  assert.equal((await aiCall(a.slug, key, hi())).status, 200);
  const stop = await aiCall(a.slug, key, hi());
  assert.equal(stop.status, 429);
  assert.equal(stop.json.kind, "cap");
});

test("the person is proven, never claimed: a header Hydor signed is counted for them and the app; none is counted for nobody; a forged or broken one is refused; an expired one is told to open the app again", async () => {
  reset();
  const { a, key } = await aiApp("people");
  script = () => ({ text: "a", usage: { prompt: 10, completion: 10, cost: 0.01 } });
  const ana = person(a, "u-ana", "Ana");
  const ben = person(a, "u-ben", "Ben");
  assert.equal((await aiCall(a.slug, key, hi(), { "x-hydor-person": ana })).status, 200);
  assert.equal((await aiCall(a.slug, key, hi(), { "x-hydor-person": ana })).status, 200);
  assert.equal((await aiCall(a.slug, key, hi(), { "x-hydor-person": ben })).status, 200);
  assert.equal((await aiCall(a.slug, key, hi())).status, 200, "a job: no header, counted for the app and for nobody");
  const forged = await aiCall(a.slug, key, hi(), { "x-hydor-person": person(a, "u-ana", "Ana", "not-the-apps-secret") });
  assert.equal(forged.status, 403);
  assert.match(forged.json.error, /not one Hydor signed/);
  assert.equal((await aiCall(a.slug, key, hi(), { "x-hydor-person": "garbage" })).status, 403);
  assert.equal((await aiCall(a.slug, key, hi(), { "x-hydor-person": ana + "x" })).status, 403);
  // a header the app made up for a person it names itself is one Hydor did not sign
  const claimed = Buffer.from(JSON.stringify({ id: "owner", name: "Dana", role: "owner", exp: Math.floor(Date.now() / 1000) + 600 })).toString("base64url");
  assert.equal((await aiCall(a.slug, key, hi(), { "x-hydor-person": `${claimed}.AAAA` })).status, 403);
  const old = await aiCall(a.slug, key, hi(), { "x-hydor-person": person(a, "u-ana", "Ana", undefined, -3600) });
  assert.equal(old.status, 401);
  assert.equal(old.json.kind, "key");
  assert.equal(asked.length, 4, "the refused ones never reached the model");
  const mine = (await call("GET", `/api/webapps/${a.id}/ai`)).json;
  assert.equal(mine.ai.today.calls, 4);
  assert.equal(mine.ai.today.people, 2);
  assert.deepEqual(mine.people.map((p: any) => [p.id, p.name, p.calls, p.usd]), [["u-ana", "Ana", 2, 0.02], ["u-ben", "Ben", 1, 0.01]]);
  // the launched side signs with its own secret: that header is good too once it is there (the same check as the flows half's)
});

test("limits: the request is read as the driver sends it (sizes, roles, tools, one of schema or tools), 60 calls a minute for an app and 20 for a person, 4 at once", async () => {
  reset();
  const { a, key } = await aiApp("limits");
  const bad = async (body: unknown, status: number, kind: string, re?: RegExp) => {
    const r = await aiCall(a.slug, key, body);
    assert.equal(r.status, status, `${JSON.stringify(body).slice(0, 80)} → ${r.status} ${r.text.slice(0, 120)}`);
    assert.equal(r.json.kind, kind);
    if (re) assert.match(r.json.error, re);
  };
  await bad({ tier: "huge", messages: [{ role: "user", content: "x" }] }, 400, "failed", /tier is/);
  await bad({ tier: "quick", messages: [] }, 400, "failed");
  await bad({ tier: "quick", messages: [{ role: "robot", content: "x" }] }, 400, "failed", /role/);
  await bad({ tier: "quick", messages: [{ role: "user", content: 5 }] }, 400, "failed", /text/);
  await bad({ tier: "quick", messages: [{ role: "tool", content: "x" }] }, 400, "failed", /toolCallId/);
  await bad({ tier: "quick", messages: [{ role: "user", content: "x" }, { role: "assistant", content: "y" }] }, 400, "failed", /last message/);
  await bad({ tier: "quick", messages: Array.from({ length: 201 }, () => ({ role: "user", content: "x" })) }, 413, "too-long");
  await bad({ tier: "quick", messages: [{ role: "user", content: "x".repeat(AI_LIMITS.messageChars + 1) }] }, 413, "too-long");
  await bad({ tier: "quick", messages: Array.from({ length: 3 }, () => ({ role: "user", content: "x".repeat(AI_LIMITS.messageChars) })) }, 413, "too-long");
  await bad({ tier: "quick", messages: [{ role: "user", content: "x" }], tools: Array.from({ length: 41 }, (_, i) => ({ name: `t${i}`, description: "", input: {} })) }, 400, "failed");
  await bad({ tier: "quick", messages: [{ role: "user", content: "x" }], tools: [{ name: "a b", description: "", input: {} }] }, 400, "failed");
  await bad({ tier: "quick", messages: [{ role: "user", content: "x" }], tools: [{ name: "a", description: "", input: {} }], schema: { type: "object" } }, 400, "failed", /not both/);
  await bad({ tier: "quick", messages: [{ role: "user", content: "x" }], maxOutputTokens: "lots" }, 400, "failed");
  assert.deepEqual(asked, []);
  // maxOutputTokens is held to the most
  assert.equal((await aiCall(a.slug, key, hi({ maxOutputTokens: 1_000_000 }))).status, 200);
  assert.equal((asked as Seen[])[0].maxTokens, AI_LIMITS.maxOutput);
  // a person's minute
  reset();
  const p = person(a, "u-fast", "Fast");
  let last = 0;
  for (let i = 0; i < AI_LIMITS.callsPerPersonMinute + 1; i++) last = (await aiCall(a.slug, key, hi(), { "x-hydor-person": p })).status;
  assert.equal(last, 429);
  assert.equal((await aiCall(a.slug, key, hi(), { "x-hydor-person": person(a, "u-calm", "Calm") })).status, 200, "another person is not held back by theirs");
  // an app's minute: refused calls count too
  reset();
  let statuses: number[] = [];
  for (let i = 0; i < AI_LIMITS.callsPerMinute + 1; i++) statuses.push((await aiCall(a.slug, key, { tier: "nope" })).status);
  assert.equal(statuses[AI_LIMITS.callsPerMinute], 429);
  const limited = await aiCall(a.slug, key, hi());
  assert.equal(limited.json.kind, "busy");
  assert.ok(Number(limited.headers["retry-after"]) >= 1);
  // at once
  reset();
  delayMs = 300;
  const six = await Promise.all(Array.from({ length: 6 }, () => aiCall(a.slug, key, hi())));
  assert.equal(six.filter((r) => r.status === 200).length, AI_LIMITS.atOnce);
  assert.equal(six.filter((r) => r.status === 429 && r.json.kind === "busy").length, 2);
});

test("nothing anyone wrote or the model answered is kept: the log holds who (an id), the tier, the model, tokens, cost and how it ended", async () => {
  reset();
  const { a, key } = await aiApp("private");
  script = () => ({ text: "THE-ANSWER-WORDS", usage: { prompt: 7, completion: 3, cost: 0.001 } });
  const r = await aiCall(a.slug, key, { tier: "quick", messages: [{ role: "system", content: "SYSTEM-WORDS" }, { role: "user", content: "PRIVATE-QUESTION-WORDS" }] }, { "x-hydor-person": person(a, "u-1", "Una") });
  assert.equal(r.status, 200);
  const rows = db.prepare("select * from web_app_ai_calls where web_id = ?").all(a.id) as any[];
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].person, rows[0].tier, rows[0].model, rows[0].input_tokens, rows[0].output_tokens, rows[0].usd, rows[0].status], ["u-1", "quick", "scripted-sm-quick", 7, 3, 0.001, "ok"]);
  const dump = JSON.stringify(db.prepare("select * from web_app_ai_calls").all()) + JSON.stringify((await call("GET", `/api/webapps/${a.id}/ai`)).json) + JSON.stringify((await call("GET", `/api/webapps/${a.id}`)).json);
  for (const word of ["THE-ANSWER-WORDS", "SYSTEM-WORDS", "PRIVATE-QUESTION-WORDS"]) assert.ok(!dump.includes(word), `${word} is not in what Hydor keeps or shows`);
});

test("a call the person stops is not counted as an answer, and the model's server is told to stop", async () => {
  reset();
  const { a, key } = await aiApp("stopped");
  delayMs = 1500;
  script = () => ({ text: "slow", usage: { prompt: 1, completion: 1, cost: 0.5 } });
  const port = (web.parts() as any).port ?? 4789;
  void port;
  const url = `http://127.0.0.1:${HYDOR_PORT}/api/apps/${a.slug}/ai`;
  const ctl = new AbortController();
  const pending = fetch(url, { method: "POST", signal: ctl.signal, headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(hi()) }).catch(() => null);
  await sleep(300);
  ctl.abort();
  await pending;
  await sleep(2200);
  const rows = db.prepare("select status from web_app_ai_calls where web_id = ?").all(a.id) as { status: string }[];
  assert.deepEqual(rows.map((x) => x.status), ["stopped"]);
  assert.equal((await call("GET", `/api/webapps/${a.id}`)).json.app.ai.today.calls, 0);
  assert.equal((await call("GET", `/api/webapps/${a.id}`)).json.app.ai.today.usd, 0);
});

test("the app's JSON says what it asks for, what its owner allowed and what it spent today; an app without the block has no ai", async () => {
  reset();
  const { a } = await aiApp("json");
  const v = (await call("GET", `/api/webapps/${a.id}`)).json.app;
  assert.deepEqual(Object.keys(v.ai).sort(), ["allowed", "asks", "asksUsdPerDay", "atCap", "capUsd", "spentUsd", "today", "until"]);
  assert.deepEqual(v.ai.today, { usd: 0, flowsUsd: 0, calls: 0, inputTokens: 0, outputTokens: 0, people: 0, refused: 0, unpriced: 0 });
  const plain = await register("noai", {});
  assert.equal((await call("GET", `/api/webapps/${plain.id}`)).json.app.ai, undefined);
  assert.equal((await call("GET", `/api/webapps/${plain.id}/ai`)).status, 404);
});

// ---- run ---------------------------------------------------------------------------------------------------------------------------

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    await web.parts().host!.stopAll();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n${(e as Error).stack}`);
  }
}
console.log(`\n${passed}/${tests.length} passed`);
console.log("(the model was a stand-in in every one of them)");
await web.stop!(null as never);
modelServer.close();
await server.close();
fs.rmSync(scratch, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
