// The skill library: skills that come with the app (skills/ in its folder), and skills agents learn:
// an agent proposes one (skill_save) or an improvement to one (skill_patch), the user approves, edits
// or dismisses it in a card, and approved ones are saved where every agent reads them. Claude Code,
// Codex and Custom all get the library when they start (library.ts); a session in a space gets the
// space's own skills with it (spaceSkills.ts), and a proposal there can be kept for the space alone.
// Custom also gets a short rule on using skills, and the text of any skill whose keywords the user's
// message uses, before each turn. Every agent starting a new session also hears which skills fit its first
// message, found by words and meaning (match.ts), unless that is turned off. A project's sessions get the
// skills it switches on or off for itself (spaceSkills.ts): the library's and its own through its view,
// Claude Code's own as --settings skillOverrides, Codex's own as skills.config in its thread's settings.
import { execFile } from 'node:child_process';
import { execProgram } from '../platform.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SessionExtra } from '../../shared/features.ts';
import { skillLoaded, switchKey } from '../../shared/skillpack.ts';
import type { TimelineItem } from '../../shared/types.ts';
import { CONSOLE_ID } from '../agents/acp.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import type { Deps, Feature, RunCtx, RunTool, SpawnInfo } from '../features/types.ts';
import { requestVector } from '../memory/embed.ts';
import { addNote, notesOf } from '../notes.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { spaceOfSession } from '../spaces/index.ts';
import { composeSkill, folders, folderSkills, isOff, librarySkills, parseSkill, setOffSkills, skillText, slug, syncView, viewSkills, visibleSkills, type FolderSkill } from './library.ts';
import { announce, decide, getProposal, history, libraryView, noteUse, pendingProposals, propose, removedSkills, removeSkill, restoreSkill, saveOwnSkill } from './proposals.ts';
import { spaceSkillDoc, spaceSkillsView, spaceSkillText, spaceSwitches, spaceView } from './spaceSkills.ts';
import { allSpaces } from '../spaces/index.ts';
import { isSkillCategory, type SkillLibrary, type SpaceSkillGroup } from '../../shared/skillpack.ts';
import { matchSkills } from './match.ts';
import { matchTriggers } from './triggers.ts';

const triggersOn = (db: DB) => kvGet(db, 'skillpack.triggers') !== '0';
/** Naming the skills that fit a new session's first message (on unless turned off). */
const suggestOn = (db: DB) => kvGet(db, 'skillpack.suggest') !== '0';

/** Custom's line of skills that fit, by session: its instructions are made afresh for each turn (customContext). */
const fitting = new Map<string, string>();

const isCustom = (s: { agent: string; acpAgent?: string }) => s.agent === 'acp' && s.acpAgent === CONSOLE_ID;

/** Claude Code's own skills the user turned off in its settings, for every folder (skillOverrides "off"). */
function claudeOff(): Set<string> {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude'), 'settings.json'), 'utf8'));
    return new Set(Object.entries((j?.skillOverrides ?? {}) as Record<string, unknown>).flatMap(([k, v]) => (v === 'off' ? [k] : [])));
  } catch {
    return new Set();
  }
}

/** Which agent one of the skills in the agents' own folders (visibleSkills' "own") belongs to, by its folder. */
const ownersAgent = (k: FolderSkill): 'claude' | 'codex' => (k.file.includes(`${path.sep}.claude${path.sep}skills${path.sep}`) ? 'claude' : 'codex');

/**
 * The skills a session's agent has, as visibleSkills finds them through `view`: for Claude Code and Codex, of the
 * agents' own skills only theirs, and none switched off (in their settings, or by the session's project).
 */
function usableSkills(s: SpawnInfo, view: string, switches: Record<string, boolean>): FolderSkill[] {
  if (s.agent !== 'claude' && s.agent !== 'codex') return visibleSkills(s.cwd, path.join(view, 'skills'));
  const agent = s.agent;
  const off = agent === 'claude' ? claudeOff() : new Set<string>();
  return visibleSkills(s.cwd, path.join(view, 'skills'), (k) => ownersAgent(k) === agent && (switches[switchKey(k.name, agent)] ?? !off.has(k.name)));
}

/**
 * The skills that fit a new session's first message (match.ts), as a few lines for the instructions its agent starts
 * with, saying how that agent loads one. None for a session that goes on, an app's run, or with suggesting turned off.
 */
