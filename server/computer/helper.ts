// A helper program that stays running while an agent uses the computer, on Windows (PowerShell with a little C#) and on
// Linux (Python with X11's XTest): starting one takes a moment (a second or two for PowerShell to compile its C#), so
// it is started once and asked again and again, one line of JSON each way:
//   → {"id":1,"ops":[…]}            ← {"id":1,"ok":true,"out":{…}}   or   {"id":1,"ok":false,"error":"…"}
// It says {"ready":true,…} first, with what it found (Linux: whether a compositor runs). Stop (or a call that takes too
// long) ends the program, which ends what it was doing; the next call starts it again. After a few idle minutes it ends.
import { spawn, type ChildProcess } from 'node:child_process';
import readline from 'node:readline';

/** JSON with every character past ASCII written as \uXXXX: what the helpers read, whatever their console's code page. */
export const asciiJson = (v: unknown) => JSON.stringify(v).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

export interface HelperSpec {
  /** Its name in errors ("the Windows helper"). */
  name: string;
  /** The program and its arguments, worked out when it starts (a script written first, say). */
  command: () => { cmd: string; args: string[]; env?: NodeJS.ProcessEnv };
  /** How long it may take to say it is ready. */
  startMs?: number;
  /** Idle this long, it ends. */
  idleMs?: number;
}

type Waiter = { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void };

export class Helper {
  private child: ChildProcess | null = null;
  private ready: Promise<Record<string, unknown>> | null = null;
  private waiting = new Map<number, Waiter>();
  private next = 1;
  private idle: NodeJS.Timeout | null = null;
  private stderr = '';
  /** What it said when it was ready, the last time it started. */
  facts: Record<string, unknown> | null = null;

  constructor(private spec: HelperSpec) {}

  /** Starts it if it is not running, and waits until it says it is ready. */
  start(): Promise<Record<string, unknown>> {
    if (this.ready) return this.ready;
    const { cmd, args, env } = this.spec.command();
    let child: ChildProcess;
    try {
      child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: env ?? process.env });
    } catch (e) {
      return Promise.reject(new Error(`${this.spec.name} did not start: ${(e as Error).message}`));
    }
    this.child = child;
    this.stderr = '';
    child.stderr!.setEncoding('utf8');
    child.stderr!.on('data', (d: string) => (this.stderr = (this.stderr + d).slice(-4000)));
    child.stdin!.on('error', () => {});
    const lines = readline.createInterface({ input: child.stdout! });
    let onReady: Waiter | null = null;
    this.ready = new Promise<Record<string, unknown>>((resolve, reject) => {
      onReady = { resolve, reject };
      const t = setTimeout(() => {
        reject(new Error(`${this.spec.name} did not start in time${this.why()}`));
        this.end(child);
      }, this.spec.startMs ?? 30_000);
      t.unref?.();
      child.once('exit', () => clearTimeout(t));
      lines.once('line', () => clearTimeout(t));
    });
    // Keep a failure to start from going unhandled when nobody waits on it yet.
    this.ready.catch(() => {});
    lines.on('line', (line) => {
      let m: Record<string, unknown>;
      try {
        m = JSON.parse(line);
      } catch {
        return;
      }
      if (m.ready === true && onReady) {
        this.facts = m;
        onReady.resolve(m);
        onReady = null;
        return;
      }
      const w = this.waiting.get(Number(m.id));
      if (!w) return;
      this.waiting.delete(Number(m.id));
      if (m.ok === true) w.resolve((m.out as Record<string, unknown>) ?? {});
      else w.reject(new Error(String(m.error ?? 'it failed')));
    });
    child.on('error', (e) => this.gone(child, `${this.spec.name} did not start: ${e.message}`, onReady));
    child.on('exit', (code, signal) => this.gone(child, `${this.spec.name} stopped (${signal ?? `exit ${code}`})${this.why()}`, onReady));
    return this.ready;
  }

  /** The last line it wrote to stderr, for what went wrong. */
  private why(): string {
    const last = this.stderr
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .pop();
    return last ? `: ${last.slice(0, 300)}` : '';
  }

  private gone(child: ChildProcess, message: string, onReady: Waiter | null) {
    if (this.child !== child) return;
    this.child = null;
    this.ready = null;
    if (this.idle) clearTimeout(this.idle);
    onReady?.reject(new Error(message));
    for (const w of this.waiting.values()) w.reject(new Error(message));
    this.waiting.clear();
  }

  private end(child: ChildProcess | null) {
    if (!child) return;
    try {
      child.kill('SIGKILL');
    } catch {}
  }

  /** Ends it now (Stop, or the app going): what it was doing stops with it. */
  stop() {
    const child = this.child;
    this.gone(child!, `${this.spec.name} was stopped`, null);
    this.end(child);
  }

  /** Asks it one thing and waits for the answer; Stop (the signal) or the time running out ends the helper. */
  async call(req: Record<string, unknown>, o: { signal?: AbortSignal; timeoutMs: number }): Promise<Record<string, unknown>> {
    if (o.signal?.aborted) throw new Error('Stopped');
    await this.start();
    const child = this.child;
    if (!child) throw new Error(`${this.spec.name} is not running`);
    if (this.idle) clearTimeout(this.idle);
    const id = this.next++;
    try {
      return await new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`${this.spec.name} took too long`));
          this.stop();
        }, o.timeoutMs);
        const abort = () => {
          reject(new Error('Stopped'));
          this.stop();
        };
        o.signal?.addEventListener('abort', abort, { once: true });
        const done = () => {
          clearTimeout(timer);
          o.signal?.removeEventListener('abort', abort);
        };
        this.waiting.set(id, {
          resolve: (v) => (done(), resolve(v)),
          reject: (e) => (done(), reject(e)),
        });
        child.stdin!.write(`${asciiJson({ ...req, id })}\n`);
      });
    } finally {
      if (this.child === child && !this.waiting.size) {
        this.idle = setTimeout(() => this.stop(), this.spec.idleMs ?? 5 * 60_000);
        this.idle.unref?.();
      }
    }
  }
}
