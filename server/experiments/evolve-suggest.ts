// What an evolution might change, as suggested for New evolution: the source files the evaluation's command names (a
// model it loads, a prompt it reads), the local files those scripts import or run (one step on), and the repository's
// entry points (package.json's main and scripts, main.py…), leaving out what the evaluation protects, data, and what
// git does not have. Names only, relative to the folder the evolution starts from; nothing is changed.
import fs from 'node:fs';
import path from 'node:path';
import type { Evaluation } from '../../shared/evaluations.ts';
import type { DB } from '../db.ts';
import { git } from '../git.ts';
import { protectsPath } from './evaluations.ts';
import { suggestProtected } from './evaluation-suggest.ts';

/** Suggested at most. */
const MOST = 20;
const BYTES = 200 * 1024;
/** Data, not what a search changes. */
const DATA = /\.(csv|tsv|jsonl|ndjson|parquet|arrow|feather|npy|npz|pkl|pickle|pt|pth|ckpt|safetensors|bin|h5|hdf5|zip|gz|bz2|xz|tar|tgz|png|jpe?g|gif|webp|pdf|wav|mp3|mp4|lock)$/i;
/** Programs whose imports are looked through. */
const SCRIPT = /\.(py|sh|bash|js|mjs|cjs|ts|mts|cts|tsx|jsx)$/i;
const JS_EXT = ['', '.ts', '.js', '.mjs', '.cjs', '.tsx', '.jsx', '/index.ts', '/index.js'];
/** Entry points a repository often has. */
const ENTRIES = ['main.py', '__main__.py', 'app.py', 'run.py', 'train.py', 'solve.py', 'src/main.py', 'index.js', 'main.js', 'src/index.ts', 'src/index.js', 'src/main.ts'];

const readSmall = (file: string): string | null => {
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > BYTES) return null;
    const body = fs.readFileSync(file);
    return body.includes(0) ? null : body.toString('utf8');
  } catch {
    return null;
  }
};

/** The local files a script names: Python's and JavaScript's imports of their own folder, and a shell script's commands' files. */
async function namedBy(file: string, dir: string, root: string): Promise<string[]> {
  const body = readSmall(file);
  if (body === null) return [];
  const here = path.dirname(file);
  const out: string[] = [];
  const add = (p: string) => out.push(p);
  if (/\.py$/i.test(file)) {
    const mods = [
      ...[...body.matchAll(/^\s*from\s+(\.*[\w.]*)\s+import\s/gm)].map((m) => m[1]),
      ...[...body.matchAll(/^\s*import\s+([\w.]+(?:\s*,\s*[\w.]+)*)/gm)].flatMap((m) => m[1].split(/\s*,\s*/)),
    ];
    for (const m of mods) {
      const dots = /^\.*/.exec(m)![0].length;
      const rest = m.slice(dots).replace(/\./g, '/');
      const bases = dots ? [path.resolve(here, ...Array(Math.max(0, dots - 1)).fill('..'))] : [here, dir, root];
      for (const base of bases) for (const p of rest ? [`${rest}.py`, `${rest}/__init__.py`] : ['__init__.py']) add(path.join(base, p));
    }
  } else if (/\.(js|mjs|cjs|ts|mts|cts|tsx|jsx)$/i.test(file)) {
    for (const m of body.matchAll(/(?:from\s*|import\s*\(\s*|require\s*\(\s*|^\s*import\s+)['"](\.{1,2}\/[^'"]+)['"]/gm)) for (const ext of JS_EXT) add(path.resolve(here, m[1] + ext));
  } else {
    for (const p of await suggestProtected(here, body)) if (!p.endsWith('/')) add(path.join(here, p));
  }
  return out;
}

/** Files of the folder an evolution starting there might change, the likeliest first. */
export async function suggestEvolveFiles(db: DB, ev: Evaluation, from: string): Promise<string[]> {
  const root = path.resolve(from);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return [];
  const top = (await git(root, ['rev-parse', '--show-toplevel'])).out.trim();
  const homeTop = (await git(ev.cwd, ['rev-parse', '--show-toplevel'])).out.trim();
  if (!top || !homeTop) return [];
  const realTop = fs.realpathSync(top);
  // The command runs in the evaluation's part of this worktree.
  const evalPart = path.relative(fs.realpathSync(homeTop), fs.realpathSync(ev.cwd));
  const cmdDir = path.join(realTop, evalPart);
  const tracked = new Set((await git(realTop, ['ls-files', '-z'], 60_000)).out.split('\0').filter(Boolean));
  const realRoot = fs.realpathSync(root);
  const seen = new Set<string>();
  const out: string[] = [];
  const consider = (abs: string) => {
    const full = path.resolve(abs);
    const inRepo = path.relative(realTop, full).split(path.sep).join('/');
    const rel = path.relative(realRoot, full).split(path.sep).join('/');
    if (seen.has(full) || !rel || rel.startsWith('..') || path.isAbsolute(rel)) return;
    seen.add(full);
    if (!tracked.has(inRepo) || DATA.test(rel) || readSmall(full) === null || fs.lstatSync(full).isSymbolicLink()) return;
    const forEval = path.relative(cmdDir, full).split(path.sep).join('/');
    if (!forEval.startsWith('..') && protectsPath(db, ev, forEval)) return;
    out.push(rel);
  };
  // What the command names, then what those scripts import or run.
  const named = (await suggestProtected(cmdDir, ev.command)).filter((p) => !p.endsWith('/')).map((p) => path.join(cmdDir, p));
  for (const f of named) consider(f);
  for (const f of named.filter((x) => SCRIPT.test(x))) for (const g of await namedBy(f, cmdDir, realTop)) consider(g);
  // The repository's entry points: package.json's main and its scripts' files, and the usual names.
  const pkg = readSmall(path.join(realTop, 'package.json'));
  if (pkg) {
    try {
      const j = JSON.parse(pkg) as { main?: string; scripts?: Record<string, string> };
      if (typeof j.main === 'string') consider(path.join(realTop, j.main));
      for (const s of Object.values(j.scripts ?? {})) if (typeof s === 'string') for (const p of await suggestProtected(realTop, s)) if (!p.endsWith('/')) consider(path.join(realTop, p));
    } catch {
      /* not JSON: no entry points from it */
    }
  }
  for (const e of ENTRIES) if (fs.existsSync(path.join(realRoot, e))) consider(path.join(realRoot, e));
  return out.slice(0, MOST);
}
