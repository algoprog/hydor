// What the page's routes and the agents' tools do with experiments, beyond the queue itself: one run as the page
// reads it (its record, events, metrics' series and the end of its log; through its machine when it is kept on
// another), following a log, sweeps, results tables (made, kept, worked out again, put into a LaTeX document of
// the saved pages), and the runs of every machine for the list.
import fs from 'node:fs';
import path from 'node:path';
import { ACTIVE, betterOf, type MetricSeries, type ResultsColumn, type ResultsTable, type ResultsTableSpec, type RunChain, type RunFiles, type RunRecord, type RunRef, type SweepSpec } from '../../shared/experiments.ts';
import type { TexDoc } from '../../shared/latex.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import type { Deps } from '../features/types.ts';
import { internalHeaders } from '../internal.ts';
import { files } from './local.ts';
import { readFrom, tailLines, tidyLog } from './metrics.ts';
import { agentBaseEnv } from '../env.ts';
import { codeReader, differences, enough, makeCopy, manifestOf, NoCopy, repoOf } from './code.ts';
import { cleanJob, metricsNow, seriesNow, submit, takesCode, type Place, placeOf } from './queue.ts';
import { getRun, getRunWithEvents, getTable, listRuns, newId, runFiles, runFolder, saveSweep, saveTable, systemSeriesOf, withAttempts, updateRun, workOut, type RunQuery, type RunInfo } from './records.ts';
import { machinesRuns, remoteMachine } from './remote.ts';
import { expandSweep, fillCommand, placeholders, settingsLine, type Value } from './sweeps.ts';
import { insertTable } from './tables.ts';

export interface RunView {
  run: RunRecord;
  series: MetricSeries;
  log: string;
  /** The log's size in bytes: following it asks for what comes after. */
  logSize: number;
  /** What it used over time, minutes since it started on the x axis (this computer's runs; usage.ts). */
  system?: MetricSeries;
  /** An ended run: what its own folder holds besides the app's own files (deleting the run deletes them). */
  folderFiles?: RunFiles;
  /** Where it stands among the attempts at the same thing: the one before it and the one that took its place. */
  chain?: RunChain;
}

const mustRun = (d: Deps, id: string): RunRecord => {
  const r = getRunWithEvents(d.db, id);
  if (!r) throw new HttpError(404, 'There is no such run');
  return r;
};

const refOf = (d: Deps, id: string): RunRef | undefined => {
  const r = getRun(d.db, id);
  return r ? { id: r.id, ...(r.name ? { name: r.name } : {}), status: r.status, ...(r.why ? { why: r.why } : {}), ...(r.exitCode !== undefined ? { exitCode: r.exitCode } : {}), ...(r.firstError ? { error: r.firstError.text.slice(0, 200) } : {}) } : undefined;
};

/** The attempts either side of a run that is in a chain. */
function chainOf(d: Deps, r: RunRecord): { chain?: RunChain } {
  if (!r.retryOf && !r.replacedBy) return {};
  const previous = r.retryOf ? refOf(d, r.retryOf) : undefined;
  const next = r.replacedBy ? refOf(d, r.replacedBy) : undefined;
  return { chain: { attempt: r.attempt ?? 1, ...(previous ? { previous } : {}), ...(next ? { next } : {}) } };
}

/** One run as the page shows it; a copy of another machine's run is read there. */
export async function runView(d: Deps, id: string, lines = 300): Promise<RunView> {
  const r = withAttempts(d.db, [mustRun(d, id)])[0];
  if (r.remote) {
    const m = remoteMachine(r.remote.machine);
    if (!m) return { run: r, series: {}, log: '', logSize: 0, ...chainOf(d, r) };
    const there = await m.call<RunView>('GET', `/api/experiments/runs/${r.remote.id}?lines=${lines}`, 15_000).catch((e) => {
      throw new HttpError(502, `${m.name} did not answer: ${(e as Error).message}`);
    });
    // Its files are that machine's: deleting the copy here leaves them.
    const { folderFiles: _theirs, chain: _chain, ...view } = there;
    // What was said of it here (its note, star, archiving) and its place among the attempts are this computer's.
    const { note: _n, noteBy: _nb, starredAt: _s, archivedAt: _a, retryOf: _ro, replacedBy: _rb, attempt: _at, from: _f, ...run } = there.run;
    const mine = Object.fromEntries((['note', 'noteBy', 'starredAt', 'archivedAt', 'retryOf', 'replacedBy', 'attempt', 'from'] as const).flatMap((k) => (r[k] === undefined ? [] : [[k, r[k]]])));
    return { ...view, run: { ...run, ...mine, id: r.id, where: r.where, remote: r.remote, name: r.name, group: r.group }, ...chainOf(d, r) };
  }
  const t = lines > 0 ? tailLines(files(r.folder ?? runFolder(r.id)).log, Math.min(lines, 5000)) : { text: '', size: 0 };
  const system = systemSeriesOf(d.db, r.id);
  const folderFiles = ACTIVE.includes(r.status) ? undefined : await runFiles([r.id]);
  // Read after the log, so that they are no further behind than it.
  const metrics = metricsNow(d, r);
  return { run: { ...r, ...(metrics ? { metrics } : {}) }, series: seriesNow(d, r.id), log: t.text, logSize: t.size, ...(Object.keys(system).length ? { system } : {}), ...(folderFiles ? { folderFiles } : {}), ...chainOf(d, r) };
}

