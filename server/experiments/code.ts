// The code a run on this computer runs is the code as it was when it was queued. A run can wait hours for a GPU or for
// the night while the same folder is edited for the next experiment, so when it is put in line its code is read: the
// commit, the changes not committed (a patch, and the binary files the patch leaves out), the files its command names
// that git does not track, and the folder's other untracked files that are code or settings. When it starts, the
// folder is compared with that. The same: it runs in its folder, as ever. Changed: it runs from a copy of the code as
// queued, made in its own folder under code/, with everything that is data linked to the original, so it reads its data
// and writes its outputs where they are expected; what it creates in the copy is moved back when it ends, and the copy
// is taken down to what could not be moved.
//
// Each file is code or data, decided when the run is queued (isCode): outputs are not code, or a run that rewrites a
// results file would send every later run into a copy, and a copy would keep its results from the folder.
//
// Nothing here changes the person's repository (the copy borrows its objects, and has a .git of its own) or overwrites
// a file of theirs: the only writes into their folder are the new files a run made in its copy (bringBack).
//
// In the run's folder: code.json (what was read: the manifest), changes.patch and untracked/ (as a run keeps them),
// code-files/ (the other kept files), code/ (the copy it runs from), code-view/ (a copy made to look at),
// code-laid.json (what the copy was made of), code-left.json (what stayed in a copy), code-making, code-used and their
// code-view- kin (a copy is being made, or was made: only with one of them is the folder the app's, a run may write a
// folder of that name itself).
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { JobSpec, QueuedCode, RunRecord } from '../../shared/experiments.ts';
import { agentBaseEnv } from '../env.ts';
import { pathDirs, WIN } from '../platform.ts';
import { appData, captureGit, commandOutputs, commandWords, freeName, inside, KEEP_ALL, localShell, MAX_PATCH, packageFile, pythonOf, readToKeep, real, untrackedNamed, type Named } from './capture.ts';
import { RUNS_ROOT } from './records.ts';
import { runFile } from './sweeps.ts';

// ---- git ------------------------------------------------------------------------------------------------------

type Env = Record<string, string>;

/** The variables that would send git somewhere else than the folder it is run in. */
const GIT_ELSEWHERE = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_NAMESPACE'];

interface Done {
  code: number;
  out: Buffer;
  err: string;
}

/** Runs git (no shell); no hooks, and no lock taken on the index just to look. Its output is cut at `max` bytes. */
function git(cwd: string, args: string[], o: { env?: Env; input?: string; max?: number; timeoutMs?: number } = {}): Promise<Done> {
  const env: NodeJS.ProcessEnv = { ...(o.env ?? agentBaseEnv()), GIT_OPTIONAL_LOCKS: '0' };
  for (const k of GIT_ELSEWHERE) delete env[k];
  const max = o.max ?? 32 << 20;
  return new Promise((resolve) => {
    let p;
    try {
      p = spawn('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'core.quotePath=false', ...args], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      return resolve({ code: 127, out: Buffer.alloc(0), err: (e as Error).message });
    }
    const chunks: Buffer[] = [];
    let n = 0;
    let err = '';
    const timer = setTimeout(() => p.kill('SIGKILL'), o.timeoutMs ?? 120_000);
    p.stdout.on('data', (d: Buffer) => {
      if (n < max) chunks.push(d);
      n += d.length;
    });
    p.stderr.on('data', (d: Buffer) => {
      if (err.length < 4000) err += d.toString('utf8');
    });
    p.stdin.on('error', () => {});
    p.stdin.end(o.input ?? '');
    const end = (code: number, why = err) => {
      clearTimeout(timer);
      const all = Buffer.concat(chunks);
      resolve({ code, out: all.subarray(0, max), err: why });
    };
    p.on('error', (e) => end(127, e.message));
    p.on('close', (code) => end(code ?? 1));
  });
}

async function must(cwd: string, args: string[], o: Parameters<typeof git>[2] = {}): Promise<Buffer> {
  const r = await git(cwd, args, o);
  if (r.code !== 0) throw new Error(r.err.trim().split('\n').pop() || `git ${args[0]} failed`);
  return r.out;
}

const zList = (b: Buffer) => b.toString('utf8').split('\0').filter(Boolean);

const sha256 = (data: Buffer | string) => crypto.createHash('sha256').update(data).digest('hex');

const lstat = (p: string) => {
  try {
    return fs.lstatSync(p);
  } catch {
    return null;
  }
};

const fileSha = (file: string): string => {
  try {
    return fs.statSync(file).isFile() ? sha256(fs.readFileSync(file)) : '';
  } catch {
    return '';
  }
};

// ---- the manifest ---------------------------------------------------------------------------------------------

/** A file kept as a copy. */
export interface CodeFile {
  /** Its path in the repository; for one outside it, the word the command named it by. */
  path: string;
  sha: string;
  /** Where its copy is, in the run's folder. */
  store: string;
  mode?: number;
  /** One outside the repository: where it is. */
  outside?: string;
  /** Code or settings: it counts as part of the code. Others (data the command names) are kept for the record only. */
  code?: true;
}

/** A file that is part of the code and too large to keep: as it was then, by its size and time. */
interface Large {
  path: string;
  at: string;
  size: number;
  mtimeMs: number;
}

export interface Manifest {
  at: number;
  /** The repository's top folder, the folder all its worktrees share, and where the run's folder is in it. */
  top: string;
  common: string;
  sub: string;
  commit: string;
  branch?: string;
  dirty?: boolean;
  untracked?: number;
  /** The tracked code files that differed from the commit: the blob each was ('' deleted); a short one is a prefix. */
  changed: Record<string, string>;
  /** The tracked files that differed and are data: never put into a copy. */
  data: string[];
  /** What the command writes: never code. */
  outputs: Outputs;
  /** The binary ones among them, which the patch leaves out: where their copies are ('' deleted, none: too large). */
  binary: Record<string, string>;
  patch?: { sha: string; cut: boolean };
  files: CodeFile[];
  large: Large[];
  /** The submodules: what each was. */
  subs: Record<string, string>;
  /** As the record lists them: the files the command names that git does not track. */
  kept: string[];
  notKept: string[];
}

// ---- code or data ---------------------------------------------------------------------------------------------

/** The endings that make a file git does not track code or settings (.json and .txt are not among them: results are written so). */
export const CODE_ENDINGS = ['py', 'sh', 'bash', 'yaml', 'yml', 'toml', 'cfg', 'ini', 'conf', 'jinja', 'j2', 'sql', 'r', 'jl', 'lua', 'js', 'ts', 'mjs'];
const CODE_LIKE = new RegExp(`\\.(${CODE_ENDINGS.join('|')})$`, 'i');
/** The endings of data: a file with one is never code, tracked or not. */
const DATA_LIKE = /\.(csv|tsv|jsonl|ndjson|log|out|parquet|feather|pkl|pickle|pt|pth|ckpt|safetensors|npy|npz|h5|hdf5|db|sqlite|sqlite3)$/i;
/** Programs' sources: code even inside a folder the command writes to. */
const SOURCE = /\.(py|sh|bash|jinja|j2|sql|r|jl|lua|js|ts|mjs)$/i;

/** What a command writes: files, and folders, by their paths in the repository (outside it: whole paths). */
export interface Outputs {
  files: string[];
  dirs: string[];
}

/** Whether the command writes this file: it names it so, or it is in a folder it names so (and no program's source). */
export const isOutput = (file: string, o: Outputs) => o.files.includes(file) || (!SOURCE.test(file) && o.dirs.some((d) => file.startsWith(`${d}/`)));

/**
 * Whether a file is part of a run's code (compared when it starts, checked out or put into a copy), or data (never
 * compared; in a copy a link to the original, so what is written lands in the folder). Decided from what is known when
 * the run is queued: its path, whether git tracks it, whether the command names it, what the command writes.
 * Data: what the command writes, and what has a data ending. Of the rest, code: what git tracks, what the command names,
 * and what has a code ending.
 */
export function isCode(file: { path: string; tracked?: boolean; named?: boolean }, outputs: Outputs): boolean {
  if (isOutput(file.path, outputs) || DATA_LIKE.test(file.path)) return false;
  return !!file.tracked || !!file.named || CODE_LIKE.test(file.path);
}

/** The commands a run may run: its own, and the one that carries on from a checkpoint. */
const commandsOf = (s: Pick<JobSpec, 'command' | 'resume'>) => (s.resume ? [s.command, s.resume] : [s.command]);

/** What a run's commands, metrics file and scores file say it writes, in the repository whose top is `top`. */
export function outputsOf(spec: Spec, top: string, id: string, folder: string): Outputs {
  const cwd = real(path.resolve(spec.cwd));
  const home = os.homedir();
  const own = [spec.metricsFile, spec.scoresFile].flatMap((f) => (f ? [runFile({ id, command: spec.command, params: spec.params, seed: spec.seed }, f, folder)] : []));
  const out: Outputs = { files: [], dirs: [] };
  for (const word of [...commandsOf(spec).flatMap((c) => commandOutputs(c)), ...own]) {
    const abs = path.resolve(cwd, word.replace(/^(~|\$HOME|\$\{HOME\})(?=$|\/)/, home));
    // By its folder's real path, as the files themselves are looked at.
    const at = path.join(real(path.dirname(abs)), path.basename(abs));
    const rel = inside(at, top) ? path.relative(top, at).split(path.sep).join('/') : at;
    out.files.push(rel);
    const is = fs.statSync(at, { throwIfNoEntry: false });
    // A folder it writes into: below the run's own folder or beside it, never the folder itself or one above it.
    if ((is ? is.isDirectory() : word.endsWith('/') || !path.extname(at)) && inside(at, top) && at !== cwd && !inside(cwd, at)) out.dirs.push(rel);
  }
  return { files: [...new Set(out.files)], dirs: [...new Set(out.dirs)] };
}

/** Most untracked code files looked at in one folder. */
const MAX_OTHERS = 5000;

export const isWhole = (m: Manifest) => !m.patch?.cut && !m.large.length;

const MANIFEST = 'code.json';

export function loadManifest(folder: string): Manifest | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(folder, MANIFEST), 'utf8')) as Manifest;
  } catch {
    return null;
  }
}

