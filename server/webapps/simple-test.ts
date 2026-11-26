// What the pages of a web app ask for beside the engines (simple.ts): the things to try and what was found of each,
// what the agent says it is making and a name it suggests once, the key made before a server's address is known, whether a
// web address leads there, a step's changes, the code as an archive, hydor.json read and written, what each place is
// started with (names only), "You decide" on a choice, and that an agent is told how to speak by the person's switch.
// No network, no model. Port 4778.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/webapps/simple-test.ts
//   HOME=<scratch folder> DATA_DIR=<scratch folder> HYDOR_APPS_DIR=<scratch folder> node dist/dev/simple-test.js
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import type { WebAppDetail, WebAppGuide, WebAppOnlineHelp, WebAppStartValues, WebAppSteps } from "../../shared/webapps.ts";
import { HttpError } from "../auth.ts";
import { kvSet, openDb } from "../db.ts";
import type { Deps, RunCtx, RunTool, ToolOutput } from "../features/types.ts";
import { forgetAllowed, ruleFor } from "../guide/api.ts";
import { initPages } from "../pages/store.ts";
import { keeper, readAnswer, summarize } from "./choose.ts";
import { createWebapps } from "./index.ts";
import { addHost } from "./remote/hosts.ts";

const temp = [os.tmpdir(), fs.realpathSync(os.tmpdir())];
for (const v of ["DATA_DIR", "HOME"]) if (!temp.some((t) => process.env[v]?.startsWith(t + path.sep))) (console.error("Run with HOME and DATA_DIR in scratch folders under the temporary folder, so nothing touches real data."), process.exit(2));
const scratch = fs.mkdtempSync(path.join(process.env.DATA_DIR!, "simple-"));
let passed = 0;
const step = async (name: string, fn: () => Promise<void> | void) => {
  await fn();
  passed++;
  console.log(`ok - ${name}`);
};

const dataDir = path.join(scratch, "hydor-data");
fs.mkdirSync(dataDir, { recursive: true });
const db = openDb(path.join(scratch, "test.db"));
kvSet(db, "sharing:owner", "Dana");
initPages(db);
const server = Fastify();
server.setErrorHandler((err: Error, _req, r) => r.code(err instanceof HttpError ? err.status : 500).send({ error: err.message }));
let technical = false;
const sessions = { formsChanged: () => {}, emit: () => {}, deliverOrQueue: async () => {}, adapterByRun: () => ({ state: { mode: "default" }, ask: async () => ({ decision: "accept" }) }) };
const deps = { app: server, db, sessions, scheduler: null, models: null, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => "http://test.local", devices: () => [{ id: "p-1", label: "x", settings: { technicalDetails: technical }, at: 1, showing: true }] } as unknown as Deps;
const web = createWebapps({ dataDir, port: 4778, origin: "", domain: "", idleMs: 600_000, sandbox: true, appsRoot: path.join(scratch, "WebApps"), weekly: false, resolve: async (name) => ({ "shelves.example.org": ["203.0.113.7"], "elsewhere.example.org": ["198.51.100.9"] })[name] ?? [] });
web.routes!(deps);
await server.ready();
web.start!(deps);
await web.ready;
forgetAllowed();

const inject = async (method: string, url: string, body?: unknown) => {
  const r = await server.inject({ method: method as "GET", url, headers: body === undefined ? {} : { "content-type": "application/json" }, payload: body === undefined ? undefined : JSON.stringify(body) });
  let json: any = null;
  try {
    json = r.json();
  } catch {}
  return { status: r.statusCode, json, body: r.rawPayload, headers: r.headers };
};
const ok = async <T = any>(method: string, url: string, body?: unknown): Promise<T> => {
  const r = await inject(method, url, body);
  assert.ok(r.status < 400, `${method} ${url}: ${r.status} ${r.json?.error ?? ""}`);
  return r.json as T;
};
let ctx = { runId: "r", key: "s", agent: "claude", cwd: scratch, deps } as unknown as RunCtx;
const tool = async (name: string, args: Record<string, unknown>) => {
  const t = Object.fromEntries(web.tools!(ctx).map((x) => [x.name, x])) as Record<string, RunTool>;
  const r = await t[name].run(args, ctx);
  return (typeof r === "string" ? r : (r as ToolOutput & { text: string }).text) as string;
};

