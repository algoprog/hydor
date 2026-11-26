// What a run records when it starts, wherever it runs (this computer, or a cluster over SSH): the commit, the
// branch and whether there were changes not committed (then a patch of them, binary files left out, cut at 2 MB), on
// this computer the files its command names that git does not track, in its folder or outside it (copied into the
// run's folder),
// and the environment as found: the host, the Python and the versions of PyTorch and its kin from the run's own
// Python (by their packages' metadata: nothing is imported), the CUDA and the driver nvidia-smi names.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isSecret, UPLOADS } from '../agent/permissions.ts';
import { config } from '../config.ts';
import { secretIn } from '../memory/secrets.ts';
import { shellWords } from './sweeps.ts';

/** Runs a shell script in a folder (here, or on a cluster); its output and exit code. */
export type Shell = (script: string, o?: { timeoutMs?: number; env?: Record<string, string> }) => Promise<{ code: number; out: string }>;

/** A shell on this computer, in `cwd`, with the given environment. */
export function localShell(cwd: string, baseEnv: Record<string, string>): Shell {
  return (script, o = {}) =>
    new Promise((resolve) => {
      let out = '';
      let p;
      try {
        p = spawn('/bin/sh', ['-c', script], { cwd, env: { ...baseEnv, ...o.env }, stdio: ['ignore', 'pipe', 'ignore'] });
      } catch {
        return resolve({ code: 127, out: '' });
      }
      const timer = setTimeout(() => p.kill('SIGKILL'), o.timeoutMs ?? 15_000);
      p.stdout.setEncoding('utf8');
      p.stdout.on('data', (d: string) => {
        if (out.length < 4 << 20) out += d;
      });
      p.on('error', () => {
        clearTimeout(timer);
        resolve({ code: 127, out });
      });
      p.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code: code ?? 1, out });
      });
    });
}

/** A path or word for a shell, in single quotes. */
export const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** The most of a patch kept. */
export const MAX_PATCH = 2 * 1024 * 1024;

export interface GitRecord {
  commit?: string;
  branch?: string;
  dirty?: boolean;
  untracked?: number;
  /** The patch of the changes not committed (git diff HEAD, binary files left out), when there are some. */
  patch?: string;
  /** It was longer than MAX_PATCH and was cut. */
  cut?: boolean;
}

/** The repository's state in the shell's folder (nothing when it is not in one). */
export async function captureGit(sh: Shell): Promise<GitRecord> {
  const head = await sh(`git rev-parse HEAD 2>/dev/null || exit 3; echo @@; git rev-parse --abbrev-ref HEAD 2>/dev/null; echo @@; git status --porcelain --untracked-files=normal 2>/dev/null | head -c 400000`, { timeoutMs: 20_000 });
  if (head.code !== 0) return {};
  const [commit, branch, status] = head.out.split('@@\n');
  const lines = (status ?? '').split('\n').filter(Boolean);
  const changed = lines.filter((l) => !l.startsWith('??'));
  const rec: GitRecord = { commit: commit?.trim() || undefined, branch: branch?.trim() || undefined, dirty: changed.length > 0, untracked: lines.length - changed.length };
  if (rec.branch === 'HEAD') rec.branch = undefined;
  if (rec.dirty) {
    const diff = await sh(`git diff HEAD --no-color --no-ext-diff 2>/dev/null | head -c ${MAX_PATCH + 1}`, { timeoutMs: 30_000 });
    if (diff.out) {
      rec.cut = diff.out.length > MAX_PATCH;
      rec.patch = rec.cut ? diff.out.slice(0, MAX_PATCH) : diff.out;
    }
  }
  return rec;
}

/** The most of one file not in git that is kept with a run, and of all of them. */
export const KEEP_FILE = 1024 * 1024;
export const KEEP_ALL = 5 * 1024 * 1024;

/**
 * The words of a whole command, as a shell splits them (quotes, backslashes), whatever joins its parts. What it only
 * writes to (after > or >>) and its comments are left out.
 */
export function commandWords(command: string): string[] {
  const out: string[] = [];
  let cur = '';
  let has = false;
  let quote: string | null = null;
  let target = false;
  const end = () => {
    if (!has) return;
    if (!target) out.push(cur);
    target = false;
    cur = '';
    has = false;
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < command.length) cur += command[++i];
      else cur += c;
    } else if (c === "'" || c === '"') {
      quote = c;
      has = true;
    } else if (c === '\\' && i + 1 < command.length) {
      const next = command[++i];
      if (next !== '\n') {
        cur += next;
        has = true;
      }
    } else if (c === '#' && !has) {
      while (i + 1 < command.length && command[i + 1] !== '\n') i++;
    } else if (c === '>') {
      end();
      target = true;
    } else if (/[\s;|&()<]/.test(c)) end();
    else {
      cur += c;
      has = true;
    }
  }
  end();
  return out;
}

