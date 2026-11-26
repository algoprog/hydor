// The text a new server is given and the connection it is for (firstboot.ts), with a stand-in for SSH: the text holds both
// keys and what prepare installs; the machine that shows the text's identity is connected and Hydor's private half of it
// is deleted; one that shows another identity, or cannot prove the one it shows, gets nothing and is not recorded.
// Needs ssh-keygen. No network.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/webapps/remote/firstboot-test.ts
//   DATA_DIR=<scratch folder> node dist/dev/firstboot-test.js
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { connectFirst, fingerprintOf, firstTextFor, forgetFirst } from "./firstboot.ts";
import { checkHost, listHosts, pendingKey, removeHost } from "./hosts.ts";
import { SshRefused, type Connect } from "./ssh.ts";

const scratch = fs.mkdtempSync(path.join(process.env.DATA_DIR || os.tmpdir(), "firstboot-"));
const dir = path.join(scratch, "server-hosts");
let passed = 0;
const step = async (name: string, fn: () => Promise<void> | void) => {
  await fn();
  passed++;
  console.log(`ok - ${name}`);
};

const keyPair = (name: string) => {
  const file = path.join(scratch, name);
  execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", name, "-f", file]);
  return fs.readFileSync(`${file}.pub`, "utf8").trim();
};
const lineOf = (publicKey: string, address = "203.0.113.7") => `${address} ${publicKey.split(" ").slice(0, 2).join(" ")}`;

/** A stand-in server: what it offers to a scan, how it answers a connection, and every script it was given. */
const machine = { offers: "", real: "", next: "", setting: "setup=done\nstatus: done", docker: "29.1.3", down: false, ran: [] as string[], fail: "" as "" | "make" | "swap" | "again" };
let made = 0;
const scan = async (t: { address: string }) => {
  if (machine.down) throw new SshRefused("unreachable", "Could not read a key.");
  return [lineOf(machine.offers, t.address)];
};
const LOOK = () => `os_id=ubuntu\nos_name=Ubuntu 24.04\narch=x86_64\nuser=hydor\nroot=0\nsudo=1\ndocker_cli=1\ndocker_server=${machine.docker}\ndocker_denied=0\ncompose=2.40.0\nmem_kb=2000000\nswap_kb=0\ndisk_kb=40000000\nport80=0\nport443=0\ncron=1\nufw=active\n`;
/** As ssh is told to: only a machine that holds the key recorded for it is talked to. */
const connect: Connect = (hostsDir) => {
  const reply = async (script: string) => {
    const known = fs.readFileSync(path.join(hostsDir, "known_hosts"), "utf8");
    if (machine.down) throw new SshRefused("unreachable", "Could not reach it.");
    if (!known.includes(machine.real.split(" ")[1]!)) throw new SshRefused("key-changed", "Not the key you accepted.");
    machine.ran.push(script);
    if (script.startsWith("# hydor:identity-make")) {
      if (machine.fail === "make") return { code: 1, out: "", err: "sudo: a password is required" };
      machine.next = keyPair(`rotated-${++made}`);
      return { code: 0, out: `${machine.next.split(" ").slice(0, 2).join(" ")}\n`, err: "" };
    }
    if (script.startsWith("# hydor:identity-swap")) {
      if (machine.fail === "swap") throw new SshRefused("unreachable", "Connection closed.");
      machine.offers = machine.real = machine.next;
      return { code: 0, out: "", err: "" };
    }
    if (script.startsWith("# hydor:identity-check")) {
      if (machine.fail === "again") throw new SshRefused("unreachable", "Connection refused.");
      return { code: 0, out: `${machine.real}\n`, err: "" };
    }
    return { code: 0, out: script.startsWith("# hydor:firstboot") ? `${machine.setting}\n` : LOOK(), err: "" };
  };
  return { run: reply, runWithFile: reply, runToFile: reply, close: async () => {} };
};
const o = { scan, connect, pause: 1 };
/** What the record of the first server insists on. */
const insisted = () => [listHosts(dir)[0]!.fingerprint, fs.readFileSync(path.join(dir, "known_hosts"), "utf8")] as const;

/** The text's own parts, read as YAML lays them out (there is no YAML reader here; the Docker walk gives it to cloud-init). */
const block = (text: string, key: string): string => {
  const lines = text.split("\n");
  const at = lines.findIndex((l) => l.trim() === `${key}: |`);
  assert.ok(at >= 0, key);
  const depth = lines[at + 1]!.length - lines[at + 1]!.trimStart().length;
  const out: string[] = [];
  for (const l of lines.slice(at + 1)) {
    if (l && !l.startsWith(" ".repeat(depth))) break;
    out.push(l.slice(depth));
  }
  return `${out.join("\n").trimEnd()}\n`;
};
const value = (text: string, key: string) => new RegExp(`^\\s*${key}: (.+)$`, "m").exec(text)![1]!;
const parts = (text: string) => ({ public: value(text, "ed25519_public"), private: block(text, "ed25519_private"), setup: block(text, "content"), access: /ssh_authorized_keys:\n\s+- (.+)\n/.exec(text)![1]! });

