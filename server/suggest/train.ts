// Personalising the small model: the texts (texts.ts) go to the engine's train.py, which runs at the lowest priority
// beside whatever the person is doing, saves a resume state as it goes and writes the new model only at its end; the new
// model's folder then takes the place of the old one, which stays until it has. Every run starts from the published model and
// learns from all of the person's writing (its newest part), so the personal model never drifts from a copy of a copy.
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import type { SuggestSettings, SuggestStatus, TrainDevice } from '../../shared/suggest.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { which } from '../documents/tools.ts';
import { childEnv } from './engine.ts';
import { chooseDevice, GPU_ROOMY_MB, type DevicePick } from './gpu.ts';
import { track } from './procs.ts';
import { baseId, gpuPackagesReady, gpuPythonPath, pythonPath, releaseDir, setupGpuPython, setupTorch, suggestDir, torchReady, trainScript } from './setup.ts';
import { trainThreads } from './settings.ts';
import { writeTexts } from './texts.ts';

export const personalDir = () => path.join(suggestDir(), 'personal');
const workDir = () => path.join(personalDir(), 'train');
const outDir = () => path.join(workDir(), 'out');
const PERSONAL_FILES = ['model.safetensors', 'config.json'];

/**
 * How much of the person's own text a run learns from, newest first (train.py's --max-tokens): every run reads all their writing,
 * so this keeps a run on the processor to a bounded time however much has been written. About 4 million tokens is some 3 million
 * words, years of typing; only a person who has written more leaves out their oldest.
 */
export const MAX_OWN_TOKENS = 4_000_000;
/** Public text replayed per token of the person's own (train.py's --replay-ratio): half a token, so one of public text to two of theirs. */
export const REPLAY_RATIO = 0.5;

/** What is known of the personal model: written beside it when it was trained. */
export interface PersonalState {
  trainedAt: number;
  /** The time its texts were read until: the next run has something to learn only when more was written after it. */
  since: number;
  /** What it was learnt from (baseId: the published model's revision): another base, or none (a model an older version made), and the next run learns again from the new one. */
  base?: string;
  tokens?: number;
  languages?: Record<string, number>;
  /** The loss on a held-out part of the writing: runs hold none out now, so it is only in a model that an older version made. */
  devNll?: number;
  seconds?: number;
}

/** The folder holds a personalised model. */
export const hasPersonal = () => PERSONAL_FILES.every((f) => fs.existsSync(path.join(personalDir(), f)));

export function personalState(): PersonalState | null {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(personalDir(), 'state.json'), 'utf8')) as PersonalState;
    return typeof s.trainedAt === 'number' ? s : null;
  } catch {
    return null;
  }
}

/** Removes the personal model (and any training half done). */
export function forgetPersonal() {
  fs.rmSync(personalDir(), { recursive: true, force: true });
  fs.rmSync(`${personalDir()}.next`, { recursive: true, force: true });
  fs.rmSync(`${personalDir()}.prev`, { recursive: true, force: true });
}

/** A model folder made whole: its files and the state written beside them. */
const complete = (d: string) => PERSONAL_FILES.every((f) => fs.existsSync(path.join(d, f))) && fs.existsSync(path.join(d, 'state.json'));

/**
 * Puts the new model (`personal.next`, whole) in the place of the old one, which stays (`personal.prev`) until it is in:
 * so a crash between the two renames leaves one of them to be found (recoverPersonal).
 */
function swapIn() {
  const next = `${personalDir()}.next`;
  const prev = `${personalDir()}.prev`;
  fs.rmSync(prev, { recursive: true, force: true });
  if (fs.existsSync(personalDir())) fs.renameSync(personalDir(), prev);
  fs.renameSync(next, personalDir());
  keepPrivate(personalDir());
  fs.rmSync(prev, { recursive: true, force: true });
}

/**
 * At start: a swap that a crash cut short is finished (a whole `personal.next` takes the place) or undone (`personal.prev`
 * comes back when there is no `personal`); what else is left over goes.
 */
export function recoverPersonal() {
  const next = `${personalDir()}.next`;
  const prev = `${personalDir()}.prev`;
  try {
    if (fs.existsSync(next)) {
      if (complete(next)) swapIn();
      else fs.rmSync(next, { recursive: true, force: true });
    }
    if (fs.existsSync(prev)) {
      if (!fs.existsSync(personalDir())) fs.renameSync(prev, personalDir());
      else fs.rmSync(prev, { recursive: true, force: true });
    }
  } catch {}
}

