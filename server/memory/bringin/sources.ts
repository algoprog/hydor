// What other assistants on this computer kept about the user, for Settings → Memory → Bring in: Claude Code's memory
// files (each project's auto memory, in the user's own folder and in Hydor's accounts, and the CLAUDE.md written for
// every project), Codex's memories and AGENTS.md, Hermes's MEMORY.md and USER.md (each profile's), OpenClaw's
// workspace MEMORY.md and USER.md, pi's AGENTS.md and SYSTEM.md (its instructions: how the user likes to work), and
// Atomic Agent's memory store (a copy of its memory.sqlite, read: profile facts, notes, lessons and procedures). Only
// read, never changed. A project's memory says which folder it is for, so its
// notes can go to that project here (when the folder is still on this computer).
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { agentRoots, config } from '../../config.ts';
import { redactSecrets } from '../secrets.ts';
import { repoRoot } from '../store.ts';

/** A piece of what an assistant kept, as the helper model reads it. */
export interface Material {
  /** The assistant, or the export, as the user knows it: "Claude Code". */
  source: string;
  /** What it is: memory the assistant kept, what it knew of the user, instructions the user wrote, or their messages in chats. */
  kind: 'memory' | 'profile' | 'instructions' | 'chats';
  /** The project folder it is about, when that is one still on this computer. */
  folder?: string;
  /** A project it is about, by name, when its folder is not here. */
  project?: string;
  /** Its name, for the helper ("feedback_tests.md (feedback)"). */
  name: string;
  text: string;
  /** When it was last changed. */
  at?: number;
}

export type SourceId = 'claude-code' | 'codex' | 'hermes' | 'openclaw' | 'pi' | 'atomic';

export interface LocalSource {
  id: SourceId;
  name: string;
  /** Memory files found (what the assistant kept, and what it knew of the user), and in how many projects. */
  memory: number;
  projects: number;
  /** The instructions the user wrote for it, when there are some: "CLAUDE.md" (pi: "AGENTS.md and SYSTEM.md"). */
  own?: string;
  chars: number;
}

/** Where to look: the real folders, or a test's. */
export interface Roots {
  home: string;
  /** Claude Code's `projects` folders: the user's own and each account's. */
  claudeProjects: string[];
  codexHomes: string[];
}

export function defaultRoots(): Roots {
  const home = os.homedir();
  const claude = new Set([...agentRoots.claudeProjects, path.join(home, '.claude', 'projects')]);
  // Hydor's own accounts, also those no longer in use: their sessions kept memory before Hydor turned that off.
  const accounts = path.join(config.dataDir, 'accounts');
  for (const name of safeList(accounts)) if (name.startsWith('claude-')) claude.add(path.join(accounts, name, 'projects'));
  return { home, claudeProjects: [...claude], codexHomes: [...new Set([...agentRoots.codexHomes, process.env.CODEX_HOME ?? path.join(home, '.codex')])] };
}

/** Most of one file the helper reads. */
const FILE_CHARS = 8000;

function safeList(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function readText(file: string, max = FILE_CHARS): { text: string; at: number } | null {
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > 4_000_000) return null;
    const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').trim();
    if (!text) return null;
    return { text: text.length > max ? `${text.slice(0, max)}\n[…cut]` : text, at: st.mtimeMs };
  } catch {
    return null;
  }
}

/** A Markdown file's front matter (`name`, `description`, `type`, also under `metadata:`) and the rest. */
export function frontMatter(text: string): { fields: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { fields: {}, body: text };
  const fields: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const f = /^\s*([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (f && f[2] && !(f[1] in fields)) fields[f[1]] = f[2].replace(/^["']|["']$/g, '').trim();
  }
  return { fields, body: text.slice(m[0].length).trim() };
}

/**
 * The folder a Claude Code project folder is for: its sessions say it (their `cwd`); else its name, which is the
 * path with every / and . made a -, when that path is here.
 */
function claudeProjectFolder(dir: string): string | null {
  for (const f of safeList(dir)
    .filter((n) => n.endsWith('.jsonl'))
    .slice(0, 5)) {
    try {
      const fd = fs.openSync(path.join(dir, f), 'r');
      const buf = Buffer.alloc(64 * 1024);
      const n = fs.readSync(fd, buf, 0, buf.length, 0);
      fs.closeSync(fd);
      const cwd = /"cwd":"((?:[^"\\]|\\.)*)"/.exec(buf.toString('utf8', 0, n))?.[1];
      if (cwd) return JSON.parse(`"${cwd}"`) as string;
    } catch {}
  }
  const guess = path.basename(dir).replace(/-/g, '/');
  return guess.startsWith('/') && fs.existsSync(guess) ? guess : null;
}

