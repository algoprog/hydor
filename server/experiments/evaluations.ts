// Evaluations: how a project keeps score. One command and one number, sealed, so every run and every agent is
// scored the same way. Sealing hashes the files the evaluation protects (and the final test's held-out folder) and
// keeps copies of the small ones; a score is refused while the folder's files differ, and is worked out by the app
// from its own runs of the sealed command, one for each seed, checked again as each starts and when the last ends.
// A git worktree of the same repository can be scored too (the files git does not track are lent to it as links),
// and every other run in those folders is marked with whether the files were as sealed when it started.
// shared/evaluations.ts has the shapes; the routes are in index.ts and the agents' tools in tools.ts.
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HELD_OUT, type Verdict, type EvalChange, type EvalFolder, type EvalRestored, type EvalScore, type EvalSpec, type Evaluation, type EvaluationListed, type ScoreKind, type ScoreStatus, type SealChange, type SealState } from '../../shared/evaluations.ts';
import { ACTIVE, type RunRecord } from '../../shared/experiments.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import type { DB } from '../db.ts';
import { agentBaseEnv } from '../env.ts';
import type { Deps } from '../features/types.ts';
import { git } from '../git.ts';
import { captureGit, localShell } from './capture.ts';
import { parseLine } from './metrics.ts';
import { cleanJob, depsOf, ended, stopRun, submit, tellRuns, tick } from './queue.ts';
import { deleteInfo, deleteRun, getRun, isScoringRun, newId, RUNS_ROOT, tables, updateRun, type RunInfo } from './records.ts';
import { mean, std, welch } from './stats.ts';
import { fillCommand, placeholders } from './sweeps.ts';

/** The most one seal takes, what is kept of it and shown of what changed (a test makes them small). */
export const limits = {
  files: 20_000,
  bytes: 20 * 1024 ** 3,
  /** A copy is kept of each sealed file up to this size, and of this much in all for a seal. */
  copyFile: 1024 ** 2,
  copies: 50 * 1024 ** 2,
  /** Changed files listed. */
  listed: 50,
  diffLines: 200,
  /** Entries looked through for what an entry names, at the most. */
  walked: 200_000,
};

/**
 * How scores compare with the baseline's. With 3 or more values on both sides, Welch's t-test: below 0.05 it is
 * better or worse (by the direction `better` says), else the same. With fewer there is no p, and the sign of the
 * difference of the means says it.
 */
export function verdictOf(values: number[], baseValues: number[], better: 'higher' | 'lower'): { delta: number; p: number | null; verdict: Verdict } {
  const base = mean(baseValues);
  let delta = mean(values) - base;
  // A difference that is only the rounding of the means is none.
  if (Math.abs(delta) <= 1e-12 * Math.max(1, Math.abs(base))) delta = 0;
  const tested = values.length >= 3 && baseValues.length >= 3;
  const p = tested ? welch(values, baseValues).p : null;
  const differs = tested ? p !== null && p < 0.05 : true;
  const verdict: Verdict = !differs || delta === 0 || !Number.isFinite(delta) ? 'same' : delta > 0 === (better === 'higher') ? 'better' : 'worse';
  return { delta, p, verdict };
}

const EVALS_ROOT = path.join(RUNS_ROOT, 'evals');
const sealFolder = (id: string, n: number) => path.join(EVALS_ROOT, id, String(n));

/** The tag of a scoring run, and the group of an evaluation's runs. */
export const EVAL_TAG = 'evaluation';
export const evalGroup = (id: string) => `eval-${id}`;

/** Scores that have ended, by id (the tool waits on it). */
export const scored = new EventEmitter();
scored.setMaxListeners(200);

// ---- the spec, checked --------------------------------------------------------------------------------------

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const given = (v: unknown) => v !== undefined && v !== null && v !== '';

function number(v: unknown, lo: number, hi: number, what: string): number | undefined {
  if (!given(v)) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < lo || n > hi) throw new HttpError(400, `${what}: a number from ${lo} to ${hi}`);
  return n;
}

const expandHome = (p: string) => p.replace(/^~(?=$|\/)/, config.home);
const isFolder = (p: string) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};
const real = (p: string) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
};
/** Whether `p` is `root` or under it. */
const inside = (p: string, root: string) => {
  const rel = path.relative(root, p);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
};
const slashes = (p: string) => p.split(path.sep).join('/');

export function cleanSeeds(v: unknown): number[] {
  const list = Array.isArray(v) ? v : [v];
  const out = [...new Set(list.map(Number))];
  if (!list.length || list.some((x) => !given(x) || !Number.isInteger(Number(x)) || Number(x) < -(2 ** 31) || Number(x) > 2 ** 32) || out.length > 10) throw new HttpError(400, 'Seeds: 1 to 10 whole numbers, like 1, 2, 3');
  return out;
}

/** One protected path as given, tidied: relative to the folder, a folder ending in "/". */
function cleanEntry(raw: unknown, cwd: string): string {
  let p = typeof raw === 'string' ? raw.trim().replace(/\\/g, '/') : '';
  p = p.replace(/\/{2,}/g, '/').replace(/^(\.\/)+/, '');
  const segs = p.replace(/\/$/, '').split('/');
  if (!p || path.isAbsolute(p) || /^[A-Za-z]:/.test(p) || segs.some((s) => s === '..' || s === '.' || s === '') || segs[0] === '.git' || p.length > 500)
    throw new HttpError(400, `“${String(raw).slice(0, 80)}” is not a file or folder inside the evaluation’s folder: write it from there, like eval.py or data/test/`);
  if (!p.endsWith('/') && !p.includes('*') && isFolder(path.join(cwd, p))) return `${p}/`;
  return p;
}

/** An evaluation as given, checked and tidied. */
export function cleanSpec(b: Record<string, any>): EvalSpec {
  const name = text(b.name, 80);
  if (!name) throw new HttpError(400, 'Give the evaluation a name');
  if (!text(b.cwd, 4000)) throw new HttpError(400, 'Which folder does the evaluation run in?');
  const cwd = path.resolve(expandHome(text(b.cwd, 4000)));
  if (!isFolder(cwd)) throw new HttpError(400, `The folder ${cwd} is not there`);
  const command = typeof b.command === 'string' ? b.command.trim() : '';
  if (!command) throw new HttpError(400, 'Give the command that prints the number, like python eval.py --seed {seed}');
  if (command.length > 20_000) throw new HttpError(400, 'The command is at most 20,000 characters: put a long script in a file and run that');
  const metric = text(b.metric, 100);
  if (!metric) throw new HttpError(400, 'Which number counts: the name the command prints it under, like accuracy');
  if (parseLine(JSON.stringify({ [metric]: 1 }))?.values[metric] !== 1) throw new HttpError(400, `The app reads “${metric}” in the output as bookkeeping, not as a result: have the command print the number under another name`);
  if (b.better !== 'higher' && b.better !== 'lower') throw new HttpError(400, 'Say which way is better for the number: higher or lower');
  const seeds = !given(b.seeds) || (Array.isArray(b.seeds) && !b.seeds.length) ? [1, 2, 3] : cleanSeeds(b.seeds);
  const named = (Array.isArray(b.protect) ? b.protect : typeof b.protect === 'string' ? [b.protect] : []).filter((p: unknown) => typeof p === 'string' && p.trim());
  if (!named.length) throw new HttpError(400, 'Name at least one file or folder to protect: the scorer, and what it scores against');
  if (named.length > 200) throw new HttpError(400, 'At most 200 protected paths: name folders instead of their files');
  const protect = [...new Set<string>(named.map((p: unknown) => cleanEntry(p, cwd)))];
  const spec: EvalSpec = { name, cwd, command, metric, better: b.better, seeds, protect };

  if (b.final && typeof b.final === 'object') {
    const test = typeof b.final.command === 'string' ? b.final.command.trim() : '';
    const held = text(b.final.heldOut, 4000);
    if (held && !test) throw new HttpError(400, 'Give the final test’s command, which reads the held-out folder');
    if (test.length > 20_000) throw new HttpError(400, 'The final test’s command is at most 20,000 characters');
    if (test) {
      spec.final = { command: test };
      if (held) {
        const dir = expandHome(held);
        if (!path.isAbsolute(dir)) throw new HttpError(400, 'Give the held-out folder as a full path');
        if (!isFolder(dir)) throw new HttpError(400, `The folder ${dir} is not there`);
        if (inside(real(dir), real(cwd)) || inside(real(cwd), real(dir))) throw new HttpError(400, 'The held-out folder is kept outside the evaluation’s folder, so work there does not come across it');
        spec.final.heldOut = path.resolve(dir);
      }
    }
  }

  const gpus = number(b.gpus, 0, 16, 'GPUs');
  if (gpus !== undefined) spec.gpus = Math.round(gpus);
  const mem = number(b.gpuMemGb, 0, 1024, 'Free memory per GPU (GB)');
  if (mem) spec.gpuMemGb = mem;
  const hours = number(b.hours, 0, 24 * 60, 'Hours');
  if (hours) spec.hours = hours;
  // The seal is of the files on this computer: a run elsewhere would read files nothing has checked.
  if (text(b.where, 80) && text(b.where, 80) !== 'local') throw new HttpError(400, 'An evaluation runs on this computer: the app can only check its files here');
  if (b.env && typeof b.env === 'object' && !Array.isArray(b.env)) {
    const env = Object.fromEntries(
      Object.entries(b.env as Record<string, unknown>)
        .filter(([k, v]) => /^[A-Za-z_][A-Za-z0-9_]{0,99}$/.test(k) && !k.startsWith('HYDOR_') && (typeof v === 'string' || typeof v === 'number'))
        .slice(0, 40)
        .map(([k, v]) => [k, String(v).slice(0, 4000)]),
    );
    if (Object.keys(env).length) spec.env = env;
  }
  return spec;
}

