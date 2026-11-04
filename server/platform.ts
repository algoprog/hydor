// What differs on Windows, in one place: the shell agents' commands run in, PATH, and stopping a program with
// everything it started.
//
// Commands run in bash everywhere. On Windows that is Git's (Git for Windows, git-scm.com), as with Claude Code: agents
// and their tools are written for it, and it brings the usual commands (ls, grep, sed…). Without it, commands cannot
// run, and the app says so where they would.
import { execFile, execFileSync, spawn, type ChildProcess, type ChildProcessWithoutNullStreams, type ExecFileOptions, type SpawnOptions } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const WIN = process.platform === 'win32';

let bash: string | null | undefined;
/**
 * The bash commands run in: /bin/bash (or /bin/sh where there is none); on Windows Git's bash.exe, found from
 * CLAUDE_CODE_GIT_BASH_PATH (Claude Code's own setting), from git on the PATH, or where Git installs itself. Never
 * Windows' own bash.exe, which runs in WSL. Null when there is none.
 */
export function bashPath(): string | null {
  if (bash !== undefined) return bash;
  if (!WIN) return (bash = fs.existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh');
  const candidates: string[] = [];
  if (process.env.CLAUDE_CODE_GIT_BASH_PATH) candidates.push(process.env.CLAUDE_CODE_GIT_BASH_PATH);
  for (const dir of pathDirs(process.env)) {
    // …\Git\cmd\git.exe or …\Git\bin\git.exe or …\Git\mingw64\bin\git.exe: bash is in …\Git\bin.
    if (!fs.existsSync(path.join(dir, 'git.exe'))) continue;
    for (const up of ['..', '../..']) candidates.push(path.resolve(dir, up, 'bin', 'bash.exe'));
  }
  const programs = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')];
  for (const p of programs) if (p) candidates.push(path.join(p, 'Git', 'bin', 'bash.exe'));
  candidates.push(path.join(os.homedir(), 'scoop', 'apps', 'git', 'current', 'bin', 'bash.exe'));
  return (bash = candidates.find((c) => c && !/\\system32\\/i.test(c) && fs.existsSync(c)) ?? null);
}

/** Why commands cannot run here, or null when they can. */
export function noShell(): string | null {
  return bashPath() ? null : 'Commands need Git for Windows (git-scm.com), which brings the bash agents use. Install it, then restart Hydor.';
}

/** A command line to run in bash: bash -c on Linux and macOS, Git's bash on Windows (its error when there is none). */
export function bashCommand(command: string): { cmd: string; args: string[] } {
  const b = bashPath();
  if (!b) throw new Error(noShell()!);
  return { cmd: b, args: ['-c', command] };
}

/** The key PATH has in an environment (Windows spells it Path, and any spelling works there). */
export function pathKey(env: Record<string, string | undefined>): string {
  return Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
}

/** The folders on an environment's PATH. */
export function pathDirs(env: Record<string, string | undefined>): string[] {
  return (env[pathKey(env)] ?? '').split(path.delimiter).filter(Boolean);
}

/**
 * The environment with folders put before (and after) those on its PATH, under one key, PATH: two spellings of it in
 * one environment (Windows' own is Path) would leave Windows to pick either, and the app's code reads env.PATH.
 */
export function withPath<T extends Record<string, string | undefined>>(env: T, before: string[], after: string[] = []): T {
  const dirs = pathDirs(env);
  const out = { ...env } as Record<string, string | undefined>;
  for (const k of Object.keys(out)) if (k.toUpperCase() === 'PATH') delete out[k];
  out.PATH = [...before, ...dirs, ...after].join(path.delimiter);
  return out as T;
}

/**
 * Stops a program and what it started: its process group on Linux and macOS (programs started detached lead one),
 * the whole tree on Windows (taskkill /T), where signals do not exist and the program just ends.
 */
export function killTree(pid: number, signal: NodeJS.Signals = 'SIGTERM'): void {
  if (!pid) return;
  if (WIN) {
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => {});
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {}
  }
}

/** The same, waiting until it is done (Windows' taskkill takes a moment). */
export function killTreeSync(pid: number, signal: NodeJS.Signals = 'SIGKILL'): void {
  if (!pid) return;
  if (WIN) {
    try {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } catch {}
    return;
  }
  killTree(pid, signal);
}

/** A Windows path as Git's bash writes it (C:\Users\me → /c/Users/me); others as they are. */
export function bashPathOf(p: string): string {
  if (!WIN) return p;
  const m = /^([A-Za-z]):[\\/]?(.*)$/.exec(p);
  return m ? `/${m[1].toLowerCase()}/${m[2].replace(/\\/g, '/')}` : p.replace(/\\/g, '/');
}

/** A path Git's bash wrote (/c/Users/me, C:/Users/me) as Windows writes it; others as they are. */
export function windowsPathOf(p: string): string {
  if (!WIN) return p;
  const m = /^\/([A-Za-z])(\/.*)?$/.exec(p);
  if (m) return `${m[1].toUpperCase()}:${(m[2] ?? '/').replace(/\//g, '\\')}`;
  return /^[A-Za-z]:\//.test(p) ? p.replace(/\//g, '\\') : p;
}