const mkPrivate = (d: string) => {
  fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(d, 0o700);
  } catch {}
};

/** The personal model is the person's own: its folder only theirs (0700) and every file in it too (0600), whatever train.py made them. */
const keepPrivate = (d: string) => {
  try {
    fs.chmodSync(d, 0o700);
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) keepPrivate(p);
      else if (f.isFile()) fs.chmodSync(p, 0o600);
    }
  } catch {}
};

/** What the service does around a run. */
export interface TrainHooks {
  /** Just before the new model takes the old one's place (the worker lets go of the files). */
  beforeSwap?(): void | Promise<void>;
}

/**
 * How long train.py has to leave after SIGTERM before it is killed (ms). It saves its resume state at the end of the step it is
 * in, which on a busy computer takes tens of seconds: a pause waits for that (it keeps the work), a stop does not need to.
 */
export const GRACE = { stop: 5000, pause: 3 * 60_000 };

/**
 * The seed of a run (train.py's --seed): from the time its texts were read up to, so each run draws other passages of the
 * replayed public text (with one seed for all, every night replayed the same few passages, which the model could learn by
 * heart while the rest of the sample went unused), and a run that is resumed keeps its seed (its bounds are kept in job.json).
 */
export const runSeed = (until: number) => Math.floor(until / 1000) % 2_147_483_647;

/** halted: the run was ended on purpose, by a stop (what it did is dropped) or a pause (it goes on from its resume state). */
export type TrainOutcome = { ok: true; tokens?: number } | { ok: false; why: string; nothing?: boolean; halted?: 'stop' | 'pause' };

/** After a graphics card fails or cannot be set up, the processor is used for a day. */
export const GPU_HOLD_MS = 24 * 3600_000;
const GPU_HOLD_KEY = 'suggest.train.gpu.hold';
const LAST_KEY = 'suggest.train.device';

/** Why the graphics card is not used until when (a failure, or a set-up that did not work), while that holds. */
export function gpuHold(db: DB, now = Date.now()): { until: number; why: string } | null {
  try {
    const h = JSON.parse(kvGet(db, GPU_HOLD_KEY) ?? 'null') as { until?: number; why?: string } | null;
    return h && typeof h.until === 'number' && h.until > now && typeof h.why === 'string' ? { until: h.until, why: h.why } : null;
  } catch {
    return null;
  }
}
const holdGpu = (db: DB, why: string, now = Date.now()) => kvSet(db, GPU_HOLD_KEY, JSON.stringify({ until: now + GPU_HOLD_MS, why }));
const releaseGpu = (db: DB) => kvSet(db, GPU_HOLD_KEY, 'null');

/** Where the last run learned, and why not on the graphics card when that was wanted. */
export interface LastDevice {
  device: TrainDevice;
  why?: string;
}
export function lastDevice(db: DB): LastDevice | null {
  try {
    const l = JSON.parse(kvGet(db, LAST_KEY) ?? 'null') as LastDevice | null;
    return l && l.device && ['cpu', 'cuda', 'mps'].includes(l.device.kind) ? l : null;
  } catch {
    return null;
  }
}

/** What a run asks of the outside, so a test can answer for it. */
export interface TrainDeps {
  /** Where to learn (the graphics card when there is a free one and the setting allows). */
  pick(s: SuggestSettings): Promise<DevicePick>;
  /** The CUDA environment is set up for this PyTorch build. */
  gpuReady(tag: string): boolean;
  /** Sets it up (downloads PyTorch's CUDA build), reporting where it is, and stopping when `signal` ends. */
  setupGpu(tag: string, report: (detail: string) => void, signal: AbortSignal): Promise<void>;
  /** PyTorch (the CPU build) is in the suggestion environment, which learning on the processor runs from (suggesting needs none). */
  torchReady(): boolean;
  /** Puts it there, reporting where it is, and stopping when `signal` ends. */
  setupTorch(report: (detail: string) => void, signal: AbortSignal): Promise<void>;
}