// ---- the files a protected path names -------------------------------------------------------------------------

/** Folders and files that tools make as they run, and git's own: never sealed, never counted as added. */
const SKIPPED = new Set(['.git', '__pycache__', '.pytest_cache', '.ipynb_checkpoints', '.DS_Store']);

const tooMuch = () =>
  new HttpError(400, `That is too much to seal (more than ${limits.files.toLocaleString('en-US')} files or ${Math.round(limits.bytes / 1024 ** 3)} GB): name fewer or smaller folders`);

const lstat = (p: string) => fs.promises.lstat(p).catch(() => null);

/** A pattern of protected paths as a regular expression: "*" within a name, "**" across folders, a last "/" for all under it. */
function patternRe(pattern: string): RegExp {
  const folder = pattern.endsWith('/');
  const p = folder ? pattern.slice(0, -1) : pattern;
  let re = '';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c !== '*') re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    else if (p[i + 1] !== '*') re += '[^/]*';
    else if (p[i + 2] === '/') {
      re += '(?:[^/]*/)*';
      i += 2;
    } else {
      re += '.*';
      i += 1;
    }
  }
  return new RegExp(`^${re}${folder ? '/.*' : ''}$`);
}

/** Whether the evaluation protects a path (relative to its home): one its protected paths name, or one it sealed. */
export function protectsPath(db: DB, ev: Evaluation, rel: string): boolean {
  if (ev.protect.some((p) => patternRe(p).test(rel) || (!p.includes('*') && rel.startsWith(`${p.replace(/\/$/, '')}/`)))) return true;
  tables(db);
  return !!db.prepare('select 1 from exp_eval_files where eval = ? and seal = ? and path = ?').get(ev.id, ev.seal.n, rel);
}

/** The part of an entry before its first "*". */
const literalOf = (entry: string) => {
  const segs = entry.replace(/\/$/, '').split('/');
  const star = segs.findIndex((s) => s.includes('*'));
  return (star < 0 ? segs : segs.slice(0, star)).join('/');
};

/**
 * The links `rel` goes through that lead out of `root`: the first part of it that is such a link, and every link
 * after it (itself included). A protected path is followed through them (data is very often a link to another disk),
 * and each one's own text is sealed too, under its path with "/" first, so that sending it elsewhere shows.
 */
async function linksOut(root: string, rel: string): Promise<string[]> {
  const top = real(root);
  const segs = rel.split('/');
  const out: string[] = [];
  for (let i = 1; i <= segs.length; i++) {
    const part = segs.slice(0, i).join('/');
    const st = await lstat(path.join(root, part));
    if (!st) break;
    if (!st.isSymbolicLink()) continue;
    if (!out.length) {
      const to = await fs.promises.realpath(path.join(root, part)).catch(() => null);
      if (to && inside(to, top)) continue;
    }
    out.push(part);
  }
  return out;
}

/** The links a seal followed out of the folder, from the rows of their texts. */
const followed = (rows: { path: string }[]) => new Set(rows.filter((r) => r.path.startsWith('/')).map((r) => r.path.slice(1)));
/** Whether `rel`, or a folder on the way to it, is one of these paths. */
const through = (paths: Set<string>, rel: string) => rel.split('/').some((_, i, segs) => paths.has(segs.slice(0, i + 1).join('/')));

/** The file a link inside the folder leads to, when it is also inside it: sealed too, or changing it would not show. */
async function targetInside(root: string, rel: string): Promise<string | null> {
  const to = await fs.promises.realpath(path.join(root, rel)).catch(() => null);
  const top = real(root);
  if (!to || !inside(to, top) || !(await fs.promises.stat(to).catch(() => null))?.isFile()) return null;
  return slashes(path.relative(top, to));
}

/** Whether a folder is a worktree git knows (its .git file and git's record of it point at each other): not part of what is sealed around it. */
async function isWorktree(dir: string): Promise<boolean> {
  const dot = path.join(dir, '.git');
  const said = /^gitdir:\s*(.+?)\s*$/m.exec(await fs.promises.readFile(dot, 'utf8').catch(() => ''))?.[1];
  if (!said) return false;
  const back = (await fs.promises.readFile(path.join(path.resolve(dir, said), 'gitdir'), 'utf8').catch(() => '')).trim();
  return !!back && real(back) === real(dot);
}

async function walk(root: string, rel: string, depth: number, out: Set<string>, count: { n: number }, top = true): Promise<void> {
  const entries = await fs.promises.readdir(path.join(root, rel), { withFileTypes: true }).catch(() => []);
  if (!top && entries.some((e) => e.name === '.git' && e.isFile()) && (await isWorktree(path.join(root, rel)))) return;
  for (const e of entries) {
    if (SKIPPED.has(e.name)) continue;
    if (++count.n > limits.walked) throw tooMuch();
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (depth > 1) await walk(root, r, depth - 1, out, count, false);
    } else if (e.isFile()) out.add(r);
    else if (e.isSymbolicLink()) {
      out.add(r);
      const to = await targetInside(root, r);
      if (to) out.add(to);
    }
  }
}

/**
 * What a protected path names under `root`, as paths relative to it: files and links, and with "/" first each link
 * out of the folder that the path itself goes through. Links met deeper inside a folder are not followed.
 */
async function expand(root: string, entry: string, count = { n: 0 }): Promise<string[]> {
  const plain = !entry.includes('*');
  const folder = entry.endsWith('/');
  const base = literalOf(entry);
  const away = base ? await linksOut(root, base) : [];
  const links = away.map((p) => `/${p}`);
  const at = path.join(root, base);
  const own = await lstat(at);
  if (!own) return links;
  // The path's own links are followed, inside the folder or out of it.
  const is = await fs.promises.stat(at).catch(() => null);
  if (plain && !folder) {
    if (own.isFile()) return [...links, base];
    if (own.isSymbolicLink() && is?.isFile()) {
      // Out of the folder: the file behind it. Inside it: the link, and the file it leads to.
      const to = away.includes(base) ? null : await targetInside(root, base);
      return [...links, base, ...(to ? [to] : [])];
    }
  }
  if (!is?.isDirectory()) return links;
  const found = new Set<string>();
  const star = entry.replace(/\/$/, '').split('/').findIndex((s) => s.includes('*'));
  const depth = folder || entry.includes('**') || star < 0 ? Infinity : entry.split('/').length - star;
  await walk(root, base, depth, found, count);
  if (plain) return [...links, ...found];
  const re = patternRe(entry);
  return [...links, ...[...found].filter((f) => re.test(f))];
}

// ---- fingerprints -----------------------------------------------------------------------------------------------

interface Print {
  sha: string;
  size: number;
  mtime: number;
  ctime: number;
}

/** What was last seen of each file: its hash is trusted while its size and times stay. */
const seen = new Map<string, Print>();
const SEEN_MAX = 200_000;

const shaOfText = (s: string | Buffer) => crypto.createHash('sha256').update(s).digest('hex');
/** A link is sealed as its target's text. */
const shaOfLink = (target: string) => shaOfText(`link:${target}`);

async function hashFile(file: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file, { highWaterMark: 1 << 20 })) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

function remember(file: string, p: Print) {
  if (seen.size >= SEEN_MAX) seen.clear();
  seen.set(file, p);
}

interface FileRow {
  path: string;
  sha: string;
  size: number;
  mtime_ms: number;
  ctime_ms: number;
  mode: number;
  link: string | null;
  copied: number;
}

/**
 * The hash of what is at `file` now (null when nothing is). Without `full`, a file whose size and times are as last
 * seen is not read again; `sealed` is what was seen when it was sealed, for the place it was sealed from. `follow`:
 * where it is a link, the file behind it.
 */
async function shaNow(file: string, o: { full?: boolean; sealed?: FileRow; follow?: boolean } = {}): Promise<string | null> {
  let st = await lstat(file);
  if (o.follow && st?.isSymbolicLink()) st = await fs.promises.stat(file).catch(() => null);
  if (!st) return null;
  if (st.isSymbolicLink()) return shaOfLink(await fs.promises.readlink(file));
  if (!st.isFile()) return 'not a file';
  const hit = seen.get(file) ?? (o.sealed && { sha: o.sealed.sha, size: o.sealed.size, mtime: o.sealed.mtime_ms, ctime: o.sealed.ctime_ms });
  if (!o.full && hit && hit.size === st.size && hit.mtime === st.mtimeMs && hit.ctime === st.ctimeMs) return hit.sha;
  const sha = await hashFile(file).catch(() => 'not readable');
  remember(file, { sha, size: st.size, mtime: st.mtimeMs, ctime: st.ctimeMs });
  return sha;
}

