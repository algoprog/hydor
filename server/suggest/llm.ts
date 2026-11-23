// llama-server, running Qwen3.5-0.8B-Base for word suggestions: started when the settings and the computer's memory allow,
// asked by the Python worker over HTTP on this computer's own address, stopped after half an hour without a request, and
// started again if it dies (once a minute at most).
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import type { SuggestStatus } from '../../shared/suggest.ts';

export const LLM_IDLE_MS = 30 * 60_000;
const LOAD_MS = 2 * 60_000;
const RESTART_GAP_MS = 60_000;

export type LlmState = SuggestStatus['llm'];

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => resolve(port));
    });
  });

export class LlamaServer {
  state: LlmState = { state: 'off' };
  url: string | null = null;
  private proc: ChildProcess | null = null;
  private starting: Promise<string | null> | null = null;
  private lastStart = 0;
  private idle?: NodeJS.Timeout;
  private lastUsed = 0;
  private err: string[] = [];
  /** Hears of every change of its state (the worker is told its address, the status is sent to the pages). */
  constructor(private onChange: () => void) {}

  get running() {
    return this.state.state === 'ready' && !!this.proc;
  }
  get pid() {
    return this.proc?.pid;
  }

  private set(s: LlmState) {
    this.state = s;
    this.onChange();
  }

  /** The server's address, started when it is not running: null when it could not be (state says why). */
  start(o: { binary: string; gguf: string; threads: number; idleMs?: number }): Promise<string | null> {
    if (this.url && this.proc) return Promise.resolve(this.url);
    if (this.starting) return this.starting;
    const wait = this.lastStart + RESTART_GAP_MS - Date.now();
    if (wait > 0 && this.state.state === 'failed') return Promise.resolve(null);
    this.lastStart = Date.now();
    this.starting = this.launch(o).finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async launch(o: { binary: string; gguf: string; threads: number; idleMs?: number }): Promise<string | null> {
    this.set({ state: 'starting' });
    this.err = [];
    let port: number;
    try {
      port = await freePort();
    } catch (e) {
      this.set({ state: 'failed', detail: `No free port on this computer: ${(e as Error).message}` });
      return null;
    }
    const env: NodeJS.ProcessEnv = {};
    for (const k of ['PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TMPDIR', 'SYSTEMROOT']) if (process.env[k] != null) env[k] = process.env[k];
    env.CUDA_VISIBLE_DEVICES = '';
    // The libraries beside the program (its own folder is also where it looks, on every system).
    env.LD_LIBRARY_PATH = path.dirname(o.binary);
    const args = ['-m', o.gguf, '-t', String(o.threads), '-np', '1', '-c', '2048', '--host', '127.0.0.1', '--port', String(port), '--no-webui'];
    const proc = spawn(o.binary, args, { cwd: path.dirname(o.binary), stdio: ['ignore', 'ignore', 'pipe'], env });
    this.proc = proc;
    let stopped = false;
    let exited: string | null = null;
    proc.stderr!.on('data', (b: Buffer) => {
      for (const l of b.toString().split('\n')) if (l.trim()) this.err.push(l.trim().slice(0, 300));
      this.err.splice(0, Math.max(0, this.err.length - 20));
    });
    proc.on('error', (e) => {
      exited = e.message;
    });
    proc.on('exit', (code, signal) => {
      exited = `${signal ?? `exit ${code}`}`;
      if (this.proc !== proc) return;
      this.proc = null;
      this.url = null;
      clearTimeout(this.idle);
      if (!stopped) this.set({ state: 'failed', detail: `The language model stopped (${exited})${this.err.length ? `: ${this.err.slice(-2).join(' ')}` : ''}. It starts again in a minute.` });
    });
    const stopHere = () => {
      stopped = true;
      this.kill(proc);
    };
    const deadline = Date.now() + LOAD_MS;
    const base = `http://127.0.0.1:${port}`;
    while (Date.now() < deadline) {
      if (exited != null) {
        this.proc = null;
        this.set({ state: 'failed', detail: `The language model did not start (${exited})${this.err.length ? `: ${this.err.slice(-2).join(' ')}` : ''}` });
        return null;
      }
      if (this.proc !== proc) return null;
      try {
        const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2000) });
        if (r.ok && ((await r.json().catch(() => ({}))) as { status?: string }).status === 'ok') {
          this.url = base;
          this.lastUsed = Date.now();
          this.watchIdle(o.idleMs ?? LLM_IDLE_MS);
          this.set({ state: 'ready' });
          return base;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 300));
    }
    stopHere();
    this.proc = null;
    this.set({ state: 'failed', detail: 'The language model took too long to load' });
    return null;
  }

  /** A request used it: it stays up for a while longer. */
  touch() {
    this.lastUsed = Date.now();
  }

  private watchIdle(ms: number) {
    clearTimeout(this.idle);
    const tick = Math.max(1000, Math.min(60_000, ms / 2));
    const check = () => {
      if (!this.proc) return;
      if (Date.now() - this.lastUsed >= ms) return void this.stop('Stopped after half an hour without a suggestion; it starts again when you type');
      this.idle = setTimeout(check, tick);
      this.idle.unref?.();
    };
    this.idle = setTimeout(check, tick);
    this.idle.unref?.();
  }

  private kill(p: ChildProcess) {
    try {
      p.kill('SIGTERM');
    } catch {}
    const t = setTimeout(() => {
      try {
        if (p.exitCode == null) p.kill('SIGKILL');
      } catch {}
    }, 5000);
    t.unref?.();
    p.once('exit', () => clearTimeout(t));
  }

  /** Stops it (by its process, never by name); `why` is what the status then says. */
  stop(why?: string, state: LlmState['state'] = 'off') {
    clearTimeout(this.idle);
    const p = this.proc;
    this.proc = null;
    this.url = null;
    if (p) {
      p.removeAllListeners('exit');
      p.once('exit', () => {});
      this.kill(p);
    }
    this.set({ state, ...(why ? { detail: why } : {}) });
  }

  /** Nothing is going on with it: not running, nothing to say. */
  reset() {
    if (this.proc || this.starting) return;
    this.set({ state: 'off' });
  }

  /** The state with something to say (why it is not running: turned off, too little memory). */
  note(s: LlmState) {
    if (this.proc || this.starting) return;
    if (JSON.stringify(s) !== JSON.stringify(this.state)) this.set(s);
  }
}
