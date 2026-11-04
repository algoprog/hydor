// Suggestions for the browser terminal's command line: commands typed before (in these terminals, and
// the shell's own history), commands agents ran lately, and what fits the word being typed (git
// branches, package scripts, make targets, ssh hosts, folders and files). On request, a model writes a
// command from a plain description; it is put on the line, never run.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HttpError } from './auth.ts';
import { config } from './config.ts';
import type { DB } from './db.ts';
import { git } from './git.ts';
import { oneShotJson } from './oneshot.ts';

export interface HistoryEntry {
  cmd: string;
  /** The folder it ran in, when known. */
  cwd?: string;
  /** How many times. */
  n: number;
  ts: number;
  src: 'typed' | 'shell' | 'agent';
}

export interface Completion {
  /** The whole line with the completion in place. */
  text: string;
  /** The word it completes to. */
  label: string;
  kind: 'branch' | 'script' | 'target' | 'host' | 'dir' | 'file' | 'subcommand';
}

export function migrateTermHistory(db: DB) {
  db.exec(`CREATE TABLE IF NOT EXISTS term_history (
    cmd TEXT NOT NULL,
    cwd TEXT NOT NULL,
    n INTEGER NOT NULL DEFAULT 1,
    ts INTEGER NOT NULL,
    PRIMARY KEY (cmd, cwd)
  )`);
}

// Lines that look like they hold a secret stay out of the app's history.
const SECRET = /(pass(word|wd)?|secret|token|api[_-]?key|auth(orization)?)\s*[=:]/i;
const KEEP_TYPED = 5000;

/** A command typed in one of the app's terminals. A line starting with a space is not kept (as in bash). */
export function recordCommand(db: DB, cmd: string, cwd: string) {
  if (/^\s/.test(cmd)) return;
  const c = cmd.trim();
  if (!c || c.length > 500 || c.includes('\n') || SECRET.test(c)) return;
  db.prepare('INSERT INTO term_history (cmd, cwd, n, ts) VALUES (?, ?, 1, ?) ON CONFLICT(cmd, cwd) DO UPDATE SET n = n + 1, ts = excluded.ts').run(c, cwd.slice(0, 1000), Date.now());
  db.prepare('DELETE FROM term_history WHERE rowid IN (SELECT rowid FROM term_history ORDER BY ts DESC LIMIT -1 OFFSET ?)').run(KEEP_TYPED);
}

/** Everything the suggestions draw on, newest first within each source. */
export function commandHistory(db: DB, agentCommands: { cmd: string; cwd: string; ts: number }[]): HistoryEntry[] {
  const typed = db.prepare('SELECT cmd, cwd, n, ts FROM term_history ORDER BY ts DESC LIMIT ?').all(KEEP_TYPED) as { cmd: string; cwd: string; n: number; ts: number }[];
  const agent = new Map<string, HistoryEntry>();
  for (const a of agentCommands) {
    const cmd = tidyAgentCommand(a.cmd, a.cwd);
    if (!cmd) continue;
    const k = `${a.cwd}\0${cmd}`;
    const e = agent.get(k);
    if (e) (e.n++, (e.ts = Math.max(e.ts, a.ts)));
    else agent.set(k, { cmd, cwd: a.cwd, n: 1, ts: a.ts, src: 'agent' });
  }
  return [...typed.map((t) => ({ ...t, src: 'typed' as const })), ...[...agent.values()].slice(-800), ...shellHistory()];
}