// ---- the store --------------------------------------------------------------------------------------------------

interface EvalRow {
  id: string;
  cwd: string;
  name: string;
  spec: string;
  seal: string;
  state: string;
  baseline: string | null;
  finals: number;
  created_at: number;
  updated_at: number;
}

const toEvaluation = (r: EvalRow): Evaluation => ({
  ...(JSON.parse(r.spec) as EvalSpec),
  id: r.id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  seal: JSON.parse(r.seal) as Evaluation['seal'],
  state: JSON.parse(r.state) as SealState,
  ...(r.baseline ? { baseline: r.baseline } : {}),
  finals: r.finals,
});

export function getEvaluation(db: DB, id: string): Evaluation | null {
  tables(db);
  const r = db.prepare('select * from exp_evals where id = ?').get(id) as EvalRow | undefined;
  return r ? toEvaluation(r) : null;
}

export function listEvaluations(db: DB): Evaluation[] {
  tables(db);
  return (db.prepare('select * from exp_evals order by created_at desc, id desc').all() as EvalRow[]).map(toEvaluation);
}

export function mustEvaluation(db: DB, id: string): Evaluation {
  const e = getEvaluation(db, id);
  if (!e) throw new HttpError(404, 'There is no such evaluation');
  return e;
}

const sealedFiles = (db: DB, id: string, n: number): FileRow[] => db.prepare('select path, sha, size, mtime_ms, ctime_ms, mode, link, copied from exp_eval_files where eval = ? and seal = ? order by path').all(id, n) as FileRow[];

const setState = (db: DB, id: string, state: SealState) => db.prepare('update exp_evals set state = ? where id = ?').run(JSON.stringify(state), id);

/** Tells the open pages which evaluations (or their scores) changed. */
const tell = (d: Deps, ids: string[]) => d.broadcast({ t: 'feature', id: 'experiments', data: { evals: ids } });

const locks = new Map<string, Promise<unknown>>();
/** One at a time for each evaluation: sealing, checking for a score, putting files back. */
function locked<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const run = (locks.get(id) ?? Promise.resolve()).then(fn);
  const done = run.then(
    () => {},
    () => {},
  );
  locks.set(id, done);
  void done.then(() => locks.get(id) === done && locks.delete(id));
  return run;
}

// ---- sealing ------------------------------------------------------------------------------------------------------

/**
 * What a spec protects as it is now, within the limits: each sealed path and the file it is, and apart from them the
 * links out of the folder that protected paths go through.
 */
export async function measure(spec: EvalSpec): Promise<{ files: Map<string, string>; links: Map<string, string>; bytes: number }> {
  if (!isFolder(spec.cwd)) throw new HttpError(400, `The folder ${spec.cwd} is not there`);
  const files = new Map<string, string>();
  const links = new Map<string, string>();
  const count = { n: 0 };
  for (const entry of spec.protect) {
    const found = await expand(spec.cwd, entry, count);
    if (found.every((f) => f.startsWith('/')))
      throw new HttpError(400, found.length ? `“${entry}” is a link out of the folder with nothing behind it to seal: check that what it leads to is there` : `Nothing in the folder matches “${entry}”: check the name`);
    for (const f of found) {
      if (f.startsWith('/')) links.set(f.slice(1), path.join(spec.cwd, f.slice(1)));
      else files.set(f, path.join(spec.cwd, f));
    }
    if (files.size > limits.files) throw tooMuch();
  }
  const held = spec.final?.heldOut;
  if (held) {
    if (!isFolder(held)) throw new HttpError(400, `The folder ${held} is not there`);
    const found = new Set<string>();
    await walk(held, '', Infinity, found, count);
    if (!found.size) throw new HttpError(400, 'The held-out folder is empty: put the final test’s data in it first');
    for (const f of found) files.set(`${HELD_OUT}${f}`, path.join(held, f));
    if (files.size > limits.files) throw tooMuch();
  }
  let bytes = 0;
  for (const [key, file] of files) {
    const st = links.has(key) ? await fs.promises.stat(file).catch(() => null) : await lstat(file);
    if (st?.isFile()) bytes += st.size;
    if (bytes > limits.bytes) throw tooMuch();
  }
  return { files, links, bytes };
}

/** Hashes what a spec protects and keeps copies of the small files, as seal `n` of an evaluation. */
async function takeSeal(id: string, n: number, spec: EvalSpec): Promise<{ rows: FileRow[]; seal: Evaluation['seal'] }> {
  const { files, links, bytes } = await measure(spec);
  const dir = sealFolder(id, n);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const rows: FileRow[] = [];
  const away = new Set(links.keys());
  let kept = 0;
  try {
    for (const [key, file] of links) {
      const target = await fs.promises.readlink(file);
      rows.push({ path: `/${key}`, sha: shaOfLink(target), size: 0, mtime_ms: 0, ctime_ms: 0, mode: 0, link: target, copied: 0 });
    }
    // What is behind a link out of the folder comes last, so its copies never crowd out the folder's own.
    for (const [key, file] of [...files].sort(([a], [b]) => Number(through(away, a)) - Number(through(away, b)))) {
      let st = await lstat(file);
      // A protected file that is itself a link out of the folder: the file behind it is what is sealed.
      if (st?.isSymbolicLink() && away.has(key)) {
        const behind = await fs.promises.stat(file);
        if (behind.isFile()) st = behind;
      }
      if (!st) continue;
      const row: FileRow = { path: key, sha: '', size: st.size, mtime_ms: st.mtimeMs, ctime_ms: st.ctimeMs, mode: st.mode & 0o777, link: null, copied: 0 };
      if (st.isSymbolicLink()) {
        row.link = await fs.promises.readlink(file);
        row.sha = shaOfLink(row.link);
      } else if (st.size <= limits.copyFile && kept + st.size <= limits.copies) {
        const body = await fs.promises.readFile(file);
        row.sha = shaOfText(body);
        row.copied = 1;
        kept += body.length;
        await fs.promises.writeFile(path.join(dir, row.sha), body, { mode: 0o600 });
      } else row.sha = await hashFile(file);
      if (!st.isSymbolicLink()) remember(file, { sha: row.sha, size: st.size, mtime: st.mtimeMs, ctime: st.ctimeMs });
      rows.push(row);
    }
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw new HttpError(400, `The files could not be read to seal them: ${(e as Error).message}`);
  }
  return { rows, seal: { n, at: Date.now(), files: rows.length - links.size, bytes } };
}

function saveFiles(db: DB, id: string, n: number, rows: FileRow[]) {
  const put = db.prepare('insert or replace into exp_eval_files (eval, seal, path, sha, size, mtime_ms, ctime_ms, mode, link, copied) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  db.prepare('delete from exp_eval_files where eval = ?').run(id);
  for (const r of rows) put.run(id, n, r.path, r.sha, r.size, r.mtime_ms, r.ctime_ms, r.mode, r.link, r.copied);
}

/** The kept copies of the seals before `n` go: nothing is checked against them again. */
function dropOldCopies(id: string, n: number) {
  const dir = path.join(EVALS_ROOT, id);
  for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : []) if (name !== String(n)) fs.rmSync(path.join(dir, name), { recursive: true, force: true });
}

const cleanState = (): SealState => ({ ok: true, checkedAt: Date.now(), changed: [] });

export async function createEvaluation(d: Deps, b: Record<string, any>): Promise<Evaluation> {
  const spec = cleanSpec(b);
  const id = newId('e');
  tables(d.db);
  const { rows, seal } = await takeSeal(id, 1, spec);
  const now = Date.now();
  d.db.transaction(() => {
    d.db.prepare('insert into exp_evals (id, cwd, name, spec, seal, state, finals, created_at, updated_at) values (?, ?, ?, ?, ?, ?, 0, ?, ?)').run(id, spec.cwd, spec.name, JSON.stringify(spec), JSON.stringify(seal), JSON.stringify(cleanState()), now, now);
    saveFiles(d.db, id, seal.n, rows);
  })();
  tell(d, [id]);
  return mustEvaluation(d.db, id);
}

/** A new seal of `spec`: its number goes up, the baseline goes and the final tests are counted afresh. */
async function reseal(d: Deps, old: Evaluation, spec: EvalSpec) {
  const { rows, seal } = await takeSeal(old.id, old.seal.n + 1, spec);
  d.db.transaction(() => {
    d.db
      .prepare('update exp_evals set cwd = ?, name = ?, spec = ?, seal = ?, state = ?, baseline = null, finals = 0, updated_at = ? where id = ?')
      .run(spec.cwd, spec.name, JSON.stringify(spec), JSON.stringify(seal), JSON.stringify(cleanState()), Date.now(), old.id);
    saveFiles(d.db, old.id, seal.n, rows);
  })();
  dropOldCopies(old.id, seal.n);
}

