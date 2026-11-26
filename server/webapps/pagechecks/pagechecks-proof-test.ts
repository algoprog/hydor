// The page checks on real apps that agents built from scratch with no such check, from ../fixtures/apps/ (each with a judge.json saying how
// it starts, its port and data variables and how to make an account). Each is copied into a scratch folder, started there on empty data
// (what its package-lock names is installed first, from the network), given an account and a few rows where it
// has accounts, and checked signed out and signed in. What is found is printed line by line: findings are the point, so they are not
// failures of this test; what it holds is that every line is judged or says why not, and that no browser is left.
// Ports 4710 to 4713. Needs a Chromium.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/webapps/pagechecks/pagechecks-proof-test.ts
//   HOME=<scratch> DATA_DIR=<scratch> [PLAYWRIGHT_BROWSERS_PATH=…] node dist/dev/pagechecks-proof-test.js
import assert from "node:assert/strict";
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { APP_ROOT } from "../../config.ts";
import { findBrowser } from "./browser.ts";
import { checkPages, LINE_IDS, summarize } from "./index.ts";
import { ask } from "./probes.ts";

const NAMES = ["food-bank", "crews", "dough-sums", "market-takings"];
const from = path.join(APP_ROOT, "server", "webapps", "fixtures", "apps");
if (!findBrowser()) {
  console.log("skipped: no browser here");
  process.exit(0);
}
const only = process.argv.slice(2);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "pagechecks-proof-"));
let port = 4710;

interface Judge {
  start: { command: string; port: string; data: string; env?: Record<string, string>; judgeEnv?: Record<string, string>; ready?: string };
  accounts?: { signUp: { path: string; body: Record<string, string> } };
  home?: string;
  teams?: { create: { path: string; body: Record<string, string>; id: string } };
  things?: Record<string, { add: { path: string }; idKey: string; teamKey?: string; fields: Record<string, string> }>;
}

const fill = (body: Record<string, string>, words: Record<string, string>) => Object.fromEntries(Object.entries(body).map(([k, v]) => [k, v.replace(/\{(\w+)\}/g, (_, w) => words[w] ?? "")]));

