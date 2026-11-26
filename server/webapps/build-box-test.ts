// Checks for where an app's own build runs (build-box.ts): a build line cannot read a file outside the app's folder or
// write there, its home aside; it reaches no network but the package registry (a stand-in here, on loopback), and npm
// installs from it as usual; what it tried besides is said in the build's log; and where there is no sandbox, or it
// cannot cut the network, that is what is said before a build. No network, no real registry. Port 4781.
// Build it, then run it with HOME and DATA_DIR set to scratch folders under the system's temporary folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/webapps/build-box-test.ts
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { allowedHost, boxed, buildAccess, buildBoxOf, buildBoxSay, registriesFor, runBoxed } from "./build-box.ts";
import { createBuilds } from "./build.ts";
import { buildEnv, nodeBin } from "./run-app.ts";

const temp = [os.tmpdir(), fs.realpathSync(os.tmpdir())];
for (const v of ["DATA_DIR", "HOME"]) if (!temp.some((t) => process.env[v]?.startsWith(t + path.sep))) (console.error("Run with HOME and DATA_DIR in scratch folders under the temporary folder, so nothing touches real data."), process.exit(2));
// The registries asked for below are the ones this test says.
delete process.env.npm_config_registry;
delete process.env.NPM_CONFIG_REGISTRY;
const scratch = fs.mkdtempSync(path.join(process.env.DATA_DIR!, "box-"));
let passed = 0;
const step = async (name: string, fn: () => Promise<void> | void) => {
  await fn();
  passed++;
  console.log(`ok - ${name}`);
};
const PORT = 4781;
const REGISTRY = `http://127.0.0.1:${PORT}`;

const app = path.join(scratch, "app");
const home = path.join(scratch, "home");
fs.mkdirSync(app, { recursive: true });
// What is "outside" stands in /var/tmp: the sandbox has a /tmp of its own, which would hide whether the real one was
// reached (a write there lands in the sandbox's and is thrown away with it).
const outside = fs.mkdtempSync("/var/tmp/hydor-box-test-");
process.on("exit", () => fs.rmSync(outside, { recursive: true, force: true }));
const secret = path.join(outside, "owners.txt");
fs.writeFileSync(secret, "only the owner's\n");

const run = (script: string, env: Record<string, string> = {}, extra: Partial<Parameters<typeof runBoxed>[0]> = {}) =>
  runBoxed({ dir: app, home, argv: ["/bin/sh", "-c", script], env: { ...buildEnv(nodeBin(), home), ...env }, timeoutMs: 120_000, ...extra });
const said = (r: { tail: string[] }) => r.tail.join("\n");

await step("which registries a folder's build may reach, from what is in it", () => {
  const dir = path.join(scratch, "kinds");
  fs.mkdirSync(path.join(dir, "api"), { recursive: true });
  fs.mkdirSync(path.join(dir, "node_modules", "x"), { recursive: true });
  assert.deepEqual(registriesFor(dir, {}), []);
  fs.writeFileSync(path.join(dir, "package.json"), "{}");
  fs.writeFileSync(path.join(dir, "api", "requirements.txt"), "");
  // What an installed package holds is not the app's own.
  fs.writeFileSync(path.join(dir, "node_modules", "x", "go.mod"), "");
  assert.deepEqual(registriesFor(dir, {}), ["registry.npmjs.org", "pypi.org", "files.pythonhosted.org"]);
  assert.deepEqual(registriesFor(dir, { npm_config_registry: "https://mirror.example:8443/npm/", PIP_INDEX_URL: "https://pip.example/simple" }), ["mirror.example:8443", "pip.example"]);
  fs.writeFileSync(path.join(dir, "go.mod"), "");
  fs.writeFileSync(path.join(dir, "Cargo.toml"), "");
  assert.ok(registriesFor(dir, {}).includes("proxy.golang.org") && registriesFor(dir, {}).includes("static.crates.io"));
  assert.equal(allowedHost(["registry.npmjs.org"], "Registry.npmjs.org", 443), true);
  assert.equal(allowedHost(["registry.npmjs.org"], "registry.npmjs.org", 22), false);
  assert.equal(allowedHost(["registry.npmjs.org"], "evil.registry.npmjs.org", 443), false);
  assert.equal(allowedHost(["127.0.0.1:4781"], "127.0.0.1", 4781), true);
  assert.equal(allowedHost(["127.0.0.1:4781"], "127.0.0.1", 4782), false);
});

