// The small model's Python worker, as a process we talk to in JSON lines (docs/plans/word-suggestions.md): every request has
// an id, every answer carries it back. Started as embed.ts starts its worker: its environment is a short list, it says
// {"ready": true} once loaded, and it is given a few minutes to do so.
import { spawn, type ChildProcess } from 'node:child_process';
import readline from 'node:readline';

export type Reply = Record<string, any>;

interface Pending {
  resolve(r: Reply): void;
  reject(e: Error): void;
  timer?: NodeJS.Timeout;
}

/** The environment a Python child gets: what it needs to find its libraries and files, none of the app's secrets. */
export function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const keep = ['PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TMPDIR', 'SYSTEMROOT', 'USERPROFILE', 'LOCALAPPDATA', 'XDG_CACHE_HOME'];
  const env: NodeJS.ProcessEnv = Object.fromEntries(keep.filter((k) => process.env[k] != null).map((k) => [k, process.env[k]]));
  // No GPU: the models run on the processor, beside what the person is doing.
  return Object.assign(env, { PYTHONDONTWRITEBYTECODE: '1', PYTHONUNBUFFERED: '1', CUDA_VISIBLE_DEVICES: '', TOKENIZERS_PARALLELISM: 'false' }, extra);
}

export class PyWorker {
  ready = false;
  rss?: number;
  /** What the worker was last told to load (a key), to load again only when it changes. */
  loadedKey = '';
  private pending = new Map<number, Pending>();
  private seq = 0;
  private lastErr: string[] = [];
  /** Heard from the worker: a line of status ("loading"). */
  onStatus?: (s: string) => void;

  private constructor(readonly proc: ChildProcess) {}

  /**
   * Starts `python -I script`; resolves with the worker once it says it is ready, or with why it could not (it stopped,
   * did not start, took more than `loadMs`). `onExit` hears of its end afterwards, with why (null: it was stopped).
   */
  static start(python: string, script: string, env: NodeJS.ProcessEnv, o: { loadMs: number; onExit(w: PyWorker, why: string | null, wasReady: boolean): void }): Promise<PyWorker | string> {
    return new Promise((resolve) => {
      let proc: ChildProcess;
      try {
        proc = spawn(python, ['-I', script], { stdio: ['pipe', 'pipe', 'pipe'], env });
      } catch (e) {
        return resolve((e as Error).message);
      }
      const w = new PyWorker(proc);
      let settled = false;
      const done = (v: PyWorker | string) => {
        if (settled) return;
        settled = true;
        clearTimeout(giveUp);
        resolve(v);
      };
      const giveUp = setTimeout(() => {
        w.stop();
        done('The language models took too long to load');
      }, o.loadMs);
      proc.stdin!.on('error', () => {});
      proc.stderr!.on('data', (b: Buffer) => {
        for (const l of b.toString().split('\n')) if (l.trim()) w.lastErr.push(l.trim().slice(0, 300));
        w.lastErr.splice(0, Math.max(0, w.lastErr.length - 20));
      });
      readline.createInterface({ input: proc.stdout! }).on('line', (line) => {
        let m: Reply;
        try {
          m = JSON.parse(line);
        } catch {
          return;
        }
        if (m.ready) {
          w.ready = true;
          if (typeof m.rss === 'number') w.rss = m.rss;
          done(w);
        } else if (m.status) w.onStatus?.(String(m.status));
        else if (m.id != null) {
          const p = w.pending.get(m.id);
          if (!p) return;
          w.pending.delete(m.id);
          clearTimeout(p.timer);
          if (typeof m.rss === 'number') w.rss = m.rss;
          if (m.error) p.reject(new Error(String(m.error)));
          else p.resolve(m);
        }
      });
      proc.on('error', (e) => {
        w.fail(e.message);
        done(e.message);
        o.onExit(w, e.message, false);
      });
      proc.on('exit', (code, signal) => {
        const stopped = w.stopping;
        const why = stopped ? null : `The language models' worker stopped (${signal ?? `exit ${code}`})${w.lastErr.length ? `: ${w.lastErr.slice(-2).join(' ')}` : ''}`;
        const was = w.ready;
        w.ready = false;
        w.fail(why ?? 'The worker stopped');
        done(why ?? 'The language models stopped');
        o.onExit(w, why, was);
      });
    });
  }

  private stopping = false;

  /** A request, with its id (to cancel it) and its answer; an error line, a timeout or the worker ending rejects it. */
  request(msg: Record<string, unknown>, timeoutMs: number): { id: number; done: Promise<Reply> } {
    const id = ++this.seq;
    const done = new Promise<Reply>((resolve, reject) => {
      if (!this.proc.stdin?.writable) return reject(new Error('The worker is not running'));
      const p: Pending = { resolve, reject };
      p.timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('The worker took too long'));
      }, timeoutMs);
      p.timer.unref?.();
      this.pending.set(id, p);
      this.proc.stdin.write(JSON.stringify({ id, ...msg }) + '\n');
    });
    return { id, done };
  }

  /** Asks the worker to drop a request that waits or to stop decoding it (it answers that one with cancelled). */
  cancel(target: number) {
    this.request({ op: 'cancel', target }, 5000).done.catch(() => {});
  }

  get busy() {
    return this.pending.size;
  }

  private fail(why: string) {
    for (const p of this.pending.values()) clearTimeout(p.timer), p.reject(new Error(why));
    this.pending.clear();
  }

  /** Ends the worker: its input closes (it exits by itself), and a signal follows if it does not. */
  stop() {
    this.stopping = true;
    try {
      this.proc.stdin?.end();
    } catch {}
    const t = setTimeout(() => {
      try {
        this.proc.kill('SIGTERM');
      } catch {}
    }, 3000);
    t.unref?.();
    this.proc.once('exit', () => clearTimeout(t));
    try {
      this.proc.kill('SIGTERM');
    } catch {}
  }
}
