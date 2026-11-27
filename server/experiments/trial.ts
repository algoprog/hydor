// Trying a command before the real run: the same command in the same folder, through the queue as a run of its own
// kind (tag "try", HYDOR_TRY=1 and HYDOR_TRY_SECONDS in its environment), for 90 seconds at most (30 to 600), then
// stopped. What it answers: whether it got going (else where it first went wrong), the most GPU and resident memory it
// held (usage.ts), the time for a step and how many there are when the output says, how long the whole run should
// take, and what to ask for. And what was learned is kept in the runs themselves: the next start of the same command
// without a memory ask hears what it peaked at last time.
import { ACTIVE, isTrialRun, TRY_SECONDS, trySecondsOf, type RunRecord, type TrialAnswer } from '../../shared/experiments.ts';
import type { DB } from '../db.ts';
import { HttpError } from '../auth.ts';
import type { Deps } from '../features/types.ts';
import { commandWords } from './capture.ts';
import { files } from './local.ts';
import { parseLine, tailLines } from './metrics.ts';
import { cleanJob, ended, nameFor, stopRun, submit, wake } from './queue.ts';
import { getRun, listRuns, runFolder, type RunInfo } from './records.ts';

/** Puts a trial of `b.command` in line. A sweep's values are given as lists: its first combination is tried. */
export async function startTrial(d: Deps, b: Record<string, any>, o: { cwd?: string; startedBy?: RunInfo['startedBy'] } = {}): Promise<RunRecord> {
  if (b.where && b.where !== 'local') throw new HttpError(400, 'A trial runs on this computer: leave where out');
  const seconds = Math.min(Math.max(Math.round(Number(b.seconds) || TRY_SECONDS.default), TRY_SECONDS.min), TRY_SECONDS.max);
  const params = b.params && typeof b.params === 'object' ? Object.fromEntries(Object.entries(b.params as Record<string, unknown>).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])) : undefined;
  const env = b.env && typeof b.env === 'object' ? Object.fromEntries(Object.entries(b.env as Record<string, unknown>).filter(([k]) => !k.startsWith('HYDOR_TRY'))) : {};
  const spec = await cleanJob(
    d.db,
    {
      command: b.command,
      cwd: b.cwd,
      gpus: b.gpus,
      gpuMemGb: b.gpuMemGb,
      seed: b.seed,
      priority: b.priority,
      ...(params ? { params } : {}),
      // First, so they are not among those cut off.
      env: { HYDOR_TRY: '1', HYDOR_TRY_SECONDS: String(seconds), ...env },
      tags: ['try'],
      notify: { done: false, failed: false },
    },
    { cwd: o.cwd },
  );
  spec.name = `Try: ${nameFor(spec)}`;
  return submit(d, spec, { startedBy: o.startedBy });
}

/** Waits until the run has ended, at most `ms`; stops it when `signal` aborts (the one who asked is gone). */
export async function waitTrial(d: Deps, id: string, ms: number, signal?: AbortSignal): Promise<void> {
  const until = Date.now() + ms;
  for (;;) {
    const r = getRun(d.db, id);
    // One held at the ceiling on agents' GPU hours waits for the person: nobody waits for it here.
    if (!r || !ACTIVE.includes(r.status) || r.held || Date.now() >= until) return;
    if (signal?.aborted) {
      await stopRun(d, id, 'Stopped: whoever asked for the trial stopped waiting').catch(() => {});
      return;
    }
    wake();
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(t);
        ended.off('ended', onEnd);
        signal?.removeEventListener('abort', done);
        resolve();
      };
      const onEnd = (x: string) => x === id && done();
      const t = setTimeout(done, Math.min(1000, Math.max(10, until - Date.now())));
      ended.on('ended', onEnd);
      signal?.addEventListener('abort', done, { once: true });
    });
  }
}

// ---- what it answers ---------------------------------------------------------------------------------------------

