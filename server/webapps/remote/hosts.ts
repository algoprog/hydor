// The servers a person's apps can be launched to. A host is a name for "this user at this address", with a key Hydor makes
// for it and the machine's own key remembered, so that a later connection to a different machine is refused.
//
//   <dir>/hosts.json    name, user, address, port, the public half of Hydor's key, the machine's accepted key, the last check
//   <dir>/keys/<name>   the private key Hydor made (ed25519, mode 600); it never leaves this folder
//   <dir>/known_hosts   the machines' keys the person accepted, in ssh's own format; ssh is told to use this file and no other
//   <dir>/ssh_config    what ssh is given instead of ~/.ssh/config
//
// <dir> is a folder of the caller's (Hydor's data), never ~/.ssh or ~/.config.
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installSteps, judge, lookAt, prepareScript, sshPortsOf, type Finding } from "./host-check.ts";
import { connectSsh, ensureHostsDir, hostLabel, knownHostsFile, SshRefused, type Connect, type HostConnection } from "./ssh.ts";
import { Refused } from "./types.ts";

export const HOST_NAME = /^[a-z][a-z0-9-]{0,30}$/;

export interface SshTarget {
  user: string;
  address: string;
  port: number;
}

/** `user@address`, `user@address:port` or `user@[::1]:port`. */
export function parseSsh(text: string): SshTarget {
  const m = /^([A-Za-z_][A-Za-z0-9_.-]{0,31})@(\[[0-9A-Fa-f:]+\]|[A-Za-z0-9][A-Za-z0-9._-]{0,252})(?::(\d{1,5}))?$/.exec(String(text).trim());
  if (!m) throw new Refused("Write the server as user@address, or user@address:port (like deploy@203.0.113.7).", "input");
  const port = m[3] === undefined ? 22 : Number(m[3]);
  if (port < 1 || port > 65535) throw new Refused("The port is a number from 1 to 65535.", "input");
  return { user: m[1]!, address: m[2]!.replace(/^\[|\]$/g, ""), port };
}

interface Stored {
  user: string;
  address: string;
  port: number;
  publicKey: string;
  addedAt: string;
  hostKey?: { type: string; fingerprint: string };
  checked?: { at: number; ok: boolean; looked: Finding[] };
}

export interface HostInfo {
  name: string;
  /** user@address[:port] */
  ssh: string;
  user: string;
  address: string;
  port: number;
  /** `made`: the key is made and waits to be put on the server and the machine's fingerprint accepted. */
  state: "made" | "recorded";
  /** The line to put on the server (~/.ssh/authorized_keys of that user, or the provider's "SSH keys" box). */
  publicKey: string;
  fingerprint?: string;
  keyType?: string;
  checked?: { at: number; ok: boolean; looked: Finding[] };
}

const hostsFile = (dir: string) => path.join(dir, "hosts.json");
const keyFileOf = (dir: string, name: string) => path.join(dir, "keys", name);

