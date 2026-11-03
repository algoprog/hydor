// A template's own environment: the Node and Python packages its steps and agents need, installed in a
// folder of the template's own (never for the whole computer), and the commands it needs looked for on
// this computer. Installing starts when a template that needs packages is installed from a file or
// saved with new needs (the person saw them on the card, or wrote them), or when a run finds them
// missing; runs wait while it installs, and fail with the reason when it could not.
//
// npm installs without running the packages' own install scripts (--ignore-scripts). Python packages go
// in an environment of the template's own made by uv (python3 -m venv and pip when uv is not here). What
// the steps and agents get: the environment's commands first on PATH, VIRTUAL_ENV, NODE_PATH.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AppRecipe } from '../../shared/apps.ts';
import type { EnvView, Requires } from '../../shared/app-manifest.ts';
import { WORK_DIR } from './runs.ts';

export type { EnvView };
type EnvState = EnvView['state'];

const needsInstall = (r: Requires | undefined) => !!(r && ((r.node && Object.keys(r.node).length) || r.python?.length));
export const envDir = (slug: string) => path.join(WORK_DIR, slug, 'env');
const hashOf = (r: Requires | undefined) => crypto.createHash('sha256').update(JSON.stringify({ node: r?.node ?? {}, python: r?.python ?? [], v: r?.pythonVersion ?? '' })).digest('hex').slice(0, 16);

interface Saved {
  hash: string;
  ok: boolean;
  at: number;
  error?: string;
  log?: string;
}

function saved(slug: string): Saved | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(envDir(slug), 'state.json'), 'utf8')) as Saved;
  } catch {
    return null;
  }
}

/** Whether a command is on this computer's PATH. */
export function hasCommand(name: string): boolean {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue;
    try {
      fs.accessSync(path.join(dir, name), fs.constants.X_OK);
      return true;
    } catch {}
  }
  return false;
}

/** How the commands that install are run; a test puts a stand-in here. */
export const envTesting: { run: ((cmd: string, args: string[], cwd: string) => Promise<{ code: number; out: string }>) | null } = { run: null };

function run(cmd: string, args: string[], cwd: string, timeoutMs = 15 * 60_000): Promise<{ code: number; out: string }> {
  if (envTesting.run) return envTesting.run(cmd, args, cwd);
  return new Promise((resolve) => {
    let out = '';
    const p = spawn(cmd, args, { cwd, env: { ...process.env, npm_config_update_notifier: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
    const keep = (b: Buffer) => {
      out = (out + b.toString()).slice(-20_000);
    };
    p.stdout.on('data', keep);
    p.stderr.on('data', keep);
    const timer = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: 127, out: `${out}\n${e.message}` });
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, out });
    });
  });
}

const going = new Map<string, Promise<void>>();

/** Installs what a template needs, once at a time; resolves when it is ready, rejects with the reason. */
export function ensureEnv(recipe: Pick<AppRecipe, 'requires'>, slug: string, o: { force?: boolean } = {}): Promise<void> {
  const r = recipe.requires;
  if (!needsInstall(r) || !slug || slug === 'test') return Promise.resolve();
  const hash = hashOf(r);
  const s = saved(slug);
  if (!o.force && s?.ok && s.hash === hash) return Promise.resolve();
  const busy = going.get(slug);
  if (busy) return busy;
  const job = install(r!, slug, hash).finally(() => going.delete(slug));
  going.set(slug, job);
  return job;
}

async function install(r: Requires, slug: string, hash: string) {
  const dir = envDir(slug);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const log: string[] = [];
  const step = async (what: string, cmd: string, args: string[]) => {
    log.push(`$ ${[cmd, ...args].join(' ')}`);
    const res = await run(cmd, args, dir);
    log.push(res.out.trim());
    if (res.code !== 0) throw new Error(`${what} failed (${cmd} ended with ${res.code})`);
  };
  try {
    if (r.node && Object.keys(r.node).length) {
      fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify({ name: `hydor-template-${slug}`, private: true, dependencies: r.node }, null, 2)}\n`);
      await step('Installing its Node packages', 'npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--omit=dev']);
    }
    if (r.python?.length) {
      const venv = path.join(dir, '.venv');
      if (hasCommand('uv') || envTesting.run) {
        await step('Making its Python environment', 'uv', ['venv', '--allow-existing', ...(r.pythonVersion ? ['--python', r.pythonVersion] : []), venv]);
        await step('Installing its Python packages', 'uv', ['pip', 'install', '--python', path.join(venv, 'bin', 'python'), ...r.python]);
      } else {
        await step('Making its Python environment', 'python3', ['-m', 'venv', venv]);
        await step('Installing its Python packages', path.join(venv, 'bin', 'pip'), ['install', '--disable-pip-version-check', ...r.python]);
      }
    }
    write(slug, { hash, ok: true, at: Date.now(), log: log.join('\n').slice(-8000) });
  } catch (e) {
    write(slug, { hash, ok: false, at: Date.now(), error: (e as Error).message, log: log.join('\n').slice(-8000) });
    throw e;
  }
}

function write(slug: string, s: Saved) {
  try {
    fs.writeFileSync(path.join(envDir(slug), 'state.json'), JSON.stringify(s));
  } catch {}
}

/** How a template's environment stands: nothing to install, installing, ready, failed, or its needs changed since. */
export function envOf(recipe: Pick<AppRecipe, 'requires'>, slug: string): EnvView {
  const r = recipe.requires;
  const missing = (r?.commands ?? []).filter((c) => !hasCommand(c));
  if (!needsInstall(r)) return { state: 'none', missing };
  if (going.has(slug)) return { state: 'installing', missing };
  const s = saved(slug);
  if (!s) return { state: 'outdated', missing };
  const state: EnvState = s.hash !== hashOf(r) ? 'outdated' : s.ok ? 'ready' : 'failed';
  return { state, missing, log: s.log, error: s.error, at: s.at };
}

/** What a template's steps and agents get to reach its packages: its commands first on PATH. */
export function envVars(recipe: Pick<AppRecipe, 'requires'>, slug: string): Record<string, string> | undefined {
  const r = recipe.requires;
  if (!needsInstall(r)) return undefined;
  const dir = envDir(slug);
  const bins: string[] = [];
  const out: Record<string, string> = {};
  if (r!.python?.length) {
    out.VIRTUAL_ENV = path.join(dir, '.venv');
    bins.push(path.join(dir, '.venv', 'bin'));
  }
  if (r!.node && Object.keys(r!.node).length) {
    out.NODE_PATH = path.join(dir, 'node_modules');
    bins.push(path.join(dir, 'node_modules', '.bin'));
  }
  out.PATH = [...bins, process.env.PATH ?? ''].filter(Boolean).join(path.delimiter);
  return out;
}

/** A line for an agent: where the template's packages are. */
export function envLine(recipe: Pick<AppRecipe, 'requires'>, slug: string): string | null {
  const r = recipe.requires;
  if (!needsInstall(r)) return null;
  const dir = envDir(slug);
  const parts: string[] = [];
  if (r!.python?.length) parts.push(`Python packages (${r!.python.join(', ')}) in ${path.join(dir, '.venv')}: its python is first on PATH`);
  if (r!.node && Object.keys(r!.node).length) parts.push(`Node packages (${Object.keys(r!.node).join(', ')}) in ${path.join(dir, 'node_modules')} (NODE_PATH)`);
  return `The app's own packages are installed for you: ${parts.join('; ')}. Use them rather than installing others.`;
}
