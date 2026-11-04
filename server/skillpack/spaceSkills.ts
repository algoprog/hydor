// A space's own skills: written methods only its sessions get (and the sessions of the groups that bring it
// in), with the skill library, each in place of a library skill of the same name. Each is a folder with its
// SKILL.md in the app's data folder (spaces/<id>/skills), never in the space's own folder; a space's sessions
// read them through a view of their own (library.ts syncSpaceView). Their changes are kept in the history
// with the library's, under the space, so a removed one can come back. When the space is deleted they join
// the library. Which space a session is in, and a group's spaces, are server/spaces' to say: here a space is
// its id (and its name, for words). A space can also switch any skill its sessions get on or off for them
// alone, whatever Settings → Skills says for every other session: the library's, its own, and Claude Code's
// and Codex's own (spaceSwitches; skillpack/index.ts passes them on to each agent).
import fs from 'node:fs';
import path from 'node:path';
import { MAX_SWITCHES, SKILL_NAME, switchKey, type SkillDoc, type SpaceSkill, type SpaceSkills } from '../../shared/skillpack.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { history, historyTables, lastRemoved, record, usage } from './history.ts';
import { checkText, composeSkill, folders, folderSkills, librarySkills, parseSkill, slug, spaceViewRoot, syncSpaceView, syncView, type FolderSkill } from './library.ts';
import { scanSkill, secretsMessage } from './scan.ts';

const ID = /^[a-z0-9]{1,40}$/;

/** The folder of a space's own things in the data folder (not the space's folder of files). */
const spaceData = (id: string) => {
  if (!ID.test(id)) throw new HttpError(400, 'Not a project');
  return path.join(config.dataDir, 'spaces', id);
};

/** Where a space's skills are: a folder per skill, with its SKILL.md. */
export const spaceSkillsDir = (id: string) => path.join(spaceData(id), 'skills');

/** A space's skills as their folders hold them, by name. */
export const skillsOf = (id: string): FolderSkill[] => folderSkills(spaceSkillsDir(id), 'space');

const readOr = (f: string): string | null => {
  try {
    return fs.readFileSync(f, 'utf8');
  } catch {
    return null;
  }
};

/** One of a space's skills as it reads now, or null. */
export function spaceSkillText(id: string, name: string): { text: string; file: string } | null {
  if (!SKILL_NAME.test(name)) return null;
  const file = path.join(spaceSkillsDir(id), name, 'SKILL.md');
  const text = readOr(file);
  return text === null ? null : { text, file };
}

// ---- the skills a space switches on or off for its own sessions ----------------------------------

const switchesKey = (id: string) => `skillpack.space.${id}`;

/** The skills a space switches on or off for its own sessions, by switchKey (SpaceSkills.switches). */
export function spaceSwitches(db: DB, id: string): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  try {
    const v = JSON.parse(kvGet(db, switchesKey(id)) ?? '{}');
    if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k, on] of Object.entries(v)) if (typeof on === 'boolean') out[k] = on;
  } catch {}
  return out;
}

function writeSwitches(db: DB, id: string, sw: Record<string, boolean>) {
  const keys = Object.keys(sw).sort();
  if (keys.length) kvSet(db, switchesKey(id), JSON.stringify(Object.fromEntries(keys.map((k) => [k, sw[k]]))));
  else db.prepare('delete from kv where k = ?').run(switchesKey(id));
}

/** Claude Code's and Codex's own skills' names: a plugin's with the plugin's name and a colon before. */
const AGENT_SKILL = /^[A-Za-z0-9][\w.:-]{0,95}$/;

/**
 * Switches a skill on or off for a space's own sessions (`on`), or back to what Settings → Skills says for
 * every session (null): a skill of the library or of the space by its name, or with `agent` one of Claude
 * Code's or Codex's own. Returns the space's switches now.
 */
export function setSpaceSwitch(db: DB, id: string, b: { name?: unknown; agent?: unknown; on?: unknown }): Record<string, boolean> {
  spaceData(id);
  if (b.agent != null && b.agent !== '' && b.agent !== 'claude' && b.agent !== 'codex') throw new HttpError(400, 'agent: claude or codex, or none for a skill of the library or the project');
  const agent = b.agent === 'claude' || b.agent === 'codex' ? b.agent : undefined;
  const name = String(b.name ?? '');
  if (!(agent ? AGENT_SKILL : SKILL_NAME).test(name)) throw new HttpError(400, 'Which skill? Give its name as the skills list shows it.');
  if (b.on !== null && typeof b.on !== 'boolean') throw new HttpError(400, 'on: true or false, or null for what Settings → Skills says');
  const sw = spaceSwitches(db, id);
  const key = switchKey(name, agent);
  if (b.on === null) delete sw[key];
  else {
    if (!(key in sw) && Object.keys(sw).length >= MAX_SWITCHES) throw new HttpError(400, `A project switches at most ${MAX_SWITCHES} skills on or off.`);
    sw[key] = b.on;
  }
  writeSwitches(db, id, sw);
  return sw;
}