let identity = "";
const APP = "0123456789abcdef";

await step("the text gives the machine the identity and Hydor's key, no password sign-in, and installs what prepare installs", async () => {
  const text = await firstTextFor(dir, APP);
  assert.ok(text.startsWith("#cloud-config\n"));
  const y = parts(text);
  identity = y.public;
  assert.match(text, /^ssh_deletekeys: true$/m);
  assert.match(text, /^ssh_pwauth: false$/m);
  assert.equal(pendingKey(dir, `${APP}-identity`).publicKey, identity);
  assert.equal(y.private.trim(), pendingKey(dir, `${APP}-identity`).privateKey);
  // The private half in the text is the one of the public half beside it.
  const check = path.join(scratch, "from-text");
  fs.writeFileSync(check, y.private, { mode: 0o600 });
  assert.equal(execFileSync("ssh-keygen", ["-y", "-f", check], { encoding: "utf8" }).split(" ")[1], identity.split(" ")[1]);
  assert.equal(y.access, pendingKey(dir, `${APP}-first`).publicKey);
  const setup = y.setup;
  for (const part of ["echo running > /var/lib/hydor-setup.state", "echo done > /var/lib/hydor-setup.state", "docker-ce ", "docker-compose-plugin", "usermod -aG docker 'hydor'", "install -y -qq cron", "ufw allow 22/tcp", "ufw allow 80/tcp", "ufw allow 443/tcp", "ufw --force enable"]) assert.ok(setup.includes(part), part);
  execFileSync("bash", ["-n"], { input: setup });
  assert.ok(Buffer.byteLength(text) < 32 * 1024, "within Hetzner's limit, the smallest read");
  assert.equal(await firstTextFor(dir, APP), text, "the same text until a server has connected with it");
});

await step("a machine that does not answer yet is waited for, and nothing is recorded", async () => {
  machine.down = true;
  assert.deepEqual(await connectFirst(dir, APP, "203.0.113.7", o), { state: "starting" });
  assert.deepEqual(listHosts(dir), []);
  machine.down = false;
});

await step("a machine with another identity is refused: nothing is sent to it, nothing recorded, the text still good", async () => {
  machine.offers = machine.real = keyPair("stranger");
  assert.deepEqual(await connectFirst(dir, APP, "203.0.113.7", o), { state: "other" });
  assert.deepEqual([listHosts(dir), machine.ran], [[], []]);
  assert.ok(pendingKey(dir, `${APP}-identity`).privateKey);
});

await step("a machine that shows the identity and does not hold it is refused too", async () => {
  machine.offers = identity;
  assert.deepEqual(await connectFirst(dir, APP, "203.0.113.7", o), { state: "other" });
  assert.deepEqual([listHosts(dir), machine.ran], [[], []]);
  assert.ok(pendingKey(dir, `${APP}-identity`).privateKey);
});

await step("a swap that fails half-way takes nothing: no server recorded, the same text still good", async () => {
  machine.real = machine.offers = identity;
  for (const why of ["make", "swap", "again"] as const) {
    machine.fail = why;
    assert.deepEqual(await connectFirst(dir, APP, "203.0.113.7", o), { state: "unsafe", why }, why);
    assert.deepEqual(listHosts(dir), [], why);
    assert.ok(pendingKey(dir, `${APP}-identity`).privateKey, why);
    assert.ok(!fs.existsSync(path.join(dir, "first", APP)), "the folder the try was made in is gone");
    // "again": the server had taken its new identity before the connection was lost.
    if (why !== "again") machine.real = machine.offers = identity;
  }
});

await step("tried again, a server that had already made the change is known by what it made then", async () => {
  machine.fail = "";
  machine.setting = "setup=running\nstatus: disabled";
  assert.notEqual(machine.real, identity);
  const before = machine.ran.filter((s) => s.startsWith("# hydor:identity-make")).length;
  assert.deepEqual(await connectFirst(dir, APP, "203.0.113.7", o), { state: "starting", host: "my-server" });
  assert.equal(machine.ran.filter((s) => s.startsWith("# hydor:identity-make")).length, before, "not made a second time");
  assert.equal(insisted()[0], fingerprintOf(machine.real));
  removeHost(dir, "my-server");
  await firstTextFor(dir, APP);
});

