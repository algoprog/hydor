// The text a new server is given as it is created (cloud-init "user data": DigitalOcean's "Startup scripts", Hetzner's
// "Cloud config", Vultr's "User Data"), so that it is ready when it first starts and nothing has to be compared by hand.
// It gives the machine an identity Hydor made (its SSH host key), lets in Hydor's own key as a user of its own with sudo,
// switches password sign-in off, and installs what "prepare" installs (host-check.ts's own script). cloud-init writes the
// given host key and makes no other, before the sign-in service starts, so the first thing the machine ever shows is the
// identity Hydor expects; a machine that shows another one was not made with this text.
//
// The identity in the text is only for the first connection. The provider keeps what was pasted, and the machine can read
// it back, so over that first connection the server makes itself a new identity (its private half never leaves it), Hydor
// reads the public half, the server drops the old one, and Hydor connects again under the new one. Only then is the
// server recorded: what the provider keeps cannot pose as it. If any part fails, nothing is recorded.
//
// Connecting is: the address; the machine must show the identity the text gave it and prove it holds it in a real
// connection. All of this happens in a folder of its own, beside the engine of hosts.ts; the record it ends with is the
// same as for any server (the same known_hosts, the same strict connection).
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prepareScript, type Look } from "./host-check.ts";
import { acceptHost, addHost, checkHost, connectionOf, forgetPendingKey, keepPendingPublic, listHosts, makePendingKey, offerHost, parseSsh, pendingKey, recordKey, removeHost, type HostCheck, type Scan } from "./hosts.ts";
import { connectSsh, ensureHostsDir, SshRefused, sshConfigFile, type Connect } from "./ssh.ts";
import { Refused } from "./types.ts";

/** The user the text makes for Hydor, whatever login the provider's images use. */
export const FIRST_USER = "hydor";
/** Where the machine writes how setting up went. */
export const FIRST_LOG = "/var/log/hydor-setup.log";
/** Where the machine keeps how far setting up is: waiting, running, done or failed. */
export const FIRST_STATE = "/var/lib/hydor-setup.state";

/** A fresh Ubuntu server as `prepare` would find it: nothing installed yet. */
const FRESH: Look = { os: { id: "ubuntu", name: "Ubuntu" }, arch: "x86_64", user: FIRST_USER, root: true, sudo: true, docker: { cli: false, server: "", denied: false, compose: "" }, memoryMb: 2048, diskGb: 50, ports: { "80": { listening: false, project: "", image: "" }, "443": { listening: false, project: "", image: "" } }, ufw: "none", cron: false };

/** The fingerprint ssh shows for a public key line ("SHA256:…"). */
export const fingerprintOf = (publicKey: string): string => `SHA256:${createHash("sha256").update(Buffer.from(publicKey.trim().split(/\s+/)[1] ?? "", "base64")).digest("base64").replace(/=+$/, "")}`;

const indent = (text: string, by: string) =>
  text
    .replace(/\n+$/, "")
    .split("\n")
    .map((l) => (l ? by + l : ""))
    .join("\n");

/** The whole text, for one server. `accessKey`: Hydor's public key; `identity`: the machine's own key pair, both halves. */
export function firstBootText(o: { accessKey: string; identity: { privateKey: string; publicKey: string } }): string {
  const setup = [
    "#!/bin/bash",
    "set -e",
    `trap 'echo failed > ${FIRST_STATE}' ERR`,
    `echo running > ${FIRST_STATE}`,
    // A new machine may still be installing its own updates: wait for it rather than fail.
    `echo 'DPkg::Lock::Timeout "900";' > /etc/apt/apt.conf.d/90hydor`,
    prepareScript(FRESH, [22]),
    `echo done > ${FIRST_STATE}`,
  ].join("\n");
  return `#cloud-config
# From Hydor, for one server: paste it once, as you create it.
ssh_deletekeys: true
ssh_keys:
  ed25519_private: |
${indent(o.identity.privateKey, "    ")}
  ed25519_public: ${o.identity.publicKey.trim()}
ssh_pwauth: false
users:
  - default
  - name: ${FIRST_USER}
    shell: /bin/bash
    lock_passwd: true
    sudo: "ALL=(ALL) NOPASSWD:ALL"
    ssh_authorized_keys:
      - ${o.accessKey.trim()}
write_files:
  - path: ${FIRST_STATE}
    permissions: "0644"
    content: "waiting\\n"
  - path: /usr/local/sbin/hydor-setup
    permissions: "0700"
    content: |
${indent(setup, "      ")}
runcmd:
  - [bash, -c, "/usr/local/sbin/hydor-setup > ${FIRST_LOG} 2>&1"]
`;
}

