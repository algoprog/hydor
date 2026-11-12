import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { APP_ROOT, paths } from '../config.ts';
import { encodeFrame, FrameDecoder, LineSplitter, readAddress, FRAME_CONTROL, FRAME_STDERR, FRAME_STDOUT, type RunnerAddress } from './frames.ts';
import type { Agent } from '../../shared/types.ts';

export interface RunSpec {
  cmd: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

/** What the server needs to rebuild a live session after it restarts. */
export interface RunMeta {
  runId: string;
  agent: Agent;
  /** Session key; for a new Codex thread it is filled in once the thread id is known. */
  key?: string;
  createdAt: number;
  cwd: string;
  opts: Record<string, unknown>;
  /** The systemd scope it runs in, with the limits it holds (Settings → General → Limit each session). */
  scope?: string;
  limits?: { memoryMb?: number; cpus?: number };
}

type Wrapped = { cmd: string; args: string[]; env?: NodeJS.ProcessEnv; scope?: string; limits?: RunMeta['limits'] };
/** Wraps the command that starts a runner (the sessions' limits, server/resources.ts); set once when the server starts. */
let wrap: ((runId: string, cmd: string, args: string[]) => Wrapped) | null = null;
export const setRunnerWrap = (f: typeof wrap) => (wrap = f);

export interface ExitInfo {
  code: number | null;
  signal: string | null;
  error: string | null;
  at: number;
}

function pidAlive(pid: number | undefined | null): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Handle to one runner process. Emits:
 *   'line'   (line: string, replay: boolean)  agent stdout, one JSON line at a time
 *   'stderr' (text: string)
 *   'exit'   (info: ExitInfo)
 */
export class Runner extends EventEmitter {
  exit: ExitInfo | null = null;
  childPid: number | null = null;
  startedAt = 0;
  private sock: net.Socket | null = null;
  private queue: Buffer[] = [];

  constructor(
    public readonly dir: string,
    public meta: RunMeta,
  ) {
    super();
  }

