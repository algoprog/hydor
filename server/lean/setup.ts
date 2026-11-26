// Setting Lean up, once the person agrees (Settings → General → Lean (proof checker), or the lean_setup tool's card).
// Your own Lean (`lake` and `lean` on your login PATH) is used as it is and never changed. Otherwise the app gets one
// of its own under <data folder>/lean: elan (Lean's installer and version manager) in elan/, installed by its official
// script, fetched over https and run without touching shell start-up files or PATH, with the stable toolchain.
// Mathlib, the library nearly all real mathematics needs, is a second step: one shared Lake project in
// <data folder>/lean/mathlib that requires it, with its built files fetched (`lake exe cache get`), so that nothing is
// compiled from source. A marker file says each step finished; anything else is a set-up to run again.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { appEnv, appPaths, findLean, lastLines, mathlibDir, onPath, run, type Lean, type Ran, type RunOptions } from '../../scripts/agent-tools/lib/lean/core.mjs';
import { LEAN_SIZE_MB, MATHLIB_DOWNLOAD_MB, MATHLIB_SIZE_MB, type LeanState } from '../../shared/lean.ts';
import { config } from '../config.ts';
import { agentBaseEnv } from '../env.ts';
import { WIN } from '../platform.ts';

/** Free disk needed: the toolchain's download and its 3.2 GB unpacked; Mathlib's source, built files (7.5 GB) and their download. */
const DISK_MB = 5 * 1024;
const MATHLIB_DISK_MB = 10 * 1024;

const ELAN_SCRIPT = WIN ? 'https://elan.lean-lang.org/elan-init.ps1' : 'https://elan.lean-lang.org/elan-init.sh';
const MATHLIB_REPO = 'https://github.com/leanprover-community/mathlib4.git';
/** Mathlib's branch that follows Lean's stable releases, and the Lean version it is built with. */
const MATHLIB_REV = 'stable';
const MATHLIB_TOOLCHAIN = 'https://raw.githubusercontent.com/leanprover-community/mathlib4/stable/lean-toolchain';

/** What the set-up reaches outside this file: tests put stand-ins in. */
export interface LeanWorld {
  dir(): string;
  /** Your login environment, where your own Lean is looked for. */
  env(): Record<string, string>;
  /** A small text file over https (elan's installer script, Mathlib's lean-toolchain). */
  fetchText(url: string): Promise<string>;
  freeDiskMb(dir: string): number;
  run(cmd: string, args: string[], o: RunOptions): Promise<Ran>;
  mathlibRepo: string;
}

async function fetchText(url: string): Promise<string> {
  if (!url.startsWith('https://')) throw new Error(`Not an https address: ${url}`);
  const r = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { 'user-agent': 'Hydor' } });
  if (!r.ok) throw new Error(`${new URL(url).host} answered ${r.status}`);
  return r.text();
}

function freeDiskMb(p: string): number {
  try {
    const s = fs.statfsSync(p);
    return (s.bavail * s.bsize) / 2 ** 20;
  } catch {
    return Infinity;
  }
}

const REAL: LeanWorld = {
  dir: () => path.join(config.dataDir, 'lean'),
  env: () => agentBaseEnv(),
  fetchText,
  freeDiskMb,
  run,
  mathlibRepo: MATHLIB_REPO,
};
let world: LeanWorld = REAL;

export const leanDir = () => world.dir();
/** Lean as it is used now, or null. */
export const lean = (): Lean | null => findLean(world.env(), world.dir());
/** Mathlib's project, when it is set up. */
export const mathlib = (): string | null => mathlibDir(world.dir());

// ---- the version ----------------------------------------------------------------------------------------------

const versionOf = (out: string) => /version (\d+\.\d+\.\d+[^\s,]*)/.exec(out)?.[1];
let own: { lean: string; at: number; version?: string } | null = null;
let asking = false;

/** Your own Lean's version, asked in the background (the state does not wait for it). */
function ownVersion(l: Lean): string | undefined {
  if (!asking && (!own || own.lean !== l.lean || Date.now() - own.at > 5 * 60_000)) {
    asking = true;
    execFile(l.lean, ['--version'], { env: l.env, timeout: 20_000, windowsHide: true }, (err, out) => {
      asking = false;
      own = { lean: l.lean, at: Date.now(), version: err ? undefined : versionOf(String(out)) };
    });
  }
  return own?.lean === l.lean ? own.version : undefined;
}

// ---- setting up and removing ------------------------------------------------------------------------------------

let settingUp: Promise<void> | null = null;
/** What the running set-up is at: Lean, then Mathlib. */
let phase: 'lean' | 'mathlib' = 'lean';
let alsoMathlib = false;
let step: string | undefined;
let lastError: string | undefined;
/** Aborted when Lean is removed: what runs stops. */
let life = new AbortController();

