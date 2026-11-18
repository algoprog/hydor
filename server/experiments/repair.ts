// Records made before a run's metrics said which of them repeat (`repeated`), when only the first 100 metrics a run
// printed were kept and a long dump of settings at its start could fill them all. Each such record is fixed once:
// from its stored series when it has room to spare, and when it was at the cap by reading its log again (and its
// metrics file) up to where the queue had got, which finds the metrics that were left out.
import fs from 'node:fs';
import path from 'node:path';
import type { RunRecord } from '../../shared/experiments.ts';
import type { DB } from '../db.ts';
import { files } from './local.ts';
import { MAX_METRICS, parseLine, readFrom, Tracker } from './metrics.ts';
import { offsetsOf, runFolder, saveSeries, seriesOf, updateRun } from './records.ts';

/**
 * Logs larger than this are not read again: a run's own, while the page waits for it (when the queue first looks at
 * a run going on), and an ended run's, in the background (a megabyte at a time, the server answering in between).
 */
const MAX_LOG_NOW = 32 * 1024 * 1024;
const MAX_LOG = 256 * 1024 * 1024;

/** Reads a file from its start up to `upTo` bytes into the tracker, line by line as the queue does: a step per megabyte. */
function* feed(t: Tracker, file: string, upTo: number, at: number): Generator<void> {
  let off = 0;
  let carry = '';
  while (off < upTo) {
    const { text, next } = readFrom(file, off, Math.min(1 << 20, upTo - off));
    if (next <= off) break;
    off = next;
    const lines = (carry + text).split('\n');
    carry = lines.pop() ?? '';
    if (carry.length > 64 * 1024) carry = '';
    for (const line of lines) {
      const r = parseLine(line);
      if (r) t.add(r, at);
    }
    yield;
  }
}

/**
 * Fixes one record made under the old rule: null when it needs nothing (it has `repeated`, or no metrics, or it is
 * a copy of a run kept on another machine), else the tracker as it is now, its metrics and series saved.
 * `local`: the run's log is on this computer. At once, for a run going on (its log up to 32 MB).
 */
export function repairRecord(db: DB, r: RunRecord, local: boolean): Tracker | null {
  const steps = repairing(db, r, local, MAX_LOG_NOW);
  for (;;) {
    const s = steps.next();
    if (s.done) return s.value;
  }
}

/** As repairRecord, for an ended run in the background: a megabyte of its log at a time (up to 256 MB). */
export async function repairRecordSoon(db: DB, r: RunRecord, local: boolean): Promise<Tracker | null> {
  const steps = repairing(db, r, local, MAX_LOG);
  for (;;) {
    const s = steps.next();
    if (s.done) return s.value;
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function* repairing(db: DB, r: RunRecord, local: boolean, maxLog: number): Generator<void, Tracker | null> {
  if (!r.metrics || r.metrics.repeated || r.remote) return null;
  const at = r.outputAt ?? r.startedAt ?? Date.now();
  if (Object.keys(r.metrics.last).length >= MAX_METRICS && local) {
    const folder = r.folder ?? runFolder(r.id);
    const log = files(folder).log;
    let size = -1;
    try {
      size = fs.statSync(log).size;
    } catch {}
    if (size >= 0 && size <= maxLog) {
      const off = offsetsOf(db, r.id);
      const t = new Tracker(r.better);
      yield* feed(t, log, Math.min(off.log, size), at);
      if (r.metricsFile) yield* feed(t, path.resolve(r.cwd, r.metricsFile), off.file, at);
      // What the reading found is for the record, not for the agent on call to be told of.
      t.nan = [];
      t.diverged = [];
      // A log that gives nothing (written over, moved) leaves the record as it is.
      if (Object.keys(t.last).length) {
        updateRun(db, r.id, { metrics: t.snapshot() });
        saveSeries(db, r.id, t.series);
        return t;
      }
    }
  }
  const series = seriesOf(db, r.id);
  const metrics = { ...r.metrics, repeated: Object.keys(r.metrics.last).filter((k) => (series[k]?.length ?? 0) >= 2) };
  updateRun(db, r.id, { metrics });
  return new Tracker(r.better, { metrics, series });
}