const realDeps: TrainDeps = {
  pick: (s) => chooseDevice({ enabled: s.trainGpu }),
  gpuReady: gpuPackagesReady,
  setupGpu: setupGpuPython,
  torchReady,
  setupTorch,
};

export class Trainer {
  state: SuggestStatus['training'] = { state: 'idle' };
  private proc: ChildProcess | null = null;
  private running: Promise<TrainOutcome> | null = null;
  /** The run is being ended on purpose: stopped (dropped) or paused (kept). A stop wins over a pause. */
  private halted: 'stop' | 'pause' | null = null;
  private ctl = new AbortController();
  private cleanAfter = false;
  deps: TrainDeps = realDeps;
  constructor(private onChange: () => void) {}

  get active() {
    return !!this.running;
  }

  /** The run is being ended (stopped or paused). */
  get stopping() {
    return this.halted !== null;
  }

  /** The run is being stopped (not paused). */
  private get dropped() {
    return this.halted === 'stop';
  }

  /** Resolves once no run is going (at once when none is). */
  async settled() {
    while (this.running) await this.running.catch(() => {});
  }

  private set(s: SuggestStatus['training']) {
    this.state = s;
    this.onChange();
  }

  /** Stops a run that is going (its resume state stays: the next run goes on from it). */
  stop() {
    this.halted = 'stop';
    this.end();
  }

  /** Pauses a run that is going: the same, but the run is told apart (the service holds the schedule until it is resumed). */
  pause() {
    this.halted ??= 'pause';
    this.end();
  }

  private end() {
    this.ctl.abort();
    const p = this.proc;
    if (p) {
      try {
        p.kill('SIGTERM');
      } catch {}
      const t = setTimeout(() => {
        try {
          if (p.exitCode == null) p.kill('SIGKILL');
        } catch {}
      }, this.halted === 'pause' ? GRACE.pause : GRACE.stop);
      t.unref?.();
    }
  }

  /** Stops a run and removes what it left (the texts, the resume state): learning is turned off. */
  stopAndClean() {
    this.stop();
    if (this.running) this.cleanAfter = true;
    else {
      fs.rmSync(workDir(), { recursive: true, force: true });
      this.state = { state: 'idle', lastAt: this.state.lastAt };
      this.onChange();
    }
  }

  /** One run, now: write the texts, personalise, put the new model in place. */
  run(db: DB, s: SuggestSettings, o: { now?: number; hooks?: TrainHooks } = {}): Promise<TrainOutcome> {
    if (this.running) return this.running;
    this.halted = null;
    this.ctl = new AbortController();
    this.cleanAfter = false;
    this.running = this.go(db, s, o.now ?? Date.now(), o.hooks ?? {}).finally(() => {
      this.running = null;
      this.proc = null;
      if (this.cleanAfter) fs.rmSync(workDir(), { recursive: true, force: true });
      this.cleanAfter = false;
    });
    return this.running;
  }

