// A web app's keys from its hydor.json and the services catalog (app-keys.ts, key-tools.ts, services.ts): who gives each and what
// is set, one value per app; the card a session gets from webapp_keys and from a chosen service; test keys only inside Hydor;
// the keys Hydor makes, one for Preview and one for the launched version; a value elsewhere offered only where a test and a live one
// look alike for sure; what Preview is started with, and nothing of it on a command line or in a log; removing a key, and an app;
// and no value anywhere in what was kept. No network, fake values. Ports 4780 to 4789.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/webapps/keys-test.ts
//   HOME=<scratch folder> DATA_DIR=<scratch folder> HYDOR_APPS_DIR=<scratch folder> node dist/dev/keys-test.js
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import { keysCardOf, pasteWarning, type KeysCardView } from "../../shared/keys.ts";
import { servicesCardOf, type AppServicesView, type NeedView, type ServicesCardView } from "../../shared/services.ts";
import type { WebAppDetail, WebAppKeys } from "../../shared/webapps.ts";
import { HttpError } from "../auth.ts";
import { connections } from "../connections/index.ts";
import { listAppKeys, readAppKey, saveSecret, vaultTables } from "../connections/vault.ts";
import { kvSet, openDb } from "../db.ts";
import type { Deps, RunCtx, RunTool, ToolOutput } from "../features/types.ts";
import { forgetAllowed } from "../guide/api.ts";
import { createWebapps } from "./index.ts";
import { asOffered, readCatalog, serviceView } from "./services.ts";
import { writeTestApp } from "./test-apps.ts";

for (const v of ["DATA_DIR", "HOME"]) if (!process.env[v]?.startsWith("/tmp/")) (console.error("Run with HOME and DATA_DIR in scratch folders, so nothing touches real data."), process.exit(2));
const scratch = fs.mkdtempSync(path.join(process.env.DATA_DIR!, "keys-"));
let passed = 0;
const step = async (name: string, fn: () => Promise<void> | void) => {
  await fn();
  passed++;
  console.log(`ok - ${name}`);
};
const sha = (v: string) => crypto.createHash("sha256").update(v).digest("hex");
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Each in two parts, so no file holds the shape of a real key.
const VALUES = {
  good: "sk_test_" + "fakeGOODm4Qz8Lt2Vw9Xp5Rc1Nb7Hd3Kf6",
  live: "sk_live_" + "fakeC4vb7Nm1Qw5Er9Ty3Ui6Op2As8Df0",
  model: "sk-ant-" + "fakeG6hj2Kl8Zx4Cv0Bn5Mq1We7Rt3Yu9I",
  mine: "old fake value Pq7Lm3Zx9Cv1Bn5",
};

/** The app's server: it says which of its keys it has, by their hash, and prints one (which Hydor's log has to hide). */
const SERVER = String.raw`import http from 'node:http';
import crypto from 'node:crypto';
const NAMES = ['STRIPE_SECRET_KEY', 'AI_API_KEY', 'LINK_KEY', 'SHOP_NAME'];
console.log('paying with ' + (process.env.STRIPE_SECRET_KEY || 'nothing'));
http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(Object.fromEntries(NAMES.filter((n) => process.env[n]).map((n) => [n, crypto.createHash('sha256').update(process.env[n]).digest('hex')]))));
}).listen(Number(process.env.PORT), '127.0.0.1');
`;
const KEYS = [
  { name: "STRIPE_SECRET_KEY", from: "Stripe", why: "Takes payments", how: ["Open the dashboard", "Copy the secret key"], url: "https://dashboard.stripe.com", looks: { starts: ["sk_"], say: "starts with sk_" } },
  { name: "AI_API_KEY", from: "Anthropic", why: "Writes the summaries", how: ["Create a key"], url: "https://console.anthropic.com", looks: { starts: ["sk-ant-"], say: "starts with sk-ant-" } },
  { name: "LINK_KEY", from: "made", why: "Signs its links" },
  { name: "SHOP_NAME", from: "you", why: "What the shop is called", how: ["Write the name you want shown"], optional: true },
];

