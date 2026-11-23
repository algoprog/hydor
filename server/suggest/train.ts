// Personalising the small model: the texts (texts.ts) go to the engine's train.py, which runs at the lowest priority
// beside whatever the person is doing, saves a resume state as it goes and writes the new model only at its end; the new
// model's folder then takes the place of the old one, which stays until it has.
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import type { SuggestSettings, SuggestStatus } from '../../shared/suggest.ts';
import type { DB } from '../db.ts';
import { which } from '../documents/tools.ts';
import { childEnv } from './engine.ts';
import { track } from './procs.ts';
import { pythonPath, releaseDir, suggestDir, trainScript } from './setup.ts';
import { trainThreads } from './settings.ts';
import { writeTexts } from './texts.ts';

export const personalDir = () => path.join(suggestDir(), 'personal');
const workDir = () => path.join(personalDir(), 'train');
const outDir = () => path.join(workDir(), 'out');
const PERSONAL_FILES = ['model.safetensors', 'config.json'];

/** What is known of the personal model: written beside it when it was trained. */
export interface PersonalState {
  trainedAt: number;
  /** The time its texts were read until: the next run reads what is newer. */
  since: number;
  tokens?: number;
  languages?: Record<string, number>;
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

export type TrainOutcome = { ok: true; tokens?: number } | { ok: false; why: string; nothing?: boolean };

export class Trainer {
  state: SuggestStatus['training'] = { state: 'idle' };
  private proc: ChildProcess | null = null;
  private running: Promise<TrainOutcome> | null = null;
  private stopping = false;
  private cleanAfter = false;
  constructor(private onChange: () => void) {}

  get active() {
    return !!this.running;
  }

  private set(s: SuggestStatus['training']) {
    this.state = s;
    this.onChange();
  }

  /** Stops a run that is going (its resume state stays: the next run goes on from it). */
  stop() {
    this.stopping = true;
    const p = this.proc;
    if (p) {
      try {
        p.kill('SIGTERM');
      } catch {}
      const t = setTimeout(() => {
        try {
          if (p.exitCode == null) p.kill('SIGKILL');
        } catch {}
      }, 5000);
      t.unref?.();
    }
  }

  /** Stops a run and removes what it left (the texts, the resume state): learning is turned off. */
  stopAndClean() {
    this.stop();
    if (this.running) this.cleanAfter = true;
    else fs.rmSync(workDir(), { recursive: true, force: true });
  }