  static async start(meta: RunMeta, spec: RunSpec): Promise<Runner> {
    const dir = path.join(paths.runs, meta.runId);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(dir, 'spec.json'), JSON.stringify(spec), { mode: 0o600 });
    const runnerJs = path.join(APP_ROOT, 'dist/server/runner.js');
    const plain: Wrapped = { cmd: process.execPath, args: [runnerJs, dir] };
    const w = wrap?.(meta.runId, plain.cmd, plain.args) ?? plain;
    if (w.scope) Object.assign(meta, { scope: w.scope, limits: w.limits });
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta), { mode: 0o600 });
    const go = (c: Wrapped) => spawn(c.cmd, c.args, { detached: true, stdio: 'ignore', cwd: dir, windowsHide: true, ...(c.env ? { env: c.env } : {}) });
    const began = Date.now();
    const p = go(w);
    if (w.scope) {
      // systemd-run that could not make the scope (its manager gone since): the runner starts as it always did.
      const plainAgain = () => {
        if (Date.now() - began > 5000 || fs.existsSync(path.join(dir, 'state.json'))) return;
        delete meta.scope;
        delete meta.limits;
        fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta), { mode: 0o600 });
        go(plain).unref();
      };
      p.once('error', plainAgain);
      p.once('exit', (code) => code !== 0 && plainAgain());
    }
    p.unref();
    return new Runner(dir, meta);
  }

  /** Runner directories left by an earlier server process. */
  static discover(): Runner[] {
    if (!fs.existsSync(paths.runs)) return [];
    const out: Runner[] = [];
    for (const name of fs.readdirSync(paths.runs)) {
      const dir = path.join(paths.runs, name);
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')) as RunMeta;
        out.push(new Runner(dir, meta));
      } catch {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch {}
      }
    }
    return out;
  }

  saveMeta() {
    fs.writeFileSync(path.join(this.dir, 'meta.json'), JSON.stringify(this.meta), { mode: 0o600 });
  }

  private readJson<T>(name: string): T | null {
    try {
      return JSON.parse(fs.readFileSync(path.join(this.dir, name), 'utf8')) as T;
    } catch {
      return null;
    }
  }

  /** The runner's process id, once it has started. */
  runnerPid(): number | null {
    return this.readJson<{ runnerPid: number }>('state.json')?.runnerPid ?? null;
  }

  /**
   * When the agent last printed anything: the last change of its logs, which outlive this server process.
   * Null when it has printed nothing yet.
   */
  lastOutputAt(): number | null {
    let last: number | null = null;
    for (const name of ['out.log', 'err.log']) {
      try {
        const at = fs.statSync(path.join(this.dir, name)).mtimeMs;
        if (last === null || at > last) last = at;
      } catch {
        // not written yet
      }
    }
    return last;
  }

  /** True while the runner process (and so the agent) is still running. */
  isAlive(): boolean {
    if (this.exit || fs.existsSync(path.join(this.dir, 'exit.json'))) return false;
    const st = this.readJson<{ runnerPid: number }>('state.json');
    return pidAlive(st?.runnerPid);
  }

  /** Connects, replays everything the agent printed so far, then streams live output. */
  async connect(timeoutMs = 15_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const exit = this.readJson<ExitInfo>('exit.json');
      if (exit) {
        this.replayFile(Infinity);
        this.markExit(exit);
        return;
      }
      const address = readAddress(this.dir, fs, path);
      if (address) {
        try {
          await this.attach(address);
          return;
        } catch {
          // socket not accepting yet
        }
      }
      if (Date.now() > deadline) {
        const st = this.readJson<{ runnerPid: number }>('state.json');
        if (!pidAlive(st?.runnerPid)) {
          this.markExit({ code: null, signal: null, error: 'runner did not start', at: Date.now() });
          return;
        }
        throw new Error('timed out connecting to runner');
      }
      await sleep(40);
    }
  }

  /**
   * Emits the lines in out.log up to `upTo` bytes. The splitter is shared with the live
   * stream so a line cut at the `upTo` boundary is completed by the first live frame.
   */
  private replayFile(upTo: number, splitter = new LineSplitter()): void {
    const file = path.join(this.dir, 'out.log');
    if (!fs.existsSync(file)) return;
    const fd = fs.openSync(file, 'r');
    try {
      const size = Math.min(upTo, fs.fstatSync(fd).size);
      const chunk = Buffer.allocUnsafe(1 << 20);
      let pos = 0;
      while (pos < size) {
        const n = fs.readSync(fd, chunk, 0, Math.min(chunk.length, size - pos), pos);
        if (n <= 0) break;
        pos += n;
        splitter.push(Buffer.from(chunk.subarray(0, n)), (line) => this.emit('line', line, true));
      }
    } finally {
      fs.closeSync(fd);
    }
  }

  private attach(address: RunnerAddress): Promise<void> {
    return new Promise((resolve, reject) => {
      const sock = net.connect(address.path);
      // On Windows the runner hears nothing else until it has its key.
      if (address.key) sock.write(encodeFrame(FRAME_CONTROL, JSON.stringify({ op: 'auth', key: address.key })));
      const decoder = new FrameDecoder();
      const lines = new LineSplitter();
      let hello = false;
      sock.once('error', (err) => {
        if (!hello) reject(err);
      });
      sock.on('data', (chunk) => {
        decoder.push(chunk, (type, payload) => {
          if (type === FRAME_CONTROL) {
            let msg: { op: string; size?: number; childPid?: number; startedAt?: number } & Partial<ExitInfo>;
            try {
              msg = JSON.parse(payload.toString('utf8'));
            } catch {
              return;
            }
            if (msg.op === 'hello') {
              hello = true;
              this.childPid = msg.childPid ?? null;
              this.startedAt = msg.startedAt ?? Date.now();
              this.sock = sock;
              this.replayFile(msg.size ?? 0, lines);
              for (const q of this.queue) sock.write(q);
              this.queue = [];
              resolve();
            } else if (msg.op === 'exit') {
              this.markExit({ code: msg.code ?? null, signal: msg.signal ?? null, error: msg.error ?? null, at: msg.at ?? Date.now() });
            }
          } else if (type === FRAME_STDOUT) {
            lines.push(payload, (line) => this.emit('line', line, false));
          } else if (type === FRAME_STDERR) {
            this.emit('stderr', payload.toString('utf8'));
          }
        });
      });
      sock.on('close', () => {
        this.sock = null;
        if (!hello) return reject(new Error('runner closed before hello'));
        if (!this.exit) {
          // The runner ended without telling us; read what it left behind.
          setTimeout(() => {
            const exit = this.readJson<ExitInfo>('exit.json') ?? {
              code: null,
              signal: null,
              error: 'runner connection lost',
              at: Date.now(),
            };
            this.markExit(exit);
          }, 200);
        }
      });
    });
  }

  private markExit(info: ExitInfo) {
    if (this.exit) return;
    this.exit = info;
    this.emit('exit', info);
  }

  private send(msg: Record<string, unknown>) {
    const frame = encodeFrame(FRAME_CONTROL, JSON.stringify(msg));
    if (this.sock && !this.sock.destroyed) this.sock.write(frame);
    else if (!this.exit) this.queue.push(frame);
  }

  /** Writes one line (a JSON message) to the agent's stdin. */
  writeLine(obj: unknown) {
    this.send({ op: 'write', data: (typeof obj === 'string' ? obj : JSON.stringify(obj)) + '\n' });
  }

  stop(graceMs = 4000) {
    this.send({ op: 'stop', graceMs });
  }

  signal(sig: NodeJS.Signals) {
    this.send({ op: 'signal', sig });
  }

  /** Last part of the agent's stderr, for error messages. */
  stderrTail(bytes = 4000): string {
    try {
      const file = path.join(this.dir, 'err.log');
      const size = fs.statSync(file).size;
      const fd = fs.openSync(file, 'r');
      const buf = Buffer.alloc(Math.min(bytes, size));
      fs.readSync(fd, buf, 0, buf.length, size - buf.length);
      fs.closeSync(fd);
      return buf.toString('utf8');
    } catch {
      return '';
    }
  }

  /** Removes the run directory, keeping stderr under logs/ for later inspection. */
  cleanup() {
    try {
      const err = path.join(this.dir, 'err.log');
      if (fs.existsSync(err) && fs.statSync(err).size > 0) {
        fs.copyFileSync(err, path.join(paths.logs, `${this.meta.runId}.stderr.log`));
      }
    } catch {}
    // Windows may still hold a file in it for a moment (the runner on its way out, an antivirus): it goes later.
    try {
      fs.rmSync(this.dir, { recursive: true, force: true, maxRetries: 3 });
    } catch {}
  }
}
