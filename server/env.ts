import { spawnSync } from 'node:child_process';
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

let cached: Record<string, string> | null = null;

/**
 * The user's login-shell environment (what a terminal or VS Code would give the agents),
 * captured once from a clean `bash -lic`. Falls back to this process's env.
 */
export function agentBaseEnv(): Record<string, string> {
  if (cached) return cached;
  if (WIN) return (cached = windowsEnv());
  const user = os.userInfo();
  const shell = fs.existsSync('/bin/bash') ? '/bin/bash' : user.shell || '/bin/sh';
  const marker = '__HYDOR_ENV__';
  const res = spawnSync(
    '/usr/bin/env',
    [
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
      `printf '%s\\0' ${marker}; env -0`,
    ],
    { encoding: 'buffer', timeout: 15_000, cwd: user.homedir, stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const out = res.stdout?.toString('utf8') ?? '';
  const at = out.indexOf(marker + '\0');
  const env: Record<string, string> = {};
  if (res.status === 0 && at >= 0) {
    for (const kv of out.slice(at + marker.length + 1).split('\0')) {
      const i = kv.indexOf('=');
      if (i > 0) env[kv.slice(0, i)] = kv.slice(i + 1);
    }
  } else {
    for (const [k, v] of Object.entries(process.env)) if (v != null) env[k] = v;
  }
  for (const k of Object.keys(env)) {
    if (DROP.has(k) || DROP_PREFIX.some((p) => k.startsWith(p))) delete env[k];
  }
  const local = path.join(user.homedir, '.local/bin');
  if (!(env.PATH ?? '').split(':').includes(local)) env.PATH = `${local}:${env.PATH ?? '/usr/bin:/bin'}`;
  // Agents' programs the app installed itself (server/clients.ts), after the user's own.
  env.PATH = `${env.PATH}:${path.join(config.dataDir, 'clients/node_modules/.bin')}`;
  const runtime = `/run/user/${user.uid}`;
  if (!env.XDG_RUNTIME_DIR && fs.existsSync(runtime)) env.XDG_RUNTIME_DIR = runtime;
  if (!env.DBUS_SESSION_BUS_ADDRESS && fs.existsSync(`${runtime}/bus`)) env.DBUS_SESSION_BUS_ADDRESS = `unix:path=${runtime}/bus`;
  env.TERM = 'xterm-256color';
  env.COLORTERM = 'truecolor';
  cached = env;
  return env;
}

/**
 * Windows: a program there gets your whole environment as it is, so this process's own is the agents', with the same
 * names left out; then ~/.local/bin first (where Claude Code installs itself), the agents' programs the app installed
 * itself, and Git's tools (for bash and the commands agents run) last.
 */
function windowsEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v != null && !DROP.has(k) && !DROP_PREFIX.some((p) => k.startsWith(p))) env[k] = v;
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
