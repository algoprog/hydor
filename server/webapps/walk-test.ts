// A walk as a person who does not code, with Technical details off: from "What do you want to make?" to an app running
// here, a thing tried, reported wrong and fixed, a change asked and undone, then put online. A stand-in agent calls the
// agents' own tools and writes the app (a fixture's files); the person's taps are the calls the simple pages make; every
// screen they meet is drawn with the same views and the same data as the pages, checked against the plain-words list, and
// its words and decisions are counted. No model, no network beyond this computer; a browser looks at the app's pages where
// there is one. Ports 4760 to 4768.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/webapps/walk-test.ts
//   HOME=<scratch> DATA_DIR=<scratch> HYDOR_APPS_DIR=<scratch> node dist/dev/walk-test.js
// With HYDOR_WALK_SERVER=1 it goes on to a stand-in server given Hydor's text as a rented one is (cloud-init reads it as
// the machine first starts; a machine without it is refused), then the whole path to the internet (the launch engine's:
// remote/fixtures/standin, a privileged container with its own Docker; ports 4770 to 4772; needs Docker, ssh and the
// network, about ten minutes). What it makes is named hydor-walk-<id>-… and removed at the end by name.
import { wordsOf } from "../../web/src/features/webapps/test-dom.test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import cookie from "@fastify/cookie";
import Fastify from "fastify";
import { createElement as h, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { stillMissing, type KeysCardView } from "../../shared/keys.ts";
import { bannedIn } from "../../shared/plain-words.ts";
import type { LaunchHostOffer, LaunchJob, LaunchKey, WebAppChecks, WebAppDetail, WebAppGuide, WebAppKeys, WebAppLaunchView, WebAppOnlineHelp, WebAppSteps, WebKinds } from "../../shared/webapps.ts";
import { ChooseBody, ChooseFrame } from "../../web/src/features/webapps/ChooseCard";
import { initialDraft } from "../../web/src/features/webapps/chooseLogic";
import { KeysCard } from "../../web/src/features/connections/KeysCard";
import { MakeView, EXAMPLE_SENTENCES } from "../../web/src/features/webapps/MakeView";
import { DockView } from "../../web/src/features/webapps/simple/DockView";
import { HomeView } from "../../web/src/features/webapps/simple/HomeView";
import { OnlineView, type OnlineActions } from "../../web/src/features/webapps/simple/OnlineView";
import { fingerprintOf } from "./remote/firstboot.ts";
import { cleanServer, dataOf, keyLine, missingOnServer, screenOf, type OnlineSaved, type ScreenId } from "../../web/src/features/webapps/simple/onlinePath";
import { fixAllMessage, homeOf } from "../../web/src/features/webapps/simple/plain";
import { WebSketchCard } from "../../web/src/features/webapps/WebSketch";
import { planStart } from "../../web/src/features/webapps/start";
import { HttpError } from "../auth.ts";
import { APP_ROOT } from "../config.ts";
import { connections } from "../connections/index.ts";
import { vaultTables } from "../connections/vault.ts";
import { kvSet, openDb } from "../db.ts";
import type { Deps, RunCtx, RunTool, ToolOutput } from "../features/types.ts";
import { forgetAllowed } from "../guide/api.ts";
import { initPages } from "../pages/store.ts";
import { createWebapps } from "./index.ts";
import { sketchWeb } from "./sketch.ts";

const temporary = [os.tmpdir(), fs.realpathSync(os.tmpdir())];
for (const v of ["DATA_DIR", "HOME", "HYDOR_APPS_DIR"]) if (!temporary.some((t) => process.env[v]?.startsWith(t + path.sep))) (console.error("Run with HOME, DATA_DIR and HYDOR_APPS_DIR in scratch folders, so nothing touches real data."), process.exit(2));
const SERVER = process.env.HYDOR_WALK_SERVER === "1";
const RUN = randomBytes(3).toString("hex");
const NAMES = { server: `hydor-walk-${RUN}-server`, image: `hydor-walk-${RUN}-standin`, docker: `hydor-walk-${RUN}-docker`, containerd: `hydor-walk-${RUN}-containerd` };
const PORTS = { apps: 4760, hosted: [4761, 4768] as [number, number], ssh: 4770, http: 4771, https: 4772 };
const DOMAIN = "foodbank.test";
const scratch = fs.mkdtempSync(path.join(process.env.DATA_DIR!, "walk-"));
const KEY_VALUE = `walk-key-${randomBytes(18).toString("hex")}`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---- a scratch Hydor ----------------------------------------------------------------------------------------------------------------

const dataDir = path.join(scratch, "hydor-data");
fs.mkdirSync(dataDir, { recursive: true });
const db = openDb(path.join(scratch, "test.db"));
kvSet(db, "sharing:owner", "Dana");
initPages(db);
vaultTables(db);
const server = Fastify();
await server.register(cookie);
server.setErrorHandler((err: Error, _req, r) => r.code(err instanceof HttpError ? err.status : 500).send({ ...(err instanceof HttpError ? err.extra : undefined), error: err.message }));
/** What the person answers on the card an agent puts up. */
let reply: (card: any) => { decision: string; form?: Record<string, string> } = () => ({ decision: "accept" });
const asked: any[] = [];
const sessions = Object.assign(new EventEmitter(), {
  formsChanged: () => {},
  emit: () => true,
  summary: () => null,
  queueSummary: () => {},
  deliverOrQueue: async () => {},
  adapterByRun: () => ({
    state: { mode: "default" },
    ask: async (card: any) => {
      asked.push(card);
      return reply(card);
    },
  }),
});
const deps = { app: server, db, sessions, scheduler: null, models: {}, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => "http://test.local", devices: () => [] } as unknown as Deps;
connections.routes!(deps);
const web = createWebapps({
  dataDir,
  port: PORTS.apps,
  origin: "",
  domain: "",
  idleMs: 600_000,
  sandbox: true,
  ports: PORTS.hosted,
  startTimeoutMs: 30_000,
  appsRoot: path.join(scratch, "WebApps"),
  weekly: false,
  autoCheckMs: 1500,
  resolve: async (name) => (name === DOMAIN ? ["127.0.0.1"] : []),
  shot: async (url) => ({ png: Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"), width: 390, height: 800, url }),
});
web.routes!(deps);
await server.ready();
web.start!(deps);
await web.ready;
forgetAllowed();

let ctx = { runId: "walk", key: "walk-session", agent: "claude", cwd: scratch, deps } as unknown as RunCtx;
const tool = async (name: string, args: Record<string, unknown>): Promise<string> => {
  const t = Object.fromEntries(web.tools!(ctx).map((x) => [x.name, x])) as Record<string, RunTool>;
  const r = await t[name].run(args, ctx);
  const o = typeof r === "string" ? { text: r } : (r as ToolOutput & { text: string });
  assert.notEqual((o as { isError?: boolean }).isError, true, `${name}: ${o.text}`);
  return o.text;
};
const call = async <T = any>(method: string, url: string, body?: unknown): Promise<T> => {
  const r = await server.inject({ method: method as "GET", url, headers: body === undefined ? {} : { "content-type": "application/json" }, payload: body === undefined ? undefined : JSON.stringify(body) });
  const json = r.json() as T & { error?: string };
  assert.ok(r.statusCode < 400, `${method} ${url} answered ${r.statusCode}: ${json?.error ?? r.body.slice(0, 300)}`);
  return json;
};

// ---- the screens a person meets, counted -------------------------------------------------------------------------------------------

interface Seen {
  name: string;
  words: number;
  /** What the person had to decide or type there. */
  decisions: string[];
}
const seen: Seen[] = [];
const problems: string[] = [];
function screen(name: string, el: ReactElement, ...decisions: string[]) {
  // The stand-in is this computer: its address and name are read as the ones a rented server and a bought domain have.
  const words = wordsOf(renderToStaticMarkup(el)).replaceAll(`${DOMAIN}:${PORTS.https}`, "foodbank.example.org").replaceAll(DOMAIN, "foodbank.example.org").replaceAll("127.0.0.1", "203.0.113.7");
  for (const hit of bannedIn(words)) problems.push(`${name}: ${hit.name}: “${hit.found}” in: ${words.split("\n").find((l) => l.includes(hit.found))}`);
  seen.push({ name, words: words.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length, decisions });
  if (process.env.WALK_WORDS) console.log(`\n--- ${name}\n${words}`);
}

// ---- the app's simple page, with the data it reads -----------------------------------------------------------------------------------

let id = "";
const base = () => `/api/webapps/${id}`;
const detail = async () => (await call<{ app: WebAppDetail }>("GET", base())).app;
const steps = async () => (await call<WebAppSteps>("GET", `${base()}/steps?limit=3`)).steps;
const guide = () => call<WebAppGuide>("GET", `${base()}/guide`);
const checks = () => call<WebAppChecks>("GET", `${base()}/checks`);
const view = () => call<WebAppLaunchView>("GET", `${base()}/launch`);

/** Waits for the check Hydor runs by itself after a build or a step. */
async function checkedSince(at: number): Promise<WebAppChecks> {
  for (let i = 0; i < 600; i++) {
    const c = await checks();
    if (c.ran && !c.running && (c.at ?? 0) >= at) return c;
    await sleep(1000);
  }
  throw new Error("the checks did not run by themselves");
}

async function home(name: string, o: { working?: boolean; openId?: string } = {}, ...decisions: string[]) {
  const [app, v, c, g, s, keys] = [await detail(), await view(), await checks(), await guide(), await steps(), await call<WebAppKeys>("GET", `${base()}/keys?env=hydor`)];
  const facts = homeOf({ app, view: v, checks: c, checking: !!c.running, guide: g, steps: s, keys: keys.keys, session: { working: !!o.working, waiting: false }, fixAt: 0, now: Date.now() });
  screen(
    name,
    h(HomeView, {
      state: facts.state,
      strip: facts.strip,
      needs: facts.needs.map((n) => ({ ...n, go: () => {} })),
      actions: { online: facts.online, undo: facts.undo ? { message: facts.undo.message, isUndo: !!facts.undo.back } : null, onChange: () => {}, onOnline: () => {}, onUndo: () => {} },
      tryIt: { items: g.try, onWorks: () => {}, onWrong: () => {}, point: { on: false, picked: "", toggle: () => {} }, openId: o.openId },
      checked: { line: facts.line, fixing: facts.fixing, onFix: () => {}, onAgain: () => {} },
      preview: null,
      onOpen: () => {},
    }),
    ...decisions,
  );
  return { facts, guide: g, checks: c, app };
}

const keysScreen = async (name: string, env: string, ...decisions: string[]) => {
  const { card } = await call<{ card: KeysCardView }>("POST", `${base()}/keys/card`, { env });
  screen(name, h(KeysCard, { id: card.id, initial: card, embedded: true }), ...decisions);
  for (const item of card.items) await call("POST", `/api/connections/requests/${card.id}/items/${item.id}`, { values: { [item.fields[0].key]: KEY_VALUE } });
};

const removed: string[] = [];
let started = false;
const docker = (...args: string[]) => spawnSync("docker", args, { encoding: "utf8", maxBuffer: 1 << 26 });
const onServer = (command: string, input?: string) => spawnSync("docker", ["exec", ...(input === undefined ? [] : ["-i"]), NAMES.server, "bash", "-c", command], { encoding: "utf8", input });
let imagesBefore = new Set<string>();

try {
  // ---- 1. starting ------------------------------------------------------------------------------------------------------------------
  const kinds = (await call<WebKinds>("GET", "/api/webapps/kinds")).kinds;
  const sentence = EXAMPLE_SENTENCES[1];
  screen("Start: What do you want to make?", h(MakeView, { kinds, onStart: () => {} }), "say what to make (or tap a sentence)", "Start");
  const plan = planStart({ kind: null, name: "", line: sentence });
  const made = await call<{ app: WebAppDetail; folder: string }>("POST", "/api/webapps/scratch", { name: plan.make, placeholder: plan.placeholder });
  id = made.app.id;
  ctx = { ...ctx, cwd: made.folder };
  console.log(`The first message: ${plan.prompt}`);

  // ---- 2. the conversation: the brief, the look, the build ------------------------------------------------------------------------------
  await tool("webapp_steps", { action: "doing", doing: "Working out what you want", name: "Food bank stock" });
  assert.equal((await detail()).name, "Food bank stock", "the agent's suggestion is the app's name");
  const sketch = await sketchWeb({ name: "Food bank stock", description: "Keeps what is on the shelves.", who: "Your volunteers", does: ["Add what comes in", "See what is running low"], keeps: [{ title: "Stock", line: "name, kind, how many", who: "Everyone who signs in" }], questions: [{ ask: "Should people be told when something runs low?", choices: ["Yes", "No"] }] });
  screen("Conversation: the sketch card", h(WebSketchCard, { sessionKey: "walk", answered: false, out: JSON.parse((sketch as { text: string }).text) }), "answer one question (or You decide)", "Build it");
  fs.mkdirSync(path.join(made.folder, "docs"), { recursive: true });
  fs.writeFileSync(path.join(made.folder, "docs", "brief.md"), "# Food bank stock\n\nKeeps what is on the shelves.\n");
  await tool("webapp_steps", { action: "save", message: "Wrote down what it is for", stage: "brief" });

  fs.mkdirSync(path.join(made.folder, "design"));
  for (const look of ["calm", "bright"]) fs.writeFileSync(path.join(made.folder, "design", `${look}.html`), `<!doctype html><title>${look}</title><h1>Stock</h1>`);
  reply = (c) => {
    if (!c.choose) return { decision: "accept" };
    screen("Conversation: pick a look", h(ChooseFrame, { c: c.choose, live: true, children: h(ChooseBody, { c: c.choose, d: initialDraft(c.choose), set: () => {}, locked: false }) }), "pick a look (or You decide)", "Use this design");
    return { decision: "accept", form: { answer: JSON.stringify({ shape: "designs", pick: "calm" }) } };
  };
  await tool("webapp_choose", { shape: "designs", stage: "design", title: "How should it look?", designs: [{ id: "calm", name: "Calm", line: "Quiet colours, one list.", page: "design/calm.html" }, { id: "bright", name: "Bright", line: "Big cards, strong colours.", page: "design/bright.html" }] });
  reply = () => ({ decision: "accept" });

  await tool("webapp_steps", { action: "doing", doing: "Making the list of what is on the shelves" });
  fs.cpSync(path.join(APP_ROOT, "server", "webapps", "fixtures", "apps", "food-bank"), made.folder, { recursive: true });
  const contractFile = path.join(made.folder, "hydor.json");
  const contract = JSON.parse(fs.readFileSync(contractFile, "utf8"));
  contract.keys = [{ name: "NOTICE_API_KEY", from: "you", why: "A password for the notices it sends.", how: ["Choose one and type it"] }];
  contract.smoke = { method: "GET", path: "/sign-in" };
  fs.writeFileSync(contractFile, `${JSON.stringify(contract, null, 2)}\n`);
  fs.writeFileSync(path.join(made.folder, "docs", "try.md"), "- Make an account and sign in\n- Add something to the shelves and find it in the list\n- Take one away and see the number go down\n");
  {
    const app = await detail();
    screen("Conversation: the strip while it is built", h(DockView, { strip: homeOf({ app: { ...app, stage: "build" }, view: null, checks: null, checking: false, guide: await guide(), steps: await steps(), keys: [], session: { working: true, waiting: false }, fixAt: 0, now: Date.now() }).strip, line: null, fixing: false, onFix: () => {}, tried: null, onApp: () => {} }));
  }
  let at = Date.now();
  await tool("webapp_steps", { action: "save", message: "The shelves and the list work", stage: "build" });
  await tool("webapp_run", { action: "build" });
  await tool("webapp_run", { action: "start" });
  let c = await checkedSince(at);
  console.log(`Checked by itself after the build: ${c.summary}`);

  // ---- 3. try it: one thing works, one is wrong, it is fixed ------------------------------------------------------------------------------
  let page = await home("The app's page: built, try it", {}, "try the first thing: Works");
  assert.equal(page.guide.try.length, 3);
  await call("PUT", `${base()}/guide/try`, { id: page.guide.try[0].id, result: "works" });
  page = await home("The app's page: Something is wrong", { openId: page.guide.try[1].id }, "Something is wrong", "say what happened (and point at the part, if they like)", "Send it");
  await call("PUT", `${base()}/guide/try`, { id: page.guide.try[1].id, result: "wrong", note: "The list did not show it" });
  if (page.facts.line.state === "fix") {
    console.log(`Checks to fix: ${page.facts.line.problems.join(" | ")}`);
    console.log(`Fix them would send:\n${fixAllMessage(page.checks.lines)}`);
  }
  await sleep(1100);
  at = Date.now();
  const serverFile = path.join(made.folder, "server.js");
  const original = fs.readFileSync(serverFile, "utf8");
  fs.writeFileSync(serverFile, `// The list shows what was just added.\n${original}`);
  await tool("webapp_steps", { action: "save", message: "The list shows what you just added", stage: "check" });
  c = await checkedSince(at);
  page = await home("The app's page: fixed, try it again", {}, "try it again: Works");
  assert.ok(page.guide.try[1].again, "a thing reported wrong is to be tried again after the fix");
  for (const t of page.guide.try.slice(1)) await call("PUT", `${base()}/guide/try`, { id: t.id, result: "works" });

  // ---- 4. a change asked, then undone ------------------------------------------------------------------------------------------------------
  await sleep(1100);
  const css = fs.readdirSync(path.join(made.folder, "public")).find((f) => f.endsWith(".css"))!;
  const cssFile = path.join(made.folder, "public", css);
  const before = fs.readFileSync(cssFile, "utf8");
  await home("The app's page: all works, ask for a change", {}, "type what should be different", "Change it");
  at = Date.now();
  fs.writeFileSync(cssFile, `${before}\ntd { font-weight: 700; }\n`);
  await tool("webapp_steps", { action: "save", message: "The numbers are shown in bold", stage: "check" });
  await checkedSince(at);
  page = await home("The app's page: changed", {}, "Undo the last change", "confirm: Undo it");
  assert.equal(page.facts.undo?.message, "The numbers are shown in bold");
  at = Date.now();
  await call("POST", `${base()}/steps/${page.facts.undo!.sha}/back`);
  assert.equal(fs.readFileSync(cssFile, "utf8"), before, "undone");
  for (let i = 0; i < 120 && (await detail()).build.state === "building"; i++) await sleep(500);
  await checkedSince(at);
  await home("The app's page: undone", {}, "Put it online");

  // ---- 5. put it online: only here ------------------------------------------------------------------------------------------------------------
  const help = await call<WebAppOnlineHelp>("GET", "/api/webapps/online-help");
  let saved: OnlineSaved = {};
  let offer: LaunchHostOffer | null = null;
  let looked: { what: string; ok: boolean | null }[] = [];
  let points: boolean | null = null;
  let line = "";
  let block = "";
  const state = async () => {
    const v = await view();
    const app = await detail();
    let missing: string[] = [];
    if (saved.where === "here") missing = (await call<WebAppKeys>("GET", `${base()}/keys?env=hydor`)).keys.filter(stillMissing).map(keyLine);
    else if (saved.host) missing = missingOnServer((await call<{ keys: LaunchKey[] }>("GET", `${base()}/launch/keys?env=production&host=${saved.host}`)).keys, (await call<WebAppKeys>("GET", `${base()}/keys?env=production`)).keys);
    return { v, app, missing, at: screenOf({ app, view: v, missingKeys: missing.length }, saved) };
  };
  const online = async (expect: ScreenId, title: string, ...decisions: string[]) => {
    const s = await state();
    assert.equal(s.at, expect, `the path is at ${s.at}, not ${expect}`);
    screen(`Online: ${title}`, h(OnlineView, { screen: s.at, d: dataOf({ app: s.app, view: s.v, help, saved, missing: s.missing, offer, looked, points, line, block }), act: new Proxy({}, { get: () => () => {} }) as OnlineActions }), ...decisions);
    return s;
  };
  const follow = async (job: LaunchJob, title: string) => {
    let shown = false;
    for (let i = 0; i < 2400; i++) {
      const j = (await call<{ job: LaunchJob | null }>("GET", `${base()}/launch/job`)).job;
      assert.ok(j && j.id === job.id);
      if (!shown && j.state === "running" && j.steps.some((x) => x.state === "passed")) {
        await online("going", `${title}: four steps`);
        shown = true;
      }
      if (j.state === "asking") assert.fail(`the checks stop the launch: ${JSON.stringify(j.ask)}`);
      if (j.state === "failed") assert.fail(`the launch failed: ${j.summary} ${j.problems?.join(" ")}`);
      if (j.state === "done") return j;
      await sleep(500);
    }
    throw new Error("the launch did not end");
  };

  await online("choose", "who should use it", "Only here");
  saved = { where: "here" };
  await online("keys", "a key is missing", "Add it");
  await keysScreen("Online: the keys card", "hydor", "paste the key", "Save");
  await online("here", "only here", "Put it online");
  let job = (await call<{ job: LaunchJob }>("POST", `${base()}/launch/hydor`, {})).job;
  saved = { where: "here", job: job.id };
  await follow(job, "only here");
  saved = { job: job.id };
  await online("done", "running here");
  const first = await detail();
  assert.ok(first.mode.launched, "an app running here");
  console.log("From the box to an app running here: done.");

  // ---- 6. on the internet, to a stand-in server -----------------------------------------------------------------------------------------
  if (!SERVER) console.log("The path to a server is skipped: set HYDOR_WALK_SERVER=1 (Docker and the network).");
  else {
    imagesBefore = new Set(docker("images", "--format", "{{.Repository}}:{{.Tag}}").stdout.split("\n"));
    const built = docker("build", "-q", "-t", NAMES.image, path.join(APP_ROOT, "server/webapps/remote/fixtures/standin"));
    assert.equal(built.status, 0, built.stderr.slice(-800));
    for (const v of [NAMES.docker, NAMES.containerd]) docker("volume", "create", v);
    const ran = docker("run", "-d", "--name", NAMES.server, "--hostname", "standin", "--privileged", "--cgroupns=private", "--cpus=8", "--tmpfs", "/run", "--tmpfs", "/run/lock", "-v", `${NAMES.docker}:/var/lib/docker`, "-v", `${NAMES.containerd}:/var/lib/containerd`, "-p", `127.0.0.1:${PORTS.ssh}:22`, "-p", `127.0.0.1:${PORTS.http}:80`, "-p", `127.0.0.1:${PORTS.https}:443`, NAMES.image);
    assert.equal(ran.status, 0, ran.stderr.slice(-800));
    started = true;
    for (let i = 0; i < 90 && onServer("systemctl is-active ssh").stdout.trim() !== "active"; i++) await sleep(1000);

    // The stand-in gets cloud-init, as a rented server's image has it; the text is given to it as the provider would.
    const got = onServer("export DEBIAN_FRONTEND=noninteractive; apt-get update -qq && apt-get install -y -qq cloud-init >/dev/null");
    assert.equal(got.status, 0, got.stderr.slice(-800));

    saved = { where: "internet" };
    await online("provider", "where to rent", "choose a provider");
    saved = { ...saved, provider: "digitalocean", text: true };
    block = (await call<{ text: string }>("GET", `${base()}/server-text`)).text;
    await online("create", "create a server with the text", "copy the text", "(on the provider's page: three clicks, the text pasted)", "I have created it");
    saved = { ...saved, created: true };
    await online("address", "the server's address", "paste the address", "Connect");
    const address = cleanServer(`127.0.0.1:${PORTS.ssh}`, "root");
    const connect = () => call<{ state: string; host?: string; looked?: { what: string; ok: boolean | null }[] }>("POST", `${base()}/server-connect`, { address });
    // A machine that was not made with the text, over real SSH: refused, and nothing recorded.
    assert.deepEqual(await connect(), { state: "other" });
    assert.deepEqual((await view()).hosts, []);
    screen("Online: not the server made with the text", h(OnlineView, { screen: "mismatch", d: dataOf({ app: await detail(), view: await view(), help, saved: { ...saved, mismatch: true }, missing: [], offer, looked, points, line, block }), act: new Proxy({}, { get: () => () => {} }) as OnlineActions }));

    const given = onServer("mkdir -p /var/lib/cloud/seed/nocloud && cat > /var/lib/cloud/seed/nocloud/user-data && printf 'instance-id: standin-1\\nlocal-hostname: standin\\n' > /var/lib/cloud/seed/nocloud/meta-data && echo 'datasource_list: [NoCloud]' > /etc/cloud/cloud.cfg.d/99-standin.cfg && cloud-init schema --config-file /var/lib/cloud/seed/nocloud/user-data", block);
    assert.equal(given.status, 0, `${given.stdout}${given.stderr}`.slice(-1200));
    console.log(`cloud-init reads the text: ${given.stdout.trim().split("\n").pop()}`);
    const first = onServer("cloud-init clean >/dev/null 2>&1; cloud-init init --local && cloud-init init && cloud-init modules --mode=config && systemctl restart ssh && (nohup cloud-init modules --mode=final > /var/log/standin-final.log 2>&1 &)");
    assert.equal(first.status, 0, `${first.stdout}${first.stderr}`.slice(-1500));
    const began = Date.now();
    // The last stage may take a moment to write its first word.
    await sleep(3000);
    let r = await connect();
    console.log(`First answer from the new server: ${r.state}`);
    saved = { ...saved, starting: address };
    await online("starting", "waiting for it to set itself up");
    delete saved.starting;
    while (r.state === "starting" && Date.now() - began < 15 * 60_000) {
      await sleep(5000);
      r = await connect();
    }
    // The text itself installs what a launch needs: nothing is prepared afterwards.
    assert.equal(r.state, "ready", `${JSON.stringify(r)}\n${onServer("tail -n 30 /var/log/hydor-setup.log; cloud-init status --long").stdout}`);
    console.log(`Ready ${Math.round((Date.now() - began) / 1000)} s after its first start, set up by the text alone.`);
    const host = (await view()).hosts[0]!;
    assert.equal(host.name, r.host);
    assert.ok(host.ssh.startsWith("hydor@") && host.state === "recorded" && host.checked?.ok);
    // The identity in the text was only for the first connection: the machine made its own, and only that one is insisted on.
    const textKey = /ed25519_public: (.+)/.exec(block)![1]!;
    const machine = () => onServer("ssh-keygen -l -E sha256 -f /etc/ssh/ssh_host_ed25519_key.pub").stdout;
    const now = host.fingerprint!;
    assert.notEqual(now, fingerprintOf(textKey), "the record is not the text's identity");
    assert.ok(machine().includes(now), "the machine shows the identity it made");
    const left = fs.readdirSync(path.join(dataDir, "server-hosts", "pending"));
    assert.deepEqual(left.filter((f) => /-(identity|first|moved)(\.pub)?$/.test(f)), [], "nothing of the text is kept");
    // As a restart would, cloud-init reads the same text again: the identity stays the machine's own.
    const again = onServer("cloud-init init --local && cloud-init init && cloud-init modules --mode=config && cloud-init modules --mode=final >/dev/null 2>&1; systemctl restart ssh");
    assert.equal(again.status, 0, again.stderr.slice(-800));
    assert.ok(machine().includes(now), "a restart does not bring the text's identity back");
    // Someone who has the text poses as the server with the identity it holds: Hydor refuses.
    const textPrivate = /ed25519_private: \|\n([\s\S]*?)\n  ed25519_public/.exec(block)![1]!.replace(/^    /gm, "");
    const posed = onServer("cd /etc/ssh && cp -p ssh_host_ed25519_key /root/kept && cp -p ssh_host_ed25519_key.pub /root/kept.pub && cat > ssh_host_ed25519_key && ssh-keygen -y -f ssh_host_ed25519_key > ssh_host_ed25519_key.pub && systemctl restart ssh", `${textPrivate}\n`);
    assert.equal(posed.status, 0, posed.stderr.slice(-800));
    assert.ok(machine().includes(fingerprintOf(textKey)), "it now shows the text's identity");
    await sleep(2000);
    const refused = await server.inject({ method: "POST", url: `/api/webapps/hosts/${host.name}/check`, headers: { "content-type": "application/json" }, payload: "{}" });
    assert.ok(refused.statusCode >= 400, `refused, not ${refused.body.slice(0, 200)}`);
    assert.match(refused.body, /not the one you accepted/);
    console.log("A server showing the text's identity after the first connection is refused.");
    assert.equal(onServer("cp -p /root/kept /etc/ssh/ssh_host_ed25519_key && cp -p /root/kept.pub /etc/ssh/ssh_host_ed25519_key.pub && rm /root/kept /root/kept.pub && systemctl restart ssh").status, 0);
    await sleep(2000);
    assert.equal((await connect()).state, "ready", "and its own is taken again");
    saved = { ...saved, host: host.name };
    looked = r.looked!;
    await online("web", "its web address", "I have one / Get one / a test address");
    saved = { ...saved, web: "own" };
    await online("domain", "type it", "type the address", "Continue");
    saved = { ...saved, domain: DOMAIN };
    points = (await call<{ points: boolean }>("GET", `/api/webapps/dns?name=${DOMAIN}&host=${host.name}`)).points;
    assert.equal(points, true);
    await online("record", "add one record, and wait", "(on the registrar's page: add the record)", "Continue");
    // The stand-in answers https on a port of this computer's own, which a real server does not: the walk adds it here.
    saved = { ...saved, address: `https://${DOMAIN}:${PORTS.https}` };
    await online("keys", "a key for the server", "Add it");
    await keysScreen("Online: the keys card for the server", "production", "paste the key", "Save");
    await online("ready", "ready", "Put it online");
    job = (await call<{ job: LaunchJob }>("POST", `${base()}/launch/server`, { host: host.name, env: "production", address: saved.address })).job;
    saved = { ...saved, job: job.id };
    await follow(job, "on the internet");
    saved = { job: job.id };
    await online("done", "it is online");
    const status = await new Promise<number>((resolve, reject) => {
      const req = https.request({ host: "127.0.0.1", port: PORTS.https, path: "/sign-in", servername: DOMAIN, rejectUnauthorized: false, headers: { host: `${DOMAIN}:${PORTS.https}` } }, (res) => (res.resume(), resolve(res.statusCode ?? 0)));
      req.on("error", reject);
      req.end();
    });
    assert.equal(status, 200, "it answers on the server over https");
    await home("The app's page: online", {});
  }
} finally {
  await web.stop?.(undefined as never);
  await server.close();
  db.close();
  if (SERVER) {
    if (started && docker("rm", "-f", NAMES.server).status === 0) removed.push(`container ${NAMES.server}`);
    for (const v of [NAMES.docker, NAMES.containerd]) if (docker("volume", "rm", v).status === 0) removed.push(`volume ${v}`);
    if (docker("image", "rm", NAMES.image).status === 0) removed.push(`image ${NAMES.image}`);
    if (started && !imagesBefore.has("ubuntu:24.04") && docker("image", "rm", "ubuntu:24.04").status === 0) removed.push("image ubuntu:24.04 (pulled for the stand-in)");
    console.log(`removed: ${removed.join(", ") || "nothing"}`);
  }
  fs.rmSync(scratch, { recursive: true, force: true });
}

console.log("\nScreen | words | what the person decides or does there");
for (const s of seen) console.log(`${s.name} | ${s.words} | ${s.decisions.join("; ") || "(only to read)"}`);
const decisions = seen.reduce((n, s) => n + s.decisions.length, 0);
console.log(`\n${seen.length} screens, ${decisions} things to decide or do, ${seen.reduce((n, s) => n + s.words, 0)} words in all.`);
assert.deepEqual(problems, [], `\n${problems.join("\n")}`);
console.log("ok - every screen of the walk is in plain words");
process.exit(0);
