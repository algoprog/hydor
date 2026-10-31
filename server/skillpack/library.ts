// The skill library's folders: the skills that come with the app (skills/ in its folder), the ones the
// user approved or put there (skills/ in the data folder), and one view of both that every agent
// reads: a folder of links, one per skill, where a learned skill takes the place of a built-in one of
// the same name. Claude Code loads the view as a plugin (--plugin-dir), Codex as an extra skills
// folder (skills/extraRoots/set) and Custom from its skills list (NAGET_SKILL_DIRS). Nothing is written
// into the user's ~/.claude or ~/.codex.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseSkill, SKILL_NAME, type SkillSource } from '../../shared/skillpack.ts';
import { APP_ROOT, config } from '../config.ts';

export interface Folders {
  /** Built-in skills, shipped with the app (read only). */
  bundled: string;
  /** Skills the user approved, or put there themselves. */
  learned: string;
  /** The plugin folder agents get; its skills/ holds the links. */
  view: string;
}

let roots: Folders = {
  bundled: path.join(APP_ROOT, 'skills'),
  learned: path.join(config.dataDir, 'skills'),
  view: path.join(config.dataDir, 'skillpack', 'naget'),
};

export const folders = (): Folders => roots;
/** Other folders (the tests' own). */
export const setFolders = (f: Folders) => {
  roots = f;
};
/** The folder of links agents read skills from. */
export const viewSkills = () => path.join(roots.view, 'skills');

// ---- SKILL.md ------------------------------------------------------------------------------------

export { parseSkill };