const db = openDb(path.join(scratch, "test.db"));
kvSet(db, "sharing:owner", "Dana");
vaultTables(db);
const server = Fastify();
server.setErrorHandler((err: Error, _req, r) => r.code(err instanceof HttpError ? err.status : 500).send({ error: err.message }));
const told: string[] = [];
const said: string[] = [];
const sessions = Object.assign(new EventEmitter(), {
  adapterByRun: () => ({ state: { mode: "default" }, ask: async () => ({ decision: "accept" }) }),
  summary: () => null,
  queueSummary: () => {},
  deliverOrQueue: async (_key: string, text: string) => void told.push(text),
});
const deps = { app: server, db, sessions, scheduler: null, models: {}, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => "http://test.local" } as unknown as Deps;
connections.routes!(deps);
const dataDir = path.join(scratch, "hydor-data");
const web = createWebapps({ dataDir, port: 4780, origin: "", domain: "", idleMs: 600_000, sandbox: true, ports: [4781, 4789], startTimeoutMs: 20_000, appsRoot: path.join(scratch, "WebApps"), weekly: false });
web.routes!(deps);
await server.ready();
web.start!(deps);
await web.ready;
forgetAllowed();

async function call<T = any>(method: string, url: string, body?: unknown): Promise<{ status: number; json: T }> {
  const r = await server.inject({ method: method as "GET", url, headers: body === undefined ? {} : { "content-type": "application/json" }, payload: body === undefined ? undefined : JSON.stringify(body) });
  said.push(r.body);
  let json: unknown = null;
  try {
    json = r.json();
  } catch {}
  return { status: r.statusCode, json: json as T };
}
async function add(name: string): Promise<WebAppDetail> {
  const dir = writeTestApp(path.join(scratch, "apps", name), SERVER, { name, keys: KEYS, signIn: "own", env: { port: "PORT", data: "DATA_DIR" }, ready: "/" });
  const r = await call<{ app: WebAppDetail }>("POST", "/api/webapps", { folder: dir });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return r.json.app;
}
const shop = await add("shop");
const ctx = { runId: "run1", key: "agent-session", agent: "claude", cwd: shop.folder, deps } as unknown as RunCtx;
async function tool(name: string, args: Record<string, unknown> = {}): Promise<string> {
  const t = web.tools!(ctx).find((x) => x.name === name) as RunTool;
  const r = await t.run(args, ctx);
  const text = typeof r === "string" ? r : (r as ToolOutput & { text: string }).text;
  said.push(text);
  return text;
}
const keysOf = async (a: WebAppDetail) => (await call<WebAppKeys>("GET", `/api/webapps/${a.id}/keys?env=hydor`)).json;
const names = (v: WebAppKeys) => v.keys.map((k) => `${k.name}:${k.givenBy}:${k.needed ? "needed" : "optional"}:${k.set ? "set" : "unset"}`);
const card = async (out: string) => {
  const id = keysCardOf(out);
  assert.ok(id, out);
  return (await call<{ card: KeysCardView }>("GET", `/api/connections/requests/${id}`)).json.card;
};
const put = (c: KeysCardView, item: string, body: unknown) => call<{ card: KeysCardView; error?: string }>("POST", `/api/connections/requests/${c.id}/items/${item}`, body);
const mine = (a: WebAppDetail, name: string, place = "hydor") => readAppKey(db, a.id, place, name);

await step("what the app says of its keys: who gives each, which are needed, which are set; a place on a server has its own", async () => {
  assert.deepEqual(names(await keysOf(shop)), ["STRIPE_SECRET_KEY:provider:needed:unset", "AI_API_KEY:provider:needed:unset", "LINK_KEY:made:needed:unset", "SHOP_NAME:you:optional:unset"]);
  const there = (await call<WebAppKeys>("GET", `/api/webapps/${shop.id}/keys?env=production`)).json;
  assert.deepEqual([there.env, there.inside, there.envs, there.servers, there.keys.every((k) => !k.set)], ["production", false, ["hydor", "production"], ["production"], true]);
  for (const bad of ["hydor-preview", "all%20of", "Production"]) assert.equal((await call("GET", `/api/webapps/${shop.id}/keys?env=${bad}`)).status, 400, bad);
  assert.match(await tool("webapp_keys"), /Keys of shop in inside Hydor|Keys of shop/);
});