/** The record's identity of what was kept. */
export function identityOf(m: Manifest): QueuedCode {
  const kept = m.files.filter((f) => f.code);
  return {
    at: m.at,
    commit: m.commit,
    ...(m.patch ? { patch: m.patch.sha } : {}),
    files: Object.fromEntries(kept.map((f) => [f.path, f.sha])),
    whole: isWhole(m),
    changed: Object.keys(m.changed).length,
    changedFiles: Object.keys(m.changed).slice(0, SAID),
  };
}

/** How many files of each kind the line about the kept code names. */
const SAID = 3;

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** " (a.py, b.py and 3 more)": the first of `all` files, by name; nothing when none is known. */
const named = (some: string[], all: number) => (some.length ? ` (${some.slice(0, SAID).join(', ')}${all > Math.min(some.length, SAID) ? ` and ${all - Math.min(some.length, SAID)} more` : ''})` : '');

/** For agents: what was kept, in a few words ("commit 1a2b3c4 with 1 changed file (train.py) and 1 file not in git (prep.py)"). */
export function codeWords(q: QueuedCode): string {
  const files = Object.keys(q.files);
  const parts = [q.changed ? `${count(q.changed, 'changed file')}${named(q.changedFiles ?? [], q.changed)}` : '', files.length ? `${count(files.length, 'file')} not in git${named(files, files.length)}` : ''].filter(Boolean);
  const words = `commit ${q.commit.slice(0, 7)}${parts.length ? ` with ${parts.join(' and ')}` : ''}`;
  return q.whole ? words : `${words}. It could not all be kept (too large): if what was not kept changes before it starts, and something else does too, it fails rather than run other code. code: "now" runs the folder as it is then`;
}

// ---- reading a folder -----------------------------------------------------------------------------------------

interface Repo {
  top: string;
  common: string;
  sub: string;
  commit: string;
}

/** Whether a folder looks to be in a git repository (a .git at it or above): looked at without starting git. */
export function underGit(dir: string): boolean {
  for (let at = real(path.resolve(dir)); ; at = path.dirname(at)) {
    if (fs.existsSync(path.join(at, '.git'))) return true;
    if (path.dirname(at) === at) return false;
  }
}

/** The repository a folder is in, with a commit; null otherwise (and on Windows, where a run records no code). */
export async function repoOf(cwd: string, env?: Env): Promise<Repo | null> {
  if (WIN) return null;
  const r = await git(cwd, ['rev-parse', '--show-toplevel', '--git-common-dir', '--show-prefix'], { env, timeoutMs: 20_000 });
  if (r.code !== 0) return null;
  const [top, common, prefix] = r.out.toString('utf8').split('\n');
  const head = await git(cwd, ['rev-parse', '-q', '--verify', 'HEAD^{commit}'], { env, timeoutMs: 20_000 });
  if (!top || !common || head.code !== 0) return null;
  return { top: real(top), common: real(path.resolve(cwd, common)), sub: (prefix ?? '').replace(/\/$/, ''), commit: head.out.toString('utf8').trim() };
}

/** The blob git would make of each of these files as they are now ('' where there is no file). */
async function blobsNow(top: string, rels: string[], algo: string, env?: Env): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const files: string[] = [];
  for (const rel of rels) {
    const at = path.join(top, rel);
    const st = lstat(at);
    if (st?.isSymbolicLink()) {
      // A link's blob is its text.
      const to = Buffer.from(fs.readlinkSync(at));
      out.set(rel, crypto.createHash(algo).update(`blob ${to.length}\0`).update(to).digest('hex'));
    } else if (st?.isFile() && !rel.includes('\n')) files.push(rel);
    else out.set(rel, '');
  }
  if (files.length) {
    const got = (await must(top, ['hash-object', '--stdin-paths'], { env, input: `${files.join('\n')}\n` })).toString('utf8').split('\n');
    files.forEach((rel, i) => out.set(rel, got[i] ?? ''));
  }
  return out;
}

const algoOf = (commit: string) => (commit.length > 40 ? 'sha256' : 'sha1');

/** What a submodule is: its commit, and its own changes when it has some; '' when it is not there. */
async function subState(dir: string, env?: Env): Promise<string> {
  if (!lstat(path.join(dir, '.git'))) return '';
  const head = await git(dir, ['rev-parse', 'HEAD'], { env });
  const status = await git(dir, ['status', '--porcelain'], { env });
  const diff = status.out.length ? (await git(dir, ['diff', 'HEAD', '--no-ext-diff', '--no-textconv'], { env })).out : Buffer.alloc(0);
  return `${head.out.toString('utf8').trim()}${status.out.length ? ` ${sha256(Buffer.concat([status.out, diff]))}` : ''}`;
}

/** What is read of a folder once, for one run or for all the runs of a sweep. */
interface Snapshot {
  repo: Repo;
  record: { branch?: string; dirty?: boolean; untracked?: number };
  changed: Record<string, string>;
  patch: Buffer | null;
  binary: { rel: string; data: Buffer | null; deleted: boolean; size: number; mtimeMs: number }[];
  subs: Record<string, string>;
  /** The folder's untracked files that are code or settings, those under the run's folder first. */
  others: { rel: string; at: string; read: ReturnType<typeof readToKeep> }[];
  /** For each command, the files it names that git does not track. */
  named: Map<string, { file: Named; read: ReturnType<typeof readToKeep> }[]>;
}