/**
 * The metrics' series of runs by id, for the page's charts and sparklines: this computer's runs as they are (live while
 * they run), a copy of another machine's run as that machine has it (one that cannot be read is left out), unknown ids left out.
 */
export async function seriesFor(d: Deps, ids: string[]): Promise<Record<string, MetricSeries>> {
  const out: Record<string, MetricSeries> = {};
  await Promise.all(
    ids.map(async (id) => {
      const r = getRun(d.db, id);
      if (!r) return;
      if (!r.remote) {
        out[id] = seriesNow(d, id);
        return;
      }
      try {
        out[id] = (await runView(d, id, 0)).series ?? {};
      } catch {
        /* the machine did not answer: left out */
      }
    }),
  );
  return out;
}

/** The log after `from` (bytes), for following it while it runs. */
export async function logAfter(d: Deps, id: string, from: number): Promise<{ text: string; next: number; size: number }> {
  const r = mustRun(d, id);
  if (r.remote) {
    const m = remoteMachine(r.remote.machine);
    if (!m) return { text: '', next: from, size: from };
    return m.call('GET', `/api/experiments/runs/${r.remote.id}/log?from=${from}`, 15_000);
  }
  const x = readFrom(files(r.folder ?? runFolder(r.id)).log, Math.max(0, from), 256 * 1024);
  return { text: tidyLog(x.text), next: x.next, size: x.size };
}

/** The patch of the changes it ran with (null without one). */
export async function patchOf(d: Deps, id: string): Promise<string | null> {
  const r = mustRun(d, id);
  if (r.remote) {
    const m = remoteMachine(r.remote.machine);
    return m ? (await m.call<{ patch: string | null }>('GET', `/api/experiments/runs/${r.remote.id}/patch`, 15_000)).patch : null;
  }
  if (!r.patchPath) return null;
  try {
    return fs.readFileSync(r.patchPath, 'utf8').slice(0, 3 * 1024 * 1024);
  } catch {
    return null;
  }
}

/** The runs for the list: this computer's (and its copies of runs elsewhere), and with `everywhere` every connected machine's. */
export async function runsList(d: Deps, q: RunQuery, everywhere: boolean): Promise<RunRecord[]> {
  const mine = withAttempts(d.db, listRuns(d.db, q));
  // A night is this computer's (in the person's time zone as it knows it): another machine tells of its own.
  if (!everywhere || q.night) return mine;
  const params = new URLSearchParams();
  if (q.status?.length) params.set('status', q.status.join(','));
  if (q.group) params.set('group', q.group);
  if (q.q) params.set('q', q.q);
  params.set('limit', String(Math.min(q.limit ?? 200, 200)));
  const copied = new Set(listRuns(d.db, { limit: 5000 }).flatMap((r) => (r.remote ? [r.remote.id] : [])));
  const others = await machinesRuns(params.toString(), copied);
  return [...mine, ...others].sort((a, b) => b.createdAt - a.createdAt).slice(0, q.limit ?? 200);
}

// ---- a run's code --------------------------------------------------------------------------------------------

/** Whether a folder is in a git repository, so that a run queued from it keeps its code. */
export async function keepsCode(cwd: string): Promise<{ git: boolean }> {
  const dir = path.resolve(cwd.replace(/^~(?=$|\/)/, config.home));
  return { git: !!cwd && fs.existsSync(dir) && !!(await repoOf(dir)) };
}

