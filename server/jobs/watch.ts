// Reading what the jobs print, while they run: how far each has got and the last line that says something
// (shared/job-progress.ts), with the readings kept in memory so the time left can be worked out from how fast they
// move; and the estimate itself (the job's own figure, its progress, the agent's guess, how long it took before).
import fs from 'node:fs';
import { estimateEnd, lastLine, readProgress, type ProgressSample } from '../../shared/job-progress.ts';
import type { JobEstimate, JobProgress } from '../../shared/jobs.ts';
import { readTail, readTaskLog } from '../tasklog.ts';

const TAIL_BYTES = 64 << 10;
const HEAD_BYTES = 4 << 10;
/** An agent's output is its transcript, which is parsed to say its last step: not more often than this. */
const AGENT_EVERY_MS = 15_000;
const MAX_SAMPLES = 200;
/** A reading that has not moved is kept again this often, so a job that stalls is seen to stall. */
const SAME_EVERY_MS = 30_000;
/** Progress that falls back by more than this has started over (a new phase): the old readings say nothing about it. */
const FELL = 0.02;

export interface Reading {
  progress?: JobProgress;
  /** A time left the job itself printed, and when it was first read. */
  leftMs?: number;
  leftAt?: number;
  lastLine?: string;
}

interface Kept extends Reading {
  size: number;
  mtime: number;
  /** When an agent's transcript was last parsed. */
  parsed: number;
  samples: ProgressSample[];
}

/** An agent's last step in a line, from what it said or did last. */
function agentLine(file: string): string | undefined {
  const e = readTaskLog(file).entries?.at(-1);
  if (!e) return undefined;
  return lastLine([e.tool, e.text.split('\n')[0]].filter(Boolean).join(': '));
}

/** A task's output that is an agent's transcript (a link to it), not what a command printed. */
function isTranscript(file: string): boolean {
  return fs.lstatSync(file).isSymbolicLink() && fs.realpathSync(file).endsWith('.jsonl');
}

/** How a job's output begins: where the `job` command names its job. */
export function headOf(file: string): string {
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(HEAD_BYTES);
      return buf.toString('utf8', 0, fs.readSync(fd, buf, 0, buf.length, 0));
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return '';
  }
}

export class Watcher {
  private kept = new Map<string, Kept>();

  /**
   * Reads one job's output (again only when it changed) and notes its progress. Nothing to read (no file, or one that
   * is gone) leaves what was read before.
   */
  read(id: string, file: string | null | undefined, now: number, pattern?: string): Reading {
    const k = this.kept.get(id) ?? { size: -1, mtime: -1, parsed: 0, samples: [] };
    this.kept.set(id, k);
    if (file) {
      try {
        const st = fs.statSync(file);
        if (st.size !== k.size || st.mtimeMs !== k.mtime) this.readChanged(k, file, now, pattern, st);
      } catch {
        // Gone or unreadable just now.
      }
    }
    this.sample(k, now);
    return k;
  }

  private readChanged(k: Kept, file: string, now: number, pattern: string | undefined, st: fs.Stats) {
    if (isTranscript(file)) {
      if (now - k.parsed < AGENT_EVERY_MS) return;
      k.parsed = now;
      k.lastLine = agentLine(file);
    } else {
      const { text } = readTail(file, TAIL_BYTES);
      k.lastLine = lastLine(text);
      const r = readProgress(text, pattern);
      if (r) {
        // The same time left read again is as old as when it was first read.
        if (r.leftMs !== undefined && (r.leftMs !== k.leftMs || r.text !== k.progress?.text)) k.leftAt = now;
        k.leftMs = r.leftMs;
        k.progress = { fraction: r.fraction, text: r.text, at: now };
      }
    }
    k.size = st.size;
    k.mtime = st.mtimeMs;
  }

  private sample(k: Kept, now: number) {
    const f = k.progress?.fraction;
    if (f === undefined) return;
    const last = k.samples.at(-1);
    if (last && f < last.fraction - FELL) k.samples = [];
    else if (last && f === last.fraction && now - last.at < SAME_EVERY_MS) return;
    k.samples.push({ at: now, fraction: f });
    // The first reading stays: it says how the whole run has gone.
    if (k.samples.length > MAX_SAMPLES) k.samples.splice(1, 1);
  }

  /** Notes a progress that comes from a record rather than from output (a run of Experiments). */
  note(id: string, progress: JobProgress | undefined, now: number) {
    const k = this.kept.get(id) ?? { size: -1, mtime: -1, parsed: 0, samples: [] };
    this.kept.set(id, k);
    if (progress) k.progress = progress;
    this.sample(k, now);
  }

  get(id: string): Reading | undefined {
    return this.kept.get(id);
  }

  samples(id: string): ProgressSample[] {
    return this.kept.get(id)?.samples ?? [];
  }

  /** Forgets every job that no longer runs. */
  keepOnly(ids: Set<string>) {
    for (const id of this.kept.keys()) if (!ids.has(id)) this.kept.delete(id);
  }
}

/**
 * When a running job should end, from the first of: the time left it printed, how fast its progress moves, the agent's
 * guess, how long it took before. One in the past (a guess or a printed figure it has overrun) is given as it is: the
 * page says it is over its estimate, and nothing is counted from it.
 */
export function estimateRunning(o: { reading?: Reading; samples: ProgressSample[]; startedAt?: number; etaMs?: number; historyMs?: number; now: number }): JobEstimate | undefined {
  const { reading, samples, startedAt, now } = o;
  if (reading?.leftMs !== undefined && reading.leftAt !== undefined) return { endsAt: reading.leftAt + reading.leftMs, source: 'output', confidence: 'high' };
  const from = startedAt ?? samples[0]?.at;
  const e = from !== undefined && samples.length ? estimateEnd(samples, from, now) : null;
  // A guess from one early reading gives way to the agent's estimate or the job's past, which are about the whole job.
  if (e && (e.confidence !== 'low' || startedAt === undefined || (!o.etaMs && !o.historyMs))) return { endsAt: e.endsAt, source: 'progress', confidence: e.confidence };
  if (startedAt === undefined) return e ? { endsAt: e.endsAt, source: 'progress', confidence: e.confidence } : undefined;
  if (o.etaMs) return { endsAt: startedAt + o.etaMs, source: 'agent', confidence: 'low' };
  if (o.historyMs) return { endsAt: startedAt + o.historyMs, source: 'history', confidence: 'low' };
  return undefined;
}