  private async go(db: DB, s: SuggestSettings, startedAt: number, hooks: TrainHooks): Promise<TrainOutcome> {
    const fail = (why: string, nothing = false): TrainOutcome => {
      const halted = this.halted ?? undefined;
      // Ended on purpose: nothing to explain (the service shows a pause, and a stop is the person's own).
      this.set({ state: nothing ? 'idle' : 'failed', startedAt: undefined, lastAt: this.state.lastAt, detail: halted ? undefined : why });
      return { ok: false, why, nothing, halted };
    };
    const ended = () => (this.dropped ? 'Stopped' : 'Paused');
    const release = releaseDir();
    if (!release) return fail('The small model is not available yet');
    this.set({ state: 'running', startedAt, lastAt: this.state.lastAt, detail: 'Reading what you wrote' });
    const texts = path.join(workDir(), 'texts.jsonl');
    try {
      mkPrivate(personalDir());
      mkPrivate(workDir());
      const job = path.join(workDir(), 'job.json');
      // Every run is a fresh run: it starts from the published model and reads all the person's writing (up to the time it began),
      // so a model is never a copy of a copy. It has something to learn only when more was written after the last run's cut-off
      // (`since`). A run that was stopped goes on from its resume state with the texts it had: read again up to the same time
      // (nothing written since is in them), so train.py sees the same texts file.
      // A personal model made from another published model (or from none we know of) has learnt nothing from this one: all the writing counts as new.
      const saved = hasPersonal() ? personalState() : null;
      let since = saved && saved.base === baseId() ? saved.since : 0;
      let base = baseId();
      let until = startedAt;
      let seed = runSeed(until);
      let resumed = false;
      try {
        const j = JSON.parse(fs.readFileSync(job, 'utf8')) as { since: number; until?: number; seed?: number; base?: string };
        // A run begun from another published model (or from none we know of) is not gone on with: it starts over from this one.
        if (typeof j.since === 'number' && typeof j.until === 'number' && j.base === baseId() && fs.existsSync(outDir())) {
          (since = j.since), (until = j.until), (base = j.base), (resumed = true);
          // A run begun by a version that drew every run's replay with seed 0 goes on with it (its resume state is made with it).
          seed = Number.isInteger(j.seed) ? j.seed! : 0;
        }
      } catch {}
      if (!resumed) fs.rmSync(outDir(), { recursive: true, force: true });
      const n = await writeTexts(db, texts, { since: 0, until, sources: s.sources, freshSince: resumed ? undefined : since });
      if (this.stopping) return fail(ended(), true);
      const count = n.user + n.agent + n.doc;
      if (!count || (!resumed && !n.fresh)) {
        fs.rmSync(job, { force: true });
        return fail('Nothing new to learn from', true);
      }
      fs.writeFileSync(job, JSON.stringify({ since, until, seed, base, texts: n }), { mode: 0o600 });
      const threads = trainThreads(s);
      this.set({ state: 'running', startedAt, lastAt: this.state.lastAt, progress: { done: 0, total: 0 }, detail: `Learning from ${count} text${count === 1 ? '' : 's'}` });
      // Where to learn: the graphics card when there is one to use, else the processor (and why not, for the page).
      let pick = await this.choose(db, s);
      if (this.stopping) return fail(ended(), true);
      const remember = (p: DevicePick) => kvSet(db, LAST_KEY, JSON.stringify({ device: { kind: p.device.kind, name: p.device.name }, ...(p.why ? { why: p.why } : {}) } satisfies LastDevice));
      remember(pick);
      let python = pythonPath();
      if (pick.device.kind === 'cuda') {
        const prepared = await this.prepareGpu(db, pick.tag!, startedAt);
        if (this.stopping) return fail(ended(), true);
        if (prepared.ok) python = gpuPythonPath();
        else remember((pick = { device: { kind: 'cpu' }, why: prepared.why }));
      }
      // The processor (and a Mac's graphics chip) learns from the suggestion environment: PyTorch goes into it the first time.
      if (pick.device.kind !== 'cuda') {
        const t = await this.prepareTorch(startedAt, pick.device);
        if (this.stopping) return fail(ended(), true);
        if (!t.ok) return fail(t.why);
      }
      const attempt = (p: DevicePick, py: string) => {
        this.set({ state: 'running', startedAt, lastAt: this.state.lastAt, progress: { done: 0, total: 0 }, detail: `Learning from ${count} text${count === 1 ? '' : 's'}`, device: { kind: p.device.kind, name: p.device.name } });
        return this.spawnTrain(py, this.args({ texts, release, s, threads, pick: p, seed }), this.envFor(threads, p));
      };
      let done = await attempt(pick, python);
      if (!done.ok && !done.nothing && !this.stopping && pick.device.kind !== 'cpu') {
        // The graphics card did not work (out of memory, a driver that fails): this run goes on at once on the processor from its
        // resume state, and the card is left alone for a day.
        const why = `Learning on the graphics card failed: ${done.why}`;
        holdGpu(db, why);
        remember({ device: { kind: 'cpu' }, why });
        const t = await this.prepareTorch(startedAt, { kind: 'cpu' });
        if (this.stopping) return fail(ended(), true);
        if (!t.ok) return fail(t.why);
        done = await attempt({ device: { kind: 'cpu' } }, pythonPath());
        // A processor that fails the same way says it was not the card.
        if (!done.ok && !done.nothing && !this.stopping) releaseGpu(db);
      }
      if (!done.ok && done.nothing) {
        // train.py found nothing it can learn from in these texts (all too short, say): not a failure, and not to be tried again.
        fs.rmSync(job, { force: true });
        fs.rmSync(outDir(), { recursive: true, force: true });
        return fail(done.why, true);
      }
      if (!done.ok) return fail(done.why, this.stopping);
      // Stopped or forgotten as it ended: its model is not put in (a pause that came as it ended is too late: the run is done).
      if (this.dropped) return fail(ended(), true);
      // The new model is complete in outDir: it takes the place of the old one, which stays until it has.
      for (const f of fs.readdirSync(outDir())) if (/^resume|\.pt$|\.part$|\.tmp$/i.test(f)) fs.rmSync(path.join(outDir(), f), { recursive: true, force: true });
      const state: PersonalState = { trainedAt: Date.now(), since: until, base, tokens: done.tokens, languages: done.languages, ...(done.devNll != null ? { devNll: done.devNll } : {}), seconds: done.seconds };
      fs.writeFileSync(path.join(outDir(), 'state.json'), JSON.stringify(state), { mode: 0o600 });
      // Whoever holds the old model's files lets go first (Windows will not move them otherwise).
      await hooks.beforeSwap?.();
      if (this.dropped) return fail(ended(), true);
      const next = `${personalDir()}.next`;
      fs.rmSync(next, { recursive: true, force: true });
      fs.renameSync(outDir(), next);
      fs.rmSync(texts, { force: true });
      swapIn();
      this.set({ state: 'idle', lastAt: state.trainedAt });
      return { ok: true, tokens: done.tokens };
    } catch (e) {
      return fail(this.stopping ? ended() : (e as Error).message || 'Personalising failed', this.stopping);
    } finally {
      // The texts are the person's own words: they do not stay beyond the run (a resume reads them again, bounded the same).
      fs.rmSync(texts, { force: true });
    }
  }

