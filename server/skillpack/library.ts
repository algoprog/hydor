// The skill library's folders: the skills that come with the app (skills/ in its folder), the ones the
// user approved or put there (skills/ in the data folder), and one view of both that every agent
// reads: a folder of links, one per skill, where a learned skill takes the place of a built-in one of
// the same name. A space's sessions read a view of their own, with the space's skills too
// (spaceSkills.ts). Claude Code loads the view as a plugin (--plugin-dir), Codex as an extra skills
// folder (skills/extraRoots/set) and Custom from its skills list (NAGET_SKILL_DIRS). Nothing is written
// into the user's ~/.claude or ~/.codex.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { composeSkill, parseSkill, SKILL_NAME, type SkillSource } from '../../shared/skillpack.ts';
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
/** The plugin folder a space's sessions get instead: the library's skills with the space's own. */
export const spaceViewRoot = (id: string) => path.join(path.dirname(roots.view), 'spaces', id);

// ---- SKILL.md ------------------------------------------------------------------------------------

export { composeSkill, parseSkill };

/** Longest SKILL.md the library takes: longer guides belong in reference files. */
export const MAX_SKILL = 20_000;

/** "Release notes" → release-notes. */
export const slug = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

/** Throws, in words for whoever wrote it, when a SKILL.md cannot be saved as the skill `name`. */
export function checkText(name: string, text: string) {
  const fm = parseSkill(text);
  if (fm.name !== name) throw new Error(`The skill's frontmatter must keep name: ${name}.`);
  if (!fm.description || fm.description.length < 10) throw new Error('The skill needs a description that says when to use it.');
  if (fm.body.trim().length < 40) throw new Error('The skill needs more than that: the steps or advice someone would follow.');
  if (text.length > MAX_SKILL) throw new Error(`That is ${text.length.toLocaleString('en')} characters; a skill holds at most ${MAX_SKILL.toLocaleString('en')}. Keep the main steps and cut the rest.`);
}

// ---- the folders ---------------------------------------------------------------------------------

export interface FolderSkill {
  /** The folder's name; the skill's own name is the same for skills the app writes. */
  dir: string;
  name: string;
  description: string;
  triggers: string[];
  category?: string;
  file: string;
  /** own: the user's or the project's own folders; space: a space's own skills. */
  source: SkillSource | 'own' | 'space';
  mtime: number;
  /** A plugin's skill: which plugin, and its name as people see it. */
  plugin?: string;
  pluginTitle?: string;
}

/** A skill an enabled plugin brings (server/plugins): its folder as agents read it, placeholders filled in. */
export interface PluginSkill {
  dir: string;
  name: string;
  description: string;
  triggers: string[];
  category?: string;
  /** The folder agents get (with its SKILL.md), and that SKILL.md. */
  folder: string;
  file: string;
  plugin: string;
  /** The plugin's name as people see it. */
  pluginTitle: string;
  mtime: number;
}

let pluginSkills: () => PluginSkill[] = () => [];
/** Where the library finds the skills of enabled plugins (set by server/plugins). */
export const setPluginSkills = (fn: () => PluginSkill[]) => {
  pluginSkills = fn;
};

/** Skills the user turned off: agents do not get them (kept in skillpack.off). */
let off = new Set<string>();
export const setOffSkills = (names: Iterable<string>) => {
  off = new Set(names);
};
export const isOff = (name: string) => off.has(name);

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
      out.push({ dir: n, name: fm.name || n, description: fm.description ?? '', triggers: fm.triggers, category: fm.category, file, source, mtime: st.mtimeMs });
    } catch {}
  }
  return out;
}

/**
 * The skills Custom sees from a folder, in the order its skills list takes them (the project's, the
 * user's, then the library's through the view, or through `view`, a space's): the first of a name wins.
 */
export function visibleSkills(cwd: string, view?: string): FolderSkill[] {
  const home = os.homedir();
  const own = [path.join(cwd, '.claude/skills'), path.join(cwd, '.agents/skills'), path.join(home, '.claude/skills'), path.join(home, '.agents/skills'), path.join(home, '.codex/skills')];
  const seen = new Set<string>();
  const out: FolderSkill[] = [];
  const lib = view ? folderSkills(view, 'space') : librarySkills().filter((s) => !off.has(s.dir)).map((s) => ({ ...s, file: path.join(viewSkills(), s.dir, 'SKILL.md') }));
  for (const s of [...own.flatMap((d) => folderSkills(d, 'own')), ...lib]) {
    if (seen.has(s.name)) continue;
    seen.add(s.name);
    out.push(s);
  }
  return out;
}

/**
 * Every skill of the library, a learned one in place of a built-in one of the same name, then those of
 * enabled plugins whose names are free.
 */