/** An agent's command as you would type it: one line, without a `cd` to the folder it already runs in. */
function tidyAgentCommand(cmd: string, cwd: string): string | null {
  let c = cmd.trim();
  if (!c || c.includes('\n') || c.length > 300 || c.includes('<<')) return null;
  const cd = /^cd\s+("[^"]+"|'[^']+'|\S+)\s*&&\s*/.exec(c);
  if (cd) {
    const dir = cd[1].replace(/^["']|["']$/g, '');
    if (path.resolve(cwd, dir.replace(/^~(?=$|\/)/, config.home)) === path.resolve(cwd)) c = c.slice(cd[0].length);
  }
  return SECRET.test(c) ? null : c;
}

// ---- the shell's own history files ------------------------------------------------------------

let shellCache: { key: string; list: HistoryEntry[] } | null = null;

function shellHistory(): HistoryEntry[] {
  const files = [
    { p: path.join(config.home, '.bash_history'), kind: 'bash' },
    { p: path.join(config.home, '.zsh_history'), kind: 'zsh' },
    { p: path.join(config.home, '.local/share/fish/fish_history'), kind: 'fish' },
  ] as const;
  const stats = files.map((f) => {
    try {
      const s = fs.statSync(f.p);
      return { ...f, mtime: s.mtimeMs, size: s.size };
    } catch {
      return null;
    }
  });
  const key = stats.map((s) => (s ? `${s.p}:${s.mtime}:${s.size}` : '-')).join('|');
  if (shellCache?.key === key) return shellCache.list;
  const byCmd = new Map<string, HistoryEntry>();
  for (const f of stats) {
    if (!f) continue;
    const lines = parseHistory(readTail(f.p, 768 * 1024), f.kind);
    // Files without times: later lines are newer, a minute apart before the file's last change.
    lines.forEach((l, i) => {
      const ts = l.ts ?? f.mtime - (lines.length - i) * 60_000;
      const e = byCmd.get(l.cmd);
      if (e) (e.n++, (e.ts = Math.max(e.ts, ts)));
      else byCmd.set(l.cmd, { cmd: l.cmd, n: 1, ts, src: 'shell' });
    });
  }
  const list = [...byCmd.values()].filter((e) => !SECRET.test(e.cmd)).sort((a, b) => b.ts - a.ts).slice(0, 4000);
  shellCache = { key, list };
  return list;
}

function readTail(file: string, bytes: number): string {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, bytes);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    const s = buf.toString('utf8');
    // A cut at the start leaves a partial line: drop it.
    return len < size ? s.slice(s.indexOf('\n') + 1) : s;
  } finally {
    fs.closeSync(fd);
  }
}

function parseHistory(text: string, kind: 'bash' | 'zsh' | 'fish'): { cmd: string; ts?: number }[] {
  const out: { cmd: string; ts?: number }[] = [];
  const keep = (cmd: string, ts?: number) => {
    const c = cmd.trim();
    if (c && c.length <= 500 && !c.includes('\n')) out.push({ cmd: c, ts });
  };
  if (kind === 'fish') {
    // - cmd: git status
    //   when: 1700000000
    let cmd: string | null = null;
    for (const l of text.split('\n')) {
      const c = /^- cmd: (.*)$/.exec(l);
      if (c) {
        if (cmd) keep(cmd);
        cmd = c[1].replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
        continue;
      }
      const w = /^\s+when: (\d+)/.exec(l);
      if (w && cmd !== null) {
        keep(cmd, Number(w[1]) * 1000);
        cmd = null;
      }
    }
    if (cmd) keep(cmd);
    return out;
  }
  let ts: number | undefined;
  let pending = '';
  for (const l of text.split('\n')) {
    if (kind === 'bash' && /^#\d{9,}$/.test(l)) {
      ts = Number(l.slice(1)) * 1000;
      continue;
    }
    let line = l;
    if (kind === 'zsh' && !pending) {
      // : 1700000000:0;git status
      const m = /^: (\d+):\d+;(.*)$/.exec(l);
      if (m) {
        ts = Number(m[1]) * 1000;
        line = m[2];
      }
    }
    // zsh writes a multi-line command with a backslash at each line's end.
    if (kind === 'zsh' && line.endsWith('\\')) {
      pending += line.slice(0, -1) + '\n';
      continue;
    }
    keep(pending + line, ts);
    pending = '';
    ts = undefined;
  }
  return out;
}

