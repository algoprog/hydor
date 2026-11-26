// Checks for the sweep of apps a crash left behind (sweep.ts): an app whose pid file names a live process that still runs
// an app's server is stopped with everything in its group, and nothing else is ever touched: an unrelated process, a pid
// reused by another program, a garbage file, an app of a Hydor that is still running. And that the host writes the pid
// file when an app starts and takes it away when it ends. Build and run with a scratch folder (ports 4337 to 4339):
//   OUTDIR=dist/dev node scripts/build-server.mjs server/webapps/sweep-test.ts
//   mkdir -p /tmp/hydor-webapps-data-x && DATA_DIR=/tmp/hydor-webapps-data-x node dist/dev/sweep-test.js
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createHost } from "./host.ts";
import { processInfo, sweepOrphans, writePid, type PidFile } from "./sweep.ts";
import { writeTestApp } from "./test-apps.ts";

if (!process.env.DATA_DIR?.startsWith("/tmp/")) {
  console.error("Run with DATA_DIR=/tmp/… so nothing touches real data.");
  process.exit(2);
}

const scratch = fs.mkdtempSync(path.join(process.env.DATA_DIR, "sweep-"));
const root = path.join(scratch, "webapps");
fs.mkdirSync(root);

let passed = 0;
const step = async (name: string, fn: () => Promise<void> | void) => {
  await fn();
  passed++;
  console.log(`ok - ${name}`);
};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  // A zombie is dead for this purpose.
  const i = processInfo(pid);
  return !!i && i.cmdline !== "";
};
const until = async (what: string, fn: () => boolean, ms = 8000) => {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) assert.fail(`Waited ${ms} ms for ${what}`);
    await sleep(40);
  }
};

const started: ChildProcess[] = [];
/** An app's server as a crash would have left it: its own group, a command line that has the server's path, and a child in its group. */
function orphan(id: string): { pid: number; dir: string; grandchild: () => number } {
  const dir = path.join(scratch, "apps", id);
  fs.mkdirSync(path.join(dir, ".output", "server"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, ".output", "server", "index.mjs"),
    `import { spawn } from 'node:child_process';
import fs from 'node:fs';
const g = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
fs.writeFileSync(${JSON.stringify(path.join(dir, "grandchild"))}, String(g.pid));
setInterval(() => {}, 1000);
`,
  );
  const child = spawn(process.execPath, [".output/server/index.mjs"], { cwd: dir, detached: true, stdio: "ignore", env: { ...process.env, HYDOR_APP_PROCESS: id } });
  child.unref();
  started.push(child);
  return { pid: child.pid!, dir, grandchild: () => Number(fs.readFileSync(path.join(dir, "grandchild"), "utf8")) };
}
/** A process that is nothing of an app's. */
function bystander(): ChildProcess {
  const c = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { detached: true, stdio: "ignore" });
  c.unref();
  started.push(c);
  return c;
}
/** A pid file as a server that has since died wrote it. */
function crashed(id: string, pid: number, dir: string, change: Partial<PidFile> = {}) {
  writePid(root, id, pid, dir);
  const file = path.join(root, id, "pid");
  const f = JSON.parse(fs.readFileSync(file, "utf8")) as PidFile;
  f.server = { pid: 2 ** 22 + 12345, start: "1" };
  fs.writeFileSync(file, JSON.stringify({ ...f, ...change }));
}
const pidFileOf = (id: string) => path.join(root, id, "pid");

const host = createHost({ dataDir: scratch, idleMs: 0, sandbox: false, ports: [4337, 4339], startTimeoutMs: 15_000 });

