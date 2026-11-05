// What a run records when it starts, wherever it runs (this computer, or a cluster over SSH): the commit, the
// branch and whether there were changes not committed (then a patch of them, binary files left out, cut at 2 MB),
// and the environment as found: the host, the Python and the versions of PyTorch and its kin from the run's own
// Python (by their packages' metadata: nothing is imported), the CUDA and the driver nvidia-smi names.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