const specOfEvaluation = (e: Evaluation): EvalSpec => {
  const { id: _i, createdAt: _c, updatedAt: _u, seal: _s, state: _t, baseline: _b, finals: _f, ...spec } = e;
  return spec;
};

/** What a change to any of these seals again: they say what is scored and how (a variable can name the split scored). */
const sealedPart = (s: EvalSpec) =>
  JSON.stringify([s.cwd, s.command, s.metric, s.better, s.seeds, s.protect, s.final?.command ?? null, s.final?.heldOut ?? null, Object.entries(s.env ?? {}).sort(([a], [b]) => a.localeCompare(b))]);

/** Changes an evaluation: the fields given replace its own. It is sealed again only when what is sealed changed. */
export async function updateEvaluation(d: Deps, id: string, b: Record<string, any>): Promise<{ evaluation: Evaluation; sealed: boolean }> {
  return locked(id, async () => {
    const old = mustEvaluation(d.db, id);
    const changes = Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined));
    const spec = cleanSpec({ ...specOfEvaluation(old), ...changes });
    const sealed = sealedPart(spec) !== sealedPart(specOfEvaluation(old));
    if (sealed) await reseal(d, old, spec);
    else d.db.prepare('update exp_evals set name = ?, spec = ?, updated_at = ? where id = ?').run(spec.name, JSON.stringify(spec), Date.now(), id);
    tell(d, [id]);
    return { evaluation: mustEvaluation(d.db, id), sealed };
  });
}

/** Seals the files as they are now. */
export async function sealAgain(d: Deps, id: string): Promise<Evaluation> {
  return locked(id, async () => {
    const old = mustEvaluation(d.db, id);
    await reseal(d, old, cleanSpec({ ...specOfEvaluation(old) }));
    tell(d, [id]);
    return mustEvaluation(d.db, id);
  });
}

// ---- folders ------------------------------------------------------------------------------------------------------

interface Repo {
  top: string;
  common: string;
}
type Repos = Map<string, Repo | null>;

async function repoOf(dir: string, cache: Repos = new Map()): Promise<Repo | null> {
  const hit = cache.get(dir);
  if (hit !== undefined) return hit;
  const r = isFolder(dir) ? await git(dir, ['rev-parse', '--path-format=absolute', '--show-toplevel', '--git-common-dir']) : null;
  const [top, common] = r?.ok ? r.out.trim().split('\n') : [];
  const repo = top && common ? { top: real(top), common: real(common) } : null;
  cache.set(dir, repo);
  return repo;
}

/**
 * Where an evaluation's files are for work in `folder`: its home, or for a worktree of the same repository the part
 * of the worktree that stands for it. A folder inside the home that has its own copy of them stands for itself.
 * Null when the folder has nothing to do with the evaluation.
 */
export async function rootFor(ev: Evaluation, folder: string, cache: Repos = new Map()): Promise<string | null> {
  const f = real(folder);
  const home = real(ev.cwd);
  const a = await repoOf(folder, cache);
  const b = await repoOf(ev.cwd, cache);
  const same = !!a && !!b && a.common === b.common;
  if (same && a.top !== b.top) {
    const part = path.join(a.top, path.relative(b.top, home));
    return isFolder(part) ? part : null;
  }
  if (inside(f, home)) {
    if (f === home) return ev.cwd;
    // A copy of its own has the protected files (the scorer) at the same places; where only folders are protected, all of them.
    const plain = ev.protect.filter((p) => !p.includes('*'));
    const single = plain.filter((p) => !p.endsWith('/'));
    const has = (p: string) => fs.existsSync(path.join(folder, p));
    const own = single.length ? single.some(has) : plain.length > 0 && plain.every(has);
    return own ? folder : ev.cwd;
  }
  return same ? ev.cwd : null;
}

/**
 * The evaluations of a folder: those whose home is the folder, above it or in the same repository, with where their
 * files are for it. `below` adds those whose home is under the folder (a project's folder has them all).
 */
export async function evaluationsFor(db: DB, folder: string, o: { below?: boolean } = {}): Promise<{ evaluation: Evaluation; root: string }[]> {
  const out: { evaluation: Evaluation; root: string }[] = [];
  const cache: Repos = new Map();
  for (const evaluation of listEvaluations(db)) {
    const root = await rootFor(evaluation, folder, cache);
    if (root) out.push({ evaluation, root });
    else if (o.below && inside(real(evaluation.cwd), real(folder))) out.push({ evaluation, root: evaluation.cwd });
  }
  return out;
}

const NOT_SCORABLE = 'That folder cannot be scored: an evaluation scores its own folder, a folder inside it, or a git worktree of the same repository';

/** The folder to score, checked: the home, a folder under it, or a git worktree of the same repository. */
export async function allowedFolder(ev: Evaluation, folder: string | undefined): Promise<string> {
  if (!folder?.trim()) folder = ev.cwd;
  const f = path.resolve(expandHome(folder.trim()));
  if (!isFolder(f)) throw new HttpError(400, `The folder ${f} is not there`);
  if (!isFolder(ev.cwd)) throw new HttpError(400, `The evaluation’s folder ${ev.cwd} is not there any more`);
  const a = await repoOf(f);
  const b = await repoOf(ev.cwd);
  if (a && b && a.common === b.common && a.top !== b.top) {
    // A worktree's top stands for its part where the evaluation lives.
    const part = path.relative(b.top, real(ev.cwd));
    return part && real(f) === a.top && isFolder(path.join(f, part)) ? path.join(f, part) : f;
  }
  if (inside(real(f), real(ev.cwd))) return f;
  throw new HttpError(400, NOT_SCORABLE);
}

/** The folders that can be scored: the home, and the same part of each git worktree of its repository. */
export async function foldersOf(ev: Evaluation): Promise<EvalFolder[]> {
  const home: EvalFolder = { path: ev.cwd, home: true };
  const repo = await repoOf(ev.cwd);
  if (!repo) return [home];
  const list = await git(ev.cwd, ['worktree', 'list', '--porcelain']);
  const part = path.relative(repo.top, real(ev.cwd));
  const others: EvalFolder[] = [];
  // Evolve's own worktrees (experiments/evolve/) are the app's, not folders to score by hand.
  const evolving = path.join(RUNS_ROOT, 'evolve');
  for (const block of list.ok ? list.out.split('\n\n') : []) {
    const top = /^worktree (.+)$/m.exec(block)?.[1];
    const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1];
    if (!top || inside(real(top), real(evolving))) continue;
    if (real(top) === repo.top) {
      if (branch) home.branch = branch;
      continue;
    }
    const dir = path.join(top, part);
    if (isFolder(dir)) others.push({ path: dir, ...(branch ? { branch } : {}), home: false });
  }
  return [home, ...others];
}

// ---- checking a folder ------------------------------------------------------------------------------------------

const sameFolder = (a: string, b: string) => real(a) === real(b);

/** The part of `rel` that is a link the app lent `folder`, to the same part of the home; null when there is none. */
async function lentAt(folder: string, home: string, rel: string): Promise<string | null> {
  const segs = rel.split('/');
  for (let i = 1; i <= segs.length; i++) {
    const part = segs.slice(0, i).join('/');
    const to = await fs.promises.readlink(path.join(folder, part)).catch(() => null);
    if (to !== null) return path.resolve(to) === path.join(home, part) ? part : null;
  }
  return null;
}

async function trackedIn(home: string): Promise<Set<string>> {
  const r = await git(home, ['ls-files', '-z'], 60_000);
  return new Set(r.ok ? r.out.split('\0').filter(Boolean) : []);
}

/** Whether a sealed path is one that is lent: named by a protected path without wildcards, or (a link's text) on its way. */
const lendable = (protect: string[], rel: string, link = false) =>
  protect.some((p) => !p.includes('*') && ((p.endsWith('/') ? rel.startsWith(p) || rel === p.slice(0, -1) : rel === p) || (link && p.startsWith(`${rel}/`))));

/**
 * Every sealed path that differs in `folder`, and what was read there from the home. `repointed`: those of them that
 * are links out of the folder, not as sealed. `absentOk`: a file git does not track that the folder lacks is judged
 * by the home's, as it would be lent to it for a score.
 */