// ---- the keys a text is made of, and the connection it is for ------------------------------------------------------------------------

const accessId = (app: string) => `${app}-first`;
const identityId = (app: string) => `${app}-identity`;
/** The public half of an identity a server made for itself, from before it is put in place until the server is recorded. */
const movedId = (app: string) => `${app}-moved`;

/**
 * The text for an app's next server. The same one until a server has connected with it (a person may leave and come back
 * with it half done); after that Hydor has no private half of it, and the next call makes a new one.
 */
export async function firstTextFor(dir: string, app: string): Promise<string> {
  if (!pendingKey(dir, identityId(app)).privateKey) {
    forgetPendingKey(dir, identityId(app));
    forgetPendingKey(dir, movedId(app));
  }
  const identity = await makePendingKey(dir, identityId(app));
  const accessKey = await makePendingKey(dir, accessId(app));
  return firstBootText({ accessKey, identity: { publicKey: identity, privateKey: pendingKey(dir, identityId(app)).privateKey } });
}

/** The app is removed: the keys made for a server it never connected go too. */
export function forgetFirst(dir: string, app: string): void {
  forgetPendingKey(dir, identityId(app));
  forgetPendingKey(dir, accessId(app));
  forgetPendingKey(dir, movedId(app));
}

export type FirstState =
  /** Connected, and everything a launch needs is there. */
  | "ready"
  /** It may be the server, still setting itself up (or not answering yet): ask again in a while. */
  | "starting"
  /** Connected, and something is missing: `prepare` can put it right. */
  | "unfinished"
  /** What answers at the address does not have the identity the text gave: nothing was sent to it. */
  | "other"
  /** It is the server, but its identity could not be replaced: it is not taken, and nothing is recorded. */
  | "unsafe";

/** Where replacing the identity stopped: making the new one, putting it in place, or connecting under it. */
export type Unsafe = "make" | "swap" | "again";

export interface FirstConnect {
  state: FirstState;
  /** The server's name in Hydor, once it is recorded. */
  host?: string;
  check?: HostCheck;
  /** With "unsafe": where it stopped. */
  why?: Unsafe;
}

const hostName = (taken: string[]): string => {
  let name = "my-server";
  for (let n = 2; taken.includes(name); n++) name = `my-server-${n}`;
  return name;
};

export interface FirstOptions {
  scan?: Scan;
  connect?: Connect;
  /** Whether apps are deployed to a server of this name: such a record is never replaced. */
  deployed?: (host: string) => boolean;
  /** For tests: the pause between tries to connect under the new identity, in ms. */
  pause?: number;
}

/** On the server: a new identity, made there. Only its public half is written out. */
export const MAKE_IDENTITY = `# hydor:identity-make
sudo -n bash -ec 'cd /etc/ssh; rm -f hydor_next hydor_next.pub; ssh-keygen -q -t ed25519 -N "" -C "" -f hydor_next; cat hydor_next.pub'`;

/** On the server: the new identity takes the old one's place (which is gone with that), and the sign-in service starts again. */
export const SWAP_IDENTITY = `# hydor:identity-swap
sudo -n bash -ec 'cd /etc/ssh; ssh-keygen -y -f hydor_next >/dev/null; chmod 600 hydor_next; chmod 644 hydor_next.pub; mv -f hydor_next.pub ssh_host_ed25519_key.pub; mv -f hydor_next ssh_host_ed25519_key; systemctl restart ssh 2>/dev/null || systemctl restart sshd'`;

const IDENTITY_LINE = /^ssh-ed25519 [A-Za-z0-9+/]+=*(?=\s|$)/m;
const keyOf = (line: string) => line.trim().split(/\s+/)[1] ?? "";

