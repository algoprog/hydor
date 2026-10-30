// Notebook kernels. A kernel is a detached process started from an environment's kernel command,
// reached over the wire protocol with its connection file under <data>/kernels. Being detached, it
// keeps running when this server restarts, and the next server reattaches to it. Each cell's latest
// run (its outputs as they arrive) is kept and saved beside the connection file, so a page that opens
// later, or reconnects, sees what ran while it was away.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import type { CellRun, KernelEnv, KernelInfo, KernelOp, KernelStatus, NbOutput } from '../../shared/types.ts';
import { appendOutput } from '../../shared/notebook.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import { agentBaseEnv } from '../env.ts';
import { findEnvs, launchSpec, suggestEnv } from './envs.ts';
import { KernelWire, loadZmq, type ConnectionInfo, type KernelMessage } from './wire.ts';

type Json = Record<string, any>;

/** An execution sent to the kernel; it is over once both its reply and the kernel's idle status arrived. */
interface Pending {
  cellId: string;
  seq: number;
  reply?: Json;
  idle?: boolean;
}

interface Saved {
  id: string;
  notebook: string;
  env: string;
  envName: string;
  language?: string;
  interruptMode: 'signal' | 'message';
  pid: number;
  startedAt: number;
  runs: CellRun[];
  pending: [string, Pending][];
}

const CELL_ID = /^[A-Za-z0-9_-]{1,64}$/;

function alive(pid: number): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Signals the kernel's process group (it leads one), so what its cells started gets it too. */
function signal(pid: number, sig: NodeJS.Signals) {
  try {
    process.kill(-pid, sig);
  } catch {
    try {
      process.kill(pid, sig);
    } catch {}
  }
}

async function exited(pid: number, ms: number): Promise<boolean> {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 100))) if (!alive(pid)) return true;
  return !alive(pid);
}

function freePorts(n: number): Promise<number[]> {
  return Promise.all(
    Array.from(
      { length: n },
      () =>
        new Promise<net.Server>((resolve, reject) => {
          const s = net.createServer();
          s.once('error', reject);
          s.listen(0, '127.0.0.1', () => resolve(s));
        }),
    ),
  ).then(async (servers) => {
    const ports = servers.map((s) => (s.address() as net.AddressInfo).port);
    await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
    return ports;
  });
}

function toOutput(type: string, c: Json): NbOutput {
  if (type === 'stream') return { output_type: 'stream', name: c.name === 'stderr' ? 'stderr' : 'stdout', text: String(c.text ?? '') };
  if (type === 'error') return { output_type: 'error', ename: String(c.ename ?? ''), evalue: String(c.evalue ?? ''), traceback: Array.isArray(c.traceback) ? c.traceback.map(String) : [] };
  const out: NbOutput = { output_type: type === 'execute_result' ? 'execute_result' : 'display_data', data: c.data ?? {}, metadata: c.metadata ?? {} };
  if (type === 'execute_result') out.execution_count = c.execution_count ?? null;
  if (c.transient?.display_id) out.transient = { display_id: String(c.transient.display_id) };
  return out;
}