async function compare(db: DB, ev: Evaluation, folder: string, o: { full?: boolean; absentOk?: boolean } = {}): Promise<{ changed: SealChange[]; lent: string[]; repointed: Set<string> }> {
  const rows = sealedFiles(db, ev.id, ev.seal.n);
  // A seal always has files: none means this one was replaced meanwhile, and nothing was compared.
  if (!rows.length) throw new HttpError(409, 'The evaluation was sealed again just now: try again');
  const home = ev.cwd;
  const away = !sameFolder(folder, home);
  const held = ev.final?.heldOut;
  const tracked = away && o.absentOk ? await trackedIn(home) : null;
  const links = followed(rows);
  const lent = new Set<string>();
  const differs = new Map<string, SealChange['what']>();
  const repointed = new Set<string>();
  for (const row of rows) {
    const own = row.path.startsWith('/');
    const name = own ? row.path.slice(1) : row.path;
    const out = name.startsWith(HELD_OUT);
    const rel = out ? name.slice(HELD_OUT.length) : name;
    const base = out ? held : folder;
    if (!base) {
      differs.set(name, 'missing');
      continue;
    }
    const origin = path.join(out ? base : home, rel);
    let at = path.join(base, rel);
    if (!out && away) {
      const part = await lentAt(folder, home, rel);
      if (part) {
        lent.add(part);
        at = origin;
      }
    }
    // A protected file that is itself a link out of the folder is read behind it.
    const follow = !own && !out && row.link === null && links.has(rel);
    let sha = await shaNow(at, { full: o.full, follow, ...(at === origin ? { sealed: row } : {}) });
    if (sha === null && tracked && !out && lendable(ev.protect, rel, own) && !through(tracked, rel)) sha = await shaNow(origin, { full: o.full, follow, sealed: row });
    if (sha === row.sha) continue;
    // A link's own change says more than that of the file behind it.
    if (own) repointed.add(name);
    if (own || !differs.has(name)) differs.set(name, sha === null ? 'missing' : 'changed');
  }

  const sealed = new Set(rows.map((r) => r.path));
  const added = new Set<string>();
  const found = async (root: string, entry: string, prefix = '') => {
    // So many files that they cannot be looked through are themselves something added.
    const files = await expand(root, entry).catch(() => [literalOf(entry) || entry]);
    for (const f of files) {
      if (!f.startsWith('/')) {
        if (!sealed.has(`${prefix}${f}`)) added.add(`${prefix}${f}`);
      } else if (!sealed.has(f)) {
        // A link out of the folder where there was none: what is read there is no longer the folder's.
        repointed.add(f.slice(1));
        differs.set(f.slice(1), 'changed');
      }
    }
  };
  for (const entry of ev.protect) {
    if (!entry.endsWith('/') && !entry.includes('*')) continue;
    const base = literalOf(entry);
    const part = away && base ? await lentAt(folder, home, base) : null;
    if (part) lent.add(part);
    await found(part ? home : folder, entry);
  }
  if (held && isFolder(held)) await found(held, '**', HELD_OUT);
  const changed: SealChange[] = [...differs].map(([p, what]) => ({ path: p, what }));
  for (const p of [...added].sort()) if (!differs.has(p)) changed.push({ path: p, what: 'added' });
  return { changed, lent: [...lent].sort(), repointed };
}

const stateOf = (changed: SealChange[]): SealState => ({
  ok: !changed.length,
  checkedAt: Date.now(),
  changed: changed.slice(0, limits.listed),
  ...(changed.length > limits.listed ? { more: changed.length - limits.listed } : {}),
});

/** Whether a folder's files are as sealed. */
export async function check(db: DB, ev: Evaluation, folder: string, o: { full?: boolean; absentOk?: boolean } = {}): Promise<SealState> {
  return stateOf((await compare(db, ev, folder, o)).changed);
}

/** The home folder as last checked, checked again when that is older than `maxAge` ms. */
export async function checkHome(d: Deps, id: string, maxAge = 30_000): Promise<Evaluation> {
  const ev = mustEvaluation(d.db, id);
  if (Date.now() - ev.state.checkedAt < maxAge) return ev;
  return locked(id, async () => {
    const now = mustEvaluation(d.db, id);
    setState(d.db, id, await check(d.db, now, now.cwd));
    return mustEvaluation(d.db, id);
  });
}

const shownPath = (p: string) => (p.startsWith(HELD_OUT) ? `${p.slice(HELD_OUT.length)} in the held-out folder` : p);

/** "The scorer or its data changed since it was sealed: eval.py, data/test.csv (missing)". */
export function changedWords(state: Pick<SealState, 'changed' | 'more'>, lead = 'The scorer or its data changed since it was sealed'): string {
  const named = state.changed.slice(0, 5).map((c) => `${shownPath(c.path)}${c.what === 'changed' ? '' : c.what === 'added' ? ' (added)' : ' (missing)'}`);
  const more = state.changed.length - named.length + (state.more ?? 0);
  return `${lead}: ${named.join(', ')}${more ? ` and ${more} more` : ''}`;
}

/** A score refused because files differ: the reply carries them (409 { error, changed, more? }). */
export class ChangedError extends HttpError {
  constructor(public state: SealState) {
    super(409, changedWords(state), { changed: state.changed, ...(state.more ? { more: state.more } : {}) });
  }
}

// ---- lending ----------------------------------------------------------------------------------------------------

/** A link at `folder`/`rel` to the home's, its parent folders made; never through a link that leads out of the folder. */
async function link(folder: string, home: string, rel: string): Promise<boolean> {
  const segs = rel.split('/');
  const top = real(folder);
  for (let i = 1; i < segs.length; i++) {
    const dir = path.join(folder, ...segs.slice(0, i));
    if (!(await lstat(dir))) await fs.promises.mkdir(dir).catch(() => {});
    else {
      const at = await fs.promises.realpath(dir).catch(() => null);
      if (!at || !inside(at, top)) return false;
    }
  }
  const to = path.join(home, rel);
  try {
    await fs.promises.symlink(to, path.join(folder, rel), isFolder(to) ? 'junction' : 'file');
    return true;
  } catch {
    return false;
  }
}

/**
 * A worktree lacks what git does not track (data): each protected path without wildcards that is missing there and
 * that git does not track in the home is linked from it. Where the folder has part of one, the single sealed files
 * it lacks and git does not track are linked. A tracked file that is missing stays missing.
 */
async function lend(db: DB, ev: Evaluation, folder: string): Promise<void> {
  const home = ev.cwd;
  if (sameFolder(folder, home)) return;
  // Not inside a protected folder of the home: the links would count as files added there.
  const within = slashes(path.relative(real(home), real(folder)));
  if (inside(real(folder), real(home)) && ev.protect.some((p) => (p.endsWith('/') || p.includes('*')) && patternRe(p).test(`${within}/x`))) return;
  const tracked = await trackedIn(home);
  const rows = sealedFiles(db, ev.id, ev.seal.n).filter((r) => !r.path.startsWith(HELD_OUT) && !r.path.startsWith('/'));
  for (const entry of ev.protect) {
    if (entry.includes('*')) continue;
    const named = entry.replace(/\/$/, '');
    // A link out of the folder on the way is lent as itself, so what is behind it is read the same way.
    const rel = (await linksOut(home, named))[0] ?? named;
    if (!(await lstat(path.join(home, rel))) || (await lentAt(folder, home, rel))) continue;
    const hasTracked = [...tracked].some((t) => t === rel || t.startsWith(`${rel}/`));
    if (!(await lstat(path.join(folder, rel))) && !hasTracked) {
      await link(folder, home, rel);
      continue;
    }
    for (const r of rows) {
      if (!(r.path === named || r.path.startsWith(`${named}/`)) || through(tracked, r.path)) continue;
      if (!(await lstat(path.join(folder, r.path))) && (await lstat(path.join(home, r.path)))) await link(folder, home, r.path);
    }
  }
}

// ---- what changed, and putting it back ------------------------------------------------------------------------

const MAX_DIFF_FILE = 1024 * 1024;

async function textOf(file: string): Promise<string | null> {
  const st = await fs.promises.stat(file).catch(() => null);
  if (!st?.isFile() || st.size > MAX_DIFF_FILE) return null;
  const body = await fs.promises.readFile(file).catch(() => null);
  return body && !body.includes(0) ? body.toString('utf8') : null;
}

/** A unified diff of the sealed copy (`was`) against what is there now (`now`, null: nothing), at most 200 lines. */
async function diffOf(was: string, now: string | null, name: string): Promise<{ diff: string; cut?: boolean } | null> {
  if ((await textOf(was)) === null || (now !== null && (await textOf(now)) === null)) return null;
  const r = await git(os.tmpdir(), ['diff', '--no-index', '--no-color', '--no-ext-diff', '--', was, now ?? os.devNull]);
  const lines = r.out.replace(/\n$/, '').split('\n');
  const from = lines.findIndex((l) => l.startsWith('@@'));
  if (from < 0) return null;
  const all = [`--- sealed/${name}`, `+++ now/${name}`, ...lines.slice(from)];
  return { diff: all.slice(0, limits.diffLines).join('\n'), ...(all.length > limits.diffLines ? { cut: true } : {}) };
}

/** Where a sealed path is for `folder`: in the held-out folder, the home (through a lent link), or the folder. */
async function placeFor(ev: Evaluation, folder: string, key: string): Promise<{ base: string; rel: string } | null> {
  if (key.startsWith(HELD_OUT)) return ev.final?.heldOut ? { base: ev.final.heldOut, rel: key.slice(HELD_OUT.length) } : null;
  const lent = !sameFolder(folder, ev.cwd) && (await lentAt(folder, ev.cwd, key));
  return { base: lent ? ev.cwd : folder, rel: key };
}