class NotReplaced extends Error {
  constructor(readonly why: Unsafe) {
    super(`The server's identity was not replaced (${why}).`);
  }
}

/** Connects under the identity recorded for `name` and reads the one the machine has: true when it is `line`. */
async function underNew(dir: string, name: string, line: string, open: Connect, pause: number): Promise<boolean> {
  // The service is starting again: a few tries.
  for (let i = 0; i < 6; i++) {
    const remote = open(dir, connectionOf(dir, name));
    try {
      const r = await remote.run("# hydor:identity-check\ncat /etc/ssh/ssh_host_ed25519_key.pub", { timeoutMs: 60_000 });
      if (r.code === 0) return keyOf(r.out) === keyOf(line);
    } catch (e) {
      if (!(e instanceof SshRefused) || e.ssh === "no-ssh") throw e;
    } finally {
      await remote.close();
    }
    await new Promise((done) => setTimeout(done, pause * (i + 1)));
  }
  return false;
}

/**
 * Over the first connection: the server makes itself a new identity, which is recorded for `name` in `dir` once it is in
 * place, and connected to under it. The first command is the proof that the machine holds the text's identity: a refusal
 * of the connection there is thrown as it is.
 */
async function replaceIdentity(dir: string, name: string, old: string, keep: (line: string) => void, open: Connect, pause: number): Promise<string> {
  let line = "";
  const remote = open(dir, connectionOf(dir, name));
  try {
    const made = await remote.run(MAKE_IDENTITY, { timeoutMs: 60_000 });
    line = made.code === 0 ? (IDENTITY_LINE.exec(made.out)?.[0] ?? "") : "";
    if (!line || keyOf(line) === keyOf(old)) throw new NotReplaced("make");
    // Kept before it is put in place: should the connection be lost here, another try knows this server by it.
    keep(line);
    try {
      const swapped = await remote.run(SWAP_IDENTITY, { timeoutMs: 90_000 });
      if (swapped.code !== 0) throw new NotReplaced("swap");
    } catch (e) {
      if (e instanceof SshRefused) throw new NotReplaced("swap");
      throw e;
    }
  } finally {
    await remote.close();
  }
  await recordKey(dir, name, line);
  if (!(await underNew(dir, name, line, open, pause))) throw new NotReplaced("again");
  return line;
}

/** What a connected server says of its first start, and whether it has what a launch needs. */
async function lookOver(dir: string, host: string, open: Connect): Promise<FirstConnect> {
  const remote = open(dir, connectionOf(dir, host));
  let setting = "";
  try {
    const r = await remote.run(`# hydor:firstboot\necho "setup=$(cat ${FIRST_STATE} 2>/dev/null)"\ncloud-init status 2>/dev/null || true`, { timeoutMs: 60_000 });
    if (r.code !== 0 && !r.out) throw new SshRefused("unreachable", r.err.trim() || "The server did not answer.");
    setting = r.out;
  } finally {
    await remote.close();
  }
  // The text's own script says how far it is; cloud-init's word counts when it has ended without the script ending, and
  // for a machine where the script has not been written yet.
  const own = /^setup=(\w*)/m.exec(setting)?.[1] ?? "";
  const ended = /status:\s*(done|error|degraded)/.test(setting);
  const going = own === "waiting" || own === "running" ? !ended : !own && /status:\s*(running|not (started|run))/.test(setting);
  if (going) return { state: "starting", host };
  const check = await checkHost(dir, host, { connect: open });
  return { state: check.ok ? "ready" : "unfinished", host, check };
}

/**
 * Connects to the server a text was pasted into, at `address` ("203.0.113.7", with ":port" if not 22). It connects only
 * to a machine that shows the text's identity and proves it holds it, has it replace that identity with one of its own
 * making, and records it only once it answers under the new one; then Hydor's copy of the text's private half is deleted.
 * A server already recorded this way is connected to with what was recorded.
 */
export function connectFirst(dir: string, app: string, address: string, o: FirstOptions = {}): Promise<FirstConnect> {
  // One attempt at a time for an app and address: a press while the page asks by itself would record the server twice.
  const key = `${dir}\n${app}\n${address.trim()}`;
  let at = going.get(key);
  if (!at) going.set(key, (at = connectOnce(dir, app, address, o).finally(() => going.delete(key))));
  return at;
}
const going = new Map<string, Promise<FirstConnect>>();

