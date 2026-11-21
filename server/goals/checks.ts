// Running a goal's checks (shared/goals.ts): a command that must pass, a number a command prints that must reach its
// target, a sentence the reviewer must find true in what it is shown, and something only the person confirms. The
// commands run in the session's folder with bash, as the session's agent's own commands would run (the driver says how:
// in the app's sandbox, without network, or as they are), in the environment agents get with nothing that waits for a
// person, killed with everything they started when their time is up, and what they leave running killed when they end.
// Also here: which paths a round changed and whether it may change them, and the change since the goal started, for the
// reviewer.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { meets, type GoalCheck, type GoalResult } from '../../shared/goals.ts';
import type { Shell } from '../agent/sandbox.ts';
import { agentBaseEnv } from '../env.ts';
import { git } from '../git.ts';
import { bashCommand } from '../platform.ts';

/** Seconds a command may take unless its check says, and at most. */
export const DEFAULT_TIMEOUT_S = 600;
export const MAX_TIMEOUT_S = 3600;
/** How much of a command's output ends up in a result's detail. */
const DETAIL = 1500;
/** How much of a command's output is kept to read a number from, and to show a reviewer. */
const KEEP = 64 * 1024;
/** How much of the output's end a check's own regular expression reads (all that is kept), and how long it may take there: the time limit is what protects. */
export const READ_TAIL = KEEP;
export const READ_MS = 200;
/** The variable each check's command carries, with a mark of its own: what a restart left running is known by it (killLeftover). */
const MARK_VAR = 'HYDOR_GOAL_CHECK';
/** What the reviewer is shown at most, how much of each file, and the largest file it is shown at all. */
export const EVIDENCE_MAX = 60_000;
const FILE_MAX = 8000;
export const FILE_BYTES_MAX = 200 * 1024;

export interface Ran {
  /** Its exit code; null when it was killed or could not start. */
  code: number | null;
  /** stdout and stderr together, in the order they came; the end of it when long. */
  output: string;
  timedOut: boolean;
  /** It could not start at all. */
  failed?: string;
  ms: number;
}

/**
 * The environment a check's command runs in: the one the session's agents get (the user's login environment, with their
 * PATH: ~/.local/bin, cargo, conda), never the server's own, which lacks those, says NODE_ENV=production (so `npm ci`
 * would leave out what tests need), carries the app's PORT, HOST and data folder (a test of the app itself would write
 * into the live app's data) and may carry secrets a command could print for the reviewer to read. On top only what keeps
 * a command from waiting for a person or paging and colouring its output.
 */
export function checkEnv(): Record<string, string> {
  const env: Record<string, string> = { ...agentBaseEnv() };
  delete env.COLORTERM;
  return { ...env, CI: '1', TERM: 'dumb', NO_COLOR: '1', PAGER: 'cat', GIT_PAGER: 'cat', GIT_TERMINAL_PROMPT: '0', DEBIAN_FRONTEND: 'noninteractive', PYTHONUNBUFFERED: '1' };
}

/** How a check's command is run: through the session's sandbox (`shell`), and who hears of it starting (its process group, and its mark). */
export interface RunHow {
  shell?: (command: string) => Shell;
  started?: (run: { pgid: number; mark: string }) => void;
}

/** Kills a process group and everything in it; quiet when it is gone already. */
function killGroup(pid: number, sig: NodeJS.Signals) {
  try {
    if (process.platform !== 'win32') process.kill(-pid, sig);
    else process.kill(pid, sig);
  } catch {}
}

/**
 * Runs a command with bash in `cwd` (through `how.shell` when given: the session's sandbox); when `timeoutS` passes, it
 * and everything it started are killed. When it ends by itself, whatever it left running in its process group is killed
 * too: an `npm run dev &` would otherwise hold its port and break the next run of the same check.
 */
