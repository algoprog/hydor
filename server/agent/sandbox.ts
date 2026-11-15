// The sandbox for Custom's commands in Auto mode: a command can read everything but change files only in the session
// folder, the temporary folder and the repository's own folder (the network stays open), so it cannot change files
// elsewhere. Each system has its own:
// - Linux: bubblewrap (bwrap), the system read-only but for those folders.
// - macOS: Seatbelt (Apple's sandbox-exec), with a profile that refuses writes outside them.
// - Windows: low integrity (lowbox.ts): the command runs below the user's level, and only the session's folders are
//   marked so it may write there.
// Without one, or where it cannot start (some containers), commands run as before. Settings → Custom turns it off.
// A confidential session (server/confidential) runs every command without network, in every mode and whatever that
// setting: bubblewrap gives it a network of its own with nothing in it (--unshare-net), Seatbelt refuses it any.
// Where that cannot run (Windows), main.ts has each command ask the user.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bashCommand, bashPath } from '../platform.ts';
import { labelLow, lowboxAvailable, lowboxPath, lowboxProblem, lowTemp, type Lowbox } from './lowbox.ts';

export { lowboxProblem };

const RUNTIME = process.env.HYDOR_RUNTIME ?? '';
/** This process runs a confidential session (the app started it so). */
export const CONFIDENTIAL_ENV = process.env.HYDOR_CONFIDENTIAL === '1';

/** The sandbox this system has: its kind, and the program that runs a command in it. */
export interface Sandbox {
  kind: 'bwrap' | 'seatbelt' | 'lowbox';
  bin: string;
  /** Windows: the helper and Git's bash as sandboxed commands reach it. */
  lowbox?: Lowbox;
}

const SANDBOX_EXEC = '/usr/bin/sandbox-exec';

let found: Sandbox | null | undefined;

/** The sandbox that runs here (tried once). */
export function sandboxAvailable(): Sandbox | null {
  if (found !== undefined) return found;
  found = null;
  if (process.platform === 'linux') {
    for (const d of [...(process.env.PATH ?? '').split(':'), '/usr/bin', '/bin']) {
      const p = d && path.join(d, 'bwrap');
      if (!p || !fs.existsSync(p)) continue;
      const r = spawnSync(p, ['--ro-bind', '/', '/', '--dev-bind', '/dev', '/dev', '--proc', '/proc', '--die-with-parent', '/bin/true'], { timeout: 5000, stdio: 'ignore' });
      if (r.status === 0) found = { kind: 'bwrap', bin: p };
      break;
    }
  } else if (process.platform === 'darwin') {
    // Its full path, never one found on PATH.
    if (fs.existsSync(SANDBOX_EXEC) && spawnSync(SANDBOX_EXEC, ['-p', seatbeltProfile(0, { walls: true, cut: false }), '/usr/bin/true'], { timeout: 5000, stdio: 'ignore' }).status === 0) found = { kind: 'seatbelt', bin: SANDBOX_EXEC };
  } else if (process.platform === 'win32') {
    const box = lowboxAvailable(bashPath());
    if (box) found = { kind: 'lowbox', bin: box.exe, lowbox: box };
  }
  return found;
}

let cutter: boolean | undefined;

/** Whether the sandbox can also keep a command off the network: no internet, no other computer, not this one's servers (tried once). */
export function netCutAvailable(): boolean {
  if (cutter !== undefined) return cutter;
  const sb = sandboxAvailable();
  if (sb?.kind === 'bwrap') cutter = spawnSync(sb.bin, ['--bind', '/', '/', '--dev-bind', '/dev', '/dev', '--proc', '/proc', '--unshare-net', '--die-with-parent', '/bin/true'], { timeout: 5000, stdio: 'ignore' }).status === 0;
  else if (sb?.kind === 'seatbelt') cutter = spawnSync(sb.bin, ['-p', seatbeltProfile(0, { walls: false, cut: true }), '/usr/bin/true'], { timeout: 5000, stdio: 'ignore' }).status === 0;
  else cutter = false;
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
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd, encoding: 'utf8', timeout: 3000, windowsHide: true });
  const dir = r.status === 0 ? real(r.stdout.trim()) : '';
  const own = real(cwd);
  return dir && dir !== own && !dir.startsWith(own + path.sep) && !dir.startsWith(own + '/') ? dir : null;
}

export interface Shell {
  cmd: string;
  args: string[];
  env?: Record<string, string>;
}

/**
 * How bash runs a command for this session now: in the sandbox in Auto mode, when it is on and works here;
 * in a confidential session (`confidential`) always without network, in every mode, the files kept as the mode has
 * them. Undefined: as it is (main.ts then has a confidential session's commands ask each time).
 */
