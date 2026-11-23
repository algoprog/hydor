// Word suggestions on the server: the settings, setting things up, the two processes (the small model's Python worker and
// llama-server for Qwen3.5), the suggestions asked of them (only the newest of each browser tab is kept), what the session
// cache is fed, and personalising on its schedule. docs/plans/word-suggestions.md describes the whole.
import os from 'node:os';
import { type SuggestRequest, type SuggestResponse, type SuggestSettings, type SuggestState, type SuggestStatus } from '../../shared/suggest.ts';
import { HttpError } from '../auth.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { ownWords } from '../memory/learn.ts';
import { availableMemory } from '../models/machine.ts';
import { childEnv, PyWorker, type Reply } from './engine.ts';
import { LlamaServer } from './llm.ts';
import { llmThreads, merge, readSettings, workerThreads, writeSettings } from './settings.ts';
import { ggufPath, llamaBinary, llamaSupported, packagesReady, pythonPath, releaseDir, releaseProblem, setupGguf, setupLlama, setupPython, setupRelease, suggestDisabled, workerScript } from './setup.ts';
import { forgetPersonal, hasPersonal, personalDir, personalState, Trainer } from './train.ts';
import { lastTyped } from './texts.ts';

/** The worker quits after this long without a request. */
const WORKER_IDLE_MS = 10 * 60_000;
const LOAD_MS = 3 * 60_000;
/** Free memory the worker needs to start (the small model and PyTorch: about 0.6 GB loaded). */
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

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
  private crashes: number[] = [];
  private short: { free: number; need: number } | null = null;
  private idleTimer?: NodeJS.Timeout;
  private checkTimer?: NodeJS.Timeout;
  private notifyTimer?: NodeJS.Timeout;
  private lastRequest = 0;
  private llmTried = 0;
  private startingLlm: Promise<string | null> | null = null;
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

  private lastAttempt() {
    return Math.max(Number(kvGet(this.db, ATTEMPT_KEY)) || 0, this.trainedAt());
  }

  /** When the schedule says the next run may start (ms): the gap since the last run. */
  private dueAt(): number | undefined {
    const s = this.st;
    if (!s.enabled || !s.personalise || s.schedule === 'manual') return undefined;
    return this.lastAttempt() + GAP_MS[s.schedule];
  }

  /** The same for the page: never in the past (a run not yet made waits only for a quiet moment). */
  private nextAt(): number | undefined {
    const due = this.dueAt();
    return due == null ? undefined : Math.max(due, Date.now());
  }

  state(): SuggestState {
    const s = this.st;
    const status: SuggestStatus = {
      state: 'off',
      llm: this.llmStatus(),
      model: this.modelStatus(),
      training: this.trainingStatus(),
    };
    if (s.enabled && suggestDisabled()) Object.assign(status, { detail: 'Word suggestions are off on this server (HYDOR_SUGGEST=off)' });
    else if (s.enabled) {
      if (this.setupP) Object.assign(status, { state: 'setting-up', detail: this.setupDetail ?? 'Getting ready' });
      else if (this.failure) Object.assign(status, { state: 'failed', detail: this.failure.why });
      else if (this.startingWorker) Object.assign(status, { state: 'starting', detail: 'Loading the language models' });
      else if (!this.setupDone && !this.isSetUp()) Object.assign(status, { state: 'setting-up', detail: this.setupDetail ?? 'Getting ready' });
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
    if (t.state === 'running') return { ...t, lastAt };
    const next = this.nextAt();
    const base: SuggestStatus['training'] = t.state === 'failed' ? { ...t } : { state: next ? 'waiting' : 'idle', ...(t.detail && t.state === 'idle' ? { detail: t.detail } : {}) };
    return { ...base, ...(lastAt ? { lastAt } : {}), ...(next && this.st.enabled ? { next } : {}) };
  }

  /** The language model's state, with why it is not running when that is for the settings or the computer's memory. */
  private llmStatus(): SuggestStatus['llm'] {
    const s = this.st;
    const l = this.llm.state;
    if (l.state === 'ready' || l.state === 'starting' || l.state === 'failed') return { ...l };
    if (s.llm === 'off') return { state: 'off', detail: 'Turned off in the settings' };
    if (!llamaSupported()) return { state: 'failed', detail: `llama.cpp has no ready-made build for ${process.platform} ${process.arch}` };
    const total = os.totalmem() / 2 ** 20;
    if (s.llm === 'auto' && total < LLM_TOTAL_MB) return { state: 'memory', detail: `This computer has ${(total / 1024).toFixed(1)} GB of memory; the language model needs at least 8 GB (set it to On to use it anyway)`, freeMb: Math.round(total), needMb: 8192 };
    return { state: 'off', detail: l.detail ?? 'Starts when you type, and stops after half an hour without a suggestion' };
  }

  // ---- the settings ---------------------------------------------------------------------------------------------

  /** Changes settings (a part of them): checked, kept, and what they affect restarted. */
  configure(patch: unknown): SuggestState {
    const before = this.st;
    const next = merge(before, patch, true);
    writeSettings(this.db, next);
    this.st = next;
    if (before.enabled && !next.enabled) this.shutdown();
    else if (next.enabled) {
      if (!before.enabled) {
        this.failure = null;
        this.crashes = [];
        this.llmTried = 0;
        this.abort = new AbortController();
        void this.ensureSetup();
      } else {
        if (next.threads !== before.threads) {
          this.stopWorker();
          this.llm.stop();
        } else if (next.llm !== before.llm || next.quant !== before.quant) {
          this.llm.stop(next.llm === 'off' ? 'Turned off in the settings' : undefined);
          this.llmTried = 0;
          if (next.llm !== 'off' && this.worker?.ready) void this.startLlm();
          else if (next.llm !== 'off') void this.prepareLlm();
        }
        if (!next.personalise && before.personalise) this.trainer.stop();
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

  /** Sets up what is not there yet (Python, the small model, and when the language model is wanted, llama.cpp and its file). */
  private ensureSetup(): Promise<boolean> {
    if (suggestDisabled()) return Promise.resolve(false);
    if (this.setupP) return this.setupP;
    if (this.isSetUp() && (!this.llmWanted() || this.llmFilesReady())) {
      this.setupDone = true;
      return Promise.resolve(true);
    }
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
        await setupPython(report);
        await setupRelease(report);
        const problem = releaseProblem();
        if (problem) throw new Error(problem);
        // The language model is a help, not a need: its failure leaves the small model alone.
        if (this.llmWanted()) await this.prepareLlm(report);
        this.setupDone = true;
        return true;
      } catch (e) {
        this.fail((e as Error).message);
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

  /** llama.cpp and the language model's file; a failure goes in the language model's state. */
  private async prepareLlm(report?: (d: string) => void): Promise<boolean> {
    if (this.llmFilesReady()) return true;
    const say = (d: string) => {
      report?.(d);
      this.llm.note({ state: 'starting', detail: d });
    };
    try {
      await setupLlama(say, this.abort.signal);
      await setupGguf(this.st.quant, say);
      return true;
    } catch (e) {
      if (this.abort.signal.aborted) return false;
      this.llm.note({ state: 'failed', detail: (e as Error).message });
      return false;
    } finally {
      // Downloaded: it is not starting until a request starts it (a failure stays in its state).
      if (this.llm.state.state === 'starting') this.llm.reset();
    }
  }

  private fail(why: string) {
    this.failure = { why, at: Date.now() };
    this.changed();
  }

  // ---- the language model ---------------------------------------------------------------------------------------

  /** Starts llama-server when the settings and the memory allow; its address, or null (its state says why). */
  private startLlm(): Promise<string | null> {
    if (this.llm.url && this.llm.running) return Promise.resolve(this.llm.url);
    if (this.startingLlm) return this.startingLlm;
    this.llmTried = Date.now();
    this.startingLlm = (async () => {
      const s = this.st;
      if (s.llm === 'off') return null;
      if (!llamaSupported()) return null;
      const total = os.totalmem() / 2 ** 20;
      if (s.llm === 'auto') {
        const free = Math.round((await availableMemory()) / 2 ** 20);
        if (total < LLM_TOTAL_MB) return void this.llm.note({ state: 'memory', detail: `This computer has ${(total / 1024).toFixed(1)} GB of memory; the language model needs at least 8 GB`, freeMb: Math.round(total), needMb: 8192 }), null;
        if (free < LLM_NEED_MB) return void this.llm.note({ state: 'memory', detail: `Only ${(free / 1024).toFixed(1)} GB of memory is free now; the language model needs ${(LLM_NEED_MB / 1024).toFixed(1)} GB. Suggestions use the small model alone until then`, freeMb: free, needMb: LLM_NEED_MB }), null;
      }
      if (!(await this.prepareLlm())) return null;
      const binary = llamaBinary();
      const gguf = ggufPath(s.quant);
      if (!binary || !gguf) return null;
      return this.llm.start({ binary, gguf, threads: llmThreads(s) });
    })()
      .catch((e) => {
        this.llm.note({ state: 'failed', detail: (e as Error).message });
        return null;
      })
      .finally(() => {
        this.startingLlm = null;
      });
    return this.startingLlm;
  }

  // ---- the worker -----------------------------------------------------------------------------------------------

  private stopWorker() {
    const w = this.worker;
    this.worker = null;
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
      // A failure is tried again after ten minutes.
      if (Date.now() - this.failure.at < 10 * 60_000) return Promise.resolve(null);
      this.failure = null;
      this.crashes = [];
    }
    this.startingWorker = (async () => {
      if (!(await this.ensureSetup())) return null;
      const free = (await availableMemory()) / 2 ** 20;
      if (free < WORKER_NEED_MB) {
        this.short = { free, need: WORKER_NEED_MB };
        return null;
      }
      this.short = null;
      this.changed();
      // The language model starts beside the worker: it is given to the worker once both are up.
      const llmUp = this.startLlm();
      const r = await PyWorker.start(pythonPath(), workerScript(), childEnv(), {
        loadMs: LOAD_MS,
        onExit: (w, why, was) => this.workerEnded(w, why, was),
      });
      if (typeof r === 'string') {
        this.crash(r, false);
        return null;
      }
      this.worker = r;
      this.idleLater();
      await Promise.race([llmUp, sleep(45_000)]);
      await this.syncLoad();
      return this.worker === r && r.ready ? r : null;
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

  /** Tells the worker what to load (the small model, the personal one, the language model's address) when that is not what it has. */
  private syncLoad(): Promise<void> {
    if (this.loading) return this.loading.then(() => this.syncLoad());
    const w = this.worker;
    if (!w?.ready) return Promise.resolve();
    const s = this.st;
    const personal = hasPersonal();
    const url = this.llm.running ? this.llm.url : null;
    const key = JSON.stringify([personal ? this.trainedAt() || 1 : 0, url, workerThreads(s)]);
    if (w.loadedKey === key) return Promise.resolve();
    const release = releaseDir();
    if (!release) return Promise.resolve();
    this.loading = (async () => {
      try {
        const r = await w.request({ op: 'load', model_dir: release, personal_dir: personal ? personalDir() : null, llm_url: url, threads: workerThreads(s), options: { k: 1000 } }, LOAD_MS).done;
        w.loadedKey = key;
        this.loadInfo = { kind: r.model === 'personal' ? 'personal' : 'base', languages: r.languages && typeof r.languages === 'object' ? r.languages : undefined };
      } catch (e) {
        if (this.worker === w) {
          this.fail(`The language models could not be loaded: ${(e as Error).message}`);
          this.stopWorker();
        }
      }
    })().finally(() => {
      this.loading = null;
      this.changed();
    });
    return this.loading;
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

  /** Personalises now (in the background); a 409 when it cannot. */
  train(): SuggestState {
    const s = this.st;
    if (!s.enabled) throw new HttpError(409, 'Turn on word suggestions first');
    if (suggestDisabled()) throw new HttpError(409, 'Word suggestions are off on this server (HYDOR_SUGGEST=off)');
    if (!s.personalise) throw new HttpError(409, 'Learning from what you write is turned off');
    if (this.trainer.active) return this.state();
    void this.runTraining();
    return this.state();
  }

  private async runTraining() {
    if (!(await this.ensureSetup())) return;
    const out = await this.trainer.run(this.db, this.st);
    kvSet(this.db, ATTEMPT_KEY, String(Date.now()));
    if (out.ok) void this.syncLoad();
    this.changed();
  }

  /** The scheduled check: personalise when it is due and the computer has the memory. */
  private async check() {
    try {
      if (!this.st.enabled || !this.st.personalise || this.trainer.active || this.setupP || !this.trainDue()) return;
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
    kvSet(this.db, ATTEMPT_KEY, String(Date.now()));
    void this.syncLoad();
    this.changed();
    return this.state();
  }

  // ---- life -----------------------------------------------------------------------------------------------------

  /** Once, when the server is up: what was turned on is set up, and the schedule is watched. */
  start() {
    if (suggestDisabled()) return;
    if (this.st.enabled) setTimeout(() => void this.ensureSetup(), 5000).unref?.();
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