await step("what is said before a build, in each of the three ways", () => {
  assert.equal(buildAccess(false), "own");
  assert.deepEqual(buildBoxOf(app, false), { access: "own", registries: [] });
  assert.match(buildBoxSay({ access: "own", registries: [] }), /no sandbox on this computer: the build runs with your own access/);
  assert.match(buildBoxSay({ access: "open", registries: [] }), /cannot limit the network/);
  assert.match(buildBoxSay({ access: "registry", registries: ["registry.npmjs.org"] }), /reaches only the package registry \(registry\.npmjs\.org\)/);
});

if (buildAccess() === "own") {
  console.log("skip - this computer has no bubblewrap: the sandbox itself is not tried");
  process.exit(0);
}
console.log(`    (here a build runs: ${buildAccess()})`);

await step("a build line cannot read a file outside the app's folder", async () => {
  const r = await run(`cat ${secret}`);
  assert.notEqual(r.code, 0, said(r));
  assert.doesNotMatch(said(r), /only the owner's/);
  assert.match(said(r), /No such file/);
  // Nor the rest of what is around the app: only its folder and its home are there.
  fs.writeFileSync(path.join(scratch, "beside.txt"), "not the app's\n");
  const around = await run(`ls ${scratch}`);
  assert.deepEqual(around.tail.filter(Boolean).sort(), ["app", "home"], said(around));
});

await step("nor write outside it; the app's folder and the build's home are written", async () => {
  const out = path.join(outside, "made-by-build");
  const r = await run(`echo x > ${out}`);
  assert.notEqual(r.code, 0, said(r));
  assert.equal(fs.existsSync(out), false);
  for (const to of [secret, "/usr/hydor-box-test", "/hydor-box-test"]) assert.notEqual((await run(`echo x >> ${to}`)).code, 0, to);
  assert.equal(fs.readFileSync(secret, "utf8"), "only the owner's\n");
  // Beside the app under /tmp: what is written there is the sandbox's own and gone with it.
  await run(`echo x > ${path.join(scratch, "beside-made")}`);
  assert.equal(fs.existsSync(path.join(scratch, "beside-made")), false);
  const ok = await run(`echo made > built.txt && echo cached > "$HOME/c.txt"`);
  assert.equal(ok.code, 0, said(ok));
  assert.equal(fs.readFileSync(path.join(app, "built.txt"), "utf8"), "made\n");
  assert.equal(fs.readFileSync(path.join(home, "c.txt"), "utf8"), "cached\n");
});

if (buildAccess() !== "registry") {
  console.log("skip - the sandbox here cannot cut the network: the registry's way is not tried");
  process.exit(0);
}

// A registry of one small package, and something else on this computer that a build must not reach.
const pkg = path.join(scratch, "pkg");
fs.mkdirSync(pkg, { recursive: true });
fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "box-made-up", version: "1.0.0", main: "index.js" }));
fs.writeFileSync(path.join(pkg, "index.js"), "module.exports = 'from the registry';\n");
execFileSync("npm", ["pack", "--pack-destination", scratch], { cwd: pkg, stdio: "ignore", env: { ...process.env, npm_config_cache: path.join(scratch, "pack-cache") } });
const tarball = fs.readFileSync(path.join(scratch, "box-made-up-1.0.0.tgz"));
const asked: string[] = [];
const registry = http.createServer((req, res) => {
  asked.push(req.url ?? "");
  if (req.url === "/box-made-up")
    return void res.writeHead(200, { "content-type": "application/json" }).end(
      JSON.stringify({ name: "box-made-up", "dist-tags": { latest: "1.0.0" }, versions: { "1.0.0": { name: "box-made-up", version: "1.0.0", dist: { tarball: `${REGISTRY}/box-made-up/-/box-made-up-1.0.0.tgz`, integrity: `sha512-${crypto.createHash("sha512").update(tarball).digest("base64")}` } } } }),
    );
  if (req.url?.endsWith(".tgz")) return void res.writeHead(200, { "content-type": "application/octet-stream" }).end(tarball);
  res.writeHead(404).end("{}");
});
const elsewhere = http.createServer((_req, res) => res.end("another of this computer's servers"));
await new Promise<void>((r) => registry.listen(PORT, "127.0.0.1", r));
await new Promise<void>((r) => elsewhere.listen(0, "127.0.0.1", r));
const other = (elsewhere.address() as { port: number }).port;
fs.writeFileSync(path.join(app, "package.json"), JSON.stringify({ name: "made", version: "0.0.0", private: true, dependencies: { "box-made-up": "1.0.0" } }));
const env = { npm_config_registry: `${REGISTRY}/` };