async function post(origin: string, at: string, body: unknown, cookie = "") {
  const r = await ask(new URL(at, origin), { method: "POST", headers: { "content-type": "application/json", origin, "sec-fetch-site": "same-origin", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
  let json: any = null;
  try {
    json = JSON.parse(r.body.toString("utf8"));
  } catch {}
  return { status: r.status, json, setCookies: ([] as string[]).concat(r.headers["set-cookie"] ?? []) };
}

/** An account, a team where the app has them, and one of each thing it keeps, so signed-in pages have something on them. */
async function prepare(j: Judge, origin: string) {
  if (!j.accounts) return null;
  const words = { name: "Check Owner", email: "check.owner@example.test", password: `check-horse-staple-${crypto.randomBytes(6).toString("hex")}` };
  const up = await post(origin, j.accounts.signUp.path, fill(j.accounts.signUp.body, words));
  assert.ok(up.status < 300, `the account could not be made: ${up.status} ${JSON.stringify(up.json)}`);
  const cookie = up.setCookies.map((c) => c.split(";")[0]).join("; ");
  assert.ok(cookie, "signing up set no cookie");
  const made: string[] = [];
  let team: unknown;
  if (j.teams) {
    const t = await post(origin, j.teams.create.path, fill(j.teams.create.body, { name: "North crew" }), cookie);
    team = t.json?.[j.teams.create.id] ?? t.json?.row?.[j.teams.create.id];
    made.push(`a team: ${t.status}`);
  }
  const ids: Record<string, unknown> = {};
  for (const [name, thing] of Object.entries(j.things ?? {})) {
    const body: Record<string, unknown> = {};
    for (const [what, key] of Object.entries(thing.fields)) {
      if (/photo|done|put away/.test(what)) continue;
      body[key] = /date|day/.test(what) ? "2027-01-15" : /how many|kilos/.test(what) ? 3 : /which stock/.test(what) ? ids.stock : /what sort/.test(what) ? "Tins" : `A ${name} entry with a rather long name for one line of a phone`;
    }
    if (thing.teamKey) body[thing.teamKey] = team;
    let r = await post(origin, thing.add.path, body, cookie);
    // a choice the app names in its refusal ("must be one of: tinned, fresh…")
    const choice = /one of: ([^,.]+)/.exec(String(r.json?.error ?? ""))?.[1];
    const kind = Object.entries(thing.fields).find(([what]) => /what sort/.test(what))?.[1];
    if (r.status === 400 && choice && kind) r = await post(origin, thing.add.path, { ...body, [kind]: choice }, cookie);
    ids[name] = r.json?.[thing.idKey] ?? r.json?.row?.[thing.idKey];
    made.push(`${name}: ${r.status}${r.status >= 300 ? ` ${JSON.stringify(r.json)?.slice(0, 120)}` : ""}`);
  }
  return { cookie, setCookies: up.setCookies, made };
}

const report: Record<string, unknown> = {};
try {
  for (const name of NAMES) {
    const source = path.join(from, name);
    const at = port++;
    if (only.length && !only.includes(name)) continue;
    assert.ok(fs.existsSync(path.join(source, "judge.json")), `${name} is not in the fixtures`);
    const dir = path.join(scratch, name, "app");
    const data = path.join(scratch, name, "data");
    const home = path.join(scratch, name, "home");
    fs.cpSync(source, dir, { recursive: true, verbatimSymlinks: true, filter: (s) => path.basename(s) !== ".git" && path.relative(source, s) !== "data" });
    for (const d of [data, home]) fs.mkdirSync(d, { recursive: true });
    const lock = path.join(dir, "package-lock.json");
    if (fs.existsSync(lock) && !fs.existsSync(path.join(dir, "node_modules"))) execFileSync("npm", ["ci", "--omit=dev", "--no-audit", "--no-fund"], { cwd: dir, stdio: "pipe", timeout: 300_000 });
    const j = JSON.parse(fs.readFileSync(path.join(dir, "judge.json"), "utf8")) as Judge;
    const origin = `http://localhost:${at}`;
    const [command, ...args] = j.start.command.split(" ");
    const env = { PATH: process.env.PATH ?? "", HOME: home, HOST: "127.0.0.1", NODE_ENV: "production", [j.start.port]: String(at), [j.start.data]: data, ...j.start.judgeEnv, ...fill(j.start.env ?? {}, { origin }) };
    const child: ChildProcess = spawn(command === "node" ? process.execPath : command, args, { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    child.stdout!.on("data", (d) => (log = (log + d).slice(-4000)));
    child.stderr!.on("data", (d) => (log = (log + d).slice(-4000)));
    try {
      let ready = false;
      for (let i = 0; i < 300 && !ready && child.exitCode === null; i++) {
        ready = await ask(new URL(j.start.ready ?? "/", origin)).then((r) => r.status < 400, () => false);
        if (!ready) await new Promise((r) => setTimeout(r, 100));
      }
      assert.ok(ready, `${name} did not start: ${log}`);
      const account = await prepare(j, origin);
      const t = Date.now();
      const r = await checkPages({
        address: origin,
        ...(account ? { signedIn: { cookie: account.cookie, setCookies: account.setCookies, home: j.home } } : {}),
        throwaway: true,
      });
      console.log(`\n=================== ${name} (${((Date.now() - t) / 1000).toFixed(0)} s)${account ? `\n(made: ${account.made.join(", ") || "an account"})` : "\n(no accounts)"}`);
      console.log(r.summary);
      console.log(`pages: ${r.pages.map((p) => `${p.signedIn ? "[in] " : ""}${p.path}${p.final !== p.path ? ` → ${p.final}` : ""} ${p.status}`).join(", ")}`);
      for (const l of r.lines) console.log(`${{ passed: "passed", failed: "FAILED", notRun: "??    ", note: "note  " }[l.state]} ${l.id}: ${l.text}${l.details && (l.state === "failed" || l.state === "note") ? l.details.map((d) => `\n         - ${d}`).join("") : ""}`);
      console.log(`\n--- the agent's summary\n${summarize(r)}`);
      report[name] = r;
      assert.deepEqual(r.lines.map((l) => l.id), LINE_IDS);
      assert.ok(!r.lines.some((l) => /did not finish|Could not run/.test(l.text)), "a line broke instead of being judged");
      assert.ok(r.pages.length > 0 && r.pages.some((p) => p.read), "no page was read");
      assert.ok(summarize(r).split("\n").length <= 12);
      if (account) assert.ok(r.pages.some((p) => p.signedIn && p.read), "no signed-in page was read");
      assert.equal(child.exitCode, null, `${name} stopped during the check: ${log}`);
    } finally {
      child.kill("SIGTERM");
      await new Promise<void>((r) => {
        if (child.exitCode !== null || child.signalCode) return r();
        const k = setTimeout(() => child.kill("SIGKILL"), 5000);
        child.on("exit", () => (clearTimeout(k), r()));
      });
    }
  }
  if (process.env.HYDOR_PAGECHECK_REPORT) fs.writeFileSync(process.env.HYDOR_PAGECHECK_REPORT, JSON.stringify(report, null, 1));
  assert.deepEqual(fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith(`hydor-pagecheck-${process.pid}-`)), [], "a browser's profile folder was left");
  console.log("\nthe proof ran to its end.");
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
