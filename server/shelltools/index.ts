// Shell commands the app adds to every agent's PATH: waitfor (wait for a job in one call), job (long work the Jobs section
// shows, after other jobs or in a queue: server/jobs), edits (several exact edits in one call), sym (a definition with its
// whole body) and leancheck (whether a Lean file's proofs hold: server/lean). They are the programs in
// scripts/agent-tools/ (its README says what each does). The app writes a small launcher for each into <data folder>/shelltools/bin at every start, which runs
// the app's own Node.js on the tool (agents' shells have no node on their PATH: the tools start with
// `#!/usr/bin/env node`), tries each launcher once, in the background, the way an agent's shell would run it, and
// from then on puts that folder first on the PATH of every session it starts and tells it about the tools that worked.
// On unless HYDOR_SHELL_TOOLS=0 (docs/configuration.md); it has no setting.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { APP_ROOT, bundledRg, config } from '../config.ts';
import { agentBaseEnv } from '../env.ts';
import type { Feature } from '../features/types.ts';
import { bashCommand, bashPath, WIN } from '../platform.ts';

export const TOOLS = ['waitfor', 'job', 'edits', 'sym', 'leancheck'] as const;
export type Tool = (typeof TOOLS)[number];

/** What each session is told, one bullet for each tool that works (the same text every time, so the provider's cache of it holds). */
export const SHELL_TOOLS_HEAD = 'Shell commands this app adds to your PATH (each has --help):';
export const SHELL_TOOLS_TEXT: Record<Tool, string> = {
  waitfor:
    '- waitfor: wait for a long job in ONE call instead of sleep/poll loops. Conditions: --pid, --proc, --file, --log FILE --match REGEX, --http URL, --unit, --slurm ID [--via \'ssh host\'], --until \'cmd\'. Add --fail REGEX to stop at the first crash line, --tail FILE:N to see the output, --timeout 30m. `--log FILE --match` sees only lines written after it starts, unless `--from-start`. `waitfor -- cmd args` runs a command and waits for it. Run it as a background command when the wait may take more than a few minutes.',
  job: '- job: run long work (anything over ~10 minutes) so the user sees it in Hydor\'s Jobs section with its progress and time left: `job run --name \'what it is\' [--tag WORD] [--eta 2h] [--after ID|NAME] [--queue NAME] -- cmd args`, as a background command. Tag each job with the broad kind of work it is (experiments, data-collection, data-processing, development, builds, tests, deployment, analysis, maintenance), reusing a tag from `job tags`; never a project or topic name. It waits first for the jobs named in --after to finish and for its turn in its --queue (one job at a time per queue), then runs the command and ends with its exit code. Print progress as "step 120/500" or "42%" so the time left can be estimated. `job list`, `job wait ID`, `job stop ID`. `job adopt --pid PID --name \'…\' --log FILE` shows long work started earlier without restarting it.',
  edits:
    '- edits: several exact search/replace edits across files in one atomic call. It reads a script on stdin: `=== path` sections holding <<<<<<< SEARCH / ======= / >>>>>>> REPLACE blocks. Nothing is written unless every block matches exactly once, and it prints the changed lines with their numbers, so there is no need to re-read the files. Use it when changing more than one place.',
  sym: '- sym NAME...: a definition with its whole body and exact line range (TypeScript, JavaScript, Python, Rust). `sym --refs NAME` lists references, `sym --outline FILE` a file\'s declarations. Use grep for text and strings.',
  leancheck:
    '- leancheck FILE.lean: whether its proofs hold (it builds, no sorry, standard axioms only, kernel re-check), with what each theorem states and a pin of that statement. Exits 0 only then, so a goal\'s command check can be "leancheck Proofs/Main.lean --theorem NAME@PIN" (with the pin of the agreed statement, so a changed one fails: exit 3). --theorem NAME[@PIN], --allow-sorry. Needs Lean set up.',
};

export const shellToolsText = (tools: readonly Tool[]): string => [SHELL_TOOLS_HEAD, ...TOOLS.filter((t) => tools.includes(t)).map((t) => SHELL_TOOLS_TEXT[t])].join('\n');

/** HYDOR_SHELL_TOOLS=0 (or off, false): the app adds nothing to agents' PATH or instructions. */
export const shellToolsOn = (env: NodeJS.ProcessEnv = process.env): boolean => !/^(0|off|false|no)$/i.test((env.HYDOR_SHELL_TOOLS ?? '').trim());