/** Each path that differs in `folder`, with its diff where a copy is kept and it is text (`hideHeldOut`: none of the held-out folder's). */
export async function changesOf(db: DB, id: string, folder?: string, o: { hideHeldOut?: boolean } = {}): Promise<{ folder: string; state: SealState; changes: EvalChange[] }> {
  const ev = mustEvaluation(db, id);
  const f = await allowedFolder(ev, folder);
  const { changed, repointed } = await compare(db, ev, f, { absentOk: true });
  const rows = new Map(sealedFiles(db, id, ev.seal.n).map((r) => [r.path, r]));
  const links = followed([...rows.values()]);
  const changes: EvalChange[] = [];
  for (const c of changed.slice(0, limits.listed)) {
    const row = rows.get(repointed.has(c.path) ? `/${c.path}` : c.path);
    const at = await placeFor(ev, f, c.path);
    let diff: { diff: string; cut?: boolean } | null = null;
    if (row && at && !(o.hideHeldOut && c.path.startsWith(HELD_OUT))) {
      const now = path.join(at.base, at.rel);
      if (row.link !== null) {
        const to = await fs.promises.readlink(now).catch(() => null);
        diff = { diff: [`--- sealed/${c.path}`, `+++ now/${c.path}`, `-a link to ${row.link}`, ...(to === null ? [] : [`+a link to ${to}`])].join('\n') };
      } else if (row.copied) {
        // A protected file that is a link out of the folder is compared by the file behind it.
        const file = links.has(c.path) ? await fs.promises.realpath(now).catch(() => now) : now;
        if (!(await lstat(file))?.isSymbolicLink()) diff = await diffOf(path.join(sealFolder(id, ev.seal.n), row.sha), c.what === 'missing' ? null : file, c.path);
      }
    }
    changes.push({ ...c, ...diff });
  }
  return { folder: f, state: stateOf(changed), changes };
}

/** Writes one sealed file back; why it could not, or null when it did. */
async function putBack(ev: Evaluation, base: string, rel: string, row: FileRow): Promise<string | null> {
  if (row.link === null && !row.copied) return 'No copy of it was kept (it is large)';
  const segs = rel.split('/');
  const top = real(base);
  for (let i = 1; i < segs.length; i++) {
    const dir = path.join(base, ...segs.slice(0, i));
    const st = await lstat(dir);
    if (!st) await fs.promises.mkdir(dir);
    else if (!isFolder(dir) || !inside(real(dir), top)) return 'A folder on its way is now a file, or a link to somewhere else';
  }
  const dest = path.join(base, rel);
  const st = await lstat(dest);
  if (st?.isDirectory()) return `There is a folder where the ${row.link === null ? 'file' : 'link'} was`;
  let body: Buffer | null = null;
  if (row.link === null) {
    body = await fs.promises.readFile(path.join(sealFolder(ev.id, ev.seal.n), row.sha)).catch(() => null);
    if (!body || shaOfText(body) !== row.sha) return 'The kept copy of it is gone or was changed too';
  }
  // What is there goes first, so a link is replaced and never written through.
  if (st) await fs.promises.unlink(dest);
  if (row.link !== null) await fs.promises.symlink(row.link, dest);
  else {
    await fs.promises.writeFile(dest, body!, { flag: 'wx' });
    if (row.mode) await fs.promises.chmod(dest, row.mode);
  }
  seen.delete(dest);
  return null;
}

const OUTSIDE = 'It is outside the folder, behind a link: put it back by hand';
const OUTSIDE_ADDED = 'It was added since, outside the folder, behind a link: remove it by hand if it should not be there';

/**
 * Copies the kept copies over the files that changed or are missing. Files added since stay, and are named. Nothing
 * is written through a link out of the folder: a link sent elsewhere is put back, what is behind it is not.
 */
export async function restoreFiles(d: Deps, id: string, folder?: string): Promise<EvalRestored> {
  return locked(id, async () => {
    const ev = mustEvaluation(d.db, id);
    const f = await allowedFolder(ev, folder);
    await lend(d.db, ev, f);
    let now = await compare(d.db, ev, f, { full: true });
    const rows = new Map(sealedFiles(d.db, id, ev.seal.n).map((r) => [r.path, r]));
    const links = followed([...rows.values()]);
    const restored: string[] = [];
    const left: { path: string; why: string }[] = [];
    const write = async (name: string, row: FileRow) => {
      const at = await placeFor(ev, f, name);
      const why = at ? await putBack(ev, at.base, at.rel, row).catch((e) => `It could not be written: ${(e as Error).message}`) : 'The held-out folder is not named any more';
      if (why) left.push({ path: name, why });
      else restored.push(name);
    };
    // The links first: with them back, what is behind them may be as sealed again.
    for (const c of now.changed.filter((x) => now.repointed.has(x.path))) {
      const row = rows.get(`/${c.path}`);
      const above = c.path.split('/').slice(0, -1).join('/');
      if (!row) left.push({ path: c.path, why: 'It is a link now and was not when it was sealed: remove the link and put back what was there' });
      else if (above && through(links, above)) left.push({ path: c.path, why: OUTSIDE });
      else await write(c.path, row);
    }
    if (restored.length) now = await compare(d.db, ev, f);
    for (const c of now.changed.filter((x) => !now.repointed.has(x.path))) {
      const row = rows.get(c.path);
      if (through(links, c.path)) left.push({ path: c.path, why: c.what === 'added' ? OUTSIDE_ADDED : OUTSIDE });
      else if (c.what === 'added' || !row) left.push({ path: c.path, why: 'It was added since: remove it yourself if it should not be there' });
      else await write(c.path, row);
    }
    const state = await check(d.db, ev, f);
    if (sameFolder(f, ev.cwd)) setState(d.db, id, state);
    tell(d, [id]);
    return { folder: f, restored, left, state };
  });
}

// ---- scores -----------------------------------------------------------------------------------------------------

interface ScoreRow {
  id: string;
  eval: string;
  seal: number;
  kind: ScoreKind;
  status: ScoreStatus;
  info: string;
  created_at: number;
  ended_at: number | null;
}

interface ScoreInfo {
  why?: string;
  failedRun?: string;
  printed?: string[];
  folder: string;
  commit?: string;
  branch?: string;
  dirty?: boolean;
  lent?: string[];
  runs: string[];
  seeds: number[];
  values: number[];
  mean?: number;
  std?: number;
  by: EvalScore['by'];
  /** Its runs are still being put in line. */
  starting?: boolean;
}

const infoOf = (r: ScoreRow) => JSON.parse(r.info) as ScoreInfo;
const isOpen = (s: ScoreStatus) => s === 'waiting' || s === 'running';
const scoreRow = (db: DB, id: string): ScoreRow | undefined => {
  tables(db);
  return db.prepare('select * from exp_scores where id = ?').get(id) as ScoreRow | undefined;
};
const saveScore = (db: DB, id: string, status: ScoreStatus, info: ScoreInfo, endedAt: number | null = null) => db.prepare('update exp_scores set status = ?, info = ?, ended_at = ? where id = ?').run(status, JSON.stringify(info), endedAt, id);
const scoreRows = (db: DB, evaluation: string): ScoreRow[] => db.prepare('select * from exp_scores where eval = ? order by created_at desc, id desc').all(evaluation) as ScoreRow[];
const openRows = (db: DB): ScoreRow[] => db.prepare("select * from exp_scores where status in ('waiting', 'running') order by created_at, id").all() as ScoreRow[];
/** The score a run was made for. */
function scoreOfRun(db: DB, run: string): ScoreRow | undefined {
  tables(db);
  const r = db.prepare('select * from exp_scores where instr(info, ?) > 0').all(JSON.stringify(run)) as ScoreRow[];
  return r.find((x) => infoOf(x).runs.includes(run));
}

/** A score as it is read: running once a run of it started, and compared with the baseline there is now. */
function view(db: DB, r: ScoreRow, ev: Evaluation | null = getEvaluation(db, r.eval)): EvalScore {
  const { starting: _s, ...info } = infoOf(r);
  const status: ScoreStatus = isOpen(r.status) ? (info.runs.some((id) => getRun(db, id)?.startedAt) ? 'running' : 'waiting') : r.status;
  const out: EvalScore = { ...info, id: r.id, evaluation: r.eval, seal: r.seal, kind: r.kind, status, createdAt: r.created_at, ...(r.ended_at ? { endedAt: r.ended_at } : {}) };
  // A final test is of other data than the baseline: the two are not compared.
  if (r.kind === 'score' && status === 'done' && ev?.baseline && ev.baseline !== r.id && r.seal === ev.seal.n) {
    const base = scoreRow(db, ev.baseline);
    if (base && base.seal === r.seal && base.status === 'done') out.against = { baseline: base.id, ...verdictOf(info.values, infoOf(base).values, ev.better) };
  }
  return out;
}