const inside = (p: string, dir: string) => {
  const rel = path.relative(dir, p);
  return !!rel && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
};

const real = (p: string) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
};

/** Files named for what they hold, wherever they are (isSecret knows keys, .env and the like). */
const SECRET_NAME = /^(secrets?|tokens?|credentials?|auth)(\.(json|ya?ml|toml|ini|txt|cfg|conf|env))?$/i;
const SETTINGS_FILE = /\.(env|ini|ya?ml|toml|cfg|conf|json|properties)$/i;
/** What secretIn only guesses at, from the words around it or how random it looks: code is full of such lines. */
const GUESSED = new Set(['a password or key', 'a key or token', 'a card number']);

/** Whether a file looks like it holds a key or a password (by its names, as written and where a link leads, or its text): never kept. */
function secretFile(names: string[], text: string): boolean {
  if (names.some((n) => isSecret(n) || SECRET_NAME.test(path.basename(n)))) return true;
  const what = secretIn(text);
  // A settings file with a password in it counts too; a long number or a random-looking id alone does not.
  return !!what && (!GUESSED.has(what) || (what === 'a password or key' && SETTINGS_FILE.test(names[0])));
}

/** The app's own data (its database, keys, runs' folders). */
const appData = () => [...new Set([config.dataDir, path.dirname(UPLOADS)].map((d) => real(path.resolve(d))))];

/** The system's folders, whose files are not the person's own work. */
const SYSTEM_DIRS = /^(\/(usr|bin|sbin|lib|lib32|lib64|libx32|opt|nix|etc|proc|sys|dev|System|Library|private\/etc)|[a-z]:[\\/](Program Files( \(x86\))?|ProgramData|Windows))([\\/]|$)/i;

/** Whether a file is the system's or a package's: a system folder, node_modules, site-packages, a Python environment's programs. */
function packageFile(file: string): boolean {
  if (SYSTEM_DIRS.test(file)) return true;
  const parts = file.split(/[\\/]/);
  if (parts.some((x) => x === 'node_modules' || x === 'site-packages' || x === 'dist-packages')) return true;
  return parts.slice(0, -1).some((x, i) => {
    if (i === 0 || (x !== 'bin' && x !== 'Scripts')) return false;
    // A virtual environment, a conda environment, or an installed Python (pyenv's, ~/.local).
    const env = parts.slice(0, i).join(path.sep) || path.sep;
    if (['pyvenv.cfg', 'conda-meta'].some((f) => fs.existsSync(path.join(env, f)))) return true;
    try {
      return fs.readdirSync(path.join(env, 'lib')).some((f) => /^python\d/.test(f));
    } catch {
      return false;
    }
  });
}

/** A checkout of a repository: its top folder, and the folder every checkout and worktree of that repository shares. */
type Checkout = { top: string; common: string } | null;

async function checkoutOf(sh: Shell, dir: string): Promise<Checkout> {
  const r = await sh(`cd ${q(dir)} && git rev-parse --show-toplevel --git-common-dir 2>/dev/null`, { timeoutMs: 10_000 });
  const [top, common] = r.out.split('\n');
  return r.code === 0 && top && common ? { top: real(top), common: real(path.resolve(dir, common)) } : null;
}

/** A file outside the run's folder, as the command names it. */
interface Outside {
  word: string;
  abs: string;
  at: string;
}

/**
 * Which of the files outside the run's folder need keeping, each with the names that say whether it is a secret. Left
 * out: what is not the person's own (another user's, a system or package folder, the app's data) and what the
 * repository has already: tracked in this checkout (the patch has its changes), or tracked in another checkout or
 * worktree of it and unchanged there at the run's commit.
 */