/** How often a folder was read (the tests see a sweep reads it once). */
export const counts = { reads: 0 };

async function readFolder(cwd: string, env: Env, commands: string[]): Promise<Snapshot | null> {
  const repo = await repoOf(cwd, env);
  if (!repo) return null;
  counts.reads++;
  const { top, commit } = repo;
  const sh = localShell(cwd, env);
  const rec = await captureGit(sh, { patch: false });

  const gitlinks = new Set(
    zList(await must(top, ['ls-files', '-s', '-z'], { env }))
      .filter((l) => l.startsWith('160000'))
      .map((l) => l.slice(l.indexOf('\t') + 1)),
  );
  const subs: Record<string, string> = {};
  for (const rel of gitlinks) subs[rel] = await subState(path.join(top, rel), env);

  const diffArgs = ['diff', '--no-color', '--no-ext-diff', '--no-textconv', '--no-renames', '--no-relative'];
  const names = zList(await must(top, [...diffArgs, '--name-only', '-z', commit, '--'], { env })).filter((rel) => !gitlinks.has(rel));
  const changed = Object.fromEntries(await blobsNow(top, names, algoOf(commit), env));
  let patch: Buffer | null = null;
  const binary: Snapshot['binary'] = [];
  if (names.length) {
    const diffOf = (without: string[]) =>
      git(top, [...diffArgs, '--src-prefix=a/', '--dst-prefix=b/', '--submodule=short', commit, '--', ...(without.length ? ['.', ...without.map((p) => `:(top,exclude,literal)${p}`)] : [])], { env, max: MAX_PATCH + 1 });
    let diff = await diffOf([]);
    // Cut because of data (a large results table changed): the code's changes alone, so that the code is whole.
    const data = names.filter((rel) => DATA_LIKE.test(rel));
    if (diff.out.length > MAX_PATCH && data.length) diff = await diffOf(data.slice(0, 500));
    patch = diff.out.length ? diff.out : null;
    for (const line of zList(await must(top, [...diffArgs, '--numstat', '-z', commit, '--'], { env }))) {
      const m = /^-\t-\t([\s\S]+)$/.exec(line);
      if (!m || gitlinks.has(m[1])) continue;
      const at = path.join(top, m[1]);
      const st = lstat(at);
      binary.push({ rel: m[1], deleted: !st, data: st?.isFile() && st.size <= KEEP_ALL ? fs.readFileSync(at) : null, size: st?.size ?? 0, mtimeMs: st?.mtimeMs ?? 0 });
    }
  }

  // The folder's other untracked files that are code or settings.
  const globs = CODE_ENDINGS.map((e) => `:(top,icase,glob)**/*.${e}`);
  const listed = zList(await must(top, ['ls-files', '-z', '--others', '--exclude-standard', '--', ...globs], { env }));
  const data = appData();
  // In a worktree the app made, being under the app's data says nothing.
  const own = data.some((d) => inside(top, d));
  const under = (rel: string) => !repo.sub || rel.startsWith(`${repo.sub}/`);
  const others: Snapshot['others'] = [];
  let total = 0;
  // Packages (a virtual environment in the folder) are not the person's code: left out before the count.
  const mine = listed.filter((rel) => !packageFile(path.join(top, rel)));
  for (const rel of mine.sort((a, b) => Number(under(b)) - Number(under(a)) || a.localeCompare(b)).slice(0, MAX_OTHERS)) {
    const at = path.join(top, rel);
    const to = real(at);
    const st = lstat(at);
    // A link that leads out of the repository is left alone, as are packages and the app's own data.
    if (!st || !inside(to, top) || (!own && data.some((d) => inside(to, d)))) continue;
    // Past what can be kept at all, files are only looked at, not read.
    const names = [rel, path.relative(top, to)].map((n) => (own ? `/${n}` : path.join(top, n)));
    const seen = total > 4 * KEEP_ALL ? statOnly(to) : readToKeep(names, to);
    total += seen?.data?.length ?? 0;
    others.push({ rel, at, read: seen });
  }

  const named: Snapshot['named'] = new Map();
  const reads = new Map<string, ReturnType<typeof readToKeep>>();
  for (const command of new Set(commands)) {
    named.set(
      command,
      (await untrackedNamed(sh, command, cwd)).map((file) => {
        if (!reads.has(file.at)) reads.set(file.at, readToKeep(file.names, file.at));
        return { file, read: reads.get(file.at)! };
      }),
    );
  }
  return { repo, record: { branch: rec.branch, dirty: rec.dirty, untracked: rec.untracked }, changed, patch, binary, subs, others, named };
}

function statOnly(at: string): ReturnType<typeof readToKeep> {
  try {
    const st = fs.statSync(at);
    return { data: null, size: st.size, mtimeMs: st.mtimeMs, mode: st.mode & 0o777 };
  } catch {
    return null;
  }
}

type Spec = Pick<JobSpec, 'command' | 'resume' | 'cwd' | 'env' | 'metricsFile' | 'scoresFile' | 'params' | 'seed'>;

const envOf = (spec: Pick<JobSpec, 'env'>): Env => ({ ...agentBaseEnv(), ...spec.env });

/** Reads each folder once for all the runs given together (a sweep's runs come from one folder at one moment). */
export function codeReader(specs: Spec[] = []) {
  const keyOf = (s: Spec) => JSON.stringify([s.cwd, s.env ?? {}]);
  const read = new Map<string, Promise<Snapshot | null>>();
  return (spec: Spec): Promise<Snapshot | null> => {
    const key = keyOf(spec);
    let p = read.get(key);
    if (!p) {
      p = readFolder(spec.cwd, envOf(spec), [spec, ...specs.filter((s) => keyOf(s) === key)].flatMap(commandsOf));
      read.set(key, p);
    }
    return p;
  };
}

export type CodeReader = ReturnType<typeof codeReader>;

/** The files of the run's folder that hold its kept code: gone before it is read again. */
function forget(folder: string) {
  for (const n of [MANIFEST, 'changes.patch', 'untracked', 'code-files']) fs.rmSync(path.join(folder, n), { recursive: true, force: true });
}

const write = (folder: string, store: string, data: Buffer) => {
  const file = path.join(folder, store);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, data, { mode: 0o600 });
};