/** Every skill of a space back to what Settings → Skills says. */
export function clearSpaceSwitches(db: DB, id: string) {
  spaceData(id);
  writeSwitches(db, id, {});
}

/** One of a space's switches follows its skill to a new name, or goes with it (`to` null). */
function moveSwitch(db: DB, id: string, from: string, to: string | null) {
  const sw = spaceSwitches(db, id);
  if (!(from in sw)) return;
  if (to) sw[to] = sw[from];
  delete sw[from];
  writeSwitches(db, id, sw);
}

/**
 * A space's skills for its page: each with how often agents loaded it in `sessionsOf` (the space, and the
 * groups that bring it in), the ones it had, which can come back, and the skills it switches on or off.
 */
export function spaceSkillsView(db: DB, id: string, sessionsOf: string[] = [id]): SpaceSkills {
  const used = usage(db, sessionsOf);
  const lib = new Set(librarySkills().map((s) => s.dir));
  const skills: SpaceSkill[] = skillsOf(id).map((s) => ({
    name: s.name,
    description: s.description,
    triggers: s.triggers,
    ...(lib.has(s.dir) ? { overrides: true } : {}),
    path: s.file,
    updatedAt: Math.round(s.mtime),
    uses: used.get(s.dir)?.uses ?? 0,
    lastUsed: used.get(s.dir)?.last,
  }));
  const here = new Set(skills.map((s) => s.name));
  return { skills, removed: lastRemoved(db, id).filter((r) => !here.has(r.name) && r.before).map((r) => ({ name: r.name, at: r.at })), switches: spaceSwitches(db, id) };
}

/** One of a space's skills, whole, with its history. */
export function spaceSkillDoc(db: DB, space: { id: string; name: string }, name: string): SkillDoc | null {
  const s = spaceSkillText(space.id, name);
  return s ? { name, text: s.text, source: 'space', space: { id: space.id, name: space.name }, file: s.file, history: history(db, name, space.id) } : null;
}

/** Writes a skill's SKILL.md (through a temporary file), making its folder when it is new. */
function writeSkill(id: string, name: string, text: string) {
  const dir = path.join(spaceSkillsDir(id), name);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'SKILL.md');
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

