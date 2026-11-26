// Talking to a host over SSH with the system's own `ssh` program, and nothing else: no library, no agent of ours.
//
// What every connection insists on, so that a host is the host that was accepted:
//   - the host's key must be the one in the hosts folder's known_hosts (StrictHostKeyChecking=yes, no other known_hosts
//     file), and the key's type is the one accepted, so a changed key is refused, not asked about;
//   - no password prompt (BatchMode), the folder's own ssh_config instead of the person's (-F), and only the key Hydor made
//     for the host (IdentitiesOnly, no agent): nothing of ~/.ssh is read;
//   - one connection is kept open and shared by the commands of a launch (ControlMaster), its socket in a folder only
//     this user can enter.
// A command is a script given to `bash -ec`; what must not be seen in a process list (a key's value) goes in on standard
// input, never in the script.
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Refused } from "./types.ts";

export interface HostConnection {
  name: string;
  user: string;
  address: string;
  port: number;
  /** The private key Hydor made for this host. */
  keyFile: string;
  /** The accepted key's type, as ssh names it (ssh-ed25519…). */
  keyType: string;
}

export interface RunResult {
  code: number;
  out: string;
  err: string;
}

export interface RunOptions {
  /** Standard input for the script (keys, a file's text). */
  input?: string | Buffer;
  /** Milliseconds before the command is given up on. Default 5 minutes. */
  timeoutMs?: number;
  /** Called with each piece of standard output as it comes. */
  onOutput?: (text: string) => void;
}

/** What the engine does to a host. A test gives a stand-in; `connectSsh` gives the real one. */
export interface Remote {
  /** Runs a script on the host. A nonzero exit is a result, not an exception. */
  run(script: string, options?: RunOptions): Promise<RunResult>;
  /** Runs a script on the host with a local file's bytes as its standard input. */
  runWithFile(script: string, file: string, options?: RunOptions): Promise<RunResult>;
  /** Runs a script on the host and puts its standard output in a local file (pulling a backup). */
  runToFile(script: string, file: string, options?: RunOptions): Promise<RunResult>;
  close(): Promise<void>;
}

export type Connect = (hostsDir: string, host: HostConnection) => Remote;

export type SshKind = "key-changed" | "key-unknown" | "auth" | "unreachable" | "no-ssh";

export class SshRefused extends Refused {
  readonly ssh: SshKind;
  constructor(ssh: SshKind, message: string) {
    super(message, "server");
    this.ssh = ssh;
  }
}