  /** Chooses where this run learns: the held-back card is not asked about again, a failure to find out is the processor. */
  private async choose(db: DB, s: SuggestSettings): Promise<DevicePick> {
    if (!s.trainGpu) return { device: { kind: 'cpu' } };
    const hold = gpuHold(db);
    if (hold) return { device: { kind: 'cpu' }, why: hold.why };
    try {
      return await this.deps.pick(s);
    } catch (e) {
      return { device: { kind: 'cpu' }, why: `The graphics card could not be looked at: ${(e as Error).message}` };
    }
  }

  /** PyTorch's CUDA build is there (the first time it is downloaded, with the learning line saying so); not when it cannot be, and then for a day. */
  private async prepareGpu(db: DB, tag: string, startedAt: number): Promise<{ ok: true } | { ok: false; why: string }> {
    if (this.deps.gpuReady(tag)) return { ok: true };
    const report = (d: string) => this.set({ state: 'running', startedAt, lastAt: this.state.lastAt, detail: d, device: { kind: 'cuda' } });
    try {
      report('Getting PyTorch for the graphics card (about 2.5 GB, the first time)');
      await this.deps.setupGpu(tag, report, this.ctl.signal);
      return { ok: true };
    } catch (e) {
      if (this.stopping) return { ok: false, why: 'Stopped' };
      const why = `PyTorch for the graphics card could not be set up: ${(e as Error).message}`;
      holdGpu(db, why);
      return { ok: false, why };
    }
  }

  /** PyTorch's CPU build is in the suggestion environment (the first time it is installed, with the learning line saying so). */
  private async prepareTorch(startedAt: number, device: TrainDevice): Promise<{ ok: true } | { ok: false; why: string }> {
    if (this.deps.torchReady()) return { ok: true };
    const report = (d: string) => this.set({ state: 'running', startedAt, lastAt: this.state.lastAt, detail: d, device: { kind: device.kind, name: device.name } });
    try {
      report('Getting PyTorch for learning (about 200 MB, the first time)');
      await this.deps.setupTorch(report, this.ctl.signal);
      return { ok: true };
    } catch (e) {
      if (this.stopping) return { ok: false, why: 'Stopped' };
      return { ok: false, why: `PyTorch could not be set up: ${(e as Error).message}` };
    }
  }