/** Writes what one run keeps of a folder that was read: its patch, its files, within the limits; and its manifest. */
function writeCode(snap: Snapshot, spec: Spec, id: string, folder: string, at = Date.now()): Manifest {
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  forget(folder);
  const { repo } = snap;
  const outputs = outputsOf(spec, repo.top, id, folder);
  const tracked = (rel: string) => isCode({ path: rel, tracked: true }, outputs);
  const m: Manifest = {
    at,
    top: repo.top,
    common: repo.common,
    sub: repo.sub,
    commit: repo.commit,
    ...snap.record,
    changed: Object.fromEntries(Object.entries(snap.changed).filter(([rel]) => tracked(rel))),
    data: Object.keys(snap.changed).filter((rel) => !tracked(rel)),
    outputs,
    binary: {},
    files: [],
    large: [],
    subs: snap.subs,
    kept: [],
    notKept: [],
  };
  if (snap.patch) {
    const cut = snap.patch.length > MAX_PATCH;
    const kept = cut ? Buffer.concat([snap.patch.subarray(0, MAX_PATCH), Buffer.from('\n# Hydor: the patch was cut at 2 MB.\n')]) : snap.patch;
    write(folder, 'changes.patch', kept);
    m.patch = { sha: sha256(snap.patch), cut };
  }
  let total = 0;
  const fits = (n: number) => total + n <= KEEP_ALL && (total += n, true);
  const large = (p: string, file: string, size: number, mtimeMs: number) => m.large.push({ path: p, at: file, size, mtimeMs });

  for (const b of snap.binary) {
    if (!tracked(b.rel)) continue;
    if (b.deleted) m.binary[b.rel] = '';
    else if (b.data && fits(b.data.length)) {
      const store = `code-files/${b.rel}`;
      write(folder, store, b.data);
      m.binary[b.rel] = store;
    } else large(b.rel, path.join(repo.top, b.rel), b.size, b.mtimeMs);
  }

  const here = path.join(repo.top, repo.sub);
  const taken = new Set<string>();
  const names = new Set<string>();
  const outsideDir = path.join(folder, 'untracked', 'outside');
  for (const { file, read } of commandsOf(spec).flatMap((c) => snap.named.get(c) ?? [])) {
    // (A file both commands name is kept once.)
    if (!read || m.kept.includes(file.listed) || m.notKept.includes(file.listed)) continue;
    const inRepo = !file.outside ? [repo.sub, file.listed].filter(Boolean).join('/') : inside(file.at, repo.top) ? path.relative(repo.top, file.at) : null;
    const asOutput = file.outside ? file.at : path.relative(repo.top, path.join(here, file.listed));
    const code = isCode({ path: asOutput, named: true }, outputs);
    if (inRepo) taken.add(inRepo);
    if (!read.data || !fits(read.data.length)) {
      m.notKept.push(file.listed);
      // A large checkpoint or data file is data: it is used where it is. Large code or settings make the code incomplete.
      if (code && (CODE_LIKE.test(file.listed) || /\.(json|txt)$/i.test(file.listed))) large(inRepo ?? file.listed, file.at, read.size, read.mtimeMs);
      continue;
    }
    const store = file.outside ? `untracked/outside/${freeName(outsideDir, file.base, names)}` : `untracked/${file.listed}`;
    write(folder, store, read.data);
    m.kept.push(file.listed);
    m.files.push({ path: inRepo ?? file.listed, sha: sha256(read.data), store, mode: read.mode, ...(inRepo ? {} : { outside: file.at }), ...(code ? { code: true as const } : {}) });
  }
  for (const { rel, at: file, read } of snap.others) {
    if (!read || taken.has(rel) || !isCode({ path: rel }, outputs)) continue;
    if (!read.data || !fits(read.data.length)) {
      large(rel, file, read.size, read.mtimeMs);
      continue;
    }
    const store = `code-files/${rel}`;
    write(folder, store, read.data);
    m.files.push({ path: rel, sha: sha256(read.data), store, mode: read.mode, code: true });
  }
  fs.writeFileSync(path.join(folder, MANIFEST), JSON.stringify(m), { mode: 0o600 });
  return m;
}

/** Reads a run's code (with `read`, shared with the other runs of a sweep) and keeps it in its folder; null outside a repository. */
export async function takeCode(read: CodeReader, spec: Spec, id: string, folder: string): Promise<Manifest | null> {
  const snap = await read(spec);
  return snap ? writeCode(snap, spec, id, folder) : null;
}

/**
 * The folder was the same as queued when the run started: files its command names that were not there at queue time
 * (made by a step before it) are kept too, as a run keeps what it names.
 */
export async function keepNewlyNamed(m: Manifest, spec: Spec, folder: string): Promise<Manifest> {
  const env = envOf(spec);
  const have = new Set([...m.kept, ...m.notKept]);
  const sh = localShell(spec.cwd, env);
  const named = (await Promise.all(commandsOf(spec).map((c) => untrackedNamed(sh, c, spec.cwd)))).flat();
  const more = named.filter((f, i) => !have.has(f.listed) && named.findIndex((x) => x.listed === f.listed) === i);
  if (!more.length) return m;
  let total = m.files.reduce((n, f) => n + (lstat(path.join(folder, f.store))?.size ?? 0), 0);
  const names = new Set<string>();
  for (const f of more) {
    const got = readToKeep(f.names, f.at);
    if (!got) continue;
    if (!got.data || total + got.size > KEEP_ALL) {
      m.notKept.push(f.listed);
      continue;
    }
    total += got.size;
    const store = f.outside ? `untracked/outside/${freeName(path.join(folder, 'untracked', 'outside'), f.base, names)}` : `untracked/${f.listed}`;
    write(folder, store, got.data);
    m.kept.push(f.listed);
    // Kept for the record: it appeared after the run was queued, so it is no part of what was queued.
    m.files.push({ path: f.outside ? f.listed : [m.sub, f.listed].filter(Boolean).join('/'), sha: sha256(got.data), store, ...(f.outside ? { outside: f.at } : {}) });
  }
  fs.writeFileSync(path.join(folder, MANIFEST), JSON.stringify(m), { mode: 0o600 });
  return m;
}

// ---- comparing --------------------------------------------------------------------------------------------------

/** A path as the repository has it, or where it really is. */
const whereIs = (m: Manifest, f: CodeFile) => f.outside ?? path.join(m.top, f.path);

const largeChanged = (x: Large) => {
  try {
    const st = fs.statSync(x.at);
    return st.size !== x.size || st.mtimeMs !== x.mtimeMs;
  } catch {
    return true;
  }
};

/**
 * What of a run's kept code the folder no longer has as it was: tracked code files (whatever was committed meanwhile,
 * their content is what counts), the kept untracked code, what was too large to keep. Data is not looked at. A file new
 * since then is not a change, tracked or not: the code that was queued did not know it. Empty: the folder is the code
 * as kept.
 */
export async function differences(m: Manifest, cwd: string, env?: Env): Promise<string[]> {
  const repo = await repoOf(cwd, env);
  if (!repo || repo.sub !== m.sub) return ['the repository'];
  const top = repo.top;
  if ((await git(top, ['cat-file', '-e', `${m.commit}^{commit}`], { env })).code !== 0) return ['the commit'];
  const diff = zList(await must(top, ['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--no-relative', '--name-only', '-z', m.commit, '--'], { env }));
  const kept = new Set(m.files.filter((f) => f.code && !f.outside).map((f) => f.path));
  const rels = [...new Set([...diff, ...Object.keys(m.changed)])].filter((rel) => !(rel in m.subs) && !kept.has(rel) && isCode({ path: rel, tracked: true }, m.outputs));
  const now = await blobsNow(top, rels, algoOf(m.commit), env);
  // What the commit had, for the files that were not changed then.
  const asked = rels.filter((rel) => !(rel in m.changed));
  const was = new Map<string, string>();
  for (let i = 0; i < asked.length; i += 200)
    for (const line of zList(await must(top, ['--literal-pathspecs', 'ls-tree', '-z', m.commit, '--', ...asked.slice(i, i + 200)], { env }))) {
      const tab = line.indexOf('\t');
      was.set(line.slice(tab + 1), line.slice(0, tab).split(' ')[2]);
    }
  const out: string[] = [];
  for (const rel of rels) {
    // New since it was queued.
    if (!(rel in m.changed) && !was.has(rel)) continue;
    const want = rel in m.changed ? m.changed[rel] : was.get(rel)!;
    const is = now.get(rel) ?? '';
    if (want ? !is.startsWith(want) : !!is) out.push(rel);
  }
  for (const [rel, state] of Object.entries(m.subs)) if ((await subState(path.join(top, rel), env)) !== state) out.push(rel);
  for (const f of m.files) if (f.code && fileSha(whereIs(m, f)) !== f.sha) out.push(f.path);
  for (const x of m.large) if (!(x.path in m.changed) && largeChanged(x)) out.push(x.path);
  return [...new Set(out)].sort();
}

// ---- the copy ---------------------------------------------------------------------------------------------------

/** Why a copy cannot be made as the code was; `large`: because not all of it could be kept. */
export class NoCopy extends Error {
  large: boolean;
  constructor(message: string, large = false) {
    super(message);
    this.large = large;
  }
}

