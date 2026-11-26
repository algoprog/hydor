// Checks for the catalog of outside services (services.json, services.ts): the file's shape (every figure dated, https
// links, one to three offered for each need with exactly one default where there is a choice, every key with steps, what
// is left out with its reason), prices older than ninety days not shown as fact, a service on hold, and that the choice
// card, the keys card that follows it and the places card of the Launch tab are read from it. No network, no real
// service, fake values. Ports 4790 and 4791.
// Build it, then run it with HOME and DATA_DIR set to scratch folders under the system's temporary folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/webapps/services-test.ts
//   HOME=<scratch folder> DATA_DIR=<scratch folder> node dist/dev/services-test.js
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { readHydorValue } from "../../shared/hydor-file.ts";
import type { KeysCardView } from "../../shared/keys.ts";
import { PRICE_DAYS, servicesCardOf, type NeedView, type ServicesCardView } from "../../shared/services.ts";
import type { WebAppDetail } from "../../shared/webapps.ts";
import { HttpError } from "../auth.ts";
import { connections } from "../connections/index.ts";
import { vaultTables } from "../connections/vault.ts";
import { kvSet, openDb } from "../db.ts";
import type { Deps, RunCtx, RunTool } from "../features/types.ts";
import { createWebapps } from "./index.ts";
import { launchPlaces, withCatalog } from "./places.ts";
import { asOffered, CATALOG_FILE, needView, readCatalog, unconfirmedStep, type CatalogFile } from "./services.ts";

const temp = [os.tmpdir(), fs.realpathSync(os.tmpdir())];
for (const v of ["DATA_DIR", "HOME"]) if (!temp.some((t) => process.env[v]?.startsWith(t + path.sep))) (console.error("Run with HOME and DATA_DIR in scratch folders under the temporary folder, so nothing touches real data."), process.exit(2));
const scratch = fs.mkdtempSync(path.join(process.env.DATA_DIR!, "services-"));
let passed = 0;
const step = async (name: string, fn: () => Promise<void> | void) => {
  await fn();
  passed++;
  console.log(`ok - ${name}`);
};

const catalog = readCatalog();
const every = catalog.needs.flatMap((n) => [...n.services, ...(n.also ?? [])].map((s) => ({ need: n.id, s })));
const https = (u: string, what: string) => {
  const url = new URL(u);
  assert.equal(url.protocol, "https:", what);
  assert.ok(url.hostname.includes("."), what);
};
const day = (d: string, what: string) => {
  assert.match(d, /^\d{4}-\d{2}-\d{2}$/, what);
  const t = Date.parse(`${d}T00:00:00Z`);
  assert.ok(!Number.isNaN(t) && t <= Date.now() + 86_400_000, what);
};

await step("the file: one to three offered for each need with exactly one default, first, and what is left out has its reason", () => {
  assert.deepEqual(catalog.needs.map((n) => n.id), ["database", "mail", "run", "search", "files", "model", "payments", "signin", "sms", "visits", "errors", "uptime", "domain", "bots", "maps"]);
  day(catalog.pricesRead, "pricesRead");
  day(catalog.stepsRead, "stepsRead");
  for (const n of catalog.needs) {
    assert.ok(n.name && n.what && n.leftOut.length, n.id);
    assert.ok(n.services.length >= 1 && n.services.length <= 3, `${n.id}: ${n.services.length} offered`);
    assert.deepEqual(n.services.map((s) => !!s.default), n.services.map((_, i) => i === 0), `${n.id}: the first is the one default`);
    assert.ok(!(n.also ?? []).some((s) => s.default), n.id);
    for (const x of n.leftOut) {
      assert.ok(x.name && x.why, `${n.id}: left out without a reason`);
      if (x.url) https(x.url, `${n.id} left out`);
    }
    assert.equal(new Set([...n.services, ...(n.also ?? [])].map((s) => s.id)).size, n.services.length + (n.also?.length ?? 0), n.id);
  }
});