const hash = (s: string) => crypto.createHash('sha1').update(s).digest('hex');

/** Claude Code: each project's memory files, and the CLAUDE.md for every project beside each `projects` folder. */
function claudeCode(roots: Roots): Material[] {
  const out: Material[] = [];
  const seen = new Set<string>();
  const add = (m: Material) => {
    const h = hash(m.text);
    if (seen.has(h)) return;
    seen.add(h);
    out.push(m);
  };
  for (const projects of roots.claudeProjects) {
    const own = readText(path.join(path.dirname(projects), 'CLAUDE.md'));
    if (own) add({ source: 'Claude Code', kind: 'instructions', name: 'CLAUDE.md (for every project)', text: own.text, at: own.at });
    for (const p of safeList(projects)) {
      const mem = path.join(projects, p, 'memory');
      const files = safeList(mem).filter((n) => n.endsWith('.md'));
      if (!files.length) continue;
      const folder = claudeProjectFolder(path.join(projects, p));
      const here = folder && fs.existsSync(folder) ? folder : undefined;
      // The index lists the other files; alone, it is the memory.
      const list = files.length > 1 ? files.filter((n) => n !== 'MEMORY.md') : files;
      for (const f of list) {
        const t = readText(path.join(mem, f));
        if (!t) continue;
        const { fields, body } = frontMatter(t.text);
        const type = fields.type ?? (/^\s+type:\s*(\w+)/m.exec(t.text)?.[1] || '');
        const text = [fields.description, body].filter(Boolean).join('\n\n');
        // A folder no longer here: named by its path, which is all its name says (each / made a -).
        const project = here ? undefined : folder ? path.basename(folder) : p.replace(/^-+/, '');
        add({ source: 'Claude Code', kind: type === 'user' ? 'profile' : 'memory', folder: here, project, name: `${f}${type ? ` (${type})` : ''}`, text, at: t.at });
      }
    }
  }
  return out;
}

/** Codex: its consolidated memories, and the AGENTS.md for every project. */
function codex(roots: Roots): Material[] {
  const out: Material[] = [];
  for (const home of roots.codexHomes) {
    for (const f of ['memory_summary.md', 'MEMORY.md']) {
      const t = readText(path.join(home, 'memories', f), 24_000);
      if (t) out.push({ source: 'Codex', kind: 'memory', name: f, text: t.text, at: t.at });
    }
    const own = readText(path.join(home, 'AGENTS.md'));
    if (own) out.push({ source: 'Codex', kind: 'instructions', name: 'AGENTS.md (for every project)', text: own.text, at: own.at });
  }
  return out;
}

// ---- where each assistant keeps its things ---------------------------------------------------------
// The environment variables each one documents move its folder; they count only for the real home folder (a test's
// own home has its own folders).

const realHome = (roots: Roots) => roots.home === os.homedir();
const tilde = (p: string, home: string) => (p === '~' ? home : p.startsWith('~/') ? path.join(home, p.slice(2)) : p);
const envPath = (roots: Roots, name: string): string | undefined => {
  const v = realHome(roots) ? process.env[name]?.trim() : undefined;
  return v ? path.resolve(tilde(v, roots.home)) : undefined;
};

