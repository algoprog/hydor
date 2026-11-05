// Where a notebook can run: virtualenvs next to it, conda environments, the system Python and
// registered Jupyter kernels. A Python environment runs kernels with its own ipykernel; one
// without it gets it installed only when the user asks.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { KernelEnv, SetupResult } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { agentBaseEnv } from '../env.ts';

type Json = Record<string, any>;

const HOME = os.homedir();

/** How to start a kernel: argv with `{connection_file}` still to fill in, and extra environment. */
export interface LaunchSpec {
  env: KernelEnv;
  argv: string[];
  vars: Record<string, string>;
  interruptMode: 'signal' | 'message';
}

interface Found {
  env: KernelEnv;
  prefix?: string;
  python?: string;
  spec?: Json;
  specDir?: string;
}

const isFile = (p: string) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};
const isDir = (p: string) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};
const list = (p: string) => {
  try {
    return fs.readdirSync(p).sort();
  } catch {
    return [];
  }
};
const readJson = (p: string): Json | null => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
};
const real = (p: string) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
};
const tildify = (p: string) => (p === HOME || p.startsWith(HOME + '/') ? '~' + p.slice(HOME.length) : p);

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    const p = execFile(cmd, args, { env: agentBaseEnv(), timeout: timeoutMs, maxBuffer: 16 << 20 }, (e, stdout, stderr) =>
      resolve({ code: e ? (typeof (e as any).code === 'number' ? (e as any).code : 1) : 0, out: String(stdout ?? ''), err: String(stderr ?? '') }),
    );
    p.stdin?.end();
  });
}

function onPath(cmd: string): string | null {
  for (const d of (agentBaseEnv().PATH ?? '').split(':')) if (d && isFile(path.join(d, cmd))) return path.join(d, cmd);
  return null;
}

// Python version and whether ipykernel imports, per interpreter; probing takes a moment, so it is cached.
const probes = new Map<string, { at: number; version?: string; ready: boolean }>();

async function probe(python: string) {
  const hit = probes.get(python);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit;
  const r = await run(python, ['-c', 'import sys, importlib.util as u; print(sys.version.split()[0]); print(u.find_spec("ipykernel") is not None)'], 20_000);
  const [version, has] = r.out.trim().split('\n');
  const p = { at: Date.now(), version: r.code === 0 ? version : undefined, ready: r.code === 0 && has === 'True' };
  probes.set(python, p);
  return p;
}

function gitRoot(dir: string): string | null {
  for (let d = dir; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, '.git'))) return d;
    if (path.dirname(d) === d) return null;
  }
}

/** Virtualenvs in the notebook's folder and those above it up to the repository root, and one level inside that root. */
function nearVenvs(notebook: string): { prefix: string; name: string }[] {
  const dir = path.dirname(notebook);
  const top = gitRoot(dir) ?? (dir.startsWith(HOME + '/') ? HOME : dir);
  const dirs: string[] = [];
  for (let d = dir; d.startsWith(top); d = path.dirname(d)) {
    dirs.push(d);
    if (d === top || path.dirname(d) === d) break;
  }
  for (const c of list(top)) if (!c.startsWith('.') && c !== 'node_modules' && isDir(path.join(top, c))) dirs.push(path.join(top, c));
  const out: { prefix: string; name: string }[] = [];
  for (const d of dirs) {
    for (const v of ['.venv', 'venv', 'env']) {
      const prefix = path.join(d, v);
      if (out.some((o) => o.prefix === prefix) || !isFile(path.join(prefix, 'pyvenv.cfg')) || !isFile(path.join(prefix, 'bin', 'python'))) continue;
      out.push({ prefix, name: `${v} · ${path.relative(path.dirname(top), d) || path.basename(d)}` });
    }
  }
  return out;
}

const CONDA_ROOTS = ['miniconda3', 'anaconda3', 'miniforge3', 'mambaforge', 'micromamba'].map((d) => path.join(HOME, d)).concat('/opt/conda');

function condaPrefixes(): string[] {
  const out = new Set<string>();
  for (const r of CONDA_ROOTS) {
    if (!isFile(path.join(r, 'bin', 'python'))) continue;
    out.add(r);
    for (const e of list(path.join(r, 'envs'))) out.add(path.join(r, 'envs', e));
  }
  try {
    for (const line of fs.readFileSync(path.join(HOME, '.conda', 'environments.txt'), 'utf8').split('\n')) if (line.trim()) out.add(line.trim());
  } catch {}
  return [...out].filter((p) => isFile(path.join(p, 'bin', 'python')));
}