async function fitLines(s: SpawnInfo, d: Deps, view: string, switches: Record<string, boolean>): Promise<string | null> {
  const ask = s.prompt?.trim();
  if (s.resume || !ask || !suggestOn(d.db) || (s.extra.app && typeof s.extra.app === 'object')) return null;
  const found = await matchSkills(d.db, usableSkills(s, view, switches), ask, { vector: await requestVector(d.db, ask) });
  if (!found.length) return null;
  const how = s.agent === 'claude' ? 'load it with the Skill tool' : isCustom(s) ? 'load it with the skill tool' : 'read its SKILL.md';
  const paths = s.agent !== 'claude' && !isCustom(s);
  const short = (t: string) => {
    const x = t.replace(/\s+/g, ' ').trim();
    return x.length > 200 ? `${x.slice(0, 199).trimEnd()}…` : x;
  };
  return [
    `Skills that fit this task, found by its first message: when one does, ${how} before you start, and follow it; if none does, carry on.`,
    ...found.map(({ skill: k }) => `- ${k.name}: ${short(k.description)}${paths ? ` (${k.file})` : ''}`),
  ].join('\n');
}

/** The skills the user turned off, as kept. */
function loadOff(db: DB) {
  try {
    const v = JSON.parse(kvGet(db, 'skillpack.off') ?? '[]');
    setOffSkills(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  } catch {
    setOffSkills([]);
  }
}

/** The spaces with skills of their own, for the skills page. */
function spaceGroups(db: DB): SpaceSkillGroup[] {
  const out: SpaceSkillGroup[] = [];
  for (const sp of allSpaces(db)) {
    try {
      const v = spaceSkillsView(db, sp.id);
      if (v.skills.length) out.push({ id: sp.id, name: sp.name, skills: v.skills.map((x) => ({ name: x.name, description: x.description })) });
    } catch {}
  }
  return out;
}

/** The spaces that switch skills on or off for their own sessions, for the skills page. */
function switchedSpaces(db: DB): SkillLibrary['switched'] {
  return allSpaces(db).flatMap((sp) => {
    const switches = spaceSwitches(db, sp.id);
    return Object.keys(switches).length ? [{ id: sp.id, name: sp.name, switches }] : [];
  });
}

/** For agents that read skills by themselves (the other ACP agents): the skills of the session's view, each with its file. */
function skillIndex(view: string): string | undefined {
  const list = folderSkills(path.join(view, 'skills'), 'space');
  if (!list.length) return undefined;
  const lines = list.map((s) => `- ${s.name}: ${s.description.replace(/\s+/g, ' ').slice(0, 220)} (${s.file})`);
  return [
    'Skills: written methods for kinds of work. Before a task, look through this list; when one fits, read its SKILL.md with your file tools and follow it (its folder holds any files it mentions). Skip skills for greetings, quick questions and small, clear changes.',
    ...lines,
  ].join('\n');
}

const warnOnce = (() => {
  let said = false;
  return (e: unknown) => {
    if (!said) console.warn(`[skillpack] ${(e as Error)?.message ?? e}`);
    said = true;
  };
})();

/** The view agents read, brought up to date (cheap: links only change when skills come or go). */
function freshView(): boolean {
  try {
    syncView();
    return true;
  } catch (e) {
    warnOnce(e);
    return false;
  }
}

type Where = NonNullable<ReturnType<typeof spaceOfSession>>;

/**
 * A space's view of skills, brought up to date: the library's with its own and those of the spaces it brings
 * together, as it switches them on or off.
 */
function spaceViewOf(db: DB, where: Where): string | null {
  try {
    return spaceView(where.space.id, where.members.map((m) => m.id), spaceSwitches(db, where.space.id));
  } catch (e) {
    warnOnce(e);
    return null;
  }
}

/** The plugin folder a session's agent reads its skills from, brought up to date: in a space, the space's view; else the library's. */
function viewFor(db: DB, where: Where | null): string | null {
  if (!freshView()) return null;
  return (where && spaceViewOf(db, where)) ?? folders().view;
}

/** What a space says of one agent's own skills: [name, on] for each it switches. */
const agentSwitches = (switches: Record<string, boolean>, agent: 'claude' | 'codex'): [string, boolean][] =>
  Object.entries(switches).flatMap(([k, on]): [string, boolean][] => (k.startsWith(`${agent}:`) ? [[k.slice(agent.length + 1), on]] : []));

/** Whether the installed Claude Code takes --plugin-dir: an older one would not start with it. A yes is kept. */
let pluginDir: Promise<boolean> | null = null;
function claudeTakesPlugins(): Promise<boolean> {
  pluginDir ??= new Promise<boolean>((resolve) => execProgram(config.claudeBin, ['--help'], { timeout: 20_000 }, (_e, out) => resolve(/--plugin-dir\b/.test(out)))).then((ok) => {
    if (!ok) pluginDir = null;
    return ok;
  });
  return pluginDir;
}

// ---- the tools -----------------------------------------------------------------------------------

const REASON = { type: 'string', description: 'One or two sentences for the user: what happened in this task that makes it worth keeping.' };
const SPACE = {
  type: 'boolean',
  description:
    'Only in a session in a project: true to keep it for that project alone (its sessions get it), for a method that belongs to that project rather than to every task of its kind. The user can still choose on the card. A change to a skill of the project’s own stays the project’s either way.',
};
const TRIGGERS = {
  type: 'array',
  items: { type: 'string' },
  description: 'Optional: words or short phrases from requests that should bring the skill in by themselves (for Custom), 3 to 40 characters each, at most 12.',
};

function answer(name: string, id: string, p: ReturnType<typeof getProposal>): string {
  const flags = p.findings.map((f) => `${f.what} (line ${f.line})`);
  return [
    `The user is now looking at a card with the proposed ${p.kind === 'new' ? 'skill' : 'change to the skill'} “${name}”. Nothing is saved until they approve it, and their answer will come to you as a message: carry on with the task meanwhile, and do not ask them about it in text.`,
    flags.length ? `The card also points out to them: ${flags.join('; ')}.` : '',
    `(proposal ${id})`,
  ]
    .filter(Boolean)
    .join(' ');
}

function run(kind: 'new' | 'patch') {
  return async (a: Record<string, any>, ctx: RunCtx): Promise<string> => {
    const d = ctx.deps;
    const { proposal: p, replaced } = propose(d.db, {
      key: ctx.key,
      kind,
      name: String(a.name ?? ''),
      description: a.description,
      body: a.body,
      triggers: a.triggers,
      reason: a.reason,
      edits: a.edits,
      space: a.space,
    });
    for (const id of replaced) announce(d, getProposal(d.db, id));
    announce(d, p);
    return answer(p.name, p.id, p);
  };
}

const SKILL_SAVE: RunTool = {
  name: 'skill_save',
  description: [
    'Propose a new skill for the user’s skill library: a short written method that would help any agent here with this kind of task next time.',
    'Worth it after work that took real effort to get right: a fix found after several tries, a workflow the user had to explain, a process whose steps are easy to get wrong.',
    'Not for one-off facts, the user’s personal details, or anything secret.',
    'The user sees it in a card and approves, edits or dismisses it; nothing is saved before they approve, and their answer comes back to you as a message.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Short, lowercase words joined by dashes: "release-notes".' },
      description: { type: 'string', description: 'One sentence on when to use it, starting “Use when”: the situations and requests that call for it. Not a summary of its steps.' },
      body: {
        type: 'string',
        description: 'The guide itself, in Markdown: when it applies, the steps in order, the checks, the mistakes to avoid. General enough to reuse; at most 20,000 characters.',
      },
      triggers: TRIGGERS,
      reason: REASON,
      space: SPACE,
    },
    required: ['name', 'description', 'body'],
  },
  run: run('new'),
};