/**
 * A run's own code against its folder now: whether they differ (and in which files), and whether its own can be put
 * back, so that Run again can offer it.
 */
export async function codeStatus(d: Deps, id: string): Promise<{ own: boolean; differs: boolean; changed: string[] }> {
  const none = { own: false, differs: false, changed: [] };
  const r = mustRun(d, id);
  if (r.remote || !takesCode({ where: r.where }) || !fs.existsSync(r.cwd)) return none;
  const m = await manifestOf(r, r.folder ?? runFolder(r.id));
  if (!m) return none;
  const env = { ...agentBaseEnv(), ...r.env };
  const changed = await differences(m, r.cwd, env);
  const own = await enough(m, env).then(
    () => true,
    () => false,
  );
  return { own, differs: changed.length > 0, changed: changed.slice(0, 20) };
}

const making = new Map<string, Promise<{ dir: string }>>();

/**
 * The folder with a run's code, to look at: the copy it runs from while it goes; else one made from what was kept (under
 * code-view/, beside what stayed of its copy, which is left as the run left it; made once, then used again).
 */
export function codeFolder(d: Deps, id: string): Promise<{ dir: string }> {
  let p = making.get(id);
  if (!p) {
    p = (async () => {
      const r = mustRun(d, id);
      if (r.remote || !takesCode({ where: r.where })) throw new HttpError(400, 'Its code is kept only for a run on this computer (open it on the machine that ran it)');
      if (r.status === 'queued' || r.status === 'waiting' || r.status === 'starting') throw new HttpError(409, 'It has not started yet');
      for (const dir of [ACTIVE.includes(r.status) ? r.codeDir : undefined, r.codeView]) if (dir && fs.existsSync(dir)) return { dir };
      const folder = r.folder ?? runFolder(r.id);
      const m = await manifestOf(r, folder);
      if (!m) throw new HttpError(404, 'No code of this run can be put together: its folder is not in git, or not all of it was kept');
      const copy = await makeCopy(m, folder, { link: false, env: { ...agentBaseEnv(), ...r.env } }).catch((e) => {
        throw e instanceof NoCopy ? new HttpError(409, `Its code could not be put together: ${e.message}`) : e;
      });
      updateRun(d.db, id, { info: { codeView: copy.cwd } });
      return { dir: copy.cwd };
    })().finally(() => making.delete(id));
    making.set(id, p);
  }
  return p;
}

// ---- sweeps --------------------------------------------------------------------------------------------------