/** Whether what was kept is enough to make the code again now: throws why not. */
export async function enough(m: Manifest, env?: Env): Promise<void> {
  if (m.patch?.cut) throw new NoCopy('its changes were too large to keep', true);
  for (const x of m.large) {
    // A tracked file that was too large is as good as kept while it is as it was.
    if (x.path in m.changed ? (await blobsNow(m.top, [x.path], algoOf(m.commit), env)).get(x.path) !== m.changed[x.path] : largeChanged(x)) throw new NoCopy(`${x.path} was too large to keep`, true);
  }
}

/** A path inside the copy whose folders are all the copy's own (never through a link out of it). */
function ownParent(root: string, rel: string): string {
  const parts = rel.split('/');
  if (!rel || path.isAbsolute(rel) || parts.some((p) => !p || p === '..' || p === '.') || parts[0] === '.git') throw new NoCopy(`${rel} cannot be put in it`);
  let at = root;
  for (const part of parts.slice(0, -1)) {
    at = path.join(at, part);
    const st = lstat(at);
    if (!st) fs.mkdirSync(at, { mode: 0o755 });
    else if (!st.isDirectory()) throw new NoCopy(`${rel} cannot be put in it`);
  }
  return path.join(at, parts[parts.length - 1]);
}

function put(root: string, rel: string, from: string, mode?: number) {
  const at = ownParent(root, rel);
  if (lstat(at)?.isDirectory()) throw new NoCopy(`${rel} cannot be put in it`);
  fs.rmSync(at, { force: true });
  fs.copyFileSync(from, at, fs.constants.COPYFILE_EXCL);
  // A copy is the run's to write to.
  fs.chmodSync(at, mode && mode & 0o100 ? 0o755 : 0o644);
}

/** The commit's files in a repository of the copy's own, which borrows the original's objects: nothing there is written. */
async function checkout(m: Manifest, code: string, env: Env): Promise<void> {
  const format = algoOf(m.commit) === 'sha256' ? ['--object-format=sha256'] : [];
  await must(path.dirname(code), ['init', '-q', '--template=', ...format, code], { env });
  const dot = path.join(code, '.git');
  fs.mkdirSync(path.join(dot, 'objects', 'info'), { recursive: true });
  fs.writeFileSync(path.join(dot, 'objects', 'info', 'alternates'), `${path.join(m.common, 'objects')}\n`);
  if (fs.existsSync(path.join(m.common, 'shallow'))) fs.copyFileSync(path.join(m.common, 'shallow'), path.join(dot, 'shallow'));
  // The settings that decide how files are written out, as the original has them.
  for (const key of ['core.autocrlf', 'core.eol', 'core.filemode', 'core.symlinks']) {
    const r = await git(m.top, ['config', '--local', '--get', key], { env });
    if (r.code === 0) await must(code, ['config', key, r.out.toString('utf8').trim()], { env });
  }
  if (m.branch && (await git(code, ['check-ref-format', `refs/heads/${m.branch}`], { env })).code === 0) {
    await must(code, ['update-ref', `refs/heads/${m.branch}`, m.commit], { env });
    await must(code, ['symbolic-ref', 'HEAD', `refs/heads/${m.branch}`], { env });
  } else await must(code, ['update-ref', '--no-deref', 'HEAD', m.commit], { env });
  await must(code, ['read-tree', m.commit], { env });
  await must(code, ['checkout-index', '-a', '-f', '-q'], { env: { ...env, GIT_LFS_SKIP_SMUDGE: '1' }, timeoutMs: 30 * 60_000 });
}

/** Large files kept by Git LFS came out as pointers: the original's file is taken when it is the one pointed at. */
async function fillLfs(m: Manifest, code: string, env: Env): Promise<void> {
  const files = zList(await must(code, ['ls-files', '-z'], { env }));
  for (const rel of files) {
    const at = path.join(code, rel);
    const st = lstat(at);
    // Data is the original's own file anyway (linked).
    if (!st?.isFile() || st.size > 1024 || rel in m.changed || !isCode({ path: rel, tracked: true }, m.outputs)) continue;
    const text = fs.readFileSync(at, 'utf8');
    if (!text.startsWith('version https://git-lfs.github.com/spec/')) continue;
    const oid = /^oid sha256:([0-9a-f]{64})$/m.exec(text)?.[1];
    if (!oid || fileSha(path.join(m.top, rel)) !== oid) throw new NoCopy(`${rel} is kept by Git LFS and the folder has another version of it`);
    put(code, rel, path.join(m.top, rel), st.mode);
  }
}

/** The commit's files, the changes and the kept files over them; each changed file is then checked to be as it was. */
async function lay(m: Manifest, folder: string, code: string, env: Env, view: boolean): Promise<void> {
  await checkout(m, code, env);
  await fillLfs(m, code, env);
  if (m.patch) {
    const out = [...new Set([...Object.keys(m.binary), ...m.large.map((x) => x.path).filter((p) => p in m.changed), ...Object.keys(m.subs), ...m.data])];
    const exclude = out.map((p) => `--exclude=${p.replace(/[*?[\]\\]/g, '\\$&')}`);
    const r = await git(code, ['apply', '--allow-empty', '--whitespace=nowarn', ...exclude, path.join(folder, 'changes.patch')], { env });
    if (r.code !== 0) throw new NoCopy(`the changes did not go on: ${r.err.trim().split('\n')[0]}`);
  }
  for (const [rel, store] of Object.entries(m.binary)) {
    if (store) put(code, rel, path.join(folder, store), lstat(path.join(code, rel))?.mode);
    else fs.rmSync(ownParent(code, rel), { force: true });
  }
  for (const x of m.large) if (x.path in m.changed) put(code, x.path, x.at);
  const now = await blobsNow(code, Object.keys(m.changed), algoOf(m.commit), env);
  for (const [rel, want] of Object.entries(m.changed)) {
    const is = now.get(rel) ?? '';
    if (want ? !is.startsWith(want) : !!is) throw new NoCopy(`${rel} did not come out as it was`);
  }
  for (const f of m.files) {
    // Data stays where it is (it is linked); to look at the code, all that was kept is there.
    if (f.outside || (!f.code && !view)) continue;
    put(code, f.path, path.join(folder, f.store), f.mode);
  }
}

/** A link in the copy to a file of the original; nothing when a folder on the way is a link already, or no folder. */
function linkFile(code: string, rel: string, from: string) {
  let at = code;
  for (const part of rel.split('/').slice(0, -1)) {
    at = path.join(at, part);
    const st = lstat(at);
    if (!st) fs.mkdirSync(at);
    else if (!st.isDirectory()) return;
  }
  const to = path.join(code, rel);
  const there = lstat(to);
  if (there?.isDirectory()) return;
  // Only ever the copy's own file or link makes way.
  if (there) fs.unlinkSync(to);
  fs.symlinkSync(from, to, 'file');
}

/**
 * Tracked files that are data are the original's own in the copy (the checked-out one stays where the original has it no
 * more); files tracked since the run was queued are linked as any other the code does not know. What the command writes
 * and nobody has yet is a link too, so it is written in the folder.
 */