/** A word safe inside a shell script: single-quoted. */
export const q = (text: string | number): string => `'${String(text).replaceAll("'", `'\\''`)}'`;

export const hostLabel = (h: { user: string; address: string; port: number }) => `${h.user}@${h.address.includes(":") ? `[${h.address}]` : h.address}${h.port === 22 ? "" : `:${h.port}`}`;

/** What ssh said, in plain words. */
export function explainSsh(stderr: string, host: { name: string; user: string; address: string; port: number }): SshRefused | undefined {
  const where = hostLabel(host);
  if (/No .* host key is known|not in known_hosts/i.test(stderr)) {
    return new SshRefused("key-unknown", `Hydor has no key on record for the server “${host.name}” (the file of accepted keys is missing it). Remove the server and add it again.`);
  }
  if (/REMOTE HOST IDENTIFICATION HAS CHANGED|Host key verification failed|host key for .* has changed|no matching host key type/i.test(stderr)) {
    return new SshRefused(
      "key-changed",
      `The key of the server “${host.name}” (${where}) is not the one you accepted. Nothing was sent to it. Either the machine was reinstalled (its key is new), or someone is standing between you and it. If you know it was reinstalled, remove the server and add it again, checking the new fingerprint with whoever runs the machine.`,
    );
  }
  if (/Permission denied/i.test(stderr)) {
    return new SshRefused("auth", `The server “${host.name}” (${where}) did not accept Hydor's key. Put its public key in ~/.ssh/authorized_keys of ${host.user} on that machine (or in your provider's “SSH keys” box).`);
  }
  if (/Connection refused|timed out|No route to host|Could not resolve hostname|Network is unreachable|Connection closed by|Connection reset|Broken pipe/i.test(stderr)) {
    return new SshRefused("unreachable", `Could not reach the server “${host.name}” (${where}): ${stderr.trim().split("\n").pop()}. Check the address and port, that the machine is on, and that its firewall lets SSH in.`);
  }
  return undefined;
}

export const knownHostsFile = (dir: string) => path.join(dir, "known_hosts");
export const sshConfigFile = (dir: string) => path.join(dir, "ssh_config");

/** The hosts folder, private, with the ssh_config ssh is given instead of the person's. */
export function ensureHostsDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    /* not ours to change */
  }
  const config = sshConfigFile(dir);
  if (!fs.existsSync(config)) fs.writeFileSync(config, "# What Hydor gives ssh instead of your own ~/.ssh/config. Put a ProxyJump here if a server needs one.\n", { mode: 0o600 });
}

/** The arguments of every connection. No key's value or any secret is ever among them. */
export function sshArgs(hostsDir: string, host: HostConnection, control: string | null): string[] {
  const algorithms = host.keyType === "ssh-rsa" ? "rsa-sha2-512,rsa-sha2-256,ssh-rsa" : host.keyType;
  return [
    "-F", sshConfigFile(hostsDir),
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=yes",
    "-o", `UserKnownHostsFile=${knownHostsFile(hostsDir)}`,
    "-o", "GlobalKnownHostsFile=/dev/null",
    "-o", "UpdateHostKeys=no",
    "-o", `HostKeyAlgorithms=${algorithms}`,
    "-o", "ConnectTimeout=15",
    "-o", "ServerAliveInterval=20",
    "-o", "LogLevel=ERROR",
    "-o", "IdentitiesOnly=yes",
    "-o", "IdentityAgent=none",
    "-i", host.keyFile,
    ...(control ? ["-o", "ControlMaster=auto", "-o", `ControlPath=${control}`, "-o", "ControlPersist=60"] : []),
    "-p", String(host.port),
  ];
}

const noSsh = () => new SshRefused("no-ssh", "The program ssh is not on this computer: install the OpenSSH client.");

/** An open connection to a host. */
export const connectSsh: Connect = (hostsDir, host) => {
  ensureHostsDir(hostsDir);
  // A folder of its own (0700), so that no other user of this computer can put a socket where ssh looks for ours.
  let controlDir: string | null = process.platform === "win32" ? null : fs.mkdtempSync(path.join(os.tmpdir(), "hydor-ssh-"));
  const base = () => sshArgs(hostsDir, host, controlDir ? path.join(controlDir, "c") : null);
  const target = `${host.user}@${host.address}`;
  const argv = (script: string) => [...base(), target, `bash -ec ${q(script)}`];
  const env = { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: hostsDir };

  const start = (script: string, stdin: "pipe" | "ignore", options: RunOptions) => {
    const child = spawn("ssh", argv(script), { stdio: [stdin, "pipe", "pipe"], env });
    let out = "";
    let err = "";
    child.stdout!.setEncoding("utf8").on("data", (d: string) => {
      out += d;
      options.onOutput?.(d);
    });
    child.stderr!.setEncoding("utf8").on("data", (d: string) => (err += d));
    child.stdin?.on("error", () => {});
    const done = new Promise<RunResult>((resolve, reject) => {
      const ms = options.timeoutMs ?? 300_000;
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve({ code: 124, out, err: `${err}\nHydor gave up after ${Math.round(ms / 1000)} seconds` });
      }, ms);
      child.once("error", (e) => {
        clearTimeout(timer);
        reject((e as NodeJS.ErrnoException).code === "ENOENT" ? noSsh() : e);
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        const failure = code === 255 ? explainSsh(err, host) : undefined;
        if (failure) reject(failure);
        else resolve({ code: code ?? 1, out, err });
      });
    });
    return { child, done };
  };

  return {
    async run(script, options = {}) {
      const { child, done } = start(script, options.input === undefined ? "ignore" : "pipe", options);
      if (options.input !== undefined) child.stdin!.end(options.input);
      return done;
    },
    async runWithFile(script, file, options = {}) {
      const { child, done } = start(script, "pipe", options);
      fs.createReadStream(file)
        .on("error", () => child.stdin!.end())
        .pipe(child.stdin!);
      return done;
    },
    async runToFile(script, file, options = {}) {
      const child = spawn("ssh", argv(script), { stdio: ["ignore", "pipe", "pipe"], env });
      const sink = fs.createWriteStream(file, { mode: 0o600 });
      child.stdout!.pipe(sink);
      let err = "";
      child.stderr!.setEncoding("utf8").on("data", (d: string) => (err += d));
      return new Promise<RunResult>((resolve, reject) => {
        const timer = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs ?? 600_000);
        child.once("error", (e) => {
          clearTimeout(timer);
          reject((e as NodeJS.ErrnoException).code === "ENOENT" ? noSsh() : e);
        });
        child.once("close", (code) => {
          clearTimeout(timer);
          sink.end(() => {
            const failure = code === 255 ? explainSsh(err, host) : undefined;
            if (failure) reject(failure);
            else resolve({ code: code ?? 1, out: "", err });
          });
        });
      });
    },
    async close() {
      if (!controlDir) return;
      const dir = controlDir;
      await new Promise<void>((resolve) => {
        execFile("ssh", [...base(), "-O", "exit", target], { timeout: 10_000, env }, () => resolve());
      });
      controlDir = null;
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
};