/** "about 3 h 20 min", "about 40 min", "under a minute". */
export function aboutWords(seconds: number): string {
  if (seconds < 60) return 'under a minute';
  const m = Math.round(seconds / 60);
  if (m < 60) return `about ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `about ${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
  return `about ${Math.floor(h / 24)} days ${h % 24} h`;
}

/** A tenth of a GB is close enough, except for something small, which would read "0 GB": that gets a hundredth. */
const gbWords = (v: number) => `${v > 0 && v < 0.095 ? Math.max(0.01, Math.round(v * 100) / 100) : Math.round(v * 10) / 10} GB`;
const stepWords = (s: number) => (s >= 60 ? `${Math.round(s / 6) / 10} min` : `${s >= 10 ? Math.round(s) : Number(s.toPrecision(2))} s`);

/** What to ask for from a peak: a tenth more, rounded up to a whole GB, 1 at least. */
export const askGb = (peakGb: number) => Math.max(1, Math.ceil(peakGb * 1.1 - 1e-9));
/** A time limit from an estimate: a quarter more, rounded up to a tenth of an hour. */
export const askHours = (hours: number) => Math.max(0.1, Math.ceil(hours * 12.5 - 1e-9) / 10);

const RATE = /[\s,[](\d+(?:\.\d+)?)\s*(s\/it|it\/s|s\/step|steps?\/s|s\/batch|batch(?:es)?\/s)\b/;

/** Seconds a step takes as tqdm's training bar last said it, in the end of a log. */
export function barRate(log: string): number | undefined {
  const lines = log.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = RATE.exec(lines[i]);
    if (!m || !parseLine(lines[i])?.progress) continue;
    const v = Number(m[1]);
    if (v > 0) return m[2].startsWith('s/') ? v : 1 / v;
  }
  return undefined;
}

/** A trial's answer from its record and the end of its log. */
export function trialAnswer(r: RunRecord, log = '', now = Date.now()): TrialAnswer {
  const over = !ACTIVE.includes(r.status);
  const seconds = trySecondsOf(r);
  const ran = r.startedAt ? Math.max(0, Math.round(((r.endedAt ?? now) - r.startedAt) / 1000)) : undefined;
  const failed = r.status === 'failed' || r.status === 'lost';
  const gpuMemGb = Math.max(0, ...(r.peak?.gpuMemGb ?? []));
  const ramGb = r.peak?.ramGb ?? 0;
  const first = r.tried?.first;
  const last = r.tried?.last;
  // A step's time: what the progress bar says; else between two looks at how far it was; else since the start.
  let step = barRate(log);
  if (step === undefined && first && last) {
    if (last.done > first.done && last.at - first.at >= 2000) step = (last.at - first.at) / 1000 / (last.done - first.done);
    else if (r.startedAt && last.done > 0 && last.at - r.startedAt >= 5000) step = (last.at - r.startedAt) / 1000 / last.done;
  }
  let estimate: number | undefined;
  // How long it takes by its steps, when it did not do them all.
  if (step !== undefined && last && last.total > 0 && !failed && !(r.status === 'done' && last.done >= last.total)) {
    const startup = first && r.startedAt ? Math.max(0, (first.at - r.startedAt) / 1000 - first.done * step) : 0;
    estimate = (startup + last.total * step) / 3600;
  }
  // One that ran to its end otherwise: the whole run takes about as long as it did.
  const asLong = estimate === undefined && r.status === 'done' && !!r.startedAt;
  if (asLong) estimate = Math.max(0, (r.endedAt ?? now) - r.startedAt!) / 3_600_000;
  const ask: NonNullable<TrialAnswer['ask']> = {};
  if (!failed && gpuMemGb > 0) ask.gpuMemGb = askGb(gpuMemGb);
  if (estimate !== undefined) ask.hours = askHours(estimate);

  const peaks = [gpuMemGb > 0 ? `${gbWords(gpuMemGb)} of GPU memory${(r.gpuIds?.length ?? 0) > 1 ? ' on one GPU' : ''}` : '', ramGb > 0 ? `${gbWords(ramGb)} of memory` : ''].filter(Boolean).join(' and ');
  let said: string;
  if (!over) said = r.status === 'running' ? `It is being tried (${ran ?? 0} of ${seconds} seconds).` : `The trial waits to start${r.why ? `: ${r.why}` : ''}.`;
  else if (failed) said = `It failed${ran !== undefined ? ` after ${ran} s` : ''}: ${r.why ?? 'it did not run'}.${r.firstError ? ` Where it first went wrong (line ${r.firstError.line} of its log): ${r.firstError.text}` : ''}`;
  else if (!r.startedAt) said = 'It was stopped before it started.';
  else
    said = [
      asLong
        ? `It ran to its end in ${ran} s: the whole run takes about that long, unless your script shortens itself when it sees HYDOR_TRY.`
        : r.status === 'done'
          ? `It ran to its end in ${ran} s.`
          : r.why?.startsWith('Tried for')
            ? 'It got going.'
            : `It was stopped after ${ran} s.`,
      peaks ? `It peaked at ${peaks}.` : 'It was over before its memory could be read.',
      asLong ? '' : estimate !== undefined ? `A step takes about ${stepWords(step!)}, and the whole run ${aboutWords(estimate * 3600)}.` : 'It did not say how far it has to go.',
      ask.gpuMemGb !== undefined || ask.hours !== undefined
        ? `Ask for ${[ask.gpuMemGb !== undefined ? `gpuMemGb ${ask.gpuMemGb}` : '', ask.hours !== undefined ? `hours ${ask.hours}` : ''].filter(Boolean).join(' and ')}.`
        : '',
    ]
      .filter(Boolean)
      .join(' ');

  return {
    id: r.id,
    status: r.status,
    over,
    ...(r.why && (failed || !over) ? { why: r.why } : {}),
    ...(over && r.startedAt ? { ok: !failed } : failed ? { ok: false } : {}),
    ...(r.status === 'done' ? { finished: true } : {}),
    seconds,
    ...(ran !== undefined ? { ran } : {}),
    ...(failed && r.firstError ? { firstError: r.firstError } : {}),
    ...(r.peak ? { peak: r.peak } : {}),
    ...(gpuMemGb > 0 ? { gpuMemGb } : {}),
    ...(ramGb > 0 ? { ramGb } : {}),
    ...(step !== undefined ? { stepSeconds: Number(step.toPrecision(3)) } : {}),
    ...(last ? { steps: { done: last.done, total: last.total } } : {}),
    ...(estimate !== undefined ? { estimateHours: Number(estimate.toPrecision(3)) } : {}),
    ...(over && Object.keys(ask).length ? { ask } : {}),
    said,
  };
}

/** The answer of a trial by its run's id. */
export function readTrial(db: DB, id: string): TrialAnswer {
  const r = getRun(db, id);
  if (!r) throw new HttpError(404, 'There is no such run');
  if (!isTrialRun(r)) throw new HttpError(400, 'That run is not a trial');
  return trialAnswer(r, tailLines(files(r.folder ?? runFolder(r.id)).log, 60, 32 * 1024).text);
}

// ---- what was learned ----------------------------------------------------------------------------------------------

// A number, or a sweep's {name} where one goes.
const NUMBER = /^([-+]?(\d[\d_]*(\.\d*)?|\.\d+)([eE][-+]?\d+)?|\{[\w.-]+\})$/;

/** A command with its numbers taken out (and the values of its seed flags): the same for runs that differ only in those. */
export function commandSignature(command: string, cwd: string): string {
  const words = commandWords(command);
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const pair = /^([^=]*)=(.*)$/s.exec(w);
    const seed = /seed/i.test(pair ? pair[1] : w);
    if (pair) out.push(seed || NUMBER.test(pair[2]) ? `${pair[1]}=` : w);
    else if (!NUMBER.test(w)) {
      out.push(w);
      // The value after a seed flag, whatever it is.
      if (seed && w.startsWith('-') && words[i + 1] !== undefined && !words[i + 1].startsWith('-')) i++;
    }
  }
  return JSON.stringify([cwd.replace(/[\\/]+$/, '') || '/', out]);
}

/** The most GPU memory (on one GPU, in GB) the last run or trial of the same command in the same folder held, when one is known. */
export function lastPeak(db: DB, command: string, cwd: string, o: { not?: string } = {}): number | undefined {
  const sig = commandSignature(command, cwd);
  for (const r of listRuns(db, { cwd, status: ['done', 'stopped'], limit: 500 })) {
    if (r.id === o.not || !r.peak || r.remote || (r.where ?? 'local') !== 'local' || commandSignature(r.command, r.cwd) !== sig) continue;
    const peak = Math.max(0, ...r.peak.gpuMemGb);
    if (peak > 0) return peak;
  }
  return undefined;
}

/** What an agent that starts a command without a memory ask is told of it. */
export const peakNote = (peakGb: number) => `This command: it peaked at ${gbWords(peakGb)} last time (GPU memory). gpuMemGb ${askGb(peakGb)} would ask for that much free.`;