function readAll(dir: string): Record<string, Stored> {
  let text: string;
  try {
    text = fs.readFileSync(hostsFile(dir), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw e;
  }
  try {
    return (JSON.parse(text) as { hosts?: Record<string, Stored> }).hosts ?? {};
  } catch {
    // Never written over with an empty list: the accepted keys would be forgotten without a word.
    throw new Refused(`The file of servers (${path.basename(hostsFile(dir))}) cannot be read: it is not valid JSON.`, "server");
  }
}

function writeAll(dir: string, hosts: Record<string, Stored>): void {
  ensureHostsDir(dir);
  const temp = `${hostsFile(dir)}.tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify({ version: 1, hosts }, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, hostsFile(dir));
}

const info = (name: string, h: Stored): HostInfo => ({
  name,
  ssh: hostLabel(h),
  user: h.user,
  address: h.address,
  port: h.port,
  state: h.hostKey ? "recorded" : "made",
  publicKey: h.publicKey,
  ...(h.hostKey ? { fingerprint: h.hostKey.fingerprint, keyType: h.hostKey.type } : {}),
  ...(h.checked ? { checked: h.checked } : {}),
});

export const listHosts = (dir: string): HostInfo[] =>
  Object.entries(readAll(dir))
    .map(([name, h]) => info(name, h))
    .sort((a, b) => a.name.localeCompare(b.name));

const storedOf = (dir: string, name: string): Stored => {
  const h = readAll(dir)[name];
  if (!h) throw new Refused(`There is no server called ${name}. Add it first.`, "missing");
  return h;
};

export const getHost = (dir: string, name: string): HostInfo => info(name, storedOf(dir, name));

/** A recorded host as a connection is made to it. One whose key was never accepted is refused. */
export function connectionOf(dir: string, name: string): HostConnection {
  const h = storedOf(dir, name);
  if (!h.hostKey) throw new Refused(`The server ${name} is not recorded yet: compare its fingerprint and accept it first.`, "conflict");
  return { name, user: h.user, address: h.address, port: h.port, keyFile: keyFileOf(dir, name), keyType: h.hostKey.type };
}

const run = (program: string, args: string[], timeout = 30_000): Promise<{ code: number; out: string; err: string; missing: boolean }> =>
  new Promise((resolve) => {
    execFile(program, args, { encoding: "utf8", timeout, env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: os.tmpdir() } }, (error, out, err) => {
      resolve({ code: error ? 1 : 0, out, err, missing: (error as NodeJS.ErrnoException | null)?.code === "ENOENT" });
    });
  });

/** Where a key made before its server's address is known is kept: <dir>/pending/<id>. */
const pendingFile = (dir: string, id: string) => {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Refused("That is not a key's name.", "input");
  return path.join(dir, "pending", id);
};

async function makeKey(file: string, comment: string): Promise<void> {
  fs.rmSync(file, { force: true });
  fs.rmSync(`${file}.pub`, { force: true });
  const r = await run("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", comment, "-f", file]);
  if (r.code !== 0 || !fs.existsSync(`${file}.pub`)) throw new Refused(r.missing ? "The program ssh-keygen is not on this computer: install the OpenSSH client." : `A key could not be made: ${r.err.trim().split("\n").pop()}`, "server");
  fs.chmodSync(file, 0o600);
}

/**
 * A key made ahead of its server: a provider asks for the key as the server is created, before it has an address. The same
 * one is given back while it waits; `addHost` takes it with `pending`. Returns the line to put on the server.
 */
export async function makePendingKey(dir: string, id: string): Promise<string> {
  const file = pendingFile(dir, id);
  if (!fs.existsSync(`${file}.pub`) || !fs.existsSync(file)) {
    ensureHostsDir(dir);
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    await makeKey(file, "hydor-server");
  }
  return fs.readFileSync(`${file}.pub`, "utf8").trim();
}

/** The public half of a key made ahead, if there is one, and whether its private half is still here. */
export function pendingKey(dir: string, id: string): { publicKey: string; privateKey: string } {
  const file = pendingFile(dir, id);
  const read = (f: string) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim() : "");
  return { publicKey: read(`${file}.pub`), privateKey: read(file) };
}

/** Takes a key made ahead off this computer; with `keepPublic`, its private half only. */
export function forgetPendingKey(dir: string, id: string, o: { keepPublic?: boolean } = {}): void {
  const file = pendingFile(dir, id);
  fs.rmSync(file, { force: true });
  if (!o.keepPublic) fs.rmSync(`${file}.pub`, { force: true });
}

/** Keeps a public key beside the ones made ahead (one a server has made for itself, until it is recorded). */
export function keepPendingPublic(dir: string, id: string, publicKey: string): void {
  const file = pendingFile(dir, id);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(`${file}.pub`, `${publicKey.trim()}\n`, { mode: 0o600 });
}

/**
 * Records this key, and no other, as the machine's: one read over a connection already verified (a new server's own, after
 * it has made itself a new one). `acceptHost` is for a key a person compared.
 */
export async function recordKey(dir: string, name: string, publicKey: string): Promise<HostInfo> {
  const h = storedOf(dir, name);
  const [type = "", key = ""] = publicKey.trim().split(/\s+/);
  const [read] = await fingerprints([`${knownPattern(h)} ${type} ${key}`]);
  if (!read) throw new Refused("That is not a machine's public key.", "input");
  ensureHostsDir(dir);
  writeKnown(dir, [read.line], knownPattern(h));
  const all = readAll(dir);
  all[name] = { ...h, hostKey: { type: read.type, fingerprint: read.fingerprint } };
  writeAll(dir, all);
  return info(name, all[name]!);
}

/** Records a host by name, with a new key pair made for it (or the one made ahead, `pending`). Nothing is contacted. */
export async function addHost(dir: string, name: string, ssh: string, o: { pending?: string } = {}): Promise<HostInfo> {
  if (!HOST_NAME.test(name)) throw new Refused("Name the server with lower-case letters, digits and hyphens, a letter first (like my-server).", "input");
  const target = parseSsh(ssh);
  if (readAll(dir)[name]) throw new Refused(`There is a server called ${name} already: remove it first, or use another name.`, "conflict");
  ensureHostsDir(dir);
  fs.mkdirSync(path.join(dir, "keys"), { recursive: true, mode: 0o700 });
  const key = keyFileOf(dir, name);
  const ahead = o.pending ? pendingFile(dir, o.pending) : "";
  if (ahead && fs.existsSync(ahead) && fs.existsSync(`${ahead}.pub`)) {
    // Copied, not moved: a person who finds the server is not theirs starts again with the line they have pasted.
    fs.copyFileSync(ahead, key);
    fs.copyFileSync(`${ahead}.pub`, `${key}.pub`);
    fs.chmodSync(key, 0o600);
  } else await makeKey(key, `hydor-${name}`);
  const stored: Stored = { ...target, publicKey: fs.readFileSync(`${key}.pub`, "utf8").trim(), addedAt: new Date().toISOString() };
  // Read again: another host may have been added while the key was made.
  const all = readAll(dir);
  all[name] = stored;
  writeAll(dir, all);
  return info(name, stored);
}

/** The keys a machine offers, as known_hosts lines. */
export type Scan = (target: { address: string; port: number }) => Promise<string[]>;

export const scanHostKeys: Scan = async (target) => {
  const r = await run("ssh-keyscan", ["-T", "10", "-p", String(target.port), "-t", "ed25519,ecdsa,rsa", target.address]);
  if (r.missing) throw new SshRefused("no-ssh", "The program ssh-keyscan is not on this computer: install the OpenSSH client.");
  const lines = r.out.split("\n").filter((l) => l.trim() !== "" && !l.startsWith("#"));
  if (lines.length === 0) throw new SshRefused("unreachable", `Could not read a key from ${target.address} port ${target.port}${r.err.trim() ? ` (${r.err.trim().split("\n").pop()})` : ""}. Check the address and port, that the machine is on, and that SSH is running there.`);
  return lines;
};

async function fingerprints(lines: string[]): Promise<{ line: string; type: string; fingerprint: string }[]> {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "hydor-keys-"));
  try {
    const out: { line: string; type: string; fingerprint: string }[] = [];
    for (const line of lines) {
      const file = path.join(folder, "key");
      fs.writeFileSync(file, `${line}\n`);
      const r = await run("ssh-keygen", ["-l", "-E", "sha256", "-f", file]);
      const fingerprint = /\b(SHA256:[A-Za-z0-9+/=]+)/.exec(r.out)?.[1];
      if (fingerprint) out.push({ line, type: line.split(/\s+/)[1]!, fingerprint });
    }
    return out;
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

export interface HostOffer {
  offered: { type: string; fingerprint: string }[];
  /** Where to compare one, in plain words. */
  where: string;
  problem?: string;
}

export const WHERE_TO_COMPARE =
  "Compare it with the fingerprint your provider shows for the server (its dashboard or console), or on the machine itself: ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub. If they differ, do not accept it: you are not reaching the machine you mean.";

/** The fingerprints the machine offers. Nothing is recorded. */
export async function offerHost(dir: string, name: string, o: { scan?: Scan } = {}): Promise<HostOffer> {
  const h = storedOf(dir, name);
  try {
    const found = await fingerprints(await (o.scan ?? scanHostKeys)(h));
    // ed25519 first: the one providers show.
    found.sort((a, b) => Number(b.type === "ssh-ed25519") - Number(a.type === "ssh-ed25519"));
    return { offered: found.map(({ type, fingerprint }) => ({ type, fingerprint })), where: WHERE_TO_COMPARE, ...(found.length ? {} : { problem: "The machine showed no key that could be read." }) };
  } catch (e) {
    if (e instanceof Refused) return { offered: [], where: WHERE_TO_COMPARE, problem: e.message };
    throw e;
  }
}

/** How ssh writes a host in known_hosts: the address alone for port 22, else `[address]:port`. */
const knownPattern = (h: { address: string; port: number }) => (h.port === 22 ? h.address : `[${h.address}]:${h.port}`);

function writeKnown(dir: string, add: string[], dropPattern: string): void {
  const file = knownHostsFile(dir);
  const lines = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").filter(Boolean) : [];
  fs.writeFileSync(file, [...lines.filter((l) => l.split(" ")[0] !== dropPattern), ...add].map((l) => `${l}\n`).join(""), { mode: 0o600 });
}

/** Records the machine's key, the one whose fingerprint the person compared. Any other fingerprint is refused. */
export async function acceptHost(dir: string, name: string, fingerprint: string, o: { scan?: Scan } = {}): Promise<HostInfo> {
  if (!/^SHA256:[A-Za-z0-9+/=]{20,60}$/.test(fingerprint)) throw new Refused("That is not a fingerprint (it starts with SHA256:).", "input");
  const h = storedOf(dir, name);
  if (h.hostKey) {
    if (h.hostKey.fingerprint === fingerprint) return info(name, h);
    throw new Refused(`The server ${name} is recorded with another key (${h.hostKey.fingerprint}), which is not replaced. If the machine was reinstalled, remove the server and add it again.`, "conflict");
  }
  const found = await fingerprints(await (o.scan ?? scanHostKeys)(h));
  const chosen = found.find((x) => x.fingerprint === fingerprint);
  if (!chosen) throw new Refused(`The machine does not show the key you accepted (${fingerprint}), so nothing was recorded. It shows: ${found.map((x) => `${x.fingerprint} (${x.type})`).join(", ")}. Either you mistyped it, or you are not reaching the machine you mean.`, "conflict");
  ensureHostsDir(dir);
  writeKnown(dir, [chosen.line], knownPattern(h));
  const all = readAll(dir);
  all[name] = { ...h, hostKey: { type: chosen.type, fingerprint: chosen.fingerprint } };
  writeAll(dir, all);
  return info(name, all[name]!);
}

/** Takes a host out, with Hydor's key for it and the machine's key. The machine itself is not touched. */
export function removeHost(dir: string, name: string): void {
  const all = readAll(dir);
  const gone = all[name];
  if (!gone) throw new Refused(`There is no server called ${name}.`, "missing");
  delete all[name];
  writeAll(dir, all);
  const pattern = knownPattern(gone);
  if (!Object.values(all).some((h) => knownPattern(h) === pattern)) writeKnown(dir, [], pattern);
  fs.rmSync(keyFileOf(dir, name), { force: true });
  fs.rmSync(`${keyFileOf(dir, name)}.pub`, { force: true });
}

export interface HostCheck {
  ok: boolean;
  summary: string;
  looked: Finding[];
  /** What is left to do by hand. */
  steps: string[];
  prepared: boolean;
}

/** What is on the host and what is missing. With `prepare` (Debian and Ubuntu) Docker is installed and the firewall set. */
export async function checkHost(dir: string, name: string, o: { prepare?: boolean; onLine?: (line: string) => void; connect?: Connect } = {}): Promise<HostCheck> {
  const host = connectionOf(dir, name);
  const open = o.connect ?? connectSsh;
  let remote = open(dir, host);
  try {
    let seen = await lookAt(remote);
    let prepared = false;
    if (o.prepare) {
      if (seen.os.id !== "ubuntu" && seen.os.id !== "debian") throw new Refused(`Preparing works on Debian and Ubuntu only; this machine runs ${seen.os.name}.`, "conflict", installSteps(seen));
      if (!seen.root && !seen.sudo) throw new Refused(`Preparing needs root, or sudo without a password, and ${seen.user} has neither on this machine. Give ${seen.user} that, or follow the steps by hand.`, "conflict", installSteps(seen));
      const ports = await sshPortsOf(remote, host.port);
      const result = await remote.run(prepareScript(seen, ports), {
        timeoutMs: 20 * 60_000,
        onOutput: (t) =>
          t
            .split("\n")
            .filter((l) => l.startsWith("== "))
            .forEach((l) => o.onLine?.(l.slice(3))),
      });
      if (result.code !== 0) throw new Refused(`Preparing ${name} failed part-way. The machine may be half set up: run it again after reading what went wrong.`, "server", `${result.out}\n${result.err}`.trim().split("\n").slice(-12));
      prepared = true;
      // A new connection: the group `docker` is read when a connection is made, not before.
      await remote.close();
      remote = open(dir, host);
      seen = await lookAt(remote);
    }
    const looked = judge(seen);
    const problems = looked.filter((f) => f.ok === false);
    const ok = problems.length === 0;
    const all = readAll(dir);
    if (all[name]) {
      all[name].checked = { at: Date.now(), ok, looked };
      writeAll(dir, all);
    }
    return {
      ok,
      summary: ok
        ? `${name} (${hostLabel(host)}) is ready for apps${prepared ? " (it was prepared just now: Docker from Docker's own repository and a firewall that lets in SSH, 80 and 443; Docker opens the ports it publishes whatever the firewall says, and a launch publishes 80 and 443 only)" : ""}.`
        : `${name} (${hostLabel(host)}) is not ready: ${problems.map((f) => f.say).join(" ")}`,
      looked,
      steps: ok ? [] : installSteps(seen),
      prepared,
    };
  } finally {
    await remote.close();
  }
}
