import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';
import { bashPath, pathDirs, withPath, WIN } from './platform.ts';

// Variables that describe the parent process, not the user's login environment.
const DROP = new Set([
  'PWD',
  'OLDPWD',
  'SHLVL',
  '_',
  'PS1',
  'PS2',
  'PROMPT_COMMAND',
  'COLUMNS',
  'LINES',
  'INVOCATION_ID',
  'JOURNAL_STREAM',
  'SYSTEMD_EXEC_PID',
  'MANAGERPID',
  'NOTIFY_SOCKET',
]);
const DROP_PREFIX = ['CLAUDECODE', 'CLAUDE_CODE_', 'CODEX_THREAD', 'CODEX_MANAGED', 'VSCODE_', 'BASH_FUNC_', 'npm_', 'NODE_ENV', 'WEB_AGENT', 'HYDOR_ROOT'];
/** Yours although their prefix is dropped: where Claude Code keeps its temporary files, when you say. */
const KEEP = new Set(['CLAUDE_CODE_TMPDIR']);
const dropped = (k: string) => !KEEP.has(k) && (DROP.has(k) || DROP_PREFIX.some((p) => k.startsWith(p)));

let cached: Record<string, string> | null = null;

/** What `bash -lic` gave last time, kept in the data folder (only you can read it) with the startup files it read. */
const SAVED = () => path.join(config.dataDir, 'login-env.json');
/** A week at most, and new as soon as one of the shell's startup files changes. */
const SAVED_MS = 7 * 24 * 3600_000;
const STARTUP = () => ['.bash_profile', '.bash_login', '.profile', '.bashrc'].map((f) => path.join(os.homedir(), f)).concat(['/etc/profile', '/etc/bash.bashrc', '/etc/environment']);
const stamp = () =>
  STARTUP()
    .map((f) => {
      try {
        return `${f}@${fs.statSync(f).mtimeMs}`;
      } catch {
        return `${f}@-`;
      }
    })
    .join('|');

/**
 * The user's login-shell environment (what a terminal or VS Code would give the agents), from a clean `bash -lic`.
 * Reading it takes a second or two (more with conda and completions), which the server once spent at every start
 * before it answered anything: now the one read last time is used at once when the shell's startup files have not
 * changed since, and read again a few seconds later in the background, for what changes without them (an ssh-agent's
 * socket). Falls back to this process's env.
 */
export function agentBaseEnv(): Record<string, string> {
  if (cached) return cached;
  if (WIN) return (cached = windowsEnv());
  const saved = savedEnv();
  if (saved) {
    cached = finish(saved);
    const later = setTimeout(() => void readAgain(), 3000);
    later.unref?.();
    return cached;
  }
  const res = spawnSync(shellCommand()[0], shellCommand().slice(1), { encoding: 'buffer', timeout: 15_000, cwd: os.homedir(), stdio: ['ignore', 'pipe', 'ignore'] });
  const read = parse(res.status, res.stdout?.toString('utf8') ?? '');
  if (read) save(read);
  return (cached = finish(read ?? ownEnv()));
}

const MARKER = '__HYDOR_ENV__';

function shellCommand(): string[] {
  const user = os.userInfo();
  const shell = fs.existsSync('/bin/bash') ? '/bin/bash' : user.shell || '/bin/sh';
  return [
    '/usr/bin/env',
    '-i',
    `HOME=${user.homedir}`,
    `USER=${user.username}`,
    `LOGNAME=${user.username}`,
    `SHELL=${user.shell || shell}`,
    'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    'TERM=dumb',
    `LANG=${process.env.LANG || 'C.UTF-8'}`,
    shell,
    '-lic',
    `printf '%s\\0' ${MARKER}; env -0`,
  ];
}

/** The variables a login shell printed, or null when it failed. */
function parse(status: number | null, out: string): Record<string, string> | null {
  const at = out.indexOf(MARKER + '\0');
  if (status !== 0 || at < 0) return null;
  const env: Record<string, string> = {};
  for (const kv of out.slice(at + MARKER.length + 1).split('\0')) {
    const i = kv.indexOf('=');
    if (i > 0) env[kv.slice(0, i)] = kv.slice(i + 1);
  }
  return env;
}

const ownEnv = () => Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] != null));

function savedEnv(): Record<string, string> | null {
  try {
    const s = JSON.parse(fs.readFileSync(SAVED(), 'utf8')) as { at?: number; stamp?: string; env?: Record<string, string> };
    if (s.stamp === stamp() && typeof s.at === 'number' && Date.now() - s.at < SAVED_MS && s.env && typeof s.env === 'object') return s.env;
  } catch {
    // None yet, or unreadable: read the shell.
  }
  return null;
}