  /** train.py's command line for where it learns. */
  private args(o: { texts: string; release: string; s: SuggestSettings; threads: number; pick: DevicePick; seed: number }): string[] {
    const batch = 4096;
    return [
      // From the published model (never the personal one) on all of the person's writing, its newest part, and no hold-out.
      '-I', trainScript(), '--texts', o.texts, '--base', o.release, '--init', o.release, '--out', outDir(), '--replay', path.join(o.release, 'replay'),
      '--lr', '5e-4', '--batch-tokens', String(batch), '--w-user', String(o.s.userWeight), '--replay-ratio', String(REPLAY_RATIO), '--epochs', '1',
      '--holdout', '0', '--max-tokens', String(MAX_OWN_TOKENS),
      // Said outright, never `auto`: the processor unless the choice was a card. A card with room runs the batch in one piece (the
      // same gradient); one with less keeps train.py's smaller pieces.
      '--threads', String(o.threads), '--device', o.pick.device.kind, '--resume', '--seed', String(o.seed),
      ...(o.pick.device.kind === 'cuda' && (o.pick.device.freeMb ?? Infinity) >= GPU_ROOMY_MB ? ['--micro-tokens', String(batch)] : []),
    ];
  }

  /** The environment of the run: no card unless it is the chosen one (CUDA_VISIBLE_DEVICES names only it, numbered as nvidia-smi does). */
  private envFor(threads: number, pick: DevicePick) {
    const extra: Record<string, string> = { OMP_NUM_THREADS: String(threads), MKL_NUM_THREADS: String(threads) };
    if (pick.device.kind === 'cuda') Object.assign(extra, { CUDA_VISIBLE_DEVICES: String(pick.device.index ?? 0), CUDA_DEVICE_ORDER: 'PCI_BUS_ID' });
    if (pick.device.kind === 'mps') extra.PYTORCH_ENABLE_MPS_FALLBACK = '1';
    return childEnv(extra);
  }

  private spawnTrain(python: string, args: string[], env: NodeJS.ProcessEnv): Promise<{ ok: true; tokens?: number; languages?: Record<string, number>; devNll?: number; seconds?: number } | { ok: false; why: string; nothing?: boolean }> {
    return new Promise((resolve) => {
      // The lowest priority: `nice` (every thread of the process inherits it), or below normal on Windows.
      const nice = process.platform === 'win32' ? null : which('nice');
      const proc = nice ? spawn(nice, ['-n', '19', python, ...args], { stdio: ['ignore', 'pipe', 'pipe'], env }) : spawn(python, args, { stdio: ['ignore', 'pipe', 'pipe'], env });
      this.proc = proc;
      track('train', proc, trainScript());
      if (process.platform === 'win32' && proc.pid) {
        try {
          os.setPriority(proc.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
        } catch {}
      }
      const tail: string[] = [];
      let finished: { tokens?: number; languages?: Record<string, number>; devNll?: number; seconds?: number } | null = null;
      proc.stderr!.on('data', (b: Buffer) => {
        for (const l of b.toString().split('\n')) if (l.trim()) tail.push(l.trim().slice(0, 300));
        tail.splice(0, Math.max(0, tail.length - 10));
      });
      readline.createInterface({ input: proc.stdout! }).on('line', (line) => {
        let m: any;
        try {
          m = JSON.parse(line);
        } catch {
          return;
        }
        if (m.progress && typeof m.progress.done === 'number') this.set({ ...this.state, progress: { done: m.progress.done, total: Number(m.progress.total) || 0 } });
        else if (m.done) finished = { tokens: m.tokens, languages: m.languages, devNll: m.dev_nll, seconds: m.seconds };
        else if (m.error) tail.push(String(m.error).slice(0, 300));
      });
      proc.on('error', (e) => resolve({ ok: false, why: e.message }));
      // 'close', not 'exit': it comes after the last of its output was read (the line that says it is done).
      proc.on('close', (code, signal) => {
        if (code === 0 && finished) resolve({ ok: true, ...finished });
        // Exit code 3: nothing in the texts to learn from (train.py's own answer, not a failure; 2 is a wrong command line).
        else if (code === 3 && !this.stopping) resolve({ ok: false, why: 'Nothing new to learn from', nothing: true });
        else resolve({ ok: false, why: this.stopping ? 'Stopped' : `Personalising stopped (${signal ?? `exit ${code}`})${tail.length ? `: ${tail.slice(-2).join(' ')}` : ''}` });
      });
    });
  }
}
