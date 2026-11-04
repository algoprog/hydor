// Detached supervisor for one agent CLI process.
//
//   node runner.js <runDir>
//
// Reads <runDir>/spec.json ({cmd, args, cwd, env}), starts the agent with pipes,
// appends its stdout to out.log, and serves a Unix socket (<runDir>/sock; on Windows a
// named pipe, see RunnerAddress) through which the web server writes to the agent's
// stdin and receives live output.
// The runner outlives web-server restarts; the agent ends when its stdin closes.
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { encodeFrame, FrameDecoder, FRAME_CONTROL, FRAME_STDERR, FRAME_STDOUT } from './frames.ts';
import { launch } from '../platform.ts';

const runDir = process.argv[2];
if (!runDir) {
  console.error('usage: runner.js <runDir>');
  process.exit(2);
}

interface Spec {
  cmd: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

const spec = JSON.parse(fs.readFileSync(path.join(runDir, 'spec.json'), 'utf8')) as Spec;
const WIN = process.platform === 'win32';
/** The file that says where this runner listens: the socket itself, or on Windows the pipe's name and key. */
const sockPath = path.join(runDir, 'sock');
const address: { path: string; key?: string } = WIN ? { path: `\\\\.\\pipe\\hydor-runner-${crypto.randomBytes(12).toString('hex')}`, key: crypto.randomBytes(24).toString('hex') } : { path: sockPath };
const MAX_STDERR = 8 * 1024 * 1024;

const outFd = fs.openSync(path.join(runDir, 'out.log'), 'a');
let outSize = fs.fstatSync(outFd).size;
const errFd = fs.openSync(path.join(runDir, 'err.log'), 'a');
let errSize = fs.fstatSync(errFd).size;

if (!WIN) {
  process.on('SIGHUP', () => {});
  process.on('SIGPIPE', () => {});
}

// On Windows, npm's .cmd launchers run through Node.js (see launch).
const program = launch(spec.cmd, spec.args, spec.env);
const child = spawn(program.cmd, program.args, {
  cwd: spec.cwd,
  env: spec.env,
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
});

const startedAt = Date.now();
const clients = new Set<net.Socket>();
let exited = false;

function writeState(extra: Record<string, unknown> = {}) {
  const tmp = path.join(runDir, 'state.json.tmp');
  fs.writeFileSync(tmp, JSON.stringify({ runnerPid: process.pid, childPid: child.pid ?? null, startedAt, ...extra }));
  fs.renameSync(tmp, path.join(runDir, 'state.json'));
}
writeState();

function broadcast(frame: Buffer) {
  for (const c of clients) {
    if (!c.destroyed) c.write(frame);
  }
}

child.stdout.on('data', (buf: Buffer) => {
  // Written synchronously before forwarding, so a client that reads out.log up to the
  // `size` it got in `hello` and then consumes live frames never misses or repeats bytes.
  fs.writeSync(outFd, buf);
  outSize += buf.length;
  broadcast(encodeFrame(FRAME_STDOUT, buf));
});

child.stderr.on('data', (buf: Buffer) => {
  if (errSize < MAX_STDERR) {
    fs.writeSync(errFd, buf);
    errSize += buf.length;
  }
  broadcast(encodeFrame(FRAME_STDERR, buf));
});

child.stdin.on('error', () => {});

child.on('error', (err) => {
  fs.writeSync(errFd, Buffer.from(`\n[runner] failed to start ${spec.cmd}: ${err.message}\n`));
  finish(null, null, err.message);
});

child.on('close', (code, signal) => finish(code, signal));

let stopTimers: NodeJS.Timeout[] = [];

function stop(graceMs = 4000) {
  if (exited) return;
  try {
    child.stdin.end();
  } catch {}
  stopTimers.push(
    setTimeout(() => {
      if (!exited) child.kill('SIGTERM');
    }, graceMs),
  );
  stopTimers.push(
    setTimeout(() => {
      if (!exited) child.kill('SIGKILL');
    }, graceMs + 5000),
  );
}

function finish(code: number | null, signal: NodeJS.Signals | null, error?: string) {
  if (exited) return;
  exited = true;
  for (const t of stopTimers) clearTimeout(t);
  const info = { code, signal, error: error ?? null, at: Date.now() };
  fs.writeFileSync(path.join(runDir, 'exit.json'), JSON.stringify(info));
  broadcast(encodeFrame(FRAME_CONTROL, JSON.stringify({ op: 'exit', ...info })));
  for (const c of clients) c.end();
  server.close();
  try {
    fs.rmSync(sockPath, { force: true });
  } catch {}
  setTimeout(() => process.exit(0), 300);
}

const server = net.createServer((sock) => {
  const decoder = new FrameDecoder();
  // A client hears the agent once it is known: at once on a Unix socket (only you can open it), on Windows after it
  // sends the key from the address file.
  let known = false;
  const welcome = () => {
    known = true;
    clients.add(sock);
    sock.write(encodeFrame(FRAME_CONTROL, JSON.stringify({ op: 'hello', size: outSize, childPid: child.pid ?? null, startedAt })));
  };
  if (!address.key) welcome();
  sock.on('data', (chunk) => {
    decoder.push(chunk, (type, payload) => {
      if (type !== FRAME_CONTROL) return;
      let msg: { op: string; data?: string; sig?: NodeJS.Signals; graceMs?: number; key?: string };
      try {
        msg = JSON.parse(payload.toString('utf8'));
      } catch {
        return;
      }
      if (!known) {
        const ok = msg.op === 'auth' && typeof msg.key === 'string' && msg.key.length === address.key!.length && crypto.timingSafeEqual(Buffer.from(msg.key), Buffer.from(address.key!));
        if (ok) welcome();
        else sock.destroy();
        return;
      }
      if (msg.op === 'write' && typeof msg.data === 'string' && !exited) child.stdin.write(msg.data);
      else if (msg.op === 'signal' && msg.sig && !exited) child.kill(msg.sig);
      else if (msg.op === 'stop') stop(msg.graceMs);
    });
  });
  sock.on('close', () => clients.delete(sock));
  sock.on('error', () => clients.delete(sock));
});

process.on('SIGTERM', () => stop(2000));
process.on('SIGINT', () => stop(2000));

try {
  fs.rmSync(sockPath, { force: true });
} catch {}
server.listen(address.path, () => {
  if (WIN) {
    // Written whole, then put in place: a client never reads half of it.
    fs.writeFileSync(`${sockPath}.tmp`, JSON.stringify(address), { mode: 0o600 });
    fs.renameSync(`${sockPath}.tmp`, sockPath);
    return;
  }
  try {
    fs.chmodSync(sockPath, 0o600);
  } catch {}
});
