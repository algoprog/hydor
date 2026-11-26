// Checks for what Hydor makes of a web app's search (embed.ts, the route POST /api/apps/:slug/embed and what the app is started with), with the host's own fixtures:
// small apps made of a hydor.json and a server that says what its environment gives it. Who may ask (the key made for a web app without a flows half, the key of a
// flows half, nothing else), what the route answers (its shapes, the model and its size, the kind passed on), every refusal and limit, the answer when search by
// meaning is off or its model is not there (501: never a download), the daily count, and that Hydor's own work goes first.
// STAND-IN: the model. Hydor's embedder is replaced (setEmbedderForTests) by one that makes deterministic unit vectors from the words of a text: MARKED STAND-IN, the real
// model is not run here. Ports 4331 to 4338 (4330 is Hydor itself here).
//   OUTDIR=dist/dev node scripts/build-server.mjs server/webapps/embed-test.ts
//   HOME=<scratch folder> DATA_DIR=<scratch folder> HYDOR_APPS_DIR=<scratch folder> node dist/dev/embed-test.js
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
import type { Deps } from "../features/types.ts";
import { APP_EMBED, appEmbedStats, embed, setEmbedderForTests } from "../memory/embed.ts";
import { DIM } from "../memory/vectors.ts";
import { initPages } from "../pages/store.ts";
import { EMBED_LIMITS, EMBED_MODEL, embedKey, forgetEmbedLimits } from "./embed.ts";
import { createWebapps } from "./index.ts";
import { writeTestApp } from "./test-apps.ts";

if (!process.env.DATA_DIR?.startsWith("/tmp/") || !process.env.HYDOR_APPS_DIR?.startsWith("/tmp/") || !process.env.HOME?.startsWith("/tmp/")) {
  console.error("Run with HOME=/tmp/…, DATA_DIR=/tmp/… and HYDOR_APPS_DIR=/tmp/… so nothing touches real data.");
  process.exit(2);
}
// The model is never looked for outside the scratch folders: a test that sets none up never reaches a download.
process.env.HYDOR_EMBED_MODEL_DIR = path.join(process.env.DATA_DIR, "no-model-here");
delete process.env.HYDOR_EMBED_PYTHON;

