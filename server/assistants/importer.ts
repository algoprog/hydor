// Assistants from Claude Code's agent files (.claude/agents/*.md): the frontmatter gives the name,
// description, model and tools (and a permission mode and skills when set), the text below it is the
// prompt. Files are found in the user's ~/.claude/agents and a folder's own .claude/agents.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CLAUDE_TOOLS, TOOL_KINDS, type Assistant, type AssistantMode, type ToolKind } from '../../shared/assistants.ts';
import { HttpError } from '../auth.ts';

type Value = string | string[];

/** A scalar's text: quotes taken off, a double-quoted one's escapes read. */
function scalar(v: string): string {
  const s = v.trim();
  if (s.length >= 2 && s[0] === '"' && s.endsWith('"'))
    return s.slice(1, -1).replace(/\\(["\\nt])/g, (_, c: string) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));
  if (s.length >= 2 && s[0] === "'" && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
  return s.replace(/\s+#.*$/, '');
}

/** The YAML frontmatter Claude Code's agent files use: plain, quoted and block (| >) values, and lists. */
export function parseFrontmatter(src: string): { data: Record<string, Value>; body: string } {
  const m = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(src);
  if (!m) return { data: {}, body: src.trim() };
  const data: Record<string, Value> = {};
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(lines[i]);
    if (!kv) continue;
    const [, key, rest] = kv;
    // The indented lines under the key: a block's text, a list's items, or a plain value's next lines.
    const more: string[] = [];
    while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || /^\s*-\s/.test(lines[i + 1]) || (!lines[i + 1].trim() && /^[|>]/.test(rest.trim())))) more.push(lines[++i]);
    const head = rest.trim();
    if (/^[|>][-+]?$/.test(head)) {
      const indent = Math.min(...more.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length));
      const text = more.map((l) => l.slice(Number.isFinite(indent) ? indent : 0));
      data[key] = (head[0] === '|' ? text.join('\n') : text.join('\n').replace(/([^\n])\n(?=[^\n])/g, '$1 ')).trim();
    } else if (!head && more.some((l) => /^\s*-\s/.test(l))) data[key] = more.filter((l) => /^\s*-\s/.test(l)).map((l) => scalar(l.replace(/^\s*-\s/, '')));
    else if (/^\[.*\]$/.test(head))
      data[key] = head
        .slice(1, -1)
        .split(',')
        .map(scalar)
        .filter(Boolean);
    else data[key] = scalar([head, ...more.map((l) => l.trim())].filter(Boolean).join(' '));
  }
  return { data, body: src.slice(m[0].length).trim() };
}

const text = (v: Value | undefined) => (Array.isArray(v) ? v.join(', ') : (v ?? '')).trim();
/** A list given as YAML items, or as text: "Read, Grep, Bash(git *)" (or without commas, by spaces). */
const items = (v: Value | undefined) =>
  (Array.isArray(v) ? v : (v ?? '').includes(',') ? (v ?? '').split(',') : (v ?? '').split(/\s+/)).map((x) => x.trim()).filter(Boolean);

/** "code-reviewer" → "Code reviewer"; a name with spaces stays as it is. */
function displayName(n: string): string {
  if (/\s/.test(n.trim())) return n.trim();
  const words = n.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** One line for the picker: no examples, the first sentence. */
function oneLine(d: string): string {
  const s = d
    .replace(/<(example|commentary)>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // "e.g." and the like do not end a sentence (kept as one-dot leaders until it is cut).
    .replace(/\b(e\.g|i\.e|etc|vs|approx)\./gi, (m) => m.replace(/\./g, '․'));
  const first = (/^(.{20,}?[.!?])(\s|$)/.exec(s)?.[1] ?? s).replace(/․/g, '.');
  return first.length > 140 ? `${first.slice(0, 139).replace(/\s+\S*$/, '')}…` : first;
}

/** Claude Code's tool names as kinds; tools of every kind (Task, TodoWrite, Skill) count for none. */
function kindsOf(tools: string[]): ToolKind[] {
  const kinds = new Set<ToolKind>();
  for (const t of tools) {
    const name = t.replace(/\(.*$/, '').trim();
    if (name.startsWith('mcp__')) kinds.add('mcp');
    for (const k of TOOL_KINDS) if (CLAUDE_TOOLS[k.id].includes(name)) kinds.add(k.id);
  }
  return TOOL_KINDS.map((k) => k.id).filter((k) => kinds.has(k));
}

const MODES: Record<string, AssistantMode> = { default: 'ask', acceptEdits: 'edits', bypassPermissions: 'full', plan: 'plan' };

/** An icon that fits what it does, from its name and description. */
function iconFor(s: string): string {
  const t = s.toLowerCase();
  const by: [RegExp, string][] = [
    [/\b(research|search|investigat|find)/, 'telescope'],
    [/\b(writ|edit|copy|doc|content|blog)/, 'pen-line'],
    [/\b(data|analy|sql|metric|chart)/, 'chart-column'],
    [/\b(teach|tutor|learn|explain)/, 'graduation-cap'],
    [/\b(plan|schedul|project|roadmap)/, 'calendar-check'],
    [/\b(secur|audit)/, 'shield'],
    [/\b(design|ui|ux)\b/, 'palette'],
    [/\b(code|review|debug|test|refactor|engineer|develop|program)/, 'code'],
  ];
  return by.find(([re]) => re.test(t))?.[1] ?? 'bot';
}

/** An agent file as an assistant (without an id); `file` names it when the frontmatter does not. */
export function parseAgentFile(src: string, file = ''): Omit<Assistant, 'id'> {
  const { data, body } = parseFrontmatter(src);
  const raw = text(data.name) || path.basename(file, '.md');
  if (!raw) throw new HttpError(400, 'That file has no name in its frontmatter');
  const name = displayName(raw).slice(0, 60);
  const description = oneLine(text(data.description));
  const model = text(data.model);
  const tools = data.tools !== undefined ? kindsOf(items(data.tools)) : undefined;
  const skills = data.skills !== undefined ? items(data.skills).slice(0, 30) : [];
  return {
    name,
    icon: iconFor(`${raw} ${description}`),
    description,
    instructions: body.slice(0, 20_000),
    // "inherit" keeps the start page's model.
    ...(model && model !== 'inherit' ? { agent: 'claude' as const, model } : {}),
    ...(tools && tools.length < TOOL_KINDS.length ? { tools } : {}),
    ...(skills.length ? { skills } : {}),
    ...(MODES[text(data.permissionMode)] ? { mode: MODES[text(data.permissionMode)] } : {}),
    // Claude Code's agents work in a project.
    folder: 'project',
    ...(file ? { source: file } : {}),
  };
}

export interface AgentFile {
  path: string;
  scope: 'user' | 'project';
  name: string;
  description: string;
}

/** The agent files in the user's ~/.claude/agents and the folder's .claude/agents. */
export function findAgentFiles(cwd?: string): AgentFile[] {
  const dirs: [string, AgentFile['scope']][] = [[path.join(process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude'), 'agents'), 'user']];
  if (cwd) dirs.push([path.join(cwd, '.claude', 'agents'), 'project']);
  const out: AgentFile[] = [];
  const seen = new Set<string>();
  for (const [dir, scope] of dirs) {
    let names: string[];
    try {
      names = fs.readdirSync(dir).filter((n) => n.endsWith('.md'));
    } catch {
      continue;
    }
    for (const n of names.sort().slice(0, 200)) {
      const p = path.join(dir, n);
      if (seen.has(p)) continue;
      seen.add(p);
      try {
        const a = parseAgentFile(readAgentFile(p), p);
        out.push({ path: p, scope, name: a.name, description: a.description });
      } catch {}
    }
  }
  return out;
}

/** An agent file's text: a Markdown file, not too big. */
export function readAgentFile(p: string): string {
  if (!p.endsWith('.md')) throw new HttpError(400, 'Agent files are Markdown (.md)');
  let st: fs.Stats;
  try {
    st = fs.statSync(p);
  } catch {
    throw new HttpError(404, 'There is no such file');
  }
  if (!st.isFile() || st.size > 256 * 1024) throw new HttpError(400, 'That is not an agent file');
  return fs.readFileSync(p, 'utf8');
}