/** The program at a path: itself, where it can run; on Windows the path with an ending (.exe, .cmd…) when it has none. */
export function programFile(p: string): string | null {
  if (!WIN) {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return fs.statSync(p).isFile() ? p : null;
    } catch {
      return null;
    }
  }
  if (/\.(exe|cmd|bat|com)$/i.test(p)) return fs.existsSync(p) ? p : null;
  for (const e of ['.exe', '.cmd', '.bat', '.com']) if (fs.existsSync(p + e)) return p + e;
  return null;
}

/**
 * A program on an environment's PATH (on Windows with its ending: claude finds claude.exe or claude.cmd), or the path
 * itself when it is one. `skip`: folders to pass over.
 */
export function which(cmd: string, env: Record<string, string | undefined> = process.env, skip?: (dir: string) => boolean): string | null {
  if (/[\\/]/.test(cmd)) return programFile(cmd);
  for (const d of pathDirs(env)) {
    if (skip?.(d)) continue;
    const f = programFile(path.join(d, cmd));
    if (f) return f;
  }
  return null;
}

/**
 * How to start a program. On Windows: an .exe as it is; npm's .cmd launchers through Node.js and the script they name
 * (Node.js starts no .cmd without a shell, and a shell between the app and an agent would stand in the way of its
 * input, output and stopping); any other .cmd or .bat through cmd.exe; a name without an ending as the program PATH
 * has for it. Elsewhere, as it is.
 */
export function launch(file: string, args: string[] = [], env: Record<string, string | undefined> = process.env): { cmd: string; args: string[] } {
  if (!WIN) return { cmd: file, args };
  const found = /\.(exe|com|cmd|bat)$/i.test(file) ? file : (which(file, env) ?? file);
  if (!/\.(cmd|bat)$/i.test(found)) return { cmd: found, args };
  try {
    // npm's (cmd-shim): … "%_prog%"  "%dp0%\..\@openai\codex\bin\codex.js" %*
    const m = /"%~?dp0%?\\([^"]+?)"\s+%\*/i.exec(fs.readFileSync(found, 'utf8'));
    if (m) {
      const target = path.resolve(path.dirname(found), m[1]);
      if (/\.[cm]?js$/i.test(target) && fs.existsSync(target)) {
        const own = path.join(path.dirname(found), 'node.exe');
        return { cmd: fs.existsSync(own) ? own : process.execPath, args: [target, ...args] };
      }
      if (/\.exe$/i.test(target) && fs.existsSync(target)) return { cmd: target, args };
    }
  } catch {}
  return { cmd: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', found, ...args] };
}

/**
 * spawn with its input and output piped, for a program found by name or path: on Windows started as launch says, and
 * without a window of its own.
 */
export function spawnProgram(cmd: string, args: string[], opts: SpawnOptions = {}): ChildProcessWithoutNullStreams {
  const p = launch(cmd, args, (opts.env ?? process.env) as Record<string, string | undefined>);
  return spawn(p.cmd, p.args, { windowsHide: true, ...opts }) as ChildProcessWithoutNullStreams;
}

/** execFile, the same way. */
export function execProgram(
  cmd: string,
  args: string[],
  opts: ExecFileOptions,
  done: (err: (Error & { code?: number | string | null }) | null, stdout: string, stderr: string) => void,
): ChildProcess {
  const p = launch(cmd, args, (opts.env ?? process.env) as Record<string, string | undefined>);
  return execFile(p.cmd, p.args, { windowsHide: true, ...opts, encoding: 'utf8' }, (err, stdout, stderr) => done(err, String(stdout ?? ''), String(stderr ?? '')));
}

/** Whether a path is a full one: /home/me/app, or on Windows C:\Users\me\app (or \\server\share). */
export const isAbsPath = (p: string): boolean => path.isAbsolute(p);

/** A folder's path without the separator at its end (/home/me/app/ → /home/me/app), a root as it is (/, C:\). */
export function trimSep(p: string): string {
  if (p === '/' || /^[A-Za-z]:[\\/]?$/.test(p)) return p;
  return p.replace(/[\\/]+$/, '') || p;
}

/** Whether `p` is `dir` or inside it (on Windows with either separator, in any case). */
export function within(p: string, dir: string): boolean {
  const norm = (x: string) => (WIN ? x.replace(/\//g, '\\').toLowerCase() : x);
  const a = norm(p);
  const b = trimSep(norm(dir));
  const sep = WIN ? '\\' : '/';
  return a === b || a.startsWith(b.endsWith(sep) ? b : b + sep);
}

/**
 * A link at `to` to `from`: a symbolic link. On Windows, where those need Developer Mode (or an administrator), a
 * junction for a folder, and for a file a hard link (on the same disk) or else a copy.
 */
export function linkPath(from: string, to: string, type?: 'dir' | 'file'): void {
  if (!WIN) return fs.symlinkSync(from, to, type);
  try {
    return fs.symlinkSync(from, to, type);
  } catch {}
  if (fs.statSync(from).isDirectory()) return fs.symlinkSync(path.resolve(from), to, 'junction');
  try {
    return fs.linkSync(from, to);
  } catch {}
  fs.copyFileSync(from, to);
}