const SKILL_PATCH: RunTool = {
  name: 'skill_patch',
  description: [
    'Propose an improvement to a skill in the app’s skill library (a built-in one, or one the user approved) or to one of the skills of the project the session is in, for instance after following it and finding a step missing, wrong or unclear.',
    'Give exact edits (find and replace on its current text), or a whole new body. The user approves first, in a card; their answer comes back to you as a message.',
    'A built-in skill changed this way is saved as the user’s own version, in its place.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'The skill’s name, as in the skills list.' },
      edits: {
        type: 'array',
        description: 'Changes to its current text (as the skill tool shows it): each find is copied exactly and appears once.',
        items: { type: 'object', properties: { find: { type: 'string' }, replace: { type: 'string' } }, required: ['find', 'replace'] },
      },
      body: { type: 'string', description: 'Instead of edits: the whole new guide (everything after the frontmatter).' },
      description: { type: 'string', description: 'A new description, when when-to-use-it should change.' },
      triggers: TRIGGERS,
      reason: REASON,
      space: SPACE,
    },
    required: ['name'],
  },
  run: run('patch'),
};

// ---- Custom's instructions -----------------------------------------------------------------------

const RULE = [
  'Skills: the skills listed in these instructions are written methods for kinds of work (planning something big or vague, research, troubleshooting, writing, documents and more).',
  'Before you start on a task, look through the list. When one fits, load it with the skill tool, say “Using skill <name>” in a short line, and follow it. Skip skills for greetings, quick questions and small, clear changes.',
  'A skill shown in full below is loaded already: follow it without loading it again.',
  'After a task that took real effort (several attempts, or a method the user had to explain), you may propose keeping the method as a skill with skill_save, or improving a skill you followed with skill_patch: the user approves first.',
].join(' ');

