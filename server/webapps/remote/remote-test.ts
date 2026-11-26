// Checks of the engine that launches an app to a server, with no server and no Docker: a stand-in for the connection (a
// `Remote` that keeps every script it was given and answers as a server would) and stand-ins for the looks at the live
// address. The server's scripts that need no Docker run for real in bash in a scratch home, and the backup program runs
// for real with this computer's sqlite3 (skipped, and said, when there is none). The proof with a machine over real SSH
// and Docker is launch-proof-test.ts.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/webapps/remote/remote-test.ts && node dist/dev/remote-test.js
import assert from "node:assert/strict";
import { execFile, execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { BACKUP_PROGRAM } from "./backup-program.ts";
import { composeFile, caddyfile, isLocalName } from "./compose.ts";
import { dockerfileFor, nodeMajor } from "./dockerfile.ts";
import { installSteps, judge, parseLook, prepareScript } from "./host-check.ts";
import { acceptHost, addHost, checkHost, connectionOf, listHosts, offerHost, parseSsh, removeHost } from "./hosts.ts";
import { envLine, envValue, gatherValues, keyStates, mask } from "./keys.ts";
import { launch, parseAddress, parseState, rollback, type LaunchOptions } from "./launch.ts";
import type { Probes } from "./probe.ts";
import { backups, countLog, history, logs, NOT_STRUCTURED, restart, status, takeDown } from "./run.ts";
import * as scripts from "./scripts.ts";
import { holdingValues, sourceFiles } from "./source.ts";
import { explainSsh, sshArgs, SshRefused, type Connect, type Remote, type RunResult } from "./ssh.ts";
import { LAUNCH_STEPS, Refused, type CheckLine, type RemoteContract, type Step } from "./types.ts";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "hydor-remote-test-"));
let passed = 0;
const step = async (name: string, fn: () => Promise<void> | void) => {
  await fn();
  passed++;
  console.log(`ok - ${name}`);
};
const folder = (name: string) => {
  const dir = path.join(scratch, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};
const put = (dir: string, rel: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
};
const refuses = async (fn: () => unknown, pattern: RegExp) => {
  await assert.rejects(async () => void (await fn()), (e: Error) => {
    assert.ok(e instanceof Refused, `not a refusal: ${e.stack}`);
    assert.match(e.message, pattern);
    return true;
  });
};

const SECRET = "sk_live_NotToBeSeenAnywhere_0123456789";
const S3_SECRET = "s3-secret-NotToBeSeenEither-9876543210";
const MADE = "madeontheserver0123456789abcdef0123456789abcdef";

const CONTRACT: RemoteContract = {
  start: "node server.js",
  env: { port: "PORT", data: "DATA_DIR", url: "APP_URL", secret: "APP_SECRET" },
  ready: "/health",
  signIn: "own",
  private: "/",
  keys: [{ name: "STRIPE_SECRET_KEY", from: "Stripe", why: "Takes payments", how: ["copy it"] }],
  services: {},
  database: { file: "shop.db", sqlite: true },
};

function appFolder(name: string): string {
  const dir = folder(name);
  put(dir, "package.json", JSON.stringify({ name: "shop", version: "1.4.0" }));
  put(dir, "server.js", "console.log('shop')\n");
  return dir;
}

// ---- a hosts folder with a recorded host ----------------------------------------------------------------------------

const keyFor = (name: string) => {
  const file = path.join(folder("machine-keys"), name);
  execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", "machine", "-f", file]);
  const [type, blob] = fs.readFileSync(`${file}.pub`, "utf8").split(" ");
  const fingerprint = execFileSync("ssh-keygen", ["-l", "-E", "sha256", "-f", `${file}.pub`], { encoding: "utf8" }).split(" ")[1]!;
  return { line: `203.0.113.7 ${type} ${blob}`, fingerprint };
};

async function recordedHosts(name: string): Promise<string> {
  const dir = path.join(scratch, name);
  await addHost(dir, "stand", "deploy@203.0.113.7");
  const key = keyFor(name);
  await acceptHost(dir, "stand", key.fingerprint, { scan: async () => [key.line] });
  return dir;
}

// ---- a stand-in for the server ----------------------------------------------------------------------------------------

type Reply = Partial<RunResult> | ((script: string, input?: string) => Partial<RunResult>);

const LOOK_OK = [
  "os_id=ubuntu", "os_name=Ubuntu 24.04", "arch=x86_64", "user=deploy", "root=0", "sudo=1", "docker_cli=1", "docker_server=29.1.3", "docker_denied=0", "compose=2.40.0",
  "mem_kb=4000000", "swap_kb=0", "disk_kb=40000000", "port80=0", "port80_by=", "port443=0", "port443_by=", "cron=1", "ufw=active",
].join("\n");

const liveState = (o: { id?: string; sqlite?: boolean; schema?: string; snapshot?: string | null; address?: string } = {}) =>
  JSON.stringify({ id: o.id ?? "20261101-000000-aaaaaaa", image: `hydor-shop:${o.id ?? "20261101-000000-aaaaaaa"}`, version: "1.3.0", at: "2026-11-01T00:00:00Z", address: o.address ?? "https://shop.test", ready: "/health", database: { file: "shop.db", sqlite: o.sqlite ?? true }, snapshot: o.snapshot ?? null, schema: o.schema ?? "s1" });

interface Stand {
  connect: Connect;
  /** The marker of every script, in order. */
  ran: string[];
  scripts: string[];
  inputs: { what: string; input: string }[];
  sent: string[];
}

function standIn(replies: Record<string, Reply> = {}, state: { current?: string; previous?: string; running?: string } = {}): Stand {
  const stand: Stand = { ran: [], scripts: [], inputs: [], sent: [], connect: null as unknown as Connect };
  const defaults: Record<string, Reply> = {
    look: { out: LOOK_OK },
    state: () => ({ out: [`current=${state.current ?? ""}`, `previous=${state.previous ?? ""}`, "backup_at=", "keep_days=", `running=${state.running ?? (state.current ? "app caddy backup" : "")}`].join("\n") }),
    send: { out: "received" },
    build: { out: "#1 building\n#2 done" },
    "backup-image": {},
    configure: { out: "app_key=STRIPE_SECRET_KEY\napp_key=APP_SECRET\n" },
    held: { out: `STRIPE_SECRET_KEY='${SECRET}'\nAPP_SECRET=${MADE}\nBACKUP_S3_SECRET_ACCESS_KEY=${S3_SECRET}\nBACKUP_S3_BUCKET=shop\n` },
    ca: { out: "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----\n" },
    snapshot: { out: 'snapshot={"id":"20261126-101010-pre-launch","database":true}' },
    "snapshot-stopped": { out: 'snapshot={"id":"20261126-101010-pre-launch","database":false}' },
    switch: { out: 'mark={"schema":"s1","data":"d1"}\nswitched=1\nswitch_seconds=4.2' },
    putback: { out: 'log: Error: boom at line 3\nlog: key sk_live_NotToBeSeenAnywhere_0123456789 used\ndata_restored={"reverted":true,"safety":"20261126-101011-before-restore"}\nprevious_back=1' },
    fingerprint: { out: '{"schema":"s1","data":"d1"}' },
    commit: {},
    cron: (s) => ({ out: s.includes("rm -f backup.sh\nif crontab") ? "cron=none" : "cron=set" }),
    backup: (s) =>
      s.includes("'verify'")
        ? { out: '{"id":"x","ok":true,"integrity":"ok","found":{"orders":2,"users":1},"problems":[]}' }
        : s.includes("'list'")
          ? { out: '[{"id":"20261126-101012-launch","label":"launch","createdAt":"2026-11-26T10:10:12Z","tables":{"orders":2},"files":1,"archive":{"bytes":900}}]' }
          : { out: '{"id":"20261126-101012-launch","createdAt":"2026-11-26T10:10:12Z","bytes":900,"tables":{"orders":2},"files":1,"database":true,"s3":null}' },
    "backup-stopped": { out: '{"id":"20261126-101012-launch","createdAt":"2026-11-26T10:10:12Z","bytes":900,"tables":{},"files":3,"database":false,"stopped":true,"s3":null}' },
    "history-append": {},
    "previous-files": { out: "ready" },
    swap: {},
  };
  const answer = (script: string, input?: string): RunResult => {
    const what = /^# hydor:([a-z-]+)/.exec(script)?.[1] ?? "?";
    stand.ran.push(what);
    stand.scripts.push(script);
    if (input !== undefined) stand.inputs.push({ what, input });
    const reply = replies[what] ?? defaults[what] ?? {};
    return { code: 0, out: "", err: "", ...(typeof reply === "function" ? reply(script, input) : reply) };
  };
  const remote: Remote = {
    run: async (script, options) => {
      const r = answer(script, options?.input === undefined ? undefined : String(options.input));
      options?.onOutput?.(`${r.out}\n`);
      return r;
    },
    runWithFile: async (script, file) => {
      const list = execFileSync("tar", ["-tzf", file], { encoding: "utf8" }).split("\n").filter(Boolean);
      stand.sent.push(...list.map((x) => x.replace(/^\.\//, "")));
      return answer(script);
    },
    runToFile: async (script, file) => {
      fs.writeFileSync(file, "archive");
      return answer(script);
    },
    close: async () => {},
  };
  stand.connect = () => remote;
  return stand;
}

const probes = (o: { ready?: boolean; smoke?: boolean } = {}): Probes => ({
  waitReady: async () => ({ ok: o.ready ?? true, seconds: 0.4, last: o.ready === false ? "it answered 502" : "it answered 200" }),
  smoke: async () => (o.smoke === false ? [{ id: "page", ok: false, say: "/ answered 500 (boom)" }] : [{ id: "ready", ok: true, say: "/health answers 200" }, { id: "page", ok: true, say: "/ answers 200." }]),
  watchDowntime: () => ({ stop: async () => ({ seconds: 3.5, polls: 20 }) }),
  request: async () => ({ status: o.smoke === false ? 500 : 200, headers: {}, body: "" }),
});

const LINES: CheckLine[] = [
  { id: "file", title: "hydor.json says what is needed", state: "passed", text: "ok" },
  { id: "ready", title: "It starts", state: "passed", text: "ok" },
  { id: "writes", title: "It writes only in its data folder", state: "passed", text: "ok" },
];
const withFailed = (id: string): CheckLine[] => LINES.map((l) => (l.id === id ? { ...l, state: "failed" as const, text: "it did not", hint: "do it" } : l));

async function main() {
  const hosts = await recordedHosts("hosts");
  const app = appFolder("shop");

  const options = (stand: Stand, more: Partial<LaunchOptions> = {}): LaunchOptions => ({
    hostsDir: hosts,
    host: "stand",
    app: "shop",
    dir: app,
    contract: CONTRACT,
    address: "https://shop.test",
    keys: { STRIPE_SECRET_KEY: SECRET },
    check: async () => ({ lines: LINES }),
    connect: stand.connect,
    probes: probes(),
    now: () => new Date("2026-11-26T10:00:00Z"),
    ...more,
  });

  await step("user@address[:port] and https addresses are read, and anything else refused in a sentence", async () => {
    assert.deepEqual(parseSsh("deploy@203.0.113.7"), { user: "deploy", address: "203.0.113.7", port: 22 });
    assert.deepEqual(parseSsh("a@[2001:db8::1]:2222"), { user: "a", address: "2001:db8::1", port: 2222 });
    for (const bad of ["203.0.113.7", "-oProxyCommand=x@h", "u@h;rm", "u@h:70000", "u @h"]) assert.throws(() => parseSsh(bad), Refused, bad);
    assert.deepEqual(parseAddress("app.example.com"), { origin: "https://app.example.com", host: "app.example.com" });
    assert.equal(parseAddress("https://shop.localhost:4443").origin, "https://shop.localhost:4443");
    for (const bad of ["http://a.example.com", "https://a.example.com/x", "https://u:p@a.example.com", "https://localhost", "https://a b", "https://a.example.com:8443", "https://203.0.113.7"]) assert.throws(() => parseAddress(bad), Refused, bad);
    assert.ok(isLocalName("a.localhost") && isLocalName("a.test") && !isLocalName("a.example.com") && !isLocalName("localhost.example.com"));
  });

  await step("a host gets a key of Hydor's own, is recorded only with a fingerprint the machine shows, and is private", async () => {
    const dir = path.join(scratch, "hosts-add");
    const made = await addHost(dir, "web-1", "root@203.0.113.9:2222");
    assert.equal(made.state, "made");
    assert.match(made.publicKey, /^ssh-ed25519 \S+ hydor-web-1$/);
    await refuses(() => addHost(dir, "web-1", "root@203.0.113.9"), /already/);
    await refuses(() => addHost(dir, "Web", "root@x"), /lower-case/);
    assert.throws(() => connectionOf(dir, "web-1"), /not recorded yet/);
    const key = keyFor("web-1");
    const line = key.line.replace("203.0.113.7", "[203.0.113.9]:2222");
    const scan = async () => [line];
    const offer = await offerHost(dir, "web-1", { scan });
    assert.deepEqual(offer.offered, [{ type: "ssh-ed25519", fingerprint: key.fingerprint }]);
    assert.ok(!fs.existsSync(path.join(dir, "known_hosts")), "offering records nothing");
    await refuses(() => acceptHost(dir, "web-1", "SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", { scan }), /does not show the key you accepted/);
    await refuses(() => acceptHost(dir, "web-1", "nope", { scan }), /not a fingerprint/);
    const recorded = await acceptHost(dir, "web-1", key.fingerprint, { scan });
    assert.equal(recorded.state, "recorded");
    assert.equal(fs.readFileSync(path.join(dir, "known_hosts"), "utf8"), `${line}\n`);
    await refuses(() => acceptHost(dir, "web-1", "SHA256:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", { scan }), /another key/);
    const stored = fs.readFileSync(path.join(dir, "hosts.json"), "utf8");
    assert.ok(!stored.includes("PRIVATE"), "only the public half is in the file");
    for (const f of ["hosts.json", "known_hosts", "keys/web-1", "ssh_config"]) assert.equal(fs.statSync(path.join(dir, f)).mode & 0o077, 0, f);
    assert.equal(fs.statSync(dir).mode & 0o077, 0);
    const args = sshArgs(dir, connectionOf(dir, "web-1"), null).join(" ");
    for (const want of ["StrictHostKeyChecking=yes", "BatchMode=yes", "GlobalKnownHostsFile=/dev/null", "IdentitiesOnly=yes", "IdentityAgent=none", `-F ${path.join(dir, "ssh_config")}`, `-i ${path.join(dir, "keys/web-1")}`, "-p 2222"]) assert.ok(args.includes(want), want);
    assert.ok(!args.includes(".ssh/"), "nothing of ~/.ssh");
    removeHost(dir, "web-1");
    assert.deepEqual(listHosts(dir), []);
    assert.equal(fs.readFileSync(path.join(dir, "known_hosts"), "utf8"), "");
    assert.ok(!fs.existsSync(path.join(dir, "keys/web-1")));
  });

  await step("a changed host key is said plainly, and nothing was sent", () => {
    const e = explainSsh("@@@ WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED! @@@\nHost key verification failed.", { name: "stand", user: "deploy", address: "203.0.113.7", port: 22 });
    assert.match(e!.message, /is not the one you accepted\. Nothing was sent to it\./);
    assert.equal(e!.ssh, "key-changed");
    assert.equal(explainSsh("deploy@h: Permission denied (publickey).", { name: "s", user: "deploy", address: "h", port: 22 })!.ssh, "auth");
  });

  await step("check says what is missing; prepare installs Docker the documented way and opens SSH, 80 and 443 only", async () => {
    const bare = parseLook(LOOK_OK.replace("docker_cli=1", "docker_cli=0").replace("docker_server=29.1.3", "docker_server=").replace("compose=2.40.0", "compose=").replace("ufw=active", "ufw=none"));
    assert.ok(judge(bare).some((f) => f.what === "docker" && f.ok === false));
    assert.match(installSteps(bare).join(" "), /docs\.docker\.com\/engine\/install\/ubuntu/);
    const script = prepareScript(bare, [22, 2222]);
    assert.match(script, /download\.docker\.com\/linux\/ubuntu/);
    assert.match(script, /hydor-metadata\.service[\s\S]*Before=docker\.service[\s\S]*systemctl enable hydor-metadata/);
    assert.equal(spawnSync("bash", ["-n", "-c", script], { encoding: "utf8" }).status, 0);
    assert.deepEqual([...script.matchAll(/ufw allow (\d+)\/tcp/g)].map((m) => m[1]), ["22", "2222", "80", "443"]);
    const small = parseLook(LOOK_OK.replace("mem_kb=4000000", "mem_kb=900000").replace("disk_kb=40000000", "disk_kb=2000000").replace("docker_server=29.1.3", "docker_server=20.10.1"));
    assert.deepEqual(judge(small).filter((f) => f.ok === false).map((f) => f.what), ["docker", "memory", "disk"]);
    const other = parseLook(LOOK_OK.replace("port80=0", "port80=1").replace("port80_by=", "port80_by=hydor-other|caddy:2-alpine "));
    assert.match(judge(other, "hydor-shop").find((f) => f.what === "port 80")!.say, /taken by another app launched to this server \(other\)/);
    assert.equal(judge(other, "hydor-other").find((f) => f.what === "port 80")!.ok, true);
    const missing = standIn({ look: { out: LOOK_OK.replace("docker_cli=1", "docker_cli=0").replace("docker_server=29.1.3", "docker_server=") } });
    const checked = await checkHost(hosts, "stand", { connect: missing.connect });
    assert.equal(checked.ok, false);
    assert.deepEqual(missing.ran, ["look"], "checking installs nothing");
    const fedora = standIn({ look: { out: LOOK_OK.replace("os_id=ubuntu", "os_id=fedora") } });
    await refuses(() => checkHost(hosts, "stand", { prepare: true, connect: fedora.connect }), /Debian and Ubuntu only/);
    const prep = standIn({ sshports: { out: "22\n" } });
    const prepared = await checkHost(hosts, "stand", { prepare: true, connect: prep.connect });
    assert.ok(prepared.ok && prepared.prepared);
    assert.deepEqual(prep.ran, ["look", "sshports", "prepare", "look"]);
    assert.equal(listHosts(hosts)[0]!.checked?.ok, true);
  });

  await step("keys: given, on the server, to be made or missing; only those hydor.json names are sent; storage keys apart", () => {
    assert.deepEqual(keyStates(CONTRACT, {}).map((k) => [k.name, k.state]), [["STRIPE_SECRET_KEY", "missing"], ["APP_SECRET", "made"]]);
    assert.deepEqual(keyStates(CONTRACT, {}, new Set(["STRIPE_SECRET_KEY", "APP_SECRET"])).map((k) => k.state), ["server", "server"]);
    const g = gatherValues(CONTRACT, { STRIPE_SECRET_KEY: SECRET, OTHER: "x" }, { BACKUP_S3_BUCKET: "b", BACKUP_S3_ACCESS_KEY_ID: "a", BACKUP_S3_SECRET_ACCESS_KEY: S3_SECRET });
    assert.deepEqual([Object.keys(g.app), g.unused], [["STRIPE_SECRET_KEY"], ["OTHER"]]);
    assert.equal(Object.keys(g.storage).length, 3);
    assert.throws(() => gatherValues(CONTRACT, { STRIPE_SECRET_KEY: "a\nb" }), /line break/);
    assert.throws(() => gatherValues(CONTRACT, {}, { BACKUP_S3_BUCKET: "b" }), /also needs/);
    assert.throws(() => gatherValues(CONTRACT, {}, { PATH: "x" }), /not one of the storage/);
    for (const v of ["plain-1", "with space # not a comment", "do$lar", `it's "quoted" $x \\y`]) assert.equal(envValue(envLine("K", v))!.value, v);
    assert.equal(mask(`token ${SECRET} and API_KEY=abc and Bearer abcdefgh123 postgres://u:pw@db/x`, [SECRET]), "token «hidden» and API_KEY=«hidden» and Bearer «hidden» postgres://u:«hidden»@db/x");
  });

  await step("the Dockerfile: the app's own, or one written for Node, Python and Go; anything else is refused with what to do", () => {
    const node = folder("df-node");
    put(node, "package.json", JSON.stringify({ engines: { node: ">=22.13" }, dependencies: { express: "^5" } }));
    const built = dockerfileFor(node, { ...CONTRACT, build: "npm ci --omit=dev" });
    assert.ok(built.ok && built.kind === "node");
    assert.match(built.text!, /FROM node:22-bookworm-slim AS build/);
    assert.match(built.text!, /RUN \["sh","-c","npm ci --omit=dev"\]/);
    assert.match(built.text!, /USER node\nCMD \["sh","-c","exec node server\.js"\]/);
    assert.doesNotMatch(built.text!, /g\+\+/);
    put(node, "package-lock.json", '{"packages":{"node_modules/better-sqlite3":{"hasInstallScript": true}}}');
    assert.match((dockerfileFor(node, { ...CONTRACT, build: "npm ci" }) as { text: string }).text, /python3 make g\+\+/);
    const noBuild = dockerfileFor(node, CONTRACT);
    assert.ok(!noBuild.ok);
    assert.match(noBuild.say, /npm ci --omit=dev/);
    assert.equal(nodeMajor(node), 22);
    put(node, "package.json", JSON.stringify({ engines: { node: "20.x" } }));
    assert.equal(nodeMajor(node), 20);
    const plain = dockerfileFor(folder("df-plain"), CONTRACT);
    assert.ok(plain.ok && !plain.text!.includes("AS build"));
    const py = folder("df-py");
    put(py, "requirements.txt", "flask\n");
    const python = dockerfileFor(py, { ...CONTRACT, start: "gunicorn -b $HOST:$PORT app:app", build: "pip install -r requirements.txt" });
    assert.ok(python.ok && python.kind === "python");
    assert.match(python.text!, /FROM python:3\.12-slim[\s\S]*pip install -r requirements\.txt[\s\S]*USER app/);
    assert.ok(!dockerfileFor(py, { ...CONTRACT, start: "python3 app.py" }).ok, "requirements with no build line");
    const go = folder("df-go");
    put(go, "go.mod", "module x\n");
    const golang = dockerfileFor(go, { ...CONTRACT, start: "./server", build: "go build -o server ." });
    assert.ok(golang.ok && golang.kind === "go");
    for (const [dir, c] of [[go, { ...CONTRACT, start: "./server" }], [folder("df-ruby"), { ...CONTRACT, start: "bundle exec puma" }], [node, { ...CONTRACT, build: "pip install x" }]] as const) {
      const no = dockerfileFor(dir, c);
      assert.ok(!no.ok);
      assert.match(no.say, /Add a Dockerfile at the app's root/);
    }
    put(node, "Dockerfile", "FROM scratch\n");
    assert.deepEqual(dockerfileFor(node, CONTRACT).ok && dockerfileFor(node, CONTRACT), { ok: true, kind: "own", text: null, say: "The app has its own Dockerfile: Hydor builds with it, as it is." });
  });

  await step("what is sent: no dependencies, builds, data, .env files but examples, databases or git; git's ignores are kept", async () => {
    const dir = folder("src");
    for (const f of ["server.js", "src/data/seed.js", "dist/index.js", "node_modules/x/i.js", "data/shop.db", "shop.db", "shop.db-wal", "other.sqlite3", ".env", ".env.local", ".env.example", ".envrc", ".git/config", "__pycache__/a.pyc", ".venv/bin/python", "keys/id_rsa", "public/app.js", "notes.log"]) put(dir, f, "x");
    fs.symlinkSync("/etc/hostname", path.join(dir, "link"));
    assert.deepEqual(await sourceFiles(dir, { build: "npm run build", database: { file: "shop.db", sqlite: true } }), [".env.example", "notes.log", "public/app.js", "server.js", "src/data/seed.js"]);
    assert.ok((await sourceFiles(dir, {})).includes("dist/index.js"), "with no build line a dist folder is the app's");
    fs.rmSync(path.join(dir, ".git"), { recursive: true });
    execFileSync("git", ["init", "-q"], { cwd: dir });
    put(dir, ".gitignore", "notes.log\nlocal-secrets.json\n");
    put(dir, "local-secrets.json", "{}");
    const tracked = await sourceFiles(dir, { build: "x" });
    assert.ok(!tracked.includes("notes.log") && !tracked.includes("local-secrets.json") && tracked.includes("server.js") && !tracked.includes(".env"));
    put(dir, "config.js", `const key = '${SECRET}'`);
    assert.deepEqual(holdingValues(dir, ["config.js", "server.js"], [SECRET]), [{ file: "config.js", value: SECRET }]);
  });

  await step("the compose project publishes Caddy only, keeps keys out of the file, and fills nothing of the app's in", () => {
    const text = composeFile({ project: "hydor-shop", contract: { ...CONTRACT, ready: "/ok?x=$HOME" }, address: "https://shop.example.com" });
    const app = text.slice(text.indexOf("  app:"), text.indexOf("  caddy:"));
    assert.match(app, /env_file: \.\/app\.env/);
    assert.match(app, /HOST: "0\.0\.0\.0"[\s\S]*PORT: "3000"[\s\S]*DATA_DIR: "\/data"[\s\S]*APP_URL: "https:\/\/shop\.example\.com"/);
    assert.doesNotMatch(app, /ports:/);
    assert.match(text, /HYDOR_READY: "\/ok\?x=\$\$HOME"/);
    assert.equal(text.match(/source: data\n {8}target: \/data\n {8}volume:\n {10}nocopy: true/g)?.length, 2, "no image decides who owns the data folder");
    assert.doesNotMatch(text, /APP_SECRET|STRIPE/);
    // The guard keeps containers from the provider's address, and the app is started only once it has.
    const guard = text.slice(text.indexOf("  guard:"), text.indexOf("  app:"));
    for (const part of [/network_mode: host/, /cap_add: \[NET_ADMIN, NET_RAW\]/, /iptables -t raw -I PREROUTING -d 169\.254\.169\.254\/32 -j DROP/, /ip6tables -t raw -I PREROUTING -d fd00:ec2::254\/128 -j DROP/]) assert.match(guard, part);
    assert.match(app, /depends_on:[^\n]*\n {6}guard:\n {8}condition: service_healthy/);
    assert.match(caddyfile("shop.localhost"), /shop\.localhost \{\n\ttls internal/);
    assert.doesNotMatch(caddyfile("shop.example.com"), /tls internal/);
  });

  await step("every script for the server is bash that parses", () => {
    const all = [
      scripts.stateScript("shop"), scripts.receiveScript("shop", "1"), scripts.buildScript("shop", "1"), scripts.backupImageScript("shop", "t:1", "FROM x"),
      scripts.configureScript("shop", { compose: "a: 1", caddyfile: "x {\n}", env: "A=1" }, ["APP_SECRET"]), scripts.snapshotScript("shop"), scripts.snapshotStoppedScript("shop"),
      scripts.switchScript("shop", { id: "1", image: "hydor-shop:1", hadPrevious: true, waitSeconds: 120, restore: "20261126-101010" }), scripts.switchScript("shop", { id: "1", image: "i", hadPrevious: false, waitSeconds: 5 }),
      scripts.putBackScript("shop", { id: "1", hadPrevious: true, restore: { kind: "mark" } }), scripts.putBackScript("shop", { id: "1", hadPrevious: true, restore: { kind: "backup", id: "20261126-101010" } }),
      scripts.putBackScript("shop", { id: "1", hadPrevious: true, restore: null }), scripts.putBackScript("shop", { id: "1", hadPrevious: false, restore: null }),
      scripts.commitScript("shop", "1", "{}", "{}", ["a:1"]), scripts.commitScript("shop", "1", "{}", null, ["a:1"]), scripts.historyAppendScript("shop"), scripts.historyScript("shop"), scripts.caRootScript("shop"),
      scripts.previousFilesScript("shop", "1"), scripts.fingerprintScript("shop"), scripts.swapStateScript("shop", "{}", "{}"), scripts.statusScript("shop"),
      scripts.logsScript("shop", { since: "1h", tail: 5, service: "app" }), scripts.heldScript("shop"), scripts.restartScript("shop"), scripts.backupScript("shop", ["list"]),
      scripts.backupScript("shop", ["now"], { stop: true }), scripts.restoreScript("shop", "20261126-101010"), scripts.pullScript("shop", "20261126-101010"),
      scripts.scheduleScript("shop", "03:30", 14), scripts.cronScript("shop", "03:30"), scripts.cronScript("shop", null), scripts.takeDownScript("shop"), scripts.tidyScript("shop"), scripts.startAgainScript("shop"),
    ];
    for (const s of all) {
      assert.match(s, /^# hydor:[a-z-]+\n/);
      const r = spawnSync("bash", ["-n", "-c", s], { encoding: "utf8" });
      assert.equal(r.status, 0, `${s.split("\n")[0]}: ${r.stderr}`);
    }
  });

  await step("on a server's shell: keys written readable by their owner only, made once, replaced by name; state read back; cron line set and taken out", () => {
    const home = folder("server-home");
    const bin = folder("server-bin");
    // No Docker here; a stand-in crontab that keeps its lines in a file.
    put(bin, "docker", "#!/bin/sh\nexit 1\n");
    put(bin, "crontab", '#!/bin/sh\nf="$HOME/crontab.txt"\nif [ "$1" = -l ]; then cat "$f" 2>/dev/null; else cat > "$f"; fi\n');
    fs.chmodSync(path.join(bin, "docker"), 0o755);
    fs.chmodSync(path.join(bin, "crontab"), 0o755);
    const sh = (script: string, input = "") => {
      const r = spawnSync("bash", ["-ec", script], { input, encoding: "utf8", env: { HOME: home, PATH: `${bin}:/usr/bin:/bin` } });
      assert.equal(r.status, 0, r.stderr);
      return r.stdout;
    };
    const files = { compose: "name: hydor-shop", caddyfile: "shop.localhost {\n}", env: "HYDOR_IMAGE=a\nHYDOR_BACKUP_AT=02:00\nHYDOR_BACKUP_KEEP_DAYS=9" };
    const odd = `v'al "ue" $HOME`;
    const out = sh(scripts.configureScript("shop", files, ["APP_SECRET"]), `app:${envLine("STRIPE_SECRET_KEY", odd)}\nbackup:BACKUP_S3_BUCKET=b\n`);
    assert.match(out, /app_key=STRIPE_SECRET_KEY\napp_key=APP_SECRET\nbackup_key=BACKUP_S3_BUCKET/);
    const d = path.join(home, "hydor-apps", "shop");
    const appEnv = () => fs.readFileSync(path.join(d, "app.env.next"), "utf8");
    assert.equal(envValue(appEnv().split("\n")[0]!)!.value, odd);
    const made = /APP_SECRET=([0-9a-f]{64})/.exec(appEnv())![1]!;
    for (const f of ["app.env.next", "backup.env.next", "app.env", "compose.next.yaml"]) assert.equal(fs.statSync(path.join(d, f)).mode & 0o077, 0, f);
    assert.equal(fs.readFileSync(path.join(d, "app.env"), "utf8"), "", "the files in use are not touched before the switch");
    fs.renameSync(path.join(d, "app.env.next"), path.join(d, "app.env"));
    sh(scripts.configureScript("shop", files, ["APP_SECRET"]), "app:STRIPE_SECRET_KEY=new-value-1234\n");
    assert.ok(appEnv().includes(`APP_SECRET=${made}`), "a made key is made once");
    assert.equal(appEnv().split("\n").filter((l) => l.startsWith("STRIPE_SECRET_KEY=")).join(), "STRIPE_SECRET_KEY=new-value-1234");
    fs.renameSync(path.join(d, ".env.next"), path.join(d, ".env"));
    fs.writeFileSync(path.join(d, "state", "current.json"), liveState());
    const state = parseState(sh(scripts.stateScript("shop")));
    assert.equal(state.current?.version, "1.3.0");
    assert.deepEqual([state.backupAt, state.keepDays], ["02:00", 9]);
    sh(scripts.historyAppendScript("shop"), '{"id":"a"}\n');
    sh(scripts.historyAppendScript("shop"), '{"id":"b"}\n');
    assert.equal(sh(scripts.historyScript("shop")), '{"id":"a"}\n{"id":"b"}\n');
    fs.writeFileSync(path.join(home, "crontab.txt"), "0 1 * * * mine\n");
    assert.match(sh(scripts.cronScript("shop", "03:30")), /cron=set/);
    const cron = fs.readFileSync(path.join(home, "crontab.txt"), "utf8");
    assert.match(cron, /^0 1 \* \* \* mine\n\d\d \d\d \* \* \* \S+\/hydor-apps\/shop\/backup\.sh >> \S+ 2>&1 # hydor:shop\n$/);
    sh(scripts.cronScript("shop", "04:00"));
    assert.equal(fs.readFileSync(path.join(home, "crontab.txt"), "utf8").split("# hydor:shop").length, 2, "one line, however often it is set");
    assert.equal(spawnSync("bash", ["-n", path.join(d, "backup.sh")]).status, 0);
    // What a launch leaves behind holds no second copy of a key.
    for (const f of ["app.env.prev", "backup.env.prev", "app.env.next"]) fs.writeFileSync(path.join(d, f), "K=v\n");
    sh(scripts.tidyScript("shop"));
    assert.deepEqual(fs.readdirSync(d).filter((f) => /\.(prev|next|tmp)/.test(f)), []);
    sh(scripts.cronScript("shop", null));
    assert.equal(fs.readFileSync(path.join(home, "crontab.txt"), "utf8"), "0 1 * * * mine\n");
    assert.ok(!fs.existsSync(path.join(d, "backup.sh")));
  });

  await step("a first launch runs its steps in order, sends keys on standard input only, reads a backup back and writes a record without a secret", async () => {
    const stand = standIn();
    const seen: Step[] = [];
    const lines: string[] = [];
    const out = await launch(options(stand, { onStep: (s) => seen.push(s), onLine: (l) => lines.push(l), storage: { BACKUP_S3_BUCKET: "shop", BACKUP_S3_ACCESS_KEY_ID: "AKID", BACKUP_S3_SECRET_ACCESS_KEY: S3_SECRET }, commit: "abc123", by: "Dana" }));
    assert.ok(out.ok, out.summary);
    assert.deepEqual(out.steps.map((s) => s.id), LAUNCH_STEPS.map((s) => s.id));
    assert.deepEqual(out.steps.map((s) => s.state), ["passed", "passed", "passed", "passed", "passed", "passed", "passed", "passed", "skipped", "passed", "passed", "passed", "passed", "passed"]);
    assert.deepEqual(seen.filter((s) => s.state === "running").map((s) => s.id), LAUNCH_STEPS.map((s) => s.id).filter((x) => x !== "snapshot"));
    assert.deepEqual(stand.ran.filter((x) => !["held", "ca"].includes(x)), ["look", "state", "send", "build", "backup-image", "configure", "switch", "fingerprint", "commit", "cron", "backup", "backup", "tidy", "history-append"]);
    assert.ok(stand.sent.includes("server.js") && stand.sent.includes("Dockerfile") && !stand.sent.includes(".env"), stand.sent.join());
    for (const secret of [SECRET, S3_SECRET]) {
      assert.ok(stand.scripts.every((s) => !s.includes(secret)), "no key in any script");
      assert.ok(!JSON.stringify([out, seen, lines]).includes(secret), "no key in the outcome, the steps or the lines");
    }
    const input = stand.inputs.find((x) => x.what === "configure")!.input;
    assert.ok(input.includes(`app:STRIPE_SECRET_KEY=${SECRET}`) && input.includes(`backup:BACKUP_S3_SECRET_ACCESS_KEY=${S3_SECRET}`));
    assert.match(stand.scripts.find((s) => s.startsWith("# hydor:configure"))!, /for key in 'APP_SECRET'/);
    assert.equal(out.record!.result, "live");
    assert.deepEqual([out.record!.commit, out.record!.by, out.record!.version, out.backup?.verified, out.downtimeSeconds], ["abc123", "Dana", "1.4.0", true, null]);
    assert.match(out.summary, /Live at https:\/\/shop\.test \(version 1\.4\.0\) \(the first launch/);
  });

  await step("a check that fails stops before anything is sent; a line goes through only by name, and is recorded", async () => {
    const stopped = standIn();
    const out = await launch(options(stopped, { check: async () => ({ lines: withFailed("writes") }) }));
    assert.equal(out.result, "failed");
    assert.deepEqual([stopped.ran, out.record, out.steps[0]!.state, out.steps[1]!.state], [[], null, "failed", "waiting"]);
    assert.match(out.summary, /writes failed\). Nothing was sent/);
    const typo = await launch(options(standIn(), { check: async () => ({ lines: withFailed("writes") }), override: ["wrtes"] }));
    assert.match(typo.summary, /“wrtes” did not fail/);
    const must = await launch(options(standIn(), { check: async () => ({ lines: withFailed("ready") }), override: ["ready"] }));
    assert.match(must.summary, /nothing to launch yet/);
    const asked: string[] = [];
    const through = await launch(options(standIn(), { check: async () => ({ lines: withFailed("writes") }), askOverride: async (stops) => (asked.push(...stops.map((s) => s.id)), stops.map((s) => s.id)) }));
    assert.ok(through.ok);
    assert.deepEqual([asked, through.record!.overrides], [["writes"], ["writes"]]);
  });

  await step("a missing key, Hydor's sign-in, a name that leads nowhere and a key in the source each stop before anything is sent", async () => {
    const cases: [Partial<LaunchOptions>, string, RegExp][] = [
      [{ keys: {} }, "keys", /STRIPE_SECRET_KEY/],
      [{ contract: { ...CONTRACT, signIn: "hydor" } }, "check", /nobody could use it/],
      [{ address: "https://shop.example.com", resolve: async () => [] }, "address", /does not resolve/],
      [{ address: "https://shop.example.com", resolve: async () => ["198.51.100.2"] }, "address", /leads somewhere else/],
      [{ contract: { ...CONTRACT, start: "ruby app.rb" } }, "files", /Add a Dockerfile/],
    ];
    for (const [more, at, say] of cases) {
      const stand = standIn();
      const out = await launch(options(stand, more));
      assert.equal(out.steps.find((s) => s.state === "failed")?.id, at, out.summary);
      assert.match(out.summary, say);
      assert.ok(!stand.ran.includes("send"), at);
      assert.equal(out.record, null);
    }
    const leaky = appFolder("leaky");
    put(leaky, "config.js", `export const k = "${SECRET}";\n`);
    const out = await launch(options(standIn(), { dir: leaky }));
    assert.match(out.summary, /The value of STRIPE_SECRET_KEY is written in the app's file config\.js/);
    assert.ok(!JSON.stringify(out).includes(SECRET));
  });

  await step("a failure from the switch on puts the previous version back, and its data when the new one changed it", async () => {
    const stand = standIn({}, { current: liveState() });
    const out = await launch(options(stand, { probes: probes({ smoke: false }) }));
    assert.equal(out.result, "rolled-back");
    assert.ok(out.previousBack);
    assert.deepEqual(stand.ran.filter((x) => ["snapshot", "switch", "putback", "commit", "tidy", "history-append"].includes(x)), ["snapshot", "switch", "putback", "tidy", "history-append"]);
    assert.match(stand.scripts.find((s) => s.startsWith("# hydor:putback"))!, /backup revert/);
    assert.match(out.summary, /failed at “smoke” and the previous version is back.*answered 500/);
    assert.match(out.notes.join(" "), /the data was put back as it was just before the switch.*20261126-101011-before-restore/);
    assert.equal(out.downtimeSeconds, 3.5);
    assert.deepEqual([out.record!.result, out.record!.failedStep], ["rolled-back", "smoke"]);
    const unready = await launch(options(standIn({ switch: { code: 1, out: 'switched=1\ngave_up=the app fell over 3 times\nlog: listening\nlistening=["this machine only:3000"]\nswitch_seconds=9' } }, { current: liveState() })));
    assert.match(unready.summary, /127\.0\.0\.1 only/);
    assert.equal(unready.result, "rolled-back");
    const first = standIn();
    const alone = await launch(options(first, { probes: probes({ ready: false }) }));
    assert.equal(alone.result, "failed");
    assert.match(alone.notes.join(" "), /no earlier version/);
    assert.match(alone.summary, /there was no version before/);
  });

  await step("a launch that moves the app to another name measures no downtime; a wrong schedule is refused before anything", async () => {
    const moved = await launch(options(standIn({}, { current: liveState({ address: "https://old.test" }) })));
    assert.ok(moved.ok, moved.summary);
    assert.equal(moved.downtimeSeconds, null);
    const stand = standIn();
    await refuses(() => launch(options(stand, { backupAt: "3am" })), /HH:MM/);
    assert.deepEqual(stand.ran, []);
  });

  await step("a connection lost after the new version passed its look is not called a failed launch", async () => {
    const stand = standIn({ commit: () => { throw new SshRefused("unreachable", "Could not reach the server."); } }, { current: liveState() });
    const out = await launch(options(stand));
    assert.equal(out.result, "unfinished");
    assert.match(out.summary, /^Live at https:\/\/shop\.test, but the launch is NOT done/);
    assert.match(out.problems.join(" "), /passed its look/);
    assert.ok(!stand.ran.includes("putback"));
    const stopped = standIn({ "snapshot-stopped": () => { throw new SshRefused("unreachable", "Could not reach the server."); } }, { current: liveState({ sqlite: false }) });
    await launch(options(stopped));
    assert.ok(stopped.ran.includes("start-again"), "an app stopped for its copy is started again");
    const local = await launch(options(standIn(), { address: "https://shop.localhost" }));
    assert.match(local.summary, /always means this computer.*ending in \.test/);
  });

  await step("a backup that cannot be made leaves the launch live but not done", async () => {
    const out = await launch(options(standIn({ backup: { code: 1, err: '{"level":"error","text":"disk full"}' } }, { current: liveState() })));
    assert.equal(out.result, "unfinished");
    assert.equal(out.ok, false);
    assert.match(out.summary, /NOT done/);
    const nodb = await launch(options(standIn({ backup: { out: '{"id":"20261126-101012-launch","database":false}' } })));
    assert.match(nodb.summary, /names shop\.db as the database, and there is no such file/);
  });

  await step("an app with no SQLite file is stopped while it is copied (said so), and gets its daily copy from the server's cron", async () => {
    const stand = standIn({}, { current: liveState({ sqlite: false }) });
    const out = await launch(options(stand, { contract: { ...CONTRACT, database: undefined } }));
    assert.ok(out.ok, out.summary);
    assert.ok(stand.ran.includes("snapshot-stopped") && stand.ran.includes("backup-stopped"));
    assert.match(out.notes.join(" "), /names no database: the app is stopped while its data folder is copied/);
    assert.match(stand.scripts.find((s) => s.startsWith("# hydor:cron"))!, /echo "cron=set"/);
    assert.equal(out.downtimeSeconds, 7, "both stops are counted");
    const missing = await launch(options(standIn({ cron: { out: "cron=missing" } }), { contract: { ...CONTRACT, database: undefined } }));
    assert.match(missing.problems.join(" "), /No daily backup is set up/);
  });

  await step("one change of an app at a time", async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const first = launch(options(standIn(), { check: async () => (await held, { lines: LINES }) }));
    await refuses(() => launch(options(standIn())), /Something else is changing/);
    release();
    assert.ok((await first).ok);
  });

  await step("going back: refused when the database changed shape unless the data goes back too; going forward again is a plain switch", async () => {
    const older = liveState({ id: "20261101-000000-aaaaaaa", schema: "old" });
    const newer = liveState({ id: "20261102-000000-bbbbbbb", schema: "new", snapshot: "20261102-000000-pre-launch" });
    const place = { hostsDir: hosts, host: "stand", app: "shop", probes: probes() };
    const changed = standIn({ fingerprint: { out: '{"schema":"new","data":"d"}' } }, { current: newer, previous: older });
    await refuses(() => rollback({ ...place, connect: changed.connect }), /changed shape/);
    assert.ok(!changed.ran.includes("switch"));
    const restored = standIn({ switch: { out: 'mark={"schema":"new","data":"d"}\nrestored={"restored":true,"safety":"s"}\nswitched=1\nswitch_seconds=3' } }, { current: newer, previous: older });
    const out = await rollback({ ...place, connect: restored.connect, restoreData: true });
    assert.ok(out.ok, out.summary);
    assert.match(restored.scripts.find((s) => s.startsWith("# hydor:switch"))!, /restore '\\?'?20261102-000000-pre-launch/);
    assert.match(out.summary, /Went back: version 1\.3\.0.*data was put back/);
    const swap = restored.scripts.find((s) => s.startsWith("# hydor:swap"))!;
    assert.match(swap, /current\.json[\s\S]*aaaaaaa[\s\S]*previous\.json[\s\S]*bbbbbbb/);
    const forward = standIn({}, { current: older, previous: newer });
    const again = await rollback({ ...place, connect: forward.connect });
    assert.match(again.summary, /Went forward/);
    assert.ok(!forward.ran.includes("fingerprint"));
    await refuses(() => rollback({ ...place, connect: forward.connect, restoreData: true }), /Going forward again puts no data back/);
    await refuses(() => rollback({ ...place, connect: standIn({}, { current: newer }).connect }), /no earlier version/);
    // The database has the shape the older version knows: the way back is tried, and fails at its look.
    const failed = standIn({ fingerprint: { out: '{"schema":"old","data":"d"}' } }, { current: newer, previous: older });
    const bad = await rollback({ ...place, connect: failed.connect, probes: probes({ smoke: false }) });
    assert.equal(bad.ok, false);
    assert.ok(failed.ran.includes("putback") && !failed.ran.includes("swap"));
  });

  await step("status, logs, restart, backups, history and taking it down", async () => {
    const statusOut = [
      `current=${liveState()}`,
      'last={"id":"20261101-000000-aaaaaaa","at":"2026-11-01T00:00:00Z","action":"launch","result":"live","downtimeSeconds":2}',
      "services=app:running caddy:running backup:running",
      "started=2026-11-26T08:00:00Z",
      "restarts=0",
      "disk_kb=41943040",
      "data_kb=2048",
      'backups=[{"id":"20261126-033000-scheduled","createdAt":"2026-11-26T03:30:00Z","tables":{},"files":0,"archive":{"bytes":1}}]',
      "backup_at=03:30",
      "keep_days=14",
      "cron=0",
    ].join("\n");
    const plain = `Listening\n${SECRET} used\n`;
    const stand = standIn({ status: { out: statusOut }, logs: { out: plain }, restart: {}, restore: { out: 'restore={"id":"x","restored":true,"safety":"20261126-000000-before-restore"}\nup=1' }, takedown: {}, history: { out: '{"id":"a","result":"live"}\n{"id":"b","result":"rolled-back"}\n' }, schedule: {}, pull: {} }, { current: liveState() });
    const place = { hostsDir: hosts, host: "stand", app: "shop", connect: stand.connect, probes: probes() };
    const s = await status(place, { now: () => new Date("2026-11-26T09:30:00Z") });
    assert.deepEqual([s.up, s.version, s.lastBackup?.ageHours, s.disk.freeGb, s.disk.dataMb, s.errors, s.logSay], [true, "1.3.0", 6, 40, 2, null, NOT_STRUCTURED]);
    assert.match(s.say, /^Up at https:\/\/shop\.test, version 1\.3\.0, since 2026-11-26 08:00:00 UTC\.$/);
    assert.deepEqual(await logs(place), ["Listening", "«hidden» used"]);
    assert.equal((await restart(place)).ok, true);
    const made = await backups.now(place);
    assert.ok(made.verified && !made.problems.length);
    assert.equal((await backups.list(place)).backups[0]!.id, "20261126-101012-launch");
    await refuses(() => backups.restore(place, "20261126-101012-launch"), /replaces the app's data/);
    assert.ok(!stand.ran.includes("restore"), "without the yes nothing is run");
    assert.match((await backups.restore(place, "20261126-101012-launch", { yes: true })).summary, /is back and the app is running again.*before-restore/);
    await refuses(() => backups.restore(place, "../etc", { yes: true }), /not a backup's id/);
    assert.deepEqual(await backups.schedule(place), { at: "03:30", keepDays: 14 });
    assert.deepEqual(await backups.schedule(place, { at: "02:15" }), { at: "02:15", keepDays: 14 });
    await refuses(() => backups.schedule(place, { at: "25:00" }), /HH:MM/);
    const pulled = await backups.pull(place, "20261126-101012-launch", folder("pulled"));
    assert.equal(fs.statSync(pulled.file).mode & 0o077, 0);
    assert.deepEqual((await history(place)).map((r) => r.id), ["b", "a"]);
    assert.match((await takeDown(place)).summary, /data, its keys and its backups stay/);
    const unreachable = await status({ ...place, connect: () => ({ run: async () => { throw new SshRefused("unreachable", "Could not reach it."); }, runWithFile: async () => ({ code: 1, out: "", err: "" }), runToFile: async () => ({ code: 1, out: "", err: "" }), close: async () => {} }) });
    assert.deepEqual([unreachable.up, unreachable.problems], [null, ["Could not reach it."]]);
  });

  await step("errors and requests are counted from JSON lines, and a log that is not JSON is said to be so", () => {
    assert.deepEqual(countLog('Listening\n{"level":"info","msg":"request","status":200}\n{"level":"error","msg":"boom"}\n{"level":30,"res":{"statusCode":503}}\n{"level":50}\n', "1h"), { errors: 3, requests: 2, say: "3 errors and 2 requests in the log in the last 1h." });
    assert.equal(countLog("a\nb\n{\"x\":1}\n", "1h").say, NOT_STRUCTURED);
    assert.equal(countLog("", "24h").errors, null);
  });

  // ---- the backup program, for real ------------------------------------------------------------------------------------
  let sqlite = false;
  try {
    execFileSync("sqlite3", ["-json", ":memory:", "select 1"]);
    sqlite = true;
  } catch {
    console.log("skipped - the backup program: this computer has no sqlite3 with -json");
  }
  if (sqlite) await backupProgram();

  fs.rmSync(scratch, { recursive: true, force: true });
  console.log(`\n${passed} checks passed`);
}

async function backupProgram() {
  const dir = folder("backup");
  const program = path.join(dir, "hydor-backup.mjs");
  fs.writeFileSync(program, BACKUP_PROGRAM);
  const make = (name: string, more: Record<string, string> = {}) => {
    const data = folder(`backup/${name}/data`);
    const out = path.join(dir, name, "backups");
    return { data, out, env: { ...process.env, TMPDIR: folder(`backup/${name}/tmp`), HYDOR_DATA_DIR: data, HYDOR_BACKUP_DIR: out, HYDOR_DB_FILE: "shop.db", HYDOR_DB_SQLITE: "1", ...more } };
  };
  const run = (env: NodeJS.ProcessEnv, ...args: string[]) => {
    const r = spawnSync(process.execPath, [program, ...args], { env, encoding: "utf8" });
    return { code: r.status, json: JSON.parse(r.stdout.trim().split("\n").pop() || "null"), err: r.stderr };
  };
  const sql = (db: string, q: string) => execFileSync("sqlite3", [db, q], { encoding: "utf8" }).trim();

  const a = make("a");
  const db = path.join(a.data, "shop.db");
  sql(db, "pragma journal_mode=wal; create table orders(id integer primary key, what text); insert into orders(what) values ('a'),('b');");
  put(a.data, "photos/1.jpg", "jpeg");

  await step("backup program: an open SQLite database is copied with the files and read back; a damaged archive is refused before anything changes", () => {
    const made = run(a.env, "now", "--label", "manual");
    assert.equal(made.code, 0, made.err);
    assert.deepEqual([made.json.tables, made.json.files, made.json.database], [{ orders: 2 }, 1, true]);
    assert.equal(run(a.env, "verify", made.json.id).json.ok, true);
    assert.equal(run(a.env, "list").json.length, 1);
    const archive = path.join(a.out, `${made.json.id}.tar.gz`);
    const good = fs.readFileSync(archive);
    fs.writeFileSync(archive, "not an archive");
    assert.equal(run(a.env, "verify", made.json.id).code, 1);
    assert.equal(run(a.env, "restore", made.json.id).code, 1);
    assert.equal(sql(db, "select count(*) from orders"), "2");
    fs.writeFileSync(archive, good);

    sql(db, "insert into orders(what) values ('c')");
    put(a.data, "photos/2.jpg", "new");
    const back = run(a.env, "restore", made.json.id);
    assert.equal(back.code, 0, back.err);
    assert.equal(sql(db, "select count(*) from orders"), "2");
    assert.ok(!fs.existsSync(path.join(a.data, "photos/2.jpg")) && fs.existsSync(path.join(a.data, "photos/1.jpg")));
    assert.equal(run(a.env, "verify", back.json.safety).json.found.orders, 3, "what was there is kept");
  });

  await step("backup program: mark and fingerprint tell a changed database, and revert puts the marked one back", () => {
    const marked = run(a.env, "mark").json;
    assert.deepEqual(run(a.env, "fingerprint").json, marked);
    sql(db, "insert into orders(what) values ('d')");
    const rows = run(a.env, "fingerprint").json;
    assert.ok(rows.data !== marked.data && rows.schema === marked.schema, "rows change the data, not the shape");
    sql(db, "alter table orders add column note text");
    assert.notEqual(run(a.env, "fingerprint").json.schema, marked.schema);
    const reverted = run(a.env, "revert");
    assert.equal(reverted.code, 0, reverted.err);
    assert.deepEqual(run(a.env, "fingerprint").json, marked);
    assert.ok(reverted.json.safety);
  });

  await step("backup program: a folder with no SQLite file is copied only with the app stopped, and every file is read back", () => {
    const b = make("b", { HYDOR_DB_FILE: "", HYDOR_DB_SQLITE: "0" });
    put(b.data, "notes.json", "[1]");
    put(b.data, "files/x", "x");
    assert.equal(run(b.env, "now").code, 1);
    const stopped = { ...b.env, HYDOR_STOPPED: "1" };
    const made = run(stopped, "now").json;
    assert.deepEqual([made.files, made.stopped, made.database], [2, true, false]);
    assert.equal(run(b.env, "verify", made.id).json.ok, true);
    const marked = run(b.env, "mark").json;
    assert.equal(marked.schema, "-");
    put(b.data, "notes.json", "[1,2]");
    assert.notEqual(run(b.env, "fingerprint").json.data, marked.data);
    assert.equal(run(stopped, "restore", made.id).code, 0);
    assert.equal(fs.readFileSync(path.join(b.data, "notes.json"), "utf8"), "[1]");
  });

  await step("backup program: the newest three stay, older ones past the days go", () => {
    const c = make("c", { HYDOR_BACKUP_KEEP_DAYS: "14" });
    fs.mkdirSync(c.out, { recursive: true });
    for (let i = 1; i <= 6; i++) {
      const id = `2026010${i}-030000`;
      put(c.out, `${id}.tar.gz`, "x");
      put(c.out, `${id}.json`, JSON.stringify({ id, createdAt: `2026-01-0${i}T03:00:00Z`, archive: { bytes: 1, sha256: "x" } }));
    }
    assert.deepEqual(run(c.env, "prune").json.sort(), ["20260101-030000", "20260102-030000", "20260103-030000"]);
  });

  await step("backup program: a copy to S3-compatible storage is signed (AWS Signature V4) and the secret never sent", async () => {
    const seen: { method?: string; url?: string; auth: string; bytes: number }[] = [];
    const server = createServer((req, res) => {
      let bytes = 0;
      req.on("data", (d: Buffer) => (bytes += d.length));
      req.on("end", () => {
        seen.push({ method: req.method, url: req.url, auth: String(req.headers.authorization), bytes });
        res.end();
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    try {
      const env = { ...a.env, BACKUP_S3_ENDPOINT: `http://127.0.0.1:${port}`, BACKUP_S3_BUCKET: "bk", BACKUP_S3_ACCESS_KEY_ID: "AKIDEXAMPLE", BACKUP_S3_SECRET_ACCESS_KEY: S3_SECRET, BACKUP_S3_PREFIX: "shop", BACKUP_S3_REGION: "eu-west-1" };
      const out = await new Promise<string>((resolve, reject) => execFile(process.execPath, [program, "now"], { env }, (e, stdout) => (e ? reject(e) : resolve(stdout))));
      const made = JSON.parse(out.trim().split("\n").pop()!) as { id: string; s3: { ok: boolean } };
      assert.equal(made.s3.ok, true);
      assert.deepEqual(seen.map((s) => `${s.method} ${s.url}`), [`PUT /bk/shop/${made.id}.tar.gz`, `PUT /bk/shop/${made.id}.json`]);
      assert.match(seen[0]!.auth, /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/eu-west-1\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
      assert.ok(!JSON.stringify(seen).includes(S3_SECRET));
      assert.equal(run(a.env, "list").json.find((x: { id: string }) => x.id === made.id).elsewhere, true);
    } finally {
      server.close();
    }
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