/** Whether this computer can set Lean up, in words when not. */
function installable(): { canInstall: boolean; why?: string } {
  const env = world.env();
  if (WIN) return onPath('powershell', env) || onPath('pwsh', env) ? { canInstall: true } : { canInstall: false, why: 'Setting Lean up needs PowerShell.' };
  return onPath('curl', env) ? { canInstall: true } : { canInstall: false, why: 'Setting Lean up needs curl on this computer (Debian/Ubuntu: sudo apt install curl).' };
}

export function leanState(): LeanState {
  const l = lean();
  const marker = appPaths(world.dir()).marker;
  const version = l ? (l.own ? ownVersion(l) : fs.readFileSync(marker, 'utf8').trim() || undefined) : undefined;
  const can = l ? { canInstall: true } : installable();
  const doingMathlib = !!settingUp && (phase === 'mathlib' || alsoMathlib);
  return {
    ready: !!l,
    own: !!l?.own,
    ...(version ? { version } : {}),
    installing: !!settingUp,
    ...(settingUp && step ? { step } : {}),
    ...(lastError && !settingUp ? { error: lastError } : {}),
    canInstall: can.canInstall,
    ...(can.why ? { why: can.why } : {}),
    sizeMb: LEAN_SIZE_MB,
    mathlib: doingMathlib ? 'installing' : l && mathlib() ? 'ready' : 'none',
    mathlibDownloadMb: MATHLIB_DOWNLOAD_MB,
    mathlibSizeMb: MATHLIB_SIZE_MB,
  };
}

const gb = (mb: number) => (mb / 1024).toFixed(1);
function needDisk(mb: number, what: string) {
  const free = world.freeDiskMb(world.dir());
  if (free < mb) throw new Error(`Not enough disk space: ${gb(free)} GB free, and ${what} needs about ${gb(mb)} GB.`);
}

/** One program of a set-up, its latest line as the step, and its last lines when it fails. */
async function doing(label: string, cmd: string, args: string[], o: { cwd?: string; env: Record<string, string>; minutes: number }) {
  step = label;
  const signal = life.signal;
  const r = await world.run(cmd, args, {
    cwd: o.cwd,
    env: o.env,
    timeoutMs: o.minutes * 60_000,
    signal,
    onLine: (l) => (step = `${label}: ${l.replace(/\u001b\[[0-9;]*m/g, '').slice(0, 120)}`),
  });
  if (signal.aborted) throw new Error('Stopped');
  if (r.code !== 0) throw new Error(`${label} failed${r.timedOut ? ` (stopped after ${o.minutes} minutes)` : ''}: ${lastLines(r) || r.failed || `exit code ${r.code}`}`);
  return r;
}