async function outsideToKeep(sh: Shell, root: string, files: Outside[]): Promise<(Outside & { names: string[] })[]> {
  if (!files.length) return [];
  const own = await sh('git rev-parse --show-toplevel --git-common-dir 2>/dev/null; git rev-parse -q --verify HEAD 2>/dev/null', { timeoutMs: 10_000 });
  const [ownTop, ownCommon, commit] = own.out.split('\n');
  const common = ownCommon ? real(path.resolve(root, ownCommon)) : '';
  const top = ownTop ? real(ownTop) : '';
  const data = appData();
  const checkouts = new Map<string, Checkout>();
  const uid = process.getuid?.();
  const out: (Outside & { names: string[] })[] = [];
  for (const f of files) {
    try {
      if (uid !== undefined && fs.statSync(f.at).uid !== uid) continue;
      if (packageFile(f.abs) || packageFile(f.at)) continue;
      const dir = path.dirname(f.at);
      if (!checkouts.has(dir)) checkouts.set(dir, await checkoutOf(sh, dir));
      const co = checkouts.get(dir);
      const same = co && co.common === common ? co : null;
      const rel = same ? path.relative(same.top, f.at).split(path.sep).join('/') : '';
      let names = [f.abs, f.at];
      const appDir = data.find((d) => inside(f.at, d));
      if (appDir) {
        // The app's data is never copied, but a worktree of this repository that the app made there is the person's code.
        if (!same || !inside(same.top, appDir)) continue;
        names = [`/${rel}`];
      }
      if (same) {
        const tracked = `cd ${q(same.top)} && git --literal-pathspecs ls-files --error-unmatch -- ${q(rel)} >/dev/null 2>&1`;
        const unchanged = commit ? `[ "$(git rev-parse -q --verify ${q(`${commit}:${rel}`)})" = "$(git hash-object -- ${q(rel)})" ]` : 'false';
        const has = await sh(same.top === top ? tracked : `${tracked} && ${unchanged}`, { timeoutMs: 20_000 });
        if (has.code === 0) continue;
      }
      out.push({ ...f, names });
    } catch {}
  }
  return out;
}

/** A base name not taken yet: name.py, then name-2.py… */
function freeName(dir: string, base: string, taken: Set<string>): string {
  const ext = path.extname(base);
  const stem = base.slice(0, base.length - ext.length);
  let name = base;
  for (let i = 2; taken.has(name) || fs.existsSync(path.join(dir, name)); i++) name = `${stem}-${i}${ext}`;
  taken.add(name);
  return name;
}

/**
 * The files a command names (its words that are files) that git does not have: those under the folder it runs in that
 * are not tracked, or ignored, copied under `into` at the same relative paths; and the person's own files outside it
 * (an absolute path, one with .., ~; outsideToKeep says which), copied under `into`/outside/ by their names and listed
 * as the command gave them. So the run can be reproduced (with `into` null, only listed). Those over the limits are
 * listed in `notKept`. A file that looks like it holds a secret is left alone, as is a link that leads out of the
 * folder. Nothing outside a git repository.
 */
export async function keepUntracked(sh: Shell, command: string, cwd: string, into: string | null): Promise<{ kept: string[]; notKept: string[] }> {
  const none = { kept: [], notKept: [] };
  const repo = await sh('git rev-parse --is-inside-work-tree 2>/dev/null', { timeoutMs: 10_000 });
  if (repo.out.trim() !== 'true') return none;
  const here = path.resolve(cwd);
  const root = real(here);
  const found = new Map<string, string>();
  const away = new Map<string, Outside>();
  for (const word of commandWords(command)) {
    for (const w of word.includes('=') ? [word, word.slice(word.indexOf('=') + 1)] : [word]) {
      if (!w || w.length > 1000 || found.size + away.size >= 200) continue;
      const abs = path.resolve(here, /^~(?=$|\/)/.test(w) ? os.homedir() + w.slice(1) : w);
      try {
        const at = fs.realpathSync(abs);
        if (!fs.statSync(at).isFile()) continue;
        // Under the folder by its path (a link there that leads out is left alone), or really under it however it is named.
        const under = inside(abs, here);
        const rel = path.relative(under ? here : root, under ? abs : at);
        if (under || inside(at, root)) {
          if (inside(at, root) && !rel.split(path.sep).includes('.git')) found.set(rel.split(path.sep).join('/'), at);
        } else if (![abs, at].some((p) => p.split(path.sep).includes('.git')) && !away.has(at)) away.set(at, { word: w, abs, at });
      } catch {}
    }
  }
  const kept: string[] = [];
  const notKept: string[] = [];
  let total = 0;
  const keep = (listed: string, names: string[], at: string, to: () => string) => {
    try {
      const size = fs.statSync(at).size;
      // Its name first: a large file that is a secret by its name is not even listed.
      if (secretFile(names, '')) return;
      if (size > KEEP_FILE || total + size > KEEP_ALL) {
        notKept.push(listed);
        return;
      }
      const data = fs.readFileSync(at);
      if (!data.includes(0) && secretFile(names, data.toString('utf8'))) return;
      if (into) {
        const file = to();
        fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
        fs.writeFileSync(file, data, { mode: 0o600 });
      }
      kept.push(listed);
      total += size;
    } catch {}
  };
  if (found.size) {
    const ls = await sh(`git --literal-pathspecs ls-files -z -- ${[...found.keys()].map(q).join(' ')}`, { timeoutMs: 20_000 });
    if (ls.code !== 0) return none;
    const tracked = new Set(ls.out.split('\0'));
    // In a folder the app made to work in (a worktree, a project's), being under the app's data says nothing: its name does.
    const own = appData().some((d) => inside(root, d));
    for (const [rel, at] of found) {
      if (tracked.has(rel)) continue;
      const names = [rel, path.relative(root, at)].map((n) => (own ? `/${n}` : path.join(root, n)));
      keep(rel, names, at, () => path.join(into!, rel));
    }
  }
  const taken = new Set<string>();
  for (const f of await outsideToKeep(sh, root, [...away.values()])) {
    const dir = path.join(into ?? '', 'outside');
    keep(f.word, f.names, f.at, () => path.join(dir, freeName(dir, path.basename(f.abs), taken)));
  }
  return { kept, notKept };
}