const made = await ok<{ app: WebAppDetail; folder: string }>("POST", "/api/webapps/scratch", { name: "My app", placeholder: true });
const id = made.app.id;
const base = `/api/webapps/${id}`;
ctx = { ...ctx, cwd: made.folder };

await step("a name the agent suggests is taken only while the app has none of the person's, once; what it is making is said", async () => {
  await tool("webapp_steps", { action: "doing", doing: "Making the list of plants", name: "Plant list" });
  const g = await ok<WebAppGuide>("GET", `${base}/guide`);
  assert.deepEqual([g.doing?.text, g.placeholderName], ["Making the list of plants", false]);
  assert.equal((await ok<{ app: WebAppDetail }>("GET", base)).app.name, "Plant list");
  assert.equal((await ok<{ app: WebAppDetail }>("GET", base)).app.slug, "plant-list", "its address follows the name while nobody uses it");
  await ok("PUT", `${base}/guide`, { name: "Something else" });
  assert.equal((await ok<{ app: WebAppDetail }>("GET", base)).app.name, "Plant list");
  // A person naming an app made without a name moves its address too, once; later renames keep it.
  const other = (await ok<{ app: WebAppDetail }>("POST", "/api/webapps/scratch", { name: "My app", placeholder: true })).app;
  assert.equal((await ok<{ app: WebAppDetail }>("PUT", `/api/webapps/${other.id}`, { name: "Shelf stock" })).app.slug, "shelf-stock");
  assert.equal((await ok<{ app: WebAppDetail }>("PUT", `/api/webapps/${other.id}`, { name: "Pantry" })).app.slug, "shelf-stock");
});

await step("the things to try are the list in docs/try.md; what was found is kept, and a saved step asks for another try", async () => {
  fs.mkdirSync(path.join(made.folder, "docs"), { recursive: true });
  fs.writeFileSync(path.join(made.folder, "docs", "try.md"), "# Try\n\n- Add a **plant**\n- Water it\n1. See the list\nNot a line of the list.\n");
  const g = await ok<WebAppGuide>("GET", `${base}/guide`);
  assert.deepEqual(g.try.map((t) => t.text), ["Add a plant", "Water it", "See the list"]);
  const after = await ok<WebAppGuide>("PUT", `${base}/guide/try`, { id: g.try[1].id, result: "wrong", note: "No date" });
  assert.deepEqual([after.try[1].result, after.try[1].note, !!after.try[1].again], ["wrong", "No date", false]);
  assert.equal((await inject("PUT", `${base}/guide/try`, { id: "nope", result: "works" })).status, 404);
  fs.writeFileSync(path.join(made.folder, "server.mjs"), "// 1\n");
  await tool("webapp_steps", { action: "save", message: "Watering keeps the date" });
  assert.equal((await ok<WebAppGuide>("GET", `${base}/guide`)).try[1].again, true);
  // A link out of the folder is not read.
  fs.rmSync(path.join(made.folder, "docs", "try.md"));
  fs.symlinkSync("/etc/hostname", path.join(made.folder, "docs", "try.md"));
  assert.deepEqual((await ok<WebAppGuide>("GET", `${base}/guide`)).try, []);
  fs.rmSync(path.join(made.folder, "docs", "try.md"));
});

await step("the agent is told how to speak by the person's switch", async () => {
  assert.match(await tool("webapp_get", {}), /Technical details off.*“saved step”/s);
  technical = true;
  assert.match(await tool("webapp_get", {}), /Technical details on/);
  technical = false;
});

await step("the key made before a server's address is known is the one the server is given, and stays for another try", async () => {
  const a = await ok<{ line: string }>("GET", `${base}/server-key`);
  assert.match(a.line, /^ssh-ed25519 \S+ hydor-server$/);
  assert.equal((await ok<{ line: string }>("GET", `${base}/server-key`)).line, a.line);
  const hosts = path.join(dataDir, "server-hosts");
  const h = await addHost(hosts, "my-server", "root@203.0.113.7", { pending: id });
  assert.equal(h.publicKey, a.line);
  assert.equal(fs.statSync(path.join(hosts, "keys", "my-server")).mode & 0o777, 0o600);
  assert.equal((await ok<{ line: string }>("GET", `${base}/server-key`)).line, a.line);
});