/** Skills a session's messages brought in, kept for a few turns: a process (asking first, research) spans several. */
const active = new Map<string, { prompt: string; skills: { name: string; trigger: string; left: number }[] }>();
const TURNS = 3;

/** The latest message from the user in a session, read up to the end of its transcript. */
async function latestAsk(d: Deps, key: string): Promise<{ id: string; text: string } | null> {
  try {
    const tl = await d.sessions.timeline(key);
    await tl.readMore();
    const items: TimelineItem[] = tl.parser.items;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.kind === 'user' && !it.meta && it.text.trim()) return { id: it.id, text: it.text };
    }
  } catch {}
  return null;
}

/** How much skill text fits into the instructions of the session's model. */
function budget(d: Deps, key: string): number {
  try {
    const id = d.sessions.summary(key)?.model;
    const m = d.models.agentModels().find((x) => x.id === id);
    const w = m?.contextLength ?? 32_768;
    return w <= 16_384 ? 5000 : w <= 40_000 ? 9000 : 16_000;
  } catch {
    return 9000;
  }
}

async function customContext(s: { key: string; cwd: string; extra: SessionExtra }, d: Deps): Promise<string> {
  // In a space, its view is brought up to date for this turn: its skills (and the library's) reach Custom as soon as they change.
  const where = spaceOfSession(d.db, s.extra);
  const view = where ? spaceViewOf(d.db, where) : null;
  const skills = view ? path.join(view, 'skills') : undefined;
  const rule = fitting.has(s.key) ? `${RULE}\n\n${fitting.get(s.key)}` : RULE;
  if (!triggersOn(d.db)) return rule;
  const ask = await latestAsk(d, s.key);
  const st = active.get(s.key) ?? { prompt: '', skills: [] };
  if (ask && ask.id !== st.prompt) {
    // A new message: what was brought in before fades, what it asks for now comes in.
    st.prompt = ask.id;
    st.skills = st.skills.map((x) => ({ ...x, left: x.left - 1 })).filter((x) => x.left > 0);
    const visible = visibleSkills(s.cwd, skills);
    for (const m of matchTriggers(ask.text, visible).reverse()) {
      const had = st.skills.some((x) => x.name === m.name);
      st.skills = [{ name: m.name, trigger: m.trigger, left: TURNS }, ...st.skills.filter((x) => x.name !== m.name)].slice(0, 2);
      if (had) continue;
      noteUse(d.db, { key: s.key, item: `trigger:${ask.id}:${m.name}`, name: m.name, how: 'trigger' });
      if (!notesOf(d.db, s.key, 'skillpack').some((n) => n.anchor === ask.id && (n.data as { skill?: string })?.skill === m.name))
        addNote(d.db, { key: s.key, kind: 'skillpack', anchor: ask.id, data: { skill: m.name, trigger: m.trigger } });
    }
    active.set(s.key, st);
  }
  if (!st.skills.length) return rule;
  const visible = new Map(visibleSkills(s.cwd, skills).map((x) => [x.name, x]));
  let room = budget(d, s.key);
  const parts: string[] = [];
  for (const a of st.skills) {
    const sk = visible.get(a.name);
    if (!sk || room < 600) continue;
    let text: string;
    try {
      text = parseSkill(fs.readFileSync(sk.file, 'utf8')).body.trim();
    } catch {
      continue;
    }
    const cut = text.length > room ? `${text.slice(0, room)}\n\n(Cut short to fit: load it with the skill tool for the rest.)` : text;
    room -= cut.length;
    parts.push(`<skill name="${a.name}" folder="${path.dirname(sk.file)}">\n${cut}\n</skill>`);
  }
  if (!parts.length) return rule;
  return [rule, '', 'Skills loaded for this conversation because the user’s words call for them (follow them where they fit the task; their folders hold any files they mention):', ...parts].join('\n');
}