let asked!: KeysCardView;
await step("webapp_keys asks on a card: a tab for each provider with its steps; a live payments key is warned about and refused inside Hydor", async () => {
  asked = await card(await tool("webapp_keys", { ask: true }));
  assert.deepEqual(asked.items.map((i) => i.title), ["Stripe", "Anthropic", "Shop name"]);
  assert.deepEqual(asked.items[0].how, ["Open the dashboard", "Copy the secret key"]);
  assert.equal(asked.inside, true);
  assert.equal(pasteWarning("pk_live_x", asked.items[0].fields[0]), "looks");
  const live = await put(asked, asked.items[0].id, { values: { STRIPE_SECRET_KEY: VALUES.live } });
  assert.equal(live.status, 400, JSON.stringify(live.json));
  assert.equal(mine(shop, "STRIPE_SECRET_KEY"), null);
  assert.equal((await put(asked, asked.items[0].id, { values: { STRIPE_SECRET_KEY: VALUES.good } })).status, 200);
  assert.equal((await put(asked, asked.items[1].id, { values: { AI_API_KEY: VALUES.model } })).status, 200);
  assert.equal(mine(shop, "STRIPE_SECRET_KEY"), VALUES.good);
  assert.deepEqual(names(await keysOf(shop)).slice(0, 2), ["STRIPE_SECRET_KEY:provider:needed:set", "AI_API_KEY:provider:needed:set"]);
});

await step("a value of the same name elsewhere is offered only where it cannot be a test key in one place and a live one in another, and copied when taken", async () => {
  const other = await add("other");
  saveSecret(db, { name: "AI_API_KEY", value: VALUES.mine });
  const c = (await call<{ card: KeysCardView }>("POST", `/api/webapps/${other.id}/keys/card`, { env: "hydor" })).json.card;
  assert.equal(c.items[0].reuse, undefined, "payments: never");
  assert.deepEqual(c.items[1].reuse?.map((r) => r.id), [`app:${shop.id}:hydor`, "vault"]);
  assert.doesNotMatch(JSON.stringify(c), /sk-ant-fake/);
  assert.equal((await put(c, c.items[1].id, { reuse: "app:nobody:hydor" })).status, 409);
  assert.equal((await put(c, c.items[1].id, { reuse: `app:${shop.id}:hydor` })).status, 200);
  assert.equal(mine(other, "AI_API_KEY"), VALUES.model);
  assert.equal((await call("DELETE", `/api/webapps/${other.id}`)).status, 200);
  assert.deepEqual(listAppKeys(db, other.id), [], "an app's keys go with it");
});

const seen = async (id: string) => {
  const st = web.parts().host!.status(id);
  assert.equal(st.state, "running", `${st.state} ${st.log.slice(-5).join(" | ")}`);
  const hashes = (await (await fetch(`http://127.0.0.1:${st.port}/`)).json()) as Record<string, string>;
  return { hashes, log: st.log.join("\n"), pid: st.pid! };
};

await step("Preview is started with the app's keys by name and a made one of its own; no value on a command line, and hidden in its log", async () => {
  assert.equal((await call("POST", `/api/webapps/${shop.id}/start`)).status, 200);
  const s = await seen(shop.id);
  assert.equal(s.hashes.STRIPE_SECRET_KEY, sha(VALUES.good));
  assert.equal(s.hashes.AI_API_KEY, sha(VALUES.model));
  const made = mine(shop, "LINK_KEY", "hydor-preview")!;
  assert.equal(Buffer.from(made, "base64url").length, 32);
  assert.equal(s.hashes.LINK_KEY, sha(made));
  assert.equal(mine(shop, "LINK_KEY"), null, "the launched version's is made when it is launched");
  await sleep(200);
  assert.match((await seen(shop.id)).log, /paying with «hidden»/);
  for (const pid of fs.readdirSync("/proc").filter((x) => /^\d+$/.test(x))) {
    let line = "";
    try {
      line = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8");
    } catch {}
    for (const v of Object.values(VALUES)) assert.ok(!line.includes(v), `a value is on the command line of ${pid}`);
  }
});