export async function sandboxShell(cwd: string, mode: string, confidential = false): Promise<((command: string) => Shell) | undefined> {
  // Full access uses the host shell, not the sandbox (which also prevents sudo).
  // Confidential network isolation is independent of the permission mode.
  if (mode === 'full' && !confidential) return undefined;
  const sb = sandboxAvailable();
  if (!sb) return undefined;
  const walls = mode === 'auto' && (await wanted());
  const cut = confidential && netCutAvailable();
  if (confidential && !cut) return undefined;
  if (!walls && !cut) return undefined;
  if (sb.kind === 'bwrap') {
    const args = sandboxArgs(cwd, { walls, cut });
    const env = walls ? cacheEnv(path.join(real(os.tmpdir()), `hydor-sandbox-${os.userInfo().uid}`)) : undefined;
    return (command) => ({ cmd: sb.bin, args: [...args, '/bin/bash', '-c', command], ...(env ? { env } : {}) });
  }
  if (sb.kind === 'seatbelt') {
    const dirs = walls ? writable(cwd) : [];
    const args = ['-p', seatbeltProfile(dirs.length, { walls, cut }), ...dirs.flatMap((d, i) => ['-D', `W${i}=${d}`])];
    const env = walls ? cacheEnv(path.join(real(os.tmpdir()), `hydor-sandbox-${os.userInfo().uid}`)) : undefined;
    return (command) => {
      const b = bashCommand(command);
      return { cmd: sb.bin, args: [...args, b.cmd, ...b.args], ...(env ? { env } : {}) };
    };
  }
  // Windows: walls only (it has no way to cut the network). Folders it must not mark leave the command as it is.
  const dirs = [cwd, gitDir(cwd)].filter((d): d is string => !!d && fs.existsSync(d));
  if (!dirs.every((d) => labelLow(sb.bin, d))) return undefined;
  const tmp = path.join(lowTemp(), 'tmp');
  fs.mkdirSync(tmp, { recursive: true });
  const box = sb.lowbox!;
  // Git's bash and the programs it runs through the sandbox's junction (lowbox.ts says why).
  const env = { ...cacheEnv(path.join(lowTemp(), 'cache')), ...lowboxPath(process.env, box), TMP: tmp, TEMP: tmp, TMPDIR: tmp };
  return (command) => ({ cmd: sb.bin, args: [box.bash, '-c', command], env });
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

/**
 * The folders a command may change on a Mac, as Seatbelt sees them (their real paths: /tmp is /private/tmp): the
 * session folder, the temporary folders (the user's own, with its cache folder beside it, and /tmp) and the
 * repository's own folder.
 */
export function writable(cwd: string): string[] {
  const tmp = real(os.tmpdir());
  // The user's temporary folder is …/T, its caches (compilers', Xcode's) …/C beside it.
  const perUser = /^\/private\/var\/folders\/[^/]+\/[^/]+\/T$/.test(tmp) ? path.dirname(tmp) : tmp;
  return [...new Set([real(cwd), perUser, real('/tmp'), gitDir(cwd)].filter((d): d is string => !!d && fs.existsSync(d)))];
}

/**
 * Seatbelt's profile: everything allowed but, with `walls`, writes outside the `n` folders given as parameters W0…
 * (and the terminal devices); with `cut`, the network, any of it.
 */
export function seatbeltProfile(n: number, o: { walls: boolean; cut: boolean }): string {
  const lines = ['(version 1)', '(allow default)'];
  if (o.cut) lines.push('(deny network*)');
  if (o.walls) {
    const dirs = Array.from({ length: n }, (_, i) => `(subpath (param "W${i}"))`);
    lines.push('(deny file-write*)', `(allow file-write* ${[...dirs, '(literal "/dev/null")', '(literal "/dev/zero")', '(literal "/dev/dtracehelper")', '(literal "/dev/ptmx")', '(regex #"^/dev/tty")', '(regex #"^/dev/fd/")'].join(' ')})`);
  }
  return lines.join('\n');
}

/** Package managers keep their caches in the home folder, which is read-only in the sandbox: these go to `base`. */
function cacheEnv(base: string): Record<string, string> {
  return {
    npm_config_cache: path.join(base, 'npm'),
    YARN_CACHE_FOLDER: path.join(base, 'yarn'),
    npm_config_store_dir: path.join(base, 'pnpm'),
    GOCACHE: path.join(base, 'go-build'),
    BUN_INSTALL_CACHE_DIR: path.join(base, 'bun'),
  };
}

/** Whether a sandboxed command's output shows it ran into the sandbox's walls, as this system words it. */
export function wallsHit(out: string, platform: string = process.platform): boolean {
  if (platform === 'darwin') return /Operation not permitted/.test(out);
  if (platform === 'win32') return /Permission denied|Access is denied|EPERM|EACCES/.test(out);
  return /Read-only file system/.test(out);
}

/** What the model is told when a command ran into the sandbox's walls. */
export const SANDBOX_NOTE =
  process.platform === 'win32'
    ? '\n(This command ran in a sandbox: it can change files only in the session folder and its temporary folder, $TMP. Work within those, or tell the user what needs doing elsewhere.)'
    : '\n(This command ran in a sandbox: it can change files only in the session folder and /tmp. Work within those, or tell the user what needs doing elsewhere.)';

/** Output of a command that tried the network and found none. */
export const netRefused = (out: string) =>
  /Could not resolve host|Temporary failure in name resolution|Name or service not known|nodename nor servname provided|getaddrinfo|ENOTFOUND|EAI_AGAIN|Network is unreachable|ENETUNREACH|Connection refused|ECONNREFUSED|No route to host|Failed to establish a new connection|unable to access '|Couldn't connect to server|connect EPERM|connect: Operation not permitted/i.test(out);

/** What the model is told when a command of a confidential session tried the network. */
export const NET_NOTE = '\n(This is a confidential session: commands run without network, so nothing can be downloaded, sent or reached from here. Work with what is on this computer, or tell the user what would need the internet.)';
