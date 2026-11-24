// Word suggestions on the server: the settings, setting things up, the two processes (the small model's Python worker and
// llama-server for Qwen3.5), the suggestions asked of them (only the newest of each browser tab is kept), what the session
// cache is fed, and personalising on its schedule. docs/plans/word-suggestions.md describes the whole.
import os from 'node:os';
import { type SuggestCounts, type SuggestRequest, type SuggestResponse, type SuggestSettings, type SuggestState, type SuggestStatus, type SuggestUsage } from '../../shared/suggest.ts';
import { HttpError } from '../auth.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { ownWords } from '../memory/learn.ts';
import { availableMemory } from '../models/machine.ts';
import { childEnv, PyWorker, type Reply } from './engine.ts';
import { LlamaServer } from './llm.ts';
import { llmThreads, merge, readSettings, workerThreads, writeSettings } from './settings.ts';
import { leftoverTraining, reapLeftovers } from './procs.ts';
import { ggufPath, llamaBinary, llamaSupported, packagesReady, pythonPath, releaseDir, releaseProblem, setupGguf, setupLlama, setupPython, setupRelease, suggestDisabled, unsupportedSystem, workerScript } from './setup.ts';
import { forgetPersonal, gpuHold, hasPersonal, lastDevice, personalDir, personalState, recoverPersonal, Trainer } from './train.ts';
import { lastTyped } from './texts.ts';
import { addUsage, readUsage, resetUsage } from './usage.ts';

/** The worker quits after this long without a request. */
const WORKER_IDLE_MS = 10 * 60_000;
const LOAD_MS = 3 * 60_000;
/** Free memory the worker needs to start (the small model on ONNX Runtime: about 0.6 GB loaded). */
const WORKER_NEED_MB = 1024;
/** Memory the language model needs: 2.5 GB free, on a computer of at least 8 GB (a computer sold as 8 GB reports 7.7). */
const LLM_NEED_MB = 2560;
const LLM_TOTAL_MB = 7.5 * 1024;
/** A request that waited this long for the one before it is dropped (the person has typed on), and one that decodes this long is stopped. */
const QUEUE_MS = 2000;
const DECODE_MS = 10_000;
const QUIET_MS = 10 * 60_000;
const CHECK_MS = 10 * 60_000;
/** The gap between runs: about a day (a computer that is off at night too), a week. */
const GAP_MS = { nightly: 20 * 3600_000, weekly: 164 * 3600_000 };
const ATTEMPT_KEY = 'suggest.train.at';
/**
 * A run the person paused: {at, done, total} (where it had got). It is kept across a restart of the server, and while it is
 * there the schedule starts nothing: only Resume (or Retrain now) goes on from the run's resume state, and Stop drops it.
 */
const PAUSE_KEY = 'suggest.train.paused';
interface Paused {
  at: number;
  done: number;
  total: number;
}
/**
 * When word suggestions were first wanted: a message box used (warm or a request) or the switch turned on. On by default,
 * they set themselves up only from then on, so a server nobody types on (headless, Docker) downloads nothing, and the
 * small model is never personalised for hours on a computer whose person never used them.
 */
const USED_KEY = 'suggest.used';
/**
 * How long the n-th failure in a row waits to be tried again: ten minutes, doubled each time, at most a day. A failed setup
 * or download of the language model would otherwise start again with every request that wants it.
 */
export const retryAfter = (n: number) => Math.min(10 * 60_000 * 2 ** Math.max(0, n - 1), 24 * 3600_000);
/** Memory found short is not asked about again for this long (every keystroke asks for a suggestion). */
const SHORT_MEMORY_MS = 30_000;

interface Job {
  req: SuggestRequest;
  queuedAt: number;
  resolve(r: SuggestResponse | null): void;
  id?: number;
  running?: boolean;
  cancelled?: boolean;
  worker?: PyWorker;
}

export class SuggestService {
  private st: SuggestSettings;
  private worker: PyWorker | null = null;
  private startingWorker: Promise<PyWorker | null> | null = null;
  private setupP: Promise<boolean> | null = null;
  private setupDetail?: string;
  private setupDone = false;
  private abort = new AbortController();
  private failure: { why: string; at: number } | null = null;
  /** Failures in a row since it last worked: each waits twice as long as the one before to be tried again (retryAfter). */
  private failedTimes = 0;
  private crashes: number[] = [];
  private short: { free: number; need: number } | null = null;
  private idleTimer?: NodeJS.Timeout;
  private checkTimer?: NodeJS.Timeout;
  private notifyTimer?: NodeJS.Timeout;
  private lastRequest = 0;
  private llmTried = 0;
  private startingLlm: Promise<string | null> | null = null;
  private startingLlmGen = 0;
  /** Count the stops: a start that began before one gives up at its next step, and what it started is stopped. */
  private gen = 0;
  private llmGen = 0;
  /** The worker's process while it starts (it is not yet used for requests, but a stop must reach it). */
  private pendingWorker: PyWorker | null = null;
  private llmPrep = new Map<string, Promise<boolean>>();
  private llmPrepFailed = new Map<string, { at: number; n: number }>();
  private memShortUntil = 0;
  private loading: Promise<void> | null = null;
  private loadInfo: { kind: 'base' | 'personal'; languages?: Record<string, number> } | null = null;
  private queue: Job[] = [];
  private byClient = new Map<string, Job>();
  private pumping = false;
  private sent = new Map<string, { n: number; m: number }>();
  private times: number[] = [];
  private requests = 0;
  readonly llm: LlamaServer;
  readonly trainer: Trainer;

