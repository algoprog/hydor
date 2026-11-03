// The skill library, shared by the server and the pages: the skills that come with the app, the ones
// the user approved (learned), a space's own skills, the proposals that wait for approval, and how a
// skill being loaded is recognised in any agent's conversation (Claude Code's Skill tool, Custom's skill
// tool, a SKILL.md read by Codex or another agent).
import type { ToolInfo } from './types.ts';

/** Where a skill of the library comes from: the app, the user (approved or written), or an enabled plugin. */
export type SkillSource = 'bundled' | 'learned' | 'plugin';

/** The groups skills are shown in, by the `category` in their frontmatter. */
export const SKILL_CATEGORIES = {
  work: 'Ways of working',
  writing: 'Writing',
  documents: 'Documents',
  research: 'Research and the web',
  planning: 'Planning and decisions',
  data: 'Data and numbers',
  creative: 'Design and pictures',
  coding: 'Coding',
  ai: 'AI models',
  app: 'This app',
} as const;
export type SkillCategory = keyof typeof SKILL_CATEGORIES;
export const isSkillCategory = (v: unknown): v is SkillCategory => typeof v === 'string' && v in SKILL_CATEGORIES;

export interface LibrarySkill {
  name: string;
  /** When to use it, as its frontmatter says. */
  description: string;
  /** Words and phrases that load it into Custom's turn by themselves. */
  triggers: string[];
  /** Its group (SKILL_CATEGORIES), as its frontmatter says. */
  category?: string;
  source: SkillSource;
  /** A plugin's skill: which plugin. */
  plugin?: { name: string; title: string };
  /** The user turned it off: agents do not get it. */
  off?: boolean;
  /** A learned skill that takes the place of a built-in one of the same name. */
  overrides?: boolean;
  /** Its SKILL.md. */
  path: string;
  updatedAt?: number;
  /** How many times an agent loaded it, and when last. */
  uses: number;
  lastUsed?: number;
}

/** A skill of a space's own (shared/spaces.ts): its sessions get it with the library, in place of a library skill of its name. */
export interface SpaceSkill {
  name: string;
  /** When to use it, as its frontmatter says. */
  description: string;
  triggers: string[];
  /** A library skill of the same name, which it takes the place of in the space. */
  overrides?: boolean;
  /** Its SKILL.md. */
  path: string;
  updatedAt: number;
  /** How many times an agent in the space loaded it, and when last. */
  uses: number;
  lastUsed?: number;
}

/** A space's skills, as its page shows them. */
export interface SpaceSkills {
  skills: SpaceSkill[];
  /** Skills it had, which can come back. */
  removed: { name: string; at: number }[];
}

/** A skill as it reads, to show it whole: the library's, or a space's own. */
export interface SkillDoc {
  name: string;
  text: string;
  source: SkillSource | 'space';
  /** For a space's own skill: which space. */
  space?: { id: string; name: string };
  /** For a plugin's skill: which plugin. */
  plugin?: { name: string; title: string };
  /** The user turned it off. */
  off?: boolean;
  file: string;
  history: SkillChange[];
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
  /** The space it can be kept in alone (the session's), or whose own skill it changes. */
  space?: { id: string; name: string };
  /** Where it is kept: the skill library, for every session, or the space alone. */
  scope: 'library' | 'space';
  /** It changes a skill of the space's own, so it stays the space's. */
  spaceSkill?: boolean;
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

/** A space's own skills, as the skills page lists them (each space's page manages them). */
export interface SpaceSkillGroup {
  id: string;
  name: string;
  skills: { name: string; description: string }[];
}

export interface SkillLibrary {
  skills: LibrarySkill[];
  pending: SkillProposal[];
  /** Learned skills the user removed, which can come back. */
  removed: { name: string; at: number }[];
  /** Keyword triggers load skills into Custom's turns. */
  triggers: boolean;
  folders: { bundled: string; learned: string; view: string };
  /** The spaces with skills of their own. */
  spaces: SpaceSkillGroup[];
}

/** Skill and folder names: lowercase letters, digits and dashes. */
export const SKILL_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;

const clean = (s: string): string | null => {
  const n = s.trim().replace(/^(?:hydor|naget):/, '').replace(/^\/+/, '');
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
  /** Its group on the skills page (SKILL_CATEGORIES). */
  category?: string;
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
    category: raw.category ? unquote(raw.category).trim().toLowerCase() || undefined : undefined,
    triggers: triggers.map((t) => t.trim()).filter(Boolean),
    body: text.slice(m[0].length),
  };
}

/** A list item as YAML: plain when it can be, quoted otherwise. */
const yamlItem = (s: string) => (/^[\p{L}\p{N}][\p{L}\p{N} '’*.-]*$/u.test(s) && !/^(yes|no|true|false|null|on|off)$/i.test(s) ? s : JSON.stringify(s));
/** A line of text as YAML: plain when every reader takes it as it is, quoted otherwise. */
const yamlText = (s: string) => (/^[\p{L}\p{N}(]/u.test(s) && !/: |\s#|:$|["\\]/.test(s) ? s : JSON.stringify(s));

/** A whole SKILL.md from its parts. */
export function composeSkill(p: { name: string; description: string; category?: string; triggers?: string[]; body: string }): string {
  const head = ['---', `name: ${p.name}`, `description: ${yamlText(p.description.replace(/\s+/g, ' ').trim())}`];
  if (p.category) head.push(`category: ${p.category}`);
  if (p.triggers?.length) head.push(`triggers: [${p.triggers.map(yamlItem).join(', ')}]`);
  head.push('---', '');
  return `${head.join('\n')}\n${p.body.replace(/^\s*\n/, '').trimEnd()}\n`;
}