export function runCommand(command: string, cwd: string, timeoutS = DEFAULT_TIMEOUT_S, how: RunHow = {}): Promise<Ran> {
  const t0 = Date.now();
  const limit = Math.min(Math.max(1, timeoutS), MAX_TIMEOUT_S) * 1000;
  const mark = crypto.randomBytes(8).toString('hex');
  return new Promise((resolve) => {
    let out = '';
    let timedOut = false;
    let done = false;
    const add = (b: Buffer) => {
      out += b.toString('utf8');
      if (out.length > KEEP * 2) out = out.slice(-KEEP);
    };
    const finish = (r: Omit<Ran, 'output' | 'ms' | 'timedOut'>) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearTimeout(killer);
      resolve({ ...r, output: out.length > KEEP ? out.slice(-KEEP) : out, timedOut, ms: Date.now() - t0 });
    };
    let child: ReturnType<typeof spawn>;
    try {
      const b: Shell = how.shell ? how.shell(command) : bashCommand(command);
      // Its own process group, so a timeout stops what it started too (a test runner's workers, a server it began).
      child = spawn(b.cmd, b.args, { cwd, env: { ...checkEnv(), ...(b.env ?? {}), [MARK_VAR]: mark }, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    } catch (e) {
      return finish({ code: null, failed: (e as Error).message });
    }
    if (child.pid) how.started?.({ pgid: child.pid, mark });
    const kill = (sig: NodeJS.Signals) => {
      if (process.platform !== 'win32' && child.pid) killGroup(child.pid, sig);
      else
        try {
          child.kill(sig);
        } catch {}
    };
    let killer: NodeJS.Timeout | undefined;
    const timer = setTimeout(() => {
      timedOut = true;
      kill('SIGTERM');
      killer = setTimeout(() => {
        kill('SIGKILL');
        // Its output may stay open in something that escaped the group: it ends here all the same.
        setTimeout(() => finish({ code: null }), 2000).unref();
      }, 3000);
      killer.unref();
    }, limit);
    timer.unref();
    child.stdout?.on('data', add);
    child.stderr?.on('data', add);
    child.on('error', (e) => finish({ code: null, failed: e.message }));
    child.on('exit', (code) => {
      // Whatever it left running in its group goes with it (its output so far stays in the pipes).
      if (!timedOut) kill('SIGKILL');
      // What it wrote last may still be in the pipes; something that escaped its group may keep them open, so not for long.
      const wait = setTimeout(() => finish({ code: timedOut ? null : code }), 2000);
      wait.unref();
      child.on('close', () => {
        clearTimeout(wait);
        finish({ code: timedOut ? null : code });
      });
    });
  });
}

/**
 * Kills what is left of a check's command that a restart of the app cut short (its process group, as runCommand gave it),
 * so a check run again does not overlap with it. Only a group in which a process still carries the run's own mark is
 * killed: after a restart the group's number may belong to something else by now. Where that cannot be read (no /proc:
 * macOS, Windows) nothing is killed. True when something was killed.
 */
export function killLeftover(run: { pgid: number; mark: string }): boolean {
  if (process.platform === 'win32' || !Number.isInteger(run.pgid) || run.pgid <= 1) return false;
  if (fs.existsSync('/proc/self/stat')) {
    let ours = false;
    for (const name of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(name)) continue;
      try {
        const stat = fs.readFileSync(`/proc/${name}/stat`, 'utf8');
        // The fields after the program's name (in parentheses, which may hold anything): state, parent, group.
        const pgrp = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[2]);
        if (pgrp !== run.pgid) continue;
        if (fs.readFileSync(`/proc/${name}/environ`, 'utf8').split('\0').includes(`${MARK_VAR}=${run.mark}`)) {
          ours = true;
          break;
        }
      } catch {}
    }
    if (!ours) return false;
    killGroup(run.pgid, 'SIGKILL');
    return true;
  }
  return false;
}

/** The end of a text, at most `n` characters. */
export const tail = (s: string, n: number): string => (s.length > n ? `…${s.slice(-(n - 1))}` : s);