await step("the right machine connects while it is still setting up: it makes itself a new identity, the only one insisted on, and Hydor's keys of the text are gone", async () => {
  const y = parts(await firstTextFor(dir, APP));
  identity = y.public;
  machine.real = machine.offers = identity;
  machine.setting = "setup=running\nstatus: disabled";
  assert.deepEqual(await connectFirst(dir, APP, "root@203.0.113.7", o), { state: "starting", host: "my-server" });
  const [h] = listHosts(dir);
  const [fingerprint, known] = insisted();
  assert.notEqual(machine.real, identity);
  assert.deepEqual([h!.ssh, h!.state, fingerprint], ["hydor@203.0.113.7", "recorded", fingerprintOf(machine.real)]);
  assert.ok(known.includes(machine.real.split(" ")[1]!) && !known.includes(identity.split(" ")[1]!), "the text's identity is not known any more");
  for (const id of ["identity", "first", "moved"]) assert.deepEqual(pendingKey(dir, `${APP}-${id}`), { publicKey: "", privateKey: "" }, id);
  // A new identity, whose private half never left the machine: nothing of it is on this computer.
  assert.ok(!fs.existsSync(path.join(dir, "first", APP)));
});

await step("asked again it is looked over: waited for while its setup goes on, unfinished once that ended with something missing, then ready", async () => {
  machine.docker = "";
  for (const going of ["setup=waiting\nstatus: running", "setup=\nstatus: not started", "setup=\nstatus: running", "setup=running"]) {
    machine.setting = going;
    assert.equal((await connectFirst(dir, APP, "203.0.113.7", o)).state, "starting", going);
  }
  for (const over of ["setup=failed\nstatus: done", "setup=running\nstatus: error", "setup=waiting\nstatus: done", "setup=\nstatus: disabled"]) {
    machine.setting = over;
    assert.equal((await connectFirst(dir, APP, "203.0.113.7", o)).state, "unfinished", over);
  }
  machine.setting = "setup=done\nstatus: done";
  machine.docker = "29.1.3";
  const r = await connectFirst(dir, APP, "203.0.113.7", o);
  assert.deepEqual([r.state, r.host, r.check!.ok], ["ready", "my-server", true]);
  assert.equal(listHosts(dir).length, 1);
});

await step("someone with the text, posing as the server with its first identity, is refused", async () => {
  const mine = machine.real;
  machine.real = machine.offers = identity;
  const ran = machine.ran.length;
  assert.deepEqual(await connectFirst(dir, APP, "203.0.113.7", o), { state: "other" });
  await assert.rejects(checkHost(dir, "my-server", { connect }), (e: unknown) => e instanceof SshRefused && e.ssh === "key-changed");
  assert.equal(machine.ran.length, ran, "nothing was run on it");
  assert.equal(listHosts(dir)[0]!.fingerprint, fingerprintOf(mine));
  machine.real = machine.offers = mine;
});

await step("a used text connects no other server; a new one is made, for a server made anew at the same address", async () => {
  await assert.rejects(connectFirst(dir, APP, "203.0.113.9", o), /has been used/);
  const before = listHosts(dir)[0]!.fingerprint;
  const y = parts(await firstTextFor(dir, APP));
  assert.notEqual(y.public, identity);
  machine.offers = machine.real = y.public;
  // Apps deployed to the record: it is never replaced by another machine's.
  assert.deepEqual(await connectFirst(dir, APP, "203.0.113.7", { ...o, deployed: () => true }), { state: "other" });
  assert.equal(listHosts(dir)[0]!.fingerprint, before);
  assert.equal((await connectFirst(dir, APP, "203.0.113.7", o)).state, "ready");
  assert.equal(listHosts(dir).length, 1);
  assert.equal(listHosts(dir)[0]!.fingerprint, fingerprintOf(machine.real));
});

await step("two asks at once are one attempt: the server is recorded once", async () => {
  machine.offers = machine.real = parts(await firstTextFor(dir, APP)).public;
  const both = await Promise.all([connectFirst(dir, APP, "203.0.113.20", o), connectFirst(dir, APP, "203.0.113.20", o)]);
  assert.deepEqual(both.map((r) => r.state), ["ready", "ready"]);
  assert.equal(listHosts(dir).filter((h) => h.address === "203.0.113.20").length, 1);
});

await step("removing the app removes the keys that waited", async () => {
  await firstTextFor(dir, APP);
  forgetFirst(dir, APP);
  assert.deepEqual(fs.readdirSync(path.join(dir, "pending")).filter((f) => f.startsWith(`${APP}-`)), []);
});

fs.rmSync(scratch, { recursive: true, force: true });
console.log(`\n${passed} checks passed`);
