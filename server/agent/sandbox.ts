// The sandbox for Custom's commands in Auto and Full modes: with bubblewrap (bwrap) here, a command
// runs with the system read-only except the session folder and /tmp (the network stays open), so it
// cannot change files elsewhere. Without bwrap, or where it cannot start (some containers), commands
// run as before. Settings → Custom turns it off.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const RUNTIME = process.env.HYDOR_RUNTIME ?? '';

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

let setting: { on: boolean; at: number } | null = null;

/** Whether the sandbox is on (Settings → Custom), asked of the app at most every 15 seconds. */
async function wanted(): Promise<boolean> {
  if (setting && Date.now() - setting.at < 15_000) return setting.on;
  let on = setting?.on ?? true;
  if (RUNTIME) {
    try {
      const r = await fetch(`${RUNTIME}/custom`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) on = !!((await r.json()) as { sandbox?: boolean }).sandbox;
    } catch {}
  }
  setting = { on, at: Date.now() };
  return on;
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

/** How bash runs a command for this session now: in the sandbox in Auto and Full modes, when it is on and works here. */
export async function sandboxShell(cwd: string, mode: string): Promise<((command: string) => Shell) | undefined> {
  if (mode !== 'auto' && mode !== 'full') return undefined;
  const bin = sandboxAvailable();
  if (!bin || !(await wanted())) return undefined;
  const tmp = real(os.tmpdir());
  const binds = [...new Set([real(cwd), tmp, '/tmp', gitDir(cwd)].filter((d): d is string => !!d && fs.existsSync(d)))];
  // Package managers keep their caches in the home folder, which is read-only here: these go to /tmp.
  const cache = path.join(tmp, `hydor-sandbox-${os.userInfo().uid}`);
  const env = {
    npm_config_cache: path.join(cache, 'npm'),
    YARN_CACHE_FOLDER: path.join(cache, 'yarn'),
    npm_config_store_dir: path.join(cache, 'pnpm'),
    GOCACHE: path.join(cache, 'go-build'),
    BUN_INSTALL_CACHE_DIR: path.join(cache, 'bun'),
  };
  const args = ['--ro-bind', '/', '/', '--dev-bind', '/dev', '/dev', '--proc', '/proc', ...binds.flatMap((d) => ['--bind', d, d]), '--die-with-parent', '--chdir', cwd];
  return (command) => ({ cmd: bin, args: [...args, '/bin/bash', '-c', command], env });
}

/** What the model is told when a command ran into the sandbox's walls. */
export const SANDBOX_NOTE = '\n(This command ran in a sandbox: it can change files only in the session folder and /tmp. Work within those, or tell the user what needs doing elsewhere.)';