/** Checks a SKILL.md for a space's skill: the library's rules, and no secrets. */
function check(name: string, text: string) {
  try {
    checkText(name, text);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  const stop = secretsMessage(scanSkill(text));
  if (stop) throw new HttpError(400, stop);
}

const nameOf = (v: unknown): string => {
  const name = slug(String(v ?? ''));
  if (!SKILL_NAME.test(name) || name.length < 2) throw new HttpError(400, 'Give the skill a short name: lowercase words with dashes, like "citation-style".');
  return name;
};

/**
 * Adds a skill to a space (no `was`), or changes the skill `was`, renamed when the name given differs: its
 * other files go with it, and so does its history. Its keywords for Custom stay unless new ones are given.
 */
export function saveSpaceSkill(db: DB, id: string, b: { name?: unknown; description?: unknown; body?: unknown; triggers?: unknown }, was?: string): SpaceSkill {
  historyTables(db);
  const prev = was ? spaceSkillText(id, was) : null;
  if (was && !prev) throw new HttpError(404, `The project has no skill named ${was}`);
  const name = b.name === undefined && was ? was : nameOf(b.name);
  if (name !== was && spaceSkillText(id, name)) throw new HttpError(409, `The project has a skill named ${name} already: pick another name, or change that one.`);
  const old = prev ? parseSkill(prev.text) : null;
  const description = String(b.description ?? old?.description ?? '').replace(/\s+/g, ' ').trim();
  const body = String(b.body ?? old?.body ?? '').replace(/\r\n/g, '\n');
  const triggers = Array.isArray(b.triggers) ? b.triggers.map((t) => String(t).replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 12) : old?.triggers;
  if (description.length < 10) throw new HttpError(400, 'Say when to use the skill, in a sentence: "Use when …"');
  const text = composeSkill({ name, description, triggers, body });
  check(name, text);
  if (was && name !== was) {
    fs.renameSync(path.join(spaceSkillsDir(id), was), path.join(spaceSkillsDir(id), name));
    db.prepare('update skillpack_history set name = ? where name = ? and space = ?').run(name, was, id);
    moveSwitch(db, id, was, name);
  }
  writeSkill(id, name, text);
  record(db, { name, action: prev ? 'update' : 'create', before: prev?.text ?? null, after: text, space: id });
  return spaceSkillsView(db, id).skills.find((s) => s.name === name)!;
}

/**
 * Saves a SKILL.md as one of a space's skills, as a proposal the user approved does. A library skill
 * changed for the space starts as a copy of its folder, so its reference files and scripts come along.
 */
export function writeSpaceSkill(db: DB, id: string, name: string, text: string, o: { key?: string; proposal?: string } = {}) {
  check(name, text);
  const prev = spaceSkillText(id, name);
  const dir = path.join(spaceSkillsDir(id), name);
  if (!prev && !fs.existsSync(dir)) {
    const lib = librarySkills().find((s) => s.dir === name);
    if (lib) fs.cpSync(path.dirname(lib.file), dir, { recursive: true });
  }
  writeSkill(id, name, text);
  record(db, { name, action: prev ? 'update' : 'create', key: o.key, proposal: o.proposal, before: prev?.text ?? null, after: text, space: id });
}

/** A library skill (built in or learned) copied into a space, to change for the space alone; its other files come along. */
export function copyToSpace(db: DB, id: string, name: string): SpaceSkill {
  const lib = librarySkills().find((s) => s.dir === name);
  if (!lib) throw new HttpError(404, `There is no skill named ${name} in the skill library`);
  if (spaceSkillText(id, name)) throw new HttpError(409, `The project has a skill named ${name} already`);
  const dir = path.join(spaceSkillsDir(id), name);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  fs.cpSync(path.dirname(lib.file), dir, { recursive: true });
  record(db, { name, action: 'create', before: null, after: spaceSkillText(id, name)?.text ?? null, space: id });
  return spaceSkillsView(db, id).skills.find((s) => s.name === name)!;
}

/**
 * Removes one of a space's skills (a library skill of its name, if any, comes back in the space, as Settings
 * has it: the removed skill's switch goes with it); its text stays in the history.
 */
export function removeSpaceSkill(db: DB, id: string, name: string) {
  const cur = spaceSkillText(id, name);
  if (!cur) throw new HttpError(404, `The project has no skill named ${name}`);
  fs.rmSync(path.join(spaceSkillsDir(id), name), { recursive: true, force: true });
  record(db, { name, action: 'remove', before: cur.text, after: null, space: id });
  moveSwitch(db, id, name, null);
}

/** Brings back a skill the space had, as it was when it was removed. */
export function restoreSpaceSkill(db: DB, id: string, name: string) {
  const r = lastRemoved(db, id).find((x) => x.name === name);
  if (!r?.before) throw new HttpError(404, `Nothing to bring back for ${name}`);
  if (spaceSkillText(id, name)) throw new HttpError(409, `The project has a skill named ${name} already`);
  writeSkill(id, name, r.before);
  record(db, { name, action: 'restore', before: null, after: r.before, space: id });
}

/**
 * Brings the view of a space's sessions up to date: the library's skills with the space's own, then those
 * of the spaces a group brings together (`members`), each in place of any of the same name after it, as
 * the space's `switches` have them (spaceSwitches).
 */
export function spaceView(id: string, members: string[] = [], switches: Record<string, boolean> = {}): string {
  return syncSpaceView(id, [id, ...members].map(spaceSkillsDir), switches);
}

/**
 * A deleted space's skills join the skill library, so nothing is lost: each under its own name, or with
 * the space's after it when the library has one of that name ("research-thesis"). Its view and history go.
 * Returns the names they have in the library now.
 */
export function releaseSpaceSkills(db: DB, space: { id: string; name: string }): string[] {
  historyTables(db);
  const moved: string[] = [];
  const taken = new Set(librarySkills().map((s) => s.dir));
  for (const s of skillsOf(space.id)) {
    let name = s.dir;
    const base = slug(`${s.dir}-${slug(space.name) || 'space'}`).slice(0, 60).replace(/-+$/, '');
    for (let i = 1; taken.has(name) || !SKILL_NAME.test(name); i++) name = i === 1 ? base : `${base}-${i}`;
    const text = readOr(s.file);
    if (text === null) continue;
    const fm = parseSkill(text);
    const out = name === s.dir ? text : composeSkill({ name, description: fm.description ?? '', triggers: fm.triggers, body: fm.body });
    const dir = path.join(folders().learned, name);
    try {
      fs.mkdirSync(folders().learned, { recursive: true });
      fs.cpSync(path.dirname(s.file), dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'SKILL.md'), out);
    } catch (e) {
      console.warn(`[skillpack] could not keep ${s.dir} of ${space.name}: ${(e as Error).message}`);
      continue;
    }
    record(db, { name, action: 'create', before: null, after: out });
    taken.add(name);
    moved.push(name);
  }
  if (moved.length) syncView();
  fs.rmSync(spaceData(space.id), { recursive: true, force: true });
  fs.rmSync(spaceViewRoot(space.id), { recursive: true, force: true });
  db.prepare('delete from skillpack_history where space = ?').run(space.id);
  writeSwitches(db, space.id, {});
  return moved;
}