await step("a place on a server keeps its own value, a live payments key among them, which inside Hydor is never given", async () => {
  const c = (await call<{ card: KeysCardView }>("POST", `/api/webapps/${shop.id}/keys/card`, { env: "production" })).json.card;
  assert.deepEqual([c.app!.env, c.inside], ["production", undefined]);
  const r = await put(c, c.items[0].id, { values: { STRIPE_SECRET_KEY: VALUES.live } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual([mine(shop, "STRIPE_SECRET_KEY", "production"), mine(shop, "STRIPE_SECRET_KEY")], [VALUES.live, VALUES.good]);
  const all = (await call<WebAppKeys>("GET", `/api/webapps/${shop.id}/keys?env=all`)).json;
  const stripe = all.keys.find((k) => k.name === "STRIPE_SECRET_KEY")!;
  assert.deepEqual(stripe.places!.map((p) => [p.env, p.set, p.refused ?? null]), [["hydor", true, null], ["production", true, null]]);
  assert.ok(!JSON.stringify(all).includes(VALUES.live), "never read back");
  assert.equal((await call("DELETE", `/api/webapps/${shop.id}/keys/STRIPE_SECRET_KEY?env=production`)).status, 200);
  assert.deepEqual([mine(shop, "STRIPE_SECRET_KEY", "production"), mine(shop, "STRIPE_SECRET_KEY")], [null, VALUES.good]);
});

await step("removing a key takes it away from the app, and the card asks for it again", async () => {
  assert.equal((await call("DELETE", `/api/webapps/${shop.id}/keys/AI_API_KEY?env=hydor`)).status, 200);
  assert.equal(mine(shop, "AI_API_KEY"), null);
  assert.equal((await call("DELETE", `/api/webapps/${shop.id}/keys/LINK_KEY?env=hydor`)).status, 404, "a made one is Hydor's");
  assert.ok((await call<{ card: KeysCardView }>("POST", `/api/webapps/${shop.id}/keys/card`, { env: "hydor" })).json.card);
});

await step("services: the catalog's needs, a need with one service is not a question, one with several puts a card; the choice gives hydor.json's lines and asks for its keys", async () => {
  const needs = (await call<{ needs: NeedView[] }>("GET", "/api/webapps/services")).json.needs;
  assert.ok(needs.length >= 12 && needs.every((n) => n.services.length <= 3));
  assert.ok(!JSON.stringify(readCatalog()).match(/"kit"/), "nothing of a framework in the catalog");
  assert.match(await tool("webapp_services", { need: "sms" }), /Without a service: .*ask: true/s);
  const out = await tool("webapp_services", { need: "sms", ask: true });
  assert.match(out, /The catalog has one service for .*Twilio\. .*do not ask them to choose/s);
  assert.match(out, /Write these into hydor\.json's "keys"/);
  const several = await tool("webapp_services", { need: "payments" });
  const id = servicesCardOf(several);
  assert.ok(id, several);
  const c = (await call<{ card: ServicesCardView }>("GET", `/api/webapps/services/cards/${id}`)).json.card;
  assert.deepEqual([c.app.name, c.need.id, c.need.services.length > 1], ["shop", "payments", true]);
  const chose = (await call("POST", `/api/webapps/${shop.id}/services/payments`, { service: "stripe", card: id })).json;
  assert.deepEqual(chose.chosen.applied, { state: "agent", say: "Its keys go into the app's hydor.json, and the agent writes what uses them." });
  assert.match(chose.say, /"name":"STRIPE_SECRET_KEY"/);
  assert.match(told.at(-1)!, /Stripe was chosen/);
  assert.deepEqual((await call<AppServicesView>("GET", `/api/webapps/${shop.id}/services`)).json.chosen.map((x) => x.need).sort(), ["payments", "sms"]);
  const stale = { id: "x", name: "X", why: "w", page: "https://x.example", keys: [], stepsRead: "2020-01-01", sources: [], free: { text: "free", read: "2020-01-01" } };
  assert.deepEqual([serviceView(stale, Date.parse("2026-11-26")).checkPrice, serviceView(stale, Date.parse("2026-11-26")).free], [true, undefined]);
  assert.ok(asOffered);
});

await step("no value is in what Hydor kept, the app's folder, what was sent back or what the agent saw", async () => {
  const files = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(d, e.name)) : e.isFile() ? [path.join(d, e.name)] : []));
  for (const f of [...files(dataDir), ...files(path.join(scratch, "apps"))]) {
    const text = fs.readFileSync(f, "utf8");
    for (const [n, v] of Object.entries(VALUES)) assert.ok(!text.includes(v), `${n} is in ${f}`);
  }
  for (const text of [...said, ...told]) for (const [n, v] of Object.entries(VALUES)) assert.ok(!text.includes(v), `${n} was said`);
});

await web.stop!(null as never);
await server.close();
db.close();
fs.rmSync(scratch, { recursive: true, force: true });
console.log(`\n${passed} checks passed`);
process.exit(0);