/** Starts a sweep: its runs, one per combination of the settings' values, as one experiment (group). */
export async function startSweep(d: Deps, b: Record<string, any>, o: { cwd?: string; startedBy?: RunInfo['startedBy'] } = {}): Promise<{ sweep: SweepSpec; runs: RunRecord[] }> {
  const group = typeof b.group === 'string' ? b.group.trim().slice(0, 120) : '';
  if (!group) throw new HttpError(400, 'Give the sweep a name for its experiment (group): its runs are kept and compared under it');
  const command = typeof b.command === 'string' ? b.command.trim() : '';
  if (!command) throw new HttpError(400, 'Give the command, with a {name} placeholder for each setting, like python train.py --lr {lr}');
  if (!b.params || typeof b.params !== 'object' || Array.isArray(b.params)) throw new HttpError(400, 'params: each setting with its values, like { "lr": [0.001, 0.0003], "batch": [32, 64] }');
  const params: Record<string, Value[]> = {};
  for (const [k, v] of Object.entries(b.params as Record<string, unknown>)) {
    if (!/^[A-Za-z_][\w.-]{0,79}$/.test(k)) throw new HttpError(400, `${k}: a setting's name is a word (letters, digits, _ . -)`);
    const vs = (Array.isArray(v) ? v : [v]).filter((x): x is Value => typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean');
    if (!vs.length) throw new HttpError(400, `${k} has no values: give a list, like [1, 2, 3]`);
    params[k] = vs.slice(0, 100);
  }
  const holes = placeholders(command);
  const missing = Object.keys(params).filter((k) => !holes.includes(k));
  if (missing.length) throw new HttpError(400, `The command has no ${missing.map((k) => `{${k}}`).join(', ')}: put each where its value goes, like --${missing[0]} {${missing[0]}}`);
  const unknown = holes.filter((h) => !(h in params) && !(h === 'seed' && b.seed !== undefined));
  if (unknown.length)
    throw new HttpError(400, `The command has ${unknown.map((h) => `{${h}}`).join(', ')}, which ${unknown.length === 1 ? 'is not a setting' : 'are not settings'} of the sweep: give values for ${unknown.length === 1 ? 'it' : 'them'} in params`);
  const mode = b.mode === 'random' ? 'random' : 'grid';
  const maxRuns = Number(b.maxRuns) > 0 ? Math.floor(Number(b.maxRuns)) : undefined;
  let combos: Record<string, Value>[];
  try {
    combos = expandSweep(params, mode, maxRuns);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  let earlyStop: SweepSpec['earlyStop'];
  if (b.earlyStop && typeof b.earlyStop === 'object' && typeof b.earlyStop.metric === 'string' && b.earlyStop.metric.trim()) {
    const metric = b.earlyStop.metric.trim().slice(0, 100);
    earlyStop = { metric, better: b.earlyStop.better === 'max' || b.earlyStop.better === 'min' ? b.earlyStop.better : betterOf(metric), ...(Number(b.earlyStop.afterSteps) > 0 ? { afterSteps: Number(b.earlyStop.afterSteps) } : {}) };
  }
  const id = newId('s');
  const sweep: SweepSpec = { id, group, command, params, mode, ...(maxRuns ? { maxRuns } : {}), ...(earlyStop ? { earlyStop } : {}), createdAt: Date.now() };
  // Every run checked before any is made, so a mistake starts none.
  const specs = [];
  for (const c of combos) {
    const { params: _p, mode: _m, maxRuns: _x, earlyStop: _e, name: given, ...rest } = b;
    // A name given is a template, its {name} placeholders filled as the command's are.
    const name = typeof given === 'string' && given.trim() ? fillCommand(given.trim(), { ...(b.seed !== undefined ? { seed: b.seed } : {}), ...c }, false) : `${group} · ${settingsLine(c)}`;
    const { seed: _swept, ...others } = c;
    specs.push(await cleanJob(d.db, { ...rest, command: fillCommand(command, c), seedTemplate: fillCommand(command, others), params: c, group, name: name.slice(0, 120), sweep: id }, { cwd: o.cwd }));
  }
  saveSweep(d.db, sweep);
  const runs: RunRecord[] = [];
  // Its runs come from one folder at one moment: read once for all of them.
  const code = codeReader(specs.filter(takesCode));
  for (const s of specs) runs.push(await submit(d, s, { startedBy: o.startedBy, code }));
  return { sweep, runs };
}

// ---- results tables ------------------------------------------------------------------------------------------------

/** A table's spec as given, checked: at least one column, rows by experiment, command or setting, the test and its level. */
export function cleanTableSpec(b: Record<string, any>): ResultsTableSpec {
  const runs = Array.isArray(b.runs) ? [...new Set(b.runs.filter((x: unknown): x is string => typeof x === 'string' && /^[a-z0-9]{4,32}$/.test(x)))].slice(0, 2000) : undefined;
  const group = typeof b.group === 'string' && b.group.trim() ? b.group.trim().slice(0, 120) : undefined;
  if (!runs?.length && !group) throw new HttpError(400, 'Name the runs (their ids) or an experiment (group) whose finished runs make the table');
  const cols: ResultsColumn[] = (Array.isArray(b.columns) ? b.columns : [])
    .map((c: unknown) => (typeof c === 'string' ? { metric: c } : c))
    .filter((c: any) => c && typeof c.metric === 'string' && c.metric.trim())
    .slice(0, 20)
    .map((c: any): ResultsColumn => {
      const metric = c.metric.trim().slice(0, 100);
      return {
        metric,
        better: c.better === 'max' || c.better === 'min' ? c.better : betterOf(metric),
        ...(typeof c.label === 'string' && c.label.trim() ? { label: c.label.trim().slice(0, 60) } : {}),
        ...(Number.isInteger(c.digits) && c.digits >= 0 && c.digits <= 8 ? { digits: c.digits } : {}),
        ...(c.value === 'best' ? { value: 'best' as const } : {}),
        ...(Number(c.scale) > 0 && Number(c.scale) !== 1 ? { scale: Number(c.scale) } : {}),
      };
    });
  if (!cols.length) throw new HttpError(400, 'columns: at least one metric, like [{ "metric": "accuracy", "better": "max" }]');
  const rows = b.rows === 'command' ? 'command' : typeof b.rows === 'string' && /^param:[\w.@/-]{1,80}$/.test(b.rows) ? (b.rows as `param:${string}`) : 'group';
  // A row by command has the command itself as its key.
  const keyMost = rows === 'command' ? 20_000 : 120;
  const spec: ResultsTableSpec = { ...(runs?.length ? { runs } : { group }), rows, columns: cols };
  if (typeof b.baseline === 'string' && b.baseline.trim()) spec.baseline = b.baseline.trim().slice(0, keyMost);
  if (['welch', 'paired', 'bootstrap', 'none'].includes(b.test)) spec.test = b.test;
  if (Number(b.alpha) > 0 && Number(b.alpha) < 0.5) spec.alpha = Number(b.alpha);
  if (b.correction === 'none') spec.correction = 'none';
  if (typeof b.caption === 'string' && b.caption.trim()) spec.caption = b.caption.trim().slice(0, 500);
  if (b.labels && typeof b.labels === 'object') {
    const labels = Object.fromEntries(
      Object.entries(b.labels as Record<string, unknown>)
        .filter(([k, v]) => k.length <= keyMost && typeof v === 'string' && v.trim())
        .map(([k, v]) => [k, String(v).trim().slice(0, 80)]),
    );
    if (Object.keys(labels).length) spec.labels = labels;
  }
  return spec;
}

/** Makes a table and keeps it (so it can be checked again later, and found by its marker). */
export function makeTable(d: Deps, b: Record<string, any>): ResultsTable {
  const t = workOut(d.db, cleanTableSpec(b));
  if (!t.rows.length) throw new HttpError(400, t.notes?.join(' ') || 'None of those runs has ended with these metrics yet');
  saveTable(d.db, t);
  return t;
}

async function texOf(d: Deps, page: string): Promise<{ doc: TexDoc; version: number; title: string }> {
  const r = await d.app.inject({ method: 'GET', url: `/api/pages/${encodeURIComponent(page)}`, headers: internalHeaders() });
  if (r.statusCode === 404) throw new HttpError(404, 'That document is no longer there');
  const j = r.json() as { page?: { kind?: string; version: number; title: string }; model?: TexDoc; error?: string };
  if (r.statusCode >= 400 || !j.page) throw new HttpError(r.statusCode, j.error ?? 'The document could not be read');
  if (j.page.kind !== 'tex' || !j.model) throw new HttpError(400, 'That is not a LaTeX document');
  return { doc: j.model, version: j.page.version, title: j.page.title };
}

/**
 * Puts a table into a file of a saved LaTeX document, as a new version of it (as the editor saves): in place
 * of the table it made before (by its marker), else before \end{document} or at the end of the file.
 */
export async function putInLatex(d: Deps, tableId: string, page: string, file = 'main.tex'): Promise<{ replaced: boolean; version: number; title: string }> {
  const t = getTable(d.db, tableId);
  if (!t) throw new HttpError(404, 'There is no such table');
  const { doc, version, title } = await texOf(d, page);
  const isMain = file === 'main.tex';
  const f = isMain ? null : doc.files.find((x) => x.name === file);
  if (!isMain && !f) throw new HttpError(404, `The document has no file ${file}`);
  const { text, replaced } = insertTable(isMain ? doc.main : f!.text, t);
  const next: TexDoc = isMain ? { ...doc, main: text } : { ...doc, files: doc.files.map((x) => (x.name === file ? { ...x, text } : x)) };
  const r = await d.app.inject({ method: 'POST', url: `/api/pages/${encodeURIComponent(page)}/versions`, headers: { ...internalHeaders(), 'content-type': 'application/json' }, payload: JSON.stringify({ model: next, base: version }) });
  const j = r.json() as { page?: { version: number }; error?: string };
  if (r.statusCode >= 400 || !j.page) throw new HttpError(r.statusCode, j.error ?? 'The document could not be saved');
  return { replaced, version: j.page.version, title };
}

/** Whether a place is this computer. */
export const isHere = (p: Place) => p.kind === 'local';

/** The runs still going, of those named. */
export const stillGoing = (d: Deps, ids: string[]) => ids.map((id) => getRun(d.db, id)).filter((r): r is RunRecord => !!r && ACTIVE.includes(r.status));

export { placeOf };