await step("npm installs from the registry through Hydor, and the build uses what it got", async () => {
  const r = await run(`npm install --no-audit --no-fund && node -e "console.log(require('box-made-up'))"`, env);
  assert.equal(r.code, 0, said(r));
  assert.match(said(r), /from the registry/);
  assert.ok(asked.includes("/box-made-up"), asked.join(" "));
});

// What a build does to reach out: with the proxy it was told of, and without it.
const reach = path.join(app, "reach.cjs");
fs.writeFileSync(
  reach,
  `const http = require("http"); const net = require("net");
const [how, host, port] = process.argv.slice(2);
if (how === "direct") { const s = net.connect(Number(port), host, () => { console.log("REACHED"); process.exit(0); }); s.on("error", (e) => { console.log("no:" + e.code); process.exit(3); }); }
else { const p = new URL(process.env.HTTP_PROXY); const r = http.request({ host: p.hostname, port: p.port, path: "http://" + host + ":" + port + "/", method: "GET" }, (res) => { let b = ""; res.on("data", (d) => (b += d)); res.on("end", () => { console.log(res.statusCode + " " + b); process.exit(res.statusCode < 300 ? 0 : 3); }); }); r.on("error", (e) => { console.log("no:" + e.code); process.exit(3); }); r.end(); }
`,
);