export function getScore(db: DB, id: string): EvalScore | null {
  const r = scoreRow(db, id);
  return r ? view(db, r) : null;
}

/** A score an evolution asked for (its start's, or a candidate's). */
const byEvolve = (r: ScoreRow) => infoOf(r).by?.who === 'evolve';

/** An evaluation's scores, newest first, of the kinds asked for; those an evolution asked for only with `evolve`. */
export function listScores(db: DB, evaluation: string, kinds: ScoreKind[], limit = 200, o: { evolve?: boolean } = {}): EvalScore[] {
  const ev = getEvaluation(db, evaluation);
  return scoreRows(db, evaluation)
    .filter((r) => kinds.includes(r.kind) && (o.evolve || !byEvolve(r)))
    .slice(0, limit)
    .map((r) => view(db, r, ev));
}

/** An evaluation with its latest finished score and its baseline's. */
export function listed(db: DB, ev: Evaluation): EvaluationListed {
  const rows = scoreRows(db, ev.id);
  const last = rows.find((r) => r.kind === 'score' && r.status === 'done' && r.seal === ev.seal.n && !byEvolve(r));
  const base = ev.baseline ? rows.find((r) => r.id === ev.baseline) : undefined;
  return { ...ev, ...(last ? { last: view(db, last, ev) } : {}), ...(base ? { baselineScore: view(db, base, ev) } : {}) };
}

/** Removes the compiled copies Python keeps beside the sealed modules, so it reads the sealed files themselves. */
async function dropCompiled(db: DB, ev: Evaluation, folder: string) {
  for (const r of sealedFiles(db, ev.id, ev.seal.n)) {
    if (!r.path.endsWith('.py') || r.path.startsWith(HELD_OUT) || r.path.startsWith('/')) continue;
    const cache = path.join(folder, path.dirname(r.path), '__pycache__');
    const stem = `${path.basename(r.path, '.py')}.`;
    for (const name of await fs.promises.readdir(cache).catch(() => [] as string[])) if (name.startsWith(stem) && name.endsWith('.pyc')) await fs.promises.unlink(path.join(cache, name)).catch(() => {});
  }
}

export interface ScoreAsk {
  kind: ScoreKind;
  folder?: string;
  seeds?: unknown;
  by: EvalScore['by'];
}

/** Checks a folder and puts the runs that score it in line, one for each seed. */
export async function startScore(d: Deps, id: string, o: ScoreAsk): Promise<EvalScore> {
  mustEvaluation(d.db, id);
  if (o.kind === 'baseline' && o.by.who !== 'you') throw new HttpError(403, 'Only the person sets the baseline');
  // A goal scores (kind score) and nothing else: the baseline and the final test are the person's alone.
  if (o.kind === 'final' && o.by.who !== 'you') throw new HttpError(403, 'Only the person runs the final test');
  watchScores();
  return locked(id, async () => {
    const ev = mustEvaluation(d.db, id);
    if (o.kind === 'final' && !ev.final) throw new HttpError(400, 'This evaluation has no final test');
    const command = o.kind === 'final' ? ev.final!.command : ev.command;
    const folder = await allowedFolder(ev, o.folder);
    await lend(d.db, ev, folder);
    const { changed, lent } = await compare(d.db, ev, folder, { full: o.kind === 'final' });
    const state = stateOf(changed);
    if (sameFolder(folder, ev.cwd)) setState(d.db, id, state);
    if (!state.ok) {
      tell(d, [id]);
      throw new ChangedError(state);
    }
    const seeds = placeholders(command).includes('seed') ? (given(o.seeds) && !(Array.isArray(o.seeds) && !o.seeds.length) ? cleanSeeds(o.seeds) : ev.seeds) : [];
    const env: Record<string, string> = {
      ...ev.env,
      PYTHONDONTWRITEBYTECODE: '1',
      HYDOR_EVALUATION: ev.id,
      HYDOR_EVAL_KIND: o.kind,
      ...(o.kind === 'final' && ev.final?.heldOut ? { HYDOR_HELD_OUT: ev.final.heldOut } : {}),
    };
    // Every run checked before any is made, so a mistake starts none.
    const specs = [];
    for (const seed of seeds.length ? seeds : [undefined]) {
      specs.push(
        await cleanJob(d.db, {
          command: seed === undefined ? command : fillCommand(command, { seed }),
          cwd: folder,
          name: seed === undefined ? ev.name : `${ev.name} · seed ${seed}`,
          group: evalGroup(ev.id),
          tags: [EVAL_TAG],
          env,
          seed,
          gpus: ev.gpus,
          gpuMemGb: ev.gpuMemGb,
          hours: ev.hours,
          where: ev.where,
          // One score, not a notice for each of its runs.
          notify: { done: false, failed: false },
        }),
      );
    }
    const repo = await captureGit(localShell(folder, agentBaseEnv())).catch(() => ({}) as Awaited<ReturnType<typeof captureGit>>);
    const scoreId = newId('c');
    const info: ScoreInfo = {
      folder,
      ...(repo.commit ? { commit: repo.commit } : {}),
      ...(repo.branch ? { branch: repo.branch } : {}),
      ...(repo.dirty !== undefined ? { dirty: repo.dirty } : {}),
      ...(lent.length ? { lent } : {}),
      runs: [],
      seeds,
      values: [],
      by: o.by,
      starting: true,
    };
    d.db.prepare("insert into exp_scores (id, eval, seal, kind, status, info, created_at) values (?, ?, ?, ?, 'waiting', ?, ?)").run(scoreId, ev.id, ev.seal.n, o.kind, JSON.stringify(info), Date.now());
    if (o.kind === 'final') d.db.prepare('update exp_evals set finals = finals + 1 where id = ?').run(ev.id);
    const startedBy: RunInfo['startedBy'] = o.by.session ? { session: o.by.session } : { page: true };
    try {
      for (const spec of specs) {
        const run = await submit(d, spec, { startedBy });
        info.runs.push(run.id);
        // Kept at once: the queue looks for the score as each run starts.
        saveScore(d.db, scoreId, 'waiting', info);
      }
    } catch (e) {
      saveScore(d.db, scoreId, 'failed', { ...info, starting: false, why: `It could not be started: ${(e as Error).message}` }, Date.now());
      for (const run of info.runs) await stopRun(d, run, 'Its score could not be started').catch(() => {});
      throw e;
    }
    info.starting = false;
    saveScore(d.db, scoreId, 'waiting', info);
    tell(d, [ev.id]);
    return view(d.db, scoreRow(d.db, scoreId)!);
  });
}

/** Scores whose result is being worked out. */
const settling = new Set<string>();

/** What a score came to, once all its runs have ended. */
async function resultOf(db: DB, row: ScoreRow, ev: Evaluation, info: ScoreInfo): Promise<{ status: ScoreStatus; add: Partial<ScoreInfo> }> {
  const failed = (why: string, add: Partial<ScoreInfo> = {}) => ({ status: 'failed' as const, add: { why, ...add } });
  const runs = info.runs.map((id) => getRun(db, id));
  if (!runs.length || runs.some((r) => !r)) return failed('One of its runs was deleted before it was scored');
  const all = runs as RunRecord[];
  if (row.seal !== ev.seal.n) return failed('It was sealed again while this was being scored: score it again', { failedRun: all[0].id });
  const touched = all.find((r) => r.sealed?.some((s) => s.evaluation === ev.id && !s.ok));
  if (touched) {
    const paths = touched.sealed!.find((s) => s.evaluation === ev.id)!.changed ?? [];
    return failed(`The scorer or its data changed after the score was asked for: ${paths.map(shownPath).join(', ')}`, { failedRun: touched.id });
  }
  const bad = all.find((r) => r.status === 'failed' || r.status === 'lost');
  if (bad) return failed(`The run “${bad.name ?? bad.id}” failed${bad.why ? `: ${bad.why}` : ''}`, { failedRun: bad.id });
  const stopped = all.find((r) => r.status === 'stopped');
  if (stopped) return { status: 'stopped', add: { why: `The run “${stopped.name ?? stopped.id}” was stopped${stopped.why ? `: ${stopped.why}` : ''}`, failedRun: stopped.id } };
  const { changed } = await compare(db, ev, info.folder, { full: row.kind === 'final' });
  if (changed.length) return failed(changedWords(stateOf(changed), 'The scorer or its data changed while it was being scored'), { failedRun: all[0].id });
  const values: number[] = [];
  const names = () => [...new Set(all.flatMap((r) => Object.keys(r.metrics?.last ?? {})))];
  for (const r of all) {
    const last = r.metrics?.last ?? {};
    const key = ev.metric in last ? ev.metric : Object.keys(last).find((k) => k.toLowerCase() === ev.metric.toLowerCase());
    if (key === undefined) return failed(`It printed no number called “${ev.metric}”`, { printed: names(), failedRun: r.id });
    // NaN and infinity are kept in JSON as null.
    if (typeof last[key] !== 'number' || !Number.isFinite(last[key])) return failed(`The number it printed for “${ev.metric}” is not a real number (NaN or infinite)`, { failedRun: r.id });
    values.push(last[key]);
  }
  return { status: 'done', add: { values, mean: mean(values), std: std(values) } };
}