async function linkData(m: Manifest, code: string, env: Env): Promise<void> {
  const list = async (dir: string) =>
    zList(await must(dir, ['ls-files', '-s', '-z'], { env }))
      .filter((l) => !l.startsWith('160000'))
      .map((l) => l.slice(l.indexOf('\t') + 1));
  const queued = new Set(await list(code));
  const skip = real(RUNS_ROOT);
  for (const rel of new Set([...queued, ...(await list(m.top)), ...m.data])) {
    const from = path.join(m.top, rel);
    if (from === skip || inside(from, skip) || rel.split('/')[0] === '.git') continue;
    const there = lstat(from);
    if (!there || there.isDirectory()) continue;
    if (!isCode({ path: rel, tracked: true }, m.outputs)) linkFile(code, rel, from);
    else if (!queued.has(rel) && !(rel in m.changed) && !lstat(path.join(code, rel))) linkFile(code, rel, from);
  }
  for (const rel of m.outputs.files) {
    // Only a file by its name (a folder behind a link that leads nowhere could not be made).
    if (path.isAbsolute(rel) || !(DATA_LIKE.test(rel) || /\.(json|txt)$/i.test(rel))) continue;
    const from = path.join(m.top, rel);
    if (!lstat(from) && !lstat(path.join(code, rel)) && fs.statSync(path.dirname(from), { throwIfNoEntry: false })?.isDirectory()) linkFile(code, rel, from);
  }
}

/** Links everything the folder has that git does not track into the copy, where nothing of the code is. */
async function linkRest(m: Manifest, code: string, env: Env): Promise<void> {
  const skip = [real(RUNS_ROOT)];
  const entries = zList(await must(m.top, ['ls-files', '-z', '--others', '--directory'], { env })).map((e) => e.replace(/\/$/, ''));
  let n = 0;
  const place = (rel: string) => {
    if (!rel || rel === '.git' || rel.startsWith('.git/')) return;
    const from = path.join(m.top, rel);
    if (skip.some((s) => from === s || inside(from, s))) return;
    const parts = rel.split('/');
    let at = code;
    for (const part of parts.slice(0, -1)) {
      at = path.join(at, part);
      const st = lstat(at);
      if (!st) fs.mkdirSync(at);
      // A link on the way already leads to the original; a file of the code is in the way.
      else if (!st.isDirectory()) return;
    }
    const to = path.join(at, parts[parts.length - 1]);
    const st = lstat(to);
    const own = lstat(from);
    if (!own) return;
    if (!st) {
      if (++n > 50_000) throw new NoCopy('the folder has too many files git does not track');
      let dir = own.isDirectory();
      if (own.isSymbolicLink()) dir = !!fs.statSync(from, { throwIfNoEntry: false })?.isDirectory();
      fs.symlinkSync(from, to, dir ? 'dir' : 'file');
    } else if (st.isDirectory() && own.isDirectory()) for (const child of fs.readdirSync(from)) place(`${rel}/${child}`);
  };
  try {
    for (const rel of entries) place(rel);
    // What was too large to keep and is as it was, when it is tracked by now.
    for (const x of m.large) if (!(x.path in m.changed) && inside(x.at, m.top)) place(path.relative(m.top, x.at));
    for (const [rel, state] of Object.entries(m.subs)) {
      if (!state) continue;
      if ((await subState(path.join(m.top, rel), env)) !== state) throw new NoCopy(`the submodule ${rel} has changed`);
      const at = ownParent(code, rel);
      if (lstat(at)?.isDirectory()) fs.rmdirSync(at);
      fs.symlinkSync(path.join(m.top, rel), at, 'dir');
    }
  } catch (e) {
    if (e instanceof NoCopy) throw e;
    throw new NoCopy(`a file could not be linked: ${(e as Error).message}`);
  }
}

type Laid = Record<string, ['d'] | ['l', string] | ['f', number, number, number]>;

/** What a copy holds as made: its folders, its links and where they lead, its files by size and time. */
function laidOf(code: string): Laid {
  const out: Laid = {};
  const walk = (rel: string) => {
    for (const name of fs.readdirSync(path.join(code, rel))) {
      if (!rel && name === '.git') continue;
      const p = rel ? `${rel}/${name}` : name;
      const st = fs.lstatSync(path.join(code, p));
      if (st.isSymbolicLink()) out[p] = ['l', fs.readlinkSync(path.join(code, p))];
      else if (st.isDirectory()) {
        out[p] = ['d'];
        walk(p);
      } else out[p] = ['f', st.size, st.mtimeMs, st.ino];
    }
  };
  walk('');
  return out;
}

const json = <T>(file: string, fallback: T): T => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
};

/** What stayed in the run's copies, by paths in its folder ("code/outputs/x"). */
export const leftFiles = (folder: string): string[] => json<string[]>(path.join(folder, 'code-left.json'), []);

/**
 * A copy made before in the same place goes out of the way: one half made, or one only looked at, is removed; what is
 * left of one that was run in is set aside. A folder of that name the app did not make (the run's own writing) is left
 * alone, and no copy is made.
 */