await step("every service: its sentence, dated figures, https pages, the pages its steps were read from, and steps for every key (or to get going)", () => {
  for (const { need, s } of every) {
    const at = `${need}/${s.id}`;
    assert.ok(s.name && s.why.endsWith("."), at);
    https(s.page, at);
    day(s.stepsRead, at);
    assert.ok(s.sources.length, at);
    for (const u of s.sources) https(u, `${at} source`);
    for (const p of [s.free, s.paid]) if (p) (assert.ok(p.text, at), day(p.read, at));
    assert.ok(s.keys.length || s.setup?.length, `${at}: nothing to follow`);
    if (s.setup) assert.ok(s.setup.length >= 3 && s.setup.length <= 6, at);
    for (const k of s.keys) {
      assert.match(k.name, /^[A-Z][A-Z0-9_]{1,63}$/, at);
      assert.ok(k.label && k.why, `${at} ${k.name}`);
      assert.ok(k.how.length >= 3 && k.how.length <= 6, `${at} ${k.name}: ${k.how.length} steps`);
      for (const h of k.how) {
        assert.ok(h.length <= 200, `${at}: ${h}`);
        // Prices are the catalog's, dated; a step that quoted one would outlive it.
        assert.doesNotMatch(h, /[$€£]\s?\d|\d+\s?(dollars|euros)|\d,\d{3}/, `${at}: a price in a step`);
      }
      https(k.url, `${at} ${k.name}`);
      if (k.looks?.starts) assert.ok(k.looks.starts.every((x) => typeof x === "string" && x), at);
    }
  }
  assert.doesNotMatch(fs.readFileSync(CATALOG_FILE, "utf8"), /\/home\/|\/tmp\//, "no path of the computer it was written on");
  // Money is only in the dated figures: anywhere else it would be shown as fact long after it changed.
  for (const n of catalog.needs) {
    const words = [n.note ?? "", n.builtIn?.say ?? "", ...n.leftOut.map((x) => x.why), ...[...n.services, ...(n.also ?? [])].flatMap((s) => [s.why, s.catch ?? "", ...(s.notFor ?? [])])];
    for (const t of words) assert.doesNotMatch(t, /[$€£¢]|\b\d+ (cents|dollars|euros)\b/, `${n.id}: ${t}`);
  }
});

await step("the clicks to make a server and to add a record are dated, from https pages, and hold no price", () => {
  const run = catalog.needs.find((n) => n.id === "run")!;
  const server = run.services.find((s) => s.default)!.server!;
  assert.equal(server.clicks.length, 3);
  const pasted = server.text!;
  assert.equal(pasted.clicks.length, 3);
  assert.ok(pasted.clicks[2]!.includes(`“${pasted.box}”`) && /^\d{4}-\d{2}-\d{2}$/.test(pasted.read));
  assert.ok(pasted.sources.every((u) => u.startsWith("https://")) && !/[$€£]\s?\d/.test(pasted.clicks.join(" ")));
  assert.ok(server.login && server.box && server.compare && server.compareLine && server.address);
  for (const s of catalog.needs.find((n) => n.id === "domain")!.services) assert.ok(s.record?.where && s.record.name && s.record.value, s.id);
  for (const x of [server, ...catalog.needs.find((n) => n.id === "domain")!.services.map((s) => s.record!)]) {
    day(x.read, "read");
    assert.ok(x.sources.length);
    for (const u of x.sources) https(u, "source");
    assert.doesNotMatch(JSON.stringify(x), /[$€£]\s?\d/);
  }
});

await step("a figure older than ninety days is not shown as a fact", () => {
  const mail = catalog.needs.find((n) => n.id === "mail")!;
  const read = Date.parse(`${catalog.pricesRead}T00:00:00Z`);
  const fresh = needView(mail, read + 30 * 86_400_000);
  assert.equal(fresh.services[0].checkPrice, false);
  assert.ok(fresh.services[0].free && fresh.readOn);
  const old = needView(mail, read + (PRICE_DAYS + 2) * 86_400_000);
  assert.ok(old.services.every((s) => s.checkPrice && !s.free && !s.paid && s.page), JSON.stringify(old.services));
  assert.equal(old.readOn, undefined);
});

await step("a service on hold is left out with its reason and address, and offered again when the hold is taken away; an unconfirmed step is told as a link and never as fact", () => {
  const file = JSON.parse(fs.readFileSync(CATALOG_FILE, "utf8")) as CatalogFile;
  const run = catalog.needs.find((n) => n.id === "run")!;
  assert.deepEqual(run.services.map((s) => s.id), ["digitalocean", "render"]);
  const held = run.leftOut.find((x) => x.name === "Hetzner's servers")!;
  https(held.url!, "the held one's page");
  const raw = file.needs.find((n) => n.id === "run")!.services;
  delete raw.find((s) => s.id === "hetzner")!.hold;
  const back = asOffered(file).needs.find((n) => n.id === "run")!;
  assert.deepEqual(back.services.map((s) => s.id), ["digitalocean", "hetzner", "render"]);
  const marked = file.needs.flatMap((n) => n.services).flatMap((s) => s.keys.flatMap((k) => k.how.filter((h) => typeof h !== "string").map((h) => ({ s, k, what: (h as { unconfirmed: string }).unconfirmed }))));
  assert.ok(marked.length >= 1);
  for (const m of marked) {
    const shown = every.find((x) => x.s.id === m.s.id)!.s.keys.find((k) => k.name === m.k.name)!;
    assert.ok(shown.how.includes(unconfirmedStep(m.s.name, m.what)) && shown.url, `${m.s.id} ${m.k.name}`);
  }
  assert.ok(catalog.needs.flatMap((n) => n.services).every((s) => !("hold" in s) && s.keys.every((k) => k.how.every((h) => typeof h === "string"))));
});

await step("the places card names the catalog's servers for a server of your own, with their prices while fresh", () => {
  const read = Date.parse(`${catalog.pricesRead}T00:00:00Z`);
  const places = withCatalog(launchPlaces(), catalog, read + 86_400_000);
  assert.deepEqual(places.map((p) => [p.id, p.state]), [["hydor", "ready"], ["server", "ready"]]);
  const server = places.find((p) => p.id === "server")!;
  assert.deepEqual(server.offers!.map((o) => [o.name, o.recommended, !!o.price]), [["DigitalOcean", true, true]]);
  assert.deepEqual(server.notOffered!.map((x) => x.name), ["Hetzner's servers"]);
  assert.ok(withCatalog(launchPlaces(), catalog, read + 400 * 86_400_000).find((p) => p.id === "server")!.offers!.every((o) => !o.price));
  // An app that cannot go to a server is offered none.
  assert.equal(withCatalog(launchPlaces("Not for this app."), catalog, read).find((p) => p.id === "server")!.offers, undefined);
});

// ---- the choice card and the keys card ----------------------------------------------------------------------------------------

const db = openDb(path.join(scratch, "test.db"));
kvSet(db, "sharing:owner", "Dana");
vaultTables(db);
const app: FastifyInstance = Fastify();
app.setErrorHandler((err: Error, _req, reply) => reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message }));
const told: string[] = [];
const sessions = Object.assign(new EventEmitter(), { adapterByRun: () => ({ state: { mode: "default" }, ask: async () => ({ decision: "accept" }) }), summary: () => null, queueSummary: () => {}, deliverOrQueue: async (_k: string, text: string) => void told.push(text) });
const deps = { app, db, sessions, scheduler: null, models: {}, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => "http://test.local" } as unknown as Deps;
connections.routes!(deps);
const feature = createWebapps({ dataDir: path.join(scratch, "data"), port: 4790, origin: "", domain: "", idleMs: 600_000, sandbox: true, ports: [4791, 4791], startTimeoutMs: 20_000, appsRoot: path.join(scratch, "apps"), weekly: false });
feature.routes!(deps);
await app.ready();
feature.start!(deps);
await feature.ready;
const call = async <T = any>(method: string, url: string, body?: unknown) => {
  const r = await app.inject({ method: method as "GET", url, headers: body !== undefined ? { "content-type": "application/json" } : {}, payload: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.statusCode, json: (r.body ? r.json() : null) as T, text: r.body };
};
const ctx = { runId: "run1", key: "key-services", agent: "claude", cwd: scratch, deps } as unknown as RunCtx;
const tools = Object.fromEntries(feature.tools!(ctx).map((t) => [t.name, t])) as Record<string, RunTool>;
const tool = async (n: string, a: Record<string, unknown> = {}) => {
  const r = await tools[n].run(a, ctx);
  return typeof r === "string" ? r : r.text;
};

const folder = path.join(scratch, "shop");
fs.mkdirSync(folder, { recursive: true });
fs.writeFileSync(path.join(folder, "hydor.json"), JSON.stringify({ name: "Shop", start: "node server.js", env: { port: "PORT", data: "DATA_DIR" }, ready: "/health", signIn: "own" }));
const shop = (await call<{ app: WebAppDetail }>("POST", "/api/webapps", { folder })).json.app;
assert.ok(shop, "the app");

await step("the choice card says the catalog's services for a need, the first recommended, and what is left out", async () => {
  const mail = catalog.needs.find((n) => n.id === "mail")!;
  const out = await tool("webapp_services", { app: shop.id, need: "mail" });
  const id = servicesCardOf(out);
  assert.ok(id, out);
  const card = (await call<{ card: ServicesCardView }>("GET", `/api/webapps/services/cards/${id}`)).json.card;
  assert.deepEqual(card.need.services.map((s) => [s.id, s.name, s.why, s.recommended]), mail.services.map((s, i) => [s.id, s.name, s.why, i === 0]));
  assert.deepEqual(card.need.leftOut, mail.leftOut);
  const needs = (await call<{ needs: NeedView[] }>("GET", "/api/webapps/services")).json.needs;
  assert.deepEqual(needs.map((n) => n.id), catalog.needs.map((n) => n.id));
});

await step("choosing asks for the keys on the keys card in the catalog's words, and gives hydor.json lines the contract takes", async () => {
  const resend = catalog.needs.find((n) => n.id === "mail")!.services[0];
  const id = servicesCardOf(await tool("webapp_services", { app: shop.id, need: "mail" }))!;
  const mark = told.length;
  const chosen = await call("POST", `/api/webapps/${shop.id}/services/mail`, { service: resend.id, card: id });
  assert.equal(chosen.status, 200, chosen.text);
  const lines = JSON.parse(told[mark].split("\n").find((l) => l.startsWith("[{"))!);
  assert.ok(readHydorValue({ start: "node s.js", env: { port: "PORT", data: "DATA_DIR" }, ready: "/h", signIn: "own", keys: lines }).ok);
  assert.deepEqual(lines.map((l: { name: string; how: string[]; url: string }) => [l.name, l.how, l.url]), resend.keys.map((k) => [k.name, k.how, k.url]));
  const after = (await call<{ card: ServicesCardView }>("GET", `/api/webapps/services/cards/${id}`)).json.card;
  const keys = (await call<{ card: KeysCardView }>("GET", `/api/connections/requests/${after.keysCard}`)).json.card;
  assert.deepEqual([keys.items[0].title, keys.items[0].url, keys.items[0].how, keys.items[0].fields.map((f) => f.key)], [resend.name, resend.keys[0].url, resend.keys[0].how, resend.keys.map((k) => k.name)]);
});

await feature.stop?.(undefined as never);
await app.close();
fs.rmSync(scratch, { recursive: true, force: true });
console.log(`\n${passed} passed`);
process.exit(0);