/** A long text keeps its start and its end. */
export function clipMiddle(s: string, n: number): string {
  if (s.length <= n) return s;
  const head = Math.floor(n * 0.4);
  return `${s.slice(0, head)}\n… (${s.length - n} characters left out) …\n${s.slice(-(n - head))}`;
}

const NUMBER = /[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?/g;

/** A check's own regular expression took longer than READ_MS on the output: it was stopped. */
export const SLOW_READ = 'Its pattern took too long';

/**
 * The text of the last match of `read` in `text` (its first group, else the whole match), or null. The pattern is the
 * agent's (or the person's): one like `(\d+)+x` takes seconds on a few dozen digits and doubles with each one, and run
 * on the server's own thread it would stop every session and the web pages with it. So it runs in a context of its own
 * that is stopped after READ_MS, and only on the end of the output, where a result is printed; a pattern stopped so
 * throws SLOW_READ.
 */
const READ_SCRIPT = new vm.Script(`(() => {
  const re = new RegExp(pattern, 'gm');
  let last = null;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    last = m[1] ?? m[0];
    if (!m[0]) re.lastIndex++;
  }
  return last == null ? null : String(last);
})()`);
function lastMatch(text: string, read: string): string | null {
  try {
    const got = READ_SCRIPT.runInContext(vm.createContext({ pattern: read, text: text.length > READ_TAIL ? text.slice(-READ_TAIL) : text }), { timeout: READ_MS });
    return typeof got === 'string' ? got : null;
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') throw new Error(SLOW_READ);
    return null;
  }
}

/**
 * The number a measured check reads from a command's output: with `read`, the first group of its last match (the
 * whole match when it has no group) in the output's last 64 KB; else the last number in the output. Thousands
 * separators ("1,234") are read whole. Throws SLOW_READ when `read` takes too long.
 */
export function readNumber(output: string, read?: string): number | undefined {
  if (read) {
    const found = lastMatch(output, read);
    if (found == null) return undefined;
    const text = found.replace(/(\d),(?=\d{3}\b)/g, '$1');
    const m = text.match(NUMBER);
    const v = m ? Number(m[0]) : NaN;
    return Number.isFinite(v) ? v : undefined;
  }
  const all = output.replace(/(\d),(?=\d{3}\b)/g, '$1').match(NUMBER);
  if (!all?.length) return undefined;
  const v = Number(all[all.length - 1]);
  return Number.isFinite(v) ? v : undefined;
}

/** Whether a regular expression for reading a number is one: the error in words, or null. */
export function badRead(read: string): string | null {
  try {
    new RegExp(read, 'gm');
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

// ---- paths it may not change ---------------------------------------------------------------------------------

const norm = (p: string) => p.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');

/**
 * Whether one part of a path matches one part of a pattern, * standing for any characters within it. The usual matcher
 * that goes back only to the last *, so never more than length × length steps however many stars there are.
 */
function partMatches(pat: string, s: string): boolean {
  let p = 0;
  let i = 0;
  let star = -1;
  let from = 0;
  while (i < s.length) {
    if (p < pat.length && pat[p] === '*') {
      star = p++;
      from = i;
    } else if (p < pat.length && pat[p] === s[i]) {
      p++;
      i++;
    } else if (star >= 0) {
      p = star + 1;
      i = ++from;
    } else return false;
  }
  while (p < pat.length && pat[p] === '*') p++;
  return p === pat.length;
}

/**
 * Whether a path matches a protected entry with * in it: * within a part of the path, a part that is ** alone for any
 * number of parts (none too, but at least one at the end); ** inside a part is a * there, as in .gitignore. Matched part by part (dynamic
 * programming over the parts), never as a regular expression: "**a**a**a**a**a**a**a**b" as one took 11 seconds on a
 * path of 60 characters, the server's whole thread with it.
 */
export function globMatch(entry: string, file: string): boolean {
  const ps = entry.split('/');
  const fp = file.split('/');
  // next[j]: the pattern's parts after the one at hand match the path's parts from j on.
  let next: boolean[] = Array(fp.length + 1).fill(false);
  next[fp.length] = true;
  for (let i = ps.length - 1; i >= 0; i--) {
    const cur: boolean[] = Array(fp.length + 1).fill(false);
    for (let j = fp.length; j >= 0; j--) {
      // ** matches any number of parts, none too, but at the end at least one: "docs/**" is what lies inside docs, not docs.
      if (ps[i] === '**') cur[j] = (i < ps.length - 1 && next[j]) || (j < fp.length && (cur[j + 1] || next[j + 1]));
      else cur[j] = j < fp.length && next[j + 1] && partMatches(ps[i], fp[j]);
    }
    next = cur;
  }
  return next[0];
}

/**
 * Whether a path (relative to the session's folder) is one the agent may not change: it equals an entry, lies under an
 * entry that is a folder (it ends in "/", or names a folder the path is in), or matches an entry with * in it.
 */
export function isProtected(file: string, entries: string[]): boolean {
  const p = norm(file);
  for (const raw of entries) {
    const e = norm(raw);
    if (!e) continue;
    if (e.includes('*')) {
      if (globMatch(e.replace(/\/$/, '/**'), p)) return true;
      continue;
    }
    if (e.endsWith('/')) {
      if (p.startsWith(e)) return true;
    } else if (p === e || p.startsWith(`${e}/`)) return true;
  }
  return false;
}

/** The paths among `files` that the agent may not change. */
export const protectedHits = (files: string[], entries: string[]): string[] => (entries.length ? files.filter((f) => isProtected(f, entries)) : []);

/**
 * The paths that differ between two commits (renames as a path gone and a path added), relative to `cwd` (the session's
 * folder, which may be a subfolder of its repository: protected paths are written from there, and a change outside it
 * is no change of the session's). Throws when git cannot list them (a timeout, too much output).
 */
export async function changedPaths(cwd: string, from: string, to: string): Promise<string[]> {
  const r = await git(cwd, ['diff', '--name-only', '--no-renames', '--relative', '-z', from, to], 60_000);
  // Not "nothing changed": a protected path would pass unseen.
  if (!r.ok) throw new Error(r.err.trim().split('\n').pop() || 'git could not list them');
  return r.out.split('\0').filter(Boolean);
}

/** Which of `paths` (relative to `cwd`, a worktree's top folder) a checkpoint's (or commit's) files hold; throws when git could not say. */
export async function pathsIn(cwd: string, commit: string, paths: string[]): Promise<Set<string>> {
  if (!paths.length) return new Set();
  const r = await git(cwd, ['--literal-pathspecs', 'ls-tree', '-r', '-z', '--name-only', commit, '--', ...paths], 60_000);
  if (!r.ok) throw new Error(r.err.trim().split('\n').pop() || 'git could not list them');
  return new Set(r.out.split('\0').filter(Boolean));
}

/** The tree a checkpoint (or commit) stands for, and the commit under a checkpoint; undefined when git could not say. */
export async function treeOf(cwd: string, commit: string): Promise<string | undefined> {
  const r = await git(cwd, ['rev-parse', `${commit}^{tree}`], 30_000);
  const t = r.out.trim();
  return r.ok && /^[0-9a-f]{7,64}$/.test(t) ? t : undefined;
}
export async function parentOf(cwd: string, commit: string): Promise<string | undefined> {
  const r = await git(cwd, ['rev-parse', `${commit}^`], 30_000);
  const c = r.out.trim();
  return r.ok && /^[0-9a-f]{7,64}$/.test(c) ? c : undefined;
}

/** How two checkpoints compare: the same files (their trees), and the same commit under them; null when git could not say. */
export async function compareCheckpoints(cwd: string, a: string, b: string): Promise<{ tree: boolean; commit: boolean } | null> {
  if (a === b) return { tree: true, commit: true };
  const r = await git(cwd, ['rev-parse', `${a}^{tree}`, `${b}^{tree}`, `${a}^`, `${b}^`], 30_000);
  const [ta, tb, pa, pb] = r.out.trim().split('\n');
  if (!r.ok || !ta || !tb || !pa || !pb) return null;
  return { tree: ta === tb, commit: pa === pb };
}

/** Whether two checkpoints hold the same files (their trees), and (`commits`) also stand on the same commit. */
export async function sameFiles(cwd: string, a: string, b: string, o: { commits?: boolean } = {}): Promise<boolean> {
  const c = await compareCheckpoints(cwd, a, b);
  return !!c && c.tree && (!o.commits || c.commit);
}

/**
 * The change from a commit to another, or to the files as they are now (with the new files it does not track yet named).
 * `here`: only what lies in `cwd`, the session's folder (outside a worktree the repository may be much larger than the
 * folder the session works in). Throws when git could not give it (a change too large, a timeout): that is not "no change".
 */
export async function diffText(cwd: string, from: string, to?: string, o: { here?: boolean } = {}): Promise<string> {
  const r = await git(cwd, ['diff', '--no-color', '--no-ext-diff', from, ...(to ? [to] : []), ...(o.here ? ['--', '.'] : [])], 60_000);
  if (!r.ok) throw new Error(r.err.trim().split('\n').pop() || 'git could not show it');
  let out = r.out;
  if (!to) {
    const u = await git(cwd, ['ls-files', '--others', '--exclude-standard'], 30_000);
    const files = u.ok ? u.out.split('\n').filter(Boolean) : [];
    if (files.length) out += `\n(New files not tracked by git: ${files.slice(0, 50).join(', ')}${files.length > 50 ? ` and ${files.length - 50} more` : ''})\n`;
  }
  return out;
}

/**
 * The files a change's text names, in a line to put before it. A reviewer then knows the list is whole: a file that is
 * not in it did not change, also when the middle of a long change is left out (clipMiddle keeps the start). Without it
 * a reviewer shown only a diff would not say that anything else is unchanged.
 */
export function changedFilesLine(text: string): string {
  // A file moved or renamed is two changes: where it is now, and where it no longer is (named so, a reviewer would
  // otherwise take the folder it left for unchanged).
  const files = [...new Set([...[...text.matchAll(/^diff --git .* "?b\/(.+?)"?$/gm)].map((m) => m[1]), ...[...text.matchAll(/^rename from "?(.+?)"?$/gm)].map((m) => m[1])])];
  const untracked = /^\(New files not tracked by git: /m.test(text);
  if (!files.length) return untracked ? 'No file git tracks changed; the new files it does not track are named below, and nothing else changed.' : '';
  const shown = files.slice(0, 200).join(', ');
  const more = files.length > 200 ? ` and ${files.length - 200} more` : '';
  return `Every file that changed (${files.length}): ${shown}${more}.${untracked ? ' New files git does not track are named at the end.' : ''} No other file changed.`;
}

/**
 * The new files git does not track yet in `cwd`, each with a hash of its content (at most 500): a diff names them only,
 * so a change to what is in them would otherwise read as no change.
 */
export async function untrackedStamp(cwd: string): Promise<string> {
  const u = await git(cwd, ['ls-files', '--others', '--exclude-standard', '-z'], 30_000);
  const files = u.ok ? u.out.split('\0').filter(Boolean).slice(0, 500) : [];
  if (!files.length) return '';
  const h = await git(cwd, ['hash-object', '--', ...files], 30_000);
  const ids = h.ok ? h.out.split('\n') : [];
  return files.map((f, i) => `${f} ${ids[i] ?? '?'}`).join('\n');
}

/** The commit a git folder is on, or undefined outside one. */
export async function headOf(cwd: string): Promise<string | undefined> {
  const r = await git(cwd, ['rev-parse', 'HEAD']);
  const c = r.out.trim();
  return r.ok && /^[0-9a-f]{7,64}$/.test(c) ? c : undefined;
}

// ---- running the checks --------------------------------------------------------------------------------------

/** What a review check asks the reviewer, and what running the others needs. */
export interface CheckEnv {
  cwd: string;
  /** How commands run here: the session's sandbox, and who hears of each starting (runCommand). */
  how?: RunHow;
  /** Why no command can run here at all (a confidential session on a computer without a sandbox): each such check is an error. */
  noRun?: string;
  /** The change since the goal started, for a review check that asks for it ('' when there is none; it throws when it could not be read). */
  diff(): Promise<string>;
  /** Checks of kind you the person confirmed. */
  confirmed: Record<string, boolean>;
  /** The reviewer: whether the claim holds in the evidence; when it does not for lack of files, which it asks to see (`needs`). */
  review(claim: string, evidence: string): Promise<{ holds: boolean; score: number; reason: string; needs?: string[] } | { error: string }>;
  /** The files a reviewer asked for before in this check, that were read (kept in the goal's private state): part of its evidence from the start. */
  asked?(id: string): string[];
  /** Files a reviewer asked for now in this check that were read, to be kept with it (addAsked). */
  askedMore?(id: string, added: string[]): void;
}

/** How many files a review check keeps that its reviewer asked for. */
export const ASKED_KEPT = 8;

/** The files kept for a check once `added` came: no path twice, the newest ASKED_KEPT. */
export const addAsked = (kept: string[], added: string[]): string[] => [...kept.filter((p) => !added.includes(p)), ...added].slice(-ASKED_KEPT);

const errorResult = (id: string, error: string, ms: number, detail?: string): GoalResult => ({ id, holds: false, closeness: 0, error, ...(detail ? { detail } : {}), ms });

/** Whether `p` is `root` or inside it (both resolved). */
const inside = (root: string, p: string) => p === root || p.startsWith(root.endsWith(path.sep) ? root : root + path.sep);

/**
 * A file a review check names, read only when it is a regular file inside the session's folder (resolved against it, no
 * ".." out of it, no link that leads out of it) of at most 200 kB; otherwise why it is left out.
 */
export function evidenceFile(cwd: string, name: string): { text: string } | { skip: string } {
  let root: string;
  try {
    root = fs.realpathSync(cwd);
  } catch {
    return { skip: 'the session’s folder could not be read' };
  }
  const abs = path.resolve(cwd, name);
  if (!inside(path.resolve(cwd), abs)) return { skip: 'it is outside the session’s folder' };
  let real: string;
  try {
    real = fs.realpathSync(abs);
  } catch {
    return { skip: 'it does not exist' };
  }
  if (!inside(root, real)) return { skip: 'it leads outside the session’s folder' };
  let st: fs.Stats;
  try {
    st = fs.statSync(real);
  } catch {
    return { skip: 'it could not be read' };
  }
  if (!st.isFile()) return { skip: 'it is not a file' };
  if (st.size > FILE_BYTES_MAX) return { skip: `it is larger than ${FILE_BYTES_MAX / 1024} kB` };
  try {
    return { text: fs.readFileSync(real, 'utf8') };
  } catch {
    return { skip: 'it could not be read' };
  }
}

/**
 * A file a reviewer asked for, read only when evidenceFile would read it and git knows it or would: tracked, or new and not
 * ignored (a file git ignores is where keys usually live), and no part of its path starts with a dot. Outside a git folder:
 * a file inside the session's folder with no part of its path starting with a dot. Returns the path as it is shown (from
 * the session's folder, with /), and the text or why it is left out. Only for what a reviewer asks: the files a check
 * names, which the person agreed, are read by evidenceFile alone.
 */
export async function askedFile(cwd: string, name: string): Promise<{ path: string; text: string } | { path: string; skip: string }> {
  const abs = path.resolve(cwd, name);
  const rel = path.relative(path.resolve(cwd), abs).split(path.sep).join('/');
  const shown = rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : name;
  const r = evidenceFile(cwd, name);
  if ('skip' in r) return { path: shown, skip: r.skip };
  const dotted = (p: string) => p.split('/').some((c) => c.startsWith('.'));
  if (dotted(rel)) return { path: shown, skip: 'its path starts with a dot' };
  // Where a link leads counts too: a link to .env is not a way to read it.
  let real = rel;
  try {
    real = path.relative(fs.realpathSync(cwd), fs.realpathSync(abs)).split(path.sep).join('/');
  } catch {}
  if (dotted(real)) return { path: shown, skip: 'its path starts with a dot' };
  if ((await git(cwd, ['rev-parse', '--is-inside-work-tree'])).out.trim() === 'true') {
    // Tracked or new and not ignored: ls-files names it; an ignored file it does not.
    for (const f of new Set([rel, real])) {
      const l = await git(cwd, ['ls-files', '--cached', '--others', '--exclude-standard', '--', f]);
      if (!l.ok || !l.out.trim()) return { path: shown, skip: 'git ignores it' };
    }
  }
  return { path: shown, text: r.text };
}

/** A file's block in the evidence: its text cut at FILE_MAX, or why it is left out. */
const fileBlock = (shown: string, r: { text: string } | { skip: string }) => {
  const text = 'text' in r ? r.text : `(Left out: ${r.skip}.)`;
  return `<file path="${shown}">\n${text.length > FILE_MAX ? `${text.slice(0, FILE_MAX)}\n… (the rest left out)` : text}\n</file>`;
};

/** Why a command that did not pass could not be run at all, or null when it ran and failed. */
function cannotRun(r: Ran, timeoutS: number): string | null {
  if (r.failed) return `It could not start: ${r.failed}`;
  if (r.timedOut) return `It took longer than its ${timeoutS} s and was stopped`;
  if (r.code === 127) return 'The command was not found';
  if (r.code === 126) return 'The command could not be run (not allowed to run it)';
  return null;
}

const timeoutOf = (c: GoalCheck) => Math.min(Math.max(1, Math.round(c.timeoutS ?? DEFAULT_TIMEOUT_S)), MAX_TIMEOUT_S);

/** A change's text with the line that names every file in it first (changedFilesLine). */
export const withFiles = (text: string) => [changedFilesLine(text), text].filter(Boolean).join('\n\n');

/** Runs one check. Results come back with closeness 0 or 1; verdict.ts counts it from where the check started. */
export async function runCheck(c: GoalCheck, env: CheckEnv): Promise<GoalResult> {
  const t0 = Date.now();
  if (c.kind === 'you') return { id: c.id, holds: !!env.confirmed[c.id], closeness: env.confirmed[c.id] ? 1 : 0, ms: 0 };
  if (c.kind === 'command' || c.kind === 'measure') {
    if (!c.run?.trim()) return errorResult(c.id, 'It has no command to run', 0);
    if (env.noRun) return errorResult(c.id, env.noRun, 0);
    const r = await runCommand(c.run, env.cwd, timeoutOf(c), env.how);
    const detail = tail(r.output.trim(), DETAIL) || undefined;
    const bad = cannotRun(r, timeoutOf(c));
    if (bad) return errorResult(c.id, bad, r.ms, detail);
    if (c.kind === 'command') return { id: c.id, holds: r.code === 0, closeness: r.code === 0 ? 1 : 0, ...(detail ? { detail } : {}), ms: r.ms };
    let value: number | undefined;
    try {
      value = readNumber(r.output, c.read);
    } catch (e) {
      return errorResult(c.id, (e as Error).message, r.ms, detail);
    }
    if (value == null) return errorResult(c.id, 'It printed no number', r.ms, detail);
    const holds = meets(c, value);
    const ended = r.code ? `(It ended with exit code ${r.code}.)\n` : '';
    return { id: c.id, holds, value, closeness: holds ? 1 : 0, ...(detail || ended ? { detail: `${ended}${detail ?? ''}` } : {}), ms: r.ms };
  }
  // review: the claim against what it names, the evidence clipped in the middle.
  if (!c.claim?.trim()) return errorResult(c.id, 'It has no claim to check', 0);
  const parts: string[] = [];
  const ev = c.evidence ?? { diff: true };
  if (ev.run?.trim() && env.noRun) return errorResult(c.id, env.noRun, 0);
  if (ev.diff) {
    const d = await env.diff().then(
      (text) => (text.trim() ? `<change since the goal started>\n${withFiles(text)}\n</change since the goal started>` : '(Nothing changed since the goal started.)'),
      (e) => `(The change since the goal started could not be read: ${(e as Error).message}.)`,
    );
    parts.push(d);
  }
  for (const f of ev.files ?? []) parts.push(fileBlock(f, evidenceFile(env.cwd, f)));
  // What is in the evidence already, by path from the session's folder: a file is shown once.
  const shownPaths = new Set((ev.files ?? []).map((f) => path.relative(path.resolve(env.cwd), path.resolve(env.cwd, f)).split(path.sep).join('/')));
  // The files a reviewer asked for in earlier runs of this check, that can still be read.
  const read: string[] = [];
  for (const f of env.asked?.(c.id) ?? []) {
    if (shownPaths.has(f)) continue;
    const r = await askedFile(env.cwd, f);
    if (!('text' in r)) continue;
    shownPaths.add(r.path);
    read.push(r.path);
    parts.push(fileBlock(r.path, r));
  }
  if (ev.run?.trim()) {
    const r = await runCommand(ev.run, env.cwd, timeoutOf(c), env.how);
    const bad = cannotRun(r, timeoutOf(c));
    parts.push(`<output of="${ev.run}" exit="${r.code ?? 'none'}">\n${bad ? `${bad}\n` : ''}${r.output}\n</output>`);
  }
  let v = await env.review(c.claim, clipMiddle(parts.join('\n\n') || '(No evidence was named.)', EVIDENCE_MAX));
  // Not holding for lack of files the reviewer names: it is shown those it may see, and asked once more; that answer stands.
  if (!('error' in v) && !v.holds && v.needs?.length) {
    const fresh = [...new Set(v.needs)].filter((f) => !shownPaths.has(path.relative(path.resolve(env.cwd), path.resolve(env.cwd, f)).split(path.sep).join('/')));
    if (fresh.length) {
      const added: string[] = [];
      for (const f of fresh) {
        const r = await askedFile(env.cwd, f);
        if (shownPaths.has(r.path)) continue;
        shownPaths.add(r.path);
        parts.push(fileBlock(r.path, r));
        if ('text' in r) added.push(r.path);
      }
      if (added.length) env.askedMore?.(c.id, added);
      read.push(...added);
      v = await env.review(c.claim, clipMiddle(parts.join('\n\n'), EVIDENCE_MAX));
    }
  }
  if ('error' in v) return errorResult(c.id, v.error, Date.now() - t0);
  const also = read.length ? ` Also read, at the reviewer’s request: ${read.join(', ')}.` : '';
  return { id: c.id, holds: v.holds, closeness: v.holds ? 1 : 0, detail: `${v.reason}${also}`, ms: Date.now() - t0 };
}

/** Runs checks one after another, commands and numbers first, reviews last; the results in the checks' own order. */
export async function runChecks(checks: GoalCheck[], env: CheckEnv): Promise<GoalResult[]> {
  const rank = (c: GoalCheck) => (c.kind === 'command' || c.kind === 'measure' ? 0 : c.kind === 'you' ? 1 : 2);
  const order = [...checks].sort((a, b) => rank(a) - rank(b));
  const got = new Map<string, GoalResult>();
  for (const c of order) {
    try {
      got.set(c.id, await runCheck(c, env));
    } catch (e) {
      got.set(c.id, errorResult(c.id, `It could not be run: ${(e as Error).message}`, 0));
    }
  }
  return checks.map((c) => got.get(c.id)!);
}
