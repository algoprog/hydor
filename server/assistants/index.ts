// Assistants: presets (Researcher, Writer, Tutor…) that shape a session: who the agent is for it, how it
// works, what it may use, and the agent, model and mode it suggests. The start page picks one
// (extra.assistant); every agent then gets its instructions and the user's tone ("how the agents talk to
// you"), and its tool limits are enforced where the agent's program can. It also makes task folders
// for sessions started without one. Settings → Assistants lists and edits them.
//
// For other capabilities (apps, automations): listAssistants(), assistantById(id) and assistantStart(id).
import { agentMode, assistantExtra, type Assistant, type AssistantsState } from '../../shared/assistants.ts';
import type { SessionExtra } from '../../shared/features.ts';
import type { Agent } from '../../shared/types.ts';
import { CONSOLE_ID } from '../agents/acp.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { resolvePath } from '../files.ts';
import { featureDeps, runTools } from '../features/registry.ts';
import type { Deps, Feature, SpawnInfo } from '../features/types.ts';
import { PAGE_SERVER, runOf } from '../mcp.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { userTimezone } from '../userPrefs.ts';
import { findAgentFiles, parseAgentFile, readAgentFile } from './importer.ts';
import { instructionsFor, spawnFor } from './instructions.ts';
import { allAssistants, cleanUpOn, DEFAULT_TASK_ROOT, findAssistant, removeAssistant, saveAssistant, setSettings, taskRoot, toneOf } from './store.ts';
import { dayIn, makeTaskFolder } from './taskFolder.ts';

// ---- for other capabilities -----------------------------------------------------------------------------

/** Every assistant, the built-ins first. */
export const listAssistants = (db: DB = featureDeps().db): Assistant[] => allAssistants(db);

/** One assistant by its id; null when there is none (deleted, or never was). */
export const assistantById = (id: string | null | undefined, db: DB = featureDeps().db): Assistant | null => findAssistant(db, id);

/**
 * What to start a session with an assistant with (SessionManager.create's options): the agent it
 * suggests unless `use` names one, its model when that agent is its own, its mode in that agent's own
 * names, and the session settings (extra) that pick it and turn its connections on. Null for no such assistant.
 */
export function assistantStart(
  id: string,
  use: { agent?: Agent; acpAgent?: string } = {},
  db: DB = featureDeps().db,
): { agent?: Agent; acpAgent?: string; model?: string; mode?: string; extra: SessionExtra } | null {
  const a = findAssistant(db, id);
  if (!a) return null;
  const agent = use.agent ?? a.agent;
  const acpAgent = use.agent ? use.acpAgent : a.acpAgent;
  const own = !!agent && agent === a.agent && (agent !== 'acp' || acpAgent === a.acpAgent);
  return { agent, acpAgent, model: own ? a.model : undefined, mode: agent ? agentMode(a.mode, agent, acpAgent) : undefined, extra: assistantExtra(a) };
}

// ---- routes --------------------------------------------------------------------------------------------

function routes(d: Deps) {
  const { app, db } = d;
  const state = (): AssistantsState => ({ assistants: allAssistants(db), tone: toneOf(db), taskRoot: taskRoot(db), defaultTaskRoot: DEFAULT_TASK_ROOT, cleanUp: cleanUpOn(db) });
  // Open pages (the start page's picker, Settings) load the list again.
  const changed = () => d.broadcast({ t: 'feature', id: 'assistants', data: { changed: true } });
  const body = (req: { body?: unknown }) => (req.body ?? {}) as Record<string, unknown>;
  const idOf = (req: { params: unknown }) => (req.params as { id: string }).id;

  app.get('/api/assistants', async () => state());
  app.post('/api/assistants', async (req) => {
    const a = saveAssistant(db, { ...body(req), id: undefined });
    changed();
    return { assistant: a, ...state() };
  });
  app.put('/api/assistants/settings', async (req) => {
    setSettings(db, body(req));
    changed();
    return state();
  });
  app.put('/api/assistants/:id', async (req) => {
    const a = saveAssistant(db, { ...body(req), id: idOf(req) });
    changed();
    return { assistant: a, ...state() };
  });
  app.delete('/api/assistants/:id', async (req) => {
    removeAssistant(db, idOf(req));
    changed();
    return state();
  });

  // Claude Code's agent files (.claude/agents/*.md): the user's, and a folder's own.
  app.get('/api/assistants/import', async (req) => {
    const cwd = String((req.query as Record<string, string>).cwd ?? '');
    const done = new Map(allAssistants(db).flatMap((a) => (a.source ? [[a.source, a.id] as const] : [])));
    return { files: findAgentFiles(cwd ? resolvePath(cwd) : undefined).map((f) => ({ ...f, imported: done.get(f.path) })) };
  });
  app.post('/api/assistants/import', async (req) => {
    const b = body(req);
    const file = typeof b.path === 'string' && b.path ? resolvePath(b.path) : '';
    const src = file ? readAgentFile(file) : String(b.text ?? '');
    if (!src.trim()) throw new HttpError(400, 'Pick an agent file, or paste one');
    if (src.length > 256 * 1024) throw new HttpError(400, 'That is too long for an agent file');
    // A pasted or uploaded file is named by its file name when its frontmatter has none.
    const parsed = parseAgentFile(src, file || String(b.name ?? '').slice(0, 200));
    // Imported again: the same assistant, brought up to date (its icon kept).
    const prev = file ? allAssistants(db).find((a) => !a.builtin && a.source === file) : undefined;
    const a = saveAssistant(db, prev ? { ...parsed, id: prev.id, icon: prev.icon } : parsed);
    changed();
    return { assistant: a, ...state() };
  });

  // A new folder for a session started without one.
  app.post('/api/assistants/task-folder', async (req) => ({ path: makeTaskFolder(taskRoot(db), String(body(req).prompt ?? ''), dayIn(userTimezone(db))) }));

  // Custom asks which tools its session's assistant allows before each turn; its run's token is the permission.
  app.get('/agent/run/:token/assistant', async (req, reply) => {
    const runId = runOf((req.params as { token: string }).token);
    const live = runId ? d.sessions.liveByRun(runId) : null;
    if (!live) return reply.code(403).send({ error: 'Not a running agent' });
    return { tools: findAssistant(db, sessionExtra(db, live.key).assistant)?.tools ?? null };
  });
}

/** The app's own tools as Claude Code names them ("mcp__naget-agent__web_search"), to switch off those an assistant leaves out. */
const appTools = (s: SpawnInfo, d: Deps) =>
  runTools({ runId: s.runId, key: s.key ?? '', agent: s.agent, acpAgent: s.acpAgent, cwd: s.cwd, deps: d }).map((t) => `mcp__${PAGE_SERVER}__${t.name}`);

export const assistants: Feature = {
  id: 'assistants',
  routes,
  spawn(s, d) {
    // Custom reads them before each turn (context below) and leaves the tools out itself.
    if (s.agent === 'acp' && s.acpAgent === CONSOLE_ID) return;
    const a = findAssistant(d.db, s.extra.assistant);
    const tone = toneOf(d.db);
    if (!a && !tone.trim()) return;
    return spawnFor(a, tone, s, a?.tools ? appTools(s, d) : []);
  },
  context(s, d) {
    return instructionsFor(findAssistant(d.db, s.extra.assistant), toneOf(d.db), { agent: 'acp', acpAgent: CONSOLE_ID });
  },
};