async function installLean() {
  const dir = world.dir();
  const p = appPaths(dir);
  needDisk(DISK_MB, 'Lean');
  const can = installable();
  if (!can.canInstall) throw new Error(can.why);
  fs.rmSync(p.marker, { force: true });
  step = 'Getting Lean’s installer';
  const script = path.join(dir, WIN ? 'elan-init.ps1' : 'elan-init.sh');
  fs.writeFileSync(script, await world.fetchText(ELAN_SCRIPT));
  const env = appEnv(dir, world.env());
  try {
    const label = 'Installing elan, Lean’s version manager';
    // Nothing of yours is changed: no shell start-up file, no PATH.
    if (WIN) {
      const shell = onPath('powershell', env) ?? onPath('pwsh', env)!;
      await doing(label, shell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', `& '${script.replace(/'/g, "''")}' -NoPrompt $true -NoModifyPath $true -DefaultToolchain 'stable'`], { env, cwd: dir, minutes: 15 });
    } else await doing(label, '/bin/sh', [script, '-y', '--no-modify-path', '--default-toolchain', 'stable'], { env, cwd: dir, minutes: 15 });
    // elan fetches the toolchain the first time it is used: now.
    const r = await doing(`Downloading Lean (about ${LEAN_SIZE_MB} MB)`, path.join(p.bin, WIN ? 'lean.exe' : 'lean'), ['--version'], { env, cwd: dir, minutes: 45 });
    const version = versionOf(`${r.stdout}\n${r.stderr}`);
    if (!version) throw new Error(`Lean did not say its version: ${lastLines(r)}`);
    fs.writeFileSync(p.marker, `${version}\n`);
  } finally {
    fs.rmSync(script, { force: true });
  }
}

/** What a snippet that imports Mathlib finds, checked once so that a half-fetched Mathlib is not called ready. */
const PROBE = 'import Mathlib.Tactic\n\nexample : (2 : ℕ) + 2 = 4 := by norm_num\n';

async function installMathlib() {
  const dir = world.dir();
  const p = appPaths(dir);
  const l = lean();
  if (!l) throw new Error('Lean has to be set up first.');
  needDisk(MATHLIB_DISK_MB, 'Mathlib');
  if (!onPath('git', world.env())) throw new Error('Adding Mathlib needs git on this computer.');
  fs.rmSync(p.mathlibMarker, { force: true });
  fs.mkdirSync(p.mathlib, { recursive: true });
  step = 'Getting Mathlib ready';
  const toolchain = (await world.fetchText(MATHLIB_TOOLCHAIN)).trim();
  if (!/^[\w./:-]+$/.test(toolchain)) throw new Error('Mathlib’s Lean version could not be read.');
  fs.writeFileSync(path.join(p.mathlib, 'lean-toolchain'), `${toolchain}\n`);
  fs.writeFileSync(path.join(p.mathlib, 'lakefile.toml'), `name = "hydor_mathlib"\n\n[[require]]\nname = "mathlib"\ngit = ${JSON.stringify(world.mathlibRepo)}\nrev = ${JSON.stringify(MATHLIB_REV)}\n`);
  // Mathlib's own cache of downloads goes in the app's folder, not your home folder.
  const env = { ...l.env, MATHLIB_CACHE_DIR: p.mathlibCache };
  const at = { env, cwd: p.mathlib };
  // Mathlib would fetch its built files at the end of `lake update`: left to the next step, which says what it does.
  await doing('Getting Mathlib’s source', l.lake, ['update'], { ...at, env: { ...env, MATHLIB_NO_CACHE_ON_UPDATE: '1' }, minutes: 60 });
  await doing('Downloading Mathlib’s built files (about 500 MB)', l.lake, ['exe', 'cache', 'get'], { ...at, minutes: 180 });
  fs.writeFileSync(path.join(p.mathlib, 'Probe.lean'), PROBE);
  await doing('Checking that Mathlib works', l.lake, ['lean', 'Probe.lean'], { ...at, minutes: 20 });
  fs.writeFileSync(p.mathlibMarker, `${toolchain}\n`);
  // What was downloaded is unpacked now.
  fs.rmSync(p.mathlibCache, { recursive: true, force: true });
}

/**
 * Sets up Lean when there is none, then Mathlib when asked (and it is not there). Runs in the background: the state
 * says how far it is. Asked again while it runs, it adds Mathlib to what is being done.
 */
export function setupLean(o: { mathlib?: boolean } = {}): Promise<void> {
  if (settingUp) {
    if (o.mathlib && phase !== 'mathlib') alsoMathlib = true;
    return settingUp;
  }
  const needsLean = !lean();
  const needsMathlib = !!o.mathlib && (needsLean || !mathlib());
  if (!needsLean && !needsMathlib) return Promise.resolve();
  lastError = undefined;
  alsoMathlib = needsMathlib;
  phase = needsLean ? 'lean' : 'mathlib';
  step = 'Getting ready';
  const removed = life.signal;
  settingUp = (async () => {
    try {
      // What is still being removed goes first.
      await removing;
      fs.mkdirSync(world.dir(), { recursive: true });
      if (needsLean) await installLean();
      if (alsoMathlib && !removed.aborted) {
        phase = 'mathlib';
        await installMathlib();
      }
    } catch (e) {
      lastError = removed.aborted ? undefined : (e as Error).message.slice(0, 2000);
    }
  })().finally(() => {
    settingUp = null;
    alsoMathlib = false;
    step = undefined;
  });
  return settingUp;
}

async function stopSetup() {
  life.abort();
  life = new AbortController();
  if (settingUp) await settingUp.catch(() => {});
}

/** Done once what is being removed is gone. */
let removing: Promise<unknown> = Promise.resolve();

/**
 * Removes the app's own Lean and Mathlib (or Mathlib alone), stopping a set-up first. Your own Lean stays as it is.
 * Mathlib is some 150,000 files: they go in the background of the app, which answers meanwhile.
 */
export async function removeLean(o: { mathlib?: boolean } = {}): Promise<void> {
  const dir = world.dir();
  const p = appPaths(dir);
  const gone = async (...paths: string[]) => {
    // The markers first: it is not ready from this moment.
    for (const m of [p.mathlibMarker, ...(o.mathlib ? [] : [p.marker])]) fs.rmSync(m, { force: true });
    const going = Promise.all(paths.map((f) => fs.promises.rm(f, { recursive: true, force: true, maxRetries: 3 })));
    removing = Promise.allSettled([removing, going]);
    await going;
  };
  if (o.mathlib) {
    // Stops Mathlib's step, or takes it off what is being set up; Lean's own set-up goes on.
    if (settingUp && phase === 'mathlib') await stopSetup();
    else alsoMathlib = false;
    await gone(p.mathlib, p.mathlibCache);
  } else {
    await stopSetup();
    await gone(dir);
  }
  lastError = undefined;
  own = null;
}

/** For tests: stand-ins for the world outside; null puts the real one back. */
export function setLeanForTests(w: Partial<LeanWorld> | null) {
  world = w ? { ...REAL, ...w } : REAL;
  own = null;
  asking = false;
  lastError = undefined;
}