/** A list item as YAML: plain when it can be, quoted otherwise. */
const yamlItem = (s: string) => (/^[\p{L}\p{N}][\p{L}\p{N} '’*.-]*$/u.test(s) && !/^(yes|no|true|false|null|on|off)$/i.test(s) ? s : JSON.stringify(s));
/** A line of text as YAML: plain when every reader takes it as it is, quoted otherwise. */
const yamlText = (s: string) => (/^[\p{L}\p{N}(]/u.test(s) && !/: |\s#|:$|["\\]/.test(s) ? s : JSON.stringify(s));

/** A whole SKILL.md from its parts. */
export function composeSkill(p: { name: string; description: string; triggers?: string[]; body: string }): string {
  const head = ['---', `name: ${p.name}`, `description: ${yamlText(p.description.replace(/\s+/g, ' ').trim())}`];
  if (p.triggers?.length) head.push(`triggers: [${p.triggers.map(yamlItem).join(', ')}]`);
  head.push('---', '');
  return `${head.join('\n')}\n${p.body.replace(/^\s*\n/, '').trimEnd()}\n`;
}

// ---- the folders ---------------------------------------------------------------------------------

export interface FolderSkill {
  /** The folder's name; the skill's own name is the same for skills the app writes. */
  dir: string;
  name: string;
  description: string;
  triggers: string[];
  file: string;
  /** own: the user's or the project's own folders. */
  source: SkillSource | 'own';
  mtime: number;
}

/** The skills in one folder of skills. */
export function folderSkills(root: string, source: FolderSkill['source']): FolderSkill[] {
  let names: string[];
  try {
    names = fs.readdirSync(root);
  } catch {
    return [];
  }
  const out: FolderSkill[] = [];
  for (const n of names.sort()) {
    if (source === 'own' ? n.startsWith('.') : !SKILL_NAME.test(n)) continue;
    const file = path.join(root, n, 'SKILL.md');
    try {
      const st = fs.statSync(file);
      const fm = parseSkill(fs.readFileSync(file, 'utf8').slice(0, 64 * 1024));
      out.push({ dir: n, name: fm.name || n, description: fm.description ?? '', triggers: fm.triggers, file, source, mtime: st.mtimeMs });
    } catch {}
  }
  return out;
}

/**
 * The skills Custom sees from a folder, in the order its skills list takes them (the project's, the
 * user's, then the library's through the view): the first of a name wins.
 */
export function visibleSkills(cwd: string): FolderSkill[] {
  const home = os.homedir();
  const own = [path.join(cwd, '.claude/skills'), path.join(cwd, '.agents/skills'), path.join(home, '.claude/skills'), path.join(home, '.agents/skills'), path.join(home, '.codex/skills')];
  const seen = new Set<string>();
  const out: FolderSkill[] = [];
  const lib = librarySkills().map((s) => ({ ...s, file: path.join(viewSkills(), s.dir, 'SKILL.md') }));
  for (const s of [...own.flatMap((d) => folderSkills(d, 'own')), ...lib]) {
    if (seen.has(s.name)) continue;
    seen.add(s.name);
    out.push(s);
  }
  return out;
}

/** Every skill of the library, a learned one in place of a built-in one of the same name. */
export function librarySkills(): (FolderSkill & { source: SkillSource; overrides?: boolean })[] {
  const bundled = folderSkills(roots.bundled, 'bundled') as (FolderSkill & { source: SkillSource })[];
  const learned = folderSkills(roots.learned, 'learned') as (FolderSkill & { source: SkillSource })[];
  const mine = new Set(learned.map((s) => s.dir));
  const built = new Set(bundled.map((s) => s.dir));
  return [...learned.map((s) => ({ ...s, overrides: built.has(s.dir) || undefined })), ...bundled.filter((s) => !mine.has(s.dir))].sort((a, b) => a.name.localeCompare(b.name));
}

export const bundledFile = (name: string) => path.join(roots.bundled, name, 'SKILL.md');
export const learnedFile = (name: string) => path.join(roots.learned, name, 'SKILL.md');
const readOr = (f: string): string | null => {
  try {
    return fs.readFileSync(f, 'utf8');
  } catch {
    return null;
  }
};

/** A skill's text as agents get it now (the learned version first), and where it comes from. */
export function skillText(name: string): { text: string; source: SkillSource; file: string } | null {
  if (!SKILL_NAME.test(name)) return null;
  const mine = readOr(learnedFile(name));
  if (mine !== null) return { text: mine, source: 'learned', file: learnedFile(name) };
  const built = readOr(bundledFile(name));
  return built !== null ? { text: built, source: 'bundled', file: bundledFile(name) } : null;
}

export const isBundled = (name: string) => fs.existsSync(bundledFile(name));

/**
 * Saves a learned skill's SKILL.md. A built-in skill changed for the first time starts as a copy of its
 * folder (its reference files and scripts come along). Written through a temporary file.
 */
export function writeLearned(name: string, text: string) {
  if (!SKILL_NAME.test(name)) throw new Error(`Not a skill name: ${name}`);
  const dir = path.join(roots.learned, name);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(roots.learned, { recursive: true });
    if (fs.existsSync(path.join(roots.bundled, name))) fs.cpSync(path.join(roots.bundled, name), dir, { recursive: true });
    else fs.mkdirSync(dir);
  }
  const file = path.join(dir, 'SKILL.md');
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
  syncView();
}

/** Removes a learned skill's folder (a built-in one of the same name comes back). */
export function removeLearned(name: string) {
  if (!SKILL_NAME.test(name)) throw new Error(`Not a skill name: ${name}`);
  fs.rmSync(path.join(roots.learned, name), { recursive: true, force: true });
  syncView();
}

/**
 * Brings the view up to date: a link per skill, to its learned folder or else its built-in one, and
 * the plugin's manifest. Only links are added or removed there; anything else is left alone.
 */
export function syncView() {
  const dir = viewSkills();
  fs.mkdirSync(dir, { recursive: true });
  const manifest = path.join(roots.view, '.claude-plugin', 'plugin.json');
  const meta = JSON.stringify({ name: 'naget', description: 'Skills that come with Naget Agent, and the ones you approved in it.' }, null, 2) + '\n';
  if (readOr(manifest) !== meta) {
    fs.mkdirSync(path.dirname(manifest), { recursive: true });
    fs.writeFileSync(manifest, meta);
  }
  const want = new Map<string, string>();
  for (const s of folderSkills(roots.bundled, 'bundled')) want.set(s.dir, path.join(roots.bundled, s.dir));
  for (const s of folderSkills(roots.learned, 'learned')) want.set(s.dir, path.join(roots.learned, s.dir));
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    try {
      if (fs.lstatSync(p).isSymbolicLink() && fs.readlinkSync(p) !== want.get(n)) fs.unlinkSync(p);
    } catch {}
  }
  for (const [n, target] of want) {
    const p = path.join(dir, n);
    try {
      fs.lstatSync(p);
    } catch {
      try {
        fs.symlinkSync(target, p, 'dir');
      } catch (e) {
        console.warn(`[skillpack] could not link ${n}: ${(e as Error).message}`);
      }
    }
  }
}