// ---- the feature ---------------------------------------------------------------------------------

export const skillpack: Feature = {
  id: 'skillpack',
  routes(d) {
    const { app, db } = d;
    const param = (req: { params: unknown }, k: string) => String((req.params as Record<string, string>)[k] ?? '');
    const body = (req: { body: unknown }) => (req.body ?? {}) as Record<string, any>;
    const changed = () => d.broadcast({ t: 'feature', id: 'skillpack', data: { library: true } });
    app.get('/api/skillpack', async () => {
      freshView();
      const out: SkillLibrary = {
        skills: libraryView(db),
        pending: pendingProposals(db),
        removed: removedSkills(db),
        triggers: triggersOn(db),
        suggest: suggestOn(db),
        folders: { ...folders(), view: viewSkills() },
        spaces: spaceGroups(db),
        switched: switchedSpaces(db),
      };
      return out;
    });
    // A skill the user writes: name, when to use it, the instructions (or a whole SKILL.md as text).
    app.post('/api/skillpack/skills', async (req) => {
      const b = body(req);
      const name = slug(String(b.name ?? ''));
      if (!name) throw new HttpError(400, 'Give the skill a name');
      const text =
        typeof b.text === 'string'
          ? b.text
          : composeSkill({
              name,
              description: String(b.description ?? '').trim(),
              category: isSkillCategory(b.category) ? b.category : undefined,
              triggers: Array.isArray(b.triggers) ? b.triggers.map(String).filter(Boolean).slice(0, 12) : undefined,
              body: String(b.body ?? '').trim() || `# ${String(b.name ?? name).trim()}\n\nWhen to use this skill, then the steps to follow.`,
            });
      saveOwnSkill(db, name, text, { create: true });
      changed();
      return { name };
    });
    // Its new text (the user's own skill), or the user's own version of a built-in one.
    app.put('/api/skillpack/skills/:name', async (req) => {
      const name = param(req, 'name');
      const text = body(req).text;
      if (typeof text !== 'string') throw new HttpError(400, 'No text came');
      if (!skillText(name)) throw new HttpError(404, `No skill named ${name} in the library`);
      saveOwnSkill(db, name, text);
      changed();
      return { ok: true };
    });
    // Turning a skill of the library off (agents stop getting it) and on again.
    app.put('/api/skillpack/skills/:name/off', async (req) => {
      const name = param(req, 'name');
      if (!librarySkills().some((s) => s.dir === name)) throw new HttpError(404, `No skill named ${name} in the library`);
      let cur: string[] = [];
      try {
        cur = JSON.parse(kvGet(db, 'skillpack.off') ?? '[]');
      } catch {}
      const next = new Set(cur.filter((x) => typeof x === 'string'));
      if (body(req).off === true) next.add(name);
      else next.delete(name);
      kvSet(db, 'skillpack.off', JSON.stringify([...next].sort()));
      loadOff(db);
      freshView();
      changed();
      return { off: next.has(name) };
    });
    app.get('/api/skillpack/skills/:name', async (req) => {
      const name = param(req, 'name');
      // From a session (?key=): the skill its agent read, a space's own before the library's.
      const key = String((req.query as { key?: string }).key ?? '');
      const where = key ? spaceOfSession(db, sessionExtra(db, key)) : null;
      const owner = where && [where.space, ...where.members].find((sp) => spaceSkillText(sp.id, name));
      if (owner) return spaceSkillDoc(db, owner, name);
      const s = skillText(name);
      if (!s) throw new HttpError(404, `No skill named ${name} in the library`);
      return { name, text: s.text, source: s.source, file: s.file, history: history(db, name), ...(s.plugin ? { plugin: s.plugin } : {}), ...(isOff(name) ? { off: true } : {}) };
    });
    app.post('/api/skillpack/skills/:name/remove', async (req) => {
      removeSkill(db, param(req, 'name'));
      changed();
      return { ok: true };
    });
    app.post('/api/skillpack/skills/:name/restore', async (req) => {
      restoreSkill(db, param(req, 'name'));
      changed();
      return { ok: true };
    });
    app.put('/api/skillpack/settings', async (req) => {
      if (typeof body(req).triggers === 'boolean') kvSet(db, 'skillpack.triggers', body(req).triggers ? '1' : '0');
      if (typeof body(req).suggest === 'boolean') kvSet(db, 'skillpack.suggest', body(req).suggest ? '1' : '0');
      return { triggers: triggersOn(db), suggest: suggestOn(db) };
    });
    // Proposals from agents: the card asks, the answer goes back to the agent.
    app.get('/api/skillpack/proposals/:id', async (req) => ({ proposal: getProposal(db, param(req, 'id')) }));
    app.post('/api/skillpack/proposals/:id/approve', async (req) => ({
      proposal: await decide(d, param(req, 'id'), true, { text: typeof body(req).text === 'string' ? body(req).text : undefined, scope: body(req).scope }),
    }));
    app.post('/api/skillpack/proposals/:id/dismiss', async (req) => ({ proposal: await decide(d, param(req, 'id'), false, { note: typeof body(req).note === 'string' ? body(req).note : undefined }) }));
  },
  tools: () => [SKILL_SAVE, SKILL_PATCH],
  async spawn(s, d) {
    const where = spaceOfSession(d.db, s.extra);
    const view = viewFor(d.db, where);
    if (!view) return undefined;
    if (s.agent === 'claude' && !(await claudeTakesPlugins())) return undefined;
    const switches = where ? spaceSwitches(d.db, where.space.id) : {};
    // The skills that fit the first message, once, in what the agent starts with (Custom's, in its context).
    const fit = await fitLines(s, d, view, switches).catch((e) => (warnOnce(e), null));
    const said = fit ? { instructions: [fit] } : {};
    // Claude Code: the view is a plugin for this session only, and its own skills as the project switches them
    // (settings given on the command line come before the user's own). Codex: an extra folder of skills, and
    // its own skills as the project switches them, in its thread's settings (on top of the user's).
    if (s.agent === 'claude') {
      const own = agentSwitches(switches, 'claude');
      const settings = own.length ? ['--settings', JSON.stringify({ skillOverrides: Object.fromEntries(own.map(([n, on]) => [n, on ? 'on' : 'off'])) })] : [];
      return { args: ['--plugin-dir', view, ...settings], ...said };
    }
    if (s.agent === 'codex') {
      const own = agentSwitches(switches, 'codex');
      return { skillRoots: [path.join(view, 'skills')], ...(own.length ? { codexConfig: { skills: { config: own.map(([name, enabled]) => ({ name, enabled })) } } } : {}), ...said };
    }
    if (isCustom(s)) {
      if (fit && s.key) {
        fitting.set(s.key, fit);
        if (fitting.size > 500) fitting.delete(fitting.keys().next().value!);
      }
      return { env: { HYDOR_SKILL_DIRS: path.join(view, 'skills') } };
    }
    // Other ACP agents (Gemini CLI, OpenCode…) have no skills of their own: the list, to read when one fits.
    if (s.agent === 'acp') {
      const index = skillIndex(view);
      return index || fit ? { instructions: [...(index ? [index] : []), ...(fit ? [fit] : [])] } : undefined;
    }
    return undefined;
  },
  context: (s, d) => customContext(s, d),
  // Skills agents proposed, waiting for the user's yes (Settings → Skills, or the card in the session).
  inbox: (d) =>
    pendingProposals(d.db).map((p) => {
      const s = d.sessions.summary(p.key);
      return {
        id: `skill:${p.id}`,
        kind: 'skill' as const,
        title: p.kind === 'new' ? `Suggests a new skill: ${p.name}` : `Suggests a change to the ${p.name} skill`,
        detail: p.reason,
        key: s ? p.key : undefined,
        session: s?.title,
        agent: s?.agent,
        at: p.createdAt,
        path: s ? `/s/${encodeURIComponent(p.key)}` : '/settings?s=skills',
      };
    }),
  start(d) {
    loadOff(d.db);
    freshView();
    // Every skill an agent loads, once per step, for the library's use counts.
    d.sessions.on('items', (key: string, items: TimelineItem[]) => {
      for (const it of items) {
        if (it.kind !== 'tool' || it.tool.status !== 'ok') continue;
        const name = skillLoaded(it.tool);
        if (name) {
          try {
            noteUse(d.db, { key, item: it.id, name, how: 'tool', at: it.ts });
          } catch {}
        }
      }
    });
  },
};