// ---- completing the word being typed ----------------------------------------------------------

const GIT_SUBCOMMANDS = ['add', 'bisect', 'blame', 'branch', 'checkout', 'cherry-pick', 'clean', 'clone', 'commit', 'config', 'diff', 'fetch', 'grep', 'init', 'log', 'merge', 'mv', 'pull', 'push', 'rebase', 'reflog', 'remote', 'reset', 'restore', 'revert', 'rm', 'show', 'stash', 'status', 'switch', 'tag', 'worktree'];
const GIT_BRANCH_TAKERS = new Set(['checkout', 'switch', 'merge', 'rebase', 'branch', 'diff', 'log', 'cherry-pick', 'reset', 'push', 'pull', 'show', 'worktree', 'restore']);

/** Completions for the line's last word, worked out in the folder the shell is in. */
export async function complete(line: string, cwd: string): Promise<Completion[]> {
  const m = /^(.*?)(\S*)$/s.exec(line)!;
  const head = m[1];
  const word = m[2];
  // The command being typed is the one after the last ;, &&, || or |.
  const words = head
    .split(/;|&&|\|\|?/)
    .pop()!
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return [];
  const pick = (cands: Iterable<string>, kind: Completion['kind'], suffix = ''): Completion[] => {
    const out: Completion[] = [];
    for (const c of cands) if (c.startsWith(word) && c !== word && out.length < 60) out.push({ text: head + c + suffix, label: c, kind });
    return out;
  };
  const w = words[0] === 'sudo' ? words.slice(1) : words;
  const [cmd, sub] = w;
  const argc = w.length;
  if (!cmd) return [];
  if (cmd === 'git') {
    if (argc === 1) return pick(GIT_SUBCOMMANDS, 'subcommand', ' ');
    if (GIT_BRANCH_TAKERS.has(sub) && !word.startsWith('-')) return pick(await branches(cwd), 'branch');
  }
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(cmd) && ((sub === 'run' && argc === 2) || (cmd !== 'npm' && cmd !== 'bun' && argc === 1))) return pick(scripts(cwd), 'script');
  if (cmd === 'make' && !word.startsWith('-')) return pick(makeTargets(cwd), 'target');
  if (['ssh', 'mosh', 'sftp'].includes(cmd) && argc === 1 && !word.startsWith('-')) return pick(sshHosts(), 'host');
  if (['cd', 'pushd'].includes(cmd)) return paths(head, word, cwd, true);
  if (/^(~|\.{1,2}|\/)/.test(word) || word.includes('/')) return paths(head, word, cwd, false);
  return [];
}

async function branches(cwd: string): Promise<string[]> {
  const r = await git(cwd, ['for-each-ref', '--sort=-committerdate', '--format=%(refname:short)', 'refs/heads', 'refs/remotes'], 5000);
  if (!r.ok) return [];
  return r.out
    .split('\n')
    .filter((b) => b && !b.endsWith('/HEAD') && b !== 'origin')
    .slice(0, 300);
}

/** Scripts of the package.json in the folder or the nearest one above it. */
function scripts(cwd: string): string[] {
  for (let dir = cwd, i = 0; i < 6; i++, dir = path.dirname(dir)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      return Object.keys(pkg.scripts ?? {});
    } catch {}
    if (dir === path.dirname(dir)) break;
  }
  return [];
}

