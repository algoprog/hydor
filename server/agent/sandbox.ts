// The sandbox for Custom's commands in Auto and Full modes: with bubblewrap (bwrap) here, a command
// runs with the system read-only except the session folder and /tmp (the network stays open), so it
// cannot change files elsewhere. Without bwrap, or where it cannot start (some containers), commands
// run as before. Settings → Custom turns it off.
// A confidential session (server/confidential) runs every command without network, in every mode and
// whatever that setting: in a network of its own with nothing in it (--unshare-net). Where that cannot run,
// main.ts has each command ask the user.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const RUNTIME = process.env.HYDOR_RUNTIME ?? '';
/** This process runs a confidential session (the app started it so). */
export const CONFIDENTIAL_ENV = process.env.HYDOR_CONFIDENTIAL === '1';

let bwrap: string | null | undefined;

/** bwrap's path when it runs here (tried once). */
export function sandboxAvailable(): string | null {
  if (bwrap !== undefined) return bwrap;
  bwrap = null;
  if (process.platform !== 'linux') return bwrap;
  for (const d of [...(process.env.PATH ?? '').split(':'), '/usr/bin', '/bin']) {
    const p = d && path.join(d, 'bwrap');
    if (!p || !fs.existsSync(p)) continue;
    const r = spawnSync(p, ['--ro-bind', '/', '/', '--dev-bind', '/dev', '/dev', '--proc', '/proc', '--die-with-parent', '/bin/true'], { timeout: 5000, stdio: 'ignore' });
    if (r.status === 0) bwrap = p;
    break;
  }
  return bwrap;
}

let cutter: boolean | undefined;

/** Whether bwrap can also give a command a network of its own, with nothing in it (tried once). */
export function netCutAvailable(): boolean {
  if (cutter !== undefined) return cutter;
  const bin = sandboxAvailable();
  cutter = !!bin && spawnSync(bin, ['--bind', '/', '/', '--dev-bind', '/dev', '/dev', '--proc', '/proc', '--unshare-net', '--die-with-parent', '/bin/true'], { timeout: 5000, stdio: 'ignore' }).status === 0;
  return cutter;
}

let setting: { on: boolean; confidential: boolean; at: number } | null = null;

/** The sandbox setting (Settings → Custom) and whether the session is confidential, asked of the app at most every 15 seconds. */
async function asked(): Promise<{ on: boolean; confidential: boolean }> {
  if (setting && Date.now() - setting.at < 15_000) return setting;
  let on = setting?.on ?? true;
  // Once confidential, always: a session can't stop being one.
  let confidential = setting?.confidential ?? false;
  if (RUNTIME) {
    try {
      const r = await fetch(`${RUNTIME}/custom`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        const d = (await r.json()) as { sandbox?: boolean; confidential?: boolean };
        on = !!d.sandbox;
        confidential ||= !!d.confidential;
      }
    } catch {}
  }
  setting = { on, confidential, at: Date.now() };
  return setting;
}

const wanted = async () => (await asked()).on;

/** Whether this session is confidential: its process was started so, or the app says it is. */
export async function confidentialSession(): Promise<boolean> {
  return CONFIDENTIAL_ENV || (await asked()).confidential;
}

const real = (p: string) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
};

/** The repository's own folder when it lies outside the session folder (a worktree, a subfolder), so git can commit. */
function gitDir(cwd: string): string | null {
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd, encoding: 'utf8', timeout: 3000 });
  const dir = r.status === 0 ? real(r.stdout.trim()) : '';
  return dir && !dir.startsWith(real(cwd) + '/') ? dir : null;
}

export interface Shell {
  cmd: string;
  args: string[];
  env?: Record<string, string>;
}

/**
 * How bash runs a command for this session now: in the sandbox in Auto and Full modes, when it is on and works here;
 * in a confidential session (`confidential`) always without network, in every mode, the files kept as the mode has
 * them. Undefined: as it is (main.ts then has a confidential session's commands ask each time).
 */
export async function sandboxShell(cwd: string, mode: string, confidential = false): Promise<((command: string) => Shell) | undefined> {
  const bin = sandboxAvailable();
  if (!bin) return undefined;
  const walls = (mode === 'auto' || mode === 'full') && (await wanted());
  const cut = confidential && netCutAvailable();
  if (confidential && !cut) return undefined;
  if (!walls && !cut) return undefined;
  const args = sandboxArgs(cwd, { walls, cut });
  const env = walls ? cacheEnv() : undefined;
  return (command) => ({ cmd: bin, args: [...args, '/bin/bash', '-c', command], ...(env ? { env } : {}) });
}

/**
 * bwrap's arguments: with `walls`, the system read-only but for the session folder, /tmp and the repository's own
 * folder; else all of it as it is. With `cut`, a network of its own with nothing in it: no internet, no other
 * computer, not even this one's servers.
 */
export function sandboxArgs(cwd: string, o: { walls: boolean; cut: boolean }): string[] {
  const tmp = real(os.tmpdir());
  const binds = [...new Set([real(cwd), tmp, '/tmp', gitDir(cwd)].filter((d): d is string => !!d && fs.existsSync(d)))];
  const files = o.walls ? ['--ro-bind', '/', '/', '--dev-bind', '/dev', '/dev', '--proc', '/proc', ...binds.flatMap((d) => ['--bind', d, d])] : ['--bind', '/', '/', '--dev-bind', '/dev', '/dev', '--proc', '/proc'];
  return [...files, ...(o.cut ? ['--unshare-net'] : []), '--die-with-parent', '--chdir', cwd];
}

/** Package managers keep their caches in the home folder, which is read-only in the sandbox: these go to /tmp. */
function cacheEnv(): Record<string, string> {
  const tmp = real(os.tmpdir());
  const cache = path.join(tmp, `hydor-sandbox-${os.userInfo().uid}`);
  return {
    npm_config_cache: path.join(cache, 'npm'),
    YARN_CACHE_FOLDER: path.join(cache, 'yarn'),
    npm_config_store_dir: path.join(cache, 'pnpm'),
    GOCACHE: path.join(cache, 'go-build'),
    BUN_INSTALL_CACHE_DIR: path.join(cache, 'bun'),
  };
}

/** What the model is told when a command ran into the sandbox's walls. */
export const SANDBOX_NOTE = '\n(This command ran in a sandbox: it can change files only in the session folder and /tmp. Work within those, or tell the user what needs doing elsewhere.)';

/** Output of a command that tried the network and found none. */
export const netRefused = (out: string) =>
  /Could not resolve host|Temporary failure in name resolution|Name or service not known|getaddrinfo|ENOTFOUND|EAI_AGAIN|Network is unreachable|ENETUNREACH|Connection refused|ECONNREFUSED|No route to host|Failed to establish a new connection|unable to access '/i.test(out);

/** What the model is told when a command of a confidential session tried the network. */
export const NET_NOTE = '\n(This is a confidential session: commands run without network, so nothing can be downloaded, sent or reached from here. Work with what is on this computer, or tell the user what would need the internet.)';