try {
  await step("process facts: a start time and a command line for a live process, nothing for a dead or impossible one", async () => {
    const me = processInfo(process.pid)!;
    assert.ok(me.start && me.cmdline.includes("node"));
    assert.equal(processInfo(process.pid)!.start, me.start, "the same each time");
    assert.equal(processInfo(0), null);
    assert.equal(processInfo(-5), null);
    assert.equal(processInfo(1.5), null);
    const c = spawn(process.execPath, ["-e", ""]);
    await new Promise((r) => c.on("close", r));
    assert.equal(processInfo(c.pid!), null);
  });

  await step("an app left behind is stopped with everything in its group, and its file goes", async () => {
    const o = orphan("left1");
    await until("the app's own child", () => fs.existsSync(path.join(o.dir, "grandchild")));
    const g = o.grandchild();
    assert.ok(alive(o.pid) && alive(g));
    crashed("left1", o.pid, o.dir);
    const swept = await sweepOrphans(root, { killAfterMs: 3000 });
    assert.deepEqual(swept.map((s) => [s.id, s.pid, s.result]), [["left1", o.pid, "stopped"]]);
    await until("it to be gone", () => !alive(o.pid) && !alive(g));
    assert.equal(fs.existsSync(pidFileOf("left1")), false);
  });

  await step("an app that ignores SIGTERM is killed after the wait", async () => {
    const dir = path.join(scratch, "apps", "stubborn");
    fs.mkdirSync(path.join(dir, ".output", "server"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".output", "server", "index.mjs"), "process.on('SIGTERM',()=>{});setInterval(()=>{},1000);");
    const c = spawn(process.execPath, [".output/server/index.mjs"], { cwd: dir, detached: true, stdio: "ignore", env: { ...process.env, HYDOR_APP_PROCESS: "stubborn" } });
    c.unref();
    started.push(c);
    await sleep(300);
    crashed("stubborn", c.pid!, dir);
    const t = Date.now();
    const swept = await sweepOrphans(root, { killAfterMs: 600 });
    assert.equal(swept[0].result, "stopped");
    assert.ok(Date.now() - t >= 550, "it was given the time first");
    await until("it to be gone", () => !alive(c.pid!));
  });

  await step("an unrelated process the file names is left alone (the file is not an app's any more)", async () => {
    const b = bystander();
    await sleep(200);
    crashed("bystander", b.pid!, path.join(scratch, "apps", "nothing"));
    const swept = await sweepOrphans(root);
    assert.deepEqual(swept.map((s) => [s.id, s.result]), [["bystander", "gone"]]);
    assert.ok(alive(b.pid!), "still running");
    assert.equal(fs.existsSync(pidFileOf("bystander")), false, "its file went");
    // Our own process: named by a file, never touched.
    crashed("me", process.pid, scratch);
    assert.deepEqual((await sweepOrphans(root)).map((s) => s.result), ["gone"]);
    assert.ok(alive(process.pid));
  });

  await step("a pid reused by another program is left alone, even one that runs an app's server of its own", async () => {
    const o = orphan("reused");
    await until("it to run", () => fs.existsSync(path.join(o.dir, "grandchild")));
    // The file was written for an earlier process with this pid: another start time.
    crashed("reused", o.pid, o.dir, { start: "1" });
    const swept = await sweepOrphans(root);
    assert.deepEqual(swept.map((s) => s.result), ["gone"]);
    assert.ok(alive(o.pid), "not touched");
    // Stop it by the pid we started.
    process.kill(-o.pid, "SIGKILL");
    await until("it to be gone", () => !alive(o.pid));
  });

  await step("an app of a Hydor that is still running (this one) is left alone", async () => {
    const o = orphan("mine");
    await until("it to run", () => fs.existsSync(path.join(o.dir, "grandchild")));
    writePid(root, "mine", o.pid, o.dir); // server: this process, which is alive
    const f = JSON.parse(fs.readFileSync(pidFileOf("mine"), "utf8")) as PidFile;
    assert.equal(f.server.pid, process.pid);
    const swept = await sweepOrphans(root);
    assert.deepEqual(swept.map((s) => [s.result, s.why?.includes("still running")]), [["left", true]]);
    assert.ok(alive(o.pid));
    assert.equal(fs.existsSync(pidFileOf("mine")), true, "its file stays");
    // The same pid of a server that is not this one's start: it is a dead server's file.
    fs.writeFileSync(pidFileOf("mine"), JSON.stringify({ ...f, server: { pid: process.pid, start: "1" } }));
    assert.deepEqual((await sweepOrphans(root, { killAfterMs: 2000 })).map((s) => s.result), ["stopped"]);
    await until("it to be gone", () => !alive(o.pid));
  });

  await step("a garbage or unreadable pid file is removed and no process is touched; folders without one are ignored", async () => {
    const b = bystander();
    fs.mkdirSync(path.join(root, "junk1"));
    fs.writeFileSync(pidFileOf("junk1"), "not json");
    fs.mkdirSync(path.join(root, "junk2"));
    fs.writeFileSync(pidFileOf("junk2"), JSON.stringify({ pid: b.pid, start: "x" }));
    fs.mkdirSync(path.join(root, "junk3"));
    fs.writeFileSync(pidFileOf("junk3"), JSON.stringify({ pid: "1", start: "x", dir: "/", server: { pid: 1 } }));
    fs.mkdirSync(path.join(root, "nofile"));
    fs.writeFileSync(path.join(root, "stray-file"), "x");
    const swept = await sweepOrphans(root);
    assert.deepEqual(swept, [], "nothing to report");
    for (const id of ["junk1", "junk2", "junk3"]) assert.equal(fs.existsSync(pidFileOf(id)), false, id);
    assert.ok(alive(b.pid!));
    assert.deepEqual(await sweepOrphans(path.join(scratch, "no-such-folder")), []);
  });

  await step("the host writes a pid file when an app starts (its pid, this server) and takes it away when the app ends or is stopped", async () => {
    const dir = path.join(scratch, "apps", "hosted");
    writeTestApp(dir, "import http from 'node:http';http.createServer((q,s)=>{s.end('ok')}).listen(Number(process.env.PORT),'127.0.0.1');");
    const app = { id: "hosted", slug: "hosted", dir };
    await host.ensure(app);
    const st = host.status("hosted");
    const f = JSON.parse(fs.readFileSync(pidFileOf("hosted"), "utf8")) as PidFile;
    assert.equal(f.pid, st.pid);
    assert.equal(f.server.pid, process.pid);
    assert.equal(f.dir, fs.realpathSync(dir));
    assert.equal(f.start, processInfo(st.pid!)!.start);
    assert.equal(fs.statSync(pidFileOf("hosted")).mode & 0o777, 0o600);
    // A sweep while it runs (this server's own app) does nothing to it.
    assert.deepEqual((await sweepOrphans(root)).map((s) => [s.id, s.result]), [["hosted", "left"]]);
    assert.equal(host.status("hosted").state, "running");
    await host.stop("hosted");
    assert.equal(fs.existsSync(pidFileOf("hosted")), false, "gone with the app");
    // Killed from outside: the exit takes the file too.
    const port = await host.ensure(app);
    assert.ok(port);
    process.kill(-host.status("hosted").pid!, "SIGKILL");
    await until("the file to go", () => !fs.existsSync(pidFileOf("hosted")));
    await host.stop("hosted");
  });

  await step("killNow ends every running app's group at once, without waiting", async () => {
    const dir = path.join(scratch, "apps", "hosted");
    await host.ensure({ id: "hosted", slug: "hosted", dir });
    const pid = host.status("hosted").pid!;
    assert.ok(alive(pid));
    host.killNow();
    await until("it to end", () => !alive(pid));
    await host.stop("hosted");
  });
} finally {
  for (const c of started) {
    try {
      if (c.pid) process.kill(-c.pid, "SIGKILL");
    } catch {}
  }
  await host.close().catch(() => {});
  fs.rmSync(scratch, { recursive: true, force: true });
}

console.log(`\n${passed} checks passed`);
process.exit(0);