const HYDOR_PORT = 4330;
const scratch = fs.mkdtempSync(path.join(process.env.DATA_DIR, "embed-"));
let passed = 0;
const tests: [string, () => Promise<void>][] = [];
const test = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---- the stand-in model: a unit vector from the words of a text (a text's words are what it is "about"); kind is recorded -------------------------------------------

const asked: { kind: string; texts: string[]; at: number; end: number }[] = [];
let delayMs = 0;
function standIn(text: string): Float32Array {
  const v = new Float32Array(DIM);
  for (const w of text.toLowerCase().match(/[a-z]+/g) ?? []) v[crypto.createHash("sha256").update(w).digest().readUInt16BE(0) % DIM] += 1;
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}
const useStandIn = () =>
  setEmbedderForTests(async (texts, kind) => {
    const at = Date.now();
    if (delayMs) await sleep(delayMs);
    asked.push({ kind, texts, at, end: Date.now() });
    return texts.map(standIn);
  });

// ---- fixtures ---------------------------------------------------------------------------------------------------------------------

const SERVER = String.raw`import http from 'node:http';
import crypto from 'node:crypto';
http.createServer((req, res) => {
  const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.url === '/api/health') return send(200, { ok: true });
  if (req.url === '/env') { const k = process.env.HYDOR_APP_KEY; return send(200, { url: process.env.HYDOR_URL ?? null, slug: process.env.HYDOR_APP_SLUG ?? null, key: k ?? null }); }
  send(404, { error: 'not here' });
}).listen(Number(process.env.PORT), '127.0.0.1');
`;
function fixture(name: string, blocks: Record<string, unknown>): string {
  return writeTestApp(path.join(scratch, "apps", name), SERVER, { name, services: "search" in blocks ? { embed: {} } : {} });
}

fs.mkdirSync(path.join(scratch, "hydor-data"), { recursive: true });
const db = openDb(path.join(scratch, "test.db"));
kvSet(db, "sharing:owner", "Dana");
initPages(db);
const sessions = Object.assign(new EventEmitter(), { adapterByRun: () => null, summary: () => null });
const server = Fastify();
await server.register(cookie);
server.setErrorHandler((err: Error, _req, reply) => {
  const status = err instanceof HttpError ? err.status : 500;
  reply.code(status).send({ ...(err instanceof HttpError ? err.extra : undefined), error: err.message });
});
const deps = { app: server, db, sessions: sessions as any, scheduler: null as any, models: null as any, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => "http://test.local" } as Deps;
appsFeature.routes!(deps);
const web = createWebapps({ dataDir: path.join(scratch, "hydor-data"), port: 4338, origin: "", domain: "", idleMs: 600_000, sandbox: true, ports: [4331, 4337], startTimeoutMs: 20_000, hydorUrl: `http://127.0.0.1:${HYDOR_PORT}`, appsRoot: path.join(scratch, "WebApps") });
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
const embedCall = (slug: string, key: string | null, body: unknown) => call("POST", `/api/apps/${slug}/embed`, body, key ? { authorization: `Bearer ${key}` } : {});
let made = 0;
async function register(name: string, blocks: Record<string, unknown>) {
  const unique = `${name}-${++made}`;
  const r = await call("POST", "/api/webapps", { folder: fixture(unique, blocks), name: unique });
  assert.equal(r.status, 200, r.text);
  return r.json.app as WebApp;
}
async function envOf(a: WebApp) {
  const port = await web.parts().host!.ensure({ id: a.id, slug: a.slug, dir: a.folder });
  return (await (await fetch(`http://127.0.0.1:${port}/env`)).json()) as { url: string | null; slug: string | null; key: string | null };
}
const floats = (b64: string) => new Float32Array(Buffer.from(b64, "base64").buffer.slice(0, Buffer.from(b64, "base64").length));

// ---- the tests ---------------------------------------------------------------------------------------------------------------------

test("a web app with the search block is started with where Hydor is, its own address and a key for this alone; one without the block gets none", async () => {
  const a = await register("notes", { search: { version: "0.1.0" } });
  const env = await envOf(a);
  assert.equal(env.url, `http://127.0.0.1:${HYDOR_PORT}`);
  assert.equal(env.slug, a.slug);
  assert.equal(env.key, embedKey(web.parts().host!.secret(a.id)));
  assert.match(env.key!, /^napp_w[A-Za-z0-9_-]{43}$/);
  const plain = await register("plain", {});
  const e2 = await envOf(plain);
  assert.deepEqual([e2.url, e2.slug, e2.key], [null, null, null], "a web app that does not search is given nothing to ask with");
  // The key opens nothing but this route: the run routes of the agent apps do not know it.
  const run = await call("POST", `/api/apps/${a.slug}/run`, { inputs: {} }, { authorization: `Bearer ${env.key}` });
  assert.ok(run.status === 401 || run.status === 404, `the key does not start runs: ${run.status}`);
});

test("the route answers as the driver asks: the model and its size, one base64 vector of that size for each text, in order, unit length, and the kind goes through", async () => {
  useStandIn();
  asked.length = 0;
  const a = await register("notes", { search: {} });
  const key = (await envOf(a)).key!;
  const r = await embedCall(a.slug, key, { texts: ["the cat sat", "dogs bark loudly"], kind: "document" });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.model, EMBED_MODEL);
  assert.equal(r.json.dim, DIM);
  assert.equal(r.json.vectors.length, 2);
  const [v0, v1] = r.json.vectors.map(floats);
  assert.equal(v0.length, DIM);
  assert.ok(Math.abs(Math.hypot(...v0) - 1) < 1e-4, "unit length");
  assert.ok(Math.abs(v0[0] - standIn("the cat sat")[0]) < 1e-6 && v0.some((x: number, i: number) => Math.abs(x - standIn("the cat sat")[i]) < 1e-6 && x > 0));
  assert.notDeepEqual([...v0], [...v1], "in order, one each");
  assert.equal(r.headers["cache-control"], "no-store");
  await embedCall(a.slug, key, { texts: ["what dogs bark"], kind: "query" });
  assert.deepEqual(asked.map((x) => x.kind), ["document", "query"], "document for a passage, query for what someone types: the model's own prefixes are put on by its worker");
});