function readJson<T>(p: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

class Kernel {
  status: KernelStatus = 'starting';
  pid = 0;
  language?: string;
  error?: string;
  lastActivity = Date.now();
  runs = new Map<string, CellRun>();
  pending = new Map<string, Pending>();
  private wire: KernelWire | null = null;
  private iopubSeen = false;
  private exitNote = '';
  private waitClear = new Set<string>();
  private inputHeaders = new Map<string, Json>();
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly m: Kernels,
    readonly id: string,
    readonly notebook: string,
    public env: string,
    public envName: string,
    public interruptMode: 'signal' | 'message',
    public startedAt = Date.now(),
  ) {}

  get files() {
    return { cf: path.join(this.m.dir, `${this.id}.json`), log: path.join(this.m.dir, `${this.id}.log`), state: path.join(this.m.dir, `${this.id}.state.json`) };
  }

  info(): KernelInfo {
    return {
      id: this.id,
      notebook: this.notebook,
      env: this.env,
      envName: this.envName,
      language: this.language,
      status: this.status,
      pid: this.pid,
      startedAt: this.startedAt,
      lastActivity: this.lastActivity,
      error: this.error,
    };
  }

  private emit(e: KernelOp) {
    this.m.emit('op', this.id, e);
  }

  setStatus(s: KernelStatus) {
    if (this.status === s) return;
    this.status = s;
    this.emit({ op: 'kernel', kernel: this.info() });
    this.save();
  }

  private emitRun(run: CellRun) {
    const { outputs: _outputs, ...rest } = run;
    this.emit({ op: 'run', run: rest });
  }

  async launch() {
    const spec = await launchSpec(this.env, this.notebook);
    this.envName = spec.env.name;
    this.interruptMode = spec.interruptMode;
    this.error = undefined;
    const [shell, iopub, stdin, control, hb] = await freePorts(5);
    const info: ConnectionInfo = {
      ip: '127.0.0.1',
      transport: 'tcp',
      signature_scheme: 'hmac-sha256',
      key: crypto.randomBytes(32).toString('hex'),
      shell_port: shell,
      iopub_port: iopub,
      stdin_port: stdin,
      control_port: control,
      hb_port: hb,
    };
    const { cf, log } = this.files;
    fs.writeFileSync(cf, JSON.stringify({ ...info, kernel_name: '' }), { mode: 0o600 });
    const out = fs.openSync(log, 'a', 0o600);
    const base = agentBaseEnv();
    const env = { ...base, ...spec.vars, JPY_SESSION_NAME: this.notebook, PYDEVD_DISABLE_FILE_VALIDATION: '1' };
    const argv = spec.argv.map((a) => a.replace('{connection_file}', cf));
    const child = spawn(argv[0], argv.slice(1), { cwd: path.dirname(this.notebook), env, detached: true, stdio: ['ignore', out, out] });
    fs.closeSync(out);
    const failed = new Promise<Error>((resolve) => child.once('error', resolve));
    child.once('exit', (code, sig) => (this.exitNote = sig ? `killed by ${sig}${sig === 'SIGKILL' ? ', often from running out of memory' : ''}` : `exit code ${code}`));
    child.unref();
    if (!child.pid) throw new Error(`Could not start ${argv[0]}: ${(await failed).message}`);
    this.pid = child.pid;
    this.startedAt = Date.now();
    // Under memory pressure, the kernel OOM killer and earlyoom pick a runaway notebook before this machine's services.
    try {
      fs.writeFileSync(`/proc/${this.pid}/oom_score_adj`, '500');
    } catch {}
    await this.attach(info);
    await this.ready();
  }

  async attach(info: ConnectionInfo) {
    const z = await loadZmq();
    this.wire?.close();
    this.iopubSeen = false;
    this.wire = new KernelWire(z, info, (msg) => this.onMessage(msg));
  }

  /** Asks for kernel info until iopub delivers too: a subscriber misses what was published before it joined. */
  private async ready() {
    const deadline = Date.now() + 60_000;
    while (!this.iopubSeen) {
      if (!alive(this.pid)) throw new Error(this.exitReason());
      if (Date.now() > deadline) throw new Error('The kernel did not start within a minute');
      const r = await this.wire!.request('shell', 'kernel_info_request', {}, 1000).catch(() => null);
      if (r) this.language = r.content.language_info?.name ?? this.language;
    }
  }

  private exitReason(): string {
    let tail = '';
    try {
      tail = fs.readFileSync(this.files.log, 'utf8').slice(-1500).trim();
    } catch {}
    const last = tail.split('\n').filter((l) => l.trim()).pop();
    return `The kernel stopped${this.exitNote ? ` (${this.exitNote})` : ''}${last ? `: ${last}` : ''}`;
  }

  private onMessage(msg: KernelMessage) {
    this.lastActivity = Date.now();
    const type = msg.header.msg_type;
    if (msg.channel === 'iopub') {
      this.iopubSeen = true;
      const st = type === 'status' ? msg.content.execution_state : null;
      if ((st === 'busy' || st === 'idle') && (this.status === 'busy' || this.status === 'idle')) this.setStatus(st);
      if (type === 'update_display_data') return this.updateDisplay(msg.content);
    }
    if (type === 'kernel_info_reply') this.language = msg.content.language_info?.name ?? this.language;
    const pid = msg.parent.msg_id;
    const p = this.pending.get(pid);
    if (!p) return;
    const run = this.runs.get(p.cellId);
    if (!run || run.seq !== p.seq) {
      this.pending.delete(pid);
      return;
    }
    switch (type) {
      case 'status':
        if (msg.content.execution_state === 'busy') this.begin(run);
        else if (msg.content.execution_state === 'idle') {
          p.idle = true;
          this.finish(pid, p, run);
        }
        break;
      case 'execute_input':
        run.count = msg.content.execution_count ?? run.count;
        this.begin(run, true);
        break;
      case 'stream':
      case 'display_data':
      case 'execute_result':
      case 'error':
        this.output(run, toOutput(type, msg.content));
        break;
      case 'clear_output':
        if (msg.content.wait) this.waitClear.add(run.cellId);
        else this.clear(run);
        break;
      case 'execute_reply':
        p.reply = msg.content;
        if (msg.content.execution_count != null) run.count = msg.content.execution_count;
        this.finish(pid, p, run);
        break;
      case 'input_request':
        this.inputHeaders.set(run.cellId, msg.header);
        run.input = { prompt: String(msg.content.prompt ?? ''), password: !!msg.content.password };
        this.emitRun(run);
        break;
    }
  }

  private begin(run: CellRun, changed = false) {
    if (run.state === 'queued') {
      run.state = 'running';
      run.startedAt = Date.now();
      changed = true;
    }
    if (changed) this.emitRun(run);
  }

  private finish(id: string, p: Pending, run: CellRun) {
    if (!p.reply || (!p.idle && p.reply.status !== 'aborted')) return;
    this.pending.delete(id);
    run.state = p.reply.status === 'ok' ? 'ok' : p.reply.status === 'aborted' ? 'aborted' : 'error';
    run.endedAt = Date.now();
    delete run.input;
    this.inputHeaders.delete(run.cellId);
    this.waitClear.delete(run.cellId);
    this.emitRun(run);
    this.save();
  }

  private output(run: CellRun, o: NbOutput) {
    if (this.waitClear.delete(run.cellId)) this.clear(run);
    run.outputs = appendOutput(run.outputs, o);
    this.emit({ op: 'out', cellId: run.cellId, seq: run.seq, output: o });
    this.save();
  }

  private clear(run: CellRun) {
    run.outputs = [];
    this.emit({ op: 'clear', cellId: run.cellId, seq: run.seq });
    this.save();
  }

  private updateDisplay(c: Json) {
    const id = c.transient?.display_id;
    if (!id) return;
    for (const run of this.runs.values()) {
      run.outputs.forEach((o, index) => {
        if (o.transient?.display_id !== id) return;
        const output: NbOutput = { ...o, data: c.data ?? {}, metadata: c.metadata ?? {} };
        run.outputs[index] = output;
        this.emit({ op: 'replace', cellId: run.cellId, seq: run.seq, index, output });
      });
    }
    this.save();
  }

  execute(cells: { cellId: string; code: string }[]): number[] {
    if (!this.wire || (this.status !== 'idle' && this.status !== 'busy')) throw new HttpError(409, this.status === 'dead' ? 'The kernel has stopped; restart it' : 'The kernel is still starting');
    return cells.map(({ cellId, code }) => {
      if (!CELL_ID.test(cellId) || typeof code !== 'string') throw new HttpError(400, 'Bad cell');
      const run: CellRun = { cellId, seq: (this.runs.get(cellId)?.seq ?? 0) + 1, state: 'queued', count: null, outputs: [] };
      this.runs.set(cellId, run);
      this.waitClear.delete(cellId);
      const id = this.wire!.send('shell', 'execute_request', { code, silent: false, store_history: true, user_expressions: {}, allow_stdin: true, stop_on_error: true });
      this.pending.set(id, { cellId, seq: run.seq });
      this.emitRun(run);
      return run.seq;
    });
  }

  /** Answers the kernel's input() and echoes the answer under the cell, as Jupyter shows it. */
  input(cellId: string, value: string) {
    const header = this.inputHeaders.get(cellId);
    const run = this.runs.get(cellId);
    if (!header || !run?.input || !this.wire) throw new HttpError(409, 'The kernel is not waiting for input');
    this.wire.send('stdin', 'input_reply', { value }, header);
    this.inputHeaders.delete(cellId);
    const echo = `${run.input.prompt}${run.input.password ? '········' : value}\n`;
    delete run.input;
    this.emitRun(run);
    this.output(run, { output_type: 'stream', name: 'stdout', text: echo });
  }

  async complete(code: string, cursor: number): Promise<{ matches: string[]; start: number; end: number }> {
    if (!this.wire || this.status !== 'idle') return { matches: [], start: cursor, end: cursor };
    const r = await this.wire.request('shell', 'complete_request', { code, cursor_pos: cursor }, 4000);
    return { matches: (r.content.matches ?? []).slice(0, 200).map(String), start: r.content.cursor_start ?? cursor, end: r.content.cursor_end ?? cursor };
  }

  async interrupt() {
    if (this.interruptMode === 'message') await this.wire?.request('control', 'interrupt_request', {}, 5000).catch(() => {});
    else signal(this.pid, 'SIGINT');
  }

  /** Runs that were waiting or running end as aborted: the kernel that would finish them is gone. */
  private abortPending() {
    for (const p of this.pending.values()) {
      const run = this.runs.get(p.cellId);
      if (!run || run.seq !== p.seq) continue;
      run.state = 'aborted';
      run.endedAt = Date.now();
      delete run.input;
      this.emitRun(run);
    }
    this.pending.clear();
    this.waitClear.clear();
    this.inputHeaders.clear();
  }

  private async stop(restart: boolean) {
    const pid = this.pid;
    if (this.wire && alive(pid)) await this.wire.request('control', 'shutdown_request', { restart }, 2000).catch(() => {});
    this.wire?.close();
    this.wire = null;
    if (await exited(pid, 3000)) return;
    signal(pid, 'SIGTERM');
    if (!(await exited(pid, 2000))) signal(pid, 'SIGKILL');
  }

  async restart() {
    if (this.status === 'starting' || this.status === 'restarting') throw new HttpError(409, 'The kernel is already starting');
    this.setStatus('restarting');
    this.abortPending();
    await this.stop(true);
    this.setStatus('starting');
    try {
      await this.launch();
      this.setStatus('idle');
    } catch (e) {
      this.error = (e as Error).message;
      this.setStatus('dead');
      throw new HttpError(500, this.error);
    }
  }

  async shutdown() {
    this.abortPending();
    await this.stop(false);
    this.status = 'dead';
    this.removeFiles();
    this.emit({ op: 'gone' });
  }

  removeFiles() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    for (const f of Object.values(this.files)) fs.rmSync(f, { force: true });
  }

  /** The kernel process went away on its own (a crash, or killed for memory). */
  died() {
    this.wire?.close();
    this.wire = null;
    this.abortPending();
    this.error = this.exitReason();
    this.setStatus('dead');
  }

  /**
   * After a server restart the replies and idle statuses of executions that ended meanwhile were never
   * received. The kernel answers shell requests in order, so once it answers this one, any execution
   * still unaccounted for is over.
   */
  fence() {
    this.wire
      ?.request('shell', 'kernel_info_request', {}, 7 * 24 * 3600_000)
      .then(() => {
        for (const [id, p] of this.pending) {
          const run = this.runs.get(p.cellId);
          this.pending.delete(id);
          if (!run || run.seq !== p.seq) continue;
          run.state = p.reply?.status === 'error' ? 'error' : 'ok';
          run.endedAt = Date.now();
          this.emitRun(run);
        }
        if (this.status === 'busy') this.setStatus('idle');
        this.save();
      })
      .catch(() => {});
  }

  private saved(): string {
    const s: Saved = {
      id: this.id,
      notebook: this.notebook,
      env: this.env,
      envName: this.envName,
      language: this.language,
      interruptMode: this.interruptMode,
      pid: this.pid,
      startedAt: this.startedAt,
      runs: [...this.runs.values()],
      pending: [...this.pending.entries()],
    };
    return JSON.stringify(s);
  }

  save() {
    if (this.saveTimer || this.status === 'dead') return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      const tmp = `${this.files.state}.${process.pid}.tmp`;
      fs.promises
        .writeFile(tmp, this.saved(), { mode: 0o600 })
        .then(() => fs.promises.rename(tmp, this.files.state))
        .catch(() => {});
    }, 2000);
  }

  /** Writes a save that is still waiting, now (the server is stopping). */
  flush() {
    if (!this.saveTimer) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const tmp = `${this.files.state}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(tmp, this.saved(), { mode: 0o600 });
      fs.renameSync(tmp, this.files.state);
    } catch {}
  }

  static async restore(m: Kernels, s: Saved, info: ConnectionInfo): Promise<Kernel> {
    const k = new Kernel(m, s.id, s.notebook, s.env, s.envName, s.interruptMode, s.startedAt);
    k.pid = s.pid;
    k.language = s.language;
    for (const r of s.runs) {
      delete r.input; // its request went with the old server
      k.runs.set(r.cellId, r);
    }
    for (const [id, p] of s.pending) k.pending.set(id, p);
    k.status = k.pending.size ? 'busy' : 'idle';
    await k.attach(info);
    if (k.pending.size) k.fence();
    return k;
  }
}

export class Kernels extends EventEmitter {
  readonly dir = path.join(config.dataDir, 'kernels');
  private list = new Map<string, Kernel>();
  private starting = new Map<string, Promise<KernelInfo>>();
  private lastEnv: Record<string, string>;

  constructor() {
    super();
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    this.lastEnv = readJson<Record<string, string>>(path.join(this.dir, 'last-env.json')) ?? {};
    setInterval(() => {
      for (const k of this.list.values()) if ((k.status === 'idle' || k.status === 'busy') && !alive(k.pid)) k.died();
    }, 2000).unref();
  }

  /** Reattaches to the kernels a previous server left running; forgets the ones that are gone. */
  async restore() {
    for (const f of fs.readdirSync(this.dir)) {
      const id = /^([0-9a-f]{8})\.state\.json$/.exec(f)?.[1];
      if (!id) continue;
      const cf = path.join(this.dir, `${id}.json`);
      const s = readJson<Saved>(path.join(this.dir, f));
      const info = readJson<ConnectionInfo>(cf);
      let cmdline = '';
      try {
        if (s?.pid) cmdline = fs.readFileSync(`/proc/${s.pid}/cmdline`, 'utf8');
      } catch {}
      if (!s || !info || !cmdline.includes(cf)) {
        for (const x of [cf, path.join(this.dir, `${id}.log`), path.join(this.dir, f)]) fs.rmSync(x, { force: true });
        continue;
      }
      const k = await Kernel.restore(this, s, info);
      this.list.set(k.id, k);
      console.log(`[kernels] reattached ${k.id} for ${k.notebook} (${k.status})`);
    }
  }

  /** Saves every kernel's runs before the server stops; the kernels themselves keep running. */
  flush() {
    for (const k of this.list.values()) k.flush();
  }

  private get(id: string): Kernel {
    const k = this.list.get(id);
    if (!k) throw new HttpError(404, 'No such kernel');
    return k;
  }

  all(): KernelInfo[] {
    return [...this.list.values()].map((k) => {
      let rss: number | undefined;
      try {
        const kb = /VmRSS:\s+(\d+)/.exec(fs.readFileSync(`/proc/${k.pid}/status`, 'utf8'))?.[1];
        if (kb) rss = Number(kb) * 1024;
      } catch {}
      return { ...k.info(), rss };
    });
  }

  snapshot(id: string): { kernel: KernelInfo; runs: CellRun[] } {
    const k = this.get(id);
    return { kernel: k.info(), runs: [...k.runs.values()] };
  }

  async envs(notebook: string): Promise<{ envs: KernelEnv[]; suggested?: string }> {
    const nb = path.resolve(notebook);
    const envs = (await findEnvs(nb)).map((f) => f.env);
    let meta: Json | undefined;
    try {
      meta = JSON.parse(fs.readFileSync(nb, 'utf8')).metadata;
    } catch {}
    return { envs, suggested: suggestEnv(envs, meta, this.lastEnv[nb]) };
  }

  /** The notebook's kernel, started in `env` (or the suggested environment); one kernel per notebook. */
  start(notebookArg: string, env?: string): Promise<KernelInfo> {
    const notebook = path.resolve(String(notebookArg ?? ''));
    if (!notebook.endsWith('.ipynb') || !fs.existsSync(notebook)) throw new HttpError(400, 'Not a notebook');
    const busy = this.starting.get(notebook);
    if (busy) return busy;
    const p = this.doStart(notebook, env).finally(() => this.starting.delete(notebook));
    this.starting.set(notebook, p);
    return p;
  }

  private async doStart(notebook: string, envArg?: string): Promise<KernelInfo> {
    const have = [...this.list.values()].find((k) => k.notebook === notebook);
    if (have && (!envArg || envArg === have.env)) {
      if (have.status === 'dead') await have.restart();
      return have.info();
    }
    if (have) await this.shutdown(have.id);
    const env = envArg ?? (await this.envs(notebook)).suggested;
    if (!env) throw new HttpError(400, 'No Python environment was found');
    const k = new Kernel(this, crypto.randomBytes(4).toString('hex'), notebook, env, '', 'signal');
    this.list.set(k.id, k);
    this.emit('op', k.id, { op: 'kernel', kernel: k.info() } satisfies KernelOp);
    try {
      await k.launch();
    } catch (e) {
      this.list.delete(k.id);
      k.removeFiles();
      if (k.pid) signal(k.pid, 'SIGKILL');
      throw e instanceof HttpError ? e : new HttpError(500, (e as Error).message);
    }
    k.setStatus('idle');
    this.lastEnv[notebook] = env;
    fs.writeFile(path.join(this.dir, 'last-env.json'), JSON.stringify(this.lastEnv), () => {});
    return k.info();
  }

  execute(id: string, cells: { cellId: string; code: string }[]) {
    return this.get(id).execute(cells);
  }
  input(id: string, cellId: string, value: string) {
    this.get(id).input(cellId, value);
  }
  complete(id: string, code: string, cursor: number) {
    return this.get(id).complete(code, cursor);
  }
  interrupt(id: string) {
    return this.get(id).interrupt();
  }
  async restart(id: string) {
    await this.get(id).restart();
    return this.get(id).info();
  }
  async shutdown(id: string) {
    const k = this.get(id);
    this.list.delete(id);
    await k.shutdown();
  }
}