/** In a sentence for agents, what became of the files a command names that git does not track. */
export function keptWords(r: { kept?: string[]; notKept?: string[] }): string {
  const list = (files: string[]) => `${files.slice(0, 20).join(', ')}${files.length > 20 ? ` and ${files.length - 20} more` : ''}`;
  return [r.kept?.length ? `Not in git, kept with the run: ${list(r.kept)}` : '', r.notKept?.length ? `Not in git and too large to keep: ${list(r.notKept)}` : ''].filter(Boolean).join('. ');
}

/**
 * The Python a command runs with: a python word in it (python, python3.11, .venv/bin/python), else the interpreter
 * of the program it starts when that is a Python script (torchrun, accelerate, deepspeed: by their #! line).
 */
export function pythonOf(command: string, pathDirs: string[] | null, cwd: string): string | null {
  const words = shellWords(command);
  let i = 0;
  while (i < words.length && /^[A-Za-z_]\w*=/.test(words[i])) i++;
  const py = words.slice(i).find((w) => /(^|\/)python[\d.]*$/.test(w));
  if (py) return py;
  const prog = words[i];
  // Elsewhere (a cluster) only a python word says it: the programs there are not here to look at.
  if (!prog || !pathDirs || /^(uv|poetry|pipenv|conda|mamba|pixi)$/.test(prog)) return null;
  const file = prog.includes('/') ? path.resolve(cwd, prog) : pathDirs.map((d) => path.join(d, prog)).find((f) => fs.existsSync(f));
  if (!file) return null;
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(200);
    fs.readSync(fd, buf, 0, 200, 0);
    fs.closeSync(fd);
    const line = buf.toString('utf8').split('\n')[0];
    const m = /^#!\s*(\S*python[\d.]*)\b/.exec(line) ?? /^#!\s*\S*\/env\s+(python[\d.]*)\b/.exec(line);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

const PY = `import platform, sys
print("python=" + platform.python_version())
try:
    from importlib import metadata
except Exception:
    metadata = None
for name in ("torch", "transformers", "jax", "tensorflow", "numpy"):
    try:
        print(name + "=" + metadata.version(name))
    except Exception:
        pass`;

/** Versions from a Python (nothing imported but the standard library). */
export async function pythonVersions(sh: Shell, python: string): Promise<Record<string, string>> {
  const r = await sh(`${q(python)} -c ${q(PY)}`, { timeoutMs: 20_000, env: { CUDA_VISIBLE_DEVICES: '' } });
  const out: Record<string, string> = {};
  if (r.code !== 0) return out;
  for (const l of r.out.split('\n')) {
    const m = /^(python|torch|transformers|jax|tensorflow|numpy)=(\S+)$/.exec(l.trim());
    if (m) out[m[1] === 'python' ? 'Python' : m[1] === 'torch' ? 'PyTorch' : m[1]] = m[2];
  }
  return out;
}

/** The driver and CUDA versions as nvidia-smi's header gives them. */
export async function nvidiaVersions(sh: Shell): Promise<Record<string, string>> {
  const r = await sh('nvidia-smi 2>/dev/null | head -n 5', { timeoutMs: 10_000 });
  const out: Record<string, string> = {};
  const d = /Driver Version:\s*([\d.]+)/.exec(r.out);
  const c = /CUDA Version:\s*([\d.]+)/.exec(r.out);
  if (d) out.driver = d[1];
  if (c) out.CUDA = c[1];
  return out;
}

/** The environment a run started in: the host, its Python's versions, and with GPUs the CUDA and the driver. */
export async function captureEnvironment(sh: Shell, o: { command: string; cwd: string; pathDirs: string[] | null; gpus: boolean; host?: string; gpuNames?: string[] }): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  env.host = o.host ?? os.hostname();
  const py = pythonOf(o.command, o.pathDirs, o.cwd);
  if (py) Object.assign(env, await pythonVersions(sh, py).catch(() => ({})));
  if (o.gpus) {
    Object.assign(env, await nvidiaVersions(sh).catch(() => ({})));
    const names = [...new Set(o.gpuNames ?? [])];
    if (names.length) env.GPU = names.join(', ');
  }
  return env;
}