test("who may ask: no key, a wrong key, another web app's key, a key of an agent app that is not this web app's, an app with no search block", async () => {
  useStandIn();
  const a = await register("notes", { search: {} });
  const b = await register("other", { search: {} });
  const good = (await envOf(a)).key!;
  const body = { texts: ["x"], kind: "query" };
  assert.equal((await embedCall(a.slug, null, body)).status, 401);
  assert.equal((await embedCall(a.slug, "napp_nonsense", body)).status, 401);
  assert.equal((await embedCall(a.slug, "not-a-key", body)).status, 401);
  assert.equal((await embedCall(a.slug, (await envOf(b)).key!, body)).status, 401, "another web app's key does not open this one");
  assert.equal((await embedCall(b.slug, good, body)).status, 401, "nor this key the other");
  assert.equal((await embedCall("no-such-app", good, body)).status, 401, "an address that is nothing is a refusal of the key, not a hint of which apps exist");
  const nosearch = await register("blank", {});
  assert.equal((await embedCall(nosearch.slug, embedKey(web.parts().host!.secret(nosearch.id)), body)).status, 403, "even a key made from its secret: it has no search block");
  // A flows half's keys: the one made for the web app opens it; another key made on the agent app does not.
  const f = await register("withflows", { search: {} });
  const linked = await call("POST", `/api/webapps/${f.id}/flows`, {});
  assert.equal(linked.status, 200, linked.text);
  const fenv = await envOf((await call("GET", `/api/webapps/${f.id}`)).json.app);
  await web.parts().host!.stop(f.id);
  const again = await envOf(f);
  assert.equal(again.slug, linked.json.flows.app.slug, "with a flows half the address is the agent app's");
  assert.equal((await embedCall(again.slug!, again.key!, body)).status, 200, "the flows half's key made for the web app opens it");
  const other = await call("POST", `/api/apps/${linked.json.flows.app.id}/keys`, { name: "a script" });
  assert.ok(other.status === 200 && other.json.key, `a second key on the agent app: ${other.status} ${other.text.slice(0, 100)}`);
  assert.equal((await embedCall(again.slug!, other.json.key, body)).status, 403, "a key made for something else is not the web app's");
  assert.equal(fenv.slug !== undefined, true);
});

test("the limits: 64 texts, 8,000 characters, the right body, 30 calls a minute, a number of texts a day, each with its sentence", async () => {
  useStandIn();
  forgetEmbedLimits();
  const a = await register("notes", { search: {} });
  const key = (await envOf(a)).key!;
  const many = Array.from({ length: 64 }, (_, i) => `text ${i}`);
  assert.equal((await embedCall(a.slug, key, { texts: many, kind: "document" })).status, 200, "64 is fine");
  const tooMany = await embedCall(a.slug, key, { texts: [...many, "one more"], kind: "document" });
  assert.equal(tooMany.status, 413);
  assert.match(tooMany.json.error, /64 texts/);
  const tooLong = await embedCall(a.slug, key, { texts: ["x".repeat(EMBED_LIMITS.chars + 1)], kind: "document" });
  assert.equal(tooLong.status, 413);
  assert.match(tooLong.json.error, /8000 characters/);
  assert.equal((await embedCall(a.slug, key, { texts: ["x".repeat(EMBED_LIMITS.chars)], kind: "document" })).status, 200, "8,000 is fine");
  for (const bad of [{ texts: [], kind: "query" }, { texts: "x", kind: "query" }, { texts: [1], kind: "query" }, { texts: ["x"], kind: "other" }, { texts: ["x"] }, null]) assert.equal((await embedCall(a.slug, key, bad)).status, 400, JSON.stringify(bad));
  // Calls a minute: those so far count (the refused ones too, they were calls).
  forgetEmbedLimits();
  let last = 0;
  let n = 0;
  for (; n < EMBED_LIMITS.callsPerMinute + 5 && last !== 429; n++) last = (await embedCall(a.slug, key, { texts: ["x"], kind: "query" })).status;
  assert.equal(n, EMBED_LIMITS.callsPerMinute + 1, "the 31st call in a minute is the first refused");
  const slow = await embedCall(a.slug, key, { texts: ["x"], kind: "query" });
  assert.equal(slow.status, 429);
  assert.ok(Number(slow.headers["retry-after"]) >= 1, "says how long to wait");
  // Texts a day.
  forgetEmbedLimits();
  const was = EMBED_LIMITS.textsPerDay;
  const used = (await call("GET", `/api/webapps/${a.id}`)).json.app.meaning;
  assert.equal(used.limit, was);
  assert.ok(used.texts > 64, `the day's count is kept and shown: ${used.texts}`);
  EMBED_LIMITS.textsPerDay = used.texts + 2;
  try {
    assert.equal((await embedCall(a.slug, key, { texts: ["a", "b"], kind: "query" })).status, 200);
    const out = await embedCall(a.slug, key, { texts: ["c"], kind: "query" });
    assert.equal(out.status, 429);
    assert.match(out.json.error, /a day/);
    assert.ok(Number(out.headers["retry-after"]) > 60, "till tomorrow");
    assert.equal((await call("GET", `/api/webapps/${a.id}`)).json.app.meaning.texts, used.texts + 2, "a refused call counts nothing");
  } finally {
    EMBED_LIMITS.textsPerDay = was;
  }
});