function setAside(folder: string, name: 'code' | 'code-view') {
  const code = path.join(folder, name);
  if (!lstat(code)) return;
  const used = fs.existsSync(path.join(folder, `${name}-used`));
  if (!used && !fs.existsSync(path.join(folder, `${name}-making`))) throw new NoCopy(`the run’s own folder has a ${name} folder already`);
  // Removing it removes its links, never what they lead to.
  if (!used || name === 'code-view') fs.rmSync(code, { recursive: true, force: true });
  else {
    const aside = `code-before-${Date.now()}`;
    fs.renameSync(code, path.join(folder, aside));
    const left = leftFiles(folder);
    if (left.length) fs.writeFileSync(path.join(folder, 'code-left.json'), JSON.stringify(left.map((p) => p.replace(/^code\//, `${aside}/`))));
  }
  for (const f of [`${name}-used`, ...(name === 'code' ? ['code-laid.json'] : [])]) fs.rmSync(path.join(folder, f), { force: true });
}

export interface Copy {
  /** The copy's top, and the folder in it that stands for the run's. */
  top: string;
  cwd: string;
}

/**
 * Makes the code as kept into the run's folder. `link`: for a run, under code/, everything that is data linked in;
 * without it, to look at, under code-view/. Throws NoCopy when it cannot be made as it was.
 */
export async function makeCopy(m: Manifest, folder: string, o: { link: boolean; env?: Env }): Promise<Copy> {
  const env = o.env ?? agentBaseEnv();
  await enough(m, env);
  const name = o.link ? 'code' : 'code-view';
  const code = path.join(folder, name);
  setAside(folder, name);
  fs.writeFileSync(path.join(folder, `${name}-making`), '', { mode: 0o600 });
  try {
    await lay(m, folder, code, env, !o.link);
    const cwd = m.sub ? path.join(code, m.sub) : code;
    if (o.link) {
      await linkRest(m, code, env);
      await linkData(m, code, env);
      // Data the command reads that is gone since: the copy kept of it.
      for (const f of m.files) if (!f.code && !f.outside && !isOutput(f.path, m.outputs) && !lstat(path.join(code, f.path))) put(code, f.path, path.join(folder, f.store), f.mode);
    }
    const st = lstat(cwd);
    if (!st) fs.mkdirSync(cwd, { recursive: true });
    if (o.link) fs.writeFileSync(path.join(folder, 'code-laid.json'), JSON.stringify(laidOf(code)), { mode: 0o600 });
    fs.writeFileSync(path.join(folder, `${name}-used`), '', { mode: 0o600 });
    fs.rmSync(path.join(folder, `${name}-making`), { force: true });
    return { top: code, cwd };
  } catch (e) {
    fs.rmSync(code, { recursive: true, force: true });
    if (e instanceof NoCopy) throw e;
    throw new NoCopy((e as Error).message);
  }
}

// ---- what a run in a copy is given ----------------------------------------------------------------------------

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A text with the paths into the original (as written: whole, ~, $HOME) turned into paths into the copy. */
function intoCopy(text: string, tops: string[], copy: string, home = os.homedir()): string {
  const forms = tops.flatMap((t) => [t, ...(inside(t, home) ? [`~/`, '$HOME/', '${HOME}/'].map((h) => h + path.relative(home, t)) : [])]);
  const re = new RegExp(`(?<![\\w./~}-])(?:${[...new Set(forms)].sort((a, b) => b.length - a.length).map(escape).join('|')})(?=$|[/\\s'":;,)=|&<>])`, 'g');
  return text.replace(re, () => copy);
}

/** The repository's top as it was named (the run's folder may be reached through a link). */
function topsOf(m: Manifest, cwd: string): string[] {
  const here = path.resolve(cwd);
  const asNamed = !m.sub ? here : here.endsWith(`${path.sep}${m.sub}`) ? here.slice(0, -m.sub.length - 1) : m.top;
  return [...new Set([m.top, asNamed])];
}

/** Where an editable install in the run's Python points into the original: the same places in the copy, to come first. */
function editablePaths(command: string, cwd: string, dirs: string[], tops: string[], copy: string): string[] {
  const python = pythonOf(command, dirs, cwd);
  const found = python?.includes('/') ? path.resolve(cwd, python) : python ? dirs.map((d) => path.join(d, python)).find((f) => fs.existsSync(f)) : undefined;
  const envs = [found ? path.dirname(path.dirname(found)) : '', path.join(cwd, '.venv'), path.join(tops[0], '.venv'), path.join(os.homedir(), '.local')].filter(Boolean);
  const out = new Set<string>();
  const re = new RegExp(`(?:${tops.map(escape).join('|')})(?:/[^'"\\n:;]*)?`, 'g');
  for (const env of new Set(envs)) {
    let versions: string[] = [];
    try {
      versions = fs.readdirSync(path.join(env, 'lib')).filter((v) => /^python\d/.test(v));
    } catch {}
    for (const v of versions) {
      const site = path.join(env, 'lib', v, 'site-packages');
      let files: string[] = [];
      try {
        files = fs.readdirSync(site).filter((f) => f.endsWith('.pth') || /^__editable__.*\.py$/.test(f));
      } catch {}
      for (const f of files) {
        let text = '';
        try {
          text = fs.readFileSync(path.join(site, f), 'utf8').slice(0, 200_000);
        } catch {}
        for (const at of text.match(re) ?? []) {
          // A finder names the package's folder (or module): what goes on the path is the folder around it.
          const dir = f.endsWith('.pth') ? at : path.dirname(at);
          const mapped = intoCopy(dir, tops, copy);
          if (mapped !== dir && fs.existsSync(mapped)) out.add(mapped);
        }
      }
    }
  }
  return [...out];
}

/**
 * The command and variables for a run in its copy: paths that name the original go to the copy (through its links,
 * data stays where it is); a path out of the repository still leads there; a file from outside it that has changed is
 * the kept copy; an editable install does not bring the original code back; `uv run` does not move it either.
 */
export function forCopy(m: Manifest, copy: Copy, folder: string, spec: Pick<JobSpec, 'command' | 'cwd' | 'env'>): { command: string; env: Env } {
  const tops = topsOf(m, spec.cwd);
  const home = os.homedir();
  const expand = (w: string) => w.replace(/^~(?=$|\/)/, home);
  let command = spec.command;
  const replaced = new Map<string, string>();
  for (const word of commandWords(spec.command)) {
    for (const w of word.includes('=') ? [word, word.slice(word.indexOf('=') + 1)] : [word]) {
      if (!w) continue;
      const abs = path.resolve(spec.cwd, expand(w));
      const kept = m.files.find((f) => f.outside && f.code && real(abs) === f.outside);
      if (kept && fileSha(kept.outside!) !== kept.sha) replaced.set(w, path.join(folder, kept.store));
      else if (!path.isAbsolute(expand(w)) && /(^|\/)\.\.(\/|$)/.test(w)) {
        // "../x" that leaves the repository would lead into the run's folder from the copy.
        const out = !tops.some((t) => abs === t || inside(abs, t));
        if (out && fs.existsSync(abs)) replaced.set(w, abs);
      }
    }
  }
  // Whole words only: "../x" is not the start of "../x2".
  for (const [word, to] of [...replaced].sort((a, b) => b[0].length - a[0].length)) command = command.replace(new RegExp(`(?<![^\\s'"=;|&(<>])${escape(word)}(?![^\\s'";:,|&)<>])`, 'g'), () => to);
  command = intoCopy(command, tops, copy.top);

  const env: Env = {};
  for (const [k, v] of Object.entries(spec.env ?? {})) {
    const moved = intoCopy(v, tops, copy.top);
    if (moved !== v) env[k] = moved;
  }
  const base = { ...agentBaseEnv(), ...spec.env };
  const had = (base.PYTHONPATH ?? '').split(path.delimiter).filter(Boolean);
  const moved = had.map((p) => intoCopy(p, tops, copy.top));
  const first = editablePaths(spec.command, spec.cwd, pathDirs(base), tops, copy.top);
  const all = [...new Set([...first, ...moved])];
  if (first.length || moved.some((p, i) => p !== had[i])) env.PYTHONPATH = all.join(path.delimiter);
  if (base.UV_NO_SYNC === undefined) env.UV_NO_SYNC = '1';
  return { command, env };
}

/**
 * The command as it ran, with the variables that were pointed elsewhere before it, when that is not the command as given;
 * undefined when nothing was changed. (UV_NO_SYNC says no path: it is shown only for a command that uses uv.)
 */
export function ranAs(given: string, there: { command: string; env: Env }): string | undefined {
  const word = (v: string) => (/^[\w@%+=:,./-]*$/.test(v) ? v : `'${v.replace(/'/g, `'\\''`)}'`);
  const set = Object.entries(there.env)
    .filter(([k]) => k !== 'UV_NO_SYNC' || commandWords(there.command).some((w) => /(^|\/)uvx?$/.test(w)))
    .map(([k, v]) => `${k}=${word(v)}`);
  return set.length || there.command !== given ? [...set, there.command].join(' ') : undefined;
}

// ---- when a run in a copy ends --------------------------------------------------------------------------------

const cacheName = (name: string) => name === '__pycache__' || name.endsWith('.pyc');

/**
 * Moves what the run created in its copy (neither the code nor a link) to the same places in the original folder,
 * where nothing is. Nothing is overwritten, no link is followed, and nothing outside the two folders is touched. What
 * could not be moved stays in the copy, as do the files of the code the run changed: returned (and kept) as paths in
 * the copy.
 */
export async function bringBack(folder: string): Promise<string[]> {
  const m = loadManifest(folder);
  const laid = json<Laid | null>(path.join(folder, 'code-laid.json'), null);
  const code = path.join(folder, 'code');
  if (!m || !laid || !lstat(code)?.isDirectory()) return [];
  const top = real(m.top);
  const copyReal = real(code);
  const left: string[] = [];

  /** Whether a path of the original is really inside it: no folder on the way is a link that leads elsewhere. */
  const withinOriginal = (rel: string) => {
    let at = top;
    for (const part of rel.split('/').slice(0, -1)) {
      at = path.join(at, part);
      const st = lstat(at);
      if (!st?.isDirectory()) return false;
    }
    return true;
  };
  const children = (rel: string) => fs.readdirSync(path.join(code, rel)).filter((n) => !cacheName(n) && !(!rel && n === '.git'));

  const move = async (rel: string): Promise<void> => {
    const from = path.join(code, rel);
    const to = path.join(top, rel);
    const st = lstat(from);
    if (!st) return;
    try {
      if (!fs.existsSync(top) || !withinOriginal(rel)) return void left.push(rel);
      const there = lstat(to);
      if (st.isDirectory()) {
        const names = children(rel);
        // A folder with only caches in it is left out whole.
        if (!names.length && fs.readdirSync(from).length) return;
        if (there && !there.isDirectory()) return void left.push(rel);
        if (!there) fs.mkdirSync(to, { mode: st.mode & 0o777 });
        for (const n of names) await move(`${rel}/${n}`);
        if (!fs.readdirSync(from).length) fs.rmdirSync(from);
        return;
      }
      if (there) return void left.push(rel);
      if (st.isSymbolicLink()) {
        let target = fs.readlinkSync(from);
        // A link into the copy would break once moved: it leads to the same place of the original.
        for (const c of [code, copyReal]) if (target === c || target.startsWith(`${c}/`)) target = top + target.slice(c.length);
        fs.symlinkSync(target, to);
      } else if (st.isFile()) {
        try {
          // A second name for the file, which fails when something is there: nothing is ever overwritten.
          fs.linkSync(from, to);
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code === 'EEXIST') return void left.push(rel);
          // Another disk, or one without such links.
          await fs.promises.copyFile(from, to, fs.constants.COPYFILE_EXCL);
        }
      } else return void left.push(rel);
      fs.unlinkSync(from);
    } catch {
      left.push(rel);
    }
  };

  const walk = async (rel: string): Promise<void> => {
    for (const name of children(rel)) {
      const p = rel ? `${rel}/${name}` : name;
      const st = lstat(path.join(code, p));
      if (!st) continue;
      const was = laid[p];
      if (!was) await move(p);
      else if (was[0] === 'd' && st.isDirectory()) await walk(p);
      else if (was[0] === 'l' && st.isSymbolicLink() && fs.readlinkSync(path.join(code, p)) === was[1]) continue;
      else if (was[0] === 'f') {
        // A file of the code the run changed: the original has its own, so this one stays.
        if (!st.isFile() || st.size !== was[1] || st.mtimeMs !== was[2] || st.ino !== was[3]) left.push(p);
      } else await move(p);
    }
  };
  try {
    await walk('');
  } catch (e) {
    console.error('[experiments] bringing files back:', (e as Error)?.message ?? e);
  }
  const all = [...new Set([...leftFiles(folder), ...left.map((p) => `code/${p}`)])];
  if (all.length) fs.writeFileSync(path.join(folder, 'code-left.json'), JSON.stringify(all), { mode: 0o600 });
  return left.sort();
}

/**
 * Takes a copy that was run in down to what stayed in it, after what the run made was moved back: its links go (never
 * what they lead to), its files that are as they were put there, its caches, and its .git unless the run committed in
 * it; then the folders that are empty. Anything else is left where it is.
 */
export async function pruneCopy(folder: string, left: string[]): Promise<void> {
  const m = loadManifest(folder);
  const laid = json<Laid | null>(path.join(folder, 'code-laid.json'), null);
  const code = path.join(folder, 'code');
  if (!m || !laid || !lstat(code)?.isDirectory()) return;
  const head = lstat(path.join(code, '.git'))?.isDirectory() ? (await git(code, ['rev-parse', 'HEAD'])).out.toString('utf8').trim() : '';
  if (head === m.commit) fs.rmSync(path.join(code, '.git'), { recursive: true, force: true });
  const listed = new Set(left);
  const walk = (rel: string) => {
    for (const name of fs.readdirSync(path.join(code, rel))) {
      if (!rel && name === '.git') continue;
      const p = rel ? `${rel}/${name}` : name;
      const at = path.join(code, p);
      const st = lstat(at);
      if (!st) continue;
      const was = laid[p];
      if (cacheName(name)) fs.rmSync(at, { recursive: true, force: true });
      else if (st.isDirectory()) {
        walk(p);
        if (!listed.has(p) && !fs.readdirSync(at).length) fs.rmdirSync(at);
      } else if (st.isSymbolicLink()) {
        if (was?.[0] === 'l' && fs.readlinkSync(at) === was[1]) fs.unlinkSync(at);
      } else if (was?.[0] === 'f' && st.size === was[1] && st.mtimeMs === was[2] && st.ino === was[3]) fs.unlinkSync(at);
    }
  };
  walk('');
  fs.rmSync(path.join(folder, 'code-laid.json'), { force: true });
  if (!fs.readdirSync(code).length) {
    fs.rmdirSync(code);
    fs.rmSync(path.join(folder, 'code-used'), { force: true });
  }
}

// ---- a run's own code, later ------------------------------------------------------------------------------------

/**
 * What is kept of a run's code: its manifest; for a run from before manifests were written, one made from its record
 * (its commit, the patch's own account of what it changed, the files kept).
 */
export async function manifestOf(r: RunRecord, folder: string): Promise<Manifest | null> {
  const m = loadManifest(folder);
  if (m) return m;
  if (!r.commit) return null;
  const repo = fs.existsSync(r.cwd) ? await repoOf(r.cwd) : null;
  if (!repo) return null;
  const outputs = outputsOf(r, repo.top, r.id, folder);
  const old: Manifest = { at: r.startedAt ?? r.createdAt, top: repo.top, common: repo.common, sub: repo.sub, commit: r.commit, branch: r.branch, dirty: r.dirty, untracked: r.untracked, changed: {}, data: [], outputs, binary: {}, files: [], large: [], subs: {}, kept: r.kept ?? [], notKept: r.notKept ?? [] };
  if (r.dirty) {
    let patch: Buffer;
    try {
      patch = fs.readFileSync(path.join(folder, 'changes.patch'));
    } catch {
      return null;
    }
    const text = patch.toString('utf8');
    // A binary file changed then is not in the patch, and was not kept.
    if (/^Binary files .* differ$/m.test(text)) return null;
    old.patch = { sha: sha256(patch), cut: /\n# (Hydor|Naget): the patch was cut at 2 MB\.\n$/.test(text) };
    for (const part of text.split(/^(?=diff --git )/m)) {
      const name = /^diff --git a\/(.+) b\/\1$/m.exec(part)?.[1];
      const index = /^index [0-9a-f]+\.\.([0-9a-f]+)/m.exec(part)?.[1];
      if (!name || !index) continue;
      if (isCode({ path: name, tracked: true }, outputs)) old.changed[name] = /^0+$/.test(index) ? '' : index;
      else old.data.push(name);
    }
  }
  const names = new Set<string>();
  for (const w of old.kept) {
    const abs = path.resolve(r.cwd, w.replace(/^~(?=$|\/)/, os.homedir()));
    const outside = path.isAbsolute(w) || w.startsWith('~') || !inside(abs, path.resolve(r.cwd));
    const base = path.basename(w);
    let store = `untracked/${w}`;
    if (outside) {
      // Kept by their names, in the order they were listed (name.py, name-2.py…).
      const ext = path.extname(base);
      let name = base;
      for (let i = 2; names.has(name); i++) name = `${base.slice(0, base.length - ext.length)}-${i}${ext}`;
      names.add(name);
      store = `untracked/outside/${name}`;
    }
    const sha = fileSha(path.join(folder, store));
    if (!sha) continue;
    const at = outside ? real(abs) : '';
    const inRepo = !outside ? [repo.sub, w].filter(Boolean).join('/') : inside(at, repo.top) ? path.relative(repo.top, at) : null;
    old.files.push({ path: inRepo ?? w, sha, store, ...(inRepo ? {} : { outside: at }), ...(isCode({ path: inRepo ?? at, named: true }, outputs) ? { code: true as const } : {}) });
  }
  return old;
}

/** Gives a new run the code kept of an earlier one (its own, not the folder's). */
export function copyKept(m: Manifest, from: string, to: string): void {
  fs.mkdirSync(to, { recursive: true, mode: 0o700 });
  forget(to);
  if (m.patch) write(to, 'changes.patch', fs.readFileSync(path.join(from, 'changes.patch')));
  for (const store of [...m.files.map((f) => f.store), ...Object.values(m.binary).filter(Boolean)]) write(to, store, fs.readFileSync(path.join(from, store)));
  fs.writeFileSync(path.join(to, MANIFEST), JSON.stringify(m), { mode: 0o600 });
}