/** Works out a score whose runs have all ended; a baseline that succeeds becomes the evaluation's baseline. */
async function settle(d: Deps, id: string): Promise<void> {
  const row = scoreRow(d.db, id);
  if (!row || !isOpen(row.status) || settling.has(id)) return;
  const info = infoOf(row);
  if (info.starting || info.runs.some((r) => ACTIVE.includes(getRun(d.db, r)?.status ?? 'done'))) return;
  settling.add(id);
  try {
    const ev = getEvaluation(d.db, row.eval);
    if (!ev) return;
    const result = await resultOf(d.db, row, ev, info).catch((e) => ({ status: 'failed' as const, add: { why: `Its result could not be worked out: ${(e as Error).message}` } }));
    saveScore(d.db, id, result.status, { ...info, ...result.add }, Date.now());
    if (result.status === 'done' && row.kind === 'baseline') d.db.prepare("update exp_evals set baseline = ?, updated_at = ? where id = ? and json_extract(seal, '$.n') = ?").run(id, Date.now(), ev.id, row.seal);
    tell(d, [ev.id]);
  } finally {
    settling.delete(id);
  }
  scored.emit('scored', id);
}

let watching = false;
/** Hears of every run that ends: the last of a score's works it out. */
function watchScores() {
  if (watching) return;
  watching = true;
  ended.on('ended', (run: string) => {
    const d = depsOf();
    if (!d) return;
    const row = scoreOfRun(d.db, run);
    if (row) void settle(d, row.id).catch((e) => console.error(`[experiments] score ${row.id}:`, (e as Error)?.message ?? e));
  });
}

/** Why a score failed when the app stopped while its runs were being put in line. */
export const STOPPED_WHILE_STARTING = 'The app stopped while it was being started: score it again';

/** On start-up: the scores left open are worked out, or wait for their runs as before. */
export async function resumeScores(d: Deps): Promise<void> {
  watchScores();
  tables(d.db);
  for (const row of openRows(d.db)) {
    const info = infoOf(row);
    if (info.starting) {
      saveScore(d.db, row.id, 'failed', { ...info, starting: false, why: STOPPED_WHILE_STARTING }, Date.now());
      for (const run of info.runs) await stopRun(d, run, 'Its score was not started in full').catch(() => {});
      tell(d, [row.eval]);
    } else await settle(d, row.id).catch((e) => console.error(`[experiments] score ${row.id}:`, (e as Error)?.message ?? e));
  }
}

/** Waits for a score to end, `ms` at most; the score as it is then. */
export async function waitScore(d: Deps, id: string, ms: number, signal?: AbortSignal): Promise<EvalScore | null> {
  const end = Date.now() + ms;
  while (Date.now() < end && !signal?.aborted) {
    const r = scoreRow(d.db, id);
    if (!r || !isOpen(r.status)) break;
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(t);
        scored.off('scored', on);
        signal?.removeEventListener('abort', done);
        resolve();
      };
      const on = (x: string) => x === id && done();
      const t = setTimeout(done, Math.min(2000, Math.max(50, end - Date.now())));
      scored.on('scored', on);
      signal?.addEventListener('abort', done, { once: true });
    });
  }
  return getScore(d.db, id);
}

export async function stopScore(d: Deps, id: string): Promise<EvalScore> {
  const row = scoreRow(d.db, id);
  if (!row) throw new HttpError(404, 'There is no such score');
  if (isOpen(row.status)) for (const run of infoOf(row).runs) if (ACTIVE.includes(getRun(d.db, run)?.status ?? 'done')) await stopRun(d, run);
  return getScore(d.db, id)!;
}

function dropRuns(d: Deps, runs: string[]) {
  for (const run of runs) deleteRun(d.db, run);
  tellRuns(d, runs);
}

/** Uses a finished score of the current seal as the baseline. */
export function setBaseline(d: Deps, id: string, score: string): Evaluation {
  const ev = mustEvaluation(d.db, id);
  const r = scoreRow(d.db, score);
  if (!r || r.eval !== id) throw new HttpError(404, 'There is no such score');
  if (r.kind === 'final') throw new HttpError(400, 'A final test cannot be the baseline');
  if (r.seal !== ev.seal.n) throw new HttpError(400, 'That score is from before the evaluation was sealed again, so it cannot be compared: measure the baseline again');
  if (r.status !== 'done') throw new HttpError(400, 'Only a score that finished can be the baseline');
  d.db.prepare('update exp_evals set baseline = ?, updated_at = ? where id = ?').run(score, Date.now(), id);
  tell(d, [id]);
  return mustEvaluation(d.db, id);
}

export function deleteScore(d: Deps, id: string): void {
  const r = scoreRow(d.db, id);
  if (!r) throw new HttpError(404, 'There is no such score');
  const info = infoOf(r);
  if (isOpen(r.status) || info.runs.some((run) => ACTIVE.includes(getRun(d.db, run)?.status ?? 'done'))) throw new HttpError(409, 'It has not ended: stop it first');
  d.db.prepare('delete from exp_scores where id = ?').run(id);
  d.db.prepare('update exp_evals set baseline = null where baseline = ?').run(id);
  dropRuns(d, info.runs);
  tell(d, [r.eval]);
}

/** Removes an evaluation: its runs still going are stopped, then its scores, their runs' records and its copies go. */
export async function removeEvaluation(d: Deps, id: string): Promise<void> {
  mustEvaluation(d.db, id);
  await locked(id, async () => {
    const runs = scoreRows(d.db, id).flatMap((r) => infoOf(r).runs);
    const going = () => runs.filter((run) => ACTIVE.includes(getRun(d.db, run)?.status ?? 'done'));
    for (const run of going()) await stopRun(d, run, 'Its evaluation was removed');
    // A run is deleted only once its process has ended: its folder is how it is stopped.
    for (const end = Date.now() + 30_000; going().length && Date.now() < end; ) {
      await tick();
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (going().length) throw new HttpError(409, 'Its runs are still stopping: try again in a moment');
    d.db.transaction(() => {
      d.db.prepare('delete from exp_scores where eval = ?').run(id);
      d.db.prepare('delete from exp_eval_files where eval = ?').run(id);
      d.db.prepare('delete from exp_evals where id = ?').run(id);
    })();
    dropRuns(d, runs);
    deleteInfo(d.db, evalGroup(id));
    const dir = path.join(EVALS_ROOT, id);
    if (path.dirname(dir) === EVALS_ROOT) fs.rmSync(dir, { recursive: true, force: true });
    tell(d, [id]);
  });
}

// ---- every run's mark ------------------------------------------------------------------------------------------

/** The longest a run waits to be marked before it starts (the mark is still made, a little later). */
const STAMP_WAIT_MS = 5000;

const mark = (ev: Evaluation, changed: SealChange[]): NonNullable<RunRecord['sealed']>[number] => ({
  evaluation: ev.id,
  name: ev.name,
  ok: !changed.length,
  ...(changed.length ? { changed: changed.slice(0, 10).map((c) => c.path) } : {}),
});

async function markPlain(d: Deps, r: RunRecord) {
  const sealed = [];
  for (const { evaluation, root } of await evaluationsFor(d.db, r.cwd)) sealed.push(mark(evaluation, (await compare(d.db, evaluation, root, { absentOk: true })).changed));
  if (!sealed.length) return;
  updateRun(d.db, r.id, { info: { sealed } });
  tellRuns(d, [r.id]);
}

/**
 * Just before a run starts here. A run that scores an evaluation is checked again, and does not start when the files
 * differ (this throws). Any other run in an evaluation's folder is marked with whether they are as sealed; that
 * never fails the run, and costs nothing when there are no evaluations.
 */
export async function stampRun(d: Deps, r: RunRecord): Promise<void> {
  tables(d.db);
  const own = isScoringRun(r) ? scoreOfRun(d.db, r.id) : undefined;
  if (own) {
    watchScores();
    tell(d, [own.eval]);
    const ev = getEvaluation(d.db, own.eval);
    if (!ev) throw new Error('Its evaluation was removed');
    if (ev.seal.n !== own.seal) throw new Error('The evaluation was sealed again before this could start: score it again');
    // Not everything read again: the score's own check just did, and a file written since has a new change time.
    const { changed } = await compare(d.db, ev, r.cwd);
    await dropCompiled(d.db, ev, r.cwd);
    updateRun(d.db, r.id, { info: { sealed: [mark(ev, changed)] } });
    if (changed.length) throw new Error(changedWords(stateOf(changed)));
    return;
  }
  if (!d.db.prepare('select 1 from exp_evals limit 1').get()) return;
  const work = markPlain(d, r).catch((e) => console.error(`[experiments] ${r.id}: its evaluation could not be checked:`, (e as Error)?.message ?? e));
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([work, new Promise<void>((resolve) => (timer = setTimeout(resolve, STAMP_WAIT_MS)))]);
  clearTimeout(timer);
}