  constructor(
    private db: DB,
    private broadcast: (state: SuggestState) => void = () => {},
  ) {
    this.st = readSettings(db);
    this.llm = new LlamaServer(() => {
      this.changed();
      void this.syncLoad();
    });
    this.trainer = new Trainer(() => this.changed());
  }

  get settings(): SuggestSettings {
    return this.st;
  }

  // ---- the state ------------------------------------------------------------------------------------------------

  private changed() {
    if (this.notifyTimer) return;
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = undefined;
      try {
        this.broadcast(this.state());
      } catch {}
    }, 150);
    this.notifyTimer.unref?.();
  }

  private trainedAt() {
    return personalState()?.trainedAt ?? 0;
  }

  /** The paused run, or null. */
  private paused(): Paused | null {
    try {
      const p = JSON.parse(kvGet(this.db, PAUSE_KEY) ?? 'null') as Paused | null;
      return p && typeof p.at === 'number' ? { at: p.at, done: Number(p.done) || 0, total: Number(p.total) || 0 } : null;
    } catch {
      return null;
    }
  }

  private clearPause() {
    if (kvGet(this.db, PAUSE_KEY)) kvSet(this.db, PAUSE_KEY, 'null');
  }

  private lastAttempt() {
    return Math.max(Number(kvGet(this.db, ATTEMPT_KEY)) || 0, this.trainedAt());
  }

  /** When the schedule says the next run may start (ms): the gap since the last run. */
  private dueAt(): number | undefined {
    const s = this.st;
    // Not set up (or a setup that failed): nothing could learn yet, so no run is promised.
    // A paused run is held until the person resumes it.
    if (!s.enabled || !s.personalise || s.schedule === 'manual' || !this.used() || !this.isSetUp() || this.paused()) return undefined;
    return this.lastAttempt() + GAP_MS[s.schedule];
  }

  /** The same for the page: never in the past (a run not yet made waits only for a quiet moment). */
  private nextAt(): number | undefined {
    const due = this.dueAt();
    return due == null ? undefined : Math.max(due, Date.now());
  }

  private usedAt: number | null = null;

  /** Whether word suggestions were ever wanted here (USED_KEY). */
  private used(): boolean {
    if (this.usedAt === null) this.usedAt = Number(kvGet(this.db, USED_KEY)) || 0;
    return this.usedAt > 0;
  }

  /** They are wanted: from now on they set themselves up at start and the schedule of personalising runs. */
  private markUsed() {
    if (this.used()) return;
    this.usedAt = Date.now();
    kvSet(this.db, USED_KEY, String(this.usedAt));
  }

  state(): SuggestState {
    const s = this.st;
    const status: SuggestStatus = {
      state: 'off',
      llm: this.llmStatus(),
      model: this.modelStatus(),
      training: this.trainingStatus(),
      usage: readUsage(this.db),
    };
    if (s.enabled && suggestDisabled()) Object.assign(status, { detail: 'Word suggestions are off on this server (HYDOR_SUGGEST=off)' });
    else if (s.enabled && unsupportedSystem()) Object.assign(status, { state: 'failed', detail: unsupportedSystem() });
    else if (s.enabled) {
      if (this.setupP) Object.assign(status, { state: 'setting-up', detail: this.setupDetail ?? 'Getting ready' });
      else if (this.failure) Object.assign(status, { state: 'failed', detail: this.failure.why });
      else if (this.startingWorker) Object.assign(status, { state: 'starting', detail: 'Loading the language models' });
      else if (!this.setupDone && !this.isSetUp())
        Object.assign(
          status,
          this.used()
            ? { state: 'setting-up', detail: this.setupDetail ?? 'Getting ready' }
            : { state: 'waiting', detail: 'Sets itself up the first time you type in a message box (it downloads about 1.2 GB)' },
        );
      else
        Object.assign(status, {
          state: 'ready',
          detail: this.worker?.ready ? undefined : this.short ? `Waiting for memory: ${(this.short.free / 1024).toFixed(1)} GB free, it needs ${(this.short.need / 1024).toFixed(1)} GB` : 'Starts when you type, and stops after a few idle minutes',
        });
    }
    if (this.requests) status.stats = { requests: this.requests, ...this.percentiles() };
    return { settings: structuredClone(s), status };
  }

  private percentiles(): { p50Ms?: number; p90Ms?: number } {
    if (!this.times.length) return {};
    const t = [...this.times].sort((a, b) => a - b);
    return { p50Ms: Math.round(t[Math.floor(t.length * 0.5)]), p90Ms: Math.round(t[Math.min(t.length - 1, Math.floor(t.length * 0.9))]) };
  }

  private modelStatus(): SuggestStatus['model'] {
    const p = personalState();
    if (hasPersonal() && p) return { kind: 'personal', trainedAt: p.trainedAt, tokens: p.tokens, languages: p.languages ?? this.loadInfo?.languages };
    return { kind: 'base' };
  }

  private trainingStatus(): SuggestStatus['training'] {
    const t = this.trainer.state;
    const lastAt = this.trainedAt() || undefined;
    // Where it learns, and why not on the graphics card when the setting allows it: the hold of a day, else the last run's reason.
    const last = lastDevice(this.db);
    // (Not while the run is on a card: the last run's reason is out of date.)
    const onCard = t.state === 'running' && !this.trainer.stopping && !!t.device && t.device.kind !== 'cpu';
    const noGpu = this.st.trainGpu && !onCard ? (gpuHold(this.db)?.why ?? last?.why) : undefined;
    const extra = noGpu ? { noGpu } : {};
    const paused = this.paused();
    // (A run that was paused may still be ending: the page already has it as paused.)
    if (paused && this.st.enabled && this.st.personalise) {
      return { state: 'paused', progress: { done: paused.done, total: paused.total }, ...(lastAt ? { lastAt } : {}), ...(last ? { device: last.device } : {}), ...extra };
    }
    // (One that is being stopped is no longer running for the page.)
    if (t.state === 'running' && !this.trainer.stopping) return { ...t, lastAt, ...extra };
    const next = this.nextAt();
    const base: SuggestStatus['training'] = t.state === 'failed' ? { ...t } : { state: next ? 'waiting' : 'idle', ...(t.detail && t.state === 'idle' ? { detail: t.detail } : {}) };
    return { ...base, ...(lastAt ? { lastAt } : {}), ...(next && this.st.enabled ? { next } : {}), ...extra };
  }

  /** The language model's state, with why it is not running when that is for the settings or the computer's memory. */
  private llmStatus(): SuggestStatus['llm'] {
    const s = this.st;
    const l = this.llm.state;
    if (l.state === 'ready' || l.state === 'starting' || l.state === 'failed') return { ...l };
    if (s.llm === 'off') return { state: 'off', detail: 'Turned off in the settings' };
    if (!llamaSupported()) return { state: 'failed', detail: `llama.cpp has no ready-made build for ${process.platform} ${process.arch}` };
    const total = os.totalmem() / 2 ** 20;
    if (s.llm === 'auto' && total < LLM_TOTAL_MB) return { state: 'memory', detail: `This computer has ${(total / 1024).toFixed(1)} GB of memory; the language model needs at least 8 GB (set it to On to use it anyway)`, totalMb: Math.round(total), needMb: 8192 };
    return { state: 'off', detail: l.detail ?? 'Starts when you type, and stops after half an hour without a suggestion' };
  }

  // ---- what it did ----------------------------------------------------------------------------------------------

  /** Adds counts the page sent (checked by `cleanUsage`): nothing is broadcast, the page reads them when it needs them. */
  addUsage(c: SuggestCounts): SuggestUsage {
    addUsage(this.db, c);
    return readUsage(this.db);
  }

  /** Starts the counts again from nothing. */
  resetUsage(): SuggestState {
    resetUsage(this.db);
    this.changed();
    return this.state();
  }

  // ---- the settings ---------------------------------------------------------------------------------------------

  /** Changes settings (a part of them): checked, kept, and what they affect restarted. */
  configure(patch: unknown): SuggestState {
    const before = this.st;
    const next = merge(before, patch, true);
    writeSettings(this.db, next);
    this.st = next;
    if (before.enabled && !next.enabled) {
      this.shutdown();
      this.clearPause();
    }
    else if (next.enabled) {
      if (!before.enabled) {
        this.markUsed();
        this.failure = null;
        this.failedTimes = 0;
        this.crashes = [];
        this.llmTried = 0;
        this.llmPrepFailed.clear();
        this.abort = new AbortController();
        void this.ensureSetup();
      } else {
        if (next.threads !== before.threads) {
          this.stopWorker();
          this.llmGen++;
          this.llm.stop();
        } else if (next.llm !== before.llm || next.quant !== before.quant) {
          this.llmGen++;
          this.llm.stop(next.llm === 'off' ? 'Turned off in the settings' : undefined);
          this.llmTried = 0;
          this.llmPrepFailed.clear();
          if (next.llm !== 'off' && this.worker?.ready) void this.startLlm();
          else if (next.llm !== 'off') void this.prepareLlm();
        }
        // Learning turned off: a run stops, and the texts and resume state it left go, and a pause with them.
        if (!next.personalise && before.personalise) {
          this.trainer.stopAndClean();
          this.clearPause();
        }
      }
    }
    this.changed();
    return this.state();
  }

  // ---- setting up -----------------------------------------------------------------------------------------------

  /** The Python libraries and the small model are there (what the worker needs). */
  private isSetUp() {
    return !suggestDisabled() && packagesReady() && !releaseProblem();
  }

  private llmWanted(s = this.st) {
    if (s.llm === 'off' || !llamaSupported()) return false;
    return s.llm === 'on' || os.totalmem() / 2 ** 20 >= LLM_TOTAL_MB;
  }

  /**
   * Sets up what the small model needs (Python, its files). The language model's download goes on in the background: the
   * small model works meanwhile.
   */
  private ensureSetup(): Promise<boolean> {
    if (suggestDisabled()) return Promise.resolve(false);
    const unsupported = unsupportedSystem();
    if (unsupported) {
      this.fail(unsupported);
      return Promise.resolve(false);
    }
    if (this.setupP) return this.setupP;
    if (this.isSetUp()) {
      this.setupDone = true;
      if (this.llmWanted()) void this.prepareLlm();
      return Promise.resolve(true);
    }
    const signal = this.abort.signal;
    const report = (d: string) => {
      this.setupDetail = d;
      this.changed();
    };
    this.setupP = (async () => {
      this.setupDetail = 'Getting ready';
      this.changed();
      try {
        // Before downloading anything: is there a small model to run?
        if (!releaseDir()) throw new Error('The word-suggestion model is not published yet');
        await setupPython(report, signal);
        await setupRelease(report, signal);
        const problem = releaseProblem();
        if (problem) throw new Error(problem);
        this.setupDone = true;
        // The language model is a help, not a need: it comes meanwhile, and its failure leaves the small model alone.
        if (this.llmWanted()) void this.prepareLlm();
        return true;
      } catch (e) {
        // Turned off meanwhile: not a failure.
        if (!signal.aborted) this.fail((e as Error).message);
        return false;
      }
    })().finally(() => {
      this.setupP = null;
      this.changed();
    });
    return this.setupP;
  }

  private llmFilesReady() {
    return !!llamaBinary() && !!ggufPath(this.st.quant);
  }

  /**
   * llama.cpp and the language model's file, one download at a time for each size, and not again for ten minutes after a
   * failure, twice as long after each failure in a row (retryAfter); the failure is in the language model's state.
   */
  private prepareLlm(): Promise<boolean> {
    if (this.llmFilesReady()) return Promise.resolve(true);
    const quant = this.st.quant;
    const failed = this.llmPrepFailed.get(quant);
    if (failed && Date.now() - failed.at < retryAfter(failed.n)) return Promise.resolve(false);
    const going = this.llmPrep.get(quant);
    if (going) return going;
    const signal = this.abort.signal;
    const say = (d: string) => this.llm.note({ state: 'starting', detail: d });
    const p: Promise<boolean> = (async () => {
      try {
        await setupLlama(say, signal);
        await setupGguf(quant, say, signal);
        this.llmPrepFailed.delete(quant);
        return true;
      } catch (e) {
        if (signal.aborted) return false;
        this.llmPrepFailed.set(quant, { at: Date.now(), n: (this.llmPrepFailed.get(quant)?.n ?? 0) + 1 });
        this.llm.note({ state: 'failed', detail: (e as Error).message });
        return false;
      } finally {
        // Downloaded: it is not starting until a request starts it (a failure stays in its state).
        if (this.llm.state.state === 'starting') this.llm.reset();
      }
    })().finally(() => {
      if (this.llmPrep.get(quant) === p) this.llmPrep.delete(quant);
    });
    this.llmPrep.set(quant, p);
    return p;
  }

  private fail(why: string) {
    this.failure = { why, at: Date.now() };
    this.failedTimes++;
    this.changed();
  }

  // ---- the language model ---------------------------------------------------------------------------------------

  /** Starts llama-server when the settings and the memory allow; its address, or null (its state says why). */
  private startLlm(): Promise<string | null> {
    if (this.llm.url && this.llm.running) return Promise.resolve(this.llm.url);
    // (One that a stop has passed over ends by itself: this is a new start.)
    if (this.startingLlm && this.startingLlmGen === this.llmGen) return this.startingLlm;
    this.llmTried = Date.now();
    const g = this.llmGen;
    const gone = () => g !== this.llmGen;
    const p: Promise<string | null> = (async () => {
      const s = this.st;
      if (s.llm === 'off') return null;
      if (!llamaSupported()) return null;
      const total = os.totalmem() / 2 ** 20;
      if (s.llm === 'auto') {
        const free = Math.round((await availableMemory()) / 2 ** 20);
        if (gone()) return null;
        if (total < LLM_TOTAL_MB) return void this.llm.note({ state: 'memory', detail: `This computer has ${(total / 1024).toFixed(1)} GB of memory; the language model needs at least 8 GB`, totalMb: Math.round(total), needMb: 8192 }), null;
        if (free < LLM_NEED_MB) return void this.llm.note({ state: 'memory', detail: `Only ${(free / 1024).toFixed(1)} GB of memory is free now; the language model needs ${(LLM_NEED_MB / 1024).toFixed(1)} GB. Suggestions use the small model alone until then`, freeMb: free, needMb: LLM_NEED_MB }), null;
      }
      if (!(await this.prepareLlm()) || gone()) return null;
      const binary = llamaBinary();
      const gguf = ggufPath(s.quant);
      if (!binary || !gguf) return null;
      return this.llm.start({ binary, gguf, threads: llmThreads(s) });
    })()
      .catch((e) => {
        if (!gone()) this.llm.note({ state: 'failed', detail: (e as Error).message });
        return null;
      })
      .finally(() => {
        if (this.startingLlm === p) this.startingLlm = null;
      });
    this.startingLlm = p;
    this.startingLlmGen = g;
    return p;
  }

  // ---- the worker -----------------------------------------------------------------------------------------------

  private stopWorker() {
    this.gen++;
    const w = this.worker;
    this.worker = null;
    // One that is still starting: stopped too (its start finds out and gives up).
    const starting = this.pendingWorker;
    this.pendingWorker = null;
    starting?.stop();
    clearTimeout(this.idleTimer);
    this.sent.clear();
    this.loadInfo = null;
    if (w) w.stop();
    this.dropAll();
  }

  private dropAll() {
    for (const j of this.queue.splice(0)) j.resolve(null);
    this.byClient.clear();
  }

  private idleLater() {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      const w = this.worker;
      if (!w) return;
      if (w.busy || this.queue.length) return this.idleLater();
      this.stopWorker();
      this.changed();
    }, WORKER_IDLE_MS);
    this.idleTimer.unref?.();
  }

  /** The worker, started when it is not running and memory allows; null when it cannot be now. */
  private ensureWorker(): Promise<PyWorker | null> {
    if (this.worker?.ready) return Promise.resolve(this.worker);
    if (this.startingWorker) return this.startingWorker;
    if (!this.st.enabled || suggestDisabled()) return Promise.resolve(null);
    if (this.failure) {
      // A failure is tried again after ten minutes, then twenty, forty… at most a day: on by default, a computer where it
      // keeps failing (a full disk, say) must not download again every ten minutes. Turning it off and on tries at once.
      if (Date.now() - this.failure.at < retryAfter(this.failedTimes)) return Promise.resolve(null);
      this.failure = null;
      this.crashes = [];
    }
    const g = this.gen;
    const gone = () => g !== this.gen || !this.st.enabled;
    this.startingWorker = (async () => {
      if (!(await this.ensureSetup()) || gone()) return null;
      // Memory found short is not asked about again for a while (a request for a suggestion comes with every keystroke).
      if (Date.now() < this.memShortUntil) return null;
      const free = (await availableMemory()) / 2 ** 20;
      if (gone()) return null;
      if (free < WORKER_NEED_MB) {
        this.short = { free, need: WORKER_NEED_MB };
        this.memShortUntil = Date.now() + SHORT_MEMORY_MS;
        return null;
      }
      this.short = null;
      this.changed();
      // The language model starts beside the worker: it is given to the worker once both are up.
      const llmUp = this.startLlm();
      const r = await PyWorker.start(pythonPath(), workerScript(), childEnv(), {
        loadMs: LOAD_MS,
        onSpawn: (w) => {
          // Turned off (or restarted) before it was ready: it is stopped at once.
          if (gone()) w.stop();
          else this.pendingWorker = w;
        },
        onExit: (w, why, was) => this.workerEnded(w, why, was),
      });
      if (typeof r === 'string') {
        if (!gone()) this.crash(r, false);
        return null;
      }
      if (this.pendingWorker === r) this.pendingWorker = null;
      if (gone()) return void r.stop(), null;
      // Up to 45 s for the language model's address, which the worker is given with the models it loads.
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([llmUp, new Promise<void>((res) => ((timer = setTimeout(res, 45_000)), timer.unref?.()))]);
      clearTimeout(timer);
      if (gone()) return void r.stop(), null;
      // The worker takes requests only once it has its models.
      if (!(await this.loadInto(r)) || gone()) return void r.stop(), null;
      this.worker = r;
      this.failedTimes = 0;
      this.idleLater();
      // (The language model may have come up, or gone, while it loaded.)
      void this.syncLoad();
      return r;
    })().finally(() => {
      this.startingWorker = null;
      this.changed();
    });
    return this.startingWorker;
  }

  private workerEnded(w: PyWorker, why: string | null, wasReady: boolean) {
    if (this.worker !== w) return;
    this.worker = null;
    clearTimeout(this.idleTimer);
    this.sent.clear();
    this.dropAll();
    if (why) this.crash(why, wasReady);
    this.changed();
  }

  /** The worker stopped on its own (or could not start): a crash is tried again, unless it keeps happening or it never got ready. */
  private crash(why: string, wasReady: boolean) {
    const now = Date.now();
    this.crashes.push(now);
    while (this.crashes.length && this.crashes[0] < now - 10 * 60_000) this.crashes.shift();
    if (this.crashes.length >= 3 || !wasReady) this.fail(why);
  }

  /** Tells the running worker what to load (the small model, the personal one, the language model's address) when that is not what it has. */
  private syncLoad(): Promise<void> {
    if (this.loading) return this.loading.then(() => this.syncLoad());
    const w = this.worker;
    if (!w?.ready) return Promise.resolve();
    const p: Promise<void> = this.loadInto(w)
      .then(() => {})
      .finally(() => {
        if (this.loading === p) this.loading = null;
        this.changed();
      });
    this.loading = p;
    return p;
  }

  /** Has a worker load what it should (nothing when it already has it): true when it has. A failure stops it and says why. */
  private async loadInto(w: PyWorker): Promise<boolean> {
    const s = this.st;
    const personal = hasPersonal();
    const url = this.llm.running ? this.llm.url : null;
    const key = JSON.stringify([personal ? this.trainedAt() || 1 : 0, url, workerThreads(s)]);
    if (w.loadedKey === key) return true;
    const release = releaseDir();
    if (!release) return false;
    try {
      const r = await w.request({ op: 'load', model_dir: release, personal_dir: personal ? personalDir() : null, llm_url: url, threads: workerThreads(s), options: { k: 1000 } }, LOAD_MS).done;
      w.loadedKey = key;
      this.loadInfo = { kind: r.model === 'personal' ? 'personal' : 'base', languages: r.languages && typeof r.languages === 'object' ? r.languages : undefined };
      return true;
    } catch (e) {
      if (this.worker === w || this.pendingWorker === w) {
        this.fail(`The language models could not be loaded: ${(e as Error).message}`);
        if (this.worker === w) this.stopWorker();
        else w.stop();
      }
      return false;
    }
  }

  // ---- suggestions ----------------------------------------------------------------------------------------------

  /** Whether the surface is switched on in the settings. */
  surfaceOn(surface: SuggestRequest['surface']): boolean {
    const w = this.st.where;
    return surface === 'chat' ? w.chat : surface === 'doc' ? w.docs : w.other || w.notes;
  }

  /** A suggestion for the text, or null: off, not ready (it starts now), cancelled by a newer one, or too late. */
  async suggest(req: SuggestRequest, signal?: AbortSignal): Promise<SuggestResponse | null> {
    const s = this.st;
    if (!s.enabled || suggestDisabled() || !this.surfaceOn(req.surface)) return null;
    this.markUsed();
    this.lastRequest = Date.now();
    const w = this.worker?.ready ? this.worker : null;
    if (!w) {
      void this.ensureWorker().catch(() => {});
      return null;
    }
    this.idleLater();
    this.llm.touch();
    if (s.llm !== 'off' && !this.llm.running && !this.startingLlm && Date.now() - this.llmTried > 20_000) void this.startLlm();
    if (req.surface === 'chat' && req.session && s.sessionCache) this.feedSession(w, req.session);
    return new Promise<SuggestResponse | null>((resolve) => {
      if (signal?.aborted) return resolve(null);
      const job: Job = { req, queuedAt: Date.now(), resolve, worker: w };
      if (req.client) {
        const old = this.byClient.get(req.client);
        if (old) this.drop(old);
        this.byClient.set(req.client, job);
      }
      signal?.addEventListener('abort', () => this.drop(job), { once: true });
      this.queue.push(job);
      void this.pump();
    });
  }

  /** A request no longer wanted (a newer one of the tab, or its HTTP request closed): it leaves the queue, or the worker is told to stop it. */
  private drop(job: Job) {
    if (job.cancelled) return;
    job.cancelled = true;
    const i = this.queue.indexOf(job);
    if (i >= 0) this.queue.splice(i, 1);
    if (job.running && job.id != null) job.worker?.cancel(job.id);
    if (job.req.client && this.byClient.get(job.req.client) === job) this.byClient.delete(job.req.client);
    job.resolve(null);
  }

  /** One suggestion at a time goes to the worker, in order. */
  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      for (;;) {
        const job = this.queue.shift();
        if (!job) break;
        if (job.cancelled) continue;
        const w = this.worker;
        if (Date.now() - job.queuedAt > QUEUE_MS || !w?.ready || w !== job.worker) {
          job.cancelled = true;
          job.resolve(null);
          this.release(job);
          continue;
        }
        const s = this.st;
        const r = job.req;
        const sent = w.request(
          {
            op: 'suggest',
            surface: r.surface,
            text: r.text,
            ...(r.reply ? { reply: r.reply } : {}),
            ...(r.prev ? { prev: r.prev } : {}),
            ...(r.doc ? { doc: r.doc } : {}),
            ...(r.session ? { session: r.session } : {}),
            precision: s.precision,
            next: s.nextWord,
            cache: s.sessionCache && r.surface === 'chat' && !!r.session,
            switch: s.switchByLanguage,
            typed_words: s.typedWords,
            context_words: s.contextWords,
          },
          DECODE_MS,
        );
        job.id = sent.id;
        job.running = true;
        const t0 = Date.now();
        try {
          const reply = await sent.done;
          if (!job.cancelled) {
            this.requests++;
            this.times.push(Date.now() - t0);
            if (this.times.length > 200) this.times.shift();
            job.resolve(reply.cancelled ? null : this.response(reply, s));
          }
        } catch {
          if (!job.cancelled) {
            w.cancel(sent.id);
            job.resolve(null);
          }
        } finally {
          job.running = false;
          this.release(job);
        }
      }
    } finally {
      this.pumping = false;
    }
  }

  private release(job: Job) {
    if (job.req.client && this.byClient.get(job.req.client) === job) this.byClient.delete(job.req.client);
  }

  private response(m: Reply, s: SuggestSettings): SuggestResponse {
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    const next = s.nextWord && typeof m.next === 'string' ? m.next : '';
    const out: SuggestResponse = {
      word: typeof m.word === 'string' ? m.word : '',
      next,
      conf: num(m.conf),
      confNext: next ? num(m.conf_next) : 0,
      show: !!m.show,
      showNext: !!m.show && !!m.show_next && !!next,
    };
    if (m.plan === 'mix' || m.plan === 'llm' || m.plan === 'slm') out.plan = m.plan;
    if (typeof m.lang === 'string' && m.lang) out.lang = m.lang;
    if (m.model === 'base' || m.model === 'personal') out.model = m.model;
    const ms = m.ms && typeof m.ms === 'object' ? num((m.ms as Record<string, unknown>).total) : 0;
    if (ms) out.ms = ms;
    return out;
  }

  /** Gives the worker a chat session's earlier text for its cache: once, and again when the session has grown. */
  private feedSession(w: PyWorker, key: string) {
    try {
      const r = this.db.prepare("select count(*) as n, coalesce(max(id), 0) as m from chunk_text where key = ? and kind in ('user', 'assistant')").get(key) as { n: number; m: number };
      if (!r.n) return;
      const had = this.sent.get(key);
      if (had && had.n === r.n && had.m === r.m) return;
      const rows = this.db.prepare("select kind, text from chunk_text where key = ? and kind in ('user', 'assistant') order by id desc limit 200").all(key) as { kind: string; text: string }[];
      const texts: string[] = [];
      let room = 120_000;
      for (const row of rows) {
        const t = (row.kind === 'user' ? ownWords(row.text) : row.text).trim().slice(0, 4000);
        if (!t) continue;
        if (t.length > room) break;
        room -= t.length;
        texts.unshift(t);
      }
      this.sent.set(key, { n: r.n, m: r.m });
      while (this.sent.size > 50) this.sent.delete(this.sent.keys().next().value!);
      if (texts.length) w.request({ op: 'session', session: key, texts }, 30_000).done.catch(() => {});
    } catch {}
  }

  /** A message box has the focus: what is set up starts now. */
  warm(): SuggestState {
    if (this.st.enabled && !suggestDisabled()) {
      this.markUsed();
      this.lastRequest = Date.now();
      if (this.worker?.ready) {
        this.idleLater();
        this.llm.touch();
        if (this.st.llm !== 'off' && !this.llm.running && !this.startingLlm) void this.startLlm();
      } else void this.ensureWorker().catch(() => {});
    }
    return this.state();
  }

  // ---- personalising --------------------------------------------------------------------------------------------

  /** Whether the schedule says it is time: the gap since the last run, and no writing for a while (the person's, in any session, or here). */
  trainDue(now = Date.now()): boolean {
    const due = this.dueAt();
    if (due == null || now < due) return false;
    return now - Math.max(lastTyped(this.db), this.lastRequest) >= QUIET_MS;
  }

  /** Personalises now (in the background); a paused run goes on from where it stopped. A 409 when it cannot. */
  train(): SuggestState {
    const s = this.st;
    if (!s.enabled) throw new HttpError(409, 'Turn on word suggestions first');
    if (suggestDisabled()) throw new HttpError(409, 'Word suggestions are off on this server (HYDOR_SUGGEST=off)');
    if (!s.personalise) throw new HttpError(409, 'Learning from what you write is turned off');
    if (this.paused()) {
      // Resume: the pause ends, and the run goes on once the one that was paused has let go of its work folder.
      this.clearPause();
      void this.trainer.settled().then(() => this.runTraining());
      this.changed();
      return this.state();
    }
    if (this.trainer.active) return this.state();
    void this.runTraining();
    return this.state();
  }

  /** Pauses the run that is going: it stops where it is (what it learned so far is kept), and nothing starts it until Resume. A 409 when none is going. */
  pause(): SuggestState {
    if (!this.trainer.active || this.trainer.stopping || this.paused()) throw new HttpError(409, 'Nothing is being learned right now');
    const p = this.trainer.state.progress;
    kvSet(this.db, PAUSE_KEY, JSON.stringify({ at: Date.now(), done: p?.done ?? 0, total: p?.total ?? 0 } satisfies Paused));
    this.trainer.pause();
    this.changed();
    return this.state();
  }

  /**
   * Stops the run that is going or paused for good: what it learned so far is dropped (the model in use stays), and the
   * schedule waits its usual gap from now. A 409 when none is going or paused.
   */
  stopTraining(): SuggestState {
    if (!this.trainer.active && !this.paused()) throw new HttpError(409, 'Nothing is being learned right now');
    this.trainer.stopAndClean();
    this.clearPause();
    kvSet(this.db, ATTEMPT_KEY, String(Date.now()));
    this.changed();
    return this.state();
  }

  private async runTraining() {
    if (!(await this.ensureSetup())) return;
    // A run an earlier server left may still be saving its place: this one goes on from it once it has.
    while (leftoverTraining()) await new Promise((r) => setTimeout(r, 2000));
    // Turned off while it was setting up, or paused meanwhile: nothing is started.
    if (!this.st.enabled || !this.st.personalise || this.paused()) return;
    const out = await this.trainer.run(this.db, this.st, {
      // The worker lets go of the personal model's files before the new one takes their place; it starts again with the new one.
      hooks: { beforeSwap: () => this.stopWorker() },
    });
    // A run that was stopped or paused is not an attempt (the schedule is not moved by it; a stop moves it itself).
    if (out.ok || !out.halted) kvSet(this.db, ATTEMPT_KEY, String(Date.now()));
    // A run that finished as the pause came is finished: nothing is left to resume.
    if (out.ok) {
      this.clearPause();
      void this.syncLoad();
    }
    this.changed();
  }

  /** The scheduled check: personalise when it is due and the computer has the memory. */
  private async check() {
    try {
      if (!this.st.enabled || !this.st.personalise || this.trainer.active || this.setupP || leftoverTraining() || !this.trainDue()) return;
      if (releaseProblem() || !packagesReady()) return;
      if ((await availableMemory()) / 2 ** 20 < 2048) return;
      await this.runTraining();
    } catch (e) {
      console.warn(`[suggest] ${(e as Error).message}`);
    }
  }

  /** Forgets the personal model: the small model that came with the app is used again. */
  forget(): SuggestState {
    this.trainer.stop();
    forgetPersonal();
    this.clearPause();
    kvSet(this.db, ATTEMPT_KEY, String(Date.now()));
    void this.syncLoad();
    this.changed();
    return this.state();
  }

  // ---- life -----------------------------------------------------------------------------------------------------

  /** Once, when the server is up: what was turned on is set up, and the schedule is watched. */
  start() {
    // Programs an earlier server left running (killed, or stopped with its service's children left alone) end now, and a
    // model swap that a crash cut short is finished.
    try {
      reapLeftovers();
      recoverPersonal();
    } catch (e) {
      console.warn(`[suggest] ${(e as Error).message}`);
    }
    if (suggestDisabled()) return;
    // Set up (or a setup a stop cut short, carried on) at start only where they were wanted already; elsewhere the first
    // message box used starts it (warm).
    if (this.st.enabled && this.used()) setTimeout(() => void this.ensureSetup(), 5000).unref?.();
    const tick = () => {
      void this.check();
      this.checkTimer = setTimeout(tick, CHECK_MS);
      this.checkTimer.unref?.();
    };
    this.checkTimer = setTimeout(tick, 60_000);
    this.checkTimer.unref?.();
  }

  /** Turned off: both processes stop, a run of personalising too; what was downloaded stays. */
  private shutdown() {
    this.abort.abort();
    this.stopWorker();
    this.llmGen++;
    this.llm.stop();
    this.trainer.stop();
    this.failure = null;
    this.short = null;
  }

  /** For a clean exit (tests): everything stops. */
  stop() {
    clearTimeout(this.checkTimer);
    clearTimeout(this.notifyTimer);
    this.shutdown();
  }

  /** The processes it runs, for a test. */
  pids() {
    return { worker: this.worker?.proc.pid, llm: this.llm.pid };
  }
}