function save(env: Record<string, string>) {
  try {
    fs.mkdirSync(config.dataDir, { recursive: true });
    const tmp = `${SAVED()}.${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify({ at: Date.now(), stamp: stamp(), env }), { mode: 0o600 });
    fs.renameSync(tmp, SAVED());
  } catch {
    // A data folder that cannot be written: the shell is read at each start, as before.
  }
}

/** The shell read again in the background; what agents start with from then on. */
function readAgain(): Promise<void> {
  return new Promise((resolve) => {
    const cmd = shellCommand();
    let out = '';
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(cmd[0], cmd.slice(1), { cwd: os.homedir(), stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      return resolve();
    }
    const kill = setTimeout(() => child.kill('SIGKILL'), 15_000);
    kill.unref?.();
    child.stdout!.setEncoding('utf8').on('data', (d: string) => (out += d));
    child.on('error', () => (clearTimeout(kill), resolve()));
    child.on('close', (code) => {
      clearTimeout(kill);
      const read = parse(code, out);
      if (read) {
        save(read);
        cached = finish(read);
      }
      resolve();
    });
  });
}

/** What the agents get from a login shell's variables: those of this process left out, the app's own added. */
function finish(read: Record<string, string>): Record<string, string> {
  const user = os.userInfo();
  const env = { ...read };
  for (const k of Object.keys(env)) {
    if (dropped(k)) delete env[k];
  }
  // Set in the app's own settings (~/.config/hydor.env) rather than your shell's.
  if (!env.CLAUDE_CODE_TMPDIR && process.env.CLAUDE_CODE_TMPDIR) env.CLAUDE_CODE_TMPDIR = process.env.CLAUDE_CODE_TMPDIR;
  claudeTemp(env);
  const local = path.join(user.homedir, '.local/bin');
  if (!(env.PATH ?? '').split(':').includes(local)) env.PATH = `${local}:${env.PATH ?? '/usr/bin:/bin'}`;
  // Agents' programs the app installed itself (server/clients.ts), after the user's own.
  env.PATH = `${env.PATH}:${path.join(config.dataDir, 'clients/node_modules/.bin')}`;
  const runtime = `/run/user/${user.uid}`;
  if (!env.XDG_RUNTIME_DIR && fs.existsSync(runtime)) env.XDG_RUNTIME_DIR = runtime;
  if (!env.DBUS_SESSION_BUS_ADDRESS && fs.existsSync(`${runtime}/bus`)) env.DBUS_SESSION_BUS_ADDRESS = `unix:path=${runtime}/bus`;
  env.TERM = 'xterm-256color';
  env.COLORTERM = 'truecolor';
  return env;
}

/** Where the agents' Claude Code keeps its temporary files when /tmp can't have them (claudeTemp). */
export const claudeTempFallback = () => path.join(config.dataDir, 'tmp');

/**
 * Claude Code keeps its temporary files in claude-<uid> in CLAUDE_CODE_TMPDIR, else TMPDIR, else /tmp, and stops as it
 * starts when it can't make that folder or someone else has it (EACCES, mkdir '/tmp/claude-1000', where /tmp is closed to
 * you). Then they go in the app's data folder instead; a CLAUDE_CODE_TMPDIR of yours is kept as it is.
 */
export function claudeTemp(env: Record<string, string>) {
  const uid = process.getuid?.();
  if (uid === undefined || env.CLAUDE_CODE_TMPDIR) return;
  const dir = path.join(env.TMPDIR || env.TMP || env.TEMP || '/tmp', `claude-${uid}`);
  let why: string | null = null;
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const st = fs.lstatSync(dir);
    if (!st.isDirectory()) why = 'it is not a folder';
    else if (st.uid !== uid) why = `user ${st.uid} has it`;
    else fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);
  } catch (e) {
    why = (e as Error).message;
  }
  if (!why) return;
  const own = claudeTempFallback();
  try {
    fs.mkdirSync(own, { recursive: true, mode: 0o700 });
  } catch {
    return;
  }
  env.CLAUDE_CODE_TMPDIR = own;
  console.warn(`[agents] Claude Code can't keep its temporary files in ${dir} (${why}): they go in ${own}`);
}

/**
 * Windows: a program there gets your whole environment as it is, so this process's own is the agents', with the same
 * names left out; then ~/.local/bin first (where Claude Code installs itself), the agents' programs the app installed
 * itself, and Git's tools (for bash and the commands agents run) last.
 */
function windowsEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v != null && !dropped(k)) env[k] = v;
  const have = new Set(pathDirs(env).map((d) => d.toLowerCase()));
  const before = [path.join(os.homedir(), '.local', 'bin')].filter((d) => !have.has(d.toLowerCase()));
  const after = [path.join(config.dataDir, 'clients', 'node_modules', '.bin')];
  const bash = bashPath();
  if (bash) {
    // …\Git\bin\bash.exe: the commands are in …\Git\usr\bin (and git in …\Git\cmd).
    const git = path.resolve(path.dirname(bash), '..');
    for (const d of [path.join(git, 'cmd'), path.join(git, 'usr', 'bin')]) if (!have.has(d.toLowerCase()) && fs.existsSync(d)) after.push(d);
  }
  const out = withPath(env, before, after);
  out.TERM = 'xterm-256color';
  out.COLORTERM = 'truecolor';
  return out;
}
