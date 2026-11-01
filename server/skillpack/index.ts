// The skill library: skills that come with the app (skills/ in its folder), and skills agents learn:
// an agent proposes one (skill_save) or an improvement to one (skill_patch), the user approves, edits
// or dismisses it in a card, and approved ones are saved where every agent reads them. Claude Code,
// Codex and Custom all get the library when they start (library.ts); Custom also gets a short rule
// on using skills, and the text of any skill whose keywords the user's message uses, before each turn.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { skillLoaded } from '../../shared/skillpack.ts';
import type { TimelineItem } from '../../shared/types.ts';
import { CONSOLE_ID } from '../agents/acp.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import type { Deps, Feature, RunCtx, RunTool } from '../features/types.ts';
import { addNote, notesOf } from '../notes.ts';
import { folders, parseSkill, skillText, syncView, viewSkills, visibleSkills } from './library.ts';
import { announce, decide, getProposal, history, libraryView, noteUse, pendingProposals, propose, removedSkills, removeSkill, restoreSkill } from './proposals.ts';
import { matchTriggers } from './triggers.ts';

const triggersOn = (db: DB) => kvGet(db, 'skillpack.triggers') !== '0';

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

/** Whether the installed Claude Code takes --plugin-dir: an older one would not start with it. A yes is kept. */
let pluginDir: Promise<boolean> | null = null;
function claudeTakesPlugins(): Promise<boolean> {
  pluginDir ??= new Promise<boolean>((resolve) => execFile(config.claudeBin, ['--help'], { timeout: 20_000 }, (_e, out) => resolve(/--plugin-dir\b/.test(String(out ?? ''))))).then((ok) => {
    if (!ok) pluginDir = null;
    return ok;
  });
  return pluginDir;
}

// ---- the tools -----------------------------------------------------------------------------------

const REASON = { type: 'string', description: 'One or two sentences for the user: what happened in this task that makes it worth keeping.' };
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
    const { proposal: p, replaced } = propose(d.db, { key: ctx.key, kind, name: String(a.name ?? ''), description: a.description, body: a.body, triggers: a.triggers, reason: a.reason, edits: a.edits });
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
    },
    required: ['name', 'description', 'body'],
  },
  run: run('new'),
};

const SKILL_PATCH: RunTool = {
  name: 'skill_patch',
  description: [
    'Propose an improvement to a skill in the app’s skill library (a built-in one, or one the user approved), for instance after following it and finding a step missing, wrong or unclear.',
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

async function customContext(s: { key: string; cwd: string }, d: Deps): Promise<string> {
  if (!triggersOn(d.db)) return RULE;
  const ask = await latestAsk(d, s.key);
  const st = active.get(s.key) ?? { prompt: '', skills: [] };
  if (ask && ask.id !== st.prompt) {
    // A new message: what was brought in before fades, what it asks for now comes in.
    st.prompt = ask.id;
    st.skills = st.skills.map((x) => ({ ...x, left: x.left - 1 })).filter((x) => x.left > 0);
    const visible = visibleSkills(s.cwd);
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
  if (!st.skills.length) return RULE;
  const visible = new Map(visibleSkills(s.cwd).map((x) => [x.name, x]));
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
  if (!parts.length) return RULE;
  return [RULE, '', 'Skills loaded for this conversation because the user’s words call for them (follow them where they fit the task; their folders hold any files they mention):', ...parts].join('\n');
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
      return { skills: libraryView(db), pending: pendingProposals(db), removed: removedSkills(db), triggers: triggersOn(db), folders: { ...folders(), view: viewSkills() } };
    });
    app.get('/api/skillpack/skills/:name', async (req) => {
      const name = param(req, 'name');
      const s = skillText(name);
      if (!s) throw new HttpError(404, `No skill named ${name} in the library`);
      return { name, text: s.text, source: s.source, file: s.file, history: history(db, name) };
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
      return { triggers: triggersOn(db) };
    });
    // Proposals from agents: the card asks, the answer goes back to the agent.
    app.get('/api/skillpack/proposals/:id', async (req) => ({ proposal: getProposal(db, param(req, 'id')) }));
    app.post('/api/skillpack/proposals/:id/approve', async (req) => ({ proposal: await decide(d, param(req, 'id'), true, { text: typeof body(req).text === 'string' ? body(req).text : undefined }) }));
    app.post('/api/skillpack/proposals/:id/dismiss', async (req) => ({ proposal: await decide(d, param(req, 'id'), false, { note: typeof body(req).note === 'string' ? body(req).note : undefined }) }));
  },
  tools: () => [SKILL_SAVE, SKILL_PATCH],
  async spawn(s) {
    if (!freshView()) return undefined;
    // Claude Code: the view is a plugin for this session only. Codex: an extra folder of skills.
    if (s.agent === 'claude') return (await claudeTakesPlugins()) ? { args: ['--plugin-dir', folders().view] } : undefined;
    if (s.agent === 'codex') return { skillRoots: [viewSkills()] };
    if (s.agent === 'acp' && s.acpAgent === CONSOLE_ID) return { env: { NAGET_SKILL_DIRS: viewSkills() } };
    return undefined;
  },
  context: (s, d) => customContext(s, d),
  // Skills agents proposed, waiting for the user's yes (Settings → Skill library, or the card in the session).
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
        path: s ? `/s/${encodeURIComponent(p.key)}` : '/settings?s=skillpack',
      };
    }),
  start(d) {
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