function makeTargets(cwd: string): string[] {
  for (const name of ['GNUmakefile', 'makefile', 'Makefile']) {
    try {
      const text = fs.readFileSync(path.join(cwd, name), 'utf8').slice(0, 512 * 1024);
      const out = new Set<string>();
      for (const m of text.matchAll(/^([A-Za-z0-9_][^:$#=\s%]*)\s*:(?!=)/gm)) out.add(m[1]);
      return [...out];
    } catch {}
  }
  return [];
}

function sshHosts(): string[] {
  try {
    const text = fs.readFileSync(path.join(config.home, '.ssh/config'), 'utf8');
    const out = new Set<string>();
    for (const m of text.matchAll(/^\s*Host\s+(.+)$/gim)) for (const h of m[1].split(/\s+/)) if (h && !/[*?!]/.test(h)) out.add(h);
    return [...out];
  } catch {
    return [];
  }
}

/** Entries of the folder the word points into; folders end in "/", spaces are escaped. */
function paths(head: string, word: string, cwd: string, dirsOnly: boolean): Completion[] {
  const slash = word.lastIndexOf('/');
  const dirPart = word.slice(0, slash + 1);
  const prefix = word.slice(slash + 1).replace(/\\ /g, ' ');
  const dir = path.resolve(cwd, dirPart.replace(/^~(?=$|\/)/, config.home).replace(/\\ /g, ' ') || '.');
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true }).slice(0, 5000);
  } catch {
    return [];
  }
  const out: Completion[] = [];
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!e.name.startsWith(prefix) || (e.name.startsWith('.') && !prefix.startsWith('.'))) continue;
    let isDir = e.isDirectory();
    if (e.isSymbolicLink()) {
      try {
        isDir = fs.statSync(path.join(dir, e.name)).isDirectory();
      } catch {}
    }
    if (dirsOnly && !isDir) continue;
    const name = e.name.replace(/ /g, '\\ ') + (isDir ? '/' : '');
    out.push({ text: head + dirPart + name, label: name, kind: isDir ? 'dir' : 'file' });
    if (out.length >= 60) break;
  }
  return out.filter((c) => c.text !== head + word);
}

// ---- a command from a description -------------------------------------------------------------

const ASK_SYSTEM = [
  'You turn a request into a shell command for the terminal described.',
  'Reply with JSON only, no prose and no code fences: {"commands":[{"command":"...","why":"..."}]}.',
  'Give 1 to 3 options, best first. Each command is one line that can be pasted at the prompt.',
  '"why" says in under 12 plain words what it does. Prefer safe, read-only commands when the request allows.',
].join(' ');

/** Up to three commands for a plain description, written by Claude (or Codex when Claude is not signed in). */
export async function askCommands(text: string, o: { cwd: string; shell: string; codexModel?: string }): Promise<{ command: string; why: string }[]> {
  const request = text.trim().slice(0, 2000);
  if (!request) throw new HttpError(400, 'Describe what the command should do');
  const prompt = [`Shell: ${o.shell || 'bash'} on ${os.platform() === 'darwin' ? 'macOS' : os.platform() === 'win32' ? `Windows${o.shell === 'bash' ? ' (Git for Windows)' : ''}` : 'Linux'}.`, `Folder: ${o.cwd}`, await folderNotes(o.cwd), `Request: ${request}`].filter(Boolean).join('\n');
  const list = (await oneShotJson<{ commands?: unknown }>({ system: ASK_SYSTEM, prompt, codexModel: o.codexModel }, 'a command')).commands;
  if (!Array.isArray(list)) throw new HttpError(502, 'The model did not answer with a command');
  return list
    .filter((c) => c && typeof c.command === 'string' && c.command.trim())
    .slice(0, 3)
    .map((c) => ({ command: String(c.command).trim().replace(/\n+/g, ' ').slice(0, 1000), why: typeof c.why === 'string' ? c.why.slice(0, 200) : '' }));
}

/** What the folder holds, so the command fits it: the first names in it and the git branch. */
async function folderNotes(cwd: string): Promise<string> {
  const notes: string[] = [];
  try {
    const names = fs.readdirSync(cwd).filter((n) => !n.startsWith('.')).slice(0, 40);
    if (names.length) notes.push(`Files here: ${names.join(', ')}`);
  } catch {}
  const br = await git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'], 3000);
  if (br.ok) notes.push(`Git branch: ${br.out.trim()}`);
  return notes.join('\n');
}