await step("nothing else is reached: not directly, and not through the proxy, which says so in the build's output", async () => {
  for (const [how, host, port] of [["direct", "127.0.0.1", other], ["direct", "93.184.215.14", 443], ["direct", "127.0.0.1", PORT]] as const) {
    const r = await run(`node reach.cjs ${how} ${host} ${port}`, env);
    assert.equal(r.code, 3, `${how} ${host}:${port} ${said(r)}`);
    assert.doesNotMatch(said(r), /REACHED/);
  }
  const via = await run(`node reach.cjs proxy 127.0.0.1 ${other}`, env);
  assert.equal(via.code, 3, said(via));
  assert.match(said(via), /403 Hydor's build sandbox does not reach 127\.0\.0\.1:\d+: a build reaches only 127\.0\.0\.1:4781/);
  assert.match(said(via), /This build tried to reach 127\.0\.0\.1:\d+; builds may only reach the package registry\. Take what it needs from the registry/);
  // A tunnel to anywhere else is refused the same way, and no name is looked up inside.
  const tunnel = await run(`node -e "const http=require('http');const p=new URL(process.env.HTTPS_PROXY);const r=http.request({host:p.hostname,port:p.port,method:'CONNECT',path:'example.com:443'});r.on('connect',(res)=>{console.log('CONNECT '+res.statusCode);process.exit(0)});r.end()"`, env);
  assert.match(said(tunnel), /CONNECT 403/);
});

await step("with the network open, names can be looked up: the resolver /etc/resolv.conf names is there, wherever it is", async () => {
  const r = await runBoxed({ dir: app, home, argv: ["/bin/sh", "-c", "cat /etc/resolv.conf"], env, network: "open" });
  assert.equal(r.code, 0, said(r));
  assert.match(said(r), /nameserver/);
  const b = await boxed({ dir: app, home, argv: ["true"], env });
  // Without the network there is no use for it, and it is not there.
  const real = fs.realpathSync("/etc/resolv.conf");
  if (!real.startsWith("/etc/") && !real.startsWith("/usr/")) assert.ok(!b.argv.includes(real), b.argv.join(" "));
  await b.close();
});

await step("a folder that names no packages has no network at all", async () => {
  const bare = path.join(scratch, "bare");
  fs.mkdirSync(bare, { recursive: true });
  const b = await boxed({ dir: bare, home, argv: ["/bin/sh", "-c", "env"], env: { PATH: "/usr/bin:/bin" } });
  assert.deepEqual(b.box, { access: "registry", registries: [] });
  assert.ok(!b.argv.includes("--share-net"), b.argv.join(" "));
  await b.close();
});

await step("a build reads the folder's git history and cannot write it (Hydor runs git on it outside)", async () => {
  fs.mkdirSync(path.join(app, ".git"), { recursive: true });
  fs.writeFileSync(path.join(app, ".git", "config"), "[core]\n");
  assert.equal((await run("cat .git/config", env)).code, 0);
  const r = await run("echo '[filter \"x\"] clean = id' >> .git/config", env);
  assert.notEqual(r.code, 0, said(r));
  assert.equal((await run("touch .git/hooks-of-its-own", env)).code === 0, false);
  assert.equal(fs.readFileSync(path.join(app, ".git", "config"), "utf8"), "[core]\n");
  fs.rmSync(path.join(app, ".git"), { recursive: true });
});

await step("a build that wants a file from somewhere else says so: on the build's state, in its log, once", async () => {
  const builds = createBuilds(path.join(scratch, "webapps-refused"));
  const a = { id: "dl", dir: app, kind: "contract" as const, build: `node reach.cjs proxy 127.0.0.1 ${other}` };
  builds.start(a);
  await builds.settled("dl");
  const st = builds.state(a);
  assert.equal(st.state, "failed", st.log.join("\n"));
  assert.deepEqual(st.refused, [`127.0.0.1:${other}`]);
  assert.match(st.log.join("\n"), /This build tried to reach 127\.0\.0\.1:\d+; builds may only reach the package registry/);
  // It is still said after a restart of Hydor, and a build that wants nothing says nothing.
  assert.deepEqual(createBuilds(path.join(scratch, "webapps-refused")).state(a).refused, [`127.0.0.1:${other}`]);
  builds.start({ ...a, build: "true" });
  await builds.settled("dl");
  assert.equal(builds.state({ ...a, build: "true" }).refused, undefined);
});

await step("the key of a build's environment is never on a command line", async () => {
  const b = await boxed({ dir: app, home, argv: ["true"], env: { PATH: "/usr/bin:/bin", SOME_VALUE: "not-on-a-line" } });
  assert.ok(!b.argv.join(" ").includes("not-on-a-line"));
  await b.close();
});

await step("the Build button: a line that reads or writes outside the app fails, and the log says where it ran", async () => {
  const builds = createBuilds(path.join(scratch, "webapps"));
  for (const [id, line] of [["reads", `cat ${secret}`], ["writes", `echo x > ${path.join(outside, "by-button")}`]] as const) {
    const a = { id, dir: app, kind: "contract" as const, build: line };
    assert.equal(builds.start(a).box.access, "registry");
    await builds.settled(id);
    const st = builds.state(a);
    assert.equal(st.state, "failed", st.log.join("\n"));
    assert.match(st.log.join("\n"), /It runs in the sandbox: it reads and writes only the app's folder/);
    assert.doesNotMatch(st.log.join("\n"), /only the owner's/);
  }
  assert.equal(fs.existsSync(path.join(outside, "by-button")), false);
  // Where the host runs no sandbox, the same line runs with the owner's access, and the log says so.
  const open = createBuilds(path.join(scratch, "webapps-own"), false);
  const a = { id: "own", dir: app, kind: "contract" as const, build: `cat ${secret}` };
  assert.equal(open.start(a).box.access, "own");
  await open.settled("own");
  assert.equal(open.state(a).state, "built");
  assert.match(open.state(a).log.join("\n"), /runs with your own access/);
});

registry.close();
elsewhere.close();
console.log(`\n${passed} passed`);
process.exit(0);