/** Every environment, those next to the notebook first. */
export async function findEnvs(notebook?: string): Promise<Found[]> {
  const found: Found[] = [];
  const add = (prefix: string, kind: KernelEnv['kind'], name: string, python = path.join(prefix, 'bin', 'python')) => {
    if (found.some((f) => f.prefix === prefix)) return;
    found.push({ prefix, python, env: { id: `py:${prefix}`, name, detail: tildify(prefix), kind, language: 'python', ready: false } });
  };
  if (notebook) for (const v of nearVenvs(notebook)) add(v.prefix, 'venv', v.name);
  for (const p of condaPrefixes()) add(p, 'conda', CONDA_ROOTS.includes(p) ? `base (${path.basename(p)})` : path.basename(p));
  if (isFile('/usr/bin/python3')) add('/usr', 'system', 'System Python', '/usr/bin/python3');
  await Promise.all(
    found.map(async (f) => {
      const p = await probe(f.python!);
      f.env.version = p.version;
      f.env.ready = p.ready;
    }),
  );

  // Registered kernels, except the Python ones that are the environments above. A virtual environment's python is a
  // link to the interpreter it was made from, so it is told apart by its own folder, not by the file it links to.
  const envOf = (python: string) => {
    const prefix = path.dirname(path.dirname(python));
    return isFile(path.join(prefix, 'pyvenv.cfg')) ? prefix : real(python);
  };
  const pythons = new Set(found.map((f) => envOf(f.python!)));
  const specRoots = [path.join(HOME, '.local/share/jupyter/kernels'), '/usr/local/share/jupyter/kernels', '/usr/share/jupyter/kernels', ...found.map((f) => path.join(f.prefix!, 'share/jupyter/kernels'))];
  for (const root of specRoots) {
    for (const name of list(root)) {
      const specDir = path.join(root, name);
      const spec = readJson(path.join(specDir, 'kernel.json'));
      if (!Array.isArray(spec?.argv) || !spec.argv.length || found.some((f) => f.specDir === specDir)) continue;
      const argv0 = String(spec.argv[0]);
      if (spec.argv.some((a: unknown) => /ipykernel/.test(String(a))) && (pythons.has(envOf(argv0)) || /^python3?$/.test(argv0))) continue;
      const exe = argv0.includes('/') ? argv0 : onPath(argv0);
      found.push({
        spec,
        specDir,
        env: { id: `spec:${specDir}`, name: String(spec.display_name ?? name), detail: tildify(specDir), kind: 'spec', language: String(spec.language ?? 'python'), ready: !!exe && isFile(exe) },
      });
    }
  }
  return found;
}

/** The environment to offer first: the one used last, one the notebook names, a ready one next to it, any ready one. */
export function suggestEnv(envs: KernelEnv[], meta: Json | undefined, last?: string): string | undefined {
  if (last && envs.some((e) => e.id === last)) return last;
  const ready = envs.filter((e) => e.ready);
  const want = [meta?.kernelspec?.name, meta?.kernelspec?.display_name].filter((s): s is string => typeof s === 'string').map((s) => s.toLowerCase());
  const named = ready.find((e) => e.kind !== 'system' && want.some((w) => w === e.name.toLowerCase() || w.includes(e.name.toLowerCase())));
  return (named ?? ready.find((e) => e.kind === 'venv') ?? ready[0] ?? envs[0])?.id;
}

export async function launchSpec(id: string, notebook: string): Promise<LaunchSpec> {
  const f = (await findEnvs(notebook)).find((x) => x.env.id === id);
  if (!f) throw new HttpError(404, 'That environment is no longer there');
  if (!f.env.ready) throw new HttpError(400, f.python ? `ipykernel is not installed in ${f.env.name}` : `${f.env.name} cannot start here`);
  if (f.spec) {
    return {
      env: f.env,
      argv: f.spec.argv.map((a: unknown) => String(a).replace('{resource_dir}', f.specDir!)),
      vars: Object.fromEntries(Object.entries(f.spec.env ?? {}).map(([k, v]) => [k, String(v)])),
      interruptMode: f.spec.interrupt_mode === 'message' ? 'message' : 'signal',
    };
  }
  // The environment's own tools come first on PATH, as if it were activated.
  const vars: Record<string, string> = { PATH: `${path.join(f.prefix!, 'bin')}:${agentBaseEnv().PATH ?? ''}` };
  if (f.env.kind === 'conda') Object.assign(vars, { CONDA_PREFIX: f.prefix!, CONDA_DEFAULT_ENV: path.basename(f.prefix!) });
  if (f.env.kind === 'venv') vars.VIRTUAL_ENV = f.prefix!;
  return { env: f.env, argv: [f.python!, '-m', 'ipykernel_launcher', '-f', '{connection_file}'], vars, interruptMode: 'signal' };
}

/** Installs ipykernel into a Python environment, with its pip, or uv when it has none. */
export async function installIpykernel(id: string, notebook?: string): Promise<SetupResult> {
  const f = (await findEnvs(notebook)).find((x) => x.env.id === id);
  if (!f?.python) throw new HttpError(400, 'Only a Python environment can get ipykernel');
  const pip = (await run(f.python, ['-m', 'pip', '--version'], 30_000)).code === 0;
  const uv = pip ? null : onPath('uv');
  if (!pip && !uv) throw new HttpError(400, `${f.env.name} has no pip, and uv is not installed`);
  const r = pip ? await run(f.python, ['-m', 'pip', 'install', 'ipykernel'], 600_000) : await run(uv!, ['pip', 'install', '--python', f.python, 'ipykernel'], 600_000);
  probes.delete(f.python);
  return { ok: r.code === 0, output: `${r.out}\n${r.err}`.trim().slice(-4000) };
}