export function librarySkills(): (FolderSkill & { source: SkillSource; overrides?: boolean })[] {
  const bundled = folderSkills(roots.bundled, 'bundled') as (FolderSkill & { source: SkillSource })[];
  const learned = folderSkills(roots.learned, 'learned') as (FolderSkill & { source: SkillSource })[];
  const mine = new Set(learned.map((s) => s.dir));
  const built = new Set(bundled.map((s) => s.dir));
  const plugins = pluginSkills()
    .filter((s) => !mine.has(s.dir) && !built.has(s.dir))
    .map((s): FolderSkill & { source: SkillSource } => ({ dir: s.dir, name: s.name, description: s.description, triggers: s.triggers, category: s.category, file: s.file, source: 'plugin', mtime: s.mtime, plugin: s.plugin, pluginTitle: s.pluginTitle }));
  return [...learned.map((s) => ({ ...s, overrides: built.has(s.dir) || undefined })), ...bundled.filter((s) => !mine.has(s.dir)), ...plugins].sort((a, b) => a.name.localeCompare(b.name));
}

/** The names the library's own skills take (built in and learned): a plugin's skill of one of these is left out. */
export function libraryNames(): Set<string> {
  return new Set([...folderSkills(roots.bundled, 'bundled'), ...folderSkills(roots.learned, 'learned')].map((s) => s.dir));
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

/** A skill's text as agents get it now (the learned version first, then the built-in one, then a plugin's), and where it comes from. */
export function skillText(name: string): { text: string; source: SkillSource; file: string; plugin?: { name: string; title: string } } | null {
  if (!SKILL_NAME.test(name)) return null;
  const mine = readOr(learnedFile(name));
  if (mine !== null) return { text: mine, source: 'learned', file: learnedFile(name) };
  const built = readOr(bundledFile(name));
  if (built !== null) return { text: built, source: 'bundled', file: bundledFile(name) };
  const p = pluginSkills().find((s) => s.dir === name);
  const text = p ? readOr(p.file) : null;
  return p && text !== null ? { text, source: 'plugin', file: p.file, plugin: { name: p.plugin, title: p.pluginTitle } } : null;
}

export const isBundled = (name: string) => fs.existsSync(bundledFile(name));

/**
 * Saves a learned skill's SKILL.md. A built-in or a plugin's skill changed for the first time starts as a copy
 * of its folder (its reference files and scripts come along). Written through a temporary file.
 */
export function writeLearned(name: string, text: string) {
  if (!SKILL_NAME.test(name)) throw new Error(`Not a skill name: ${name}`);
  const dir = path.join(roots.learned, name);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(roots.learned, { recursive: true });
    // Your version of a built-in or a plugin's skill starts as a copy of its folder, its files included.
    const plugin = pluginSkills().find((s) => s.dir === name);
    if (fs.existsSync(path.join(roots.bundled, name))) fs.cpSync(path.join(roots.bundled, name), dir, { recursive: true });
    else if (plugin && fs.existsSync(plugin.folder)) fs.cpSync(plugin.folder, dir, { recursive: true, dereference: true });
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
 * The library's skills by folder name, each linked to its learned folder or else its built-in one, then
 * the enabled plugins' skills whose names are free; none the user turned off.
 */
function libraryLinks(): Map<string, string> {
  const want = new Map<string, string>();
  for (const s of folderSkills(roots.bundled, 'bundled')) want.set(s.dir, path.join(roots.bundled, s.dir));
  for (const s of folderSkills(roots.learned, 'learned')) want.set(s.dir, path.join(roots.learned, s.dir));
  for (const s of pluginSkills()) if (!want.has(s.dir)) want.set(s.dir, s.folder);
  for (const n of off) want.delete(n);
  return want;
}

/**
 * Brings a view up to date: a link per skill of `want` (folder name → the folder it links to), and the
 * plugin's manifest. Only links are added or removed there; anything else is left alone.
 */
function syncLinks(root: string, want: Map<string, string>, description: string) {
  const dir = path.join(root, 'skills');
  fs.mkdirSync(dir, { recursive: true });
  const manifest = path.join(root, '.claude-plugin', 'plugin.json');
  const meta = JSON.stringify({ name: 'naget', description }, null, 2) + '\n';
  if (readOr(manifest) !== meta) {
    fs.mkdirSync(path.dirname(manifest), { recursive: true });
    fs.writeFileSync(manifest, meta);
  }
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

/** Brings the view every agent reads up to date: a link per skill, to its learned folder or else its built-in one. */
export function syncView() {
  syncLinks(roots.view, libraryLinks(), 'Skills that come with Naget Agent, and the ones you approved in it.');
}

/**
 * Brings the view of a space's sessions up to date and returns its plugin folder: the library's skills,
 * with those in `extra` folders of skills (the space's own first, then those of the spaces a group brings
 * together) in place of any of the same name. Still a plugin named "naget", so skills keep their names.
 */
export function syncSpaceView(id: string, extra: string[]): string {
  const want = libraryLinks();
  for (const dir of [...extra].reverse()) for (const s of folderSkills(dir, 'space')) if (!off.has(s.dir) || !want.has(s.dir)) want.set(s.dir, path.join(dir, s.dir));
  const root = spaceViewRoot(id);
  syncLinks(root, want, 'Skills that come with Naget Agent, the ones you approved in it, and those of a project of yours.');
  return root;
}