/** Hermes's home (HERMES_HOME), and its profiles' homes: each profile has memories/ and skills/ of its own. */
export function hermesHomes(roots: Roots): { dir: string; profile?: string }[] {
  const home = envPath(roots, 'HERMES_HOME') ?? path.join(roots.home, '.hermes');
  return [{ dir: home }, ...safeList(path.join(home, 'profiles')).filter((p) => !p.startsWith('.')).map((p) => ({ dir: path.join(home, 'profiles', p), profile: p }))].filter((h) => isDir(h.dir));
}

/** OpenClaw's state folder (OPENCLAW_STATE_DIR) and its workspace (OPENCLAW_WORKSPACE_DIR). */
export function openclawDirs(roots: Roots): { state: string; workspace: string } {
  const state = envPath(roots, 'OPENCLAW_STATE_DIR') ?? path.join(roots.home, '.openclaw');
  return { state, workspace: envPath(roots, 'OPENCLAW_WORKSPACE_DIR') ?? envPath(roots, 'OPENCLAW_WORKSPACE') ?? path.join(state, 'workspace') };
}

/** pi's agent folder (PI_CODING_AGENT_DIR): its settings, instructions and skills. */
export const piDir = (roots: Roots) => envPath(roots, 'PI_CODING_AGENT_DIR') ?? path.join(roots.home, '.pi', 'agent');

