// The skill library, shared by the server and the pages: the skills that come with the app, the ones
// the user approved (learned), the proposals that wait for approval, and how a skill being loaded is
// recognised in any agent's conversation (Claude Code's Skill tool, Custom's skill tool, a SKILL.md
// read by Codex or another agent).
import type { ToolInfo } from './types.ts';

export type SkillSource = 'bundled' | 'learned';

export interface LibrarySkill {
  name: string;
  /** When to use it, as its frontmatter says. */
  description: string;
  /** Words and phrases that load it into Custom's turn by themselves. */
  triggers: string[];
  source: SkillSource;
  /** A learned skill that takes the place of a built-in one of the same name. */
  overrides?: boolean;
  /** Its SKILL.md. */
  path: string;
  updatedAt?: number;
  /** How many times an agent loaded it, and when last. */
  uses: number;
  lastUsed?: number;
}

/** Something in a proposal the user should look at: a secret, or text that tries to steer agents. */
export interface ScanFinding {
  kind: 'secret' | 'injection';
  /** What it looks like, in plain words. */
  what: string;
  line: number;
  /** The text found, with any secret masked. */
  excerpt: string;
}

export type ProposalStatus = 'pending' | 'approved' | 'dismissed' | 'replaced';

/** A skill an agent proposed (skill_save) or an improvement to one (skill_patch). */
export interface SkillProposal {
  id: string;
  /** The session it came from. */
  key: string;
  kind: 'new' | 'patch';
  name: string;
  status: ProposalStatus;
  /** Why the agent thinks it is worth keeping. */
  reason?: string;
  /** The whole SKILL.md before (an improvement), and as proposed. */
  before?: string;
  after: string;
  /** before → after as a unified diff (a new skill: every line added). */
  diff: string;
  added: number;
  removed: number;
  findings: ScanFinding[];
  /** It changes a built-in skill: saved as the user's own version, which takes its place. */
  bundled?: boolean;
  createdAt: number;
  decidedAt?: number;
  /** What was saved, when the user changed the text before approving. */
  saved?: string;
  /** The user's note to the agent when dismissing it. */
  note?: string;
}

/** One change to the library, for a skill's history. */
export interface SkillChange {
  id: number;
  name: string;
  at: number;
  action: 'create' | 'update' | 'remove' | 'restore';
  key?: string;
  diff: string;
  added: number;
  removed: number;
}

export interface SkillLibrary {
  skills: LibrarySkill[];
  pending: SkillProposal[];
  /** Learned skills the user removed, which can come back. */
  removed: { name: string; at: number }[];
  /** Keyword triggers load skills into Custom's turns. */
  triggers: boolean;
  folders: { bundled: string; learned: string; view: string };
}

/** Skill and folder names: lowercase letters, digits and dashes. */
export const SKILL_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;

const clean = (s: string): string | null => {
  const n = s.trim().replace(/^naget:/, '').replace(/^\/+/, '');
  return /^[\w.:-]{1,80}$/.test(n) ? n : null;
};

/** The skill a SKILL.md path belongs to: its folder's name, inside a folder of skills. */
function fromPath(p: string): string | null {
  const m = /(?:^|\/)skills\/([^/\s'"]+)\/SKILL\.md$/.exec(p.trim());
  return m ? clean(m[1]) : null;
}

/** A command that only shows one SKILL.md (cat, sed -n, head…), as Codex reads skills. */
function readCommand(cmd: string): string | null {
  const m = /^(?:cat|head|nl|less|more|bat|sed\s+-n)\b[^|;&<>]*?\s['"]?([^\s'"|;&<>]+\/SKILL\.md)['"]?\s*$/.exec(cmd.trim());
  return m ? fromPath(m[1]) : null;
}

/**
 * The skill a tool call loads, or null: Claude Code's Skill tool, Custom's skill tool (an ACP read
 * titled "Skill <name>"), or a read of a skill's SKILL.md (Claude Code's Read, Custom's read_file, a
 * command such as Codex's).
 */
export function skillLoaded(t: Pick<ToolInfo, 'name' | 'title' | 'input'>): string | null {
  const input = (t.input && typeof t.input === 'object' ? t.input : {}) as Record<string, unknown>;
  if (t.name === 'Skill') return clean(String(input.skill ?? input.command ?? ''));
  if (t.name === 'read' && /^Skill \S/.test(t.title)) return clean(String(input.name ?? t.title.slice(6)));
  if (t.name === 'Read') return fromPath(String(input.file_path ?? ''));
  if (t.name === 'read' && /^Read \S/.test(t.title)) return fromPath(t.title.slice(5));
  if (t.name === 'exec_command' || t.name === 'Bash' || t.name === 'execute') return readCommand(t.title);
  return null;
}

// ---- SKILL.md ------------------------------------------------------------------------------------

export interface Frontmatter {
  name?: string;
  description?: string;
  triggers: string[];
  /** Everything after the frontmatter. */
  body: string;
}

const unquote = (v: string) => {
  const s = v.trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length > 1) {
    try {
      return String(JSON.parse(s));
    } catch {}
  }
  if (s.startsWith("'") && s.endsWith("'") && s.length > 1) return s.slice(1, -1).replace(/''/g, "'");
  return s;
};

/** ["a", b, "c d"] or a, b: the items of an inline list. */
function inlineList(v: string): string[] {
  const s = v.trim().replace(/^\[/, '').replace(/\]$/, '');
  const out: string[] = [];
  for (const m of s.matchAll(/\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^']|'')*)'|([^,]+))\s*(?:,|$)/g)) {
    const item = m[1] !== undefined ? unquote(`"${m[1]}"`) : m[2] !== undefined ? m[2].replace(/''/g, "'") : m[3].trim();
    if (item.trim()) out.push(item.trim());
  }
  return out;
}

/** The frontmatter a skill needs (name, description, triggers) and its body; plain, quoted, folded and list values. */
export function parseSkill(text: string): Frontmatter {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return { triggers: [], body: text };
  const lines = m[1].split(/\r?\n/);
  const raw: Record<string, string> = {};
  const lists: Record<string, string[]> = {};
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z_][\w-]*):[ \t]*(.*)$/.exec(lines[i]);
    if (!kv) continue;
    const key = kv[1];
    let v = kv[2].trim();
    if (!v || /^[|>][-+]?$/.test(v)) {
      // A block: list items, or indented text.
      const block: string[] = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || /^-\s/.test(lines[i + 1]))) block.push(lines[++i].trim());
      if (block.length && block.every((b) => b.startsWith('- '))) {
        lists[key] = block.map((b) => unquote(b.slice(2)));
        continue;
      }
      v = block.join(v.startsWith('|') ? '\n' : ' ');
    } else {
      // A plain value may go on, indented, on the next lines.
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]) && !/^\s+-\s/.test(lines[i + 1])) v += ` ${lines[++i].trim()}`;
    }
    raw[key] = v;
  }
  const triggers = lists.triggers ?? (raw.triggers ? (raw.triggers.trim().startsWith('[') ? inlineList(raw.triggers) : inlineList(unquote(raw.triggers))) : []);
  return {
    name: raw.name ? unquote(raw.name) : undefined,
    description: raw.description ? unquote(raw.description) : undefined,
    triggers: triggers.map((t) => t.trim()).filter(Boolean),
    body: text.slice(m[0].length),
  };
}