/** A word for sh in double quotes: what sh would read inside them (\ $ ` ") is escaped, so any path comes out as it is. */
export const shQuote = (s: string): string => `"${s.replace(/[\\$`"]/g, '\\$&')}"`;
/** A word for cmd.exe's batch files: % is doubled, and the quotes keep spaces and & together. */
const cmdQuote = (s: string): string => `"${s.replace(/%/g, '%%')}"`;

export interface LauncherSpec {
  /** The Node.js that runs the tool (absolute). */
  node: string;
  /** The tool's script (absolute). */
  script: string;
  /** A ripgrep sym may search with (HYDOR_RG), when there is one. */
  rg?: string;
  /** Where the app keeps its own Lean, for leancheck (HYDOR_LEAN_DIR): a goal's check finds it so too. */
  leanDir?: string;
}

/** The variables a tool's launcher sets before it runs it. */
const launcherEnv = (tool: Tool, l: LauncherSpec): [string, string][] => [
  ...(tool === 'sym' && l.rg ? [['HYDOR_RG', l.rg] as [string, string]] : []),
  ...(tool === 'leancheck' && l.leanDir ? [['HYDOR_LEAN_DIR', l.leanDir] as [string, string]] : []),
];

/** The sh launcher: the app's own Node.js on the tool's script, whatever the caller's PATH holds. */
export function launcherText(tool: Tool, l: LauncherSpec): string {
  return [
    '#!/bin/sh',
    "# Written by Hydor at every start (the app's own Node.js on the app's own copy of the tool): changes here are overwritten.",
    ...launcherEnv(tool, l).map(([k, v]) => `export ${k}=${shQuote(v)}`),
    `exec ${shQuote(l.node)} ${shQuote(l.script)} "$@"`,
    '',
  ].join('\n');
}

/** The same for Windows' cmd.exe and PowerShell (Git's bash runs the extension-less one). */
export function cmdLauncherText(tool: Tool, l: LauncherSpec): string {
  return [...launcherEnv(tool, l).map(([k, v]) => `@set "${k}=${v.replace(/%/g, '%%')}"`), `@${cmdQuote(l.node)} ${cmdQuote(l.script)} %*`, ''].join('\r\n');
}

/** Writes a file atomically (a temporary file, then a rename), only when it differs; true when it did. */
function writeIfChanged(file: string, text: string, mode: number): boolean {
  try {
    if (fs.readFileSync(file, 'utf8') === text) {
      if (!WIN && (fs.statSync(file).mode & 0o777) !== mode) fs.chmodSync(file, mode);
      return false;
    }
  } catch {
    // None yet, or unreadable: write it.
  }
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, text, { mode });
    if (!WIN) fs.chmodSync(tmp, mode);
    fs.renameSync(tmp, file);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
  return true;
}

/** Writes the launchers of `tools` into `dir`; the names of those it wrote (the others held the same text already). */
export function writeLaunchers(dir: string, tools: readonly Tool[], l: { node: string; root: string; rg?: string; leanDir?: string; win?: boolean }): string[] {
  fs.mkdirSync(dir, { recursive: true });
  const wrote: string[] = [];
  for (const t of tools) {
    const spec: LauncherSpec = { node: l.node, script: path.join(l.root, 'scripts', 'agent-tools', 'bin', t), rg: l.rg && fs.existsSync(l.rg) ? l.rg : undefined, leanDir: l.leanDir };
    if (writeIfChanged(path.join(dir, t), launcherText(t, spec), 0o755)) wrote.push(t);
    if (l.win ?? WIN) if (writeIfChanged(path.join(dir, `${t}.cmd`), cmdLauncherText(t, spec), 0o644)) wrote.push(`${t}.cmd`);
  }
  return wrote;
}

const same = (a: string, b: string) => (WIN ? a.toLowerCase() === b.toLowerCase() : a === b);

/** `base` with `dir` first, once: where it is already, it is taken from there. */
export function pathWith(dir: string, base: string | undefined): string {
  return [dir, ...(base ?? '').split(path.delimiter).filter((d) => d && !same(d.replace(/[\\/]+$/, ''), dir.replace(/[\\/]+$/, '')))].join(path.delimiter);
}

/** What a shell gets in the test runs: no node anywhere on the PATH, only the system's own folders and the launchers'. */
function minimalEnv(dir: string, home: string): Record<string, string> {
  if (!WIN) return { PATH: `${dir}:/usr/bin:/bin`, HOME: home, LANG: 'C.UTF-8', TMPDIR: home };
  const bash = bashPath();
  // …\Git\bin\bash.exe: its commands are in …\Git\usr\bin.
  const git = bash ? path.resolve(path.dirname(bash), '..', 'usr', 'bin') : '';
  const env: Record<string, string> = { PATH: [dir, git, path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')].filter(Boolean).join(';'), HOME: home, TEMP: home, TMP: home };
  for (const k of ['SystemRoot', 'windir', 'ComSpec', 'USERPROFILE']) if (process.env[k]) env[k] = process.env[k]!;
  return env;
}

const TRY_MS = 10_000;

/** Runs a shell command line the way an agent's shell would, with `env` and nothing else; null when it ended 0, else why not. */
function run(line: string, cwd: string, env: Record<string, string>): Promise<{ why: string | null; out: string }> {
  return new Promise((resolve) => {
    let b: { cmd: string; args: string[] };
    try {
      b = bashCommand(line);
    } catch (e) {
      return resolve({ why: (e as Error).message, out: '' });
    }
    execFile(b.cmd, b.args, { cwd, env, timeout: TRY_MS, killSignal: 'SIGKILL', encoding: 'utf8', windowsHide: true, maxBuffer: 1 << 20 }, (err, stdout, stderr) => {
      if (!err) return resolve({ why: null, out: String(stdout) });
      const e = err as NodeJS.ErrnoException & { killed?: boolean };
      const tail = `${stderr}${stdout}`.trim().split('\n').slice(-3).join(' ').slice(0, 300);
      resolve({ why: e.killed ? `no answer in ${TRY_MS / 1000} s` : `exit ${typeof e.code === 'number' ? e.code : (e.code ?? 'error')}${tail ? `: ${tail}` : ''}`, out: String(stdout) });
    });
  });
}

/** Tries each launcher once; null for one that works, else why not. sym must also read a TypeScript file with its bundled parser. */
export async function tryLaunchers(dir: string, tools: readonly Tool[]): Promise<Record<Tool, string | null>> {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-shelltools-'));
  try {
    const env = minimalEnv(dir, scratch);
    // Three lines at known places: the outline must name the function with its range, which only the parser can say.
    fs.writeFileSync(path.join(scratch, 'check.ts'), 'export function greet(name: string) {\n  return `hello ${name}`;\n}\n');
    const results = await Promise.all(
      tools.map(async (t): Promise<[Tool, string | null]> => {
        if (t === 'sym') {
          const r = await run('sym --outline check.ts', scratch, env);
          if (r.why) return [t, r.why];
          return [t, /\b1-3\b[^\n]*\bgreet\b/.test(r.out) ? null : `its outline of a TypeScript file was wrong: ${r.out.trim().slice(0, 200)}`];
        }
        return [t, (await run(`${t} --help`, scratch, env)).why];
      }),
    );
    return Object.fromEntries(results) as Record<Tool, string | null>;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

export interface ShellToolsOptions {
  /** Where the launchers go (default: <data folder>/shelltools/bin). */
  dir?: () => string;
  node?: string;
  /** The folder with scripts/agent-tools in it (default: the app's own). */
  root?: string;
  rg?: string | undefined;
  /** The app's own Lean's folder (default: <data folder>/lean). */
  leanDir?: () => string;
  tools?: readonly Tool[];
  /** The PATH a session would get when its start does not say (default: the agents' login PATH). */
  basePath?: () => string | undefined;
}

export interface ShellTools extends Feature {
  /** Resolves when the test runs have finished (they start with `start`). */
  ready(): Promise<void>;
  /** Which tools passed their test run so far (a tool not listed has not been tried). */
  passed(): Tool[];
  dir(): string;
}

/** The capability; a function so a test can give it paths of its own. */
export function createShellTools(o: ShellToolsOptions = {}): ShellTools {
  const dir = () => (o.dir ? o.dir() : path.join(config.dataDir, 'shelltools', 'bin'));
  const tools = o.tools ?? TOOLS;
  const ok = new Map<Tool, boolean>();
  let finished = false;
  let running: Promise<void> | null = null;

  async function setUp() {
    const bin = dir();
    try {
      const wrote = writeLaunchers(bin, tools, { node: o.node ?? process.execPath, root: o.root ?? APP_ROOT, rg: 'rg' in o ? o.rg : bundledRg, leanDir: o.leanDir ? o.leanDir() : path.join(config.dataDir, 'lean') });
      if (wrote.length) console.log(`[shelltools] launchers written in ${bin}: ${wrote.join(', ')}`);
    } catch (e) {
      console.error(`[shelltools] could not write the launchers in ${bin}: ${(e as Error).message}`);
      return;
    }
    let results: Record<Tool, string | null>;
    try {
      results = await tryLaunchers(bin, tools);
    } catch (e) {
      console.error(`[shelltools] could not test the launchers: ${(e as Error).message}`);
      return;
    }
    for (const t of tools) {
      ok.set(t, results[t] === null);
      if (results[t] !== null) console.error(`[shelltools] ${t} does not run, so agents are not told about it: ${results[t]}`);
    }
    finished = true;
  }

  return {
    id: 'shelltools',
    start() {
      if (!shellToolsOn() || running) return;
      running = setUp().catch((e) => console.error(`[shelltools] ${(e as Error).message}`));
    },
    ready: () => running ?? Promise.resolve(),
    passed: () => tools.filter((t) => ok.get(t)),
    dir,
    spawn(s) {
      // Until the test runs have finished, with every tool failed or the switch off: nothing. A session that works in one browser tab has no shell.
      if (!shellToolsOn() || !finished || s.extra?.browserOnly) return undefined;
      const works = tools.filter((t) => ok.get(t));
      if (!works.length) return undefined;
      // `s.path` is the PATH this session would otherwise get (its account's and agent's own settings included), when its start says.
      const base = s.path ?? (o.basePath ? o.basePath() : agentBaseEnv().PATH);
      return { env: { PATH: pathWith(dir(), base) }, instructions: [shellToolsText(works)] };
    },
  };
}

export const shelltools = createShellTools();

/** The tools sessions are told about now: those that passed their test run, none while the switch is off or the test runs have not finished (what the capability's `spawn` offers, read-only). */
export const offeredShellTools = (): Tool[] => (shellToolsOn() ? shelltools.passed() : []);