/** Atomic Agent's state folder (ATOMIC_AGENT_STATE_DIR), and the one its desktop app kept before it moved onto it. */
export function atomicDirs(roots: Roots): string[] {
  const own = envPath(roots, 'ATOMIC_AGENT_STATE_DIR');
  return [...new Set([own ?? path.join(roots.home, '.atomic-agent'), path.join(roots.home, '.atomic-agent-desktop')])].filter(isDir);
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Which assistants have a folder on this computer (the setup tour asks), by the folder's name, with no reading. */
export function foundAssistants(roots: Roots = defaultRoots()): { id: SourceId; name: string }[] {
  const has: Record<SourceId, boolean> = {
    'claude-code': roots.claudeProjects.some((p) => isDir(path.dirname(p))),
    codex: roots.codexHomes.some(isDir),
    hermes: hermesHomes(roots).length > 0,
    openclaw: isDir(openclawDirs(roots).state),
    pi: isDir(piDir(roots)) || isDir(path.join(roots.home, '.pi')),
    atomic: atomicDirs(roots).length > 0,
  };
  return SOURCE_IDS.filter((id) => has[id]).map((id) => ({ id, name: READERS[id].name }));
}

/** Hermes: MEMORY.md and USER.md, of the default profile and each other one. */
function hermes(roots: Roots): Material[] {
  const out: Material[] = [];
  for (const h of hermesHomes(roots)) {
    const dir = path.join(h.dir, 'memories');
    const label = h.profile ? ` (profile ${h.profile})` : '';
    const mem = readText(path.join(dir, 'MEMORY.md'));
    if (mem) out.push({ source: 'Hermes', kind: 'memory', name: `MEMORY.md${label}`, text: mem.text.replace(/\n?§\n?/g, '\n\n'), at: mem.at });
    const user = readText(path.join(dir, 'USER.md'));
    if (user) out.push({ source: 'Hermes', kind: 'profile', name: `USER.md${label}`, text: user.text.replace(/\n?§\n?/g, '\n\n'), at: user.at });
  }
  return out;
}

/** OpenClaw: its workspace's MEMORY.md and USER.md (the daily notes are its working layer: what lasts is in these). */
function openclaw(roots: Roots): Material[] {
  const ws = openclawDirs(roots).workspace;
  const out: Material[] = [];
  const mem = readText(path.join(ws, 'MEMORY.md'), 24_000);
  if (mem) out.push({ source: 'OpenClaw', kind: 'memory', name: 'MEMORY.md', text: mem.text, at: mem.at });
  const user = readText(path.join(ws, 'USER.md'));
  if (user) out.push({ source: 'OpenClaw', kind: 'profile', name: 'USER.md', text: user.text, at: user.at });
  return out;
}

/**
 * pi: the instructions the user wrote for every folder, in its agent folder: AGENTS.md (or the file that stands for it:
 * AGENTS.override.md, CLAUDE.md), SYSTEM.md (which replaces pi's own system prompt) and APPEND_SYSTEM.md (which adds to
 * it). They say how the user likes to work. Its project files (.pi/ in a folder) are left where they are.
 */
function pi(roots: Roots): Material[] {
  const dir = piDir(roots);
  const out: Material[] = [];
  const context = ['AGENTS.override.md', 'AGENTS.md', 'AGENTS.MD', 'CLAUDE.md', 'CLAUDE.MD'].map((f) => readText(path.join(dir, f))).find(Boolean);
  if (context) out.push({ source: 'pi', kind: 'instructions', name: 'AGENTS.md (for every project)', text: context.text, at: context.at });
  for (const f of ['SYSTEM.md', 'APPEND_SYSTEM.md']) {
    const t = readText(path.join(dir, f));
    if (t) out.push({ source: 'pi', kind: 'instructions', name: `${f} (the system prompt it was given)`, text: t.text, at: t.at });
  }
  return out;
}

// ---- Atomic Agent's memory store -----------------------------------------------------------------------

/** Most of each kind the store gives the helper, newest first. */
const ATOMIC_NOTES = 400;
const ATOMIC_NOTE_CHARS = 1000;
const ATOMIC_PIECE_CHARS = 20_000;

/**
 * Atomic Agent's memory.sqlite, read from a copy (with its write-ahead log) in a folder of its own, so the original is
 * never opened for writing and a running Atomic keeps it: the profile facts it holds now, its notes (those not folded
 * into a lesson), the lessons and the procedures it keeps. Each note says the folder it was made in.
 */
function atomic(roots: Roots): Material[] {
  const out: Material[] = [];
  for (const dir of atomicDirs(roots)) {
    const file = path.join(dir, 'memory.sqlite');
    if (!fs.existsSync(file)) continue;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-atomic-'));
    let db: Database.Database | null = null;
    try {
      for (const ext of ['', '-wal', '-shm']) if (fs.existsSync(file + ext)) fs.copyFileSync(file + ext, path.join(tmp, `memory.sqlite${ext}`));
      db = new Database(path.join(tmp, 'memory.sqlite'), { readonly: true, fileMustExist: true });
      out.push(...atomicRows(db, fs.statSync(file).mtimeMs));
    } catch {
      // Not a store this reader knows (too old, or damaged): nothing of it.
    } finally {
      try {
        db?.close();
      } catch {}
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
  return out;
}

function atomicRows(db: Database.Database, at: number): Material[] {
  const out: Material[] = [];
  const has = (table: string, column?: string) => {
    const cols = db.prepare(`pragma table_info(${table})`).all() as { name: string }[];
    return cols.length > 0 && (!column || cols.some((c) => c.name === column));
  };
  const rows = <T>(sql: string): T[] => {
    try {
      return db.prepare(sql).all() as T[];
    } catch {
      return [];
    }
  };
  const cut = (t: unknown, n: number) => {
    const x = redactSecrets(String(t ?? '').replace(/\s+/g, ' ').trim());
    return x.length > n ? `${x.slice(0, n)}…` : x;
  };
  // The profile: the facts in force (a later one replaced an earlier one of the key: pre-v7 stores have no replaced ones).
  if (has('profile_facts')) {
    const facts = rows<{ key: string; value: string }>(`select key, value from profile_facts ${has('profile_facts', 'superseded_by') ? 'where superseded_by is null' : ''} order by key limit 300`);
    const lines = facts.map((f) => `${cut(f.key, 80)}: ${cut(f.value, 400)}`).filter((l) => l.length > 3);
    if (lines.length) out.push({ source: 'Atomic Agent', kind: 'profile', name: 'profile facts', text: lines.join('\n').slice(0, ATOMIC_PIECE_CHARS), at });
  }
  // The notes, by the folder they were made in: one piece for each folder (more when it is long).
  if (has('memories')) {
    const notes = rows<{ content: string; working_dir: string | null; updated_at: number }>(
      `select content, working_dir, updated_at from memories ${has('memories', 'consolidated_into') ? 'where consolidated_into is null' : ''} order by updated_at desc limit ${ATOMIC_NOTES}`,
    );
    const byFolder = new Map<string, { content: string; at: number }[]>();
    for (const n of notes) {
      const k = n.working_dir ?? '';
      if (!byFolder.has(k)) byFolder.set(k, []);
      byFolder.get(k)!.push({ content: cut(n.content, ATOMIC_NOTE_CHARS), at: n.updated_at });
    }
    for (const [k, list] of byFolder) {
      const folder = k && path.isAbsolute(k) && fs.existsSync(k) ? k : undefined;
      const project = !folder && k ? path.basename(k) : undefined;
      let part: string[] = [];
      let len = 0;
      let n = 0;
      const flush = () => {
        if (!part.length) return;
        out.push({ source: 'Atomic Agent', kind: 'memory', folder, project, name: `notes${project ? ` (${project})` : ''}${++n > 1 ? ` ${n}` : ''}`, text: part.join('\n\n'), at: Math.max(at, ...list.map((x) => x.at)) });
        part = [];
        len = 0;
      };
      for (const x of list) {
        if (!x.content) continue;
        if (len + x.content.length > ATOMIC_PIECE_CHARS) flush();
        part.push(`- ${x.content}`);
        len += x.content.length + 2;
      }
      flush();
    }
  }
  const active = (t: string) => (has(t, 'status') ? "where status = 'active'" : '');
  if (has('lessons')) {
    const l = rows<{ activation: string; principle: string }>(`select activation, principle from lessons ${active('lessons')} order by updated_at desc limit 150`);
    const text = l.map((x) => `- When ${cut(x.activation, 300)}: ${cut(x.principle, 500)}`).join('\n');
    if (text) out.push({ source: 'Atomic Agent', kind: 'memory', name: 'lessons it learned', text: text.slice(0, ATOMIC_PIECE_CHARS), at });
  }
  if (has('procedures')) {
    const p = rows<{ activation: string; steps: string }>(`select activation, steps from procedures ${active('procedures')} order by updated_at desc limit 100`);
    const text = p.map((x) => `- ${cut(x.activation, 300)}: ${cut(x.steps, 600)}`).join('\n');
    if (text) out.push({ source: 'Atomic Agent', kind: 'memory', name: 'procedures it kept', text: text.slice(0, ATOMIC_PIECE_CHARS), at });
  }
  return out;
}

const READERS: Record<SourceId, { name: string; read: (r: Roots) => Material[] }> = {
  'claude-code': { name: 'Claude Code', read: claudeCode },
  codex: { name: 'Codex', read: codex },
  hermes: { name: 'Hermes', read: hermes },
  openclaw: { name: 'OpenClaw', read: openclaw },
  pi: { name: 'pi', read: pi },
  atomic: { name: 'Atomic Agent', read: atomic },
};

export const SOURCE_IDS = Object.keys(READERS) as SourceId[];

/** What one source holds, to read. */
export const readSource = (id: SourceId, roots: Roots = defaultRoots()): Material[] => READERS[id].read(roots);

/** The sources found on this computer, each with what it holds. */
export function localSources(roots: Roots = defaultRoots()): LocalSource[] {
  const out: LocalSource[] = [];
  for (const id of SOURCE_IDS) {
    const list = readSource(id, roots);
    if (!list.length) continue;
    // Projects: folders in one (not the home folder, whose memory is about the user), or named ones no longer here.
    const projects = new Set(list.map((m) => (m.folder ? repoRoot(m.folder) : m.project)).filter(Boolean)).size;
    const memory = list.filter((m) => m.kind !== 'instructions').length;
    // The instructions' file names, as they are called ("CLAUDE.md"; pi's: "AGENTS.md and SYSTEM.md").
    const names = [...new Set(list.filter((m) => m.kind === 'instructions').map((m) => m.name.replace(/ \(.*$/, '')))];
    const own = names.length ? (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]) : undefined;
    out.push({ id, name: READERS[id].name, memory, projects, ...(own ? { own } : {}), chars: list.reduce((n, m) => n + m.text.length, 0) });
  }
  return out;
}