await step("the text for a new server is the person's to copy: agents are refused it and the connecting", async () => {
  const text = (await ok<{ text: string }>("GET", `${base}/server-text`)).text;
  assert.ok(text.startsWith("#cloud-config\n") && text.includes("ed25519_private"));
  assert.equal(ruleFor("GET", `${base}/server-text`).level, "refuse");
  assert.equal(ruleFor("POST", `${base}/server-connect`).level, "refuse");
  assert.equal((await inject("POST", `${base}/server-connect`, { address: "" })).status, 400);
  assert.equal((await inject("POST", `${base}/server-connect`, { address: "not an address" })).status, 400);
});

await step("whether a web address leads to the server yet", async () => {
  const look = (name: string) => ok("GET", `/api/webapps/dns?name=${name}&host=my-server`);
  assert.deepEqual((await look("shelves.example.org")).points, true);
  assert.deepEqual((await look("elsewhere.example.org")).points, false);
  assert.deepEqual((await look("nothing.example.org")).points, false);
  assert.equal((await inject("GET", "/api/webapps/dns?name=203.0.113.7&host=my-server")).status, 400);
});

await step("the clicks to make a server and add a record come from the catalog", async () => {
  const help = await ok<WebAppOnlineHelp>("GET", "/api/webapps/online-help");
  assert.equal(help.providers[0].server?.clicks.length, 3);
  assert.ok(help.registrars.every((r) => r.record));
});

await step("hydor.json is written only when Hydor can read it, a step shows its changes, the code downloads, and the values are names", async () => {
  assert.equal((await ok("GET", `${base}/contract`)).text, "");
  const bad = await inject("PUT", `${base}/contract`, { text: "{}" });
  assert.equal(bad.status, 400);
  const contract = { name: "Plant list", start: "node server.mjs", env: { port: "PORT", data: "DATA_DIR", secret: "APP_SECRET" }, ready: "/health", signIn: "hydor", keys: [{ name: "PLANT_API_KEY", from: "you", why: "x", how: ["Make one"] }] };
  await ok("PUT", `${base}/contract`, { text: JSON.stringify(contract) });
  const values = await ok<WebAppStartValues>("GET", `${base}/values`);
  assert.deepEqual(values.values.map((v) => [v.name, v.what]), [["PORT", "port"], ["HOST", "host"], ["DATA_DIR", "data"], ["APP_SECRET", "secret"], ["PLANT_API_KEY", "key"]]);
  assert.match(values.check!, /hydor-check\.mjs/);
  fs.writeFileSync(path.join(made.folder, ".env"), "SECRET=1\n");
  await tool("webapp_steps", { action: "save", message: "Added its contract" });
  const [head] = (await ok<WebAppSteps>("GET", `${base}/steps?limit=1`)).steps;
  assert.match((await ok<{ diff: string }>("GET", `${base}/steps/${head.sha}/diff`)).diff, /hydor\.json/);
  const code = await inject("GET", `${base}/code`);
  assert.equal(code.status, 200);
  const file = path.join(scratch, "code.tar.gz");
  fs.writeFileSync(file, code.body);
  const listed = execFileSync("tar", ["-tzf", file], { encoding: "utf8" });
  assert.match(listed, /server\.mjs/);
  assert.doesNotMatch(listed, /\.env|\.git\//);
});

await step("You decide on a choice is an answer, kept as a decision left to the agent", () => {
  const offered = { id: "c000000000000", app: id, shape: "one" as const, stage: "brief" as const, title: "Who sees it?", options: [{ id: "a", title: "You" }, { id: "b", title: "All" }] };
  const read = readAnswer(offered, JSON.stringify({ shape: "one", youDecide: true }));
  assert.ok(read.ok);
  assert.equal(summarize(offered, read.answer), "Who sees it: left to the agent to decide.");
  const k = keeper(path.join(dataDir, "webapps"), id);
  k.offer(offered);
  assert.equal(k.answer(offered, read.answer, summarize(offered, read.answer)).answer.youDecide, true);
});

await web.stop!(null as never);
await server.close();
db.close();
fs.rmSync(scratch, { recursive: true, force: true });
console.log(`\n${passed} checks passed`);
process.exit(0);
