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

const mkPrivate = (d: string) => {
  fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(d, 0o700);
  } catch {}
};

export type TrainOutcome = { ok: true; tokens?: number } | { ok: false; why: string; nothing?: boolean };

export class Trainer {
  state: SuggestStatus['training'] = { state: 'idle' };
  private proc: ChildProcess | null = null;
  private running: Promise<TrainOutcome> | null = null;
  private stopping = false;
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

  /** One run, now: write the texts, personalise, put the new model in place. */
  run(db: DB, s: SuggestSettings, o: { now?: number } = {}): Promise<TrainOutcome> {
    if (this.running) return this.running;
    this.stopping = false;
    this.running = this.go(db, s, o.now ?? Date.now()).finally(() => {
      this.running = null;
      this.proc = null;
    });
    return this.running;
  }

  private async go(db: DB, s: SuggestSettings, startedAt: number): Promise<TrainOutcome> {
    const fail = (why: string, nothing = false): TrainOutcome => {
      this.set({ state: nothing ? 'idle' : 'failed', startedAt: undefined, lastAt: this.state.lastAt, detail: why });
      return { ok: false, why, nothing };
    };
    const release = releaseDir();
    if (!release) return fail('The small model is not available yet');
    this.set({ state: 'running', startedAt, lastAt: this.state.lastAt, detail: 'Reading what you wrote' });
    try {
      mkPrivate(personalDir());
      mkPrivate(workDir());
      const texts = path.join(workDir(), 'texts.jsonl');
      const job = path.join(workDir(), 'job.json');
      // A run that was stopped goes on from its resume state with the texts it had (read again from the same time).
      let since = hasPersonal() ? (personalState()?.since ?? 0) : 0;
      let resumed = false;
      try {
        const j = JSON.parse(fs.readFileSync(job, 'utf8')) as { since: number; until?: number };
        if (typeof j.since === 'number' && fs.existsSync(outDir())) (since = j.since), (resumed = true);
      } catch {}
      if (!resumed) fs.rmSync(outDir(), { recursive: true, force: true });
      const n = await writeTexts(db, texts, { since, sources: s.sources });
      const count = n.user + n.agent + n.doc;
      if (!count) {
        fs.rmSync(texts, { force: true });
        fs.rmSync(job, { force: true });
        return fail('Nothing new to learn from', true);
      }
      fs.writeFileSync(job, JSON.stringify({ since, until: startedAt, texts: n }), { mode: 0o600 });
      if (this.stopping) return fail('Stopped', true);
      const threads = trainThreads(s);
      const init = hasPersonal() ? personalDir() : release;
      const args = [
        '-I', trainScript(), '--texts', texts, '--base', release, '--init', init, '--out', outDir(), '--replay', path.join(release, 'replay'),
        '--lr', '5e-4', '--batch-tokens', '4096', '--w-user', String(s.userWeight), '--replay-ratio', '1.0', '--epochs', '1',
        '--threads', String(threads), '--device', 'auto', '--resume',
      ];
      this.set({ state: 'running', startedAt, lastAt: this.state.lastAt, progress: { done: 0, total: 0 }, detail: `Learning from ${count} text${count === 1 ? '' : 's'}` });
      const done = await this.spawnTrain(args, threads);
      if (!done.ok) return fail(done.why, this.stopping);
      // The new model is complete in outDir: it takes the place of the old one, which stays until it has.
      const next = `${personalDir()}.next`;
      const prev = `${personalDir()}.prev`;
      fs.rmSync(next, { recursive: true, force: true });
      fs.rmSync(prev, { recursive: true, force: true });
      for (const f of fs.readdirSync(outDir())) if (/^resume|\.pt$|\.part$|\.tmp$/i.test(f)) fs.rmSync(path.join(outDir(), f), { recursive: true, force: true });
      const state: PersonalState = { trainedAt: Date.now(), since: startedAt, tokens: done.tokens, languages: done.languages, devNll: done.devNll, seconds: done.seconds };
      fs.writeFileSync(path.join(outDir(), 'state.json'), JSON.stringify(state), { mode: 0o600 });
      fs.renameSync(outDir(), next);
      fs.rmSync(texts, { force: true });
      if (fs.existsSync(personalDir())) fs.renameSync(personalDir(), prev);
      fs.renameSync(next, personalDir());
      fs.rmSync(prev, { recursive: true, force: true });
      this.set({ state: 'idle', lastAt: state.trainedAt });
      return { ok: true, tokens: done.tokens };
    } catch (e) {
      return fail((e as Error).message || 'Personalising failed');
    }
  }

  private spawnTrain(args: string[], threads: number): Promise<{ ok: true; tokens?: number; languages?: Record<string, number>; devNll?: number; seconds?: number } | { ok: false; why: string }> {
    return new Promise((resolve) => {
      const env = childEnv({ OMP_NUM_THREADS: String(threads), MKL_NUM_THREADS: String(threads) });
      // The lowest priority: `nice` (every thread of the process inherits it), or below normal on Windows.
      const nice = process.platform === 'win32' ? null : which('nice');
      const proc = nice ? spawn(nice, ['-n', '19', pythonPath(), ...args], { stdio: ['ignore', 'pipe', 'pipe'], env }) : spawn(pythonPath(), args, { stdio: ['ignore', 'pipe', 'pipe'], env });
      this.proc = proc;
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
      proc.on('exit', (code, signal) => {
        if (code === 0 && finished) resolve({ ok: true, ...finished });
        else resolve({ ok: false, why: this.stopping ? 'Stopped' : `Personalising stopped (${signal ?? `exit ${code}`})${tail.length ? `: ${tail.slice(-2).join(' ')}` : ''}` });
      });
    });
  }
}
