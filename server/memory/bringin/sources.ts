// What other assistants on this computer kept about the user, for Settings → Memory → Bring in: Claude Code's memory
// files (each project's auto memory, in the user's own folder and in Hydor's accounts, and the CLAUDE.md written for
// every project), Codex's memories and AGENTS.md, Hermes's MEMORY.md and USER.md (each profile's), and OpenClaw's
// workspace MEMORY.md and USER.md. Only read, never changed. A project's memory says which folder it is for, so its
// notes can go to that project here (when the folder is still on this computer).
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { agentRoots, config } from '../../config.ts';
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

export type SourceId = 'claude-code' | 'codex' | 'hermes' | 'openclaw';

export interface LocalSource {
  id: SourceId;
  name: string;
  /** Memory files found (what the assistant kept, and what it knew of the user), and in how many projects. */
  memory: number;
  projects: number;
  /** The instructions the user wrote for it, when there are some: "CLAUDE.md". */
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

/** Hermes: MEMORY.md and USER.md, of the default profile and each other one. */
function hermes(roots: Roots): Material[] {
  const home = process.env.HERMES_HOME ?? path.join(roots.home, '.hermes');
  const dirs = [path.join(home, 'memories'), ...safeList(path.join(home, 'profiles')).map((p) => path.join(home, 'profiles', p, 'memories'))];
  const out: Material[] = [];
  for (const dir of dirs) {
    const profile = path.basename(path.dirname(dir));
    const label = profile === path.basename(home) ? '' : ` (profile ${profile})`;
    const mem = readText(path.join(dir, 'MEMORY.md'));
    if (mem) out.push({ source: 'Hermes', kind: 'memory', name: `MEMORY.md${label}`, text: mem.text.replace(/\n?§\n?/g, '\n\n'), at: mem.at });
    const user = readText(path.join(dir, 'USER.md'));
    if (user) out.push({ source: 'Hermes', kind: 'profile', name: `USER.md${label}`, text: user.text.replace(/\n?§\n?/g, '\n\n'), at: user.at });
  }
  return out;
}

/** OpenClaw: its workspace's MEMORY.md and USER.md (the daily notes are its working layer: what lasts is in these). */
function openclaw(roots: Roots): Material[] {
  const ws = process.env.OPENCLAW_WORKSPACE ?? path.join(roots.home, '.openclaw', 'workspace');
  const out: Material[] = [];
  const mem = readText(path.join(ws, 'MEMORY.md'), 24_000);
  if (mem) out.push({ source: 'OpenClaw', kind: 'memory', name: 'MEMORY.md', text: mem.text, at: mem.at });
  const user = readText(path.join(ws, 'USER.md'));
  if (user) out.push({ source: 'OpenClaw', kind: 'profile', name: 'USER.md', text: user.text, at: user.at });
  return out;
}

const READERS: Record<SourceId, { name: string; read: (r: Roots) => Material[] }> = {
  'claude-code': { name: 'Claude Code', read: claudeCode },
  codex: { name: 'Codex', read: codex },
  hermes: { name: 'Hermes', read: hermes },
  openclaw: { name: 'OpenClaw', read: openclaw },
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
    const own = list.some((m) => m.kind === 'instructions') ? (id === 'codex' ? 'AGENTS.md' : 'CLAUDE.md') : undefined;
    out.push({ id, name: READERS[id].name, memory, projects, ...(own ? { own } : {}), chars: list.reduce((n, m) => n + m.text.length, 0) });
  }
  return out;
}