  /** One run, now: write the texts, personalise, put the new model in place. */
  run(db: DB, s: SuggestSettings, o: { now?: number; hooks?: TrainHooks } = {}): Promise<TrainOutcome> {
    if (this.running) return this.running;
    this.stopping = false;
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
      this.set({ state: nothing ? 'idle' : 'failed', startedAt: undefined, lastAt: this.state.lastAt, detail: why });
      return { ok: false, why, nothing };
    };
    const release = releaseDir();
    if (!release) return fail('The small model is not available yet');
    this.set({ state: 'running', startedAt, lastAt: this.state.lastAt, detail: 'Reading what you wrote' });
    const texts = path.join(workDir(), 'texts.jsonl');
    try {
      mkPrivate(personalDir());
      mkPrivate(workDir());
      const job = path.join(workDir(), 'job.json');
      // A run that was stopped goes on from its resume state with the texts it had: read again from the same time and up to
      // the same time (nothing written since is in them), so train.py sees the same texts file.
      let since = hasPersonal() ? (personalState()?.since ?? 0) : 0;
      let until = startedAt;
      let resumed = false;
      try {
        const j = JSON.parse(fs.readFileSync(job, 'utf8')) as { since: number; until?: number };
        if (typeof j.since === 'number' && typeof j.until === 'number' && fs.existsSync(outDir())) (since = j.since), (until = j.until), (resumed = true);
      } catch {}
      if (!resumed) fs.rmSync(outDir(), { recursive: true, force: true });
      const n = await writeTexts(db, texts, { since, until, sources: s.sources });
      if (this.stopping) return fail('Stopped', true);
      const count = n.user + n.agent + n.doc;
      if (!count) {
        fs.rmSync(job, { force: true });
        return fail('Nothing new to learn from', true);
      }
      fs.writeFileSync(job, JSON.stringify({ since, until, texts: n }), { mode: 0o600 });
      const threads = trainThreads(s);
      const init = hasPersonal() ? personalDir() : release;
      const args = [
        '-I', trainScript(), '--texts', texts, '--base', release, '--init', init, '--out', outDir(), '--replay', path.join(release, 'replay'),
        '--lr', '5e-4', '--batch-tokens', '4096', '--w-user', String(s.userWeight), '--replay-ratio', '1.0', '--epochs', '1',
        // The processor: `auto` would pick an Apple GPU, which the lowest priority does not reach.
        '--threads', String(threads), '--device', 'cpu', '--resume',
      ];
      this.set({ state: 'running', startedAt, lastAt: this.state.lastAt, progress: { done: 0, total: 0 }, detail: `Learning from ${count} text${count === 1 ? '' : 's'}` });
      const done = await this.spawnTrain(args, threads);
      if (!done.ok && done.nothing) {
        // train.py found nothing it can learn from in these texts (all too short, say): not a failure, and not to be tried again.
        fs.rmSync(job, { force: true });
        fs.rmSync(outDir(), { recursive: true, force: true });
        return fail(done.why, true);
      }
      if (!done.ok) return fail(done.why, this.stopping);
      // Stopped or forgotten as it ended: its model is not put in.
      if (this.stopping) return fail('Stopped', true);
      // The new model is complete in outDir: it takes the place of the old one, which stays until it has.
      for (const f of fs.readdirSync(outDir())) if (/^resume|\.pt$|\.part$|\.tmp$/i.test(f)) fs.rmSync(path.join(outDir(), f), { recursive: true, force: true });
      const state: PersonalState = { trainedAt: Date.now(), since: until, tokens: done.tokens, languages: done.languages, devNll: done.devNll, seconds: done.seconds };
      fs.writeFileSync(path.join(outDir(), 'state.json'), JSON.stringify(state), { mode: 0o600 });
      // Whoever holds the old model's files lets go first (Windows will not move them otherwise).
      await hooks.beforeSwap?.();
      if (this.stopping) return fail('Stopped', true);
      const next = `${personalDir()}.next`;
      fs.rmSync(next, { recursive: true, force: true });
      fs.renameSync(outDir(), next);
      fs.rmSync(texts, { force: true });
      swapIn();
      this.set({ state: 'idle', lastAt: state.trainedAt });
      return { ok: true, tokens: done.tokens };
    } catch (e) {
      return fail(this.stopping ? 'Stopped' : (e as Error).message || 'Personalising failed', this.stopping);
    } finally {
      // The texts are the person's own words: they do not stay beyond the run (a resume reads them again, bounded the same).
      fs.rmSync(texts, { force: true });
    }
  }

  private spawnTrain(args: string[], threads: number): Promise<{ ok: true; tokens?: number; languages?: Record<string, number>; devNll?: number; seconds?: number } | { ok: false; why: string; nothing?: boolean }> {
    return new Promise((resolve) => {
      const env = childEnv({ OMP_NUM_THREADS: String(threads), MKL_NUM_THREADS: String(threads) });
      // The lowest priority: `nice` (every thread of the process inherits it), or below normal on Windows.
      const nice = process.platform === 'win32' ? null : which('nice');
      const proc = nice ? spawn(nice, ['-n', '19', pythonPath(), ...args], { stdio: ['ignore', 'pipe', 'pipe'], env }) : spawn(pythonPath(), args, { stdio: ['ignore', 'pipe', 'pipe'], env });
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