async function connectOnce(dir: string, app: string, address: string, o: FirstOptions): Promise<FirstConnect> {
  const open = o.connect ?? connectSsh;
  const bare = address.trim().replace(/^[^@]*@/, "");
  const target = parseSsh(`${FIRST_USER}@${bare}`);
  const waiting = pendingKey(dir, identityId(app));
  const there = listHosts(dir).find((h) => h.user === FIRST_USER && h.address === target.address && h.port === target.port);
  if (there) {
    if (there.state === "recorded") {
      try {
        return await lookOver(dir, there.name, open);
      } catch (e) {
        if (!(e instanceof SshRefused)) throw e;
        if (e.ssh !== "key-changed") return { state: "starting", host: there.name };
        // Another machine answers there now. A new text may be for it: only a record nothing is deployed to is replaced.
        if (!waiting.privateKey || o.deployed?.(there.name)) return { state: "other" };
      }
    } else if (o.deployed?.(there.name)) return { state: "other" };
  }
  if (!waiting.privateKey) throw new Refused("The text for this server has been used. Go back one step and copy the text for a new server.", "conflict");

  // The first connection, and the replacing of the identity, in a folder of its own: nothing is a server of Hydor's yet.
  const first = path.join(dir, "first", app);
  fs.rmSync(first, { recursive: true, force: true });
  try {
    ensureHostsDir(dir);
    ensureHostsDir(first);
    fs.copyFileSync(sshConfigFile(dir), sshConfigFile(first));
    await makePendingKey(dir, accessId(app));
    fs.mkdirSync(path.join(first, "pending"), { recursive: true, mode: 0o700 });
    for (const end of ["", ".pub"]) fs.copyFileSync(path.join(dir, "pending", `${accessId(app)}${end}`), path.join(first, "pending", `${accessId(app)}${end}`));
    await addHost(first, "new-server", `${FIRST_USER}@${bare}`, { pending: accessId(app) });
    const scan = o.scan ? { scan: o.scan } : {};
    const offer = await offerHost(first, "new-server", scan);
    if (!offer.offered.length) return { state: "starting" };
    const shows = (publicKey: string) => !!publicKey && offer.offered.some((x) => x.fingerprint === fingerprintOf(publicKey));
    // The identity of the text; or the one it made on a try that lost it after the swap.
    const moved = pendingKey(dir, movedId(app)).publicKey;
    const fresh = shows(waiting.publicKey);
    if (!fresh && !shows(moved)) return { state: "other" };
    let line = moved;
    try {
      await acceptHost(first, "new-server", fingerprintOf(fresh ? waiting.publicKey : moved), scan);
    } catch (e) {
      if (e instanceof Refused) return { state: "other" };
      throw e;
    }
    try {
      if (fresh) line = await replaceIdentity(first, "new-server", waiting.publicKey, (x) => keepPendingPublic(dir, movedId(app), x), open, o.pause ?? 2000);
      else if (!(await underNew(first, "new-server", moved, open, o.pause ?? 2000))) return { state: "other" };
    } catch (e) {
      if (e instanceof NotReplaced) return { state: "unsafe", why: e.why };
      if (!(e instanceof SshRefused) || e.ssh === "no-ssh") throw e;
      // A key anyone can read off a machine is not enough: a failed proof of it is another machine.
      return { state: e.ssh === "key-changed" || e.ssh === "key-unknown" ? "other" : "starting" };
    }

    // It answers under an identity only it has: now it is a server of Hydor's.
    if (there) removeHost(dir, there.name);
    const name = hostName(listHosts(dir).map((h) => h.name));
    await addHost(dir, name, `${FIRST_USER}@${bare}`, { pending: accessId(app) });
    await recordKey(dir, name, line);
    for (const id of [identityId(app), accessId(app), movedId(app)]) forgetPendingKey(dir, id);
    try {
      return await lookOver(dir, name, open);
    } catch (e) {
      if (!(e instanceof SshRefused) || e.ssh === "no-ssh") throw e;
      return { state: "starting", host: name };
    }
  } finally {
    fs.rmSync(first, { recursive: true, force: true });
  }
}