test("search by meaning off, or its model not set up: 501 with the reason, and nothing is started or downloaded", async () => {
  setEmbedderForTests(null);
  forgetEmbedLimits();
  const a = await register("notes", { search: {} });
  const key = (await envOf(a)).key!;
  kvSet(db, "memory.meaning", "0");
  const off = await embedCall(a.slug, key, { texts: ["x"], kind: "query" });
  assert.equal(off.status, 501, off.text);
  assert.equal(off.json.reason, "off");
  assert.match(off.json.error, /turned off/);
  kvSet(db, "memory.meaning", "1");
  const notThere = await embedCall(a.slug, key, { texts: ["x"], kind: "query" });
  assert.equal(notThere.status, 501, notThere.text);
  assert.equal(notThere.json.reason, "not-set-up");
  assert.ok(!fs.existsSync(process.env.HYDOR_EMBED_MODEL_DIR!), "no download was started, nothing was made where the model would go");
  assert.equal((await call("GET", `/api/webapps/${a.id}`)).json.app.meaning.texts, 0, "and nothing counted");
  useStandIn();
});

test("Hydor's own work goes first: an app's texts go to the model four at a time, one piece in all, and wait while Hydor's own search is being answered", async () => {
  useStandIn();
  forgetEmbedLimits();
  const a = await register("notes", { search: {} });
  const key = (await envOf(a)).key!;
  const b = await register("other", { search: {} });
  const key2 = (await envOf(b)).key!;
  asked.length = 0;
  delayMs = 60;
  appEmbedStats.pieces = appEmbedStats.steppedAside = 0;
  try {
    // 40 texts from one app and 40 from another, then Hydor's own three requests (the search box, memory) while they go.
    const mine = Array.from({ length: 40 }, (_, i) => `passage ${i}`);
    const one = embedCall(a.slug, key, { texts: mine, kind: "document" });
    const two = embedCall(b.slug, key2, { texts: mine, kind: "document" });
    await sleep(150);
    const t0 = Date.now();
    const own = [];
    for (let i = 0; i < 3; i++) {
      own.push(embed(db, [`own ${i}`], "query", { wait: true }).then(() => Date.now() - t0));
      await sleep(20);
    }
    const waited = await Promise.all(own);
    const [ra, rb] = await Promise.all([one, two]);
    assert.equal(ra.status, 200, ra.text);
    assert.equal(rb.status, 200, rb.text);
    assert.equal(ra.json.vectors.length, 40);
    assert.ok(asked.filter((x) => x.texts[0].startsWith("passage")).every((x) => x.texts.length <= APP_EMBED.piece), "no piece of an app is bigger than a few texts");
    assert.equal(appEmbedStats.pieces, 20, "80 texts in pieces of four");
    // Hydor's own requests were answered in about the time of one piece (60 ms) each, not behind the 18 or so pieces still to go.
    assert.ok(waited.every((ms) => ms < 600), `Hydor's own search waited ${waited.join(", ")} ms for a model busy with two apps' 80 texts`);
    assert.ok(appEmbedStats.steppedAside > 0, "the apps stood aside for it");
    const lastOwn = Math.max(...asked.filter((x) => x.texts[0].startsWith("own")).map((x) => x.end));
    const lastApp = Math.max(...asked.filter((x) => x.texts[0].startsWith("passage")).map((x) => x.end));
    assert.ok(lastOwn < lastApp, "Hydor's own finished before the apps' work did");
  } finally {
    delayMs = 0;
  }
});

test("an app that is kept waiting by Hydor's own work for too long is told to come back (503 with Retry-After): carrying on with words", async () => {
  useStandIn();
  forgetEmbedLimits();
  const a = await register("notes", { search: {} });
  const key = (await envOf(a)).key!;
  const was = APP_EMBED.yieldMs;
  APP_EMBED.yieldMs = 300;
  delayMs = 1200;
  try {
    const own = embed(db, ["own"], "query", { wait: true });
    await sleep(50);
    const r = await embedCall(a.slug, key, { texts: ["x"], kind: "document" });
    assert.equal(r.status, 503, r.text);
    assert.equal(r.json.reason, "busy");
    assert.ok(Number(r.headers["retry-after"]) >= 1);
    await own;
    assert.equal((await embedCall(a.slug, key, { texts: ["x"], kind: "document" })).status, 200, "and when Hydor is free, it is answered");
  } finally {
    APP_EMBED.yieldMs = was;
    delayMs = 0;
  }
});

for (const [name, fn] of tests) {
  try {
    await fn();
    await web.parts().host!.stopAll();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed} of ${tests.length} passed (the model was a stand-in in every one of them)`);
await web.stop!(null as never);
await server.close();
fs.rmSync(scratch, { recursive: true, force: true });
fs.rmSync(process.env.HYDOR_APPS_DIR!, { recursive: true, force: true });
process.exit(process.exitCode ?? 0);
